export const OPL_PACK_SOURCE_MODULE = {
  moduleId: 'pack',
  brandName: 'OPL Pack',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.pack',
  physicalRoot: 'src/authority/packages',
} as const;

export {
  buildCordisCompositionSnapshot,
  buildCordisPluginDescriptor,
  CordisCompositionContractError,
  assertCordisPluginDescriptor,
  validateCordisCompositionSnapshot,
  validateCordisPluginDescriptor,
} from '@one-person-lab/cordis-abi';
export type CordisPackStageBindingService = {
  resolve(
    repoDir: string,
    stageId: string,
  ): import('./standard-agent-stage-manifest.ts').StandardAgentStageQualityRuntimeBinding | null;
};
export type {
  CordisCompositionSnapshot,
  CordisPluginDescriptor,
  CordisPluginDescriptorInput,
} from '@one-person-lab/cordis-abi';
export * from './package-host-integration.ts';

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
  buildStandardAgentRepoContractReadout,
} from './domain-pack-compiler/repo-contract-descriptor.ts';
export {
  resolveFunctionalPrivatizationAuditContract,
  resolveGeneratedSurfaceHandoffContract,
} from './standard-agent-proof-contract-defaults.ts';
export type {
  StandardAgentRepoContractReadout,
} from './domain-pack-compiler/repo-contract-descriptor.ts';
export {
  compileStandardAgentStageManifest,
  resolveStandardAgentStageReviewLane,
  resolveStandardAgentStageQualityRuntimeBinding,
  stageAttemptExecutorPolicyWithReviewLane,
} from './standard-agent-stage-manifest.ts';
export type {
  StandardAgentStageQualityRuntimeBinding,
} from './standard-agent-stage-manifest.ts';
export {
  readStandardAgentStagePromptFile,
  readStandardAgentManagedTextFile,
  resolveStandardAgentStagePrompt,
  readStandardAgentQualityRolePromptFile,
  resolveStandardAgentRepoFile,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
} from './standard-agent-stage-prompt.ts';
export type { StandardAgentStagePromptResolution } from './standard-agent-stage-prompt.ts';
export {
  buildFunctionalPrivatizationAudit,
} from './functional-privatization-audit.ts';
export type {
  FunctionalPrivatizationAudit,
  FunctionalPrivatizationAuditItem,
  FunctionalPrivatizationMigrationClass,
} from './functional-privatization-audit.ts';
export {
  buildFunctionalSourcePurityTailReadModel,
  compactFunctionalPrivatizationAuditEnvelope,
  FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT,
} from './functional-privatization-envelope.ts';
export {
  buildPrivatePlatformResidueDeletionGate,
} from './private-platform-residue-deletion-gate.ts';
export {
  STANDARD_AGENT_IMPLEMENTATION_PROFILE_DECLARATION,
  resolveStandardAgentImplementationProfile,
} from './standard-agent-implementation-profile.ts';
export {
  STANDARD_AGENT_PACK_ABI,
  STANDARD_AGENT_PACK_ABI_DECLARATION,
} from './standard-agent-pack-abi.ts';
export {
  OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID,
  provisionSubmissionResource,
} from './submission-resource-provisioning.ts';
export * from './agent-profile-spine.ts';
export * from './agent-scaffold-materialization.ts';
export * from './profile-capability-plan.ts';
export * from './profile-selection-intent.ts';
export * from './public/foundry-agent-series-policy.ts';
export * from './public/source-derived-agent-design-abi.ts';
export * from './reference-build-proof.ts';
export * from './source-derived-agent-design-abi.ts';
export * from './standard-agent-capability-inventory.ts';
export * from './standard-agent-capability-map.ts';
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
