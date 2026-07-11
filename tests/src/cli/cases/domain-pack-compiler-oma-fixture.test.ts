import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';

test('domain pack compiler exposes OMA through the explicit family-defaults route', () => {
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-compiler-isolated-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const env: Record<string, string> = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
  };

  try {
    const list = runCli(['agents', 'pack-compiler', '--family-defaults'], env).domain_pack_compiler;
    assert.equal(list.summary.total_domain_count, 4);
    assert.equal(list.summary.ready_domain_count, 4);

    const oma = runCli(['agents', 'pack-compiler', 'inspect', '--family-defaults', '--domain', 'opl-meta-agent'], env)
      .domain_pack_compiler;
    assert.equal(oma.source_kind, 'standard_agent_repo_contracts');
    assert.equal(oma.requested_agent_id, 'oma');
    assert.equal(oma.compiler_status, 'ready');
    assert.equal(oma.generated_interface_bundle.owner, 'one-person-lab');
    assert.deepEqual(oma.blocker_reasons, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
