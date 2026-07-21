import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { runOplBundledFullRuntimeAgentPackageInstall } from '../agent-package-registry.ts';
import {
  readBundledFullRuntimePackageCatalog,
  type BundledFullRuntimeCatalogEntry,
  type BundledFullRuntimePackageCatalog,
} from '../agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import { readLockIndex } from '../agent-package-registry-parts/store.ts';
import type { AgentPackageLock, AgentPackageLockIndex } from '../agent-package-registry-parts/types.ts';

const FULL_RUNTIME_PACKAGE_ROOT_ENV = new Map<string, string>([
  ['mas', 'OPL_MODULE_PATH_MEDAUTOSCIENCE'],
  ['mag', 'OPL_MODULE_PATH_MEDAUTOGRANT'],
  ['rca', 'OPL_MODULE_PATH_REDCUBE'],
  ['oma', 'OPL_MODULE_PATH_OPLMETAAGENT'],
  ['obf', 'OPL_MODULE_PATH_OPLBOOKFORGE'],
  ['mas-scholar-skills', 'OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS'],
  ['opl-flow', 'OPL_FLOW_REPO_ROOT'],
]);

type FullRuntimePackageInstaller = typeof runOplBundledFullRuntimeAgentPackageInstall;

type FullRuntimePackageReconciliationOptions = {
  installPackage?: FullRuntimePackageInstaller;
  readCatalog?: () => BundledFullRuntimePackageCatalog;
  readInstalledLocks?: () => AgentPackageLockIndex;
};

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: details.failure_code ?? 'full_runtime_package_reconciliation_incomplete',
  });
}

function failureReadback(error: unknown, packageId: string | null = null) {
  if (error instanceof FrameworkContractError) {
    return {
      package_id: packageId,
      code: error.code,
      message: error.message,
      failure_code: typeof error.details?.failure_code === 'string'
        ? error.details.failure_code
        : 'full_runtime_package_reconciliation_incomplete',
      details: error.details ?? {},
    };
  }
  return {
    package_id: packageId,
    code: 'unexpected_error',
    message: error instanceof Error ? error.message : String(error),
    failure_code: 'full_runtime_package_reconciliation_incomplete',
    details: {},
  };
}

function normalizedSha256(value: string | null | undefined) {
  return value?.replace(/^sha256:/, '') ?? null;
}

function expectedCodexDefaultExposure(entry: BundledFullRuntimeCatalogEntry) {
  const manifest = parseJsonText(entry.manifestJson);
  const codexSurface = isRecord(manifest) && isRecord(manifest.codex_surface)
    ? manifest.codex_surface
    : null;
  const declared = codexSurface?.codex_default_exposure;
  if (declared !== undefined && typeof declared !== 'boolean') {
    fail('Bundled Full runtime package declares an invalid Codex exposure policy.', {
      package_id: entry.packageId,
      codex_default_exposure: declared,
      failure_code: 'agent_package_codex_default_exposure_invalid',
    });
  }
  return declared !== false;
}

function hasSkillManifest(root: string) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return false;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else if (entry.isFile() && entry.name === 'SKILL.md') return true;
    }
  }
  return false;
}

function assertCatalogLock(lock: AgentPackageLock, entry: BundledFullRuntimeCatalogEntry) {
  const expectedDefaultExposure = expectedCodexDefaultExposure(entry);
  const mismatches = [
    lock.source_kind === 'bundled_full_runtime_modules' ? null : 'source_kind',
    lock.package_version === entry.packageVersion ? null : 'package_version',
    normalizedSha256(lock.manifest_sha256) === normalizedSha256(entry.manifestSha256)
      ? null
      : 'manifest_sha256',
    lock.owner_source_commit === entry.ownerSourceCommit ? null : 'owner_source_commit',
    !expectedDefaultExposure && lock.exposure_state !== 'hidden' ? 'codex_default_exposure' : null,
  ].filter((value): value is string => value !== null);
  if (mismatches.length > 0) {
    fail('Bundled Full runtime package lock does not match the packaged catalog authority.', {
      package_id: entry.packageId,
      mismatches,
      lock_source_kind: lock.source_kind,
      lock_package_version: lock.package_version,
      expected_package_version: entry.packageVersion,
      lock_manifest_sha256: lock.manifest_sha256,
      expected_manifest_sha256: entry.manifestSha256,
      lock_owner_source_commit: lock.owner_source_commit ?? null,
      expected_owner_source_commit: entry.ownerSourceCommit,
      lock_exposure_state: lock.exposure_state ?? null,
      expected_codex_default_exposure: expectedDefaultExposure,
      failure_code: 'full_runtime_package_lock_stale',
    });
  }
}

