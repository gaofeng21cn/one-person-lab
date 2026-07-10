export type DomainAutonomyProjectionTask = {
  domain_id: string;
  task_kind: string;
  dedupe_key: string | null;
};

export const DOMAIN_AUTONOMY_SUPERVISOR_DECISION_READBACK_SURFACE_KIND =
  'opl_domain_autonomy_supervisor_decision_readback';
export const DOMAIN_AUTONOMY_SUPERVISOR_TRANSITION_PACKET_SURFACE_KIND =
  'opl_domain_autonomy_supervisor_transition_packet';
export const DOMAIN_AUTONOMY_TASK_PROJECTION_SURFACE_KIND =
  'opl_domain_autonomy_task_projection';

const DOMAIN_AUTONOMY_AUTHORITY_BOUNDARY = {
  opl_can_write_domain_truth: false,
  opl_can_create_domain_owner_receipt: false,
  opl_can_create_domain_typed_blocker: false,
  provider_completion_is_domain_ready: false,
} as const;

function recordValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export const DOMAIN_AUTONOMY_TASK_KINDS = new Set([
  'domain_autonomy/repair-recheck',
  'domain_autonomy/ai-reviewer-recheck',
  'domain_autonomy/gate-replay',
  'domain_autonomy/guarded-apply',
  'domain_autonomy/route-decision',
]);

export const DOMAIN_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON = 'domain_handler_closeout_required';

export const DOMAIN_AUTONOMY_SUPERVISOR_DECISION_KINDS = [
  'execute_current_owner_delta',
  'consume_terminal_closeout',
  'materialize_recovery_action',
  'wait_for_owner_with_resume_token',
  'stop_with_stable_typed_blocker',
  'stop_with_owner_receipt',
] as const;

export type DomainAutonomySupervisorDecisionKind = typeof DOMAIN_AUTONOMY_SUPERVISOR_DECISION_KINDS[number];

export type DomainAutonomyStageRunIdentity = {
  stage_run_id: string;
  route_identity_key: string;
  attempt_idempotency_key: string;
  selected_dispatch_ref: string;
  stage_packet_ref: string;
  stage_packet_refs: string[];
  provider_attempt_ref: string;
  attempt_lease_ref: string;
  workflow_ref: string;
  source_fingerprint: string;
  truth_epoch: string;
  runtime_health_epoch: string;
  work_unit_fingerprint: string;
};

export type DomainAutonomyRecoveryObligation = {
  obligation_id: string;
  desired_delta_ref: string;
  current_identity: DomainAutonomyStageRunIdentity;
  status: 'open' | 'current_owner_delta_executed' | 'terminal_closeout_consumed' | 'recovery_materialized' | 'waiting_for_owner' | 'stopped_with_typed_blocker' | 'stopped_with_owner_receipt';
  last_evidence_refs: string[];
  stale_read_model_lag?: string;
  supervisor_decision_ref?: string;
};

export type DomainAutonomySupervisorDecisionInput = {
  obligation_id: string;
  decision_kind: DomainAutonomySupervisorDecisionKind;
  current_identity: DomainAutonomyStageRunIdentity;
  domain_id?: string;
  domain_truth_owner?: string;
  current_owner_delta_ref?: string;
  provider_admission_identity_ref?: string;
  terminal_closeout_ref?: string;
  recovery_action_ref?: string;
  no_progress_or_inconsistency_ref?: string;
  human_gate_ref?: string;
  resume_token?: string;
  typed_blocker_ref?: string;
  owner_receipt_ref?: string;
  budget_or_missing_evidence_ref?: string;
  evidence_refs?: string[];
  observability_refs?: string[];
};

export type DomainAutonomySupervisorObligationReadbackInput = {
  obligation_id: string;
  current_identity: DomainAutonomyStageRunIdentity;
  domain_id?: string;
  domain_truth_owner?: string;
  current_owner_delta_ref?: string;
  provider_admission_identity_ref?: string;
  terminal_closeout_ref?: string;
  recovery_action_ref?: string;
  no_progress_or_inconsistency_ref?: string;
  human_gate_ref?: string;
  resume_token?: string;
  typed_blocker_ref?: string;
  owner_receipt_ref?: string;
  budget_or_missing_evidence_ref?: string;
  action_queue?: unknown[];
  provider_admission_pending_count?: number;
  evidence_refs?: string[];
  observability_refs?: string[];
};

