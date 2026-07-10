import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';

function readGeneratedJson(filePath: string): any {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
}

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
    const foundryContract = readGeneratedJson(foundryContractPath);
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
    const foundryContract = readGeneratedJson(foundryContractPath);
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

test('agents scaffold validation blocks Foundry contracts that split standard membership by generated surface', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-membership-policy-missing-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'foundry-membership-policy-missing',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = readGeneratedJson(foundryContractPath);
    foundryContract.agent_membership_projection_policy.public_agent_list_must_not_split_by_plugin_transport = false;
    foundryContract.agent_membership_projection_policy.generated_surface_is_membership_axis = true;
    foundryContract.agent_membership_projection_policy.generated_surface_is_status_axis = true;
    foundryContract.agent_membership_projection_policy.plugin_transport_is_membership_axis = true;
    foundryContract.agent_membership_projection_policy.plugin_transport_is_status_axis = true;
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_membership_projection_generated_surface_must_not_be_membership_axis',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_membership_projection_public_list_must_not_split_by_plugin_transport',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_membership_projection_generated_surface_must_not_be_status_axis',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_membership_projection_plugin_transport_must_not_be_membership_axis',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_membership_projection_plugin_transport_must_not_be_status_axis',
      ),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold emits pure OPL-hosted public Foundry surface policy', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-pure-public-surface-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'foundry-pure-public-surface',
    ]);
    const foundryContract = readGeneratedJson(path.join(targetDir, 'contracts/foundry_agent_series.json'));
    const publicSurfacePolicy = foundryContract.standard_public_projection_policy;

    assert.equal(publicSurfacePolicy.surface_kind, 'opl_foundry_agent_standard_public_projection_policy');
    assert.equal(publicSurfacePolicy.standard_public_foundry_surface, 'opl_generated_hosted_series');
    assert.equal(publicSurfacePolicy.canonical_inspect_command_pattern, 'opl foundry agents inspect <agent_id>');
    assert.deepEqual(publicSurfacePolicy.allowed_active_public_foundry_surfaces, [
      'opl_foundry_agent_series_spine',
      'opl_family_hosted_surfaces',
    ]);
    assert.equal(publicSurfacePolicy.active_public_projection_allows_non_opl_foundry_cli, false);
    assert.equal(publicSurfacePolicy.active_public_projection_allows_domain_owned_cli_as_standard_surface, false);
    assert.equal(publicSurfacePolicy.active_public_projection_allows_forbidden_surface_roles, false);
    assert.equal(publicSurfacePolicy.active_public_projection_allows_compatibility_aliases, false);
    assert.equal(publicSurfacePolicy.active_public_projection_allows_legacy_json_aliases, false);
    assert.equal(publicSurfacePolicy.minimal_authority_functions_are_membership_axis, false);
    assert.equal(publicSurfacePolicy.domain_owned_helpers_are_membership_axis, false);
    assert.equal(publicSurfacePolicy.allowed_domain_owned_helper_context, 'minimal_authority_functions_only');
    assert.deepEqual(publicSurfacePolicy.non_standard_surface_retention_contexts, [
      'history',
      'tombstone',
    ]);

    const selfEvolutionPolicy = foundryContract.standard_feedback_self_evolution_trigger_policy;
    assert.equal(
      selfEvolutionPolicy.surface_kind,
      'opl_foundry_agent_standard_feedback_self_evolution_trigger_policy',
    );
    assert.equal(selfEvolutionPolicy.policy_id, 'standard_agent_feedback_self_evolution_trigger.v1');
    assert.deepEqual(selfEvolutionPolicy.applies_to_series_memberships, [
      'standard_domain_agent',
      'framework_capability_package',
    ]);
    assert.equal(selfEvolutionPolicy.feedbackops_event_kind, 'target_agent_feedback_external_suite');
    assert.equal(selfEvolutionPolicy.accepted_feedback_profile, 'target_agent_feedback_external_suite');
    assert.equal(selfEvolutionPolicy.feedback_capture_requires_developer_mode, false);
    assert.equal(selfEvolutionPolicy.repo_fix_execution_requires_opl_developer_mode, true);
    assert.equal(selfEvolutionPolicy.contract_can_trigger_execution, false);
    assert.equal(
      selfEvolutionPolicy.developer_route_policy.manual_enable_without_direct_write_route,
      'fork_pull_request',
    );
    assert.equal(
      selfEvolutionPolicy.developer_route_policy.manual_developer_mode_cannot_grant_direct_repo_write,
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks active public forbidden Foundry role fields', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-legacy-public-fields-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'foundry-legacy-public-fields',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = readGeneratedJson(foundryContractPath);
    foundryContract.public_surface_role = 'compatibility_alias';
    foundryContract.foundry_public_surface_role = 'domain_owned_cli_as_standard_surface';
    foundryContract.forbidden_public_surface_roles = [
      'compatibility_alias',
      'legacy_json_alias',
    ];
    foundryContract.app_projection_policy.public_surface_role = 'compatibility_alias';
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_public_projection_forbidden_role_field:public_surface_role',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_public_projection_forbidden_role_field:foundry_public_surface_role',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_public_projection_forbidden_role_field:forbidden_public_surface_roles',
      ),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation does not treat missing forbidden-role allow flag as public role exposure', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-implicit-forbidden-role-policy-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'foundry-implicit-forbidden-role-policy',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = readGeneratedJson(foundryContractPath);
    delete foundryContract.standard_public_projection_policy
      .active_public_projection_allows_forbidden_surface_roles;
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(
      validated.validation.blockers.includes(
        'foundry_agent_forbidden_surface_roles_must_not_be_public_standard_surface',
      ),
      false,
    );
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'passed');
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
    const foundryContract = readGeneratedJson(path.join(targetDir, 'contracts/foundry_agent_series.json'));
    const membershipPolicy = foundryContract.agent_membership_projection_policy;
    const profile = foundryContract.series_design_profile;

    assert.equal(membershipPolicy.policy_id, 'standard_agent_membership_not_surface_origin');
    assert.equal(membershipPolicy.default_membership, 'standard_domain_agent');
    assert.equal(membershipPolicy.public_agent_list_must_not_split_by_generated_surface, true);
    assert.equal(membershipPolicy.public_agent_list_must_not_split_by_plugin_transport, true);
    assert.equal(membershipPolicy.generated_surface_is_membership_axis, false);
    assert.equal(membershipPolicy.generated_surface_is_status_axis, false);
    assert.equal(membershipPolicy.plugin_transport_is_membership_axis, false);
    assert.equal(membershipPolicy.plugin_transport_is_status_axis, false);
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
      'stage_completion_policy',
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

