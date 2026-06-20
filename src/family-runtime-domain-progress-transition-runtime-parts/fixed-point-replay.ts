import {
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  STABLE_OUTCOMES,
  SUPPORTED_TRANSITIONS,
  isRecord,
  optionalString,
} from './shared.ts';
import {
  appendDomainProgressTransitionRuntimeResult,
  buildDomainProgressTransitionRuntimeResult,
  consumeDomainProgressHumanGateResumeToken,
  createDomainProgressTransitionRuntimeLog,
  readDomainProgressHumanGateResumeToken,
  rebuildDomainProgressTransitionReadModel,
} from './runtime-results.ts';

export function buildNonAdvancingApplyRuntimeResult(input: {
  command: Record<string, unknown>;
  reason?: string;
}) {
  const command = {
    ...input.command,
    transition_kind: 'NonAdvancingApply',
    outcome: {
      kind: 'non_advancing_apply_typed_blocker_ref',
      reason: input.reason ?? 'fresh_readback_did_not_advance_same_aggregate',
      stable_outcome: true,
    },
    postcondition: {
      ...(isRecord(input.command.postcondition) ? input.command.postcondition : {}),
      kind: 'non_advancing_apply_typed_blocker_ref',
      exactly_one_transition_required: true,
      non_advancing_apply_on_no_outcome: true,
    },
  };
  const result = buildDomainProgressTransitionRuntimeResult(command);
  return {
    ...result,
    replay_evidence: {
      ...result.replay_evidence,
      replay_status: 'non_advancing_apply_recorded',
      non_advancing_apply: true,
    },
  };
}

function stableObservationOutcome(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const kind = optionalString(value.kind)
    ?? optionalString(value.outcome_kind)
    ?? optionalString(value.status);
  if (!kind || !STABLE_OUTCOMES.has(kind)) {
    return null;
  }
  return { ...value, kind };
}

export function reconcileDomainProgressTransitionFixedPoint(input: {
  command: Record<string, unknown>;
  observations?: unknown[];
  reason?: string;
}) {
  const observations = input.observations ?? [];
  const stableOutcome = observations
    .map((observation) => stableObservationOutcome(observation))
    .find((observation): observation is NonNullable<ReturnType<typeof stableObservationOutcome>> =>
      Boolean(observation)
    );
  const result = stableOutcome
    ? buildDomainProgressTransitionRuntimeResult({
      ...input.command,
      outcome: stableOutcome,
    })
    : buildNonAdvancingApplyRuntimeResult({
      command: input.command,
      reason: input.reason ?? 'fixed_point_no_stable_outcome',
    });
  return {
    surface_kind: 'opl_domain_progress_fixed_point_reconcile',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    command_count: 1,
    observation_count: observations.length,
    exactly_one_transition: true,
    stable_outcome_found: Boolean(stableOutcome),
    selected_transition_kind: result.transition_event.transition_kind,
    non_advancing_apply: result.transition_event.transition_kind === 'NonAdvancingApply',
    result,
    evidence: {
      stable_observation_kind: stableOutcome ? optionalString(stableOutcome.kind) : null,
      event_id: result.transition_event.event_id,
      outbox_item_id: result.transactional_outbox_item.outbox_item_id,
      idempotency_key: result.transition_event.idempotency_key,
    },
  };
}

