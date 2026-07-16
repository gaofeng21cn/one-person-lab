export const OPL_RUNWAY_SOURCE_MODULE = {
  moduleId: 'runway',
  brandName: 'OPL Runway',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.runway',
  physicalRoot: 'src/modules/runway',
} as const;

export { buildEvidenceGroundedRunwayProfilePolicyReadback } from './evidence-grounded-decision-agent-profile.ts';
export { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
export { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
export { buildModelRouteCostProjection, buildStageAttemptUsageProjection } from './family-runtime-stage-attempt-usage.ts';
export {
  executorUsageObservationFromCostSummary,
  persistStageAttemptUsageObservation,
} from './family-runtime-stage-attempt-usage-observation.ts';
export type { ExecutorUsageObservation, TokenUsageTotals } from './family-runtime-codex-session-usage.ts';
export { buildStageProgressLog } from './family-runtime-stage-progress-log.ts';
export { buildStageAttemptTruePathProof } from './family-runtime-stage-attempt-true-path-proof.ts';
export { buildStageAttemptRuntimeCurrentness } from './family-runtime-stage-attempt-runtime-currentness.ts';
export { buildEffectiveCurrentContextPacket, buildFamilyStallLineage } from './family-runtime-effective-current-context.ts';
export type { TemporalStageAttemptVisibilityReadiness } from './family-runtime-temporal-visibility.ts';
export { inspectFamilyRuntimeProviderWithLifecycle, isFamilyRuntimeProviderKind, resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
export { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
export { familyRuntimePaths, listEvents } from './family-runtime-store.ts';
export { resolveOplStatePaths } from './runtime-state-paths.ts';
export { deriveCurrentControlStateForAttempt, deriveCurrentControlStateForTask } from './family-runtime-current-control-state.ts';
export { latestStageAttemptCloseoutPacketsByAttempt, listStageAttemptRows, stageAttemptSignalsByAttempt } from './family-runtime-stage-attempt-ledger.ts';
export {
  runtimeDomainDaemonReplacementSurfaces,
} from './family-runtime-types.ts';
export type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';
export {
  projectionFromDomainManifestEntry,
  readManagedProviderProjectionSummary,
} from './family-runtime-managed-provider-projection.ts';
export { readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain } from './family-domain-memory-runtime-receipts.ts';
export { buildOplEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
export { buildProviderContinuousProof } from './family-runtime-provider-continuous-proof.ts';
export { applyProviderClosureEvidence, providerClosureEvidence, providerResidencyGapStatus, readProviderContinuousProof } from './family-domain-agent-provider-closure.ts';
export type { ProviderContinuousProof } from './family-domain-agent-provider-closure.ts';
export { runFamilyRuntimeEvidenceWorklist } from './family-runtime-evidence-worklist.ts';
export { buildDomainRouteSupportProjection } from './family-runtime-domain-route.ts';
export { runFamilyRuntimeLifecycleApply, type LifecycleApplyMode } from './family-runtime-lifecycle-index.ts';
export { buildAttemptGenericProjections, buildWorkbenchGenericProjections } from './stage-attempt-projections/stage-attempt-generic-projections.ts';
export type { StageAttemptGenericProjectionInput } from './stage-attempt-projections/stage-attempt-generic-projections.ts';
export { buildMemoryTraceProjection, summarizeMemoryTraceProjections } from './stage-attempt-projections/memory-locator-index.ts';
export type { MemoryTraceProjection } from './stage-attempt-projections/memory-locator-index.ts';

// Public cross-module surface generated from existing module consumers.
export { runAgentExecutor } from './agent-executor.ts';
export { appendDomainRunEvent, createDomainRunRecord, dispatchDomainAction, executeDomainTask, readDomainRunEvents, runDomainCodexPrompt } from './domain-task-runtime.ts';
export type { DomainActionHandler, DomainCodexPromptRunner, DomainRunIdentity } from './domain-task-runtime.ts';
export { resolveDomainPythonCommand, runDomainPythonHelper } from './domain-helper-runtime.ts';
export {
  PACK_NATIVE_HELPER_EXECUTION_CONTRACT_REF,
  runPackNativeHelper,
  runPackNativeHelperExecutionCommand,
} from './pack-native-helper-execution.ts';
export type { DomainHelperCommand } from './domain-helper-runtime.ts';
export { buildCodexCliPreview, buildCodexExecArgs, parseCodexExecOutput, resolveCodexBinary, runCodexCommand, runCodexCommandStreaming } from './codex.ts';
export type { CodexExecEvent } from './codex.ts';
export { listCodexAppRuntimeEvidenceReceipts } from './codex-app-runtime-evidence-ledger.ts';
export { runFamilyRuntime } from './family-runtime.ts';
export { runStandardAgentAction } from './standard-agent-action-runtime.ts';
export {
  cancelTemporalFoundryRun,
  foundryTemporalWorkflowId,
  queryTemporalFoundryRunWorkflow,
  startTemporalFoundryRunWorkflow,
  submitTemporalFoundryOwnerDecision,
} from './foundry-temporal-control.ts';
export type {
  FoundryCancelUpdate,
  FoundryOwnerDecisionUpdate,
  FoundryRunWorkflowInput,
  FoundryRunWorkflowState,
} from './foundry-temporal.ts';
export { recordStandardAgentActionRunEvent } from './standard-agent-action-run-recorder.ts';
export type { StandardAgentActionRunEventInput } from './standard-agent-action-run-recorder.ts';
export { readFamilyRuntimeLifecycleApplyReceipts, readFamilyRuntimeLifecycleRefs, reconcileFamilyRuntimeLifecycleRefs } from './family-runtime-lifecycle-index.ts';
export { providerProofStatusIsCurrentlyProven } from './family-runtime-provider-continuous-proof.ts';
export { inspectFamilyRuntimeProvider, inspectSelectedFamilyRuntimeProvidersWithLifecycle } from './family-runtime-providers.ts';
export { summarizeModelRouteCostProjections, summarizeStageAttemptUsageProjections } from './family-runtime-stage-attempt-usage.ts';
export type { ModelRouteCostProjection, StageAttemptUsageProjection } from './family-runtime-stage-attempt-usage.ts';
export { listStageAttempts } from './family-runtime-stage-attempts.ts';
export {
  createStageQualityCycle,
  inspectStageQualityCycle,
} from './family-runtime-stage-quality-cycle.ts';
export { requireStageQualityAttemptBoundary } from './family-runtime-stage-quality-attempt-boundary.ts';
export { summarizeStageProgressLogs } from './family-runtime-stage-progress-log.ts';
export type { StageProgressLogProjection } from './family-runtime-stage-progress-log.ts';
export { buildNativeHelperHealthStatus, runNativeHelperRepairAction } from './native-helper-runtime.ts';
export { buildNativeIndexSummary } from './native-index-summary.ts';
export type { OplEndpoints, OplRuntimeEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
export { buildOplRuntimeEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
export { buildRuntimeEnvironmentPrepareReadback, buildRuntimeEnvironmentRunContextReadback } from './runtime-environment-substrate.ts';
export { buildRuntimeManager, runRuntimeManagerAction } from './runtime-manager.ts';
export { runRuntimeOperatorActionExecute } from './runtime-operator-action-execution.ts';
export { requireRuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';
export type { RuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';
export { buildSessionLedger, recordSessionLedgerEntry } from './session-ledger.ts';
