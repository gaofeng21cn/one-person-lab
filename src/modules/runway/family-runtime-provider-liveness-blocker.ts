import type { FamilyRuntimeProviderInspection } from './family-runtime-providers.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function temporalWorkerReadiness(provider: FamilyRuntimeProviderInspection) {
  return record(record(provider.details).worker_readiness);
}

function temporalServiceLifecycle(readiness: JsonRecord) {
  return record(readiness.temporal_service_lifecycle);
}

function workerRepairAction(readiness: JsonRecord) {
  return record(readiness.repair_action);
}

function workerLivenessBlocker(provider: FamilyRuntimeProviderInspection) {
  const readiness = temporalWorkerReadiness(provider);
  const lifecycleStatus = stringValue(readiness.lifecycle_status)
    ?? stringValue(readiness.readiness_status);
  const repairAction = workerRepairAction(readiness);
  const repairActionId = stringValue(repairAction.action_id);
  const nextRepairCommand = stringValue(repairAction.next_command);
  if (!lifecycleStatus || !repairActionId || repairActionId === 'none') {
    return null;
  }
  const service = temporalServiceLifecycle(readiness);
  return {
    blocker_kind: 'platform_dependency',
    blocker_id: provider.degraded_reason ?? `temporal_${lifecycleStatus}`,
    next_repair_command: nextRepairCommand,
    next_repair_action: repairAction,
    worker_lifecycle_status: lifecycleStatus,
    temporal_service_status: stringValue(service.service_status),
    temporal_server_reachable: readiness.server_reachable === true,
    liveness_blocker_first: true,
  };
}

function genericTemporalBlocker(provider: FamilyRuntimeProviderInspection) {
  return {
    blocker_kind: 'platform_dependency',
    blocker_id: provider.degraded_reason ?? 'temporal_provider_not_ready',
    next_repair_command:
      'opl family-runtime service start --provider temporal && opl family-runtime worker start --provider temporal',
    liveness_blocker_first: false,
  };
}

export function buildTemporalProviderLivenessBlocker(provider: FamilyRuntimeProviderInspection) {
  return workerLivenessBlocker(provider) ?? genericTemporalBlocker(provider);
}

export function isTemporalWorkerLivenessBlocker(blocker: JsonRecord) {
  const workerStatus = stringValue(blocker.worker_lifecycle_status);
  return (
    workerStatus === 'worker_not_ready'
    || workerStatus === 'worker_source_stale'
    || workerStatus === 'worker_dependency_unavailable'
  );
}
