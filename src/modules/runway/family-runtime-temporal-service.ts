import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { record } from '../../kernel/json-record.ts';
import {
  resolveTemporalAddress,
  resolveTemporalAddressProvenance,
} from './family-runtime-temporal.ts';
import {
  inspectTemporalServiceSupervisorState,
  readTemporalServiceSupervisorConfig,
  temporalServiceSupervisorConfigPath,
  temporalServiceSupervisorDatabasePath,
  type TemporalServiceSupervisorStateRuntime,
} from './family-runtime-temporal-service-supervisor-state.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

type TemporalServicePaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

const TEMPORAL_SERVICE_START_TIMEOUT_MS = 5_000;
const TEMPORAL_SERVICE_START_POLL_MS = 100;
const TEMPORAL_SERVICE_STOP_TIMEOUT_MS = 3_000;
const TEMPORAL_SERVICE_STOP_POLL_MS = 50;

type TemporalServiceState = {
  provider_kind: 'temporal';
  service_kind: 'temporal_cli' | 'custom_command';
  pid: number;
  address: string;
  started_at: string;
  status: 'starting' | 'running';
  command: string;
  log_refs?: {
    stdout_path: string;
    stderr_path: string;
  };
};

export type TemporalServiceLauncher = {
  serviceKind: 'temporal_cli' | 'custom_command';
  source: 'explicit_temporal_cli_path' | 'temporal_cli_path' | 'explicit_operator_command';
  command: string;
  args: string[];
  executable: string;
  address: string;
};

export function temporalServiceDatabasePath(paths: TemporalServicePaths) {
  return temporalServiceSupervisorDatabasePath(paths);
}

export function prepareTemporalServiceDatabasePath(paths: TemporalServicePaths) {
  const databaseDir = path.join(paths.root, 'temporal-server');
  fs.mkdirSync(databaseDir, { recursive: true });
  return path.join(fs.realpathSync(databaseDir), 'temporal.sqlite');
}

export function withTemporalServicePersistentStore(
  launcher: TemporalServiceLauncher,
  databasePath: string,
): TemporalServiceLauncher {
  if (launcher.serviceKind !== 'temporal_cli') {
    return launcher;
  }
  const args: string[] = [];
  for (let index = 0; index < launcher.args.length; index += 1) {
    if (launcher.args[index] === '--db-filename') {
      index += 1;
      continue;
    }
    args.push(launcher.args[index]);
  }
  args.push('--db-filename', databasePath);
  return {
    ...launcher,
    args,
    command: [launcher.executable, ...args].join(' '),
  };
}

