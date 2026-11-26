import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { KernelError, isRecord } from './errors.ts';
import { nowIso } from './ids.ts';

const WAIT_CELL = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const DEFAULT_STALE_AFTER_MS = 1_800_000;

export interface ProcessIdentity {
  readonly pid: number;
  readonly proc_start_time_ticks: string | null;
  readonly boot_id: string | null;
}

export interface AdvisoryLockPayload {
  readonly owner_id: string;
  readonly pid: number;
  readonly acquired_at: string;
  readonly process_identity: ProcessIdentity;
  readonly stale_after_ms: number;
}

export interface AdvisoryLockOptions {
  ownerId?: string;
  staleAfterMs?: number;
  timeoutMs?: number;
  pollMs?: number;
  mode?: number;
}

export interface AdvisoryLockHandle {
  readonly lock_file: string;
  readonly owner_id: string;
  readonly pid: number;
  readonly acquired_at: string;
  release: () => boolean;
}

function waitBrieflySync(ms = 25): void {
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

function readProcStartTimeTicks(pid: number): string | null {
  if (process.platform !== 'linux') return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const commandEnd = stat.lastIndexOf(')');
    if (commandEnd < 0) return null;
    const fieldsAfterCommand = stat.slice(commandEnd + 1).trim().split(/\s+/);
    return fieldsAfterCommand[19] ?? null;
  } catch {
    return null;
  }
}

