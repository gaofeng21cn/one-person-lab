export const expectedModuleIds = [
  'charter',
  'atlas',
  'workspace',
  'pack',
  'stagecraft',
  'runway',
  'ledger',
  'console',
  'foundry',
  'connect',
];

export const moduleSurfaceIds = expectedModuleIds.filter(
  (moduleId) => moduleId !== 'workspace' && moduleId !== 'foundry',
);

export type L5Route = {
  module_id: string;
  class_id: string;
  owner: string;
  owner_route_ref: string;
  owner_repo_ref: string;
  owner_repo: string;
  owner_route_status: string;
  blocker_state: string;
  next_owner_action: string;
  work_order_id: string;
  owner_evidence_closure_state: string;
  owner_acceptance_required: boolean;
  ready_claim_authorized: boolean;
  closing_ref_source: string;
  typed_blocker_source: string;
  record_evidence_command: string;
  typed_blocker_payload_template: {
    module_id: string;
    evidence_class_id: string;
    typed_blocker_refs: string[];
    receipt_ref: string;
  };
  evidence_payload_template: {
    module_id: string;
    evidence_class_id: string;
    evidence_refs: string[];
  };
  owner_route_command_examples: {
    record_evidence: {
      command: string;
      payload_template: {
        module_id: string;
        evidence_class_id: string;
        evidence_refs: string[];
      };
      closes_l5: boolean;
    };
    record_typed_blocker_ref: {
      command: string;
      payload_template: {
        module_id: string;
        evidence_class_id: string;
        typed_blocker_refs: string[];
        receipt_ref: string;
      };
      closes_l5: boolean;
      creates_typed_blocker: boolean;
    };
    verify_receipt: {
      command: string;
      closes_l5: boolean;
    };
    list_requirement_refs: {
      command: string;
      closes_l5: boolean;
    };
  };
  verification_command: string;
  accepted_ref_shapes: string[];
  existing_evidence_refs: string[];
  existing_owner_acceptance_refs: string[];
  existing_blocker_refs: string[];
  supporting_domain_owner_chain_refs: string[];
  supporting_domain_owner_chain_ref_count: number;
  supporting_domain_owner_chain_coverage: {
    target_agents: string[];
    covered_target_agents: string[];
    missing_target_agents: string[];
    all_target_agents_covered: boolean;
    refs_are_supporting_only: boolean;
    refs_count_as_l5_evidence: boolean;
    refs_count_as_ready_claim: boolean;
    next_required_owner_action: string;
  } | null;
  observed_evidence_refs: string[];
  observed_ref_shapes: string[];
  observed_ref_count: number;
  observed_typed_blocker_ref_count: number;
  observed_receipt_count: number;
  verified_receipt_count: number;
  l5_claim_status: string;
  non_closing_inputs: string[];
  forbidden_opl_claims: string[];
  stop_loss: string[];
  authority_boundary: {
    route_is_refs_only: boolean;
    route_can_claim_l5: boolean;
    route_can_claim_production_ready: boolean;
    route_can_create_owner_receipt: boolean;
    route_can_create_typed_blocker: boolean;
  };
};

export type L5Module = {
  module_id: string;
  evidence_required: boolean;
  l5_can_be_claimed: boolean;
  l5_completion_status: string;
  satisfied_requirement_count: number;
  open_requirement_count: number;
  blocked_requirement_count: number;
  owner_followthrough_summary: {
    owner_followthrough_required: boolean;
    owner_followthrough_required_count: number;
    missing_owner_evidence_requirement_count: number;
    typed_blocker_followthrough_requirement_count: number;
    observed_refs_not_l5_claim_requirement_count: number;
    observed_ref_requirement_count: number;
    owner_followthrough_work_order_ids: string[];
    typed_blocker_followthrough_work_order_ids: string[];
    observed_refs_not_l5_claim_work_order_ids: string[];
    next_followthrough_action: string | null;
    next_followthrough_work_order_id: string | null;
    false_completion_guard: {
      observed_refs_close_l5: boolean;
      typed_blocker_refs_close_l5: boolean;
      owner_followthrough_closes_l5_without_owner_acceptance: boolean;
      ready_claim_authorized: boolean;
    };
  };
  next_action_summary: {
    module_id: string;
    status: string;
    l5_can_be_claimed: boolean;
    next_owner_action: string;
    next_work_order_id: string | null;
    next_evidence_class_id: string | null;
    next_owner: string | null;
    next_owner_repo: string | null;
    next_accepted_ref_shapes: string[] | null;
    next_forbidden_opl_claims: string[] | null;
    next_stop_loss: string[] | null;
    next_command_examples: L5Route['owner_route_command_examples'] | null;
    missing_evidence_groups: {
      missing_owner_evidence_class_ids: string[];
      observed_refs_not_l5_claim_class_ids: string[];
      typed_blocker_recorded_class_ids: string[];
      verified_receipt_class_ids: string[];
    };
    missing_owner_evidence_class_count: number;
    observed_refs_not_l5_claim_class_count: number;
    typed_blocker_recorded_class_count: number;
    verified_receipt_class_count: number;
    false_completion_guard: {
      refs_only_inputs_close_l5: boolean;
      work_order_projection_closes_l5: boolean;
      verified_ledger_closes_l5: boolean;
      ready_claim_authorized: boolean;
    };
  };
  owner_evidence_routes: L5Route[];
};
