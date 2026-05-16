import { spawnSync } from 'node:child_process';

import { FrameworkContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from './domain-manifest/types.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => isRecord(entry))
    : [];
}

function normalizeDomainSelection(value: string) {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-autogrant': 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
  };
  return aliases[key] ?? key;
}

function parseProjectionArgs(args: string[]) {
  let domain = '';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--domain' && value) {
      domain = value;
      index += 1;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown substrate projection option: ${token}.`, {
      usage: 'opl substrate projection --domain <domain>',
    });
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'substrate projection requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain };
}

function componentStatus(entry: DomainManifestCatalogEntry, ready: boolean) {
  if (entry.status !== 'resolved') {
    return 'blocked_by_manifest_status';
  }
  return ready ? 'resolved' : 'missing';
}

function sourceRefEntries(manifest: NormalizedDomainManifest | null) {
  const source = manifest?.source_provenance;
  if (!source) {
    return [];
  }

  return [
    ['source_provenance_ref', source.source_provenance_ref],
    ['historical_fixture_ref', source.historical_fixture_ref],
    ['explicit_archive_import_ref', source.explicit_archive_import_ref],
    ['parity_oracle_ref', source.parity_oracle_ref],
  ]
    .filter(([, ref]) => ref !== null)
    .map(([refId, ref]) => ({
      ref_id: refId,
      ref,
      lifecycle_role: refId === 'explicit_archive_import_ref'
        ? 'explicit_one_way_provenance'
        : 'domain_declared_source_ref',
    }));
}

function artifactRefEntries(manifest: NormalizedDomainManifest | null) {
  const inventory = manifest?.artifact_inventory;
  if (!inventory) {
    return [];
  }

  return [...inventory.deliverable_files, ...inventory.supporting_files].map((file) => ({
    ref_id: file.file_id,
    label: file.label,
    kind: file.kind,
    path: file.path,
    ref: file.ref,
    lifecycle_role: 'domain_declared_artifact_locator',
  }));
}

function memoryRefEntries(manifest: NormalizedDomainManifest | null) {
  const descriptor = manifest?.domain_memory_descriptor;
  if (!descriptor) {
    return [];
  }

  return [
    {
      ref_id: descriptor.memory_ref_id,
      memory_family: descriptor.memory_family,
      owner: descriptor.owner,
      memory_pack_ref: descriptor.memory_pack_ref,
      writeback_contract_ref: descriptor.writeback_contract_ref,
      receipt_contract_ref: descriptor.receipt_contract_ref,
      writeback_receipt_locator_ref: descriptor.writeback_receipt_locator_ref,
      lifecycle_role: 'domain_declared_memory_locator',
    },
  ];
}

function commandFromEnv(name: string) {
  const override = process.env[name]?.trim();
  return override ? override.split(/\s+/) : null;
}

function sidecarExportEnvName(entry: DomainManifestCatalogEntry) {
  const manifestDomain = optionalString(entry.manifest?.target_domain_id);
  const candidates = [
    manifestDomain,
    entry.project_id,
    entry.project,
  ].filter((value): value is string => Boolean(value));
  const normalizedCandidates = candidates.flatMap((value) => {
    const normalized = normalizeDomainSelection(value);
    return [
      value,
      normalized,
      normalized.replace(/-/g, ''),
      normalized.replace(/_/g, ''),
    ];
  });
  const unique = [...new Set(normalizedCandidates)]
    .map((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);
  return unique.map((value) => `OPL_FAMILY_RUNTIME_${value}_EXPORT`);
}

function findSubstrateAdapter(payload: unknown): JsonRecord | null {
  if (!isRecord(payload)) {
    return null;
  }
  if (isRecord(payload.opl_substrate_adapter)) {
    return payload.opl_substrate_adapter;
  }
  const manifest = payload.product_entry_manifest;
  if (isRecord(manifest) && isRecord(manifest.opl_substrate_adapter)) {
    return manifest.opl_substrate_adapter;
  }
  return null;
}

function readSidecarSubstrateAdapter(entry: DomainManifestCatalogEntry) {
  for (const envName of sidecarExportEnvName(entry)) {
    const command = commandFromEnv(envName);
    if (!command) {
      continue;
    }
    const result = spawnSync(command[0], command.slice(1), {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error || (result.status ?? 1) !== 0) {
      return {
        status: 'blocked',
        env_name: envName,
        adapter: null,
        error: result.error?.message ?? result.stderr?.trim() ?? `exit_${result.status ?? 'unknown'}`,
      };
    }
    try {
      const parsed = JSON.parse(result.stdout ?? '') as unknown;
      const adapter = findSubstrateAdapter(parsed);
      return {
        status: adapter ? 'resolved' : 'missing',
        env_name: envName,
        adapter,
        error: adapter ? null : 'opl_substrate_adapter_missing',
      };
    } catch (error) {
      return {
        status: 'blocked',
        env_name: envName,
        adapter: null,
        error: error instanceof Error ? error.message : 'invalid_json',
      };
    }
  }

  return {
    status: 'not_configured',
    env_name: null,
    adapter: null,
    error: null,
  };
}

function sidecarRefEntries(adapter: JsonRecord | null, field: string) {
  return recordList(adapter?.[field]).map((entry) => ({
    ref_id: optionalString(entry.role) ?? optionalString(entry.ref) ?? 'substrate_ref',
    role: optionalString(entry.role),
    ref_kind: optionalString(entry.ref_kind) ?? 'opaque_ref',
    ref: optionalString(entry.ref),
    exists: typeof entry.exists === 'boolean' ? entry.exists : null,
    body_included: entry.body_included === true,
    write_permitted: entry.write_permitted === true,
    opaque_to_opl: entry.opaque_to_opl !== false,
    index_only: entry.index_only !== false,
    study_id: optionalString(entry.study_id),
    lifecycle_role: 'sidecar_declared_opaque_substrate_ref',
  }));
}

function workspaceProjection(entry: DomainManifestCatalogEntry) {
  const workspaceLocator = entry.manifest?.workspace_locator ?? null;
  return {
    status: componentStatus(entry, Boolean(workspaceLocator)),
    project_id: entry.project_id,
    binding_id: entry.binding_id,
    binding_workspace_path: entry.workspace_path,
    target_domain_id: entry.manifest?.target_domain_id ?? null,
    workspace_root:
      optionalString(workspaceLocator?.workspace_root)
      ?? optionalString(workspaceLocator?.root)
      ?? entry.workspace_path,
    workspace_locator: workspaceLocator,
    lifecycle_role: 'framework_indexes_domain_declared_workspace_locator',
  };
}

function lifecycleStatus(statuses: string[]) {
  if (statuses.some((status) => status === 'blocked_by_sidecar_export')) {
    return 'blocked_by_sidecar_export';
  }
  if (statuses.some((status) => status === 'blocked_by_manifest_status')) {
    return 'blocked_by_manifest_status';
  }
  if (statuses.every((status) => status === 'resolved')) {
    return 'substrate_refs_resolved';
  }
  if (statuses.some((status) => status === 'resolved')) {
    return 'substrate_refs_partial';
  }
  return 'substrate_refs_missing';
}

export function buildGenericSubstrateProjection(entry: DomainManifestCatalogEntry) {
  const manifest = entry.manifest;
  const sidecarSubstrate = readSidecarSubstrateAdapter(entry);
  const sidecarAdapter = sidecarSubstrate.adapter;
  const workspace = workspaceProjection(entry);
  const workspaceRefs = sidecarRefEntries(sidecarAdapter, 'workspace_refs');
  const sidecarSourceRefs = sidecarRefEntries(sidecarAdapter, 'source_refs');
  const sidecarArtifactRefs = sidecarRefEntries(sidecarAdapter, 'artifact_refs');
  const sidecarMemoryRefs = sidecarRefEntries(sidecarAdapter, 'memory_refs');
  const sourceRefs = [
    ...sourceRefEntries(manifest),
    ...sidecarSourceRefs,
  ];
  const artifactRefs = [
    ...artifactRefEntries(manifest),
    ...sidecarArtifactRefs,
  ];
  const memoryRefs = [
    ...memoryRefEntries(manifest),
    ...sidecarMemoryRefs,
  ];
  const sidecarBlocked = sidecarSubstrate.status === 'blocked';
  const sourceStatus = sidecarBlocked ? 'blocked_by_sidecar_export' : componentStatus(entry, sourceRefs.length > 0);
  const artifactStatus = sidecarBlocked ? 'blocked_by_sidecar_export' : componentStatus(entry, artifactRefs.length > 0);
  const memoryStatus = sidecarBlocked ? 'blocked_by_sidecar_export' : componentStatus(entry, memoryRefs.length > 0);
  const status = lifecycleStatus([
    workspace.status,
    sourceStatus,
    artifactStatus,
    memoryStatus,
  ]);

  return {
    surface_kind: 'opl_generic_substrate_projection',
    projection_version: 'opl-generic-substrate-projection.v1',
    projection_status: status,
    project_id: entry.project_id,
    project: entry.project,
    manifest_status: entry.status,
    target_domain_id: manifest?.target_domain_id ?? null,
    workspace,
    sidecar_substrate_adapter: {
      status: sidecarSubstrate.status,
      env_name: sidecarSubstrate.env_name,
      surface_kind: optionalString(sidecarAdapter?.surface_kind),
      mode: optionalString(sidecarAdapter?.mode),
      refs_indexed_count: workspaceRefs.length + sidecarSourceRefs.length
        + sidecarArtifactRefs.length + sidecarMemoryRefs.length,
      projection_policy: isRecord(sidecarAdapter?.projection_policy) ? sidecarAdapter.projection_policy : null,
      authority_boundary: isRecord(sidecarAdapter?.authority_boundary) ? sidecarAdapter.authority_boundary : null,
      error: sidecarSubstrate.error,
    },
    workspace_refs: {
      status: sidecarBlocked
        ? 'blocked_by_sidecar_export'
        : (workspaceRefs.length > 0 ? 'resolved' : 'not_declared_by_sidecar'),
      refs: workspaceRefs,
    },
    source_refs: {
      status: sourceStatus,
      refs: sourceRefs,
      source_provenance: manifest?.source_provenance ?? null,
    },
    artifact_refs: {
      status: artifactStatus,
      summary: manifest?.artifact_inventory?.summary ?? null,
      refs: artifactRefs,
      artifact_surface: manifest?.artifact_inventory?.artifact_surface ?? null,
      inspect_paths: manifest?.artifact_inventory?.inspect_paths ?? [],
    },
    memory_refs: {
      status: memoryStatus,
      refs: memoryRefs,
      descriptor: manifest?.domain_memory_descriptor ?? null,
    },
    lifecycle_projection: {
      owner: 'one-person-lab',
      lifecycle_role: 'locator_index_lifecycle_projection_only',
      indexed_ref_count: workspaceRefs.length + sourceRefs.length + artifactRefs.length
        + memoryRefs.length + (workspace.workspace_locator ? 1 : 0),
      workspace_locator_status: workspace.status,
      source_ref_status: sourceStatus,
      artifact_ref_status: artifactStatus,
      memory_ref_status: memoryStatus,
      domain_truth_mutation: 'forbidden',
      artifact_mutation: 'forbidden',
      memory_body_observed: false,
      sidecar_substrate_adapter_status: sidecarSubstrate.status,
    },
    authority_boundary: {
      opl_owns: [
        'locator_index',
        'ref_transport',
        'lifecycle_projection',
        'operator_projection',
      ],
      domain_agent_owns: [
        'workspace_truth',
        'source_truth_body',
        'artifact_body',
        'artifact_authority',
        'memory_body',
        'memory_writeback_accept_reject',
        'domain_truth',
        'quality_verdict',
      ],
    },
    non_authority_flags: {
      opl_reads_memory_body: false,
      opl_writes_memory_body: false,
      opl_applies_memory_writeback: false,
      opl_writes_domain_truth: false,
      opl_interprets_source_truth: false,
      opl_mutates_artifact_body: false,
      opl_owns_artifact_authority: false,
      opl_authorizes_quality_verdict: false,
      opl_authorizes_publication_or_fundability_verdict: false,
    },
    error: entry.error,
  };
}

function findProjectionEntry(contracts: FrameworkContracts, domain: string) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const normalized = normalizeDomainSelection(domain);
  const entry = catalog.projects.find((candidate) => {
    const manifest = candidate.manifest;
    const agentSpec = manifest?.domain_entry_contract?.domain_agent_entry_spec;
    return candidate.project_id === normalized
      || candidate.project === normalized
      || manifest?.target_domain_id === domain
      || manifest?.target_domain_id === normalized
      || agentSpec?.agent_id === domain
      || agentSpec?.agent_id === normalized
      || (isRecord(manifest?.domain_memory_descriptor) && manifest.domain_memory_descriptor.target_domain_id === domain)
      || (isRecord(manifest?.domain_memory_descriptor) && manifest.domain_memory_descriptor.target_domain_id === normalized);
  });
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown substrate projection domain: ${domain}.`, {
      domain,
      allowed_domains: catalog.projects.map((project) => project.project_id),
    });
  }
  return entry;
}

