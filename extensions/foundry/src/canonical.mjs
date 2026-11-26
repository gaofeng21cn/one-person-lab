import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const KEBAB_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SCOPED_ID_RE = /^(?:[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9])$/;
export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
export const CODEX_PLUGIN_NAME_RE = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const SAFE_SINGLE_SEGMENT_ID_RE = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const EXCLUDED_TOP_DIRS = new Set(['.git', 'node_modules']);
const EXCLUDED_DIRS = new Set(['__pycache__', '.pytest_cache', '.ruff_cache']);
const EXCLUDED_RELEASE_NAMES = new Set(['.DS_Store', 'opl-release.lock.json']);
const EXCLUDED_FILE_SUFFIXES = ['.pyc'];

export function isSafeSingleSegmentId(value) {
  return (
    typeof value === 'string'
    && SAFE_SINGLE_SEGMENT_ID_RE.test(value)
    && !value.includes('/')
    && !value.includes('\\')
  );
}

export function resolveContainedPath(baseDir, ...segments) {
  const absBase = path.resolve(baseDir);
  const target = path.resolve(absBase, ...segments);
  const rel = path.relative(absBase, target);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Resolved path escapes base directory '${absBase}': ${segments.join('/')}`);
  }
  return target;
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeCanonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeCanonicalValue(item)));
  }
  if (isRecord(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      const next = value[key];
      if (next !== undefined) {
        sorted[key] = normalizeCanonicalValue(next);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalJsonText(value) {
  return JSON.stringify(normalizeCanonicalValue(value));
}

export function sha256Digest(input) {
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `sha256:${hash}`;
}

export function contentRefDigest(value) {
  return sha256Digest(Buffer.from(canonicalJsonText(value), 'utf8'));
}

export function isSafeRelativePosixPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (/^[A-Za-z]:/.test(value) || value.startsWith('/')) return false;
  if (value === '.' || value === '..') return false;
  const normalized = value.startsWith('./') ? value.slice(2) : value;
  if (!normalized || normalized.startsWith('/')) return false;
  return normalized.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export function normalizeRelativePosixPath(value) {
  const clean = value.startsWith('./') ? value.slice(2) : value;
  return clean.replace(/\/+$/, '');
}

export function isDshEntrySafePath(value) {
  if (!isSafeRelativePosixPath(value)) return false;
  const normalized = normalizeRelativePosixPath(value);
  return normalized !== 'vendor' && !normalized.startsWith('vendor/') && !normalized.includes('/vendor/');
}

export function resolveSafePath(packageRoot, relPath, options = {}) {
  if (!isSafeRelativePosixPath(relPath)) {
    throw new Error(`Unsafe relative POSIX path: ${String(relPath)}`);
  }
  const allowSymlinks = options.allowSymlinks ?? false;
  const realRoot = fs.realpathSync(packageRoot);
  const cleanRel = normalizeRelativePosixPath(relPath);
  const candidate = path.resolve(realRoot, cleanRel);

  const relCheck = path.relative(realRoot, candidate);
  if (!relCheck || relCheck === '..' || relCheck.startsWith(`..${path.sep}`) || path.isAbsolute(relCheck)) {
    throw new Error(`Path escapes package root: ${relPath}`);
  }
  if (!fs.existsSync(candidate)) {
    throw new Error(`Referenced path does not exist: ${relPath}`);
  }
  if (!allowSymlinks) {
    const parts = cleanRel.split('/');
    let cur = realRoot;
    for (const part of parts) {
      cur = path.join(cur, part);
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) {
        throw new Error(`Symlink not allowed at path: ${relPath}`);
      }
    }
  }
  const realTarget = fs.realpathSync(candidate);
  const realRel = path.relative(realRoot, realTarget);
  if (realRel === '..' || realRel.startsWith(`..${path.sep}`) || path.isAbsolute(realRel)) {
    throw new Error(`Resolved symlink escapes package root: ${relPath}`);
  }
  return realTarget;
}

export function computeReleaseLock(packageRoot) {
  const realRoot = fs.realpathSync(packageRoot);
  const relFiles = [];

  function walk(curDir, relPrefix, isTopLevel) {
    const names = fs.readdirSync(curDir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      if (EXCLUDED_RELEASE_NAMES.has(name)) continue;
      if (isTopLevel && EXCLUDED_TOP_DIRS.has(name)) continue;
      const abs = path.join(curDir, name);
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      const lst = fs.lstatSync(abs);
      if (lst.isSymbolicLink()) {
        throw new Error(`Symlink forbidden in release package: ${rel}`);
      }
      if (lst.isDirectory()) {
        if (EXCLUDED_DIRS.has(name)) continue;
        walk(abs, rel, false);
      } else if (lst.isFile()) {
        if (EXCLUDED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;
        relFiles.push(rel);
      } else {
        throw new Error(`Unsupported special file in release package: ${rel}`);
      }
    }
  }

  walk(realRoot, '', true);
  relFiles.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const hash = crypto.createHash('sha256');
  const lenBuf = Buffer.allocUnsafe(8);
  for (const relPath of relFiles) {
    const absPath = path.join(realRoot, relPath);
    const pathBytes = Buffer.from(relPath, 'utf8');
    const fileBytes = fs.readFileSync(absPath);
    lenBuf.writeBigUInt64BE(BigInt(pathBytes.length), 0);
    hash.update(lenBuf);
    hash.update(pathBytes);
    lenBuf.writeBigUInt64BE(BigInt(fileBytes.length), 0);
    hash.update(lenBuf);
    hash.update(fileBytes);
  }

  return {
    canonicalization: 'ordered_path_length_file_length_bytes',
    file_count: relFiles.length,
    paths: relFiles,
    digest: `sha256:${hash.digest('hex')}`,
  };
}
