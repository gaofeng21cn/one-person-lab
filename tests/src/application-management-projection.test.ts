import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildApplicationManagementProjection,
  compactFastApplicationManagementProjection,
} from '../../src/read-models/operator/application-management-projection.ts';

function fixture() {
  return buildApplicationManagementProjection({
    agentPackages: {
      directory: { entries: [{ package_id: 'agent.demo' }] },
      status_index: { packages: { 'agent.demo': { dependency_readiness: { checks: [] } } } },
    },
    managedUpdate: {
      components: [{
        component_id: 'opl_base',
        current: { dependency_catalog: { flow_dependencies: [{
          dependency_id: 'officecli', label: 'OfficeCLI', installed: true,
          observed_status: 'ready', currentness: 'current', relationship: 'required',
        }] } },
      }],
    },
    settingsControlCenter: {
      connection_registry: {
        connections: [{ connection_id: 'github', display_name: 'GitHub', status: 'ready' }],
      },
      connection_authorization: {
        grants: [{ connection_id: 'github', package_id: 'agent.demo', status: 'granted' }],
      },
      app_settings_read_model: {
        codex_model_policy: { model: 'gpt-6', model_access_ready: true },
      },
    },
    workspaceBindings: [{
      binding_id: 'binding.demo',
      project_scope_id: 'scope.demo',
      project_id: 'project.demo',
      project: 'Demo',
      workspace_path: '/private/path/must-not-leak',
      label: 'Demo knowledge',
      status: 'active',
      direct_entry: { command: null, manifest_command: null, url: null, workspace_locator: null },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      archived_at: null,
    }],
  });
}

test('application management aggregates owner projections without secrets or knowledge bodies', () => {
  const projection = fixture();
  assert.deepEqual(
    projection.shared_resources.map((resource) => [resource.resource_id, resource.status]),
    [['base:officecli', 'ready'], ['connection:github', 'ready'], ['model:codex', 'ready'], ['knowledge:project.demo', 'unknown']],
  );
  assert.equal(JSON.stringify(projection).includes('/private/path/must-not-leak'), false);
  assert.equal(projection.authority_boundary.second_registry, false);
  assert.equal(projection.authority_boundary.second_updater, false);
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'model:codex')?.consumer_package_ids, []);
});

test('fast projection stays bounded and keeps the full-detail ref', () => {
  const compact = compactFastApplicationManagementProjection(fixture());
  assert.equal(compact.surface_kind, 'opl_application_management_projection.v1');
  assert.equal(compact.detail_policy.full_detail_surface, 'opl app state --profile full --json#application_management');
  assert.equal(compact.shared_resources.length, 4);
  assert.deepEqual(compact.source_refs, [
    'app_state.agent_packages.directory.entries',
    'app_state.agent_packages.status_index',
    'app_state.managed_update',
    'app_state.settings_control_center.connection_authorization',
    'app_state.settings_control_center.connection_registry',
    'app_state.settings_control_center.app_settings_read_model.codex_model_policy',
    'app_state.paths.workspace_root',
  ]);
});
