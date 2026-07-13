import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  materializeLocalCodexPluginMarketplace,
  removeSupersededOplFamilyCodexConfigTables,
  removeSupersededOplFamilyCodexPluginPaths,
  registerLocalCodexPlugin,
  resolveCanonicalOplFamilyMarketplaceId,
  unregisterLocalCodexPlugin,
} from '../system-installation/codex-plugin-registry.ts';
import {
  fetchJsonSource,
  refsOnlyAuthorityBoundary,
  resolveCodexConfigPath,
  resolveCodexHome,
  safePathSegment,
  validateUrlLike,
} from './shared.ts';
import {
  materializePackageProfile,
  noPackageProfileMigration,
  retainedPackageProfile,
  rollbackPackageProfileMigration,
} from './profile-surface.ts';
import {
  materializeManagedPolicySurface,
  noManagedPolicyMigration,
  rollbackManagedPolicyMigration,
} from './managed-policy-surface.ts';
import type {
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifest,
  AgentPackagePayloadFile,
  AgentPackagePhysicalSurface,
} from './types.ts';

function resolveLocalPath(value: string) {
  return value.startsWith('file:') ? fileURLToPath(value) : path.resolve(value);
}

function safeRelativePayloadPath(value: string) {
  const normalized = path.normalize(value);
  if (
    !value.trim()
    || path.isAbsolute(value)
    || normalized === '.'
    || normalized.startsWith(`..${path.sep}`)
    || normalized === '..'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload file paths must be relative package paths.', {
      payload_path: value,
      failure_code: 'agent_package_payload_path_invalid',
    });
  }
  return normalized;
}

async function readPayloadFileContent(
  entry: Record<string, unknown>,
  payloadManifestUrl: string,
  index: number,
  dryRun: boolean,
) {
  const contentUtf8 = typeof entry.content_utf8 === 'string' ? entry.content_utf8 : null;
  const contentBase64 = typeof entry.content_base64 === 'string' && entry.content_base64.trim()
    ? entry.content_base64.trim()
    : null;
  const sourceUrl = stringValue(entry.source_url);
  const sourceCount = [contentUtf8 !== null, contentBase64 !== null, sourceUrl !== null]
    .filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload files require exactly one content source.', {
      payload_manifest_url: payloadManifestUrl,
      file_index: index,
      required: ['exactly one of content_utf8, content_base64, or source_url'],
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  if (contentBase64 !== null) return { content: Buffer.from(contentBase64, 'base64'), digestVerified: true };
  if (contentUtf8 !== null) return { content: Buffer.from(contentUtf8, 'utf8'), digestVerified: true };

  validateUrlLike(sourceUrl!, 'payload.files[].source_url');
  if (sourceUrl!.startsWith('http://') || sourceUrl!.startsWith('https://')) {
    if (dryRun) return { content: Buffer.alloc(0), digestVerified: false };
    const response = await fetch(sourceUrl!);
    if (!response.ok) {
      throw new FrameworkContractError('codex_command_failed', 'Agent package payload file fetch failed.', {
        source_url: sourceUrl,
        status: response.status,
        status_text: response.statusText,
      });
    }
    return { content: Buffer.from(await response.arrayBuffer()), digestVerified: true };
  }
  return { content: fs.readFileSync(resolveLocalPath(sourceUrl!)), digestVerified: true };
}

