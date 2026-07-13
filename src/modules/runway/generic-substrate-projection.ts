import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { recordList, stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import { buildDomainManifestCatalog } from '../atlas/index.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from '../atlas/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  matchesStandardDomainAgentCatalogEntry,
  normalizeStandardDomainAgentId,
} from '../../kernel/standard-agent-registry.ts';
import {
  runFamilyRuntimeDomainHandlerCommand,
  domainHandlerResultErrorMessage,
} from './family-runtime-domain-handler-process.ts';
export {
  buildWorkspaceArtifactLocatorProjection,
  buildWorkspaceReceiptInventory,
} from './generic-substrate-locators.ts';
export type {
  BuildWorkspaceArtifactLocatorProjectionInput,
  BuildWorkspaceReceiptInventoryInput,
} from './generic-substrate-locators.ts';

function normalizeDomainSelection(value: string) {
  return normalizeStandardDomainAgentId(value);
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

export function domainHandlerExportEnvNames(entry: DomainManifestCatalogEntry) {
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

function readDomainHandlerSubstrateAdapter(entry: DomainManifestCatalogEntry) {
  for (const envName of domainHandlerExportEnvNames(entry)) {
    const command = commandFromEnv(envName);
    if (!command) {
      continue;
    }
    const result = runFamilyRuntimeDomainHandlerCommand(command, {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    }, 'export');
    if (result.exit_code !== 0) {
      return {
        status: 'blocked',
        env_name: envName,
        adapter: null,
        error: domainHandlerResultErrorMessage(result, 'Substrate domain-handler export'),
      };
    }
    try {
      const parsed = parseJsonText(result.stdout ?? '');
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

function domainHandlerRefEntries(adapter: JsonRecord | null, field: string) {
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
    lifecycle_role: 'domain_handler_declared_opaque_substrate_ref',
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
  if (statuses.some((status) => status === 'blocked_by_domain_handler_export')) {
    return 'blocked_by_domain_handler_export';
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

function refCount(projection: ReturnType<typeof buildGenericSubstrateProjection>) {
  return {
    workspace_ref_count: projection.workspace_refs.refs.length + (projection.workspace.workspace_locator ? 1 : 0),
    source_ref_count: projection.source_refs.refs.length,
    artifact_ref_count: projection.artifact_refs.refs.length,
    memory_ref_count: projection.memory_refs.refs.length,
  };
}

function workbenchStatusGroups(projections: Array<ReturnType<typeof buildGenericSubstrateProjection>>) {
  const groups: Record<string, string[]> = {};
  for (const projection of projections) {
    groups[projection.projection_status] = groups[projection.projection_status] ?? [];
    groups[projection.projection_status].push(projection.project_id);
  }
  return groups;
}

function domainHandlerStatusGroups(projections: Array<ReturnType<typeof buildGenericSubstrateProjection>>) {
  const groups: Record<string, string[]> = {};
  for (const projection of projections) {
    const status = projection.domain_handler_substrate_adapter.status;
    groups[status] = groups[status] ?? [];
    groups[status].push(projection.project_id);
  }
  return groups;
}

function refWorkbenchEntry(
  projection: ReturnType<typeof buildGenericSubstrateProjection>,
  family: 'workspace' | 'source' | 'artifact' | 'memory',
  ref: JsonRecord,
) {
  return {
    project_id: projection.project_id,
    project: projection.project,
    target_domain_id: projection.target_domain_id,
    ref_family: family,
    ref_id: optionalString(ref.ref_id) ?? optionalString(ref.role) ?? optionalString(ref.label),
    role: optionalString(ref.role),
    label: optionalString(ref.label),
    ref_kind: optionalString(ref.ref_kind)
      ?? (isRecord(ref.ref) ? optionalString(ref.ref.ref_kind) : null)
      ?? optionalString(ref.kind),
    ref: optionalString(ref.ref)
      ?? (isRecord(ref.ref) ? optionalString(ref.ref.ref) : null)
      ?? optionalString(ref.path),
    exists: typeof ref.exists === 'boolean' ? ref.exists : null,
    body_included: ref.body_included === true,
    write_permitted: ref.write_permitted === true,
    opaque_to_opl: ref.opaque_to_opl !== false,
    index_only: ref.index_only !== false,
    study_id: optionalString(ref.study_id),
    lifecycle_role: optionalString(ref.lifecycle_role),
    inspect_command: `opl substrate projection --domain ${projection.project_id}`,
  };
}

function workspaceWorkbenchRefs(projection: ReturnType<typeof buildGenericSubstrateProjection>) {
  const locatorRef = projection.workspace.workspace_locator
    ? [{
        ref_id: 'workspace_locator',
        role: 'workspace_locator',
        ref_kind: 'workspace_path',
        ref: projection.workspace.workspace_root,
        exists: null,
        body_included: false,
        write_permitted: false,
        opaque_to_opl: true,
        index_only: true,
        lifecycle_role: projection.workspace.lifecycle_role,
      }]
    : [];
  return [...locatorRef, ...projection.workspace_refs.refs]
    .map((ref) => refWorkbenchEntry(projection, 'workspace', ref));
}

function sourceWorkbenchRefs(projection: ReturnType<typeof buildGenericSubstrateProjection>) {
  return projection.source_refs.refs.map((ref) => refWorkbenchEntry(projection, 'source', ref));
}

function artifactWorkbenchRefs(projection: ReturnType<typeof buildGenericSubstrateProjection>) {
  return projection.artifact_refs.refs.map((ref) => refWorkbenchEntry(projection, 'artifact', ref));
}

function memoryWorkbenchRefs(projection: ReturnType<typeof buildGenericSubstrateProjection>) {
  return projection.memory_refs.refs.map((ref) => refWorkbenchEntry(projection, 'memory', ref));
}

function buildDomainWorkbench(projection: ReturnType<typeof buildGenericSubstrateProjection>) {
  const counts = refCount(projection);
  return {
    project_id: projection.project_id,
    project: projection.project,
    target_domain_id: projection.target_domain_id,
    manifest_status: projection.manifest_status,
    projection_status: projection.projection_status,
    domain_handler_substrate_adapter_status: projection.domain_handler_substrate_adapter.status,
    domain_handler_export_env_name: projection.domain_handler_substrate_adapter.env_name,
    ref_counts: counts,
    status_by_ref_family: {
      workspace: projection.workspace.status,
      source: projection.source_refs.status,
      artifact: projection.artifact_refs.status,
      memory: projection.memory_refs.status,
    },
    inspect_command: `opl substrate projection --domain ${projection.project_id}`,
    authority_boundary: projection.authority_boundary,
    non_authority_flags: projection.non_authority_flags,
  };
}

export function buildGenericSubstrateProjection(entry: DomainManifestCatalogEntry) {
  const manifest = entry.manifest;
  const domainHandlerSubstrate = readDomainHandlerSubstrateAdapter(entry);
  const domainHandlerAdapter = domainHandlerSubstrate.adapter;
  const workspace = workspaceProjection(entry);
  const workspaceRefs = domainHandlerRefEntries(domainHandlerAdapter, 'workspace_refs');
  const domainHandlerSourceRefs = domainHandlerRefEntries(domainHandlerAdapter, 'source_refs');
  const domainHandlerArtifactRefs = domainHandlerRefEntries(domainHandlerAdapter, 'artifact_refs');
  const domainHandlerMemoryRefs = domainHandlerRefEntries(domainHandlerAdapter, 'memory_refs');
  const sourceRefs = [
    ...sourceRefEntries(manifest),
    ...domainHandlerSourceRefs,
  ];
  const artifactRefs = [
    ...artifactRefEntries(manifest),
    ...domainHandlerArtifactRefs,
  ];
  const memoryRefs = [
    ...memoryRefEntries(manifest),
    ...domainHandlerMemoryRefs,
  ];
  const domainHandlerBlocked = domainHandlerSubstrate.status === 'blocked';
  const sourceStatus = domainHandlerBlocked ? 'blocked_by_domain_handler_export' : componentStatus(entry, sourceRefs.length > 0);
  const artifactStatus = domainHandlerBlocked ? 'blocked_by_domain_handler_export' : componentStatus(entry, artifactRefs.length > 0);
  const memoryStatus = domainHandlerBlocked ? 'blocked_by_domain_handler_export' : componentStatus(entry, memoryRefs.length > 0);
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
    domain_handler_substrate_adapter: {
      status: domainHandlerSubstrate.status,
      env_name: domainHandlerSubstrate.env_name,
      surface_kind: optionalString(domainHandlerAdapter?.surface_kind),
      mode: optionalString(domainHandlerAdapter?.mode),
      refs_indexed_count: workspaceRefs.length + domainHandlerSourceRefs.length
        + domainHandlerArtifactRefs.length + domainHandlerMemoryRefs.length,
      projection_policy: isRecord(domainHandlerAdapter?.projection_policy) ? domainHandlerAdapter.projection_policy : null,
      authority_boundary: isRecord(domainHandlerAdapter?.authority_boundary) ? domainHandlerAdapter.authority_boundary : null,
      error: domainHandlerSubstrate.error,
    },
    workspace_refs: {
      status: domainHandlerBlocked
        ? 'blocked_by_domain_handler_export'
        : (workspaceRefs.length > 0 ? 'resolved' : 'not_declared_by_domain_handler'),
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
      domain_handler_substrate_adapter_status: domainHandlerSubstrate.status,
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
      || matchesStandardDomainAgentCatalogEntry(domain, candidate)
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

export function buildGenericSubstrateWorkbench(contracts: FrameworkContracts) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const projections = catalog.projects.map(buildGenericSubstrateProjection);
  const refCounts = projections.map(refCount);
  const refFamilies = {
    workspace: projections.flatMap(workspaceWorkbenchRefs),
    source: projections.flatMap(sourceWorkbenchRefs),
    artifact: projections.flatMap(artifactWorkbenchRefs),
    memory: projections.flatMap(memoryWorkbenchRefs),
  };

  return {
    version: 'g2',
    generic_substrate_workbench: {
      surface_kind: 'opl_generic_substrate_workbench',
      workbench_version: 'opl-generic-substrate-workbench.v1',
      workbench_role: 'operator_and_app_drilldown_projection',
      summary: {
        total_projects_count: projections.length,
        resolved_manifest_count: projections.filter((projection) => projection.manifest_status === 'resolved').length,
        substrate_refs_resolved_count: projections.filter((projection) =>
          projection.projection_status === 'substrate_refs_resolved'
        ).length,
        substrate_refs_partial_count: projections.filter((projection) =>
          projection.projection_status === 'substrate_refs_partial'
        ).length,
        substrate_refs_missing_count: projections.filter((projection) =>
          projection.projection_status === 'substrate_refs_missing'
        ).length,
        blocked_count: projections.filter((projection) =>
          projection.projection_status === 'blocked_by_manifest_status'
          || projection.projection_status === 'blocked_by_domain_handler_export'
        ).length,
        domain_handler_adapter_resolved_count: projections.filter((projection) =>
          projection.domain_handler_substrate_adapter.status === 'resolved'
        ).length,
        domain_handler_adapter_blocked_count: projections.filter((projection) =>
          projection.domain_handler_substrate_adapter.status === 'blocked'
        ).length,
        workspace_ref_count: refCounts.reduce((sum, count) => sum + count.workspace_ref_count, 0),
        source_ref_count: refCounts.reduce((sum, count) => sum + count.source_ref_count, 0),
        artifact_ref_count: refCounts.reduce((sum, count) => sum + count.artifact_ref_count, 0),
        memory_ref_count: refCounts.reduce((sum, count) => sum + count.memory_ref_count, 0),
      },
      groups: {
        by_domain: Object.fromEntries(projections.map((projection) => [
          projection.project_id,
          buildDomainWorkbench(projection),
        ])),
        by_projection_status: workbenchStatusGroups(projections),
        by_domain_handler_status: domainHandlerStatusGroups(projections),
        by_ref_family: refFamilies,
      },
      authority_boundary: {
        opl_owns: [
          'locator_index',
          'ref_transport',
          'lifecycle_projection',
          'operator_projection',
          'workbench_grouping',
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
          'publication_fundability_visual_verdict',
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
      notes: [
        'This workbench groups existing substrate projections for App/operator drilldown.',
        'Refs remain opaque/index-only; follow inspect_command back to the domain-owned projection before reading any domain truth.',
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
