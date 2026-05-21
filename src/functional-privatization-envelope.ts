type JsonRecord = Record<string, unknown>;

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
  target_domain_id: string | null;
  accepted_source_shapes: string[];
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

export const FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT = {
  surface_kind: 'opl_functional_privatization_audit_envelope_contract',
  version: 'opl-functional-privatization-audit-envelope.v1',
  owner: 'one-person-lab',
  contract_ref: 'contracts/opl-framework/functional-privatization-audit-envelope-contract.json',
  purpose:
    'Normalize MAS, MAG, RCA, and standard scaffold private functional audits into one AI-first, contract-light OPL read-model envelope.',
  accepted_source_shapes: [
    'functional_privatization_audit',
    'privatized_functional_module_audit',
    'functional_consumer_boundary',
    'mag_consumer_thinning_contract.privatized_functional_module_audit',
    'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit',
  ],
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
    target_domain_id: input.targetDomainId,
    accepted_source_shapes: [...FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.accepted_source_shapes],
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
    target_domain_id: envelope.target_domain_id ?? null,
    summary,
    default_attention_policy: envelope.default_attention_policy ?? null,
    ai_first_contract_light_policy: envelope.ai_first_contract_light_policy ?? null,
    status_policy: envelope.status_policy ?? null,
    authority_boundary: envelope.authority_boundary ?? null,
  };
}
