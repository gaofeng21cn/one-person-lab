import { record, stringList, stringValue, type JsonRecord } from '../../kernel/json-record.ts';
import { buildDomainManifestCatalog, type DomainManifestCatalog, type DomainManifestCatalogEntry } from '../atlas/index.ts';
import { loadFrameworkContracts } from '../charter/index.ts';
import { listWorkspaceBindings } from '../workspace/index.ts';
import { resolveTemporalNamespace, resolveTemporalTaskQueue } from './family-runtime-temporal.ts';

export type ManagedDomainProviderProjection = {
  surface_kind: 'opl_managed_domain_provider_projection';
  domain_id: string;
  project: string;
  role: 'read_only_status_projection';
  managed_temporal_state_consistency: JsonRecord;
  source_refs: JsonRecord[];
  authority_boundary: {
    opl: 'status_projection_only';
    domain: 'truth_quality_artifact_authority';
    can_write_domain_truth: false;
    can_authorize_quality_verdict: false;
    can_authorize_domain_ready: false;
  };
};

export type ManagedProviderProjectionSummary = {
  surface_kind: 'opl_managed_domain_provider_projection_summary';
  role: 'read_only_status_projection';
  status: 'available' | 'conflicted';
  domains: Record<string, ManagedDomainProviderProjection>;
  managed_temporal_state_consistency: JsonRecord | null;
  managed_temporal_state_consistency_declared: boolean;
  conflicts: JsonRecord[];
  summary: {
    domain_count: number;
    managed_temporal_domain_count: number;
    conflict_count: number;
  };
  authority_boundary: {
    opl: 'status_projection_only';
    domain: 'truth_quality_artifact_authority';
    can_write_domain_truth: false;
    can_authorize_quality_verdict: false;
    can_authorize_domain_ready: false;
  };
};

type ProjectionCandidate = {
  domainId: string;
  sourceKind: string;
  projection: ManagedDomainProviderProjection;
};

function statusIsReady(value: unknown) {
  const status = stringValue(value);
  return status === 'ready'
    || status === 'provider_ready'
    || status === 'managed_temporal_ready'
    || status === 'production_residency_proven';
}

function nestedRecord(value: unknown, path: string[]) {
  let cursor: unknown = value;
  for (const key of path) {
    const current = record(cursor);
    if (current !== cursor) {
      return null;
    }
    cursor = current[key];
  }
  const result = record(cursor);
  return result === cursor ? result : null;
}

