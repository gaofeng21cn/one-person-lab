import { assert, fs, parseJsonText, path, runCli, test } from '../../helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyMagMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
  retargetReadyRepoToMag,
  writeJson,
  writeProductionAcceptance,
} from '../agents-conformance-fixtures.ts';

test('agents conformance reads production acceptance evidence as domain-owned refs only', () => {
  const masRepo = buildReadyAgentRepo();
  retargetReadyRepo(masRepo, 'med-autoscience', 'Med Auto Science');

  const magRepo = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepo);
  configureReadyMagMorphology(magRepo);
  writeProductionAcceptance(magRepo, 'mag-production-acceptance.json', {
    evidence_tail_status: 'closed_by_domain_owned_acceptance_receipt',
    domain_owner: 'med-autogrant',
    closure_evidence: { accepted_return_shape: 'owner_receipt' },
    refs: {
      owner_receipt_refs: ['receipt:mag/production-default-caller'],
      doc_refs: ['docs/status.md#production-acceptance'],
      next_verification_command_refs: ['mag production acceptance --json'],
    },
    authority_boundary: { domain_ready_claimed: false },
  });

  const rcaRepo = buildReadyAgentRepo();
  retargetReadyRepo(rcaRepo, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(rcaRepo);
  writeProductionAcceptance(rcaRepo, 'rca-production-acceptance.json', {
    evidence_tail_status: 'domain_owned_typed_blocker_with_next_verification_ref',
    domain_owner: 'redcube-ai',
    closure_evidence: {
      accepted_return_shape: 'typed_blocker',
      typed_blocker_kind: 'live_visual_soak_pending',
    },
    refs: {
      typed_blocker_refs: ['blocker:rca/live-visual-soak'],
      next_verification_command_refs: ['rca acceptance verify --json'],
    },
    authority_boundary: { domain_ready_claimed: false },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${masRepo}`,
    '--agent',
    `mag=${magRepo}`,
    '--agent',
    `rca=${rcaRepo}`,
  ]).standard_domain_agent_conformance;
  const [mas, mag, rca] = report.reports;

  assert.equal(report.status, 'passed');
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);
  assert.equal(mas.evidence_tail_classification.status, 'production_evidence_tail_present');
  assert.equal(mag.evidence_tail_classification.status, 'closed');
  assert.equal(mag.evidence_tail_classification.tail_items[0].evidence_ref, 'receipt:mag/production-default-caller');
  assert.equal(rca.evidence_tail_classification.status, 'domain_owned_typed_blocker_reported');
  assert.equal(rca.evidence_tail_classification.tail_items[0].authority_boundary.typed_blocker_kind, 'live_visual_soak_pending');
});

test('agents conformance blocks active forbidden-role residue but allows explicit policy tombstones', () => {
  const metaRepo = buildReadyAgentRepo();
  retargetReadyRepo(metaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  writeJson(path.join(metaRepo, 'contracts', 'unexpected_active_policy.json'), {
    forbidden_roles: ['generic_runtime_owner'],
  });
  const blocked = runCli([
    'agents',
    'conformance',
    '--agent',
    `opl-meta-agent=${metaRepo}`,
  ]).standard_domain_agent_conformance;

  assert.equal(blocked.status, 'blocked');
  assert.equal(
    blocked.reports[0].blockers.includes(
      'active_forbidden_name_residue:generic_runtime_owner:contracts/unexpected_active_policy.json',
    ),
    true,
  );

  const magRepo = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepo);
  configureReadyMagMorphology(magRepo);
  const actionCatalogPath = path.join(magRepo, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as any;
  actionCatalog.notes.push('OPL replacement consumes stage_attempt_ledger refs only.');
  writeJson(actionCatalogPath, actionCatalog);

  const passed = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${magRepo}`,
  ]).standard_domain_agent_conformance;
  assert.equal(passed.status, 'passed');
  assert.deepEqual(passed.reports[0].physical_morphology_checks.forbidden_name_residue, []);
});

test('agents conformance keeps required morphology and lifecycle policies as structural gates', () => {
  const morphologyRepo = buildReadyAgentRepo();
  const privateSurfacePolicyPath = path.join(morphologyRepo, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = parseJsonText(fs.readFileSync(privateSurfacePolicyPath, 'utf8')) as any;
  delete privateSurfacePolicy.physical_source_morphology_policy;
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);

  const lifecycleRepo = buildReadyAgentRepo();
  fs.rmSync(path.join(lifecycleRepo, 'contracts', 'workspace_lifecycle_policy.json'));

  const morphology = runCli(['agents', 'conformance', '--repo-dir', morphologyRepo]).standard_domain_agent_conformance;
  const lifecycle = runCli(['agents', 'conformance', '--repo-dir', lifecycleRepo]).standard_domain_agent_conformance;

  assert.equal(morphology.status, 'blocked');
  assert.equal(morphology.reports[0].blockers.includes('physical_morphology_policy_not_declared'), true);
  assert.equal(lifecycle.status, 'blocked');
  assert.equal(lifecycle.reports[0].blockers.includes('workspace_file_lifecycle_policy_not_declared'), true);
});

test('agents conformance blocks legacy sidecar aliases as active morphology surfaces', () => {
  const magRepoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepoDir);
  configureReadyMagMorphology(magRepoDir);
  const policyPath = path.join(magRepoDir, 'contracts', 'private_functional_surface_policy.json');
  const policy = parseJsonText(fs.readFileSync(policyPath, 'utf8')) as any;
  policy.physical_source_morphology_policy.required_surface_ids = (
    policy.physical_source_morphology_policy.required_surface_ids.map((surfaceId: string) =>
      surfaceId === 'domain_handler' ? 'sidecar' : surfaceId
    )
  );
  policy.physical_source_morphology_policy.surface_classifications = (
    policy.physical_source_morphology_policy.surface_classifications.map((entry: { surface_id: string }) => ({
      ...entry,
      surface_id: entry.surface_id === 'domain_handler' ? 'sidecar' : entry.surface_id,
    }))
  );
  writeJson(policyPath, policy);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${magRepoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].physical_morphology_checks.status, 'blocked');
  assert.equal(
    report.reports[0].physical_morphology_checks.blockers.includes('mag_physical_surface_missing:domain_handler'),
    true,
  );
});