function assertMaterializedLock(lock: AgentPackageLock, entry: BundledFullRuntimeCatalogEntry) {
  const surface = lock.physical_surface;
  const scopedOnly = expectedCodexDefaultExposure(entry) === false;
  const cacheSkillsRoot = surface?.codex_plugin_cache_path
    ? path.join(surface.codex_plugin_cache_path, 'skills')
    : null;
  const requiredCachePaths = [
    surface?.plugin_manifest_path,
    surface?.codex_plugin_cache_path,
    ...(surface?.materialized_required_skill_paths ?? []),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const missingCachePaths = requiredCachePaths.filter((candidate) => !fs.existsSync(candidate));
  const marketplaceSkillsRoot = surface?.marketplace_plugin_path
    ? path.join(surface.marketplace_plugin_path, 'skills')
    : null;
  const hiddenSurfaceInvalid = scopedOnly && (
    surface?.marketplace_id !== null
    || surface?.marketplace_root !== null
    || surface?.marketplace_path !== null
    || surface?.marketplace_plugin_path !== null
  );
  const visibleSurfaceInvalid = !scopedOnly && (
    !surface?.marketplace_id
    || !surface.marketplace_root
    || !surface.marketplace_path
    || !surface.marketplace_plugin_path
    || !fs.existsSync(surface.codex_config_path)
    || !fs.existsSync(surface.marketplace_path)
    || !hasSkillManifest(marketplaceSkillsRoot!)
  );

  if (
    surface?.status !== 'materialized'
    || !surface.plugin_id
    || !surface.codex_plugin_cache_path
    || !cacheSkillsRoot
    || !hasSkillManifest(cacheSkillsRoot)
    || missingCachePaths.length > 0
    || hiddenSurfaceInvalid
    || visibleSurfaceInvalid
  ) {
    fail('Bundled Full runtime package did not materialize its required Codex projection.', {
      package_id: lock.package_id,
      physical_surface_status: surface?.status ?? null,
      plugin_id: surface?.plugin_id ?? null,
      scoped_only: scopedOnly,
      marketplace_id: surface?.marketplace_id ?? null,
      marketplace_root: surface?.marketplace_root ?? null,
      marketplace_path: surface?.marketplace_path ?? null,
      marketplace_plugin_path: surface?.marketplace_plugin_path ?? null,
      missing_cache_paths: missingCachePaths,
      cache_skill_manifest_present: Boolean(cacheSkillsRoot && hasSkillManifest(cacheSkillsRoot)),
      marketplace_skill_manifest_present: Boolean(
        marketplaceSkillsRoot && hasSkillManifest(marketplaceSkillsRoot)
      ),
      failure_code: 'full_runtime_package_projection_incomplete',
    });
  }
}

function catalogClosure(
  catalog: BundledFullRuntimePackageCatalog,
  rootPackageId: string,
) {
  const closure: string[] = [];
  const visited = new Set<string>();
  const visit = (packageId: string) => {
    if (visited.has(packageId)) return;
    const entry = catalog.entries.get(packageId);
    if (!entry) {
      fail('Bundled Full runtime package dependency is absent from the catalog.', {
        root_package_id: rootPackageId,
        package_id: packageId,
      });
    }
    visited.add(packageId);
    for (const dependencyId of entry.dependencyPackageIds) visit(dependencyId);
    closure.push(packageId);
  };
  visit(rootPackageId);
  return closure;
}

function rootPackageIds(catalog: BundledFullRuntimePackageCatalog) {
  const dependencies = new Set(
    [...catalog.entries.values()].flatMap((entry) => entry.dependencyPackageIds),
  );
  return [...catalog.entries.keys()].filter((packageId) => !dependencies.has(packageId));
}

function resolvePackageRoots(
  catalog: BundledFullRuntimePackageCatalog,
  env: NodeJS.ProcessEnv,
) {
  const runtimeHome = env.OPL_FULL_RUNTIME_HOME?.trim();
  const roots: Record<string, string> = {};
  for (const entry of catalog.entries.values()) {
    const envKey = FULL_RUNTIME_PACKAGE_ROOT_ENV.get(entry.packageId);
    const explicitRoot = envKey ? env[envKey]?.trim() : null;
    const candidate = explicitRoot
      ? path.resolve(explicitRoot)
      : runtimeHome
        ? path.resolve(runtimeHome, entry.runtimeModuleRelativePath)
        : null;
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      roots[entry.packageId] = candidate;
    }
  }
  return { runtimeHome: runtimeHome ?? null, roots };
}