function findProjection(payload: unknown, key: string): JsonRecord | null {
  const direct = nestedRecord(payload, [key]);
  if (direct) {
    return direct;
  }
  for (const path of [
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
  ]) {
    const candidate = nestedRecord(payload, path);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function managedTemporalProjectionReady(projection: JsonRecord) {
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
    || projection.ready === true
    || projection.projection_status === undefined;
  return serviceReady && workerReady && projectionReady;
}

function normalizeManagedTemporalProjection(projection: JsonRecord, source: JsonRecord) {
  if (!managedTemporalProjectionReady(projection)) {
    return null;
  }
  return {
    ...projection,
    surface_kind: stringValue(projection.surface_kind) ?? 'managed_temporal_state_consistency',
    projection_status: stringValue(projection.projection_status)
      ?? stringValue(projection.status)
      ?? 'ready',
    provider_kind: stringValue(projection.provider_kind) ?? 'temporal',
    service_status: stringValue(projection.service_status)
      ?? stringValue(projection.service_readiness)
      ?? 'ready',
    worker_status: stringValue(projection.worker_status)
      ?? stringValue(projection.worker_readiness)
      ?? 'ready',
    address: stringValue(projection.address),
    namespace: stringValue(projection.namespace) ?? resolveTemporalNamespace(),
    task_queue: stringValue(projection.task_queue) ?? resolveTemporalTaskQueue(),
    source_refs: stringList(projection.source_refs),
    provider_proof_ref: stringValue(projection.provider_proof_ref),
    source_manifest: source,
    authority_boundary: {
      ...record(projection.authority_boundary),
      opl_role: 'projection_consumer_only',
      domain_truth: 'domain_owned',
    },
  };
}

function projectionFromPayload(
  payload: unknown,
  source: JsonRecord,
  domainId: string,
  project: string,
): ManagedDomainProviderProjection | null {
  const managedTemporal = findProjection(payload, 'managed_temporal_state_consistency');
  const normalizedManagedTemporal = managedTemporal
    ? normalizeManagedTemporalProjection(managedTemporal, source)
    : null;
  if (!normalizedManagedTemporal) {
    return null;
  }
  return {
    surface_kind: 'opl_managed_domain_provider_projection',
    domain_id: domainId,
    project,
    role: 'read_only_status_projection',
    managed_temporal_state_consistency: normalizedManagedTemporal,
    source_refs: [source],
    authority_boundary: {
      opl: 'status_projection_only',
      domain: 'truth_quality_artifact_authority',
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_authorize_domain_ready: false,
    },
  };
}

export function projectionFromDomainManifestEntry(entry: DomainManifestCatalogEntry | null | undefined) {
  if (entry?.status !== 'resolved' || !entry.manifest) {
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
  }, entry.project_id, entry.project);
}

function temporalIdentity(projection: ManagedDomainProviderProjection) {
  const temporal = projection.managed_temporal_state_consistency;
  return JSON.stringify([
    stringValue(temporal.provider_kind) ?? 'temporal',
    stringValue(temporal.address),
    stringValue(temporal.namespace),
    stringValue(temporal.task_queue),
  ]);
}

function entriesFromRegistry(): DomainManifestCatalogEntry[] {
  const bindings = new Map(listWorkspaceBindings()
    .filter((binding) => binding.status === 'active')
    .map((binding) => [binding.project_id, binding]));
  return loadFrameworkContracts().domains.domains.map((domain) => {
    const binding = bindings.get(domain.domain_id);
    return {
      project_id: domain.domain_id,
      project: domain.project,
      binding_id: binding?.binding_id ?? null,
      workspace_path: binding?.workspace_path ?? null,
      manifest_command: binding?.direct_entry.manifest_command ?? null,
      status: 'not_bound',
      manifest: null,
      error: null,
    };
  });
}

export function buildManagedProviderProjectionSummary(
  entries: DomainManifestCatalogEntry[],
  options: { includeManifest?: boolean } = {},
): ManagedProviderProjectionSummary | null {
  const candidates = entries.flatMap((entry) => {
    const manifest = options.includeManifest === false ? null : projectionFromDomainManifestEntry(entry);
    return [
      ...(manifest ? [{ domainId: entry.project_id, sourceKind: 'domain_manifest', projection: manifest }] : []),
    ] satisfies ProjectionCandidate[];
  });
  if (candidates.length === 0) {
    return null;
  }

  const conflicts: JsonRecord[] = [];
  const domains = Object.fromEntries([...new Set(candidates.map((candidate) => candidate.domainId))].map((domainId) => {
    const domainCandidates = candidates.filter((candidate) => candidate.domainId === domainId);
    const identities = [...new Set(domainCandidates.map(({ projection }) => temporalIdentity(projection)).filter(Boolean))];
    if (identities.length > 1) {
      conflicts.push({
        conflict_kind: 'domain_provider_projection_source_disagreement',
        domain_id: domainId,
        sources: domainCandidates.map(({ sourceKind, projection }) => ({
          source_kind: sourceKind,
          source_refs: projection.source_refs,
          temporal_identity: temporalIdentity(projection),
        })),
      });
    }
    const preferred = domainCandidates.find(({ sourceKind }) => sourceKind === 'domain_manifest')
      ?? domainCandidates[0];
    return [domainId, preferred.projection];
  }));

  const temporalDomains = Object.values(domains);
  const temporalIdentities = [...new Set(temporalDomains.map(temporalIdentity))];
  if (temporalIdentities.length > 1) {
    conflicts.push({
      conflict_kind: 'managed_temporal_provider_configuration_disagreement',
      domains: temporalDomains.map((projection) => ({
        domain_id: projection.domain_id,
        temporal_identity: temporalIdentity(projection),
        source_refs: projection.source_refs,
      })),
    });
  }
  const managedTemporalState = conflicts.length === 0 && temporalDomains.length > 0
    ? {
        ...temporalDomains[0].managed_temporal_state_consistency,
        declaring_domain_ids: temporalDomains.map((projection) => projection.domain_id),
      }
    : null;
  return {
    surface_kind: 'opl_managed_domain_provider_projection_summary',
    role: 'read_only_status_projection',
    status: conflicts.length > 0 ? 'conflicted' : 'available',
    domains,
    managed_temporal_state_consistency: managedTemporalState,
    managed_temporal_state_consistency_declared: temporalDomains.length > 0,
    conflicts,
    summary: {
      domain_count: Object.keys(domains).length,
      managed_temporal_domain_count: temporalDomains.length,
      conflict_count: conflicts.length,
    },
    authority_boundary: {
      opl: 'status_projection_only',
      domain: 'truth_quality_artifact_authority',
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_authorize_domain_ready: false,
    },
  };
}

export function projectionSummaryFromDomainManifestCatalog(catalog: DomainManifestCatalog) {
  return buildManagedProviderProjectionSummary(catalog.projects);
}

export function readManagedProviderProjectionSummary(options: {
  includeManifest?: boolean;
  domainManifests?: DomainManifestCatalog;
  manifestTimeoutMs?: number;
} = {}) {
  const entries = options.domainManifests?.projects
    ?? (options.includeManifest === false
      ? entriesFromRegistry()
      : buildDomainManifestCatalog(loadFrameworkContracts(), {
          manifestCommandTimeoutMs: options.manifestTimeoutMs ?? 2_000,
          manifestCommandTimeoutPolicy: 'fixed',
          materializeFamilyTransitions: false,
          writeProjectionCache: false,
        }).domain_manifests.projects);
  return buildManagedProviderProjectionSummary(entries, {
    includeManifest: options.includeManifest,
  });
}
