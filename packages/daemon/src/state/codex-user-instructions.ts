import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { KernelError, withAdvisoryLockSync } from '@opl/core';
import { resolveConfiguredCodexHome } from '@opl/pack';

const MAX_EDITABLE_BYTES = 256 * 1024;
const sha256 = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');

function readInstructions(target: string) {
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw new KernelError('INVALID_INPUT', 'User instructions must be a regular file.');
  const file = stat && stat.size <= MAX_EDITABLE_BYTES ? fs.readFileSync(target) : null;
  return {
    surface_kind: 'opl_codex_user_instructions.v1',
    status: !stat ? 'missing' : file ? 'available' : 'too_large',
    path: target,
    exists: Boolean(stat),
    content: !stat ? '' : file?.toString('utf8') ?? null,
    sha256: file ? sha256(file) : null,
    size_bytes: file?.length ?? stat?.size ?? 0,
    max_editable_bytes: MAX_EDITABLE_BYTES,
    source: 'codex_home_agents_md',
  };
}

export function readCodexUserInstructions() {
  return readInstructions(path.join(resolveConfiguredCodexHome(), 'AGENTS.md'));
}

// Writes are restricted to the daemon's effective Codex home. A Fleet node can
// bind its reviewed target to the same directory even when reusing a daemon.
export function writeCodexUserInstructions(stateDir: string, payload: Record<string, unknown>, dryRun: boolean) {
  const target = path.join(resolveConfiguredCodexHome(), 'AGENTS.md');
  if (payload.expected_path !== undefined && payload.expected_path !== target) {
    throw new KernelError('REVISION_CONFLICT', 'The reviewed Profile targets a different Codex home.');
  }
  if (typeof payload.content !== 'string' || payload.content.includes('\0')
      || !(payload.expected_sha256 === null || typeof payload.expected_sha256 === 'string')) {
    throw new KernelError('INVALID_INPUT', 'Profile content and expected_sha256 are required.');
  }
  let content = payload.content.replaceAll('\r\n', '\n');
  if (content && !content.endsWith('\n')) content += '\n';
  const size = Buffer.byteLength(content);
  if (size > MAX_EDITABLE_BYTES) throw new KernelError('INVALID_INPUT', 'User instructions exceed the editing limit.');
  const next = sha256(content);
  const checkCurrent = () => {
    const current = readInstructions(target);
    if (current.status === 'too_large') throw new KernelError('INVALID_INPUT', 'Existing user instructions exceed the editing limit.');
    if (current.sha256 !== payload.expected_sha256) {
      throw new KernelError('REVISION_CONFLICT', 'User instructions changed. Reload before saving.');
    }
    return current;
  };
  const receipt = (previous: string | null) => ({
    surface_kind: 'opl_codex_user_instructions_write.v1', path: target,
    previous_sha256: previous, next_sha256: next, size_bytes: size,
  });
  if (dryRun) return { codex_user_instructions_write: { ...receipt(checkCurrent().sha256), status: 'dry_run' } };

  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return withAdvisoryLockSync(path.join(directory, '.opl-user-instructions.lock'), () => {
    const current = checkCurrent();
    let backup: string | null = null;
    if (current.exists) {
      const backups = path.join(stateDir, 'codex-personalization', 'backups');
      fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
      backup = path.join(fs.mkdtempSync(path.join(backups, 'profile-')), 'AGENTS.md');
      fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
      if (sha256(fs.readFileSync(backup)) !== current.sha256) {
        throw new KernelError('REVISION_CONFLICT', 'User instructions changed while backing up.');
      }
    }
    const stage = path.join(directory, `.AGENTS.md.${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(stage, content, { flag: 'wx', mode: 0o600 });
      if (current.exists) {
        checkCurrent();
        fs.renameSync(stage, target);
      } else {
        // A file created since the reviewed absence must not be overwritten.
        fs.linkSync(stage, target);
      }
    } finally {
      fs.rmSync(stage, { force: true });
    }
    const readback = readInstructions(target);
    if (readback.sha256 !== next) throw new KernelError('REVISION_CONFLICT', 'User instructions changed during readback.');
    return { codex_user_instructions_write: {
      ...receipt(current.sha256), status: 'saved', backup_path: backup, readback,
    } };
  });
}
