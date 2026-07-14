import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';

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
  assert.equal(repo.scaffold_validation.stage_pack_v2_validation.stage_statuses[0].tool_ref_count, 1);
  assert.equal(
    repo.scaffold_validation.stage_pack_v2_validation.stage_statuses[0].tool_affordance_boundary_status,
    'declared',
  );
  assert.deepEqual(repo.scaffold_validation.stage_pack_v2_validation.advisory_findings, []);
});

test('agents conformance exposes the frozen Standard Agent Pack ABI baseline', () => {
  const repoDir = buildScaffoldRepo();
  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  const validation = report.reports[0].scaffold_validation.stage_pack_v2_validation;
  const abi = validation.standard_agent_pack_abi;
  const stage = validation.stage_statuses[0];
  assert.ok(abi, 'stage pack v2 validation must expose standard_agent_pack_abi');
  assert.equal(abi.status, 'passed');
  assert.equal(abi.version, 'standard-agent-pack-abi.v1');
  assert.deepEqual(abi.required_repo_layout_paths, [
    'agent/',
    'contracts/',
    'runtime/authority_functions/',
  ]);
  assert.equal(abi.l4_entry_gate.entry_level, 'L4_structural_baseline');
  assert.equal(abi.l4_entry_gate.can_claim_l5, false);
  assert.equal(abi.l5_entry_gate.entry_level, 'L5_production_operating_maturity');
  assert.equal(abi.l5_entry_gate.conformance_pass_counts_as_l5, false);
  assert.equal(stage.receipt_schema_ref_count, 1);
  assert.equal(stage.authority_function_ref_count, 1);
  assert.equal(stage.l4_entry_gate_status, 'declared');
  assert.equal(stage.l5_entry_gate_status, 'declared');
});

test('agents conformance accepts a routed Codex CLI variant stage with explicit binding', () => {
  const repoDir = buildScaffoldRepo();
  const stageManifestPath = path.join(repoDir, 'agent/stages/manifest.json');
  const stageManifest = parseJsonText(fs.readFileSync(stageManifestPath, 'utf8')) as any;
  const variantStage = structuredClone(stageManifest.stages[0]);
  variantStage.stage_id = 'domain_review_variant';
  variantStage.lane_kind = 'variant';
  stageManifest.stages.push(variantStage);
  writeJson(stageManifestPath, stageManifest);
  const actionCatalogPath = path.join(repoDir, 'contracts/action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as any;
  actionCatalog.actions[0].stage_route.optional_stage_refs.push('domain_review_variant');
  actionCatalog.actions[0].stage_route.terminal_stage_refs.push('domain_review_variant');
  writeJson(actionCatalogPath, actionCatalog);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  const validation = report.reports[0].scaffold_validation.stage_pack_v2_validation;
  assert.equal(validation.status, 'passed');
  assert.deepEqual(validation.blockers, []);
  assert.equal(validation.stage_statuses[1].stage_id, 'domain_review_variant');
  assert.equal(validation.stage_statuses[1].executor_binding_ref, 'default_codex_cli');
});

test('agents conformance blocks generated scaffold repos missing stage pack v2 obligations', () => {
  const repoDir = buildScaffoldRepo();
  const stageManifestPath = path.join(repoDir, 'agent/stages/manifest.json');
  const stageManifest = parseJsonText(fs.readFileSync(stageManifestPath, 'utf8')) as any;
  stageManifest.stages[0].requires = [];
  writeJson(stageManifestPath, stageManifest);
  const packCompilerInputPath = path.join(repoDir, 'contracts/pack_compiler_input.json');
  const packCompilerInput = parseJsonText(fs.readFileSync(packCompilerInputPath, 'utf8')) as any;
  packCompilerInput.required_domain_pack_paths = packCompilerInput.required_domain_pack_paths.filter(
    (entry: string) => !entry.startsWith('agent/tools/'),
  );
  writeJson(packCompilerInputPath, packCompilerInput);

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
    repo.blockers.includes('stage_pack_v2_missing_stage_contract_requires:domain_intake'),
    true,
  );
  assert.equal(repo.blockers.includes('stage_pack_v2_missing_tool_refs:domain_intake'), true);
  assert.equal(repo.blockers.includes('stage_pack_v2_missing_tool_affordance_boundary:domain_intake'), true);
});

test('agents conformance blocks generated scaffold repos missing Standard Agent Pack ABI gates', () => {
  const repoDir = buildScaffoldRepo();
  const packCompilerInputPath = path.join(repoDir, 'contracts/pack_compiler_input.json');
  const packCompilerInput = parseJsonText(fs.readFileSync(packCompilerInputPath, 'utf8')) as any;
  packCompilerInput.standard_agent_pack_abi ??= {
    required_repo_layout: [
      { path: 'agent/' },
      { path: 'contracts/' },
      { path: 'runtime/authority_functions/' },
    ],
  };
  packCompilerInput.standard_agent_pack_abi.required_repo_layout =
    packCompilerInput.standard_agent_pack_abi.required_repo_layout.filter(
      (entry: { path: string }) => entry.path !== 'runtime/authority_functions/',
    );
  delete packCompilerInput.source_refs.owner_receipt_schema_source_ref;
  delete packCompilerInput.source_refs.authority_functions_source_ref;
  writeJson(packCompilerInputPath, packCompilerInput);

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
    repo.blockers.includes('stage_pack_v2_standard_agent_pack_abi_missing_repo_layout:runtime/authority_functions/'),
    true,
  );
  assert.equal(
    repo.blockers.includes('pack_compiler_source_ref_missing:owner_receipt_schema_source_ref'),
    true,
  );
  assert.equal(
    repo.blockers.includes('pack_compiler_source_ref_missing:authority_functions_source_ref'),
    true,
  );
});

test('agents conformance blocks generated scaffold repos missing Standard Agent Pack ABI physical layout', () => {
  const repoDir = buildScaffoldRepo();
  fs.rmSync(path.join(repoDir, 'runtime/authority_functions'), { recursive: true, force: true });

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
    repo.blockers.includes(
      'stage_pack_v2_standard_agent_pack_abi_missing_physical_repo_layout:runtime/authority_functions/',
    ),
    true,
  );
});