export type DomainAutonomySupervisorDecisionReadback = {
  surface_kind: 'opl_domain_autonomy_supervisor_decision_readback';
  surface_id: typeof DOMAIN_AUTONOMY_SUPERVISOR_DECISION_READBACK_SURFACE_KIND;
  canonical_surface_kind: typeof DOMAIN_AUTONOMY_SUPERVISOR_DECISION_READBACK_SURFACE_KIND;
  readback_kind: 'domain_autonomy_supervisor_decision';
  domain_progress_readback: {
    surface_kind: 'opl_domain_progress_supervisor_decision_readback';
    readback_role: 'identity_bound_transition_advice';
    domain_progress_delta: false;
    provider_completion_is_domain_ready: false;
  };
  obligation_id: string;
  decision_id: string;
  decision_kind: DomainAutonomySupervisorDecisionKind;
  status: 'decision_ready_for_identity_bound_transition';
  domain_id: string;
  domain_truth_owner: string;
  substrate_owner: 'one-person-lab';
  current_identity: DomainAutonomyStageRunIdentity;
  transition_ref: string;
  provider_admission_identity_ref: string | null;
  current_owner_delta_ref: string | null;
  terminal_closeout_ref: string | null;
  recovery_action_ref: string | null;
  no_progress_or_inconsistency_ref: string | null;
  human_gate_ref: string | null;
  resume_token: string | null;
  typed_blocker_ref: string | null;
  owner_receipt_ref: string | null;
  budget_or_missing_evidence_ref: string | null;
  evidence_refs: string[];
  observability_refs: string[];
  authority_boundary: {
    read_model_can_execute: false;
    observability_can_close_owner_answer: false;
    opl_can_write_domain_truth: false;
    opl_can_create_domain_owner_receipt: false;
    opl_can_create_domain_typed_blocker: false;
    provider_completion_is_domain_ready: false;
  };
  state_index_projection: {
    payload_refs_only: true;
    forbidden_body_access: true;
    indexed_refs: {
      obligation_id: string;
      decision_id: string;
      stage_run_id: string;
      route_identity_key: string;
      attempt_idempotency_key: string;
      source_fingerprint: string;
      work_unit_fingerprint: string;
      evidence_ref: string | null;
      human_gate_ref: string | null;
      owner_answer_ref: string | null;
      owner_receipt_ref: string | null;
      terminal_closeout_ref: string | null;
      recovery_receipt_ref: string | null;
    };
  };
};

export type DomainAutonomySupervisorTransitionPacket = {
  surface_kind: 'opl_domain_autonomy_supervisor_transition_packet';
  surface_id: typeof DOMAIN_AUTONOMY_SUPERVISOR_TRANSITION_PACKET_SURFACE_KIND;
  canonical_surface_kind: typeof DOMAIN_AUTONOMY_SUPERVISOR_TRANSITION_PACKET_SURFACE_KIND;
  transition_profile_kind: 'domain_progress_profile';
  obligation_id: string;
  supervisor_decision_ref: string;
  transition_kind: DomainAutonomySupervisorDecisionKind;
  transition_ref: string;
  provider_admission_identity_ref: string | null;
  current_identity: DomainAutonomyStageRunIdentity;
  evidence_refs: string[];
  observability_refs: string[];
  runtime_apply_target: {
    kind:
      | 'provider_attempt_or_owner_callable'
      | 'terminal_closeout_consumption'
      | 'recovery_owner_action_materialization'
      | 'human_gate_resume_token'
      | 'stable_domain_typed_blocker'
      | 'owner_receipt_consumption';
    provider_admission_required: boolean;
    owner_callable_required: boolean;
    terminal_closeout_consumption_required: boolean;
    recovery_action_materialization_required: boolean;
    human_resume_token_required: boolean;
    stable_typed_blocker_required: boolean;
    owner_receipt_consumption_required: boolean;
    domain_truth_owner: string;
    substrate_owner: 'one-person-lab';
  };
  authority_boundary: {
    opl_can_write_domain_truth: false;
    opl_can_create_domain_owner_receipt: false;
    opl_can_create_domain_typed_blocker: false;
    provider_completion_is_domain_ready: false;
  };
  state_index_projection: {
    payload_refs_only: true;
    indexed_refs: {
      obligation_id: string;
      supervisor_decision_ref: string;
      transition_ref: string;
      stage_run_id: string;
      route_identity_key: string;
      attempt_idempotency_key: string;
      source_fingerprint: string;
      work_unit_fingerprint: string;
    };
  };
};

