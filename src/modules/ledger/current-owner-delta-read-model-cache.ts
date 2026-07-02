import fs from 'node:fs';
import path from 'node:path';

import {
  ensureOplStateDir,
  resolveOplStatePaths,
  type OplStatePaths,
} from '../runway/runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

type CurrentOwnerDeltaReadModelCacheInput = {
  readModel: unknown;
  sourceSurface: string;
  sourceCommand: string;
  paths?: OplStatePaths;
  sourceCurrentnessIdentity?: unknown;
};

type CurrentOwnerDeltaReadModelCacheReadInput = {
  paths?: OplStatePaths;
  acceptedSourceSurfaces?: string[];
  expectedCurrentnessIdentity?: unknown;
  maxAgeMs?: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function currentnessIdentityFrom(value: unknown) {
  const readModel = isRecord(value) ? value : {};
  const delta = isRecord(readModel.current_owner_delta) ? readModel.current_owner_delta : {};
  const basis = isRecord(delta.owner_route_currentness_basis)
    ? delta.owner_route_currentness_basis
    : {};
  const envelope = isRecord(readModel.current_execution_envelope)
    ? readModel.current_execution_envelope
    : {};
  const explicit = isRecord(readModel.currentness_identity)
    ? readModel.currentness_identity
    : {};
  const identity = {
    delta_id: stringValue(delta.delta_id) ?? stringValue(readModel.delta_id) ?? stringValue(explicit.delta_id),
    domain_id:
      stringValue(delta.domain_id)
      ?? stringValue(delta.domain)
      ?? stringValue(readModel.domain_id)
      ?? stringValue(readModel.domain)
      ?? stringValue(explicit.domain_id)
      ?? stringValue(explicit.domain),
    current_owner:
      stringValue(delta.current_owner)
      ?? stringValue(readModel.current_owner)
      ?? stringValue(explicit.current_owner),
    stage_id:
      stringValue(delta.stage_id)
      ?? stringValue(delta.stage_ref)
      ?? stringValue(readModel.stage_id)
      ?? stringValue(readModel.stage_ref)
      ?? stringValue(explicit.stage_id)
      ?? stringValue(explicit.stage_ref),
    lineage_ref:
      stringValue(delta.lineage_ref)
      ?? stringValue(readModel.lineage_ref)
      ?? stringValue(explicit.lineage_ref),
    source_fingerprint:
      stringValue(delta.source_fingerprint)
      ?? stringValue(readModel.source_fingerprint)
      ?? stringValue(basis.source_fingerprint)
      ?? stringValue(envelope.source_fingerprint)
      ?? stringValue(explicit.source_fingerprint),
    work_unit_fingerprint:
      stringValue(delta.work_unit_fingerprint)
      ?? stringValue(readModel.work_unit_fingerprint)
      ?? stringValue(basis.work_unit_fingerprint)
      ?? stringValue(envelope.work_unit_fingerprint)
      ?? stringValue(explicit.work_unit_fingerprint),
    truth_epoch:
      stringValue(basis.truth_epoch)
      ?? stringValue(readModel.truth_epoch)
      ?? stringValue(explicit.truth_epoch),
    runtime_health_epoch:
      stringValue(basis.runtime_health_epoch)
      ?? stringValue(readModel.runtime_health_epoch)
      ?? stringValue(explicit.runtime_health_epoch),
    source_eval_id:
      stringValue(basis.source_eval_id)
      ?? stringValue(readModel.source_eval_id)
      ?? stringValue(explicit.source_eval_id),
  };
  return Object.fromEntries(
    Object.entries(identity).filter(([, entry]) => entry !== null),
  );
}

function mergedCurrentnessIdentity(readModel: unknown, sourceCurrentnessIdentity: unknown) {
  return {
    ...currentnessIdentityFrom(readModel),
    ...(isRecord(sourceCurrentnessIdentity) ? currentnessIdentityFrom(sourceCurrentnessIdentity) : {}),
  };
}

function hasCurrentnessIdentity(value: unknown) {
  return Object.keys(currentnessIdentityFrom(value)).length > 0;
}

function currentnessIdentityMatches(cached: unknown, expected: unknown) {
  if (!isRecord(expected)) {
    return true;
  }
  const cachedIdentity = isRecord(cached) ? cached : {};
  return Object.entries(currentnessIdentityFrom(expected)).every(([key, value]) =>
    stringValue(cachedIdentity[key]) === value
  );
}

function cacheIsFreshEnough(cachedAt: unknown, maxAgeMs: unknown) {
  const limit = numberValue(maxAgeMs);
  if (limit === null) {
    return true;
  }
  const timestamp = Date.parse(stringValue(cachedAt) ?? '');
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return Date.now() - timestamp <= limit;
}

function readModelIsUsable(value: unknown): value is JsonRecord {
  if (!isRecord(value)) {
    return false;
  }
  if (value.surface_kind !== 'opl_current_owner_delta_read_model') {
    return false;
  }
  if (!isRecord(value.current_owner_delta)) {
    return false;
  }
  return stringValue(value.current_owner) !== null
    && stringValue(value.required_delta) !== null
    && value.current_owner_delta.surface_kind === 'opl_current_owner_delta';
}

function cacheAuthorityBoundary() {
  return {
    cache_is_domain_truth: false,
    cache_can_execute_domain_action: false,
    cache_can_create_owner_receipt: false,
    cache_can_create_typed_blocker: false,
    cache_can_close_owner_chain: false,
    cache_can_close_domain_ready: false,
    cache_can_claim_app_release_ready: false,
    cache_can_claim_production_ready: false,
    cache_is_release_ready_evidence: false,
  };
}

function buildCurrentOwnerDeltaReadModelCachePayload(
  input: CurrentOwnerDeltaReadModelCacheInput,
) {
  if (!readModelIsUsable(input.readModel)) {
    return null;
  }
  return {
    version: 'g1',
    surface_kind: 'opl_current_owner_delta_read_model_projection_cache',
    cache_policy:
      'non_authoritative_app_fast_projection_cache_from_owner_delta_first_sources',
    source_surface: input.sourceSurface,
    source_command: input.sourceCommand,
    cached_at: new Date().toISOString(),
    currentness_identity: mergedCurrentnessIdentity(
      input.readModel,
      input.sourceCurrentnessIdentity,
    ),
    current_owner_delta_read_model: input.readModel,
    authority_boundary: cacheAuthorityBoundary(),
  };
}

function cacheFileForSource(paths: OplStatePaths, sourceSurface: string) {
  if (sourceSurface === 'framework_readiness') {
    return paths.current_owner_delta_read_model_cache_file;
  }
  const parsed = path.parse(paths.current_owner_delta_read_model_cache_file);
  const safeSource = sourceSurface.replace(/[^A-Za-z0-9_.-]+/g, '_');
  return path.join(parsed.dir, `${parsed.name}.${safeSource}${parsed.ext}`);
}

export function writeCurrentOwnerDeltaReadModelProjectionCache(
  input: CurrentOwnerDeltaReadModelCacheInput,
) {
  const payload = buildCurrentOwnerDeltaReadModelCachePayload(input);
  if (!payload) {
    return false;
  }
  try {
    const paths = ensureOplStateDir(input.paths ?? resolveOplStatePaths());
    fs.writeFileSync(
      cacheFileForSource(paths, input.sourceSurface),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch {
    return false;
  }
}

export function readCurrentOwnerDeltaReadModelProjectionCache(
  input: CurrentOwnerDeltaReadModelCacheReadInput = {},
) {
  const paths = input.paths ?? resolveOplStatePaths();
  try {
    const parsed = JSON.parse(
      fs.readFileSync(paths.current_owner_delta_read_model_cache_file, 'utf8'),
    );
    if (
      !isRecord(parsed)
      || parsed.version !== 'g1'
      || parsed.surface_kind !== 'opl_current_owner_delta_read_model_projection_cache'
      || !readModelIsUsable(parsed.current_owner_delta_read_model)
    ) {
      return null;
    }
    if (
      Array.isArray(input.acceptedSourceSurfaces)
      && input.acceptedSourceSurfaces.length > 0
      && !input.acceptedSourceSurfaces.includes(stringValue(parsed.source_surface) ?? '')
    ) {
      return null;
    }
    if (!cacheIsFreshEnough(parsed.cached_at, input.maxAgeMs)) {
      return null;
    }
    if (
      !hasCurrentnessIdentity(parsed.currentness_identity)
      || !currentnessIdentityMatches(parsed.currentness_identity, input.expectedCurrentnessIdentity)
    ) {
      return null;
    }
    return parsed.current_owner_delta_read_model;
  } catch {
    return null;
  }
}
