import { buildFrontDeskEndpoints, normalizeBasePath } from '../../frontdesk-paths.ts';
import { getFrontDeskServiceStatus } from '../../frontdesk-service.ts';
import {
  buildDomainManifestCatalog,
  type DomainManifestCatalogEntry,
} from '../../domain-manifest.ts';
import {
  buildDomainEntryParity,
  buildRecommendedEntrySurfaces,
} from '../../family-domain-catalog.ts';
import { inspectHermesRuntime } from '../../hermes.ts';
import { buildFrontDeskShellMcpWiring } from '../../frontdesk-shell-identity.ts';
import { buildWorkspaceCatalog } from '../../workspace-registry.ts';
import type { GatewayContracts } from '../../types.ts';

import { buildHostedRuntimeReadiness } from '../hosted.ts';
import type { DashboardOptions } from '../types.ts';

function buildDomainBindingParity(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainProjects = workspaceCatalog.projects.filter((entry) => entry.project_id !== 'opl');
  const projects = domainProjects.map((entry) => ({
    project_id: entry.project_id,
    project: entry.project,
    active_binding: entry.active_binding,
    bindings_count: entry.bindings_count,
    last_updated_at: entry.last_updated_at,
    available_actions: entry.available_actions,
    direct_entry_ready: entry.bindings_count.direct_entry_ready > 0,
    manifest_ready: entry.bindings_count.manifest_ready > 0,
    launch_ready: entry.available_actions.includes('launch'),
  }));

  return {
    surface_kind: 'opl_domain_binding_parity',
    summary: {
      total_projects_count: projects.length,
      active_projects_count: projects.filter((entry) => entry.active_binding !== null).length,
      direct_entry_ready_projects_count: projects.filter((entry) => entry.direct_entry_ready).length,
      manifest_ready_projects_count: projects.filter((entry) => entry.manifest_ready).length,
      launch_ready_projects_count: projects.filter((entry) => entry.launch_ready).length,
      last_binding_change_at: workspaceCatalog.summary.last_binding_change_at,
    },
    projects,
    endpoints: {
      workspace_catalog: endpoints.workspace_catalog,
      workspace_bind: endpoints.workspace_bind,
      workspace_activate: endpoints.workspace_activate,
      workspace_archive: endpoints.workspace_archive,
      launch_domain: endpoints.launch_domain,
    },
    notes: [
      'This surface mirrors the domain-scoped binding state from `opl workspace list` so hosted shells do not need to reconstruct it from `opl status dashboard`.',
      'It stays derived from the writable workspace registry rather than inventing a second binding store.',
      'direct_entry_ready means the current project already has a bound command or URL; manifest_ready means the active binding already carries a manifest_command.',
    ],
  };
}

function buildFrontDeskDomainWiringSurfaceRef(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const wiring = buildFrontDeskDomainWiring(contracts, options).frontdesk_domain_wiring;

  return {
    surface_id: wiring.surface_id,
    endpoint: wiring.endpoints.frontdesk_domain_wiring,
    summary: wiring.summary,
  };
}

export function buildFrontDeskReadinessSurfaceRef(options: { basePath?: string } = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);

  return {
    surface_id: 'opl_frontdesk_readiness',
    endpoint: endpoints.frontdesk_readiness,
  };
}

function buildFrontDeskDashboardSurfaceRef(options: { basePath?: string } = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);

  return {
    surface_id: 'opl_frontdesk_dashboard',
    endpoint: endpoints.dashboard,
  };
}

function buildFrontDeskShellBootstrap(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const frontdeskEntryGuideSurface = buildFrontDeskEntryGuideSurfaceRef(contracts, options);
  const frontdeskReadinessSurface = buildFrontDeskReadinessSurfaceRef(options);
  const domainWiringSurface = buildFrontDeskDomainWiringSurfaceRef(contracts, options);
  const dashboardSurface = buildFrontDeskDashboardSurfaceRef(options);

  return {
    primary_surface: frontdeskEntryGuideSurface,
    follow_on_surfaces: [
      frontdeskReadinessSurface,
      domainWiringSurface,
      dashboardSurface,
    ],
    operator_debug_surface: dashboardSurface,
  };
}

