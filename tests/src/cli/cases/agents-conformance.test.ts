import { assert, fs, path, runCliReadOnly, test } from '../helpers.ts';
import './agents-conformance-cases/production-acceptance-and-morphology.ts';
import './agents-conformance-cases/hosted-foundry-provider-profile.ts';
import {
  buildReadyAgentRepo,
  configureReadyMagMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
  retargetReadyRepoToMag,
  writeJson,
} from './agents-conformance-fixtures.ts';
import { assertStageOperatingPrincipleChecksPassed } from './agents-conformance-stage-operating-principles-assertions.ts';

test('agents conformance keeps structural pass separate from domain readiness authority', async () => {
  const repoDir = buildReadyAgentRepo();
  const platformSurfaces = (await runCliReadOnly([
    'agents',
    'platform-surfaces',
    '--agent',
    `sample=${repoDir}`,
  ])).agent_platform_surface_ownership;
  const payload = await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]);
  const report = payload.standard_domain_agent_conformance;
  const repo = report.reports[0];
  const adoption = report.stage_run_domain_adoption_read_model;
  const worklist = adoption.live_stage_run_progress_evidence_worklist;

  assert.equal(platformSurfaces.status, 'passed');
  assert.equal(platformSurfaces.authority_boundary.report_can_claim_domain_ready, false);
  assert.equal(report.status, 'passed');
  assert.equal(report.structural_conformance_status, 'passed');
  assert.equal(report.ordinary_path_guard_status, 'passed');
  assert.equal(report.live_stage_run_progress_evidence_status, 'required_from_domain_owner');
  assert.equal(report.production_evidence_tail_count, 2);
  assert.equal(payload.live_stage_run_progress_evidence_status, report.live_stage_run_progress_evidence_status);
  assert.equal(adoption.status, 'passed');
  assert.equal(worklist.owner, 'domain_owner');
  assert.deepEqual(worklist.accepted_refs_only_result_shapes, [
    'domain_owner_receipt_ref',
    'typed_blocker_ref',
    'human_gate_ref',
    'quality_or_export_receipt_ref',
    'no_regression_ref',
    'long_soak_ref',
  ]);
  assert.equal(worklist.authority_boundary.can_claim_domain_ready, false);
  assert.equal(worklist.authority_boundary.can_create_typed_blocker, false);
  assert.equal(repo.generated_interface_checks.generated_interfaces_status, 'ready');
  assert.equal(repo.stage_run_kernel_profile_checks.status, 'passed');
  assert.equal(repo.stage_run_canary_evidence_checks.status, 'passed');
  assert.equal(repo.workspace_norm_checks.status, 'passed');
  assertStageOperatingPrincipleChecksPassed(repo);
  assert.equal(repo.evidence_tail_classification.tail_items.length, 2);
});

test('agents conformance consumes domain owner live progress refs without ready claim', async () => {
  const magRepo = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepo);
  configureReadyMagMorphology(magRepo);
  writeJson(path.join(magRepo, 'contracts', 'live_stage_run_progress_evidence.json'), {
    surface_kind: 'domain_live_stage_run_progress_evidence',
    domain_id: 'med-autogrant',
    owner: 'med-autogrant',
    status: 'owner_typed_blocker_recorded_not_ready_claim',
    refs: {
      owner_receipt_refs: ['receipt:mag/live-stage-owner-answer/2026-06-11'],
      typed_blocker_refs: ['typed-blocker:mag/submission-human-gate-required/2026-06-11'],
      no_regression_refs: ['no-regression:mag/generated-surface-no-ready-claim'],
    },
    typed_blocker_kind: 'submission_human_gate_required',
    authority_boundary: {
      refs_only: true,
      domain_ready_claimed: false,
      opl_can_sign_owner_receipt: false,
      opl_can_create_typed_blocker: false,
      opl_can_claim_domain_ready: false,
      opl_can_claim_production_ready: false,
    },
  });

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `mag=${magRepo}`,
  ])).standard_domain_agent_conformance;
  const domain = report.stage_run_domain_adoption_read_model.domains[0];
  const worklistDomain = report.stage_run_domain_adoption_read_model
    .live_stage_run_progress_evidence_worklist.domains[0];

  assert.equal(report.status, 'passed');
  assert.equal(domain.live_stage_run_progress_evidence_status, 'owner_typed_blocker_recorded_not_ready_claim');
  assert.equal(domain.live_stage_run_progress_typed_blocker_kind, 'submission_human_gate_required');
  assert.deepEqual(domain.live_stage_run_progress_observed_ref_shapes, [
    'domain_owner_receipt_ref',
    'no_regression_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(worklistDomain.ready_claim_authorized, false);
  assert.equal(worklistDomain.can_create_typed_blocker, false);
  assert.equal(report.stage_run_domain_adoption_read_model.authority_boundary.can_claim_domain_ready, false);
});

