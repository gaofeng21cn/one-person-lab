type JsonRecord = Record<string, unknown>;

export type FunctionalPrivatizationAuditSourceFieldRole = 'standard_contract_source';

export type FunctionalPrivatizationAuditEnvelopeSummaryInput = {
  total_module_count: number;
  standard_domain_pack_inventory_count: number;
  authority_function_inventory_count: number;
  private_platform_residue_inventory_count: number;
  default_watchlist_count: number;
  semantic_equivalence_review_count: number;
  active_private_generic_residue_count: number;
  blocker_count: number;
};

export type FunctionalSourcePurityTailReadModel = {
  default_action_required_count: number;
  action_required_blocker_count: number;
  hidden_cleared_audit_ledger_count: number;
  hidden_cleared_entries_remain_traceable: true;
  private_platform_residue_inventory_audit_only_count: number;
  private_platform_residue_inventory_counts_as_action_required: false;
  private_platform_residue_inventory_counts_as_blocker: false;
  physical_delete_authorized: false;
  physical_delete_authority: 'not_authorized_by_descriptor_or_app_read_model';
  source_purity_tail_status:
    | 'no_source_purity_tail'
    | 'audit_only_tail_traceable_no_action_required_blocker'
    | 'action_required_tail_open';
  source_purity_tail_policy:
    'physical_delete_requires_separate_domain_owner_receipt_or_typed_blocker_no_active_caller_no_forbidden_write_and_replacement_parity';
};

export type FunctionalPrivatizationAuditEnvelopeEvidenceInput = {
  status: 'empty' | 'evidence_gates_open';
};

export type FunctionalPrivatizationAuditEnvelopeEvidencePackInput = {
  summary: {
    request_count: number;
    open_request_count: number;
  };
};

export type FunctionalEvidenceGateProjectionInput = {
  surface_kind: 'opl_domain_evidence_gate_projection';
  status: 'empty' | 'evidence_gates_open';
  remaining_evidence_gate_ids: string[];
  remaining_bridge_module_ids: string[];
  source_refs: string[];
  summary: {
    remaining_evidence_gate_count: number;
    remaining_bridge_module_count: number;
  };
};

export type FunctionalPrivatizationEnvelopeInput = {
  status: 'missing' | 'resolved';
  sourceField: string | null;
  sourceFieldRole: FunctionalPrivatizationAuditSourceFieldRole | null;
  targetDomainId: string | null;
  summary: FunctionalPrivatizationAuditEnvelopeSummaryInput;
  evidenceGateProjection: FunctionalPrivatizationAuditEnvelopeEvidenceInput;
  externalEvidenceRequestPack: FunctionalPrivatizationAuditEnvelopeEvidencePackInput | null;
  replacementExpectationCount: number;
  blockers: string[];
};

export type FunctionalPrivatizationAuditEnvelope = {
  surface_kind: 'opl_functional_privatization_audit_envelope';
  version: 'opl-functional-privatization-audit-envelope.v1';
  owner: 'one-person-lab';
  state: 'missing' | 'resolved';
  source_field: string | null;
  source_field_role: FunctionalPrivatizationAuditSourceFieldRole | null;
  target_domain_id: string | null;
  accepted_source_shapes: string[];
  legacy_import_source_shapes: string[];
  legacy_import_source_fields: string[];
  source_shape_policy: {
    standard_agent_contract_source: 'contracts/functional_privatization_audit.json';
    legacy_repo_local_shapes_are_standard_contract: false;
    legacy_import_adapter_available: false;
    new_agents_must_emit_canonical_functional_privatization_audit: true;
  };
  normalized_inventory_layers: string[];
  default_attention_policy: {
    default_surface_reads: string[];
    full_inventory_requires_explicit_detail: true;
    hidden_by_default_entries_remain_traceable: true;
  };
  ai_first_contract_light_policy: {
    contract_floor_only: true;
    expert_executor_strategy_contract: false;
    mechanical_completion_can_close_domain_quality: false;
    semantic_equivalence_requires_evidence_when_active_private: true;
  };
  summary: {
    module_count: number;
    standard_domain_pack_inventory_count: number;
    authority_function_inventory_count: number;
    private_platform_residue_inventory_count: number;
    default_watchlist_count: number;
    semantic_equivalence_review_count: number;
    active_private_generic_residue_count: number;
    blocker_count: number;
    external_evidence_request_count: number;
    external_evidence_open_request_count: number;
    replacement_expectation_count: number;
  };
  status_policy: {
    resolved_source_required: boolean;
    evidence_gate_status: string;
    blockers: string[];
  };
  source_purity_tail_read_model: FunctionalSourcePurityTailReadModel;
  semantic_equivalence_evidence_gate: {
    status: 'not_required' | 'evidence_required';
    review_required_count: number;
    active_private_generic_residue_count: number;
    open_external_evidence_request_count: number;
    evidence_gate_status: string;
    required_evidence_policy: string;
    can_close_without_evidence: false;
    mechanical_completion_can_close: false;
    authority_boundary: {
      can_claim_domain_ready: false;
      can_claim_private_residue_deleted: false;
      can_authorize_quality_or_export: false;
      can_replace_domain_owner: false;
    };
  };
  authority_boundary: {
    opl_can_write_domain_truth: false;
    opl_can_write_memory_body: false;
    opl_can_authorize_quality_or_export: false;
    domain_can_claim_generic_runtime_owner: false;
    envelope_can_claim_domain_ready: false;
    envelope_can_claim_private_residue_deleted: false;
  };
};

