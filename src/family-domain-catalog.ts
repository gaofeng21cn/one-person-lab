import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { getActiveWorkspaceBinding, type WorkspaceBinding } from './workspace-registry.ts';

type BuildFamilyDomainCatalogOptions = {
  resolveActiveWorkspaceBinding?: (projectId: string) => WorkspaceBinding | null;
};

type SkillActivationShellCommand = {
  command: string | null;
  target_surface_kind: string | null;
};

type SkillActivationProjection = {
  skill_id: string | null;
  title: string | null;
  description: string | null;
  target_surface_kind: string | null;
  plugin_name: string | null;
  skill_semantics: string | null;
  activation_kind: string | null;
  entry_shell_key: string | null;
  entry_command: string | null;
  supporting_shell_keys: string[];
  shell_commands: Record<string, SkillActivationShellCommand>;
  runtime_continuity: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasResolvedCommand(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => typeof entry === 'string');
}

function readSkillActivationShellCommands(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const shellCommands: Record<string, SkillActivationShellCommand> = {};
  for (const [shellKey, descriptor] of Object.entries(value)) {
    const normalizedShellKey = normalizeOptionalString(shellKey);
    if (!normalizedShellKey) {
      continue;
    }
    if (typeof descriptor === 'string') {
      shellCommands[normalizedShellKey] = {
        command: descriptor.trim().length > 0 ? descriptor : null,
        target_surface_kind: null,
      };
      continue;
    }
    if (!isRecord(descriptor)) {
      continue;
    }
    shellCommands[normalizedShellKey] = {
      command: normalizeOptionalString(descriptor.command),
      target_surface_kind: normalizeOptionalString(descriptor.target_surface_kind),
    };
  }

  return Object.keys(shellCommands).length > 0 ? shellCommands : null;
}

function buildManifestShellCommands(manifest: DomainManifestCatalogEntry['manifest']) {
  const shellCommands: Record<string, SkillActivationShellCommand> = {};
  const pushShellCommand = (shellKey: unknown, descriptor: unknown) => {
    const normalizedShellKey = normalizeOptionalString(shellKey);
    if (!normalizedShellKey || !isRecord(descriptor)) {
      return;
    }
    const command = normalizeOptionalString(descriptor.command);
    const targetSurfaceKind = normalizeOptionalString(descriptor.surface_kind);
    if (!command && !targetSurfaceKind) {
      return;
    }
    shellCommands[normalizedShellKey] = {
      command,
      target_surface_kind: targetSurfaceKind,
    };
  };

  pushShellCommand(manifest?.frontdoor_surface?.shell_key, manifest?.frontdoor_surface);
  pushShellCommand(manifest?.operator_loop_surface?.shell_key, manifest?.operator_loop_surface);
  for (const [shellKey, descriptor] of Object.entries(manifest?.product_entry_shell ?? {})) {
    pushShellCommand(shellKey, descriptor);
  }
  const recommendedShell = normalizeOptionalString(manifest?.recommended_shell);
  const recommendedCommand = normalizeOptionalString(manifest?.recommended_command);
  if (
    recommendedShell
    && recommendedCommand
    && !Object.prototype.hasOwnProperty.call(shellCommands, recommendedShell)
  ) {
    shellCommands[recommendedShell] = {
      command: recommendedCommand,
      target_surface_kind: null,
    };
  }

  return shellCommands;
}