function temporalServiceStatePath(paths: TemporalServicePaths) {
  return path.join(paths.root, 'temporal-service.json');
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readTemporalServiceState(paths: TemporalServicePaths) {
  try {
    const parsed = readJsonPayloadFile(temporalServiceStatePath(paths));
    const payload = record(parsed);
    if (payload !== parsed) {
      return null;
    }
    const state = payload as Partial<TemporalServiceState>;
    if (
      state.provider_kind !== 'temporal'
      || (state.service_kind !== 'temporal_cli' && state.service_kind !== 'custom_command')
      || !Number.isInteger(state.pid)
      || typeof state.address !== 'string'
      || typeof state.command !== 'string'
      || (state.status !== 'starting' && state.status !== 'running')
    ) {
      return null;
    }
    return state as TemporalServiceState;
  } catch {
    return null;
  }
}

export function inspectDetachedTemporalServiceState(paths: TemporalServicePaths) {
  const state = readTemporalServiceState(paths);
  return {
    surface_kind: 'temporal_detached_service_state',
    state,
    running: state ? processIsAlive(state.pid) : false,
    pid: state?.pid ?? null,
    address: state?.address ?? null,
    service_kind: state?.service_kind ?? null,
  };
}

function writeTemporalServiceState(paths: TemporalServicePaths, state: TemporalServiceState) {
  fs.mkdirSync(paths.root, { recursive: true });
  writeJsonPayloadFile(temporalServiceStatePath(paths), state);
}

function removeTemporalServiceState(paths: TemporalServicePaths) {
  fs.rmSync(temporalServiceStatePath(paths), { force: true });
}

function temporalServiceLogRefs(paths: TemporalServicePaths) {
  const logRoot = path.join(paths.root, 'logs');
  return {
    stdout_path: path.join(logRoot, 'temporal-service.stdout.log'),
    stderr_path: path.join(logRoot, 'temporal-service.stderr.log'),
  };
}

function openAppendLogFds(logRefs: { stdout_path: string; stderr_path: string }) {
  fs.mkdirSync(path.dirname(logRefs.stdout_path), { recursive: true });
  return {
    stdout: fs.openSync(logRefs.stdout_path, 'a'),
    stderr: fs.openSync(logRefs.stderr_path, 'a'),
  };
}

function closeLogFds(fds: { stdout: number; stderr: number }) {
  fs.closeSync(fds.stdout);
  fs.closeSync(fds.stderr);
}

function buildTemporalServiceCrashDiagnostic(
  paths: TemporalServicePaths,
  state: TemporalServiceState | null,
  pidAlive: boolean,
) {
  if (!state || pidAlive) {
    return null;
  }
  const logRefs = state.log_refs ?? temporalServiceLogRefs(paths);
  return {
    surface_kind: 'temporal_service_crash_diagnostic',
    provider_kind: 'temporal',
    pid: state.pid,
    exit_status: 'process_not_alive',
    started_at: state.started_at,
    command: state.command,
    log_refs: logRefs,
    authority_boundary: {
      opl: 'temporal_service_lifecycle_diagnostic_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function parseTemporalAddress(address: string) {
  const [host, portRaw] = address.split(':');
  const port = Number.parseInt(portRaw ?? '', 10);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new FrameworkContractError('contract_shape_invalid', 'Temporal address must use host:port.', {
      address,
      required_env: ['OPL_TEMPORAL_ADDRESS'],
    });
  }
  return { host, port };
}

export async function probeTemporalServer(address: string, timeoutMs = 500) {
  return await new Promise<boolean>((resolve) => {
    const { host, port } = parseTemporalAddress(address);
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export function resolveTemporalAddressForPaths(
  paths?: TemporalServicePaths,
  env: NodeJS.ProcessEnv = process.env,
) {
  const provenance = resolveTemporalAddressProvenance(env);
  const configured = provenance.address;
  if (configured) {
    return {
      address: configured,
      addressSource: provenance.managed_packaged_local_default
        ? 'packaged_local_default'
        : 'environment',
      serviceState: paths ? readTemporalServiceState(paths) : null,
    };
  }
  const serviceState = paths ? readTemporalServiceState(paths) : null;
  if (serviceState && processIsAlive(serviceState.pid)) {
    return {
      address: serviceState.address,
      addressSource: 'managed_local_service_state',
      serviceState,
    };
  }
  const supervisorConfig = paths ? readTemporalServiceSupervisorConfig(paths) : null;
  if (supervisorConfig) {
    return {
      address: supervisorConfig.address,
      addressSource: 'managed_service_supervisor',
      serviceState,
      supervisorConfig,
    };
  }
  return {
    address: null,
    addressSource: 'not_configured',
    serviceState,
  };
}

function executablePath(candidate: string) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

export function resolveTemporalServiceLauncher(
  paths?: TemporalServicePaths,
  env: NodeJS.ProcessEnv = process.env,
): TemporalServiceLauncher | null {
  const address = resolveTemporalAddress(env) ?? '127.0.0.1:7233';
  const customCommand = env.OPL_TEMPORAL_SERVICE_START_COMMAND?.trim();
  if (customCommand) {
    return {
      serviceKind: 'custom_command' as const,
      source: 'explicit_operator_command' as const,
      command: customCommand,
      args: ['-lc', customCommand],
      executable: '/bin/sh',
      address,
    };
  }
  const explicitTemporalCli = env.OPL_TEMPORAL_CLI_PATH?.trim();
  const pathDirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const temporalCli = [
    ...(explicitTemporalCli ? [explicitTemporalCli] : []),
    ...pathDirs.map((dir) => path.join(dir, 'temporal')),
  ].map(executablePath).find((candidate): candidate is string => Boolean(candidate));
  if (temporalCli) {
    const { host, port } = parseTemporalAddress(address);
    if (host !== '127.0.0.1' && host !== 'localhost') {
      return null;
    }
    const args = ['server', 'start-dev', '--ip', host, '--port', String(port)];
    const launcher = {
      serviceKind: 'temporal_cli' as const,
      source: explicitTemporalCli ? 'explicit_temporal_cli_path' as const : 'temporal_cli_path' as const,
      command: [temporalCli, ...args].join(' '),
      args,
      executable: temporalCli,
      address,
    };
    return paths
      ? withTemporalServicePersistentStore(launcher, temporalServiceDatabasePath(paths))
      : launcher;
  }
  return null;
}

export async function inspectTemporalServiceLifecycle(
  paths: TemporalServicePaths,
  runtime: TemporalServiceSupervisorStateRuntime = {},
) {
  const env = runtime.env ?? process.env;
  const configuredAddressProvenance = resolveTemporalAddressProvenance(env);
  const configuredAddress = configuredAddressProvenance.address;
  const state = readTemporalServiceState(paths);
  const supervisorConfig = readTemporalServiceSupervisorConfig(paths);
  const supervisorState = inspectTemporalServiceSupervisorState(paths, runtime);
  const pidAlive = state ? processIsAlive(state.pid) : false;
  const address = configuredAddress || (pidAlive ? state?.address ?? null : null) || supervisorConfig?.address || null;
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const supervisorProcessRunning = supervisorState.process_state === 'running'
    || (supervisorState.pid !== null && supervisorState.pid > 0);
  const serviceStatus = pidAlive && serverReachable
    ? 'running'
    : supervisorConfig
      && supervisorState.configuration_current
      && supervisorState.loaded
      && supervisorProcessRunning
      && supervisorState.error === null
      && serverReachable
      ? 'running'
      : configuredAddress && serverReachable
        ? 'external_running'
        : state && !pidAlive
          ? 'stale_state'
          : supervisorConfig
            ? 'supervisor_unready'
            : configuredAddress
          ? 'configured_external_unreachable'
          : 'not_configured';
  const blockers = [
    ...(!configuredAddress && !state && !supervisorConfig ? ['temporal_local_service_not_managed'] : []),
    ...(configuredAddress && !serverReachable ? ['temporal_server_unreachable'] : []),
    ...(supervisorConfig && !serverReachable ? ['temporal_service_supervisor_unready'] : []),
    ...(supervisorConfig && !supervisorState.configuration_current
      ? ['temporal_service_supervisor_configuration_drift']
      : []),
    ...(supervisorConfig && !supervisorState.loaded
      ? ['temporal_service_supervisor_not_loaded']
      : []),
    ...(state && !pidAlive ? ['temporal_local_service_stale_state'] : []),
  ];
  const addressSource = configuredAddress
    ? configuredAddressProvenance.managed_packaged_local_default
      ? 'packaged_local_default'
      : 'environment'
    : pidAlive
      ? 'managed_local_service_state'
      : supervisorConfig
        ? 'managed_service_supervisor'
        : 'not_configured';
  const serviceReady = serviceStatus === 'running' || serviceStatus === 'external_running';
  const managedSupervisorReady = Boolean(
    supervisorConfig
    && supervisorState.configuration_current
    && supervisorState.loaded
    && supervisorProcessRunning
    && supervisorState.error === null
    && serverReachable,
  );
  const observedAt = runtime.now?.() ?? new Date().toISOString();
  const explicitCustomService = Boolean(env.OPL_TEMPORAL_SERVICE_START_COMMAND?.trim());
  const supervisorApplicable = supervisorState.supported
    && addressSource !== 'environment'
    && state?.service_kind !== 'custom_command'
    && !explicitCustomService;
  const supervisorRequired = supervisorApplicable;
  const supervisorReady = supervisorRequired ? managedSupervisorReady : null;
  const supervisorError = supervisorRequired
    ? supervisorState.error
      ?? (supervisorConfig && !serverReachable ? 'temporal_server_unreachable' : null)
    : null;
  const supervisorRepairActionId = supervisorRequired && supervisorReady !== true
    ? supervisorConfig
      ? 'trigger_temporal_service_supervisor'
      : 'install_temporal_service_supervisor'
    : 'none';
  return {
    surface_kind: 'temporal_service_lifecycle_status',
    provider_kind: 'temporal',
    service_status: serviceStatus,
    address,
    address_source: addressSource,
    server_reachable: serverReachable,
    managed_service_pid: state?.pid ?? null,
    managed_service_state_path: temporalServiceStatePath(paths),
    service_kind: state?.service_kind ?? supervisorConfig?.launcher_kind ?? null,
    command: state?.command ?? supervisorConfig?.launcher_command ?? null,
    supervisor_config_path: temporalServiceSupervisorConfigPath(paths),
    supervisor_configured: Boolean(supervisorConfig),
    supervisor: {
      ...supervisorState,
      status: supervisorRequired ? supervisorState.status : 'not_applicable',
      applicable: supervisorApplicable,
      required: supervisorRequired,
      ready: supervisorReady,
      observed_at: observedAt,
      error: supervisorError,
    },
    crash_diagnostic: buildTemporalServiceCrashDiagnostic(paths, state, pidAlive),
    blockers,
    repair_action: {
      surface_kind: 'temporal_service_repair_action',
      provider_kind: 'temporal',
      supervisor_applicable: supervisorApplicable,
      supervisor_required: supervisorRequired,
      action_id: supervisorRepairActionId,
      next_command: supervisorRepairActionId === 'trigger_temporal_service_supervisor'
        ? 'opl family-runtime service supervisor trigger --provider temporal'
        : supervisorRepairActionId === 'install_temporal_service_supervisor'
          ? 'opl family-runtime service supervisor install --provider temporal'
        : serviceReady
          ? 'opl family-runtime worker start --provider temporal'
          : 'opl family-runtime service start --provider temporal',
      required_launcher: ['OPL_TEMPORAL_CLI_PATH', 'temporal CLI on PATH'],
    },
    authority_boundary: {
      opl: 'temporal_local_service_lifecycle_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

async function waitForTemporalServiceStart(paths: TemporalServicePaths) {
  const deadline = Date.now() + TEMPORAL_SERVICE_START_TIMEOUT_MS;
  let status = await inspectTemporalServiceLifecycle(paths);
  while (
    status.service_status !== 'running'
    && status.service_status !== 'external_running'
    && status.service_status !== 'stale_state'
    && Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, TEMPORAL_SERVICE_START_POLL_MS));
    status = await inspectTemporalServiceLifecycle(paths);
  }
  return status;
}

export async function startTemporalServiceLifecycle(
  paths: TemporalServicePaths,
  input: { detach?: boolean } = {},
) {
  const current = await inspectTemporalServiceLifecycle(paths);
  if (current.service_status === 'running' || current.service_status === 'external_running') {
    return {
      surface_kind: 'temporal_service_lifecycle_start',
      provider_kind: 'temporal',
      start_status: 'already_running',
      status: current,
    };
  }
  const resolvedLauncher = resolveTemporalServiceLauncher(paths);
  const launcher = resolvedLauncher?.serviceKind === 'temporal_cli'
    ? withTemporalServicePersistentStore(resolvedLauncher, prepareTemporalServiceDatabasePath(paths))
    : resolvedLauncher;
  if (!launcher) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal local service start requires temporal CLI on PATH, OPL_TEMPORAL_CLI_PATH, or OPL_TEMPORAL_SERVICE_START_COMMAND.',
      {
        service_status: 'launcher_missing',
        provider_kind: 'temporal',
        required_launcher: ['OPL_TEMPORAL_CLI_PATH', 'temporal CLI on PATH', 'OPL_TEMPORAL_SERVICE_START_COMMAND'],
      },
    );
  }
  if (input.detach === false) {
    writeTemporalServiceState(paths, {
      provider_kind: 'temporal',
      service_kind: launcher.serviceKind,
      pid: process.pid,
      address: launcher.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: launcher.command,
    });
    const child = spawn(launcher.executable, launcher.args, { stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      child.once('exit', resolve);
      child.once('error', reject);
    });
    removeTemporalServiceState(paths);
    return {
      surface_kind: 'temporal_service_lifecycle_start',
      provider_kind: 'temporal',
      start_status: 'foreground_completed',
      status: await inspectTemporalServiceLifecycle(paths),
    };
  }
  const logRefs = temporalServiceLogRefs(paths);
  fs.mkdirSync(paths.root, { recursive: true });
  const logFds = openAppendLogFds(logRefs);
  const child = spawn(launcher.executable, launcher.args, {
    cwd: paths.root,
    detached: true,
    stdio: ['ignore', logFds.stdout, logFds.stderr],
  });
  child.unref();
  closeLogFds(logFds);
  writeTemporalServiceState(paths, {
    provider_kind: 'temporal',
    service_kind: launcher.serviceKind,
    pid: child.pid ?? 0,
    address: launcher.address,
    started_at: new Date().toISOString(),
    status: 'running',
    command: launcher.command,
    log_refs: logRefs,
  });
  return {
    surface_kind: 'temporal_service_lifecycle_start',
    provider_kind: 'temporal',
    start_status: 'started',
    status: await waitForTemporalServiceStart(paths),
  };
}

export async function stopTemporalServiceLifecycle(paths: TemporalServicePaths) {
  const before = await inspectTemporalServiceLifecycle(paths);
  const state = readTemporalServiceState(paths);
  let stoppedPid: number | null = null;
  let stopStatus: 'stopped' | 'not_running' | 'stop_timeout' = 'not_running';
  if (state && processIsAlive(state.pid)) {
    process.kill(state.pid, 'SIGTERM');
    stoppedPid = state.pid;
    const deadline = Date.now() + TEMPORAL_SERVICE_STOP_TIMEOUT_MS;
    while (processIsAlive(state.pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, TEMPORAL_SERVICE_STOP_POLL_MS));
    }
    stopStatus = processIsAlive(state.pid) ? 'stop_timeout' : 'stopped';
  }
  if (stopStatus !== 'stop_timeout') {
    removeTemporalServiceState(paths);
  }
  return {
    surface_kind: 'temporal_service_lifecycle_stop',
    provider_kind: 'temporal',
    stop_status: stopStatus,
    stopped_pid: stoppedPid,
    before,
    status: await inspectTemporalServiceLifecycle(paths),
  };
}
