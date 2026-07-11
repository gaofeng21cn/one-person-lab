import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, runCli, test } from '../helpers.ts';
import { createMasScoutStage, createMedAutoScienceStageManifest } from './family-runtime-stage-fixtures.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

test('family-runtime required admission warns but does not block launch without advisory lens refs', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-family-runtime-cohort-loop-warning-`);
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = createMedAutoScienceStageManifest(fixtures.medautoscience, [createMasScoutStage()]);
  const masPack = createAdmittedStagePackFixture(masManifest, 'med-autoscience', 'MedAutoScience');

  try {
    const env = {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    };
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masPack.repoDir,
      '--manifest-command',
      buildManifestCommand(masPack.manifest),
    ], env);

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:scout-cohort-loop',
      '--require-stage-admission',
    ], env);
    const gate = created.family_runtime_stage_attempt.stage_launch_admission_gate;

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(created.family_runtime_stage_attempt.attempt.blocked_reason, null);
    assert.equal(gate.status, 'allowed');
    assert.equal(gate.blocked_reason, null);
    assert.deepEqual(gate.blocker_findings, []);
    assert.equal(gate.inspected_cohort_loop_stage.closure_status, 'missing_query');
    const advisoryFindingCodes = gate.findings.map((finding: { code: string }) => finding.code);
    assert.deepEqual(advisoryFindingCodes, [
      'cohort_query_missing',
      'cohort_trigger_missing',
      'cohort_monitor_or_metric_missing',
      'runtime_budget_monitor_refs_missing',
      'runtime_budget_expected_success_ref_or_boundary_success_rate_ref_missing',
      'runtime_budget_boundary_monitor_coverage_missing',
    ]);
    assert.equal(gate.findings.every((finding: { severity: string }) => finding.severity === 'warning'), true);
    assert.deepEqual(
      gate.recommendation_findings.map((finding: { code: string }) => finding.code),
      advisoryFindingCodes,
    );
    assert.deepEqual(created.family_runtime_stage_attempt.conflict_or_blocker_envelopes, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});