function pickManifestPhaseId(repoMainline: Record<string, unknown> | null) {
  if (!repoMainline) {
    return null;
  }

  return [
    repoMainline.phase_id,
    repoMainline.current_program_phase_id,
    repoMainline.active_phase,
  ].find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function pickManifestTrancheId(repoMainline: Record<string, unknown> | null) {
  if (!repoMainline) {
    return null;
  }

  return [
    repoMainline.tranche_id,
    repoMainline.current_stage_id,
    repoMainline.active_tranche,
  ].find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function resolveActiveBinding(
  projectId: string,
  options: BuildFamilyDomainCatalogOptions,
) {
  return (options.resolveActiveWorkspaceBinding ?? getActiveWorkspaceBinding)(projectId);
}

function hasDomainAgentEntrySpec(manifest: DomainManifestCatalogEntry['manifest']) {
  const spec = manifest?.domain_entry_contract?.domain_agent_entry_spec;
  return Boolean(
    spec
      && typeof spec.agent_id === 'string'
      && spec.agent_id.trim().length > 0
      && typeof spec.title === 'string'
      && spec.title.trim().length > 0
      && typeof spec.entry_command === 'string'
      && spec.entry_command.trim().length > 0
      && typeof spec.manifest_command === 'string'
      && spec.manifest_command.trim().length > 0,
  );
}

function pickSkillRuntimeContinuity(manifest: DomainManifestCatalogEntry['manifest']) {
  return pickSkillActivationProjection(manifest)?.runtime_continuity ?? null;
}

export function pickSkillActivationProjection(manifest: DomainManifestCatalogEntry['manifest']) {
  const skills = Array.isArray(manifest?.skill_catalog?.skills) ? manifest.skill_catalog.skills : [];
  const manifestShellCommands = buildManifestShellCommands(manifest);
  const frontdoorSurfaceKind = normalizeOptionalString(manifest?.frontdoor_surface?.surface_kind);
  const frontdoorCommand = normalizeOptionalString(manifest?.frontdoor_surface?.command);
  const recommendedCommand = normalizeOptionalString(manifest?.recommended_command);
  let bestProjection: SkillActivationProjection | null = null;
  let bestScore = -1;

  for (const skill of skills) {
    if (!isRecord(skill)) {
      continue;
    }
    const domainProjection = isRecord(skill.domain_projection) ? skill.domain_projection : null;
    const runtimeContinuity = domainProjection && isRecord(domainProjection.runtime_continuity)
      ? domainProjection.runtime_continuity
      : null;
    const activationSurface = domainProjection && isRecord(domainProjection.skill_activation)
      ? domainProjection.skill_activation
      : domainProjection;
    const shellCommands =
      readSkillActivationShellCommands(activationSurface?.shell_commands)
      ?? manifestShellCommands;
    const entryShellKey = normalizeOptionalString(activationSurface?.entry_shell_key)
      ?? normalizeOptionalString(activationSurface?.skill_entry)
      ?? normalizeOptionalString(activationSurface?.recommended_shell);
    const entryCommand = normalizeOptionalString(activationSurface?.entry_command)
      ?? normalizeOptionalString(skill.command)
      ?? (entryShellKey ? shellCommands[entryShellKey]?.command ?? null : null)
      ?? frontdoorCommand
      ?? recommendedCommand;
    const supportingShellKeys = [...new Set([
      ...readStringList(activationSurface?.supporting_shell_keys),
      ...Object.keys(shellCommands).filter((shellKey) => shellKey !== entryShellKey),
    ])];
    const hasActivationHints = Boolean(
      normalizeOptionalString(activationSurface?.plugin_name)
      || normalizeOptionalString(activationSurface?.skill_semantics)
      || normalizeOptionalString(activationSurface?.activation_kind)
      || entryShellKey
      || normalizeOptionalString(activationSurface?.entry_command)
      || readStringList(activationSurface?.supporting_shell_keys).length > 0
      || Object.keys(shellCommands).length > 0,
    );
    const targetSurfaceKind = normalizeOptionalString(skill.target_surface_kind);
    const score =
      (hasActivationHints ? 10 : 0)
      + (runtimeContinuity ? 5 : 0)
      + (targetSurfaceKind === frontdoorSurfaceKind || targetSurfaceKind === 'product_frontdoor' ? 3 : 0)
      + (entryCommand && entryCommand === frontdoorCommand ? 2 : 0)
      + (entryCommand && entryCommand === recommendedCommand ? 1 : 0);

    if (score <= 0 || score < bestScore) {
      continue;
    }

    bestProjection = {
      skill_id: normalizeOptionalString(skill.skill_id),
      title: normalizeOptionalString(skill.title),
      description: normalizeOptionalString(skill.description),
      target_surface_kind: targetSurfaceKind,
      plugin_name: normalizeOptionalString(activationSurface?.plugin_name),
      skill_semantics: normalizeOptionalString(activationSurface?.skill_semantics),
      activation_kind: normalizeOptionalString(activationSurface?.activation_kind)
        ?? (entryCommand ? 'shell_command' : null),
      entry_shell_key: entryShellKey,
      entry_command: entryCommand,
      supporting_shell_keys: supportingShellKeys,
      shell_commands: shellCommands,
      runtime_continuity: runtimeContinuity,
    };
    bestScore = score;
  }

  return bestProjection;
}

function hasSkillRuntimeContinuity(manifest: DomainManifestCatalogEntry['manifest']) {
  const runtimeContinuity = pickSkillRuntimeContinuity(manifest);
  return Boolean(
    runtimeContinuity
      && runtimeContinuity.surface_kind === 'skill_runtime_continuity'
      && hasResolvedCommand(runtimeContinuity.recommended_resume_command)
      && hasResolvedCommand(runtimeContinuity.recommended_progress_command)
      && hasResolvedCommand(runtimeContinuity.recommended_artifact_command)
      && typeof runtimeContinuity.runtime_owner === 'string'
      && runtimeContinuity.runtime_owner.trim().length > 0
      && typeof runtimeContinuity.domain_owner === 'string'
      && runtimeContinuity.domain_owner.trim().length > 0
      && typeof runtimeContinuity.session_locator_field === 'string'
      && runtimeContinuity.session_locator_field.trim().length > 0
      && typeof runtimeContinuity.session_surface_ref === 'string'
      && runtimeContinuity.session_surface_ref.trim().length > 0
      && typeof runtimeContinuity.progress_surface_ref === 'string'
      && runtimeContinuity.progress_surface_ref.trim().length > 0
      && typeof runtimeContinuity.artifact_surface_ref === 'string'
      && runtimeContinuity.artifact_surface_ref.trim().length > 0
      && typeof runtimeContinuity.restore_point_surface_ref === 'string'
      && runtimeContinuity.restore_point_surface_ref.trim().length > 0,
  );
}

export function buildDomainEntryParity(
  projects: DomainManifestCatalogEntry[],
  options: BuildFamilyDomainCatalogOptions = {},
) {
  const normalizedProjects = projects.map((entry) => {
    const manifest = entry.manifest;
    const binding = resolveActiveBinding(entry.project_id, options);
    const manifestResolved = entry.status === 'resolved' && manifest !== null;
    const directEntryLocatorReady = Boolean(binding?.direct_entry.command || binding?.direct_entry.url);
    const frontdoorSurfaceReady = Boolean(
      manifest?.frontdoor_surface?.surface_kind
      && hasResolvedCommand(manifest?.frontdoor_surface?.command),
    );
    const startSurfaceReady = Boolean(
      manifest?.product_entry_start?.surface_kind
      && Array.isArray(manifest?.product_entry_start?.modes)
      && manifest.product_entry_start.modes.length > 0,
    );
    const sharedHandoffReady = Boolean(
      manifest?.shared_handoff && Object.keys(manifest.shared_handoff).length > 0,
    );
    const domainEntryContractReady = Boolean(
      manifest?.domain_entry_contract?.entry_adapter
      && manifest?.domain_entry_contract?.service_safe_surface_kind
      && Array.isArray(manifest?.domain_entry_contract?.command_contracts)
      && manifest.domain_entry_contract.command_contracts.length > 0,
    );
    const domainAgentEntrySpecReady = hasDomainAgentEntrySpec(manifest);
    const gatewayInteractionContractReady = Boolean(
      manifest?.gateway_interaction_contract?.surface_kind === 'gateway_interaction_contract',
    );
    const runtimeInventoryReady = Boolean(manifest?.runtime_inventory?.surface_kind === 'runtime_inventory');
    const taskLifecycleReady = Boolean(manifest?.task_lifecycle?.surface_kind === 'task_lifecycle');
    const runtimeControlReady = Boolean(manifest?.runtime_control?.surface_kind === 'runtime_control');
    const sessionContinuityReady = Boolean(
      manifest?.session_continuity?.surface_kind === 'session_continuity',
    );
    const progressProjectionReady = Boolean(
      manifest?.progress_projection?.surface_kind === 'progress_projection',
    );
    const artifactInventoryReady = Boolean(
      manifest?.artifact_inventory?.surface_kind === 'artifact_inventory',
    );
    const skillCatalogReady = Boolean(manifest?.skill_catalog?.surface_kind === 'skill_catalog');
    const skillRuntimeContinuityReady = hasSkillRuntimeContinuity(manifest);
    const automationReady = Boolean(manifest?.automation?.surface_kind === 'automation');
    const readyForOplStart = Boolean(manifestResolved && startSurfaceReady);
    const readyForDomainHandoff = Boolean(
      manifestResolved
      && sharedHandoffReady
      && domainEntryContractReady
      && gatewayInteractionContractReady,
    );

    const gaps: string[] = [];
    if (!manifestResolved) {
      gaps.push('当前 active binding 尚未暴露 resolved product-entry manifest。');
    }
    if (manifestResolved && !directEntryLocatorReady) {
      gaps.push('当前 active binding 缺少 direct-entry locator（entry command 或 entry URL）。');
    }
    if (manifestResolved && !frontdoorSurfaceReady) {
      gaps.push('manifest 尚未暴露可直接消费的 frontdoor surface。');
    }
    if (manifestResolved && !startSurfaceReady) {
      gaps.push('manifest 尚未暴露可直接消费的 start surface。');
    }
    if (manifestResolved && !sharedHandoffReady) {
      gaps.push('manifest 尚未暴露 shared handoff surface。');
    }
    if (manifestResolved && !domainEntryContractReady) {
      gaps.push('manifest 尚未暴露显式 domain_entry_contract。');
    }
    if (manifestResolved && !domainAgentEntrySpecReady) {
      gaps.push('manifest 尚未暴露显式 domain_agent_entry_spec。');
    }
    if (manifestResolved && !gatewayInteractionContractReady) {
      gaps.push('manifest 尚未暴露显式 gateway_interaction_contract。');
    }
    if (manifestResolved && !runtimeInventoryReady) {
      gaps.push('manifest 尚未暴露 runtime_inventory surface。');
    }
    if (manifestResolved && !taskLifecycleReady) {
      gaps.push('manifest 尚未暴露 task_lifecycle surface。');
    }
    if (manifestResolved && !runtimeControlReady) {
      gaps.push('manifest 尚未暴露 runtime_control surface。');
    }
    if (manifestResolved && !sessionContinuityReady) {
      gaps.push('manifest 尚未暴露 session_continuity surface。');
    }
    if (manifestResolved && !progressProjectionReady) {
      gaps.push('manifest 尚未暴露 progress_projection surface。');
    }
    if (manifestResolved && !artifactInventoryReady) {
      gaps.push('manifest 尚未暴露 artifact_inventory surface。');
    }
    if (manifestResolved && !skillCatalogReady) {
      gaps.push('manifest 尚未暴露 skill_catalog surface。');
    }
    if (manifestResolved && skillCatalogReady && !skillRuntimeContinuityReady) {
      gaps.push('skill catalog 尚未暴露统一的 skill runtime continuity envelope。');
    }
    if (manifestResolved && !automationReady) {
      gaps.push('manifest 尚未暴露 automation surface。');
    }

    let entryParityStatus: 'aligned' | 'partial' | 'blocked' = 'blocked';
    if (
      manifestResolved
      && frontdoorSurfaceReady
      && startSurfaceReady
      && sharedHandoffReady
      && domainEntryContractReady
      && gatewayInteractionContractReady
    ) {
      entryParityStatus = directEntryLocatorReady ? 'aligned' : 'partial';
    } else if (manifestResolved) {
      entryParityStatus = 'partial';
    }

    const recommendedNextActions: string[] = [];
    if (!manifestResolved) {
      recommendedNextActions.push('先冻结并绑定 repo-tracked product-entry manifest。');
    }
    if (manifestResolved && !directEntryLocatorReady) {
      recommendedNextActions.push('给 active binding 补 entry_command 或 entry_url，让 OPL 可直接定位 domain frontdoor。');
    }
    if (manifestResolved && !frontdoorSurfaceReady) {
      recommendedNextActions.push('补齐 manifest.frontdoor_surface.command，让 frontdoor locator 与 manifest 一致。');
    }
    if (manifestResolved && !startSurfaceReady) {
      recommendedNextActions.push('补齐 product_entry_start surface，保持 OPL start 与 domain start 同口径。');
    }
    if (manifestResolved && !sharedHandoffReady) {
      recommendedNextActions.push('补齐 shared_handoff surface，让 OPL handoff 不再靠隐式约定。');
    }
    if (manifestResolved && !domainEntryContractReady) {
      recommendedNextActions.push('补齐 domain_entry_contract，让 repo-owned entry truth 进入统一 family contract。');
    }
    if (manifestResolved && !domainAgentEntrySpecReady) {
      recommendedNextActions.push('补齐 domain_agent_entry_spec，让 OPL launcher registry 与后续 projection 直接消费 repo-owned agent entry truth。');
    }
    if (manifestResolved && !gatewayInteractionContractReady) {
      recommendedNextActions.push('补齐 gateway_interaction_contract，让 frontdoor owner / handoff envelope 进入统一 family contract。');
    }
    if (manifestResolved && !runtimeInventoryReady) {
      recommendedNextActions.push('补齐 runtime_inventory surface，让 family runtime owner/availability/health truth 可直接复用。');
    }
    if (manifestResolved && !taskLifecycleReady) {
      recommendedNextActions.push('补齐 task_lifecycle surface，让 continuation 和 checkpoint truth 不再散落在 repo 私有字段里。');
    }
    if (manifestResolved && !runtimeControlReady) {
      recommendedNextActions.push('补齐 runtime_control surface，让 OPL 能直接读取 resume / approval / interrupt / artifact pickup control loop truth。');
    }
    if (manifestResolved && !sessionContinuityReady) {
      recommendedNextActions.push('补齐 session_continuity surface，让 OPL 能直接知道当前 session 属于哪个 domain agent、该怎么恢复。');
    }
    if (manifestResolved && !progressProjectionReady) {
      recommendedNextActions.push('补齐 progress_projection surface，让 OPL progress 面直接消费 repo-owned runtime narration。');
    }
    if (manifestResolved && !artifactInventoryReady) {
      recommendedNextActions.push('补齐 artifact_inventory surface，让 OPL artifacts 面直接消费 repo-owned artifact truth。');
    }
    if (manifestResolved && !skillCatalogReady) {
      recommendedNextActions.push('补齐 skill_catalog surface，让 family command/skill reuse 可以直接消费。');
    }
    if (manifestResolved && skillCatalogReady && !skillRuntimeContinuityReady) {
      recommendedNextActions.push('把 repo-owned session/progress/artifact/restore truth 收成 skill runtime continuity envelope，让 OPL activation/discovery 可以薄消费。');
    }
    if (manifestResolved && !automationReady) {
      recommendedNextActions.push('补齐 automation surface，让 automation/autopilot truth 能沿同一 manifest 暴露。');
    }

    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: binding?.binding_id ?? entry.binding_id,
      workspace_path: binding?.workspace_path ?? entry.workspace_path,
      entry_parity_status: entryParityStatus,
      manifest_status: entry.status,
      direct_entry_locator_status: directEntryLocatorReady ? 'ready' : 'missing',
      frontdoor_surface_status: frontdoorSurfaceReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      start_surface_status: startSurfaceReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      shared_handoff_status: sharedHandoffReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      domain_entry_contract_status: domainEntryContractReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      domain_agent_entry_spec_status: domainAgentEntrySpecReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      gateway_interaction_contract_status: gatewayInteractionContractReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      runtime_inventory_status: runtimeInventoryReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      task_lifecycle_status: taskLifecycleReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      runtime_control_status: runtimeControlReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      session_continuity_status: sessionContinuityReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      progress_projection_status: progressProjectionReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      artifact_inventory_status: artifactInventoryReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      skill_catalog_status: skillCatalogReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      skill_runtime_continuity_status:
        skillRuntimeContinuityReady ? 'ready' : skillCatalogReady ? 'missing' : manifestResolved ? 'blocked' : 'blocked',
      automation_status: automationReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      ready_for_opl_start: readyForOplStart,
      ready_for_domain_handoff: readyForDomainHandoff,
      product_entry_readiness_verdict: manifest?.product_entry_readiness?.verdict ?? null,
      recommended_start_command:
        manifest?.frontdoor_surface?.command
        ?? manifest?.recommended_command
        ?? manifest?.product_entry_preflight?.recommended_start_command
        ?? null,
      recommended_check_command: manifest?.product_entry_preflight?.recommended_check_command ?? null,
      gaps,
      recommended_next_actions: recommendedNextActions,
    };
  });

  return {
    surface_kind: 'opl_domain_entry_parity',
    summary: {
      total_projects_count: normalizedProjects.length,
      aligned_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'aligned').length,
      partial_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'partial').length,
      blocked_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'blocked').length,
      direct_entry_locator_ready_projects_count:
        normalizedProjects.filter((entry) => entry.direct_entry_locator_status === 'ready').length,
      domain_entry_contract_ready_count:
        normalizedProjects.filter((entry) => entry.domain_entry_contract_status === 'ready').length,
      domain_agent_entry_spec_ready_count:
        normalizedProjects.filter((entry) => entry.domain_agent_entry_spec_status === 'ready').length,
      gateway_interaction_contract_ready_count:
        normalizedProjects.filter((entry) => entry.gateway_interaction_contract_status === 'ready').length,
      runtime_inventory_ready_count:
        normalizedProjects.filter((entry) => entry.runtime_inventory_status === 'ready').length,
      task_lifecycle_ready_count:
        normalizedProjects.filter((entry) => entry.task_lifecycle_status === 'ready').length,
      runtime_control_ready_count:
        normalizedProjects.filter((entry) => entry.runtime_control_status === 'ready').length,
      session_continuity_ready_count:
        normalizedProjects.filter((entry) => entry.session_continuity_status === 'ready').length,
      progress_projection_ready_count:
        normalizedProjects.filter((entry) => entry.progress_projection_status === 'ready').length,
      artifact_inventory_ready_count:
        normalizedProjects.filter((entry) => entry.artifact_inventory_status === 'ready').length,
      skill_catalog_ready_count:
        normalizedProjects.filter((entry) => entry.skill_catalog_status === 'ready').length,
      skill_runtime_continuity_ready_count:
        normalizedProjects.filter((entry) => entry.skill_runtime_continuity_status === 'ready').length,
      automation_ready_count:
        normalizedProjects.filter((entry) => entry.automation_status === 'ready').length,
      ready_for_opl_start_count:
        normalizedProjects.filter((entry) => entry.ready_for_opl_start).length,
      ready_for_domain_handoff_count:
        normalizedProjects.filter((entry) => entry.ready_for_domain_handoff).length,
    },
    projects: normalizedProjects,
    notes: [
      'Domain entry parity is a family-level derived surface, not a second manifest system.',
      'A project can be start-ready and handoff-ready before it has a direct-entry locator bound into the active workspace.',
      'aligned means frontdoor/start/shared-handoff are resolved and the active binding already carries a direct-entry locator.',
    ],
  };
}

