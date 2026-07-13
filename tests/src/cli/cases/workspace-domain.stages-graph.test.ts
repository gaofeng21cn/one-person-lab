import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  runCli,
  test,
} from '../helpers.ts';
import {
  createAdmittedStagePackFixture,
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
  const stagePacks = manifests.map(([project, fixture, targetDomainId, owner]) => [
    project,
    createAdmittedStagePackFixture(fixture, targetDomainId, owner),
  ] as const);

  try {
    for (const [project, stagePack] of stagePacks) {
      runCli([
        'workspace',
        'bind',
        '--project',
        project,
        '--path',
        stagePack.repoDir,
        '--manifest-command',
        buildManifestCommand(stagePack.manifest),
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
    const boundStages = list.stages.filter(
      (stage: { project_id: string }) => stage.project_id !== 'opl-meta-agent',
    );
    const admittedStages = list.stages.filter(
      (stage: { conformance_status: string }) => stage.conformance_status === 'conformant',
    );
    const boundReadinessDomains = readiness.domains.filter(
      (domain: { project_id: string }) => domain.project_id !== 'opl-meta-agent',
    );

    assert.equal(boundStages.length, 18);
    assert.equal(list.summary.admitted_stages_count, admittedStages.length);
    assert.equal(
      boundStages.filter((stage: { conformance_status: string }) => stage.conformance_status === 'nonconformant').length,
      0,
    );
    assert.equal(
      boundStages.every(
        (stage: { conformance_status: string; guarantee_mode: string; mode_tags: { verified_core_eligible: boolean } }) =>
          stage.conformance_status === 'conformant'
          && stage.guarantee_mode === 'static_admission_only'
          && stage.mode_tags.verified_core_eligible === true,
      ),
      true,
    );
    assert.equal(proofBundle.conformance_status, 'conformant');
    assert.equal(proofBundle.authority_boundary.can_write_domain_truth, false);
    assert.equal(readiness.family_defaults, true);
    assert.equal(
      boundReadinessDomains.reduce(
        (count: number, domain: { summary: { hard_blocker_count: number } }) =>
          count + domain.summary.hard_blocker_count,
        0,
      ),
      0,
    );
    assert.equal(readiness.summary.can_claim_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    for (const [, stagePack] of stagePacks) fs.rmSync(stagePack.repoDir, { recursive: true, force: true });
  }
});

test('family stage readiness keeps missing replay refs as non-authoritative warnings', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-family-stage-readiness-replay-`);
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stagePack = createAdmittedStagePackFixture(
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
      stagePack.repoDir,
      '--manifest-command',
      buildManifestCommand(stagePack.manifest),
    ], { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot });

    const readiness = runCli(['stages', 'readiness', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness;
    const replayCheck = readiness.lens_summary.find((entry: { check_id: string }) =>
      entry.check_id === 'replay_certification'
    );

    assert.equal(readiness.status, 'launch_warning');
    assert.equal(readiness.summary.replay_evidence_warning_count, 11);
    assert.equal(replayCheck.status, 'warning');
    assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(stagePack.repoDir, { recursive: true, force: true });
  }
});
