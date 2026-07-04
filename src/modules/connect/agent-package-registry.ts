import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import {
  parseJsonText,
  readJsonFileOrNull,
  writeJsonPayloadFile,
} from '../../kernel/json-file.ts';
import {
  recordList,
  stringList,
  stringValue,
} from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import {
  materializeLocalCodexPluginMarketplace,
  registerLocalCodexPlugin,
  unregisterLocalCodexPlugin,
} from './system-installation/codex-plugin-registry.ts';

type AgentPackageSourceKind =
  | 'first_party_managed_cohort'
  | 'bundled_full_runtime_modules'
  | 'local_manifest_file'
  | 'manifest_url'
  | 'manifest_import'
  | 'developer_checkout_override';

type AgentPackageLifecycleAction =
  | 'registry_refresh'
  | 'manifest_validate'
  | 'install'
  | 'update'
  | 'repair'
  | 'rollback'
  | 'uninstall'
  | 'hide'
  | 'unhide'
  | 'enable'
  | 'disable';

export type AgentPackageRegistryRefreshInput = {
  registryUrl: string;
};

export type AgentPackageManifestValidateInput = {
  manifestUrl?: string | null;
  registryUrl?: string | null;
  packageId?: string | null;
  trustTier?: string | null;
  sourceKind?: AgentPackageSourceKind | null;
};

export type AgentPackageInstallInput = AgentPackageManifestValidateInput & {
  dryRun?: boolean;
};

export type AgentPackagePackageActionInput = {
  packageId: string;
  dryRun?: boolean;
};

export type AgentPackageRollbackInput = AgentPackageManifestValidateInput & {
  dryRun?: boolean;
};

type FetchJsonResult = {
  source_url: string;
  source_kind: 'http_url' | 'file_url' | 'local_file';
  source_sha256: string;
  payload: unknown;
};

type AgentPackageRegistryEntry = {
  package_id: string;
  display_name: string;
  publisher: string;
  source: string;
  manifest_url: string;
  latest_version: string;
  trust_tier: string;
  starter_default: boolean;
  codex_visible_entry: string | null;
  required_skill_ids: string[];
  optional_skill_ids: string[];
  home_shortcut_ids: string[];
  display_policy: string | null;
};

type AgentPackageManifest = {
  package_id: string;
  agent_id: string;
  display_name: string;
  publisher: string;
  version: string;
  source: string;
  codex_surface: Record<string, unknown>;
  skill_packs: Record<string, unknown>[];
  entrypoints: Record<string, unknown>[];
  health_check: Record<string, unknown>;
  permissions: unknown[];
  update_channel: string;
  rollback_ref: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
  optional_skill_refs: string[];
  plugin_id: string | null;
  plugin_source_path: string | null;
};

type AgentPackagePhysicalSurface = {
  surface_kind: 'opl_agent_package_physical_codex_surface';
  status: 'not_requested' | 'validated_no_write' | 'materialized' | 'removed';
  package_id: string;
  plugin_id: string | null;
  marketplace_id: string | null;
  codex_home: string;
  codex_config_path: string;
  plugin_source_path: string | null;
  plugin_manifest_path: string | null;
  codex_plugin_cache_path: string | null;
  marketplace_root: string | null;
  marketplace_path: string | null;
  marketplace_plugin_path: string | null;
  removed_paths: string[];
  writes_performed: boolean;
  reload_required: boolean;
  note: string | null;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

type AgentPackageLock = {
  surface_kind: 'opl_agent_package_lock';
  package_id: string;
  agent_id: string;
  display_name: string;
  publisher: string;
  version_or_source_digest: string;
  package_version: string;
  installed_at: string;
  updated_at: string;
  codex_visible_entry: string;
  bundled_required_skill_ids: string[];
  optional_skill_refs: string[];
  source_kind: AgentPackageSourceKind;
  trust_tier: string;
  action_receipt_id: string;
  rollback_ref: string;
  manifest_url: string;
  manifest_sha256: string;
  lock_ref: string;
  physical_surface?: AgentPackagePhysicalSurface;
  exposure_state?: 'visible' | 'hidden' | 'enabled' | 'disabled';
  exposure_updated_at?: string;
};

type AgentPackageLifecycleReceipt = {
  surface_kind: 'opl_agent_package_lifecycle_receipt';
  receipt_ref: string;
  receipt_status: 'recorded';
  recorded_at: string;
  action: AgentPackageLifecycleAction;
  action_status: 'completed' | 'validated';
  package_id: string | null;
  registry_url: string | null;
  manifest_url: string | null;
  manifest_sha256: string | null;
  package_lock_ref: string | null;
  rollback_ref: string | null;
  source_kind: AgentPackageSourceKind | 'registry_url';
  trust_tier: string | null;
  writes_performed: boolean;
  source_surface: 'opl_connect_agent_package_registry';
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
  physical_surface?: AgentPackagePhysicalSurface;
};

type AgentPackageRegistryCache = {
  surface_kind: 'opl_agent_package_registry_cache';
  version: 'opl-agent-package-registry-cache.v1';
  refreshed_at: string;
  registry_url: string;
  registry_sha256: string;
  entry_count: number;
  entries: AgentPackageRegistryEntry[];
};

type AgentPackageLockIndex = {
  surface_kind: 'opl_agent_package_lock_index';
  version: 'opl-agent-package-lock-index.v1';
  packages: AgentPackageLock[];
};

type AgentPackageLifecycleLedger = {
  surface_kind: 'opl_agent_package_lifecycle_ledger';
  version: 'opl-agent-package-lifecycle-ledger.v1';
  receipts: AgentPackageLifecycleReceipt[];
};

const REGISTRY_REQUIRED_FIELDS = [
  'package_id',
  'display_name',
  'publisher',
  'source',
  'manifest_url',
  'latest_version',
  'trust_tier',
] as const;

const MANIFEST_REQUIRED_FIELDS = [
  'package_id',
  'agent_id',
  'display_name',
  'publisher',
  'version',
  'source',
  'codex_surface',
  'skill_packs',
  'entrypoints',
  'health_check',
  'permissions',
  'update_channel',
  'rollback_ref',
] as const;

const FORBIDDEN_AGENT_PACKAGE_FIELDS = [
  'session_contract_ref',
  'domain_workflow_schema',
  'prompt_body',
  'artifact_schema',
  'readiness_verdict_rule',
  'quality_verdict_rule',
  'owner_receipt_authority',
] as const;

function nowIso() {
  return new Date().toISOString();
}

function sha256Text(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary() {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_mutate_domain_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function resolveHomeDir() {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || process.cwd();
}

function resolveCodexHome(home = resolveHomeDir()) {
  return process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
}

function resolveCodexConfigPath(codexHome = resolveCodexHome()) {
  return path.join(codexHome, 'config.toml');
}

function safePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '-');
}

function normalizeSourceKind(value: string | null | undefined, manifestUrl: string): AgentPackageSourceKind {
  if (
    value === 'first_party_managed_cohort'
    || value === 'bundled_full_runtime_modules'
    || value === 'local_manifest_file'
    || value === 'manifest_url'
    || value === 'manifest_import'
    || value === 'developer_checkout_override'
  ) {
    return value;
  }
  return manifestUrl.startsWith('file:') || path.isAbsolute(manifestUrl)
    ? 'local_manifest_file'
    : 'manifest_url';
}

function validateUrlLike(value: string, field: string) {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('file:')) {
    return;
  }
  if (path.isAbsolute(value)) {
    return;
  }
  throw new FrameworkContractError('cli_usage_error', `${field} must be http(s), file://, or an absolute local file path.`, {
    field,
    value,
  });
}

