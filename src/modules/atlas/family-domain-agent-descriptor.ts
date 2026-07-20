import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { ManifestCommandTimeoutPolicy } from './domain-manifest/resolver.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from './domain-manifest/types.ts';
import { buildFamilyActionCatalogParity } from '../../kernel/family-action-catalog-projection.ts';
import { pickSkillActivationProjection } from './family-domain-catalog.ts';
import { buildFamilyStageControlPlaneParity } from '../stagecraft/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  matchesStandardDomainAgentCatalogEntry,
  normalizeStandardDomainAgentId,
} from '../../kernel/standard-agent-registry.ts';
import { record, stringValue, type JsonRecord } from '../../kernel/json-record.ts';

const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;

function normalizeDomainSelection(value: string) {
  return normalizeStandardDomainAgentId(value);
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

function actionCatalogWorkspace(entry: DomainManifestCatalogEntry) {
  if (!entry.workspace_path) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Resolved family action catalogs require an absolute workspace path.',
      { project_id: entry.project_id, target_domain_id: entry.manifest?.target_domain_id ?? null },
    );
  }
  return entry.workspace_path;
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
    generated_surface_handoff: {
      ref_kind: 'json_pointer',
      ref: '/generated_surface_handoff',
      status: manifest?.generated_surface_handoff ? 'resolved' : 'missing',
    },
  };
}