export function domainAutonomyProjection(
  task: DomainAutonomyProjectionTask,
  payload: Record<string, unknown>,
) {
  if (!DOMAIN_AUTONOMY_TASK_KINDS.has(task.task_kind)) {
    return null;
  }
  const workUnit = recordValue(payload.current_work_unit) ?? recordValue(payload.work_unit) ?? {};
  const sourceRefs = Array.isArray(workUnit.source_refs)
    ? workUnit.source_refs
    : Array.isArray(payload.source_refs)
      ? payload.source_refs
      : [];
  const sourceFingerprint = stringValue(workUnit.source_fingerprint)
    ?? stringValue(payload.source_fingerprint);
  const domainTruthOwner = stringValue(payload.domain_truth_owner) ?? task.domain_id;
  return {
    surface_kind: DOMAIN_AUTONOMY_TASK_PROJECTION_SURFACE_KIND,
    surface_id: DOMAIN_AUTONOMY_TASK_PROJECTION_SURFACE_KIND,
    canonical_surface_kind: DOMAIN_AUTONOMY_TASK_PROJECTION_SURFACE_KIND,
    projection_kind: 'domain_autonomy',
    domain_id: task.domain_id,
    domain_truth_owner: domainTruthOwner,
    queue_owner: 'one-person-lab',
    online_runtime_substrate_owner: 'provider_backed_family_runtime',
    task_kind: task.task_kind,
    work_unit_ref: stringValue(payload.work_unit_ref)
      ?? stringValue(payload.task_or_study_ref)
      ?? stringValue(workUnit.work_unit_ref)
      ?? stringValue(workUnit.work_unit_id),
    next_owner: stringValue(payload.next_owner) ?? stringValue(workUnit.owner),
    callable_surface: stringValue(payload.callable_surface) ?? stringValue(workUnit.callable_surface),
    repair_command: stringValue(payload.repair_command) ?? stringValue(workUnit.repair_command),
    source_refs: sourceRefs,
    source_fingerprint: sourceFingerprint,
    idempotency_key: task.dedupe_key,
    authority_boundary: {
      ...DOMAIN_AUTONOMY_AUTHORITY_BOUNDARY,
      writes_domain_truth: false,
      writes_domain_quality_verdict: false,
      writes_domain_artifact_gate: false,
      writes_domain_current_package: false,
      can_claim_domain_ready: false,
    },
  };
}

