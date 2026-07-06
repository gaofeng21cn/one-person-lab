import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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
import { canonicalAgentPackageId } from './agent-package-identity.ts';
import {
  materializeLocalCodexPluginMarketplace,
  registerLocalCodexPlugin,
  unregisterLocalCodexPlugin,
} from './system-installation/codex-plugin-registry.ts';
import {
  CAPABILITY_PACKAGE_APPLY_COMMAND,
  CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS,
  CAPABILITY_PACKAGE_READBACK_REF,
  CAPABILITY_PACKAGE_REPAIR_COMMAND,
  CAPABILITY_PACKAGE_ROLLBACK_COMMAND,
  CAPABILITY_PACKAGE_STATUS_READBACK_REF,
  capabilityPackageOwnerRoute,
  type ManagedUpdateOwnerRoute,
} from './managed-update-owner-boundary.ts';

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
  | 'disable'
  | 'home_shortcut_preferences_set';

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

export type AgentPackageHomeShortcutPreferencesSetInput = {
  packageId: string;
  shortcutId: string;
  visible?: boolean | null;
  sortOrder?: number | null;
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

type AgentPackagePayloadFile = {
  relativePath: string;
  content: Buffer;
  sha256: string | null;
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
  ordinary_user_source: AgentPackageOrdinaryUserSource | null;
};

type AgentPackageOrdinaryUserSource = {
  kind: 'ghcr_oci_artifact_rolling_latest';
  artifact_ref: string;
  ordinary_user_ref: string;
  immutable_version_ref: string;
  latest_is_only_ordinary_user_channel: true;
  install_truth: string[];
  latest_is_install_truth: false;
  developer_checkout_auto_apply_allowed: false;
};

type AgentPackageDistributionPayload = {
  payload_kind: string;
  payload_ref: string;
  payload_digest_ref: string;
  required_skill_pack_lock_refs: string[];
  proof_status: string;
  live_download_proof: false;
  installed_reload_proof: false;
  oci_ref: string;
  oci_media_type: string;
  immutable_tag: string;
  rolling_tag: 'latest';
  promotion_policy: 'daily_candidate_gates_then_promote_latest';
  install_truth: 'resolved_digest_lock';
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
  distribution_payload: AgentPackageDistributionPayload | null;
  update_channel: string;
  rollback_ref: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
  optional_skill_refs: string[];
  plugin_id: string | null;
  plugin_source_path: string | null;
  plugin_payload_manifest_url: string | null;
  plugin_payload_manifest_sha256: string | null;
  plugin_payload_cache_path: string | null;
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
  plugin_payload_manifest_url: string | null;
  plugin_payload_manifest_sha256: string | null;
  plugin_payload_cache_path: string | null;
  materialized_required_skill_ids: string[];
  materialized_required_skill_paths: string[];
  removed_paths: string[];
  writes_performed: boolean;
  reload_required: boolean;
  note: string | null;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

type AgentPackageDescriptorReadback = {
  manifest_url: string | null;
  manifest_sha256: string | null;
  registry_url: string | null;
  package_version: string | null;
  rollback_ref: string | null;
  source_kind: AgentPackageLifecycleReceipt['source_kind'] | AgentPackageSourceKind | null;
  trust_tier: string | null;
};

type AgentPackageDigestReadback = {
  manifest_sha256: string | null;
  version_or_source_digest: string | null;
  plugin_payload_manifest_sha256: string | null;
  resolved_digest: string | null;
  install_truth: string | null;
  content_identity_fields: string[];
};

type AgentPackageLockReadback = {
  package_lock_ref: string | null;
  lifecycle_receipt_ref: string | null;
  lock_file: string;
  lifecycle_ledger_file: string;
};

type AgentPackageCarrierAdapterReadback = {
  adapter_kind: 'codex_plugin_carrier';
  carrier: 'codex_plugin';
  source_surface: 'codex_surface';
  projection_role: 'package_carrier_adapter';
  owns_package_core: false;
  owns_domain_truth: false;
  status: AgentPackagePhysicalSurface['status'];
  plugin_id: string | null;
  plugin_source_path: string | null;
  plugin_manifest_path: string | null;
  codex_plugin_cache_path: string | null;
  plugin_payload_manifest_url: string | null;
  plugin_payload_manifest_sha256: string | null;
  plugin_payload_cache_path: string | null;
  materialized_required_skill_ids: string[];
  materialized_required_skill_paths: string[];
  writes_performed: boolean;
  reload_required: boolean;
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
  oci_ref?: string;
  resolved_digest?: string;
  immutable_tag?: string;
  rolling_tag?: 'latest';
  install_truth?: 'resolved_digest_lock';
  permission_scope_sha256: string;
  lock_ref: string;
  physical_surface?: AgentPackagePhysicalSurface;
  exposure_state?: 'visible' | 'hidden' | 'enabled' | 'disabled';
  exposure_updated_at?: string;
};

type AgentPackageCoreReadback = {
  core_kind: 'opl_agent_package_core';
  package_id: string;
  descriptor: AgentPackageDescriptorReadback;
  digest: AgentPackageDigestReadback;
  dependencies: {
    required_skill_ids: string[];
    optional_skill_refs: string[];
  };
  trust: {
    trust_tier: string | null;
  };
  lock: AgentPackageLockReadback;
  lifecycle: {
    latest_receipt_ref: string | null;
    latest_action: AgentPackageLifecycleAction | null;
  };
  exposure: {
    state: AgentPackageLock['exposure_state'] | null;
  };
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

type AgentPackageHomeShortcutPreference = {
  shortcut_id: string;
  package_id: string;
  visible: boolean;
  sort_order: number | null;
  source: 'default' | 'user_preference';
  updated_at: string;
  installed: boolean;
};

type AgentPackageHomeShortcutPreferenceFile = {
  surface_kind: 'opl_agent_package_home_shortcut_preferences';
  version: 'g1';
  updated_at: string;
  preferences: AgentPackageHomeShortcutPreference[];
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

type AgentPackageOwnerRouteReadbackItem = {
  package_id: string;
  descriptor: AgentPackageDescriptorReadback;
  digest: AgentPackageDigestReadback;
  lock: AgentPackageLockReadback;
  materializer: {
    status: AgentPackagePhysicalSurface['status'];
    plugin_id: string | null;
    plugin_source_path: string | null;
    plugin_manifest_path: string | null;
    codex_plugin_cache_path: string | null;
    plugin_payload_manifest_url: string | null;
    plugin_payload_manifest_sha256: string | null;
    plugin_payload_cache_path: string | null;
    materialized_required_skill_ids: string[];
    materialized_required_skill_paths: string[];
    writes_performed: boolean;
    reload_required: boolean;
  };
  package_core: AgentPackageCoreReadback;
  carrier_adapters: AgentPackageCarrierAdapterReadback[];
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

type AgentPackageOwnerRouteReadback = {
  surface_kind: 'opl_agent_package_owner_route_readback';
  owner_route: ManagedUpdateOwnerRoute;
  command_refs: {
    list: string;
    status: string;
    apply: string;
    repair: string;
    rollback: string;
  };
  selected_package_id: string | null;
  package_count: number;
  packages: AgentPackageOwnerRouteReadbackItem[];
  no_package_manager_boundary: {
    package_manager_claim: false;
    clean_managed_scope: 'clean_opl_managed_module_roots_only';
    forbidden_claims: string[];
  };
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
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

function assertStringValue(value: unknown, field: string): string {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package field is required.', {
      field,
      failure_code: 'agent_package_field_required',
    });
  }
  return normalized;
}

function normalizeDistributionPayload(value: unknown): AgentPackageDistributionPayload | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package distribution_payload must be a JSON object.', {
      failure_code: 'agent_package_distribution_payload_invalid',
    });
  }
  if (
    value.live_download_proof !== false
    || value.installed_reload_proof !== false
    || value.rolling_tag !== 'latest'
    || value.promotion_policy !== 'daily_candidate_gates_then_promote_latest'
    || value.install_truth !== 'resolved_digest_lock'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package OCI distribution must be latest-only and digest-lock based.', {
      failure_code: 'agent_package_distribution_policy_invalid',
      required: {
        live_download_proof: false,
        installed_reload_proof: false,
        rolling_tag: 'latest',
        promotion_policy: 'daily_candidate_gates_then_promote_latest',
        install_truth: 'resolved_digest_lock',
      },
    });
  }
  const payloadDigestRef = assertStringValue(value.payload_digest_ref, 'distribution_payload.payload_digest_ref');
  if (payloadDigestRef === 'latest' || payloadDigestRef === 'registry.latest_version') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package install truth must be a digest ref, not latest or registry.latest_version.', {
      failure_code: 'agent_package_distribution_digest_required',
      payload_digest_ref: payloadDigestRef,
    });
  }
  const requiredSkillPackLockRefs = stringList(value.required_skill_pack_lock_refs);
  if (requiredSkillPackLockRefs.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package distribution payload must lock required skill packs.', {
      failure_code: 'agent_package_required_skill_pack_lock_missing',
    });
  }
  return {
    payload_kind: assertStringValue(value.payload_kind, 'distribution_payload.payload_kind'),
    payload_ref: assertStringValue(value.payload_ref, 'distribution_payload.payload_ref'),
    payload_digest_ref: payloadDigestRef,
    required_skill_pack_lock_refs: requiredSkillPackLockRefs,
    proof_status: assertStringValue(value.proof_status, 'distribution_payload.proof_status'),
    live_download_proof: false,
    installed_reload_proof: false,
    oci_ref: assertStringValue(value.oci_ref, 'distribution_payload.oci_ref'),
    oci_media_type: assertStringValue(value.oci_media_type, 'distribution_payload.oci_media_type'),
    immutable_tag: assertStringValue(value.immutable_tag, 'distribution_payload.immutable_tag'),
    rolling_tag: 'latest',
    promotion_policy: 'daily_candidate_gates_then_promote_latest',
    install_truth: 'resolved_digest_lock',
  };
}