function compactSummary(summary: FunctionalPrivatizationAuditEnvelopeSummaryInput) {
  return {
    module_count: summary.total_module_count,
    standard_domain_pack_inventory_count: summary.standard_domain_pack_inventory_count,
    authority_function_inventory_count: summary.authority_function_inventory_count,
    private_platform_residue_inventory_count: summary.private_platform_residue_inventory_count,
    default_watchlist_count: summary.default_watchlist_count,
    semantic_equivalence_review_count: summary.semantic_equivalence_review_count,
    active_private_generic_residue_count: summary.active_private_generic_residue_count,
    blocker_count: summary.blocker_count,
  };
}

export function buildFunctionalSourcePurityTailReadModel(
  summary: FunctionalPrivatizationAuditEnvelopeSummaryInput & {
    default_hidden_cleared_count?: number;
  },
): FunctionalSourcePurityTailReadModel {
  const defaultActionRequiredCount = Math.max(
    summary.default_watchlist_count,
    summary.semantic_equivalence_review_count,
    summary.active_private_generic_residue_count,
    summary.blocker_count,
  );
  const hasAuditOnlyTail =
    (summary.default_hidden_cleared_count ?? 0) > 0
    || summary.private_platform_residue_inventory_count > 0;
  return {
    default_action_required_count: defaultActionRequiredCount,
    action_required_blocker_count: summary.blocker_count,
    hidden_cleared_audit_ledger_count: summary.default_hidden_cleared_count ?? 0,
    hidden_cleared_entries_remain_traceable: true,
    private_platform_residue_inventory_audit_only_count:
      summary.private_platform_residue_inventory_count,
    private_platform_residue_inventory_counts_as_action_required: false,
    private_platform_residue_inventory_counts_as_blocker: false,
    physical_delete_authorized: false,
    physical_delete_authority: 'not_authorized_by_descriptor_or_app_read_model',
    source_purity_tail_status:
      defaultActionRequiredCount > 0
        ? 'action_required_tail_open'
        : hasAuditOnlyTail
          ? 'audit_only_tail_traceable_no_action_required_blocker'
          : 'no_source_purity_tail',
    source_purity_tail_policy:
      'physical_delete_requires_separate_domain_owner_receipt_or_typed_blocker_no_active_caller_no_forbidden_write_and_replacement_parity',
  };
}

function semanticEquivalenceEvidenceGate(input: FunctionalPrivatizationEnvelopeInput) {
  const openExternalEvidenceRequestCount =
    input.externalEvidenceRequestPack?.summary.open_request_count ?? 0;
  const evidenceRequired =
    input.summary.semantic_equivalence_review_count > 0
    || input.summary.active_private_generic_residue_count > 0;
  return {
    status: evidenceRequired ? 'evidence_required' : 'not_required',
    review_required_count: input.summary.semantic_equivalence_review_count,
    active_private_generic_residue_count: input.summary.active_private_generic_residue_count,
    open_external_evidence_request_count: openExternalEvidenceRequestCount,
    evidence_gate_status: input.evidenceGateProjection.status,
    required_evidence_policy:
      'active_private_or_semantic_equivalence_review_requires_domain_or_app_live_evidence_refs_typed_blocker_or_owner_receipt_before_private_residue_closure',
    can_close_without_evidence: false,
    mechanical_completion_can_close: false,
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_private_residue_deleted: false,
      can_authorize_quality_or_export: false,
      can_replace_domain_owner: false,
    },
  } as const;
}

