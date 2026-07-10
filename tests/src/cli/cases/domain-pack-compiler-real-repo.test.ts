import { buildRepoGeneratedInterfaceBundle } from '../../../../src/modules/pack/index.ts';
import { assert, fs, runCli, runCliFailure, test } from '../helpers.ts';
import { buildReadyAgentRepo, retargetReadyRepo } from './agents-conformance-fixtures.ts';

test('real family-defaults pack compiler preserves JSON readback when individual repos are blocked', {
  skip: ![
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
    'opl-bookforge',
  ].every((repo) => fs.existsSync(`/Users/gaofeng/workspace/${repo}/contracts/domain_descriptor.json`)),
}, () => {
  const report = runCli(['agents', 'pack-compiler', '--family-defaults']).domain_pack_compiler;
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
    ready_domain_count: 3,
    blocked_domain_count: 2,
  });
  for (const agentId of ['mag', 'mas', 'oma']) {
    assert.equal(domains.get(agentId)?.compiler_status, 'ready');
  }
  for (const agentId of ['obf', 'rca']) {
    const domain = domains.get(agentId) as Record<string, any>;
    assert.equal(domain.compiler_status, 'blocked');
    assert.equal(domain.blocker_reasons.length > 0, true);
    assert.equal(domain.repo_contract_error.code, 'contract_shape_invalid');
    assert.equal(typeof domain.repo_contract_error.message, 'string');
  }
});

test('real family-defaults generated interfaces preserve JSON readback when individual repos are blocked', {
  skip: ![
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
    'opl-bookforge',
  ].every((repo) => fs.existsSync(`/Users/gaofeng/workspace/${repo}/contracts/domain_descriptor.json`)),
}, () => {
  const report = runCli(['agents', 'interfaces', '--family-defaults']).generated_agent_interfaces;
  const domains = new Map<string, Record<string, any>>(report.reports.map((domain: Record<string, any>) => [
    domain.requested_agent_id,
    domain,
  ]));

  assert.deepEqual([...domains.keys()].sort(), ['mag', 'mas', 'obf', 'oma', 'rca']);
  assert.deepEqual(report.summary, {
    total_domain_count: 5,
    ready_domain_count: 3,
    blocked_domain_count: 2,
  });
  for (const agentId of ['mag', 'mas', 'oma']) {
    assert.equal(domains.get(agentId)?.compiler_status, 'ready');
    assert.equal(domains.get(agentId)?.generated_agent_interfaces.status, 'ready');
  }
  for (const agentId of ['obf', 'rca']) {
    const domain = domains.get(agentId) as Record<string, any>;
    assert.equal(domain.compiler_status, 'blocked');
    assert.equal(domain.generated_agent_interfaces.status, 'blocked');
    assert.equal(domain.blocker_reasons.length > 0, true);
    assert.equal(domain.repo_contract_error.code, 'contract_shape_invalid');
  }
});

test('RCA forbidden generated authority blocks the real repo without losing canonical agent identity', {
  skip: !fs.existsSync('/Users/gaofeng/workspace/redcube-ai/contracts/domain_descriptor.json'),
}, (t) => {
  const failure = runCliFailure([
    'agents',
    'interfaces',
    '--repo-dir',
    '/Users/gaofeng/workspace/redcube-ai',
  ]);

  assert.equal(failure.payload.error.code, 'contract_shape_invalid');
  assert.deepEqual(failure.payload.error.details.forbidden_true_fields, [
    'opl_can_compile_generated_surfaces_from_refs',
  ]);

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
