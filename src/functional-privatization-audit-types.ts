import type {
  FunctionalPrivatizationAuditEnvelope,
  FunctionalSourcePurityTailReadModel,
} from './functional-privatization-envelope.ts';

type JsonRecord = Record<string, unknown>;

export type FunctionalPrivatizationMigrationClass =
  | 'opl_owned_replacement'
  | 'opl_hosted_surface'
  | 'opl_generated_surface'
  | 'declarative_pack'
  | 'minimal_authority_function'
  | 'refs_only_domain_adapter'
  | 'temporary_migration_bridge'
  | 'diagnostic_cleanup_path'
  | 'provenance_or_fixture'
  | 'domain_authority'
  | 'retire_tombstone';

export type FunctionalPrivatizationAuditVisibility = 'attention_required' | 'hidden_by_default';

export type FunctionalPrivatizationStandardizationLayer =
  | 'standard_domain_pack_inventory'
  | 'authority_function_inventory'
  | 'private_platform_residue_inventory';

export type FunctionalPrivatizationAuditItem = {
  module_id: string;
  source: string;
  migration_class: FunctionalPrivatizationMigrationClass;
  current_owner: string | null;
  opl_replacement_owner: 'one-person-lab' | null;
  domain_allowed_role: string | null;
  current_surface_refs: string[];
  expected_opl_primitives: string[];
  retained_domain_authority: string[];
  code_paths: string[];
  active_callers: string[];
  active_caller_status: string | null;
  migration_action: string | null;
  retention_reason: string | null;
  cannot_absorb_reason: string | null;
  active_caller_allowed: boolean;
  tombstone_required: boolean;
  blocker: string | null;
  audit_visibility: FunctionalPrivatizationAuditVisibility;
  audit_reason: string;
  standardization_layer: FunctionalPrivatizationStandardizationLayer;
  standardization_layer_reason: string;
  semantic_equivalence_status: 'cleared_by_boundary' | 'review_required';
  semantic_equivalence_reason: string;
  semantic_equivalence_evidence_refs: string[];
  semantic_equivalence_typed_blocker_refs: string[];
  semantic_equivalence_no_regression_refs: string[];
  bridge_exit_gate: JsonRecord | null;
  forbidden_generic_owner_flags: JsonRecord;
};

export type FunctionalExternalEvidenceRequest = {
  request_id: string;
  status: string;
  required_evidence_refs: string[];
  required_return_shapes: string[];
  required_receipt_shapes: string[];
  forbidden_payload_classes: string[];
  accepted_payload_policy: string | null;
  source_pointer: string | null;
};

export type FunctionalExternalEvidenceRequestPack = {
  surface_kind: 'opl_external_evidence_request_pack_projection';
  request_pack_id: string | null;
  owner: string | null;
  request_owner: string | null;
  requested_from: string[];
  policy: string | null;
  requests: FunctionalExternalEvidenceRequest[];
  summary: {
    request_count: number;
    open_request_count: number;
  };
};

export type FunctionalEvidenceGateProjection = {
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

export type FunctionalOplReplacementExpectation = {
  primitive_id: string;
  owner: string | null;
  state: string | null;
  opl_provides: string[];
  domain_keeps: string[];
  implemented_in_domain: boolean | null;
  source_pointer: string;
};

export type FunctionalPrivatizationAudit = {
  surface_kind: 'opl_functional_privatization_audit';
  version: 'opl-functional-privatization-audit.v1';
  status: 'missing' | 'resolved';
  envelope: FunctionalPrivatizationAuditEnvelope;
  source_field: string | null;
  target_domain_id: string | null;
  summary: {
    total_module_count: number;
    opl_owned_replacement_count: number;
    opl_hosted_surface_count: number;
    opl_generated_surface_count: number;
    declarative_pack_count: number;
    minimal_authority_function_count: number;
    refs_only_domain_adapter_count: number;
    temporary_migration_bridge_count: number;
    diagnostic_cleanup_path_count: number;
    provenance_or_fixture_count: number;
    domain_authority_count: number;
    retire_tombstone_count: number;
    active_private_generic_residue_count: number;
    blocker_count: number;
    default_watchlist_count: number;
    default_hidden_cleared_count: number;
    default_watchlist_module_ids: string[];
    standard_domain_pack_inventory_count: number;
    authority_function_inventory_count: number;
    private_platform_residue_inventory_count: number;
    standard_domain_pack_module_ids: string[];
    authority_function_module_ids: string[];
    private_platform_residue_module_ids: string[];
    semantic_equivalence_review_count: number;
    semantic_equivalence_cleared_count: number;
    semantic_equivalence_review_module_ids: string[];
  };
  source_purity_tail_read_model: FunctionalSourcePurityTailReadModel;
  modules: FunctionalPrivatizationAuditItem[];
  standard_domain_pack_inventory: FunctionalPrivatizationAuditItem[];
  authority_function_inventory: FunctionalPrivatizationAuditItem[];
  private_platform_residue_inventory: FunctionalPrivatizationAuditItem[];
  required_opl_replacement_primitives: string[];
  external_evidence_request_pack: FunctionalExternalEvidenceRequestPack | null;
  evidence_gate_projection: FunctionalEvidenceGateProjection;
  opl_replacement_expectations: FunctionalOplReplacementExpectation[];
  blockers: string[];
  authority_boundary: {
    opl_can_write_domain_truth: false;
    opl_can_write_memory_body: false;
    opl_can_authorize_quality_or_export: false;
    domain_can_claim_generic_runtime_owner: false;
  };
};
