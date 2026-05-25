import { processIsAlive } from './worker-state.ts';
import { execFileSync } from 'node:child_process';

const WORKER_STOP_GRACE_MS = 2_000;
const WORKER_STOP_POLL_MS = 50;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForProcessExit(pid: number, timeoutMs = WORKER_STOP_GRACE_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) {
      return true;
    }
    await sleep(WORKER_STOP_POLL_MS);
  }
  return !processIsAlive(pid);
}

export function signalManagedWorker(pid: number, signal: NodeJS.Signals) {
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
  excludePids?: number[];
}) {
  if (process.platform === 'win32') {
    return [];
  }
  const exclude = new Set([process.pid, process.ppid, ...(input.excludePids ?? [])]);
  let output = '';
  try {
    output = execFileSync('ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return [];
  }
  const pids: number[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (!match) {
      continue;
    }
    const pid = Number(match[1]);
    const command = match[2];
    if (
      Number.isInteger(pid)
      && !exclude.has(pid)
      && command.includes(input.modulePath)
      && command.includes('--temporal-worker-foreground')
      && processIsAlive(pid)
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
