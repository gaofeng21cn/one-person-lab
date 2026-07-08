import { recordList, stringValue as optionalString } from '../../../kernel/json-record.ts';

const DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID = 'opl_domain_progress_transition_runtime';

const ALLOWED_POLICY_ADAPTER_SURFACES = new Set([
  'mas_domain_progress_transition_request',
  'mas_paper_progress_policy_adapter_request',
  'opl_domain_progress_policy_adapter_request',
]);

const FORBIDDEN_RUNTIME_FIELDS = [
  'current_control_command_outbox_record',
  'opl_domain_progress_transition_command',
  'opl_domain_progress_transition_event',
  'opl_domain_progress_transition_outbox_item',
  'stage_run_identity',
  'projection_metadata',
  'read_model_generation_metadata',
];

const FORBIDDEN_AUTHORITY_FIELDS = [
  'owner_receipt',
  'owner_receipt_body',
  'typed_blocker',
  'typed_blocker_body',
  'quality_verdict',
  'domain_ready_verdict',
  'publication_ready_verdict',
  'artifact_ready_verdict',
];

export const DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT = {
  surface_kind: 'opl_domain_progress_policy_adapter_contract',
  runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  runtime_owner: 'one-person-lab',
  adapter_role: 'domain_policy_request_only',
  first_consumer: 'PaperProgressPolicyAdapter',
  request_surfaces: [...ALLOWED_POLICY_ADAPTER_SURFACES],
  domain_repo_must_not_create: [
    'opl_command',
    'opl_event',
    'opl_outbox_item',
    'stage_run_identity',
    'owner_receipt',
    'typed_blocker',
    'quality_verdict',
    'domain_ready_verdict',
  ],
  provider_completion_is_domain_ready: false,
  opl_runtime_can_write_domain_truth: false,
} as const;

type PolicyAdapterBlocked = {
  reason: string;
  task: unknown;
};

function firstString(...values: unknown[]) {
  return values.map(optionalString).find((value): value is string => Boolean(value)) ?? null;
}

function booleanTrue(value: unknown) {
  return value === true || value === 'true';
}

function recordField(value: Record<string, unknown>, field: string) {
  return recordList([value[field]])[0] ?? null;
}

function recordValue(value: unknown, field: string) {
  const valueRecord = recordList([value])[0];
  return valueRecord ? valueRecord[field] : null;
}

function routeCommandTransitionKind(value: Record<string, unknown>) {
  const routeCommand = recordField(value, 'opl_route_command');
  const commandKind = firstString(routeCommand?.command_kind, routeCommand?.route_command);
  if (commandKind === 'start_next_stage') {
    return 'StartProviderAttempt';
  }
  if (commandKind === 'stop_with_typed_blocker') {
    return 'RecordTypedBlocker';
  }
  if (commandKind === 'open_human_gate') {
    return 'OpenHumanGate';
  }
  return null;
}

function routeCommandOutcome(
  value: Record<string, unknown>,
  transitionKind: string,
) {
  const routeCommand = recordField(value, 'opl_route_command');
  if (transitionKind === 'RecordTypedBlocker') {
    return {
      kind: 'typed_blocker_ref',
      typed_blocker_ref:
        firstString(value.typed_blocker_ref)
        ?? firstString(routeCommand?.typed_blocker_ref)
        ?? firstString(routeCommand?.target)
        ?? 'typed-blocker:domain-progress-transition-request',
      reason: firstString(routeCommand?.reason) ?? 'typed_blocker',
      stable_outcome: true,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
    };
  }
  if (transitionKind === 'OpenHumanGate') {
    return {
      kind: 'human_gate_ref',
      human_gate_ref:
        firstString(value.human_gate_ref)
        ?? firstString(routeCommand?.human_gate_ref)
        ?? firstString(routeCommand?.target)
        ?? 'human-gate:domain-progress-transition-request',
      reason: firstString(routeCommand?.reason) ?? 'human_gate',
      stable_outcome: true,
      provider_completion_is_domain_completion: false,
      provider_completion_is_domain_ready: false,
    };
  }
  return null;
}

function adapterCanCreateOplOutbox(request: Record<string, unknown>) {
  const capabilities = recordField(request, 'runtime_capabilities')
    ?? {};
  const boundary = recordField(request, 'authority_boundary')
    ?? {};
  const policyBoundary = recordField(request, 'policy_authority_boundary')
    ?? {};
  const domainCapabilities = recordField(request, 'domain_runtime_capabilities')
    ?? {};
  return request.mas_can_create_opl_outbox_record
    ?? request.adapter_can_create_opl_outbox_record
    ?? boundary.mas_can_create_opl_outbox_record
    ?? boundary.adapter_can_create_opl_outbox_record
    ?? policyBoundary.mas_can_create_opl_outbox_record
    ?? policyBoundary.adapter_can_create_opl_outbox_record
    ?? capabilities.mas_can_create_opl_outbox_record
    ?? capabilities.adapter_can_create_opl_outbox_record
    ?? domainCapabilities.mas_can_create_opl_outbox_record
    ?? domainCapabilities.adapter_can_create_opl_outbox_record;
}

