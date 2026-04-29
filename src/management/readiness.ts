import {
  buildDomainEntryParity,
  buildRecommendedEntrySurfaces,
} from '../family-domain-catalog.ts';
import { buildOplRuntimeEndpoints } from '../opl-runtime-paths/current.ts';
import type { buildWorkspaceCatalog } from '../workspace-registry.ts';
import type { DomainManifestCatalogEntry } from '../domain-manifest/types.ts';

type WorkspaceCatalog = ReturnType<typeof buildWorkspaceCatalog>['workspace_catalog'];

function buildCurrentDomainBindingParity(workspaceCatalog: WorkspaceCatalog) {
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
  };
}

function buildCurrentReadinessProjects(
  projects: DomainManifestCatalogEntry[],
  domainEntryParity: ReturnType<typeof buildDomainEntryParity>,
  domainBindingParity: ReturnType<typeof buildCurrentDomainBindingParity>,
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
      frontdoor_command:
        manifest?.frontdoor_surface?.command
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

export function buildCurrentReadinessProjection(
  domainManifestProjects: DomainManifestCatalogEntry[],
  workspaceCatalog: WorkspaceCatalog,
) {
  const domainEntryParity = buildDomainEntryParity(domainManifestProjects);
  const domainBindingParity = buildCurrentDomainBindingParity(workspaceCatalog);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifestProjects);
  const projects = buildCurrentReadinessProjects(
    domainManifestProjects,
    domainEntryParity,
    domainBindingParity,
  );
  const summary = {
    total_projects_count: projects.length,
    resolved_manifests_count: domainManifestProjects.filter((entry) => entry.status === 'resolved').length,
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
  recommendedNextActions.push('Use the Codex-default OPL runtime surface with the opl-aion-shell AionUI adapter.');
  if (summary.manifest_ready_projects_count < summary.total_projects_count) {
    recommendedNextActions.push('Add `manifest_command` to active bindings that still lack a domain-owned manifest surface.');
  }
  if (summary.direct_entry_ready_projects_count < summary.total_projects_count) {
    recommendedNextActions.push('Add `entry_command` or `entry_url` to projects that still lack a direct-entry locator.');
  }
  if (summary.ready_for_domain_handoff_count < summary.total_projects_count) {
    recommendedNextActions.push('Complete `product_entry_start` and `shared_handoff` in domain-owned manifests.');
  }

  return {
    surface_id: 'opl_current_readiness_projection',
    entry_surface: 'opl_codex_default_session_runtime',
    runtime_substrate: 'codex_default_with_explicit_external_substrates',
    shell_integration_target: 'opl_aion_shell_aionui_adapter',
    overall_status: summary.usable_now_projects_count > 0 ? 'usable_with_known_gaps' : 'setup_incomplete',
    domain_entry_parity: domainEntryParity,
    domain_binding_parity: domainBindingParity,
    summary,
    projects,
    recommended_entry_surfaces: recommendedEntrySurfaces,
    recommended_next_actions: recommendedNextActions,
  };
}

export function buildCurrentDashboardSurfaceRefs(options: { basePath?: string } = {}) {
  const endpoints = buildOplRuntimeEndpoints(options.basePath);

  return {
    entry_guide_surface: {
      surface_id: 'opl_current_entry_guide',
      command: 'opl start --project <project_id>',
      endpoint: endpoints.start,
      summary: 'Current entry guidance is resolved from domain manifests and start surfaces.',
      related_surfaces: [
        {
          surface_id: 'opl_domain_manifests',
          command: 'opl domain manifests',
          endpoint: endpoints.domain_manifests,
        },
        {
          surface_id: 'opl_workspace_catalog',
          command: 'opl workspace list',
          endpoint: endpoints.workspace_catalog,
        },
      ],
    },
    readiness_surface: {
      surface_id: 'opl_current_readiness_projection',
      command: 'opl status dashboard',
      endpoint: endpoints.dashboard,
      summary: 'Current readiness is projected from workspace bindings, domain manifests, and runtime status.',
      related_surfaces: [
        {
          surface_id: 'opl_project_progress_brief',
          command: 'opl project progress',
          endpoint: endpoints.project_progress,
        },
        {
          surface_id: 'opl_runtime_status',
          command: 'opl status runtime',
          endpoint: endpoints.runtime_status,
        },
      ],
    },
  };
}
