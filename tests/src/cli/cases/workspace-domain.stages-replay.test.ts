import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, runCli, test } from '../helpers.ts';
import {
  createAdmittedStagePackFixture,
  type JsonRecord,
} from './workspace-domain-test-helper.ts';
import {
  buildReadyAgentRepo,
  configureReadyMetaMorphology,
  retargetReadyRepo,
  writeJson,
} from './agents-conformance-fixtures.ts';

test('family stage replay drilldowns expose missing runtime evidence from generated packs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-replay-drilldown-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const stagePack = createAdmittedStagePackFixture(fixtures.medautoscience as JsonRecord, 'med-autoscience', 'MedAutoScience');

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

    const replay = runCli(['stages', 'replay-certification', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_replay_certification.certification;
    const sourceSpec = runCli(['stages', 'source-spec', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_pack_source_spec.source_spec;

    assert.equal(replay.replay_status, 'blocked');
    assert.equal(replay.summary.blocker_count, 11);
    assert.equal(replay.summary.append_only_event_log_ref_count, 0);
    assert.equal(replay.summary.attempt_ledger_ref_count, 0);
    assert.equal(replay.summary.missing_runtime_event_ref_count, 0);
    assert.equal(replay.summary.missing_receipt_ref_count, 6);
    assert.equal(sourceSpec.diff_keys.replay_status, 'blocked');
    assert.deepEqual(sourceSpec.diff_keys.replay_evidence_refs, []);
    assert.equal(replay.authority_boundary.can_write_domain_truth, false);
    assert.equal(replay.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(sourceSpec.body_policy.includes_artifact_body, false);
    assert.equal(sourceSpec.body_policy.executes_stage, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(stagePack.repoDir, { recursive: true, force: true });
  }
});

test('family stage readiness exposes missing human gate replay refs as refs-only workorders', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-human-gate-workorder-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const stagePack = createAdmittedStagePackFixture(
    fixtures.medautoscience as JsonRecord,
    'med-autoscience',
    'MedAutoScience',
    { stage2HumanGate: true },
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

    const readiness = runCli(['stages', 'readiness', '--domain', 'mas', '--detail', 'full'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness.family_stage_readiness;
    const replay = runCli(['stages', 'replay-certification', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_replay_certification.certification;

    assert.equal(readiness.launch_readiness_status, 'launch_warning');
    assert.equal(readiness.summary.hard_blocker_count, 0);
    assert.equal(readiness.summary.replay_evidence_warning_count, 13);
    const replayWarning = readiness.warnings.find((entry: JsonRecord) => (
      entry.code === 'expected_receipt_ref_missing'
      && entry.stage_id === 'stage_2'
      && (entry.payload_workorder as JsonRecord | undefined)?.missing_ref === 'human_gate:publication_quality_gate'
    ));
    assert.equal(replayWarning?.payload_workorder.surface_kind, 'opl_stage_replay_missing_receipt_workorder');
    assert.equal(replayWarning?.payload_workorder.missing_ref, 'human_gate:publication_quality_gate');
    assert.equal(replayWarning?.payload_workorder.missing_ref_kind, 'human_gate_ref');
    assert.deepEqual(replayWarning?.payload_workorder.required_return_shapes, [
      'human_gate_receipt_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(replayWarning?.payload_workorder.accepted_payload_paths.success_refs_path.closes_domain_ready, false);
    assert.equal(replayWarning?.payload_workorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
    assert.equal(replayWarning?.payload_workorder.authority_boundary.can_requery_human, false);
    assert.equal(replayWarning?.payload_workorder.authority_boundary.can_create_owner_receipt, false);
    assert.equal(replay.replay_status, 'blocked');
    assert.equal(replay.summary.missing_receipt_ref_count, 7);
    assert.equal(replay.blockers.some((entry: JsonRecord) => (
      (entry.payload_workorder as JsonRecord | undefined)?.required_success_ref
        === 'human_gate:publication_quality_gate'
    )), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(stagePack.repoDir, { recursive: true, force: true });
  }
});

test('OMA stage projection consumes the declarative manifest without a hardcoded fallback plane', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-stage-replay-state-'));
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-stage-replay-family-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const generatedRepo = buildReadyAgentRepo();
  const omaRepo = path.join(familyRoot, 'opl-meta-agent');
  fs.renameSync(generatedRepo, omaRepo);
  retargetReadyRepo(omaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(omaRepo);
  for (const ref of [
    'contracts/opl_domain_manifest_registration.json',
    'contracts/app_workbench_projection.json',
    'contracts/real_target_agent_scaleout_evidence.json',
  ]) {
    writeJson(path.join(omaRepo, ref), {});
  }

  try {
    const list = runCli(['stages', 'list'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
    }).family_stages;
    const domain = list.domains.find((entry: JsonRecord) => entry.project_id === 'opl-meta-agent');
    const stageIds = list.stages
      .filter((entry: JsonRecord) => entry.project_id === 'opl-meta-agent')
      .map((entry: JsonRecord) => entry.stage_id);

    assert.equal(domain?.ready, true);
    assert.equal(domain?.plane_id, 'opl_meta_agent_stage_control_plane');
    assert.equal(stageIds.includes('stage-decomposition'), true);
    assert.equal(fs.existsSync(path.join(omaRepo, 'contracts/stage_control_plane.json')), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyRoot, { recursive: true, force: true });
  }
});
