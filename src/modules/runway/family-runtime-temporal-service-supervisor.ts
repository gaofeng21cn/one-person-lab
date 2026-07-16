import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { insertEvent, type familyRuntimePaths } from './family-runtime-store.ts';
import { escapeXml } from './family-runtime-provider-worker-supervisor-state.ts';
import {
  inspectDetachedTemporalServiceState,
  prepareTemporalServiceDatabasePath,
  probeTemporalServer,
  resolveTemporalServiceLauncher,
  startTemporalServiceLifecycle,
  stopTemporalServiceLifecycle,
  withTemporalServicePersistentStore,
  type TemporalServiceLauncher,
} from './family-runtime-temporal-service.ts';
import {
  inspectTemporalServiceSupervisorState,
  readTemporalServiceSupervisorConfig,
  removeTemporalServiceSupervisorConfig,
  runTemporalServiceSupervisorLaunchctl,
  temporalServiceSupervisorConfigPath,
  temporalServiceSupervisorLaunchctlTarget,
  temporalServiceSupervisorLauncherSha256,
  temporalServiceSupervisorPlistPath,
  temporalServiceSupervisorSha256,
  TEMPORAL_SERVICE_SUPERVISOR_LABEL,
  TEMPORAL_SERVICE_SUPERVISOR_THROTTLE_SECONDS,
  writeTemporalServiceSupervisorConfig,
  type TemporalServiceSupervisorConfig,
  type TemporalServiceSupervisorLaunchctlResult,
  type TemporalServiceSupervisorStateRuntime,
} from './family-runtime-temporal-service-supervisor-state.ts';

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;
export type TemporalServiceSupervisorAction = 'status' | 'install' | 'remove' | 'trigger';

export type TemporalServiceSupervisorRuntime = TemporalServiceSupervisorStateRuntime & {
  resolveLauncher?: () => TemporalServiceLauncher | null;
  probeServer?: (address: string) => Promise<boolean>;
  readinessTimeoutMs?: number;
  readinessPollMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  inspectDetachedService?: typeof inspectDetachedTemporalServiceState;
  stopDetachedService?: typeof stopTemporalServiceLifecycle;
  startDetachedService?: typeof startTemporalServiceLifecycle;
};

const DEFAULT_READINESS_TIMEOUT_MS = 5_000;
const DEFAULT_READINESS_POLL_MS = 100;

function now(runtime: TemporalServiceSupervisorRuntime) {
  return runtime.now?.() ?? new Date().toISOString();
}

