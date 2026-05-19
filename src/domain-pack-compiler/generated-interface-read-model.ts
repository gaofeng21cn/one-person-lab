import {
  buildFamilyActionCatalogParity,
  projectFamilyActionCatalog,
} from '../family-action-catalog.ts';
import type {
  FamilyActionCatalog,
  FamilyActionExportFormat,
} from '../family-action-catalog-contract.ts';
import type { FamilyStageControlPlane } from '../family-stage-control-plane-contract.ts';

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
  'sidecar_descriptor',
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
    surface_id: 'sidecar_export_dispatch',
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
    surface_id: 'sidecar',
    block_key: 'sidecar',
    target_surface_id: 'sidecar',
    descriptor_kind: 'opl_generated_sidecar_descriptor',
  },
  {
    surface_id: 'workbench',
    block_key: 'workbench',
    target_surface_id: 'workbench',
    descriptor_kind: 'opl_hosted_workbench_descriptor',
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
  return stageControlPlane?.stages.map((stage) => ({
    stage_id: stage.stage_id,
    allowed_action_refs: stage.allowed_action_refs,
    authority_owner: stage.owner,
  })) ?? [];
}

function buildProductEntryDescriptors(catalog: FamilyActionCatalog) {
  return catalog.actions.map((action) => ({
    action_key: action.supported_surfaces.product_entry?.action_key ?? action.action_id,
    command: action.supported_surfaces.product_entry?.command ?? action.source_command.command,
    surface_kind: action.supported_surfaces.product_entry?.surface_kind ?? action.source_command.surface_kind,
    summary: action.summary,
    requires: action.workspace_locator_fields,
    effect: action.effect,
  }));
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
    }));
}

function buildSidecarDescriptors(catalog: FamilyActionCatalog | null) {
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
      return surfaceKinds.some((surfaceKind) => surfaceKind.includes('sidecar'));
    })
    .map((action) => ({
      action_id: action.action_id,
      command: action.supported_surfaces.product_entry?.command ?? action.source_command.command,
      surface_kind: action.supported_surfaces.product_entry?.surface_kind ?? action.source_command.surface_kind,
      summary: action.summary,
      effect: action.effect,
      authority_boundary: action.authority_boundary ?? null,
    }));
}

function generatedSurfaceAliases(surfaceId: string) {
  const aliases: Record<string, string[]> = {
    cli: ['cli', 'command'],
    mcp: ['mcp'],
    skill: ['skill'],
    product_entry_manifest: ['product_entry_manifest', 'product_entry', 'product'],
    sidecar_export_dispatch: ['sidecar_export_dispatch', 'sidecar_export', 'sidecar_dispatch', 'sidecar'],
    status_read_model: ['status_read_model', 'product_status', 'status', 'study_progress'],
    workbench_drilldown: ['workbench_drilldown', 'workbench', 'portal', 'cockpit'],
    functional_harness_cases: ['functional_harness_cases', 'test_lane_harness', 'harness'],
    product_session: ['product_session', 'session_continuity', 'session'],
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

function proofModuleForSurface(descriptor: JsonRecord, surfaceId: string, surface: JsonRecord | null) {
  const audit = isRecord(descriptor.functional_privatization_audit)
    ? descriptor.functional_privatization_audit
    : null;
  const modules = recordList(audit?.modules);
  const aliases = generatedSurfaceAliases(surfaceId);
  const currentPaths = currentPathsFromHandoff(surface);
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
    return {
      surface_id: surfaceId,
      proof_status: generatedSurfaceProofStatus(surface, module),
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
      retained_domain_authority: stringList(module?.retained_domain_authority),
    };
  });
  const isBlockedTarget = (target: JsonRecord) => (
    (optionalString(target.proof_status)?.startsWith('blocked') ?? false)
    || !generatedSurfaceTargetAllowed(optionalString(target.target_kind) ?? '')
  );
  const blocked = surfaceTargets.filter(isBlockedTarget);
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

function buildSidecarDescriptorBlock(catalog: FamilyActionCatalog | null, descriptor: JsonRecord) {
  const descriptors = buildSidecarDescriptors(catalog);
  const handoff = handoffSurfaceFor(descriptor, 'sidecar_export_dispatch');
  return {
    surface_kind: 'opl_generated_sidecar_descriptor',
    owner: 'one-person-lab',
    status:
      descriptors.length > 0 || handoff
        ? 'ready'
        : catalog
          ? 'ready_no_sidecar_actions_declared'
          : 'blocked_missing_family_action_catalog',
    descriptor_source_surfaces: ['family_action_catalog', 'generated_surface_handoff'],
    descriptors,
    handoff_surface: handoff,
    authority_boundary: {
      sidecar_descriptor_can_write_domain_truth: false,
      sidecar_descriptor_can_mutate_artifacts: false,
      sidecar_dispatch_returns_domain_owner_receipt_or_typed_blocker: true,
    },
  };
}

function buildWorkbenchDescriptorBlock(stageControlPlane: FamilyStageControlPlane | null, descriptor: JsonRecord) {
  return {
    surface_kind: 'opl_hosted_workbench_descriptor',
    owner: 'one-person-lab',
    status: stageControlPlane ? 'ready_from_stage_control_plane' : 'blocked_missing_family_stage_control_plane',
    descriptor_source_surfaces: ['family_stage_control_plane', 'domain_memory_descriptor', 'runtime_surfaces'],
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
    const target = targetBySurface.get(scope.target_surface_id);
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
    descriptors: buildProductStatusDescriptors(catalog),
    authority_boundary: {
      product_status_can_write_domain_truth: false,
      product_status_can_authorize_quality_or_export: false,
      product_status_reads_refs_only: true,
    },
  };
  const productSession = buildProductSessionDescriptorFromDescriptor(descriptor, stageControlPlane);
  const sidecar = buildSidecarDescriptorBlock(catalog, descriptor);
  const workbench = buildWorkbenchDescriptorBlock(stageControlPlane, descriptor);
  const wrapperBlocks = {
    ...blocks,
    product_status: productStatus,
    product_session: productSession,
    sidecar,
    workbench,
  };

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
    sidecar,
    workbench,
    active_caller_target_proof: activeCallerTargetProof,
    stage_routes: include('product-entry') || selectedFormat === 'all'
      ? buildStageRoutes(stageControlPlane)
      : [],
    parity: catalog ? buildFamilyActionCatalogParity(catalog) : null,
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
    [selectedKey]: selectedBlock,
    product_status: bundle.product_status,
    product_session: bundle.product_session,
    sidecar: bundle.sidecar,
    workbench: bundle.workbench,
    generated_wrapper_bundle: bundle.generated_wrapper_bundle,
    active_caller_cutover_proof: bundle.active_caller_cutover_proof,
    active_caller_target_proof: bundle.active_caller_target_proof,
    stage_routes: selectedFormat === 'product-entry' ? bundle.stage_routes : [],
    parity: bundle.parity,
    authority_boundary: bundle.authority_boundary,
    source_contract_consumption: bundle.source_contract_consumption,
  };
}
