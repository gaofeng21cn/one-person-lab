import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';

function readJson(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function configureOmaHostedProfile(workspaceRoot: string) {
  const repoDir = path.join(workspaceRoot, 'opl-meta-agent');
  const descriptorPath = path.join(repoDir, 'contracts', 'domain_descriptor.json');
  const descriptor = readJson(descriptorPath);
  descriptor.agent_role = 'foundry_semantic_provider';
  descriptor.agent_id = 'oma';
  descriptor.package_id = 'oma';
  writeJson(descriptorPath, descriptor);

  const catalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const catalog = readJson(catalogPath);
  catalog.owner = 'oma';
  catalog.authority_boundary.domain_truth_owner = 'oma';
  catalog.authority_boundary.opl_role = 'foundry_runtime_owner';
  for (const action of catalog.actions) {
    action.owner = 'oma';
    action.execution_binding = {
      kind: 'foundry_binding',
      provider_manifest_ref: 'contracts/foundry_provider.json',
    };
    delete action.stage_route;
    action.input_schema_ref = 'opl://foundry-protocol/DesignRequest';
    action.output_schema_ref = 'opl://foundry-control/FoundryRun';
  }
  writeJson(catalogPath, catalog);

  const provider = readJson(path.join(repoRoot, 'tests', 'fixtures', 'oma-0.4.0', 'foundry_provider.json'));
  provider.provider_id = 'oma';
  provider.agent_id = 'oma';
  provider.package_id = 'oma';
  provider.domain_id = descriptor.domain_id;
  provider.carrier_slug = 'oma';
  provider.projection_policy.public_action_ids = catalog.actions.map(
    (action: Record<string, unknown>) => action.action_id,
  );
  writeJson(path.join(repoDir, 'contracts', 'foundry_provider.json'), provider);

  const packCompilerInputPath = path.join(repoDir, 'contracts', 'pack_compiler_input.json');
  const packCompilerInput = readJson(packCompilerInputPath);
  delete packCompilerInput.implementation_profile;
  delete packCompilerInput.standard_agent_pack_abi;
  writeJson(packCompilerInputPath, packCompilerInput);
}

test('domain pack compiler exposes OMA through the explicit family-defaults route', () => {
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-isolated-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  configureOmaHostedProfile(workspaceRoot);
  const env: Record<string, string> = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
  };

  try {
    const list = runCli(['agents', 'pack-compiler', '--family-defaults'], env).domain_pack_compiler;
    assert.equal(list.summary.total_domain_count, 5);
    assert.equal(list.summary.ready_domain_count, 5);

    const oma = runCli(['agents', 'pack-compiler', 'inspect', '--family-defaults', '--domain', 'opl-meta-agent'], env)
      .domain_pack_compiler;
    assert.equal(oma.source_kind, 'standard_agent_repo_contracts');
    assert.equal(oma.requested_agent_id, 'oma');
    assert.equal(oma.compiler_status, 'ready');
    assert.equal(oma.generated_interface_bundle.owner, 'one-person-lab');
    assert.deepEqual(oma.blocker_reasons, []);
    assert.deepEqual(oma.pack_compiler_input_projection.implementation_profile_resolution, {
      status: 'not_applicable',
      applicability: 'opl_hosted',
      selected_execution_profile_id: 'opl_hosted_foundry_semantic_provider',
      effective_profile: null,
      blockers: [],
    });
    assert.equal(oma.pack_compiler_input_projection.implementation_profile, null);
    assert.equal(oma.pack_compiler_input_projection.standard_agent_pack_abi.status, 'not_applicable');
    assert.equal(oma.pack_compiler_input_projection.standard_agent_pack_abi.applicability, 'opl_hosted');
    assert.equal(oma.pack_compiler_input_projection.standard_agent_pack_abi.effective_abi, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
