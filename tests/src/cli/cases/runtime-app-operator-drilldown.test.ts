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
import { insertProviderProof } from './runtime-app-operator-drilldown-helpers.ts';

test('runtime snapshot exposes App operator drilldown as refs-only owner-aware read model', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_stage_control_plane',
    target_domain_id: 'medautoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'write',
        stage_kind: 'creation',
        title: 'Write',
        summary: 'Write from explicit refs.',
        goal: 'Produce draft refs under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['draft_ready'],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:write.owner_receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:write/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:dataset', role: 'source_scope' }],
          cohort_query_refs: [{ ref_kind: 'query_ref', ref: 'cohort:write/current', role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:write/current', role: 'trigger' }],
          metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:write/currentness', role: 'metric' }],
          dashboard_metric_refs: [],
          artifact_scope_refs: [{ ref_kind: 'artifact_ref', ref: 'artifact:table', role: 'artifact_scope' }],
          workspace_scope_refs: [{ ref_kind: 'workspace_ref', ref: 'workspace:/tmp/mas', role: 'workspace_scope' }],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:write.owner_receipt_recorded'],
          owner_receipt_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['receipt:write-closeout'],
          can_write_domain_truth: false,
          can_authorize_quality_verdict: false,
        },
      },
      {
        stage_id: 'review',
        stage_kind: 'review',
        title: 'Review',
        summary: 'Review from draft refs.',
        goal: 'Return review refs under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_ready'],
          boundary_assumptions: ['reviewer_judgment_is_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:review', role: 'source_scope' }],
          cohort_query_refs: [{ ref_kind: 'query_ref', ref: 'cohort:review/current', role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:review/current', role: 'trigger' }],
          metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'metric' }],
          dashboard_metric_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'human_gate',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          owner_receipt_required: true,
          human_gate_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['mas:review-receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };

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
    assert.equal(drilldown.summary.operator_action_route_count, 20);
    assert.equal(drilldown.summary.operator_executable_route_count, 10);
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
    assert.equal(drilldown.summary.domain_open_evidence_gate_request_count, 0);
    assert.equal(drilldown.summary.domain_recorded_evidence_gate_request_count, 0);
    assert.equal(drilldown.summary.domain_verified_evidence_gate_request_count, 1);
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
    assert.equal(drilldown.summary.stage_production_evidence_domain_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_observed_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_missing_caller_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_missing_expected_receipt_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_expected_receipt_declared_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_expected_receipt_observed_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_expected_receipt_unobserved_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_missing_executor_binding_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_executor_binding_observed_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_missing_monitor_freshness_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_monitor_declared_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_monitor_freshness_observed_stage_count, 0);
    assert.equal(drilldown.summary.stage_production_evidence_monitor_freshness_unobserved_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_attempt_request_route_count, 1);

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
    const schedulerStatusRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'provider-scheduler:temporal:status',
    );
    assert.equal(schedulerStatusRoute.owner, 'opl');
    assert.equal(schedulerStatusRoute.route_target_kind, 'opl_cli');
    assert.equal(schedulerStatusRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(schedulerStatusRoute.execution_surface, 'opl runtime action execute');
    assert.deepEqual(schedulerStatusRoute.opl_cli_args, [
      'scheduler',
      'status',
      '--provider',
      'temporal',
    ]);
    const schedulerTickRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'provider-scheduler:temporal:tick',
    );
    assert.equal(schedulerTickRoute.action_kind, 'provider_scheduler_tick');
    assert.equal(schedulerTickRoute.authority_boundary.can_install_domain_daemon, false);
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
    const legacyCleanupApplyRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'legacy-cleanup:medautoscience:apply',
    );
    assert.equal(legacyCleanupApplyRoute.owner, 'opl');
    assert.equal(legacyCleanupApplyRoute.route_target_kind, 'opl_cli');
    assert.equal(legacyCleanupApplyRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(legacyCleanupApplyRoute.execution_surface, 'opl runtime action execute');
    assert.deepEqual(legacyCleanupApplyRoute.opl_cli_args, [
      'agents',
      'legacy-cleanup',
      'apply',
      '--domain',
      'medautoscience',
      '--mode',
      'apply',
      '--source-ref',
      'opl://agents/med-autoscience/legacy-cleanup-plan',
    ]);
    assert.equal(legacyCleanupApplyRoute.authority_boundary.can_move_or_delete_domain_repo_files, false);
    const legacyCleanupVerifyRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'legacy-cleanup:medautoscience:verify',
    );
    assert.equal(legacyCleanupVerifyRoute.action_kind, 'legacy_cleanup_verify');
    assert.equal(
      drilldown.stage_production_evidence.surface_kind,
      'opl_app_drilldown_stage_production_evidence',
    );
    assert.equal(drilldown.stage_production_evidence.summary.stage_count, 2);
    assert.equal(drilldown.stage_production_evidence.summary.observed_stage_count, 1);
    const writeProductionEvidence = drilldown.stage_production_evidence.stages.find(
      (stage: { stage_id: string }) => stage.stage_id === 'write',
    );
    assert.equal(writeProductionEvidence.production_evidence_status, 'production_caller_evidence_observed');
    assert.deepEqual(writeProductionEvidence.selected_executor_kinds, ['codex_cli']);
    assert.equal(writeProductionEvidence.expected_receipt_refs.includes('receipt:write-closeout'), true);
    assert.equal(writeProductionEvidence.expected_receipt_declared, true);
    assert.deepEqual(writeProductionEvidence.observed_expected_receipt_refs, ['receipt:write-closeout']);
    assert.deepEqual(writeProductionEvidence.unobserved_expected_receipt_refs, ['owner_receipt:write']);
    assert.equal(writeProductionEvidence.observed_evidence_refs.includes('receipt:write-closeout'), true);
    assert.equal(writeProductionEvidence.observed_evidence_refs.includes('source:dataset'), true);
    assert.deepEqual(writeProductionEvidence.monitor_freshness_refs, []);
    assert.deepEqual(writeProductionEvidence.unobserved_monitor_refs, ['metric:write/currentness']);
    assert.equal(
      writeProductionEvidence.missing_production_evidence.includes('production_caller_attempt_not_observed'),
      false,
    );
    assert.equal(
      writeProductionEvidence.authority_boundary.can_authorize_domain_ready,
      false,
    );
    const reviewProductionEvidence = drilldown.stage_production_evidence.stages.find(
      (stage: { stage_id: string }) => stage.stage_id === 'review',
    );
    assert.equal(
      reviewProductionEvidence.production_evidence_status,
      'stage_pack_ready_waiting_for_production_caller',
    );
    assert.equal(
      reviewProductionEvidence.missing_production_evidence.includes('production_caller_attempt_not_observed'),
      true,
    );
    assert.equal(reviewProductionEvidence.expected_receipt_declared, true);
    assert.deepEqual(reviewProductionEvidence.observed_expected_receipt_refs, []);
    assert.deepEqual(
      reviewProductionEvidence.unobserved_expected_receipt_refs,
      ['mas:review-receipt', 'owner_receipt:review'],
    );
    assert.deepEqual(reviewProductionEvidence.monitor_freshness_refs, []);
    assert.deepEqual(reviewProductionEvidence.unobserved_monitor_refs, ['metric:review/currentness']);

    const stageProductionAttemptRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_kind: string; stage_id: string }) =>
        ref.action_kind === 'stage_production_attempt_request'
        && ref.stage_id === 'review',
    );
    assert.equal(stageProductionAttemptRoute.owner, 'opl');
    assert.equal(stageProductionAttemptRoute.route_target_kind, 'opl_cli');
    assert.equal(stageProductionAttemptRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(stageProductionAttemptRoute.execution_surface, 'opl runtime action execute');
    assert.equal(stageProductionAttemptRoute.domain_id, 'medautoscience');
    assert.equal(stageProductionAttemptRoute.ref.includes('opl family-runtime attempt create'), true);
    assert.equal(stageProductionAttemptRoute.ref.includes('--domain medautoscience'), true);
    assert.equal(stageProductionAttemptRoute.ref.includes('--stage review'), true);
    assert.equal(stageProductionAttemptRoute.ref.includes('--provider temporal'), true);
    assert.equal(stageProductionAttemptRoute.ref.includes('--executor-kind codex_cli'), true);
    assert.equal(stageProductionAttemptRoute.ref.includes('--require-stage-admission'), true);
    assert.deepEqual(stageProductionAttemptRoute.opl_cli_args.slice(0, 8), [
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
    ]);
    assert.deepEqual(
      stageProductionAttemptRoute.missing_production_evidence,
      reviewProductionEvidence.missing_production_evidence,
    );
    assert.deepEqual(
      stageProductionAttemptRoute.expected_receipt_refs,
      reviewProductionEvidence.expected_receipt_refs,
    );
    assert.equal(stageProductionAttemptRoute.authority_boundary.can_write_domain_truth, false);

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
    const bridgeStageProductionAttemptRoute = drilldown.app_execution_bridge.safe_action_routes.find(
      (ref: { action_id: string }) => ref.action_id === stageProductionAttemptRoute.action_id,
    );
    assert.equal(bridgeStageProductionAttemptRoute.can_submit_to_safe_action_shell, true);
    assert.equal(
      bridgeStageProductionAttemptRoute.action_ref.includes('opl family-runtime attempt create'),
      true,
    );
    assert.deepEqual(
      bridgeStageProductionAttemptRoute.opl_cli_args,
      stageProductionAttemptRoute.opl_cli_args,
    );
    assert.deepEqual(
      bridgeStageProductionAttemptRoute.missing_production_evidence,
      stageProductionAttemptRoute.missing_production_evidence,
    );
    assert.deepEqual(
      bridgeStageProductionAttemptRoute.expected_receipt_refs,
      stageProductionAttemptRoute.expected_receipt_refs,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === schedulerStatusRoute.action_id
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === legacyCleanupApplyRoute.action_id
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.route_submission_policy.domain_routes_are_queued_for_approval,
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.route_submission_policy.opl_cli_routes_can_create_stage_attempt_requests,
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
          gate_id: string;
          request_id: string;
          request_pack_id: string;
          receipt_status: string;
          domain_receipt_refs: string[];
        }) =>
          ref.ref === 'opl://external-evidence/medautoscience/real_package_lifecycle_receipt'
          && ref.gate_id === 'real_package_lifecycle_receipt'
          && ref.request_id === 'real_package_lifecycle_receipt'
          && ref.request_pack_id === 'medautoscience.evidence_gate_projection'
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
        (ref: { ref: string; module_id: string }) =>
          ref.ref === 'package_lifecycle_adapter'
          && ref.module_id === 'package_lifecycle_adapter',
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
