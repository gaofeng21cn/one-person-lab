import { processIsAlive } from './worker-state.ts';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { temporalWorkerRootArgumentFromArgv } from './foreground-paths.ts';

const WORKER_STOP_GRACE_MS = 2_000;
const WORKER_STOP_POLL_MS = 50;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commandMatchesFamilyRuntimeRoot(command: string, familyRuntimeRoot: string) {
  const escapedRoot = escapeRegExp(familyRuntimeRoot);
  // The canonical launcher places the root last; do not accept a sibling path
  // whose value merely starts with this root followed by a space.
  return new RegExp(`(?:^|\\s)--family-runtime-root(?:=|\\s+)${escapedRoot}$`).test(command);
}

function linuxProcessArguments(pid: number) {
  const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
  if (args.at(-1) === '') args.pop();
  return args.length ? args : null;
}

function linuxProcessCommand(pid: number) {
  return linuxProcessArguments(pid)?.join(' ') ?? null;
}

function linuxArgumentsMatchFamilyRuntimeRoot(args: string[], familyRuntimeRoot: string) {
  try {
    return temporalWorkerRootArgumentFromArgv(args) === familyRuntimeRoot;
  } catch {
    return false;
  }
}

function processExistsForInspection(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw new Error(`Unable to inspect Temporal foreground worker process ${pid}`, { cause: error });
  }
}

function linuxForegroundWorkerCandidates() {
  let entries: string[];
  try {
    entries = fs.readdirSync('/proc');
  } catch (error) {
    throw new Error('Unable to discover Temporal foreground worker processes from /proc', { cause: error });
  }
  return entries.filter((entry) => {
    if (!/^[1-9]\d*$/.test(entry)) return false;
    try {
      return linuxProcessArguments(Number(entry))?.includes('--temporal-worker-foreground') === true;
    } catch (error) {
      // Exited or inaccessible processes have not been identified as workers.
      if (['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return false;
      }
      throw new Error(`Unable to read process ${entry} during Temporal worker discovery`, { cause: error });
    }
  });
}

export function temporalForegroundWorkerCommand(pid: number) {
  if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  try {
    if (process.platform === 'linux') return linuxProcessCommand(pid);
    const output = execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

export function temporalForegroundWorkerModulePathFromCommand(command: string | null | undefined) {
  const normalized = command?.trim();
  if (!normalized || !normalized.includes('--temporal-worker-foreground')) {
    return null;
  }
  const foregroundIndex = normalized.indexOf('--temporal-worker-foreground');
  if (foregroundIndex <= 0) {
    return null;
  }
  const commandPrefix = normalized.slice(0, foregroundIndex).trimEnd();
  const moduleSuffix = /family-runtime-temporal-provider\.(?:js|ts)$/.exec(commandPrefix)?.[0];
  if (!moduleSuffix) {
    return null;
  }
  const suffixIndex = commandPrefix.length - moduleSuffix.length;
  const pathStart = commandPrefix.lastIndexOf(' /', suffixIndex);
  return commandPrefix.slice(pathStart >= 0 ? pathStart + 1 : 0).trim() || null;
}

async function waitForProcessExit(pid: number, timeoutMs = WORKER_STOP_GRACE_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) {
      return true;
    }
    await sleep(WORKER_STOP_POLL_MS);
  }
  return !processIsAlive(pid);
}

function signalManagedWorker(pid: number, signal: NodeJS.Signals) {
  const result: Record<string, unknown> = {
    pid,
    signal,
    process_signaled: false,
    process_group_signaled: false,
    errors: [],
  };
  const errors: string[] = [];
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, signal);
      result.process_group_signaled = true;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    process.kill(pid, signal);
    result.process_signaled = true;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  result.errors = errors;
  return result;
}

