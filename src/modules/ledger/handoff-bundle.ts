import { findDomainOrThrow } from '../charter/index.ts';
import { buildDomainManifestCatalog } from '../atlas/index.ts';
import { buildDomainEntryParity, buildRecommendedEntrySurfaces } from '../atlas/index.ts';
import { resolveWorkspaceLocator } from '../workspace/index.ts';
import { buildOplRuntimeEndpoints } from '../runway/index.ts';
import type { HandoffBundleResult } from './handoff-bundle-types.ts';
import type { BoundaryExplanation, FrameworkContracts, ResolutionResult } from '../../kernel/types.ts';

type BuildHandoffBundleOptions = {
  mode: string;
  goal: string;
  intent: string;
  workspacePath?: string;
  stageSelection: ResolutionResult;
  boundary: BoundaryExplanation;
  sessionId?: string | null;
  basePath?: string;
};

function resolveSelectedDomainId(stageSelection: ResolutionResult) {
  if ('domain_id' in stageSelection && typeof stageSelection.domain_id === 'string') {
    return stageSelection.domain_id;
  }

  return null;
}

export function buildHandoffBundle(
  contracts: FrameworkContracts,
  options: BuildHandoffBundleOptions,
): HandoffBundleResult {
  const targetDomainId = resolveSelectedDomainId(options.stageSelection);
  const domain = targetDomainId ? findDomainOrThrow(contracts, targetDomainId) : null;
  const workspaceLocator = targetDomainId
    ? resolveWorkspaceLocator(targetDomainId, options.workspacePath)
    : {
        project_id: null,
        requested_path: options.workspacePath ?? null,
        absolute_path: options.workspacePath ?? null,
        source: options.workspacePath ? 'explicit_path' : 'none',
        binding: null,
      };
  const domainManifestCatalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const domainManifestEntry = targetDomainId
    ? domainManifestCatalog.projects.find(
        (entry) => entry.project_id === targetDomainId,
      ) ?? null
    : null;
  const domainEntryParity = buildDomainEntryParity(domainManifestCatalog.projects);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifestCatalog.projects);
  const domainManifestRecommendation = targetDomainId
    ? recommendedEntrySurfaces.find((entry) => entry.project_id === targetDomainId) ?? null
    : null;
  const endpoints = buildOplRuntimeEndpoints(options.basePath);

  return {
    handoff_bundle: {
      surface_id: 'opl_family_handoff_bundle',
      target_domain_id: targetDomainId,
      task_intent: options.intent,
      entry_mode: 'product_entry_handoff',
      request_goal: options.goal,
      stage_selection_status: options.stageSelection.status,
      boundary_status: options.boundary.boundary_status,
      workspace_locator: {
        project_id: workspaceLocator.project_id,
        requested_path: workspaceLocator.requested_path,
        absolute_path: workspaceLocator.absolute_path,
        source: workspaceLocator.source,
        binding_id: workspaceLocator.binding?.binding_id ?? null,
      },
      runtime_session_contract: {
        runtime_substrate: 'codex_default_executor_with_provider_backed_family_runtime',
        source_surface: 'opl_local_product_entry_shell',
        session_id: options.sessionId ?? null,
        resume_mode: options.sessionId ? 'session_id_ready' : 'session_id_pending',
      },
      return_surface_contract: {
        opl: {
          resume_command: 'opl session resume <session_id>',
          runtime_status_command: 'opl status runtime --limit 10',
          dashboard_command: 'opl status dashboard',
          resume_endpoint: endpoints.resume,
          logs_endpoint: endpoints.logs,
          dashboard_endpoint: endpoints.dashboard,
        },
      },
      domain_direct_entry: workspaceLocator.binding?.direct_entry
        ? {
            project_id: workspaceLocator.binding.project_id,
            command: workspaceLocator.binding.direct_entry.command,
            manifest_command: workspaceLocator.binding.direct_entry.manifest_command,
            url: workspaceLocator.binding.direct_entry.url,
            workspace_locator: workspaceLocator.binding.direct_entry.workspace_locator,
            workspace_path: workspaceLocator.binding.workspace_path,
          }
        : null,
      domain_manifest_recommendation: domainManifestEntry
        ? {
            project_id: domainManifestEntry.project_id,
            project: domainManifestEntry.project,
            status: domainManifestEntry.status,
            manifest_command: domainManifestEntry.manifest_command,
            binding_id: domainManifestEntry.binding_id,
            workspace_path: domainManifestEntry.workspace_path,
            manifest_target_domain_id: domainManifestEntry.manifest?.target_domain_id ?? null,
            product_entry_surface: domainManifestEntry.manifest?.product_entry_surface ?? null,
            operator_loop_surface: domainManifestEntry.manifest?.operator_loop_surface ?? null,
            operator_loop_actions: domainManifestEntry.manifest?.operator_loop_actions ?? {},
            recommended_shell: domainManifestEntry.manifest?.recommended_shell ?? null,
            recommended_command: domainManifestEntry.manifest?.recommended_command ?? null,
            formal_entry: domainManifestEntry.manifest?.formal_entry ?? null,
            runtime: domainManifestEntry.manifest?.runtime ?? null,
            repo_mainline: domainManifestEntry.manifest?.repo_mainline ?? null,
            domain_agent_entry_spec:
              domainManifestEntry.manifest?.domain_entry_contract?.domain_agent_entry_spec ?? null,
            product_entry_status: domainManifestEntry.manifest?.product_entry_status ?? null,
            product_entry_start: domainManifestEntry.manifest?.product_entry_start ?? null,
            product_entry_preflight: domainManifestEntry.manifest?.product_entry_preflight ?? null,
            product_entry_readiness: domainManifestEntry.manifest?.product_entry_readiness ?? null,
            product_entry_shell: domainManifestEntry.manifest?.product_entry_shell ?? {},
            shared_handoff: domainManifestEntry.manifest?.shared_handoff ?? null,
            product_entry_overview: domainManifestEntry.manifest?.product_entry_overview ?? null,
            product_entry_quickstart: domainManifestEntry.manifest?.product_entry_quickstart ?? null,
            family_orchestration: domainManifestEntry.manifest?.family_orchestration ?? null,
            runtime_inventory: domainManifestEntry.manifest?.runtime_inventory ?? null,
            task_lifecycle: domainManifestEntry.manifest?.task_lifecycle ?? null,
            runtime_control: domainManifestEntry.manifest?.runtime_control ?? null,
            session_continuity: domainManifestEntry.manifest?.session_continuity ?? null,
            progress_projection: domainManifestEntry.manifest?.progress_projection ?? null,
            artifact_inventory: domainManifestEntry.manifest?.artifact_inventory ?? null,
            skill_catalog: domainManifestEntry.manifest?.skill_catalog ?? null,
            automation: domainManifestEntry.manifest?.automation ?? null,
            ...(domainManifestRecommendation ?? {}),
            error: domainManifestEntry.error,
          }
        : null,
      domain_entry_parity: domainEntryParity,
      domain_context: domain
        ? {
            project: domain.project,
            independent_domain_agent: domain.independent_domain_agent,
            single_app_skill: domain.single_app_skill,
            domain_truth_owner: domain.domain_truth_owner,
            opl_projection_role: domain.opl_projection_role,
            runtime_dependency_boundary: domain.runtime_dependency_boundary,
          }
        : null,
      notes: [
        'This handoff bundle freezes the family-level transfer from OPL product entry into a domain direct entry or domain-agent entry.',
        'A domain direct-entry locator is only included when the workspace registry has one configured for the selected project.',
        'When a selected domain publishes a machine-readable manifest, the same bundle also carries the selected direct-entry surface plus recommended shell and command so callers do not have to guess the next step.',
      ],
    },
  };
}