async function normalizePayloadFiles(
  payload: unknown,
  payloadManifestUrl: string,
  dryRun: boolean,
): Promise<AgentPackagePayloadFile[]> {
  if (!isRecord(payload) || !Array.isArray(payload.files)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload manifest must contain a files array.', {
      payload_manifest_url: payloadManifestUrl,
      required: ['files'],
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  const fileRecords = recordList(payload.files);
  if (fileRecords.length !== payload.files.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload manifest files must be JSON objects.', {
      payload_manifest_url: payloadManifestUrl,
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  return Promise.all(fileRecords.map(async (entry, index) => {
    const relativePath = stringValue(entry.path);
    if (!relativePath) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload files require a path.', {
        payload_manifest_url: payloadManifestUrl,
        file_index: index,
        required: ['path'],
        failure_code: 'agent_package_payload_manifest_invalid',
      });
    }
    const { content, digestVerified } = await readPayloadFileContent(
      entry,
      payloadManifestUrl,
      index,
      dryRun,
    );
    const sha256 = stringValue(entry.sha256);
    if (sha256 && digestVerified) {
      const expected = sha256.startsWith('sha256:') ? sha256.slice('sha256:'.length) : sha256;
      const actual = crypto.createHash('sha256').update(content).digest('hex');
      if (actual !== expected) {
        throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload file sha256 mismatch.', {
          payload_manifest_url: payloadManifestUrl,
          payload_path: relativePath,
          expected_sha256: sha256,
          actual_sha256: `sha256:${actual}`,
          failure_code: 'agent_package_payload_file_sha256_mismatch',
        });
      }
    }
    return {
      relativePath: safeRelativePayloadPath(relativePath),
      content,
      sha256,
    };
  }));
}

async function materializePayloadManifestSource(input: {
  manifest: AgentPackageManifest;
  payloadManifestUrl: string;
  dryRun: boolean;
}) {
  const fetched = await fetchJsonSource(input.payloadManifestUrl);
  const files = await normalizePayloadFiles(fetched.payload, input.payloadManifestUrl, input.dryRun);
  const payloadRoot = input.dryRun
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-payload-'))
    : path.join(
        resolveOplStatePaths().state_dir,
        'agent-package-payloads',
        safePathSegment(input.manifest.package_id),
        `${safePathSegment(input.manifest.version)}-${fetched.source_sha256.slice(0, 16)}`,
      );
  if (!input.dryRun) {
    fs.rmSync(payloadRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(payloadRoot, { recursive: true });
  for (const file of files) {
    const targetPath = path.join(payloadRoot, file.relativePath);
    if (!targetPath.startsWith(`${payloadRoot}${path.sep}`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload file path escapes the payload root.', {
        payload_manifest_url: input.payloadManifestUrl,
        payload_path: file.relativePath,
        failure_code: 'agent_package_payload_path_invalid',
      });
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content);
  }
  return {
    payloadRoot,
    payloadManifestSha256: fetched.source_sha256,
    persistentCachePath: input.dryRun ? null : payloadRoot,
  };
}

export async function resolveManifestPhysicalSource(
  manifest: AgentPackageManifest,
  dryRun: boolean,
): Promise<AgentPackageManifest> {
  if (manifest.plugin_source_path || !manifest.plugin_payload_manifest_url) {
    return manifest;
  }
  const payload = await materializePayloadManifestSource({
    manifest,
    payloadManifestUrl: manifest.plugin_payload_manifest_url,
    dryRun,
  });
  return {
    ...manifest,
    plugin_source_path: payload.payloadRoot,
    plugin_payload_manifest_sha256: payload.payloadManifestSha256,
    plugin_payload_cache_path: payload.persistentCachePath,
  };
}

function buildPhysicalSurfacePaths(manifest: AgentPackageManifest) {
  const codexHome = resolveCodexHome();
  const pluginId = manifest.plugin_id;
  const marketplaceId = pluginId
    ? resolveCanonicalOplFamilyMarketplaceId(manifest.package_id, pluginId)
      ?? `opl-agent-${safePathSegment(manifest.package_id)}-local`
    : `opl-agent-${safePathSegment(manifest.package_id)}-local`;
  const marketplaceRoot = path.join(resolveOplStatePaths().state_dir, 'codex-plugin-marketplaces', marketplaceId);
  const marketplacePath = path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  const marketplacePluginPath = pluginId ? path.join(marketplaceRoot, 'plugins', pluginId) : null;
  const codexPluginCachePath = pluginId
    ? path.join(codexHome, 'plugins', 'cache', marketplaceId, pluginId, manifest.version)
    : null;
  return {
    codexHome,
    codexConfigPath: resolveCodexConfigPath(codexHome),
    marketplaceId,
    marketplaceRoot,
    marketplacePath,
    marketplacePluginPath,
    codexPluginCachePath,
  };
}

function removeCreatedEmptyCodexConfig(configPath: string, preexisting: boolean) {
  if (preexisting || !fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) return;
  if (fs.readFileSync(configPath, 'utf8').trim().length === 0) {
    fs.rmSync(configPath, { force: true });
  }
}

function copyDirectory(source: string, target: string) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function copyContentLockPaths(source: string, target: string, relativePaths: string[]) {
  fs.rmSync(target, { recursive: true, force: true });
  for (const relativePath of relativePaths) {
    const sourcePath = path.join(source, relativePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability package content lock path is missing from the provider source.', {
        plugin_source_path: source,
        content_lock_path: relativePath,
        failure_code: 'capability_package_content_lock_path_missing',
      });
    }
    const targetPath = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function requiredSkillPath(pluginSourcePath: string, skillId: string) {
  const normalized = skillId.trim();
  if (!normalized || normalized.includes('/') || normalized.includes('\\') || normalized === '.' || normalized === '..') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package required skill id must be a safe path segment.', {
      required_skill_id: skillId,
      failure_code: 'agent_package_required_skill_id_invalid',
    });
  }
  return path.join(pluginSourcePath, 'skills', normalized, 'SKILL.md');
}

