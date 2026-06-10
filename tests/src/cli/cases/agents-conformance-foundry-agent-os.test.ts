import { assert, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyMagMorphology,
  configureReadyMetaMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
  retargetReadyRepoToMag,
} from './agents-conformance-fixtures.ts';

test('agents conformance exposes Foundry Agent OS family standard without authorizing domain readiness', () => {
  const masRepo = buildReadyAgentRepo();
  retargetReadyRepo(masRepo, 'med-autoscience', 'Med Auto Science');

  const magRepo = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepo);
  configureReadyMagMorphology(magRepo);

  const rcaRepo = buildReadyAgentRepo();
  retargetReadyRepo(rcaRepo, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(rcaRepo);

  const omaRepo = buildReadyAgentRepo();
  retargetReadyRepo(omaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(omaRepo);

  const payload = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${masRepo}`,
    '--agent',
    `mag=${magRepo}`,
    '--agent',
    `rca=${rcaRepo}`,
    '--agent',
    `oma=${omaRepo}`,
  ]);
  const report = payload.standard_domain_agent_conformance;
  const foundry = report.foundry_agent_os_conformance;

  assert.deepEqual(payload.foundry_agent_os_conformance, foundry);
  assert.equal(foundry.surface_kind, 'opl_foundry_agent_os_conformance');
  assert.equal(foundry.owner, 'one-person-lab');
  assert.equal(foundry.status, 'passed');
  assert.equal(report.summary.foundry_agent_os_conformance_status, 'passed');
  assert.equal(foundry.pattern_id, 'foundry_agent_os_standard.v1');
  assert.deepEqual(foundry.applies_to_domain_agents, ['mas', 'mag', 'rca', 'oma']);
  assert.deepEqual(foundry.observed_domain_agent_ids, ['mas', 'mag', 'rca', 'oma']);
  assert.deepEqual(foundry.missing_domain_agent_ids, []);
  assert.deepEqual(foundry.capability_registry_boundary.owner_modules, [
    'atlas',
    'pack',
    'stagecraft',
  ]);
  assert.equal(
    foundry.capability_registry_boundary.default_behavior,
    'current_owner_delta_bound_jit_or_fail_open',
  );
  assert.equal(
    foundry.capability_registry_boundary.optional_ref_missing_default,
    'advisory_or_audit',
  );
  assert.equal(
    foundry.capability_registry_boundary.resolver_abi_ref,
    'contracts/opl-framework/capability-registry-resolver.schema.json',
  );
  assert.equal(
    foundry.capability_registry_boundary.selector_helper_ref,
    'src/capability-registry-resolver.ts',
  );
  assert.equal(
    foundry.capability_registry_boundary.route_required_ref_missing,
    'typed_blocker_candidate_only_from_current_owner_delta_hard_boundary',
  );
  assert.equal(
    foundry.capability_registry_boundary.must_not_create.includes('owner receipt'),
    true,
  );
  assert.equal(
    foundry.capability_registry_boundary.must_not_create.includes('typed blocker'),
    true,
  );
  assert.equal(
    foundry.conformance_required_claims.includes('default_read_root_is_current_owner_delta'),
    true,
  );
  assert.equal(
    foundry.conformance_required_claims.includes('capability_registry_fails_open_unless_current_delta_requires_ref'),
    true,
  );
  assert.equal(
    foundry.forbidden_claims.includes('agent_os_contract_is_domain_ready'),
    true,
  );
  assert.equal(
    foundry.forbidden_claims.includes('generated_surface_writes_domain_truth'),
    true,
  );
  assert.equal(foundry.authority_boundary.conformance_pass_can_claim_domain_ready, false);
  assert.equal(foundry.authority_boundary.conformance_pass_can_claim_production_ready, false);
  assert.equal(foundry.authority_boundary.generated_surface_can_write_domain_truth, false);
  assert.equal(foundry.authority_boundary.capability_registry_can_create_typed_blocker, false);
  assert.equal(foundry.authority_boundary.capability_registry_can_sign_owner_receipt, false);
  assert.equal(foundry.authority_boundary.provider_completion_can_claim_domain_completion, false);

  for (const domain of foundry.domains) {
    assert.equal(domain.status, 'passed');
    assert.equal(domain.default_read_root, 'current_owner_delta');
    assert.equal(domain.raw_worklist_generates_default_next_action, false);
    assert.equal(domain.provider_completion_counts_as_domain_completion, false);
    assert.equal(domain.generated_surface_status, 'passed');
    assert.equal(domain.generated_surface_owner, 'one-person-lab');
    assert.equal(domain.source_of_work_status, 'passed');
    assert.equal(domain.capability_registry_policy_status, 'passed');
    assert.equal(
      domain.optional_ref_policy,
      'fail_open_unless_current_owner_delta_requires_route_ref',
    );
    assert.equal(domain.domain_authority_kernel_status, 'passed');
    assert.equal(domain.false_authority_flags.conformance_pass_can_claim_domain_ready, false);
    assert.equal(domain.false_authority_flags.conformance_pass_can_claim_production_ready, false);
    assert.equal(domain.false_authority_flags.generated_surface_can_write_domain_truth, false);
    assert.equal(domain.false_authority_flags.capability_registry_can_create_typed_blocker, false);
    assert.equal(domain.false_authority_flags.capability_registry_can_sign_owner_receipt, false);
  }
});
