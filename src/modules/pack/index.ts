export const OPL_PACK_SOURCE_MODULE = {
  moduleId: 'pack',
  brandName: 'OPL Pack',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.pack',
  physicalRoot: 'src/modules/pack',
} as const;

// Public cross-module surface generated from existing module consumers.
export {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
  readEvidenceGroundedDecisionAgentProfileContract,
} from './evidence-grounded-decision-agent-profile.ts';
export {
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
  buildRepoGeneratedInterfaceBundle,
} from './domain-pack-compiler.ts';
export { buildGeneratedInterfaceBundle } from './domain-pack-compiler/generated-interface-read-model.ts';
export {
  buildRepoContractDescriptor,
  buildStandardAgentRepoContractReadout,
} from './domain-pack-compiler/repo-contract-descriptor.ts';
export {
  resolveFunctionalPrivatizationAuditContract,
  resolveGeneratedSurfaceHandoffContract,
} from './standard-agent-proof-contract-defaults.ts';
export type {
  StandardAgentRepoContractDescriptor,
  StandardAgentRepoContractReadout,
} from './domain-pack-compiler/repo-contract-descriptor.ts';
export {
  compileStandardAgentStageManifest,
  resolveStandardAgentStageQualityRuntimeBinding,
  STANDARD_AGENT_DESCRIPTOR_REF,
} from './standard-agent-stage-manifest.ts';
export type {
  StandardAgentHandoffReviewBoundary,
  StandardAgentStageManifestCompilation,
  StandardAgentStageQualityPolicy,
  StandardAgentStageQualityRuntimeBinding,
} from './standard-agent-stage-manifest.ts';
export {
  readStandardAgentStagePromptFile,
  resolveStandardAgentStagePrompt,
  readStandardAgentQualityRolePromptFile,
  resolveStandardAgentRepoFile,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
  STANDARD_AGENT_STAGE_PROMPT_LAYER,
} from './standard-agent-stage-prompt.ts';
export type { StandardAgentStagePromptResolution } from './standard-agent-stage-prompt.ts';
export {
  buildFunctionalPrivatizationAudit,
  FUNCTIONAL_PRIVATIZATION_AUDIT_CONTRACT,
} from './functional-privatization-audit.ts';
export type {
  FunctionalEvidenceGateProjection,
  FunctionalExternalEvidenceRequest,
  FunctionalExternalEvidenceRequestPack,
  FunctionalOplReplacementExpectation,
  FunctionalPrivatizationAudit,
  FunctionalPrivatizationAuditItem,
  FunctionalPrivatizationAuditVisibility,
  FunctionalPrivatizationMigrationClass,
  FunctionalPrivatizationStandardizationLayer,
} from './functional-privatization-audit.ts';
export {
  buildEmptyFunctionalEvidenceGateProjection,
  buildFunctionalPrivatizationAuditEnvelopeFromAudit,
  buildFunctionalSourcePurityTailReadModel,
  compactFunctionalPrivatizationAuditEnvelope,
  FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT,
} from './functional-privatization-envelope.ts';
export type {
  FunctionalPrivatizationAuditEnvelope,
  FunctionalPrivatizationAuditSourceFieldRole,
} from './functional-privatization-envelope.ts';
export {
  buildPrivatePlatformResidueDeletionGate,
  privatePlatformResidueGateFromRecord,
} from './private-platform-residue-deletion-gate.ts';
export {
  STANDARD_AGENT_IMPLEMENTATION_PROFILE,
  STANDARD_AGENT_IMPLEMENTATION_PROFILE_SCHEMA_REF,
  validateStandardAgentImplementationProfile,
  validateStandardAgentImplementationProfileRefs,
} from './standard-agent-implementation-profile.ts';
export type {
  StandardAgentImplementationProfile,
  StandardAgentImplementationProfileValidation,
} from './standard-agent-implementation-profile.ts';
export {
  OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID,
  provisionSubmissionResource,
} from './submission-resource-provisioning.ts';
export type { SubmissionResourceProvisionRequest } from './submission-resource-provisioning.ts';
export {
  artifactProjectionTreeSha256,
  materializeArtifactProjection,
  materializeArtifactProjectionRequestFile,
  OPL_PACK_MATERIALIZE_ARTIFACT_PROJECTION_ACTION_ID,
} from './artifact-projection-materialization.ts';
export type {
  ArtifactProjectionMaterializationHooks,
  ArtifactProjectionMaterializationRequest,
} from './artifact-projection-materialization.ts';
export * from './agent-profile-spine.ts';
export * from './agent-scaffold-materialization.ts';
export * from './profile-capability-plan.ts';
export * from './profile-selection-intent.ts';
export * from './public/foundry-agent-series-policy.ts';
export * from './public/source-derived-agent-design-abi.ts';
export * from './reference-build-proof.ts';
export * from './source-derived-agent-design-abi.ts';
export * from './standard-agent-capability-map.ts';
export * from './standard-agent-conformance-profile.ts';
export * from './standard-agent-evaluation-manifest.ts';
export * from './standard-agent-execution-profile.ts';
export * from './standard-agent-principles.ts';
export * from './standard-domain-agent-conformance-utils.ts';
export * from './standard-domain-agent-scaffold-constants.ts';
export * from './standard-domain-agent-scaffold-policy.ts';
export * from './standard-domain-agent-scaffold-stage-run-canary.ts';
export * from './standard-domain-agent-scaffold-template.ts';
export * from './standard-domain-agent-scaffold-validation.ts';
export * from './standard-domain-agent-scaffold.ts';
export * from './standard-domain-agent-stage-operating-principles.ts';
export * from './standard-domain-agent-stage-pack-v2.ts';
export * from './standard-domain-agent-stage-quality-route-conformance.ts';
