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

test('agents scaffold validation blocks Foundry contracts missing the shared series design profile', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-series-profile-missing-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'foundry-series-profile-missing',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = JSON.parse(fs.readFileSync(foundryContractPath, 'utf8'));
    delete foundryContract.series_design_profile;
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes('foundry_agent_series_design_profile_missing_or_invalid'),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold emits canonical Foundry series design profile', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-series-profile-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'foundry-series-profile',
    ]);
    const foundryContract = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'contracts/foundry_agent_series.json'), 'utf8'),
    );
    const profile = foundryContract.series_design_profile;

    assert.equal(profile.surface_kind, 'opl_foundry_agent_series_design_profile');
    assert.equal(profile.profile_id, 'opl_foundry_agent_series_design_profile.v1');
    assert.deepEqual(profile.shared_lifecycle_pipeline, [
      'domain_material_intake',
      'domain_pack_interpretation',
      'stage_led_agent_execution',
      'independent_quality_gate_or_owner_review',
      'owner_receipt_or_typed_blocker_closeout',
      'artifact_or_deliverable_handoff',
      'opl_refs_only_projection_and_recovery',
    ]);
    assert.equal(profile.domain_io_profile.input_slot, 'domain_materials_or_task_request');
    assert.equal(profile.domain_io_profile.output_slot, 'domain_deliverable_or_owner_handoff');
    assert.deepEqual(profile.stage_pack_sections, [
      'prompts',
      'stages',
      'skills',
      'tools',
      'knowledge',
      'quality_gates',
    ]);
    assert.equal(profile.shared_closeout_contract.success_shape, 'domain_owner_receipt_ref');
    assert.equal(profile.shared_closeout_contract.blocked_shape, 'domain_owned_typed_blocker_ref');
    assert.equal(profile.shared_closeout_contract.provider_completion_is_closeout, false);
    assert.equal(profile.authority_invariants.opl_can_infer_domain_output, false);
    assert.equal(profile.authority_invariants.domain_owns_input_truth_and_output_authority, true);
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