export function findTemporalForegroundWorkerPids(input: {
  modulePath: string;
  familyRuntimeRoot?: string;
  excludePids?: number[];
}) {
  if (process.platform === 'win32') {
    return [];
  }
  const exclude = new Set([process.pid, process.ppid, ...(input.excludePids ?? [])]);
  let candidates: string[];
  if (process.platform === 'linux') {
    candidates = linuxForegroundWorkerCandidates();
  } else {
    try {
      // Enumerate candidate PIDs first: unrelated process arguments must not fill
      // the command buffer and hide live workers on busy hosts.
      candidates = execFileSync('pgrep', ['-f', '--', '--temporal-worker-foreground'], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }).trim().split(/\s+/);
    } catch (error) {
      if ((error as { status?: number }).status === 1) return [];
      throw new Error('Unable to discover Temporal foreground worker processes', { cause: error });
    }
  }
  const pids: number[] = [];
  const scopedRoot = typeof input.familyRuntimeRoot === 'string' && input.familyRuntimeRoot.length > 0
    ? input.familyRuntimeRoot
    : null;
  for (const candidate of candidates) {
    if (!/^\d+$/.test(candidate)) {
      continue;
    }
    const pid = Number(candidate);
    if (!Number.isInteger(pid) || pid <= 0 || exclude.has(pid)) {
      continue;
    }
    let linuxArguments: string[] | null = null;
    let command: string | null;
    if (process.platform === 'linux') {
      try {
        linuxArguments = linuxProcessArguments(pid);
        command = linuxArguments?.join(' ') || null;
      } catch {
        command = null;
      }
    } else {
      command = temporalForegroundWorkerCommand(pid);
    }
    if (!command) {
      if (processExistsForInspection(pid)) {
        throw new Error(`Unable to inspect Temporal foreground worker process ${pid}`);
      }
      continue;
    }
    if (
      (linuxArguments ? linuxArguments.includes('--temporal-worker-foreground') : command.includes('--temporal-worker-foreground'))
      && (
        scopedRoot
          ? (process.platform === 'linux'
            ? linuxArgumentsMatchFamilyRuntimeRoot(linuxArguments ?? [], scopedRoot)
            : commandMatchesFamilyRuntimeRoot(command, scopedRoot))
          : (linuxArguments ? linuxArguments.includes(input.modulePath) : command.includes(input.modulePath))
      )
      && processExistsForInspection(pid)
    ) {
      pids.push(pid);
    }
  }
  return [...new Set(pids)].sort((a, b) => a - b);
}

export async function stopWorkerPid(pid: number) {
  const actions = [signalManagedWorker(pid, 'SIGTERM')];
  const exitedAfterTerm = await waitForProcessExit(pid);
  if (exitedAfterTerm) {
    return { status: 'stopped', actions };
  }
  actions.push(signalManagedWorker(pid, 'SIGKILL'));
  const exitedAfterKill = await waitForProcessExit(pid);
  return { status: exitedAfterKill ? 'force_stopped' : 'stop_incomplete', actions };
}

export async function stopOrphanTemporalForegroundWorkers(input: {
  modulePath: string;
  familyRuntimeRoot?: string;
  excludePids?: number[];
}) {
  const orphan_stop_actions: Record<string, unknown>[] = [];
  const orphan_stopped_pids: number[] = [];
  const orphan_stop_incomplete_pids: number[] = [];
  const orphanPids = findTemporalForegroundWorkerPids(input);
  for (const orphanPid of orphanPids) {
    const stopped = await stopWorkerPid(orphanPid);
    orphan_stop_actions.push(...stopped.actions.map((action) => ({ ...action, orphan: true })));
    if (stopped.status === 'stopped' || stopped.status === 'force_stopped') {
      orphan_stopped_pids.push(orphanPid);
    } else {
      orphan_stop_incomplete_pids.push(orphanPid);
    }
  }
  return {
    orphan_stop_actions,
    orphan_stopped_pids,
    orphan_stop_incomplete_pids,
  };
}
