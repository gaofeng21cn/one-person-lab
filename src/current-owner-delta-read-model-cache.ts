import fs from 'node:fs';
import path from 'node:path';

import {
  ensureOplStateDir,
  resolveOplStatePaths,
  type OplStatePaths,
} from './runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

type CurrentOwnerDeltaReadModelCacheInput = {
  readModel: unknown;
  sourceSurface: string;
  sourceCommand: string;
  paths?: OplStatePaths;
};

type CurrentOwnerDeltaReadModelCacheReadInput = {
  paths?: OplStatePaths;
  acceptedSourceSurfaces?: string[];
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
    return parsed.current_owner_delta_read_model;
  } catch {
    return null;
  }
}