export function replayDomainProgressTransitionTrace(input: {
  traceId: string;
  steps: Array<{
    command: Record<string, unknown>;
    observed_outcome?: Record<string, unknown> | null;
    consume_human_gate_resume?: {
      decision: string;
      evidence_ref: string;
      consumed_by: string;
    };
  }>;
}) {
  let log = createDomainProgressTransitionRuntimeLog();
  const reconciles = input.steps.map((step) => {
    const reconcile = reconcileDomainProgressTransitionFixedPoint({
      command: step.command,
      observations: [step.observed_outcome],
      reason: 'replay_step_has_no_stable_outcome',
    });
    const appended = appendDomainProgressTransitionRuntimeResult({
      log,
      result: reconcile.result,
    });
    log = appended.log;
    let humanGateResumeTokenReadback: ReturnType<typeof readDomainProgressHumanGateResumeToken> | null = null;
    let readModelAfterHumanGateResume: ReturnType<typeof rebuildDomainProgressTransitionReadModel> | null = null;
    if (step.consume_human_gate_resume) {
      const token = isRecord(appended.result.human_gate_resume_token)
        ? optionalString(appended.result.human_gate_resume_token.resume_token)
        : null;
      if (token) {
        const consumed = consumeDomainProgressHumanGateResumeToken({
          log,
          resumeToken: token,
          decision: step.consume_human_gate_resume.decision,
          evidenceRef: step.consume_human_gate_resume.evidence_ref,
          consumedBy: step.consume_human_gate_resume.consumed_by,
        });
        log = consumed.log;
        humanGateResumeTokenReadback = consumed.token_readback;
        const aggregateIdentity = isRecord(appended.result.transition_event.aggregate_identity)
          ? appended.result.transition_event.aggregate_identity
          : {};
        readModelAfterHumanGateResume = rebuildDomainProgressTransitionReadModel({
          log,
          aggregateIdentity,
        });
      }
    }
    return {
      ...reconcile,
      human_gate_resume_token_readback: humanGateResumeTokenReadback,
      read_model_after_human_gate_resume: readModelAfterHumanGateResume,
    };
  });
  const results = reconciles.map((reconcile) => reconcile.result);
  const stepEvidence = reconciles.map((reconcile, index) => ({
    step_index: index,
    exactly_one_transition: reconcile.exactly_one_transition,
    transition_kind: reconcile.selected_transition_kind,
    non_advancing_apply: reconcile.non_advancing_apply,
    event_id: reconcile.evidence.event_id,
    outbox_item_id: reconcile.evidence.outbox_item_id,
    stable_observation_kind: reconcile.evidence.stable_observation_kind,
    human_gate_resume_token_consumed:
      reconcile.human_gate_resume_token_readback?.lifecycle_status === 'consumed',
    read_model_rebuilt_after_human_gate_resume:
      reconcile.read_model_after_human_gate_resume?.latest_human_gate_resume_token?.lifecycle_status === 'consumed',
    read_model_derived_from_event_id:
      reconcile.read_model_after_human_gate_resume?.read_model_rebuild_metadata.derived_from_event_id ?? null,
  }));
  return {
    surface_kind: 'opl_domain_progress_transition_replay',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    trace_id: input.traceId,
    replay_status: results.every((result) => result.replay_evidence.transition_count === 1)
      ? 'accepted'
      : 'blocked',
    exactly_one_transition_per_step: results.every((result) => result.replay_evidence.transition_count === 1),
    non_advancing_apply_count: results.filter((result) => result.replay_evidence.non_advancing_apply).length,
    replay_evidence: {
      surface_kind: 'opl_domain_progress_trace_replay_evidence',
      trace_id: input.traceId,
      step_count: input.steps.length,
      exactly_one_or_non_advancing_per_step: stepEvidence.every((step) =>
        step.exactly_one_transition
        && (SUPPORTED_TRANSITIONS.has(step.transition_kind) || step.transition_kind === 'NonAdvancingApply')
      ),
      non_advancing_apply_count: stepEvidence.filter((step) => step.non_advancing_apply).length,
      human_gate_resume_consumption_count: stepEvidence
        .filter((step) => step.human_gate_resume_token_consumed).length,
      step_evidence: stepEvidence,
    },
    command_event_log: log,
    read_model_rebuilds: reconciles
      .map((reconcile) => reconcile.read_model_after_human_gate_resume)
      .filter((readModel): readModel is NonNullable<typeof readModel> => Boolean(readModel)),
    results,
  };
}
