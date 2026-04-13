import { findDomainOrThrow } from './contracts.ts';
import { resolveWorkspaceLocator } from './workspace-registry.ts';
import { buildFrontDeskEndpoints } from './frontdesk-paths.ts';
import type { BoundaryExplanation, GatewayContracts, ResolutionResult } from './types.ts';

type BuildHandoffBundleOptions = {
  mode: string;
  goal: string;
  intent: string;
  workspacePath?: string;
  routing: ResolutionResult;
  boundary: BoundaryExplanation;
  sessionId?: string | null;
  basePath?: string;
};

function resolveRoutedDomainId(routing: ResolutionResult) {
  if ('domain_id' in routing && typeof routing.domain_id === 'string') {
    return routing.domain_id;
  }

  return null;
}

export function buildHandoffBundle(
  contracts: GatewayContracts,
  options: BuildHandoffBundleOptions,
) {
  const targetDomainId = resolveRoutedDomainId(options.routing);
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
  const endpoints = buildFrontDeskEndpoints(options.basePath);

  return {
    handoff_bundle: {
      surface_id: 'opl_family_handoff_bundle',
      target_domain_id: targetDomainId,
      task_intent: options.intent,
      entry_mode: 'product_entry_handoff',
      request_goal: options.goal,
      routing_status: options.routing.status,
      boundary_status: options.boundary.boundary_status,
      workspace_locator: {
        project_id: workspaceLocator.project_id,
        requested_path: workspaceLocator.requested_path,
        absolute_path: workspaceLocator.absolute_path,
        source: workspaceLocator.source,
        binding_id: workspaceLocator.binding?.binding_id ?? null,
      },
      runtime_session_contract: {
        runtime_substrate: 'external_hermes_kernel',
        source_surface: 'opl_local_product_entry_shell',
        session_id: options.sessionId ?? null,
        resume_mode: options.sessionId ? 'session_id_ready' : 'session_id_pending',
      },
      return_surface_contract: {
        opl: {
          resume_command: 'opl resume <session_id>',
          logs_command: 'opl logs gateway --session <session_id>',
          dashboard_command: 'opl dashboard',
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
            workspace_path: workspaceLocator.binding.workspace_path,
          }
        : null,
      domain_context: domain
        ? {
            project: domain.project,
            gateway_surface: domain.gateway_surface,
            harness_surface: domain.harness_surface,
          }
        : null,
      notes: [
        'This handoff bundle freezes the family-level transfer from OPL product entry into a domain direct entry or domain gateway.',
        'A domain direct-entry locator is only included when the workspace registry has one configured for the routed project.',
      ],
    },
  };
}