function normalizeOrdinaryUserSource(value: unknown, sourceLabel: string): AgentPackageOrdinaryUserSource | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary_user_source must be a JSON object.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_invalid',
    });
  }
  if (
    value.kind !== 'ghcr_oci_artifact_rolling_latest'
    || value.latest_is_only_ordinary_user_channel !== true
    || value.latest_is_install_truth !== false
    || value.developer_checkout_auto_apply_allowed !== false
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary user source must use GHCR OCI rolling latest without treating latest as install truth.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_policy_invalid',
    });
  }
  const installTruth = stringList(value.install_truth);
  for (const required of ['immutable_version_tag', 'oci_digest', 'package_lock_receipt']) {
    if (!installTruth.includes(required)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary user source must declare immutable tag, OCI digest, and package lock receipt as install truth.', {
        source: sourceLabel,
        failure_code: 'agent_package_ordinary_source_install_truth_invalid',
        missing_install_truth: required,
      });
    }
  }
  const ordinaryUserRef = assertStringValue(value.ordinary_user_ref, `${sourceLabel}.ordinary_user_ref`);
  if (!ordinaryUserRef.endsWith(':latest')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary user ref must be the latest tag.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_latest_ref_required',
      ordinary_user_ref: ordinaryUserRef,
    });
  }
  return {
    kind: 'ghcr_oci_artifact_rolling_latest',
    artifact_ref: assertStringValue(value.artifact_ref, `${sourceLabel}.artifact_ref`),
    ordinary_user_ref: ordinaryUserRef,
    immutable_version_ref: assertStringValue(value.immutable_version_ref, `${sourceLabel}.immutable_version_ref`),
    latest_is_only_ordinary_user_channel: true,
    install_truth: installTruth,
    latest_is_install_truth: false,
    developer_checkout_auto_apply_allowed: false,
  };
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
    package_id: canonicalAgentPackageId(entry.package_id)!,
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
    ordinary_user_source: normalizeOrdinaryUserSource(entry.ordinary_user_source, `registry.entries.${index}.ordinary_user_source`),
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
  const pluginPayloadManifestUrl = stringValue(payload.codex_surface.plugin_payload_manifest_url)
    ?? stringValue(payload.codex_surface.remote_payload_manifest_url);
  if (pluginPayloadManifestUrl) {
    validateUrlLike(pluginPayloadManifestUrl, 'codex_surface.plugin_payload_manifest_url');
  }
  const distributionPayload = normalizeDistributionPayload(payload.distribution_payload);
  const codexVisibleEntry = pluginId
    ?? stringValue(payload.codex_surface.codex_visible_entry)
    ?? stringValue(payload.agent_id)!;
  return {
    package_id: canonicalAgentPackageId(payload.package_id)!,
    agent_id: canonicalAgentPackageId(payload.agent_id)!,
    display_name: stringValue(payload.display_name)!,
    publisher: stringValue(payload.publisher)!,
    version: stringValue(payload.version)!,
    source: stringValue(payload.source)!,
    codex_surface: payload.codex_surface,
    skill_packs: skillPacks,
    entrypoints,
    health_check: payload.health_check,
    permissions: payload.permissions,
    distribution_payload: distributionPayload,
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
    plugin_payload_manifest_url: pluginPayloadManifestUrl,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
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

function ownerRouteReadbackCommands() {
  return {
    list: CAPABILITY_PACKAGE_READBACK_REF,
    status: CAPABILITY_PACKAGE_STATUS_READBACK_REF,
    apply: CAPABILITY_PACKAGE_APPLY_COMMAND,
    repair: CAPABILITY_PACKAGE_REPAIR_COMMAND,
    rollback: CAPABILITY_PACKAGE_ROLLBACK_COMMAND,
  };
}

function ownerRouteReadbackItem(input: {
  packageId: string;
  lock?: AgentPackageLock | null;
  receipt?: AgentPackageLifecycleReceipt | null;
  manifestUrl?: string | null;
  manifestSha256?: string | null;
  registryUrl?: string | null;
  rollbackRef?: string | null;
  sourceKind?: AgentPackageLifecycleReceipt['source_kind'] | AgentPackageSourceKind | null;
  trustTier?: string | null;
}): AgentPackageOwnerRouteReadbackItem {
  const paths = resolveOplStatePaths();
  const surface = input.lock?.physical_surface ?? input.receipt?.physical_surface;
  const descriptor = {
    manifest_url: input.lock?.manifest_url ?? input.receipt?.manifest_url ?? input.manifestUrl ?? null,
    manifest_sha256: input.lock?.manifest_sha256 ?? input.receipt?.manifest_sha256 ?? input.manifestSha256 ?? null,
    registry_url: input.receipt?.registry_url ?? input.registryUrl ?? null,
    package_version: input.lock?.package_version ?? null,
    rollback_ref: input.lock?.rollback_ref ?? input.receipt?.rollback_ref ?? input.rollbackRef ?? null,
    source_kind: input.lock?.source_kind ?? input.receipt?.source_kind ?? input.sourceKind ?? null,
    trust_tier: input.lock?.trust_tier ?? input.receipt?.trust_tier ?? input.trustTier ?? null,
  };
  const digest = {
    manifest_sha256: input.lock?.manifest_sha256 ?? input.receipt?.manifest_sha256 ?? input.manifestSha256 ?? null,
    version_or_source_digest: input.lock?.version_or_source_digest ?? null,
    plugin_payload_manifest_sha256: surface?.plugin_payload_manifest_sha256 ?? null,
    resolved_digest: input.lock?.resolved_digest ?? null,
    install_truth: input.lock?.install_truth ?? null,
    content_identity_fields: [
      'manifest_sha256',
      'version_or_source_digest',
      'plugin_payload_manifest_sha256',
      'resolved_digest',
      'package_lock_ref',
    ],
  };
  const lock = {
    package_lock_ref: input.lock?.lock_ref ?? input.receipt?.package_lock_ref ?? null,
    lifecycle_receipt_ref: input.receipt?.receipt_ref ?? input.lock?.action_receipt_id ?? null,
    lock_file: paths.agent_package_lock_file,
    lifecycle_ledger_file: paths.agent_package_lifecycle_ledger_file,
  };
  const materializer = {
    status: surface?.status ?? 'not_requested',
    plugin_id: surface?.plugin_id ?? null,
    plugin_source_path: surface?.plugin_source_path ?? null,
    plugin_manifest_path: surface?.plugin_manifest_path ?? null,
    codex_plugin_cache_path: surface?.codex_plugin_cache_path ?? null,
    plugin_payload_manifest_url: surface?.plugin_payload_manifest_url ?? null,
    plugin_payload_manifest_sha256: surface?.plugin_payload_manifest_sha256 ?? null,
    plugin_payload_cache_path: surface?.plugin_payload_cache_path ?? null,
    materialized_required_skill_ids: surface?.materialized_required_skill_ids ?? [],
    materialized_required_skill_paths: surface?.materialized_required_skill_paths ?? [],
    writes_performed: surface?.writes_performed ?? false,
    reload_required: surface?.reload_required ?? false,
  };
  return {
    package_id: input.packageId,
    descriptor,
    digest,
    lock,
    materializer,
    package_core: {
      core_kind: 'opl_agent_package_core',
      package_id: input.packageId,
      descriptor,
      digest,
      dependencies: {
        required_skill_ids: input.lock?.bundled_required_skill_ids ?? surface?.materialized_required_skill_ids ?? [],
        optional_skill_refs: input.lock?.optional_skill_refs ?? [],
      },
      trust: {
        trust_tier: descriptor.trust_tier,
      },
      lock,
      lifecycle: {
        latest_receipt_ref: lock.lifecycle_receipt_ref,
        latest_action: input.receipt?.action ?? null,
      },
      exposure: {
        state: input.lock?.exposure_state ?? null,
      },
    },
    carrier_adapters: [{
      adapter_kind: 'codex_plugin_carrier',
      carrier: 'codex_plugin',
      source_surface: 'codex_surface',
      projection_role: 'package_carrier_adapter',
      owns_package_core: false,
      owns_domain_truth: false,
      ...materializer,
    }],
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function ownerRouteReadback(input: {
  selectedPackageId?: string | null;
  packages: Array<{
    packageId: string;
    lock?: AgentPackageLock | null;
    receipt?: AgentPackageLifecycleReceipt | null;
    manifestUrl?: string | null;
    manifestSha256?: string | null;
    registryUrl?: string | null;
    rollbackRef?: string | null;
    sourceKind?: AgentPackageLifecycleReceipt['source_kind'] | AgentPackageSourceKind | null;
    trustTier?: string | null;
  }>;
}): AgentPackageOwnerRouteReadback {
  return {
    surface_kind: 'opl_agent_package_owner_route_readback',
    owner_route: capabilityPackageOwnerRoute(),
    command_refs: ownerRouteReadbackCommands(),
    selected_package_id: input.selectedPackageId ?? null,
    package_count: input.packages.length,
    packages: input.packages.map((entry) => ownerRouteReadbackItem(entry)),
    no_package_manager_boundary: {
      package_manager_claim: false,
      clean_managed_scope: 'clean_opl_managed_module_roots_only',
      forbidden_claims: uniqueStrings([...CAPABILITY_PACKAGE_OWNER_FORBIDDEN_CLAIMS]),
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
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
      const packageId = canonicalAgentPackageId(entry.package_id);
      const lockRef = stringValue(entry.lock_ref);
      const agentId = canonicalAgentPackageId(entry.agent_id);
      return packageId && lockRef
        ? [{ ...entry, package_id: packageId, ...(agentId ? { agent_id: agentId } : {}) } as AgentPackageLock]
        : [];
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
      const packageId = canonicalAgentPackageId(entry.package_id);
      const physicalSurface = isRecord(entry.physical_surface)
        ? {
            ...entry.physical_surface,
            ...(canonicalAgentPackageId(entry.physical_surface.package_id)
              ? { package_id: canonicalAgentPackageId(entry.physical_surface.package_id)! }
              : {}),
          }
        : entry.physical_surface;
      return receiptRef
        ? [{
            ...entry,
            package_id: packageId,
            ...(physicalSurface ? { physical_surface: physicalSurface } : {}),
          } as AgentPackageLifecycleReceipt]
        : [];
    }),
  };
}

function readRegistryCache() {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_registry_cache_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
    return null;
  }
  const entries = recordList(parsed.entries).map(normalizeRegistryEntry);
  return {
    surface_kind: 'opl_agent_package_registry_cache' as const,
    version: stringValue(parsed.version) ?? 'opl-agent-package-registry-cache.v1',
    refreshed_at: stringValue(parsed.refreshed_at) ?? nowIso(),
    registry_url: stringValue(parsed.registry_url) ?? '',
    registry_sha256: stringValue(parsed.registry_sha256) ?? '',
    entry_count: entries.length,
    entries,
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

function normalizePayloadFiles(payload: unknown, payloadManifestUrl: string): AgentPackagePayloadFile[] {
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
  return fileRecords.map((entry, index) => {
    const relativePath = stringValue(entry.path);
    const contentUtf8 = typeof entry.content_utf8 === 'string' ? entry.content_utf8 : null;
    const contentBase64 = typeof entry.content_base64 === 'string' && entry.content_base64.trim()
      ? entry.content_base64.trim()
      : null;
    if (!relativePath || (contentUtf8 === null && contentBase64 === null)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload files require path and content.', {
        payload_manifest_url: payloadManifestUrl,
        file_index: index,
        required: ['path', 'content_utf8 or content_base64'],
        failure_code: 'agent_package_payload_manifest_invalid',
      });
    }
    const content = contentBase64 !== null ? Buffer.from(contentBase64, 'base64') : Buffer.from(contentUtf8!, 'utf8');
    const sha256 = stringValue(entry.sha256);
    if (sha256) {
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
  });
}

async function materializePayloadManifestSource(input: {
  manifest: AgentPackageManifest;
  payloadManifestUrl: string;
  dryRun: boolean;
}) {
  const fetched = await fetchJsonSource(input.payloadManifestUrl);
  const files = normalizePayloadFiles(fetched.payload, input.payloadManifestUrl);
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

async function resolveManifestPhysicalSource(
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
      plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
      plugin_payload_manifest_sha256: manifest.plugin_payload_manifest_sha256,
      plugin_payload_cache_path: manifest.plugin_payload_cache_path,
      materialized_required_skill_ids: [],
      materialized_required_skill_paths: [],
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
  const materializedRequiredSkills = validateMaterializedRequiredSkills(manifest, pluginSourcePath);

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
    plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
    plugin_payload_manifest_sha256: manifest.plugin_payload_manifest_sha256,
    plugin_payload_cache_path: manifest.plugin_payload_cache_path,
    materialized_required_skill_ids: materializedRequiredSkills.map((entry) => entry.skillId),
    materialized_required_skill_paths: materializedRequiredSkills.map((entry) =>
      dryRun ? entry.skillPath : path.join(paths.codexPluginCachePath!, 'skills', entry.skillId, 'SKILL.md')
    ),
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
    surface?.plugin_payload_cache_path,
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
    plugin_payload_manifest_url: surface?.plugin_payload_manifest_url ?? null,
    plugin_payload_manifest_sha256: surface?.plugin_payload_manifest_sha256 ?? null,
    plugin_payload_cache_path: surface?.plugin_payload_cache_path ?? null,
    materialized_required_skill_ids: surface?.materialized_required_skill_ids ?? [],
    materialized_required_skill_paths: surface?.materialized_required_skill_paths ?? [],
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
      plugin_payload_manifest_url: lock.physical_surface?.plugin_payload_manifest_url ?? null,
      plugin_payload_manifest_sha256: lock.physical_surface?.plugin_payload_manifest_sha256 ?? null,
      plugin_payload_cache_path: lock.physical_surface?.plugin_payload_cache_path ?? null,
      materialized_required_skill_ids: lock.physical_surface?.materialized_required_skill_ids ?? [],
      materialized_required_skill_paths: lock.physical_surface?.materialized_required_skill_paths ?? [],
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
  }, dryRun);
}

function packageReceiptRef(input: {
  action: AgentPackageLifecycleAction;
  packageId?: string | null;
  sourceSha256: string;
}) {
  const subject = canonicalAgentPackageId(input.packageId) ?? 'registry';
  return `opl://agent-package/${input.action}/${encodeURIComponent(subject)}/${input.sourceSha256.slice(0, 16)}`;
}

function packageLockRef(packageId: string, version: string, sourceSha256: string) {
  const canonicalPackageId = canonicalAgentPackageId(packageId) ?? packageId;
  return `opl://agent-package-lock/${encodeURIComponent(canonicalPackageId)}/${encodeURIComponent(version)}/${sourceSha256.slice(0, 16)}`;
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
    home_shortcut_preferences_set: 'preferences_updated',
    registry_refresh: 'refreshed',
    manifest_validate: 'valid',
  }[action];
}

