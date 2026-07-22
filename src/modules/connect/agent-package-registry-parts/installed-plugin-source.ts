import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  LEGACY_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
  type PackageContentLockCanonicalization,
} from './payload-content-lock.ts';
import { assertSafePersistedPackagePath } from './persisted-path-safety.ts';
import { resolveCodexHome } from './shared.ts';
import type { AgentPackageLock } from './types.ts';

export function installedPackagePluginSourcePath(lock: AgentPackageLock) {
  return lock.physical_surface?.codex_plugin_cache_path
    ?? lock.physical_surface?.plugin_source_path
    ?? null;
}

function assertImmutableCacheRoot(lock: AgentPackageLock, cachePath: string) {
  const resolvedCachePath = assertSafePersistedPackagePath({
    candidatePath: cachePath,
    allowedRoots: [path.join(
      lock.physical_surface?.codex_home ?? resolveCodexHome(),
      'plugins',
      'cache',
    )],
    pathKind: 'lock.physical_surface.codex_plugin_cache_path',
  });
  const cacheStat = fs.existsSync(resolvedCachePath)
    ? fs.lstatSync(resolvedCachePath)
    : null;
  if (!cacheStat?.isDirectory() || cacheStat.isSymbolicLink()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed package immutable plugin cache is missing or unsafe.',
      {
        package_id: lock.package_id,
        codex_plugin_cache_path: cachePath,
        failure_code: lock.source_kind === 'developer_checkout_override'
          ? 'agent_package_developer_checkout_lkg_unavailable'
          : 'agent_package_plugin_cache_generation_invalid',
      },
    );
  }
  return resolvedCachePath;
}

function contentLockFiles(lock: AgentPackageLock, cachePath: string) {
  const cacheRoot = path.resolve(cachePath);
  const cacheRootReal = fs.realpathSync(cacheRoot);
  return (lock.content_lock_paths ?? []).map((relativePath) => {
    const filePath = path.resolve(cacheRoot, relativePath);
    if (!relativePath.trim()
      || path.isAbsolute(relativePath)
      || filePath === cacheRoot
      || !filePath.startsWith(`${cacheRoot}${path.sep}`)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed package content lock path escapes its immutable cache.',
        {
          package_id: lock.package_id,
          content_lock_path: relativePath,
          codex_plugin_cache_path: cachePath,
          failure_code: 'capability_package_content_lock_path_invalid',
        },
      );
    }
    if (!fs.existsSync(filePath)
      || !fs.lstatSync(filePath).isFile()
      || fs.lstatSync(filePath).isSymbolicLink()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed package immutable cache is missing a content lock path.',
        {
          package_id: lock.package_id,
          content_lock_path: relativePath,
          codex_plugin_cache_path: cachePath,
          failure_code: 'capability_package_content_lock_path_missing',
        },
      );
    }
    const fileReal = fs.realpathSync(filePath);
    if (!fileReal.startsWith(`${cacheRootReal}${path.sep}`)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed package content lock path escapes its immutable cache.',
        {
          package_id: lock.package_id,
          content_lock_path: relativePath,
          codex_plugin_cache_path: cachePath,
          failure_code: 'capability_package_content_lock_path_invalid',
        },
      );
    }
    return { path: relativePath, content: fs.readFileSync(fileReal) };
  });
}

function assertInstalledSkillContentClosure(lock: AgentPackageLock, cachePath: string) {
  if ((lock.content_lock_paths ?? []).length === 0) return;
  const lockedPaths = new Set(lock.content_lock_paths);
  const skillIds = [...new Set([
    ...(lock.bundled_required_skill_ids ?? []),
    ...(lock.capability_provider?.exports ?? []).map((entry) => entry.skill_id),
  ])];
  const unexpectedPaths: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Installed Skill cache only admits regular files and directories.',
          {
            package_id: lock.package_id,
            skill_path: path.relative(cachePath, absolutePath).split(path.sep).join('/'),
            failure_code: 'agent_package_skill_content_lock_entry_unsupported',
          },
        );
      }
      if (stat.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      const relativePath = path.relative(cachePath, absolutePath).split(path.sep).join('/');
      if (!lockedPaths.has(relativePath)) unexpectedPaths.push(relativePath);
    }
  };
  for (const skillId of skillIds) {
    if (!skillId || skillId === '.' || skillId === '..' || path.basename(skillId) !== skillId) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed package Skill id must be a safe path segment.',
        {
          package_id: lock.package_id,
          skill_id: skillId,
          failure_code: 'agent_package_skill_projection_id_unsafe',
        },
      );
    }
    const skillRoot = path.join(cachePath, 'skills', skillId);
    if (fs.existsSync(skillRoot) && fs.lstatSync(skillRoot).isDirectory()) visit(skillRoot);
  }
  if (unexpectedPaths.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed package cache contains projected Skill files outside its content lock.',
      {
        package_id: lock.package_id,
        unexpected_skill_paths: [...new Set(unexpectedPaths)].sort(),
        failure_code: 'agent_package_skill_content_lock_incomplete',
      },
    );
  }
}

export function installedPackageContentLockCanonicalization(
  lock: AgentPackageLock,
  cachePath: string,
): PackageContentLockCanonicalization | null {
  if ((lock.content_lock_paths ?? []).length === 0 || !lock.content_digest) return null;
  const files = contentLockFiles(lock, cachePath);
  for (const canonicalization of [
    CANONICAL_PACKAGE_CONTENT_LOCK,
    LEGACY_PACKAGE_CONTENT_LOCK,
  ] as const) {
    if (packageContentLockDigest(canonicalization, files) === lock.content_digest) {
      assertInstalledSkillContentClosure(lock, cachePath);
      return canonicalization;
    }
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Installed package immutable cache does not match its content lock.',
    {
      package_id: lock.package_id,
      declared_content_digest: lock.content_digest,
      codex_plugin_cache_path: cachePath,
      failure_code: 'capability_package_content_digest_mismatch',
    },
  );
}

export function assertInstalledPackagePluginSource(lock: AgentPackageLock) {
  const sourcePath = installedPackagePluginSourcePath(lock);
  const cachePath = lock.physical_surface?.codex_plugin_cache_path;
  if (!cachePath) return sourcePath;
  const resolvedCachePath = assertImmutableCacheRoot(lock, cachePath);
  if (lock.source_kind !== 'developer_checkout_override') {
    installedPackageContentLockCanonicalization(lock, resolvedCachePath);
  }
  return resolvedCachePath;
}
