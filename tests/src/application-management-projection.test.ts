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
          { connection_id: 'rotated', name: 'Rotated', status: 'ready' },
          { connection_id: 'mixed', name: 'Mixed', status: 'ready' },
        ],
      },
      connection_authorization: {
        grants: [
          { connection_id: 'github', consumer_package_id: 'agent.demo', status: 'granted' },
          { connection_id: 'disabled', consumer_package_id: 'agent.demo', status: 'granted' },
          { connection_id: 'stale', consumer_package_id: 'agent.demo', status: 'stale' },
          { connection_id: 'rotated', consumer_package_id: 'agent.demo', status: 'stale' },
          { connection_id: 'rotated', consumer_package_id: 'agent.demo', status: 'granted' },
          { connection_id: 'mixed', consumer_package_id: 'agent.demo', status: 'granted' },
          { connection_id: 'mixed', consumer_package_id: 'other.agent', status: 'stale' },
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
      ['connection:rotated', 'ready'],
      ['connection:mixed', 'attention'],
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
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:rotated')?.authorization, {
    status: 'authorized', consumer_count: 1, grant_count: 2,
  });
  assert.deepEqual(projection.shared_resources.find((resource) => resource.resource_id === 'connection:mixed')?.readiness, {
    status: 'attention', reason: 'consumer_grant_stale_or_revoked',
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
  assert.equal(compact.shared_resources.length, 7);
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
    source_id: 'obsidian.personal',
    label: 'Obsidian personal vault',
    status: 'ready',
    source_refs: ['app_state.settings_control_center.app_settings_read_model.resource_sources.items[source_id=obsidian.personal]'],
    consumer_package_ids: [],
    scope_ids: [],
    action_ids: [],
    owner_settings_route: 'resources',
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


test('connection resources expose safe owner actions and active capabilities without duplicating Gateway', () => {
  const projection = buildApplicationManagementProjection({
    agentPackages: {}, managedUpdate: {}, settingsControlCenter: {
      connection_registry: { connections: [
        { connection_id: 'opl-gateway-account', connection_type: 'opl_gateway_account', name: 'Gateway', status: 'ready' },
        { connection_id: 'mail-main', connection_type: 'opl-relay', name: 'Work mailbox', status: 'ready', credential_handle: 'secret-ref', endpoint: '/private/location' },
      ] },
      connection_authorization: {
        connections: [{ connection_id: 'mail-main', provider_type: 'opl-relay', account_label: 'work@example.test' }],
        grants: [
          { connection_id: 'mail-main', consumer_package_id: 'relay', status: 'granted', capability_ids: ['mailbox.search', 'mailbox.read'] },
          { connection_id: 'mail-main', consumer_package_id: 'old', status: 'revoked', capability_ids: ['draft.create'] },
        ],
      },
      app_settings_read_model: { connections: { action_ids: ['connection_test', 'connection_update'] } },
    },
  });
  assert.equal(projection.shared_resources.length, 1);
  const connection = projection.shared_resources[0]!;
  assert.equal(connection.owner, 'opl-connect');
  assert.equal(connection.connection_id, 'mail-main');
  assert.equal(connection.provider_type, 'opl-relay');
  assert.equal(connection.account_label, 'work@example.test');
  assert.deepEqual(connection.capability_ids, ['mailbox.read', 'mailbox.search']);
  assert.deepEqual(connection.action_ids, ['connection_test', 'connection_update']);
  assert.equal(JSON.stringify(connection).includes('secret-ref'), false);
  assert.equal(JSON.stringify(connection).includes('/private/location'), false);
});

test('missing model access observation remains unknown and exposes only declared owner actions', () => {
  const projection = buildApplicationManagementProjection({
    agentPackages: {}, managedUpdate: {}, settingsControlCenter: { app_settings_read_model: {
      codex_model_policy: { model: 'gpt-6', model_provider: 'gateway', repair_action_id: 'settings_repair_model_access' },
      action_policy: { allowed_action_ids: ['settings_repair_model_access'] },
    } },
  });
  assert.equal(projection.shared_resources[0]?.status, 'unknown');
  assert.equal(projection.shared_resources[0]?.readiness?.status, 'unknown');
  assert.equal(projection.shared_resources[0]?.owner, 'account-and-access');
  assert.deepEqual(projection.shared_resources[0]?.action_ids, ['settings_repair_model_access']);
});
