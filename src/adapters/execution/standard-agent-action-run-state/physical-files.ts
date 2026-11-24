import fs from 'node:fs';
import path from 'node:path';
import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { fail, validateRunId } from './fields.ts';

export const ACTION_RUN_STATE_RELATIVE_ROOT = 'control/opl/action_run_state';

export function workspaceRoot(input: string) {
  if (!path.isAbsolute(input)) fail('Standard Agent action state requires an absolute workspace root.');
  let root: string;
  try {
    root = fs.realpathSync.native(input);
  } catch (error) {
    fail('Standard Agent action state requires an existing workspace root.', {
      workspace_root: input,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(root!).isDirectory()) fail('Standard Agent action workspace root must be a directory.');
  return root!;
}

export function assertContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  fail('Standard Agent action state path escapes the workspace root.', { workspace_root: root, path: candidate });
}

export function ensureDirectory(root: string, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    const candidate = path.join(current, segment);
    if (!fs.existsSync(candidate)) {
      try {
        fs.mkdirSync(candidate, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Standard Agent action state contains a non-directory or symbolic-link component.', { path: candidate });
    }
    current = fs.realpathSync.native(candidate);
    assertContained(root, current);
  }
  return current;
}

export function fsyncDirectory(directory: string) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function writeExactFile(file: string, bytes: Buffer) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function sameFileIdentity(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(left: fs.BigIntStats, right: fs.BigIntStats) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

export function readStablePhysicalFile(file: string, label: string) {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) fail(`${label} must be a physical file.`, { file });
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  try {
    const openedBefore = fs.fstatSync(fd, { bigint: true });
    if (!openedBefore.isFile() || !sameFileIdentity(before, openedBefore)) {
      fail(`${label} changed identity before reading.`, { file });
    }
    const bytes = fs.readFileSync(fd);
    const openedAfter = fs.fstatSync(fd, { bigint: true });
    let after: fs.BigIntStats;
    try {
      after = fs.lstatSync(file, { bigint: true });
    } catch {
      fail(`${label} changed identity while reading.`, { file });
    }
    if (
      after!.isSymbolicLink()
      || !sameStableFile(openedBefore, openedAfter)
      || !sameStableFile(openedAfter, after!)
      || BigInt(bytes.byteLength) !== after!.size
    ) {
      fail(`${label} changed while reading.`, { file });
    }
    return { bytes, stat: openedAfter };
  } finally {
    fs.closeSync(fd);
  }
}

export function stateDirectory(root: string, runId: string) {
  validateRunId(runId);
  const directory = path.join(root, ...ACTION_RUN_STATE_RELATIVE_ROOT.split('/'), runId);
  assertContained(root, directory);
  return directory;
}

export function readCanonicalRecord(file: string, label: string) {
  const { bytes } = readStablePhysicalFile(file, label);
  const value = parseJsonText(bytes.toString('utf8'));
  if (!isRecord(value) || !bytes.equals(canonicalJsonBytes(value))) {
    fail(`${label} must contain one canonical JSON object.`, { file });
  }
  return value;
}