export function buildRecommendedEntrySurfaces(
  projects: DomainManifestCatalogEntry[],
  options: BuildFamilyDomainCatalogOptions = {},
) {
  return projects
    .filter((entry) => entry.status === 'resolved' && entry.manifest?.recommended_command)
    .map((entry) => {
      const activeBinding = resolveActiveBinding(entry.project_id, options);
      const skillActivation = pickSkillActivationProjection(entry.manifest ?? null);
      const skillRuntimeContinuity = pickSkillRuntimeContinuity(entry.manifest ?? null);
      const skillRuntimeContinuityReady = hasSkillRuntimeContinuity(entry.manifest ?? null);
      const skillActivationReady = Boolean(skillActivation?.entry_command);

      return {
        project_id: entry.project_id,
        project: entry.project,
        binding_id: entry.binding_id,
        manifest_target_domain_id: entry.manifest?.target_domain_id ?? null,
        frontdoor_surface: entry.manifest?.frontdoor_surface ?? null,
        operator_loop_shell_key: entry.manifest?.operator_loop_surface?.shell_key ?? null,
        operator_loop_command: entry.manifest?.operator_loop_surface?.command ?? null,
        operator_loop_surface_kind: entry.manifest?.operator_loop_surface?.surface_kind ?? null,
        operator_loop_summary: entry.manifest?.operator_loop_surface?.summary ?? null,
        operator_loop_continuation_command: entry.manifest?.operator_loop_surface?.continuation_command ?? null,
        operator_loop_actions: entry.manifest?.operator_loop_actions ?? {},
        product_entry_start: entry.manifest?.product_entry_start ?? null,
        product_entry_start_resume_surface_kind:
          entry.manifest?.product_entry_start?.resume_surface?.surface_kind ?? null,
        product_entry_start_mode_ids:
          entry.manifest?.product_entry_start?.modes.map((mode) => mode.mode_id) ?? [],
        product_entry_overview: entry.manifest?.product_entry_overview ?? null,
        product_entry_preflight: entry.manifest?.product_entry_preflight ?? null,
        product_entry_quickstart: entry.manifest?.product_entry_quickstart ?? null,
        manifest_version: entry.manifest?.manifest_version ?? null,
        recommended_shell: entry.manifest?.recommended_shell ?? null,
        recommended_command: entry.manifest?.recommended_command ?? null,
        schema_ref: entry.manifest?.schema_ref ?? null,
        domain_entry_contract: entry.manifest?.domain_entry_contract ?? null,
        domain_agent_entry_spec: entry.manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null,
        gateway_interaction_contract: entry.manifest?.gateway_interaction_contract ?? null,
        product_entry_shell: entry.manifest?.product_entry_shell ?? {},
        shared_handoff: entry.manifest?.shared_handoff ?? {},
        family_orchestration: entry.manifest?.family_orchestration ?? null,
        product_entry_readiness: entry.manifest?.product_entry_readiness ?? null,
        manifest_command: entry.manifest_command,
        workspace_path: entry.workspace_path,
        active_binding_locator_status:
          activeBinding?.direct_entry.command || activeBinding?.direct_entry.url ? 'ready' : 'missing',
        domain_entry_contract_status: entry.manifest?.domain_entry_contract ? 'ready' : 'missing',
        gateway_interaction_contract_status: entry.manifest?.gateway_interaction_contract ? 'ready' : 'missing',
        active_binding_locator: {
          binding_id: activeBinding?.binding_id ?? null,
          workspace_path: activeBinding?.workspace_path ?? null,
          status: activeBinding?.status ?? null,
          command: activeBinding?.direct_entry.command ?? null,
          url: activeBinding?.direct_entry.url ?? null,
          manifest_command: activeBinding?.direct_entry.manifest_command ?? null,
        },
        mainline_phase_id: pickManifestPhaseId(entry.manifest?.repo_mainline ?? null),
        mainline_tranche_id: pickManifestTrancheId(entry.manifest?.repo_mainline ?? null),
        product_entry_status_summary: entry.manifest?.product_entry_status?.summary ?? null,
        product_entry_next_focus: entry.manifest?.product_entry_status?.next_focus ?? [],
        product_entry_remaining_gaps_count:
          entry.manifest?.product_entry_status?.remaining_gaps_count
          ?? entry.manifest?.remaining_gaps.length
          ?? null,
        product_entry_overview_summary: entry.manifest?.product_entry_overview?.summary ?? null,
        product_entry_overview_progress_command:
          entry.manifest?.product_entry_overview?.progress_surface?.command ?? null,
        product_entry_overview_resume_command:
          entry.manifest?.product_entry_overview?.resume_surface?.command ?? null,
        product_entry_overview_human_gate_ids: entry.manifest?.product_entry_overview?.human_gate_ids ?? [],
        product_entry_preflight_summary: entry.manifest?.product_entry_preflight?.summary ?? null,
        product_entry_preflight_ready_to_try_now:
          entry.manifest?.product_entry_preflight?.ready_to_try_now ?? null,
        product_entry_preflight_recommended_check_command:
          entry.manifest?.product_entry_preflight?.recommended_check_command ?? null,
        product_entry_preflight_recommended_start_command:
          entry.manifest?.product_entry_preflight?.recommended_start_command ?? null,
        product_entry_preflight_blocking_check_ids:
          entry.manifest?.product_entry_preflight?.blocking_check_ids ?? [],
        product_entry_preflight_checks_count:
          entry.manifest?.product_entry_preflight?.checks.length ?? 0,
        product_entry_readiness_verdict: entry.manifest?.product_entry_readiness?.verdict ?? null,
        product_entry_readiness_summary: entry.manifest?.product_entry_readiness?.summary ?? null,
        product_entry_readiness_usable_now: entry.manifest?.product_entry_readiness?.usable_now ?? null,
        product_entry_readiness_good_to_use_now:
          entry.manifest?.product_entry_readiness?.good_to_use_now ?? null,
        product_entry_readiness_fully_automatic:
          entry.manifest?.product_entry_readiness?.fully_automatic ?? null,
        product_entry_readiness_start_command:
          entry.manifest?.product_entry_readiness?.recommended_start_command ?? null,
        product_entry_readiness_loop_command:
          entry.manifest?.product_entry_readiness?.recommended_loop_command ?? null,
        product_entry_readiness_blocking_gaps:
          entry.manifest?.product_entry_readiness?.blocking_gaps ?? [],
        domain_agent_entry_id: entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id ?? null,
        domain_agent_entry_title: entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.title ?? null,
        domain_agent_entry_entry_command:
          entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.entry_command ?? null,
        domain_agent_entry_manifest_command:
          entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.manifest_command ?? null,
        runtime_inventory: entry.manifest?.runtime_inventory ?? null,
        runtime_inventory_summary: entry.manifest?.runtime_inventory?.summary ?? null,
        runtime_inventory_runtime_owner: entry.manifest?.runtime_inventory?.runtime_owner ?? null,
        runtime_inventory_availability: entry.manifest?.runtime_inventory?.availability ?? null,
        runtime_inventory_health_status: entry.manifest?.runtime_inventory?.health_status ?? null,
        task_lifecycle: entry.manifest?.task_lifecycle ?? null,
        task_lifecycle_status: entry.manifest?.task_lifecycle?.status ?? null,
        task_lifecycle_task_kind: entry.manifest?.task_lifecycle?.task_kind ?? null,
        task_lifecycle_progress_command:
          entry.manifest?.task_lifecycle?.progress_surface?.command ?? null,
        task_lifecycle_resume_surface_kind:
          entry.manifest?.task_lifecycle?.resume_surface?.surface_kind ?? null,
        task_lifecycle_human_gate_ids: entry.manifest?.task_lifecycle?.human_gate_ids ?? [],
        runtime_control: entry.manifest?.runtime_control ?? null,
        runtime_control_status: entry.manifest?.runtime_control ? 'ready' : 'missing',
        runtime_control_loop_status: entry.manifest?.runtime_control?.status ?? null,
        runtime_control_restore_point: entry.manifest?.runtime_control?.restore_point ?? null,
        runtime_control_resume_command:
          entry.manifest?.runtime_control?.control_surfaces.resume?.command ?? null,
        runtime_control_approval_command:
          entry.manifest?.runtime_control?.control_surfaces.approval?.command ?? null,
        runtime_control_interrupt_command:
          entry.manifest?.runtime_control?.control_surfaces.interrupt?.command ?? null,
        runtime_control_artifact_pickup_command:
          entry.manifest?.runtime_control?.control_surfaces.artifact_pickup?.command ?? null,
        runtime_control_gate_ids: entry.manifest?.runtime_control?.control_gate_ids ?? [],
        session_continuity: entry.manifest?.session_continuity ?? null,
        session_continuity_status: entry.manifest?.session_continuity?.status ?? null,
        session_continuity_session_id: entry.manifest?.session_continuity?.session_id ?? null,
        session_continuity_restore_command:
          entry.manifest?.session_continuity?.restore_surface?.command ?? null,
        progress_projection: entry.manifest?.progress_projection ?? null,
        progress_projection_headline: entry.manifest?.progress_projection?.headline ?? null,
        progress_projection_next_step: entry.manifest?.progress_projection?.next_step ?? null,
        progress_projection_progress_command:
          entry.manifest?.progress_projection?.progress_surface?.command ?? null,
        artifact_inventory: entry.manifest?.artifact_inventory ?? null,
        artifact_inventory_total_files_count:
          entry.manifest?.artifact_inventory?.summary.total_files_count ?? null,
        artifact_inventory_workspace_path:
          entry.manifest?.artifact_inventory?.workspace_path ?? null,
        skill_catalog: entry.manifest?.skill_catalog ?? null,
        skill_catalog_supported_commands: entry.manifest?.skill_catalog?.supported_commands ?? [],
        skill_catalog_skill_count: entry.manifest?.skill_catalog?.skills.length ?? 0,
        skill_activation: skillActivation,
        skill_activation_status:
          skillActivationReady ? 'ready' : entry.manifest?.skill_catalog ? 'missing' : 'blocked',
        skill_activation_skill_id: skillActivation?.skill_id ?? null,
        skill_activation_title: skillActivation?.title ?? null,
        skill_activation_description: skillActivation?.description ?? null,
        skill_activation_target_surface_kind: skillActivation?.target_surface_kind ?? null,
        skill_activation_plugin_name: skillActivation?.plugin_name ?? null,
        skill_activation_skill_semantics: skillActivation?.skill_semantics ?? null,
        skill_activation_kind: skillActivation?.activation_kind ?? null,
        skill_activation_entry_shell_key: skillActivation?.entry_shell_key ?? null,
        skill_activation_entry_command: skillActivation?.entry_command ?? null,
        skill_activation_supporting_shell_keys: skillActivation?.supporting_shell_keys ?? [],
        skill_activation_shell_commands: skillActivation?.shell_commands ?? {},
        skill_runtime_continuity: skillRuntimeContinuity,
        skill_runtime_continuity_status:
          skillRuntimeContinuityReady ? 'ready' : entry.manifest?.skill_catalog ? 'missing' : 'blocked',
        skill_runtime_continuity_session_locator_field:
          typeof skillRuntimeContinuity?.session_locator_field === 'string'
            ? skillRuntimeContinuity.session_locator_field
            : null,
        skill_runtime_continuity_session_surface_ref:
          typeof skillRuntimeContinuity?.session_surface_ref === 'string'
            ? skillRuntimeContinuity.session_surface_ref
            : null,
        skill_runtime_continuity_progress_surface_ref:
          typeof skillRuntimeContinuity?.progress_surface_ref === 'string'
            ? skillRuntimeContinuity.progress_surface_ref
            : null,
        skill_runtime_continuity_artifact_surface_ref:
          typeof skillRuntimeContinuity?.artifact_surface_ref === 'string'
            ? skillRuntimeContinuity.artifact_surface_ref
            : null,
        skill_runtime_continuity_restore_point_surface_ref:
          typeof skillRuntimeContinuity?.restore_point_surface_ref === 'string'
            ? skillRuntimeContinuity.restore_point_surface_ref
            : null,
        skill_runtime_continuity_resume_command:
          typeof skillRuntimeContinuity?.recommended_resume_command === 'string'
            ? skillRuntimeContinuity.recommended_resume_command
            : null,
        skill_runtime_continuity_progress_command:
          typeof skillRuntimeContinuity?.recommended_progress_command === 'string'
            ? skillRuntimeContinuity.recommended_progress_command
            : null,
        skill_runtime_continuity_artifact_command:
          typeof skillRuntimeContinuity?.recommended_artifact_command === 'string'
            ? skillRuntimeContinuity.recommended_artifact_command
            : null,
        automation: entry.manifest?.automation ?? null,
        automation_count: entry.manifest?.automation?.automations.length ?? 0,
        automation_readiness_summary: entry.manifest?.automation?.readiness_summary ?? null,
        family_human_gate_count: entry.manifest?.family_orchestration?.human_gates.length ?? 0,
        family_human_gate_ids:
          entry.manifest?.family_orchestration?.human_gates.map((gate) => String(gate.gate_id)) ?? [],
        family_resume_surface_kind: entry.manifest?.family_orchestration?.resume_contract?.surface_kind ?? null,
        family_action_graph_ref: entry.manifest?.family_orchestration?.action_graph_ref?.ref ?? null,
        family_action_graph_node_count:
          Array.isArray(entry.manifest?.family_orchestration?.action_graph?.nodes)
            ? entry.manifest.family_orchestration.action_graph.nodes.length
            : 0,
        family_action_graph_edge_count:
          Array.isArray(entry.manifest?.family_orchestration?.action_graph?.edges)
            ? entry.manifest.family_orchestration.action_graph.edges.length
            : 0,
        family_event_envelope_ref: entry.manifest?.family_orchestration?.event_envelope_surface?.ref ?? null,
        family_checkpoint_lineage_ref:
          entry.manifest?.family_orchestration?.checkpoint_lineage_surface?.ref ?? null,
        quickstart_step_count: entry.manifest?.product_entry_quickstart?.steps.length ?? 0,
        quickstart_step_ids: entry.manifest?.product_entry_quickstart?.steps.map((step) => step.step_id) ?? [],
      };
    });
}