async function fetchJsonSource(sourceUrl: string): Promise<FetchJsonResult> {
  validateUrlLike(sourceUrl, 'source_url');
  let raw: string;
  let sourceKind: FetchJsonResult['source_kind'];
  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new FrameworkContractError('codex_command_failed', 'Agent package source fetch failed.', {
        source_url: sourceUrl,
        status: response.status,
        status_text: response.statusText,
      });
    }
    raw = await response.text();
    sourceKind = 'http_url';
  } else {
    const filePath = sourceUrl.startsWith('file:')
      ? fileURLToPath(sourceUrl)
      : path.resolve(sourceUrl);
    raw = fs.readFileSync(filePath, 'utf8');
    sourceKind = sourceUrl.startsWith('file:') ? 'file_url' : 'local_file';
  }

  try {
    return {
      source_url: sourceUrl,
      source_kind: sourceKind,
      source_sha256: sha256Text(raw),
      payload: parseJsonText(raw),
    };
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Agent package source must be valid JSON.', {
      source_url: sourceUrl,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function missingFields(record: Record<string, unknown>, fields: readonly string[]) {
  return fields.filter((field) => {
    const value = record[field];
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    return value === undefined || value === null;
  });
}

function assertNoForbiddenFields(record: Record<string, unknown>, sourceLabel: string) {
  const forbidden = FORBIDDEN_AGENT_PACKAGE_FIELDS.filter((field) => field in record);
  if (forbidden.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package metadata must not define session or domain behavior authority.', {
      source: sourceLabel,
      forbidden_fields: forbidden,
      forbidden_reason: 'OPL App and Framework only manage package install/launch/receipt boundaries.',
    });
  }
}

function normalizeRegistryEntry(entry: Record<string, unknown>, index: number): AgentPackageRegistryEntry {
  const missing = missingFields(entry, REGISTRY_REQUIRED_FIELDS);
  assertNoForbiddenFields(entry, `registry.entries.${index}`);
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entry is missing required fields.', {
      entry_index: index,
      missing_fields: missing,
    });
  }
  const manifestUrl = stringValue(entry.manifest_url)!;
  validateUrlLike(manifestUrl, `entries.${index}.manifest_url`);
  return {
    package_id: stringValue(entry.package_id)!,
    display_name: stringValue(entry.display_name)!,
    publisher: stringValue(entry.publisher)!,
    source: stringValue(entry.source)!,
    manifest_url: manifestUrl,
    latest_version: stringValue(entry.latest_version)!,
    trust_tier: stringValue(entry.trust_tier)!,
    starter_default: entry.starter_default === true,
    codex_visible_entry: stringValue(entry.codex_visible_entry),
    required_skill_ids: stringList(entry.required_skill_ids),
    optional_skill_ids: stringList(entry.optional_skill_ids),
    home_shortcut_ids: stringList(entry.home_shortcut_ids),
    display_policy: stringValue(entry.display_policy),
  };
}