function validateMaterializedRequiredSkills(manifest: AgentPackageManifest, pluginSourcePath: string) {
  const requiredSkillPaths = manifest.required_skill_ids.map((skillId) => ({
    skillId,
    skillPath: requiredSkillPath(pluginSourcePath, skillId),
  }));
  const missing = requiredSkillPaths.filter((entry) => !fs.existsSync(entry.skillPath));
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package plugin source must contain bundled required skill files before physical materialization.', {
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      plugin_source_path: pluginSourcePath,
      missing_required_skill_ids: missing.map((entry) => entry.skillId),
      missing_required_skill_paths: missing.map((entry) => entry.skillPath),
      failure_code: 'agent_package_required_skill_missing',
    });
  }
  return requiredSkillPaths;
}

export function materializePhysicalCodexSurface(
  manifest: AgentPackageManifest,
  dryRun: boolean,
  options: { keepMigrationIds?: string[] } = {},
): AgentPackagePhysicalSurface {
  const paths = buildPhysicalSurfacePaths(manifest);
  const codexConfigPreexisting = fs.existsSync(paths.codexConfigPath);
  const pluginSourceInput = manifest.plugin_source_path;
  if (!pluginSourceInput && !manifest.plugin_id) {
    return {
      surface_kind: 'opl_agent_package_physical_codex_surface',
      status: 'not_requested',
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      marketplace_id: null,
      codex_home: paths.codexHome,
      codex_config_path: paths.codexConfigPath,
      codex_config_preexisting: codexConfigPreexisting,
      plugin_source_path: pluginSourceInput,
      plugin_manifest_path: null,
      codex_plugin_cache_path: null,
      marketplace_root: null,
      marketplace_path: null,
      marketplace_plugin_path: null,
      plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
      plugin_payload_manifest_sha256: manifest.plugin_payload_manifest_sha256,
      plugin_payload_cache_path: manifest.plugin_payload_cache_path,
      materialized_required_skill_ids: [],
      materialized_required_skill_paths: [],
      removed_paths: [],
      writes_performed: false,
      reload_required: false,
      failure_reason: null,
      note: 'Manifest did not request Codex plugin materialization with codex_surface.plugin_source_path and codex_surface.plugin_ids.',
      profile_config: null,
      profile_migration: noPackageProfileMigration('Package did not request a physical Codex surface.'),
      managed_policy_config: null,
      workflow_policy_migration: noManagedPolicyMigration('Package did not request a physical Codex surface.'),
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }
  if (!pluginSourceInput || !manifest.plugin_id) {
    throw new FrameworkContractError('contract_shape_invalid', 'A Codex package surface requires both plugin identity and a materializable source.', {
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      plugin_source_path: pluginSourceInput,
      plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
      failure_code: 'agent_package_plugin_source_missing',
    });
  }

  const pluginSourcePath = resolveLocalPath(pluginSourceInput);
  const pluginManifestPath = path.join(pluginSourcePath, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(pluginManifestPath)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package plugin source must contain .codex-plugin/plugin.json before physical materialization.', {
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      plugin_source_path: pluginSourcePath,
      plugin_manifest_path: pluginManifestPath,
      failure_code: 'agent_package_plugin_manifest_missing',
    });
  }
  const materializedRequiredSkills = validateMaterializedRequiredSkills(manifest, pluginSourcePath);

  let profileMigration = noPackageProfileMigration('Package profile materialization has not run.');
  let managedPolicyMigration = noManagedPolicyMigration('Managed policy materialization has not run.');
  let removedSupersededPaths: string[] = [];
  try {
    if (!dryRun) {
      if (manifest.content_lock_paths.length > 0) {
        copyContentLockPaths(pluginSourcePath, paths.codexPluginCachePath!, manifest.content_lock_paths);
      } else {
        copyDirectory(pluginSourcePath, paths.codexPluginCachePath!);
      }
    }
    const materializedSourceRoot = dryRun ? pluginSourcePath : paths.codexPluginCachePath!;
    managedPolicyMigration = materializeManagedPolicySurface({
      manifest,
      sourceRoot: materializedSourceRoot,
      dryRun,
      keepMigrationIds: options.keepMigrationIds,
    });
    if (!dryRun) {
      materializeLocalCodexPluginMarketplace({
        marketplace_id: paths.marketplaceId,
        plugin_id: manifest.plugin_id,
        display_name: manifest.display_name,
        category: 'Productivity',
      }, paths.codexPluginCachePath!, paths.marketplaceRoot);
      registerLocalCodexPlugin(paths.codexConfigPath, {
        marketplace_id: paths.marketplaceId,
        plugin_id: manifest.plugin_id,
      }, paths.marketplaceRoot, (text) => removeSupersededOplFamilyCodexConfigTables(
        text,
        manifest.package_id,
        manifest.plugin_id!,
      ));
    }
    profileMigration = materializePackageProfile({
      manifest,
      sourceRoot: materializedSourceRoot,
      codexHome: paths.codexHome,
      dryRun,
    });
    removedSupersededPaths = removeSupersededOplFamilyCodexPluginPaths(
      manifest.package_id,
      manifest.plugin_id,
      path.dirname(paths.codexHome),
      dryRun,
    );
  } catch (error) {
    if (!dryRun) {
      rollbackPackageProfileMigration(profileMigration);
      unregisterLocalCodexPlugin(paths.codexConfigPath, paths.marketplaceId, manifest.plugin_id);
      removeCreatedEmptyCodexConfig(paths.codexConfigPath, codexConfigPreexisting);
      fs.rmSync(paths.marketplaceRoot, { recursive: true, force: true });
      fs.rmSync(paths.codexPluginCachePath!, { recursive: true, force: true });
      rollbackManagedPolicyMigration(managedPolicyMigration);
    }
    throw error;
  }

  return {
    surface_kind: 'opl_agent_package_physical_codex_surface',
    status: dryRun ? 'validated_no_write' : 'materialized',
    package_id: manifest.package_id,
    plugin_id: manifest.plugin_id,
    marketplace_id: paths.marketplaceId,
    codex_home: paths.codexHome,
    codex_config_path: paths.codexConfigPath,
    codex_config_preexisting: codexConfigPreexisting,
    plugin_source_path: pluginSourcePath,
    plugin_manifest_path: dryRun ? pluginManifestPath : path.join(paths.codexPluginCachePath!, '.codex-plugin', 'plugin.json'),
    codex_plugin_cache_path: paths.codexPluginCachePath,
    marketplace_root: paths.marketplaceRoot,
    marketplace_path: paths.marketplacePath,
    marketplace_plugin_path: paths.marketplacePluginPath,
    plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
    plugin_payload_manifest_sha256: manifest.plugin_payload_manifest_sha256,
    plugin_payload_cache_path: manifest.plugin_payload_cache_path,
    materialized_required_skill_ids: materializedRequiredSkills.map((entry) => entry.skillId),
    materialized_required_skill_paths: materializedRequiredSkills.map((entry) =>
      dryRun ? entry.skillPath : path.join(paths.codexPluginCachePath!, 'skills', entry.skillId, 'SKILL.md')
    ),
    removed_paths: removedSupersededPaths,
    writes_performed: !dryRun,
    reload_required: !dryRun,
    failure_reason: null,
    note: null,
    profile_config: manifest.profile_surface,
    profile_migration: profileMigration,
    managed_policy_config: manifest.managed_policy_surface,
    workflow_policy_migration: managedPolicyMigration,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function removePhysicalCodexSurface(
  surface: AgentPackagePhysicalSurface | undefined,
  dryRun: boolean,
  packageId?: string,
  options: { retainPayloadSource?: boolean } = {},
): AgentPackagePhysicalSurface {
  const codexHome = resolveCodexHome();
  const codexConfigPath = surface?.codex_config_path ?? resolveCodexConfigPath(codexHome);
  const removedPaths = [
    surface?.marketplace_root,
    surface?.codex_plugin_cache_path,
    options.retainPayloadSource ? null : surface?.plugin_payload_cache_path,
  ].flatMap((value) => value ? [value] : []);

  if (!dryRun) {
    unregisterLocalCodexPlugin(codexConfigPath, surface?.marketplace_id ?? null, surface?.plugin_id ?? null);
    removeCreatedEmptyCodexConfig(codexConfigPath, surface?.codex_config_preexisting ?? true);
    for (const pathToRemove of removedPaths) {
      fs.rmSync(pathToRemove, { recursive: true, force: true });
    }
  }

  return {
    surface_kind: 'opl_agent_package_physical_codex_surface',
    status: dryRun ? 'validated_no_write' : 'removed',
    package_id: surface?.package_id ?? packageId ?? '',
    plugin_id: surface?.plugin_id ?? null,
    marketplace_id: surface?.marketplace_id ?? null,
    codex_home: surface?.codex_home ?? codexHome,
    codex_config_path: codexConfigPath,
    codex_config_preexisting: surface?.codex_config_preexisting ?? true,
    plugin_source_path: surface?.plugin_source_path ?? null,
    plugin_manifest_path: surface?.plugin_manifest_path ?? null,
    codex_plugin_cache_path: surface?.codex_plugin_cache_path ?? null,
    marketplace_root: surface?.marketplace_root ?? null,
    marketplace_path: surface?.marketplace_path ?? null,
    marketplace_plugin_path: surface?.marketplace_plugin_path ?? null,
    plugin_payload_manifest_url: surface?.plugin_payload_manifest_url ?? null,
    plugin_payload_manifest_sha256: surface?.plugin_payload_manifest_sha256 ?? null,
    plugin_payload_cache_path: surface?.plugin_payload_cache_path ?? null,
    materialized_required_skill_ids: surface?.materialized_required_skill_ids ?? [],
    materialized_required_skill_paths: surface?.materialized_required_skill_paths ?? [],
    removed_paths: removedPaths,
    writes_performed: !dryRun,
    reload_required: !dryRun && removedPaths.length > 0,
    failure_reason: null,
    note: surface ? null : 'Installed package lock did not contain a physical Codex surface.',
    profile_config: surface?.profile_config ?? null,
    profile_migration: retainedPackageProfile(surface?.profile_migration),
    managed_policy_config: surface?.managed_policy_config ?? null,
    workflow_policy_migration: surface?.workflow_policy_migration
      ?? noManagedPolicyMigration('Installed package did not request a managed policy surface.'),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function payloadSourceRefs(index: AgentPackageLockIndex) {
  return new Set([
    ...index.packages,
    ...(index.last_known_good_transactions ?? []).flatMap((entry) => entry.package_locks),
  ].flatMap((lock) => lock.physical_surface?.plugin_payload_cache_path
    ? [lock.physical_surface.plugin_payload_cache_path]
    : []));
}

export function cleanupUnreferencedPackagePayloadSources(
  previous: AgentPackageLockIndex,
  current: AgentPackageLockIndex,
) {
  const retained = payloadSourceRefs(current);
  for (const payloadPath of payloadSourceRefs(previous)) {
    if (!retained.has(payloadPath)) fs.rmSync(payloadPath, { recursive: true, force: true });
  }
}

export function rollbackManagedPolicySurface(surface: AgentPackagePhysicalSurface | undefined) {
  return rollbackManagedPolicyMigration(surface?.workflow_policy_migration);
}

export function rollbackNewPackageProfileSurface(surface: AgentPackagePhysicalSurface | undefined) {
  return rollbackPackageProfileMigration(surface?.profile_migration);
}

export function rematerializePhysicalCodexSurfaceFromLock(
  lock: AgentPackageLock,
  dryRun: boolean,
): AgentPackagePhysicalSurface {
  if (!lock.physical_surface?.plugin_source_path || !lock.physical_surface.plugin_id) {
    return {
      surface_kind: 'opl_agent_package_physical_codex_surface',
      status: 'not_requested',
      package_id: lock.package_id,
      plugin_id: lock.physical_surface?.plugin_id ?? null,
      marketplace_id: lock.physical_surface?.marketplace_id ?? null,
      codex_home: lock.physical_surface?.codex_home ?? resolveCodexHome(),
      codex_config_path: lock.physical_surface?.codex_config_path ?? resolveCodexConfigPath(),
      codex_config_preexisting: lock.physical_surface?.codex_config_preexisting ?? true,
      plugin_source_path: lock.physical_surface?.plugin_source_path ?? null,
      plugin_manifest_path: lock.physical_surface?.plugin_manifest_path ?? null,
      codex_plugin_cache_path: lock.physical_surface?.codex_plugin_cache_path ?? null,
      marketplace_root: lock.physical_surface?.marketplace_root ?? null,
      marketplace_path: lock.physical_surface?.marketplace_path ?? null,
      marketplace_plugin_path: lock.physical_surface?.marketplace_plugin_path ?? null,
      plugin_payload_manifest_url: lock.physical_surface?.plugin_payload_manifest_url ?? null,
      plugin_payload_manifest_sha256: lock.physical_surface?.plugin_payload_manifest_sha256 ?? null,
      plugin_payload_cache_path: lock.physical_surface?.plugin_payload_cache_path ?? null,
      materialized_required_skill_ids: lock.physical_surface?.materialized_required_skill_ids ?? [],
      materialized_required_skill_paths: lock.physical_surface?.materialized_required_skill_paths ?? [],
      removed_paths: [],
      writes_performed: false,
      reload_required: false,
      failure_reason: null,
      note: 'Installed package lock did not request physical Codex surface repair.',
      profile_config: null,
      profile_migration: noPackageProfileMigration('Installed package did not request a profile surface.'),
      managed_policy_config: null,
      workflow_policy_migration: noManagedPolicyMigration('Installed package did not request a managed policy surface.'),
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  return materializePhysicalCodexSurface({
    package_id: lock.package_id,
    agent_id: lock.agent_id,
    display_name: lock.display_name,
    publisher: lock.publisher,
    version: lock.package_version,
    owner_language_version: lock.owner_language_version,
    source: '',
    codex_surface: {},
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    distribution_payload: null,
    update_channel: '',
    rollback_ref: lock.rollback_ref,
    codex_visible_entry: lock.codex_visible_entry,
    required_skill_ids: lock.bundled_required_skill_ids,
    optional_skill_refs: lock.optional_skill_refs,
    plugin_id: lock.physical_surface.plugin_id,
    plugin_source_path: lock.physical_surface.plugin_source_path,
    plugin_payload_manifest_url: lock.physical_surface.plugin_payload_manifest_url,
    plugin_payload_manifest_sha256: lock.physical_surface.plugin_payload_manifest_sha256,
    plugin_payload_cache_path: lock.physical_surface.plugin_payload_cache_path,
    profile_surface: lock.physical_surface.profile_config,
      managed_policy_surface: lock.physical_surface.managed_policy_config,
      runtime_source_carrier: null,
      managed_update_source: lock.managed_update_source,
    capability_dependencies: lock.capability_dependencies ?? [],
    capability_provider: lock.capability_provider ?? null,
    content_digest: lock.content_digest ?? null,
    content_lock_paths: lock.content_lock_paths ?? [],
  }, dryRun);
}
