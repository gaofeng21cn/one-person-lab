import { EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF } from '../pack/index.ts';

type EvidenceGroundedWorkspaceSubstrateInput = {
  structuredInputRef: string;
  sourceRef: string;
  sourceLocatorRef: string;
  sourceLocatorKind: string;
  deidentificationPolicyRef: string;
  accessAuditPolicyRef: string;
  sourceContent?: string;
};

export function buildEvidenceGroundedWorkspaceSubstrate(input: EvidenceGroundedWorkspaceSubstrateInput) {
  const sourceLocator = {
    source_ref: input.sourceRef,
    source_locator_ref: input.sourceLocatorRef,
    source_locator_kind: input.sourceLocatorKind,
  };

  return {
    surface_kind: 'opl_workspace_evidence_grounded_decision_agent_profile_substrate',
    version: 'evidence-grounded-workspace-substrate.v1',
    profile_contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
    live_evidence_observed: false,
    structured_input: {
      object_name: 'StructuredInput',
      object_id: 'structured_input',
      refs_only: true,
      structured_input_ref: input.structuredInputRef,
      source_locator: sourceLocator,
      source_body_included: false,
      normalized_sensitive_input_without_source_body: true,
    },
    sensitive_source_lifecycle: {
      lifecycle_role: 'sensitive_source_refs_and_policy_transport',
      source_locator: sourceLocator,
      deidentification_policy_ref: input.deidentificationPolicyRef,
      access_audit_policy_ref: input.accessAuditPolicyRef,
      source_content_retained_in_workspace_owner_surface_only: true,
      source_content_in_profile_readback: false,
    },
    structured_input_readback: {
      inline_source_content_included: false,
      source_locator_ref_required: true,
      access_audit_ref_required: true,
      deidentification_ref_required: true,
    },
    authority_boundary: {
      refs_only: true,
      can_read_source_body: false,
      can_write_source_body: false,
      can_write_domain_truth: false,
      can_claim_domain_ready: false,
      can_create_owner_receipt: false,
      can_create_domain_typed_blocker: false,
    },
  };
}
