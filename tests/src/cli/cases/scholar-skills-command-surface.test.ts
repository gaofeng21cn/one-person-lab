import { assert, fs, loadFrameworkContracts, os, path, repoRoot, runCli, test } from '../helpers.ts';

const expectedModuleIds = [
  'opl.scholarskills.display',
  'opl.scholarskills.tables',
  'opl.scholarskills.stats',
  'opl.scholarskills.omics',
  'opl.scholarskills.lit',
  'opl.scholarskills.write',
  'opl.scholarskills.review',
  'opl.scholarskills.submit',
  'opl.scholarskills.data',
  'opl.scholarskills.intake',
];

test('ScholarSkills capability module descriptor contract is loaded and exposes ten branded modules', () => {
  const contracts = loadFrameworkContracts(repoRoot);

  assert.equal(contracts.scholarSkillsCapabilityModules.contract_id, 'opl_scholarskills_capability_modules');
  assert.equal(contracts.scholarSkillsCapabilityModules.brand_family, 'OPL ScholarSkills');
  assert.deepEqual(
    contracts.scholarSkillsCapabilityModules.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
});

test('opl scholar-skills list returns catalog readback with false authority boundary', () => {
  const output = runCli(['scholar-skills', 'list', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.scholar_skills.surface_kind, 'opl_scholarskills_capability_module_catalog');
  assert.equal(output.scholar_skills.module_count, 10);
  assert.deepEqual(
    output.scholar_skills.modules.map((entry: { module_id: string }) => entry.module_id),
    expectedModuleIds,
  );
  assert.equal(output.scholar_skills.authority_boundary.can_write_domain_truth, false);
  assert.equal(output.scholar_skills.authority_boundary.can_schedule_runtime, false);
  assert.equal(output.scholar_skills.runtime_environment_bridge.mode, 'refs_only');
});

test('opl scholar-skills inspect returns Display dependency and run-context refs', () => {
  const output = runCli([
    'scholar-skills',
    'inspect',
    '--module',
    'opl.scholarskills.display',
    '--json',
  ]);
  const module = output.scholar_skill_module;

  assert.equal(module.module_id, 'opl.scholarskills.display');
  assert.equal(module.display_name, 'Scholar Display');
  assert.equal(module.dependency_profile_refs.includes('runtime_env_dependency_profile:scholarskills_display_v1'), true);
  assert.equal(module.run_context_refs.includes('opl runtime env run-context --domain scholarskills --profile display --json'), true);
  assert.equal(module.invocation_entries[0].command, 'opl scholar-skills inspect --module opl.scholarskills.display --json');
  assert.equal(module.authority_boundary.can_write_domain_truth, false);
  assert.equal(module.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(module.allowed_writes.length, 0);
  assert.equal(module.forbidden_writes.includes('runtime queues/outbox/state'), true);
});

test('opl scholar-skills validate and doctor enforce authority false flags', () => {
  const validation = runCli(['scholar-skills', 'validate', '--json']).scholar_skills_validation;
  assert.equal(validation.status, 'valid');
  assert.equal(validation.validated_module_count, 10);
  assert.deepEqual(validation.authority_boundary_violations, []);
  assert.deepEqual(validation.write_boundary_violations, []);

  const doctor = runCli(['scholar-skills', 'doctor', '--json']).scholar_skills_doctor;
  assert.equal(doctor.status, 'pass');
  assert.equal(doctor.checks.every((entry: { status: string }) => entry.status === 'pass'), true);
  assert.equal(doctor.runtime_environment_bridge.can_write_runtime_state, false);
});

test('opl scholar-skills interfaces exposes JSON readback and runtime env bridge commands', () => {
  const output = runCli(['scholar-skills', 'interfaces', '--json']).scholar_skills_interfaces;

  assert.equal(output.surface_kind, 'opl_scholarskills_interface_bundle');
  assert.equal(output.cli.commands.includes('opl scholar-skills list --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills run-context --module <module_id> --profile <profile> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills invoke --module <module_id> --input-ref <ref> --artifact-root <ref> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills receipt --module <module_id> --input-ref <ref> --artifact-root <ref> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills validate --json'), true);
  assert.equal(output.runtime_environment_bridge.commands.includes('opl runtime env prepare --domain scholarskills --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json'), true);
  assert.equal(output.runtime_environment_bridge.commands.includes('opl runtime env run-context --domain scholarskills --profile <profile> --json'), true);
  assert.equal(output.authority_boundary.can_claim_runtime_ready, false);
});

test('opl scholar-skills prepare returns a deterministic refs-only dependency envelope without runtime state writes', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-prepare-'));
  try {
    const stateRoot = path.join(fixtureRoot, 'state');
    const paperRoot = path.join(fixtureRoot, 'paper');
    fs.mkdirSync(stateRoot);
    fs.mkdirSync(paperRoot);

    const output = runCli(
      [
        'scholar-skills',
        'prepare',
        '--module',
        'opl.scholarskills.display',
        '--profile',
        'display',
        '--platform',
        'macos-arm64',
        '--requirement-profile',
        'refs/requirements/display.json',
        '--paper-root',
        paperRoot,
        '--json',
      ],
      { OPL_STATE_DIR: stateRoot },
    ).scholar_skills_prepare;

    assert.equal(output.surface_kind, 'opl_scholarskills_dependency_prepare_ref_envelope');
    assert.equal(output.status, 'prepared_ref_envelope');
    assert.equal(output.prepared, false);
    assert.equal(output.can_claim_runtime_ready, false);
    assert.equal(output.can_write_runtime_state, false);
    assert.equal(output.runtime_owner_command, `opl runtime env prepare --domain scholarskills --profile display --platform macos-arm64 --requirement-profile refs/requirements/display.json --paper-root ${paperRoot} --json`);
    assert.equal(output.inputs.paper_root_ref, paperRoot);
    assert.equal(output.authority_boundary.can_write_runtime_state, false);
    assert.deepEqual(fs.readdirSync(stateRoot), []);
    assert.deepEqual(fs.readdirSync(paperRoot), []);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('opl scholar-skills run-context returns refs-only context envelope that cannot claim runtime-ready', () => {
  const output = runCli([
    'scholar-skills',
    'run-context',
    '--module',
    'opl.scholarskills.display',
    '--profile',
    'display',
    '--json',
  ]).scholar_skills_run_context;

  assert.equal(output.surface_kind, 'opl_scholarskills_run_context_ref_envelope');
  assert.equal(output.status, 'run_context_ref_envelope');
  assert.equal(output.can_claim_runtime_ready, false);
  assert.equal(output.can_write_runtime_state, false);
  assert.equal(output.runtime_owner_command, 'opl runtime env run-context --domain scholarskills --profile display --json');
  assert.equal(output.run_context_refs.includes('opl runtime env run-context --domain scholarskills --profile display --json'), true);
  assert.equal(output.authority_boundary.can_claim_runtime_ready, false);
});

test('opl scholar-skills invoke returns invocation envelope and unsigned execution receipt candidate', () => {
  const output = runCli([
    'scholar-skills',
    'invoke',
    '--module',
    'opl.scholarskills.display',
    '--input-ref',
    'mas:current_owner_delta/display-intent',
    '--artifact-root',
    'artifact-root:display-pack-candidates',
    '--json',
  ]).scholar_skills_invocation;

  assert.equal(output.surface_kind, 'opl_scholarskills_invocation_ref_envelope');
  assert.equal(output.status, 'invocation_ref_envelope');
  assert.equal(output.module_id, 'opl.scholarskills.display');
  assert.equal(output.input_ref, 'mas:current_owner_delta/display-intent');
  assert.equal(output.artifact_root_ref, 'artifact-root:display-pack-candidates');
  assert.equal(output.can_mutate_artifact_body, false);
  assert.equal(output.can_sign_owner_receipt, false);
  assert.equal(output.expected_artifact_refs[0].ref, 'artifact-root:display-pack-candidates/display_pack_agent_orchestration');
  assert.equal(output.execution_receipt_candidate.status, 'receipt_candidate_unsigned');
  assert.equal(output.execution_receipt_candidate.can_sign_owner_receipt, false);
  assert.equal(output.execution_receipt_candidate.can_claim_quality_verdict, false);
  assert.equal(output.execution_receipt_candidate.can_claim_artifact_authority, false);
  assert.equal(output.execution_receipt_candidate.authority_boundary.can_sign_owner_receipt, false);
});

test('opl scholar-skills receipt builds the same execution receipt candidate without signing owner authority', () => {
  const output = runCli([
    'scholar-skills',
    'receipt',
    '--module',
    'opl.scholarskills.display',
    '--input-ref',
    'mas:current_owner_delta/display-intent',
    '--artifact-root',
    'artifact-root:display-pack-candidates',
    '--json',
  ]).scholar_skills_receipt_candidate;

  assert.equal(output.surface_kind, 'opl_scholarskills_execution_receipt_candidate');
  assert.equal(output.status, 'receipt_candidate_unsigned');
  assert.equal(output.module_id, 'opl.scholarskills.display');
  assert.equal(output.receipt_body_policy, 'domain_owner_receipt_or_typed_blocker_required_for_authority');
  assert.equal(output.can_sign_owner_receipt, false);
  assert.equal(output.can_create_typed_blocker, false);
  assert.equal(output.accepted_receipt_refs.includes('owner_receipt_ref'), true);
});
