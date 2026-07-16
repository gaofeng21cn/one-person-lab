import { buildOplDeveloperModeProjection } from '../developer-mode.ts';
import type { OplEndpoints } from '../../runway/index.ts';
import { readOplWorkspaceRoot } from '../../../kernel/system-preferences.ts';

import type { OplInitializeActionDescriptor } from './shared.ts';

export function buildOplDeveloperModeAction(endpoints: OplEndpoints): OplInitializeActionDescriptor {
  return {
    action_id: 'developer_supervisor',
    label: 'Configure Developer Mode',
    description:
      'Turn Developer Mode on, off, or into observe-only mode for supervised patrol and repository repair routing.',
    section_id: 'settings',
    endpoint: endpoints.system_action,
    method: 'POST',
    request_fields: [
      'developerSupervisorEnabled',
      'developerSupervisorMode',
      'developerSupervisorAutoEnableGithubLogin',
      'developerSupervisorModuleId',
      'developerSupervisorModuleSource',
    ],
    payload_template: {
      action: 'developer_supervisor',
    },
  };
}

export function buildOplDeveloperModeSurface(
  endpoints: OplEndpoints,
  options: { detail?: 'fast' | 'full' } = {},
) {
  const projection = buildOplDeveloperModeProjection(undefined, options);
  const action = buildOplDeveloperModeAction(endpoints);

  return {
    ...projection,
    developer_workspace: readOplWorkspaceRoot(),
    setting_status: 'config_surface_available',
    runtime_projection_status: projection.status,
    description:
      'Developer Mode controls whether OPL may expose supervised patrol, repository repair, and pull request routes from App settings.',
    endpoint: endpoints.system_settings,
    action_endpoint: endpoints.system_action,
    action,
    app_settings: {
      control_kind: 'developer_mode_switch',
      enabled_options: ['auto', 'on', 'off'],
      mode_options: ['external_observe', 'developer_apply_safe'],
      module_source_options: ['auto', 'managed', 'developer'],
      consumes_system_action: 'developer_supervisor',
    },
    capability_projection: {
      github_identity_detection: projection.github_identity.status,
      repository_permission_detection: projection.repo_authority.status,
      console_outer_inspection: 'console_developer_mode_repair_routes_ready',
      repo_repair_pull_request_route: projection.allowed_route,
    },
    notes: [
      'This surface is the App/settings contract for the existing developer_supervisor system action.',
      'Developer Mode authorizes repair and PR routing only; ordinary App runtime continues to use managed environment truth.',
    ],
  };
}
