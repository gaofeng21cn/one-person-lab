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
          dependency_id: 'officecli', dependency_kind: 'cli', label: 'OfficeCLI', installed: null,
          status: 'ready', currentness: 'current', relationship: 'required',
          source_path: '/private/path/must-not-leak',
        }] } },
      }],
    },
    settingsControlCenter: {
      connection_registry: {
        connections: [
          { connection_id: 'github', name: 'GitHub', status: 'ready', revision_status: 'current', security_revision: 'security-revision-1', freshness_status: 'fresh', last_tested_at: '2026-11-09T00:00:00.000Z' },
          { connection_id: 'disabled', name: 'Disabled', status: 'disabled' },
          { connection_id: 'stale', name: 'Stale', status: 'ready' },
        ],
      },
      connection_authorization: {
        grants: [
          { connection_id: 'github', consumer_package_id: 'agent.demo', status: 'granted' },
          { connection_id: 'disabled', consumer_package_id: 'agent.demo', status: 'granted' },
          { connection_id: 'stale', consumer_package_id: 'agent.demo', status: 'stale' },
        ],
      },
      app_settings_read_model: {
        codex_model_policy: { model: 'gpt-6', model_access_ready: true },
      },
    },
  });
}

test('application management aggregates owner projections without secrets or knowledge bodies', () => {
  const projection = fixture();
  assert.deepEqual(
    projection.shared_resources.map((resource) => [resource.resource_id, resource.status]),
    [
      ['base:officecli:cli', 'ready'],
      ['connection:github', 'ready'],
      ['connection:disabled', 'attention'],
      ['connection:stale', 'attention'],
      ['model:codex', 'ready'],
    ],
  );
  assert.equal(JSON.stringify(projection).includes('/private/path/must-not-leak'), false);
  assert.equal(projection.shared_resources.some((resource) => resource.resource_kind === 'knowledge_source'), false);
  assert.equal(projection.authority_boundary.second_registry, false);
  assert.equal(projection.authority_boundary.second_updater, false);
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'model:codex')?.consumer_package_ids, []);
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:github')?.authorization, {
    status: 'authorized', consumer_count: 1, grant_count: 1,
  });
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:github')?.revision, {
    status: 'current', security_revision: 'security-revision-1',
  });
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:github')?.freshness, {
    status: 'fresh', observed_at: '2026-11-09T00:00:00.000Z',
  });
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:github')?.readiness, {
    status: 'ready',
  });
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:disabled')?.revision, {
    status: 'unknown',
  });
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:disabled')?.freshness, {
    status: 'unknown',
  });
  assert.equal(
    projection.shared_resources.find((resource) => resource.resource_id === 'connection:disabled')?.reason,
    'connection_disabled',
  );
});

test('fast projection stays bounded and keeps the full-detail ref', () => {
  const compact = compactFastApplicationManagementProjection(fixture());
  assert.equal(compact.surface_kind, 'opl_application_management_projection.v1');
  assert.equal(compact.detail_policy.full_detail_surface, 'opl app state --profile full --json#application_management');
  assert.equal(compact.shared_resources.length, 5);
  assert.deepEqual(compact.source_refs, [
    'app_state.agent_packages.directory.entries',
    'app_state.agent_packages.status_index',
    'app_state.managed_update',
    'app_state.settings_control_center.connection_authorization',
    'app_state.settings_control_center.connection_registry',
    'app_state.settings_control_center.app_settings_read_model.codex_model_policy',
    'app_state.settings_control_center.app_settings_read_model.resource_sources',
  ]);
});

test('base dependency resources keep native status and distinct kind identities', () => {
  const projection = buildApplicationManagementProjection({
    agentPackages: {},
    managedUpdate: {
      components: [{
        component_id: 'opl_base',
        current: { dependency_catalog: { flow_dependencies: [
          { dependency_id: 'officecli', dependency_kind: 'cli', installed: null, status: 'ready', currentness: 'current' },
          { dependency_id: 'officecli', dependency_kind: 'codex_skill', installed: null, status: 'unknown', currentness: 'unknown' },
          { dependency_id: 'agent-reach', dependency_kind: 'cli', installed: null, status: 'ready', currentness: 'update_available' },
        ] } },
      }],
    },
    settingsControlCenter: {},
  });
  assert.deepEqual(projection.shared_resources.map((resource) => [resource.resource_id, resource.status]), [
    ['base:officecli:cli', 'ready'],
    ['base:officecli:codex_skill', 'unknown'],
    ['base:agent-reach:cli', 'attention'],
  ]);
  assert.equal(new Set(projection.shared_resources.map((resource) => resource.source_refs[0])).size, 3);
});

test('knowledge resources consume owner metadata only and never infer consumers or paths', () => {
  const projection = buildApplicationManagementProjection({
    agentPackages: {},
    managedUpdate: {},
    settingsControlCenter: {
      app_settings_read_model: {
        resource_sources: {
          items: [{
            source_id: 'obsidian.personal',
            label: 'Obsidian personal vault',
            status: 'ready',
            source_path: '/private/obsidian',
            body: 'private body must not leak',
          }],
        },
      },
    },
  });
  assert.deepEqual(projection.shared_resources, [{
    resource_id: 'knowledge:obsidian.personal',
    resource_kind: 'knowledge_source',
    label: 'Obsidian personal vault',
    status: 'ready',
    source_refs: ['app_state.settings_control_center.app_settings_read_model.resource_sources[source_id=obsidian.personal]'],
    consumer_package_ids: [],
    owner_settings_route: 'workspace',
    relation_kind: 'configured',
    detail_ref: 'app_state.settings_control_center.app_settings_read_model.resource_sources',
    authorization: { status: 'unknown', consumer_count: 0, grant_count: 0 },
    revision: { status: 'unknown' },
    freshness: { status: 'unknown' },
    readiness: { status: 'ready' },
  }]);
  assert.equal(JSON.stringify(projection).includes('/private/obsidian'), false);
  assert.equal(JSON.stringify(projection).includes('private body must not leak'), false);
});
