import { assert, fs, path, runCli, test } from '../helpers.ts';
import {
  buildReadyAgentRepo,
  configureReadyMagMorphology,
  configureReadyMetaMorphology,
  configureReadyRcaMorphology,
  retargetReadyRepo,
  retargetReadyRepoToMag,
  writeJson,
  writeProductionAcceptance,
} from './agents-conformance-fixtures.ts';

test('agents conformance reports structural readiness separately from production evidence tail', () => {
  const repoDir = buildReadyAgentRepo();
  const platformSurfaces = runCli([
    'agents',
    'platform-surfaces',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_platform_surface_ownership;

  assert.equal(platformSurfaces.surface_kind, 'opl_agent_platform_surface_ownership_report');
  assert.equal(platformSurfaces.owner, 'one-person-lab');
  assert.equal(platformSurfaces.status, 'passed');
  assert.equal(platformSurfaces.summary.total_repo_count, 1);
  assert.equal(platformSurfaces.summary.generic_subdomain_count, 7);
  assert.equal(platformSurfaces.summary.explicit_forbidden_owner_claim_count, 0);
  assert.deepEqual(platformSurfaces.reports[0].retained_domain_authority, [
    'domain_truth',
    'quality_or_export_or_publication_or_visual_verdict',
    'artifact_body_and_mutation_authority',
    'source_readiness_verdict',
    'memory_body_accept_reject',
    'owner_receipt_signing',
    'typed_blocker_materialization',
    'domain_specific_policy_rubric_or_quality_gate',
  ]);
  assert.equal(
    platformSurfaces.reports[0].generic_subdomains
      .some((surface: { subdomain_id: string; owner: string }) => (
        surface.subdomain_id === 'generated_domain_handler_dispatch_shell'
        && surface.owner === 'one-person-lab'
      )),
    true,
  );
  const actionMetadataSurface = platformSurfaces.reports[0].generic_subdomains
    .find((surface: { subdomain_id: string }) => (
      surface.subdomain_id === 'generated_action_metadata_command_registration_shell'
    ));
  assert.equal(Boolean(actionMetadataSurface), true);
  assert.equal(actionMetadataSurface.owner, 'one-person-lab');
  assert.equal(
    actionMetadataSurface.domain_allowed_role,
    'domain_action_ids_handler_refs_or_refs_only_metadata_source',
  );
  assert.equal(
    actionMetadataSurface.observed_source_refs.includes('contracts/action_catalog.json'),
    true,
  );
  assert.equal(platformSurfaces.authority_boundary.report_can_claim_domain_ready, false);

  const defaultCallers = runCli([
    'agents',
    'default-callers',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_default_caller_readiness;

  assert.equal(defaultCallers.surface_kind, 'opl_agent_generated_default_caller_readiness_report');
  assert.equal(defaultCallers.owner, 'one-person-lab');
  assert.equal(defaultCallers.status, 'ready_domain_evidence_required');
  assert.equal(defaultCallers.summary.total_repo_count, 1);
  assert.equal(defaultCallers.summary.generated_default_caller_surface_count, 8);
  assert.equal(defaultCallers.summary.blocked_surface_count, 0);
  assert.equal(defaultCallers.summary.deletion_evidence_worklist_count, 8);
  assert.equal(defaultCallers.summary.missing_domain_owner_receipt_or_typed_blocker_count, 8);
  assert.equal(defaultCallers.summary.missing_no_forbidden_write_proof_count, 8);
  assert.equal(defaultCallers.summary.missing_tombstone_or_provenance_ref_count, 8);
  assert.equal(
    defaultCallers.migration_gate_policy.domain_owner_receipt_or_typed_blocker_still_required,
    true,
  );
  assert.equal(defaultCallers.migration_gate_policy.physical_delete_authorized_by_this_report, false);
  assert.equal(defaultCallers.authority_boundary.report_can_claim_domain_ready, false);
  assert.equal(defaultCallers.authority_boundary.report_can_authorize_domain_repo_physical_delete, false);
  const sampleDefaultCallerReport = defaultCallers.reports[0];
  assert.equal(sampleDefaultCallerReport.status, 'ready_domain_evidence_required');
  assert.equal(sampleDefaultCallerReport.deletion_gate.replacement_parity, 'ready');
  assert.equal(sampleDefaultCallerReport.deletion_gate.active_caller_cutover, 'ready');
  assert.equal(sampleDefaultCallerReport.deletion_gate.evidence_worklist_count, 8);
  assert.equal(sampleDefaultCallerReport.deletion_gate.missing_domain_owner_receipt_or_typed_blocker_count, 8);
  assert.equal(sampleDefaultCallerReport.deletion_gate.missing_no_forbidden_write_proof_count, 8);
  assert.equal(sampleDefaultCallerReport.deletion_gate.missing_tombstone_or_provenance_ref_count, 8);
  assert.equal(
    sampleDefaultCallerReport.deletion_gate.domain_owner_receipt_or_typed_blocker,
    'required_from_domain_owner_before_physical_delete',
  );
  assert.equal(sampleDefaultCallerReport.deletion_gate.physical_delete_authorized, false);
  assert.equal(sampleDefaultCallerReport.surface_gates.length, 8);
  assert.equal(sampleDefaultCallerReport.surface_gates.every((gate: { status: string }) => (
    gate.status === 'ready_for_default_caller_cutover'
  )), true);
  assert.equal(sampleDefaultCallerReport.deletion_evidence_worklists.length, 8);
  assert.equal(
    sampleDefaultCallerReport.surface_gates.every((gate: { deletion_evidence_worklist: { surface_kind: string } }) => (
      gate.deletion_evidence_worklist.surface_kind === 'opl_default_caller_surface_deletion_evidence_worklist'
    )),
    true,
  );
  const cliDeletionWorklist = sampleDefaultCallerReport.surface_gates
    .find((gate: { surface_id: string }) => gate.surface_id === 'cli')
    .deletion_evidence_worklist;
  assert.equal(cliDeletionWorklist.status, 'domain_evidence_required');
  assert.equal(cliDeletionWorklist.replacement_parity.status, 'observed');
  assert.equal(cliDeletionWorklist.active_caller_cutover.status, 'observed');
  assert.equal(
    cliDeletionWorklist.domain_owner_receipt_or_typed_blocker.status,
    'required_from_domain_owner',
  );
  assert.equal(cliDeletionWorklist.no_forbidden_write_proof.status, 'required_before_physical_delete');
  assert.equal(cliDeletionWorklist.tombstone_or_provenance_ref.status, 'required_before_physical_delete');
  assert.equal(cliDeletionWorklist.semantic_equivalence_status, 'cleared_by_boundary');
  assert.equal(cliDeletionWorklist.physical_delete_authorized, false);
  assert.equal(cliDeletionWorklist.authority_boundary.worklist_can_sign_domain_owner_receipt, false);
  assert.equal(cliDeletionWorklist.authority_boundary.worklist_can_authorize_domain_repo_physical_delete, false);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `sample=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.surface_kind, 'opl_standard_domain_agent_conformance_report');
  assert.equal(report.owner, 'one-person-lab');
  assert.equal(report.status, 'passed');
  assert.equal(report.summary.total_repo_count, 1);
  assert.equal(report.summary.passed_count, 1);
  assert.equal(report.summary.blocked_count, 0);
  assert.equal(report.summary.structural_conformance_status, 'passed');
  assert.equal(report.summary.production_evidence_tail_count, 2);
  assert.equal(report.authority_boundary.conformance_report_can_claim_domain_ready, false);

  const repo = report.reports[0];
  assert.equal(repo.status, 'passed');
  assert.deepEqual(repo.blockers, []);
  assert.equal(repo.scaffold_validation.status, 'passed');
  assert.equal(repo.pack_compiler_checks.canonical_semantic_pack_root, 'agent/');
  assert.deepEqual(repo.pack_compiler_checks.legacy_pack_root_fields, []);
  assert.deepEqual(repo.pack_compiler_checks.readme_required_paths, []);
  assert.equal(repo.generated_surface_handoff_checks.generated_surface_owner, 'one-person-lab');
  assert.equal(repo.private_surface_checks.domain_can_claim_generic_runtime_owner, false);
  assert.equal(repo.platform_surface_ownership_checks.status, 'passed');
  assert.equal(repo.platform_surface_ownership_checks.generic_subdomain_count, 7);
  assert.deepEqual(repo.platform_surface_ownership_checks.explicit_forbidden_owner_claims, []);
  assert.equal(repo.platform_surface_ownership_checks.authority_boundary.report_can_claim_production_ready, false);
  assert.equal(repo.generated_interface_checks.generated_interfaces_status, 'ready');
  assert.equal(repo.generated_interface_checks.generated_wrapper_bundle_status, 'ready');
  assert.equal(repo.generated_interface_checks.active_caller_target_proof_status, 'ready');
  assert.equal(
    repo.generated_interface_checks.active_caller_cutover_proof_status,
    'cutover_to_opl_generated_or_domain_handler_targets',
  );
  assert.equal(repo.physical_morphology_checks.status, 'passed');
  assert.equal(repo.physical_morphology_checks.policy_status, 'declared');
  assert.equal(repo.workspace_file_lifecycle_checks.status, 'passed');
  assert.equal(repo.workspace_file_lifecycle_checks.policy_status, 'declared');
  assert.deepEqual(repo.workspace_file_lifecycle_checks.repo_source_boundaries.required_roots, [
    'agent/',
    'contracts/',
    'runtime/authority_functions/',
    'docs/',
    'src/ or packages/',
  ]);
  assert.equal(
    repo.workspace_file_lifecycle_checks.authority_boundary
      .policy_can_claim_domain_ready_or_artifact_authority,
    false,
  );
  assert.equal(repo.evidence_tail_classification.status, 'production_evidence_tail_present');
  assert.equal(repo.evidence_tail_classification.tail_items.length, 2);
  assert.deepEqual(
    repo.evidence_tail_classification.tail_items.map((item: { status: string }) => item.status),
    ['open', 'open'],
  );
  assert.equal(repo.evidence_tail_classification.tail_items[0].repo_path, repoDir);
  assert.equal(repo.evidence_tail_classification.tail_items[0].authority_boundary.conformance_report_can_claim_domain_ready, false);
});

test('agents platform-surfaces projects RCA guarded action catalog as action metadata shell only', () => {
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
  fs.writeFileSync(
    guardedActionCatalogPath,
    [
      'export const rcaGuardedActionCatalog = {',
      "  surfaceKind: 'rca_guarded_action_catalog',",
      "  role: 'domain_action_metadata_refs_only_source',",
      '};',
      '',
    ].join('\n'),
    'utf8',
  );

  const platformSurfaces = runCli([
    'agents',
    'platform-surfaces',
    '--agent',
    `rca=${repoDir}`,
  ]).agent_platform_surface_ownership;

  const rcaReport = platformSurfaces.reports[0];
  const actionMetadataSurface = rcaReport.generic_subdomains
    .find((surface: { subdomain_id: string }) => (
      surface.subdomain_id === 'generated_action_metadata_command_registration_shell'
    ));

  assert.equal(platformSurfaces.status, 'passed');
  assert.equal(actionMetadataSurface.owner, 'one-person-lab');
  assert.equal(
    actionMetadataSurface.observed_source_refs.includes(
      'packages/redcube-domain-entry/src/actions/domain-action-adapter-parts/guarded-action-catalog.ts',
    ),
    true,
  );
  assert.equal(rcaReport.authority_boundary.report_can_claim_domain_ready, false);
  assert.equal(rcaReport.authority_boundary.report_can_claim_production_ready, false);
});

test('agents readiness aggregates structural gates and production evidence tail without claiming authority', () => {
  const repoDir = buildReadyAgentRepo();
  const readiness = runCli([
    'agents',
    'readiness',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_readiness;

  assert.equal(readiness.surface_kind, 'opl_agent_readiness_summary');
  assert.equal(readiness.owner, 'one-person-lab');
  assert.equal(readiness.detail_level, 'summary');
  assert.equal(
    readiness.projection_detail_policy,
    'attention_first_kernel_floor_default_with_embedded_compatibility_drilldowns',
  );
  assert.equal(readiness.readiness_model.mode, 'ai_first_contract_light');
  assert.equal(readiness.readiness_model.default_payload, 'operator_attention_summary');
  assert.equal(readiness.readiness_model.ai_executor_internal_strategy_is_contract, false);
  assert.equal(readiness.status, 'passed_with_production_evidence_tail');
  assert.equal(readiness.attention_first_payload.surface_kind, 'opl_agent_readiness_attention_first_payload');
  assert.equal(readiness.attention_first_payload.summary.blocker_count, 0);
  assert.equal(readiness.attention_first_payload.summary.warning_count, 1);
  assert.equal(readiness.attention_first_payload.summary.production_evidence_tail_count, 2);
  assert.deepEqual(
    readiness.attention_first_payload.diagnostic_drilldown_refs,
    [
      '/agent_readiness/conformance_report',
      '/agent_readiness/production_evidence_tail_ledger',
      '/agent_readiness/gates/pack_compiler',
    ],
  );
  assert.match(readiness.attention_first_payload.claim_policy, /emits_no_domain_quality_artifact_or_production_ready/);
  assert.equal(readiness.kernel_floor.policy, 'minimum_structural_boundary_and_evidence_floor_only');
  assert.equal(readiness.kernel_floor.ai_executor_strategy_contract, false);
  assert.equal(readiness.kernel_floor.production_evidence_tail_can_block_structural_conformance, false);
  assert.equal(readiness.kernel_floor.contract_floor_can_claim_domain_or_quality_ready, false);
  assert.equal(readiness.diagnostic_drilldowns.every((lens: { role: string; default_surface: boolean }) => (
    lens.role === 'diagnostic_drilldown' && lens.default_surface === false
  )), true);
  assert.deepEqual(readiness.excluded_ready_verdicts, [
    'domain_ready_verdict',
    'quality_verdict',
    'artifact_authority_verdict',
    'production_ready_verdict',
  ]);
  assert.equal(Object.hasOwn(readiness, 'domain_ready_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'quality_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'artifact_authority_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'production_ready_verdict'), false);
  assert.equal(readiness.summary.structural_conformance_status, 'passed');
  assert.equal(readiness.summary.conformance_passed_count, 1);
  assert.equal(readiness.summary.conformance_blocked_count, 0);
  assert.equal(readiness.summary.pack_compiler_blocked_domain_count, 0);
  assert.equal(readiness.summary.generated_interface_blocked_count, 0);
  assert.equal(readiness.summary.domain_generated_surface_owner_claim_count, 0);
  assert.equal(readiness.summary.platform_surface_ownership_blocked_count, 0);
  assert.equal(readiness.summary.explicit_forbidden_platform_owner_claim_count, 0);
  assert.equal(readiness.summary.agent_readiness_production_evidence_tail_count, 2);
  assert.deepEqual(
    Object.keys(readiness.summary).filter((key) => key.startsWith('production_evidence_tail_')),
    [],
  );
  assert.equal(
    readiness.summary.agent_readiness_production_evidence_tail_policy,
    'reported_separately_not_a_structural_pass_condition',
  );
  assert.equal(Object.hasOwn(readiness.summary, 'deprecated_alias_metadata'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'production_or_domain_ready'), false);

  assert.equal(readiness.gates.scaffold_and_conformance.status, 'passed');
  assert.equal(
    readiness.gates.scaffold_and_conformance.source_command,
    'opl agents conformance --family-defaults --json',
  );
  assert.equal(
    readiness.gates.pack_compiler.policy,
    'canonical_domain_pack_metadata_source_for_generated_surfaces',
  );
  assert.equal(
    readiness.gates.generated_interfaces.policy,
    'generated_descriptors_route_to_domain_handler_targets_without_claiming_domain_truth',
  );
  assert.equal(readiness.gates.platform_surface_ownership.status, 'passed');
  assert.equal(
    readiness.gates.platform_surface_ownership.policy,
    'opl_owns_generic_platform_surfaces_domain_repos_keep_authority_refs_only',
  );
  assert.equal(
    readiness.gates.semantic_hygiene.policy,
    'framework_hygiene_guard_only_no_domain_authority',
  );

  assert.equal(
    readiness.production_evidence_tail_ledger.surface_kind,
    'opl_production_evidence_tail_ledger',
  );
  assert.equal(readiness.production_evidence_tail_ledger.summary.tail_item_count, 2);
  assert.equal(readiness.production_evidence_tail_ledger.summary.blocking_tail_item_count, 0);
  assert.equal(readiness.production_evidence_tail_ledger.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.expert_judgment_priority, 'ai_native_expert_judgment_first');
  assert.equal(
    readiness.authority_boundary.contract_floor_policy,
    'contracts_preserve_minimum_safety_audit_recovery_floor_only',
  );
  assert.equal(readiness.authority_boundary.structural_gates_are_contract_floor_only, true);
  assert.equal(readiness.authority_boundary.readiness_can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_artifact_authority, false);
  assert.equal(readiness.authority_boundary.readiness_can_claim_production_ready, false);
  assert.equal(readiness.authority_boundary.mechanical_signals_can_claim_quality_verdict, false);
  assert.equal(readiness.authority_boundary.contract_completeness_is_quality_verdict, false);
});

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
    6,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .machine_contract_policy_or_projection,
    6,
  );
  assert.equal(
    morphologyChecks.residue_classification_summary.allowed_name_residue_by_classification
      .authority_function_policy_manifest,
    6,
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

test('agents conformance blocks missing physical morphology policy', () => {
  const repoDir = buildReadyAgentRepo();
  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = JSON.parse(fs.readFileSync(privateSurfacePolicyPath, 'utf8'));
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

test('agents conformance blocks legacy roots, README pack paths, and unavailable active-path scans', () => {
  const repoDir = buildReadyAgentRepo();
  const packCompilerInputPath = path.join(repoDir, 'contracts', 'pack_compiler_input.json');
  const packCompilerInput = JSON.parse(fs.readFileSync(packCompilerInputPath, 'utf8'));
  packCompilerInput.canonical_repo_source_semantic_pack_root = 'src/';
  packCompilerInput.required_domain_pack_paths.push('agent/README.md');
  writeJson(packCompilerInputPath, packCompilerInput);

  const functionalAuditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const functionalAudit = JSON.parse(fs.readFileSync(functionalAuditPath, 'utf8'));
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
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  actionCatalog.notes.push('OPL replacement consumes stage_attempt_ledger refs only.');
  writeJson(actionCatalogPath, actionCatalog);

  const privateSurfacePolicyPath = path.join(repoDir, 'contracts', 'private_functional_surface_policy.json');
  const privateSurfacePolicy = JSON.parse(fs.readFileSync(privateSurfacePolicyPath, 'utf8'));
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
  const magPrivateSurfacePolicy = JSON.parse(fs.readFileSync(magPrivateSurfacePolicyPath, 'utf8'));
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
  const rcaPolicy = JSON.parse(fs.readFileSync(rcaPolicyPath, 'utf8'));
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

test('agents conformance allows MAS legacy active path tombstone contract markers', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepo(repoDir, 'med-autoscience', 'Med Auto Science');
  fs.mkdirSync(path.join(repoDir, 'contracts', 'runtime'), { recursive: true });
  writeJson(path.join(repoDir, 'contracts', 'runtime', 'legacy-active-path-tombstones.json'), {
    surface_kind: 'mas_legacy_active_path_tombstone_contract',
    status: 'legacy_active_paths_tombstoned',
    legacy_control_receipt_exclusion_policy: {
      status: 'active_tombstone_provenance_filter',
      legacy_markers: [
        'runtime_supervisor',
        'supervision_scheduler',
        'mas_supervision_scheduler',
      ],
      authority_boundary: {
        read_only: true,
        history_provenance_only: true,
        can_create_runtime_entrypoint: false,
        can_claim_generic_runtime_owner: false,
        can_write_domain_truth: false,
      },
    },
  });

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mas=${repoDir}`,
  ]).standard_domain_agent_conformance;
  const morphologyChecks = report.reports[0].physical_morphology_checks;

  assert.equal(report.status, 'passed');
  assert.equal(morphologyChecks.status, 'passed');
  assert.equal(morphologyChecks.residue_classification_summary.active_forbidden_name_residue_count, 0);
  assert.equal(morphologyChecks.residue_classification_summary.allowed_name_residue_count, 3);
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, []);
  assert.deepEqual(
    morphologyChecks.allowed_name_residue.map((entry: { token: string; path: string; allowance_classification: string }) => ({
      token: entry.token,
      path: entry.path,
      allowance_classification: entry.allowance_classification,
    })),
    [
      {
        token: 'runtime_supervisor',
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
      {
        token: 'supervision_scheduler',
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
      {
        token: 'mas_supervision_scheduler',
        path: 'contracts/runtime/legacy-active-path-tombstones.json',
        allowance_classification: 'machine_contract_policy_or_projection',
      },
    ],
  );
});

test('agents conformance blocks exact MAG legacy residue tokens', () => {
  const repoDir = buildReadyAgentRepo();
  retargetReadyRepoToMag(repoDir);
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = JSON.parse(fs.readFileSync(actionCatalogPath, 'utf8'));
  actionCatalog.notes.push('old attempt_ledger exact token must stay out of active paths');
  writeJson(actionCatalogPath, actionCatalog);

  const report = runCli([
    'agents',
    'conformance',
    '--agent',
    `mag=${repoDir}`,
  ]).standard_domain_agent_conformance;

  assert.equal(report.status, 'blocked');
  const morphologyChecks = report.reports[0].physical_morphology_checks;
  assert.equal(morphologyChecks.residue_classification_summary.status, 'active_forbidden_name_residue_present');
  assert.equal(morphologyChecks.residue_classification_summary.active_forbidden_name_residue_count, 1);
  assert.equal(morphologyChecks.residue_classification_summary.allowed_name_residue_count, 0);
  assert.deepEqual(morphologyChecks.allowed_name_residue, []);
  assert.deepEqual(morphologyChecks.active_forbidden_name_residue, [
    { token: 'attempt_ledger', path: 'contracts/action_catalog.json', allowed: false },
  ]);
  assert.equal(
    report.reports[0].blockers.includes('active_forbidden_name_residue:attempt_ledger:contracts/action_catalog.json'),
    true,
  );
});
