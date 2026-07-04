import { assert, fs, parseJsonText, path, runCli, test } from '../../helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyMagMorphology,
  configureReadyMetaMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
  retargetReadyRepoToMag,
  writeJson,
  writeProductionAcceptance,
} from '../agents-conformance-fixtures.ts';

test('agents conformance reads domain-owned production acceptance evidence without claiming domain ready', () => {
  const masRepo = buildReadyAgentRepo();
  retargetReadyRepo(masRepo, 'med-autoscience', 'Med Auto Science');

  const magRepo = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepo);
  configureReadyMagMorphology(magRepo);
  writeProductionAcceptance(magRepo, 'mag-production-acceptance.json', {
    evidence_tail_status: 'closed_by_domain_owned_acceptance_receipt',
    domain_owner: 'med-autogrant',
    closure_evidence: {
      accepted_return_shape: 'owner_receipt',
      next_verification_ref: 'verification:mag/production-default-caller',
    },
    refs: {
      owner_receipt_refs: ['receipt:mag/production-default-caller'],
      doc_refs: ['docs/status.md#production-acceptance'],
      next_verification_command_refs: ['mag production acceptance --json'],
      agent_lab_handoff_refs: ['agent-lab-handoff:mag/owner-receipt-scaleout'],
    },
    authority_boundary: {
      domain_ready_claimed: false,
    },
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
      next_verification_ref: 'verification:rca/live-visual-soak',
    },
    refs: {
      typed_blocker_refs: ['blocker:rca/live-visual-soak'],
      artifact_receipt_refs: ['artifact-receipt:rca/last-known-good'],
      doc_refs: ['docs/status.md#production-evidence-tail'],
      next_verification_command_refs: ['rca acceptance verify --json'],
    },
    authority_boundary: {
      domain_ready_claimed: false,
    },
  });

  const metaRepo = buildReadyAgentRepo();
  retargetReadyRepo(metaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(metaRepo);
  writeProductionAcceptance(metaRepo, 'meta-production-acceptance.json', {
    status: 'domain_owner_receipt_observed',
    domain_owner: 'opl-meta-agent',
    receipt_ref: 'receipt:meta-agent/real-target-scaleout',
    doc_ref: 'docs/status.md#managed-module-acceptance',
    next_verification_command: 'opl-meta-agent acceptance verify --json',
    authority_boundary: {
      domain_ready_claimed: false,
    },
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
    '--agent',
    `opl-meta-agent=${metaRepo}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.summary.total_repo_count, 4);
  assert.equal(report.summary.passed_count, 4);
  assert.equal(report.summary.structural_conformance_status, 'passed');
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);

  const [mas, mag, rca, meta] = report.reports;
  assert.equal(mas.evidence_tail_classification.status, 'production_evidence_tail_present');
  assert.equal(mas.evidence_tail_classification.tail_items[0].status, 'open');
  assert.equal(mas.evidence_tail_classification.tail_items[0].evidence_ref, null);

  assert.equal(mag.evidence_tail_classification.status, 'closed');
  assert.equal(mag.evidence_tail_classification.tail_items[0].status, 'closed');
  assert.equal(mag.evidence_tail_classification.tail_items[0].evidence_ref, 'receipt:mag/production-default-caller');
  assert.equal(mag.evidence_tail_classification.tail_items[0].doc_ref, 'docs/status.md#production-acceptance');
  assert.equal(
    mag.evidence_tail_classification.tail_items[0].next_verification_command,
    'mag production acceptance --json',
  );
  assert.deepEqual(
    mag.evidence_tail_classification.tail_items[0].advisory_refs.agent_lab_handoff_refs,
    ['agent-lab-handoff:mag/owner-receipt-scaleout'],
  );
  assert.equal(mag.evidence_tail_classification.tail_items[0].authority_boundary.conformance_report_can_claim_domain_ready, false);

  assert.equal(rca.status, 'passed');
  assert.equal(rca.evidence_tail_classification.status, 'domain_owned_typed_blocker_reported');
  assert.equal(rca.evidence_tail_classification.tail_items[0].status, 'domain_owned_typed_blocker');
  assert.equal(rca.evidence_tail_classification.tail_items[0].evidence_ref, 'blocker:rca/live-visual-soak');
  assert.equal(rca.evidence_tail_classification.tail_items[0].next_verification_command, 'rca acceptance verify --json');
  assert.equal(
    rca.evidence_tail_classification.tail_items[0].authority_boundary.domain_acceptance_status,
    'domain_owned_typed_blocker_with_next_verification_ref',
  );
  assert.equal(
    rca.evidence_tail_classification.tail_items[0].authority_boundary.typed_blocker_kind,
    'live_visual_soak_pending',
  );

  assert.equal(meta.evidence_tail_classification.status, 'closed');
  assert.equal(meta.evidence_tail_classification.tail_items[0].domain_owner, 'opl-meta-agent');
  assert.equal(meta.evidence_tail_classification.authority_boundary.evidence_tail_can_claim_domain_ready, false);
});

test('agents conformance parses nested MAS and RCA production acceptance evidence tails', () => {
  const masRepo = buildReadyAgentRepo();
  retargetReadyRepo(masRepo, 'med-autoscience', 'Med Auto Science');
  writeProductionAcceptance(masRepo, 'mas-production-acceptance.json', {
    surface_kind: 'mas_domain_owned_production_acceptance',
    domain_id: 'med-autoscience',
    owner: 'MedAutoScience',
    acceptance_status: 'closed_by_domain_owned_acceptance_receipt',
    domain_acceptance_receipt: {
      receipt_id: 'mas-production-acceptance-2026-05-19',
      receipt_class: 'owner_receipt',
      receipt_owner: 'MedAutoScience',
      receipt_status: 'accepted',
      owner_receipt_refs: [
        {
          ref: 'contracts/owner_receipt_contract.json',
          role: 'domain_owner_receipt_contract',
          body_included: false,
        },
        {
          ref: 'contracts/production_acceptance/mas-production-acceptance.json#/domain_acceptance_receipt',
          role: 'domain_owned_production_acceptance_receipt',
          body_included: false,
        },
      ],
      progress_delta_refs: [
        {
          ref: 'docs/status.md#current-evidence-tail',
          role: 'human_doc_progress_delta',
          body_included: false,
        },
      ],
      quality_publication_gate_refs: [
        {
          ref: 'publication_eval/latest.json',
          role: 'mas_owned_publication_eval_surface',
          body_included: false,
        },
      ],
      typed_blocker_refs: [],
      next_verification_command_refs: [
        {
          ref: 'scripts/run-pytest-clean.sh -q tests/test_mas_production_acceptance.py',
          role: 'focused_contract_test',
          body_included: false,
        },
      ],
    },
    refs: {
      next_verification_command_refs: [
        {
          ref: 'scripts/verify.sh',
          role: 'minimum_repo_verification',
          body_included: false,
        },
      ],
    },
    authority_boundary: {
      opl_can_authorize_domain_ready: false,
      provider_completion_is_domain_ready: false,
    },
  });

  const rcaRepo = buildReadyAgentRepo();
  retargetReadyRepo(rcaRepo, 'redcube-ai', 'RedCube AI');
  configureReadyRcaMorphology(rcaRepo);
  writeProductionAcceptance(rcaRepo, 'rca-production-acceptance.json', {
    surface_kind: 'rca_domain_owned_visual_production_acceptance_evidence',
    domain_id: 'redcube_ai',
    owner: 'redcube_ai',
    visual_artifact_receipt_chain: {
      artifact_receipt_refs: [
        'contracts/artifact_locator_contract.json',
        'workspace-runtime-ref:artifact-locator:transition-hosted-domain-receipt',
      ],
      review_export_gate_refs: ['workspace-runtime-ref:review-export:transition-run'],
    },
    evidence_tail: {
      status: 'closed_by_domain_owned_acceptance_receipt',
      closure_receipt: {
        return_shape: 'domain_receipt',
        owner: 'redcube_ai',
        receipt_ref: 'rca-owner-receipt:visual-stage:transition-hosted-domain-receipt',
        artifact_locator_ref: 'contracts/artifact_locator_contract.json',
        artifact_receipt_refs: [
          'workspace-runtime-ref:artifact-locator:transition-hosted-domain-receipt',
        ],
        review_export_ref: 'workspace-runtime-ref:review-export:transition-run',
      },
      typed_blocker: null,
    },
    next_verification_command_refs: [
      {
        ref: 'command:npm run --silent build && node --experimental-strip-types --test tests/rca-production-acceptance.test.ts',
        purpose: 'focused_production_acceptance_contract_test',
      },
    ],
    authority_boundary: {
      opl_can_authorize_domain_ready: false,
      provider_completion_is_domain_ready: false,
    },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${masRepo}`,
    '--agent',
    `rca=${rcaRepo}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.summary.structural_conformance_status, 'passed');
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);

  const [mas, rca] = report.reports;
  const masTail = mas.evidence_tail_classification.tail_items[0];
  assert.equal(mas.evidence_tail_classification.status, 'closed');
  assert.equal(masTail.status, 'closed');
  assert.equal(masTail.domain_owner, 'MedAutoScience');
  assert.equal(masTail.evidence_ref, 'contracts/owner_receipt_contract.json');
  assert.equal(masTail.doc_ref, 'docs/status.md#current-evidence-tail');
  assert.equal(
    masTail.next_verification_command,
    'scripts/run-pytest-clean.sh -q tests/test_mas_production_acceptance.py',
  );
  assert.equal(masTail.contract_ref, 'contracts/production_acceptance/mas-production-acceptance.json');
  assert.equal(masTail.owner_ref, 'MedAutoScience');
  assert.equal(masTail.authority_boundary.conformance_report_can_claim_domain_ready, false);
  assert.equal(masTail.authority_boundary.domain_ready_claimed_by_conformance, false);

  const rcaTail = rca.evidence_tail_classification.tail_items[0];
  assert.equal(rca.evidence_tail_classification.status, 'closed');
  assert.equal(rcaTail.status, 'closed');
  assert.equal(rcaTail.domain_owner, 'redcube_ai');
  assert.equal(rcaTail.evidence_ref, 'rca-owner-receipt:visual-stage:transition-hosted-domain-receipt');
  assert.equal(rcaTail.doc_ref, 'workspace-runtime-ref:review-export:transition-run');
  assert.equal(
    rcaTail.next_verification_command,
    'command:npm run --silent build && node --experimental-strip-types --test tests/rca-production-acceptance.test.ts',
  );
  assert.equal(rcaTail.contract_ref, 'contracts/production_acceptance/rca-production-acceptance.json');
  assert.equal(rcaTail.owner_ref, 'redcube_ai');
  assert.equal(rcaTail.authority_boundary.conformance_report_can_claim_domain_ready, false);
  assert.equal(rcaTail.authority_boundary.domain_ready_claimed_by_conformance, false);
});

test('agents conformance allows opl-meta-agent contract guard tests to name forbidden roles', () => {
  const metaRepo = buildReadyAgentRepo();
  retargetReadyRepo(metaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(metaRepo);
  fs.mkdirSync(path.join(metaRepo, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(metaRepo, 'tests', 'support'), { recursive: true });
  fs.mkdirSync(path.join(metaRepo, 'tests', 'source-purity'), { recursive: true });
  fs.mkdirSync(
    path.join(
      metaRepo,
      'runtime',
      'authority_functions',
      'meta-agent-authority-functions.parts',
      'script_morphology_policy',
    ),
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(metaRepo, 'tests', 'contracts.test.ts'),
    [
      'const forbiddenRoles = [',
      "  'generic_runtime_owner',",
      "  'generic_registry_owner',",
      "  'app_shell_owner',",
      "  'agent_lab_execution_owner',",
      "  'promotion_gate_owner',",
      "  'target_domain_truth_writer',",
      '];',
      'export { forbiddenRoles };',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(metaRepo, 'tests', 'support', 'contracts.ts'),
    [
      'export function assertForbiddenRolesAreOnlyPolicyTerms() {',
      "  return ['app_shell_owner', 'promotion_gate_owner'];",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeJson(path.join(metaRepo, 'contracts', 'script_to_pack_gate_receipt.json'), {
    machine_gate_inputs: {
      forbidden_roles: [
        'generic_runtime_owner',
        'generic_registry_owner',
        'app_shell_owner',
        'agent_lab_execution_owner',
        'promotion_gate_owner',
        'target_domain_truth_writer',
      ],
    },
  });
  writeJson(path.join(metaRepo, 'contracts', 'stage_native_artifact_vocabulary.json'), {
    false_authority_claims: [
      'app_shell_owner',
      'promotion_gate_owner',
    ],
  });
  writeJson(
    path.join(
      metaRepo,
      'runtime',
      'authority_functions',
      'meta-agent-authority-functions.parts',
      'script_morphology_policy',
      'root.json',
    ),
    {
      forbidden_roles: [
        'generic_runtime_owner',
        'generic_registry_owner',
        'app_shell_owner',
        'agent_lab_execution_owner',
        'promotion_gate_owner',
        'target_domain_truth_writer',
      ],
    },
  );
  writeJson(
    path.join(
      metaRepo,
      'runtime',
      'authority_functions',
      'meta-agent-authority-functions.parts',
      'script_morphology_policy',
      'script-to-pack-retirement-gates.json',
    ),
    [
      {
        gate_id: 'retained_thin_authority_helpers_and_takeover_smoke',
        forbidden_long_term_claims: [
          'app_shell_owner',
          'generic_runtime_owner',
        ],
      },
    ],
  );
  writeJson(
    path.join(
      metaRepo,
      'runtime',
      'authority_functions',
      'meta-agent-authority-functions.parts',
      'purpose_first_owner_delta_gate.json',
    ),
    {
      second_framework_guard: {
        forbidden_oma_owned_surfaces: [
          'app_shell_owner',
          'target_domain_truth_writer',
        ],
      },
    },
  );
  fs.writeFileSync(
    path.join(metaRepo, 'tests', 'source-purity-boundary.test.ts'),
    [
      "assert.equal(authorityFunctions.not_generic_runtime_owner, true);",
      "assert.ok(forbiddenSurfaces.includes('app_shell_owner'));",
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(metaRepo, 'tests', 'source-purity', 'script-morphology.test-case.ts'),
    [
      "assert.ok(morphologyPolicy.forbidden_roles.includes('generic_runtime_owner'));",
      "assert.ok(gate.forbidden_long_term_claims.includes('app_shell_owner'));",
      '',
    ].join('\n'),
    'utf8',
  );
  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `opl-meta-agent=${metaRepo}`,
  ]).standard_domain_agent_conformance;
  const forbiddenNameResidue = report.reports[0].physical_morphology_checks.forbidden_name_residue;

  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].status, 'passed');
  assert.equal(
    forbiddenNameResidue.some((entry: { path: string; allowed: boolean }) =>
      entry.path === 'tests/contracts.test.ts' && entry.allowed === true
    ),
    true,
  );
  assert.equal(
    forbiddenNameResidue.some((entry: { path: string; allowed: boolean }) =>
      entry.path === 'tests/support/contracts.ts' && entry.allowed === true
    ),
    true,
  );
  [
    'contracts/script_to_pack_gate_receipt.json',
    'contracts/stage_native_artifact_vocabulary.json',
    'runtime/authority_functions/meta-agent-authority-functions.parts/script_morphology_policy/root.json',
    'runtime/authority_functions/meta-agent-authority-functions.parts/script_morphology_policy/script-to-pack-retirement-gates.json',
    'runtime/authority_functions/meta-agent-authority-functions.parts/purpose_first_owner_delta_gate.json',
    'tests/source-purity-boundary.test.ts',
    'tests/source-purity/script-morphology.test-case.ts',
  ].forEach((allowedPath) => {
    assert.equal(
      forbiddenNameResidue.some((entry: { path: string; allowed: boolean }) =>
        entry.path === allowedPath && entry.allowed === true
      ),
      true,
      `${allowedPath} should be allowed as OMA policy/manifest/test guard residue`,
    );
  });
  const morphologyChecks = report.reports[0].physical_morphology_checks;
  assert.equal(morphologyChecks.residue_classification_summary.status, 'no_active_forbidden_name_residue');
  assert.equal(morphologyChecks.residue_classification_summary.active_forbidden_name_residue_count, 0);
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_count,
    morphologyChecks.forbidden_name_residue.length,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .contract_or_legacy_guard_test,
    11,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .machine_contract_policy_or_projection,
    14,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .authority_function_policy_manifest,
    16,
  );
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, []);
  assert.equal(
    morphologyChecks.allowed_name_residue.every((entry: { allowance_classification: string }) =>
      [
        'authority_function_policy_manifest',
        'contract_or_legacy_guard_test',
        'machine_contract_policy_or_projection',
      ].includes(entry.allowance_classification)
    ),
    true,
  );
  assert.deepEqual(report.reports[0].blockers, []);
});

test('agents conformance still blocks unclassified opl-meta-agent active forbidden-role tokens', () => {
  const metaRepo = buildReadyAgentRepo();
  retargetReadyRepo(metaRepo, 'opl-meta-agent', 'OPL Meta Agent');
  configureReadyMetaMorphology(metaRepo);
  fs.writeFileSync(
    path.join(metaRepo, 'contracts', 'unexpected_active_policy.json'),
    [
      '{',
      '  "forbidden_roles": ["generic_runtime_owner"]',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `opl-meta-agent=${metaRepo}`,
  ]).standard_domain_agent_conformance;
  const morphologyChecks = report.reports[0].physical_morphology_checks;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].status, 'blocked');
  assert.equal(morphologyChecks.residue_classification_summary.status, 'active_forbidden_name_residue_present');
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, [
    {
      token: 'generic_runtime_owner',
      path: 'contracts/unexpected_active_policy.json',
      allowed: false,
    },
  ]);
  assert.equal(
    report.reports[0].blockers.includes(
      'active_forbidden_name_residue:generic_runtime_owner:contracts/unexpected_active_policy.json',
    ),
    true,
  );
});

test('agents conformance blocks missing physical morphology policy', () => {
  const repoDir = buildReadyAgentRepo();
  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = parseJsonText(fs.readFileSync(privateSurfacePolicyPath, 'utf8')) as any;
  delete privateSurfacePolicy.physical_source_morphology_policy;
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);

  const report = runCli([
    'agents',
    'conformance',
    '--repo-dir',
    repoDir,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].blockers.includes('physical_morphology_policy_not_declared'), true);
});

test('agents conformance blocks missing workspace file lifecycle policy', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'workspace_lifecycle_policy.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--repo-dir',
    repoDir,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].workspace_file_lifecycle_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('workspace_file_lifecycle_policy_not_declared'),
    true,
  );
});

test('agents conformance blocks missing stage artifact kernel adoption policy', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'stage_artifact_kernel_adoption.json'));

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.reports[0].stage_artifact_kernel_adoption_checks.status, 'blocked');
  assert.equal(
    report.reports[0].blockers.includes('stage_artifact_kernel_adoption_not_declared'),
    true,
  );
});

test('agents conformance blocks legacy roots, README pack paths, and unavailable active-path scans', () => {
  const repoDir = buildReadyAgentRepo();
  const packCompilerInputPath = path.join(repoDir, 'contracts', 'pack_compiler_input.json');
  const packCompilerInput = parseJsonText(fs.readFileSync(packCompilerInputPath, 'utf8')) as any;
  packCompilerInput.canonical_repo_source_semantic_pack_root = 'src/';
  packCompilerInput.required_domain_pack_paths.push('agent/README.md');
  writeJson(packCompilerInputPath, packCompilerInput);

  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = parseJsonText(fs.readFileSync(functionalAuditPath, 'utf8')) as any;
  functionalAudit.scan = { active_path_scan_state: 'not_available' };
  writeJson(functionalAuditPath, functionalAudit);

  const report = runCli([
    'agents',
    'conformance',
    '--repo-dir',
    repoDir,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  const blockers = report.reports[0].blockers;
  assert.equal(blockers.includes('pack_compiler_legacy_pack_root_field:canonical_repo_source_semantic_pack_root'), true);
  assert.equal(blockers.includes('required_domain_pack_path_must_not_be_readme:agent/README.md'), true);
  assert.equal(blockers.includes('active_path_scan_state_not_available:$.scan.active_path_scan_state'), true);
});

test('agents conformance treats OPL replacement ledger refs as non-residue', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(repoDir);
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as any;
  actionCatalog.notes.push('OPL replacement consumes stage_attempt_ledger refs only.');
  writeJson(actionCatalogPath, actionCatalog);

  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = parseJsonText(fs.readFileSync(privateSurfacePolicyPath, 'utf8')) as any;
  privateSurfacePolicy.physical_source_morphology_policy.required_surface_ids = [
    'domain_runtime',
    'product_entry',
    'status',
    'user_loop',
    'domain_handler',
    'runtime_registration',
    'control_plane',
    'lifecycle',
    'memory',
    'package',
    'autonomy_controller',
    'legacy_runtime_residue',
  ];
  privateSurfacePolicy.physical_source_morphology_policy.surface_classifications = (
    privateSurfacePolicy.physical_source_morphology_policy.required_surface_ids.map((surface_id: string) => ({
      surface_id,
      classification: surface_id === 'legacy_runtime_residue' ? 'legacy_proof_tombstone' : 'refs_only_adapter',
      source_refs: surface_id === 'legacy_runtime_residue' ? ['docs/history/runtime-tombstone.md'] : ['agent/'],
    }))
  );
  privateSurfacePolicy.physical_source_morphology_policy.forbidden_residue_classes = [
    'legacy_local_persistence_surface',
    'legacy_attempt_record_surface',
    'legacy_repo_cadence_owner',
    'legacy_executor_runtime_probe',
    'legacy_compat_alias_surface',
  ];
  privateSurfacePolicy.physical_source_morphology_policy.authority_boundary = {
    mag_can_own_generic_runtime: false,
    mag_can_own_generated_wrapper: false,
    mag_can_restore_legacy_compat_alias: false,
  };
  writeJson(privateSurfacePolicyPath, privateSurfacePolicy);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'passed');
  assert.equal(report.reports[0].physical_morphology_checks.status, 'passed');
  assert.deepEqual(report.reports[0].physical_morphology_checks.forbidden_name_residue, []);
});

test('agents conformance blocks legacy sidecar aliases as active physical morphology surfaces', () => {
  const magRepoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(magRepoDir);
  configureReadyMagMorphology(magRepoDir);
  const magPrivateSurfacePolicyPath = path.join(magRepoDir, 'contracts', 'private_functional_surface_policy.json');
  const magPrivateSurfacePolicy = parseJsonText(fs.readFileSync(magPrivateSurfacePolicyPath, 'utf8')) as any;
  magPrivateSurfacePolicy.physical_source_morphology_policy.required_surface_ids = (
    magPrivateSurfacePolicy.physical_source_morphology_policy.required_surface_ids.map((surfaceId: string) => (
      surfaceId === 'domain_handler' ? 'sidecar' : surfaceId
    ))
  );
  magPrivateSurfacePolicy.physical_source_morphology_policy.surface_classifications = (
    magPrivateSurfacePolicy.physical_source_morphology_policy.surface_classifications.map((
      entry: { surface_id: string },
    ) => ({
      ...entry,
      surface_id: entry.surface_id === 'domain_handler' ? 'sidecar' : entry.surface_id,
    }))
  );
  writeJson(magPrivateSurfacePolicyPath, magPrivateSurfacePolicy);

  const rcaRepoDir = buildReadyAgentRepo();
  retargetReadyRepo(rcaRepoDir, 'redcube_ai', 'RedCube AI');
  configureReadyRcaMorphology(rcaRepoDir);
  const rcaPolicyPath = path.join(rcaRepoDir, 'contracts', 'physical_source_morphology_policy.json');
  const rcaPolicy = parseJsonText(fs.readFileSync(rcaPolicyPath, 'utf8')) as any;
  rcaPolicy.active_surface_classifications = rcaPolicy.active_surface_classifications.map((
    entry: { surface_id: string },
  ) => ({
    ...entry,
    surface_id: entry.surface_id === 'product_entry_continuity_refs_adapter'
      ? 'product_entry_session_snapshot_refs_adapter'
      : entry.surface_id === 'domain_action_adapter_guarded_actions'
        ? 'product_sidecar_guarded_actions'
        : entry.surface_id,
  }));
  writeJson(rcaPolicyPath, rcaPolicy);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${magRepoDir}`,
    '--agent',
    `rca=${rcaRepoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  assert.equal(report.passed_count, 0);
  assert.equal(report.blocked_count, 2);
  assert.equal(report.summary.passed_count, 0);
  assert.equal(report.summary.blocked_count, 2);
  assert.equal(report.reports[0].physical_morphology_checks.status, 'blocked');
  assert.equal(
    report.reports[0].physical_morphology_checks.blockers.includes(
      'mag_physical_surface_missing:domain_handler',
    ),
    true,
  );
  assert.equal(
    report.reports[0].physical_morphology_checks.blockers.includes(
      'mag_physical_surface_unclassified:domain_handler',
    ),
    true,
  );
  assert.equal(report.reports[1].physical_morphology_checks.status, 'blocked');
  assert.equal(
    report.reports[1].physical_morphology_checks.blockers.includes(
      'rca_physical_surface_unclassified:domain_action_adapter_guarded_actions',
    ),
    true,
  );
});
