import { assert, fs, os, path, runCli, test } from '../../helpers.ts';

test('App action changes only the persisted user lifecycle for one canonical work item', () => {
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

    const ledger = JSON.parse(fs.readFileSync(path.join(stateRoot, 'work-item-control-ledger.json'), 'utf8'));
    assert.equal(ledger.items.length, 1);
    assert.equal(ledger.items[0].lifecycle_state, 'delivered_paused');
    assert.equal(ledger.transitions.length, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
