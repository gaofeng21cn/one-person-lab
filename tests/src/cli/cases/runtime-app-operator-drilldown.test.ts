import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';

test('runtime snapshot exposes the user-visible summary and explicit full drilldown boundary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  try {
    runCli([
      'workspace', 'bind',
      '--project', 'medautoscience',
      '--path', repoRoot,
      '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().medautoscience),
    ], env);

    const summary = runCli(['runtime', 'snapshot'], env)
      .runtime_tray_snapshot.app_operator_drilldown;
    assert.equal(summary.detail_level, 'summary');
    assert.equal(summary.route_graph_refs, undefined);
    assert.equal(summary.operator_action_routing_refs, undefined);
    assert.equal(summary.authority_boundary.can_write_domain_truth, false);

    const full = runCli([
      'runtime', 'app-operator-drilldown', '--detail', 'full',
    ], env).app_operator_drilldown;
    assert.equal(full.detail_level, 'full');
    assert.equal(Array.isArray(full.operator_action_routing_refs.refs), true);
    assert.equal(full.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
