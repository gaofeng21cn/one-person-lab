import { buildFrontDeskWorkspaceRootSurface } from '../frontdesk-installation.ts';
import { buildOplApiCatalog } from '../opl-api-paths.ts';
import { readFrontDeskRuntimeModes, type FrontDeskRuntimeModes } from '../frontdesk-runtime-modes.ts';
import type { WebFrontDeskContext, WebFrontDeskStartupPayload } from './types.ts';

export function buildOplWorkspaceRootPayload(payload = buildFrontDeskWorkspaceRootSurface()) {
  return {
    version: 'g2' as const,
    workspace_root: {
      surface_id: 'opl_workspace_root',
      ...payload.workspace_root,
    },
  };
}

export function buildOplSystemSettingsPayload(payload: FrontDeskRuntimeModes = readFrontDeskRuntimeModes()) {
  return {
    version: 'g2' as const,
    system_settings: {
      surface_id: 'opl_system_settings',
      ...payload,
    },
  };
}

export function buildStartupPayload(context: WebFrontDeskContext): WebFrontDeskStartupPayload {
  const api = buildOplApiCatalog(context.basePath);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: context.contracts.contractsDir,
      contracts_root_source: context.contracts.contractsRootSource,
    },
    opl_api: {
      surface_id: 'opl_product_api_bootstrap',
      entry_surface: 'opl_product_api',
      runtime_substrate: 'external_hermes_kernel',
      mode: 'local_product_api_adapter',
      local_shell_command: 'opl web',
      local_only: true,
      listening: {
        host: context.host,
        port: context.port,
        base_url: context.baseUrl,
        entry_url: context.entryUrl,
        base_path: context.basePath,
      },
      resources: api.resources,
      actions: api.actions,
      debug: api.debug,
      runtime_modes: readFrontDeskRuntimeModes(),
      defaults: {
        workspace_path: context.workspacePath,
        sessions_limit: context.sessionsLimit,
      },
      recommended_gui_overlay: 'aionui_shell',
      notes: [
        'This bootstrap surface exposes the current OPL Product API for external GUI overlays.',
        'System, engines, modules, agents, workspaces, sessions, progress, and artifacts are available as first-class resources.',
        'OPL main repo stays headless while external overlays consume this product API.',
      ],
    },
  };
}

export function buildWebFrontDeskRootPayload(context: WebFrontDeskContext) {
  const bootstrap = buildStartupPayload(context);

  return {
    version: 'g2',
    contracts_context: bootstrap.contracts_context,
    opl_api: {
      surface_id: 'opl_product_api_root',
      entry_surface: bootstrap.opl_api.entry_surface,
      runtime_substrate: bootstrap.opl_api.runtime_substrate,
      mode: 'api_only',
      local_shell_command: bootstrap.opl_api.local_shell_command,
      shell_integration_target: 'external_gui_overlay',
      summary: 'OPL serves headless product API resources for external GUI overlays and desktop shells.',
      listening: bootstrap.opl_api.listening,
      resources: bootstrap.opl_api.resources,
      actions: bootstrap.opl_api.actions,
      debug: bootstrap.opl_api.debug,
      defaults: bootstrap.opl_api.defaults,
      runtime_modes: bootstrap.opl_api.runtime_modes,
      recommended_gui_overlay: 'aionui_shell',
      notes: [
        'Use an external GUI overlay to consume these product API resources.',
        'OPL main repo now stays headless and contract-first.',
        'Debug and legacy routes remain internal implementation details while the public product API keeps stabilizing.',
      ],
    },
  };
}
