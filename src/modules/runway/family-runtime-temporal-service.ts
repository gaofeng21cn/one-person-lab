import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../kernel/json-file.ts';
import { record } from '../../kernel/json-record.ts';
import { resolveTemporalAddress } from './family-runtime-temporal.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

type TemporalServicePaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

const TEMPORAL_SERVICE_START_TIMEOUT_MS = 5_000;
const TEMPORAL_SERVICE_START_POLL_MS = 100;

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

function writeTemporalServiceState(paths: TemporalServicePaths, state: TemporalServiceState) {
  fs.mkdirSync(paths.root, { recursive: true });
  fs.writeFileSync(temporalServiceStatePath(paths), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
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

function parseTemporalAddress(address: string) {
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

export function resolveTemporalAddressForPaths(paths?: TemporalServicePaths) {
  const configured = resolveTemporalAddress();
  if (configured) {
    return {
      address: configured,
      addressSource: 'environment',
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
  return {
    address: null,
    addressSource: 'not_configured',
    serviceState,
  };
}

function temporalServiceStartCommand() {
  const customCommand = process.env.OPL_TEMPORAL_SERVICE_START_COMMAND?.trim();
  if (customCommand) {
    return {
      serviceKind: 'custom_command' as const,
      command: customCommand,
      args: ['-lc', customCommand],
      executable: '/bin/sh',
    };
  }
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const temporalCli = pathDirs
    .map((dir) => path.join(dir, 'temporal'))
    .find((candidate) => fs.existsSync(candidate));
  if (temporalCli) {
    return {
      serviceKind: 'temporal_cli' as const,
      command: `${temporalCli} server start-dev --ip 127.0.0.1 --port 7233`,
      args: ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '7233'],
      executable: temporalCli,
    };
  }
  return null;
}

export async function inspectTemporalServiceLifecycle(paths: TemporalServicePaths) {
  const configuredAddress = resolveTemporalAddress();
  const state = readTemporalServiceState(paths);
  const pidAlive = state ? processIsAlive(state.pid) : false;
  const address = configuredAddress || (pidAlive ? state?.address ?? null : null);
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const serviceStatus = pidAlive && serverReachable
    ? 'running'
    : configuredAddress && serverReachable
      ? 'external_running'
      : state && !pidAlive
        ? 'stale_state'
        : configuredAddress
          ? 'configured_external_unreachable'
          : 'not_configured';
  const blockers = [
    ...(!configuredAddress && !state ? ['temporal_local_service_not_managed'] : []),
    ...(configuredAddress && !serverReachable ? ['temporal_server_unreachable'] : []),
    ...(state && !pidAlive ? ['temporal_local_service_stale_state'] : []),
  ];
  return {
    surface_kind: 'temporal_service_lifecycle_status',
    provider_kind: 'temporal',
    service_status: serviceStatus,
    address,
    address_source: configuredAddress ? 'environment' : pidAlive ? 'managed_local_service_state' : 'not_configured',
    server_reachable: serverReachable,
    managed_service_pid: state?.pid ?? null,
    managed_service_state_path: temporalServiceStatePath(paths),
    service_kind: state?.service_kind ?? null,
    command: state?.command ?? null,
    crash_diagnostic: buildTemporalServiceCrashDiagnostic(paths, state, pidAlive),
    blockers,
    repair_action: {
      surface_kind: 'temporal_service_repair_action',
      provider_kind: 'temporal',
      action_id: serviceStatus === 'running' || serviceStatus === 'external_running'
        ? 'none'
        : 'start_local_temporal_service',
      next_command: serviceStatus === 'running' || serviceStatus === 'external_running'
        ? 'opl family-runtime worker start --provider temporal'
        : 'opl family-runtime service start --provider temporal',
      required_launcher: ['temporal CLI on PATH', 'OPL_TEMPORAL_SERVICE_START_COMMAND'],
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
  const launcher = temporalServiceStartCommand();
  if (!launcher) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal local service start requires temporal CLI on PATH or OPL_TEMPORAL_SERVICE_START_COMMAND.',
      {
        service_status: 'launcher_missing',
        provider_kind: 'temporal',
        required_launcher: ['temporal CLI on PATH', 'OPL_TEMPORAL_SERVICE_START_COMMAND'],
      },
    );
  }
  if (input.detach === false) {
    writeTemporalServiceState(paths, {
      provider_kind: 'temporal',
      service_kind: launcher.serviceKind,
      pid: process.pid,
      address: process.env.OPL_TEMPORAL_ADDRESS?.trim() || '127.0.0.1:7233',
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
  const logFds = openAppendLogFds(logRefs);
  const child = spawn(launcher.executable, launcher.args, {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', logFds.stdout, logFds.stderr],
  });
  child.unref();
  closeLogFds(logFds);
  writeTemporalServiceState(paths, {
    provider_kind: 'temporal',
    service_kind: launcher.serviceKind,
    pid: child.pid ?? 0,
    address: process.env.OPL_TEMPORAL_ADDRESS?.trim() || '127.0.0.1:7233',
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
  if (state && processIsAlive(state.pid)) {
    process.kill(state.pid, 'SIGTERM');
    stoppedPid = state.pid;
  }
  removeTemporalServiceState(paths);
  return {
    surface_kind: 'temporal_service_lifecycle_stop',
    provider_kind: 'temporal',
    stop_status: stoppedPid ? 'stopped' : 'not_running',
    stopped_pid: stoppedPid,
    before,
    status: await inspectTemporalServiceLifecycle(paths),
  };
}