function normalizeRegistry(payload: unknown, registryUrl: string, registrySha256: string): AgentPackageRegistryCache {
  if (!isRecord(payload) || !Array.isArray(payload.entries)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry must contain an entries array.', {
      registry_url: registryUrl,
      required: ['entries'],
    });
  }
  const entries = recordList(payload.entries).map(normalizeRegistryEntry);
  if (entries.length !== payload.entries.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entries must be JSON objects.', {
      registry_url: registryUrl,
      entry_count: payload.entries.length,
      valid_entry_count: entries.length,
    });
  }
  const duplicatePackageIds = entries
    .map((entry) => entry.package_id)
    .filter((packageId, index, values) => values.indexOf(packageId) !== index);
  if (duplicatePackageIds.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry package_id values must be unique.', {
      registry_url: registryUrl,
      duplicate_package_ids: uniqueStrings(duplicatePackageIds),
    });
  }
  return {
    surface_kind: 'opl_agent_package_registry_cache',
    version: 'opl-agent-package-registry-cache.v1',
    refreshed_at: nowIso(),
    registry_url: registryUrl,
    registry_sha256: registrySha256,
    entry_count: entries.length,
    entries,
  };
}

function normalizeSkillPackRefs(skillPacks: Record<string, unknown>[]) {
  return skillPacks.flatMap((pack) => {
    const packId = stringValue(pack.id);
    const source = stringValue(pack.source);
    const version = stringValue(pack.version);
    return packId ? [`${packId}${source ? `@${source}` : ''}${version ? `#${version}` : ''}`] : [];
  });
}

function normalizeManifest(payload: unknown, manifestUrl: string): AgentPackageManifest {
  if (!isRecord(payload)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must be a JSON object.', {
      manifest_url: manifestUrl,
    });
  }
  assertNoForbiddenFields(payload, 'manifest');
  const missing = missingFields(payload, MANIFEST_REQUIRED_FIELDS);
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest is missing required fields.', {
      manifest_url: manifestUrl,
      missing_fields: missing,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (!isRecord(payload.codex_surface) || !isRecord(payload.health_check)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest codex_surface and health_check must be JSON objects.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  const skillPacks = recordList(payload.skill_packs);
  const entrypoints = recordList(payload.entrypoints);
  if (!Array.isArray(payload.skill_packs) || skillPacks.length !== payload.skill_packs.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest skill_packs must be an array of objects.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (!Array.isArray(payload.entrypoints) || entrypoints.length !== payload.entrypoints.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest entrypoints must be an array of objects.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (!Array.isArray(payload.permissions)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest permissions must be an array.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  const requiredSkillIds = uniqueStrings(stringList(payload.codex_surface.required_skill_ids));
  if (requiredSkillIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must declare codex_surface.required_skill_ids.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  const pluginId = stringList(payload.codex_surface.plugin_ids)[0] ?? null;
  const pluginSourcePath = stringValue(payload.codex_surface.plugin_source_path)
    ?? stringValue(payload.codex_surface.local_plugin_source_path)
    ?? stringValue(payload.codex_surface.plugin_root);
  const codexVisibleEntry = pluginId
    ?? stringValue(payload.codex_surface.codex_visible_entry)
    ?? stringValue(payload.agent_id)!;
  return {
    package_id: stringValue(payload.package_id)!,
    agent_id: stringValue(payload.agent_id)!,
    display_name: stringValue(payload.display_name)!,
    publisher: stringValue(payload.publisher)!,
    version: stringValue(payload.version)!,
    source: stringValue(payload.source)!,
    codex_surface: payload.codex_surface,
    skill_packs: skillPacks,
    entrypoints,
    health_check: payload.health_check,
    permissions: payload.permissions,
    update_channel: stringValue(payload.update_channel)!,
    rollback_ref: stringValue(payload.rollback_ref)!,
    codex_visible_entry: codexVisibleEntry,
    required_skill_ids: requiredSkillIds,
    optional_skill_refs: uniqueStrings([
      ...stringList(payload.codex_surface.optional_skill_ids),
      ...normalizeSkillPackRefs(skillPacks.filter((pack) => stringValue(pack.install_mode) !== 'bundled_required')),
    ]),
    plugin_id: pluginId,
    plugin_source_path: pluginSourcePath,
  };
}

function emptyLockIndex(): AgentPackageLockIndex {
  return {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [],
  };
}

function emptyLifecycleLedger(): AgentPackageLifecycleLedger {
  return {
    surface_kind: 'opl_agent_package_lifecycle_ledger',
    version: 'opl-agent-package-lifecycle-ledger.v1',
    receipts: [],
  };
}

function readLockIndex(): AgentPackageLockIndex {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_lock_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.packages)) {
    return emptyLockIndex();
  }
  return {
    ...emptyLockIndex(),
    packages: recordList(parsed.packages).flatMap((entry) => {
      const packageId = stringValue(entry.package_id);
      const lockRef = stringValue(entry.lock_ref);
      return packageId && lockRef ? [entry as AgentPackageLock] : [];
    }),
  };
}

function readLifecycleLedger(): AgentPackageLifecycleLedger {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_lifecycle_ledger_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
    return emptyLifecycleLedger();
  }
  return {
    ...emptyLifecycleLedger(),
    receipts: recordList(parsed.receipts).flatMap((entry) => {
      const receiptRef = stringValue(entry.receipt_ref);
      return receiptRef ? [entry as AgentPackageLifecycleReceipt] : [];
    }),
  };
}

function writeRegistryCache(cache: AgentPackageRegistryCache) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_registry_cache_file, cache);
}

function writeLockIndex(index: AgentPackageLockIndex) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_lock_file, index);
}

function writeLifecycleLedger(ledger: AgentPackageLifecycleLedger) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_lifecycle_ledger_file, ledger);
}

function appendReceipt(receipt: AgentPackageLifecycleReceipt) {
  const ledger = readLifecycleLedger();
  const existingIndex = ledger.receipts.findIndex((entry) => entry.receipt_ref === receipt.receipt_ref);
  if (existingIndex >= 0) {
    ledger.receipts[existingIndex] = receipt;
  } else {
    ledger.receipts.unshift(receipt);
  }
  writeLifecycleLedger(ledger);
}

