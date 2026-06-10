import {
  buildFamilyActionCatalogParity,
  projectFamilyAction,
  projectFamilyActionCatalog,
} from '../family-action-catalog.ts';
import type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionExportFormat,
} from '../family-action-catalog-contract.ts';
import { buildGeneratedDirectParityProof } from './generated-interface-parity.ts';
import type { FamilyStageControlPlane } from '../family-stage-control-plane-contract.ts';
import { buildToolAffordanceBoundaryRoute } from './stage-route-tool-affordance.ts';

type JsonRecord = Record<string, unknown>;
export type GeneratedInterfaceFormat = FamilyActionExportFormat | 'product-entry';

export const GENERATED_INTERFACE_SOURCE_REFS = [
  'family_action_catalog',
  'family_stage_control_plane',
  'domain_memory_descriptor',
  'runtime_surfaces',
  'functional_privatization_audit',
  'generated_surface_handoff',
  'product_entry_manifest_descriptor',
  'domain_handler_descriptor',
] as const;

export const GENERATED_SURFACES = [
  {
    surface_id: 'cli',
    required_descriptor_surfaces: ['family_action_catalog'],
  },
  {
    surface_id: 'mcp',
    required_descriptor_surfaces: ['family_action_catalog'],
  },
  {
    surface_id: 'skill',
    required_descriptor_surfaces: ['family_action_catalog'],
  },
  {
    surface_id: 'product_entry_manifest',
    required_descriptor_surfaces: ['entry', 'family_action_catalog', 'family_stage_control_plane'],
  },
  {
    surface_id: 'domain_handler',
    required_descriptor_surfaces: ['family_action_catalog', 'functional_privatization_audit'],
  },
  {
    surface_id: 'status_read_model',
    required_descriptor_surfaces: ['entry', 'runtime_surfaces', 'domain_memory_descriptor'],
  },
  {
    surface_id: 'workbench_drilldown',
    required_descriptor_surfaces: ['family_stage_control_plane', 'domain_memory_descriptor', 'runtime_surfaces'],
  },
  {
    surface_id: 'functional_harness_cases',
    required_descriptor_surfaces: ['family_transition', 'functional_privatization_audit'],
  },
] as const;

const GENERATED_WRAPPER_CANONICAL_TARGET_IDS: Record<string, string[]> = {
  product_entry: ['product_entry_manifest'],
  product_status: ['status_read_model'],
  product_session: ['product_session', 'product_entry_manifest', 'status_read_model'],
  domain_handler: ['domain_action_adapter_export_dispatch', 'domain_action_adapter', 'domain_handler'],
  workbench: ['workbench_drilldown'],
};

const GENERATED_WRAPPER_DESCRIPTOR_SCOPE = [
  {
    surface_id: 'cli',
    block_key: 'cli',
    target_surface_id: 'cli',
    descriptor_kind: 'opl_generated_cli_descriptor',
  },
  {
    surface_id: 'mcp',
    block_key: 'mcp',
    target_surface_id: 'mcp',
    descriptor_kind: 'opl_generated_mcp_descriptor',
  },
  {
    surface_id: 'skill',
    block_key: 'skill',
    target_surface_id: 'skill',
    descriptor_kind: 'opl_generated_skill_descriptor',
  },
  {
    surface_id: 'product_entry',
    block_key: 'product_entry',
    target_surface_id: 'product_entry',
    descriptor_kind: 'opl_generated_product_entry_descriptor',
  },
  {
    surface_id: 'product_status',
    block_key: 'product_status',
    target_surface_id: 'product_status',
    descriptor_kind: 'opl_generated_product_status_descriptor',
  },
  {
    surface_id: 'product_session',
    block_key: 'product_session',
    target_surface_id: 'product_session',
    descriptor_kind: 'opl_generated_product_session_descriptor',
  },
  {
    surface_id: 'domain_handler',
    block_key: 'domain_handler',
    target_surface_id: 'domain_handler',
    descriptor_kind: 'opl_generated_domain_handler_descriptor',
  },
  {
    surface_id: 'workbench',
    block_key: 'workbench',
    target_surface_id: 'workbench',
    descriptor_kind: 'opl_hosted_workbench_descriptor',
  },
] as const;

const GENERATED_DEFAULT_ENTRY_SURFACE_IDS = [
  'cli',
  'mcp',
  'openai_tool',
  'ai_sdk',
  'skill_plugin',
  'app_action',
  'status_read_model',
  'workbench',
] as const;

