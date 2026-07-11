import { assert, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';

test('app action execute manages connection registry through handle-only payloads', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-connections-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const created = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'connection_create',
      '--payload',
      JSON.stringify({
        connection_id: 'primary',
        name: 'Primary API',
        connection_type: 'http_api',
        endpoint: 'https://api.example.test',
        credential_handle: 'env:PRIMARY_API_TOKEN',
      }),
    ], env).app_action_execution;
    assert.equal(created.delegated_surface, 'opl connect connections create');
    assert.equal(created.result.connection_registry.connection.connection_id, 'primary');
    assert.equal(created.result.connection_registry.connection.status, 'untested');

    const defaulted = runCli([
      'app', 'action', 'execute', '--action', 'connection_set_default',
      '--payload', '{"connection_id":"primary"}',
    ], env).app_action_execution;
    assert.equal(defaulted.result.connection_registry.default_connection_id, 'primary');

    const tested = runCli([
      'app', 'action', 'execute', '--action', 'connection_test',
      '--payload', '{"connection_id":"primary"}',
    ], { ...env, PRIMARY_API_TOKEN: 'test-secret-value' }).app_action_execution;
    assert.equal(tested.result.connection_test.status, 'ready');
    assert.equal(tested.result.connection_test.runtime_readiness_claimed, false);
    assert.equal(/body|header|secret/i.test(JSON.stringify(tested.result.connection_test)), false);

    const listed = runCli([
      'app', 'action', 'execute', '--action', 'connection_list',
    ], env).app_action_execution;
    assert.equal(listed.result.connection_registry.connections.length, 1);
    assert.equal(listed.result.connection_registry.connections[0].credential_handle, 'env:PRIMARY_API_TOKEN');

    const rejected = runCliFailure([
      'app', 'action', 'execute', '--action', 'connection_update',
      '--payload', '{"connection_id":"primary","token":"plain-text-token"}',
    ], env);
    assert.equal(rejected.payload.error.details.reason_code, 'credential_payload_forbidden');
    assert.equal(
      fs.readFileSync(path.join(stateDir, 'connection-registry.json'), 'utf8').includes('plain-text-token'),
      false,
    );

    const defaultDelete = runCliFailure([
      'app', 'action', 'execute', '--action', 'connection_delete',
      '--payload', '{"connection_id":"primary"}',
    ], env);
    assert.equal(defaultDelete.payload.error.details.reason_code, 'default_connection_delete_forbidden');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('Settings read model exposes typed connection registry and actions', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-connections-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    runCli([
      'app', 'action', 'execute', '--action', 'connection_create',
      '--payload', JSON.stringify({
        connection_id: 'disabled-api',
        name: 'Disabled API',
        connection_type: 'http_api',
        endpoint: 'https://api.example.test',
        credential_handle: 'env:DISABLED_API_TOKEN',
        disabled: true,
      }),
    ], { HOME: homeRoot, OPL_STATE_DIR: stateDir });

    const state = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }).app_state.settings_control_center;

    assert.deepEqual(
      state.connection_registry.allowed_statuses,
      ['untested', 'ready', 'attention_needed', 'disabled'],
    );
    assert.equal(state.connection_registry.connections[0].status, 'disabled');
    assert.equal(state.app_settings_read_model.connections.source_ref, 'app_state.settings_control_center.connection_registry');
    for (const actionId of [
      'connection_list',
      'connection_create',
      'connection_update',
      'connection_delete',
      'connection_test',
      'connection_set_default',
    ]) {
      assert.equal(state.allowed_action_ids.includes(actionId), true);
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