function resolveLocalPath(value: string) {
  return value.startsWith('file:') ? fileURLToPath(value) : path.resolve(value);
}

function buildPhysicalSurfacePaths(manifest: AgentPackageManifest) {
  const codexHome = resolveCodexHome();
  const marketplaceId = `opl-agent-${safePathSegment(manifest.package_id)}-local`;
  const pluginId = manifest.plugin_id;
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

function copyDirectory(source: string, target: string) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function materializePhysicalCodexSurface(
  manifest: AgentPackageManifest,
  dryRun: boolean,
): AgentPackagePhysicalSurface {
  const paths = buildPhysicalSurfacePaths(manifest);
  const pluginSourceInput = manifest.plugin_source_path;
  if (!pluginSourceInput || !manifest.plugin_id) {
    return {
      surface_kind: 'opl_agent_package_physical_codex_surface',
      status: 'not_requested',
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      marketplace_id: null,
      codex_home: paths.codexHome,
      codex_config_path: paths.codexConfigPath,
      plugin_source_path: pluginSourceInput,
      plugin_manifest_path: null,
      codex_plugin_cache_path: null,
      marketplace_root: null,
      marketplace_path: null,
      marketplace_plugin_path: null,
      removed_paths: [],
      writes_performed: false,
      reload_required: false,
      note: 'Manifest did not request Codex plugin materialization with codex_surface.plugin_source_path and codex_surface.plugin_ids.',
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
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

  if (!dryRun) {
    copyDirectory(pluginSourcePath, paths.codexPluginCachePath!);
    materializeLocalCodexPluginMarketplace({
      marketplace_id: paths.marketplaceId,
      plugin_id: manifest.plugin_id,
      display_name: manifest.display_name,
      category: 'Productivity',
    }, paths.codexPluginCachePath!, paths.marketplaceRoot);
    registerLocalCodexPlugin(paths.codexConfigPath, {
      marketplace_id: paths.marketplaceId,
      plugin_id: manifest.plugin_id,
    }, paths.marketplaceRoot);
  }

  return {
    surface_kind: 'opl_agent_package_physical_codex_surface',
    status: dryRun ? 'validated_no_write' : 'materialized',
    package_id: manifest.package_id,
    plugin_id: manifest.plugin_id,
    marketplace_id: paths.marketplaceId,
    codex_home: paths.codexHome,
    codex_config_path: paths.codexConfigPath,
    plugin_source_path: pluginSourcePath,
    plugin_manifest_path: dryRun ? pluginManifestPath : path.join(paths.codexPluginCachePath!, '.codex-plugin', 'plugin.json'),
    codex_plugin_cache_path: paths.codexPluginCachePath,
    marketplace_root: paths.marketplaceRoot,
    marketplace_path: paths.marketplacePath,
    marketplace_plugin_path: paths.marketplacePluginPath,
    removed_paths: [],
    writes_performed: !dryRun,
    reload_required: !dryRun,
    note: null,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function removePhysicalCodexSurface(
  surface: AgentPackagePhysicalSurface | undefined,
  dryRun: boolean,
  packageId?: string,
): AgentPackagePhysicalSurface {
  const codexHome = resolveCodexHome();
  const codexConfigPath = surface?.codex_config_path ?? resolveCodexConfigPath(codexHome);
  const removedPaths = [
    surface?.marketplace_root,
    surface?.codex_plugin_cache_path,
  ].flatMap((value) => value ? [value] : []);

  if (!dryRun) {
    unregisterLocalCodexPlugin(codexConfigPath, surface?.marketplace_id ?? null, surface?.plugin_id ?? null);
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
    plugin_source_path: surface?.plugin_source_path ?? null,
    plugin_manifest_path: surface?.plugin_manifest_path ?? null,
    codex_plugin_cache_path: surface?.codex_plugin_cache_path ?? null,
    marketplace_root: surface?.marketplace_root ?? null,
    marketplace_path: surface?.marketplace_path ?? null,
    marketplace_plugin_path: surface?.marketplace_plugin_path ?? null,
    removed_paths: removedPaths,
    writes_performed: !dryRun,
    reload_required: !dryRun && removedPaths.length > 0,
    note: surface ? null : 'Installed package lock did not contain a physical Codex surface.',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function rematerializePhysicalCodexSurfaceFromLock(
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
      plugin_source_path: lock.physical_surface?.plugin_source_path ?? null,
      plugin_manifest_path: lock.physical_surface?.plugin_manifest_path ?? null,
      codex_plugin_cache_path: lock.physical_surface?.codex_plugin_cache_path ?? null,
      marketplace_root: lock.physical_surface?.marketplace_root ?? null,
      marketplace_path: lock.physical_surface?.marketplace_path ?? null,
      marketplace_plugin_path: lock.physical_surface?.marketplace_plugin_path ?? null,
      removed_paths: [],
      writes_performed: false,
      reload_required: false,
      note: 'Installed package lock did not request physical Codex surface repair.',
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  return materializePhysicalCodexSurface({
    package_id: lock.package_id,
    agent_id: lock.agent_id,
    display_name: lock.display_name,
    publisher: lock.publisher,
    version: lock.package_version,
    source: '',
    codex_surface: {},
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    update_channel: '',
    rollback_ref: lock.rollback_ref,
    codex_visible_entry: lock.codex_visible_entry,
    required_skill_ids: lock.bundled_required_skill_ids,
    optional_skill_refs: lock.optional_skill_refs,
    plugin_id: lock.physical_surface.plugin_id,
    plugin_source_path: lock.physical_surface.plugin_source_path,
  }, dryRun);
}

function packageReceiptRef(input: {
  action: AgentPackageLifecycleAction;
  packageId?: string | null;
  sourceSha256: string;
}) {
  const subject = input.packageId ?? 'registry';
  return `opl://agent-package/${input.action}/${encodeURIComponent(subject)}/${input.sourceSha256.slice(0, 16)}`;
}

function packageLockRef(packageId: string, version: string, sourceSha256: string) {
  return `opl://agent-package-lock/${encodeURIComponent(packageId)}/${encodeURIComponent(version)}/${sourceSha256.slice(0, 16)}`;
}

function packageActionSourceSha256(action: AgentPackageLifecycleAction, lock: AgentPackageLock) {
  return sha256Text([
    action,
    lock.package_id,
    lock.package_version,
    lock.manifest_sha256,
    lock.lock_ref,
  ].join('\n'));
}

function packageActionStatus(action: AgentPackageLifecycleAction) {
  return {
    install: 'installed',
    update: 'updated',
    repair: 'repaired',
    rollback: 'rolled_back',
    uninstall: 'uninstalled',
    hide: 'hidden',
    unhide: 'visible',
    enable: 'enabled',
    disable: 'disabled',
    registry_refresh: 'refreshed',
    manifest_validate: 'valid',
  }[action];
}

function requirePackageId(packageId: string | null | undefined, action: AgentPackageLifecycleAction) {
  const normalized = stringValue(packageId);
  if (!normalized) {
    throw new FrameworkContractError('cli_usage_error', `Agent package ${action} requires --package-id.`, {
      required: ['--package-id'],
      action,
    });
  }
  return normalized;
}

function requireInstalledPackage(index: AgentPackageLockIndex, packageId: string, action: AgentPackageLifecycleAction) {
  const lockIndex = index.packages.findIndex((entry) => entry.package_id === packageId);
  if (lockIndex < 0) {
    throw new FrameworkContractError('contract_shape_invalid', `Agent package ${action} requires an installed package lock.`, {
      package_id: packageId,
      action,
      failure_code: 'agent_package_lock_missing',
      installed_package_ids: index.packages.map((entry) => entry.package_id),
    });
  }
  return { lockIndex, lock: index.packages[lockIndex] };
}

function lifecycleReceipt(input: {
  action: AgentPackageLifecycleAction;
  actionStatus: 'completed' | 'validated';
  packageId?: string | null;
  registryUrl?: string | null;
  manifestUrl?: string | null;
  manifestSha256?: string | null;
  packageLockRef?: string | null;
  rollbackRef?: string | null;
  sourceKind: AgentPackageLifecycleReceipt['source_kind'];
  trustTier?: string | null;
  sourceSha256: string;
  writesPerformed: boolean;
  physicalSurface?: AgentPackagePhysicalSurface;
}): AgentPackageLifecycleReceipt {
  const receipt: AgentPackageLifecycleReceipt = {
    surface_kind: 'opl_agent_package_lifecycle_receipt',
    receipt_ref: packageReceiptRef({
      action: input.action,
      packageId: input.packageId,
      sourceSha256: input.sourceSha256,
    }),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    action: input.action,
    action_status: input.actionStatus,
    package_id: input.packageId ?? null,
    registry_url: input.registryUrl ?? null,
    manifest_url: input.manifestUrl ?? null,
    manifest_sha256: input.manifestSha256 ?? null,
    package_lock_ref: input.packageLockRef ?? null,
    rollback_ref: input.rollbackRef ?? null,
    source_kind: input.sourceKind,
    trust_tier: input.trustTier ?? null,
    writes_performed: input.writesPerformed,
    source_surface: 'opl_connect_agent_package_registry',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
  if (input.physicalSurface) {
    receipt.physical_surface = input.physicalSurface;
  }
  return receipt;
}

async function resolveManifestSelection(input: AgentPackageManifestValidateInput) {
  const explicitManifestUrl = stringValue(input.manifestUrl);
  const packageId = stringValue(input.packageId);
  const registryUrl = stringValue(input.registryUrl);
  if (explicitManifestUrl) {
    return {
      registryUrl,
      packageId,
      manifestUrl: explicitManifestUrl,
      trustTier: stringValue(input.trustTier),
      registryEntry: null as AgentPackageRegistryEntry | null,
    };
  }
  if (!registryUrl || !packageId) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package manifest selection requires --manifest-url or both --registry-url and --package-id.', {
      required: ['--manifest-url or --registry-url + --package-id'],
    });
  }
  const registry = await fetchAndValidateRegistry(registryUrl);
  const registryEntry = registry.cache.entries.find((entry) => entry.package_id === packageId);
  if (!registryEntry) {
    throw new FrameworkContractError('contract_shape_invalid', 'Requested agent package is not present in the registry.', {
      registry_url: registryUrl,
      package_id: packageId,
      available_package_ids: registry.cache.entries.map((entry) => entry.package_id),
    });
  }
  return {
    registryUrl,
    packageId,
    manifestUrl: registryEntry.manifest_url,
    trustTier: registryEntry.trust_tier,
    registryEntry,
  };
}

async function fetchAndValidateRegistry(registryUrl: string) {
  const fetched = await fetchJsonSource(registryUrl);
  const cache = normalizeRegistry(fetched.payload, registryUrl, fetched.source_sha256);
  return { fetched, cache };
}

function assertTrustTierAssigned(
  trustTier: string | null,
  manifestUrl: string,
): asserts trustTier is string {
  if (!trustTier) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package install requires explicit --trust-tier unless selected from a registry entry.', {
      manifest_url: manifestUrl,
      required: ['--trust-tier'],
      policy: 'manual_third_party_requires_trust_tier_assignment',
    });
  }
}

function assertManifestMatchesRegistrySelection(
  manifest: AgentPackageManifest,
  selection: {
    packageId: string | null;
    registryEntry: AgentPackageRegistryEntry | null;
    registryUrl: string | null;
    manifestUrl: string;
  },
) {
  if (!selection.registryEntry) {
    return;
  }
  if (selection.packageId && manifest.package_id !== selection.packageId) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entry and manifest package_id must match.', {
      registry_url: selection.registryUrl,
      manifest_url: selection.manifestUrl,
      registry_package_id: selection.packageId,
      manifest_package_id: manifest.package_id,
      failure_code: 'registry_manifest_package_id_mismatch',
    });
  }
  if (manifest.version !== selection.registryEntry.latest_version) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entry and manifest version must match.', {
      registry_url: selection.registryUrl,
      manifest_url: selection.manifestUrl,
      package_id: manifest.package_id,
      registry_latest_version: selection.registryEntry.latest_version,
      manifest_version: manifest.version,
      failure_code: 'registry_manifest_version_mismatch',
    });
  }
}