function emptyHomeShortcutPreferenceFile(): AgentPackageHomeShortcutPreferenceFile {
  return {
    surface_kind: 'opl_agent_package_home_shortcut_preferences',
    version: 'g1',
    updated_at: nowIso(),
    preferences: [],
  };
}

function readHomeShortcutPreferenceFile(): AgentPackageHomeShortcutPreferenceFile {
  const parsed = readJsonFileOrNull(resolveOplStatePaths().agent_package_home_shortcut_preferences_file);
  if (!isRecord(parsed) || !Array.isArray(parsed.preferences)) return emptyHomeShortcutPreferenceFile();
  return {
    surface_kind: 'opl_agent_package_home_shortcut_preferences',
    version: 'g1',
    updated_at: stringValue(parsed.updated_at) ?? nowIso(),
    preferences: recordList(parsed.preferences).flatMap((entry) => {
      const shortcutId = stringValue(entry.shortcut_id);
      const packageId = canonicalAgentPackageId(entry.package_id);
      if (!shortcutId || !packageId) return [];
      const sortOrder = typeof entry.sort_order === 'number' && Number.isFinite(entry.sort_order)
        ? entry.sort_order
        : null;
      return [{
        shortcut_id: shortcutId,
        package_id: packageId,
        visible: entry.visible !== false,
        sort_order: sortOrder,
        source: 'user_preference' as const,
        updated_at: stringValue(entry.updated_at) ?? nowIso(),
        installed: entry.installed === true,
      }];
    }),
  };
}

