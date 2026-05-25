import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';
import { record, recordList, stringValue, uniqueRefs } from './value-utils.ts';

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'provider_worker_lifecycle_safe_action_shell',
    provider: 'temporal_worker_lifecycle_owner',
    can_install_domain_daemon: false,
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
  };
}

function workerReadinessFromProviderInspection(providerInspection: JsonRecord | undefined) {
  return record(record(record(providerInspection).details).worker_readiness);
}

function workerReadinessFromStageWorkbench(stageAttemptWorkbench: JsonRecord) {
  const attempts = [
    ...recordList(record(record(stageAttemptWorkbench.summary).observability_slo).attempts),
    ...recordList(stageAttemptWorkbench.evidence_attempts),
    ...recordList(stageAttemptWorkbench.attempts),
  ];
  for (const attempt of attempts) {
    const readiness = record(record(record(attempt.current_provider_readiness).details).worker_readiness);
    if (Object.keys(readiness).length > 0) {
      return readiness;
    }
    const sloReadiness = record(record(record(record(attempt.observability_slo).provider_readiness).details).worker_readiness);
    if (Object.keys(sloReadiness).length > 0) {
      return sloReadiness;
    }
    const summaryReadiness = record(record(record(attempt.provider_readiness).details).worker_readiness);
    if (Object.keys(summaryReadiness).length > 0) {
      return summaryReadiness;
    }
  }
  return {};
}

export function buildProviderWorkerActionRoutes(input: {
  stageAttemptWorkbench: JsonRecord;
  providerInspection?: JsonRecord;
}) {
  const providerReadiness = workerReadinessFromProviderInspection(input.providerInspection);
  const readiness = Object.keys(providerReadiness).length > 0 ? providerReadiness
    : workerReadinessFromStageWorkbench(input.stageAttemptWorkbench);
  const lifecycleStatus = stringValue(readiness.lifecycle_status)
    ?? stringValue(readiness.readiness_status);
  const repairAction = record(readiness.repair_action);
  const repairActionId = stringValue(repairAction.action_id);
  if (lifecycleStatus !== 'worker_source_stale' || repairActionId !== 'restart_temporal_worker') {
    return [];
  }
  return uniqueRefs([{
    ref: 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
    opl_cli_args: ['worker', 'repair', '--provider', 'temporal', '--action', 'restart'],
    role: 'operator_action_route',
    action_id: 'provider-worker:temporal:restart',
    action_kind: 'provider_worker_restart',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    stage_attempt_id: null,
    domain_id: null,
    stage_id: null,
    provider_kind: 'temporal',
    provider_worker_lifecycle_status: lifecycleStatus,
    provider_worker_repair_action_id: repairActionId,
    provider_worker_repair_command: stringValue(repairAction.next_command),
    provider_worker_required_next_action:
      'Restart stale Temporal worker before rerunning provider proof or provider-backed Codex stages.',
    expected_surface_kind: 'temporal_worker_lifecycle_start',
    can_execute: false as const,
    authority_boundary: refsOnlyAuthorityBoundary(),
  }]);
}
