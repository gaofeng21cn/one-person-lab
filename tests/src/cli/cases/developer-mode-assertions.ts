import { assert } from '../helpers.ts';

const developerModeActionFields = [
  'developerSupervisorEnabled',
  'developerSupervisorMode',
  'developerSupervisorAutoEnableGithubLogin',
  'developerSupervisorModuleId',
  'developerSupervisorModuleSource',
];

export function assertDeveloperModeAction(action: any) {
  assert.equal(action.action_id, 'developer_supervisor');
  assert.equal(action.endpoint, '/api/opl/system/actions');
  assert.equal(action.method, 'POST');
  assert.deepEqual(action.request_fields, developerModeActionFields);
  assert.deepEqual(action.payload_template, {
    action: 'developer_supervisor',
  });
}

export function assertBlockedDeveloperModeSurface(developerMode: any) {
  assert.equal(developerMode.surface_id, 'opl_developer_mode');
  assert.equal(developerMode.status, 'blocked');
  assert.equal(developerMode.setting_status, 'config_surface_available');
  assert.equal(developerMode.runtime_projection_status, 'blocked');
  assert.equal(developerMode.enabled, 'auto');
  assert.equal(developerMode.effective_state, 'blocked');
  assert.equal(developerMode.mode, 'developer_apply_safe');
  assert.equal(developerMode.auto_enable_github_login, 'gaofeng21cn');
  assert.equal(developerMode.config_source, 'default');
  assert.equal(developerMode.allowed_route, 'blocked');
  assert.deepEqual(developerMode.developer_profile, {
    profile_id: 'contributor',
    status: 'blocked',
    level: 'contributor',
    source: 'github_identity_unavailable',
    impact: 'Developer Mode repair and runtime mutation routes are blocked until GitHub identity is available.',
  });
  assert.deepEqual(developerMode.capabilities.github_authority, {
    status: 'blocked',
    level: 'blocked',
    source: 'github_identity_unavailable',
    impact: 'Cannot determine direct write or pull request authority.',
  });
  assert.deepEqual(developerMode.capabilities.runtime_mutation_scope, {
    status: 'blocked',
    level: 'blocked_developer_checkout_shared_state',
    source: 'explicit_user_config_required',
    impact: 'Shared runtime mutation requires enabled=on, developer_apply_safe mode, and user_config source.',
  });
  assert.equal(developerMode.github_identity.status, 'unavailable');
  assert.equal(developerMode.github_identity.login, null);
  assert.equal(developerMode.github_identity.source, 'gh_cli');
  assert.equal(developerMode.repo_authority.status, 'blocked');
  assert.equal(developerMode.repo_authority.direct_write_repo_count, 0);
  assert.equal(developerMode.repo_authority.pr_route_repo_count, 0);
  assert.equal(developerMode.repo_authority.blocked_repo_count, developerMode.repo_authority.required_repo_count);
  assert.equal(developerMode.endpoint, '/api/opl/system/settings');
  assert.equal(developerMode.action_endpoint, '/api/opl/system/actions');
  assertDeveloperModeAction(developerMode.action);
  assert.equal(developerMode.app_settings.consumes_system_action, 'developer_supervisor');
  assert.equal(developerMode.capability_projection.github_identity_detection, 'unavailable');
  assert.equal(developerMode.capability_projection.repository_permission_detection, 'blocked');
  assert.equal(
    developerMode.capability_projection.console_outer_inspection,
    'console_developer_mode_repair_routes_ready',
  );
  assert.equal(developerMode.capability_projection.repo_repair_pull_request_route, 'blocked');
}
