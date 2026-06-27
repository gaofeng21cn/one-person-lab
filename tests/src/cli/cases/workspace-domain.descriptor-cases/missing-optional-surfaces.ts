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
} from '../../helpers.ts';

test('unified domain-agent descriptor reports missing optional descriptor surfaces without failing discovery', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-agent-descriptor-partial-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();

  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
    });
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const inspect = runCli(['agents', 'descriptor', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(inspect.family_agent_descriptor.descriptor_status, 'descriptor_surfaces_partial');
    assert.equal(inspect.family_agent_descriptor.domain_memory_descriptor.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.family_stage_control_plane.status, 'resolved');
    assert.equal(inspect.family_agent_descriptor.family_action_catalog.status, 'missing');
    assert.equal(inspect.family_agent_descriptor.runtime_surfaces.runtime_inventory.status, 'resolved');
    assert.equal(inspect.family_agent_descriptor.non_authority_flags.opl_owns_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
