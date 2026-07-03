import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../charter/index.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../runway/index.ts';

const SCHEMA_VERSION = 'artifact-provenance-bundle.v1';
const LEDGER_VERSION = 'opl-artifact-provenance-bundle-ledger.v1';
const REF_KEYS = [
  'code',
  'inputs',
  'outputs',
  'environment',
  'agent_trace',
  'reviews',
  'replay',
] as const;
const FORBIDDEN_BODY_FIELDS = ['body', 'artifact_body', 'artifact_content', 'artifact_payload', 'body_inline'];
const REQUIRED_MANIFEST_FIELDS = [
  'schema_version',
  'bundle_id',
  'artifact_ref',
  'domain_id',
  'artifact_type',
  'created_at',
  'refs',
  'hashes',
  'authority_boundary',
] as const;
const ALLOWED_MANIFEST_FIELDS = new Set<string>([
  ...REQUIRED_MANIFEST_FIELDS,
  'metadata',
  'missing_refs',
  'restricted_refs',
]);
const ALLOWED_REF_FIELDS = new Set<string>(REF_KEYS);
const ALLOWED_AUTHORITY_FIELDS = new Set<string>([
  'ledger_refs_only',
  'forbidden_claims',
  'can_read_artifact_body',
  'can_store_artifact_body',
  'can_mutate_artifact_body',
  'can_write_domain_truth',
  'can_create_owner_receipt',
  'can_authorize_quality_verdict',
  'can_claim_domain_ready',
  'can_claim_artifact_ready',
  'can_claim_production_ready',
]);
const FALSE_AUTHORITY_FIELDS = [...ALLOWED_AUTHORITY_FIELDS].filter((field) =>
  field !== 'ledger_refs_only' && field !== 'forbidden_claims'
);
const ALLOWED_HASH_ENTRY_FIELDS = new Set<string>(['algorithm', 'value']);

type RefKey = typeof REF_KEYS[number];
type BundleRefs = Record<RefKey, string[]>;
type HashEntry = {
  algorithm: 'sha256';
  value: string;
};
type ArtifactProvenanceBundleAuthorityBoundary = {
  ledger_refs_only: true;
  forbidden_claims: string[];
  can_read_artifact_body: false;
  can_store_artifact_body: false;
  can_mutate_artifact_body: false;
  can_write_domain_truth: false;
  can_create_owner_receipt: false;
  can_authorize_quality_verdict: false;
  can_claim_domain_ready: false;
  can_claim_artifact_ready: false;
  can_claim_production_ready: false;
};
type ArtifactProvenanceBundleManifest = {
  schema_version: typeof SCHEMA_VERSION;
  bundle_id: string;
  artifact_ref: string;
  domain_id: string;
  artifact_type: string;
  created_at: string;
  refs: BundleRefs;
  hashes: Record<string, HashEntry>;
  authority_boundary: ArtifactProvenanceBundleAuthorityBoundary;
  metadata?: Record<string, unknown>;
};
type LoadedBundle = {
  bundle_path: string;
  manifest_path: string;
  manifest_text: string;
  parsed: unknown;
  manifest: ArtifactProvenanceBundleManifest;
};
type BundleValidation = {
  surface_kind: 'opl_artifact_provenance_bundle_validation';
  schema_version: typeof SCHEMA_VERSION | null;
  status: 'valid' | 'invalid';
  bundle_id: string | null;
  artifact_ref: string | null;
  domain_id: string | null;
  artifact_type: string | null;
  created_at: string | null;
  bundle_path: string;
  manifest_path: string;
  artifact_body_read: false;
  missing_required_fields: string[];
  invalid_fields: string[];
  invalid_hash_fields: string[];
  authority_violations: string[];
  forbidden_body_fields: string[];
  refs: BundleRefs;
  hash_keys: string[];
  forbidden_claims: string[];
  authority_boundary: ArtifactProvenanceBundleAuthorityBoundary;
};
type ArtifactProvenanceBundleRecord = {
  surface_kind: 'opl_artifact_provenance_bundle_record';
  record_ref: string;
  recorded_at: string;
  bundle_id: string;
  domain_id: string;
  artifact_ref: string;
  artifact_type: string;
  bundle_manifest_ref: string;
  bundle_manifest_hash: HashEntry;
  refs: BundleRefs;
  hashes: Record<string, HashEntry>;
  index_keys: {
    bundle_id: string;
    domain_artifact: string;
    artifact_ref: string;
  };
  artifact_body_read: false;
  authority_boundary: ArtifactProvenanceBundleAuthorityBoundary;
};
type ArtifactProvenanceBundleLedger = {
  surface_kind: 'opl_artifact_provenance_bundle_ledger';
  version: typeof LEDGER_VERSION;
  records: ArtifactProvenanceBundleRecord[];
};

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringList(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? uniqueStrings(value.map(optionalString).filter((entry): entry is string => Boolean(entry)))
    : [];
}