function writeHomeShortcutPreferenceFile(file: AgentPackageHomeShortcutPreferenceFile) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.agent_package_home_shortcut_preferences_file, file);
}

function defaultHomeShortcutPreferences(
  registryCache: unknown,
  lockIndex: AgentPackageLockIndex,
): AgentPackageHomeShortcutPreference[] {
  const entries = isRecord(registryCache) ? recordList(registryCache.entries) : [];
  const installedIds = new Set(lockIndex.packages.map((entry) => entry.package_id));
  const timestamp = nowIso();
  return entries.flatMap((entry, entryIndex) => {
    const packageId = stringValue(entry.package_id);
    if (!packageId) return [];
    return stringList(entry.home_shortcut_ids).map((shortcutId, shortcutIndex) => ({
      shortcut_id: shortcutId,
      package_id: packageId,
      visible: true,
      sort_order: entryIndex * 100 + shortcutIndex,
      source: 'default' as const,
      updated_at: timestamp,
      installed: installedIds.has(packageId),
    }));
  });
}

function mergedHomeShortcutPreferences(
  registryCache: unknown,
  lockIndex: AgentPackageLockIndex,
): AgentPackageHomeShortcutPreference[] {
  const installedIds = new Set(lockIndex.packages.map((entry) => entry.package_id));
  const merged = new Map<string, AgentPackageHomeShortcutPreference>();
  for (const entry of defaultHomeShortcutPreferences(registryCache, lockIndex)) {
    merged.set(`${entry.package_id}\n${entry.shortcut_id}`, entry);
  }
  for (const entry of readHomeShortcutPreferenceFile().preferences) {
    merged.set(`${entry.package_id}\n${entry.shortcut_id}`, {
      ...entry,
      source: 'user_preference',
      installed: installedIds.has(entry.package_id),
    });
  }
  return [...merged.values()].sort((a, b) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      || a.package_id.localeCompare(b.package_id)
      || a.shortcut_id.localeCompare(b.shortcut_id)
  );
}

