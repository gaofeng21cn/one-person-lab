import { assert, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';

test('App actions persist lifecycle and visibility independently with one generation gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-work-item-control-'));
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_DEVELOPER_MODE_GH_BINARY: path.join(stateRoot, 'missing-gh'),
  };
  const payload = {
    agent_id: 'mas',
    project_id: 'diabetes',
    work_item_id: 'dm-002',
    lifecycle_state: 'delivered_paused',
    reason: 'milestone submission package delivered',
    expected_generation: 0,
  };
  try {
    const preview = runCli([
      'app', 'action', 'execute',
      '--action', 'work_item_lifecycle_set',
      '--payload', JSON.stringify(payload),
      '--dry-run',
    ], env).app_action_execution;
    assert.equal(preview.result.status, 'dry_run');
    assert.equal(preview.result.authority_boundary.can_write_domain_truth, false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'work-item-control-ledger.json')), false);

    const applied = runCli([
      'app', 'action', 'execute',
      '--action', 'work_item_lifecycle_set',
      '--payload', JSON.stringify(payload),
    ], env).app_action_execution;
    assert.equal(applied.delegated_surface, 'OPL Ledger work-item control transition');
    assert.equal(applied.result.status, 'applied');

    const ledgerFile = path.join(stateRoot, 'work-item-control-ledger.json');
    const lifecycleBytes = fs.readFileSync(ledgerFile, 'utf8');
    const visibilityPayload = {
      agent_id: payload.agent_id,
      project_id: payload.project_id,
      work_item_id: payload.work_item_id,
      visibility_state: 'archived',
      reason: 'move to archive library',
      expected_generation: 1,
    };
    const visibilityPreview = runCli([
      'app', 'action', 'execute',
      '--action', 'work_item_visibility_set',
      '--payload', JSON.stringify(visibilityPayload),
      '--dry-run',
    ], env).app_action_execution;
    assert.equal(visibilityPreview.result.status, 'dry_run');
    assert.equal(visibilityPreview.result.control_axis, 'visibility');
    assert.equal(visibilityPreview.result.current.lifecycle_state, 'delivered_paused');
    assert.equal(fs.readFileSync(ledgerFile, 'utf8'), lifecycleBytes);

    const archived = runCli([
      'app', 'action', 'execute',
      '--action', 'work_item_visibility_set',
      '--payload', JSON.stringify(visibilityPayload),
    ], env).app_action_execution;
    assert.equal(archived.delegated_surface, 'OPL Ledger work-item visibility transition');
    assert.equal(archived.result.current.visibility_state, 'archived');
    assert.equal(archived.result.current.lifecycle_state, 'delivered_paused');
    assert.equal(archived.result.authority_boundary.visibility_mutation_stops_runtime, false);

    const lifecycleResumed = runCli([
      'app', 'action', 'execute',
      '--action', 'work_item_lifecycle_set',
      '--payload', JSON.stringify({
        ...payload,
        lifecycle_state: 'active',
        reason: 'resume business lifecycle',
        expected_generation: 2,
      }),
    ], env).app_action_execution;
    assert.equal(lifecycleResumed.result.current.lifecycle_state, 'active');
    assert.equal(lifecycleResumed.result.current.visibility_state, 'archived');

    const staleRestore = runCliFailure([
      'app', 'action', 'execute',
      '--action', 'work_item_visibility_set',
      '--payload', JSON.stringify({
        ...visibilityPayload,
        visibility_state: 'visible',
        expected_generation: 2,
      }),
    ], env);
    assert.equal(staleRestore.payload.error.code, 'cli_usage_error');
    assert.equal(
      staleRestore.payload.error.details.reason_code,
      'work_item_control_generation_conflict',
    );
    assert.equal(staleRestore.payload.error.details.current_generation, 3);

    const restored = runCli([
      'app', 'action', 'execute',
      '--action', 'work_item_visibility_set',
      '--payload', JSON.stringify({
        ...visibilityPayload,
        visibility_state: 'visible',
        reason: 'restore to default project list',
        expected_generation: 3,
      }),
    ], env).app_action_execution;
    assert.equal(restored.result.current.lifecycle_state, 'active');
    assert.equal(restored.result.current.visibility_state, 'visible');

    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    assert.equal(ledger.surface_kind, 'opl_work_item_control_ledger.v2');
    assert.equal(ledger.version, 2);
    assert.equal(ledger.generation, 4);
    assert.equal(ledger.items.length, 1);
    assert.equal(ledger.items[0].lifecycle_state, 'active');
    assert.equal(ledger.items[0].visibility_state, 'visible');
    assert.deepEqual(
      ledger.transitions.map((transition: { control_axis: string }) => transition.control_axis),
      ['visibility', 'lifecycle', 'visibility', 'lifecycle'],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
