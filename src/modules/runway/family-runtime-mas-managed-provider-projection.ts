import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';

import { FrameworkContractError } from '../charter/index.ts';
import { resolveBindingManifest } from '../atlas/index.ts';
import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import { resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import { getActiveWorkspaceBinding } from '../workspace/index.ts';

type JsonRecord = Record<string, unknown>;
const DEFAULT_MANAGED_PROVIDER_PROJECTION_TIMEOUT_MS = 2_000;

export type MasManagedProviderProjection = {
  surface_kind: 'opl_mas_managed_provider_projection';
  role: 'read_only_status_projection';
  managed_temporal_state_consistency_declared: boolean;
  family_stage_control_plane_declared: boolean;
  domain_memory_descriptor_declared: boolean;
  owner_receipt_contract_declared: boolean;
  legacy_retirement_tombstone_declared: boolean;
  managed_temporal_state_consistency: JsonRecord | null;
  family_stage_control_plane: JsonRecord | null;
  domain_memory_descriptor: JsonRecord | null;
  owner_receipt_contract: JsonRecord | null;
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

function errorCode(error: Error | undefined) {
  return error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : null;
}

function cleanupTimedOutProcessGroup(result: ReturnType<typeof spawnSync>) {
  if (errorCode(result.error) !== 'ETIMEDOUT' || !result.pid) {
    return;
  }
  try {
    process.kill(-result.pid, 'SIGKILL');
  } catch {
    try {
      process.kill(result.pid, 'SIGKILL');
    } catch {
      // Projection is read-only and already fail-closed; cleanup is best-effort.
    }
  }
}

function resolveManagedProviderProjectionTimeoutMs() {
  const raw = process.env.OPL_FAMILY_RUNTIME_MANAGED_PROVIDER_PROJECTION_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_MANAGED_PROVIDER_PROJECTION_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL_FAMILY_RUNTIME_MANAGED_PROVIDER_PROJECTION_TIMEOUT_MS must be a positive integer.',
      { env: 'OPL_FAMILY_RUNTIME_MANAGED_PROVIDER_PROJECTION_TIMEOUT_MS', value: raw },
    );
  }
  return parsed;
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

function serviceReady(projection: JsonRecord) {
  return statusIsReady(projection.service_status)
    || statusIsReady(projection.service_readiness)
    || projection.service_ready === true
    || projection.managed_service_ready === true;
}

function workerReady(projection: JsonRecord) {
  return statusIsReady(projection.worker_status)
    || statusIsReady(projection.worker_readiness)
    || projection.worker_ready === true
    || projection.managed_worker_ready === true;
}

function projectionReady(projection: JsonRecord) {
  return statusIsReady(projection.projection_status)
    || statusIsReady(projection.status)
    || projection.ready === true
    || projection.projection_status === undefined;
}

function managedTemporalProjectionReady(projection: JsonRecord) {
  return serviceReady(projection) && workerReady(projection) && projectionReady(projection);
}

function normalizedManagedTemporalAuthorityBoundary(projection: JsonRecord) {
  const authorityBoundary = isRecord(projection.authority_boundary)
    ? projection.authority_boundary
    : {};
  return {
    opl_role: 'projection_consumer_only',
    domain_truth: 'domain_owned',
    paper_closure_authority: 'mas_only',
    ...authorityBoundary,
  };
}

function normalizeManagedTemporalProjection(projection: JsonRecord, source: JsonRecord) {
  if (!managedTemporalProjectionReady(projection)) {
    return null;
  }

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
    authority_boundary: normalizedManagedTemporalAuthorityBoundary(projection),
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
  const familyStageControlPlane = findProjection(payload, 'family_stage_control_plane');
  const domainMemoryDescriptor = findProjection(payload, 'domain_memory_descriptor');
  const ownerReceiptContract = findProjection(payload, 'owner_receipt_contract')
    ?? findProjection(payload, 'domain_owner_receipt_contract');
  const legacyTombstone = findProjection(payload, 'legacy_retirement_tombstone_proof');
  const normalizedManagedTemporal = managedTemporal
    ? normalizeManagedTemporalProjection(managedTemporal, source)
    : null;
  const normalizedFamilyStageControlPlane = familyStageControlPlane
    ? {
        ...familyStageControlPlane,
        surface_kind: optionalString(familyStageControlPlane.surface_kind) ?? 'family_stage_control_plane',
        source_manifest: source,
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          domain_truth: 'domain_owned',
          ...(
            isRecord(familyStageControlPlane.authority_boundary)
              ? familyStageControlPlane.authority_boundary
              : {}
          ),
        },
      }
    : null;
  const normalizedDomainMemoryDescriptor = domainMemoryDescriptor
    ? {
        ...domainMemoryDescriptor,
        surface_kind: optionalString(domainMemoryDescriptor.surface_kind) ?? 'family_domain_memory_descriptor',
        source_manifest: source,
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          domain_truth: 'domain_owned',
          ...(
            isRecord(domainMemoryDescriptor.authority_boundary)
              ? domainMemoryDescriptor.authority_boundary
              : {}
          ),
        },
      }
    : null;
  const normalizedOwnerReceiptContract = ownerReceiptContract
    ? {
        ...ownerReceiptContract,
        surface_kind: optionalString(ownerReceiptContract.surface_kind) ?? 'owner_receipt_contract',
        source_manifest: source,
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          domain_truth: 'domain_owned',
          ...(
            isRecord(ownerReceiptContract.authority_boundary)
              ? ownerReceiptContract.authority_boundary
              : {}
          ),
        },
      }
    : null;
  const normalizedLegacyTombstone = legacyTombstone
    ? normalizeLegacyRetirementTombstoneProof(legacyTombstone, source)
    : null;

  if (
    !normalizedManagedTemporal
    && !normalizedFamilyStageControlPlane
    && !normalizedDomainMemoryDescriptor
    && !normalizedOwnerReceiptContract
    && !normalizedLegacyTombstone
  ) {
    return null;
  }

  return {
    surface_kind: 'opl_mas_managed_provider_projection',
    role: 'read_only_status_projection',
    managed_temporal_state_consistency_declared: Boolean(normalizedManagedTemporal),
    family_stage_control_plane_declared: Boolean(normalizedFamilyStageControlPlane),
    domain_memory_descriptor_declared: Boolean(normalizedDomainMemoryDescriptor),
    owner_receipt_contract_declared: Boolean(normalizedOwnerReceiptContract),
    legacy_retirement_tombstone_declared: Boolean(normalizedLegacyTombstone),
    managed_temporal_state_consistency: normalizedManagedTemporal,
    family_stage_control_plane: normalizedFamilyStageControlPlane,
    domain_memory_descriptor: normalizedDomainMemoryDescriptor,
    owner_receipt_contract: normalizedOwnerReceiptContract,
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

export function projectionFromMasManifestEntry(entry: DomainManifestCatalogEntry | null | undefined) {
  if (!entry?.manifest_command) {
    return null;
  }
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

function projectionFromManifest(options: { manifestTimeoutMs?: number } = {}) {
  const binding = getActiveWorkspaceBinding('medautoscience');
  if (!binding?.direct_entry.manifest_command) {
    return null;
  }
  return projectionFromMasManifestEntry(resolveBindingManifest('medautoscience', 'med-autoscience', binding, {
    timeoutMs: options.manifestTimeoutMs,
    timeoutPolicy: options.manifestTimeoutMs === undefined ? 'env_or_default' : 'fixed',
    materializeFamilyTransitions: false,
  }));
}

function projectionFromDomainHandler(options: { domainHandlerTimeoutMs?: number } = {}) {
  const command = commandFromEnv('OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT');
  if (!command) {
    return null;
  }
  const timeout = options.domainHandlerTimeoutMs
    ?? resolveManagedProviderProjectionTimeoutMs();
  const spawnOptions: SpawnSyncOptionsWithStringEncoding & { detached: boolean } = {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    timeout,
    detached: true,
    killSignal: 'SIGTERM',
  };
  const result = spawnSync(command[0], command.slice(1), spawnOptions);
  cleanupTimedOutProcessGroup(result);
  if (result.error || (result.status ?? 1) !== 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.stdout ?? '') as unknown;
    return projectionFromPayload(parsed, {
      surface_kind: 'mas_family_domain_handler_export_projection_ref',
      command_preview: command,
      projection_ref: '/',
    });
  } catch {
    return null;
  }
}

export function readMasManagedProviderProjection(
  options: { includeManifest?: boolean; manifestTimeoutMs?: number; domainHandlerTimeoutMs?: number } = {},
): MasManagedProviderProjection | null {
  const domainHandlerProjection = projectionFromDomainHandler(options);
  if (domainHandlerProjection) {
    return domainHandlerProjection;
  }
  return options.includeManifest === false
    ? null
    : projectionFromManifest({
        manifestTimeoutMs: options.manifestTimeoutMs ?? resolveManagedProviderProjectionTimeoutMs(),
      });
}
