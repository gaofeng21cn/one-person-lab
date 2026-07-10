import { assert, fs, loadFrameworkContracts, os, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';
import { buildScholarSkillsCatalog } from '../../../../src/modules/pack/scholar-skills.ts';

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

const canonicalSourceFingerprint = '4efa4795120c5fcec8296133c05650800c63bd949f13a9a085ebd0d0763151c9';
const expandedAuthorityFalseFields = [
  'can_claim_publication_readiness',
  'can_claim_owner_acceptance',
  'can_claim_current_package_authority',
] as const;

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
  if (libPath) process.stdout.write(readPackages().join('\\n'));
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

function assertFalseAuthority(boundary: Record<string, unknown>) {
  for (const key of [
    'can_write_domain_truth',
    'can_mutate_artifact_body',
    'can_claim_runtime_ready',
    'can_sign_owner_receipt',
  ]) {
    if (key in boundary) assert.equal(boundary[key], false, key);
  }
}

function withCustomContracts(
  mutate: (contract: Record<string, any>) => void,
  run: (contractsDir: string) => void,
) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-contracts-'));
  try {
    const contractsDir = path.join(fixtureRoot, 'contracts');
    fs.cpSync(path.join(repoRoot, 'contracts', 'opl-framework'), contractsDir, { recursive: true });
    const contractPath = path.join(contractsDir, 'scholar-skills-capability-modules.json');
    const contract = parseJsonText(fs.readFileSync(contractPath, 'utf8')) as Record<string, any>;
    mutate(contract);
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
    run(contractsDir);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('ScholarSkills projection readback consumes the injected custom contracts root', () => {
  const fixtureFingerprint = 'a'.repeat(64);
  const fixtureSnapshotKind = 'fixture_pinned_source_commit';

  withCustomContracts((contract) => {
    contract.source_projection_contract.canonical_source.fingerprint = fixtureFingerprint;
    contract.source_projection_contract.currentness_boundary.snapshot_kind = fixtureSnapshotKind;
  }, (contractsDir) => {
    const contracts = loadFrameworkContracts({ contractsDir });
    const catalog = buildScholarSkillsCatalog(contracts).scholar_skills;

    assert.equal(catalog.source_fingerprint, `sha256:${fixtureFingerprint}`);
    assert.equal(
      catalog.source_projection_contract.currentness_boundary.snapshot_kind,
      fixtureSnapshotKind,
    );
  });
});

test('ScholarSkills projection fingerprint covers executable projection fields only', () => {
  const baseline = buildScholarSkillsCatalog(loadFrameworkContracts(repoRoot)).scholar_skills;
  let narrativeFingerprint = '';
  let executableFingerprint = '';

  withCustomContracts((contract) => {
    contract.purpose = 'fixture owner narrative outside the executable projection';
    contract.source_projection_contract.canonical_source.fingerprint = 'b'.repeat(64);
  }, (contractsDir) => {
    narrativeFingerprint = buildScholarSkillsCatalog(
      loadFrameworkContracts({ contractsDir }),
    ).scholar_skills.projection_fingerprint;
  });

  withCustomContracts((contract) => {
    contract.modules[0].stage_fit = [...contract.modules[0].stage_fit, 'fixture_projection_stage'];
  }, (contractsDir) => {
    executableFingerprint = buildScholarSkillsCatalog(
      loadFrameworkContracts({ contractsDir }),
    ).scholar_skills.projection_fingerprint;
  });

  assert.equal(narrativeFingerprint, baseline.projection_fingerprint);
  assert.notEqual(executableFingerprint, baseline.projection_fingerprint);
});

test('ScholarSkills contract rejects expanded authority claims', () => {
  const mutations: Array<(contract: Record<string, any>) => void> = [
    (contract) => {
      contract.authority_boundary.can_claim_publication_readiness = true;
    },
    (contract) => {
      contract.runtime_environment_bridge.can_claim_owner_acceptance = true;
    },
    (contract) => {
      contract.runtime_environment_bridge.bridge_envelope_policy.can_claim_current_package_authority = true;
    },
    (contract) => {
      contract.modules[0].authority_boundary.can_claim_owner_acceptance = true;
    },
  ];

  for (const mutate of mutations) {
    withCustomContracts(mutate, (contractsDir) => {
      assert.throws(
        () => loadFrameworkContracts({ contractsDir }),
        /must be false/,
      );
    });
  }
});

test('ScholarSkills catalog and list expose active modules without authority', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const contract = contracts.scholarSkillsCapabilityModules;
  const list = runCli(['scholar-skills', 'list', '--json']).scholar_skills;

  assert.equal(contract.contract_id, 'opl_scholarskills_capability_modules');
  assert.deepEqual(
    contract.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
  assert.equal(contract.source_projection_contract.canonical_source.owner_repo, 'mas-scholar-skills');
  assert.equal(contract.source_projection_contract.canonical_source.ref, 'main');
  assert.equal(
    contract.source_projection_contract.canonical_source.commit,
    '6b5146a74af95a570973e1d272871174f376f7a8',
  );
  assert.equal(
    contract.source_projection_contract.canonical_source.contract_path,
    'contracts/scholar-skills-capability-modules.json',
  );
  assert.equal(contract.source_projection_contract.canonical_source.fingerprint, canonicalSourceFingerprint);
  assert.equal(contract.source_projection_contract.currentness_boundary.sibling_repo_required_in_ci, false);
  assert.equal(
    contract.source_projection_contract.currentness_boundary.projection_claims_live_owner_currentness,
    false,
  );
  assert.equal(
    contract.source_projection_contract.projection_fingerprint_policy.covered_fields.some((field) =>
      field.includes('learned_pattern_policy') || field.includes('display_quality_floor_policy')
    ),
    false,
  );
  assert.equal(list.surface_kind, 'opl_scholarskills_capability_module_catalog');
  assert.equal(list.module_count, expectedModuleIds.length);
  assert.deepEqual(list.modules.map((entry: { module_id: string }) => entry.module_id), expectedModuleIds);
  assert.equal(list.source_fingerprint, `sha256:${canonicalSourceFingerprint}`);
  assert.match(list.projection_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(list.source_projection_contract, contract.source_projection_contract);
  assertFalseAuthority(list.authority_boundary);
  assert.equal(list.runtime_environment_bridge.mode, 'refs_only');
  assert.equal(list.ownership_boundary.professional_skill_truth_owner, 'MAS Scholar Skills');
  assert.doesNotMatch(JSON.stringify(list.runtime_environment_bridge), /--paper-root/);
  assert.match(JSON.stringify(list.runtime_environment_bridge), /--artifact-root/);
  for (const field of expandedAuthorityFalseFields) {
    assert.equal(list.authority_boundary[field], false, field);
    assert.equal(list.runtime_environment_bridge[field], false, `runtime_environment_bridge.${field}`);
    assert.equal(
      list.runtime_environment_bridge.bridge_envelope_policy[field],
      false,
      `runtime_environment_bridge.bridge_envelope_policy.${field}`,
    );
  }
  for (const module of list.modules) {
    assert.deepEqual(module.legacy_module_ids, [
      module.module_id.replace('mas-scholar-skills.', 'opl.scholarskills.'),
    ]);
    assert.equal(module.stage_fit.length > 0, true, module.module_id);
    assert.equal(module.dependency_profile_refs.length > 0, true, module.module_id);
    assert.equal(module.run_context_refs.length > 0, true, module.module_id);
    assert.equal(module.invocation_entries.length > 0, true, module.module_id);
    assert.equal(Object.hasOwn(module, 'learned_pattern_policy'), false, module.module_id);
    assert.equal(Object.hasOwn(module, 'display_quality_floor_policy'), false, module.module_id);
    for (const field of expandedAuthorityFalseFields) {
      assert.equal(module.authority_boundary[field], false, `${module.module_id}.${field}`);
    }
  }
  const lit = list.modules.find((module: { module_id: string }) => module.module_id === 'mas-scholar-skills.lit');
  assert.equal(
    lit.invocation_entries.some((entry: { entry_id: string }) => entry.entry_id === 'connect_scientific_source_search'),
    true,
  );
  const data = list.modules.find((module: { module_id: string }) => module.module_id === 'mas-scholar-skills.data');
  assert.equal(data.stage_fit.includes('artifact_bundle_manifest_review'), true);
});

test('opl scholar-skills inspect exposes module profiles and representative ref families', () => {
  for (const moduleId of expectedModuleIds) {
    const module = runCli(['scholar-skills', 'inspect', '--module', moduleId, '--json']).scholar_skill_module;
    const profile = module.module_profile;

    assert.equal(module.module_id, moduleId);
    assert.equal(profile.module_id, moduleId);
    assert.equal(profile.profile_id, moduleId.replace('mas-scholar-skills.', ''));
    assert.equal(profile.execution_receipt_ref_families.length > 0, true);
    assert.equal(profile.artifact_ref_families.length > 0, true);
    assert.deepEqual(
      module.execution_receipt_candidate.execution_receipt_ref_families,
      profile.execution_receipt_ref_families,
    );
    assert.deepEqual(
      module.execution_receipt_candidate.artifact_candidate_ref_families,
      profile.artifact_ref_families,
    );
    assertFalseAuthority(module.execution_receipt_candidate.authority_boundary);
  }

  const display = runCli([
    'scholar-skills',
    'inspect',
    '--module',
    'mas-scholar-skills.display',
    '--json',
  ]).scholar_skill_module;
  assert.equal(display.display_name, 'Scholar Display');
  assert.ok(display.dependency_profile_refs.includes('runtime_env_dependency_profile:scholarskills_display_v1'));
  assert.ok(display.module_profile.artifact_ref_families.includes('display_pack_agent_orchestration'));
  assert.equal(display.allowed_writes.length, 0);
  assertFalseAuthority(display.authority_boundary);

  const data = runCli([
    'scholar-skills',
    'inspect',
    '--module',
    'mas-scholar-skills.data',
    '--json',
  ]).scholar_skill_module.module_profile;
  assert.ok(data.stage_fit.includes('authoritative_body_boundary_review'));
  assert.ok(data.required_ref_families.includes('cold_restore_proof'));
});

test('opl scholar-skills validate doctor and interfaces preserve refs-only command boundaries', () => {
  const validation = runCli(['scholar-skills', 'validate', '--json']).scholar_skills_validation;
  const doctor = runCli(['scholar-skills', 'doctor', '--json']).scholar_skills_doctor;
  const interfaces = runCli(['scholar-skills', 'interfaces', '--json']).scholar_skills_interfaces;
  const canonical = runCli(['capability-pack', 'scholar-skills', 'list', '--json']).scholar_skills;
  const compatibility = runCli(['scholar-skills', 'list', '--json']).scholar_skills;

  assert.equal(validation.status, 'valid');
  assert.equal(validation.validated_module_count, expectedModuleIds.length);
  assert.deepEqual(validation.authority_boundary_violations, []);
  assert.deepEqual(validation.write_boundary_violations, []);
  assert.equal(doctor.status, 'pass');
  assert.equal(doctor.checks.every((entry: { status: string }) => entry.status === 'pass'), true);
  assert.equal(doctor.runtime_environment_bridge.can_write_runtime_state, false);
  assert.equal(interfaces.surface_kind, 'opl_scholarskills_interface_bundle');
  assert.equal(interfaces.cli.canonical_command_family, 'opl capability-pack');
  assert.equal(interfaces.cli.compatibility_alias, 'opl scholar-skills');
  for (const command of [
    'opl capability-pack scholar-skills list --json',
    'opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --artifact-root <path> --json',
    'opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json',
  ]) {
    assert.ok([...interfaces.cli.canonical_commands, ...interfaces.cli.commands].includes(command));
  }
  assert.equal(interfaces.runtime_environment_bridge.commands.some((command: string) =>
    command.startsWith('opl runtime env prepare --domain mas-scholar-skills')
  ), true);
  assert.equal(interfaces.authority_boundary.can_claim_runtime_ready, false);
  assert.deepEqual(
    canonical.modules.map((entry: { module_id: string }) => entry.module_id),
    compatibility.modules.map((entry: { module_id: string }) => entry.module_id),
  );
});

test('opl scholar-skills prepare stays refs-only and runtime bridge writes only dependency receipts', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-runtime-'));
  try {
    const stateRoot = path.join(fixtureRoot, 'state');
    const paperRoot = path.join(fixtureRoot, 'paper');
    const profilePath = path.join(fixtureRoot, 'renderer_dependency_profile.json');
    const binDir = path.join(fixtureRoot, 'bin');
    const rscriptPath = writeFakeRscript(binDir);
    const env = {
      OPL_STATE_DIR: stateRoot,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
    fs.mkdirSync(stateRoot);
    fs.mkdirSync(paperRoot, { recursive: true });
    writeRequirementProfile(profilePath);

    const refsOnly = runCli([
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
      '--artifact-root',
      paperRoot,
      '--json',
    ], { OPL_STATE_DIR: stateRoot }).scholar_skills_prepare;
    assert.equal(refsOnly.status, 'prepared_ref_envelope');
    assert.equal(refsOnly.can_claim_runtime_ready, false);
    assert.equal(refsOnly.can_write_runtime_state, false);
    assert.deepEqual(fs.readdirSync(stateRoot), []);
    assert.deepEqual(fs.readdirSync(paperRoot), []);

    const prepared = runCli([
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
      '--artifact-root',
      paperRoot,
      '--apply',
      '--json',
    ], env).scholar_skills_runtime_prepare;
    assert.equal(prepared.status, 'prepared');
    assert.equal(prepared.runtime_environment.prepare.binary_paths.Rscript, rscriptPath);
    assert.equal(prepared.writes.domain_truth_written, false);
    assert.equal(prepared.writes.artifact_body_written, false);
    for (const file of [
      'dependency_environment_lock.json',
      'dependency_environment_receipt.json',
      'dependency_run_context.json',
    ]) {
      assert.equal(fs.existsSync(path.join(paperRoot, 'build', file)), true, file);
    }

    const runContext = runCli([
      'scholar-skills',
      'runtime-run-context',
      '--module',
      'mas-scholar-skills.display',
      '--profile',
      'display',
      '--platform',
      'macos-arm64',
      '--artifact-root',
      paperRoot,
      '--json',
    ], env).scholar_skills_runtime_run_context;
    assert.equal(runContext.status, 'prepared');
    assert.equal(runContext.can_claim_runtime_ready, false);
    assert.equal(runContext.can_sign_owner_receipt, false);
    assert.equal(runContext.runtime_environment.run_context.consumer_boundary.host_environment_fallback_allowed, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('opl scholar-skills run invoke receipt and materialize keep unsigned candidate authority', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-skills-materialize-'));
  try {
    const runContext = runCli([
      'scholar-skills',
      'run-context',
      '--module',
      'mas-scholar-skills.display',
      '--profile',
      'display',
      '--json',
    ]).scholar_skills_run_context;
    assert.equal(runContext.status, 'run_context_ref_envelope');
    assert.equal(runContext.can_claim_runtime_ready, false);
    assert.equal(runContext.can_write_runtime_state, false);

    const invocation = runCli([
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
    const receipt = runCli([
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
    assert.equal(invocation.status, 'invocation_ref_envelope');
    assert.equal(invocation.execution_receipt_candidate.status, 'receipt_candidate_unsigned');
    assert.equal(receipt.status, 'receipt_candidate_unsigned');
    assert.equal(receipt.execution_receipt_ref.startsWith('opl://scholarskills/execution-receipt-candidates/'), true);
    assert.equal(receipt.can_sign_owner_receipt, false);
    assert.equal(receipt.can_create_typed_blocker, false);

    for (const moduleId of expectedModuleIds) {
      const outputRoot = path.join(fixtureRoot, moduleId.replaceAll('.', '-'));
      const materialized = runCli([
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
      const second = runCli([
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
      const moduleCandidate = parseJsonText(fs.readFileSync(materialized.module_candidate_path, 'utf8')) as any;

      assert.equal(materialized.status, 'materialized_candidate_package');
      assert.equal(materialized.sha256, second.sha256);
      assert.equal(materialized.writes.domain_truth_written, false);
      assert.equal(materialized.writes.owner_receipt_signed, false);
      assert.equal(moduleCandidate.module_id, moduleId);
      assert.equal(moduleCandidate.owner_consumption.required_for_paper_truth, true);
      assert.equal(moduleCandidate.authority_boundary.can_write_domain_truth, false);
      assert.equal(moduleCandidate.execution_receipt_ref_families.length > 0, true);
      assert.equal(moduleCandidate.artifact_candidate_ref_families.length > 0, true);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
