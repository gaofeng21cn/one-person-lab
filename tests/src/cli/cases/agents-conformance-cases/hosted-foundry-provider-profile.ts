import {
  assert,
  fs,
  parseJsonText,
  path,
  repoRoot,
  runCliReadOnly,
  test,
} from '../../helpers.ts';
import {
  OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
  resolveStandardAgentExecutionProfile,
} from '../../../../../src/modules/pack/index.ts';
import {
  buildReadyAgentRepo,
  writeJson,
} from '../agents-conformance-fixtures.ts';

function readJson(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

function configureFoundryBinding(repoDir: string) {
  const descriptorPath = path.join(repoDir, 'contracts', 'domain_descriptor.json');
  const descriptor = readJson(descriptorPath);
  descriptor.agent_id = 'sample-provider';
  descriptor.package_id = 'sample-provider';
  writeJson(descriptorPath, descriptor);

  const catalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const catalog = readJson(catalogPath);
  catalog.owner = 'sample-provider';
  catalog.authority_boundary.domain_truth_owner = 'sample-provider';
  catalog.authority_boundary.opl_role = 'foundry_runtime_owner';
  catalog.actions[0].owner = 'sample-provider';
  catalog.actions[0].execution_binding = {
    kind: 'foundry_binding',
    provider_manifest_ref: 'contracts/foundry_provider.json',
  };
  delete catalog.actions[0].stage_route;
  catalog.actions[0].input_schema_ref = 'opl://foundry-protocol/DesignRequest';
  catalog.actions[0].output_schema_ref = 'opl://foundry-control/FoundryRun';
  writeJson(catalogPath, catalog);

  const provider = readJson(path.join(
    repoRoot,
    'tests',
    'fixtures',
    'oma-0.4.0',
    'foundry_provider.json',
  ));
  provider.provider_id = 'sample-provider';
  provider.agent_id = 'sample-provider';
  provider.package_id = 'sample-provider';
  provider.domain_id = descriptor.domain_id;
  provider.carrier_slug = 'sample-provider';
  provider.projection_policy.public_action_ids = [catalog.actions[0].action_id];
  writeJson(path.join(repoDir, 'contracts', 'foundry_provider.json'), provider);
}

function configureHostedProvider(repoDir: string) {
  configureFoundryBinding(repoDir);
  const descriptorPath = path.join(repoDir, 'contracts', 'domain_descriptor.json');
  const descriptor = readJson(descriptorPath);
  descriptor.agent_role = 'foundry_semantic_provider';
  writeJson(descriptorPath, descriptor);
}

function removeRepoLocalRuntimeContracts(repoDir: string) {
  fs.rmSync(path.join(repoDir, 'runtime'), { recursive: true, force: true });
  for (const contract of [
    'artifact_locator_contract.json',
    'owner_receipt_contract.json',
    'standard-agent-principles-adoption.json',
    'stage_operating_principles.json',
    'private_functional_surface_policy.json',
    'standard_agent_conformance_profile.json',
    'workspace_lifecycle_policy.json',
    'stage_artifact_kernel_adoption.json',
    'stage_run_kernel_profile.json',
    'stage_run_canary_evidence.json',
    'state_index_kernel_adoption.json',
  ]) {
    fs.rmSync(path.join(repoDir, 'contracts', contract), { force: true });
  }
}

test('agents conformance selects the hosted Foundry provider profile without hiding raw diagnostics', async () => {
  const repoDir = buildReadyAgentRepo();
  configureHostedProvider(repoDir);
  removeRepoLocalRuntimeContracts(repoDir);

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample-provider=${repoDir}`,
  ])).standard_domain_agent_conformance;
  const repo = report.reports[0];
  const adoption = report.stage_run_domain_adoption_read_model;
  const domain = adoption.domains[0];

  assert.equal(
    repo.conformance_profile.selected_profile_id,
    OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
  );
  assert.equal(repo.conformance_profile.selection_evidence.selection_uses_agent_id_special_case, false);
  assert.equal(repo.conformance_profile.provider_manifest_validation.status, 'passed');
  assert.equal(repo.conformance_profile.opl_hosted_evidence.owner, 'one-person-lab');
  assert.equal(repo.raw_repo_diagnostics.status, 'blocked');
  assert.ok(repo.raw_repo_diagnostics.blocker_count > repo.effective_blocker_count);
  assert.equal(repo.scaffold_validation.raw_status, 'blocked');
  assert.equal(
    repo.raw_repo_diagnostics.checks.scaffold_validation.blocker_count,
    repo.scaffold_validation.raw_blocker_count,
  );
  assert.equal(repo.blockers.includes('missing_required_dir:runtime'), false);
  assert.equal(repo.blockers.some((blocker: string) => blocker.startsWith('stage_run_kernel_profile_')), false);
  assert.equal(repo.blockers.some((blocker: string) => blocker.startsWith('source_closure:')), true);
  assert.equal(adoption.status, 'passed');
  assert.equal(domain.raw_stage_run_kernel_profile_status, 'blocked');
  assert.equal(domain.stage_run_kernel_profile_status, 'opl_hosted');
  assert.equal(domain.live_stage_run_progress_evidence_status, 'required_from_opl_foundry_kernel');
  assert.equal(domain.live_stage_run_progress_evidence_required_from, 'one-person-lab');
  assert.equal(domain.structural_conformance_is_domain_ready, false);
  assert.equal(
    adoption.live_stage_run_progress_evidence_worklist.domains[0]
      .accepted_refs_only_result_shapes.includes('opl_foundry_qualification_record'),
    true,
  );
});

test('mixed execution profiles route live evidence to their actual owners', async () => {
  const hostedRepo = buildReadyAgentRepo();
  configureHostedProvider(hostedRepo);
  removeRepoLocalRuntimeContracts(hostedRepo);
  const repoLocalRepo = buildReadyAgentRepo();

  const adoption = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `hosted=${hostedRepo}`,
    '--agent',
    `repo-local=${repoLocalRepo}`,
  ])).standard_domain_agent_conformance.stage_run_domain_adoption_read_model;
  const worklist = adoption.live_stage_run_progress_evidence_worklist;
  const hosted = worklist.domains.find((domain: Record<string, unknown>) =>
    domain.requested_agent_id === 'hosted'
  );
  const repoLocal = worklist.domains.find((domain: Record<string, unknown>) =>
    domain.requested_agent_id === 'repo-local'
  );

  assert.equal(adoption.status, 'passed');
  assert.equal(worklist.status, 'required_from_profile_evidence_owners');
  assert.equal(worklist.owner, 'profile_evidence_owners');
  assert.ok(worklist.accepted_refs_only_result_shapes.includes('domain_owner_receipt_ref'));
  assert.ok(worklist.accepted_refs_only_result_shapes.includes('opl_foundry_qualification_record'));
  assert.equal(hosted.evidence_owner, 'one-person-lab');
  assert.equal(hosted.owner_repo, null);
  assert.equal(hosted.source_command, 'opl foundry status --run-id <run_id> --json');
  assert.equal(repoLocal.evidence_owner, 'domain_owner');
  assert.equal(repoLocal.owner_repo, repoLocalRepo);
});

test('hosted Foundry profile does not select from agent role alone', () => {
  const repoDir = buildReadyAgentRepo();
  const descriptorPath = path.join(repoDir, 'contracts', 'domain_descriptor.json');
  const descriptor = readJson(descriptorPath);
  descriptor.agent_role = 'foundry_semantic_provider';
  writeJson(descriptorPath, descriptor);

  const profile = resolveStandardAgentExecutionProfile(repoDir);
  assert.equal(profile.selected_profile_id, null);
  assert.equal(profile.status, 'blocked');
  assert.ok(profile.blockers.includes(
    'execution_profile_foundry_binding_required_for_foundry_semantic_provider',
  ));
});

test('hosted Foundry profile does not select from execution binding alone', () => {
  const repoDir = buildReadyAgentRepo();
  configureFoundryBinding(repoDir);

  const profile = resolveStandardAgentExecutionProfile(repoDir);
  assert.equal(profile.selected_profile_id, null);
  assert.equal(profile.status, 'blocked');
  assert.ok(profile.blockers.includes(
    'execution_profile_foundry_semantic_provider_role_required_for_foundry_binding',
  ));
});

test('hosted Foundry profile blocks provider identity mismatch', () => {
  const repoDir = buildReadyAgentRepo();
  configureHostedProvider(repoDir);
  const providerPath = path.join(repoDir, 'contracts', 'foundry_provider.json');
  const provider = readJson(providerPath);
  provider.domain_id = 'other-domain';
  writeJson(providerPath, provider);

  const profile = resolveStandardAgentExecutionProfile(repoDir);
  assert.equal(profile.selected_profile_id, OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID);
  assert.equal(profile.status, 'blocked');
  assert.ok(profile.blockers.includes('hosted_foundry_provider_domain_identity_mismatch'));
});

test('hosted Foundry profile reuses the manifest authority validator', () => {
  const repoDir = buildReadyAgentRepo();
  configureHostedProvider(repoDir);
  const providerPath = path.join(repoDir, 'contracts', 'foundry_provider.json');
  const provider = readJson(providerPath);
  provider.authority_boundary.provider_owns_evaluation_execution = true;
  writeJson(providerPath, provider);

  const profile = resolveStandardAgentExecutionProfile(repoDir);
  assert.equal(profile.selected_profile_id, OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID);
  assert.equal(profile.provider_manifest_validation.status, 'blocked');
  assert.ok(profile.blockers.includes('hosted_foundry_provider_manifest_invalid'));
});