export const FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT = {
  surface_kind: 'opl_functional_privatization_audit_envelope_contract',
  version: 'opl-functional-privatization-audit-envelope.v1',
  owner: 'one-person-lab',
  contract_ref: 'contracts/opl-framework/functional-privatization-audit-envelope-contract.json',
  purpose:
    'Normalize canonical standard-agent functional_privatization_audit contracts into one AI-first, contract-light OPL read-model envelope.',
  accepted_source_shapes: [
    'functional_privatization_audit',
  ],
  legacy_import_source_shapes: [],
  source_shape_policy: {
    standard_agent_contract_source: 'contracts/functional_privatization_audit.json',
    legacy_repo_local_shapes_are_standard_contract: false,
    legacy_import_adapter_available: false,
    new_agents_must_emit_canonical_functional_privatization_audit: true,
  },
  normalized_inventory_layers: [
    'standard_domain_pack_inventory',
    'authority_function_inventory',
    'private_platform_residue_inventory',
  ],
  default_surface_reads: [
    'default_watchlist_count',
    'default_watchlist_module_ids',
    'semantic_equivalence_review_count',
    'semantic_equivalence_review_module_ids',
    'active_private_generic_residue_count',
    'blocker_count',
  ],
  explicit_detail_surfaces: [
    'modules',
    'standard_domain_pack_inventory',
    'authority_function_inventory',
    'private_platform_residue_inventory',
    'external_evidence_request_pack',
    'evidence_gate_projection',
    'opl_replacement_expectations',
  ],
  ai_first_contract_light_policy: {
    contract_floor_only: true,
    expert_executor_strategy_contract: false,
    mechanical_completion_can_close_domain_quality: false,
    semantic_equivalence_requires_evidence_when_active_private: true,
  },
  semantic_equivalence_evidence_gate: {
    status_values: [
      'not_required',
      'evidence_required',
    ],
    evidence_required_when_any: [
      'semantic_equivalence_review_count > 0',
      'active_private_generic_residue_count > 0',
    ],
    required_evidence_policy:
      'active private residue or semantic equivalence review requires domain or App live evidence refs, typed blocker, or owner receipt before private residue closure',
    can_close_without_evidence: false,
    mechanical_completion_can_close: false,
  },
  source_purity_tail_read_model: {
    status_values: [
      'no_source_purity_tail',
      'audit_only_tail_traceable_no_action_required_blocker',
      'action_required_tail_open',
    ],
    action_required_fields: [
      'default_watchlist_count',
      'semantic_equivalence_review_count',
      'active_private_generic_residue_count',
      'blocker_count',
    ],
    audit_only_inventory_fields: [
      'default_hidden_cleared_count',
      'private_platform_residue_inventory_count',
    ],
    private_platform_residue_inventory_counts_as_action_required: false,
    private_platform_residue_inventory_counts_as_blocker: false,
    physical_delete_authorized: false,
    physical_delete_policy:
      'physical delete requires separate domain owner receipt or typed blocker, no-active-caller proof, no-forbidden-write evidence, and replacement parity',
  },
  authority_boundary: {
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_authorize_quality_or_export: false,
    domain_can_claim_generic_runtime_owner: false,
    envelope_can_claim_domain_ready: false,
    envelope_can_claim_private_residue_deleted: false,
  },
} as const;

