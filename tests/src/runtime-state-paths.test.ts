import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOplEndpoints } from '../../src/kernel/opl-runtime-endpoints.ts';
import { resolveOplStatePaths } from '../../src/modules/runway/runtime-state-paths.ts';

test('OPL endpoint catalog advertises current runtime URLs for public resources and actions', () => {
  const endpoints = buildOplEndpoints('/pilot/opl');

  assert.equal(endpoints.system_environment, '/pilot/opl/api/opl/system');
  assert.equal(endpoints.system_initialize, '/pilot/opl/api/opl/system/initialize');
  assert.equal(endpoints.system_settings, '/pilot/opl/api/opl/system/settings');
  assert.equal(endpoints.modules, '/pilot/opl/api/opl/modules');
  assert.equal(endpoints.engine_action, '/pilot/opl/api/opl/engines/actions');
  assert.equal(endpoints.module_action, '/pilot/opl/api/opl/modules/actions');
  assert.equal(endpoints.system_action, '/pilot/opl/api/opl/system/actions');
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

test('OPL state paths honor the explicit current state dir and ignore old UI adapter state paths', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-paths-'));
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;

  process.env.HOME = homeRoot;

  try {
    const baseDir = path.join(homeRoot, 'Library', 'Application Support', 'OPL');
    const expectedStateDir = path.join(baseDir, 'state');
    process.env.OPL_STATE_DIR = expectedStateDir;
    const paths = resolveOplStatePaths();
    assert.equal(paths.state_dir, expectedStateDir);
    assert.equal(paths.developer_supervisor_config_file, path.join(expectedStateDir, 'developer-supervisor.json'));
    assert.equal(
      paths.owner_evidence_sustained_consumption_ledger_file,
      path.join(expectedStateDir, 'owner-evidence-sustained-consumption-ledger.json'),
    );
    assert.equal(Object.keys(paths).some((key) => key.startsWith('oma_') || key.startsWith('mag_')), false);
    assert.equal(
      paths.app_release_user_path_evidence_ledger_file,
      path.join(expectedStateDir, 'app-release-user-path-evidence-ledger.json'),
    );
    assert.equal(
      paths.codex_app_runtime_evidence_ledger_file,
      path.join(expectedStateDir, 'codex-app-runtime-evidence-ledger.json'),
    );
    assert.equal(
      paths.brand_module_l5_evidence_ledger_file,
      path.join(expectedStateDir, 'brand-module-l5-evidence-ledger.json'),
    );

    fs.mkdirSync(path.join(baseDir, 'local-ui-adapter'), { recursive: true });
    assert.equal(resolveOplStatePaths().state_dir, expectedStateDir);
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