function atomicWriteText(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function readFileSnapshot(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function restoreFileSnapshot(filePath: string, snapshot: string | null) {
  if (snapshot === null) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  atomicWriteText(filePath, snapshot);
}

function plistEnvironmentVariables(
  paths: RuntimePaths,
  launcher: TemporalServiceLauncher,
  env: NodeJS.ProcessEnv,
) {
  const values: Record<string, string> = {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_FAMILY_RUNTIME_ROOT: paths.root,
    OPL_STATE_DIR: paths.state_dir,
    OPL_TEMPORAL_ADDRESS: launcher.address,
  };
  const pathValue = env.PATH?.trim();
  if (pathValue) {
    values.PATH = pathValue;
  }
  return values;
}

function plistEnvironmentXml(
  paths: RuntimePaths,
  launcher: TemporalServiceLauncher,
  env: NodeJS.ProcessEnv,
) {
  return Object.entries(plistEnvironmentVariables(paths, launcher, env))
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`)
    .join('\n');
}

export function buildTemporalServiceSupervisorPlist(
  paths: RuntimePaths,
  launcher: TemporalServiceLauncher,
  env: NodeJS.ProcessEnv = process.env,
) {
  const logRoot = path.join(paths.root, 'logs');
  const args = [launcher.executable, ...launcher.args]
    .map((entry) => `    <string>${escapeXml(entry)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${TEMPORAL_SERVICE_SUPERVISOR_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${plistEnvironmentXml(paths, launcher, env)}
  </dict>
  <key>WorkingDirectory</key>
  <string>${escapeXml(paths.root)}</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>${TEMPORAL_SERVICE_SUPERVISOR_THROTTLE_SECONDS}</integer>
  <key>ExitTimeOut</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logRoot, 'temporal-service.stdout.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logRoot, 'temporal-service.stderr.log'))}</string>
</dict>
</plist>
`;
}

function supervisorConfig(
  paths: RuntimePaths,
  launcher: TemporalServiceLauncher,
  plist: string,
  runtime: TemporalServiceSupervisorRuntime,
): TemporalServiceSupervisorConfig {
  if (
    launcher.serviceKind !== 'temporal_cli'
    || (launcher.source !== 'explicit_temporal_cli_path' && launcher.source !== 'temporal_cli_path')
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal service supervision requires a directly executable Temporal CLI launcher.',
      {
        launcher_kind: launcher.serviceKind,
        launcher_source: launcher.source,
        custom_command_supervision_allowed: false,
      },
    );
  }
  const databaseArgumentIndex = launcher.args.indexOf('--db-filename');
  const databasePath = databaseArgumentIndex >= 0 ? launcher.args[databaseArgumentIndex + 1] : null;
  if (!databasePath || !path.isAbsolute(databasePath)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal service supervisor requires an absolute persistent --db-filename path.',
      {
        launcher_args: launcher.args,
        required_database_root: path.join(paths.root, 'temporal-server'),
      },
    );
  }
  const baseConfig: Omit<
    TemporalServiceSupervisorConfig,
    'installed_at' | 'launcher_sha256' | 'plist_path' | 'plist_sha256'
  > = {
    version: 'v1',
    surface_kind: 'opl_temporal_service_supervisor_config',
    provider_kind: 'temporal',
    supervisor_label: TEMPORAL_SERVICE_SUPERVISOR_LABEL,
    family_runtime_root: paths.root,
    state_dir: paths.state_dir,
    address: launcher.address,
    database_path: databasePath,
    launcher_kind: 'temporal_cli',
    launcher_source: launcher.source,
    launcher_executable: launcher.executable,
    launcher_args: launcher.args,
    launcher_command: launcher.command,
  };
  return {
    ...baseConfig,
    launcher_sha256: temporalServiceSupervisorLauncherSha256(baseConfig),
    plist_path: temporalServiceSupervisorPlistPath(runtime),
    plist_sha256: temporalServiceSupervisorSha256(plist),
    installed_at: now(runtime),
  };
}

async function inspectReady(
  paths: RuntimePaths,
  runtime: TemporalServiceSupervisorRuntime,
) {
  const state = inspectTemporalServiceSupervisorState(paths, runtime);
  const probe = runtime.probeServer ?? probeTemporalServer;
  const serverReady = state.address ? await probe(state.address) : false;
  const processRunning = state.process_state === 'running' || (state.pid !== null && state.pid > 0);
  const currentError = state.error
    ?? (state.installed && state.loaded && !processRunning
      ? 'temporal_service_supervisor_process_not_running'
      : state.installed && !serverReady
        ? 'temporal_server_unreachable'
        : null);
  const ready = Boolean(
    state.installed
    && state.configuration_current
    && state.loaded
    && processRunning
    && serverReady
    && currentError === null,
  );
  return {
    ...state,
    ready,
    observed_at: now(runtime),
    error: currentError,
  };
}

async function waitForReady(
  paths: RuntimePaths,
  runtime: TemporalServiceSupervisorRuntime,
) {
  const timeoutMs = runtime.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const pollMs = runtime.readinessPollMs ?? DEFAULT_READINESS_POLL_MS;
  const sleep = runtime.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const deadline = Date.now() + timeoutMs;
  let state = await inspectReady(paths, runtime);
  while (!state.ready && Date.now() < deadline) {
    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    state = await inspectReady(paths, runtime);
  }
  return state;
}

async function waitForAddressUnavailable(
  address: string,
  runtime: TemporalServiceSupervisorRuntime,
) {
  const timeoutMs = runtime.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const pollMs = runtime.readinessPollMs ?? DEFAULT_READINESS_POLL_MS;
  const probe = runtime.probeServer ?? probeTemporalServer;
  const sleep = runtime.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const deadline = Date.now() + timeoutMs;
  let reachable = await probe(address);
  while (reachable && Date.now() < deadline) {
    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    reachable = await probe(address);
  }
  return !reachable;
}

function commandFor(action: TemporalServiceSupervisorAction) {
  return `opl family-runtime service supervisor ${action} --provider temporal`;
}

function basePayload(input: {
  action: TemporalServiceSupervisorAction;
  status: string;
  supervisor: Awaited<ReturnType<typeof inspectReady>>;
  launchctl?: TemporalServiceSupervisorLaunchctlResult | null;
  rollback?: Record<string, unknown> | null;
  detachedServiceMigration?: Record<string, unknown> | null;
}) {
  return {
    surface_kind: 'opl_temporal_service_supervisor_operation',
    provider_kind: 'temporal' as const,
    action: input.action,
    status: input.status,
    command: commandFor(input.action),
    supervisor: input.supervisor,
    launchctl: input.launchctl ?? null,
    rollback: input.rollback ?? null,
    detached_service_migration: input.detachedServiceMigration ?? null,
    ready: input.supervisor.ready,
    observed_at: input.supervisor.observed_at,
    error: input.supervisor.error,
    database_path: input.supervisor.database_path,
    schedule_independent: true,
    authority_boundary: {
      opl: 'temporal_service_process_supervision_only',
      scheduler: 'independent_temporal_schedule_lifecycle',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

function recordMutationEvent(
  db: DatabaseSync,
  action: Exclude<TemporalServiceSupervisorAction, 'status'>,
  payload: ReturnType<typeof basePayload>,
) {
  insertEvent(db, {
    eventType: `temporal_service_supervisor_${action}`,
    source: 'opl-cli',
    payload,
  });
}

function launchctl(
  args: string[],
  runtime: TemporalServiceSupervisorRuntime,
) {
  return runTemporalServiceSupervisorLaunchctl(args, runtime);
}

function rollbackInstall(input: {
  paths: RuntimePaths;
  runtime: TemporalServiceSupervisorRuntime;
  plistSnapshot: string | null;
  configSnapshot: string | null;
  wasLoaded: boolean;
}) {
  const plistPath = temporalServiceSupervisorPlistPath(input.runtime);
  const configPath = temporalServiceSupervisorConfigPath(input.paths);
  const cleanupLaunchctl = launchctl([
    'bootout',
    temporalServiceSupervisorLaunchctlTarget(input.runtime),
    plistPath,
  ], input.runtime);
  try {
    restoreFileSnapshot(plistPath, input.plistSnapshot);
    restoreFileSnapshot(configPath, input.configSnapshot);
    const restoreLaunchctl = input.wasLoaded && input.plistSnapshot !== null
      ? launchctl([
          'bootstrap',
          temporalServiceSupervisorLaunchctlTarget(input.runtime),
          plistPath,
        ], input.runtime)
      : null;
    return {
      attempted: true,
      status: !restoreLaunchctl || restoreLaunchctl.ok ? 'restored' : 'restore_launch_failed',
      cleanup_launchctl: cleanupLaunchctl,
      restore_launchctl: restoreLaunchctl,
      plist_restored: input.plistSnapshot !== null,
      config_restored: input.configSnapshot !== null,
    };
  } catch (error) {
    return {
      attempted: true,
      status: 'restore_failed',
      cleanup_launchctl: cleanupLaunchctl,
      restore_launchctl: null,
      plist_restored: false,
      config_restored: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function installSupervisor(
  db: DatabaseSync,
  paths: RuntimePaths,
  runtime: TemporalServiceSupervisorRuntime,
) {
  if ((runtime.platform ?? process.platform) !== 'darwin') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal service supervisor requires macOS launchd.',
      { platform: runtime.platform ?? process.platform, required_platform: 'darwin' },
    );
  }
  const resolvedLauncher = runtime.resolveLauncher?.()
    ?? resolveTemporalServiceLauncher(paths, runtime.env ?? process.env);
  if (!resolvedLauncher) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal service supervisor install requires Temporal CLI on PATH or OPL_TEMPORAL_CLI_PATH.',
      {
        provider_kind: 'temporal',
        required_launcher: ['OPL_TEMPORAL_CLI_PATH', 'temporal CLI on PATH'],
      },
    );
  }
  const launcher = resolvedLauncher.serviceKind === 'temporal_cli'
    ? withTemporalServicePersistentStore(
        resolvedLauncher,
        prepareTemporalServiceDatabasePath(paths),
      )
    : resolvedLauncher;
  const plistPath = temporalServiceSupervisorPlistPath(runtime);
  const configPath = temporalServiceSupervisorConfigPath(paths);
  const plist = buildTemporalServiceSupervisorPlist(paths, launcher, runtime.env ?? process.env);
  const config = supervisorConfig(paths, launcher, plist, runtime);
  const before = inspectTemporalServiceSupervisorState(paths, runtime);
  const plistSnapshot = readFileSnapshot(plistPath);
  const configSnapshot = readFileSnapshot(configPath);
  const existingConfig = readTemporalServiceSupervisorConfig(paths);
  const exactConfiguration = before.configuration_current
    && plistSnapshot === plist
    && existingConfig?.launcher_executable === config.launcher_executable
    && JSON.stringify(existingConfig.launcher_args) === JSON.stringify(config.launcher_args)
    && existingConfig.address === config.address;
  const inspectDetached = runtime.inspectDetachedService ?? inspectDetachedTemporalServiceState;
  const stopDetached = runtime.stopDetachedService ?? stopTemporalServiceLifecycle;
  const startDetached = runtime.startDetachedService ?? startTemporalServiceLifecycle;
  const detachedBefore = inspectDetached(paths);
  let detachedServiceMigration: Record<string, unknown> | null = null;

  if (!before.installed && detachedBefore.running) {
    const stop = await stopDetached(paths);
    const portReleased = stop.stop_status === 'stopped'
      && detachedBefore.address
      ? await waitForAddressUnavailable(detachedBefore.address, runtime)
      : stop.stop_status === 'stopped';
    detachedServiceMigration = {
      required: true,
      from: 'detached_service_state',
      to: 'launchd_supervisor',
      old_pid: detachedBefore.pid,
      address: detachedBefore.address,
      persistent_database_path: config.database_path,
      persistent_store_created_for_supervised_restart: true,
      old_in_memory_history_migration: 'not_available',
      history_claim: 'process_adoption_only_no_prior_workflow_history_migration_claim',
      stop,
      port_released: portReleased,
      status: portReleased ? 'detached_stopped_for_adoption' : 'blocked_detached_stop_incomplete',
    };
    if (!portReleased) {
      const payload = basePayload({
        action: 'install',
        status: 'blocked_detached_service_stop_incomplete',
        supervisor: await inspectReady(paths, runtime),
        detachedServiceMigration,
      });
      recordMutationEvent(db, 'install', payload);
      return payload;
    }
  }

  const finishInstall = async (payload: ReturnType<typeof basePayload>) => {
    if (!detachedServiceMigration) {
      recordMutationEvent(db, 'install', payload);
      return payload;
    }
    if (payload.ready) {
      const completed = {
        ...payload,
        detached_service_migration: {
          ...detachedServiceMigration,
          status: 'adopted_by_supervisor',
          rollback_required: false,
        },
      };
      recordMutationEvent(db, 'install', completed);
      return completed;
    }

    const installed = inspectTemporalServiceSupervisorState(paths, runtime);
    const cleanupLaunchctl = installed.loaded
      ? launchctl([
          'bootout',
          temporalServiceSupervisorLaunchctlTarget(runtime),
          temporalServiceSupervisorPlistPath(runtime),
        ], runtime)
      : null;
    if (cleanupLaunchctl && !cleanupLaunchctl.ok) {
      const blocked = {
        ...payload,
        status: 'blocked_supervisor_unready_rollback_bootout_failed',
        detached_service_migration: {
          ...detachedServiceMigration,
          status: 'rollback_blocked',
          rollback_required: true,
          cleanup_launchctl: cleanupLaunchctl,
          detached_restart: null,
        },
      };
      recordMutationEvent(db, 'install', blocked);
      return blocked;
    }

    fs.rmSync(temporalServiceSupervisorPlistPath(runtime), { force: true });
    removeTemporalServiceSupervisorConfig(paths);
    let detachedRestart: Awaited<ReturnType<typeof startTemporalServiceLifecycle>> | null = null;
    let detachedRestartError: string | null = null;
    try {
      detachedRestart = await startDetached(paths);
    } catch (error) {
      detachedRestartError = error instanceof Error ? error.message : String(error);
    }
    const detachedRestored = detachedRestart?.status.service_status === 'running'
      || detachedRestart?.status.service_status === 'external_running';
    const supervisor = await inspectReady(paths, runtime);
    const restored = {
      ...payload,
      status: detachedRestored
        ? 'blocked_supervisor_unready_detached_restored'
        : 'blocked_supervisor_unready_detached_restore_failed',
      supervisor,
      ready: false,
      observed_at: supervisor.observed_at,
      error: payload.error ?? detachedRestartError,
      detached_service_migration: {
        ...detachedServiceMigration,
        status: detachedRestored ? 'rolled_back_to_detached' : 'rollback_failed',
        rollback_required: true,
        cleanup_launchctl: cleanupLaunchctl,
        detached_restart: detachedRestart,
        detached_restart_error: detachedRestartError,
      },
    };
    recordMutationEvent(db, 'install', restored);
    return restored;
  };

  if (exactConfiguration && before.loaded) {
    const current = await inspectReady(paths, runtime);
    if (current.ready) {
      const payload = basePayload({
        action: 'install',
        status: 'already_ready',
        supervisor: current,
      });
      return await finishInstall(payload);
    }
    const trigger = launchctl([
      'kickstart',
      '-k',
      `${temporalServiceSupervisorLaunchctlTarget(runtime)}/${TEMPORAL_SERVICE_SUPERVISOR_LABEL}`,
    ], runtime);
    const supervisor = trigger.ok ? await waitForReady(paths, runtime) : await inspectReady(paths, runtime);
    const payload = basePayload({
      action: 'install',
      status: trigger.ok && supervisor.ready ? 'ready' : 'installed_unready',
      supervisor,
      launchctl: trigger,
    });
    return await finishInstall(payload);
  }

  if (before.loaded) {
    const bootout = launchctl([
      'bootout',
      temporalServiceSupervisorLaunchctlTarget(runtime),
      plistPath,
    ], runtime);
    if (!bootout.ok) {
      const payload = basePayload({
        action: 'install',
        status: 'blocked_existing_job_bootout_failed',
        supervisor: await inspectReady(paths, runtime),
        launchctl: bootout,
      });
      return await finishInstall(payload);
    }
  }

  let bootstrap: TemporalServiceSupervisorLaunchctlResult;
  try {
    fs.mkdirSync(path.join(paths.root, 'logs'), { recursive: true });
    atomicWriteText(plistPath, plist);
    writeTemporalServiceSupervisorConfig(paths, config);
    bootstrap = launchctl([
      'bootstrap',
      temporalServiceSupervisorLaunchctlTarget(runtime),
      plistPath,
    ], runtime);
  } catch (error) {
    const rollback = rollbackInstall({
      paths,
      runtime,
      plistSnapshot,
      configSnapshot,
      wasLoaded: before.loaded,
    });
    const supervisor = await inspectReady(paths, runtime);
    const payload = basePayload({
      action: 'install',
      status: 'blocked_install_write_failed',
      supervisor: {
        ...supervisor,
        error: error instanceof Error ? error.message : String(error),
      },
      rollback,
    });
    return await finishInstall(payload);
  }

  if (!bootstrap.ok) {
    const rollback = rollbackInstall({
      paths,
      runtime,
      plistSnapshot,
      configSnapshot,
      wasLoaded: before.loaded,
    });
    const payload = basePayload({
      action: 'install',
      status: 'blocked_bootstrap_failed',
      supervisor: await inspectReady(paths, runtime),
      launchctl: bootstrap,
      rollback,
    });
    return await finishInstall(payload);
  }

  const supervisor = await waitForReady(paths, runtime);
  const payload = basePayload({
    action: 'install',
    status: supervisor.ready ? 'ready' : 'installed_unready',
    supervisor,
    launchctl: bootstrap,
  });
  return await finishInstall(payload);
}

async function triggerSupervisor(
  db: DatabaseSync,
  paths: RuntimePaths,
  runtime: TemporalServiceSupervisorRuntime,
) {
  const before = inspectTemporalServiceSupervisorState(paths, runtime);
  if (!before.installed || !before.configuration_current) {
    const payload = basePayload({
      action: 'trigger',
      status: 'blocked_not_installed',
      supervisor: await inspectReady(paths, runtime),
    });
    recordMutationEvent(db, 'trigger', payload);
    return payload;
  }
  const result = launchctl([
    'kickstart',
    '-k',
    `${temporalServiceSupervisorLaunchctlTarget(runtime)}/${TEMPORAL_SERVICE_SUPERVISOR_LABEL}`,
  ], runtime);
  const supervisor = result.ok ? await waitForReady(paths, runtime) : await inspectReady(paths, runtime);
  const payload = basePayload({
    action: 'trigger',
    status: result.ok && supervisor.ready ? 'ready' : result.ok ? 'triggered_unready' : 'blocked_trigger_failed',
    supervisor,
    launchctl: result,
  });
  recordMutationEvent(db, 'trigger', payload);
  return payload;
}

async function removeSupervisor(
  db: DatabaseSync,
  paths: RuntimePaths,
  runtime: TemporalServiceSupervisorRuntime,
) {
  const before = inspectTemporalServiceSupervisorState(paths, runtime);
  if (!before.plist_exists && !before.config_exists && !before.loaded) {
    const payload = basePayload({
      action: 'remove',
      status: 'already_removed',
      supervisor: await inspectReady(paths, runtime),
    });
    recordMutationEvent(db, 'remove', payload);
    return payload;
  }
  let result: TemporalServiceSupervisorLaunchctlResult | null = null;
  if (before.loaded) {
    result = launchctl([
      'bootout',
      temporalServiceSupervisorLaunchctlTarget(runtime),
      temporalServiceSupervisorPlistPath(runtime),
    ], runtime);
    if (!result.ok) {
      const payload = basePayload({
        action: 'remove',
        status: 'blocked_bootout_failed',
        supervisor: await inspectReady(paths, runtime),
        launchctl: result,
      });
      recordMutationEvent(db, 'remove', payload);
      return payload;
    }
  }
  fs.rmSync(temporalServiceSupervisorPlistPath(runtime), { force: true });
  removeTemporalServiceSupervisorConfig(paths);
  const payload = basePayload({
    action: 'remove',
    status: 'removed',
    supervisor: await inspectReady(paths, runtime),
    launchctl: result,
  });
  recordMutationEvent(db, 'remove', payload);
  return payload;
}

export async function runTemporalServiceSupervisorCommand(
  db: DatabaseSync,
  paths: RuntimePaths,
  action: TemporalServiceSupervisorAction,
  runtime: TemporalServiceSupervisorRuntime = {},
) {
  if (action === 'status') {
    return basePayload({
      action,
      status: 'observed',
      supervisor: await inspectReady(paths, runtime),
    });
  }
  if (action === 'install') {
    return await installSupervisor(db, paths, runtime);
  }
  if (action === 'trigger') {
    return await triggerSupervisor(db, paths, runtime);
  }
  return await removeSupervisor(db, paths, runtime);
}
