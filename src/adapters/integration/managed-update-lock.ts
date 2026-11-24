import crypto from 'node:crypto';
import fs from 'node:fs';

import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  isProcessAlive as isPidAlive,
  reclaimLockFileAtomically,
  writeExclusiveFileSync,
} from '../../kernel/file-lock.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import type { ManagedUpdateKernelInput } from './managed-update-owner-boundary.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';

const MANAGED_UPDATE_KERNEL_ID = 'opl_managed_updater_kernel';
const STALE_AFTER_SECONDS = 1800;
type LockOperation = ManagedUpdateKernelInput['operation'];

type ManagedUpdateLockReceipt = {
  lock_id: string;
  surface_id: string;
  operation: LockOperation;
  component_id: string | null;
  receipt_id: string | null;
  acquired_at: string;
  pid: number;
  process_identity: ProcessIdentity;
  stale_after_seconds: number;
};

type ProcessIdentity = {
  pid: number;
  proc_start_time_ticks: string | null;
  boot_id: string | null;
};

function nowMs() {
  return Date.now();
}

function lockFilePath() {
  return resolveOplStatePaths().managed_update_kernel_lock_file;
}

function isStaleLock(file: string) {
  try {
    const stat = fs.statSync(file);
    return nowMs() - stat.mtimeMs > STALE_AFTER_SECONDS * 1000;
  } catch {
    return false;
  }
}

function readLockFile(file: string) {
  const payload = readJsonFileOrNull(file);
  return isRecord(payload) ? payload : null;
}

function readProcStartTimeTicks(pid: number) {
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

function readBootId() {
  if (process.platform !== 'linux') return null;
  try {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function processIdentity(pid: number): ProcessIdentity {
  return {
    pid,
    proc_start_time_ticks: readProcStartTimeTicks(pid),
    boot_id: readBootId(),
  };
}

function isProcessAlive(identity: unknown, pidFallback?: unknown) {
  const pid = isRecord(identity) ? identity.pid : pidFallback;
  if (!isPidAlive(pid)) return false;
  const current = processIdentity(pid as number);
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

function isReclaimableLockPayload(lock: Record<string, unknown> | null, file: string) {
  if (lock && !isProcessAlive(lock.process_identity, lock.pid)) return true;
  return isStaleLock(file);
}

function reclaimLockAtomically(file: string) {
  return reclaimLockFileAtomically(file, (guard) => isReclaimableLockPayload(readLockFile(guard), guard));
}

function createLockFile(file: string, receipt: ManagedUpdateLockReceipt) {
  writeExclusiveFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, 0o600);
}

export type ManagedUpdateLockHandle = {
  lock_id: string;
  lock_file: string;
  status: 'acquired';
  acquired_at: string;
  release: () => void;
};

export function managedUpdateLockFilePath() {
  return lockFilePath();
}

export function acquireManagedUpdateLock(input: {
  operation: LockOperation;
  componentId?: string | null;
  receiptId?: string | null;
}): ManagedUpdateLockHandle {
  const paths = ensureOplStateDir();
  const file = paths.managed_update_kernel_lock_file;
  const acquiredAt = new Date().toISOString();
  const receipt: ManagedUpdateLockReceipt = {
    lock_id: `${MANAGED_UPDATE_KERNEL_ID}.global`,
    surface_id: MANAGED_UPDATE_KERNEL_ID,
    operation: input.operation,
    component_id: input.componentId ?? null,
    receipt_id: input.receiptId ?? null,
    acquired_at: acquiredAt,
    pid: process.pid,
    process_identity: processIdentity(process.pid),
    stale_after_seconds: STALE_AFTER_SECONDS,
  };

  let acquired = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      createLockFile(file, receipt);
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const lock = readLockFile(file);
      if (!isReclaimableLockPayload(lock, file) || !reclaimLockAtomically(file)) {
        throw new FrameworkContractError(
          'managed_update_lock_contention',
          'Managed update is already running.',
          {
            surface_id: MANAGED_UPDATE_KERNEL_ID,
            lock_id: `${MANAGED_UPDATE_KERNEL_ID}.global`,
            lock_file: file,
            lock_status: 'held',
            held_by: lock,
            stale_after_seconds: STALE_AFTER_SECONDS,
            repair_action: 'retry_after_current_update_finishes_or_remove_stale_lock_after_timeout',
          },
          3,
        );
      }
    }
  }
  if (!acquired) {
    const lock = readLockFile(file);
    throw new FrameworkContractError(
      'managed_update_lock_contention',
      'Managed update is already running.',
      {
        surface_id: MANAGED_UPDATE_KERNEL_ID,
        lock_id: `${MANAGED_UPDATE_KERNEL_ID}.global`,
        lock_file: file,
        lock_status: 'held',
        held_by: lock,
        stale_after_seconds: STALE_AFTER_SECONDS,
        repair_action: 'retry_after_current_update_finishes_or_remove_stale_lock_after_timeout',
      },
      3,
    );
  }

  return {
    lock_id: receipt.lock_id,
    lock_file: file,
    status: 'acquired',
    acquired_at: acquiredAt,
    release: () => {
      try {
        const lock = readLockFile(file);
        if (lock?.pid === process.pid && lock?.acquired_at === acquiredAt) {
          fs.rmSync(file, { force: true });
        }
      } catch {
        fs.rmSync(file, { force: true });
      }
    },
  };
}

export const MANAGED_UPDATE_LOCK_STALE_AFTER_SECONDS = STALE_AFTER_SECONDS;
