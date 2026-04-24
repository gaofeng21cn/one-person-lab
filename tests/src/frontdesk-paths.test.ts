import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildFrontDeskEndpoints } from '../../src/frontdesk-paths.ts';
import { resolveFrontDeskStatePaths } from '../../src/frontdesk-state.ts';

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

test('frontdesk state paths default to OPL state dir and ignore retired frontdesk legacy state paths', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-paths-'));
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;

  delete process.env.OPL_STATE_DIR;
  process.env.HOME = homeRoot;

  try {
    const baseDir = path.join(homeRoot, 'Library', 'Application Support', 'OPL');
    const expectedStateDir = path.join(baseDir, 'state');
    assert.equal(resolveFrontDeskStatePaths().state_dir, expectedStateDir);

    fs.mkdirSync(path.join(baseDir, 'frontdesk'), { recursive: true });
    assert.equal(resolveFrontDeskStatePaths().state_dir, expectedStateDir);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
