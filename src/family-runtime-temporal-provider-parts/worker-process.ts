import { processIsAlive } from './worker-state.ts';

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