function policyAuthorityBoundary(request: Record<string, unknown>) {
  const boundary = recordField(request, 'authority_boundary')
    ?? {};
  const policyBoundary = recordField(request, 'policy_authority_boundary') ?? {};
  const capabilities = recordField(request, 'runtime_capabilities') ?? {};
  const domainCapabilities = recordField(request, 'domain_runtime_capabilities') ?? {};
  const outcome = recordField(request, 'outcome') ?? {};
  const policyVerdict = recordField(request, 'policy_verdict') ?? {};
  const domainPolicyResult = recordField(request, 'domain_policy_result') ?? {};
  const valuesToReject = [
    request.can_write_opl_outbox,
    request.can_write_opl_event,
    request.can_write_opl_stage_run,
    request.can_write_provider_attempt,
    request.can_claim_provider_running,
    request.can_claim_paper_progress,
    request.can_claim_runtime_ready,
    request.provider_admission_pending,
    request.provider_completion_is_domain_ready,
    request.provider_completion_is_domain_completion,
    boundary.mas_can_create_opl_event,
    boundary.mas_can_create_opl_stage_run,
    boundary.mas_can_authorize_provider_admission,
    boundary.mas_can_mark_provider_attempt_running,
    boundary.can_write_opl_outbox,
    boundary.can_write_opl_event,
    boundary.can_write_opl_stage_run,
    boundary.can_write_provider_attempt,
    boundary.can_claim_provider_running,
    boundary.can_claim_paper_progress,
    boundary.can_claim_runtime_ready,
    boundary.provider_admission_pending,
    boundary.can_write_domain_truth,
    boundary.opl_can_write_domain_truth,
    boundary.can_create_owner_receipt,
    boundary.can_create_typed_blocker,
    boundary.provider_completion_is_domain_ready,
    boundary.provider_completion_is_domain_completion,
    policyBoundary.mas_can_create_opl_event,
    policyBoundary.mas_can_create_opl_stage_run,
    policyBoundary.mas_can_authorize_provider_admission,
    policyBoundary.mas_can_mark_provider_attempt_running,
    policyBoundary.can_write_opl_outbox,
    policyBoundary.can_write_opl_event,
    policyBoundary.can_write_opl_stage_run,
    policyBoundary.can_write_provider_attempt,
    policyBoundary.can_claim_provider_running,
    policyBoundary.can_claim_paper_progress,
    policyBoundary.can_claim_runtime_ready,
    policyBoundary.provider_admission_pending,
    policyBoundary.can_write_domain_truth,
    policyBoundary.opl_can_write_domain_truth,
    policyBoundary.can_create_owner_receipt,
    policyBoundary.can_create_typed_blocker,
    policyBoundary.provider_completion_is_domain_ready,
    policyBoundary.provider_completion_is_domain_completion,
    capabilities.can_claim_provider_running,
    capabilities.can_claim_paper_progress,
    capabilities.can_claim_runtime_ready,
    capabilities.provider_admission_pending,
    domainCapabilities.can_claim_provider_running,
    domainCapabilities.can_claim_paper_progress,
    domainCapabilities.can_claim_runtime_ready,
    domainCapabilities.provider_admission_pending,
    outcome.provider_completion_is_domain_ready,
    outcome.provider_completion_is_domain_completion,
    policyVerdict.provider_completion_is_domain_ready,
    policyVerdict.provider_completion_is_domain_completion,
    domainPolicyResult.provider_completion_is_domain_ready,
    domainPolicyResult.provider_completion_is_domain_completion,
  ];
  return {
    boundary,
    overclaims_authority: valuesToReject.some(booleanTrue),
  };
}

function blocked(reason: string, task: unknown): { blocked: PolicyAdapterBlocked } {
  return { blocked: { reason, task } };
}

