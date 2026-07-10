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
export { buildFamilyStageAdmissionReview } from './family-stage-admission.ts';
export type { FamilyStageAdmissionReview, FamilyStageAdmissionStageResult } from './family-stage-admission.ts';
export type { FamilyStageDomainManifest, FamilyStageDomainManifestCatalog, FamilyStageDomainManifestCatalogEntry, ManifestCommandTimeoutPolicy } from './family-stage-domain-manifest.ts';
export { buildFamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
export type { FamilyStageCohortLoopStage } from './family-stage-cohort-loop.ts';
export { buildFamilyActionStageRouteParity } from './family-action-stage-route.ts';
export { buildFamilyStageControlPlaneParity, buildFamilyStageLaunchAdmissionGate, buildFamilyStageReadinessInspect, buildFamilyStagesList } from './family-stage-control-plane.ts';
export { normalizeFamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
export type { FamilyStageControlPlane, FamilyStageDescriptor, FamilyStageSurfaceRef } from './family-stage-control-plane-contract.ts';
export { buildFamilyStageProofBundle } from './family-stage-proof-bundle.ts';
export { buildFamilyStageRuntimeBudgetProjection } from './family-stage-runtime-budget.ts';
export { adaptDomainTransitionOracleToFamilyTransitionSpec, adaptGrantTransitionOracleToFamilyTransitionSpec, buildDomainTransitionOracleMatrixCases, buildGrantTransitionOracleMatrixCases, normalizeDomainTransitionOracle, normalizeGrantTransitionOracle } from './family-transition-oracle-ingestion.ts';
export type { DomainTransitionOracle, DomainTransitionOracleSurfaceKind, GrantTransitionOracle } from './family-transition-oracle-ingestion.ts';
export { runFamilyTransitionMatrix } from './family-transition-runner.ts';
export type { FamilyTransitionInput, FamilyTransitionMatrixCase, FamilyTransitionMatrixResult, FamilyTransitionResult, FamilyTransitionSpec } from './family-transition-runner.ts';
export { buildStagecraftDomainProfileRegistryReadback } from './domain-profile-registry.ts';
export { adaptVisualTransitionSpecToFamilyTransitionSpec, buildVisualTransitionAdapterProfileRegistryReadback, buildVisualTransitionMatrixCases, normalizeVisualTransitionAdapterProfileRegistry, normalizeVisualTransitionSpec, resolveVisualTransitionAdapterProfile } from './family-transition-visual-ingestion.ts';
export type { VisualTransitionAdapterProfile, VisualTransitionAdapterProfileRegistryEntry, VisualTransitionSpec } from './family-transition-visual-ingestion.ts';
export { commitStageArtifactAttemptRuntime, conformanceStageArtifactRuntime, explainStageArtifactRuntime, gcStageArtifactRuntime, openStageArtifactAttemptRuntime, promoteStageArtifactRuntime, rebuildStageArtifactRuntime, restoreStageArtifactRuntime, statusStageArtifactRuntime, validateStageArtifactRuntime, workbenchStageArtifactRuntime } from './stage-artifact-runtime.ts';
export { assertStageProductionEvidencePayloadReady, buildStageProductionEvidencePayloadWorkorder, preflightStageProductionEvidencePayload, STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS } from './stage-production-evidence-payload-preflight.ts';
export { stageReplayMissingReceiptTargetKey } from './stage-replay-missing-receipt-ledger.ts';
export type { StageReplayMissingReceiptReceipt } from './stage-replay-missing-receipt-ledger.ts';
export { buildStageReplayMissingReceiptWorkorderPacket, compactStageReplayMissingReceiptWorkorderAttentionItems, compactStageReplayMissingReceiptWorkorderAttentionSummary } from './stage-replay-missing-receipt-workorders.ts';
export { listStageRunExecutionAuthorizationReceipts, recordStageRunExecutionAuthorizationReceipts } from './stage-run-execution-authorization-ledger.ts';
export { buildAppStageRunCockpit } from './stage-run-cockpit.ts';
export { buildStageRunCycleIdentity, buildStageRunCycleManifestFromControlPlane, reduceStageRunCycleState, STAGE_RUN_CANONICAL_LAUNCH_OWNER, STAGE_RUN_CANONICAL_RUNNER_REF, STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY } from './stage-run-orchestration.ts';
export type { StageRunControlPlaneManifestInput, StageRunCycleEvent, StageRunCycleIdentity, StageRunCycleIdentityInput, StageRunCycleManifest, StageRunCycleState, StageRunEffectObservation, StageRunRouteDecision } from './stage-run-orchestration.ts';
export { buildOwnerAnswerProjectionProfileRegistryReadback, findOwnerAnswerProjection, MEDAUTOSCIENCE_PUBLICATION_HANDOFF_OWNER_ANSWER_COMPATIBILITY_PROFILE, OWNER_ANSWER_PROJECTION_PROFILE_REGISTRY } from './mas-owner-answer-projection.ts';
export type { OwnerAnswerProjectionProfile } from './mas-owner-answer-projection.ts';
export { STANDARD_PROGRESS_DELTA_POLICY } from './standard-progress-delta-policy.ts';
export {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
} from './standard-stage-pack-identity.ts';
export { STANDARD_STAGE_COMPLETION_POLICY } from './standard-stage-completion-policy.ts';
export { STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from './standard-typed-blocker-lineage-policy.ts';
export { STANDARD_USER_STAGE_LOG_CONTRACT } from './standard-user-stage-log-contract.ts';
