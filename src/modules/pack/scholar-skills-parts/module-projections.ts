import crypto from 'node:crypto';
import type {
  ScholarSkillCapabilityModuleDescriptor,
} from '../../../kernel/types.ts';
import type { CandidateArtifactBodyEntry } from './artifact-engines.ts';
import {
  moduleArtifactRefFamilies,
  moduleContractRef,
  moduleExecutionReceiptRefFamilies,
  moduleProfileId,
} from './catalog.ts';

type InvocationInput = {
  inputRef: string;
  artifactRoot: string;
};

export function moduleCapabilityProfile(module: ScholarSkillCapabilityModuleDescriptor) {
  return {
    surface_kind: 'opl_scholarskills_module_capability_profile',
    module_id: module.module_id,
    profile_id: moduleProfileId(module),
    stage_fit: module.stage_fit,
    input_schema_refs: module.input_schema_refs,
    output_schema_refs: module.output_schema_refs,
    dependency_profile_refs: module.dependency_profile_refs,
    run_context_refs: module.run_context_refs,
    invocation_entries: module.invocation_entries,
    artifact_ref_families: moduleArtifactRefFamilies(module),
    artifact_refs: module.artifact_refs,
    quality_evidence: module.quality_evidence,
    required_ref_families: [
      ...new Set([
        ...moduleExecutionReceiptRefFamilies(module),
        ...moduleArtifactRefFamilies(module),
      ]),
    ],
    execution_receipt_ref_families: moduleExecutionReceiptRefFamilies(module),
    authority_boundary: module.authority_boundary,
  };
}

export function moduleSummary(module: ScholarSkillCapabilityModuleDescriptor) {
  return {
    module_id: module.module_id,
    display_name: module.display_name,
    brand_family: module.brand_family,
    stage_fit: module.stage_fit,
    input_schema_refs: module.input_schema_refs,
    output_schema_refs: module.output_schema_refs,
    dependency_profile_refs: module.dependency_profile_refs,
    run_context_refs: module.run_context_refs,
    invocation_entries: module.invocation_entries,
    artifact_refs: module.artifact_refs,
    quality_evidence: module.quality_evidence,
    module_profile: moduleCapabilityProfile(module),
    authority_boundary: module.authority_boundary,
  };
}