type DomainWorkspaceGuide = {
  domain_workspace_kind: string;
  domain_workspace_label: string;
  domain_workspace_role: string;
  summary: string;
};

function buildDomainWorkspaceGuide(entry: DomainManifestCatalogEntry): DomainWorkspaceGuide {
  const surfaceKind = entry.manifest?.operator_loop_surface?.surface_kind;

  if (surfaceKind === 'workspace_cockpit' || entry.project_id === 'medautoscience') {
    return {
      domain_workspace_kind: 'research_workspace',
      domain_workspace_label: 'study queue',
      domain_workspace_role: 'research_runtime_workspace',
      summary:
        'OPL workspace 是 family-level task container；进入 MedAutoScience 后，domain workspace 会收紧为 research workspace / study queue，用来承接具体 study runtime 与研究闭环。',
    };
  }

  if (surfaceKind === 'grant_user_loop' || entry.project_id === 'medautogrant') {
    return {
      domain_workspace_kind: 'grant_workspace',
      domain_workspace_label: 'draft lane',
      domain_workspace_role: 'grant_draft_workspace',
      summary:
        'OPL workspace 只负责 family-level 路由；进入 MedAutoGrant 后，domain workspace 会收紧为 grant workspace / draft lane，用来推进 critique、revision 与导出链路。',
    };
  }

  if (surfaceKind === 'product_entry' || entry.project_id === 'redcube') {
    return {
      domain_workspace_kind: 'deliverable_workspace',
      domain_workspace_label: 'entry session',
      domain_workspace_role: 'deliverable_runtime_workspace',
      summary:
        'OPL workspace 仍是 family-level task container；进入 RedCube 后，domain workspace 会收紧为 deliverable workspace / entry session，用来持续推进某个交付物的 runtime loop。',
    };
  }

  return {
    domain_workspace_kind: 'domain_workspace',
    domain_workspace_label: 'domain workspace',
    domain_workspace_role: 'domain_runtime_workspace',
    summary:
      'OPL workspace 负责 family-level task routing；一旦 handoff 到具体 domain，后续执行会落到该 domain 自己定义的 workspace / runtime container。',
  };
}

export function buildFrontDeskEntryGuideSurfaceRef(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const guide = buildFrontDeskEntryGuide(contracts, options).frontdesk_entry_guide;

  return {
    surface_id: guide.surface_id,
    endpoint: guide.endpoints.frontdesk_entry_guide,
    summary: guide.summary,
  };
}

