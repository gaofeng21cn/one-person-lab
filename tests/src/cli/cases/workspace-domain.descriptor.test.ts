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

test('agent descriptor commands keep partial domain surfaces discoverable and non-authoritative', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-descriptor-partial-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = loadFamilyManifestFixtures().medautoscience;
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], env);

    const descriptors = runCli(['agents', 'descriptors'], env).family_agent_descriptors;
    assert.ok(descriptors.descriptors.some((entry: { project_id: string }) => entry.project_id === 'medautoscience'));

    const descriptor = runCli(['agents', 'descriptor', '--domain', 'mas'], env).family_agent_descriptor;
    assert.equal(descriptor.descriptor_status, 'descriptor_surfaces_partial');
    assert.equal(descriptor.family_stage_control_plane.status, 'resolved');
    assert.equal(descriptor.family_action_catalog.status, 'missing');
    assert.equal(descriptor.domain_memory_descriptor.status, 'missing');
    assert.equal(descriptor.non_authority_flags.opl_owns_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
