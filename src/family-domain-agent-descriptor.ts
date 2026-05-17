import { FrameworkContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from './domain-manifest/types.ts';
import { buildFamilyActionCatalogParity } from './family-action-catalog.ts';
import { buildStandardDomainAgentSkeletonInspection } from './family-domain-agent-skeleton.ts';
import { pickSkillActivationProjection } from './family-domain-catalog.ts';
import { buildFamilyStageControlPlaneParity } from './family-stage-control-plane.ts';
import {
  adaptGrantTransitionOracleToFamilyTransitionSpec,
  buildGrantTransitionOracleMatrixCases,
} from './family-transition-oracle-ingestion.ts';
import {
  runFamilyTransitionMatrix,
} from './family-transition-runner.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function parseDescriptorArgs(args: string[]) {
  let domain = '';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--domain' && value) {
      domain = value;
      index += 1;
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown agents descriptor option: ${token}.`, {
      usage: 'opl agents descriptor --domain <domain>',
    });
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'agents descriptor requires --domain.', {
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

function buildDescriptorRefs(manifest: NormalizedDomainManifest | null) {
  return {
    manifest: {
      ref_kind: 'normalized_domain_manifest',
      ref: '/',
      status: manifest ? 'resolved' : 'missing',
    },
    domain_agent_entry_spec: {
      ref_kind: 'json_pointer',
      ref: '/domain_entry_contract/domain_agent_entry_spec',
      status: manifest?.domain_entry_contract?.domain_agent_entry_spec ? 'resolved' : 'missing',
    },
    standard_domain_agent_skeleton: {
      ref_kind: 'json_pointer',
      ref: '/standard_domain_agent_skeleton',
      status: manifest?.standard_domain_agent_skeleton ? 'resolved' : 'missing',
    },
    family_action_catalog: {
      ref_kind: 'json_pointer',
      ref: '/family_action_catalog',
      status: manifest?.family_action_catalog ? 'resolved' : 'missing',
    },
    family_stage_control_plane: {
      ref_kind: 'json_pointer',
      ref: '/family_stage_control_plane',
      status: manifest?.family_stage_control_plane ? 'resolved' : 'missing',
    },
    family_transition: {
      ref_kind: 'json_pointer',
      ref: '/family_transition',
      status:
        manifest?.family_transition.status === 'matrix_evaluated'
          ? 'resolved'
          : manifest?.family_transition.status === 'descriptor_only'
            ? 'descriptor_only'
            : manifest?.family_transition.status === 'blocked'
              ? 'blocked'
              : 'missing',
    },
    family_transition_spec: {
      ref_kind: 'json_pointer',
      ref: '/family_transition_spec',
      status: manifest?.family_transition_spec ? 'resolved' : 'missing',
    },
    family_transition_matrix_cases: {
      ref_kind: 'json_pointer',
      ref: '/family_transition_matrix_cases',
      status:
        manifest?.family_transition_matrix_cases && manifest.family_transition_matrix_cases.length > 0
          ? 'resolved'
          : 'missing',
    },
    grant_transition_oracle: {
      ref_kind: 'json_pointer',
      ref: '/grant_transition_oracle',
      status: manifest?.grant_transition_oracle ? 'resolved' : 'missing',
    },
    visual_transition_spec: {
      ref_kind: 'json_pointer',
      ref: '/visual_transition_spec',
      status: manifest?.visual_transition_spec ? 'resolved' : 'missing',
    },
    domain_memory_descriptor: {
      ref_kind: 'json_pointer',
      ref: '/domain_memory_descriptor',
      status: manifest?.domain_memory_descriptor ? 'resolved' : 'missing',
    },
    skill_catalog: {
      ref_kind: 'json_pointer',
      ref: '/skill_catalog',
      status: manifest?.skill_catalog ? 'resolved' : 'missing',
    },
    runtime_inventory: {
      ref_kind: 'json_pointer',
      ref: '/runtime_inventory',
      status: manifest?.runtime_inventory ? 'resolved' : 'missing',
    },
    session_continuity: {
      ref_kind: 'json_pointer',
      ref: '/session_continuity',
      status: manifest?.session_continuity ? 'resolved' : 'missing',
    },
    progress_projection: {
      ref_kind: 'json_pointer',
      ref: '/progress_projection',
      status: manifest?.progress_projection ? 'resolved' : 'missing',
    },
    artifact_inventory: {
      ref_kind: 'json_pointer',
      ref: '/artifact_inventory',
      status: manifest?.artifact_inventory ? 'resolved' : 'missing',
    },
  };
}

function buildEntryProjection(entry: DomainManifestCatalogEntry) {
  const manifest = entry.manifest;
  const spec = manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null;
  return {
    status: componentStatus(entry, Boolean(spec)),
    agent_id: spec?.agent_id ?? null,
    title: spec?.title ?? null,
    description: spec?.description ?? null,
    default_engine: spec?.default_engine ?? null,
    workspace_requirement: spec?.workspace_requirement ?? null,
    entry_command: spec?.entry_command ?? null,
    manifest_command: spec?.manifest_command ?? null,
    product_entry_surface: manifest?.product_entry_surface ?? null,
    recommended_command: manifest?.recommended_command ?? null,
    manifest_command_locator: entry.manifest_command,
    workspace_path: entry.workspace_path,
    binding_id: entry.binding_id,
  };
}

function buildSkeletonProjection(entry: DomainManifestCatalogEntry) {
  const inspection = buildStandardDomainAgentSkeletonInspection(entry);
  return {
    status: inspection.skeleton_status,
    agent_id: inspection.agent_id,
    skeleton_source_field: inspection.skeleton_source_field,
    descriptor_readiness: inspection.descriptor_readiness,
    physical_skeleton_layout_audit: inspection.physical_skeleton_layout_audit,
    physical_skeleton_evidence: inspection.physical_skeleton_evidence,
    physical_skeleton_follow_through_gate: inspection.physical_skeleton_follow_through_gate,
    production_closure_gap_count: inspection.production_closure_gaps.length,
    production_closure_gaps: inspection.production_closure_gaps,
    provider_closure_evidence: inspection.provider_closure_evidence,
    declared_repo_source_dirs: inspection.declared_repo_source_dirs,
    missing_repo_source_dirs: inspection.missing_repo_source_dirs,
    artifact_boundary: inspection.artifact_boundary,
    contract_refs: inspection.contract_refs,
    issues: inspection.issues,
  };
}

function buildActionCatalogProjection(entry: DomainManifestCatalogEntry) {
  const catalog = entry.manifest?.family_action_catalog ?? null;
  const supportedSurfaceKinds = catalog
    ? [...new Set(catalog.actions.flatMap((action) =>
        Object.entries(action.supported_surfaces)
          .filter(([, descriptor]) => descriptor !== null)
          .map(([surface]) => surface)
      ))]
    : [];
  return {
    status: componentStatus(entry, Boolean(catalog)),
    catalog_id: catalog?.catalog_id ?? null,
    target_domain_id: catalog?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
    owner: catalog?.owner ?? null,
    action_count: catalog?.actions.length ?? 0,
    read_only_action_count: catalog?.actions.filter((action) => action.effect === 'read_only').length ?? 0,
    mutating_action_count: catalog?.actions.filter((action) => action.effect === 'mutating').length ?? 0,
    action_ids: catalog?.actions.map((action) => action.action_id) ?? [],
    supported_surface_kinds: supportedSurfaceKinds,
    parity: catalog ? buildFamilyActionCatalogParity(catalog, entry.manifest) : null,
    authority_boundary: catalog?.authority_boundary ?? null,
  };
}

function buildStageControlPlaneProjection(entry: DomainManifestCatalogEntry) {
  const plane = entry.manifest?.family_stage_control_plane ?? null;
  return {
    status: componentStatus(entry, Boolean(plane)),
    plane_id: plane?.plane_id ?? null,
    target_domain_id: plane?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
    owner: plane?.owner ?? null,
    stage_count: plane?.stages.length ?? 0,
    stage_ids: plane?.stages.map((stage) => stage.stage_id) ?? [],
    stage_kinds: plane ? [...new Set(plane.stages.map((stage) => stage.stage_kind))] : [],
    domain_stage_refs: plane
      ? [...new Set(plane.stages.flatMap((stage) => stage.domain_stage_refs))]
      : [],
    knowledge_ref_count: plane?.stages.reduce((total, stage) => total + stage.knowledge_refs.length, 0) ?? 0,
    action_ref_count: plane?.stages.reduce((total, stage) => total + stage.allowed_action_refs.length, 0) ?? 0,
    parity: plane ? buildFamilyStageControlPlaneParity(plane, entry.manifest) : null,
    authority_boundary: plane?.authority_boundary ?? null,
  };
}

function buildFamilyTransitionProjection(entry: DomainManifestCatalogEntry) {
  const transition = entry.manifest?.family_transition ?? null;
  return {
    status:
      entry.status !== 'resolved'
        ? 'blocked_by_manifest_status'
        : transition?.status ?? 'missing',
    spec_id: transition?.spec_id ?? null,
    target_domain_id: transition?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
    owner: transition?.owner ?? null,
    transition_count: transition?.transition_count ?? 0,
    case_count: transition?.case_count ?? 0,
    refresh_required: transition?.refresh_required ?? false,
    blocked_reason: transition?.blocked_reason ?? null,
    descriptor: transition?.descriptor ?? null,
    locator_refs: transition?.locator_refs ?? {},
    matrix_summary: transition?.matrix_result?.summary ?? null,
    authority_boundary: transition?.authority_boundary ?? null,
    non_authority_flags: transition?.non_authority_flags ?? {
      opl_interprets_domain_quality: false,
      opl_executes_domain_action: false,
      opl_writes_domain_truth: false,
      opl_authorizes_publication_or_fundability_verdict: false,
    },
  };
}

function buildGrantTransitionOracleProjection(entry: DomainManifestCatalogEntry) {
  const oracle = entry.manifest?.grant_transition_oracle ?? null;
  if (!oracle) {
    return {
      status: componentStatus(entry, false),
      oracle_id: null,
      target_domain_id: entry.manifest?.target_domain_id ?? null,
      owner: null,
      state: null,
      runner_owner: null,
      runner_contract_ref: null,
      transition_count: 0,
      oracle_fixture_count: 0,
      validation: null,
      ingestion: null,
      authority_boundary: null,
    };
  }
  const spec = adaptGrantTransitionOracleToFamilyTransitionSpec(oracle);
  const cases = buildGrantTransitionOracleMatrixCases(oracle);
  const matrix = runFamilyTransitionMatrix({ spec, cases });
  return {
    status: componentStatus(entry, true),
    oracle_id: oracle.oracle_id,
    target_domain_id: oracle.target_domain_id,
    owner: oracle.owner,
    state: oracle.state ?? null,
    runner_owner: oracle.runner_owner ?? null,
    runner_contract_ref: oracle.runner_contract_ref ?? null,
    transition_count: oracle.transition_table.length,
    oracle_fixture_count: oracle.oracle_fixtures.length,
    transition_ids: oracle.transition_table.map((transition) => transition.transition_id),
    guard_ids: [...new Set(oracle.transition_table.map((transition) => transition.guard_id))],
    validation: oracle.validation ?? null,
    ingestion: {
      spec_id: spec.spec_id,
      runner_event: 'domain_tick',
      matrix,
      status:
        matrix.summary.total === cases.length
        && matrix.summary.transition_applied === cases.length
          ? 'matrix_oracle_passed'
          : 'matrix_oracle_not_fully_applied',
    },
    authority_boundary: oracle.authority_boundary,
  };
}

function buildDomainMemoryProjection(entry: DomainManifestCatalogEntry) {
  const descriptor = entry.manifest?.domain_memory_descriptor ?? null;
  const authority = descriptor?.authority_boundary ?? null;
  return {
    status: componentStatus(entry, Boolean(descriptor)),
    memory_ref_id: descriptor?.memory_ref_id ?? null,
    memory_family: descriptor?.memory_family ?? null,
    owner: descriptor?.owner ?? null,
    memory_pack_ref: descriptor?.memory_pack_ref ?? null,
    stage_applicability: descriptor?.stage_applicability ?? [],
    retrieval_contract_ref: descriptor?.retrieval_contract_ref ?? null,
    writeback_contract_ref: descriptor?.writeback_contract_ref ?? null,
    receipt_contract_ref: descriptor?.receipt_contract_ref ?? null,
    writeback_receipt_locator_ref: descriptor?.writeback_receipt_locator_ref ?? null,
    migration_readiness: descriptor?.migration_readiness ?? null,
    freshness: descriptor?.freshness ?? null,
    receipt_projection: descriptor?.receipt_projection ?? null,
    authority_boundary: authority,
    non_authority_flags: {
      opl_owns_memory_content: false,
      opl_accepts_or_rejects_memory_writeback: false,
      opl_applies_memory_writeback: false,
      opl_writes_domain_truth: false,
      opl_authorizes_quality_verdict: false,
      opl_writes_artifacts: false,
    },
  };
}

function buildSkillProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const catalog = manifest?.skill_catalog ?? null;
  const activation = manifest ? pickSkillActivationProjection(manifest) : null;
  const runtimeContinuity = activation?.runtime_continuity ?? null;
  return {
    status: componentStatus(entry, Boolean(catalog)),
    skill_count: catalog?.skills.length ?? 0,
    skill_ids: catalog?.skills.map((skill) => skill.skill_id) ?? [],
    supported_commands: catalog?.supported_commands ?? [],
    command_contract_count: catalog?.command_contracts.length ?? 0,
    activation,
    runtime_continuity_status: runtimeContinuity ? 'resolved' : catalog ? 'missing' : 'blocked',
  };
}

function buildRuntimeInventoryProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const runtimeInventory = manifest?.runtime_inventory;
  return {
    status: componentStatus(entry, Boolean(runtimeInventory)),
    runtime_owner: runtimeInventory?.runtime_owner ?? null,
    domain_owner: runtimeInventory?.domain_owner ?? null,
    executor_owner: runtimeInventory?.executor_owner ?? null,
    substrate: runtimeInventory?.substrate ?? null,
    availability: runtimeInventory?.availability ?? null,
    health_status: runtimeInventory?.health_status ?? null,
    status_surface: runtimeInventory?.status_surface ?? null,
    recovery_surface: runtimeInventory?.recovery_surface ?? null,
  };
}

function buildTaskLifecycleProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const taskLifecycle = manifest?.task_lifecycle;
  return {
    status: componentStatus(entry, Boolean(taskLifecycle)),
    task_kind: taskLifecycle?.task_kind ?? null,
    task_id: taskLifecycle?.task_id ?? null,
    lifecycle_status: taskLifecycle?.status ?? null,
    progress_surface: taskLifecycle?.progress_surface ?? null,
    resume_surface: taskLifecycle?.resume_surface ?? null,
  };
}

function buildRuntimeControlProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const runtimeControl = manifest?.runtime_control;
  return {
    status: componentStatus(entry, Boolean(runtimeControl)),
    domain_agent_id: runtimeControl?.domain_agent_id ?? null,
    runtime_owner: runtimeControl?.runtime_owner ?? null,
    domain_owner: runtimeControl?.domain_owner ?? null,
    executor_owner: runtimeControl?.executor_owner ?? null,
    control_status: runtimeControl?.status ?? null,
    control_gate_ids: runtimeControl?.control_gate_ids ?? [],
  };
}

function buildSessionContinuityProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const sessionContinuity = manifest?.session_continuity;
  return {
    status: componentStatus(entry, Boolean(sessionContinuity)),
    domain_agent_id: sessionContinuity?.domain_agent_id ?? null,
    runtime_owner: sessionContinuity?.runtime_owner ?? null,
    domain_owner: sessionContinuity?.domain_owner ?? null,
    executor_owner: sessionContinuity?.executor_owner ?? null,
    continuity_status: sessionContinuity?.status ?? null,
    entry_surface: sessionContinuity?.entry_surface ?? null,
    progress_surface: sessionContinuity?.progress_surface ?? null,
    artifact_surface: sessionContinuity?.artifact_surface ?? null,
    restore_surface: sessionContinuity?.restore_surface ?? null,
  };
}

function buildProgressProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const progressProjection = manifest?.progress_projection;
  return {
    status: componentStatus(entry, Boolean(progressProjection)),
    headline: progressProjection?.headline ?? null,
    latest_update: progressProjection?.latest_update ?? null,
    next_step: progressProjection?.next_step ?? null,
    current_status: progressProjection?.current_status ?? null,
    runtime_status: progressProjection?.runtime_status ?? null,
    human_gate_ids: progressProjection?.human_gate_ids ?? [],
  };
}

function buildArtifactInventoryProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const artifactInventory = manifest?.artifact_inventory;
  return {
    status: componentStatus(entry, Boolean(artifactInventory)),
    workspace_path: artifactInventory?.workspace_path ?? null,
    summary: artifactInventory?.summary ?? null,
    artifact_surface: artifactInventory?.artifact_surface ?? null,
    inspect_paths: artifactInventory?.inspect_paths ?? [],
  };
}

function buildFunctionalPrivatizationProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const audit = manifest?.functional_privatization_audit ?? null;
  return {
    status: componentStatus(entry, audit?.status === 'resolved'),
    source_field: audit?.source_field ?? null,
    target_domain_id: audit?.target_domain_id ?? manifest?.target_domain_id ?? null,
    summary: audit?.summary ?? {
      total_module_count: 0,
      opl_owned_replacement_count: 0,
      opl_hosted_surface_count: 0,
      opl_generated_surface_count: 0,
      declarative_pack_count: 0,
      minimal_authority_function_count: 0,
      refs_only_domain_adapter_count: 0,
      temporary_migration_bridge_count: 0,
      diagnostic_cleanup_path_count: 0,
      provenance_or_fixture_count: 0,
      domain_authority_count: 0,
      retire_tombstone_count: 0,
      active_private_generic_residue_count: 0,
      blocker_count: 0,
      default_watchlist_count: 0,
      default_hidden_cleared_count: 0,
      default_watchlist_module_ids: [],
    },
    required_opl_replacement_primitives: audit?.required_opl_replacement_primitives ?? [],
    blockers: audit?.blockers ?? ['functional_privatization_audit_missing'],
    modules: audit?.modules ?? [],
    authority_boundary: audit?.authority_boundary ?? {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generic_runtime_owner: false,
    },
  };
}

function buildAutomationProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  const automation = manifest?.automation;
  return {
    status: componentStatus(entry, Boolean(automation)),
    automation_count: automation?.automations.length ?? 0,
    readiness_summary: automation?.readiness_summary ?? null,
  };
}

function buildRuntimeProjection(manifest: NormalizedDomainManifest | null, entry: DomainManifestCatalogEntry) {
  return {
    runtime_inventory: buildRuntimeInventoryProjection(manifest, entry),
    task_lifecycle: buildTaskLifecycleProjection(manifest, entry),
    runtime_control: buildRuntimeControlProjection(manifest, entry),
    session_continuity: buildSessionContinuityProjection(manifest, entry),
    progress_projection: buildProgressProjection(manifest, entry),
    artifact_inventory: buildArtifactInventoryProjection(manifest, entry),
    automation: buildAutomationProjection(manifest, entry),
  };
}

function buildReadinessSummary(parts: Array<{ status: unknown }>) {
  const statuses = parts.map((part) => optionalString(part.status));
  if (statuses.some((status) => status === 'blocked_by_manifest_status')) {
    return 'blocked_by_manifest_status';
  }
  if (statuses.every((status) => status === 'resolved' || status === 'aligned')) {
    return 'descriptor_surfaces_resolved';
  }
  if (statuses.some((status) => status === 'resolved' || status === 'aligned')) {
    return 'descriptor_surfaces_partial';
  }
  return 'descriptor_surfaces_missing';
}

function buildDescriptor(entry: DomainManifestCatalogEntry) {
  const manifest = entry.manifest;
  const entryProjection = buildEntryProjection(entry);
  const skeleton = buildSkeletonProjection(entry);
  const actionCatalog = buildActionCatalogProjection(entry);
  const stageControlPlane = buildStageControlPlaneProjection(entry);
  const familyTransition = buildFamilyTransitionProjection(entry);
  const grantTransitionOracle = buildGrantTransitionOracleProjection(entry);
  const domainMemory = buildDomainMemoryProjection(entry);
  const skillCatalog = buildSkillProjection(manifest, entry);
  const runtimeSurfaces = buildRuntimeProjection(manifest, entry);
  const functionalPrivatizationAudit = buildFunctionalPrivatizationProjection(manifest, entry);
  const readinessStatus = buildReadinessSummary([
    entryProjection,
    { status: skeleton.status },
    actionCatalog,
    stageControlPlane,
    domainMemory,
    skillCatalog,
    runtimeSurfaces.runtime_inventory,
    runtimeSurfaces.session_continuity,
    runtimeSurfaces.progress_projection,
    runtimeSurfaces.artifact_inventory,
  ]);

  return {
    surface_kind: 'opl_domain_agent_descriptor',
    descriptor_version: 'opl-domain-agent-descriptor.v1',
    project_id: entry.project_id,
    project: entry.project,
    binding_id: entry.binding_id,
    workspace_path: entry.workspace_path,
    manifest_status: entry.status,
    target_domain_id: manifest?.target_domain_id ?? null,
    descriptor_status: readinessStatus,
    agent_id:
      entryProjection.agent_id
      ?? skeleton.agent_id
      ?? manifest?.target_domain_id
      ?? null,
    title: entryProjection.title,
    description: entryProjection.description,
    entry: entryProjection,
    standard_domain_agent_skeleton: skeleton,
    family_action_catalog: actionCatalog,
    family_stage_control_plane: stageControlPlane,
    family_transition: familyTransition,
    grant_transition_oracle: grantTransitionOracle,
    domain_memory_descriptor: domainMemory,
    skill_catalog: skillCatalog,
    runtime_surfaces: runtimeSurfaces,
    functional_privatization_audit: functionalPrivatizationAudit,
    descriptor_refs: buildDescriptorRefs(manifest),
    authority_boundary: {
      opl_role: 'descriptor_discovery_projection_transport_and_runtime_lifecycle_only',
      domain_agent_role: 'domain_truth_runtime_quality_artifact_and_memory_owner',
      descriptor_body_policy: 'refs_and_status_only_not_memory_or_instruction_body',
      natural_language_context_policy: 'markdown_first_domain_owned_context_loaded_by_agent_when_needed',
    },
    non_authority_flags: {
      opl_owns_domain_truth: false,
      opl_owns_domain_memory_body: false,
      opl_accepts_or_rejects_domain_memory_writeback: false,
      opl_authorizes_quality_verdict: false,
      opl_authorizes_publication_or_fundability_verdict: false,
      opl_owns_artifact_authority: false,
      descriptor_embeds_longform_agent_context: false,
    },
    error: entry.error,
  };
}

function findDescriptorEntry(contracts: FrameworkContracts, domain: string) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const normalized = normalizeDomainSelection(domain);
  const entry = catalog.projects.find((candidate) => {
    const manifest = candidate.manifest;
    const descriptor = buildDescriptor(candidate);
    return candidate.project_id === normalized
      || candidate.project === normalized
      || manifest?.target_domain_id === domain
      || manifest?.target_domain_id === normalized
      || descriptor.agent_id === domain
      || descriptor.agent_id === normalized
      || (isRecord(manifest?.domain_memory_descriptor) && manifest.domain_memory_descriptor.target_domain_id === domain)
      || (isRecord(manifest?.domain_memory_descriptor) && manifest.domain_memory_descriptor.target_domain_id === normalized);
  });
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family domain agent descriptor domain: ${domain}.`, {
      domain,
      allowed_domains: catalog.projects.map((project) => project.project_id),
    });
  }
  return entry;
}