function buildEntryProjection(entry: DomainManifestCatalogEntry) {
  const manifest = entry.manifest;
  const spec = manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null;
  const standardAgentIdentity = record(entry.standard_agent_identity);
  return {
    status: componentStatus(entry, Boolean(spec)),
    agent_id: spec?.agent_id ?? stringValue(standardAgentIdentity.agent_id),
    title: spec?.title ?? stringValue(standardAgentIdentity.display_name),
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
  const skeleton = record(entry.manifest?.standard_domain_agent_skeleton);
  const hasSkeleton = Object.keys(skeleton).length > 0;
  const repoSourceBoundary = record(skeleton.repo_source_boundary);
  const declaredRepoSourceDirs = stringArray(repoSourceBoundary.required_dirs);
  const missingRepoSourceDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !declaredRepoSourceDirs.includes(dir));
  const artifactBoundary = record(skeleton.artifact_boundary);
  const hasArtifactLocatorSurface = Boolean(artifactBoundary.has_locator_surface);
  const issues = [
    hasSkeleton ? null : 'manifest_missing_standard_domain_agent_skeleton',
    ...missingRepoSourceDirs.map((dir) => `missing_repo_source_dir:${dir}`),
    declaredRepoSourceDirs.includes('artifacts') ? 'repo_source_skeleton_must_not_include_real_artifacts_dir' : null,
    artifactBoundary.repo_contains_real_artifacts === true ? 'domain_repo_must_not_contain_real_artifacts' : null,
    hasSkeleton && artifactBoundary.artifact_roots_are_locators !== true ? 'artifact_roots_must_be_locators' : null,
    hasSkeleton && !hasArtifactLocatorSurface ? 'artifact_locator_surface_required' : null,
  ].filter((issue): issue is string => Boolean(issue));
  const manifestBlocked = entry.status !== 'resolved';
  const skeletonStatus = manifestBlocked
    ? 'blocked'
    : issues.length === 0
      ? 'aligned'
      : hasSkeleton
        ? 'drift_detected'
        : 'missing';
  const physicalSkeletonLayoutAudit = Object.keys(record(skeleton.physical_skeleton_layout_audit)).length > 0
    ? record(skeleton.physical_skeleton_layout_audit)
    : {
        status: hasSkeleton
          ? 'descriptor_aligned_physical_layout_pending'
          : 'standard_domain_agent_skeleton_missing',
        source: 'atlas_descriptor_projection',
        issues,
      };
  const providerClosureEvidence = record(skeleton.provider_closure_evidence);
  const physicalSkeletonEvidence = record(skeleton.physical_skeleton_evidence);
  const physicalSkeletonFollowThrough = record(skeleton.physical_skeleton_follow_through);
  return {
    status: skeletonStatus,
    agent_id:
      stringValue(skeleton.agent_id)
      ?? stringValue(skeleton.skeleton_id)
      ?? stringValue(entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id),
    skeleton_source_field: hasSkeleton ? entry.manifest?.standard_domain_agent_skeleton_source_field ?? null : null,
    descriptor_readiness: {
      status: skeletonStatus,
      ready: skeletonStatus === 'aligned',
      required_repo_source_dirs_present: missingRepoSourceDirs.length === 0,
      artifact_locator_surface_present: hasArtifactLocatorSurface,
    },
    physical_skeleton_layout_audit: physicalSkeletonLayoutAudit,
    physical_skeleton_evidence: Object.keys(physicalSkeletonEvidence).length > 0 ? physicalSkeletonEvidence : null,
    physical_skeleton_follow_through_gate: Object.keys(physicalSkeletonFollowThrough).length > 0
      ? physicalSkeletonFollowThrough
      : null,
    production_closure_gap_count: arrayValue(skeleton.production_closure_gaps).length,
    production_closure_gaps: arrayValue(skeleton.production_closure_gaps),
    provider_closure_evidence: Object.keys(providerClosureEvidence).length > 0
      ? providerClosureEvidence
      : {
          external_temporal_production_residency_proof: {
            status: 'not_evaluated_in_atlas_descriptor',
            provider_completion_is_domain_ready: false,
          },
        },
    declared_repo_source_dirs: declaredRepoSourceDirs,
    missing_repo_source_dirs: missingRepoSourceDirs,
    artifact_boundary: Object.keys(artifactBoundary).length > 0 ? artifactBoundary : null,
    contract_refs: Object.keys(record(skeleton.contracts)).length > 0 ? record(skeleton.contracts) : null,
    issues,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => stringValue(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function buildFunctionalSourcePurityTailReadModel(summary: {
  total_module_count?: number;
  standard_domain_pack_inventory_count?: number;
  authority_function_inventory_count?: number;
  default_watchlist_count: number;
  semantic_equivalence_review_count: number;
  active_private_generic_residue_count: number;
  blocker_count: number;
  default_hidden_cleared_count?: number;
  private_platform_residue_inventory_count: number;
}) {
  const defaultActionRequiredCount = Math.max(
    summary.default_watchlist_count,
    summary.semantic_equivalence_review_count,
    summary.active_private_generic_residue_count,
    summary.blocker_count,
  );
  const hasAuditOnlyTail =
    (summary.default_hidden_cleared_count ?? 0) > 0
    || summary.private_platform_residue_inventory_count > 0;
  return {
    default_action_required_count: defaultActionRequiredCount,
    action_required_blocker_count: summary.blocker_count,
    hidden_cleared_audit_ledger_count: summary.default_hidden_cleared_count ?? 0,
    hidden_cleared_entries_remain_traceable: true,
    private_platform_residue_inventory_audit_only_count:
      summary.private_platform_residue_inventory_count,
    private_platform_residue_inventory_counts_as_action_required: false,
    private_platform_residue_inventory_counts_as_blocker: false,
    physical_delete_authorized: false,
    physical_delete_authority: 'not_authorized_by_descriptor_or_app_read_model',
    source_purity_tail_status:
      defaultActionRequiredCount > 0
        ? 'action_required_tail_open'
        : hasAuditOnlyTail
          ? 'audit_only_tail_traceable_no_action_required_blocker'
          : 'no_source_purity_tail',
    source_purity_tail_policy:
      'physical_delete_requires_separate_domain_owner_receipt_or_typed_blocker_no_active_caller_no_forbidden_write_and_replacement_parity',
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
    parity: catalog
      ? buildFamilyActionCatalogParity(catalog, actionCatalogWorkspace(entry), entry.manifest)
      : null,
    authority_boundary: catalog?.authority_boundary ?? null,
    raw_descriptor: catalog,
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
    raw_descriptor: plane,
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
  const emptySummary = {
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
    standard_domain_pack_inventory_count: 0,
    authority_function_inventory_count: 0,
    private_platform_residue_inventory_count: 0,
    standard_domain_pack_module_ids: [],
    authority_function_module_ids: [],
    private_platform_residue_module_ids: [],
    semantic_equivalence_review_count: 0,
    semantic_equivalence_cleared_count: 0,
    semantic_equivalence_review_module_ids: [],
  };
  return {
    status: componentStatus(entry, audit?.status === 'resolved'),
    envelope: audit?.envelope ?? null,
    source_field: audit?.source_field ?? null,
    source_field_role: audit?.source_field_role ?? null,
    legacy_import_source_fields: audit?.legacy_import_source_fields ?? [],
    target_domain_id: audit?.target_domain_id ?? manifest?.target_domain_id ?? null,
    summary: audit?.summary ?? emptySummary,
    source_purity_tail_read_model:
      audit?.source_purity_tail_read_model ?? buildFunctionalSourcePurityTailReadModel(emptySummary),
    required_opl_replacement_primitives: audit?.required_opl_replacement_primitives ?? [],
    blockers: audit?.blockers ?? ['functional_privatization_audit_missing'],
    modules: audit?.modules ?? [],
    standard_domain_pack_inventory: audit?.standard_domain_pack_inventory ?? [],
    authority_function_inventory: audit?.authority_function_inventory ?? [],
    private_platform_residue_inventory: audit?.private_platform_residue_inventory ?? [],
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
  const statuses = parts.map((part) => stringValue(part.status));
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
    domain_memory_descriptor: domainMemory,
    generated_surface_handoff_contract: manifest?.generated_surface_handoff ?? null,
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
    standard_agent_identity: entry.standard_agent_identity ?? null,
    standard_agent_contract_resolution: entry.standard_agent_contract_resolution ?? null,
    legacy_workspace_manifest_diagnostic: entry.legacy_workspace_manifest_diagnostic ?? null,
    error: entry.error,
  };
}

function findDescriptorEntry(
  contracts: FrameworkContracts,
  domain: string,
  options: { domainManifests?: DomainManifestCatalog } = {},
) {
  const catalog = options.domainManifests ?? buildDomainManifestCatalog(contracts).domain_manifests;
  const normalized = normalizeDomainSelection(domain);
  const entry = catalog.projects.find((candidate) => {
    const manifest = candidate.manifest;
    const descriptor = buildDescriptor(candidate);
    const domainMemoryDescriptor = record(manifest?.domain_memory_descriptor);
    return candidate.project_id === normalized
      || candidate.project === normalized
      || matchesStandardDomainAgentCatalogEntry(domain, candidate)
      || manifest?.target_domain_id === domain
      || manifest?.target_domain_id === normalized
      || descriptor.agent_id === domain
      || descriptor.agent_id === normalized
      || domainMemoryDescriptor.target_domain_id === domain
      || domainMemoryDescriptor.target_domain_id === normalized;
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
      stringValue(
        record(record(descriptor.standard_domain_agent_skeleton.provider_closure_evidence)
          .external_temporal_production_residency_proof)
          .status,
      )
    )
    .find((status) => status !== null);
  return firstStatus ?? null;
}

function descriptorFunctionalSourcePurityTailReadModel(descriptors: ReturnType<typeof buildDescriptor>[]) {
  const sum = (field: keyof ReturnType<typeof buildDescriptor>['functional_privatization_audit']['summary']) =>
    descriptors.reduce((total, descriptor) => {
      const value = descriptor.functional_privatization_audit.summary[field];
      return typeof value === 'number' ? total + value : total;
    }, 0);
  return buildFunctionalSourcePurityTailReadModel({
    total_module_count: sum('total_module_count'),
    standard_domain_pack_inventory_count: sum('standard_domain_pack_inventory_count'),
    authority_function_inventory_count: sum('authority_function_inventory_count'),
    private_platform_residue_inventory_count: sum('private_platform_residue_inventory_count'),
    default_watchlist_count: sum('default_watchlist_count'),
    default_hidden_cleared_count: sum('default_hidden_cleared_count'),
    semantic_equivalence_review_count: sum('semantic_equivalence_review_count'),
    active_private_generic_residue_count: sum('active_private_generic_residue_count'),
    blocker_count: sum('blocker_count'),
  });
}

export function buildFamilyAgentDescriptorList(
  contracts: FrameworkContracts,
  options: {
    manifestCommandTimeoutMs?: number;
    manifestCommandTimeoutPolicy?: ManifestCommandTimeoutPolicy;
    domainManifests?: DomainManifestCatalog;
  } = {},
) {
  const catalog = options.domainManifests ?? buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: options.manifestCommandTimeoutMs,
    manifestCommandTimeoutPolicy: options.manifestCommandTimeoutPolicy,
  }).domain_manifests;
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
        functional_privatization_source_purity_tail_read_model:
          descriptorFunctionalSourcePurityTailReadModel(descriptors),
        functional_privatization_default_watchlist_module_ids: descriptors.flatMap((descriptor) =>
          descriptor.functional_privatization_audit.summary.default_watchlist_module_ids
        ),
        functional_privatization_standard_domain_pack_inventory_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.standard_domain_pack_inventory_count,
          0,
        ),
        functional_privatization_authority_function_inventory_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.authority_function_inventory_count,
          0,
        ),
        functional_privatization_private_platform_residue_inventory_count: descriptors.reduce(
          (total, descriptor) =>
            total + descriptor.functional_privatization_audit.summary.private_platform_residue_inventory_count,
          0,
        ),
        functional_privatization_standard_domain_pack_module_ids: descriptors.flatMap((descriptor) =>
          descriptor.functional_privatization_audit.summary.standard_domain_pack_module_ids
        ),
        functional_privatization_authority_function_module_ids: descriptors.flatMap((descriptor) =>
          descriptor.functional_privatization_audit.summary.authority_function_module_ids
        ),
        functional_privatization_private_platform_residue_module_ids: descriptors.flatMap((descriptor) =>
          descriptor.functional_privatization_audit.summary.private_platform_residue_module_ids
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

export function buildFamilyAgentDescriptorInspect(
  contracts: FrameworkContracts,
  args: string[],
  options: { domainManifests?: DomainManifestCatalog } = {},
) {
  const { domain } = parseDescriptorArgs(args);
  const entry = findDescriptorEntry(contracts, domain, options);
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
