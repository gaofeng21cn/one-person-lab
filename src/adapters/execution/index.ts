export const OPL_RUNWAY_SOURCE_MODULE = {
  moduleId: 'runway',
  brandName: 'OPL Runway',
  contractRef: 'contracts/opl-framework/source-module-map.json#source_units/framework.adapters.execution',
  physicalRoot: 'src/adapters/execution',
} as const;

export { buildEvidenceGroundedRunwayProfilePolicyReadback } from './evidence-grounded-decision-agent-profile.ts';
export { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
export { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
export {
  assertDomainArtifactCasReadWindowStable,
  observeDomainArtifactCasMaterialization,
} from './domain-artifact-cas-materialization.ts';
export type {
  DomainArtifactCasMaterializationReadObservation,
  DomainArtifactCasReadWindowGuard,
} from './domain-artifact-cas-materialization.ts';
export { buildModelRouteCostProjection, buildStageAttemptUsageProjection } from './family-runtime-stage-attempt-usage.ts';
export { buildStageProgressLog } from './family-runtime-stage-progress-log.ts';
export { buildStageAttemptTruePathProof } from './family-runtime-stage-attempt-true-path-proof.ts';
export { buildEffectiveCurrentContextPacket, buildFamilyStallLineage } from './family-runtime-effective-current-context.ts';
export type { TemporalStageAttemptVisibilityReadiness } from './family-runtime-temporal-visibility.ts';
export { inspectFamilyRuntimeProviderWithLifecycle, isFamilyRuntimeProviderKind, resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
export { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
export { familyRuntimePaths, listEvents } from './family-runtime-store.ts';
export { deriveCurrentControlStateForAttempt } from './family-runtime-current-control-state.ts';
export { latestStageAttemptCloseoutPacketsByAttempt, listStageAttemptRows, stageAttemptSignalsByAttempt } from './family-runtime-stage-attempt-ledger.ts';
export {
  runtimeDomainDaemonReplacementSurfaces,
} from './family-runtime-types.ts';
export type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';
export {
  readManagedProviderProjectionSummary,
} from './family-runtime-managed-provider-projection.ts';
export { readFamilyDomainMemoryRuntimeReceiptEvidenceByDomain } from './family-domain-memory-runtime-receipts.ts';
export { buildOplEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
export { buildProviderContinuousProof } from './family-runtime-provider-continuous-proof.ts';
export { applyProviderClosureEvidence, providerClosureEvidence, providerResidencyGapStatus, readProviderContinuousProof } from './family-domain-agent-provider-closure.ts';
export type { ProviderContinuousProof } from './family-domain-agent-provider-closure.ts';
export { runFamilyRuntimeEvidenceWorklist } from './family-runtime-evidence-worklist.ts';
export { buildDomainRouteSupportProjection } from './family-runtime-domain-route.ts';
export { runFamilyRuntimeLifecycleApply } from './family-runtime-lifecycle-index.ts';
export { buildAttemptGenericProjections, buildWorkbenchGenericProjections } from './stage-attempt-projections/stage-attempt-generic-projections.ts';
export type { StageAttemptGenericProjectionInput } from './stage-attempt-projections/stage-attempt-generic-projections.ts';
export { summarizeMemoryTraceProjections } from './stage-attempt-projections/memory-locator-index.ts';
export type { MemoryTraceProjection } from './stage-attempt-projections/memory-locator-index.ts';

// Public cross-module surface generated from existing module consumers.
export { runAgentExecutor } from './agent-executor.ts';
export type {
  AgentExecutionReceipt,
  AgentExecutionRequest,
} from './agent-executor.ts';
import type {
  AgentExecutionReceipt,
  AgentExecutionRequest,
} from './agent-executor.ts';
export type CordisAgentExecutorService = {
  execute(input: AgentExecutionRequest): Promise<AgentExecutionReceipt>;
};
export {
  runPackNativeHelperExecutionCommand,
} from './pack-native-helper-execution.ts';
export { buildCodexCliPreview, buildCodexExecArgs, parseCodexExecOutput, resolveCodexBinary, runCodexCommand, runCodexCommandStreaming } from './codex.ts';
export type { CodexExecEvent } from './codex.ts';
export { listCodexAppRuntimeEvidenceReceipts } from './codex-app-runtime-evidence-ledger.ts';
export { runFamilyRuntime } from './family-runtime.ts';
export { runAgentStageRunner } from './family-runtime-codex-stage-runner.ts';
export type { CodexStageRunnerInput } from './family-runtime-codex-stage-runner.ts';
export type { AgentExecutorRequestCompositionFactory } from './composition-factory-ports.ts';
export {
  codexStageActivity,
  schedulerTickActivity,
  stageQualityAttemptMaterializeActivity,
  stageRunRouteLaunchActivity,
} from './family-runtime-temporal-activities.ts';
export { buildFoundryTemporalActivities } from './foundry-temporal-activities.ts';
export { createProductionFoundryKernel } from './foundry-production-runtime.ts';
export {
  reconcileTemporalRuntimeStartupMaintenance,
  type TemporalStartupMaintenanceRuntime,
} from './family-runtime-temporal-startup-maintenance.ts';
export { runStandardAgentAction } from './standard-agent-action-runtime.ts';
export {
  DefaultHostedAgentRuntimeBindingResolver,
} from './hosted-agent-runtime-binding.ts';
export { HostedFoundryActivationRuntime } from './foundry-activation-runtime.ts';
export { readFamilyRuntimeLifecycleApplyReceipts, readFamilyRuntimeLifecycleRefs, reconcileFamilyRuntimeLifecycleRefs } from './family-runtime-lifecycle-index.ts';
export { providerProofStatusIsCurrentlyProven } from './family-runtime-provider-continuous-proof.ts';
export { inspectFamilyRuntimeProvider, inspectSelectedFamilyRuntimeProvidersWithLifecycle } from './family-runtime-providers.ts';
export { summarizeModelRouteCostProjections, summarizeStageAttemptUsageProjections } from './family-runtime-stage-attempt-usage.ts';
export type { ModelRouteCostProjection, StageAttemptUsageProjection } from './family-runtime-stage-attempt-usage.ts';
export { summarizeStageProgressLogs } from './family-runtime-stage-progress-log.ts';
export type { StageProgressLogProjection } from './family-runtime-stage-progress-log.ts';
export { buildNativeHelperHealthStatus, runNativeHelperRepairAction } from './native-helper-runtime.ts';
export { buildNativeIndexSummary } from './native-index-summary.ts';
export type { OplEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
export { buildOplRuntimeEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
export { buildRuntimeEnvironmentPrepareReadback, buildRuntimeEnvironmentRunContextReadback } from './runtime-environment-substrate.ts';
export {
  RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION,
  RUNTIME_ENVIRONMENT_PROVIDER_IDS,
  resolveRuntimeEnvironmentProvider,
  resolveRuntimeEnvironmentProviderId,
  runtimeEnvironmentProviderContract,
  runtimeEnvironmentProviderFor,
} from './runtime-environment-provider.ts';
export type {
  RuntimeEnvironmentProvider,
  RuntimeEnvironmentProviderExecutionInput,
  RuntimeEnvironmentProviderId,
  RuntimeEnvironmentProviderReadback,
} from './runtime-environment-provider.ts';
export { buildRuntimeManager, runRuntimeManagerAction } from './runtime-manager.ts';
export { runRuntimeOperatorActionExecute } from './runtime-operator-action-execution.ts';
export { requireRuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';
export type { RuntimeTraySnapshotProvider } from './runtime-tray-snapshot-provider.ts';
export { buildSessionLedger, recordSessionLedgerEntry } from './session-ledger.ts';