test('agents scaffold emits canonical workspace topology profile', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-topology-profile-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'workspace-topology-profile',
    ]);
    const foundryContract = readGeneratedJson(path.join(targetDir, 'contracts/foundry_agent_series.json'));
    const topology = foundryContract.workspace_topology_profile;

    assert.equal(topology.surface_kind, 'opl_workspace_topology_profile');
    assert.equal(topology.version, 'workspace-topology-profile.v1');
    assert.equal(topology.profile_id, 'opl.workspace_topology_profile.v1');
    assert.deepEqual(topology.topology_model, [
      'workspace_group',
      'project_unit',
      'stage_artifact_unit',
      'owner_receipt_or_typed_blocker',
    ]);
    assert.deepEqual(topology.workspace_modes, ['one_off', 'series', 'portfolio']);
    assert.equal(topology.default_project_stage_outputs_root, 'artifacts/stage_outputs');
    assert.equal(topology.default_profiles.one_off.workspace_mode, 'one_off');
    assert.equal(topology.default_profiles.one_off.series_capable_skeleton, true);
    assert.equal(topology.default_profiles.one_off.project_collection_path, 'projects');
    assert.equal(topology.default_profiles.one_off.project_stage_outputs_root, 'artifacts/stage_outputs');
    assert.equal(topology.default_profiles.portfolio.workspace_mode, 'portfolio');
    assert.equal(topology.default_profiles.portfolio.profile_role, 'canonical');
    assert.equal(topology.default_profiles.portfolio.canonical_profile_id, 'portfolio');
    assert.deepEqual(topology.default_profiles.portfolio.shared_resource_roots, [
      'data',
      'literature',
      'memory',
      'shared/sources',
    ]);
    assert.equal(topology.default_profiles.series.workspace_mode, 'series');
    assert.equal(topology.default_profiles.series.profile_role, 'canonical');
    assert.equal(topology.default_profiles.series.canonical_profile_id, 'series');
    assert.deepEqual(Object.keys(topology.default_profiles).sort(), ['one_off', 'portfolio', 'series']);
    assert.equal(topology.domain_profile_defaults.mas, 'portfolio');
    assert.equal(topology.domain_profile_defaults.rca, 'series');
    assert.equal(topology.domain_profile_defaults.mag, 'one_off');
    assert.equal(topology.domain_profile_defaults.oma, 'one_off');
    assert.equal(topology.domain_profile_defaults.obf, 'one_off');
    assert.equal('legacy_domain_profile_aliases' in topology, false);
    assert.equal(JSON.stringify(topology).includes('studies'), false);
    assert.equal(JSON.stringify(topology).includes('deliverables'), false);
    assert.equal(
      topology.default_user_inspection_surface.project_stage_outputs_pattern,
      '<project-root>/artifacts/stage_outputs/<stage-id>/',
    );
    assert.equal(topology.default_user_inspection_surface.runtime_state_is_default_user_surface, false);
    assert.equal(topology.runtime_state_boundary.runtime_state_can_close_stage, false);
    assert.equal(
      topology.workspace_initialization_policy.upgrading_one_off_to_series_must_not_move_existing_project_roots,
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks Foundry contracts missing workspace topology profile', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-topology-profile-missing-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'workspace-topology-profile-missing',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = readGeneratedJson(foundryContractPath);
    delete foundryContract.workspace_topology_profile;
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes('foundry_agent_series_workspace_topology_profile_missing_or_invalid'),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation rejects legacy workspace profile aliases', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-topology-legacy-alias-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'workspace-topology-legacy-alias',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = readGeneratedJson(foundryContractPath);
    foundryContract.workspace_topology_profile.default_profiles.rca_series = structuredClone(
      foundryContract.workspace_topology_profile.default_profiles.series,
    );
    foundryContract.workspace_topology_profile.legacy_domain_profile_aliases = {
      rca_series: { canonical_profile_id: 'series' },
    };
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(validated.validation.blockers.includes(
      'foundry_agent_series_workspace_topology_default_profile_keys_invalid',
    ), true);
    assert.equal(validated.validation.blockers.includes(
      'foundry_agent_series_workspace_topology_legacy_profile_aliases_forbidden',
    ), true);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation accepts a legacy topology pinned to a published owner commit', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-topology-published-pin-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'workspace-topology-published-pin',
    ]);
    const foundryContractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const foundryContract = readGeneratedJson(foundryContractPath);
    foundryContract.shared_release_pin_strategy.owner_commit_pin = 'published-owner-commit';
    const initializationPolicy = foundryContract.workspace_topology_profile.workspace_initialization_policy;
    delete initializationPolicy.infer_series_when_user_requests_multiple_related_projects;
    delete initializationPolicy.infer_portfolio_when_user_requests_shared_workspace_with_multiple_projects;
    initializationPolicy.legacy_project_collection_aliases = ['deliverables', 'studies'];
    initializationPolicy.infer_series_when_user_requests_multiple_related_deliverables = true;
    initializationPolicy.infer_portfolio_when_user_requests_shared_research_workspace_with_multiple_studies = true;
    foundryContract.workspace_topology_profile.default_profiles.rca_series = {
      ...structuredClone(foundryContract.workspace_topology_profile.default_profiles.series),
      profile_role: 'legacy_domain_alias',
      canonical_profile_id: 'series',
    };
    foundryContract.workspace_topology_profile.default_profiles.mas_portfolio = {
      ...structuredClone(foundryContract.workspace_topology_profile.default_profiles.portfolio),
      profile_role: 'legacy_domain_alias',
      canonical_profile_id: 'portfolio',
    };
    delete foundryContract.workspace_topology_profile.domain_profile_defaults.obf;
    foundryContract.workspace_topology_profile.domain_profile_defaults.bookforge = 'one_off';
    foundryContract.workspace_topology_profile.legacy_domain_profile_aliases = {
      rca_series: {
        canonical_profile_id: 'series',
        alias_for_domain: 'rca',
        alias_role: 'legacy_domain_alias',
      },
      mas_portfolio: {
        canonical_profile_id: 'portfolio',
        alias_for_domain: 'mas',
        alias_role: 'legacy_domain_alias',
      },
    };
    fs.writeFileSync(foundryContractPath, `${JSON.stringify(foundryContract, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'passed');
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold emits domain-specific controlled StageRun canary evidence', () => {
  const described = runCli([
    'agents',
    'scaffold',
    '--domain-id',
    'award-foundry',
  ]).standard_domain_agent_scaffold;

  assert.equal(described.stage_run_canary_evidence.domain_id, 'award-foundry');
  assert.equal(
    described.stage_run_canary_evidence.evidence_scope,
    'controlled_fixture_not_live_domain_progress',
  );
  assert.equal(
    described.stage_run_canary_evidence.stage_run_ref,
    'stage-run-ref:award-foundry/controlled-canary',
  );
  assert.equal(
    described.stage_run_canary_evidence.closeout.typed_blocker_ref,
    'typed-blocker-ref:award-foundry/controlled-canary',
  );

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-canary-scaffold-'));
  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'award-foundry',
    ]);
    const evidence = readGeneratedJson(path.join(targetDir, 'contracts/stage_run_canary_evidence.json'));
    assert.equal(evidence.domain_id, 'award-foundry');
    assert.equal(evidence.canary_id, 'award-foundry.controlled-stage-run-canary.v1');
    assert.equal(evidence.strategy_trace.candidate_generation[0], 'candidate-pool-ref:award-foundry/controlled-canary');
    assert.equal(evidence.authority_boundary.controlled_canary_claims_live_domain_progress, false);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks missing stage pack source declarations and Foundry contract', () => {
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
    const packCompilerPath = path.join(targetDir, 'contracts/pack_compiler_input.json');
    const packCompilerInput = readGeneratedJson(packCompilerPath);
    delete packCompilerInput.source_refs.executor_policy_source_ref;
    fs.writeFileSync(packCompilerPath, `${JSON.stringify(packCompilerInput, null, 2)}\n`);
    fs.rmSync(path.join(targetDir, 'contracts/foundry_agent_series.json'));

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.stage_pack_v2_validation.status, 'blocked');
    assert.equal(validated.validation.foundry_agent_series_validation.status, 'blocked');
    assert.equal(validated.validation.stage_pack_v2_validation.required_for_repo, true);
    assert.equal(
      validated.validation.blockers.includes('pack_compiler_source_ref_missing:executor_policy_source_ref'),
      true,
    );
    assert.equal(validated.validation.blockers.includes('missing_contract:contracts/foundry_agent_series.json'), true);
    assert.equal(validated.validation.blockers.includes('foundry_agent_series_contract_missing_or_invalid'), true);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
