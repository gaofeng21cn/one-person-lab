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

type AgentPackageSourceKind =
  | 'first_party_managed_cohort'
  | 'bundled_full_runtime_modules'
  | 'local_manifest_file'
  | 'manifest_url'
  | 'manifest_import'
  | 'developer_checkout_override';

type AgentPackageLifecycleAction = 'registry_refresh' | 'manifest_validate' | 'install';

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
  const codexVisibleEntry = stringList(payload.codex_surface.plugin_ids)[0]
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
}): AgentPackageLifecycleReceipt {
  return {
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
    installed_at: timestamp,
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
  const selection = await resolveManifestSelection(input);
  const fetched = await fetchJsonSource(selection.manifestUrl);
  const manifest = normalizeManifest(fetched.payload, selection.manifestUrl);
  assertManifestMatchesRegistrySelection(manifest, selection);
  const trustTier = stringValue(input.trustTier) ?? selection.trustTier;
  assertTrustTierAssigned(trustTier, selection.manifestUrl);
  const sourceKind = normalizeSourceKind(input.sourceKind, selection.manifestUrl);
  const lockRef = packageLockRef(manifest.package_id, manifest.version, fetched.source_sha256);
  const receipt = lifecycleReceipt({
    action: 'install',
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
  });
  const lock = buildLock({
    manifest,
    manifestUrl: selection.manifestUrl,
    manifestSha256: fetched.source_sha256,
    sourceKind,
    trustTier,
    receiptRef: receipt.receipt_ref,
  });

  if (!input.dryRun) {
    const index = readLockIndex();
    const existingIndex = index.packages.findIndex((entry) => entry.package_id === lock.package_id);
    if (existingIndex >= 0) {
      index.packages[existingIndex] = lock;
    } else {
      index.packages.unshift(lock);
    }
    writeLockIndex(index);
    appendReceipt(receipt);
  }

  return {
    version: 'g2',
    opl_agent_package_install: {
      surface_kind: 'opl_agent_package_install',
      status: input.dryRun ? 'validated_no_write' : 'installed',
      dry_run: input.dryRun === true,
      package_lock: lock,
      lifecycle_receipt: receipt,
      lock_file: resolveOplStatePaths().agent_package_lock_file,
      lifecycle_ledger_file: resolveOplStatePaths().agent_package_lifecycle_ledger_file,
      registry_entry: selection.registryEntry,
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
