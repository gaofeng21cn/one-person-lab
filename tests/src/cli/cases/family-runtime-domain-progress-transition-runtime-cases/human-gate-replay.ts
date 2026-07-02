import {
  assert,
  record,
  test,
} from '../family-runtime-current-control-provider-admission-cases/shared.ts';
import {
  appendDomainProgressTransitionRuntimeResult,
  createDomainProgressTransitionRuntimeLog,
  normalizeDomainProgressTransitionCommand,
} from '../../../../../src/modules/runway/family-runtime-domain-progress-transition-runtime.ts';
import {
  reconcileDomainProgressTransitionFixedPoint,
  replayDomainProgressTransitionTrace,
} from '../../../../../src/modules/runway/family-runtime-domain-progress-transition-runtime-parts/fixed-point-replay.ts';
import {
  consumeDomainProgressHumanGateResumeToken,
  readDomainProgressHumanGateResumeToken,
  rebuildDomainProgressTransitionReadModel,
} from '../../../../../src/modules/runway/family-runtime-domain-progress-transition-runtime-parts/runtime-results.ts';

test('DomainProgressTransitionRuntime fixed-point helper chooses exactly one transition or NonAdvancingApply and exposes human gate token', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    command_id: 'dptc:dm003:human-gate',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate',
      work_unit_fingerprint: 'sha256:human-gate',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate',
    source_generation: 'truth-event-human-gate',
    expected_version: 'truth-event-human-gate',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate',
    workUnitFingerprint: 'sha256:human-gate',
    nextOwner: 'human_operator',
  }).command!;
  const stable = reconcileDomainProgressTransitionFixedPoint({
    command,
    observations: [{ kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/operator' }],
  });
  const nonAdvancing = reconcileDomainProgressTransitionFixedPoint({
    command,
    observations: [{ kind: 'provider_admission_requested' }],
  });

  assert.equal(stable.exactly_one_transition, true);
  assert.equal(stable.result.transition_event.transition_kind, 'OpenHumanGate');
  const resumeToken = stable.result.human_gate_resume_token as Record<string, unknown>;
  assert.equal(resumeToken.owner, 'human_operator');
  assert.deepEqual(resumeToken.allowed_decisions, ['approve', 'route_back']);
  assert.equal(record(resumeToken.authority_boundary).opl_can_supply_human_answer, false);
  assert.equal(nonAdvancing.non_advancing_apply, true);
  assert.equal(nonAdvancing.result.transition_event.transition_kind, 'NonAdvancingApply');
});

test('DomainProgressTransitionRuntime stores, reads back, consumes, and idempotently replays human gate resume token', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    command_id: 'dptc:dm003:human-gate-resume',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate_resume',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate_resume',
      work_unit_fingerprint: 'sha256:human-gate-resume',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate-resume',
    source_generation: 'truth-event-human-gate-resume',
    expected_version: 'truth-event-human-gate-resume',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate_resume',
    workUnitFingerprint: 'sha256:human-gate-resume',
    nextOwner: 'human_operator',
  }).command!;
  const appended = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/resume' }],
    }).result,
  });
  const token = appended.result.human_gate_resume_token as Record<string, unknown>;
  const issuedReadback = readDomainProgressHumanGateResumeToken({
    log: appended.log,
    resumeToken: String(token.resume_token),
  });

  assert.equal(issuedReadback.found, true);
  assert.equal(issuedReadback.lifecycle_status, 'issued');
  assert.equal(issuedReadback.issued_event_id, appended.result.transition_event.event_id);
  assert.equal(issuedReadback.issued_outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.ok(issuedReadback.stage_run_identity);
  assert.equal(issuedReadback.stage_run_identity.stage_run_id, (command.stage_run_identity as Record<string, unknown>).stage_run_id);

  const consumed = consumeDomainProgressHumanGateResumeToken({
    log: appended.log,
    resumeToken: String(token.resume_token),
    decision: 'approve',
    evidenceRef: 'owner-answer:dm003/human-gate-resume',
    consumedBy: 'human_operator',
  });
  assert.equal(consumed.consumption_status, 'consumed');
  assert.equal(consumed.appended, true);
  assert.equal(consumed.token_readback.lifecycle_status, 'consumed');
  assert.ok(consumed.consumption_event);
  assert.equal(consumed.token_readback.consumed_event_id, consumed.consumption_event.event_id);
  assert.equal(consumed.token_readback.consumed_outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.ok(consumed.token_readback.stage_run_identity);
  assert.equal(consumed.token_readback.stage_run_identity.stage_run_id, (command.stage_run_identity as Record<string, unknown>).stage_run_id);

  const repeated = consumeDomainProgressHumanGateResumeToken({
    log: consumed.log,
    resumeToken: String(token.resume_token),
    decision: 'approve',
    evidenceRef: 'owner-answer:dm003/human-gate-resume',
    consumedBy: 'human_operator',
  });
  assert.equal(repeated.consumption_status, 'already_consumed');
  assert.equal(repeated.idempotent_replay, true);
  assert.equal(repeated.appended, false);
  assert.equal(repeated.log.entries.length, consumed.log.entries.length);

  const readModel = rebuildDomainProgressTransitionReadModel({
    log: consumed.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  });
  assert.ok(readModel.latest_human_gate_resume_token);
  assert.equal(readModel.latest_human_gate_resume_token.lifecycle_status, 'consumed');
  assert.equal(readModel.latest_human_gate_resume_token.consumed_event_id, consumed.consumption_event.event_id);
});

test('DomainProgressTransitionRuntime replay consumes human resume token and rebuilds read model', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    command_id: 'dptc:dm003:human-gate-replay-resume',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate_replay_resume',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate_replay_resume',
      work_unit_fingerprint: 'sha256:human-gate-replay-resume',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate-replay-resume',
    source_generation: 'truth-event-human-gate-replay-resume',
    expected_version: 'truth-event-human-gate-replay-resume',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate_replay_resume',
    workUnitFingerprint: 'sha256:human-gate-replay-resume',
    nextOwner: 'human_operator',
  }).command!;
  const replay = replayDomainProgressTransitionTrace({
    traceId: 'dm003-human-gate-resume-token-consumed',
    steps: [
      {
        command,
        observed_outcome: { kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/replay-resume' },
        consume_human_gate_resume: {
          decision: 'approve',
          evidence_ref: 'owner-answer:dm003/human-gate-replay-resume',
          consumed_by: 'human_operator',
        },
      },
    ],
  });

  assert.equal(replay.replay_status, 'accepted');
  assert.equal(replay.replay_evidence.human_gate_resume_consumption_count, 1);
  assert.equal(replay.replay_evidence.step_evidence[0].human_gate_resume_token_consumed, true);
  assert.equal(replay.replay_evidence.step_evidence[0].read_model_rebuilt_after_human_gate_resume, true);
  assert.equal(replay.read_model_rebuilds[0].latest_human_gate_resume_token?.lifecycle_status, 'consumed');
  assert.equal(replay.read_model_rebuilds[0].projection_metadata.derived_from_event_id, replay.results[0].transition_event.event_id);
});
