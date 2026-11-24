import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const WAIT_CELL = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

export function waitBrieflySync(ms = 25) {
  Atomics.wait(WAIT_CELL, 0, 0, ms);
}

export function isProcessAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function writeExclusiveFileSync(filePath: string, content: Buffer | string, mode = 0o600) {
  const descriptor = fs.openSync(filePath, 'wx', mode);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function withExclusiveFileLockSync<T>(
  options: {
    lockPath: string;
    content: Buffer | string;
    timeoutMs: number;
    pollMs?: number;
    mode?: number;
    onTimeout: () => Error;
  },
  operation: () => T,
): T {
  fs.mkdirSync(path.dirname(options.lockPath), { recursive: true });
  const startedAt = Date.now();
  const pollMs = options.pollMs ?? 25;
  const mode = options.mode ?? 0o600;
  let lockFd: number | null = null;
  while (lockFd === null) {
    try {
      lockFd = fs.openSync(options.lockPath, 'wx', mode);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() - startedAt > options.timeoutMs) throw options.onTimeout();
      waitBrieflySync(pollMs);
    }
  }
  try {
    fs.writeFileSync(lockFd, options.content);
    return operation();
  } finally {
    fs.closeSync(lockFd);
    try {
      fs.unlinkSync(options.lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function reclaimLockFileAtomically(
  lockPath: string,
  shouldReclaim: (guardPath: string) => boolean,
): boolean {
  const guard = `${lockPath}.reclaim-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.renameSync(lockPath, guard);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  const restore = () => {
    try {
      fs.linkSync(guard, lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        fs.rmSync(guard, { force: true });
        throw error;
      }
    }
    fs.rmSync(guard, { force: true });
  };
  let reclaim = false;
  try {
    reclaim = shouldReclaim(guard);
  } catch (error) {
    restore();
    throw error;
  }
  if (!reclaim) {
    restore();
    return false;
  }
  fs.rmSync(guard, { force: true });
  return true;
}