function buildLock(input: {
  manifest: AgentPackageManifest;
  manifestUrl: string;
  manifestSha256: string;
  sourceKind: AgentPackageSourceKind;
  trustTier: string;
  receiptRef: string;
  physicalSurface: AgentPackagePhysicalSurface;
  previousLock?: AgentPackageLock | null;
}): AgentPackageLock {
  const timestamp = nowIso();
  return {
    surface_kind: 'opl_agent_package_lock',
    package_id: input.manifest.package_id,
    agent_id: input.manifest.agent_id,
    display_name: input.manifest.display_name,
    publisher: input.manifest.publisher,
    version_or_source_digest: `${input.manifest.version}+sha256:${input.manifestSha256}`,
    package_version: input.manifest.version,
    installed_at: input.previousLock?.installed_at ?? timestamp,
    updated_at: timestamp,
    codex_visible_entry: input.manifest.codex_visible_entry,
    bundled_required_skill_ids: input.manifest.required_skill_ids,
    optional_skill_refs: input.manifest.optional_skill_refs,
    source_kind: input.sourceKind,
    trust_tier: input.trustTier,
    action_receipt_id: input.receiptRef,
    rollback_ref: input.manifest.rollback_ref,
    manifest_url: input.manifestUrl,
    manifest_sha256: input.manifestSha256,
    lock_ref: packageLockRef(input.manifest.package_id, input.manifest.version, input.manifestSha256),
    physical_surface: input.physicalSurface,
    exposure_state: input.previousLock?.exposure_state ?? 'visible',
    exposure_updated_at: input.previousLock?.exposure_updated_at ?? timestamp,
  };
}

