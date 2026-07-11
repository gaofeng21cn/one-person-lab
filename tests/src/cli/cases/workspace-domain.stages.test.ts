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

test('family stage parity detects an allowed action ref missing from the action catalog', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-drift-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stagePack = createAdmittedStagePackFixture(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
    'MedAutoScience',
  );
  const stageManifestPath = path.join(stagePack.repoDir, 'agent/stages/manifest.json');
  const stageManifest = JSON.parse(fs.readFileSync(stageManifestPath, 'utf8')) as JsonRecord;
  const actionCatalogPath = path.join(stagePack.repoDir, 'contracts/action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8')) as JsonRecord;
  (actionCatalog.actions as JsonRecord[]).push({
    ...(actionCatalog.actions as JsonRecord[])[0],
    action_id: 'missing_action',
  });
  fs.writeFileSync(actionCatalogPath, `${JSON.stringify(actionCatalog, null, 2)}\n`, 'utf8');
  (stageManifest.stages as JsonRecord[])[0].allowed_action_refs = ['missing_action'];
  fs.writeFileSync(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`, 'utf8');

  try {
    bindManifest(
      'medautoscience',
      stagePack.manifest,
      { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot },
      stagePack.repoDir,
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

    const blocked = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'stage_1',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas-stage-drift"}',
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_runtime_stage_attempt;
    assert.equal(blocked.attempt.status, 'blocked');
    assert.equal(blocked.stage_launch_admission_gate.gate_action, 'block_stage_launch');
    assert.match(blocked.attempt.blocked_reason, /missing_action_catalog_ref/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stagePack.repoDir, { recursive: true, force: true });
  }
});
