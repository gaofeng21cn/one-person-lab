import { spawnSync } from 'node:child_process';

import { resolveBindingManifest } from './domain-manifest/resolver.ts';
import { resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import { getActiveWorkspaceBinding } from './workspace-registry.ts';

type JsonRecord = Record<string, unknown>;

export type MasManagedProviderProjection = {
  surface_kind: 'opl_mas_managed_provider_projection';
  role: 'read_only_status_projection';
  managed_temporal_state_consistency: JsonRecord | null;
  legacy_retirement_tombstone_proof: JsonRecord | null;
  source_status: 'available' | 'not_configured';
  source_refs: JsonRecord[];
  authority_boundary: {
    opl: 'status_projection_only';
    mas: 'domain_truth_quality_artifact_and_publication_authority';
    can_write_domain_truth: false;
    can_authorize_publication_quality: false;
    can_authorize_submission_readiness: false;
  };
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
}

function statusIsReady(value: unknown) {
  const status = optionalString(value);
  return status === 'ready'
    || status === 'provider_ready'
    || status === 'managed_temporal_ready'
    || status === 'production_residency_proven';
}

function commandFromEnv(name: string) {
  const override = process.env[name]?.trim();
  return override ? override.split(/\s+/) : null;
}

function nestedRecord(value: unknown, path: string[]) {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }
  return isRecord(cursor) ? cursor : null;
}

function findProjection(payload: unknown, key: string): JsonRecord | null {
  const direct = nestedRecord(payload, [key]);
  if (direct) {
    return direct;
  }

  const paths = [
    ['domain_projection', key],
    ['progress_projection', 'domain_projection', key],
    ['runtime_inventory', 'domain_projection', key],
    ['runtime_control', 'domain_projection', key],
    ['session_continuity', 'domain_projection', key],
    ['product_entry_manifest', 'domain_projection', key],
    ['product_entry_manifest', 'progress_projection', 'domain_projection', key],
    ['product_entry_manifest', 'runtime_inventory', 'domain_projection', key],
    ['product_entry_manifest', 'runtime_control', 'domain_projection', key],
    ['product_entry_manifest', 'session_continuity', 'domain_projection', key],
  ];

  for (const path of paths) {
    const candidate = nestedRecord(payload, path);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function normalizeManagedTemporalProjection(projection: JsonRecord, source: JsonRecord) {
  const serviceReady = statusIsReady(projection.service_status)
    || statusIsReady(projection.service_readiness)
    || projection.service_ready === true
    || projection.managed_service_ready === true;
  const workerReady = statusIsReady(projection.worker_status)
    || statusIsReady(projection.worker_readiness)
    || projection.worker_ready === true
    || projection.managed_worker_ready === true;
  const projectionReady = statusIsReady(projection.projection_status)
    || statusIsReady(projection.status)
    || projection.ready === true;
  if (!(serviceReady && workerReady && (projectionReady || projection.projection_status === undefined))) {
    return null;
  }

  const authorityBoundary = isRecord(projection.authority_boundary)
    ? projection.authority_boundary
    : {};
  return {
    ...projection,
    surface_kind: optionalString(projection.surface_kind) ?? 'managed_temporal_state_consistency',
    projection_status: optionalString(projection.projection_status)
      ?? optionalString(projection.status)
      ?? 'ready',
    provider_kind: optionalString(projection.provider_kind) ?? 'temporal',
    service_status: optionalString(projection.service_status)
      ?? optionalString(projection.service_readiness)
      ?? 'ready',
    worker_status: optionalString(projection.worker_status)
      ?? optionalString(projection.worker_readiness)
      ?? 'ready',
    address: optionalString(projection.address),
    namespace: optionalString(projection.namespace) ?? resolveTemporalNamespace(),
    task_queue: optionalString(projection.task_queue) ?? resolveTemporalTaskQueue(),
    source_refs: stringList(projection.source_refs),
    provider_proof_ref: optionalString(projection.provider_proof_ref),
    source_manifest: source,
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      domain_truth: 'domain_owned',
      paper_closure_authority: 'mas_only',
      ...authorityBoundary,
    },
  };
}

function normalizeLegacyRetirementTombstoneProof(projection: JsonRecord, source: JsonRecord) {
  const authorityBoundary = isRecord(projection.authority_boundary)
    ? projection.authority_boundary
    : {};
  return {
    ...projection,
    surface_kind: optionalString(projection.surface_kind) ?? 'legacy_retirement_tombstone_proof',
    status: optionalString(projection.status) ?? 'unknown',
    active_default_callers: Array.isArray(projection.active_default_callers)
      ? projection.active_default_callers
      : [],
    source_refs: stringList(projection.source_refs),
    source_manifest: source,
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      domain_truth: 'domain_owned',
      paper_closure_authority: 'mas_only',
      ...authorityBoundary,
    },
  };
}

function projectionFromPayload(payload: unknown, source: JsonRecord): MasManagedProviderProjection | null {
  const managedTemporal = findProjection(payload, 'managed_temporal_state_consistency');
  const legacyTombstone = findProjection(payload, 'legacy_retirement_tombstone_proof');
  const normalizedManagedTemporal = managedTemporal
    ? normalizeManagedTemporalProjection(managedTemporal, source)
    : null;
  const normalizedLegacyTombstone = legacyTombstone
    ? normalizeLegacyRetirementTombstoneProof(legacyTombstone, source)
    : null;

  if (!normalizedManagedTemporal && !normalizedLegacyTombstone) {
    return null;
  }

  return {
    surface_kind: 'opl_mas_managed_provider_projection',
    role: 'read_only_status_projection',
    managed_temporal_state_consistency: normalizedManagedTemporal,
    legacy_retirement_tombstone_proof: normalizedLegacyTombstone,
    source_status: 'available',
    source_refs: [source],
    authority_boundary: {
      opl: 'status_projection_only',
      mas: 'domain_truth_quality_artifact_and_publication_authority',
      can_write_domain_truth: false,
      can_authorize_publication_quality: false,
      can_authorize_submission_readiness: false,
    },
  };
}

function projectionFromManifest() {
  const binding = getActiveWorkspaceBinding('medautoscience');
  if (!binding?.direct_entry.manifest_command) {
    return null;
  }
  const entry = resolveBindingManifest('medautoscience', 'med-autoscience', binding);
  if (entry.status !== 'resolved' || !entry.manifest) {
    return null;
  }
  return projectionFromPayload(entry.manifest, {
    surface_kind: 'domain_manifest_projection_ref',
    project_id: entry.project_id,
    project: entry.project,
    binding_id: entry.binding_id,
    workspace_path: entry.workspace_path,
    manifest_command: entry.manifest_command,
    projection_ref: '/progress_projection/domain_projection',
  });
}

function projectionFromSidecar() {
  const command = commandFromEnv('OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT');
  if (!command) {
    return null;
  }
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || (result.status ?? 1) !== 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.stdout ?? '') as unknown;
    return projectionFromPayload(parsed, {
      surface_kind: 'mas_family_sidecar_export_projection_ref',
      command_preview: command,
      projection_ref: '/',
    });
  } catch {
    return null;
  }
}

export function readMasManagedProviderProjection(): MasManagedProviderProjection | null {
  return projectionFromManifest() ?? projectionFromSidecar();
}
