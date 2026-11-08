import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';

const WAIT_CELL = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const MAX_WAIT_MS = 10_000;

export function connectionAuthorizationStorePath() {
  return `${resolveOplStatePaths().connection_registry_file}.authorization.json`;
}

export function withConnectionStateLock<T>(action: () => T): T {
  const lockPath = `${resolveOplStatePaths().connection_registry_file}.authorization.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const nonce = crypto.randomUUID();
  const owner = Buffer.from(`${process.pid}\n${nonce}\n`);
  const candidate = `${lockPath}.${nonce}.candidate`;
  const handle = fs.openSync(candidate, 'wx', 0o600);
  try {
    fs.writeFileSync(handle, owner);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }

  const startedAt = Date.now();
  let acquired = false;
  try {
    while (!acquired) {
      try {
        fs.linkSync(candidate, lockPath);
        acquired = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const before = fs.lstatSync(lockPath);
        let current = '';
        try { current = fs.readFileSync(lockPath, 'utf8'); } catch { /* Fail closed below. */ }
        const ownerPid = /^([1-9][0-9]*)\n[0-9a-f-]+\n$/i.exec(current)?.[1];
        let ownerGone = false;
        if (ownerPid) {
          try { process.kill(Number(ownerPid), 0); } catch (probeError) {
            ownerGone = (probeError as NodeJS.ErrnoException).code === 'ESRCH';
          }
        }
        if (ownerGone) {
          const after = fs.lstatSync(lockPath);
          const currentBytes = fs.readFileSync(lockPath, 'utf8');
          if (before.ino === after.ino && before.dev === after.dev && current === currentBytes) {
            fs.rmSync(lockPath, { force: true });
          }
          continue;
        }
        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          throw new FrameworkContractError('contract_shape_invalid', 'Connection state is busy.', {
            reason_code: 'connection_state_busy',
          });
        }
        Atomics.wait(WAIT_CELL, 0, 0, 25);
      }
    }
    return action();
  } finally {
    if (acquired) {
      const current = fs.readFileSync(lockPath);
      if (!current.equals(owner)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Connection state lock ownership changed.', {
          reason_code: 'connection_state_lock_owner_changed',
        });
      }
      fs.rmSync(lockPath, { force: true });
    }
    fs.rmSync(candidate, { force: true });
  }
}
