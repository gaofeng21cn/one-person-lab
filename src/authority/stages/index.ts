export const OPL_STAGECRAFT_SOURCE_MODULE = {
  moduleId: 'stagecraft',
  brandName: 'OPL Stagecraft',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.stagecraft',
  physicalRoot: 'src/authority/stages',
} as const;

export type { FamilyStageContextObservation } from './family-stage-control-plane.ts';
export type CordisAtlasCatalogService = NonNullable<
  NonNullable<Parameters<typeof import('./family-stage-control-plane.ts').buildFamilyStageContextObservation>[2]>['loadDomainManifests']
>;
export type CordisStagecraftContextService = {
  observe(
    contracts: import('../../kernel/types.ts').FrameworkContracts,
    input: { domainId: string; stageId: string; actionId?: string },
    options?: Parameters<typeof import('./family-stage-control-plane.ts').buildFamilyStageContextObservation>[2],
  ): import('./family-stage-control-plane.ts').FamilyStageContextObservation;
};
export type CordisStagecraftContextPluginConfig = {
  loadDomainManifests?: CordisAtlasCatalogService;
};

// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedStagecraftProfilePolicyReadback } from './evidence-grounded-decision-agent-profile.ts';
export { buildStageAttemptCloseoutRefsOnlyContract, buildStageAttemptLaunchEnvelope, cognitiveKernelBoundary } from './cognitive-kernel-boundary.ts';
export { buildDuplicateTaskEnvelope, buildFamilyConflictOrBlockerEnvelope, buildFamilyConflictSubject, buildReceiptConflictEnvelope, buildStageAttemptConflictOrBlockerEnvelopes, canonicalOutcomeForStageAttempt } from './family-conflict-envelope.ts';
export { buildAttemptHumanReviewBurdenBudget, buildFamilyHumanReviewBurdenBudget } from './family-human-review-budget.ts';
export { buildFamilyStageConformanceReview } from './family-stage-conformance.ts';
export type { FamilyStageDomainManifestCatalog } from './family-stage-domain-manifest.ts';
export { buildFamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
export { buildFamilyActionStageRouteParity } from './family-action-stage-route.ts';
export { buildFamilyStageContextObservation, buildFamilyStageControlPlaneParity, buildFamilyStageReadinessInspect, buildFamilyStagesList } from './family-stage-control-plane.ts';
export { normalizeFamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
export type { FamilyStageControlPlane, FamilyStageSurfaceRef } from './family-stage-control-plane-contract.ts';
export { buildFamilyStageProofBundle } from './family-stage-proof-bundle.ts';
export { buildStagecraftDomainProfileRegistryReadback } from './domain-profile-registry.ts';
export { commitStageArtifactAttemptRuntime, conformanceStageArtifactRuntime, explainStageArtifactRuntime, gcStageArtifactRuntime, openStageArtifactAttemptRuntime, promoteStageArtifactRuntime, rebuildStageArtifactRuntime, restoreStageArtifactRuntime, statusStageArtifactRuntime, validateStageArtifactRuntime, workbenchStageArtifactRuntime } from './stage-artifact-runtime.ts';
export { assertStageProductionEvidencePayloadReady, buildStageProductionEvidencePayloadWorkorder, preflightStageProductionEvidencePayload, STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS } from './stage-production-evidence-payload-preflight.ts';
export type { StageReplayMissingReceiptReceipt } from './stage-replay-missing-receipt-ledger.ts';
export { buildStageReplayMissingReceiptWorkorderPacket, compactStageReplayMissingReceiptWorkorderAttentionItems, compactStageReplayMissingReceiptWorkorderAttentionSummary } from './stage-replay-missing-receipt-workorders.ts';
export { buildAppStageRunCockpit } from './stage-run-cockpit.ts';
export {
  normalizeStageQualityScopeBudget,
} from './stage-quality-scope-budget.ts';
export type {
  StageQualityScopeBudget,
  StageQualityScopeBudgetStopReason,
} from './stage-quality-scope-budget.ts';
export {
  buildStageReviewContextManifest,
  evaluateStageQualityFindingClosure,
  initialStageQualityCycleState,
  normalizeStageQualityAttemptRole,
  normalizeStageQualityCyclePolicy,
  stageQualityAttemptOutcomeFromEnvelope,
  stageQualityOutcomeFromEnvelope,
  stageReviewVerdictForOutcome,
  validateIndependentStageReviewReceipt,
  validateInitialStageQualityReviewOutcome,
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  validateStageQualityReReviewOutcome,
  validateStageQualityReviewHardStopOutcome,
} from './stage-quality-cycle.ts';
export type {
  StageQualityAttemptRole,
  StageQualityCyclePolicy,
  StageQualityCycleState,
  StageQualityFinding,
  StageQualityFindingClosure,
  StageQualityHardStopClass,
  StageQualityRepairMapEntry,
  StageQualityReReviewResult,
  StageReviewReceipt,
} from './stage-quality-cycle.ts';
export {
  sanitizeStageQualityAttemptRouteImpact,
} from './stage-quality-route-selection.ts';
export type {
  StageQualityRouteRecommendationRecord,
  StageRouteDecision,
  StageRouteRecommendation,
} from './stage-quality-route-selection.ts';
export { STANDARD_PROGRESS_DELTA_POLICY } from './standard-progress-delta-policy.ts';
export {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
} from './standard-stage-pack-identity.ts';
export { STANDARD_STAGE_COMPLETION_POLICY } from './standard-stage-completion-policy.ts';
export { STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from './standard-typed-blocker-lineage-policy.ts';
export { STANDARD_USER_STAGE_LOG_CONTRACT } from './standard-user-stage-log-contract.ts';
