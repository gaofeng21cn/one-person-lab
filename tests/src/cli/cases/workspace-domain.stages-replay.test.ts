import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';
import {
  type JsonRecord,
  withReplayEvidenceStagePack,
} from './workspace-domain-test-helper.ts';

test('family stage replay drilldowns consume declared replay evidence refs by default', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-replay-drilldown-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withReplayEvidenceStagePack(fixtures.medautoscience as JsonRecord, 'med-autoscience', 'MedAutoScience');

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

    const replay = runCli(['stages', 'replay-certification', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_replay_certification.certification;
    const sourceSpec = runCli(['stages', 'source-spec', '--domain', 'mas'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_pack_source_spec.source_spec;

    assert.equal(replay.replay_status, 'replay_ready');
    assert.equal(replay.summary.blocker_count, 0);
    assert.equal(replay.summary.append_only_event_log_ref_count, 1);
    assert.equal(replay.summary.attempt_ledger_ref_count, 1);
    assert.equal(replay.summary.missing_runtime_event_ref_count, 0);
    assert.equal(replay.summary.missing_receipt_ref_count, 0);
    assert.equal(sourceSpec.diff_keys.replay_status, 'replay_ready');
    assert.equal(sourceSpec.diff_keys.replay_evidence_refs.length, 12);
    assert.equal(sourceSpec.diff_keys.replay_evidence_refs.includes('runtime_event:med-autoscience.stage_1'), true);
    assert.equal(sourceSpec.diff_keys.replay_evidence_refs.includes('owner_receipt:stage_1'), true);
    assert.equal(replay.authority_boundary.can_write_domain_truth, false);
    assert.equal(replay.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(sourceSpec.body_policy.includes_artifact_body, false);
    assert.equal(sourceSpec.body_policy.executes_stage, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family stage readiness exposes missing human gate replay refs as refs-only workorders', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-stage-human-gate-workorder-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withReplayEvidenceStagePack(
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
      repoRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
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
    assert.equal(readiness.summary.replay_evidence_warning_count, 1);
    const replayWarning = readiness.warnings.find((entry: { code: string; stage_id: string }) => (
      entry.code === 'expected_receipt_ref_missing' && entry.stage_id === 'stage_2'
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
    assert.equal(replay.summary.missing_receipt_ref_count, 1);
    assert.equal(replay.blockers[0]?.payload_workorder.required_success_ref, 'human_gate:publication_quality_gate');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('OMA stage decomposition consumes hosted replay refs and preserves baseline owner review gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-stage-replay-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const readinessOutput = runCli(['stages', 'readiness', '--domain', 'oma', '--detail', 'full'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    }).family_stage_readiness as JsonRecord;
    const readiness = (
      ((readinessOutput.family_stage_readiness as JsonRecord | undefined)?.family_stage_readiness as JsonRecord | undefined)
      ?? readinessOutput.family_stage_readiness
      ?? readinessOutput
    ) as {
      summary: { hard_blocker_count: number };
      blockers?: Array<{ code: string }>;
      hard_blockers?: Array<{ code: string }>;
      warnings: Array<{ code: string; minimal_counterexample?: { missing_ref?: string } }>;
    };
    const blockerCodes = (readiness.blockers ?? readiness.hard_blockers ?? [])
      .map((finding: { code: string }) => finding.code);
    const replayWarnings = readiness.warnings.filter((finding: {
      code: string;
      minimal_counterexample?: { missing_ref?: string };
    }) => finding.code === 'expected_receipt_ref_missing');
    const missingReplayRefs = replayWarnings.map((finding: {
      minimal_counterexample?: { missing_ref?: string };
    }) => finding.minimal_counterexample?.missing_ref);
    const warningCodes = readiness.warnings.map((finding: { code: string }) => finding.code);

    assert.equal(readiness.summary.hard_blocker_count, 0);
    assert.equal(blockerCodes.includes('missing_progress_delta_policy'), false);
    assert.equal(blockerCodes.includes('missing_typed_blocker_lineage_policy'), false);
    assert.equal(warningCodes.includes('append_only_event_log_ref_missing'), false);
    assert.equal(warningCodes.includes('attempt_ledger_ref_missing'), false);
    assert.equal(missingReplayRefs.includes('stage-attempt-receipt-ref:stage-decomposition'), false);
    assert.equal(missingReplayRefs.includes('executor-receipt-ref:stage-decomposition/codex-cli'), false);
    assert.equal(missingReplayRefs.includes('independent-gate-receipt-ref:stage-decomposition'), false);
    assert.equal(missingReplayRefs.includes('human_gate:oma_baseline_owner_review'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
