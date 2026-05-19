import { spawnSync } from 'node:child_process';

import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';

test('runtime snapshot exposes App operator drilldown as refs-only owner-aware read model', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);

  masManifest.runtime_inventory = {
    ...((masManifest.runtime_inventory as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_runtime_inventory_projection',
      source_refs: ['mas://runtime/inventory/latest.json'],
    },
  };
  masManifest.progress_projection = {
    ...((masManifest.progress_projection as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_progress_projection',
      research_runtime_control_projection: {
        surface_kind: 'research_runtime_control_projection',
        source_refs: ['mas://runtime/control/latest.json'],
      },
      route_decision_graph_ref: 'mas://runtime/route-decision/latest.json',
      quality_readiness_ref: 'mas://publication_eval/latest.json',
    },
  };
  masManifest.artifact_inventory = {
    ...((masManifest.artifact_inventory as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_artifact_inventory_projection',
      artifact_refs: ['mas://artifacts/current-package.zip'],
      package_lifecycle_ref: 'mas://artifacts/package-lifecycle/latest.json',
    },
  };
  masManifest.functional_privatization_audit = {
    target_domain_id: 'medautoscience',
    modules: [
      {
        module_id: 'app_workbench_package_ref_consumption',
        migration_class: 'refs_only_adapter',
        owner: 'med-autoscience',
      },
    ],
    bridge_exit_gate: {
      remaining_evidence_gate_ids: ['real_package_lifecycle_receipt'],
      remaining_bridge_module_ids: ['package_lifecycle_adapter'],
    },
    mag_consumer_thinning_contract: {
      external_evidence_request_pack: {
        request_pack_id: 'mas.external_evidence_request_pack.fixture',
        owner: 'med-autoscience',
        request_owner: 'med-autoscience',
        requested_from: ['one-person-lab', 'codex_app'],
        policy: 'request_refs_receipt_shapes_and_parity_only_no_runtime_implementation',
        requests: [
          {
            request_id: 'app_workbench_package_ref_consumption',
            status: 'requested_not_received',
            required_evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
            required_return_shapes: ['domain_owner_receipt', 'typed_blocker'],
            required_receipt_shapes: ['lifecycle_receipt_ref'],
            forbidden_payload_classes: ['domain_truth_body', 'artifact_body'],
            accepted_payload_policy: 'refs_receipts_and_shape_metadata_only',
            source_pointer: '/functional_privatization_audit/mag_consumer_thinning_contract/external_evidence_request_pack/requests/0',
          },
        ],
      },
      opl_replacement_expectations: [
        {
          primitive_id: 'artifact_package_lifecycle_shell',
          owner: 'one-person-lab',
          state: 'external_replacement_contract_expected',
          opl_provides: ['package_lifecycle_shell', 'restore_ref_index'],
          mag_keeps: ['domain_owner_receipt'],
          implemented_in_mag: false,
        },
      ],
    },
  };
  masManifest.standard_domain_agent_skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    artifact_locator_contract: {
      surface_kind: 'artifact_locator_contract',
      locator_model: 'workspace_runtime_artifact_root',
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
  };
  masManifest.physical_skeleton_follow_through = {
    surface_kind: 'mas_physical_skeleton_follow_through',
    status: 'minimum_repo_source_anchors_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
    direct_skill_parity_refs: ['proof:mas:direct-skill-parity'],
    opl_hosted_parity_refs: ['proof:mas:opl-hosted-parity'],
    replacement_parity_refs: ['proof:mas:replacement-parity'],
    provenance_refs: ['docs/history/runtime-substrate/mas-local-runtime-tombstone.md'],
    legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
    legacy_active_path_residue: [
      {
        path_family: 'default MAS local scheduler',
        state: 'tombstone_only',
        evidence_ref: 'docs/history/runtime-substrate/mas-local-scheduler-tombstone.md',
      },
    ],
  };
  masManifest.legacy_retirement_tombstone_proof = {
    status: 'no_active_default_caller_proven',
    active_default_callers: [],
    tombstone_refs: ['docs/history/runtime-substrate/mas-local-scheduler-tombstone.md'],
    source_refs: ['docs/decisions.md#temporal-runtime'],
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    insertProviderProof(stateRoot);
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'app_workbench_package_ref_consumption',
      '--evidence-ref',
      'mas://artifacts/package-lifecycle/latest.json',
      '--domain-receipt-ref',
      'mas://receipts/package-lifecycle/latest.json',
      '--typed-blocker-ref',
      'mas://blockers/package-lifecycle-currentness.json',
      '--no-regression-ref',
      'mas://proof/no-regression/package-lifecycle.json',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'app_workbench_package_ref_consumption',
      '--mode',
      'verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'real_package_lifecycle_receipt',
      '--request-pack-id',
      'mas.bridge_exit_gate.fixture',
      '--source-ref',
      '/functional_privatization_audit/bridge_exit_gate/remaining_evidence_gate_ids/0',
      '--domain-receipt-ref',
      'mas://receipts/package-lifecycle/latest.json',
      '--no-regression-ref',
      'mas://proof/no-regression/package-lifecycle.json',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'real_package_lifecycle_receipt',
      '--mode',
      'verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts","source_refs":["source:dataset"],"missing_material_refs":["material:irb"],"restore_refs":["restore:study-run"]}',
      '--task',
      'task-app-drilldown',
      '--checkpoint-ref',
      'checkpoint:write-start',
      '--source-fingerprint',
      'sha256:app-drilldown-source',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:write-closeout"],"consumed_refs":["artifact:table"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair","quality_refs":["publication_eval/latest.json"],"readiness_refs":["controller_decisions/latest.json"],"slo_ref":"slo:write-currentness","breached_slo_ids":["review_currentness"],"repair_command":"medautosci sidecar dispatch --task <task.json> --format json","package_refs":["package:submission-minimal"],"export_refs":["export:current-package"],"gap_report_refs":["gap:package-readiness"],"handoff_refs":["handoff:manual-submission"]}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const drilldown = snapshot.app_operator_drilldown;

    assert.equal(drilldown.surface_kind, 'opl_app_operator_drilldown_read_model');
    assert.equal(drilldown.projection_scope, 'runtime_snapshot');
    assert.equal(drilldown.consumer, 'one_person_lab_app_operator_workbench');
    assert.equal(drilldown.availability, 'available');
    assert.equal(drilldown.authority_boundary.can_write_domain_truth, false);
    assert.equal(drilldown.authority_boundary.can_read_memory_body, false);
    assert.equal(drilldown.authority_boundary.can_read_artifact_body, false);
    assert.equal(drilldown.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(drilldown.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(drilldown.authority_boundary.can_execute_domain_action, false);
    assert.equal(drilldown.authority_boundary.provider_completion_is_domain_ready, false);
    assert.deepEqual(drilldown.non_goals, [
      'does_not_write_domain_truth',
      'does_not_read_or_store_memory_body',
      'does_not_read_or_mutate_artifact_body',
      'does_not_authorize_quality_readiness_or_export_verdict',
      'does_not_directly_execute_domain_actions',
    ]);

    assert.equal(drilldown.summary.stage_attempt_count, 1);
    assert.equal(drilldown.summary.domain_projection_ref_count >= 3, true);
    assert.equal(drilldown.summary.route_graph_ref_count, 1);
    assert.equal(drilldown.summary.review_repair_queue_item_count, 1);
    assert.equal(drilldown.summary.artifact_gallery_item_count, 3);
    assert.equal(drilldown.summary.package_ref_count, 1);
    assert.equal(drilldown.summary.export_ref_count, 1);
    assert.equal(drilldown.summary.memory_ref_count, 1);
    assert.equal(drilldown.summary.memory_writeback_ref_count, 1);
    assert.equal(drilldown.summary.quality_ref_count, 1);
    assert.equal(drilldown.summary.readiness_ref_count, 1);
    assert.equal(drilldown.summary.provider_slo_action_count, 1);
    assert.equal(drilldown.summary.provider_cadence_window_status, 'window_evidence_incomplete');
    assert.equal(drilldown.summary.provider_cadence_window_long_evidence_ready, false);
    assert.equal(drilldown.summary.provider_cadence_window_expected_receipt_count, 7);
    assert.equal(drilldown.summary.provider_cadence_window_observed_receipt_count, 0);
    assert.equal(drilldown.summary.provider_cadence_window_missing_receipt_count, 7);
    assert.equal(drilldown.summary.provider_cadence_window_blocked_repair_receipt_count, 0);
    assert.equal(drilldown.summary.periodic_execution_ref_count, 5);
    assert.equal(drilldown.summary.operator_action_route_count, 13);
    assert.equal(drilldown.summary.operator_executable_route_count, 3);
    assert.equal(drilldown.summary.domain_owned_action_route_count, 2);
    assert.equal(drilldown.summary.functional_privatization_default_watchlist_count, 0);
    assert.equal(drilldown.summary.functional_privatization_semantic_equivalence_review_count, 0);
    assert.equal(drilldown.summary.domain_external_evidence_request_count, 1);
    assert.equal(drilldown.summary.domain_open_evidence_request_count, 0);
    assert.equal(drilldown.summary.domain_recorded_evidence_receipt_request_count, 0);
    assert.equal(drilldown.summary.domain_verified_evidence_receipt_request_count, 1);
    assert.equal(drilldown.summary.domain_external_evidence_receipt_count, 1);
    assert.equal(drilldown.summary.domain_external_verified_evidence_receipt_count, 1);
    assert.equal(drilldown.summary.domain_evidence_gate_count, 1);
    assert.equal(drilldown.summary.domain_remaining_evidence_gate_count, 0);
    assert.equal(drilldown.summary.domain_evidence_gate_receipt_count, 1);
    assert.equal(drilldown.summary.domain_evidence_gate_verified_receipt_count, 1);
    assert.equal(drilldown.summary.domain_opl_replacement_expectation_count, 1);
    assert.equal(drilldown.summary.domain_replacement_surface_available_count, 1);
    assert.equal(drilldown.summary.domain_remaining_bridge_module_count, 1);
    assert.equal(drilldown.summary.domain_legacy_cleanup_plan_count, 1);
    assert.equal(drilldown.summary.domain_legacy_cleanup_ready_plan_count, 1);
    assert.equal(drilldown.summary.domain_legacy_cleanup_blocked_plan_count, 0);
    assert.equal(drilldown.summary.domain_legacy_cleanup_action_count, 1);
    assert.equal(drilldown.summary.domain_legacy_cleanup_opl_apply_ready_count, 1);
    assert.equal(drilldown.summary.domain_legacy_cleanup_delete_ready_count, 0);

    assert.equal(drilldown.route_graph_refs.surface_kind, 'opl_app_drilldown_route_graph_refs');
    assert.equal(drilldown.route_graph_refs.refs[0].ref, `/stage_attempt_workbench/attempts/${attemptId}/route_decision_graph`);
    assert.equal(drilldown.review_repair_queue_refs.items[0].repair_target, `opl family-runtime attempt query ${attemptId}`);
    assert.equal(drilldown.artifact_gallery_refs.content_policy, 'locator_only_no_artifact_content');
    assert.equal(drilldown.artifact_gallery_refs.refs.length, 3);
    assert.deepEqual(drilldown.package_export_lifecycle_refs.package_refs, ['package:submission-minimal']);
    assert.deepEqual(drilldown.package_export_lifecycle_refs.export_refs, ['export:current-package']);
    assert.deepEqual(drilldown.memory_writeback_refs.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(drilldown.memory_writeback_refs.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.deepEqual(drilldown.quality_readiness_refs.quality_refs, ['publication_eval/latest.json']);
    assert.deepEqual(drilldown.quality_readiness_refs.readiness_refs, ['controller_decisions/latest.json']);
    assert.equal(
      drilldown.provider_slo_operator_action_refs.refs[0].ref,
      'opl family-runtime residency proof --provider temporal --production',
    );
    assert.equal(drilldown.provider_slo_operator_action_refs.refs[0].execution_owner, 'operator_or_infrastructure');
    assert.equal(drilldown.periodic_execution_refs.surface_kind, 'opl_app_drilldown_periodic_execution_refs');
    assert.equal(drilldown.periodic_execution_refs.schedule_id, 'opl-family-runtime-provider-scheduler');
    assert.equal(
      drilldown.periodic_execution_refs.refs.some(
        (ref: { role: string; ref: string }) =>
          ref.role === 'scheduler_tick_provider_slo_and_queue_dispatch'
          && ref.ref === 'opl family-runtime scheduler tick --provider temporal',
      ),
      true,
    );
    assert.equal(
      drilldown.domain_evidence_request_refs.replacement_expectations.some(
        (ref: { ref: string; coverage: { coverage_status: string } }) =>
          ref.ref === 'artifact_package_lifecycle_shell'
          && ref.coverage.coverage_status === 'opl_replacement_surface_available',
      ),
      true,
    );
    assert.equal(
      drilldown.periodic_execution_refs.authority_boundary.can_write_domain_truth,
      false,
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.surface_kind,
      'opl_app_drilldown_domain_legacy_cleanup_plan_refs',
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].plan_status,
      'ready',
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].domain_delete_can_execute,
      false,
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].agent_id,
      'mas',
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].command_domain_id,
      'medautoscience',
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].apply_command,
      'opl agents legacy-cleanup apply --domain medautoscience --mode apply --source-ref opl://agents/med-autoscience/legacy-cleanup-plan',
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].verify_command,
      'opl agents legacy-cleanup apply --domain medautoscience --mode verify --source-ref opl://agents/med-autoscience/legacy-cleanup-plan',
    );
    assert.deepEqual(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].action_refs[0].replacement_parity_refs,
      [
        'proof:mas:replacement-parity',
        'proof:mas:direct-skill-parity',
        'proof:mas:opl-hosted-parity',
      ],
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.authority_boundary.can_move_or_delete_domain_repo_files,
      false,
    );

    const domainRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_kind: string }) => ref.action_kind === 'domain_sidecar_repair_command',
    );
    assert.equal(domainRoute.owner, 'domain');
    assert.equal(domainRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(domainRoute.execution_surface, 'opl runtime action execute');
    assert.equal(domainRoute.can_execute, false);
    assert.equal(drilldown.app_execution_bridge.surface_kind, 'opl_app_operator_execution_bridge');
    assert.equal(drilldown.app_execution_bridge.action_execution_surface, 'opl runtime action execute');
    assert.equal(
      drilldown.app_execution_bridge.summary.safe_action_route_count,
      drilldown.summary.operator_executable_route_count,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === domainRoute.action_id && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.route_submission_policy.domain_routes_are_queued_for_approval,
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.route_submission_policy.direct_domain_action_execution_allowed,
      false,
    );
    assert.equal(drilldown.app_execution_bridge.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      drilldown.operator_action_routing_refs.refs.some(
        (ref: { owner: string; route_target_kind: string }) =>
          ref.owner === 'opl' && ref.route_target_kind === 'app_surface',
      ),
      true,
    );
    assert.equal(drilldown.functional_privatization_audit_summary.total_module_count >= 0, true);
    assert.equal(typeof drilldown.functional_privatization_audit_summary.by_migration_class, 'object');
    assert.equal(
      drilldown.functional_privatization_audit_summary.by_migration_class.temporary_migration_bridge_count >= 0,
      true,
    );
    assert.equal(
      drilldown.functional_privatization_audit_summary.by_migration_class.domain_authority_count >= 0,
      true,
    );
    assert.equal(
      drilldown.functional_privatization_audit_summary.by_migration_class.refs_only_domain_adapter_count >= 0,
      true,
    );
    assert.equal(drilldown.functional_privatization_audit_summary.default_watchlist_count, 0);
    assert.equal(drilldown.functional_privatization_audit_summary.semantic_equivalence_review_count, 0);
    assert.equal(
      drilldown.domain_projection_refs.refs.some(
        (ref: { ref: string }) => ref.ref === 'mas://runtime/control/latest.json',
      ),
      true,
    );
    assert.equal(
      drilldown.domain_evidence_request_refs.external_requests.some(
        (ref: {
          request_id: string;
          required_return_shapes: string[];
          external_receipt_status: string;
        }) =>
          ref.request_id === 'app_workbench_package_ref_consumption'
          && ref.external_receipt_status === 'verified'
          && ref.required_return_shapes.includes('domain_owner_receipt'),
      ),
      true,
    );
    assert.equal(
      drilldown.domain_evidence_request_refs.external_receipts.some(
        (ref: { ref: string; receipt_status: string; domain_receipt_refs: string[] }) =>
          ref.ref === 'opl://external-evidence/medautoscience/app_workbench_package_ref_consumption'
          && ref.receipt_status === 'verified'
          && ref.domain_receipt_refs.includes('mas://receipts/package-lifecycle/latest.json'),
      ),
      true,
    );
    assert.equal(
      drilldown.domain_evidence_request_refs.evidence_gates.some(
        (ref: { ref: string }) => ref.ref === 'real_package_lifecycle_receipt',
      ),
      false,
    );
    assert.equal(
      drilldown.domain_evidence_request_refs.evidence_gate_receipts.some(
        (ref: {
          ref: string;
          receipt_status: string;
          domain_receipt_refs: string[];
        }) =>
          ref.ref === 'opl://external-evidence/medautoscience/real_package_lifecycle_receipt'
          && ref.receipt_status === 'verified'
          && ref.domain_receipt_refs.includes('mas://receipts/package-lifecycle/latest.json'),
      ),
      true,
    );
    assert.equal(
      drilldown.domain_evidence_request_refs.replacement_expectations.some(
        (ref: { ref: string; state: string }) =>
          ref.ref === 'artifact_package_lifecycle_shell'
          && ref.state === 'external_replacement_contract_expected',
      ),
      true,
    );
    assert.equal(
      drilldown.domain_evidence_request_refs.remaining_bridge_modules.some(
        (ref: { ref: string }) => ref.ref === 'package_lifecycle_adapter',
      ),
      true,
    );
    assert.equal(
      snapshot.source_refs.some((ref: { role: string }) => ref.role === 'app_operator_drilldown'),
      true,
    );
    assert.equal(
      snapshot.source_refs.some((ref: { role: string }) => ref.role === 'domain_evidence_request_refs'),
      true,
    );
    assert.equal(
      snapshot.source_refs.some((ref: { role: string }) => ref.role === 'domain_legacy_cleanup_plan_refs'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime app-operator-drilldown exposes the App read model without raw snapshot fan-out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-direct-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(output.runtime_tray_snapshot, undefined);
    assert.equal(
      output.app_operator_drilldown.surface_kind,
      'opl_app_operator_drilldown_read_model',
    );
    assert.equal(output.app_operator_drilldown.consumer, 'one_person_lab_app_operator_workbench');
    assert.equal(output.app_operator_drilldown.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_operator_drilldown.authority_boundary.can_read_memory_body, false);
    assert.equal(output.app_operator_drilldown.authority_boundary.can_read_artifact_body, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime app-operator-drilldown reconciles MAS refs-only payload with OPL lifecycle ledger refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-mas-lifecycle-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);

  masManifest.runtime_inventory = {
    ...((masManifest.runtime_inventory as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_runtime_inventory_projection',
      source_refs: ['mas://runtime/inventory/latest.json'],
      freshness: {
        status: 'current',
        source_ref: 'mas://runtime/freshness/latest.json',
      },
    },
  };
  masManifest.progress_projection = {
    ...((masManifest.progress_projection as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_opl_runtime_workbench_projection',
      source_refs: ['mas://runtime/workbench/latest.json'],
      owner_receipt_refs: ['mas-owner-receipt:projection-current'],
      typed_blocker_refs: ['mas-blocker:projection-owner-chain-soak'],
      freshness: {
        status: 'current',
        source_ref: 'mas://runtime/workbench/freshness.json',
      },
    },
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'apply',
      '--domain',
      'medautoscience',
      '--source-ref',
      'mas://lifecycle/cleanup-plan',
      '--manifest-ref',
      'manifest:mas:lifecycle',
      '--action',
      JSON.stringify({
        action_id: 'record-opl-cleanup-index',
        action_kind: 'cleanup',
        owner_scope: 'opl_owned_index_ref',
        target_ref: 'opl://family-runtime/index/mas-run-42',
        restore_proof_refs: ['restore-proof:mas-index'],
      }),
      '--action',
      JSON.stringify({
        action_id: 'record-domain-artifact-receipt-ref',
        action_kind: 'artifact_receipt_index',
        owner_scope: 'domain_artifact_mutation_receipt_ref',
        target_ref: 'mas://artifact/current-package.zip',
        restore_proof_refs: ['restore-proof:mas-package'],
        domain_artifact_mutation_receipt_refs: ['mas-owner-receipt:artifact-cleanup'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        runtime_root: '/tmp/mas/runtime',
        artifact_root: '/tmp/mas/artifacts',
        source_refs: ['source:dataset', 'mas://source/evidence-ledger'],
        material_refs: ['material:table1'],
        restore_refs: ['restore:study-run'],
        controlled_apply_request: {
          action_kind: 'mas_guarded_apply',
          owner_receipt_refs: ['mas-owner-receipt:guarded-apply'],
          no_regression_evidence_refs: ['mas-no-regression:package'],
        },
        lifecycle_apply_requests: [
          {
            action_id: 'mas-opl-ledger-cleanup',
            action_kind: 'cleanup',
            target_ref: 'opl-ledger:mas-run',
            authority_owner: 'opl_framework',
            owner_scope: 'opl_owned_ledger',
          },
          {
            action_id: 'mas-domain-package-cleanup',
            action_kind: 'cleanup',
            target_ref: 'artifact:mas-package',
            authority_owner: 'med-autoscience',
            owner_scope: 'domain_owned_artifact',
            restore_ref: 'restore:study-run',
          },
        ],
        transition_bridge: {
          transition_id: 'mas-publication-currentness',
          transition_status: 'blocked',
          current_state: 'draft_ready',
          next_state: 'publication_quality_review',
          evidence: {
            owner_receipt_refs: ['mas-owner-receipt:transition'],
            typed_blocker_refs: ['mas-blocker:publication-currentness'],
            typed_blockers: [
              {
                blocker_id: 'publication_currentness_not_proven',
                blocker_kind: 'freshness',
                required_owner: 'med-autoscience',
              },
            ],
          },
        },
      }),
      '--source-fingerprint',
      'sha256:mas-drilldown-source',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:write-closeout'],
        consumed_refs: ['artifact:table', 'artifact:figure'],
        consumed_memory_refs: ['memory:route-policy'],
        writeback_receipt_refs: ['memory-writeback:receipt-1'],
        rejected_writes: [{ target: 'memory', reason: 'domain_memory_body_write_forbidden' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          owner_receipt_refs: ['mas-owner-receipt:route-impact'],
          typed_blocker_refs: ['mas-blocker:stale-review'],
          typed_blockers: [
            {
              blocker_id: 'ai_reviewer_currentness_stale',
              blocker_kind: 'freshness',
              required_owner: 'med-autoscience',
            },
          ],
          quality_refs: ['publication_eval/latest.json'],
          readiness_refs: ['controller_decisions/latest.json'],
          repair_command: 'medautosci sidecar dispatch --task <task.json> --format json',
          direct_skill_ref: 'skill:mas/review',
          package_refs: ['package:submission-minimal'],
          export_refs: ['export:current-package'],
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const drilldown = output.runtime_tray_snapshot.app_operator_drilldown;

    assert.equal(drilldown.authority_boundary.can_write_domain_truth, false);
    assert.equal(drilldown.authority_boundary.can_read_memory_body, false);
    assert.equal(drilldown.authority_boundary.can_read_artifact_body, false);
    assert.equal(drilldown.summary.owner_receipt_ref_count, 4);
    assert.equal(drilldown.summary.typed_blocker_count, 3);
    assert.equal(drilldown.summary.lifecycle_index_ref_count, 2);
    assert.equal(drilldown.summary.lifecycle_restore_proof_ref_count, 2);
    assert.equal(drilldown.summary.lifecycle_reconcile_missing_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_reconcile_extra_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_reconcile_stale_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_delete_can_execute, false);
    assert.equal(drilldown.summary.lifecycle_opl_cleanup_apply_can_execute, true);
    assert.equal(drilldown.summary.safe_action_ref_count >= 2, true);
    assert.equal(drilldown.summary.freshness_signal_count >= 1, true);

    assert.equal(
      drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:guarded-apply'
      ),
      true,
    );
    assert.equal(
      drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:transition'
      ),
      true,
    );
    assert.equal(
      drilldown.typed_blocker_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-blocker:publication-currentness'
      ),
      true,
    );
    assert.equal(
      drilldown.typed_blocker_refs.blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'domain_owned_lifecycle_receipt_required'
      ),
      true,
    );
    assert.equal(
      drilldown.freshness_refs.refs.some((ref: { source_fingerprint: string }) =>
        ref.source_fingerprint === 'sha256:mas-drilldown-source'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.source_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'source:dataset'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.artifact_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'artifact:table'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.memory_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'memory:route-policy'
      ),
      true,
    );
    assert.equal(
      drilldown.safe_action_refs.refs.some((ref: { role: string; ref: string }) =>
        ref.role === 'lifecycle_cleanup_receipt_ref'
          && ref.ref.startsWith('opl://family-runtime/lifecycle-apply/medautoscience')
      ),
      true,
    );
    assert.deepEqual(drilldown.lifecycle_ledger_refs.restore_proof_refs, [
      'restore-proof:mas-index',
      'restore-proof:mas-package',
    ]);
    assert.equal(drilldown.lifecycle_ledger_refs.reconcile_projection.status, 'reconciled');
    assert.equal(
      drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.can_execute_delete,
      false,
    );
    assert.equal(
      drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.opl_cleanup_apply_ready,
      true,
    );
    assert.equal(drilldown.lifecycle_ledger_refs.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute routes domain actions through the OPL typed queue instead of direct domain execution', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-domain-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts"}',
      '--task',
      'task-action-execute',
      '--source-fingerprint',
      'sha256:action-execute-domain',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:write-closeout"],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"repair_command":"medautosci sidecar dispatch --task <task.json> --format json"}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `action:${attemptId}:domain-repair-command:0`,
      '--payload',
      '{"reason":"operator_selected"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.surface_kind, 'opl_runtime_operator_action_execution');
    assert.equal(execution.execution.execution_kind, 'domain_action_typed_queue_handoff');
    assert.equal(execution.execution.execution_status, 'queued');
    assert.equal(execution.execution.approval_policy, 'queued_waiting_approval');
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
    assert.equal(execution.route.execution_policy, 'opl_safe_action_shell');
    assert.equal(execution.route.execution_surface, 'opl runtime action execute');
    assert.equal(execution.execution.result.family_runtime_enqueue.task.status, 'waiting_approval');
    assert.equal(
      execution.execution.result.family_runtime_enqueue.task.payload.command_or_surface_ref,
      'medautosci sidecar dispatch --task <task.json> --format json',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute can execute OPL-owned attempt query routes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-query-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'draft',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
      '--source-fingerprint',
      'sha256:action-execute-query',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `action:${attemptId}:attempt-query`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_internal');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt_query.stage_attempt_query.attempt.stage_attempt_id,
      attemptId,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function insertProviderProof(stateRoot: string) {
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_app_drilldown_provider_proof',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    ${JSON.stringify(new Date().toISOString())}
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}