function homeShortcutPreferenceSourceSha256(input: AgentPackageHomeShortcutPreferencesSetInput) {
  return sha256Text([
    input.packageId,
    input.shortcutId,
    input.visible === false ? 'hidden' : 'visible',
    input.sortOrder ?? '',
  ].join('\n'));
}

function requirePackageId(packageId: string | null | undefined, action: AgentPackageLifecycleAction) {
  const normalized = canonicalAgentPackageId(packageId);
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
  const packageId = canonicalAgentPackageId(input.packageId);
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
  const ordinaryUserSource = selection.registryEntry.ordinary_user_source;
  if (ordinaryUserSource && manifest.distribution_payload) {
    if (manifest.distribution_payload.rolling_tag !== 'latest' || manifest.distribution_payload.install_truth !== 'resolved_digest_lock') {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest distribution payload must keep latest as a rolling pointer and digest lock as install truth.', {
        registry_url: selection.registryUrl,
        manifest_url: selection.manifestUrl,
        package_id: manifest.package_id,
        failure_code: 'registry_manifest_distribution_policy_mismatch',
      });
    }
    if (!ordinaryUserSource.immutable_version_ref.endsWith(`:${manifest.distribution_payload.immutable_tag}`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry immutable version ref must match manifest immutable tag.', {
        registry_url: selection.registryUrl,
        manifest_url: selection.manifestUrl,
        package_id: manifest.package_id,
        registry_immutable_version_ref: ordinaryUserSource.immutable_version_ref,
        manifest_immutable_tag: manifest.distribution_payload.immutable_tag,
        failure_code: 'registry_manifest_immutable_tag_mismatch',
      });
    }
  }
}