function descriptorProviderResidencyGapStatus(descriptors: ReturnType<typeof buildDescriptor>[]) {
  const firstStatus = descriptors
    .map((descriptor) =>
      optionalString(
        descriptor.standard_domain_agent_skeleton.provider_closure_evidence
          ?.external_temporal_production_residency_proof
          ?.status,
      )
    )
    .find((status) => status !== null);
  return firstStatus ?? null;
}

export function buildFamilyAgentDescriptorList(contracts: FrameworkContracts) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const descriptors = catalog.projects.map(buildDescriptor);
  return {
    version: 'g2',
    family_agent_descriptors: {
      surface_kind: 'opl_domain_agent_descriptor_index',
      summary: {
        total_projects_count: descriptors.length,
        resolved_manifest_count: descriptors.filter((descriptor) => descriptor.manifest_status === 'resolved').length,
        descriptor_surfaces_resolved_count: descriptors.filter((descriptor) =>
          descriptor.descriptor_status === 'descriptor_surfaces_resolved'
        ).length,
        descriptor_surfaces_partial_count: descriptors.filter((descriptor) =>
          descriptor.descriptor_status === 'descriptor_surfaces_partial'
        ).length,
        blocked_count: descriptors.filter((descriptor) =>
          descriptor.descriptor_status === 'blocked_by_manifest_status'
        ).length,
        memory_descriptor_resolved_count: descriptors.filter((descriptor) =>
          descriptor.domain_memory_descriptor.status === 'resolved'
        ).length,
        stage_control_plane_resolved_count: descriptors.filter((descriptor) =>
          descriptor.family_stage_control_plane.status === 'resolved'
        ).length,
        action_catalog_resolved_count: descriptors.filter((descriptor) =>
          descriptor.family_action_catalog.status === 'resolved'
        ).length,
        transition_matrix_evaluated_count: descriptors.filter((descriptor) =>
          descriptor.family_transition.status === 'matrix_evaluated'
        ).length,
        transition_descriptor_only_count: descriptors.filter((descriptor) =>
          descriptor.family_transition.status === 'descriptor_only'
        ).length,
        transition_blocked_count: descriptors.filter((descriptor) =>
          descriptor.family_transition.status === 'blocked'
        ).length,
        physical_skeleton_evidence_observed_count: descriptors.filter((descriptor) =>
          descriptor.standard_domain_agent_skeleton.physical_skeleton_evidence !== null
        ).length,
        physical_skeleton_audit_pending_count: descriptors.filter((descriptor) =>
          descriptor.standard_domain_agent_skeleton.physical_skeleton_layout_audit.status
            === 'descriptor_aligned_physical_layout_pending'
        ).length,
        production_closure_gap_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.standard_domain_agent_skeleton.production_closure_gaps.length,
          0,
        ),
        provider_temporal_residency_gap_status: descriptorProviderResidencyGapStatus(descriptors),
        functional_privatization_audit_resolved_count: descriptors.filter((descriptor) =>
          descriptor.functional_privatization_audit.status === 'resolved'
        ).length,
        functional_privatization_module_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.total_module_count,
          0,
        ),
        functional_privatization_opl_owned_replacement_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.opl_owned_replacement_count,
          0,
        ),
        functional_privatization_opl_hosted_surface_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.opl_hosted_surface_count,
          0,
        ),
        functional_privatization_opl_generated_surface_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.opl_generated_surface_count,
          0,
        ),
        functional_privatization_declarative_pack_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.declarative_pack_count,
          0,
        ),
        functional_privatization_minimal_authority_function_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.minimal_authority_function_count,
          0,
        ),
        functional_privatization_refs_only_domain_adapter_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.refs_only_domain_adapter_count,
          0,
        ),
        functional_privatization_temporary_migration_bridge_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.temporary_migration_bridge_count,
          0,
        ),
        functional_privatization_diagnostic_cleanup_path_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.diagnostic_cleanup_path_count,
          0,
        ),
        functional_privatization_provenance_or_fixture_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.provenance_or_fixture_count,
          0,
        ),
        functional_privatization_domain_authority_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.domain_authority_count,
          0,
        ),
        functional_privatization_retire_tombstone_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.retire_tombstone_count,
          0,
        ),
        functional_privatization_active_private_generic_residue_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.active_private_generic_residue_count,
          0,
        ),
        functional_privatization_blocker_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.blocker_count,
          0,
        ),
        functional_privatization_default_watchlist_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.default_watchlist_count,
          0,
        ),
        functional_privatization_default_hidden_cleared_count: descriptors.reduce(
          (total, descriptor) => total + descriptor.functional_privatization_audit.summary.default_hidden_cleared_count,
          0,
        ),
        functional_privatization_default_watchlist_module_ids: descriptors.flatMap((descriptor) =>
          descriptor.functional_privatization_audit.summary.default_watchlist_module_ids
        ),
        functional_privatization_semantic_equivalence_review_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.semantic_equivalence_review_count,
          0,
        ),
        functional_privatization_semantic_equivalence_cleared_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.semantic_equivalence_cleared_count,
          0,
        ),
        functional_privatization_semantic_equivalence_review_module_ids: descriptors.flatMap((descriptor) =>
          descriptor.functional_privatization_audit.summary.semantic_equivalence_review_module_ids
        ),
      },
      descriptors,
      notes: [
        'This is the unified OPL read model over domain-owned manifest surfaces.',
        'Descriptors carry refs, readiness, locator, parity, and authority boundaries only.',
        'Domain memory bodies, route decisions, quality verdicts, and artifact authority remain domain-owned.',
      ],
    },
  };
}

export function buildFamilyAgentDescriptorInspect(contracts: FrameworkContracts, args: string[]) {
  const { domain } = parseDescriptorArgs(args);
  const entry = findDescriptorEntry(contracts, domain);
  const descriptor = buildDescriptor(entry);
  return {
    version: 'g2',
    family_agent_descriptor: {
      ...descriptor,
      surface_kind: 'opl_domain_agent_descriptor_inspection',
      descriptor_surface_kind: descriptor.surface_kind,
      inspection_notes: [
        'Use this as the maintainer and App/CLI total entry for an admitted domain agent.',
        'For agent-readable longform context, follow descriptor refs to domain-owned Markdown or skill surfaces.',
      ],
    },
  };
}
