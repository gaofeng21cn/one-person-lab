import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  runOplBundledFullRuntimeAgentPackageInstall,
  runOplBundledFullRuntimeAgentPackageUpdate,
} from '../agent-package-registry.ts';
import {
  readBundledFullRuntimePackageCatalog,
  type BundledFullRuntimeCatalogEntry,
  type BundledFullRuntimePackageCatalog,
} from '../agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import { managedPolicyCurrentness } from '../agent-package-registry-parts/managed-policy-surface.ts';
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
type FullRuntimePackageUpdater = typeof runOplBundledFullRuntimeAgentPackageUpdate;

type FullRuntimePackageReconciliationOptions = {
  installPackage?: FullRuntimePackageInstaller;
  updatePackage?: FullRuntimePackageUpdater;
  readCatalog?: () => BundledFullRuntimePackageCatalog;
  readInstalledLocks?: () => AgentPackageLockIndex;
  lifecycleAction?: 'install' | 'update';
  operationId?: string;
  requireSourceRoots?: boolean;
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

function rootTargetIdentity(
  catalog: BundledFullRuntimePackageCatalog,
  packageId: string,
) {
  const entry = catalog.entries.get(packageId)!;
  return {
    target_version: entry.packageVersion,
    target_manifest_sha256: normalizedSha256(entry.manifestSha256),
    target_owner_source_commit: entry.ownerSourceCommit,
    release_catalog_ref: catalog.catalogRef,
    release_catalog_digest: catalog.catalogSha256,
  };
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

function expectedCatalogContentDigest(entry: BundledFullRuntimeCatalogEntry) {
  const payload = parseJsonText(entry.payloadManifestJson);
  const contentLock = isRecord(payload) && isRecord(payload.content_lock)
    ? payload.content_lock
    : null;
  return normalizedSha256(typeof contentLock?.digest === 'string' ? contentLock.digest : null);
}

function assertCatalogLock(
  lock: AgentPackageLock,
  entry: BundledFullRuntimeCatalogEntry,
  catalog: BundledFullRuntimePackageCatalog,
) {
  const expectedDefaultExposure = expectedCodexDefaultExposure(entry);
  const expectedContentDigest = expectedCatalogContentDigest(entry);
  const carrierAuthority = lock.carrier_authority;
  const mismatches = [
    lock.source_kind === 'bundled_full_runtime_modules' ? null : 'source_kind',
    lock.package_version === entry.packageVersion ? null : 'package_version',
    normalizedSha256(lock.manifest_sha256) === normalizedSha256(entry.manifestSha256)
      ? null
      : 'manifest_sha256',
    expectedContentDigest === null
      || normalizedSha256(lock.content_digest) === expectedContentDigest
      ? null
      : 'content_digest',
    lock.owner_source_commit === entry.ownerSourceCommit ? null : 'owner_source_commit',
    carrierAuthority?.catalog_ref === catalog.catalogRef ? null : 'carrier_catalog_ref',
    normalizedSha256(carrierAuthority?.catalog_sha256) === normalizedSha256(catalog.catalogSha256)
      ? null
      : 'carrier_catalog_sha256',
    carrierAuthority?.catalog_owner_source_commit === entry.ownerSourceCommit
      ? null
      : 'carrier_catalog_owner_source_commit',
    carrierAuthority?.manifest_carrier_source_commit === entry.ownerSourceCommit
      ? null
      : 'carrier_manifest_source_commit',
    carrierAuthority?.payload_source_commit === entry.ownerSourceCommit
      ? null
      : 'carrier_payload_source_commit',
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
      lock_content_digest: lock.content_digest,
      expected_content_digest: expectedContentDigest,
      lock_owner_source_commit: lock.owner_source_commit ?? null,
      expected_owner_source_commit: entry.ownerSourceCommit,
      lock_carrier_authority: carrierAuthority ?? null,
      expected_catalog_ref: catalog.catalogRef,
      expected_catalog_sha256: catalog.catalogSha256,
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
  const profileStatus = surface?.profile_migration.status ?? 'not_requested';
  const profileIncomplete = Boolean(surface?.profile_config)
    && !['installed', 'updated', 'current', 'semantic_merge_applied'].includes(profileStatus);
  const policyCurrentness = managedPolicyCurrentness(lock);
  const managedPolicyIncomplete = Boolean(surface?.managed_policy_config)
    && policyCurrentness.status !== 'current';

  if (
    surface?.status !== 'materialized'
    || !surface.plugin_id
    || !surface.codex_plugin_cache_path
    || !cacheSkillsRoot
    || !hasSkillManifest(cacheSkillsRoot)
    || missingCachePaths.length > 0
    || hiddenSurfaceInvalid
    || visibleSurfaceInvalid
    || profileIncomplete
    || managedPolicyIncomplete
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
      profile_migration_status: profileStatus,
      managed_policy_currentness: policyCurrentness,
      failure_code: 'full_runtime_package_projection_incomplete',
    });
  }
}

function assertAppliedPackageLocks(
  locks: AgentPackageLock[],
  rootPackageId: string,
  catalog: BundledFullRuntimePackageCatalog,
  env: NodeJS.ProcessEnv,
) {
  for (const lock of locks) {
    const entry = catalog.entries.get(lock.package_id);
    if (!entry) {
      fail('Managed bundled Full runtime update returned a lock outside the catalog closure.', {
        package_id: rootPackageId,
        updated_package_id: lock.package_id,
        failure_code: 'full_runtime_package_batch_result_invalid',
      });
    }
    assertCatalogLock(lock, entry, catalog);
    assertMaterializedLock(lock, entry);
  }
  if (
    env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED === '1'
    && env.OPL_TEST_MANAGED_BUNDLED_UPDATE_POST_VERIFY_FAIL_PACKAGE_ID === rootPackageId
  ) {
    fail('Injected failure after managed bundled package final verification.', {
      package_id: rootPackageId,
      mutation_started: true,
      failure_code: 'test_managed_bundled_update_post_verify_interrupted',
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
  return [...catalog.entries.values()]
    .filter((entry) => entry.packageRole !== 'framework_capability_package')
    .map((entry) => entry.packageId)
    .filter((packageId) => !dependencies.has(packageId))
    .sort();
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
  if (!runtimeHome && !hasExplicitPackageRoot && !options.requireSourceRoots) return null;

  const catalog = (options.readCatalog ?? readBundledFullRuntimePackageCatalog)();
  const lifecycleAction = options.lifecycleAction ?? 'install';
  const operationId = options.operationId?.trim()
    || `opl://managed-update/bundled-full-runtime/${normalizedSha256(catalog.catalogSha256)}`;
  const packageIds = [...catalog.entries.keys()];
  const roots = rootPackageIds(catalog);
  const resolvedRoots = resolvePackageRoots(catalog, env);

  const installedIndex = (options.readInstalledLocks ?? readLockIndex)();
  const locks = new Map(installedIndex.packages.map((lock) => [lock.package_id, lock]));
  const isCurrent = (packageId: string) => {
    const lock = locks.get(packageId);
    const entry = catalog.entries.get(packageId)!;
    if (!lock) return false;
    try {
      assertCatalogLock(lock, entry, catalog);
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
  const updatePackage = options.updatePackage ?? runOplBundledFullRuntimeAgentPackageUpdate;
  const rootClosures = new Map(roots.map((packageId) => [packageId, catalogClosure(catalog, packageId)]));

  for (const packageId of roots) {
    const closure = rootClosures.get(packageId)!;
    if (closure.every(isCurrent)) {
      rootInstalls.push({
        target_id: packageId,
        package_id: packageId,
        status: 'skipped',
        reason: 'catalog_identity_and_materialized_closure_current',
        action: null,
        result: null,
        ...rootTargetIdentity(catalog, packageId),
        dependency_transaction_id: locks.get(packageId)?.dependency_transaction_id ?? null,
        dependency_package_ids: closure,
      });
      continue;
    }
    try {
      const missingClosureRoots = closure.filter((closurePackageId) =>
        !resolvedRoots.roots[closurePackageId]);
      if (missingClosureRoots.length > 0) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Bundled Full runtime package mutation unit has incomplete source authority.',
          {
            package_id: packageId,
            runtime_home: resolvedRoots.runtimeHome,
            missing_package_ids: missingClosureRoots,
            dependency_package_ids: closure,
            mutation_started: false,
            failure_code: 'full_runtime_package_source_authority_incomplete',
          },
        );
      }
      let updateFinalVerificationCompleted = false;
      const result = lifecycleAction === 'update'
        ? await updatePackage({
            packageId,
            agentRoot: resolvedRoots.roots[packageId],
            packageRoots: resolvedRoots.roots,
            operationId,
            verifyAppliedPackageLocks: async (locks) => {
              assertAppliedPackageLocks(locks, packageId, catalog, env);
              updateFinalVerificationCompleted = true;
            },
          })
        : await installPackage({
            packageId,
            agentRoot: resolvedRoots.roots[packageId],
            packageRoots: resolvedRoots.roots,
          });
      const lifecycleResult = 'opl_agent_package_update' in result
        ? result.opl_agent_package_update
        : result.opl_agent_package_install;
      if (lifecycleAction === 'update' && !updateFinalVerificationCompleted) {
        fail('Managed bundled Full runtime updater returned before final verification completed.', {
          package_id: packageId,
          mutation_started: null,
          failure_code: 'full_runtime_package_final_verification_not_executed',
        });
      }
      if (lifecycleAction === 'install') {
        assertAppliedPackageLocks(
          lifecycleResult.dependency_package_locks,
          packageId,
          catalog,
          {},
        );
      }
      for (const lock of lifecycleResult.dependency_package_locks) {
        locks.set(lock.package_id, lock);
        touchedPackageIds.add(lock.package_id);
      }
      rootInstalls.push({
        target_id: packageId,
        package_id: packageId,
        status: 'completed',
        reason: lifecycleAction === 'update'
          ? 'package_mutation_unit_completed'
          : 'package_install_unit_completed',
        action: lifecycleAction,
        result: lifecycleResult,
        ...rootTargetIdentity(catalog, packageId),
        dependency_transaction_id: lifecycleResult.dependency_transaction_id,
        dependency_package_ids: lifecycleResult.dependency_package_locks
          .map((lock) => lock.package_id),
      });
    } catch (error) {
      const failure = failureReadback(error, packageId);
      const failureDetails = isRecord(failure.details) ? failure.details : {};
      const manualRequired = failure.failure_code === 'agent_package_bundled_managed_surface_manual_required';
      const mutationStarted = failureDetails.mutation_started === true
        ? true
        : failureDetails.mutation_started === false
          ? false
          : null;
      const localPrestateRestored = failureDetails.local_prestate_restored === true
        ? true
        : failureDetails.local_prestate_restored === false
          ? false
          : null;
      failures.push(failure);
      rootInstalls.push({
        target_id: packageId,
        package_id: packageId,
        status: manualRequired ? 'manual_required' : 'failed',
        reason: manualRequired
          ? 'package_mutation_blocked_before_write'
          : 'package_mutation_unit_failed_without_rolling_back_other_roots',
        action: lifecycleAction,
        result: {
          failure,
          package_mutation_unit: {
            scope: 'root_package_and_required_dependency_closure',
            status: typeof failureDetails.package_mutation_status === 'string'
              ? failureDetails.package_mutation_status
              : mutationStarted === false
                ? 'not_started'
                : 'unknown',
            local_prestate_restored: localPrestateRestored,
            mutation_started: mutationStarted,
          },
        },
        ...rootTargetIdentity(catalog, packageId),
        dependency_transaction_id: null,
        dependency_package_ids: closure,
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
      assertCatalogLock(lock, entry, catalog);
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
  const completedRootCount = rootInstalls.filter((entry) =>
    entry.status === 'completed' || entry.status === 'skipped').length;
  const failedRootCount = rootInstalls.filter((entry) => entry.status === 'failed').length;
  const manualRootCount = rootInstalls.filter((entry) => entry.status === 'manual_required').length;
  const unsuccessfulRootCount = failedRootCount + manualRootCount;
  const status = unsuccessfulRootCount === 0
    ? 'completed' as const
    : completedRootCount > 0
      ? 'partial' as const
      : 'failed' as const;
  const readback = {
    surface_kind: 'opl_full_runtime_package_reconciliation.v1' as const,
    status,
    orchestration_policy: 'fail_open_per_root_package' as const,
    package_mutation_policy: 'fail_closed_per_required_dependency_closure' as const,
    lifecycle_action: lifecycleAction,
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
      completed_root_count: completedRootCount,
      manual_required_root_count: manualRootCount,
      failed_root_count: failedRootCount,
      failed_package_count: packageIds.length - completeItems.length,
    },
    root_installs: rootInstalls,
    items,
    failures,
    retryable: status !== 'completed',
    blocks_plain_codex: false,
  };
  return readback;
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
      status: 'failed' as 'failed' | 'incomplete',
      orchestration_policy: 'fail_open_per_root_package' as const,
      package_mutation_policy: 'fail_closed_per_required_dependency_closure' as const,
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