function permissionScopeSha256(manifest: AgentPackageManifest) {
  return sha256Text(JSON.stringify({
    codex_visible_entry: manifest.codex_visible_entry,
    bundled_required_skill_ids: manifest.required_skill_ids,
    optional_skill_refs: manifest.optional_skill_refs,
    entrypoints: manifest.entrypoints,
    permissions: manifest.permissions,
  }));
}

function assertPermissionScopeUnchanged(previousLock: AgentPackageLock | null, manifest: AgentPackageManifest, action: 'install' | 'update' | 'rollback') {
  if (!previousLock || action === 'install') {
    return;
  }
  const nextSha256 = permissionScopeSha256(manifest);
  if (previousLock.permission_scope_sha256 && previousLock.permission_scope_sha256 !== nextSha256) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package permission or scope changes require manual confirmation before update.', {
      package_id: manifest.package_id,
      action,
      failure_code: 'agent_package_permission_scope_change_requires_manual_confirmation',
      previous_permission_scope_sha256: previousLock.permission_scope_sha256,
      next_permission_scope_sha256: nextSha256,
      manual_confirmation_path: 'uninstall the existing lock, review the manifest, then run install explicitly',
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
  const distributionPayload = input.manifest.distribution_payload;
  return {
    surface_kind: 'opl_agent_package_lock',
    package_id: input.manifest.package_id,
    agent_id: input.manifest.agent_id,
    display_name: input.manifest.display_name,
    publisher: input.manifest.publisher,
    version_or_source_digest: distributionPayload
      ? `${distributionPayload.immutable_tag}@${distributionPayload.payload_digest_ref}`
      : `${input.manifest.version}+sha256:${input.manifestSha256}`,
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
    ...(distributionPayload
      ? {
          oci_ref: distributionPayload.oci_ref,
          resolved_digest: distributionPayload.payload_digest_ref,
          immutable_tag: distributionPayload.immutable_tag,
          rolling_tag: distributionPayload.rolling_tag,
          install_truth: distributionPayload.install_truth,
        }
      : {}),
    permission_scope_sha256: permissionScopeSha256(input.manifest),
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

  for (const oldPath of [previous.codex_plugin_cache_path, previous.marketplace_plugin_path, previous.plugin_payload_cache_path]) {
    if (
      oldPath
      && oldPath !== current.codex_plugin_cache_path
      && oldPath !== current.marketplace_plugin_path
      && oldPath !== current.plugin_payload_cache_path
    ) {
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
  const manifest = await resolveManifestPhysicalSource(
    normalizeManifest(fetched.payload, selection.manifestUrl),
    input.dryRun === true,
  );
  assertManifestMatchesRegistrySelection(manifest, selection);
  const trustTier = stringValue(input.trustTier) ?? selection.trustTier;
  assertTrustTierAssigned(trustTier, selection.manifestUrl);
  const sourceKind = normalizeSourceKind(input.sourceKind, selection.manifestUrl);
  if (sourceKind === 'developer_checkout_override' && action !== 'install') {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout agent package sources are Developer Profile inputs and must not auto-update.', {
      package_id: manifest.package_id,
      action,
      source_kind: sourceKind,
      failure_code: 'agent_package_developer_checkout_auto_update_forbidden',
      manual_confirmation_path: 'review the checkout and run an explicit install from the selected manifest when intended',
    });
  }
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
  assertPermissionScopeUnchanged(previousLock, manifest, action);
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
      distribution_payload: manifest.distribution_payload,
      rollback_ref: manifest.rollback_ref,
      registry_entry: selection.registryEntry,
      lifecycle_receipt: receipt,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: manifest.package_id,
        packages: [{
          packageId: manifest.package_id,
          receipt,
          manifestUrl: selection.manifestUrl,
          manifestSha256: fetched.source_sha256,
          registryUrl: selection.registryUrl,
          rollbackRef: manifest.rollback_ref,
          sourceKind,
          trustTier: effectiveTrustTier,
        }],
      }),
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
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: result.lock.package_id,
        packages: [{ packageId: result.lock.package_id, lock: result.lock, receipt: result.receipt }],
      }),
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
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: result.lock.package_id,
        packages: [{ packageId: result.lock.package_id, lock: result.lock, receipt: result.receipt }],
      }),
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
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: result.lock.package_id,
        packages: [{ packageId: result.lock.package_id, lock: result.lock, receipt: result.receipt }],
      }),
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
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: repairedLock.package_id,
        packages: [{ packageId: repairedLock.package_id, lock: repairedLock, receipt }],
      }),
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
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: lock.package_id,
        packages: [{ packageId: lock.package_id, lock, receipt }],
      }),
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