function readBootId(): string | null {
  if (process.platform !== 'linux') return null;
  try {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function captureProcessIdentity(pid: number): ProcessIdentity {
  return {
    pid,
    proc_start_time_ticks: readProcStartTimeTicks(pid),
    boot_id: readBootId(),
  };
}

function isHolderProcessAlive(identity: unknown, pidFallback?: unknown): boolean {
  const pid = isRecord(identity) ? identity.pid : pidFallback;
  if (!isProcessAlive(pid)) return false;
  const current = captureProcessIdentity(pid as number);
  if (
    isRecord(identity)
    && typeof identity.proc_start_time_ticks === 'string'
    && current.proc_start_time_ticks !== null
    && identity.proc_start_time_ticks !== current.proc_start_time_ticks
  ) {
    return false;
  }
  if (
    isRecord(identity)
    && typeof identity.boot_id === 'string'
    && current.boot_id !== null
    && identity.boot_id !== current.boot_id
  ) {
    return false;
  }
  return true;
}

function readLockJsonOrNull(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isStaleLockFile(filePath: string, staleAfterMs: number): boolean {
  if (staleAfterMs <= 0) return false;
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

function isReclaimableLock(filePath: string, defaultStaleAfterMs: number): boolean {
  const lock = readLockJsonOrNull(filePath);
  if (!lock) {
    return isStaleLockFile(filePath, defaultStaleAfterMs);
  }
  if (!isHolderProcessAlive(lock.process_identity, lock.pid)) {
    return true;
  }
  const staleMs = typeof lock.stale_after_ms === 'number' && Number.isFinite(lock.stale_after_ms)
    ? lock.stale_after_ms
    : defaultStaleAfterMs;
  return isStaleLockFile(filePath, staleMs);
}

export function writeExclusiveFileSync(
  filePath: string,
  content: Buffer | string,
  mode = 0o600,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, 'wx', mode);
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

interface LockFileIdentity {
  readonly dev: number;
  readonly ino: number;
  readonly mtimeMs: number;
  readonly size: number;
  readonly raw: string;
}

const META_LOCK_STALE_AFTER_MS = 10_000;

function readLockIdentity(filePath: string): LockFileIdentity | null {
  try {
    const stat = fs.lstatSync(filePath);
    const raw = stat.isFile() ? fs.readFileSync(filePath, 'utf8') : '';
    return {
      dev: stat.dev,
      ino: stat.ino,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      raw,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function lockIdentitiesEqual(a: LockFileIdentity, b: LockFileIdentity): boolean {
  return (
    a.dev === b.dev
    && a.ino === b.ino
    && a.mtimeMs === b.mtimeMs
    && a.size === b.size
    && a.raw === b.raw
  );
}

function tryAcquireReclaimMetaLock(
  metaLockPath: string,
  metaOwnerId: string,
  metaAcquiredAt: string,
): boolean {
  const metaPayload = `${JSON.stringify({
    owner_id: metaOwnerId,
    pid: process.pid,
    acquired_at: metaAcquiredAt,
    process_identity: captureProcessIdentity(process.pid),
    stale_after_ms: META_LOCK_STALE_AFTER_MS,
  })}\n`;

  try {
    writeExclusiveFileSync(metaLockPath, metaPayload, 0o600);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const staleObserved = readLockIdentity(metaLockPath);
    if (!staleObserved || !isReclaimableLock(metaLockPath, META_LOCK_STALE_AFTER_MS)) {
      return false;
    }
    const staleCurrent = readLockIdentity(metaLockPath);
    if (!staleCurrent || !lockIdentitiesEqual(staleObserved, staleCurrent)) {
      return false;
    }
    try {
      fs.unlinkSync(metaLockPath);
    } catch (unlinkErr) {
      if ((unlinkErr as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkErr;
    }
    try {
      writeExclusiveFileSync(metaLockPath, metaPayload, 0o600);
      return true;
    } catch (retryErr) {
      if ((retryErr as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw retryErr;
    }
  }
}

function releaseOwnedLockFile(
  filePath: string,
  ownerId: string,
  acquiredAt: string,
): void {
  const current = readLockJsonOrNull(filePath);
  if (
    current
    && current.pid === process.pid
    && current.owner_id === ownerId
    && current.acquired_at === acquiredAt
  ) {
    fs.rmSync(filePath, { force: true });
  }
}

export function reclaimLockFileAtomically(
  lockPath: string,
  shouldReclaim: (filePath: string) => boolean,
): boolean {
  const observed = readLockIdentity(lockPath);
  if (!observed) return false;
  if (!shouldReclaim(lockPath)) return false;

  const metaLockPath = `${lockPath}.reclaim.lock`;
  const metaOwnerId = `reclaim_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const metaAcquiredAt = nowIso();
  if (!tryAcquireReclaimMetaLock(metaLockPath, metaOwnerId, metaAcquiredAt)) {
    return false;
  }

  try {
    const current = readLockIdentity(lockPath);
    if (!current || !lockIdentitiesEqual(observed, current)) {
      return false;
    }
    if (!shouldReclaim(lockPath)) {
      return false;
    }
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  } finally {
    releaseOwnedLockFile(metaLockPath, metaOwnerId, metaAcquiredAt);
  }
}

export function acquireAdvisoryLock(
  lockPath: string,
  options: AdvisoryLockOptions = {},
): AdvisoryLockHandle {
  const resolvedPath = path.resolve(lockPath);
  const ownerId = options.ownerId?.trim() || `owner_${crypto.randomBytes(6).toString('hex')}`;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const timeoutMs = options.timeoutMs ?? 0;
  const pollMs = options.pollMs ?? 25;
  const mode = options.mode ?? 0o600;
  const startedAtMs = Date.now();
  const acquiredAt = nowIso();

  const payload: AdvisoryLockPayload = {
    owner_id: ownerId,
    pid: process.pid,
    acquired_at: acquiredAt,
    process_identity: captureProcessIdentity(process.pid),
    stale_after_ms: staleAfterMs,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  while (true) {
    try {
      writeExclusiveFileSync(resolvedPath, serialized, mode);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

      if (isReclaimableLock(resolvedPath, staleAfterMs)) {
        const reclaimed = reclaimLockFileAtomically(resolvedPath, (candidatePath) =>
          isReclaimableLock(candidatePath, staleAfterMs),
        );
        if (reclaimed) continue;
      }

      if (Date.now() - startedAtMs >= timeoutMs) {
        const holder = readLockJsonOrNull(resolvedPath);
        throw new KernelError(
          'LOCK_CONTENTION',
          `Advisory lock is already held at '${resolvedPath}'.`,
          { lock_file: resolvedPath, held_by: holder },
        );
      }
      waitBrieflySync(pollMs);
    }
  }

  let released = false;
  return {
    lock_file: resolvedPath,
    owner_id: ownerId,
    pid: process.pid,
    acquired_at: acquiredAt,
    release: () => {
      if (released) return false;
      const current = readLockJsonOrNull(resolvedPath);
      if (
        current
        && current.pid === process.pid
        && current.owner_id === ownerId
        && current.acquired_at === acquiredAt
      ) {
        fs.rmSync(resolvedPath, { force: true });
        released = true;
        return true;
      }
      return false;
    },
  };
}

export function withAdvisoryLockSync<T>(
  lockPath: string,
  fn: (handle: AdvisoryLockHandle) => T,
  options: AdvisoryLockOptions = {},
): T {
  const handle = acquireAdvisoryLock(lockPath, options);
  try {
    return fn(handle);
  } finally {
    handle.release();
  }
}