function cleanupPreviousPhysicalSurface(
  previous: AgentPackagePhysicalSurface | undefined,
  current: AgentPackagePhysicalSurface,
) {
  if (!previous || previous.status === 'not_requested') {
    return;
  }

  if (
    previous.plugin_id
    && previous.marketplace_id
    && (previous.plugin_id !== current.plugin_id || previous.marketplace_id !== current.marketplace_id)
  ) {
    unregisterLocalCodexPlugin(previous.codex_config_path, previous.marketplace_id, previous.plugin_id);
  }

  for (const oldPath of [previous.codex_plugin_cache_path, previous.marketplace_plugin_path]) {
    if (oldPath && oldPath !== current.codex_plugin_cache_path && oldPath !== current.marketplace_plugin_path) {
      fs.rmSync(oldPath, { recursive: true, force: true });
    }
  }
}

async function applyManifestPackageLock(
  input: AgentPackageInstallInput,
  action: 'install' | 'update' | 'rollback',
) {
  const packageId = stringValue(input.packageId);
  const index = readLockIndex();
  const existingLock = packageId
    ? index.packages.find((entry) => entry.package_id === packageId)
    : null;
  const selection = action !== 'install'
    && !stringValue(input.manifestUrl)
    && !stringValue(input.registryUrl)
    && existingLock
    ? {
        registryUrl: null,
        packageId,
        manifestUrl: existingLock.manifest_url,
        trustTier: existingLock.trust_tier,
        registryEntry: null,
      }
    : await resolveManifestSelection(input);
  const fetched = await fetchJsonSource(selection.manifestUrl);
  const manifest = normalizeManifest(fetched.payload, selection.manifestUrl);
  assertManifestMatchesRegistrySelection(manifest, selection);
  const trustTier = stringValue(input.trustTier) ?? selection.trustTier;
  assertTrustTierAssigned(trustTier, selection.manifestUrl);
  const sourceKind = normalizeSourceKind(input.sourceKind, selection.manifestUrl);
  const lockRef = packageLockRef(manifest.package_id, manifest.version, fetched.source_sha256);
  const existingIndex = index.packages.findIndex((entry) => entry.package_id === manifest.package_id);
  if (action !== 'install' && existingIndex < 0) {
    throw new FrameworkContractError('contract_shape_invalid', `Agent package ${action} requires an installed package lock.`, {
      package_id: manifest.package_id,
      action,
      failure_code: 'agent_package_lock_missing',
    });
  }
  const previousLock = existingIndex >= 0 ? index.packages[existingIndex] : null;
  const physicalSurface = materializePhysicalCodexSurface(manifest, input.dryRun === true);
  const receipt = lifecycleReceipt({
    action,
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId: manifest.package_id,
    registryUrl: selection.registryUrl,
    manifestUrl: selection.manifestUrl,
    manifestSha256: fetched.source_sha256,
    packageLockRef: lockRef,
    rollbackRef: manifest.rollback_ref,
    sourceKind,
    trustTier,
    sourceSha256: fetched.source_sha256,
    writesPerformed: !input.dryRun,
    physicalSurface,
  });
  const lock = buildLock({
    manifest,
    manifestUrl: selection.manifestUrl,
    manifestSha256: fetched.source_sha256,
    sourceKind,
    trustTier,
    receiptRef: receipt.receipt_ref,
    physicalSurface,
    previousLock,
  });

  if (!input.dryRun) {
    cleanupPreviousPhysicalSurface(previousLock?.physical_surface, physicalSurface);
    if (existingIndex >= 0) {
      index.packages[existingIndex] = lock;
    } else {
      index.packages.unshift(lock);
    }
    writeLockIndex(index);
    appendReceipt(receipt);
  }

  return {
    status: input.dryRun ? 'validated_no_write' : packageActionStatus(action),
    lock,
    receipt,
    registryEntry: selection.registryEntry,
    physicalSurface,
  };
}