export function buildFrontDeskEntryGuide(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const projects = domainManifests.projects.map((entry) => {
    const workspaceGuide = buildDomainWorkspaceGuide(entry);
    const manifest = entry.manifest;
    const startSurface = manifest?.product_entry_start;
    const preflightSurface = manifest?.product_entry_preflight;
    const readinessSurface = manifest?.product_entry_readiness;
    const orchestration = manifest?.family_orchestration;

    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      workspace_path: entry.workspace_path,
      manifest_command: entry.manifest_command,
      manifest_status: entry.status,
      target_domain_id: manifest?.target_domain_id ?? null,
      domain_workspace_kind: workspaceGuide.domain_workspace_kind,
      domain_workspace_label: workspaceGuide.domain_workspace_label,
      workspace_mapping: {
        family_workspace_kind: 'opl_family_workspace',
        family_workspace_role: 'family_task_container',
        domain_workspace_role: workspaceGuide.domain_workspace_role,
        summary: workspaceGuide.summary,
      },
      frontdesk: manifest?.frontdesk_surface
        ? {
            shell_key: manifest.frontdesk_surface.shell_key,
            command: manifest.frontdesk_surface.command,
            surface_kind: manifest.frontdesk_surface.surface_kind,
            summary: manifest.frontdesk_surface.summary,
          }
        : null,
      operator_loop: manifest?.operator_loop_surface
        ? {
            shell_key: manifest.operator_loop_surface.shell_key,
            command: manifest.operator_loop_surface.command,
            surface_kind: manifest.operator_loop_surface.surface_kind,
            summary: manifest.operator_loop_surface.summary,
            continuation_command: manifest.operator_loop_surface.continuation_command,
          }
        : null,
      start: startSurface
        ? {
            summary: startSurface.summary,
            recommended_mode_id: startSurface.recommended_mode_id,
            mode_count: startSurface.modes.length,
            mode_ids: startSurface.modes.map((mode) => mode.mode_id),
            modes: startSurface.modes,
            resume_surface: startSurface.resume_surface,
            human_gate_ids: startSurface.human_gate_ids,
          }
        : null,
      preflight: preflightSurface
        ? {
            summary: preflightSurface.summary,
            ready_to_try_now: preflightSurface.ready_to_try_now,
            recommended_check_command: preflightSurface.recommended_check_command,
            recommended_start_command: preflightSurface.recommended_start_command,
            blocking_check_ids: preflightSurface.blocking_check_ids,
          }
        : null,
      readiness: readinessSurface
        ? {
            verdict: readinessSurface.verdict,
            usable_now: readinessSurface.usable_now,
            good_to_use_now: readinessSurface.good_to_use_now,
            fully_automatic: readinessSurface.fully_automatic,
            summary: readinessSurface.summary,
            recommended_start_command: readinessSurface.recommended_start_command,
            recommended_loop_command: readinessSurface.recommended_loop_command,
            blocking_gaps: readinessSurface.blocking_gaps,
          }
        : null,
      orchestration: orchestration
        ? {
            action_graph_ref: orchestration.action_graph_ref,
            human_gate_ids: orchestration.human_gates
              .map((gate) => gate.gate_id)
              .filter((gateId): gateId is string => typeof gateId === 'string' && gateId.length > 0),
            resume_contract: orchestration.resume_contract,
          }
        : null,
      shared_handoff: manifest?.shared_handoff ?? {},
      recommended_start_command:
        readinessSurface?.recommended_start_command
        ?? preflightSurface?.recommended_start_command
        ?? manifest?.frontdesk_surface?.command
        ?? null,
      recommended_check_command: preflightSurface?.recommended_check_command ?? null,
    };
  });

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_entry_guide: {
      surface_id: 'opl_frontdesk_entry_guide',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      base_path: normalizeBasePath(options.basePath),
      workspace_taxonomy: {
        family_workspace_kind: 'opl_family_workspace',
        family_workspace_role: 'family_task_container',
        summary:
          'OPL workspace 是 family-level task container：先承接用户目标，再把任务 handoff 到具体 domain 的 workspace / runtime container。',
      },
      starter_prompts: projects.map((entry) => ({
        prompt_id: `start_${entry.project_id}`,
        project_id: entry.project_id,
        title: `Start ${entry.project}`,
        prompt: `从 ${entry.project} 开始，并告诉我当前推荐的 direct entry / start mode。`,
      })),
      summary: {
        total_projects_count: projects.length,
        resolved_projects_count: projects.filter((entry) => entry.manifest_status === 'resolved').length,
        ready_to_try_now_projects_count:
          projects.filter((entry) => entry.preflight?.ready_to_try_now === true).length,
        usable_now_projects_count: projects.filter((entry) => entry.readiness?.usable_now === true).length,
      },
      projects,
      endpoints: {
        frontdesk_entry_guide: endpoints.frontdesk_entry_guide,
        frontdesk_manifest: endpoints.manifest,
        frontdesk_readiness: endpoints.frontdesk_readiness,
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
      },
      notes: [
        'This surface is machine-readable entry guidance for AI shells and higher-level GUI hosts; it stays derived from admitted domain manifests instead of inventing a second truth source.',
        'User-facing product naming can move to OPL Cortex at the GUI layer, while repo-internal surface ids remain frontdesk_* until a separate rename tranche is frozen.',
      ],
    },
  };
}

