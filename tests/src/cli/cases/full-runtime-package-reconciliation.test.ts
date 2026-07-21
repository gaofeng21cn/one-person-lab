import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isRecord } from '../../../../src/kernel/contract-validation.ts';
import { parseJsonText } from '../../../../src/kernel/json-file.ts';
import {
  readBundledFullRuntimePackageCatalog,
  type BundledFullRuntimeCatalogEntry,
  type BundledFullRuntimePackageCatalog,
} from '../../../../src/modules/connect/agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import type {
  AgentPackageLock,
  AgentPackageLockIndex,
} from '../../../../src/modules/connect/agent-package-registry-parts/types.ts';
import { reconcileBundledFullRuntimePackagesIfAvailable } from '../../../../src/modules/connect/system-installation/full-runtime-package-reconciliation.ts';

function manifestProjection(entry: BundledFullRuntimeCatalogEntry) {
  const manifest = parseJsonText(entry.manifestJson) as Record<string, any>;
  const codexSurface = isRecord(manifest.codex_surface) ? manifest.codex_surface : {};
  const pluginId = String(codexSurface.plugin_id ?? entry.packageId);
  const rawRequiredSkillIds: unknown = manifest.surface_kind === 'opl_capability_package_manifest.v2'
    ? [
        ...(manifest.exports?.core_skill_ids ?? []),
        ...(manifest.exports?.specialty_skill_ids ?? []),
      ]
    : (codexSurface.required_skill_ids ?? []);
  const requiredSkillIds = Array.isArray(rawRequiredSkillIds)
    ? rawRequiredSkillIds.map(String)
    : [];
  return {
    pluginId,
    requiredSkillIds,
    scopedOnly: codexSurface.codex_default_exposure === false,
  };
}