export function buildDomainAutonomySupervisorDecisionReadback(
  input: DomainAutonomySupervisorDecisionInput,
): DomainAutonomySupervisorDecisionReadback {
  assertAllowedDecisionKind(input.decision_kind);
  assertCompleteStageRunIdentity(input.current_identity);
  const transitionRef = transitionRefForDecision(input);
  const decisionId = [
    input.obligation_id,
    input.decision_kind,
    input.current_identity.stage_run_id,
    input.current_identity.route_identity_key,
    input.current_identity.attempt_idempotency_key,
  ].join('|');

  return {
    surface_kind: 'opl_domain_autonomy_supervisor_decision_readback',
    surface_id: DOMAIN_AUTONOMY_SUPERVISOR_DECISION_READBACK_SURFACE_KIND,
    canonical_surface_kind: DOMAIN_AUTONOMY_SUPERVISOR_DECISION_READBACK_SURFACE_KIND,
    readback_kind: 'domain_autonomy_supervisor_decision',
    domain_progress_readback: {
      surface_kind: 'opl_domain_progress_supervisor_decision_readback',
      readback_role: 'identity_bound_transition_advice',
      domain_progress_delta: false,
      provider_completion_is_domain_ready: false,
    },
    obligation_id: input.obligation_id,
    decision_id: decisionId,
    decision_kind: input.decision_kind,
    status: 'decision_ready_for_identity_bound_transition',
    domain_id: input.domain_id ?? 'domain-agent',
    domain_truth_owner: input.domain_truth_owner ?? input.domain_id ?? 'domain-agent',
    substrate_owner: 'one-person-lab',
    current_identity: input.current_identity,
    transition_ref: transitionRef,
    provider_admission_identity_ref: input.provider_admission_identity_ref ?? null,
    current_owner_delta_ref: input.current_owner_delta_ref ?? null,
    terminal_closeout_ref: input.terminal_closeout_ref ?? null,
    recovery_action_ref: input.recovery_action_ref ?? null,
    no_progress_or_inconsistency_ref: input.no_progress_or_inconsistency_ref ?? null,
    human_gate_ref: input.human_gate_ref ?? null,
    resume_token: input.resume_token ?? null,
    typed_blocker_ref: input.typed_blocker_ref ?? null,
    owner_receipt_ref: input.owner_receipt_ref ?? null,
    budget_or_missing_evidence_ref: input.budget_or_missing_evidence_ref ?? null,
    evidence_refs: input.evidence_refs ?? [],
    observability_refs: input.observability_refs ?? [],
    authority_boundary: {
      ...DOMAIN_AUTONOMY_AUTHORITY_BOUNDARY,
      read_model_can_execute: false,
      observability_can_close_owner_answer: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
    state_index_projection: {
      payload_refs_only: true,
      forbidden_body_access: true,
      indexed_refs: {
        obligation_id: input.obligation_id,
        decision_id: decisionId,
        stage_run_id: input.current_identity.stage_run_id,
        route_identity_key: input.current_identity.route_identity_key,
        attempt_idempotency_key: input.current_identity.attempt_idempotency_key,
        source_fingerprint: input.current_identity.source_fingerprint,
        work_unit_fingerprint: input.current_identity.work_unit_fingerprint,
        evidence_ref: input.evidence_refs?.[0] ?? null,
        human_gate_ref: input.human_gate_ref ?? null,
        owner_answer_ref: input.decision_kind === 'stop_with_owner_receipt'
          ? input.owner_receipt_ref ?? null
          : input.current_owner_delta_ref ?? input.owner_receipt_ref ?? input.typed_blocker_ref ?? null,
        owner_receipt_ref: input.owner_receipt_ref ?? null,
        terminal_closeout_ref: input.terminal_closeout_ref ?? null,
        recovery_receipt_ref: input.recovery_action_ref ?? null,
      },
    },
  };
}

export function readDomainAutonomySupervisorDecisionFromObligation(
  input: DomainAutonomySupervisorObligationReadbackInput,
): DomainAutonomySupervisorDecisionReadback {
  const base = {
    obligation_id: input.obligation_id,
    current_identity: input.current_identity,
    domain_id: input.domain_id,
    domain_truth_owner: input.domain_truth_owner,
    current_owner_delta_ref: input.current_owner_delta_ref,
    provider_admission_identity_ref: input.provider_admission_identity_ref,
    terminal_closeout_ref: input.terminal_closeout_ref,
    recovery_action_ref: input.recovery_action_ref,
    no_progress_or_inconsistency_ref: input.no_progress_or_inconsistency_ref,
    human_gate_ref: input.human_gate_ref,
    resume_token: input.resume_token,
    typed_blocker_ref: input.typed_blocker_ref,
    owner_receipt_ref: input.owner_receipt_ref,
    budget_or_missing_evidence_ref: input.budget_or_missing_evidence_ref,
    evidence_refs: supervisorEvidenceRefs(input),
    observability_refs: input.observability_refs,
  };

  if (input.terminal_closeout_ref) {
    return buildDomainAutonomySupervisorDecisionReadback({
      ...base,
      decision_kind: 'consume_terminal_closeout',
    });
  }
  if (input.owner_receipt_ref) {
    return buildDomainAutonomySupervisorDecisionReadback({
      ...base,
      decision_kind: 'stop_with_owner_receipt',
    });
  }
  if (input.typed_blocker_ref) {
    return buildDomainAutonomySupervisorDecisionReadback({
      ...base,
      decision_kind: 'stop_with_stable_typed_blocker',
    });
  }
  if (input.human_gate_ref) {
    return buildDomainAutonomySupervisorDecisionReadback({
      ...base,
      decision_kind: 'wait_for_owner_with_resume_token',
    });
  }
  if (input.recovery_action_ref || input.no_progress_or_inconsistency_ref) {
    return buildDomainAutonomySupervisorDecisionReadback({
      ...base,
      decision_kind: 'materialize_recovery_action',
    });
  }
  if (input.current_owner_delta_ref && input.provider_admission_identity_ref) {
    return buildDomainAutonomySupervisorDecisionReadback({
      ...base,
      decision_kind: 'execute_current_owner_delta',
    });
  }

  throw new Error('Domain autonomy supervisor obligation missing actionable transition evidence; action_queue and provider_admission_pending_count are not terminal evidence');
}

export function selectDomainAutonomyRecoveryObligation(
  obligations: DomainAutonomyRecoveryObligation[],
  currentIdentity: DomainAutonomyStageRunIdentity,
): DomainAutonomyRecoveryObligation | null {
  return obligations.find((obligation) =>
    obligation.status === 'open' && sameDomainAutonomyStageRunIdentity(
      obligation.current_identity,
      currentIdentity,
    )
  ) ?? null;
}

export function applyDomainAutonomySupervisorDecision(
  obligation: DomainAutonomyRecoveryObligation,
  decision: DomainAutonomySupervisorDecisionReadback,
):
  | {
    applied: true;
    obligation: DomainAutonomyRecoveryObligation;
    transition: DomainAutonomySupervisorTransitionPacket;
  }
  | {
    applied: false;
    reason: 'identity_mismatch';
    obligation: DomainAutonomyRecoveryObligation;
  } {
  if (obligation.obligation_id !== decision.obligation_id
    || !sameDomainAutonomyStageRunIdentity(obligation.current_identity, decision.current_identity)
  ) {
    return {
      applied: false,
      reason: 'identity_mismatch',
      obligation,
    };
  }

  return {
    applied: true,
    obligation: {
      ...obligation,
      status: obligationStatusForDecision(decision.decision_kind),
      supervisor_decision_ref: decision.decision_id,
      last_evidence_refs: decision.evidence_refs,
    },
    transition: buildDomainAutonomySupervisorTransitionPacket(decision),
  };
}

function buildDomainAutonomySupervisorTransitionPacket(
  decision: DomainAutonomySupervisorDecisionReadback,
): DomainAutonomySupervisorTransitionPacket {
  return {
    surface_kind: 'opl_domain_autonomy_supervisor_transition_packet',
    surface_id: DOMAIN_AUTONOMY_SUPERVISOR_TRANSITION_PACKET_SURFACE_KIND,
    canonical_surface_kind: DOMAIN_AUTONOMY_SUPERVISOR_TRANSITION_PACKET_SURFACE_KIND,
    transition_profile_kind: 'domain_progress_profile',
    obligation_id: decision.obligation_id,
    supervisor_decision_ref: decision.decision_id,
    transition_kind: decision.decision_kind,
    transition_ref: decision.transition_ref,
    provider_admission_identity_ref: decision.provider_admission_identity_ref,
    current_identity: decision.current_identity,
    evidence_refs: decision.evidence_refs,
    observability_refs: decision.observability_refs,
    runtime_apply_target: runtimeApplyTargetForDecision(
      decision.decision_kind,
      decision.domain_truth_owner,
    ),
    authority_boundary: {
      ...DOMAIN_AUTONOMY_AUTHORITY_BOUNDARY,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
    state_index_projection: {
      payload_refs_only: true,
      indexed_refs: {
        obligation_id: decision.obligation_id,
        supervisor_decision_ref: decision.decision_id,
        transition_ref: decision.transition_ref,
        stage_run_id: decision.current_identity.stage_run_id,
        route_identity_key: decision.current_identity.route_identity_key,
        attempt_idempotency_key: decision.current_identity.attempt_idempotency_key,
        source_fingerprint: decision.current_identity.source_fingerprint,
        work_unit_fingerprint: decision.current_identity.work_unit_fingerprint,
      },
    },
  };
}

function runtimeApplyTargetForDecision(
  decisionKind: DomainAutonomySupervisorDecisionKind,
  domainTruthOwner: string,
): DomainAutonomySupervisorTransitionPacket['runtime_apply_target'] {
  const common = {
    domain_truth_owner: domainTruthOwner,
    substrate_owner: 'one-person-lab' as const,
  };
  switch (decisionKind) {
    case 'execute_current_owner_delta':
      return {
        ...common,
        kind: 'provider_attempt_or_owner_callable',
        provider_admission_required: true,
        owner_callable_required: true,
        terminal_closeout_consumption_required: false,
        recovery_action_materialization_required: false,
        human_resume_token_required: false,
        stable_typed_blocker_required: false,
        owner_receipt_consumption_required: false,
      };
    case 'consume_terminal_closeout':
      return {
        ...common,
        kind: 'terminal_closeout_consumption',
        provider_admission_required: false,
        owner_callable_required: false,
        terminal_closeout_consumption_required: true,
        recovery_action_materialization_required: false,
        human_resume_token_required: false,
        stable_typed_blocker_required: false,
        owner_receipt_consumption_required: false,
      };
    case 'materialize_recovery_action':
      return {
        ...common,
        kind: 'recovery_owner_action_materialization',
        provider_admission_required: false,
        owner_callable_required: true,
        terminal_closeout_consumption_required: false,
        recovery_action_materialization_required: true,
        human_resume_token_required: false,
        stable_typed_blocker_required: false,
        owner_receipt_consumption_required: false,
      };
    case 'wait_for_owner_with_resume_token':
      return {
        ...common,
        kind: 'human_gate_resume_token',
        provider_admission_required: false,
        owner_callable_required: false,
        terminal_closeout_consumption_required: false,
        recovery_action_materialization_required: false,
        human_resume_token_required: true,
        stable_typed_blocker_required: false,
        owner_receipt_consumption_required: false,
      };
    case 'stop_with_stable_typed_blocker':
      return {
        ...common,
        kind: 'stable_domain_typed_blocker',
        provider_admission_required: false,
        owner_callable_required: false,
        terminal_closeout_consumption_required: false,
        recovery_action_materialization_required: false,
        human_resume_token_required: false,
        stable_typed_blocker_required: true,
        owner_receipt_consumption_required: false,
      };
    case 'stop_with_owner_receipt':
      return {
        ...common,
        kind: 'owner_receipt_consumption',
        provider_admission_required: false,
        owner_callable_required: false,
        terminal_closeout_consumption_required: false,
        recovery_action_materialization_required: false,
        human_resume_token_required: false,
        stable_typed_blocker_required: false,
        owner_receipt_consumption_required: true,
      };
  }
}

function assertAllowedDecisionKind(decisionKind: DomainAutonomySupervisorDecisionKind) {
  if (!DOMAIN_AUTONOMY_SUPERVISOR_DECISION_KINDS.includes(decisionKind)) {
    throw new Error(`Unsupported domain autonomy supervisor decision kind: ${decisionKind}`);
  }
}

function assertCompleteStageRunIdentity(identity: DomainAutonomyStageRunIdentity) {
  for (const field of [
    'stage_run_id',
    'route_identity_key',
    'attempt_idempotency_key',
    'selected_dispatch_ref',
    'stage_packet_ref',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'workflow_ref',
    'source_fingerprint',
    'truth_epoch',
    'runtime_health_epoch',
    'work_unit_fingerprint',
  ] as const) {
    if (!identity[field]) {
      throw new Error(`Domain autonomy supervisor identity missing ${field}`);
    }
  }
  if (identity.stage_packet_refs.length === 0) {
    throw new Error('Domain autonomy supervisor identity missing stage_packet_refs');
  }
}

function transitionRefForDecision(input: DomainAutonomySupervisorDecisionInput) {
  switch (input.decision_kind) {
    case 'execute_current_owner_delta':
      requiredRef(input.provider_admission_identity_ref, 'provider_admission_identity_ref');
      return requiredRef(input.current_owner_delta_ref, 'current_owner_delta_ref');
    case 'consume_terminal_closeout':
      return requiredRef(input.terminal_closeout_ref, 'terminal_closeout_ref');
    case 'materialize_recovery_action':
      return requiredRef(
        input.recovery_action_ref ?? input.no_progress_or_inconsistency_ref,
        'recovery_action_ref_or_no_progress_or_inconsistency_ref',
      );
    case 'wait_for_owner_with_resume_token':
      requiredRef(input.human_gate_ref, 'human_gate_ref');
      return requiredRef(input.resume_token, 'resume_token');
    case 'stop_with_stable_typed_blocker':
      requiredRef(input.budget_or_missing_evidence_ref, 'budget_or_missing_evidence_ref');
      return requiredRef(input.typed_blocker_ref, 'typed_blocker_ref');
    case 'stop_with_owner_receipt':
      return requiredRef(input.owner_receipt_ref, 'owner_receipt_ref');
  }
}

function requiredRef(value: string | undefined, field: string) {
  if (!value) {
    throw new Error(`Domain autonomy supervisor decision missing ${field}`);
  }
  return value;
}

function obligationStatusForDecision(
  decisionKind: DomainAutonomySupervisorDecisionKind,
): DomainAutonomyRecoveryObligation['status'] {
  switch (decisionKind) {
    case 'execute_current_owner_delta':
      return 'current_owner_delta_executed';
    case 'consume_terminal_closeout':
      return 'terminal_closeout_consumed';
    case 'materialize_recovery_action':
      return 'recovery_materialized';
    case 'wait_for_owner_with_resume_token':
      return 'waiting_for_owner';
    case 'stop_with_stable_typed_blocker':
      return 'stopped_with_typed_blocker';
    case 'stop_with_owner_receipt':
      return 'stopped_with_owner_receipt';
  }
}

function sameDomainAutonomyStageRunIdentity(
  left: DomainAutonomyStageRunIdentity,
  right: DomainAutonomyStageRunIdentity,
) {
  return left.stage_run_id === right.stage_run_id
    && left.route_identity_key === right.route_identity_key
    && left.attempt_idempotency_key === right.attempt_idempotency_key
    && left.selected_dispatch_ref === right.selected_dispatch_ref
    && left.stage_packet_ref === right.stage_packet_ref
    && sameStringArray(left.stage_packet_refs, right.stage_packet_refs)
    && left.provider_attempt_ref === right.provider_attempt_ref
    && left.attempt_lease_ref === right.attempt_lease_ref
    && left.workflow_ref === right.workflow_ref
    && left.source_fingerprint === right.source_fingerprint
    && left.truth_epoch === right.truth_epoch
    && left.runtime_health_epoch === right.runtime_health_epoch
    && left.work_unit_fingerprint === right.work_unit_fingerprint;
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function supervisorEvidenceRefs(input: DomainAutonomySupervisorObligationReadbackInput) {
  return [
    ...(input.evidence_refs ?? []),
    input.provider_admission_identity_ref,
    input.owner_receipt_ref,
    input.no_progress_or_inconsistency_ref,
    input.budget_or_missing_evidence_ref,
  ].filter((value): value is string => Boolean(value));
}

export * from './family-runtime-domain-autonomy-parts/substrate.ts';
