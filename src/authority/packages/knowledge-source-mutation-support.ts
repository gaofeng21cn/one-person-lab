import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export function fail(message: string): never { throw new FrameworkContractError('contract_shape_invalid', message); }
export function digest(bytes: Buffer | string) { return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`; }
export function encoded(value: unknown) { return Buffer.from(`${canonicalJsonText(value)}\n`); }
export function readJson(file: string) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
// This serializes cooperating writers on one host; it is not a cloud filesystem transaction.
export function withRegistryLock<T>(registry: string, run: () => T): T {
  const lock = `${registry}.knowledge-writeback.lock`;
  const marker = encoded({ host: os.hostname(), pid: process.pid, token: crypto.randomUUID() });
  const acquire = () => {
    try { return fs.openSync(lock, 'wx', 0o600); }
    catch {
      if (!fs.existsSync(lock) || fs.lstatSync(lock).isSymbolicLink()) fail('Knowledge registry has an unreconciled writer lock.');
      const previous = fs.readFileSync(lock);
      let value: { host?: string; pid?: number };
      try { value = JSON.parse(previous.toString('utf8')); } catch { fail('Knowledge registry lock is malformed.'); }
      if (value!.host !== os.hostname() || !Number.isInteger(value!.pid) || value!.pid! < 1) fail('Knowledge registry has another host writer lock.');
      try { process.kill(value!.pid!, 0); fail('Knowledge registry has an active writer lock.'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
      if (!fs.readFileSync(lock).equals(previous)) fail('Knowledge writer lock changed during reconciliation.');
      fs.unlinkSync(lock);
      return fs.openSync(lock, 'wx', 0o600);
    }
  };
  const fd = acquire();
  try { fs.writeFileSync(fd!, marker); fs.fsyncSync(fd!); return run(); }
  finally {
    fs.closeSync(fd);
    if (fs.existsSync(lock) && fs.readFileSync(lock).equals(marker)) fs.unlinkSync(lock);
  }
}

export function safePath(root: string, ref: string) {
  if (path.isAbsolute(ref) || ref.includes('\\') || path.posix.normalize(ref) !== ref || ref.split('/').includes('..')) {
    fail('Knowledge writeback path must be a canonical contained relative path.');
  }
  const base = fs.realpathSync(root);
  const target = path.join(base, ref);
  if (!target.startsWith(`${base}${path.sep}`)) fail('Knowledge writeback path escapes its workspace.');
  let cursor = base;
  for (const part of ref.split('/')) {
    cursor = path.join(cursor, part);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) fail('Knowledge writeback cannot traverse a symlink.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return target;
}

export function atomic(file: string, bytes: Buffer, exclusive = false) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail('Knowledge writeback refuses a symlink target.');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (exclusive) {
    const fd = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return;
  }
  const temporary = path.join(path.dirname(file), `.opl-knowledge-${crypto.randomUUID()}`);
  try { atomic(temporary, bytes, true); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

/** Publish a complete file without replacing an already-created path. */
export function atomicNoClobber(file: string, bytes: Buffer) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail('Knowledge writeback refuses a symlink target.');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(file), `.opl-knowledge-publish-${crypto.randomUUID()}`);
  let fd: number | undefined;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    // A hard link is an atomic no-clobber publication on the same filesystem.
    fs.linkSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