export function buildFunctionalPrivatizationAuditEnvelope(
  input: FunctionalPrivatizationEnvelopeInput,
): FunctionalPrivatizationAuditEnvelope {
  const summary = compactSummary(input.summary);
  return {
    surface_kind: 'opl_functional_privatization_audit_envelope',
    version: 'opl-functional-privatization-audit-envelope.v1',
    owner: 'one-person-lab',
    state: input.status,
    source_field: input.sourceField,
    source_field_role: input.sourceFieldRole,
    target_domain_id: input.targetDomainId,
    accepted_source_shapes: [...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.accepted_source_shapes],
    legacy_import_source_shapes: [
      ...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.legacy_import_source_shapes,
    ],
    legacy_import_source_fields: [],
    source_shape_policy: {
      ...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.source_shape_policy,
    },
    normalized_inventory_layers: [...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.normalized_inventory_layers],
    default_attention_policy: {
      default_surface_reads: [...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.default_surface_reads],
      full_inventory_requires_explicit_detail: true,
      hidden_by_default_entries_remain_traceable: true,
    },
    ai_first_contract_light_policy: {
      ...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.ai_first_contract_light_policy,
    },
    summary: {
      ...summary,
      external_evidence_request_count: input.externalEvidenceRequestPack?.summary.request_count ?? 0,
      external_evidence_open_request_count: input.externalEvidenceRequestPack?.summary.open_request_count ?? 0,
      replacement_expectation_count: input.replacementExpectationCount,
    },
    status_policy: {
      resolved_source_required: input.status === 'missing',
      evidence_gate_status: input.evidenceGateProjection.status,
      blockers: [...input.blockers],
    },
    source_purity_tail_read_model: buildFunctionalSourcePurityTailReadModel(input.summary),
    semantic_equivalence_evidence_gate: semanticEquivalenceEvidenceGate(input),
    authority_boundary: {
      ...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.authority_boundary,
    },
  };
}

export function buildEmptyFunctionalEvidenceGateProjection(): FunctionalEvidenceGateProjectionInput {
  return {
    surface_kind: 'opl_domain_evidence_gate_projection',
    status: 'empty',
    remaining_evidence_gate_ids: [],
    remaining_bridge_module_ids: [],
    source_refs: [],
    summary: {
      remaining_evidence_gate_count: 0,
      remaining_bridge_module_count: 0,
    },
  };
}

export function buildFunctionalPrivatizationAuditEnvelopeFromAudit(args: {
  status: 'missing' | 'resolved';
  sourceField: string | null;
  sourceFieldRole: FunctionalPrivatizationAuditSourceFieldRole | null;
  targetDomainId: string | null;
  summary: FunctionalPrivatizationAuditEnvelopeSummaryInput;
  evidenceGateProjection: FunctionalPrivatizationAuditEnvelopeEvidenceInput;
  externalEvidenceRequestPack: FunctionalPrivatizationAuditEnvelopeEvidencePackInput | null;
  replacementExpectations: readonly unknown[];
  blockers: string[];
}) {
  return buildFunctionalPrivatizationAuditEnvelope({
    status: args.status,
    sourceField: args.sourceField,
    sourceFieldRole: args.sourceFieldRole,
    targetDomainId: args.targetDomainId,
    summary: args.summary,
    evidenceGateProjection: args.evidenceGateProjection,
    externalEvidenceRequestPack: args.externalEvidenceRequestPack,
    replacementExpectationCount: args.replacementExpectations.length,
    blockers: args.blockers,
  });
}

export function compactFunctionalPrivatizationAuditEnvelope(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const envelope = value as JsonRecord;
  const summary = envelope.summary && typeof envelope.summary === 'object' && !Array.isArray(envelope.summary)
    ? envelope.summary as JsonRecord
    : {};
  return {
    surface_kind: envelope.surface_kind ?? null,
    version: envelope.version ?? null,
    state: envelope.state ?? null,
    source_field: envelope.source_field ?? null,
    source_field_role: envelope.source_field_role ?? null,
    legacy_import_source_fields: envelope.legacy_import_source_fields ?? [],
    source_shape_policy: envelope.source_shape_policy ?? null,
    target_domain_id: envelope.target_domain_id ?? null,
    summary,
    default_attention_policy: envelope.default_attention_policy ?? null,
    ai_first_contract_light_policy: envelope.ai_first_contract_light_policy ?? null,
    status_policy: envelope.status_policy ?? null,
    semantic_equivalence_evidence_gate: envelope.semantic_equivalence_evidence_gate ?? null,
    authority_boundary: envelope.authority_boundary ?? null,
  };
}
