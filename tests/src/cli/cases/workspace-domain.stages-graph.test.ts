import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import {
  withAdmittedStagePack,
  withReplayEvidenceStagePack,
  type JsonRecord,
} from './workspace-domain-test-helper.ts';

test('family stage list, proof bundle, and readiness stay refs-only without domain authority', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-family-stage-admitted-`);
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifests: Array<[string, JsonRecord, string, string]> = [
    ['medautoscience', fixtures.medautoscience as JsonRecord, 'med-autoscience', 'MedAutoScience'],
    ['medautogrant', fixtures.medautogrant as JsonRecord, 'med-autogrant', 'MedAutoGrant'],
    ['redcube', fixtures.redcube as JsonRecord, 'redcube_ai', 'RedCubeAI'],
  ];

  try {
    for (const [project, fixture, targetDomainId, owner] of manifests) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        repoRoot,
        '--manifest-command',
        buildManifestCommand(withAdmittedStagePack(fixture, targetDomainId, owner)),
      ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });
    }

    const list = runCli(['stages', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stages;
    const proofBundle = runCli(['stages', 'proof-bundle', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_proof_bundle.proof_bundle;
    const readiness = runCli(['stages', 'readiness', '--family-defaults'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness;

    assert.equal(list.summary.admitted_stages_count, 19);
    assert.equal(list.summary.blocked_stages_count, 0);
    assert.equal(
      list.stages.filter((stage: { project_id: string }) => stage.project_id !== 'opl-meta-agent').every(
        (stage: { admission_status: string; guarantee_mode: string; mode_tags: { durable_runtime_only: boolean } }) =>
          stage.admission_status === 'admitted'
          && stage.guarantee_mode === 'runtime_enforced'
          && stage.mode_tags.durable_runtime_only === true,
      ),
      true,
    );
    assert.equal(proofBundle.admission_status, 'admitted');
    assert.equal(proofBundle.authority_boundary.can_write_domain_truth, false);
    assert.equal(readiness.family_defaults, true);
    assert.equal(readiness.summary.hard_blocker_count, 0);
    assert.equal(readiness.summary.can_claim_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage readiness consumes replay refs while keeping warnings non-authoritative', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-family-stage-readiness-replay-`);
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = withReplayEvidenceStagePack(
    loadFamilyManifestFixtures().medautoscience as JsonRecord,
    'med-autoscience',
    'MedAutoScience',
  );

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
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['stages', 'readiness', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness;
    const replayCheck = readiness.lens_summary.find((entry: { check_id: string }) =>
      entry.check_id === 'replay_certification'
    );

    assert.equal(readiness.status, 'launch_warning');
    assert.equal(readiness.summary.replay_evidence_warning_count, 0);
    assert.equal(replayCheck.status, 'ok');
    assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