function authorityBoundary(forbiddenClaims: string[] = []): ArtifactProvenanceBundleAuthorityBoundary {
  return {
    ledger_refs_only: true,
    forbidden_claims: uniqueStrings(forbiddenClaims),
    can_read_artifact_body: false,
    can_store_artifact_body: false,
    can_mutate_artifact_body: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_authorize_quality_verdict: false,
    can_claim_domain_ready: false,
    can_claim_artifact_ready: false,
    can_claim_production_ready: false,
  };
}

function emptyRefs(): BundleRefs {
  return {
    code: [],
    inputs: [],
    outputs: [],
    environment: [],
    agent_trace: [],
    reviews: [],
    replay: [],
  };
}

function normalizeRefs(value: unknown) {
  const refs = emptyRefs();
  if (!isRecord(value)) {
    return refs;
  }
  for (const key of REF_KEYS) {
    refs[key] = stringList(value[key]);
  }
  return refs;
}

function normalizeHashEntry(value: unknown): HashEntry | null {
  if (typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)) {
    return { algorithm: 'sha256', value: value.toLowerCase() };
  }
  if (!isRecord(value) || value.algorithm !== 'sha256') {
    return null;
  }
  const hashValue = optionalString(value.value);
  return hashValue && /^[a-f0-9]{64}$/i.test(hashValue)
    ? { algorithm: 'sha256', value: hashValue.toLowerCase() }
    : null;
}

function normalizeHashes(value: unknown) {
  const hashes: Record<string, HashEntry> = {};
  if (!isRecord(value)) {
    return hashes;
  }
  for (const [key, rawHash] of Object.entries(value)) {
    const normalized = normalizeHashEntry(rawHash);
    if (normalized) {
      hashes[key] = normalized;
    }
  }
  return hashes;
}

function invalidHashFields(value: unknown) {
  if (!isRecord(value)) {
    return ['hashes'];
  }
  return Object.entries(value)
    .filter(([, rawHash]) => !isStrictHashEntry(rawHash))
    .map(([key]) => `hashes.${key}`);
}

