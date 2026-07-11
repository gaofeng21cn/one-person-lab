import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';

test('agents scaffold validation blocks missing stage operating principles policy', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-scaffold-stage-policy-missing-'));
  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'award-foundry',
      '--domain-label',
      'Award Foundry',
    ]);
    fs.rmSync(path.join(targetDir, 'contracts', 'stage_operating_principles.json'));

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(
      validated.validation.missing_contract_files.includes('contracts/stage_operating_principles.json'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('missing_contract:contracts/stage_operating_principles.json'),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks missing standard agent principles adoption contract', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-scaffold-principles-missing-'));
  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'award-foundry',
      '--domain-label',
      'Award Foundry',
    ]);
    fs.rmSync(path.join(targetDir, 'contracts', 'standard-agent-principles-adoption.json'));

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(
      validated.validation.missing_contract_files.includes('contracts/standard-agent-principles-adoption.json'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('missing_contract:contracts/standard-agent-principles-adoption.json'),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks empty or unreferenced agent directories', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-empty-agent-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'empty-agent',
    ]);
    fs.rmSync(path.join(targetDir, 'agent/prompts/domain_intake.md'));

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes(
        'invalid_domain_pack_path:agent/prompts/domain_intake.md:missing',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('missing_agent_pack_section:prompts'),
      true,
    );
    assert.equal(validated.validation.blockers.includes('missing_stage_control_plane_stages'), true);
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks legacy pack roots and README-only required paths', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-legacy-pack-root-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'legacy-pack-root',
    ]);
    const packCompilerPath = path.join(targetDir, 'contracts/pack_compiler_input.json');
    const packCompilerInput = parseJsonText(fs.readFileSync(packCompilerPath, 'utf8')) as any;
    delete packCompilerInput.canonical_semantic_pack_root;
    packCompilerInput.domain_pack_root = 'agent';
    packCompilerInput.required_domain_pack_paths = [
      'agent/prompts/domain_intake.md',
      'agent/README.md',
    ];
    fs.writeFileSync(packCompilerPath, `${JSON.stringify(packCompilerInput, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(
      validated.validation.blockers.includes('pack_compiler_canonical_semantic_pack_root_must_be_agent_slash'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('pack_compiler_legacy_pack_root_field:domain_pack_root'),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes('required_domain_pack_path_must_not_be_readme:agent/README.md'),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks capability maps that cannot route self-evolution work orders', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-map-self-evolution-missing-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'capability-map-gap',
    ]);
    const capabilityMapPath = path.join(targetDir, 'contracts', 'capability_map.json');
    const capabilityMap = parseJsonText(fs.readFileSync(capabilityMapPath, 'utf8')) as {
      capabilities: Array<Record<string, unknown>>;
    };
    delete capabilityMap.capabilities[1].canonical_target_paths;
    delete capabilityMap.capabilities[1].verification_refs;
    delete capabilityMap.capabilities[1].forbidden_surfaces;
    delete capabilityMap.capabilities[1].owner_closeout_boundary;
    fs.writeFileSync(capabilityMapPath, `${JSON.stringify(capabilityMap, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.mode, 'validate');
    assert.equal(validated.state, 'validation_blocked');
    assert.equal(validated.validation.status, 'blocked');
    assert.equal(validated.validation.capability_map_validation.status, 'blocked');
    assert.equal(
      validated.validation.capability_map_validation.self_evolution_routing_validation.status,
      'blocked',
    );
    assert.equal(
      validated.validation.blockers.includes(
        'capability_map_missing_canonical_target_paths:capability-map-gap.domain_execution.professional_skill',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'capability_map_missing_verification_refs:capability-map-gap.domain_execution.professional_skill',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'capability_map_missing_forbidden_surfaces:capability-map-gap.domain_execution.professional_skill',
      ),
      true,
    );
    assert.equal(
      validated.validation.blockers.includes(
        'capability_map_missing_owner_closeout_boundary:capability-map-gap.domain_execution.professional_skill',
      ),
      true,
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation expands capability policy profiles and blocks unresolved refs', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-capability-map-policy-profiles-'));

  try {
    runCli([
      'agents',
      'scaffold',
      '--target-dir',
      targetDir,
      '--domain-id',
      'capability-policy-profiles',
    ]);
    const capabilityMapPath = path.join(targetDir, 'contracts', 'capability_map.json');
    const capabilityMap = parseJsonText(fs.readFileSync(capabilityMapPath, 'utf8')) as {
      capability_policy_profiles?: Record<string, Record<string, unknown>>;
      capabilities: Array<Record<string, unknown>>;
    };
    const first = capabilityMap.capabilities[0];
    capabilityMap.capability_policy_profiles = {
      standard: {
        authority_boundary: first.authority_boundary,
        forbidden_surfaces: first.forbidden_surfaces,
        verification_refs: first.verification_refs,
        owner_closeout_boundary: first.owner_closeout_boundary,
      },
    };
    capabilityMap.capabilities.forEach((capability) => {
      capability.capability_policy_profile_ref = '#/capability_policy_profiles/standard';
      delete capability.authority_boundary;
      delete capability.forbidden_surfaces;
      delete capability.verification_refs;
      delete capability.owner_closeout_boundary;
    });
    fs.writeFileSync(capabilityMapPath, `${JSON.stringify(capabilityMap, null, 2)}\n`);

    const validated = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(validated.validation.capability_map_validation.status, 'passed');

    capabilityMap.capabilities[0].capability_policy_profile_ref = '#/capability_policy_profiles/missing';
    fs.writeFileSync(capabilityMapPath, `${JSON.stringify(capabilityMap, null, 2)}\n`);
    const blocked = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(blocked.validation.capability_map_validation.status, 'blocked');
    assert.equal(
      blocked.validation.blockers.some((entry: string) => entry.startsWith('capability_map_policy_profile_unresolved:')),
      true,
    );

    capabilityMap.capabilities[0].capability_policy_profile_ref = '#/capability_policy_profiles/__proto__';
    fs.writeFileSync(capabilityMapPath, `${JSON.stringify(capabilityMap, null, 2)}\n`);
    const inherited = runCli(['agents', 'scaffold', '--validate', targetDir]).standard_domain_agent_scaffold;
    assert.equal(inherited.validation.capability_map_validation.status, 'blocked');
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
