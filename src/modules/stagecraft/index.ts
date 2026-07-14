export const OPL_STAGECRAFT_SOURCE_MODULE = {
  moduleId: 'stagecraft',
  brandName: 'OPL Stagecraft',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.stagecraft',
  physicalRoot: 'src/modules/stagecraft',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildEvidenceGroundedStagecraftProfilePolicyReadback } from './evidence-grounded-decision-agent-profile.ts';
export { buildStageAttemptCloseoutRefsOnlyContract, buildStageAttemptLaunchEnvelope, cognitiveKernelBoundary } from './cognitive-kernel-boundary.ts';
export { buildDuplicateTaskEnvelope, buildFamilyConflictOrBlockerEnvelope, buildFamilyConflictSubject, buildReceiptConflictEnvelope, buildStageAttemptConflictOrBlockerEnvelopes, canonicalOutcomeForStageAttempt } from './family-conflict-envelope.ts';
export { buildAttemptHumanReviewBurdenBudget, buildFamilyHumanReviewBurdenBudget } from './family-human-review-budget.ts';
export { buildFamilyStageConformanceReview } from './family-stage-conformance.ts';
export type { FamilyStageConformanceReview, FamilyStageConformanceStageResult } from './family-stage-conformance.ts';
export type { FamilyStageDomainManifest, FamilyStageDomainManifestCatalog, FamilyStageDomainManifestCatalogEntry, ManifestCommandTimeoutPolicy } from './family-stage-domain-manifest.ts';
export { buildFamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
export type { FamilyStageCohortLoopStage } from './family-stage-cohort-loop.ts';
export { buildFamilyActionStageRouteParity } from './family-action-stage-route.ts';
export { buildFamilyStageContextObservation, buildFamilyStageControlPlaneParity, buildFamilyStageReadinessInspect, buildFamilyStagesList } from './family-stage-control-plane.ts';
export { normalizeFamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
export type { FamilyStageControlPlane, FamilyStageDescriptor, FamilyStageSurfaceRef } from './family-stage-control-plane-contract.ts';
export { buildFamilyStageProofBundle } from './family-stage-proof-bundle.ts';
export { buildFamilyStageRuntimeBudgetProjection } from './family-stage-runtime-budget.ts';
export { buildStagecraftDomainProfileRegistryReadback } from './domain-profile-registry.ts';
export { commitStageArtifactAttemptRuntime, conformanceStageArtifactRuntime, explainStageArtifactRuntime, gcStageArtifactRuntime, openStageArtifactAttemptRuntime, promoteStageArtifactRuntime, rebuildStageArtifactRuntime, restoreStageArtifactRuntime, statusStageArtifactRuntime, validateStageArtifactRuntime, workbenchStageArtifactRuntime } from './stage-artifact-runtime.ts';
export { buildDirectoryArtifactIndex, buildDomainArtifactIndex, readDomainArtifact, writeDomainArtifact } from './domain-artifact-runtime.ts';
export type { DomainArtifactRole } from './domain-artifact-runtime.ts';
export { assertStageProductionEvidencePayloadReady, buildStageProductionEvidencePayloadWorkorder, preflightStageProductionEvidencePayload, STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS } from './stage-production-evidence-payload-preflight.ts';
export { stageReplayMissingReceiptTargetKey } from './stage-replay-missing-receipt-ledger.ts';
export type { StageReplayMissingReceiptReceipt } from './stage-replay-missing-receipt-ledger.ts';
export { buildStageReplayMissingReceiptWorkorderPacket, compactStageReplayMissingReceiptWorkorderAttentionItems, compactStageReplayMissingReceiptWorkorderAttentionSummary } from './stage-replay-missing-receipt-workorders.ts';
export { buildAppStageRunCockpit } from './stage-run-cockpit.ts';
export { buildOwnerAnswerProjectionProfileRegistryReadback } from './domain-owner-answer-projection.ts';
export {
  buildStageReviewContextManifest,
  classifyStageQualityReReviewBudget,
  classifyCodexSessionContinuation,
  evaluateStageQualityFindingClosure,
  initialStageQualityCycleState,
  normalizeStageQualityAttemptRole,
  normalizeStageQualityArtifactIdentity,
  normalizeStageQualityCyclePolicy,
  normalizeStageQualityOutcome,
  reduceStageQualityCycleState,
  STAGE_QUALITY_ATTEMPT_ROLES,
  STAGE_QUALITY_HARD_STOP_CLASSES,
  STAGE_QUALITY_OUTCOMES,
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
  StageQualityOutcome,
  StageQualityRepairMapEntry,
  StageQualityReReviewResult,
  StageQualityReviewDepth,
  StageQualityReviewAttemptRole,
  StageQualityReviewVerdict,
  StageQualityRiskTier,
  StageReviewContextManifest,
  StageReviewReceipt,
} from './stage-quality-cycle.ts';
export {
  assertQualityAttemptTerminalRouteSelection,
  evaluateStageQualityAttemptRoute,
  isRepairRequiredCrossStageRouteBackDecision,
  normalizeDeclaredStageRouteDecision,
  sanitizeStageQualityAttemptRouteImpact,
  STAGE_QUALITY_LEGACY_TERMINAL_ROUTE_FIELDS,
  STAGE_ROUTE_DECISION_KINDS,
} from './stage-quality-route-selection.ts';
export type {
  StageQualityRouteRecommendationRecord,
  StageRouteDecision,
  StageRouteDecisionKind,
  StageRouteRecommendation,
} from './stage-quality-route-selection.ts';
export type { OwnerAnswerProjectionProfile } from './domain-owner-answer-projection.ts';
export { STANDARD_PROGRESS_DELTA_POLICY } from './standard-progress-delta-policy.ts';
export {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
} from './standard-stage-pack-identity.ts';
export { STANDARD_STAGE_COMPLETION_POLICY } from './standard-stage-completion-policy.ts';
export { STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from './standard-typed-blocker-lineage-policy.ts';
export { STANDARD_USER_STAGE_LOG_CONTRACT } from './standard-user-stage-log-contract.ts';
