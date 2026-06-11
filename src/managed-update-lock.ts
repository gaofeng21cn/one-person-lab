import fs from 'node:fs';

import { FrameworkContractError } from './contracts.ts';
import type { ManagedUpdateOperation } from './managed-update-kernel.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

const MANAGED_UPDATE_KERNEL_ID = 'opl_managed_updater_kernel';
const STALE_AFTER_SECONDS = 1800;

type ManagedUpdateLockReceipt = {
  lock_id: string;
  surface_id: string;
  operation: ManagedUpdateOperation;
  component_id: string | null;
  receipt_id: string | null;
  acquired_at: string;
  pid: number;
  stale_after_seconds: number;
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
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function createLockFile(file: string, receipt: ManagedUpdateLockReceipt) {
  const handle = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(handle, `${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    fs.closeSync(handle);
  }
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
  operation: ManagedUpdateOperation;
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
    stale_after_seconds: STALE_AFTER_SECONDS,
  };

  try {
    createLockFile(file, receipt);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST' && isStaleLock(file)) {
      fs.rmSync(file, { force: true });
      createLockFile(file, receipt);
    } else {
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
