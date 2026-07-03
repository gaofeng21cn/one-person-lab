export const OPL_STAGECRAFT_SOURCE_MODULE = {
  moduleId: 'stagecraft',
  brandName: 'OPL Stagecraft',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.stagecraft',
  physicalRoot: 'src/modules/stagecraft',
} as const;

// Public cross-module surface generated from existing module consumers.
export { buildStageAttemptCloseoutRefsOnlyContract, buildStageAttemptLaunchEnvelope, cognitiveKernelBoundary } from './cognitive-kernel-boundary.ts';
export { buildDuplicateTaskEnvelope, buildFamilyConflictOrBlockerEnvelope, buildFamilyConflictSubject, buildReceiptConflictEnvelope, buildStageAttemptConflictOrBlockerEnvelopes, canonicalOutcomeForStageAttempt } from './family-conflict-envelope.ts';
export { buildAttemptHumanReviewBurdenBudget, buildFamilyHumanReviewBurdenBudget } from './family-human-review-budget.ts';
export { buildFamilyStageAdmissionReview } from './family-stage-admission.ts';
export type { FamilyStageAdmissionReview, FamilyStageAdmissionStageResult } from './family-stage-admission.ts';
export { buildFamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
export type { FamilyStageCohortLoopStage } from './family-stage-cohort-loop.ts';
export { buildFamilyStageControlPlaneParity, buildFamilyStageLaunchAdmissionGate, buildFamilyStageReadinessInspect, buildFamilyStagesList } from './family-stage-control-plane.ts';
export { normalizeFamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
export type { FamilyStageControlPlane, FamilyStageDescriptor, FamilyStageSurfaceRef } from './family-stage-control-plane-contract.ts';
export { buildFamilyStageProofBundle } from './family-stage-proof-bundle.ts';
export { buildFamilyStageRuntimeBudgetProjection } from './family-stage-runtime-budget.ts';
export { adaptGrantTransitionOracleToFamilyTransitionSpec, buildGrantTransitionOracleMatrixCases, normalizeGrantTransitionOracle } from './family-transition-oracle-ingestion.ts';
export type { GrantTransitionOracle } from './family-transition-oracle-ingestion.ts';
export { runFamilyTransitionMatrix } from './family-transition-runner.ts';
export type { FamilyTransitionInput, FamilyTransitionMatrixCase, FamilyTransitionMatrixResult, FamilyTransitionResult, FamilyTransitionSpec } from './family-transition-runner.ts';
export { adaptVisualTransitionSpecToFamilyTransitionSpec, buildVisualTransitionMatrixCases, normalizeVisualTransitionSpec } from './family-transition-visual-ingestion.ts';
export type { VisualTransitionSpec } from './family-transition-visual-ingestion.ts';
export { commitStageArtifactAttemptRuntime, conformanceStageArtifactRuntime, explainStageArtifactRuntime, gcStageArtifactRuntime, openStageArtifactAttemptRuntime, promoteStageArtifactRuntime, rebuildStageArtifactRuntime, restoreStageArtifactRuntime, statusStageArtifactRuntime, validateStageArtifactRuntime, workbenchStageArtifactRuntime } from './stage-artifact-runtime.ts';
export { assertStageProductionEvidencePayloadReady, buildStageProductionEvidencePayloadWorkorder, preflightStageProductionEvidencePayload, STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS } from './stage-production-evidence-payload-preflight.ts';
export { listStageReplayMissingReceiptReceipts, stageReplayMissingReceiptTargetKey } from './stage-replay-missing-receipt-ledger.ts';
export type { StageReplayMissingReceiptReceipt } from './stage-replay-missing-receipt-ledger.ts';
export { latestStageRunExecutionAuthorizationCloseoutReceiptForStageAttempt, latestStageRunExecutionAuthorizationCloseoutReceiptForStageRun, latestStageRunExecutionAuthorizationReceiptForStageAttempt, latestStageRunExecutionAuthorizationReceiptForStageAttemptAnyRun, latestStageRunExecutionAuthorizationReceiptForStageRun, listStageRunExecutionAuthorizationReceipts, recordStageRunExecutionAuthorizationReceipts } from './stage-run-execution-authorization-ledger.ts';
export type { StageRunExecutionAuthorizationReceipt } from './stage-run-execution-authorization-ledger.ts';
export { buildAppStageRunCockpit } from './stage-run-cockpit.ts';
export { findMasPublicationHandoffOwnerAnswerProjection } from './mas-owner-answer-projection.ts';
export { evaluateStageRunAdmission, evaluateStageRunExecutionAuthorization } from './stage-run-kernel.ts';
