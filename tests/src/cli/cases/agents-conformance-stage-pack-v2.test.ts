import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function buildScaffoldRepo() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-stage-pack-v2-'));
  runCli([
    'agents',
    'scaffold',
    '--target-dir',
    targetDir,
    '--domain-id',
    'sample-brief-agent',
    '--domain-label',
    'Sample Brief Agent',
  ]);
  return targetDir;
}

test('agents conformance reports generated stage pack v2 obligations', () => {
  const repoDir = buildScaffoldRepo();
  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  const repo = report.reports[0];
  assert.equal(repo.scaffold_validation.stage_pack_v2_validation.status, 'passed');
  assert.equal(repo.scaffold_validation.stage_pack_v2_validation.required_for_repo, true);
  assert.equal(
    repo.scaffold_validation.stage_pack_v2_validation.stage_statuses[0].selected_executor_kind,
    'codex_cli',
  );
  assert.deepEqual(repo.scaffold_validation.stage_pack_v2_validation.advisory_findings, []);
});

test('agents conformance blocks generated scaffold repos missing stage pack v2 obligations', () => {
  const repoDir = buildScaffoldRepo();
  const stageControlPlanePath = path.join(repoDir, 'contracts/stage_control_plane.json');
  const stageControlPlane = JSON.parse(fs.readFileSync(stageControlPlanePath, 'utf8'));
  delete stageControlPlane.stages[0].selected_executor.executor_binding_ref;
  delete stageControlPlane.stages[0].stage_contract.requires;
  writeJson(stageControlPlanePath, stageControlPlane);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  const repo = report.reports[0];
  assert.equal(report.status, 'blocked');
  assert.equal(repo.status, 'blocked');
  assert.equal(repo.scaffold_validation.stage_pack_v2_validation.status, 'blocked');
  assert.equal(
    repo.blockers.includes('stage_pack_v2_invalid_default_executor_binding:domain_intake'),
    true,
  );
  assert.equal(
    repo.blockers.includes('stage_pack_v2_missing_stage_contract_requires:domain_intake'),
    true,
  );
});
