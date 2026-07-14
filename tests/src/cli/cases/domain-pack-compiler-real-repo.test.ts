import { buildRepoGeneratedInterfaceBundle } from '../../../../src/modules/pack/index.ts';
import { assert, fs, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo, retargetReadyRepo } from './agents-conformance-fixtures.ts';

const familyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT ?? '/Users/gaofeng/workspace';
const familyRepoPath = (repo: string) => `${familyWorkspaceRoot}/${repo}`;

test('real family-defaults pack compiler preserves JSON readback when all standard agents are ready', {
  skip: ![
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
    'opl-bookforge',
  ].every((repo) => fs.existsSync(`${familyRepoPath(repo)}/contracts/domain_descriptor.json`)),
}, () => {
  const report = runCli(
    ['agents', 'pack-compiler', '--family-defaults'],
    { OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot },
  ).domain_pack_compiler;
  const domains = new Map<string, Record<string, any>>(report.domains.map((domain: Record<string, any>) => [
    domain.requested_agent_id,
    domain,
  ]));

  assert.deepEqual([...domains.keys()].sort(), ['mag', 'mas', 'obf', 'oma', 'rca']);
  assert.deepEqual({
    total_domain_count: report.summary.total_domain_count,
    ready_domain_count: report.summary.ready_domain_count,
    blocked_domain_count: report.summary.blocked_domain_count,
  }, {
    total_domain_count: 5,
    ready_domain_count: 5,
    blocked_domain_count: 0,
  });
  for (const agentId of ['mag', 'mas', 'obf', 'oma', 'rca']) {
    assert.equal(domains.get(agentId)?.compiler_status, 'ready');
    assert.deepEqual(domains.get(agentId)?.blocker_reasons, []);
  }
});

test('real family-defaults generated interfaces preserve JSON readback when all standard agents are ready', {
  skip: ![
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
    'opl-bookforge',
  ].every((repo) => fs.existsSync(`${familyRepoPath(repo)}/contracts/domain_descriptor.json`)),
}, () => {
  const report = runCli(
    ['agents', 'interfaces', '--family-defaults'],
    { OPL_FAMILY_WORKSPACE_ROOT: familyWorkspaceRoot },
  ).generated_agent_interfaces;
  const domains = new Map<string, Record<string, any>>(report.reports.map((domain: Record<string, any>) => [
    domain.requested_agent_id,
    domain,
  ]));

  assert.deepEqual([...domains.keys()].sort(), ['mag', 'mas', 'obf', 'oma', 'rca']);
  assert.deepEqual(report.summary, {
    total_domain_count: 5,
    ready_domain_count: 5,
    blocked_domain_count: 0,
  });
  for (const agentId of ['mag', 'mas', 'obf', 'oma', 'rca']) {
    assert.equal(domains.get(agentId)?.compiler_status, 'ready');
    assert.equal(domains.get(agentId)?.generated_agent_interfaces.status, 'ready');
    assert.deepEqual(domains.get(agentId)?.blocker_reasons, []);
  }
});

test('RCA real repo exposes canonical agent identity through ready generated interfaces', {
  skip: !fs.existsSync(`${familyRepoPath('redcube-ai')}/contracts/domain_descriptor.json`),
}, (t) => {
  const interfaces = runCli([
    'agents',
    'interfaces',
    '--repo-dir',
    familyRepoPath('redcube-ai'),
  ]).generated_agent_interfaces;

  assert.equal(interfaces.status, 'ready');
  assert.equal(interfaces.target_domain_id, 'redcube_ai');
  assert.equal(interfaces.agent_id, 'rca');
  assert.deepEqual(interfaces.blocker_reasons, []);

  const root = buildReadyAgentRepo();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  retargetReadyRepo(root, 'redcube-ai', 'RedCube AI');

  const bundle = buildRepoGeneratedInterfaceBundle(root).bundle as Record<string, any>;

  assert.equal(bundle.source_kind, 'standard_agent_repo_contracts');
  assert.equal(bundle.target_domain_id, 'redcube-ai');
  assert.equal(bundle.agent_id, 'rca');
  assert.equal(bundle.status, 'ready');
  assert.equal(bundle.blocker_reasons.length, 0);
  assert.equal(bundle.generated_wrapper_bundle.status, 'ready');
  assert.equal(bundle.generated_wrapper_bundle.owner, 'one-person-lab');
  assert.equal(bundle.generated_wrapper_bundle.generated_surface_owner, 'one-person-lab');
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_declared_as_generated_wrapper_owner, false);
  assert.deepEqual(bundle.generated_wrapper_bundle.blockers, []);
  assert.deepEqual(bundle.generated_wrapper_bundle.descriptor_scope_ids, [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'product_status',
    'product_session',
    'domain_handler',
    'workbench',
  ]);
  assert.equal(
    bundle.generated_wrapper_bundle.descriptor_scope.every(
      (scope: {
        owner: string;
        status: string;
        domain_repo_can_own_generated_surface: boolean;
        domain_repo_role: string;
        blockers: string[];
      }) =>
        scope.owner === 'one-person-lab'
        && scope.status === 'ready'
        && scope.domain_repo_can_own_generated_surface === false
        && scope.domain_repo_role === 'domain_handler_target_or_refs_only_adapter'
        && scope.blockers.length === 0,
    ),
    true,
  );
  assert.equal(
    bundle.generated_wrapper_bundle.authority_boundary
      .generated_wrapper_routes_to_domain_handler_or_refs_only_adapter,
    true,
  );
  assert.equal(bundle.generated_wrapper_bundle.claims_live_soak_complete, false);
  assert.equal(bundle.generated_wrapper_bundle.claims_artifact_producing_owner_receipt, false);
});