test('agents conformance rejects non-standard live progress contracts as still owner-open', async () => {
  const magRepo = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepo);
  configureReadyMagMorphology(magRepo);
  writeJson(path.join(magRepo, 'contracts', 'live_stage_run_progress_evidence.json'), {
    surface_kind: 'mag_live_stage_run_progress_evidence.v1',
    domain_id: 'med-autogrant',
    owner: 'med-autogrant',
    status: 'blocked_by_mag_owned_typed_blocker',
    refs: {
      owner_receipt_refs: ['receipt:mag/live-stage-owner-answer/2026-06-11'],
      typed_blocker_refs: ['typed-blocker:mag/submission-human-gate-required/2026-06-11'],
    },
  });

  const report = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `mag=${magRepo}`,
  ])).standard_domain_agent_conformance;
  const domain = report.stage_run_domain_adoption_read_model.domains[0];

  assert.equal(report.status, 'passed');
  assert.equal(report.live_stage_run_progress_evidence_status, 'required_from_domain_owner');
  assert.equal(domain.live_stage_run_progress_evidence_contract_status, 'resolved_invalid_standard_contract');
  assert.equal(domain.live_stage_run_progress_evidence_open, true);
  assert.equal(domain.next_required_owner_action, 'repair_domain_live_stage_run_progress_evidence_contract');
});

test('agents conformance live family probe covers pass and blocked admission paths', async () => {
  const readyRepo = buildReadyAgentRepo();
  const readyReport = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${readyRepo}`,
  ])).standard_domain_agent_conformance;
  assert.equal(readyReport.family_live_conformance_probe.status, 'passed');
  assert.equal(readyReport.family_live_conformance_probe.domains[0].false_authority_boundary.domain_ready_authorized, false);

  assert.equal(fs.existsSync(path.join(readyRepo, 'contracts', 'stage_control_plane.json')), false);
  const legacylessReport = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${readyRepo}`,
  ])).standard_domain_agent_conformance;
  assert.equal(legacylessReport.family_live_conformance_probe.status, 'passed');

  const blockedRepo = buildReadyAgentRepo();
  fs.rmSync(path.join(blockedRepo, 'agent', 'stages', 'manifest.json'));
  const blockedReport = (await runCliReadOnly([
    'agents',
    'conformance',
    '--agent',
    `sample=${blockedRepo}`,
  ])).standard_domain_agent_conformance;
  const blockedProbe = blockedReport.family_live_conformance_probe;

  assert.equal(blockedProbe.status, 'blocked');
  assert.equal(blockedProbe.domains[0].live_inputs.stage_plane.status, 'blocked');
  assert.equal(
    blockedProbe.domains[0].live_inputs.stage_plane.blockers.includes(
      'missing_contract:agent/stages/manifest.json',
    ),
    true,
  );
});

test('agents platform-surfaces keeps RCA guarded action catalog as metadata only', async () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(repoDir);
  const guardedActionCatalogPath = path.join(
    repoDir,
    'packages',
    'redcube-domain-entry',
    'src',
    'actions',
    'domain-action-adapter-parts',
    'guarded-action-catalog.ts',
  );
  fs.mkdirSync(path.dirname(guardedActionCatalogPath), { recursive: true });
  fs.writeFileSync(guardedActionCatalogPath, [
    'export const rcaGuardedActionCatalog = {',
    "  surfaceKind: 'rca_guarded_action_catalog',",
    "  role: 'domain_action_metadata_refs_only_source',",
    '};',
    '',
  ].join('\n'), 'utf8');

  const report = (await runCliReadOnly([
    'agents',
    'platform-surfaces',
    '--agent',
    `rca=${repoDir}`,
  ])).agent_platform_surface_ownership.reports[0];

  assert.equal(report.authority_boundary.report_can_claim_domain_ready, false);
  assert.equal(
    report.generic_subdomains.some((surface: { subdomain_id: string; observed_source_refs: string[] }) =>
      surface.subdomain_id === 'generated_action_metadata_command_registration_shell'
      && surface.observed_source_refs.includes(
        'packages/redcube-domain-entry/src/actions/domain-action-adapter-parts/guarded-action-catalog.ts',
      )
    ),
    true,
  );
});
