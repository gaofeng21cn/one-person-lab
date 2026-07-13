import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, installRuntimePackageFixture, loadFamilyManifestFixtures, os, runCli, test } from '../helpers.ts';
import { createMasScoutStage, createMedAutoScienceStageManifest } from './family-runtime-stage-fixtures.ts';
import { createAdmittedStagePackFixture } from './workspace-domain-test-helper.ts';

test('family-runtime treats static stage conformance as passive launch context', () => {
  const stateRoot = fs.mkdtempSync(`${os.tmpdir()}/opl-family-runtime-cohort-loop-warning-`);
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = createMedAutoScienceStageManifest(fixtures.medautoscience, [createMasScoutStage()]);
  const masPack = createAdmittedStagePackFixture(masManifest, 'med-autoscience', 'MedAutoScience');

  try {
    const env = {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      CODEX_HOME: `${stateRoot}/codex-home`,
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
    installRuntimePackageFixture(stateRoot, 'med-autoscience');
    const workspaceRoot = `${stateRoot}/workspace`;
    fs.mkdirSync(workspaceRoot, { recursive: true });

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
      JSON.stringify({ workspace_root: workspaceRoot }),
      '--source-fingerprint',
      'sha256:scout-cohort-loop',
    ], env);
    const observation = created.family_runtime_stage_attempt.stage_context_observation;

    assert.equal(created.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(created.family_runtime_stage_attempt.attempt.blocked_reason, null);
    assert.equal(['declared', 'declaration_debt'].includes(observation.status), true);
    assert.equal(observation.progression_effect, 'stage_may_start');
    assert.equal(observation.quality_debt_findings.every(
      (finding: { severity: string }) => finding.severity === 'warning',
    ), true);
    assert.equal(observation.warning_findings.every(
      (finding: { severity: string }) => finding.severity === 'warning',
    ), true);
    assert.deepEqual(created.family_runtime_stage_attempt.conflict_or_blocker_envelopes, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masPack.repoDir, { recursive: true, force: true });
  }
});