export function runOplAgentPackageHomeShortcutPreferencesSet(input: AgentPackageHomeShortcutPreferencesSetInput) {
  const packageId = requirePackageId(input.packageId, 'home_shortcut_preferences_set');
  const shortcutId = stringValue(input.shortcutId);
  if (!shortcutId) {
    throw new FrameworkContractError('cli_usage_error', 'Agent package Home shortcut preference requires shortcut_id.', {
      package_id: packageId,
      required: ['shortcut_id'],
    });
  }
  const lockIndex = readLockIndex();
  requireInstalledPackage(lockIndex, packageId, 'home_shortcut_preferences_set');
  const stored = readHomeShortcutPreferenceFile();
  const updatedAt = nowIso();
  const nextEntry: AgentPackageHomeShortcutPreference = {
    shortcut_id: shortcutId,
    package_id: packageId,
    visible: input.visible !== false,
    sort_order: typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder) ? input.sortOrder : null,
    source: 'user_preference',
    updated_at: updatedAt,
    installed: true,
  };
  const nextPreferences = [
    nextEntry,
    ...stored.preferences.filter((entry) => !(entry.package_id === packageId && entry.shortcut_id === shortcutId)),
  ];
  const nextFile: AgentPackageHomeShortcutPreferenceFile = {
    surface_kind: 'opl_agent_package_home_shortcut_preferences',
    version: 'g1',
    updated_at: updatedAt,
    preferences: nextPreferences,
  };
  const receipt = lifecycleReceipt({
    action: 'home_shortcut_preferences_set',
    actionStatus: input.dryRun ? 'validated' : 'completed',
    packageId,
    sourceKind: 'manifest_import',
    trustTier: null,
    sourceSha256: homeShortcutPreferenceSourceSha256(input),
    writesPerformed: !input.dryRun,
  });
  if (!input.dryRun) {
    writeHomeShortcutPreferenceFile(nextFile);
    appendReceipt(receipt);
  }
  return {
    version: 'g2',
    opl_agent_package_home_shortcut_preferences: {
      surface_kind: 'opl_agent_package_home_shortcut_preferences_set',
      status: input.dryRun ? 'validated_no_write' : 'preferences_updated',
      dry_run: input.dryRun === true,
      preference: nextEntry,
      preferences_file: resolveOplStatePaths().agent_package_home_shortcut_preferences_file,
      lifecycle_receipt: receipt,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function runOplAgentPackageStatus(input: { packageId?: string | null } = {}) {
  const packageId = canonicalAgentPackageId(input.packageId);
  const lockIndex = readLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  const paths = resolveOplStatePaths();
  const registryCache = readRegistryCache();
  const installedPackages = packageId
    ? lockIndex.packages.filter((entry) => entry.package_id === packageId)
    : lockIndex.packages;
  const homeShortcutPreferences = mergedHomeShortcutPreferences(registryCache, lockIndex)
    .filter((entry) => !packageId || entry.package_id === packageId);
  const latestReceipts = new Map<string, AgentPackageLifecycleReceipt>();
  for (const receipt of lifecycleLedger.receipts) {
    if (receipt.package_id && !latestReceipts.has(receipt.package_id)) {
      latestReceipts.set(receipt.package_id, receipt);
    }
  }
  return {
    version: 'g2',
    opl_agent_package_status: {
      surface_kind: 'opl_agent_package_status',
      status: packageId && installedPackages.length === 0 ? 'not_installed' : 'available',
      package_id: packageId ?? null,
      installed_package_count: installedPackages.length,
      installed_packages: installedPackages,
      home_shortcut_preferences: homeShortcutPreferences,
      lifecycle_receipts: lifecycleLedger.receipts.filter((receipt) => !packageId || receipt.package_id === packageId),
      owner_route_readback: ownerRouteReadback({
        selectedPackageId: packageId ?? null,
        packages: installedPackages.map((lock) => ({
          packageId: lock.package_id,
          lock,
          receipt: latestReceipts.get(lock.package_id) ?? null,
        })),
      }),
      files: {
        home_shortcut_preferences_file: paths.agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}

export function listOplAgentPackages() {
  const paths = resolveOplStatePaths();
  const registryCache = readRegistryCache();
  const lockIndex = readLockIndex();
  const lifecycleLedger = readLifecycleLedger();
  const homeShortcutPreferences = mergedHomeShortcutPreferences(registryCache, lockIndex);
  const latestReceipts = new Map<string, AgentPackageLifecycleReceipt>();
  for (const receipt of lifecycleLedger.receipts) {
    if (receipt.package_id && !latestReceipts.has(receipt.package_id)) {
      latestReceipts.set(receipt.package_id, receipt);
    }
  }
  return {
    version: 'g2',
    opl_agent_packages: {
      surface_kind: 'opl_agent_package_readback',
      status: 'available',
      registry_cache: registryCache,
      installed_package_count: lockIndex.packages.length,
      installed_packages: lockIndex.packages,
      home_shortcut_preferences: homeShortcutPreferences,
      lifecycle_receipt_count: lifecycleLedger.receipts.length,
      lifecycle_receipts: lifecycleLedger.receipts,
      owner_route_readback: ownerRouteReadback({
        packages: lockIndex.packages.map((lock) => ({
          packageId: lock.package_id,
          lock,
          receipt: latestReceipts.get(lock.package_id) ?? null,
        })),
      }),
      files: {
        registry_cache_file: paths.agent_package_registry_cache_file,
        package_lock_file: paths.agent_package_lock_file,
        lifecycle_ledger_file: paths.agent_package_lifecycle_ledger_file,
        home_shortcut_preferences_file: paths.agent_package_home_shortcut_preferences_file,
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
  };
}