export function buildFrontDeskDomainWiring(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const domainBindingParity = buildDomainBindingParity(contracts, options);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_domain_wiring: {
      surface_id: 'opl_frontdesk_domain_wiring',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      base_path: normalizeBasePath(options.basePath),
      hosted_runtime_readiness: hostedRuntimeReadiness,
      domain_entry_parity: domainEntryParity,
      domain_binding_parity: domainBindingParity,
      recommended_entry_surfaces: recommendedEntrySurfaces,
      summary: {
        total_projects_count: domainEntryParity.summary.total_projects_count,
        aligned_projects_count: domainEntryParity.summary.aligned_projects_count,
        ready_for_opl_start_count: domainEntryParity.summary.ready_for_opl_start_count,
        ready_for_domain_handoff_count: domainEntryParity.summary.ready_for_domain_handoff_count,
        domain_entry_contract_ready_count: domainEntryParity.summary.domain_entry_contract_ready_count,
        domain_agent_entry_spec_ready_count: domainEntryParity.summary.domain_agent_entry_spec_ready_count,
        gateway_interaction_contract_ready_count:
          domainEntryParity.summary.gateway_interaction_contract_ready_count,
        active_binding_projects_count: domainBindingParity.summary.active_projects_count,
        manifest_ready_projects_count: domainBindingParity.summary.manifest_ready_projects_count,
        launch_ready_projects_count: domainBindingParity.summary.launch_ready_projects_count,
        recommended_entry_surfaces_count: recommendedEntrySurfaces.length,
      },
      endpoints: {
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        dashboard: endpoints.dashboard,
        workspace_catalog: endpoints.workspace_catalog,
        workspace_bind: endpoints.workspace_bind,
        workspace_activate: endpoints.workspace_activate,
        workspace_archive: endpoints.workspace_archive,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
      },
      notes: [
        'This surface hardens the family-level domain wiring truth for hosted shells and local front-desk consumers.',
        'It stays derived from active domain manifests and workspace bindings; it does not create a second truth source.',
      ],
    },
  };
}

function buildFrontDeskReadinessProjects(
  projects: DomainManifestCatalogEntry[],
  domainEntryParity: ReturnType<typeof buildDomainEntryParity>,
  domainBindingParity: ReturnType<typeof buildDomainBindingParity>,
) {
  const entryParityByProject = new Map(
    domainEntryParity.projects.map((entry) => [entry.project_id, entry]),
  );
  const bindingParityByProject = new Map(
    domainBindingParity.projects.map((entry) => [entry.project_id, entry]),
  );

  return projects.map((entry) => {
    const manifest = entry.manifest;
    const entryParity = entryParityByProject.get(entry.project_id);
    const bindingParity = bindingParityByProject.get(entry.project_id);
    const readiness = manifest?.product_entry_readiness;
    const preflight = manifest?.product_entry_preflight;
    const overview = manifest?.product_entry_overview;
    const quickstart = manifest?.product_entry_quickstart;

    return {
      project_id: entry.project_id,
      project: entry.project,
      manifest_status: entry.status,
      entry_parity_status: entryParity?.entry_parity_status ?? 'blocked',
      binding_active: bindingParity?.active_binding !== null,
      binding_direct_entry_ready: bindingParity?.direct_entry_ready ?? false,
      binding_manifest_ready: bindingParity?.manifest_ready ?? false,
      binding_launch_ready: bindingParity?.launch_ready ?? false,
      usable_now: readiness?.usable_now === true,
      good_to_use_now: readiness?.good_to_use_now === true,
      fully_automatic: readiness?.fully_automatic === true,
      ready_to_try_now: preflight?.ready_to_try_now === true,
      ready_for_opl_start: entryParity?.ready_for_opl_start ?? false,
      ready_for_domain_handoff: entryParity?.ready_for_domain_handoff ?? false,
      verdict: readiness?.verdict ?? null,
      summary: readiness?.summary ?? manifest?.product_entry_status?.summary ?? null,
      frontdesk_command:
        manifest?.frontdesk_surface?.command
        ?? manifest?.recommended_command
        ?? null,
      recommended_start_command:
        readiness?.recommended_start_command
        ?? entryParity?.recommended_start_command
        ?? preflight?.recommended_start_command
        ?? null,
      recommended_loop_command: readiness?.recommended_loop_command ?? null,
      recommended_check_command:
        preflight?.recommended_check_command
        ?? entryParity?.recommended_check_command
        ?? null,
      blocking_gaps_count: readiness?.blocking_gaps.length ?? 0,
      blocking_gaps: readiness?.blocking_gaps ?? [],
      blocking_check_ids: preflight?.blocking_check_ids ?? [],
      preflight_checks_count: preflight?.checks.length ?? 0,
      quickstart_steps_count: quickstart?.steps.length ?? 0,
      overview_progress_command: overview?.progress_surface?.command ?? null,
      overview_resume_command: overview?.resume_surface?.command ?? null,
      recommended_next_actions: entryParity?.recommended_next_actions ?? [],
    };
  });
}