function stableExecutionReceiptRef(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
) {
  const identity = {
    module_id: module.module_id,
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return `opl://scholarskills/execution-receipt-candidates/${encodeURIComponent(module.module_id)}/${digest}`;
}

function buildExecutionReceiptRefs(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
) {
  const receiptRef = stableExecutionReceiptRef(module, input);
  return Object.fromEntries(
    moduleExecutionReceiptRefFamilies(module).map((family) => [
      `${family}_ref`,
      `${receiptRef}#${family}_ref`,
    ]),
  );
}

export function buildArtifactCandidateRefs(
  module: ScholarSkillCapabilityModuleDescriptor,
  artifactRoot: string,
  candidateArtifactBodies: CandidateArtifactBodyEntry[] = [],
) {
  const descriptorArtifactRef = module.artifact_refs[0];
  return moduleArtifactRefFamilies(module).map((refFamily) => ({
    ref_id: refFamily,
    ref_kind: descriptorArtifactRef?.ref_kind ?? 'candidate_artifact_ref',
    role: `${moduleProfileId(module)}_${refFamily}_candidate_ref`,
    body_policy: descriptorArtifactRef?.body_policy ?? 'body_owned_by_domain_artifact_surface',
    descriptor_artifact_refs: module.artifact_refs,
    ref_family: refFamily,
    ref: `${artifactRoot}/${refFamily}`,
    materialization_status: candidateArtifactBodies.find((entry) => entry.ref_family === refFamily)
      ?.materialization_status ?? 'expected_ref_only',
    body_written: candidateArtifactBodies.some((entry) => entry.ref_family === refFamily),
    candidate_artifact_body: candidateArtifactBodies.find((entry) => entry.ref_family === refFamily),
    can_mutate_artifact_body: module.authority_boundary.can_mutate_artifact_body,
  }));
}

export function buildArtifactCandidateRefTemplates(module: ScholarSkillCapabilityModuleDescriptor) {
  const descriptorArtifactRef = module.artifact_refs[0];
  return moduleArtifactRefFamilies(module).map((refFamily) => ({
    ref_id: refFamily,
    ref_kind: descriptorArtifactRef?.ref_kind ?? 'candidate_artifact_ref',
    role: `${moduleProfileId(module)}_${refFamily}_candidate_ref`,
    body_policy: descriptorArtifactRef?.body_policy ?? 'body_owned_by_domain_artifact_surface',
    descriptor_artifact_refs: module.artifact_refs,
    ref_family: refFamily,
    ref_template: `<artifact-root>/${refFamily}`,
    materialization_status: 'expected_ref_only',
    body_written: false,
    can_mutate_artifact_body: module.authority_boundary.can_mutate_artifact_body,
  }));
}

export function buildExecutionReceiptCandidate(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
  candidateArtifactBodies: CandidateArtifactBodyEntry[] = [],
) {
  const executionReceiptRef = stableExecutionReceiptRef(module, input);
  const moduleProfile = moduleCapabilityProfile(module);
  return {
    surface_kind: 'opl_scholarskills_execution_receipt_candidate',
    status: 'receipt_candidate_unsigned',
    module_id: module.module_id,
    module_profile: moduleProfile,
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
    descriptor_ref: moduleContractRef(module),
    artifact_candidate_ref_families: moduleProfile.artifact_ref_families,
    artifact_candidate_refs: buildArtifactCandidateRefs(module, input.artifactRoot, candidateArtifactBodies),
    candidate_artifact_bodies: candidateArtifactBodies,
    required_ref_families: moduleProfile.required_ref_families,
    execution_receipt_ref: executionReceiptRef,
    execution_receipt_ref_families: moduleProfile.execution_receipt_ref_families,
    execution_receipt_refs: buildExecutionReceiptRefs(module, input),
    execution_receipt_counts_as_candidate_artifact: true,
    counts_as_paper_truth: false,
    counts_as_owner_receipt: false,
    can_authorize_publication_readiness: false,
    accepted_receipt_refs: module.receipt_policy.accepted_receipt_refs,
    receipt_body_policy: module.receipt_policy.receipt_body_policy,
    can_sign_owner_receipt: module.receipt_policy.can_sign_owner_receipt,
    can_create_typed_blocker: module.authority_boundary.can_create_typed_blocker,
    can_claim_quality_verdict: module.quality_evidence.can_claim_quality_verdict,
    can_claim_artifact_authority: module.authority_boundary.can_claim_artifact_authority,
    candidate_policy: 'refs_only_unsigned_candidate_requires_domain_owner_consumption',
    authority_boundary: module.authority_boundary,
  };
}

export function buildModuleCandidatePayload(
  module: ScholarSkillCapabilityModuleDescriptor,
  input: InvocationInput,
  candidateArtifactBodies: CandidateArtifactBodyEntry[] = [],
) {
  const moduleProfile = moduleCapabilityProfile(module);
  return {
    surface_kind: 'opl_scholarskills_module_candidate_payload',
    status: candidateArtifactBodies.length > 0
      ? 'module_candidate_with_non_authoritative_artifact_bodies'
      : 'module_candidate_refs_only',
    module_id: module.module_id,
    profile_id: moduleProfile.profile_id,
    display_name: module.display_name,
    brand_family: module.brand_family,
    descriptor_ref: moduleContractRef(module),
    input_ref: input.inputRef,
    artifact_root_ref: input.artifactRoot,
    stage_fit: module.stage_fit,
    input_schema_refs: module.input_schema_refs,
    output_schema_refs: module.output_schema_refs,
    dependency_profile_refs: module.dependency_profile_refs,
    run_context_refs: module.run_context_refs,
    artifact_candidate_ref_families: moduleProfile.artifact_ref_families,
    artifact_candidate_refs: buildArtifactCandidateRefs(module, input.artifactRoot, candidateArtifactBodies),
    candidate_artifact_bodies: candidateArtifactBodies,
    execution_receipt_ref_families: moduleProfile.execution_receipt_ref_families,
    required_ref_families: moduleProfile.required_ref_families,
    quality_checklist: {
      evidence_kind: module.quality_evidence.evidence_kind,
      required_ref_shapes: module.quality_evidence.required_ref_shapes,
      can_claim_quality_verdict: module.quality_evidence.can_claim_quality_verdict,
      quality_verdict_owner: 'domain_owner_gate',
    },
    owner_consumption: {
      required_for_paper_truth: true,
      accepted_receipt_refs: module.receipt_policy.accepted_receipt_refs,
      receipt_body_policy: module.receipt_policy.receipt_body_policy,
      counts_as_paper_truth: false,
      counts_as_owner_receipt: false,
      can_authorize_publication_readiness: false,
    },
    writes: {
      runtime_state_written: false,
      domain_truth_written: false,
      artifact_body_written: candidateArtifactBodies.length > 0,
      owner_receipt_signed: false,
      typed_blocker_created: false,
    },
    authority_flags: {
      counts_as_paper_truth: false,
      counts_as_owner_receipt: false,
      can_authorize_publication_readiness: false,
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
      can_claim_runtime_ready: false,
      can_schedule_runtime: false,
      can_write_domain_truth: false,
      can_write_runtime_state: false,
      can_write_memory_body: false,
      can_mutate_artifact_body: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    },
    authority_boundary: module.authority_boundary,
  };
}

export function buildExecutionReceiptCandidateTemplate(module: ScholarSkillCapabilityModuleDescriptor) {
  const moduleProfile = moduleCapabilityProfile(module);
  const templateRef = `opl://scholarskills/execution-receipt-candidate-templates/${encodeURIComponent(module.module_id)}`;
  return {
    surface_kind: 'opl_scholarskills_execution_receipt_candidate_template',
    status: 'receipt_candidate_template',
    module_id: module.module_id,
    module_profile: moduleProfile,
    descriptor_ref: moduleContractRef(module),
    artifact_candidate_ref_families: moduleProfile.artifact_ref_families,
    artifact_candidate_refs: buildArtifactCandidateRefTemplates(module),
    required_ref_families: moduleProfile.required_ref_families,
    execution_receipt_ref_template: `${templateRef}/<input-fingerprint>`,
    execution_receipt_ref_families: moduleProfile.execution_receipt_ref_families,
    execution_receipt_refs: Object.fromEntries(
      moduleProfile.execution_receipt_ref_families.map((family) => [
        `${family}_ref`,
        `${templateRef}/<input-fingerprint>#${family}_ref`,
      ]),
    ),
    execution_receipt_counts_as_candidate_artifact: true,
    counts_as_paper_truth: false,
    counts_as_owner_receipt: false,
    can_authorize_publication_readiness: false,
    accepted_receipt_refs: module.receipt_policy.accepted_receipt_refs,
    receipt_body_policy: module.receipt_policy.receipt_body_policy,
    can_sign_owner_receipt: module.receipt_policy.can_sign_owner_receipt,
    can_create_typed_blocker: module.authority_boundary.can_create_typed_blocker,
    can_claim_quality_verdict: module.quality_evidence.can_claim_quality_verdict,
    can_claim_artifact_authority: module.authority_boundary.can_claim_artifact_authority,
    candidate_policy: 'refs_only_unsigned_candidate_template_requires_invoke_or_receipt_binding',
    authority_boundary: module.authority_boundary,
  };
}