export function normalizeDomainProgressPolicyAdapterRequest(
  value: Record<string, unknown>,
): { request?: Record<string, unknown>; blocked?: PolicyAdapterBlocked } {
  const surfaceKind = optionalString(value.surface_kind);
  if (!surfaceKind || !ALLOWED_POLICY_ADAPTER_SURFACES.has(surfaceKind)) {
    return {};
  }

  const targetRuntimeKind = firstString(value.target_runtime_kind, value.runtime_kind);
  const targetRuntimeOwner = firstString(value.target_runtime_owner, value.runtime_owner);
  if (
    targetRuntimeKind !== 'DomainProgressTransitionRuntime'
    || targetRuntimeOwner !== 'one-person-lab'
    || adapterCanCreateOplOutbox(value) !== false
  ) {
    return blocked('domain_progress_policy_adapter_boundary_missing', value);
  }

  if (FORBIDDEN_RUNTIME_FIELDS.some((field) => field in value)) {
    return blocked('domain_progress_policy_adapter_runtime_field_forbidden', value);
  }
  if (FORBIDDEN_AUTHORITY_FIELDS.some((field) => field in value)) {
    return blocked('domain_progress_policy_adapter_authority_field_forbidden', value);
  }
  const authorityBoundary = policyAuthorityBoundary(value);
  if (authorityBoundary.overclaims_authority) {
    return blocked('domain_progress_policy_adapter_authority_overclaim', value);
  }

  const adapterKind =
    firstString(value.policy_adapter_kind, value.adapter_kind, value.adapter_id)
    ?? (surfaceKind === 'mas_paper_progress_policy_adapter_request'
      ? 'PaperProgressPolicyAdapter'
      : 'DomainProgressPolicyAdapter');
  const adapterOwner = firstString(value.adapter_owner, value.request_owner, value.domain_owner)
    ?? (surfaceKind.startsWith('mas_') ? 'med-autoscience' : 'domain-agent');
  const domainId = firstString(value.domain_id)
    ?? (adapterOwner === 'med-autoscience' ? 'medautoscience' : null);
  const recommendedTransitionKind =
    firstString(value.recommended_transition_kind, value.transition_kind, value.command_kind)
    ?? routeCommandTransitionKind(value)
    ?? 'StartProviderAttempt';
  const requiredPostcondition = recordField(value, 'required_postcondition')
    ?? recordField(value, 'postcondition');
  const outcome = recordField(value, 'outcome')
    ?? recordField(value, 'policy_outcome')
    ?? routeCommandOutcome(value, recommendedTransitionKind);
  const policyVerdict = recordField(value, 'policy_verdict')
    ?? recordField(value, 'domain_policy_result')
    ?? {};
  const aggregateIdentity = recordField(value, 'aggregate_identity');
  const idempotencyKey = firstString(value.request_idempotency_key, value.idempotency_key);
  const sourceGeneration = firstString(value.source_generation);
  const expectedVersion = firstString(value.expected_version);
  if (!aggregateIdentity || !idempotencyKey || !sourceGeneration || !expectedVersion || !requiredPostcondition) {
    return blocked('domain_progress_policy_adapter_identity_or_postcondition_missing', value);
  }

  const policyAdapterReadback = {
    surface_kind: 'opl_domain_progress_policy_adapter_readback',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    adapter_kind: adapterKind,
    adapter_owner: adapterOwner,
    domain_id: domainId,
    source_surface_kind: surfaceKind,
    request_authority_role: 'domain_policy_request_only',
    target_runtime_kind: 'DomainProgressTransitionRuntime',
    target_runtime_owner: 'one-person-lab',
    mas_can_create_opl_outbox_record: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_quality_verdict: false,
    provider_completion_is_domain_ready: false,
    provider_completion_is_domain_completion: false,
  };

  return {
    request: {
      ...value,
      surface_kind: 'mas_domain_progress_transition_request',
      source_surface_kind: surfaceKind,
      target_runtime_kind: 'DomainProgressTransitionRuntime',
      target_runtime_owner: 'one-person-lab',
      request_owner: adapterOwner,
      domain_id: domainId,
      authority_role: 'domain_policy_request_only',
      mas_can_create_opl_outbox_record: false,
      runtime_kind: 'DomainProgressTransitionRuntime',
      recommended_transition_kind: recommendedTransitionKind,
      aggregate_identity: aggregateIdentity,
      idempotency_key: idempotencyKey,
      source_generation: sourceGeneration,
      expected_version: expectedVersion,
      required_postcondition: {
        ...requiredPostcondition,
        kind: firstString(requiredPostcondition.kind, requiredPostcondition.required_outcome)
          ?? firstString(recordValue(outcome, 'kind'), recordValue(outcome, 'status'))
          ?? 'provider_admission_projected_or_blocked',
        outcome_owner: firstString(requiredPostcondition.outcome_owner) ?? 'one-person-lab',
        domain_state_owner: firstString(requiredPostcondition.domain_state_owner) ?? adapterOwner,
      },
      ...(outcome ? { outcome } : {}),
      policy_adapter_readback: policyAdapterReadback,
      domain_policy_result: {
        ...policyVerdict,
        surface_kind: 'opl_domain_progress_policy_adapter_result',
        runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
        adapter_kind: adapterKind,
        adapter_owner: adapterOwner,
        domain_id: domainId,
        source_surface_kind: surfaceKind,
        authority_role: 'domain_policy_request_only',
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        provider_completion_is_domain_ready: false,
        provider_completion_is_domain_completion: false,
      },
    },
  };
}
