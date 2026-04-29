
function buildRetiredHostedRuntimeReadiness() {
  return {
    surface_kind: 'opl_hosted_runtime_readiness',
    status: 'retired',
    local_product_api_landed: false,
    web_bundle_landed: false,
    self_hostable_web_package_landed: false,
    service_safe_local_packaging_landed: false,
    replacement_surface: 'AionUI remote WebUI',
    blocking_gaps: [],
    recommended_next_actions: [
      'Use the OPL desktop GUI / AionUI remote WebUI path instead of the retired local Product API service.',
    ],
  };
}

import { findDomainOrThrow, GatewayContractError } from '../contracts.ts';
import { buildDomainEntryParity, buildRecommendedEntrySurfaces } from '../family-domain-catalog.ts';
import { buildOplRuntimeEndpoints } from '../opl-runtime-paths/current.ts';
import { readOplRuntimeModes } from '../runtime-modes.ts';
import { buildWorkspaceCatalog, getActiveWorkspaceBinding } from '../workspace-registry.ts';
import type { GatewayContracts } from '../types.ts';

import type { DashboardOptions, StartSurfaceOptions } from './types.ts';
import { buildDomainManifestCatalog } from './domain-manifest-catalog.ts';
import { buildCurrentDashboardSurfaceRefs } from './readiness.ts';
import { buildRuntimeStatus, buildWorkspaceStatus } from './workspace-runtime.ts';

export function buildProjectsOverview(contracts: GatewayContracts) {
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    projects: [
      {
        project_id: 'opl',
        project: 'one-person-lab',
        scope: 'family_gateway',
        direct_entry_surface: 'opl',
        active_binding: getActiveWorkspaceBinding('opl'),
        owned_workstreams: contracts.workstreams.workstreams.map((workstream) => workstream.workstream_id),
      },
      ...contracts.domains.domains.map((domain) => ({
        project_id: domain.domain_id,
        project: domain.project,
        scope: 'domain_gateway',
        gateway_surface: domain.gateway_surface,
        harness_surface: domain.harness_surface,
        standalone_allowed: domain.standalone_allowed,
        active_binding: getActiveWorkspaceBinding(domain.domain_id),
        owned_workstreams: domain.owned_workstreams,
      })),
    ],
  };
}

export function buildOplStart(
  contracts: GatewayContracts,
  options: StartSurfaceOptions,
) {
  if (!options.projectId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'start requires a non-empty project_id.',
      {
        required: ['project_id'],
      },
    );
  }

  findDomainOrThrow(contracts, options.projectId);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const entry = domainManifests.projects.find((candidate) => candidate.project_id === options.projectId);

  if (!entry) {
    throw new GatewayContractError(
      'domain_not_found',
      'Requested project is not part of the admitted domain set.',
      {
        project_id: options.projectId,
      },
    );
  }

  if (entry.status !== 'resolved' || !entry.manifest?.product_entry_start) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested project does not currently expose a resolved product_entry_start surface.',
      {
        project_id: options.projectId,
        status: entry.status,
        manifest_command: entry.manifest_command,
        workspace_path: entry.workspace_path,
      },
    );
  }

  const startSurface = entry.manifest.product_entry_start;
  const selectedModeId = options.modeId ?? startSurface.recommended_mode_id;
  const selectedMode = startSurface.modes.find((mode) => mode.mode_id === selectedModeId) ?? null;

  if (!selectedModeId || !selectedMode) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested start mode is not available on the resolved product_entry_start surface.',
      {
        project_id: options.projectId,
        mode_id: options.modeId ?? null,
        available_modes: startSurface.modes.map((mode) => mode.mode_id),
      },
    );
  }

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    product_entry_start: {
      surface_kind: 'opl_product_entry_start',
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      workspace_path: entry.workspace_path,
      manifest_command: entry.manifest_command,
      target_domain_id: entry.manifest.target_domain_id,
      summary: startSurface.summary,
      recommended_mode_id: startSurface.recommended_mode_id,
      selected_mode_id: selectedModeId,
      selected_mode: selectedMode,
      available_modes: startSurface.modes,
      resume_surface: startSurface.resume_surface,
      human_gate_ids: startSurface.human_gate_ids,
    },
  };
}

export function buildOplDashboard(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const endpoints = buildOplRuntimeEndpoints(options.basePath);
  const runtimeModes = readOplRuntimeModes();
  const projects = buildProjectsOverview(contracts).projects;
  const workspace = buildWorkspaceStatus({ workspacePath: options.workspacePath }).workspace;
  const runtimeStatus = buildRuntimeStatus({
    sessionsLimit: options.sessionsLimit,
    ledgerLimit: options.sessionsLimit,
  }).runtime_status;
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const hostedRuntimeReadiness = buildRetiredHostedRuntimeReadiness();
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);
  const currentSurfaceRefs = buildCurrentDashboardSurfaceRefs(options);
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    dashboard: {
      gui_runtime: {
        direct_entry_command: 'opl',
        local_shell_status: 'landed',
        local_web_command: null,
        local_web_status: 'retired',
        desktop_shell_status: 'aionui_shell',
        desktop_default_entry_status: 'release_or_installed_app',
        interaction_mode: runtimeModes.interaction_mode,
        execution_mode: runtimeModes.execution_mode,
        acp_runtime_surface_status: 'landed',
        aionui_adapter_status: 'landed',
        hosted_runtime_readiness: hostedRuntimeReadiness,
        entry_guide_surface: currentSurfaceRefs.entry_guide_surface,
        readiness_surface: currentSurfaceRefs.readiness_surface,
        workspace_registry_status: 'landed',
        session_ledger_status: 'landed',
        handoff_bundle_status: 'landed',
        domain_entry_parity: domainEntryParity,
        recommended_entry_surfaces_count: recommendedEntrySurfaces.length,
        recommended_entry_surfaces: recommendedEntrySurfaces,
        next_major_target: 'opl_acp_runtime_hardening',
        runtime_endpoints: endpoints,
        rollout_board_refs: [
          'docs/references/family-lightweight-direct-entry-rollout-board.md',
          'docs/references/mas-top-level-cutover-board.md',
        ],
        notes: [
          'OPL no longer ships a local 8787 Product API service; GUI/WebUI integration belongs to the OPL-branded AionUI shell path.',
          'Workspace registry, managed session ledger, handoff bundle, and current Codex/Hermes mode selection are all visible from the same top-level board.',
          '`opl workspace list` keeps `manifest_command` as non-executing registry state, while `opl domain manifests` resolves the active bound machine-readable product-entry manifests.',
          'Resolved domain manifests now also feed domain entry surface plus operator-loop actions and recommended shell/command hints back into dashboard and handoff surfaces.',
          'Resolved domain manifests now also surface family-orchestration companion previews so the top-level product API board can show human-gate and resume semantics instead of hiding them in domain docs.',
          'The GUI mainline should live in the opl-aion-shell repo as an OPL-branded shell built on the AionUI codebase, while this repo stays headless and contract-first.',
        ],
      },
      projects,
      workspace,
      workspace_catalog: workspaceCatalog,
      domain_manifests: domainManifests,
      runtime_status: runtimeStatus,
    },
  };
}