export async function runOplAgentPackageRegistryRefresh(input: AgentPackageRegistryRefreshInput) {
  const registryUrl = stringValue(input.registryUrl);
  if (!registryUrl) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package registry refresh requires --registry-url.', {
      required: ['--registry-url'],
    });
  }
  const { fetched, cache } = await fetchAndValidateRegistry(registryUrl);
  writeRegistryCache(cache);
  const receipt = lifecycleReceipt({
    action: 'registry_refresh',
    actionStatus: 'completed',
    registryUrl,
    sourceKind: 'registry_url',
    sourceSha256: fetched.source_sha256,
    writesPerformed: true,
  });
  appendReceipt(receipt);
  return {
    version: 'g2',
    opl_agent_package_registry: {
      surface_kind: 'opl_agent_package_registry_refresh',
      status: 'refreshed',
      registry_url: registryUrl,
      registry_sha256: fetched.source_sha256,
      registry_source_kind: fetched.source_kind,
      entry_count: cache.entry_count,
      entries: cache.entries,
      cache_file: resolveOplStatePaths().agent_package_registry_cache_file,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageManifestValidate(input: AgentPackageManifestValidateInput) {
  const selection = await resolveManifestSelection(input);
  const fetched = await fetchJsonSource(selection.manifestUrl);
  const manifest = normalizeManifest(fetched.payload, selection.manifestUrl);
  assertManifestMatchesRegistrySelection(manifest, selection);
  const effectiveTrustTier = stringValue(input.trustTier) ?? selection.trustTier;
  const sourceKind = normalizeSourceKind(input.sourceKind, selection.manifestUrl);
  const receipt = lifecycleReceipt({
    action: 'manifest_validate',
    actionStatus: 'validated',
    packageId: manifest.package_id,
    registryUrl: selection.registryUrl,
    manifestUrl: selection.manifestUrl,
    manifestSha256: fetched.source_sha256,
    rollbackRef: manifest.rollback_ref,
    sourceKind,
    trustTier: effectiveTrustTier,
    sourceSha256: fetched.source_sha256,
    writesPerformed: true,
  });
  appendReceipt(receipt);
  return {
    version: 'g2',
    opl_agent_package_manifest: {
      surface_kind: 'opl_agent_package_manifest_validation',
      status: 'valid',
      package_id: manifest.package_id,
      agent_id: manifest.agent_id,
      display_name: manifest.display_name,
      publisher: manifest.publisher,
      package_version: manifest.version,
      registry_url: selection.registryUrl,
      manifest_url: selection.manifestUrl,
      manifest_sha256: fetched.source_sha256,
      source_kind: sourceKind,
      trust_tier: effectiveTrustTier,
      codex_visible_entry: manifest.codex_visible_entry,
      bundled_required_skill_ids: manifest.required_skill_ids,
      optional_skill_refs: manifest.optional_skill_refs,
      rollback_ref: manifest.rollback_ref,
      registry_entry: selection.registryEntry,
      lifecycle_receipt: receipt,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      validation_policy: {
        manifest_required_fields: [...MANIFEST_REQUIRED_FIELDS],
        forbidden_fields: [...FORBIDDEN_AGENT_PACKAGE_FIELDS],
        session_contract_allowed: false,
        domain_authority_allowed: false,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageInstall(input: AgentPackageInstallInput) {
  const result = await applyManifestPackageLock(input, 'install');

  return {
    version: 'g2',
    opl_agent_package_install: {
      surface_kind: 'opl_agent_package_install',
      status: result.status,
      dry_run: input.dryRun === true,
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      lifecycle_receipt: result.receipt,
      lock_file: resolveOplStatePaths().agent_package_lock_file,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      registry_entry: result.registryEntry,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageUpdate(input: AgentPackageInstallInput) {
  const result = await applyManifestPackageLock(input, 'update');
  return {
    version: 'g2',
    opl_agent_package_update: {
      surface_kind: 'opl_agent_package_update',
      status: result.status,
      dry_run: input.dryRun === true,
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      lifecycle_receipt: result.receipt,
      lock_file: resolveOplStatePaths().agent_package_lock_file,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      registry_entry: result.registryEntry,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export async function runOplAgentPackageRollback(input: AgentPackageRollbackInput) {
  const result = await applyManifestPackageLock(input, 'rollback');
  return {
    version: 'g2',
    opl_agent_package_rollback: {
      surface_kind: 'opl_agent_package_rollback',
      status: result.status,
      dry_run: input.dryRun === true,
      package_lock: result.lock,
      physical_surface: result.physicalSurface,
      lifecycle_receipt: result.receipt,
      lock_file: resolveOplStatePaths().agent_package_lock_file,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      registry_entry: result.registryEntry,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageRepair(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'repair');
  const index = readLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'repair');
  const physicalSurface = rematerializePhysicalCodexSurfaceFromLock(lock, input.dryRun === true);
  const receipt = lifecycleReceipt({
    action: 'repair',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: packageActionSourceSha256('repair', lock),
    writesPerformed: !input.dryRun,
    physicalSurface,
  });
  const repairedLock = {
    ...lock,
    updated_at: input.dryRun ? lock.updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
    physical_surface: physicalSurface.status === 'not_requested' ? lock.physical_surface : physicalSurface,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = repairedLock;
    writeLockIndex(index);
    appendReceipt(receipt);
  }
  return {
    version: 'g2',
    opl_agent_package_repair: {
      surface_kind: 'opl_agent_package_repair',
      status: input.dryRun ? 'validated_no_write' : 'repaired',
      dry_run: input.dryRun === true,
      package_lock: repairedLock,
      physical_surface: physicalSurface,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageUninstall(input: AgentPackagePackageActionInput) {
  const packageId = requirePackageId(input.packageId, 'uninstall');
  const index = readLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, 'uninstall');
  const physicalSurface = removePhysicalCodexSurface(lock.physical_surface, input.dryRun === true, packageId);
  const receipt = lifecycleReceipt({
    action: 'uninstall',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: packageActionSourceSha256('uninstall', lock),
    writesPerformed: !input.dryRun,
    physicalSurface,
  });
  if (!input.dryRun) {
    index.packages.splice(lockIndex, 1);
    writeLockIndex(index);
    appendReceipt(receipt);
  }
  return {
    version: 'g2',
    opl_agent_package_uninstall: {
      surface_kind: 'opl_agent_package_uninstall',
      status: input.dryRun ? 'validated_no_write' : 'uninstalled',
      dry_run: input.dryRun === true,
      removed_package_lock: lock,
      physical_surface: physicalSurface,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageExposureAction(
  action: 'hide' | 'unhide' | 'enable' | 'disable',
  input: AgentPackagePackageActionInput,
) {
  const packageId = requirePackageId(input.packageId, action);
  const index = readLockIndex();
  const { lockIndex, lock } = requireInstalledPackage(index, packageId, action);
  const nextState = action === 'hide'
    ? 'hidden'
    : action === 'disable'
      ? 'disabled'
      : action === 'enable'
        ? 'enabled'
        : 'visible';
  const receipt = lifecycleReceipt({
    action,
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    manifestUrl: lock.manifest_url,
    manifestSha256: lock.manifest_sha256,
    packageLockRef: lock.lock_ref,
    rollbackRef: lock.rollback_ref,
    sourceKind: lock.source_kind,
    trustTier: lock.trust_tier,
    sourceSha256: packageActionSourceSha256(action, lock),
    writesPerformed: !input.dryRun,
  });
  const updatedLock: AgentPackageLock = {
    ...lock,
    exposure_state: nextState,
    exposure_updated_at: input.dryRun ? lock.exposure_updated_at : nowIso(),
    action_receipt_id: receipt.receipt_ref,
  };
  if (!input.dryRun) {
    index.packages[lockIndex] = updatedLock;
    writeLockIndex(index);
    appendReceipt(receipt);
  }
  return {
    version: 'g2',
    opl_agent_package_exposure: {
      surface_kind: 'opl_agent_package_exposure',
      status: input.dryRun ? 'validated_no_write' : packageActionStatus(action),
      action,
      dry_run: input.dryRun === true,
      package_lock: updatedLock,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageStatus(input: { packageId?: string | null } = {}) {
  const packageId = stringValue(input.packageId);
  const lockIndex = readLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  const installedPackages = packageId
    ? lockIndex.packages.filter((entry) => entry.package_id === packageId)
    : lockIndex.packages;
  return {
    version: 'g2',
    opl_agent_package_status: {
      surface_kind: 'opl_agent_package_status',
      status: packageId && installedPackages.length === 0 ? 'not_installed' : 'available',
      package_id: packageId ?? null,
      installed_package_count: installedPackages.length,
      installed_packages: installedPackages,
      lifecycle_receipts: lifecycleLedger.receipts.filter((receipt) => !packageId || receipt.package_id === packageId),
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function listOplAgentPackages() {
  const paths = resolveOplStatePaths();
  const registryCache = readJsonFileOrNull(paths.agent_package_registry_cache_file);
  const lockIndex = readLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  return {
    version: 'g2',
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback',
      status: 'available',
      registry_cache: isRecord(registryCache) ? registryCache : null,
      installed_package_count: lockIndex.packages.length,
      installed_packages: lockIndex.packages,
      lifecycle_receipt_count: lifecycleLedger.receipts.length,
      lifecycle_receipts: lifecycleLedger.receipts,
      files: {
        registry_cache_file: paths.agent_package_registry_cache_file,
        package_lock_file: paths.agent_package_lock_file,
        lifecycle_ledger_file: paths.agent_package_lifecycle_ledger_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}