const SUPPORTED_DERIVED_SURFACES = [
  {
    surface_id: 'cli',
    descriptor_block: 'cli',
    source_catalogs: ['family_action_catalog'],
  },
  {
    surface_id: 'mcp',
    descriptor_block: 'mcp',
    source_catalogs: ['family_action_catalog'],
  },
  {
    surface_id: 'openai_tool',
    descriptor_block: 'openai_tool',
    source_catalogs: ['family_action_catalog'],
  },
  {
    surface_id: 'ai_sdk',
    descriptor_block: 'ai_sdk',
    source_catalogs: ['family_action_catalog'],
  },
  {
    surface_id: 'skill_plugin',
    descriptor_block: 'skill',
    source_catalogs: ['family_action_catalog'],
  },
  {
    surface_id: 'app_action',
    descriptor_block: 'product_entry',
    source_catalogs: ['family_action_catalog'],
  },
  {
    surface_id: 'status_read_model',
    descriptor_block: 'product_status',
    source_catalogs: ['family_action_catalog', 'runtime_surfaces'],
  },
  {
    surface_id: 'workbench',
    descriptor_block: 'workbench',
    source_catalogs: ['family_stage_control_plane', 'domain_memory_descriptor', 'runtime_surfaces'],
  },
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function buildDefaultEntryPolicy() {
  return {
    surface_kind: 'opl_generated_surface_default_entry_policy',
    version: 'opl-generated-surface-default-entry-policy.v1',
    owner: 'one-person-lab',
    status: 'generated_surfaces_are_default_entry_baseline',
    source_catalogs: ['family_action_catalog', 'family_stage_control_plane'],
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
    domain_repo_can_own_default_entry: false,
    default_entry_surface_ids: [...GENERATED_DEFAULT_ENTRY_SURFACE_IDS],
  };
}

function buildSupportedDerivedSurfaces() {
  return SUPPORTED_DERIVED_SURFACES.map((surface) => ({
    ...surface,
    owner: 'one-person-lab',
    default_entry: true,
    domain_repo_can_own_generated_surface: false,
    source_catalogs: [...surface.source_catalogs],
    domain_repo_role: 'handler_target_refs_only_adapter_or_tombstone_candidate',
  }));
}

function buildSourceOfWorkLineage(catalog: FamilyActionCatalog | null, stageControlPlane: FamilyStageControlPlane | null) {
  return {
    surface_kind: 'opl_generated_surface_source_of_work_lineage',
    version: 'opl-generated-surface-source-of-work-lineage.v1',
    owner: 'one-person-lab',
    status: catalog ? 'ready_from_family_action_catalog' : 'blocked_missing_family_action_catalog',
    source_catalogs: ['family_action_catalog', 'family_stage_control_plane'],
    action_catalog_ref: catalog ? `family_action_catalog:${catalog.catalog_id}` : null,
    stage_catalog_ref: stageControlPlane ? `family_stage_control_plane:${stageControlPlane.plane_id}` : null,
    action_ids: catalog?.actions.map((action) => action.action_id) ?? [],
    derived_surface_ids: [...GENERATED_DEFAULT_ENTRY_SURFACE_IDS],
    derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
    authority_boundary: {
      lineage_can_write_domain_truth: false,
      lineage_can_replace_domain_handler: false,
      lineage_can_authorize_quality_or_export: false,
      lineage_can_claim_domain_ready: false,
      lineage_can_claim_production_ready: false,
    },
  };
}

function buildGeneratedDefaultEntryNoResurrectionGate(
  catalog: FamilyActionCatalog | null,
  stageControlPlane: FamilyStageControlPlane | null,
) {
  const sourceActionIds = catalog?.actions
    .map((action) => action.source_of_work?.source_action_id ?? action.action_id)
    ?? [];
  const actionCatalogRefs = unique(
    catalog?.actions.map((action) =>
      action.source_of_work?.source_catalog_ref ?? `family_action_catalog:${catalog.catalog_id}`
    ) ?? [],
  );
  const stageCatalogRefs = unique(
    catalog?.actions
      .map((action) => action.source_of_work?.stage_catalog_ref ?? null)
      .filter((entry): entry is string => Boolean(entry)) ?? [],
  );
  const stageCatalogRef =
    stageCatalogRefs[0]
    ?? (stageControlPlane ? `family_stage_control_plane:${stageControlPlane.plane_id}` : null);
  const lineageReady = Boolean(catalog && sourceActionIds.length > 0 && stageCatalogRef);

  return {
    surface_kind: 'opl_generated_default_entry_no_resurrection_gate',
    version: 'opl-generated-default-entry-no-resurrection-gate.v1',
    owner: 'one-person-lab',
    release_gate: true,
    gate_status: lineageReady ? 'pass' : 'blocked_missing_source_of_work_lineage',
    default_entry_policy_ref: 'generated_agent_interfaces.default_entry_policy',
    source_of_work_lineage_ref: 'generated_agent_interfaces.source_of_work_lineage',
    required_default_entry_surface_ids: [...GENERATED_DEFAULT_ENTRY_SURFACE_IDS],
    required_lineage_policy: 'each_default_entry_surface_carries_source_of_work_lineage',
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
    domain_repo_can_own_default_entry: false,
    descriptor_pass_can_claim_domain_ready: false,
    handwritten_default_tool_surface_allowed: false,
    domain_local_wrapper_can_be_default_entry: false,
    blocked_resurrection_surface_classes: [
      'domain_local_wrapper',
      'domain_local_frontdoor',
      'handwritten_default_tool_surface',
      'repo_local_status_shell',
      'repo_local_workbench_shell',
    ],
    source_catalogs: ['family_action_catalog', 'family_stage_control_plane'],
    action_catalog_refs: actionCatalogRefs,
    stage_catalog_ref: stageCatalogRef,
    default_entry_surface_lineage: SUPPORTED_DERIVED_SURFACES.map((surface) => ({
      surface_id: surface.surface_id,
      descriptor_block: surface.descriptor_block,
      owner: 'one-person-lab',
      default_entry: true,
      domain_repo_can_own_default_entry: false,
      domain_repo_can_own_generated_surface: false,
      descriptor_pass_can_claim_domain_ready: false,
      source_catalogs: [...surface.source_catalogs],
      source_of_work_lineage: {
        source_catalog: 'family_action_catalog',
        source_catalog_refs: actionCatalogRefs,
        source_action_ids: sourceActionIds,
        stage_catalog_ref: stageCatalogRef,
        derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
        domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
      },
    })),
    authority_boundary: {
      gate_can_claim_domain_ready: false,
      gate_can_claim_production_ready: false,
      gate_can_write_domain_truth: false,
      gate_can_authorize_quality_or_export: false,
    },
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function rawDescriptorSurface<T>(descriptor: JsonRecord, key: string): T | null {
  const surface = isRecord(descriptor[key]) ? descriptor[key] as JsonRecord : null;
  if (!surface) {
    return null;
  }
  const raw = surface.raw_descriptor;
  return isRecord(raw) ? raw as T : null;
}

function descriptorRecord(descriptor: JsonRecord, key: string) {
  return isRecord(descriptor[key]) ? descriptor[key] as JsonRecord : null;
}

function buildStageRoutes(stageControlPlane: FamilyStageControlPlane | null) {
  return stageControlPlane?.stages.map((stage) => {
    const toolAffordanceBoundary = buildToolAffordanceBoundaryRoute(stage);
    const includeStagePackRefs =
      stage.stage_pack_conformance_version === 'standard-stage-pack.v2'
      || Boolean(toolAffordanceBoundary);
    return {
      stage_id: stage.stage_id,
      allowed_action_refs: stage.allowed_action_refs,
      authority_owner: stage.owner,
      ...(includeStagePackRefs && stage.prompt_refs.length > 0 ? { prompt_refs: stage.prompt_refs } : {}),
      ...(includeStagePackRefs && stage.skills.length > 0 ? { skills: stage.skills } : {}),
      ...(includeStagePackRefs && stage.tool_refs && stage.tool_refs.length > 0 ? { tool_refs: stage.tool_refs } : {}),
      ...(includeStagePackRefs && stage.knowledge_refs.length > 0 ? { knowledge_refs: stage.knowledge_refs } : {}),
      ...(includeStagePackRefs && stage.evaluation.length > 0 ? { evaluation: stage.evaluation } : {}),
      ...(toolAffordanceBoundary ? { tool_affordance_boundary: toolAffordanceBoundary } : {}),
      ...(stage.stage_contract?.progress_delta_policy ? {
        progress_delta_policy: {
          surface_kind: typeof stage.stage_contract.progress_delta_policy.surface_kind === 'string'
            ? stage.stage_contract.progress_delta_policy.surface_kind
            : 'opl_stage_progress_delta_policy',
          required_fields: Array.isArray(stage.stage_contract.progress_delta_policy.required_fields)
            ? stage.stage_contract.progress_delta_policy.required_fields.filter((field): field is string =>
              typeof field === 'string'
            )
            : [],
          platform_only_is_not_deliverable_progress:
            stage.stage_contract.progress_delta_policy.platform_only_is_not_deliverable_progress === true,
        },
      } : {}),
      ...(stage.stage_contract?.typed_blocker_lineage_policy ? {
        typed_blocker_lineage_policy: {
          surface_kind: typeof stage.stage_contract.typed_blocker_lineage_policy.surface_kind === 'string'
            ? stage.stage_contract.typed_blocker_lineage_policy.surface_kind
            : 'family-stall-lineage.v1',
          repeat_budget: isRecord(stage.stage_contract.typed_blocker_lineage_policy.repeat_budget)
            ? stage.stage_contract.typed_blocker_lineage_policy.repeat_budget
            : null,
        },
      } : {}),
    };
  }) ?? [];
}

function buildProductEntryDescriptors(catalog: FamilyActionCatalog) {
  return catalog.actions.map((action) => projectFamilyAction(action).product_entry);
}

function firstActionForStageControlPlane(
  catalog: FamilyActionCatalog | null,
  stageControlPlane: FamilyStageControlPlane | null,
): FamilyActionCatalogAction | null {
  if (!catalog) {
    return null;
  }
  const allowedActionIds = new Set(
    stageControlPlane?.stages.flatMap((stage) => stage.allowed_action_refs) ?? [],
  );
  return catalog.actions.find((action) => allowedActionIds.has(action.action_id))
    ?? catalog.actions[0]
    ?? null;
}

function defaultSourceOfWork(
  catalog: FamilyActionCatalog | null,
  stageControlPlane: FamilyStageControlPlane | null,
) {
  const action = firstActionForStageControlPlane(catalog, stageControlPlane);
  return action ? projectFamilyAction(action).product_entry.source_of_work : null;
}

function buildProductStatusDescriptors(catalog: FamilyActionCatalog | null) {
  if (!catalog) {
    return [];
  }
  const statusSurfaceKinds = new Set([
    'product_entry_status',
    'workspace_cockpit',
    'study_progress',
    'mainline_status',
    'mainline_phase',
  ]);
  return catalog.actions
    .filter((action) => {
      const surfaceKind =
        action.supported_surfaces.product_entry?.surface_kind
        ?? action.source_command.surface_kind;
      return statusSurfaceKinds.has(surfaceKind) || action.effect === 'read_only';
    })
    .map((action) => ({
      action_id: action.action_id,
      command: action.supported_surfaces.product_entry?.command ?? action.source_command.command,
      surface_kind: action.supported_surfaces.product_entry?.surface_kind ?? action.source_command.surface_kind,
      summary: action.summary,
      effect: action.effect,
      source_descriptor: 'family_action_catalog.supported_surfaces.product_entry',
      source_of_work: projectFamilyAction(action).product_entry.source_of_work,
    }));
}

function buildDomainHandlerDescriptors(catalog: FamilyActionCatalog | null) {
  if (!catalog) {
    return [];
  }
  return catalog.actions
    .filter((action) => {
      const surfaceKinds = [
        action.source_command.surface_kind,
        action.supported_surfaces.product_entry?.surface_kind,
        action.supported_surfaces.mcp?.surface_kind,
        action.supported_surfaces.skill?.surface_kind,
      ].filter((entry): entry is string => Boolean(entry));
      return surfaceKinds.some((surfaceKind) => surfaceKind.includes('domain_handler'));
    })
    .map((action) => ({
      action_id: action.action_id,
      command: action.supported_surfaces.product_entry?.command ?? action.source_command.command,
      surface_kind: action.supported_surfaces.product_entry?.surface_kind ?? action.source_command.surface_kind,
      summary: action.summary,
      effect: action.effect,
      authority_boundary: action.authority_boundary ?? null,
      source_of_work: projectFamilyAction(action).product_entry.source_of_work,
    }));
}

function generatedSurfaceAliases(surfaceId: string) {
  const aliases: Record<string, string[]> = {
    cli: ['cli'],
    mcp: ['mcp'],
    skill: ['skill'],
    product_entry_manifest: ['product_entry_manifest'],
    domain_action_adapter_export_dispatch: [
      'domain_action_adapter_export_dispatch',
      'domain_action_adapter',
      'domain_handler',
    ],
    domain_action_adapter: [
      'domain_action_adapter',
      'domain_action_adapter_export_dispatch',
      'domain_handler',
    ],
    domain_handler: [
      'domain_handler',
      'domain_action_adapter_export_dispatch',
      'domain_action_adapter',
    ],
    status_read_model: ['status_read_model'],
    workbench_drilldown: ['workbench_drilldown'],
    functional_harness_cases: ['functional_harness_cases', 'test_lane_harness', 'harness'],
    product_session: ['product_session'],
  };
  return aliases[surfaceId] ?? [surfaceId];
}

function matchesAlias(text: string, aliases: string[]) {
  const normalized = text.toLowerCase();
  return aliases.some((alias) => {
    const normalizedAlias = alias.toLowerCase();
    if (normalizedAlias.length <= 3) {
      const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(normalized);
    }
    return normalized.includes(normalizedAlias);
  });
}

function handoffSurfacesFromDescriptor(descriptor: JsonRecord) {
  const handoff =
    isRecord(descriptor.generated_surface_handoff_contract)
      ? descriptor.generated_surface_handoff_contract
      : isRecord(descriptor.generated_surface_handoff)
        ? descriptor.generated_surface_handoff
        : optionalString(descriptor.surface_kind) === 'opl_generated_surface_handoff'
          ? descriptor
          : null;
  return [
    ...recordList(handoff?.handoff_surfaces),
    ...recordList(handoff?.generated_surfaces),
  ];
}

function handoffSurfaceFor(descriptor: JsonRecord, surfaceId: string) {
  const aliases = generatedSurfaceAliases(surfaceId);
  return handoffSurfacesFromDescriptor(descriptor).find((surface) =>
    matchesAlias(optionalString(surface.surface_id) ?? '', aliases)
    || matchesAlias(optionalString(surface.target_role) ?? '', aliases)
  ) ?? null;
}

function currentPathsFromHandoff(surface: JsonRecord | null) {
  return stringList(surface?.current_paths);
}

function modulePathMatchScore(module: JsonRecord, currentPaths: string[]) {
  const codePaths = stringList(module.code_paths);
  let score = 0;
  for (const currentPath of currentPaths) {
    for (const codePath of codePaths) {
      if (codePath === currentPath) {
        score = Math.max(score, 100);
      } else if (!currentPath.endsWith('/') && currentPath.startsWith(`${codePath}/`)) {
        score = Math.max(score, 90);
      } else if (!codePath.endsWith('/') && codePath.startsWith(`${currentPath}/`)) {
        score = Math.max(score, 70);
      } else if (codePath.startsWith(currentPath) || currentPath.startsWith(codePath)) {
        score = Math.max(score, 50);
      }
    }
  }
  return score;
}

function moduleSurfaceRefMatches(module: JsonRecord, aliases: string[]) {
  return stringList(module.current_surface_refs)
    .some((surfaceRef) => matchesAlias(surfaceRef, aliases));
}

function proofModuleForSurface(descriptor: JsonRecord, surfaceId: string, surface: JsonRecord | null) {
  const audit = isRecord(descriptor.functional_privatization_audit)
    ? descriptor.functional_privatization_audit
    : null;
  const modules = [
    ...recordList(audit?.modules),
    ...recordList(
      isRecord(audit?.functional_consumer_boundary)
        ? audit.functional_consumer_boundary.functional_module_inventory
        : null,
    ),
    ...recordList(
      isRecord(audit?.privatized_functional_module_audit)
        ? audit.privatized_functional_module_audit.modules
        : null,
    ),
  ];
  const aliases = generatedSurfaceAliases(surfaceId);
  const currentPaths = currentPathsFromHandoff(surface);
  const explicitSurfaceRefModule = modules.find((module) => moduleSurfaceRefMatches(module, aliases));
  if (explicitSurfaceRefModule) {
    return explicitSurfaceRefModule;
  }
  if (currentPaths.length > 0) {
    const scored = modules
      .map((module, index) => ({ module, index, score: modulePathMatchScore(module, currentPaths) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    if (scored[0]) {
      return scored[0].module;
    }
    return null;
  }
  return modules.find((module) => {
    const searchable = [
      optionalString(module.module_id),
      optionalString(module.active_caller_status),
      optionalString(module.migration_action),
      ...stringList(module.expected_opl_primitives),
      ...stringList(module.current_surface_refs),
      ...stringList(module.code_paths),
    ]
      .filter((entry): entry is string => Boolean(entry));
    if (searchable.some((entry) => matchesAlias(entry, aliases))) {
      return true;
    }
    return false;
  }) ?? null;
}

function generatedSurfaceTargetKind(surface: JsonRecord | null, module: JsonRecord | null) {
  const surfaceStatus = optionalString(surface?.status)?.toLowerCase() ?? '';
  const surfaceOwner = optionalString(surface?.owner)?.toLowerCase() ?? '';
  const targetRole = optionalString(surface?.target_role)?.toLowerCase() ?? '';
  if (targetRole.includes('opl_hosted') || targetRole.includes('hosted') || targetRole.includes('workbench')) {
    return 'opl_hosted_surface';
  }
  if (targetRole.includes('opl_generated') || targetRole.includes('generated')) {
    return 'opl_generated_surface';
  }
  if (surfaceStatus.includes('descriptor_source_available') && surfaceOwner === 'one-person-lab') {
    return 'opl_generated_surface';
  }
  const text = [
    targetRole,
    optionalString(module?.active_caller_status),
    optionalString(module?.authority_boundary),
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .toLowerCase();
  if (text.includes('domain_handler') || text.includes('domain_authority')) {
    return 'domain_handler_target';
  }
  if (text.includes('hosted') || text.includes('workbench')) {
    return 'opl_hosted_surface';
  }
  if (text.includes('opl_generated') || text.includes('generated')) {
    return 'opl_generated_surface';
  }
  if (text.includes('refs_only')) {
    return 'refs_only_domain_adapter_target';
  }
  return 'descriptor_declared_target';
}

function generatedSurfaceTargetAllowed(targetKind: string) {
  return [
    'opl_generated_surface',
    'opl_hosted_surface',
    'domain_handler_target',
    'refs_only_domain_adapter_target',
  ].includes(targetKind);
}

function blockStatusIsReady(status: string | null) {
  return Boolean(status) && !status?.startsWith('blocked');
}

function generatedSurfaceProofStatus(surface: JsonRecord | null, module: JsonRecord | null) {
  if (!surface && !module) {
    return 'blocked_missing_handoff_and_active_caller_proof';
  }
  const status = [
    optionalString(surface?.status),
    optionalString(surface?.target_role),
    optionalString(module?.active_caller_status),
    optionalString(module?.migration_action),
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .toLowerCase();
  if (
    status.includes('active_private')
    || status.includes('default runtime')
    || status.includes('handoff_required')
    || status.includes('should_move')
    || status.includes('temporary_migration_bridge')
    || status.includes('migration_bridge')
    || status.includes('bridge_pending')
    || status.includes('repo-local wrapper')
    || status.includes('repo_local_wrapper')
  ) {
    return 'blocked_active_caller_not_cut_over';
  }
  if (
    status.includes('opl_generated')
    || status.includes('opl_hosted')
    || status.includes('generated_surface')
    || status.includes('descriptor_source_available')
    || status.includes('domain_handlers_active_opl_generated')
    || status.includes('opl_runtime_manager_loop_consumed')
    || status.includes('generic_runner_owned_by_opl')
  ) {
    return 'ready_active_caller_targets_opl_generated_or_hosted_surface';
  }
  if (
    status.includes('domain_authority_active')
    || status.includes('refs_only')
    || status.includes('domain_handler')
  ) {
    return 'ready_active_caller_targets_domain_handler_or_refs_adapter';
  }
  return module ? 'blocked_active_caller_target_not_proven' : 'ready_descriptor_source_available';
}

function moduleSemanticEquivalenceStatus(module: JsonRecord | null) {
  const explicit = optionalString(module?.semantic_equivalence_status);
  if (explicit) {
    return explicit;
  }
  const text = [
    optionalString(module?.active_caller_status),
    optionalString(module?.migration_action),
    optionalString(module?.module_id),
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .toLowerCase();
  if (
    text.includes('active_private')
    || text.includes('mixed_generic')
    || text.includes('pending')
    || text.includes('should_move')
    || text.includes('should_derive')
    || text.includes('handoff_required')
    || text.includes('until_opl')
    || text.includes('lifecycle_candidate')
  ) {
    return 'review_required';
  }
  return module ? 'cleared_by_boundary' : null;
}

function moduleAuditVisibility(module: JsonRecord | null, proofStatus: string) {
  const explicit = optionalString(module?.audit_visibility);
  if (explicit) {
    return explicit;
  }
  if (!module) {
    return null;
  }
  if (proofStatus.startsWith('blocked') || moduleSemanticEquivalenceStatus(module) === 'review_required') {
    return 'attention_required';
  }
  return 'hidden_by_default';
}

function buildActiveCallerTargetProof(descriptor: JsonRecord) {
  const surfaceIds = unique([
    ...GENERATED_SURFACES.map((surface) => surface.surface_id),
    ...handoffSurfacesFromDescriptor(descriptor)
      .map((surface) => optionalString(surface.surface_id))
      .filter((entry): entry is string => Boolean(entry)),
  ]);
  const surfaceTargets = surfaceIds.map((surfaceId) => {
    const surface = handoffSurfaceFor(descriptor, surfaceId);
    const module = proofModuleForSurface(descriptor, surfaceId, surface);
    const proofStatus = generatedSurfaceProofStatus(surface, module);
    return {
      surface_id: surfaceId,
      proof_status: proofStatus,
      target_kind: generatedSurfaceTargetKind(surface, module),
      generated_surface_owner:
        optionalString(surface?.owner)
        ?? optionalString(surface?.generated_surface_owner)
        ?? 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      current_role: optionalString(surface?.current_role),
      target_role: optionalString(surface?.target_role),
      current_paths: currentPathsFromHandoff(surface),
      active_caller_module_id: optionalString(module?.module_id),
      active_callers: stringList(module?.active_callers),
      active_caller_status: optionalString(module?.active_caller_status),
      migration_action: optionalString(module?.migration_action),
      current_surface_refs: stringList(module?.current_surface_refs),
      expected_opl_primitives: stringList(module?.expected_opl_primitives),
      retained_domain_authority: stringList(module?.retained_domain_authority),
      retention_reason: optionalString(module?.retention_reason),
      cannot_absorb_reason: optionalString(module?.cannot_absorb_reason),
      audit_visibility: moduleAuditVisibility(module, proofStatus),
      audit_reason: optionalString(module?.audit_reason),
      semantic_equivalence_status: moduleSemanticEquivalenceStatus(module),
      semantic_equivalence_reason: optionalString(module?.semantic_equivalence_reason),
      bridge_exit_gate: isRecord(module?.bridge_exit_gate) ? module.bridge_exit_gate : null,
    };
  });
  const isBlockedTarget = (target: JsonRecord) => (
    (optionalString(target.proof_status)?.startsWith('blocked') ?? false)
    || !generatedSurfaceTargetAllowed(optionalString(target.target_kind) ?? '')
  );
  const readySurfaceIds = new Set(surfaceTargets
    .filter((target) => !isBlockedTarget(target))
    .map((target) => target.surface_id));
  const blocked = surfaceTargets.filter((target) => isBlockedTarget(target));
  return {
    surface_kind: 'opl_generated_surface_active_caller_target_proof',
    status: blocked.length === 0 ? 'ready' : 'blocked',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    source_surfaces: ['generated_surface_handoff', 'functional_privatization_audit'],
    ready_target_count: surfaceTargets.length - blocked.length,
    blocked_target_count: blocked.length,
    allowed_target_kinds: [
      'opl_generated_surface',
      'opl_hosted_surface',
      'domain_handler_target',
      'refs_only_domain_adapter_target',
    ],
    surface_targets: surfaceTargets,
    authority_boundary: {
      opl_can_generate_domain_handler: false,
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_mutate_artifacts: false,
      domain_handler_target_allowed: true,
      refs_only_domain_adapter_target_allowed: true,
    },
  };
}

function buildProductSessionDescriptor(stageControlPlane: FamilyStageControlPlane | null) {
  return {
    surface_kind: 'opl_generated_product_session_descriptor',
    owner: 'one-person-lab',
    status: stageControlPlane ? 'ready_from_stage_control_plane' : 'blocked_missing_family_stage_control_plane',
    descriptor_source_surfaces: ['family_stage_control_plane', 'session_continuity_or_stage_routes'],
    session_routes: buildStageRoutes(stageControlPlane),
    authority_boundary: {
      product_session_can_write_domain_truth: false,
      product_session_can_authorize_quality_or_export: false,
      product_session_routes_to_domain_owner_receipts: true,
    },
  };
}

function buildProductSessionDescriptorFromDescriptor(
  descriptor: JsonRecord,
  stageControlPlane: FamilyStageControlPlane | null,
) {
  const sessionContinuity = descriptorRecord(descriptor, 'session_continuity_contract');
  const sessionSurface = sessionContinuity ? descriptorRecord(sessionContinuity, 'entry_surface') : null;
  const restoreSurface = sessionContinuity ? descriptorRecord(sessionContinuity, 'restore_surface') : null;
  return {
    ...buildProductSessionDescriptor(stageControlPlane),
    status:
      sessionContinuity || stageControlPlane
        ? 'ready_from_session_continuity_or_stage_control_plane'
        : 'blocked_missing_session_continuity_and_stage_control_plane',
    descriptor_source_surfaces: ['session_continuity', 'family_stage_control_plane'],
    session_continuity_status: optionalString(sessionContinuity?.status),
    entry_surface: sessionSurface,
    restore_surface: restoreSurface,
  };
}

function buildDomainHandlerDescriptorBlock(catalog: FamilyActionCatalog | null, descriptor: JsonRecord) {
  const descriptors = buildDomainHandlerDescriptors(catalog);
  const handoff = handoffSurfaceFor(descriptor, 'domain_handler');
  return {
    surface_kind: 'opl_generated_domain_handler_descriptor',
    owner: 'one-person-lab',
    status:
      descriptors.length > 0 || handoff
        ? 'ready'
        : catalog
          ? 'ready_no_domain_handler_actions_declared'
          : 'blocked_missing_family_action_catalog',
    descriptor_source_surfaces: ['family_action_catalog', 'generated_surface_handoff'],
    descriptors,
    handoff_surface: handoff,
    authority_boundary: {
      domain_handler_descriptor_can_write_domain_truth: false,
      domain_handler_descriptor_can_mutate_artifacts: false,
      domain_handler_dispatch_returns_domain_owner_receipt_or_typed_blocker: true,
    },
  };
}

function buildWorkbenchDescriptorBlock(
  catalog: FamilyActionCatalog | null,
  stageControlPlane: FamilyStageControlPlane | null,
  descriptor: JsonRecord,
) {
  return {
    surface_kind: 'opl_hosted_workbench_descriptor',
    owner: 'one-person-lab',
    status: stageControlPlane ? 'ready_from_stage_control_plane' : 'blocked_missing_family_stage_control_plane',
    descriptor_source_surfaces: ['family_stage_control_plane', 'domain_memory_descriptor', 'runtime_surfaces'],
    source_of_work_lineage: buildSourceOfWorkLineage(catalog, stageControlPlane),
    default_source_of_work: defaultSourceOfWork(catalog, stageControlPlane),
    source_of_work_consumption_policy:
      'workbench_consumes_generated_surface_lineage_and_stage_routes_without_claiming_domain_ready',
    handoff_surface: handoffSurfaceFor(descriptor, 'workbench_drilldown'),
    stage_routes: buildStageRoutes(stageControlPlane),
    authority_boundary: {
      workbench_can_write_domain_truth: false,
      workbench_can_write_memory_body: false,
      workbench_can_authorize_quality_or_export: false,
      workbench_reads_refs_only: true,
    },
  };
}

function formatDescriptorBlock(
  catalog: FamilyActionCatalog | null,
  format: GeneratedInterfaceFormat,
) {
  if (!catalog) {
    return {
      format,
      owner: 'one-person-lab',
      status: 'blocked_missing_family_action_catalog',
      descriptors: [],
    };
  }
  if (format === 'product-entry') {
    return {
      format,
      owner: 'one-person-lab',
      status: 'ready',
      descriptors: buildProductEntryDescriptors(catalog),
    };
  }
  return {
    format,
    owner: 'one-person-lab',
    status: 'ready',
    descriptors: projectFamilyActionCatalog(catalog, format),
  };
}

function buildActiveCallerCutoverProof(
  descriptor: JsonRecord,
  compilerStatus: string,
  generatedBlocksReady: boolean,
  generatedBlockKeys: string[],
  targetProof: ReturnType<typeof buildActiveCallerTargetProof>,
) {
  const blockerReasons = Array.isArray(descriptor.blocker_reasons)
    ? descriptor.blocker_reasons.filter((reason): reason is string => typeof reason === 'string')
    : [];
  const targetDomainId = optionalString(descriptor.target_domain_id)
    ?? optionalString(descriptor.project_id)
    ?? 'unknown';
  const ready = compilerStatus === 'ready' && generatedBlocksReady && targetProof.status === 'ready';
  return {
    surface_kind: 'opl_generated_surface_active_caller_cutover_proof',
    status: ready
      ? 'cutover_to_opl_generated_or_domain_handler_targets'
      : 'blocked',
    generated_surface_owner: 'one-person-lab',
    target_domain_id: targetDomainId,
    generated_blocks_ready: generatedBlocksReady,
    generated_block_keys: generatedBlockKeys,
    active_caller_target_proof_status: targetProof.status,
    blocked_target_count: targetProof.blocked_target_count,
    blocked_surface_ids: targetProof.surface_targets
      .filter((target) => (
        target.proof_status.startsWith('blocked')
        || !generatedSurfaceTargetAllowed(optionalString(target.target_kind) ?? '')
      ))
      .map((target) => target.surface_id),
    blocker_reasons: blockerReasons,
    domain_handler_targets_only: ready,
    domain_handler_target_policy: 'Generated descriptors route to domain action handler targets by receipt contract.',
    scope: 'generated_interface_and_domain_handler_target_proof_only_not_live_soak_or_domain_ready',
    claims_live_soak_complete: false,
    claims_domain_ready: false,
    forbidden_generated_authority: [
      'domain_truth_write',
      'memory_body_write',
      'quality_or_export_verdict',
      'artifact_mutation',
    ],
    authority_boundary_ref: 'generated_agent_interfaces.authority_boundary',
  };
}

type ActiveCallerSurfaceTarget = ReturnType<typeof buildActiveCallerTargetProof>['surface_targets'][number];

function buildGeneratedWrapperBundle(
  blocks: JsonRecord,
  generatedBlocksReady: boolean,
  targetProof: ReturnType<typeof buildActiveCallerTargetProof>,
) {
  const targetBySurface = new Map(
    targetProof.surface_targets.map((target) => [target.surface_id, target]),
  );
  const descriptorScope = GENERATED_WRAPPER_DESCRIPTOR_SCOPE.map((scope) => {
    const block = isRecord(blocks[scope.block_key]) ? blocks[scope.block_key] as JsonRecord : null;
    const canonicalTargetSurfaceIds =
      GENERATED_WRAPPER_CANONICAL_TARGET_IDS[scope.surface_id] ?? [scope.target_surface_id];
    const candidateTargets = canonicalTargetSurfaceIds
      .map((targetSurfaceId) => targetBySurface.get(targetSurfaceId))
      .filter((target): target is ActiveCallerSurfaceTarget => Boolean(target));
    const readyTargets = candidateTargets.filter((target) => (
      !optionalString(target.proof_status)?.startsWith('blocked')
      && generatedSurfaceTargetAllowed(optionalString(target.target_kind) ?? '')
    ));
    const target = readyTargets.find((candidate) => (
      optionalString(candidate.active_caller_module_id)
      || stringList(candidate.current_surface_refs).length > 0
      || isRecord(candidate.bridge_exit_gate)
    ))
      ?? readyTargets[0]
      ?? candidateTargets[0];
    const status = optionalString(block?.status);
    const targetStatus = optionalString(target?.proof_status);
    const targetKind = optionalString(target?.target_kind);
    const blockers = [
      blockStatusIsReady(status) ? null : `blocked_descriptor:${scope.surface_id}`,
      targetStatus?.startsWith('blocked') ? `blocked_target:${scope.surface_id}` : null,
      !targetKind || generatedSurfaceTargetAllowed(targetKind) ? null : `unsupported_target:${scope.surface_id}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      surface_id: scope.surface_id,
      descriptor_kind: scope.descriptor_kind,
      owner: 'one-person-lab',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      domain_repo_role: 'domain_handler_target_or_refs_only_adapter',
      status: blockers.length === 0 ? 'ready' : 'blocked',
      blockers,
      block_key: scope.block_key,
      descriptor_status: status,
      active_caller_target_kind: targetKind,
      active_caller_proof_status: targetStatus,
      active_caller_module_id: optionalString(target?.active_caller_module_id),
      canonical_target_surface_ids: canonicalTargetSurfaceIds,
      target_boundary: {
        allowed_target_kinds: [
          'domain_handler_target',
          'refs_only_domain_adapter_target',
          'opl_generated_surface',
          'opl_hosted_surface',
        ],
        domain_handler_target_allowed: true,
        refs_only_domain_adapter_target_allowed: true,
      },
    };
  });
  const blockers = descriptorScope.flatMap((scope) => scope.blockers);
  return {
    surface_kind: 'opl_generated_hosted_wrapper_bundle_descriptor',
    version: 'opl-generated-hosted-wrapper-bundle.v1',
    owner: 'one-person-lab',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    domain_repo_declared_as_generated_wrapper_owner: false,
    status:
      generatedBlocksReady && targetProof.status === 'ready' && blockers.length === 0
        ? 'ready'
        : 'blocked',
    blockers,
    descriptor_scope: descriptorScope,
    descriptor_scope_ids: descriptorScope.map((scope) => scope.surface_id),
    descriptor_owner_policy: 'OPL owns generated and hosted wrapper descriptors; domain repos declare pack inputs and expose handler targets or refs-only adapters.',
    domain_repo_role_policy: 'domain_handler_target_or_refs_only_adapter',
    scope_claim:
      'generated_hosted_descriptor_ownership_only_not_live_soak_domain_ready_or_artifact_owner_receipt',
    claims_live_soak_complete: false,
    claims_domain_ready: false,
    claims_artifact_producing_owner_receipt: false,
    authority_boundary: {
      generated_wrapper_can_write_domain_truth: false,
      generated_wrapper_can_write_memory_body: false,
      generated_wrapper_can_authorize_quality_or_export: false,
      generated_wrapper_can_mutate_artifacts: false,
      generated_wrapper_routes_to_domain_handler_or_refs_only_adapter: true,
    },
  };
}

export function buildGeneratedInterfaceBundle(
  descriptor: JsonRecord,
  compilerStatus: string,
  selectedFormat: GeneratedInterfaceFormat | 'all' = 'all',
) {
  const catalog = rawDescriptorSurface<FamilyActionCatalog>(descriptor, 'family_action_catalog');
  const stageControlPlane = rawDescriptorSurface<FamilyStageControlPlane>(descriptor, 'family_stage_control_plane');
  const formats: GeneratedInterfaceFormat[] = ['cli', 'mcp', 'skill', 'product-entry', 'openai', 'ai-sdk'];
  const include = (format: GeneratedInterfaceFormat) => selectedFormat === 'all' || selectedFormat === format;
  const block = (format: GeneratedInterfaceFormat) => formatDescriptorBlock(catalog, format);
  const blocks = Object.fromEntries(
    formats
      .filter(include)
      .map((format) => [
        format === 'product-entry'
          ? 'product_entry'
          : format === 'openai'
            ? 'openai_tool'
            : format === 'ai-sdk'
              ? 'ai_sdk'
              : format,
        block(format),
      ])
  );
  const generatedBlockKeys = Object.keys(blocks);
  const generatedBlocksReady = generatedBlockKeys.every((key) => {
    const value = blocks[key];
    return isRecord(value) && optionalString(value.status) === 'ready';
  });
  const activeCallerTargetProof = buildActiveCallerTargetProof(descriptor);
  const productStatus = {
    surface_kind: 'opl_generated_product_status_descriptor',
    owner: 'one-person-lab',
    status: catalog ? 'ready_from_family_action_catalog' : 'blocked_missing_family_action_catalog',
    descriptor_source_surfaces: ['family_action_catalog', 'runtime_surfaces'],
    source_of_work_lineage: buildSourceOfWorkLineage(catalog, stageControlPlane),
    default_source_of_work: defaultSourceOfWork(catalog, stageControlPlane),
    source_of_work_consumption_policy:
      'status_read_model_consumes_generated_surface_lineage_without_claiming_domain_ready',
    descriptors: buildProductStatusDescriptors(catalog),
    authority_boundary: {
      product_status_can_write_domain_truth: false,
      product_status_can_authorize_quality_or_export: false,
      product_status_reads_refs_only: true,
    },
  };
  const productSession = buildProductSessionDescriptorFromDescriptor(descriptor, stageControlPlane);
  const domainHandler = buildDomainHandlerDescriptorBlock(catalog, descriptor);
  const workbench = buildWorkbenchDescriptorBlock(catalog, stageControlPlane, descriptor);
  const generatedDefaultEntryNoResurrectionGate = buildGeneratedDefaultEntryNoResurrectionGate(
    catalog,
    stageControlPlane,
  );
  const wrapperBlocks = {
    ...blocks,
    product_status: productStatus,
    product_session: productSession,
    domain_handler: domainHandler,
    workbench,
  };
  const generatedDirectParity = buildGeneratedDirectParityProof(catalog, blocks, activeCallerTargetProof);

  return {
    surface_kind: 'opl_generated_agent_interface_bundle',
    version: 'opl-generated-agent-interface-bundle.v1',
    owner: 'one-person-lab',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    status: compilerStatus,
    selected_format: selectedFormat,
    project_id: optionalString(descriptor.project_id),
    target_domain_id: optionalString(descriptor.target_domain_id),
    agent_id: optionalString(descriptor.agent_id),
    generated_from: GENERATED_INTERFACE_SOURCE_REFS,
    default_entry_policy: buildDefaultEntryPolicy(),
    supported_derived_surfaces: buildSupportedDerivedSurfaces(),
    source_of_work_lineage: buildSourceOfWorkLineage(catalog, stageControlPlane),
    generated_default_entry_no_resurrection_gate: generatedDefaultEntryNoResurrectionGate,
    ...blocks,
    active_caller_cutover_proof: buildActiveCallerCutoverProof(
      descriptor,
      compilerStatus,
      generatedBlocksReady,
      generatedBlockKeys,
      activeCallerTargetProof,
    ),
    generated_wrapper_bundle: buildGeneratedWrapperBundle(wrapperBlocks, generatedBlocksReady, activeCallerTargetProof),
    product_status: productStatus,
    product_session: productSession,
    domain_handler: domainHandler,
    workbench,
    active_caller_target_proof: activeCallerTargetProof,
    stage_routes: include('product-entry') || selectedFormat === 'all'
      ? buildStageRoutes(stageControlPlane)
      : [],
    parity: catalog ? buildFamilyActionCatalogParity(catalog) : null,
    generated_direct_parity: generatedDirectParity,
    authority_boundary: {
      generated_interface_can_write_domain_truth: false,
      generated_interface_can_write_memory_body: false,
      generated_interface_can_authorize_quality_or_export: false,
      generated_interface_can_mutate_artifacts: false,
      generated_interface_routes_to_minimal_authority_functions_by_receipt_contract: true,
      provider_completion_is_domain_ready: false,
    },
    source_contract_consumption: descriptorRecord(descriptor, 'source_contract_consumption'),
  };
}

export function selectGeneratedInterfaceBundleFormat(
  bundle: JsonRecord,
  selectedFormat: GeneratedInterfaceFormat | 'all',
) {
  if (selectedFormat === 'all') {
    return bundle;
  }
  const selectedKey =
    selectedFormat === 'product-entry'
      ? 'product_entry'
      : selectedFormat === 'openai'
        ? 'openai_tool'
        : selectedFormat === 'ai-sdk'
          ? 'ai_sdk'
          : selectedFormat;
  const selectedBlock = bundle[selectedKey];
  return {
    surface_kind: bundle.surface_kind,
    version: bundle.version,
    owner: bundle.owner,
    generated_surface_owner: bundle.generated_surface_owner,
    domain_repo_can_own_generated_surface: bundle.domain_repo_can_own_generated_surface,
    status: bundle.status,
    selected_format: selectedFormat,
    project_id: bundle.project_id,
    target_domain_id: bundle.target_domain_id,
    agent_id: bundle.agent_id,
    generated_from: bundle.generated_from,
    default_entry_policy: bundle.default_entry_policy,
    supported_derived_surfaces: bundle.supported_derived_surfaces,
    source_of_work_lineage: bundle.source_of_work_lineage,
    generated_default_entry_no_resurrection_gate: bundle.generated_default_entry_no_resurrection_gate,
    [selectedKey]: selectedBlock,
    product_status: bundle.product_status,
    product_session: bundle.product_session,
    domain_handler: bundle.domain_handler,
    workbench: bundle.workbench,
    generated_wrapper_bundle: bundle.generated_wrapper_bundle,
    active_caller_cutover_proof: bundle.active_caller_cutover_proof,
    active_caller_target_proof: bundle.active_caller_target_proof,
    stage_routes: selectedFormat === 'product-entry' ? bundle.stage_routes : [],
    parity: bundle.parity,
    generated_direct_parity: bundle.generated_direct_parity,
    authority_boundary: bundle.authority_boundary,
    source_contract_consumption: bundle.source_contract_consumption,
  };
}
