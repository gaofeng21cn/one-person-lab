import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PackError } from '../errors.ts';
import type { OplPackageManifestV2 } from '../manifest/schema.ts';
import {
  isWithinDirectory,
  normalizeRelativePosixPath,
  resolveSafePackagePath,
} from '../manifest/validate.ts';

export const CANONICALIZATION_ALGORITHM = 'ordered_path_length_file_length_bytes' as const;

const DEFAULT_EXCLUDED_TOP_DIRS = new Set(['.git', 'node_modules']);
const DEFAULT_EXCLUDED_DIRS = new Set(['__pycache__', '.pytest_cache', '.ruff_cache', '.venv']);
const DEFAULT_EXCLUDED_NAMES = new Set(['.DS_Store', 'opl-release.lock.json']);
const DEFAULT_EXCLUDED_FILE_SUFFIXES = ['.pyc'] as const;

export function sortPosixPaths(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Compute deterministic SHA-256 digest using 64-bit big-endian length framing:
 * For each path in sorted paths:
 *   [8B UInt64BE pathBytes.length] + pathBytes + [8B UInt64BE fileBytes.length] + fileBytes
 */
export function computePackageContentDigest(
  paths: readonly string[],
  readBytes: (relativePath: string) => Uint8Array,
): string {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of paths) {
    const clean = normalizeRelativePosixPath(raw);
    if (seen.has(clean)) {
      throw new PackError('INVALID_INPUT', `Duplicate path '${clean}' in content digest input.`);
    }
    seen.add(clean);
    normalized.push(clean);
  }
  const sorted = sortPosixPaths(normalized);
  const hash = crypto.createHash('sha256');
  const lenBuf = Buffer.allocUnsafe(8);
  for (const relativePath of sorted) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const fileBytes = readBytes(relativePath);
    lenBuf.writeBigUInt64BE(BigInt(pathBytes.length), 0);
    hash.update(lenBuf);
    hash.update(pathBytes);
    lenBuf.writeBigUInt64BE(BigInt(fileBytes.length), 0);
    hash.update(lenBuf);
    hash.update(fileBytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

export interface CollectPackageFilesOptions {
  readonly allowSymlinks?: boolean;
  readonly excludeNames?: ReadonlySet<string>;
  readonly excludeTopDirs?: ReadonlySet<string>;
  readonly excludeDirs?: ReadonlySet<string>;
  readonly excludeFileSuffixes?: readonly string[];
  readonly excludePaths?: ReadonlySet<string>;
}

export function collectPackageReleasePaths(
  packageRoot: string,
  options: CollectPackageFilesOptions = {},
): string[] {
  const realRoot = fs.realpathSync(packageRoot);
  const allowSymlinks = options.allowSymlinks ?? false;
  const excludeNames = options.excludeNames ?? DEFAULT_EXCLUDED_NAMES;
  const excludeTopDirs = options.excludeTopDirs ?? DEFAULT_EXCLUDED_TOP_DIRS;
  const excludeDirs = options.excludeDirs ?? DEFAULT_EXCLUDED_DIRS;
  const excludeFileSuffixes = options.excludeFileSuffixes ?? DEFAULT_EXCLUDED_FILE_SUFFIXES;
  const excludePaths = options.excludePaths ?? new Set<string>();
  const collected: string[] = [];

  const walk = (absDir: string, relPrefix: string, isTopLevel: boolean): void => {
    const names = fs.readdirSync(absDir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      if (excludeNames.has(name)) continue;
      if (isTopLevel && excludeTopDirs.has(name)) continue;
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      if (excludePaths.has(rel)) continue;
      const absPath = path.join(absDir, name);
      const lstat = fs.lstatSync(absPath);

      if (lstat.isSymbolicLink()) {
        let targetReal: string;
        try {
          targetReal = fs.realpathSync(absPath);
        } catch {
          throw new PackError(
            'PACK_SYMLINK_ESCAPE',
            `Dangling symlink '${rel}' inside package directory.`,
            { package_root: realRoot, path: rel },
          );
        }
        if (!isWithinDirectory(realRoot, targetReal)) {
          throw new PackError(
            'PACK_SYMLINK_ESCAPE',
            `Symlink '${rel}' escapes package root (${targetReal}).`,
            { package_root: realRoot, path: rel, target: targetReal },
          );
        }
        if (!allowSymlinks) {
          throw new PackError(
            'PACK_SYMLINK_ESCAPE',
            `Symlink '${rel}' is forbidden in release package contents.`,
            { package_root: realRoot, path: rel, target: targetReal },
          );
        }
        const targetStat = fs.statSync(targetReal);
        if (targetStat.isDirectory()) {
          if (excludeDirs.has(name)) continue;
          walk(absPath, rel, false);
        } else if (targetStat.isFile()) {
          if (excludeFileSuffixes.some((suffix) => name.endsWith(suffix))) continue;
          collected.push(rel);
        } else {
          throw new PackError(
            'PACK_ARCHIVE_INVALID',
            `Unsupported file type at symlink '${rel}'.`,
            { package_root: realRoot, path: rel },
          );
        }
        continue;
      }

      if (lstat.isDirectory()) {
        if (excludeDirs.has(name)) continue;
        walk(absPath, rel, false);
        continue;
      }

      if (lstat.isFile()) {
        if (excludeFileSuffixes.some((suffix) => name.endsWith(suffix))) continue;
        collected.push(rel);
        continue;
      }

      throw new PackError(
        'PACK_ARCHIVE_INVALID',
        `Unsupported special file '${rel}' inside package directory.`,
        { package_root: realRoot, path: rel },
      );
    }
  };

  walk(realRoot, '', true);
  return sortPosixPaths(collected);
}

function assertRegularFilePath(
  packageRoot: string,
  relPath: string,
  allowSymlinks: boolean,
): void {
  const resolved = resolveSafePackagePath(packageRoot, relPath, { allowSymlinks });
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new PackError(
      'PACK_MISSING_PATH',
      `Expected regular file for manifest path '${relPath}'.`,
      { package_root: packageRoot, path: relPath },
    );
  }
}

function assertRelativeCommandTargetIfLocal(
  packageRoot: string,
  arg: string | undefined,
  allowSymlinks: boolean,
): void {
  if (!arg) return;
  if (arg.startsWith('./') || arg.startsWith('../')) {
    assertRegularFilePath(packageRoot, arg, allowSymlinks);
  }
}

function assertEntrypointPaths(
  packageRoot: string,
  entrypoint:
    | { kind: 'esm_module'; module: string; export: string }
    | { kind: 'cli'; argv: string[] }
    | undefined,
  allowSymlinks: boolean,
): void {
  if (!entrypoint) return;
  if (entrypoint.kind === 'esm_module') {
    assertRegularFilePath(packageRoot, entrypoint.module, allowSymlinks);
  } else {
    for (const arg of entrypoint.argv) {
      assertRelativeCommandTargetIfLocal(packageRoot, arg, allowSymlinks);
    }
  }
}

export function verifyManifestPathsExist(
  packageRoot: string,
  manifest: OplPackageManifestV2,
  options: { allowSymlinks?: boolean } = {},
): void {
  const allowSymlinks = options.allowSymlinks ?? false;

  if (manifest.identity.icon) {
    assertRegularFilePath(packageRoot, manifest.identity.icon, allowSymlinks);
  }

  const provides = manifest.provides;
  if (provides) {
    if (provides.agent?.stages_ref) {
      assertRegularFilePath(packageRoot, provides.agent.stages_ref, allowSymlinks);
    }
    if (provides.agent?.authority_entrypoint) {
      assertEntrypointPaths(packageRoot, provides.agent.authority_entrypoint, allowSymlinks);
    }
    for (const cliBin of provides.cli_bin ?? []) {
      assertRegularFilePath(packageRoot, cliBin.path, allowSymlinks);
    }
    for (const skill of provides.skills ?? []) {
      const skillDir = resolveSafePackagePath(packageRoot, skill.path, { allowSymlinks });
      const dirStat = fs.statSync(skillDir);
      if (!dirStat.isDirectory()) {
        throw new PackError(
          'PACK_MISSING_PATH',
          `Skill path '${skill.path}' must be a directory.`,
          { package_root: packageRoot, path: skill.path },
        );
      }
      const cleanRel = normalizeRelativePosixPath(skill.path).replace(/\/+$/, '');
      assertRegularFilePath(packageRoot, `${cleanRel}/SKILL.md`, allowSymlinks);
    }
    for (const mcp of provides.mcp_servers ?? []) {
      if (mcp.transport === 'stdio') {
        assertRelativeCommandTargetIfLocal(packageRoot, mcp.command, allowSymlinks);
        for (const arg of mcp.args ?? []) {
          if (arg.startsWith('./') || arg.startsWith('../')) {
            assertRegularFilePath(packageRoot, arg, allowSymlinks);
          }
        }
      }
    }
    for (const provider of provides.connection_providers ?? []) {
      assertEntrypointPaths(packageRoot, provider.entrypoint, allowSymlinks);
    }
    for (const channel of provides.channels ?? []) {
      assertEntrypointPaths(packageRoot, channel.entrypoint, allowSymlinks);
    }
    for (const companion of provides.remote_companion_connectors ?? []) {
      assertEntrypointPaths(packageRoot, companion.entrypoint, allowSymlinks);
    }
    for (const executor of provides.executors ?? []) {
      assertEntrypointPaths(packageRoot, executor.entrypoint, allowSymlinks);
    }
    for (const cliExt of provides.cli_extensions ?? []) {
      assertEntrypointPaths(packageRoot, cliExt.entrypoint, allowSymlinks);
    }
    if (provides.contribution_handler) {
      assertEntrypointPaths(packageRoot, provides.contribution_handler, allowSymlinks);
    }
  }

  if (manifest.ui?.dsh_client) {
    assertRegularFilePath(packageRoot, manifest.ui.dsh_client.client_entry, allowSymlinks);
    if (manifest.ui.dsh_client.host_entry) {
      assertRegularFilePath(packageRoot, manifest.ui.dsh_client.host_entry, allowSymlinks);
    }
  }
}
