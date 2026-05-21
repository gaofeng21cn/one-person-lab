import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('runtime app-operator-drilldown exposes the App read model without raw snapshot fan-out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-direct-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(output.runtime_tray_snapshot, undefined);
    assert.equal(
      output.app_operator_drilldown.surface_kind,
      'opl_app_operator_drilldown_read_model',
    );
    assert.equal(output.app_operator_drilldown.consumer, 'one_person_lab_app_operator_workbench');
    assert.equal(output.app_operator_drilldown.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_operator_drilldown.authority_boundary.can_read_memory_body, false);
    assert.equal(output.app_operator_drilldown.authority_boundary.can_read_artifact_body, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
