import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { assertReadyPackCompilerSummary } from './domain-pack-compiler-assertions.ts';
import { bindFamilyManifests } from './domain-pack-compiler-fixtures.ts';

test('domain pack compiler fixture binding does not depend on sibling domain repo checkouts', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-isolated-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-isolated-workspace-'));
  const env: Record<string, string> = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
  };

  try {
    bindFamilyManifests(env);

    const list = runCli(['agents', 'pack-compiler'], env);
    assertReadyPackCompilerSummary(list.domain_pack_compiler.summary);

    const oma = runCli(['agents', 'pack-compiler', 'inspect', '--domain', 'opl-meta-agent'], env)
      .domain_pack_compiler;
    assert.equal(oma.compiler_status, 'ready');
    assert.ok(env.OPL_META_AGENT_REPO_DIR);
    assert.equal(
      JSON.parse(fs.readFileSync(
        path.join(env.OPL_META_AGENT_REPO_DIR, 'contracts', 'owner_receipt_contract.json'),
        'utf8',
      )).surface_kind,
      'owner_receipt_contract',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(
        path.join(env.OPL_META_AGENT_REPO_DIR, 'agent', 'stages', 'manifest.json'),
        'utf8',
      )).surface_kind,
      'opl_standard_agent_declarative_stage_manifest',
    );
    assert.equal(oma.generated_interface_bundle.owner, 'one-person-lab');
    assert.equal(
      oma.generated_interface_bundle.stage_routes[0].tool_refs[0].role,
      'stage_tool_affordance_catalog',
    );
    assert.deepEqual(oma.blocker_reasons, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
