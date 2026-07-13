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
  bindManifest,
  createAdmittedStagePackFixture,
  type JsonRecord,
} from './workspace-domain-test-helper.ts';

test('family stage contract fails closed when an allowed action ref is missing from the catalog', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-drift-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stagePack = createAdmittedStagePackFixture(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
    'MedAutoScience',
  );
  const stageManifestPath = path.join(stagePack.repoDir, 'agent/stages/manifest.json');
  const stageManifest = JSON.parse(fs.readFileSync(stageManifestPath, 'utf8')) as JsonRecord;
  (stageManifest.stages as JsonRecord[])[0].allowed_action_refs = ['missing_action'];
  fs.writeFileSync(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`, 'utf8');

  try {
    bindManifest(
      'medautoscience',
      stagePack.manifest,
      { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot },
      stagePack.repoDir,
    );
    const entry = runCli(['domain', 'manifests'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).domain_manifests.projects.find(
      (candidate: { project_id: string }) => candidate.project_id === 'medautoscience',
    );
    assert.equal(entry.status, 'invalid_manifest');
    assert.equal(entry.error.message, 'Stage manifest references missing family actions.');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stagePack.repoDir, { recursive: true, force: true });
  }
});
