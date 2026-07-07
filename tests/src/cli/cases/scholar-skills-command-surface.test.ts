import { assert, fs, loadFrameworkContracts, os, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';

const expectedModuleIds = [
  'mas-scholar-skills.display',
  'mas-scholar-skills.tables',
  'mas-scholar-skills.stats',
  'mas-scholar-skills.lit',
  'mas-scholar-skills.write',
  'mas-scholar-skills.review',
  'mas-scholar-skills.submit',
  'mas-scholar-skills.data',
] as const;

type ExpectedModuleId = typeof expectedModuleIds[number];

const expectedReceiptRefFamiliesByModule = {
  'mas-scholar-skills.display': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'render_cache_ref',
    'artifact_manifest_ref',
    'visual_audit_or_gallery_preview_ref',
  ],
  'mas-scholar-skills.tables': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'table_manifest_ref',
    'table_qc_ref',
  ],
  'mas-scholar-skills.stats': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'analysis_manifest_ref',
    'reproducibility_check_ref',
  ],
  'mas-scholar-skills.lit': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'evidence_map_ref',
    'citation_manifest_ref',
  ],
  'mas-scholar-skills.write': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'draft_section_manifest_ref',
    'source_trace_ref',
  ],
  'mas-scholar-skills.review': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'reviewer_report_ref',
    'route_back_ref',
  ],
  'mas-scholar-skills.submit': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'package_manifest_ref',
    'submission_checklist_ref',
  ],
  'mas-scholar-skills.data': [
    'input_fingerprint_ref',
    'dependency_profile_ref',
    'prepared_run_context_ref',
    'data_manifest_ref',
    'dataset_manifest_ref',
    'data_governance_handoff_ref',
    'data_governance_assessment_ref',
    'data_operation_receipt_ref',
    'manifest_completeness_check_ref',
    'privacy_tier_check_ref',
    'study_impact_check_ref',
    'registry_lineage_ref',
    'semantic_readiness_ref',
    'study_binding_ref',
    'privacy_access_tier_ref',
    'retention_guardrail_ref',
    'storage_tier_ref',
    'authoritative_body_boundary_ref',
    'derived_copy_inventory_ref',
    'analytical_format_strategy_ref',
    'cold_restore_proof_ref',
    'read_model_boundary_ref',
    'lineage_readiness_ref',
  ],
} satisfies Record<ExpectedModuleId, string[]>;

const expectedArtifactRefFamiliesByModule = {
  'mas-scholar-skills.display': ['display_pack_agent_orchestration'],
  'mas-scholar-skills.tables': ['table_manifest', 'table_qc'],
  'mas-scholar-skills.stats': ['analysis_manifest', 'reproducibility_check'],
  'mas-scholar-skills.lit': ['evidence_map', 'citation_manifest'],
  'mas-scholar-skills.write': ['draft_section_manifest', 'source_trace'],
  'mas-scholar-skills.review': ['reviewer_report', 'route_back'],
  'mas-scholar-skills.submit': ['package_manifest', 'submission_checklist'],
  'mas-scholar-skills.data': [
    'data_manifest',
    'dataset_manifest',
    'data_governance_handoff',
    'data_governance_assessment',
    'data_operation_receipt',
    'manifest_completeness_check',
    'privacy_tier_check',
    'study_impact_check',
    'registry_lineage',
    'semantic_readiness',
    'study_binding',
    'privacy_access_tier',
    'retention_guardrail',
    'storage_tier',
    'authoritative_body_boundary',
    'derived_copy_inventory',
    'analytical_format_strategy',
    'cold_restore_proof',
    'read_model_boundary',
    'lineage_readiness',
  ],
} satisfies Record<ExpectedModuleId, string[]>;

function writeFakeRscript(binDir: string) {
  fs.mkdirSync(binDir, { recursive: true });
  const rscriptPath = path.join(binDir, 'Rscript');
  fs.writeFileSync(
    rscriptPath,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const expression = process.argv[3] || '';
const libMatch = expression.match(/lib\\.loc\\s*=\\s*"([^"]+)"/)
  || expression.match(/lib\\s*=\\s*"([^"]+)"/)
  || expression.match(/dir\\.exists\\("([^"]+)"\\)/);