export async function buildFrontDeskReadiness(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const domainBindingParity = buildDomainBindingParity(contracts, options);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);
  const localService = (await getFrontDeskServiceStatus(contracts)).frontdesk_service;
  const projects = buildFrontDeskReadinessProjects(
    domainManifests.projects,
    domainEntryParity,
    domainBindingParity,
  );

  const summary = {
    total_projects_count: projects.length,
    resolved_manifests_count: domainManifests.summary.resolved_count,
    blocked_projects_count: domainEntryParity.summary.blocked_projects_count,
    usable_now_projects_count: projects.filter((entry) => entry.usable_now).length,
    good_to_use_now_projects_count: projects.filter((entry) => entry.good_to_use_now).length,
    fully_automatic_projects_count: projects.filter((entry) => entry.fully_automatic).length,
    ready_to_try_now_projects_count: projects.filter((entry) => entry.ready_to_try_now).length,
    direct_entry_ready_projects_count: domainBindingParity.summary.direct_entry_ready_projects_count,
    manifest_ready_projects_count: domainBindingParity.summary.manifest_ready_projects_count,
    launch_ready_projects_count: domainBindingParity.summary.launch_ready_projects_count,
    ready_for_opl_start_count: domainEntryParity.summary.ready_for_opl_start_count,
    ready_for_domain_handoff_count: domainEntryParity.summary.ready_for_domain_handoff_count,
    recommended_entry_projects_count: recommendedEntrySurfaces.length,
  };

  const recommendedNextActions: string[] = [];
  if (!localService.installed) {
    recommendedNextActions.push('如需长期本地产品入口，先执行 `opl frontdesk service install`。');
  } else if (!localService.loaded) {
    recommendedNextActions.push('frontdesk service 已安装但未加载，执行 `opl frontdesk service start`。');
  } else if (localService.health.status === 'unreachable') {
    recommendedNextActions.push('frontdesk service 已加载但健康检查失败，先执行 `opl frontdesk service status` 与 `opl session logs`。');
  }
  recommendedNextActions.push('GUI 壳应通过独立 GUI shell repo 接入这些 API；当前优先基于 AionUI，Onyx 只保留备线参考。');
  if (summary.manifest_ready_projects_count < summary.total_projects_count) {
    recommendedNextActions.push('给仍缺 manifest 的 active binding 补 `manifest_command`。');
  }
  if (summary.direct_entry_ready_projects_count < summary.total_projects_count) {
    recommendedNextActions.push('给仍缺 direct-entry locator 的项目补 `entry_command` 或 `entry_url`。');
  }
  if (summary.ready_for_domain_handoff_count < summary.total_projects_count) {
    recommendedNextActions.push('继续补齐 `product_entry_start` 与 `shared_handoff`，让 OPL start/handoff 口径完全对齐。');
  }

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_readiness: {
      surface_id: 'opl_frontdesk_readiness',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      base_path: normalizeBasePath(options.basePath),
      overall_status:
        summary.usable_now_projects_count > 0
          ? localService.health.status === 'ok'
            ? 'usable_with_known_gaps'
            : 'domain_ready_local_service_optional'
          : 'setup_incomplete',
      local_shell: {
        direct_entry_command: 'opl',
        quick_ask_command: 'opl <request...>',
        web_command: 'opl web',
      },
      local_service: localService,
      hosted_runtime_readiness: hostedRuntimeReadiness,
      domain_entry_parity: domainEntryParity,
      domain_binding_parity: domainBindingParity,
      summary,
      projects,
      recommended_entry_surfaces: recommendedEntrySurfaces,
      recommended_next_actions: recommendedNextActions,
      endpoints: {
        frontdesk_readiness: endpoints.frontdesk_readiness,
        frontdesk_manifest: endpoints.manifest,
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        dashboard: endpoints.dashboard,
        workspace_catalog: endpoints.workspace_catalog,
        workspace_bind: endpoints.workspace_bind,
        workspace_activate: endpoints.workspace_activate,
        workspace_archive: endpoints.workspace_archive,
        runtime_status: endpoints.runtime_status,
        session_ledger: endpoints.session_ledger,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
        health: endpoints.health,
      },
      notes: [
        'This surface is an operator-facing derived board: it reuses service status, hosted readiness, manifest truth, and workspace bindings without creating a second source of truth.',
        'usable_now / good_to_use_now / fully_automatic come from the domain-owned product_entry_readiness companion, not from OPL invention.',
        'Local service readiness remains optional for direct CLI use, but it is the shortest path to a persistent local front desk.',
      ],
    },
  };
}