function unknownFields(value: unknown, allowed: Set<string>, prefix: string) {
  if (!isRecord(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => prefix ? `${prefix}.${key}` : key);
}

function isStringArray(value: unknown) {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function invalidRefFields(value: unknown) {
  if (!isRecord(value)) {
    return ['refs'];
  }
  return [
    ...unknownFields(value, ALLOWED_REF_FIELDS, 'refs'),
    ...REF_KEYS
      .filter((key) => Object.hasOwn(value, key) && !isStringArray(value[key]))
      .map((key) => `refs.${key}`),
  ];
}

function isStrictHashEntry(value: unknown) {
  if (!isRecord(value) || value.algorithm !== 'sha256') {
    return false;
  }
  const hashValue = optionalString(value.value);
  return hashValue !== null
    && /^[a-f0-9]{64}$/.test(hashValue)
    && unknownFields(value, ALLOWED_HASH_ENTRY_FIELDS, '').length === 0;
}

function invalidAuthorityFields(value: unknown) {
  if (!isRecord(value)) {
    return ['authority_boundary'];
  }
  return [
    ...unknownFields(value, ALLOWED_AUTHORITY_FIELDS, 'authority_boundary'),
    isStringArray(value.forbidden_claims) ? null : 'authority_boundary.forbidden_claims',
  ].filter((field): field is string => Boolean(field));
}

function resolveBundleManifestPath(bundlePath: string) {
  const resolved = path.resolve(bundlePath);
  if (!fs.existsSync(resolved)) {
    throw new FrameworkContractError('cli_usage_error', 'Artifact provenance bundle path does not exist.', {
      bundle_path: resolved,
    });
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return resolved;
  }
  for (const candidate of ['artifact-provenance-bundle.json', 'bundle.json', 'manifest.json']) {
    const manifestPath = path.join(resolved, candidate);
    if (fs.existsSync(manifestPath)) {
      return manifestPath;
    }
  }
  throw new FrameworkContractError('cli_usage_error', 'Bundle directory does not contain a supported manifest file.', {
    bundle_path: resolved,
    supported_manifest_files: ['artifact-provenance-bundle.json', 'bundle.json', 'manifest.json'],
  });
}

function readBundle(bundlePath: string): LoadedBundle {
  const manifestPath = resolveBundleManifestPath(bundlePath);
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', 'Artifact provenance bundle manifest must be valid JSON.', {
      manifest_path: manifestPath,
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  return {
    bundle_path: path.resolve(bundlePath),
    manifest_path: manifestPath,
    manifest_text: manifestText,
    parsed,
    manifest: normalizeManifest(parsed),
  };
}

function normalizeManifest(value: unknown): ArtifactProvenanceBundleManifest {
  const record = isRecord(value) ? value : {};
  const rawAuthority = isRecord(record.authority_boundary) ? record.authority_boundary : {};
  const metadata = isRecord(record.metadata) ? { ...record.metadata } : undefined;
  return {
    schema_version: SCHEMA_VERSION,
    bundle_id: optionalString(record.bundle_id) ?? '',
    artifact_ref: optionalString(record.artifact_ref) ?? '',
    domain_id: optionalString(record.domain_id) ?? '',
    artifact_type: optionalString(record.artifact_type) ?? '',
    created_at: optionalString(record.created_at) ?? '',
    refs: normalizeRefs(record.refs),
    hashes: normalizeHashes(record.hashes),
    authority_boundary: authorityBoundary(stringList(rawAuthority.forbidden_claims)),
    ...(metadata ? { metadata } : {}),
  };
}

function collectForbiddenBodyFields(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenBodyFields(item, `${prefix}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const pathLabel = prefix ? `${prefix}.${key}` : key;
    return [
      ...(FORBIDDEN_BODY_FIELDS.includes(key) ? [pathLabel] : []),
      ...collectForbiddenBodyFields(child, pathLabel),
    ];
  });
}

function validationForLoadedBundle(loaded: LoadedBundle): BundleValidation {
  const record = isRecord(loaded.parsed) ? loaded.parsed : {};
  const rawAuthority = isRecord(record.authority_boundary) ? record.authority_boundary : {};
  const requiredFields: Array<[string, string | null]> = [
    ['schema_version', optionalString(record.schema_version)],
    ['bundle_id', optionalString(record.bundle_id)],
    ['artifact_ref', optionalString(record.artifact_ref)],
    ['domain_id', optionalString(record.domain_id)],
    ['artifact_type', optionalString(record.artifact_type)],
    ['created_at', optionalString(record.created_at)],
    ['refs', isRecord(record.refs) ? 'refs' : null],
    ['hashes', isRecord(record.hashes) ? 'hashes' : null],
    ['authority_boundary', isRecord(record.authority_boundary) ? 'authority_boundary' : null],
  ];
  const missingRequiredFields = requiredFields
    .filter(([, value]) => !value)
    .map(([field]) => field);
  const invalidFields = uniqueStrings([
    record.schema_version === SCHEMA_VERSION ? null : 'schema_version',
    isRecord(record.refs) && REF_KEYS.some((key) => loaded.manifest.refs[key].length > 0) ? null : 'refs',
    ...invalidRefFields(record.refs),
    isRecord(record.hashes) && Object.keys(loaded.manifest.hashes).length > 0 ? null : 'hashes',
    ...invalidAuthorityFields(rawAuthority),
    ...unknownFields(record, ALLOWED_MANIFEST_FIELDS, ''),
  ].filter((field): field is string => Boolean(field)));
  const authorityViolations = [
    rawAuthority.ledger_refs_only === true ? null : 'authority_boundary.ledger_refs_only',
    ...FALSE_AUTHORITY_FIELDS
      .filter((field) => Object.hasOwn(rawAuthority, field) && rawAuthority[field] !== false)
      .map((field) => `authority_boundary.${field}`),
  ].filter((field): field is string => Boolean(field));
  const forbiddenBodyFields = collectForbiddenBodyFields(record);
  const invalidHashes = invalidHashFields(record.hashes);
  const status = missingRequiredFields.length === 0
    && invalidFields.length === 0
    && invalidHashes.length === 0
    && authorityViolations.length === 0
    && forbiddenBodyFields.length === 0
    ? 'valid'
    : 'invalid';

  return {
    surface_kind: 'opl_artifact_provenance_bundle_validation',
    schema_version: optionalString(record.schema_version) === SCHEMA_VERSION ? SCHEMA_VERSION : null,
    status,
    bundle_id: loaded.manifest.bundle_id || null,
    artifact_ref: loaded.manifest.artifact_ref || null,
    domain_id: loaded.manifest.domain_id || null,
    artifact_type: loaded.manifest.artifact_type || null,
    created_at: loaded.manifest.created_at || null,
    bundle_path: loaded.bundle_path,
    manifest_path: loaded.manifest_path,
    artifact_body_read: false,
    missing_required_fields: missingRequiredFields,
    invalid_fields: invalidFields,
    invalid_hash_fields: invalidHashes,
    authority_violations: authorityViolations,
    forbidden_body_fields: forbiddenBodyFields,
    refs: loaded.manifest.refs,
    hash_keys: Object.keys(loaded.manifest.hashes),
    forbidden_claims: loaded.manifest.authority_boundary.forbidden_claims,
    authority_boundary: loaded.manifest.authority_boundary,
  };
}

function manifestHash(manifestText: string): HashEntry {
  return {
    algorithm: 'sha256',
    value: crypto.createHash('sha256').update(manifestText).digest('hex'),
  };
}

function ledgerPath() {
  return path.join(resolveOplStatePaths().state_dir, 'artifact-provenance-bundles.json');
}

function emptyLedger(): ArtifactProvenanceBundleLedger {
  return {
    surface_kind: 'opl_artifact_provenance_bundle_ledger',
    version: LEDGER_VERSION,
    records: [],
  };
}

function normalizeRecord(value: unknown): ArtifactProvenanceBundleRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const recordRef = optionalString(value.record_ref);
  const bundleId = optionalString(value.bundle_id);
  const domainId = optionalString(value.domain_id);
  const artifactRef = optionalString(value.artifact_ref);
  const artifactType = optionalString(value.artifact_type);
  const manifestRef = optionalString(value.bundle_manifest_ref);
  const bundleManifestHash = normalizeHashEntry(value.bundle_manifest_hash);
  if (!recordRef || !bundleId || !domainId || !artifactRef || !artifactType || !manifestRef || !bundleManifestHash) {
    return null;
  }
  return {
    surface_kind: 'opl_artifact_provenance_bundle_record',
    record_ref: recordRef,
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    bundle_id: bundleId,
    domain_id: domainId,
    artifact_ref: artifactRef,
    artifact_type: artifactType,
    bundle_manifest_ref: manifestRef,
    bundle_manifest_hash: bundleManifestHash,
    refs: normalizeRefs(value.refs),
    hashes: normalizeHashes(value.hashes),
    index_keys: {
      bundle_id: bundleId,
      domain_artifact: `${domainId}::${artifactRef}`,
      artifact_ref: artifactRef,
    },
    artifact_body_read: false,
    authority_boundary: authorityBoundary(
      isRecord(value.authority_boundary) ? stringList(value.authority_boundary.forbidden_claims) : [],
    ),
  };
}

function readLedger(): ArtifactProvenanceBundleLedger {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedger();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.records)) {
      return emptyLedger();
    }
    return {
      ...emptyLedger(),
      records: parsed.records
        .map(normalizeRecord)
        .filter((record): record is ArtifactProvenanceBundleRecord => Boolean(record)),
    };
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger: ArtifactProvenanceBundleLedger) {
  ensureOplStateDir();
  fs.writeFileSync(ledgerPath(), `${JSON.stringify(ledger, null, 2)}\n`);
}

function assertValidBundle(loaded: LoadedBundle) {
  const validation = validationForLoadedBundle(loaded);
  if (validation.status !== 'valid') {
    throw new FrameworkContractError('contract_shape_invalid', 'Artifact provenance bundle manifest failed validation.', {
      validation,
    });
  }
  return validation;
}

export function validateArtifactProvenanceBundle(bundlePath: string) {
  return validationForLoadedBundle(readBundle(bundlePath));
}

export function inspectArtifactProvenanceBundle(bundlePath: string) {
  const loaded = readBundle(bundlePath);
  const validation = validationForLoadedBundle(loaded);
  return {
    surface_kind: 'opl_artifact_provenance_bundle_inspection',
    status: validation.status,
    bundle_path: loaded.bundle_path,
    manifest_path: loaded.manifest_path,
    artifact_body_read: false,
    manifest: loaded.manifest,
    validation,
  };
}

export function recordArtifactProvenanceBundle(input: {
  bundlePath: string;
  domainId: string;
  artifactRef: string;
}) {
  const loaded = readBundle(input.bundlePath);
  const validation = assertValidBundle(loaded);
  if (loaded.manifest.domain_id !== input.domainId || loaded.manifest.artifact_ref !== input.artifactRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundle record domain/artifact arguments must match the manifest.', {
      requested: {
        domain_id: input.domainId,
        artifact_ref: input.artifactRef,
      },
      manifest: {
        domain_id: loaded.manifest.domain_id,
        artifact_ref: loaded.manifest.artifact_ref,
      },
    });
  }

  const bundleManifestHash = manifestHash(loaded.manifest_text);
  const record: ArtifactProvenanceBundleRecord = {
    surface_kind: 'opl_artifact_provenance_bundle_record',
    record_ref: `opl://artifact-provenance-bundle/${encodeURIComponent(loaded.manifest.bundle_id)}/${bundleManifestHash.value.slice(0, 16)}`,
    recorded_at: nowIso(),
    bundle_id: loaded.manifest.bundle_id,
    domain_id: input.domainId,
    artifact_ref: input.artifactRef,
    artifact_type: loaded.manifest.artifact_type,
    bundle_manifest_ref: loaded.manifest_path,
    bundle_manifest_hash: bundleManifestHash,
    refs: loaded.manifest.refs,
    hashes: loaded.manifest.hashes,
    index_keys: {
      bundle_id: loaded.manifest.bundle_id,
      domain_artifact: `${input.domainId}::${input.artifactRef}`,
      artifact_ref: input.artifactRef,
    },
    artifact_body_read: false,
    authority_boundary: loaded.manifest.authority_boundary,
  };
  const ledger = readLedger();
  const existingIndex = ledger.records.findIndex((entry) =>
    entry.bundle_id === record.bundle_id
    && entry.domain_id === record.domain_id
    && entry.artifact_ref === record.artifact_ref
  );
  if (existingIndex >= 0) {
    ledger.records[existingIndex] = record;
  } else {
    ledger.records.unshift(record);
  }
  writeLedger(ledger);
  return {
    surface_kind: 'opl_artifact_provenance_bundle_record_result',
    status: 'recorded',
    ledger_file: ledgerPath(),
    record,
    validation,
  };
}

export function exportArtifactProvenanceBundle(input: {
  bundlePath: string;
  format: 'ro-crate';
}) {
  const loaded = readBundle(input.bundlePath);
  const validation = assertValidBundle(loaded);
  const artifactHash = loaded.manifest.hashes.artifact ?? loaded.manifest.hashes.output;
  return {
    surface_kind: 'opl_artifact_provenance_bundle_export',
    format: input.format,
    bundle_id: loaded.manifest.bundle_id,
    artifact_body_read: false,
    ro_crate_metadata: {
      '@context': 'https://w3id.org/ro/crate/1.1/context',
      '@graph': [
        {
          '@id': './',
          '@type': 'Dataset',
          name: loaded.manifest.bundle_id,
          dateCreated: loaded.manifest.created_at,
          hasPart: [{ '@id': loaded.manifest.artifact_ref }],
          conformsTo: { '@id': 'contracts/opl-framework/artifact-provenance-bundle.schema.json' },
        },
        {
          '@id': loaded.manifest.artifact_ref,
          '@type': 'File',
          name: loaded.manifest.artifact_ref,
          encodingFormat: loaded.manifest.artifact_type,
          sha256: artifactHash?.value ?? null,
        },
        {
          '@id': path.basename(loaded.manifest_path),
          '@type': 'CreativeWork',
          name: 'Artifact provenance bundle manifest',
          sha256: manifestHash(loaded.manifest_text).value,
        },
      ],
    },
    validation,
    authority_boundary: loaded.manifest.authority_boundary,
  };
}

export function doctorArtifactProvenanceBundle(bundlePath: string) {
  const validation = validateArtifactProvenanceBundle(bundlePath);
  const attention = [
    ...validation.missing_required_fields.map((field) => `missing:${field}`),
    ...validation.invalid_fields.map((field) => `invalid:${field}`),
    ...validation.invalid_hash_fields.map((field) => `invalid_hash:${field}`),
    ...validation.authority_violations.map((field) => `authority:${field}`),
    ...validation.forbidden_body_fields.map((field) => `body_field:${field}`),
  ];
  return {
    surface_kind: 'opl_artifact_provenance_bundle_doctor',
    status: attention.length === 0 ? 'ok' : 'attention',
    attention,
    artifact_body_read: false,
    validation,
    next_action: attention.length === 0
      ? 'no_action_required'
      : 'repair_bundle_manifest_refs_hashes_or_authority_boundary',
  };
}
