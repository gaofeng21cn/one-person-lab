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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]) {
  return values.map(optionalString).find((value): value is string => Boolean(value)) ?? null;
}

function booleanTrue(value: unknown) {
  return value === true || value === 'true';
}

function recordField(value: Record<string, unknown>, field: string) {
  return isRecord(value[field]) ? value[field] : null;
}

function adapterCanCreateOplOutbox(request: Record<string, unknown>) {
  const capabilities = recordField(request, 'runtime_capabilities')
    ?? recordField(request, 'domain_runtime_capabilities')
    ?? {};
  return request.mas_can_create_opl_outbox_record
    ?? request.adapter_can_create_opl_outbox_record
    ?? capabilities.mas_can_create_opl_outbox_record
    ?? capabilities.adapter_can_create_opl_outbox_record;
}

function policyAuthorityBoundary(request: Record<string, unknown>) {
  const boundary = recordField(request, 'authority_boundary')
    ?? recordField(request, 'policy_authority_boundary')
    ?? {};
  const outcome = recordField(request, 'outcome') ?? {};
  const policyVerdict = recordField(request, 'policy_verdict') ?? {};
  const domainPolicyResult = recordField(request, 'domain_policy_result') ?? {};
  const valuesToReject = [
    boundary.can_write_domain_truth,
    boundary.opl_can_write_domain_truth,
    boundary.can_create_owner_receipt,
    boundary.can_create_typed_blocker,
    boundary.provider_completion_is_domain_ready,
    boundary.provider_completion_is_domain_completion,
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
    ?? 'StartProviderAttempt';
  const requiredPostcondition = recordField(value, 'required_postcondition')
    ?? recordField(value, 'postcondition');
  const outcome = recordField(value, 'outcome') ?? recordField(value, 'policy_outcome');
  const policyVerdict = recordField(value, 'policy_verdict')
    ?? recordField(value, 'domain_policy_result')
    ?? {};
  const aggregateIdentity = recordField(value, 'aggregate_identity');
  const idempotencyKey = firstString(value.idempotency_key);
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
          ?? firstString(outcome?.kind, outcome?.status)
          ?? 'provider_admission_enqueued_or_blocked',
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
