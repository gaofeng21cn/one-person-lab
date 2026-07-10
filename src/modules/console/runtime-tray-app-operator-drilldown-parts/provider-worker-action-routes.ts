import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';
import {
  buildOperatorActionRoute,
  record,
  recordList,
  stringValue,
  uniqueRefs,
} from './value-utils.ts';

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

function actionableRepair(readiness: JsonRecord) {
  const lifecycleStatus = stringValue(readiness.lifecycle_status)
    ?? stringValue(readiness.readiness_status);
  const repairActionId = stringValue(record(readiness.repair_action).action_id);
  return (
    (lifecycleStatus === 'worker_not_ready' && repairActionId === 'start_temporal_worker')
    || (
      (lifecycleStatus === 'worker_source_stale' || lifecycleStatus === 'duplicate_worker')
      && repairActionId === 'restart_temporal_worker'
    )
  );
}

function mutationGuardRouteBlock(readiness: JsonRecord) {
  const mutationGuard = record(readiness.worker_mutation_guard);
  if (stringValue(mutationGuard.mutation_guard_status) !== 'blocked_developer_checkout_shared_state') {
    return {};
  }
  return {
    route_status: 'blocked_by_provider_worker_mutation_guard',
    route_status_detail:
      'Run the managed runtime/current OPL CLI, set OPL_STATE_DIR for an isolated developer worker, explicitly enable OPL Developer Mode developer_apply_safe, or set OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER=1.',
    default_actionable: false,
    default_actionability_status: 'blocked_by_provider_worker_mutation_guard',
    provider_worker_mutation_guard: mutationGuard,
    can_submit_to_safe_action_shell: false,
  };
}

export function buildProviderWorkerActionRoutes(input: {
  stageAttemptWorkbench: JsonRecord;
  providerInspection?: JsonRecord;
}) {
  const providerReadiness = workerReadinessFromProviderInspection(input.providerInspection);
  const stageWorkbenchReadiness = workerReadinessFromStageWorkbench(input.stageAttemptWorkbench);
  const readiness = actionableRepair(providerReadiness) || !actionableRepair(stageWorkbenchReadiness)
    ? providerReadiness
    : stageWorkbenchReadiness;
  const lifecycleStatus = stringValue(readiness.lifecycle_status)
    ?? stringValue(readiness.readiness_status);
  const repairAction = record(readiness.repair_action);
  const repairActionId = stringValue(repairAction.action_id);
  const routeBlock = mutationGuardRouteBlock(readiness);
  if (lifecycleStatus === 'worker_not_ready' && repairActionId === 'start_temporal_worker') {
    const args = ['worker', 'start', '--provider', 'temporal'];
    return uniqueRefs([buildOperatorActionRoute(args, {
      action_id: 'provider-worker:temporal:start',
      action_kind: 'provider_worker_start',
      provider_kind: 'temporal',
      provider_worker_lifecycle_status: lifecycleStatus,
      provider_worker_repair_action_id: repairActionId,
      provider_worker_repair_command: stringValue(repairAction.next_command),
      provider_worker_required_next_action:
        'Start Temporal worker before rerunning provider proof or provider-backed Codex stages.',
      expected_surface_kind: 'temporal_worker_lifecycle_start',
      ...routeBlock,
      authority_boundary: refsOnlyAuthorityBoundary(),
    }, 'opl family-runtime worker start --provider temporal')]);
  }
  if (
    (lifecycleStatus !== 'worker_source_stale' && lifecycleStatus !== 'duplicate_worker')
    || repairActionId !== 'restart_temporal_worker'
  ) {
    return [];
  }
  const args = ['repair', '--provider', 'temporal'];
  return uniqueRefs([buildOperatorActionRoute(args, {
    action_id: 'provider-worker:temporal:restart',
    action_kind: 'provider_worker_restart',
    provider_kind: 'temporal',
    provider_worker_lifecycle_status: lifecycleStatus,
    provider_worker_repair_action_id: repairActionId,
    provider_worker_repair_command: stringValue(repairAction.next_command),
    provider_worker_required_next_action:
      lifecycleStatus === 'duplicate_worker'
        ? 'Run supervisor-aware Temporal worker repair to collapse duplicate foreground workers before rerunning provider proof or provider-backed Codex stages.'
        : 'Run supervisor-aware Temporal worker repair before rerunning provider proof or provider-backed Codex stages.',
    expected_surface_kind: 'temporal_worker_lifecycle_start',
    ...routeBlock,
    authority_boundary: refsOnlyAuthorityBoundary(),
  }, 'opl family-runtime repair --provider temporal')]);
}
