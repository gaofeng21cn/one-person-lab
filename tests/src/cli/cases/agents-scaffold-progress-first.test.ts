import { assert, fs, os, path, runCli, test } from '../helpers.ts';

test('agents scaffold validation blocks stale Foundry policy release pins', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-policy-pin-missing-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'foundry-policy-pin-missing',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = JSON.parse(fs.readFileSync(foundryContractPath, 'utf8'));
    delete foundryContract.shared_policy_release.policy_bundle_fingerprint;
    foundryContract.shared_policy_release.consumer_alignment_check = 'family:shared-release';
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes('foundry_agent_series_policy_bundle_fingerprint_invalid'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('foundry_agent_series_policy_consumer_alignment_check_invalid'),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks generated skeletons missing stage pack v2 fields', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-pack-v2-missing-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'stage-pack-v2-missing',
    ]);
    const stageControlPlanePath = path.join(targetDir, 'contracts/stage_control_plane.json');
    const stageControlPlane = JSON.parse(fs.readFileSync(stageControlPlanePath, 'utf8'));
    delete stageControlPlane.stage_pack_conformance_version;
    delete stageControlPlane.stages[0].selected_executor;
    delete stageControlPlane.stages[0].stage_contract.expected_receipt_refs;
    delete stageControlPlane.stages[0].stage_contract.user_stage_log_contract;
    delete stageControlPlane.stages[0].stage_contract.progress_delta_policy;
    delete stageControlPlane.stages[0].stage_contract.typed_blocker_lineage_policy;
    stageControlPlane.stages[0].independent_gate_policy.execution_review_separation_required = false;
    fs.writeFileSync(stageControlPlanePath, `${JSON.stringify(stageControlPlane, null, 2)}\n`);

    const packCompilerPath = path.join(targetDir, 'contracts/pack_compiler_input.json');
    const packCompilerInput = JSON.parse(fs.readFileSync(packCompilerPath, 'utf8'));
    delete packCompilerInput.source_refs.executor_policy_source_ref;
    fs.writeFileSync(packCompilerPath, `${JSON.stringify(packCompilerInput, null, 2)}\n`);
    fs.rmSync(path.join(targetDir, 'contracts/foundry_agent_series.json'));

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.stage_pack_v2_validation.status, 'blocked');
    assert.equal(validated.validation.user_stage_log_validation.status, 'blocked');
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(validated.validation.stage_pack_v2_validation.required_for_repo, true);
    assert.equal(validated.validation.blockers.includes('stage_pack_v2_plane_version_missing'), true);
    assert.equal(
      validated.validation.blockers.includes('pack_compiler_source_ref_missing:executor_policy_source_ref'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('stage_pack_v2_missing_selected_executor:domain_intake'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('stage_pack_v2_missing_expected_receipt_refs:domain_intake'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('stage_pack_v2_independent_gate_separation_required:domain_intake'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('stage_user_stage_log_contract_missing:domain_intake'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('stage_progress_delta_policy_missing:domain_intake'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('stage_typed_blocker_lineage_policy_missing:domain_intake'),
      true,
    );
    assert.equal(validated.validation.blockers.includes('missing_contract:contracts/foundry_agent_series.json'), true);
    assert.equal(validated.validation.blockers.includes('foundry_agent_series_contract_missing_or_invalid'), true);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
