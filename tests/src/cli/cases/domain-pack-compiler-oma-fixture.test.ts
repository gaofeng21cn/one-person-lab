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
  const env = {
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
      fs.existsSync(path.join(env.OPL_META_AGENT_REPO_DIR, 'contracts', 'opl_domain_manifest_registration.json')),
      true,
    );
    assert.equal(oma.generated_interface_bundle.owner, 'one-person-lab');
    assert.deepEqual(oma.blocker_reasons, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