export function buildFrontDeskManifest(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const hostedShellMcpWiring = buildFrontDeskShellMcpWiring();
  const frontdeskEntryGuideSurface = buildFrontDeskEntryGuideSurfaceRef(contracts, options);
  const domainWiringSurface = buildFrontDeskDomainWiringSurfaceRef(contracts, options);
  const frontdeskReadinessSurface = buildFrontDeskReadinessSurfaceRef(options);
  const shellBootstrap = buildFrontDeskShellBootstrap(contracts, options);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_manifest: {
      surface_id: 'opl_hosted_friendly_frontdesk_manifest',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'external_gui_overlay',
      readiness: 'hosted_friendly_shell_pilot_landed',
      hosted_packaging_status: 'frontdesk_package_landed',
      pilot_bundle_status: 'landed',
      base_path: normalizeBasePath(options.basePath),
      hosted_runtime_readiness: hostedRuntimeReadiness,
      hosted_shell_mcp_wiring: hostedShellMcpWiring,
      frontdesk_entry_guide_surface: frontdeskEntryGuideSurface,
      frontdesk_readiness_surface: frontdeskReadinessSurface,
      domain_wiring_surface: domainWiringSurface,
      shell_bootstrap: shellBootstrap,
      handoff_envelope_fields: [
        'target_domain_id',
        'task_intent',
        'entry_mode',
        'workspace_locator',
        'runtime_session_contract',
        'return_surface_contract',
      ],
      endpoints,
      notes: [
        'This manifest freezes the hosted-friendly adapter contract now consumed by external GUI overlays.',
        'It still does not claim managed hosted runtime ownership or multi-tenant platform readiness.',
      ],
    },
  };
}

export function buildFrontDeskHealth(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const hermes = inspectHermesRuntime();
  const status = !hermes.binary
    ? 'blocked'
    : hermes.gateway_service.loaded
      ? 'ok'
      : 'degraded';

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    health: {
      surface_id: 'opl_web_health_surface',
      entry_surface: 'opl_local_web_product_api',
      runtime_substrate: 'external_hermes_kernel',
      base_path: normalizeBasePath(options.basePath),
      status,
      web_package_status: 'landed',
      web_bundle_status: 'landed',
      checks: {
        hermes_binary: {
          found: Boolean(hermes.binary),
          path: hermes.binary?.path ?? null,
          source: hermes.binary?.source ?? null,
        },
        gateway_service: {
          loaded: hermes.gateway_service.loaded,
          raw_output: hermes.gateway_service.raw_output,
        },
        issues: hermes.issues,
      },
      notes: [
        'Health here means the current OPL web entry can truthfully expose the Hermes-backed runtime status.',
        'The repo-tracked web entry is API-first, while actual hosted runtime ownership is still not landed.',
      ],
    },
  };
}
