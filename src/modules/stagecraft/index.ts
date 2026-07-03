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
export { FamilyStageAdmissionReview, FamilyStageAdmissionStageResult, buildFamilyStageAdmissionReview } from './family-stage-admission.ts';
export { FamilyStageCohortLoopStage, buildFamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
export { buildFamilyStageControlPlaneParity, buildFamilyStageLaunchAdmissionGate, buildFamilyStageReadinessInspect, buildFamilyStagesList } from './family-stage-control-plane.ts';
export { FamilyStageControlPlane, FamilyStageDescriptor, FamilyStageSurfaceRef, normalizeFamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
export { buildFamilyStageProofBundle } from './family-stage-proof-bundle.ts';
export { buildFamilyStageRuntimeBudgetProjection } from './family-stage-runtime-budget.ts';
export { GrantTransitionOracle, adaptGrantTransitionOracleToFamilyTransitionSpec, buildGrantTransitionOracleMatrixCases, normalizeGrantTransitionOracle } from './family-transition-oracle-ingestion.ts';
export { FamilyTransitionInput, FamilyTransitionMatrixCase, FamilyTransitionMatrixResult, FamilyTransitionResult, FamilyTransitionSpec, runFamilyTransitionMatrix } from './family-transition-runner.ts';
export { VisualTransitionSpec, adaptVisualTransitionSpecToFamilyTransitionSpec, buildVisualTransitionMatrixCases, normalizeVisualTransitionSpec } from './family-transition-visual-ingestion.ts';
export { commitStageArtifactAttemptRuntime, conformanceStageArtifactRuntime, explainStageArtifactRuntime, gcStageArtifactRuntime, openStageArtifactAttemptRuntime, promoteStageArtifactRuntime, rebuildStageArtifactRuntime, restoreStageArtifactRuntime, statusStageArtifactRuntime, validateStageArtifactRuntime, workbenchStageArtifactRuntime } from './stage-artifact-runtime.ts';
export { STAGE_PRODUCTION_EVIDENCE_COVERAGE_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_OPTIONAL_PAYLOAD_REFS, STAGE_PRODUCTION_EVIDENCE_REQUIRED_PAYLOAD_REFS, assertStageProductionEvidencePayloadReady, buildStageProductionEvidencePayloadWorkorder, preflightStageProductionEvidencePayload } from './stage-production-evidence-payload-preflight.ts';
export { StageReplayMissingReceiptReceipt, listStageReplayMissingReceiptReceipts, stageReplayMissingReceiptTargetKey } from './stage-replay-missing-receipt-ledger.ts';
export { StageRunExecutionAuthorizationReceipt, latestStageRunExecutionAuthorizationCloseoutReceiptForStageAttempt, latestStageRunExecutionAuthorizationCloseoutReceiptForStageRun, latestStageRunExecutionAuthorizationReceiptForStageAttempt, latestStageRunExecutionAuthorizationReceiptForStageAttemptAnyRun, latestStageRunExecutionAuthorizationReceiptForStageRun, listStageRunExecutionAuthorizationReceipts, recordStageRunExecutionAuthorizationReceipts } from './stage-run-execution-authorization-ledger.ts';
export { evaluateStageRunAdmission, evaluateStageRunExecutionAuthorization } from './stage-run-kernel.ts';
