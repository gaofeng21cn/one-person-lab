import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from './family-runtime-command.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import {
  inspectTemporalServiceLifecycle,
  resolveTemporalServiceLauncher,
  startTemporalServiceLifecycle,
  stopTemporalServiceLifecycle,
} from './family-runtime-temporal-service.ts';
import {
  runTemporalServiceSupervisorCommand,
  type TemporalServiceSupervisorRuntime,
} from './family-runtime-temporal-service-supervisor.ts';
import { inspectTemporalServiceSupervisorState } from './family-runtime-temporal-service-supervisor-state.ts';
import { insertEvent, type familyRuntimePaths } from './family-runtime-store.ts';

type TemporalServiceCommandInput = Extract<
  FamilyRuntimeCommandInput,
  { mode: 'service_start' | 'service_status' | 'service_restart' | 'service_stop' }
>;

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;

export type TemporalServiceRestartRuntime = TemporalServiceSupervisorRuntime & {
  inspectService?: (paths: RuntimePaths) => ReturnType<typeof inspectTemporalServiceLifecycle>;
  runSupervisor?: typeof runTemporalServiceSupervisorCommand;
  startService?: typeof startTemporalServiceLifecycle;
  stopService?: typeof stopTemporalServiceLifecycle;
};

function assertTemporalProvider(providerKind: string) {
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime service lifecycle currently supports only --provider temporal.',
      {
        provider_kind: providerKind,
        allowed_provider_kinds: ['temporal'],
      },
    );
  }
}

function restartNotApplicable(
  before: Awaited<ReturnType<typeof inspectTemporalServiceLifecycle>>,
  reason: string,
) {
  return {
    surface_kind: 'temporal_service_lifecycle_restart',
    provider_kind: 'temporal' as const,
    restart_status: 'not_applicable',
    applicable: false,
    ready: before.service_status === 'running' || before.service_status === 'external_running',
    reason,
    previous_supervisor_pid: before.supervisor.pid,
    supervisor_pid: before.supervisor.pid,
    supervisor_pid_changed: null,
    before,
    status: before,
    supervisor_operation: null,
    stop_operation: null,
    start_operation: null,
  };
}

export async function restartTemporalServiceLifecycle(
  db: DatabaseSync,
  paths: RuntimePaths,
  runtime: TemporalServiceRestartRuntime = {},
) {
  const inspectService = runtime.inspectService
    ?? ((runtimePaths: RuntimePaths) => inspectTemporalServiceLifecycle(runtimePaths, runtime));
  const before = await inspectService(paths);

  if (
    before.address_source === 'environment'
    || (
      before.service_status === 'external_running'
      && before.address_source !== 'packaged_local_default'
    )
  ) {
    return restartNotApplicable(before, 'external_service_owned_outside_opl');
  }

  const platform = runtime.platform ?? process.platform;
  if (platform === 'darwin') {
    if (before.supervisor.required !== true) {
      return restartNotApplicable(before, 'local_launcher_not_eligible_for_launchd_supervision');
    }
    if (!before.supervisor.installed || !before.supervisor.configuration_current) {
      return {
        surface_kind: 'temporal_service_lifecycle_restart',
        provider_kind: 'temporal' as const,
        restart_status: 'blocked_supervisor_not_installed',
        applicable: true,
        ready: false,
        reason: 'install_temporal_service_supervisor_first',
        previous_supervisor_pid: before.supervisor.pid,
        supervisor_pid: before.supervisor.pid,
        supervisor_pid_changed: false,
        before,
        status: before,
        supervisor_operation: null,
        stop_operation: null,
        start_operation: null,
      };
    }
    const runSupervisor = runtime.runSupervisor ?? runTemporalServiceSupervisorCommand;
    const supervisorOperation = await runSupervisor(db, paths, 'trigger', runtime);
    const status = await inspectService(paths);
    const previousSupervisorPid = before.supervisor.pid;
    const supervisorPid = status.supervisor.pid;
    const supervisorPidChanged = Number.isInteger(previousSupervisorPid)
      && Number(previousSupervisorPid) > 0
      && Number.isInteger(supervisorPid)
      && Number(supervisorPid) > 0
      && previousSupervisorPid !== supervisorPid;
    const ready = Boolean(
      supervisorOperation.ready
      && status.service_status === 'running'
      && status.server_reachable
      && status.supervisor.required
      && status.supervisor.ready
      && status.supervisor.error === null
      && supervisorPidChanged,
    );
    return {
      surface_kind: 'temporal_service_lifecycle_restart',
      provider_kind: 'temporal' as const,
      restart_status: ready ? 'restarted' : 'restart_unready',
      applicable: true,
      ready,
      reason: ready
        ? null
        : !supervisorPidChanged
          ? 'supervisor_pid_not_replaced'
          : status.supervisor.error ?? supervisorOperation.error ?? 'fresh_readback_unready',
      previous_supervisor_pid: previousSupervisorPid,
      supervisor_pid: supervisorPid,
      supervisor_pid_changed: supervisorPidChanged,
      before,
      status,
      supervisor_operation: supervisorOperation,
      stop_operation: null,
      start_operation: null,
    };
  }

  if (before.address_source !== 'managed_local_service_state') {
    return restartNotApplicable(before, 'no_opl_managed_non_darwin_service');
  }

  const stopService = runtime.stopService ?? stopTemporalServiceLifecycle;
  const startService = runtime.startService ?? startTemporalServiceLifecycle;
  const stopOperation = await stopService(paths);
  if (stopOperation.stop_status === 'stop_timeout') {
    return {
      surface_kind: 'temporal_service_lifecycle_restart',
      provider_kind: 'temporal' as const,
      restart_status: 'blocked_stop_timeout',
      applicable: true,
      ready: false,
      reason: 'managed_service_stop_timeout',
      previous_supervisor_pid: before.supervisor.pid,
      supervisor_pid: before.supervisor.pid,
      supervisor_pid_changed: null,
      before,
      status: await inspectService(paths),
      supervisor_operation: null,
      stop_operation: stopOperation,
      start_operation: null,
    };
  }
  const startOperation = await startService(paths);
  const status = await inspectService(paths);
  const ready = Boolean(
    (startOperation.status.service_status === 'running' || startOperation.status.service_status === 'external_running')
    && (status.service_status === 'running' || status.service_status === 'external_running')
    && status.server_reachable
    && status.supervisor.required === false
    && status.supervisor.error === null,
  );
  return {
    surface_kind: 'temporal_service_lifecycle_restart',
    provider_kind: 'temporal' as const,
    restart_status: ready ? 'restarted' : 'restart_unready',
    applicable: true,
    ready,
    reason: ready ? null : status.supervisor.error ?? 'fresh_readback_unready',
    previous_supervisor_pid: before.supervisor.pid,
    supervisor_pid: status.supervisor.pid,
    supervisor_pid_changed: null,
    before,
    status,
    supervisor_operation: null,
    stop_operation: stopOperation,
    start_operation: startOperation,
  };
}

