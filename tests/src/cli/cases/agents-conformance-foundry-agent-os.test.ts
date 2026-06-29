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

  const bookForgeRepo = buildReadyAgentRepo();
  retargetReadyRepo(bookForgeRepo, 'opl-bookforge', 'OPL Book Forge');

  const scholarSkillsRepo = buildReadyAgentRepo();
  retargetReadyRepo(scholarSkillsRepo, 'opl-scholarskills', 'OPL ScholarSkills');

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
    '--agent',
    `opl-bookforge=${bookForgeRepo}`,
    '--agent',
    `opl-scholarskills=${scholarSkillsRepo}`,
  ]);
  const report = payload.standard_domain_agent_conformance;
  const foundry = report.foundry_agent_os_conformance;

  assert.deepEqual(payload.foundry_agent_os_conformance, foundry);
  assert.equal(foundry.surface_kind, 'opl_foundry_agent_os_conformance');
  assert.equal(foundry.owner, 'one-person-lab');
  assert.equal(foundry.status, 'passed');
  assert.equal(report.summary.foundry_agent_os_conformance_status, 'passed');
  assert.equal(foundry.pattern_id, 'foundry_agent_os_standard.v1');
  assert.deepEqual(foundry.applies_to_domain_agents, [
    'mas',
    'mag',
    'rca',
    'oma',
    'opl-bookforge',
    'opl-scholarskills',
  ]);
  assert.deepEqual(foundry.observed_domain_agent_ids, [
    'mas',
    'mag',
    'rca',
    'oma',
    'opl-bookforge',
    'opl-scholarskills',
  ]);
  assert.deepEqual(foundry.unknown_non_standard_agent_ids, []);
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
  assert.equal(
    foundry.flagship_experience_mapping.mapping_id,
    'mas_research_foundry_flagship_experience.v1',
  );
  assert.equal(foundry.flagship_experience_mapping.flagship_agent_id, 'mas');
  assert.equal(
    foundry.flagship_experience_mapping.standard_agent_shape,
    'Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions',
  );
  assert.deepEqual(foundry.flagship_experience_mapping.journey_artifacts, [
    'Evidence Map',
    'Analysis Pack',
    'Manuscript Draft',
    'Reviewer Letter',
    'Revision Packet',
    'Publication Handoff',
  ]);
  assert.equal(foundry.flagship_experience_mapping.false_ready_claims.includes('mas_ready'), true);
  assert.equal(foundry.flagship_experience_mapping.false_ready_claims.includes('paper_done'), true);
  assert.equal(foundry.flagship_experience_mapping.false_ready_claims.includes('brand_l5_done'), true);
  assert.equal(foundry.flagship_experience_mapping.false_ready_claims.includes('production_ready'), true);
  assert.equal(foundry.standard_membership_policy.policy_id, 'foundry_agent_standard_membership_is_not_surface_origin.v1');
  assert.deepEqual(
    foundry.standard_membership_policy.standard_member_agent_ids,
    ['mas', 'mag', 'rca', 'oma', 'opl-bookforge', 'opl-scholarskills'],
  );
  assert.deepEqual(foundry.new_agent_baseline_handoff_policy.required_gates, [
    'scaffold_validation',
    'generated_interface_projection',
    'agent_lab_baseline_or_takeover_suite',
    'independent_reviewer_assessment',
    'oma_improvement_or_no_patch_loop',
    'delivery_receipt_or_work_order_or_typed_blocker',
  ]);
  assert.equal(foundry.new_agent_baseline_handoff_policy.scaffold_or_generated_interface_can_claim_complete, false);
  assert.deepEqual(foundry.new_agent_baseline_handoff_policy.accepted_terminal_outcomes, [
    'delivery_receipt',
    'no_patch_coordination_receipt',
    'developer_patch_work_order',
    'typed_blocker',
  ]);
  assert.equal(foundry.standard_membership_policy.generated_surface_is_membership_axis, false);
  assert.equal(foundry.standard_membership_policy.generated_surface_is_status_axis, false);
  assert.equal(
    foundry.standard_membership_policy.false_ready_boundary.generated_surface_can_claim_domain_ready,
    false,
  );

  for (const domain of foundry.domains) {
    assert.equal(domain.status, 'passed');
    assert.equal(domain.standard_membership, 'standard_domain_agent');
    assert.equal(domain.foundry_agent_os_standard_member, true);
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

  const mas = foundry.domains.find((domain: { canonical_agent_id: string }) =>
    domain.canonical_agent_id === 'mas'
  );
  assert.ok(mas);
  assert.equal(mas.flagship_experience_mapping.mapping_id, 'mas_research_foundry_flagship_experience.v1');
  assert.equal(mas.flagship_experience_mapping.authority_boundary.can_claim_mas_ready, false);
  assert.equal(mas.flagship_experience_mapping.authority_boundary.can_sign_mas_owner_receipt, false);
  assert.equal(mas.flagship_experience_mapping.private_platform_residue_inputs.includes('private_scheduler'), true);
  assert.equal(mas.flagship_experience_mapping.private_platform_residue_inputs.includes('private_workbench'), true);

  const mag = foundry.domains.find((domain: { canonical_agent_id: string }) =>
    domain.canonical_agent_id === 'mag'
  );
  assert.ok(mag);
  assert.equal(mag.flagship_experience_mapping, null);
});