function writeMaterializedLock(
  root: string,
  entry: BundledFullRuntimeCatalogEntry,
): AgentPackageLock {
  const projection = manifestProjection(entry);
  const packageRoot = path.join(root, entry.packageId);
  const cacheRoot = path.join(packageRoot, 'cache');
  const pluginManifestPath = path.join(cacheRoot, '.codex-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(pluginManifestPath), { recursive: true });
  fs.writeFileSync(pluginManifestPath, `${JSON.stringify({ name: projection.pluginId })}\n`);
  const materializedRequiredSkillPaths = projection.requiredSkillIds.map((skillId) => {
    const skillPath = path.join(cacheRoot, 'skills', skillId, 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, `# ${skillId}\n`);
    return skillPath;
  });
  const codexConfigPath = path.join(packageRoot, 'codex', 'config.toml');
  let marketplaceRoot: string | null = null;
  let marketplacePath: string | null = null;
  let marketplacePluginPath: string | null = null;
  let marketplaceId: string | null = null;
  if (!projection.scopedOnly) {
    marketplaceId = `${entry.packageId}-local`;
    marketplaceRoot = path.join(packageRoot, 'marketplace');
    marketplacePath = path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
    marketplacePluginPath = path.join(marketplaceRoot, 'plugins', projection.pluginId);
    fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
    fs.writeFileSync(marketplacePath, '{}\n');
    for (const skillId of projection.requiredSkillIds) {
      const skillPath = path.join(marketplacePluginPath, 'skills', skillId, 'SKILL.md');
      fs.mkdirSync(path.dirname(skillPath), { recursive: true });
      fs.writeFileSync(skillPath, `# ${skillId}\n`);
    }
    fs.mkdirSync(path.dirname(codexConfigPath), { recursive: true });
    fs.writeFileSync(codexConfigPath, '# fixture\n');
  }

  return {
    surface_kind: 'opl_agent_package_lock',
    package_id: entry.packageId,
    agent_id: null,
    package_role: entry.packageRole,
    display_name: entry.packageId,
    publisher: 'one-person-lab',
    version_or_source_digest: entry.packageVersion,
    package_version: entry.packageVersion,
    owner_language_version: null,
    installed_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    codex_visible_entry: projection.pluginId,
    bundled_required_skill_ids: projection.requiredSkillIds,
    optional_skill_refs: [],
    source_kind: 'bundled_full_runtime_modules',
    trust_tier: 'first_party',
    action_receipt_id: `opl://fixture/${entry.packageId}`,
    rollback_ref: `opl://fixture/${entry.packageId}/rollback`,
    manifest_url: entry.manifestUrl,
    manifest_sha256: entry.manifestSha256.replace(/^sha256:/, ''),
    owner_source_commit: entry.ownerSourceCommit,
    permission_scope_sha256: 'fixture',
    lock_ref: `opl://fixture/${entry.packageId}/lock`,
    physical_surface: {
      surface_kind: 'opl_agent_package_physical_codex_surface',
      status: 'materialized',
      package_id: entry.packageId,
      plugin_id: projection.pluginId,
      marketplace_id: marketplaceId,
      codex_home: path.dirname(codexConfigPath),
      codex_config_path: codexConfigPath,
      codex_config_preexisting: false,
      plugin_source_path: cacheRoot,
      plugin_manifest_path: pluginManifestPath,
      codex_plugin_cache_path: cacheRoot,
      marketplace_root: marketplaceRoot,
      marketplace_path: marketplacePath,
      marketplace_plugin_path: marketplacePluginPath,
      plugin_payload_manifest_url: null,
      plugin_payload_manifest_sha256: null,
      plugin_payload_cache_path: null,
      materialized_required_skill_ids: projection.requiredSkillIds,
      materialized_required_skill_paths: materializedRequiredSkillPaths,
      removed_paths: [],
      writes_performed: true,
      reload_required: true,
      failure_reason: null,
      note: projection.scopedOnly ? 'workspace only' : null,
      profile_config: null,
      profile_migration: {} as any,
      managed_policy_config: null,
      workflow_policy_migration: {} as any,
      authority_boundary: {} as any,
    },
    exposure_state: projection.scopedOnly ? 'hidden' : 'visible',
    exposure_updated_at: '2026-07-21T00:00:00.000Z',
    capability_provider: null,
    capability_dependencies: [],
    resolved_dependencies: [],
    dependency_closure_digest: `fixture-${entry.packageId}`,
    dependency_transaction_id: `fixture-${entry.packageId}`,
    content_digest: `fixture-${entry.packageId}`,
    content_lock_paths: [],
    scope_materializations: [],
    runtime_source_carrier: null,
    managed_runtime_source: null,
    managed_update_source: null,
  };
}

function closure(catalog: BundledFullRuntimePackageCatalog, rootPackageId: string) {
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = (packageId: string) => {
    if (visited.has(packageId)) return;
    visited.add(packageId);
    for (const dependencyId of catalog.entries.get(packageId)!.dependencyPackageIds) visit(dependencyId);
    result.push(packageId);
  };
  visit(rootPackageId);
  return result;
}

function lockIndex(locks: AgentPackageLock[]): AgentPackageLockIndex {
  return {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: locks,
    last_known_good_transactions: [],
  };
}

test('Full runtime reconciliation closes seven packages while keeping Scholar globally hidden', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-runtime-reconciliation-'));
  const runtimeHome = path.join(root, 'runtime');
  const physicalRoot = path.join(root, 'physical');
  const catalog = readBundledFullRuntimePackageCatalog();
  for (const entry of catalog.entries.values()) {
    fs.mkdirSync(path.join(runtimeHome, entry.runtimeModuleRelativePath), { recursive: true });
  }
  const locks = new Map(
    [...catalog.entries.values()].map((entry) => [entry.packageId, writeMaterializedLock(physicalRoot, entry)]),
  );
  let installCalls = 0;
  const installPackage = async (input: { packageId: string }) => {
    installCalls += 1;
    const dependencyPackageLocks = closure(catalog, input.packageId).map((packageId) => locks.get(packageId)!);
    return {
      version: 'g2',
      opl_agent_package_install: {
        status: 'installed',
        package_lock: locks.get(input.packageId)!,
        dependency_transaction_id: `fixture-${input.packageId}`,
        dependency_package_locks: dependencyPackageLocks,
      },
    } as any;
  };

  try {
    const first = await reconcileBundledFullRuntimePackagesIfAvailable(
      { OPL_FULL_RUNTIME_HOME: runtimeHome },
      {
        installPackage: installPackage as any,
        readCatalog: () => catalog,
        readInstalledLocks: () => lockIndex([]),
      },
    );
    assert.ok(first);
    assert.equal(first.status, 'completed');
    assert.equal(first.retryable, false);
    assert.equal(first.blocks_plain_codex, false);
    assert.equal(first.summary.total, 7);
    assert.equal(first.summary.installed_package_count, 7);
    assert.equal(first.summary.materialized_package_count, 7);
    assert.equal(first.summary.root_package_count, 6);
    assert.equal(installCalls, 6);
    const scholar = first.items.find((item) => item.package_id === 'mas-scholar-skills');
    assert.equal(scholar?.status, 'installed');
    assert.equal('exposure_state' in scholar! ? scholar.exposure_state : null, 'hidden');
    assert.equal('marketplace_id' in scholar! ? scholar.marketplace_id : 'missing', null);
    assert.equal('marketplace_plugin_path' in scholar! ? scholar.marketplace_plugin_path : 'missing', null);
    assert.ok('codex_plugin_cache_path' in scholar! && scholar.codex_plugin_cache_path);

    installCalls = 0;
    const current = await reconcileBundledFullRuntimePackagesIfAvailable(
      { OPL_FULL_RUNTIME_HOME: runtimeHome },
      {
        installPackage: installPackage as any,
        readCatalog: () => catalog,
        readInstalledLocks: () => lockIndex([...locks.values()]),
      },
    );
    assert.ok(current);
    assert.equal(current.status, 'completed');
    assert.equal(current.summary.installed, 0);
    assert.equal(current.summary.already_installed, 7);
    assert.equal(installCalls, 0);

    const missingEntry = catalog.entries.get('obf')!;
    fs.rmSync(path.join(runtimeHome, missingEntry.runtimeModuleRelativePath), {
      recursive: true,
      force: true,
    });
    const incomplete = await reconcileBundledFullRuntimePackagesIfAvailable(
      { OPL_FULL_RUNTIME_HOME: runtimeHome },
      {
        installPackage: installPackage as any,
        readCatalog: () => catalog,
        readInstalledLocks: () => lockIndex([]),
      },
    );
    assert.ok(incomplete);
    assert.equal(incomplete.status, 'incomplete');
    assert.equal(incomplete.retryable, true);
    assert.equal(incomplete.blocks_plain_codex, false);
    assert.equal(
      incomplete.items.find((item) => item.package_id === 'obf')?.status,
      'source_missing',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
