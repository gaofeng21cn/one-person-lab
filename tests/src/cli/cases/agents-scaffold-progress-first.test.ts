import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';

function readJson(filePath: string): any {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function generateTarget(prefix: string) {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  runCli([
    'agents',
    'scaffold',
    '--target-dir',
    targetDir,
    '--domain-id',
    'refs-only-foundry-agent',
  ]);
  return targetDir;
}

test('agents scaffold emits and validates one refs-only Foundry policy consumer', () => {
  const targetDir = generateTarget('opl-foundry-refs-only-');
  try {
    const contract = readJson(path.join(targetDir, 'contracts/foundry_agent_series.json'));
    assert.equal(contract.surface_kind, 'opl_foundry_agent_series_consumer');
    assert.equal(contract.version, 'foundry-agent-series-consumer.v1');
    assert.equal(contract.canonical_policy_export, 'opl-framework-shared/foundry-agent-series-policy');
    assert.equal(
      contract.canonical_series_contract_ref,
      'contracts/opl-framework/foundry-agent-series-contract.json',
    );
    assert.equal(
      contract.canonical_skeleton_contract_ref,
      'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
    );
    for (const legacyBodyField of [
      'agent_membership_projection_policy',
      'contract_version_policy',
      'series_design_profile',
      'shared_release_pin_strategy',
      'standard_public_projection_policy',
      'workspace_topology_profile',
    ]) assert.equal(Object.hasOwn(contract, legacyBodyField), false, legacyBodyField);

    contract.domain_specific_profile = { profile_id: 'domain_delta.v1' };
    writeJson(path.join(targetDir, 'contracts/foundry_agent_series.json'), contract);
    const validation = runCli(['agents', 'scaffold', '--validate', targetDir])
      .standard_domain_agent_scaffold.validation.foundry_agent_series_validation;
    assert.equal(validation.status, 'passed');
    assert.deepEqual(validation.blockers, []);
    assert.equal(validation.canonical_policy_resolution.status, 'resolved');
    assert.equal(
      validation.canonical_policy_resolution.series_design_profile_id,
      'opl_foundry_agent_series_design_profile.v1',
    );
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks stale Foundry policy release pins', () => {
  const targetDir = generateTarget('opl-foundry-policy-pin-');
  try {
    const contractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const contract = readJson(contractPath);
    delete contract.shared_policy_release.policy_bundle_fingerprint;
    writeJson(contractPath, contract);

    const validation = runCli(['agents', 'scaffold', '--validate', targetDir])
      .standard_domain_agent_scaffold.validation.foundry_agent_series_validation;
    assert.equal(validation.status, 'blocked');
    assert.ok(validation.blockers.includes('foundry_agent_series_policy_release_pin_invalid'));
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation rejects copied canonical Foundry policy bodies', () => {
  const targetDir = generateTarget('opl-foundry-legacy-body-');
  try {
    const contractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const contract = readJson(contractPath);
    contract.series_design_profile = { profile_id: 'copied-policy-body' };
    contract.workspace_topology_profile = {};
    writeJson(contractPath, contract);

    const validation = runCli(['agents', 'scaffold', '--validate', targetDir])
      .standard_domain_agent_scaffold.validation.foundry_agent_series_validation;
    assert.equal(validation.status, 'blocked');
    assert.ok(validation.blockers.includes(
      'foundry_agent_series_legacy_policy_body_forbidden:series_design_profile',
    ));
    assert.ok(validation.blockers.includes(
      'foundry_agent_series_legacy_policy_body_forbidden:workspace_topology_profile',
    ));
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});

test('agents scaffold validation blocks invalid canonical refs and authority claims', () => {
  const targetDir = generateTarget('opl-foundry-invalid-refs-');
  try {
    const contractPath = path.join(targetDir, 'contracts/foundry_agent_series.json');
    const contract = readJson(contractPath);
    contract.canonical_policy_export = 'domain-owned-foundry-policy';
    contract.authority_boundary.generated_surface_can_claim_domain_ready = true;
    contract.domain_specific_profile = { public_surface_role: 'domain_owned_cli' };
    writeJson(contractPath, contract);

    const validation = runCli(['agents', 'scaffold', '--validate', targetDir])
      .standard_domain_agent_scaffold.validation.foundry_agent_series_validation;
    assert.equal(validation.status, 'blocked');
    assert.ok(validation.blockers.includes('foundry_agent_series_canonical_policy_export_invalid'));
    assert.ok(validation.blockers.includes(
      'foundry_agent_series_authority_boundary_must_be_false:generated_surface_can_claim_domain_ready',
    ));
    assert.ok(validation.blockers.includes(
      'foundry_agent_public_projection_forbidden_role_field:public_surface_role',
    ));
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
});
