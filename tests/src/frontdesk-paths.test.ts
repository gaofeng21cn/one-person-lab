import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFrontDeskEndpoints } from '../../src/frontdesk-paths.ts';

test('frontdesk endpoint catalog advertises OPL product API URLs for public resources and actions', () => {
  const endpoints = buildFrontDeskEndpoints('/pilot/opl');

  assert.equal(endpoints.frontdesk_environment, '/pilot/opl/api/opl/system');
  assert.equal(endpoints.frontdesk_initialize, '/pilot/opl/api/opl/system/initialize');
  assert.equal(endpoints.frontdesk_settings, '/pilot/opl/api/opl/system/settings');
  assert.equal(endpoints.frontdesk_modules, '/pilot/opl/api/opl/modules');
  assert.equal(endpoints.frontdesk_engine_action, '/pilot/opl/api/opl/engines/actions');
  assert.equal(endpoints.frontdesk_module_action, '/pilot/opl/api/opl/modules/actions');
  assert.equal(endpoints.frontdesk_system_action, '/pilot/opl/api/opl/system/actions');
  assert.equal(endpoints.hosted_bundle, '/pilot/opl/api/opl/web/bundle');
  assert.equal(endpoints.hosted_package, '/pilot/opl/api/opl/web/package');
  assert.equal(endpoints.workspace_root, '/pilot/opl/api/opl/workspaces/root');
  assert.equal(endpoints.workspace_catalog, '/pilot/opl/api/opl/workspaces');
  assert.equal(endpoints.workspace_bind, '/pilot/opl/api/opl/workspaces/bind');
  assert.equal(endpoints.workspace_activate, '/pilot/opl/api/opl/workspaces/activate');
  assert.equal(endpoints.workspace_archive, '/pilot/opl/api/opl/workspaces/archive');
  assert.equal(endpoints.start, '/pilot/opl/api/opl/start');
  assert.equal(endpoints.launch_domain, '/pilot/opl/api/opl/domain-launch');
  assert.equal(endpoints.handoff_envelope, '/pilot/opl/api/opl/handoff-envelope');
  assert.equal(endpoints.sessions, '/pilot/opl/api/opl/sessions');
  assert.equal(endpoints.resume, '/pilot/opl/api/opl/sessions/resume');
  assert.equal(endpoints.logs, '/pilot/opl/api/opl/sessions/logs');
});
