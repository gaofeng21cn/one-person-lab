import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from '../atlas/index.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import { optionalString, sourceRef, uniqueByRef } from './runtime-tray-snapshot-utils.ts';

type DomainProjectionSource = {
  source_surface: string;
  pointer: string;
  projection: JsonRecord | null;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function projectionSurfaceKind(projection: JsonRecord) {
  const direct = optionalString(projection.surface_kind);
  if (direct) {
    return direct;
  }

  return Object.values(projection)
    .find(isRecord)
    ?.surface_kind as string | undefined ?? 'domain_projection';
}

function collectSourceRefs(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectSourceRefs);
  }
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    if (key === 'source_ref' || key === 'source_refs') {
      return collectSourceRefs(nestedValue);
    }
    return collectSourceRefs(nestedValue);
  });
}

function collectRefsByKey(value: unknown, keys: Set<string>): string[] {
  if (typeof value === 'string') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectRefsByKey(entry, keys));
  }
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    if (keys.has(key)) {
      if (typeof nestedValue === 'string') {
        return [nestedValue];
      }
      if (Array.isArray(nestedValue)) {
        return nestedValue.filter((entry): entry is string => (
          typeof entry === 'string' && entry.trim().length > 0
        ));
      }
    }
    return collectRefsByKey(nestedValue, keys);
  });
}

function collectRecordsByKey(value: unknown, key: string): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectRecordsByKey(entry, key));
  }
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([entryKey, nestedValue]) => {
    if (entryKey === key && Array.isArray(nestedValue)) {
      return nestedValue.filter(isRecord);
    }
    return collectRecordsByKey(nestedValue, key);
  });
}

function freshnessProjection(projection: JsonRecord) {
  if (isRecord(projection.freshness)) {
    return projection.freshness;
  }
  const freshnessStatus = optionalString(projection.freshness_status);
  const freshnessRef = optionalString(projection.freshness_ref);
  if (!freshnessStatus && !freshnessRef) {
    return null;
  }
  return {
    status: freshnessStatus,
    source_ref: freshnessRef,
  };
}

function domainProjectionSources(manifest: NormalizedDomainManifest): DomainProjectionSource[] {
  return [
    {
      source_surface: 'runtime_inventory',
      pointer: '/runtime_inventory/domain_projection',
      projection: manifest.runtime_inventory?.domain_projection ?? null,
    },
    {
      source_surface: 'task_lifecycle',
      pointer: '/task_lifecycle/domain_projection',
      projection: manifest.task_lifecycle?.domain_projection ?? null,
    },
    {
      source_surface: 'runtime_control',
      pointer: '/runtime_control/domain_projection',
      projection: manifest.runtime_control?.domain_projection ?? null,
    },
    {
      source_surface: 'session_continuity',
      pointer: '/session_continuity/domain_projection',
      projection: manifest.session_continuity?.domain_projection ?? null,
    },
    {
      source_surface: 'progress_projection',
      pointer: '/progress_projection/domain_projection',
      projection: manifest.progress_projection?.domain_projection ?? null,
    },
    {
      source_surface: 'artifact_inventory',
      pointer: '/artifact_inventory/domain_projection',
      projection: manifest.artifact_inventory?.domain_projection ?? null,
    },
    {
      source_surface: 'controlled_stage_attempt_projection',
      pointer: '/controlled_stage_attempt_projection',
      projection: isRecord(manifest.controlled_stage_attempt_projection)
        ? manifest.controlled_stage_attempt_projection
        : null,
    },
    ...(manifest.skill_catalog?.skills ?? []).map((skill, index) => ({
      source_surface: 'skill_catalog',
      pointer: `/skill_catalog/skills/${index}/domain_projection`,
      projection: skill.domain_projection,
    })),
    ...(manifest.automation?.automations ?? []).map((automation, index) => ({
      source_surface: 'automation',
      pointer: `/automation/automations/${index}/domain_projection`,
      projection: automation.domain_projection,
    })),
  ];
}

function countBy<T>(entries: T[], keyFor: (entry: T) => string) {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const key = keyFor(entry);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function buildItems(entries: DomainManifestCatalogEntry[]) {
  return entries.flatMap((entry) => {
    const manifest = entry.manifest;
    if (entry.status !== 'resolved' || !manifest) {
      return [];
    }

    const domainOwner =
      manifest.runtime_inventory?.domain_owner
      ?? manifest.runtime_control?.domain_owner
      ?? manifest.session_continuity?.domain_owner
      ?? entry.project;
    const runtimeOwner =
      manifest.runtime_inventory?.runtime_owner
      ?? manifest.runtime_control?.runtime_owner
      ?? manifest.session_continuity?.runtime_owner
      ?? 'unknown';

    return domainProjectionSources(manifest)
      .filter((source): source is DomainProjectionSource & { projection: JsonRecord } => isRecord(source.projection))
      .map((source) => ({
        domain_id: entry.project_id,
        project: entry.project,
        domain_owner: domainOwner,
        runtime_owner: runtimeOwner,
        source_surface: source.source_surface,
        pointer: source.pointer,
        projection_surface_kind: projectionSurfaceKind(source.projection),
        source_refs: uniqueStrings(collectSourceRefs(source.projection)),
        owner_receipt_refs: uniqueStrings(collectRefsByKey(source.projection, new Set([
          'owner_receipt_ref',
          'owner_receipt_refs',
          'domain_owner_receipt_ref',
          'domain_owner_receipt_refs',
        ]))),
        typed_blocker_refs: uniqueStrings(collectRefsByKey(source.projection, new Set([
          'typed_blocker_ref',
          'typed_blocker_refs',
        ]))),
        operator_route_lens_refs: uniqueStrings(collectRefsByKey(source.projection, new Set([
          'operator_route_lens_ref',
          'operator_route_lens_refs',
          'domain_route_lens_ref',
          'domain_route_lens_refs',
        ]))),
        typed_blockers: collectRecordsByKey(source.projection, 'typed_blockers'),
        freshness: freshnessProjection(source.projection),
        has_domain_projection_body: true,
        body_policy: 'domain_owned_body_not_read_by_opl',
      }));
  });
}

export function buildDomainProjectionIngestion(entries: DomainManifestCatalogEntry[]) {
  const items = buildItems(entries);
  const sourceRefs: RuntimeTraySourceRef[] = items.length > 0
    ? [
      sourceRef('/domain_manifests', 'domain_manifest_catalog'),
      sourceRef('/domain_projection_ingestion/items', 'domain_projection_ingestion'),
    ]
    : [];

  return {
    surface_kind: 'opl_domain_projection_ingestion_projection',
    projection_scope: 'runtime_snapshot',
    ingestion_policy: 'manifest_projection_refs_only_no_domain_truth_reduction',
    summary: {
      domain_count: new Set(items.map((item) => item.domain_id)).size,
      projection_ref_count: items.length,
      by_domain: countBy(items, (item) => item.domain_id),
      by_surface: countBy(items, (item) => item.source_surface),
    },
    items,
    source_refs: uniqueByRef(sourceRefs),
    authority_boundary: {
      opl: 'projection_locator_and_refs_only',
      domain: 'domain_truth_quality_artifact_export_owner',
      can_read_domain_truth_body: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      can_mutate_domain_artifact: false,
      provider_completion_is_domain_ready: false,
    },
    non_goals: [
      'does_not_reduce_quality_or_export_verdict',
      'does_not_execute_domain_projection_builder',
      'does_not_read_memory_or_artifact_body',
      'does_not_mutate_domain_state',
    ],
  };
}
