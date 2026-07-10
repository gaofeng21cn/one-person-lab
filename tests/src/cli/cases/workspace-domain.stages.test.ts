import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import {
  attachManifestSurface,
  bindManifest,
  type JsonRecord,
  withAdmittedStagePack,
} from './workspace-domain-test-helper.ts';

test('family stage parity detects an allowed action ref missing from the action catalog', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-drift-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = withAdmittedStagePack(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
    'MedAutoScience',
  ) as JsonRecord;
  const stagePlane = structuredClone(
    manifest.family_stage_control_plane,
  ) as JsonRecord;
  (stagePlane.stages as JsonRecord[])[0].allowed_action_refs = ['missing_action'];

  try {
    bindManifest(
      'medautoscience',
      attachManifestSurface(manifest, 'family_stage_control_plane', stagePlane),
      { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot },
    );
    const parity = runCli([
      'stages', 'inspect', '--domain', 'mas', '--stage', 'stage_1',
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage.parity;

    assert.equal(parity.status, 'drift_detected');
    assert.equal(
      parity.issues.some((issue: unknown) => String(issue).includes('missing_action')),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
