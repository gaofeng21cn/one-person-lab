import { assert, fs, runCli, test } from '../helpers.ts';

test('generated interfaces expose RCA wrapper descriptor scope from real repo contracts when present', {
  skip: !fs.existsSync('/Users/gaofeng/workspace/redcube-ai/contracts/domain_descriptor.json'),
}, () => {
  const bundle = runCli([
    'agents',
    'interfaces',
    '--repo-dir',
    '/Users/gaofeng/workspace/redcube-ai',
  ]).generated_agent_interfaces;

  assert.equal(bundle.source_kind, 'standard_agent_repo_contracts');
  assert.equal(bundle.target_domain_id, 'redcube_ai');
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
    'domain_action_adapter',
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
