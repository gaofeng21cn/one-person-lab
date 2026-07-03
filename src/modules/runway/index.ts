export const OPL_RUNWAY_SOURCE_MODULE = {
  moduleId: 'runway',
  brandName: 'OPL Runway',
  contractRef: 'contracts/opl-framework/source-module-map.json#modules.runway',
  physicalRoot: 'src/modules/runway',
} as const;

export { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
export { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
export { stableId } from './family-runtime-ids.ts';
export { buildModelRouteCostProjection, buildStageAttemptUsageProjection } from './family-runtime-stage-attempt-usage.ts';
export { buildStageProgressLog } from './family-runtime-stage-progress-log.ts';
export { buildStageAttemptTruePathProof } from './family-runtime-stage-attempt-true-path-proof.ts';
export { buildEffectiveCurrentContextPacket, buildFamilyStallLineage } from './family-runtime-effective-current-context.ts';
export type { TemporalStageAttemptVisibilityReadiness } from './family-runtime-temporal-visibility.ts';
export { inspectFamilyRuntimeProviderWithLifecycle, isFamilyRuntimeProviderKind, resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
export { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
export { familyRuntimePaths, listEvents } from './family-runtime-store.ts';
export { resolveOplStatePaths, ensureOplStateDir, type OplStatePaths } from './runtime-state-paths.ts';
export { deriveCurrentControlStateForAttempt, deriveCurrentControlStateForTask } from './family-runtime-current-control-state.ts';
export { latestStageAttemptCloseoutPacketsByAttempt, listStageAttemptRows, stageAttemptSignalsByAttempt } from './family-runtime-stage-attempt-ledger.ts';
export type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';
export { readMasManagedProviderProjection, projectionFromMasManifestEntry } from './family-runtime-mas-managed-provider-projection.ts';
export { buildOplEndpoints } from './opl-runtime-paths.ts';
export { buildProviderContinuousProof } from './family-runtime-provider-continuous-proof.ts';
export { runFamilyRuntimeEvidenceWorklist } from './family-runtime-evidence-worklist.ts';
export { buildMasDomainRouteSupportProjection } from './family-runtime-mas-domain-route.ts';
export { runFamilyRuntimeLifecycleApply, type LifecycleApplyMode } from './family-runtime-lifecycle-index.ts';
export { buildStageReplayMissingReceiptWorkorderPacket } from './family-runtime-evidence-worklist-parts/stage-replay-missing-receipt-workorders.ts';
