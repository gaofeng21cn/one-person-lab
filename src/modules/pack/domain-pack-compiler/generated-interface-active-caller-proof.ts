import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  recordList,
  stringList,
  uniqueStringList,
} from '../../../kernel/json-record.ts';
import { optionalString } from '../../../kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

type GeneratedSurface = {
  surface_id: string;
};

function unique(values: string[]) {
  return uniqueStringList(values);
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

export function handoffSurfaceFor(descriptor: JsonRecord, surfaceId: string) {
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

export function generatedSurfaceTargetAllowed(targetKind: string) {
  return [
    'opl_generated_surface',
    'opl_hosted_surface',
    'domain_handler_target',
    'refs_only_domain_adapter_target',
  ].includes(targetKind);
}

export function blockStatusIsReady(status: string | null) {
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

export function buildActiveCallerTargetProof(descriptor: JsonRecord, generatedSurfaces: readonly GeneratedSurface[]) {
  const surfaceIds = unique([
    ...generatedSurfaces.map((surface) => surface.surface_id),
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