export function buildGenericSubstrateProjectionList(contracts: FrameworkContracts) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const projections = catalog.projects.map(buildGenericSubstrateProjection);
  return {
    version: 'g2',
    generic_substrate_projections: {
      surface_kind: 'opl_generic_substrate_projection_index',
      summary: {
        total_projects_count: projections.length,
        resolved_manifest_count: projections.filter((projection) => projection.manifest_status === 'resolved').length,
        substrate_refs_resolved_count: projections.filter((projection) =>
          projection.projection_status === 'substrate_refs_resolved'
        ).length,
        substrate_refs_partial_count: projections.filter((projection) =>
          projection.projection_status === 'substrate_refs_partial'
        ).length,
        blocked_count: projections.filter((projection) =>
          projection.projection_status === 'blocked_by_manifest_status'
        ).length,
      },
      projections,
      notes: [
        'This is an OPL-owned index/projection over domain-declared workspace, source, artifact, and memory refs.',
        'OPL carries locators and lifecycle status only; domain agents retain truth/body/verdict/authority.',
      ],
    },
  };
}

export function buildGenericSubstrateProjectionInspect(contracts: FrameworkContracts, args: string[]) {
  const { domain } = parseProjectionArgs(args);
  const entry = findProjectionEntry(contracts, domain);
  const projection = buildGenericSubstrateProjection(entry);
  return {
    version: 'g2',
    generic_substrate_projection: {
      ...projection,
      surface_kind: 'opl_generic_substrate_projection_inspection',
      projection_surface_kind: projection.surface_kind,
      inspection_notes: [
        'Use this surface for framework-owned locator/index/lifecycle projection.',
        'Follow refs back to the domain repo for source truth, artifact body, memory body, and owner verdicts.',
      ],
    },
  };
}
