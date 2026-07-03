import { assert, fs, os, path, runCli, test } from '../helpers.ts';

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
    assert.equal(
      validated.validation.blockers.some((blocker: string) =>
        blocker.startsWith('stage_invalid_agent_ref:domain_intake:agent/prompts/domain_intake.md:missing')
      ),
      true,
    );
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
    const packCompilerInput = JSON.parse(fs.readFileSync(packCompilerPath, 'utf8'));
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