export async function runTemporalServiceCommand(
  db: DatabaseSync,
  paths: RuntimePaths,
  parsed: TemporalServiceCommandInput,
) {
  const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
  assertTemporalProvider(providerKind);

  if (parsed.supervisorAction) {
    const operation = await runTemporalServiceSupervisorCommand(
      db,
      paths,
      parsed.supervisorAction,
    );
    return {
      version: 'g2',
      family_runtime_service: {
        surface_id: 'opl_family_runtime_service',
        action: `supervisor_${parsed.supervisorAction}`,
        supervisor: operation.supervisor,
        supervisor_operation: operation,
      },
    };
  }

  if (parsed.mode === 'service_status') {
    return {
      version: 'g2',
      family_runtime_service: {
        surface_id: 'opl_family_runtime_service',
        action: 'status',
        ...(await inspectTemporalServiceLifecycle(paths)),
      },
    };
  }

  if (parsed.mode === 'service_start') {
    const before = await inspectTemporalServiceLifecycle(paths);
    const launcher = resolveTemporalServiceLauncher(paths);
    const useSupervisor = process.platform === 'darwin'
      && parsed.detach !== false
      && (
        before.service_status !== 'external_running'
        || before.address_source === 'packaged_local_default'
      )
      && (
        before.service_status !== 'running'
        || before.address_source === 'managed_local_service_state'
      )
      && launcher?.serviceKind === 'temporal_cli';
    const supervisorOperation = useSupervisor
      ? await runTemporalServiceSupervisorCommand(db, paths, 'install')
      : null;
    const result = supervisorOperation
      ? {
          surface_kind: 'temporal_service_lifecycle_start',
          provider_kind: 'temporal' as const,
          start_status: supervisorOperation.ready ? 'started_supervised' : 'supervisor_unready',
          status: await inspectTemporalServiceLifecycle(paths),
          supervisor_operation: supervisorOperation,
        }
      : await startTemporalServiceLifecycle(paths, { detach: parsed.detach });
    insertEvent(db, {
      eventType: 'temporal_service_start',
      source: 'opl-cli',
      payload: {
        service_status: result.status.service_status,
        start_status: result.start_status,
        pid: result.status.managed_service_pid,
      },
    });
    return {
      version: 'g2',
      family_runtime_service: {
        surface_id: 'opl_family_runtime_service',
        action: 'start',
        ...result,
      },
    };
  }

  if (parsed.mode === 'service_restart') {
    const result = await restartTemporalServiceLifecycle(db, paths);
    insertEvent(db, {
      eventType: 'temporal_service_restart',
      source: 'opl-cli',
      payload: {
        restart_status: result.restart_status,
        applicable: result.applicable,
        ready: result.ready,
        reason: result.reason,
        service_status: result.status.service_status,
        supervisor_ready: result.status.supervisor.ready,
      },
    });
    return {
      version: 'g2',
      family_runtime_service: {
        surface_id: 'opl_family_runtime_service',
        action: 'restart',
        ...result,
      },
    };
  }

  const lifecycleBefore = await inspectTemporalServiceLifecycle(paths);
  const supervisorBefore = inspectTemporalServiceSupervisorState(paths);
  const supervisorOperation = supervisorBefore.plist_exists || supervisorBefore.config_exists
    ? await runTemporalServiceSupervisorCommand(db, paths, 'remove')
    : null;
  const result = supervisorOperation
    ? {
        surface_kind: 'temporal_service_lifecycle_stop',
        provider_kind: 'temporal' as const,
        stop_status: supervisorOperation.status === 'removed' ? 'stopped_supervisor' : 'supervisor_remove_blocked',
        stopped_pid: supervisorBefore.pid,
        before: lifecycleBefore,
        status: await inspectTemporalServiceLifecycle(paths),
        supervisor_operation: supervisorOperation,
      }
    : await stopTemporalServiceLifecycle(paths);
  insertEvent(db, {
    eventType: 'temporal_service_stop',
    source: 'opl-cli',
    payload: {
      stop_status: result.stop_status,
      stopped_pid: result.stopped_pid,
      service_status: result.status.service_status,
    },
  });
  return {
    version: 'g2',
    family_runtime_service: {
      surface_id: 'opl_family_runtime_service',
      action: 'stop',
      ...result,
    },
  };
}