async function reconcileBundledFullRuntimePackages(
  env: NodeJS.ProcessEnv,
  options: FullRuntimePackageReconciliationOptions,
) {
  const runtimeHome = env.OPL_FULL_RUNTIME_HOME?.trim();
  const hasExplicitPackageRoot = [...FULL_RUNTIME_PACKAGE_ROOT_ENV.values()]
    .some((envKey) => Boolean(env[envKey]?.trim()));
  if (!runtimeHome && !hasExplicitPackageRoot) return null;

  const catalog = (options.readCatalog ?? readBundledFullRuntimePackageCatalog)();
  const packageIds = [...catalog.entries.keys()];
  const roots = rootPackageIds(catalog);
  const resolvedRoots = resolvePackageRoots(catalog, env);
  const missingPackageRoots = packageIds.filter((packageId) => !resolvedRoots.roots[packageId]);
  if (missingPackageRoots.length > 0) {
    const failure = new FrameworkContractError(
      'contract_shape_invalid',
      'Bundled Full runtime package source roots are incomplete.',
      {
        runtime_home: resolvedRoots.runtimeHome,
        missing_package_ids: missingPackageRoots,
        expected_package_count: packageIds.length,
        failure_code: 'full_runtime_package_reconciliation_incomplete',
      },
    );
    return {
      surface_kind: 'opl_full_runtime_package_reconciliation.v1' as const,
      status: 'incomplete' as const,
      catalog_ref: catalog.catalogRef,
      catalog_sha256: catalog.catalogSha256,
      root_package_ids: roots,
      summary: {
        total: packageIds.length,
        installed: 0,
        already_installed: 0,
        installed_package_count: 0,
        materialized_package_count: 0,
        root_package_count: roots.length,
        failed_package_count: missingPackageRoots.length,
      },
      root_installs: [],
      items: packageIds.map((packageId) => ({
        package_id: packageId,
        status: missingPackageRoots.includes(packageId) ? 'source_missing' as const : 'blocked' as const,
      })),
      failures: [failureReadback(failure)],
      retryable: true,
      blocks_plain_codex: false,
    };
  }

  const installedIndex = (options.readInstalledLocks ?? readLockIndex)();
  const locks = new Map(installedIndex.packages.map((lock) => [lock.package_id, lock]));
  const isCurrent = (packageId: string) => {
    const lock = locks.get(packageId);
    const entry = catalog.entries.get(packageId)!;
    if (!lock) return false;
    try {
      assertCatalogLock(lock, entry);
      assertMaterializedLock(lock, entry);
      return true;
    } catch {
      return false;
    }
  };
  const touchedPackageIds = new Set<string>();
  const rootInstalls: Array<Record<string, unknown>> = [];
  const failures: ReturnType<typeof failureReadback>[] = [];
  const installPackage = options.installPackage ?? runOplBundledFullRuntimeAgentPackageInstall;

  for (const packageId of roots) {
    const closure = catalogClosure(catalog, packageId);
    if (closure.every(isCurrent)) {
      rootInstalls.push({
        package_id: packageId,
        status: 'already_installed',
        dependency_transaction_id: locks.get(packageId)?.dependency_transaction_id ?? null,
        dependency_package_ids: closure,
      });
      continue;
    }
    try {
      const result = await installPackage({
        packageId,
        agentRoot: resolvedRoots.roots[packageId],
        packageRoots: resolvedRoots.roots,
      });
      for (const lock of result.opl_agent_package_install.dependency_package_locks) {
        locks.set(lock.package_id, lock);
        touchedPackageIds.add(lock.package_id);
      }
      rootInstalls.push({
        package_id: packageId,
        status: result.opl_agent_package_install.status,
        dependency_transaction_id: result.opl_agent_package_install.dependency_transaction_id,
        dependency_package_ids: result.opl_agent_package_install.dependency_package_locks
          .map((lock) => lock.package_id),
      });
    } catch (error) {
      failures.push(failureReadback(error, packageId));
      rootInstalls.push({
        package_id: packageId,
        status: 'failed',
        dependency_transaction_id: null,
        dependency_package_ids: [],
      });
    }
  }

  const items = packageIds.map((packageId) => {
    const lock = locks.get(packageId);
    const entry = catalog.entries.get(packageId)!;
    if (!lock) {
      failures.push(failureReadback(new FrameworkContractError(
        'contract_shape_invalid',
        'Bundled Full runtime package lock closure is incomplete.',
        {
          package_id: packageId,
          failure_code: 'full_runtime_package_lock_missing',
        },
      ), packageId));
      return { package_id: packageId, status: 'lock_missing' as const };
    }
    try {
      assertCatalogLock(lock, entry);
      assertMaterializedLock(lock, entry);
    } catch (error) {
      const failure = failureReadback(error, packageId);
      failures.push(failure);
      return {
        package_id: packageId,
        status: failure.failure_code === 'full_runtime_package_projection_incomplete'
          ? 'projection_incomplete' as const
          : 'lock_stale' as const,
        package_lock_ref: lock.lock_ref,
      };
    }
    return {
      package_id: packageId,
      status: touchedPackageIds.has(packageId) ? 'installed' as const : 'already_installed' as const,
      package_lock_ref: lock.lock_ref,
      exposure_state: lock.exposure_state ?? null,
      physical_surface_status: lock.physical_surface!.status,
      plugin_id: lock.physical_surface!.plugin_id,
      marketplace_id: lock.physical_surface!.marketplace_id,
      marketplace_plugin_path: lock.physical_surface!.marketplace_plugin_path,
      codex_plugin_cache_path: lock.physical_surface!.codex_plugin_cache_path,
      materialized_required_skill_ids: lock.physical_surface!.materialized_required_skill_ids,
      materialized_required_skill_paths: lock.physical_surface!.materialized_required_skill_paths,
    };
  });
  const completeItems = items.filter((item) =>
    item.status === 'installed' || item.status === 'already_installed'
  );
  const completed = completeItems.length === packageIds.length && failures.length === 0;

  return {
    surface_kind: 'opl_full_runtime_package_reconciliation.v1' as const,
    status: completed ? 'completed' as const : 'incomplete' as const,
    catalog_ref: catalog.catalogRef,
    catalog_sha256: catalog.catalogSha256,
    root_package_ids: roots,
    summary: {
      total: items.length,
      installed: items.filter((item) => item.status === 'installed').length,
      already_installed: items.filter((item) => item.status === 'already_installed').length,
      installed_package_count: completeItems.length,
      materialized_package_count: completeItems.length,
      root_package_count: roots.length,
      failed_package_count: packageIds.length - completeItems.length,
    },
    root_installs: rootInstalls,
    items,
    failures,
    retryable: !completed,
    blocks_plain_codex: false,
  };
}

export async function reconcileBundledFullRuntimePackagesIfAvailable(
  env: NodeJS.ProcessEnv = process.env,
  options: FullRuntimePackageReconciliationOptions = {},
) {
  try {
    return await reconcileBundledFullRuntimePackages(env, options);
  } catch (error) {
    return {
      surface_kind: 'opl_full_runtime_package_reconciliation.v1' as const,
      status: 'incomplete' as const,
      catalog_ref: null,
      catalog_sha256: null,
      root_package_ids: [] as string[],
      summary: {
        total: 0,
        installed: 0,
        already_installed: 0,
        installed_package_count: 0,
        materialized_package_count: 0,
        root_package_count: 0,
        failed_package_count: 1,
      },
      root_installs: [] as Array<Record<string, unknown>>,
      items: [] as Array<Record<string, unknown>>,
      failures: [failureReadback(error)],
      retryable: true,
      blocks_plain_codex: false,
    };
  }
}