test('Foundry Agent OS canonicalizes OPL Meta Agent as OMA without renaming domain truth', () => {
  const omaRepo = buildReadyAgentRepo();
  retargetReadyRepo(omaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(omaRepo);

  const payload = runCli([
    'agents',
    'conformance',
    '--agent',
    `opl-meta-agent=${omaRepo}`,
  ]);
  const foundry = payload.standard_domain_agent_conformance.foundry_agent_os_conformance;
  const oma = foundry.domains[0];

  assert.equal(foundry.status, 'blocked');
  assert.deepEqual(foundry.missing_domain_agent_ids, ['mas', 'mag', 'rca', 'opl-bookforge']);
  assert.deepEqual(foundry.observed_domain_agent_ids, ['oma']);
  assert.equal(oma.domain_id, 'opl-meta-agent');
  assert.equal(oma.requested_agent_id, 'opl-meta-agent');
  assert.equal(oma.canonical_agent_id, 'oma');
  assert.equal(oma.standard_membership, 'standard_domain_agent');
  assert.equal(oma.foundry_agent_os_standard_member, true);
  assert.equal(
    oma.blockers.includes('domain_not_in_foundry_agent_os_standard:opl-meta-agent'),
    false,
  );
});

test('Foundry Agent OS treats BookForge as a standard member without using generated surface as a membership axis', () => {
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

  const bookForgeRepo = buildReadyAgentRepo();
  retargetReadyRepo(bookForgeRepo, 'opl-bookforge', 'OPL Book Forge');

  const scholarSkillsRepo = buildReadyAgentRepo();
  retargetReadyRepo(scholarSkillsRepo, 'opl-scholarskills', 'OPL ScholarSkills');

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
    '--agent',
    `opl-bookforge=${bookForgeRepo}`,
    '--agent',
    `opl-scholarskills=${scholarSkillsRepo}`,
  ]);
  const foundry = payload.standard_domain_agent_conformance.foundry_agent_os_conformance;
  const bookForge = foundry.domains.find((domain: { canonical_agent_id: string }) =>
    domain.canonical_agent_id === 'opl-bookforge'
  );
  const scholarSkills = foundry.domains.find((domain: { canonical_agent_id: string }) =>
    domain.canonical_agent_id === 'opl-scholarskills'
  );

  assert.equal(foundry.status, 'passed');
  assert.deepEqual(foundry.applies_to_domain_agents, [
    'mas',
    'mag',
    'rca',
    'oma',
    'opl-bookforge',
    'opl-scholarskills',
  ]);
  assert.deepEqual(foundry.observed_domain_agent_ids, [
    'mas',
    'mag',
    'rca',
    'oma',
    'opl-bookforge',
    'opl-scholarskills',
  ]);
  assert.deepEqual(foundry.unknown_non_standard_agent_ids, []);
  assert.deepEqual(foundry.missing_domain_agent_ids, []);
  assert.equal(
    foundry.blockers.includes('domain_not_in_foundry_agent_os_standard:opl-bookforge'),
    false,
  );
  assert.ok(bookForge);
  assert.equal(bookForge.domain_id, 'opl-bookforge');
  assert.equal(bookForge.requested_agent_id, 'opl-bookforge');
  assert.equal(bookForge.standard_membership, 'standard_domain_agent');
  assert.equal(bookForge.foundry_agent_os_standard_member, true);
  assert.equal(bookForge.status, 'passed');
  assert.equal(bookForge.false_authority_flags.conformance_pass_can_claim_domain_ready, false);
  assert.equal(bookForge.false_authority_flags.conformance_pass_can_claim_production_ready, false);
  assert.ok(scholarSkills);
  assert.equal(scholarSkills.domain_id, 'opl-scholarskills');
  assert.equal(scholarSkills.standard_membership, 'standard_domain_agent');
  assert.equal(scholarSkills.foundry_agent_os_standard_member, true);
  assert.equal(scholarSkills.status, 'passed');
  assert.equal(foundry.standard_membership_policy.generated_surface_is_membership_axis, false);
  assert.equal(foundry.standard_membership_policy.generated_surface_is_status_axis, false);
});

test('Foundry Agent OS still blocks unknown non-standard agents', () => {
  const unknownRepo = buildReadyAgentRepo();
  retargetReadyRepo(unknownRepo, 'custom-agent', 'Custom Agent');

  const payload = runCli([
    'agents',
    'conformance',
    '--agent',
    `custom-agent=${unknownRepo}`,
  ]);
  const foundry = payload.standard_domain_agent_conformance.foundry_agent_os_conformance;
  const unknown = foundry.domains[0];

  assert.equal(foundry.status, 'blocked');
  assert.deepEqual(foundry.observed_domain_agent_ids, []);
  assert.deepEqual(foundry.unknown_non_standard_agent_ids, ['custom-agent']);
  assert.equal(unknown.standard_membership, 'unknown_non_standard_agent');
  assert.equal(unknown.foundry_agent_os_standard_member, false);
  assert.equal(
    unknown.blockers.includes('domain_not_in_foundry_agent_os_standard:custom-agent'),
    true,
  );
});
