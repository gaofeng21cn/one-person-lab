import { assert, runCliReadOnly, runCliReadOnlyFailure, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyCapabilityPackage,
  configureReadyMagMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
  retargetReadyRepoToMag,
} from './agents-conformance-fixtures.ts';

const STANDARD_FOUNDRY_DOMAIN_AGENT_IDS = ['mas', 'mag', 'rca', 'oma', 'obf'] as const;

function readyFoundryRepos() {
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

  const bookForgeRepo = buildReadyAgentRepo();
  retargetReadyRepo(bookForgeRepo, 'opl-bookforge', 'OPL Book Forge');

  const scholarSkillsRepo = buildReadyAgentRepo();
  retargetReadyRepo(scholarSkillsRepo, 'mas-scholar-skills', 'MAS Scholar Skills');
  configureReadyCapabilityPackage(scholarSkillsRepo);

  return { masRepo, magRepo, rcaRepo, omaRepo, bookForgeRepo, scholarSkillsRepo };
}

test('agents conformance exposes Foundry Agent OS membership without readiness authority', async () => {
  const repos = readyFoundryRepos();
  const payload = await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `mas=${repos.masRepo}`,
    '--agent',
    `mag=${repos.magRepo}`,
    '--agent',
    `rca=${repos.rcaRepo}`,
    '--agent',
    `oma=${repos.omaRepo}`,
    '--agent',
    `obf=${repos.bookForgeRepo}`,
    '--agent',
    `mas-scholar-skills=${repos.scholarSkillsRepo}`,
  ]);
  const report = payload.standard_domain_agent_conformance;
  const foundry = report.foundry_agent_os_conformance;
  const ownerWorklist = report.stage_run_domain_adoption_read_model
    .live_stage_run_progress_evidence_worklist.domains;
  const standardOwnerWorklist = ownerWorklist.filter((entry: { requested_agent_id: string }) =>
    STANDARD_FOUNDRY_DOMAIN_AGENT_IDS.includes(
      entry.requested_agent_id as typeof STANDARD_FOUNDRY_DOMAIN_AGENT_IDS[number],
    )
  );
  const bookForge = foundry.domains.find((domain: { canonical_agent_id: string }) =>
    domain.canonical_agent_id === 'obf'
  );
  const scholarSkills = foundry.domains.find((domain: { canonical_agent_id: string }) =>
    domain.canonical_agent_id === 'mas-scholar-skills'
  );

  assert.deepEqual(payload.foundry_agent_os_conformance, foundry);
  assert.equal(foundry.status, 'passed');
  assert.deepEqual(foundry.observed_domain_agent_ids, [...STANDARD_FOUNDRY_DOMAIN_AGENT_IDS]);
  assert.deepEqual(foundry.observed_framework_capability_package_ids, ['mas-scholar-skills']);
  assert.deepEqual(foundry.unknown_non_standard_agent_ids, []);
  assert.deepEqual(foundry.missing_domain_agent_ids, []);
  assert.equal(standardOwnerWorklist.length, STANDARD_FOUNDRY_DOMAIN_AGENT_IDS.length);
  assert.equal(bookForge?.standard_membership, 'standard_domain_agent');
  assert.equal(scholarSkills?.standard_membership, 'framework_capability_package');
  assert.equal(foundry.capability_registry_boundary.owner_modules.includes('stagecraft'), true);
  assert.equal(foundry.default_owner_route_policy.default_route_root, 'current_owner_delta');
  assert.equal(foundry.standard_membership_policy.generated_surface_is_membership_axis, false);
  assert.equal(foundry.authority_boundary.conformance_pass_can_claim_domain_ready, false);
  assert.equal(foundry.authority_boundary.conformance_pass_can_claim_production_ready, false);
  assert.equal(foundry.authority_boundary.generated_surface_can_write_domain_truth, false);
  assert.equal(foundry.authority_boundary.capability_registry_can_create_typed_blocker, false);
});

test('Foundry exposes only the new operator surface and keeps the retired agent inspector absent', async () => {
  const statusHelp = await runCliReadOnly(['help', 'foundry', 'status']);
  assert.equal(statusHelp.help.command, 'foundry status');
  assert.equal(statusHelp.help.usage, 'opl foundry status --run-id <run_id>');

  const retired = await runCliReadOnlyFailure(['foundry', 'agents', 'inspect', 'mas']);
  assert.equal(retired.status, 2);
  assert.equal(retired.payload.error.code, 'unknown_command');
  assert.equal(retired.payload.error.details.command, 'foundry');
});

test('Foundry Agent OS canonicalizes OPL Meta Agent as OMA without renaming domain truth', async () => {
  const omaRepo = buildReadyAgentRepo();
  retargetReadyRepo(omaRepo, 'opl-meta-agent', 'OPL Meta Agent');

  const foundry = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `opl-meta-agent=${omaRepo}`,
  ])).standard_domain_agent_conformance.foundry_agent_os_conformance;
  const oma = foundry.domains[0];

  assert.equal(foundry.status, 'blocked');
  assert.deepEqual(foundry.observed_domain_agent_ids, ['oma']);
  assert.equal(oma.domain_id, 'opl-meta-agent');
  assert.equal(oma.requested_agent_id, 'opl-meta-agent');
  assert.equal(oma.canonical_agent_id, 'oma');
  assert.equal(oma.standard_membership, 'standard_domain_agent');
  assert.equal(oma.foundry_agent_os_standard_member, true);
  assert.equal(oma.blockers.includes('domain_not_in_foundry_agent_os_standard:opl-meta-agent'), false);
});

test('Foundry Agent OS still blocks unknown non-standard agents', async () => {
  const unknownRepo = buildReadyAgentRepo();
  retargetReadyRepo(unknownRepo, 'custom-domain-agent', 'Custom Domain Agent');

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `custom=${unknownRepo}`,
  ])).standard_domain_agent_conformance;
  const foundry = report.foundry_agent_os_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(foundry.status, 'blocked');
  assert.deepEqual(foundry.unknown_non_standard_agent_ids, ['custom']);
  assert.equal(foundry.authority_boundary.conformance_pass_can_claim_domain_ready, false);
});