const libPath = libMatch ? libMatch[1] : '';
const markerPath = libPath ? path.join(libPath, '.fake-installed-packages.json') : '';
const readPackages = () => {
  if (!markerPath || !fs.existsSync(markerPath)) return [];
  return JSON.parse(fs.readFileSync(markerPath, 'utf8')); // reuse-first: allow embedded Rscript fixture JSON boundary.
};
if (expression.includes('priority = c("base", "recommended")')) {
  process.stdout.write('grid\\n');
  process.exit(0);
}
if (expression.includes('install.packages')) {
  const packageMatch = expression.match(/install\\.packages\\(c\\(([^)]*)\\)/);
  const packages = packageMatch
    ? packageMatch[1].split(',').map((part) => part.trim().replace(/^"|"$/g, '')).filter(Boolean)
    : [];
  fs.mkdirSync(libPath, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(Array.from(new Set([...readPackages(), ...packages]))));
  process.exit(0);
}
if (expression.includes('installed.packages')) {
  if (libPath) {
    process.stdout.write(readPackages().join('\\n'));
    process.exit(0);
  }
  process.exit(0);
}
process.exit(0);
`,
    { mode: 0o755 },
  );
  return rscriptPath;
}

function writeRequirementProfile(profilePath: string) {
  fs.writeFileSync(
    profilePath,
    JSON.stringify({
      surface_kind: 'opl_dependency_requirement_profile',
      profiles: [
        {
          profile_id: 'scholar_display_test_profile',
          runtime_binaries: [{ name: 'Rscript', required: true }],
          language_packages: {
            r: [
              { name: 'ggplot2', required: true },
              { name: 'grid', required: true },
            ],
          },
        },
      ],
    }),
  );
}

test('ScholarSkills capability module descriptor contract is loaded and exposes active professional modules', () => {
  const contracts = loadFrameworkContracts(repoRoot);

  assert.equal(contracts.scholarSkillsCapabilityModules.contract_id, 'opl_scholarskills_capability_modules');
  assert.equal(contracts.scholarSkillsCapabilityModules.brand_family, 'MAS Scholar Skills');
  assert.deepEqual(
    contracts.scholarSkillsCapabilityModules.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
});

test('opl scholar-skills list returns catalog readback with false authority boundary', () => {
  const output = runCli(['scholar-skills', 'list', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.scholar_skills.surface_kind, 'opl_scholarskills_capability_module_catalog');
  assert.equal(output.scholar_skills.module_count, 8);
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
    'mas-scholar-skills.display',
    '--json',
  ]);
  const module = output.scholar_skill_module;

  assert.equal(module.module_id, 'mas-scholar-skills.display');
  assert.equal(module.display_name, 'Scholar Display');
  assert.equal(module.dependency_profile_refs.includes('runtime_env_dependency_profile:scholarskills_display_v1'), true);
  assert.equal(module.run_context_refs.includes('opl runtime env run-context --domain mas-scholar-skills --profile display --json'), true);
  assert.equal(module.invocation_entries[0].command, 'opl scholar-skills inspect --module mas-scholar-skills.display --json');
  assert.equal(module.authority_boundary.can_write_domain_truth, false);
  assert.equal(module.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(module.allowed_writes.length, 0);
  assert.equal(module.forbidden_writes.includes('runtime queues/outbox/state'), true);
});

test('opl scholar-skills exposes module-specific capability profiles for every ScholarSkills module', () => {
  for (const moduleId of expectedModuleIds) {
    const output = runCli([
      'scholar-skills',
      'inspect',
      '--module',
      moduleId,
      '--json',
    ]).scholar_skill_module;
    const profile = output.module_profile;

    assert.equal(profile.module_id, moduleId);
    assert.equal(profile.profile_id, moduleId.replace('mas-scholar-skills.', ''));
    assert.deepEqual(
      profile.execution_receipt_ref_families.map((family: string) => `${family}_ref`),
      expectedReceiptRefFamiliesByModule[moduleId],
    );
    assert.deepEqual(
      profile.artifact_ref_families,
      expectedArtifactRefFamiliesByModule[moduleId],
    );
    assert.deepEqual(
      output.execution_receipt_candidate.execution_receipt_ref_families.map((family: string) => `${family}_ref`),
      expectedReceiptRefFamiliesByModule[moduleId],
    );
    assert.deepEqual(
      output.execution_receipt_candidate.artifact_candidate_ref_families,
      expectedArtifactRefFamiliesByModule[moduleId],
    );
    assert.equal(output.execution_receipt_candidate.counts_as_paper_truth, false);
    assert.equal(output.execution_receipt_candidate.counts_as_owner_receipt, false);
    assert.equal(output.execution_receipt_candidate.can_authorize_publication_readiness, false);
    assert.equal(output.execution_receipt_candidate.authority_boundary.can_write_domain_truth, false);
    if (moduleId === 'mas-scholar-skills.data') {
      assert.equal(profile.stage_fit.includes('storage_tier_review'), true);
      assert.equal(profile.stage_fit.includes('authoritative_body_boundary_review'), true);
      assert.equal(profile.stage_fit.includes('derived_copy_inventory_review'), true);
      assert.equal(profile.stage_fit.includes('analytical_format_strategy_review'), true);
      assert.equal(profile.stage_fit.includes('cold_restore_proof_review'), true);
      assert.equal(
        profile.required_ref_families.includes('authoritative_body_boundary'),
        true,
      );
      assert.equal(
        profile.required_ref_families.includes('cold_restore_proof'),
        true,
      );
    }
  }
});

test('opl scholar-skills validate and doctor enforce authority false flags', () => {
  const validation = runCli(['scholar-skills', 'validate', '--json']).scholar_skills_validation;
  assert.equal(validation.status, 'valid');
  assert.equal(validation.validated_module_count, 8);
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
  assert.equal(output.cli.canonical_command_family, 'opl capability-pack');
  assert.equal(output.cli.compatibility_alias, 'opl scholar-skills');
  assert.equal(output.cli.alias_scope, 'mas_scholar_skills_capability_pack_only');
  assert.equal(output.cli.canonical_commands.includes('opl capability-pack scholar-skills list --json'), true);
  assert.equal(output.cli.canonical_commands.includes('opl capability-pack scholar-skills validate --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills list --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills run-context --module <module_id> --profile <profile> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills invoke --module <module_id> --input-ref <ref> --artifact-root <ref> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills receipt --module <module_id> --input-ref <ref> --artifact-root <ref> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --emit-candidate-artifacts --payload-file <path> --json'), true);
  assert.equal(output.cli.commands.includes('opl scholar-skills validate --json'), true);
  assert.equal(output.runtime_environment_bridge.commands.includes('opl runtime env prepare --domain mas-scholar-skills --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json'), true);
  assert.equal(output.runtime_environment_bridge.commands.includes('opl runtime env run-context --domain mas-scholar-skills --profile <profile> --json'), true);
  assert.equal(output.authority_boundary.can_claim_runtime_ready, false);
});

test('opl capability-pack scholar-skills is the canonical CLI family for ScholarSkills modules', () => {
  const canonical = runCli(['capability-pack', 'scholar-skills', 'list', '--json']).scholar_skills;
  const compatibility = runCli(['scholar-skills', 'list', '--json']).scholar_skills;

  assert.equal(canonical.surface_kind, 'opl_scholarskills_capability_module_catalog');
  assert.deepEqual(
    canonical.modules.map((entry: { module_id: string }) => entry.module_id),
    compatibility.modules.map((entry: { module_id: string }) => entry.module_id),
  );
  const help = runCli(['help', 'capability-pack', 'scholar-skills']).help;
  assert.equal(help.command, 'capability-pack scholar-skills');
  assert.equal(help.subcommands.some((entry: { command: string }) =>
    entry.command === 'capability-pack scholar-skills list'
  ), true);
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
        'mas-scholar-skills.display',
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
    assert.equal(output.runtime_owner_command, `opl runtime env prepare --domain mas-scholar-skills --profile display --platform macos-arm64 --requirement-profile refs/requirements/display.json --paper-root ${paperRoot} --json`);
    assert.equal(output.inputs.paper_root_ref, paperRoot);
    assert.equal(output.authority_boundary.can_write_runtime_state, false);
    assert.deepEqual(fs.readdirSync(stateRoot), []);
    assert.deepEqual(fs.readdirSync(paperRoot), []);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('opl scholar-skills runtime-prepare invokes OPL runtime env substrate without domain authority', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-runtime-prepare-'));
  try {
    const stateRoot = path.join(fixtureRoot, 'state');
    const paperRoot = path.join(fixtureRoot, 'paper');
    const profilePath = path.join(fixtureRoot, 'renderer_dependency_profile.json');
    const binDir = path.join(fixtureRoot, 'bin');
    const rscriptPath = writeFakeRscript(binDir);
    fs.mkdirSync(paperRoot, { recursive: true });
    writeRequirementProfile(profilePath);

    const output = runCli(
      [
        'scholar-skills',
        'runtime-prepare',
        '--module',
        'mas-scholar-skills.display',
        '--profile',
        'display',
        '--platform',
        'macos-arm64',
        '--requirement-profile',
        profilePath,
        '--requirement-profile-id',
        'scholar_display_test_profile',
        '--paper-root',
        paperRoot,
        '--apply',
        '--json',
      ],
      {
        OPL_STATE_DIR: stateRoot,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    ).scholar_skills_runtime_prepare;

    assert.equal(output.surface_kind, 'opl_scholarskills_runtime_prepare_bridge');
    assert.equal(output.status, 'prepared');
    assert.equal(output.module_id, 'mas-scholar-skills.display');
    assert.equal(output.runtime_domain_id, 'scholarskills');
    assert.equal(output.apply_requested, true);
    assert.equal(output.requirement_profile_id, 'scholar_display_test_profile');
    assert.equal(output.runtime_owner_command, `opl runtime env prepare --domain mas-scholar-skills --profile display --platform macos-arm64 --requirement-profile ${profilePath} --requirement-profile-id scholar_display_test_profile --paper-root ${paperRoot} --apply --json`);
    assert.equal(output.dependency_lock_ref, 'paper/build/dependency_environment_lock.json');
    assert.equal(output.dependency_receipt_ref, 'paper/build/dependency_environment_receipt.json');
    assert.equal(output.dependency_run_context_ref, 'paper/build/dependency_run_context.json');
    assert.equal(output.consumer_preflight.status, 'bound');
    assert.equal(output.writes.dependency_lock_written, true);
    assert.equal(output.writes.dependency_receipt_written, true);
    assert.equal(output.writes.dependency_run_context_written, true);
    assert.equal(output.writes.domain_truth_written, false);
    assert.equal(output.writes.artifact_body_written, false);
    assert.equal(output.can_claim_runtime_ready, false);
    assert.equal(output.can_claim_domain_ready, false);
    assert.equal(output.can_sign_owner_receipt, false);
    assert.equal(output.can_create_typed_blocker, false);
    assert.equal(output.runtime_environment.prepare.binary_paths.Rscript, rscriptPath);
    assert.equal(fs.existsSync(path.join(paperRoot, 'build', 'dependency_environment_lock.json')), true);
    assert.equal(fs.existsSync(path.join(paperRoot, 'build', 'dependency_environment_receipt.json')), true);
    assert.equal(fs.existsSync(path.join(paperRoot, 'build', 'dependency_run_context.json')), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('opl scholar-skills runtime-run-context reads prepared context and keeps false authority flags', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-runtime-context-'));
  try {
    const stateRoot = path.join(fixtureRoot, 'state');
    const paperRoot = path.join(fixtureRoot, 'paper');
    const profilePath = path.join(fixtureRoot, 'renderer_dependency_profile.json');
    const binDir = path.join(fixtureRoot, 'bin');
    writeFakeRscript(binDir);
    fs.mkdirSync(paperRoot, { recursive: true });
    writeRequirementProfile(profilePath);
    const env = {
      OPL_STATE_DIR: stateRoot,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };

    runCli(
      [
        'scholar-skills',
        'runtime-prepare',
        '--module',
        'mas-scholar-skills.display',
        '--profile',
        'display',
        '--platform',
        'macos-arm64',
        '--requirement-profile',
        profilePath,
        '--paper-root',
        paperRoot,
        '--apply',
        '--json',
      ],
      env,
    );

    const output = runCli(
      [
        'scholar-skills',
        'runtime-run-context',
        '--module',
        'mas-scholar-skills.display',
        '--profile',
        'display',
        '--platform',
        'macos-arm64',
        '--paper-root',
        paperRoot,
        '--json',
      ],
      env,
    ).scholar_skills_runtime_run_context;

    assert.equal(output.surface_kind, 'opl_scholarskills_runtime_run_context_bridge');
    assert.equal(output.status, 'prepared');
    assert.equal(output.module_id, 'mas-scholar-skills.display');
    assert.equal(output.run_context_ref, null);
    assert.equal(output.consumer_preflight.status, 'bound');
    assert.equal(output.can_consume_run_context, true);
    assert.equal(output.can_schedule_domain_stage, false);
    assert.equal(output.can_claim_provider_ready, false);
    assert.equal(output.can_claim_runtime_ready, false);
    assert.equal(output.can_claim_domain_ready, false);
    assert.equal(output.can_claim_app_release_ready, false);
    assert.equal(output.can_sign_owner_receipt, false);
    assert.equal(output.can_create_typed_blocker, false);
    assert.equal(output.runtime_owner_command, `opl runtime env run-context --domain mas-scholar-skills --profile display --platform macos-arm64 --paper-root ${paperRoot} --json`);
    assert.equal(output.runtime_environment.run_context.consumer_preflight.status, 'bound');
    assert.equal(output.runtime_environment.run_context.consumer_boundary.host_environment_fallback_allowed, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('opl scholar-skills run-context returns refs-only context envelope that cannot claim runtime-ready', () => {
  const output = runCli([
    'scholar-skills',
    'run-context',
    '--module',
    'mas-scholar-skills.display',
    '--profile',
    'display',
    '--json',
  ]).scholar_skills_run_context;

  assert.equal(output.surface_kind, 'opl_scholarskills_run_context_ref_envelope');
  assert.equal(output.status, 'run_context_ref_envelope');
  assert.equal(output.can_claim_runtime_ready, false);
  assert.equal(output.can_write_runtime_state, false);
  assert.equal(output.runtime_owner_command, 'opl runtime env run-context --domain mas-scholar-skills --profile display --json');
  assert.equal(output.run_context_refs.includes('opl runtime env run-context --domain mas-scholar-skills --profile display --json'), true);
  assert.equal(output.authority_boundary.can_claim_runtime_ready, false);
});

test('opl scholar-skills invoke returns invocation envelope and unsigned execution receipt candidate', () => {
  const output = runCli([
    'scholar-skills',
    'invoke',
    '--module',
    'mas-scholar-skills.display',
    '--input-ref',
    'mas:current_owner_delta/display-intent',
    '--artifact-root',
    'artifact-root:display-pack-candidates',
    '--json',
  ]).scholar_skills_invocation;

  assert.equal(output.surface_kind, 'opl_scholarskills_invocation_ref_envelope');
  assert.equal(output.status, 'invocation_ref_envelope');
  assert.equal(output.module_id, 'mas-scholar-skills.display');
  assert.equal(output.input_ref, 'mas:current_owner_delta/display-intent');
  assert.equal(output.artifact_root_ref, 'artifact-root:display-pack-candidates');
  assert.equal(output.can_mutate_artifact_body, false);
  assert.equal(output.can_sign_owner_receipt, false);
  assert.equal(output.expected_artifact_refs[0].ref, 'artifact-root:display-pack-candidates/display_pack_agent_orchestration');
  assert.equal(output.execution_receipt_candidate.status, 'receipt_candidate_unsigned');
  assert.equal(output.execution_receipt_candidate.execution_receipt_counts_as_candidate_artifact, true);
  assert.equal(output.execution_receipt_candidate.counts_as_paper_truth, false);
  assert.equal(output.execution_receipt_candidate.counts_as_owner_receipt, false);
  assert.equal(output.execution_receipt_candidate.can_authorize_publication_readiness, false);
  assert.equal(output.execution_receipt_candidate.can_sign_owner_receipt, false);
  assert.equal(output.execution_receipt_candidate.can_claim_quality_verdict, false);
  assert.equal(output.execution_receipt_candidate.can_claim_artifact_authority, false);
  assert.equal(output.execution_receipt_candidate.authority_boundary.can_sign_owner_receipt, false);
});

test('opl scholar-skills materialize writes a deterministic refs-only candidate package', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-materialize-'));
  try {
    const outputRoot = path.join(fixtureRoot, 'candidate-package');
    const output = runCli([
      'scholar-skills',
      'materialize',
      '--module',
      'mas-scholar-skills.display',
      '--input-ref',
      'mas:current_owner_delta/display-intent',
      '--artifact-root',
      'artifact-root:display-pack-candidates',
      '--output-root',
      outputRoot,
      '--json',
    ]).scholar_skills_materialize;
    const secondOutput = runCli([
      'scholar-skills',
      'materialize',
      '--module',
      'mas-scholar-skills.display',
      '--input-ref',
      'mas:current_owner_delta/display-intent',
      '--artifact-root',
      'artifact-root:display-pack-candidates',
      '--output-root',
      outputRoot,
      '--json',
    ]).scholar_skills_materialize;

    assert.equal(output.surface_kind, 'opl_scholarskills_materialized_candidate_package');
    assert.equal(output.status, 'materialized_candidate_package');
    assert.equal(output.module_id, 'mas-scholar-skills.display');
    assert.equal(output.input_ref, 'mas:current_owner_delta/display-intent');
    assert.equal(output.artifact_root_ref, 'artifact-root:display-pack-candidates');
    assert.equal(output.output_root, outputRoot);
    assert.equal(output.output_root_ref, `file://${outputRoot}`);
    assert.equal(output.execution_receipt_ref.startsWith('opl://scholarskills/execution-receipt-candidates/'), true);
    assert.equal(output.execution_receipt_candidate_path, path.join(outputRoot, 'execution_receipt_candidate.json'));
    assert.equal(output.module_candidate_path, path.join(outputRoot, 'module_candidate.json'));
    assert.equal(output.artifact_manifest_path, path.join(outputRoot, 'manifest.json'));
    assert.equal(output.refs_manifest_path, path.join(outputRoot, 'refs_manifest.json'));
    assert.deepEqual(output.written_files.sort(), [
      path.join(outputRoot, 'execution_receipt_candidate.json'),
      path.join(outputRoot, 'manifest.json'),
      path.join(outputRoot, 'module_candidate.json'),
      path.join(outputRoot, 'refs_manifest.json'),
    ].sort());
    assert.equal(output.sha256, secondOutput.sha256);
    assert.equal(output.authority_flags.counts_as_paper_truth, false);
    assert.equal(output.authority_flags.counts_as_owner_receipt, false);
    assert.equal(output.authority_flags.can_authorize_publication_readiness, false);
    assert.equal(output.authority_flags.can_write_runtime_state, false);
    assert.equal(output.authority_flags.can_write_domain_truth, false);
    assert.equal(output.authority_flags.can_mutate_artifact_body, false);
    assert.equal(output.writes.runtime_db_written, false);
    assert.equal(output.writes.domain_truth_written, false);
    assert.equal(output.writes.owner_receipt_signed, false);
    assert.equal(output.writes.typed_blocker_created, false);
    assert.equal(output.writes.paper_body_written, false);
    assert.equal(output.writes.artifact_body_written, false);

    const manifest = parseJsonText(fs.readFileSync(output.artifact_manifest_path, 'utf8')) as any;
    const receipt = parseJsonText(fs.readFileSync(output.execution_receipt_candidate_path, 'utf8')) as any;
    const moduleCandidate = parseJsonText(fs.readFileSync(output.module_candidate_path, 'utf8')) as any;
    const refs = parseJsonText(fs.readFileSync(output.refs_manifest_path, 'utf8')) as any;
    assert.equal(manifest.surface_kind, 'opl_scholarskills_materialized_candidate_package_manifest');
    assert.equal(manifest.authority_flags.can_sign_owner_receipt, false);
    assert.equal(manifest.module_candidate_path, path.join(outputRoot, 'module_candidate.json'));
    assert.equal(manifest.module_candidate.surface_kind, 'opl_scholarskills_module_candidate_payload');
    assert.equal(manifest.module_candidate.owner_consumption_required_for_paper_truth, true);
    assert.equal(manifest.module_candidate.counts_as_paper_truth, false);
    assert.equal(manifest.module_candidate.can_authorize_publication_readiness, false);
    assert.equal(receipt.surface_kind, 'opl_scholarskills_execution_receipt_candidate');
    assert.equal(receipt.counts_as_paper_truth, false);
    assert.equal(moduleCandidate.surface_kind, 'opl_scholarskills_module_candidate_payload');
    assert.equal(moduleCandidate.status, 'module_candidate_refs_only');
    assert.equal(moduleCandidate.module_id, 'mas-scholar-skills.display');
    assert.deepEqual(moduleCandidate.artifact_candidate_ref_families, ['display_pack_agent_orchestration']);
    assert.equal(moduleCandidate.quality_checklist.can_claim_quality_verdict, false);
    assert.equal(moduleCandidate.owner_consumption.required_for_paper_truth, true);
    assert.equal(moduleCandidate.owner_consumption.counts_as_paper_truth, false);
    assert.equal(moduleCandidate.owner_consumption.can_authorize_publication_readiness, false);
    assert.equal(moduleCandidate.writes.domain_truth_written, false);
    assert.equal(moduleCandidate.authority_flags.can_mutate_artifact_body, false);
    assert.equal(refs.surface_kind, 'opl_scholarskills_refs_manifest');
    assert.equal(refs.artifact_body_written, false);
    assert.deepEqual(fs.readdirSync(fixtureRoot), ['candidate-package']);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('opl scholar-skills materialize writes module-specific candidate payloads for every module', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-materialize-all-'));
  try {
    for (const moduleId of expectedModuleIds) {
      const outputRoot = path.join(fixtureRoot, moduleId.replaceAll('.', '-'));
      const output = runCli([
        'scholar-skills',
        'materialize',
        '--module',
        moduleId,
        '--input-ref',
        `mas:current_owner_delta/${moduleId}`,
        '--artifact-root',
        `artifact-root:${moduleId}`,
        '--output-root',
        outputRoot,
        '--json',
      ]).scholar_skills_materialize;
      const moduleCandidate = parseJsonText(fs.readFileSync(output.module_candidate_path, 'utf8')) as any;

      assert.equal(moduleCandidate.module_id, moduleId);
      assert.equal(moduleCandidate.profile_id, moduleId.replace('mas-scholar-skills.', ''));
      assert.deepEqual(
        moduleCandidate.artifact_candidate_ref_families,
        expectedArtifactRefFamiliesByModule[moduleId],
      );
      assert.deepEqual(
        moduleCandidate.execution_receipt_ref_families.map((family: string) => `${family}_ref`),
        expectedReceiptRefFamiliesByModule[moduleId],
      );
      assert.equal(moduleCandidate.quality_checklist.can_claim_quality_verdict, false);
      assert.equal(moduleCandidate.owner_consumption.required_for_paper_truth, true);
      assert.equal(moduleCandidate.owner_consumption.counts_as_owner_receipt, false);
      assert.equal(moduleCandidate.authority_flags.can_sign_owner_receipt, false);
      assert.equal(moduleCandidate.authority_boundary.can_write_domain_truth, false);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('opl scholar-skills invoke and receipt return module-specific unsigned candidates for all modules', () => {
  for (const moduleId of expectedModuleIds) {
    const inputRef = `mas:current_owner_delta/${moduleId}`;
    const artifactRoot = `artifact-root:${moduleId}`;
    const invocation = runCli([
      'scholar-skills',
      'invoke',
      '--module',
      moduleId,
      '--input-ref',
      inputRef,
      '--artifact-root',
      artifactRoot,
      '--json',
    ]).scholar_skills_invocation;
    const receipt = runCli([
      'scholar-skills',
      'receipt',
      '--module',
      moduleId,
      '--input-ref',
      inputRef,
      '--artifact-root',
      artifactRoot,
      '--json',
    ]).scholar_skills_receipt_candidate;

    assert.equal(invocation.module_id, moduleId);
    assert.equal(receipt.module_id, moduleId);
    assert.deepEqual(
      Object.keys(invocation.execution_receipt_candidate.execution_receipt_refs),
      expectedReceiptRefFamiliesByModule[moduleId],
    );
    assert.deepEqual(
      Object.keys(receipt.execution_receipt_refs),
      expectedReceiptRefFamiliesByModule[moduleId],
    );
    assert.deepEqual(
      invocation.execution_receipt_candidate.artifact_candidate_ref_families,
      expectedArtifactRefFamiliesByModule[moduleId],
    );
    assert.deepEqual(
      invocation.expected_artifact_refs.map((entry: { ref_family: string }) => entry.ref_family),
      expectedArtifactRefFamiliesByModule[moduleId],
    );
    assert.equal(invocation.execution_receipt_candidate.counts_as_paper_truth, false);
    assert.equal(receipt.counts_as_owner_receipt, false);
    assert.equal(receipt.can_authorize_publication_readiness, false);
    assert.equal(receipt.authority_boundary.can_mutate_artifact_body, false);
  }
});

test('opl scholar-skills receipt builds the same execution receipt candidate without signing owner authority', () => {
  const output = runCli([
    'scholar-skills',
    'receipt',
    '--module',
    'mas-scholar-skills.display',
    '--input-ref',
    'mas:current_owner_delta/display-intent',
    '--artifact-root',
    'artifact-root:display-pack-candidates',
    '--json',
  ]).scholar_skills_receipt_candidate;

  assert.equal(output.surface_kind, 'opl_scholarskills_execution_receipt_candidate');
  assert.equal(output.status, 'receipt_candidate_unsigned');
  assert.equal(output.module_id, 'mas-scholar-skills.display');
  assert.equal(
    output.execution_receipt_ref,
    'opl://scholarskills/execution-receipt-candidates/mas-scholar-skills.display/187f2f4592ac23dcbe837e6ecc278dd434e2647135059d50a8acc00b2b5fc1c9',
  );
  assert.deepEqual(output.execution_receipt_refs, {
    input_fingerprint_ref: `${output.execution_receipt_ref}#input_fingerprint_ref`,
    dependency_profile_ref: `${output.execution_receipt_ref}#dependency_profile_ref`,
    prepared_run_context_ref: `${output.execution_receipt_ref}#prepared_run_context_ref`,
    render_cache_ref: `${output.execution_receipt_ref}#render_cache_ref`,
    artifact_manifest_ref: `${output.execution_receipt_ref}#artifact_manifest_ref`,
    visual_audit_or_gallery_preview_ref: `${output.execution_receipt_ref}#visual_audit_or_gallery_preview_ref`,
  });
  assert.equal(output.execution_receipt_counts_as_candidate_artifact, true);
  assert.equal(output.counts_as_paper_truth, false);
  assert.equal(output.counts_as_owner_receipt, false);
  assert.equal(output.can_authorize_publication_readiness, false);
  assert.equal(output.receipt_body_policy, 'domain_owner_receipt_or_typed_blocker_required_for_authority');
  assert.equal(output.can_sign_owner_receipt, false);
  assert.equal(output.can_create_typed_blocker, false);
  assert.equal(output.accepted_receipt_refs.includes('owner_receipt_ref'), true);
});
