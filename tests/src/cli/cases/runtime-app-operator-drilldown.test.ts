import net from 'node:net';

import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  spawn,
  test,
} from '../helpers.ts';
import {
  assertEvidenceTailAndDomainRefs,
  buildMasAppOperatorDrilldownFixtureManifest,
  createOmaContractFixture,
  insertProviderProof,
} from './runtime-app-operator-drilldown-helpers.ts';

test('runtime snapshot exposes App operator drilldown as refs-only owner-aware read model', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const omaRepoDir = createOmaContractFixture(fixtureRoot);
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const workerProbe = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  workerProbe.unref();
  const testEnv = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_META_AGENT_REPO_DIR: omaRepoDir,
    OPL_TEMPORAL_ADDRESS: temporalAddress,
    OPL_TEMPORAL_NAMESPACE: 'opl-app-drilldown-worker-stale',
    OPL_TEMPORAL_TASK_QUEUE: 'opl-app-drilldown-worker-stale',
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:app-drilldown-current-worker',
  };
  const masManifest = buildMasAppOperatorDrilldownFixtureManifest();
  try {
    assert.equal(typeof workerProbe.pid, 'number');
    fs.mkdirSync(path.join(stateRoot, 'family-runtime'), { recursive: true });
    fs.writeFileSync(path.join(stateRoot, 'family-runtime', 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: workerProbe.pid,
      address: temporalAddress,
      namespace: 'opl-app-drilldown-worker-stale',
      task_queue: 'opl-app-drilldown-worker-stale',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:app-drilldown-old-worker',
    }, null, 2)}\n`);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], testEnv);
    runCli(['family-runtime', 'events', 'export'], testEnv);
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
      '--memory-writeback-receipt-ref',
      'mas://memory/writeback/receipt.json',
      '--artifact-mutation-receipt-ref',
      'mas://artifacts/mutation/receipt.json',
      '--package-lifecycle-receipt-ref',
      'mas://receipts/package-lifecycle/latest.json',
      '--lifecycle-receipt-ref',
      'mas://lifecycle/cleanup/receipt.json',
      '--restore-proof-ref',
      'mas://restore/proof/latest.json',
    ], testEnv);
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
    ], testEnv);
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
    ], testEnv);
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
    ], testEnv);

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
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts","dispatch_ref":"mas-domain-dispatch:dm-cvd:app-drilldown","source_refs":["source:dataset"],"missing_material_refs":["material:irb"],"restore_refs":["restore:study-run"]}',
      '--task',
      'task-app-drilldown',
      '--checkpoint-ref',
      'checkpoint:write-start',
      '--source-fingerprint',
      'sha256:app-drilldown-source',
    ], testEnv);
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:write-closeout"],"consumed_refs":["artifact:table"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair","quality_refs":["publication_eval/latest.json"],"readiness_refs":["controller_decisions/latest.json"],"slo_ref":"slo:write-currentness","breached_slo_ids":["review_currentness"],"repair_command":"medautosci domain-handler dispatch --task <task.json> --format json","package_refs":["package:submission-minimal"],"export_refs":["export:current-package"],"gap_report_refs":["gap:package-readiness"],"handoff_refs":["handoff:manual-submission"]}}',
    ], testEnv);

    const output = runCli(['runtime', 'snapshot'], testEnv);
    const snapshot = output.runtime_tray_snapshot;
    const snapshotDrilldown = snapshot.app_operator_drilldown;
    assert.equal(snapshotDrilldown.detail_level, 'summary');
    assert.equal(
      snapshotDrilldown.projection_detail_policy,
      'attention_first_default_full_refs_via_explicit_drilldown',
    );
    assert.equal(snapshotDrilldown.route_graph_refs, undefined);
    assert.equal(snapshotDrilldown.operator_action_routing_refs, undefined);
    assert.equal(
      snapshotDrilldown.attention_first_payload.next_safe_action.submit_via,
      'opl runtime action execute',
    );
    assert.equal(
      snapshotDrilldown.attention_first_payload.provider_health.authority_boundary.can_write_domain_truth,
      false,
    );

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], testEnv);
    const drilldown = fullOutput.app_operator_drilldown;

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
    assert.equal(drilldown.summary.runtime_visualization_node_count > 0, true);
    assert.equal(drilldown.summary.runtime_visualization_edge_count > 0, true);
    assert.equal(drilldown.summary.runtime_visualization_timeline_event_count > 0, true);
    assert.equal(drilldown.summary.runtime_visualization_paper_route_lens_ref_count, 1);
    assert.equal(drilldown.summary.provider_slo_action_count, 1);
    assert.equal(drilldown.summary.provider_cadence_window_status, 'window_evidence_incomplete');
    assert.equal(drilldown.summary.provider_cadence_window_long_evidence_ready, false);
    assert.equal(drilldown.summary.provider_cadence_window_expected_receipt_count, 7);
    assert.equal(drilldown.summary.provider_cadence_window_observed_receipt_count, 0);
    assert.equal(drilldown.summary.provider_cadence_window_missing_receipt_count, 7);
    assert.equal(drilldown.summary.provider_cadence_window_blocked_repair_receipt_count, 0);
    assert.equal(drilldown.summary.periodic_execution_ref_count, 5);
    assert.equal(
      drilldown.summary.operator_action_route_count,
      drilldown.operator_action_routing_refs.refs.length,
    );
    assert.equal(drilldown.summary.operator_action_route_count >= 26, true);
    assert.equal(
      drilldown.summary.operator_action_route_count,
      30,
    );
    assert.equal(
      drilldown.summary.operator_executable_route_count,
      drilldown.app_execution_bridge.summary.safe_action_route_count,
    );
    assert.equal(drilldown.summary.operator_executable_route_count >= 16, true);
    assert.equal(
      drilldown.summary.operator_executable_route_count,
      20,
    );
    assert.equal(drilldown.summary.stage_production_evidence_receipt_action_route_count, 2);
    assert.equal(
      drilldown.summary.stage_production_evidence_receipt_record_requires_domain_or_app_payload_count,
      2,
    );
    assert.equal(
      drilldown.summary.stage_production_evidence_receipt_record_payload_template_count,
      2,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      1,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_record_payload_template_count, 1);
    assert.equal(drilldown.summary.oma_production_consumption_action_route_count, 1);
    assert.equal(drilldown.summary.codex_app_runtime_evidence_action_route_count, 1);
    assert.equal(drilldown.summary.codex_app_runtime_evidence_record_action_route_count, 1);
    assert.equal(drilldown.summary.codex_app_runtime_evidence_verify_action_route_count, 0);
    assert.equal(drilldown.summary.codex_app_runtime_evidence_open_gate_count, 1);
    assert.equal(drilldown.summary.domain_owned_action_route_count, 2);
    assert.equal(drilldown.summary.functional_privatization_default_watchlist_count, 0);
    assert.equal(drilldown.summary.functional_privatization_semantic_equivalence_review_count, 0);
    assert.equal(drilldown.summary.domain_external_evidence_request_count, 1);
    assert.equal(drilldown.summary.domain_open_evidence_request_count, 0);
    assert.equal(drilldown.summary.domain_recorded_evidence_receipt_request_count, 0);
    assert.equal(drilldown.summary.domain_verified_evidence_receipt_request_count, 1);
    assert.equal(drilldown.summary.domain_external_evidence_receipt_count, 1);
    assert.equal(drilldown.summary.domain_external_verified_evidence_receipt_count, 1);
    assert.equal(drilldown.summary.domain_external_verified_memory_writeback_receipt_ref_count, 1);
    assert.equal(drilldown.summary.domain_external_verified_artifact_mutation_receipt_ref_count, 1);
    assert.equal(drilldown.summary.domain_external_verified_package_lifecycle_receipt_ref_count, 1);
    assert.equal(drilldown.summary.domain_external_verified_lifecycle_receipt_ref_count, 1);
    assert.equal(drilldown.summary.domain_external_verified_restore_proof_ref_count, 1);
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
    assert.equal(drilldown.summary.domain_legacy_cleanup_opl_cleanup_ledger_ready_count, 1);
    assert.equal(
      drilldown.summary.domain_legacy_cleanup_domain_physical_delete_requires_owner_receipt_count,
      1,
    );
    assert.equal(drilldown.summary.domain_legacy_cleanup_domain_physical_delete_can_execute_count, 0);
    assert.equal(drilldown.summary.domain_legacy_cleanup_delete_ready_count, undefined);
    assert.equal(drilldown.summary.stage_production_evidence_domain_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_observed_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_missing_caller_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_missing_expected_receipt_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_expected_receipt_declared_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_expected_receipt_observed_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_expected_receipt_unobserved_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_missing_executor_binding_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_executor_binding_observed_stage_count, 1);
    assert.equal(drilldown.summary.stage_production_evidence_missing_monitor_freshness_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_monitor_declared_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_evidence_monitor_freshness_observed_stage_count, 0);
    assert.equal(drilldown.summary.stage_production_evidence_monitor_freshness_unobserved_stage_count, 2);
    assert.equal(drilldown.summary.stage_production_attempt_request_route_count, 1);
    assert.equal(drilldown.summary.app_operator_production_evidence_tail_item_count >= 1, true);
    assert.equal(drilldown.summary.app_operator_production_evidence_tail_open_item_count >= 1, true);
    assert.equal(drilldown.summary.evidence_envelope_count > 0, true);
    assert.equal(drilldown.summary.evidence_envelope_open_count, 1);
    assert.equal(
      drilldown.summary.evidence_envelope_open_count
        + drilldown.summary.evidence_envelope_closed_count
        + drilldown.summary.evidence_envelope_blocked_count,
      drilldown.summary.evidence_envelope_count,
    );
    assert.equal(drilldown.summary.evidence_envelope_blocked_count >= 0, true);
    assert.equal(drilldown.summary.evidence_envelope_domain_ready_claim_count, 0);
    assert.equal(drilldown.summary.evidence_envelope_production_ready_claim_count, 0);
    assert.equal(drilldown.summary.evidence_envelope_artifact_authority_claim_count, 0);
    assert.equal(Object.hasOwn(drilldown.summary, 'deprecated_alias_metadata'), false);

    assert.equal(drilldown.route_graph_refs.surface_kind, 'opl_app_drilldown_route_graph_refs');
    assert.equal(drilldown.route_graph_refs.refs[0].ref, `/stage_attempt_workbench/attempts/${attemptId}/route_decision_graph`);
    assert.equal(
      drilldown.runtime_visualization_projection.surface_kind,
      'opl_app_runtime_visualization_projection',
    );
    assert.equal(
      drilldown.runtime_visualization_projection.projection_policy,
      'refs_only_no_domain_truth_memory_body_artifact_body_or_verdict',
    );
    assert.equal(
      drilldown.runtime_visualization_projection.graph.nodes.some(
        (node: { node_kind: string; stage_attempt_id: string }) =>
          node.node_kind === 'stage_attempt' && node.stage_attempt_id === attemptId,
      ),
      true,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.graph.edges.some(
        (edge: { edge_kind: string; stage_attempt_id: string }) =>
          edge.edge_kind === 'attempt_has_route_graph' && edge.stage_attempt_id === attemptId,
      ),
      true,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.timeline.events.some(
        (event: { event_kind: string; stage_attempt_id: string }) =>
          event.event_kind === 'stage_attempt_status' && event.stage_attempt_id === attemptId,
      ),
      true,
    );
    assert.deepEqual(
      drilldown.runtime_visualization_projection.research_lens.paper_route_lens_refs.map(
        (ref: { ref: string }) => ref.ref,
      ),
      ['mas://studies/dm-cvd/paper-route-lens/latest.json'],
    );
    assert.equal(
      drilldown.runtime_visualization_projection.research_lens.authority_boundary.can_read_paper_body,
      false,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.authority_boundary.can_create_owner_receipt,
      false,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.authority_boundary.can_authorize_publication_ready,
      false,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.surface_kind,
      'opl_app_runtime_workbench_visualization_model',
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.layout_model,
      'vertical_summary_action_queue_lane_map_task_drilldown.v1',
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.refresh_policy.summary_poll_interval_seconds,
      10,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.refresh_policy.full_detail_auto_poll,
      false,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.refresh_policy.per_token_streaming,
      false,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.performance_policy.global_map_renderer,
      'lightweight_dom_css_lane_map',
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.summary_cards
        .some((card: { card_id: string; value: number }) =>
          card.card_id === 'active_tasks' && card.value === 1
        ),
      true,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.action_queue.items
        .some((item: { task_id: string; priority_bucket: string; safe_action_ref_count: number }) =>
          item.task_id === 'task-app-drilldown'
          && item.priority_bucket === 'can_continue'
          && item.safe_action_ref_count > 0
        ),
      true,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.domain_lane_map.lanes
        .some((lane: { domain_id: string; lane_label: string; active_task_count: number }) =>
          lane.domain_id === 'medautoscience'
          && lane.lane_label === 'MAS'
          && lane.active_task_count === 1
        ),
      true,
    );
    assert.equal(
      drilldown.runtime_visualization_projection.runtime_workbench.task_drilldowns
        .some((task: {
          task_id: string;
          domain_id: string;
          stage_attempt_ids: string[];
          paper_route_lens_ref_count: number;
          active_path: Array<{ node_id: string }>;
        }) =>
          task.task_id === 'task-app-drilldown'
          && task.domain_id === 'medautoscience'
          && task.stage_attempt_ids.includes(attemptId)
          && task.paper_route_lens_ref_count === 1
          && task.active_path.some((node) => node.node_id === `stage_attempt:${attemptId}`)
        ),
      true,
    );
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
    const providerWorkerRepairRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'provider-worker:temporal:restart',
    );
    assert.equal(providerWorkerRepairRoute.action_kind, 'provider_worker_restart');
    assert.equal(providerWorkerRepairRoute.owner, 'opl');
    assert.equal(providerWorkerRepairRoute.route_target_kind, 'opl_cli');
    assert.equal(providerWorkerRepairRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(providerWorkerRepairRoute.execution_surface, 'opl runtime action execute');
    assert.equal(providerWorkerRepairRoute.provider_worker_lifecycle_status, 'worker_source_stale');
    assert.equal(providerWorkerRepairRoute.provider_worker_repair_action_id, 'restart_temporal_worker');
    assert.equal(
      providerWorkerRepairRoute.provider_worker_repair_command,
      'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
    );
    assert.equal(
      providerWorkerRepairRoute.provider_worker_required_next_action,
      'Restart stale Temporal worker before rerunning provider proof or provider-backed Codex stages.',
    );
    assert.deepEqual(providerWorkerRepairRoute.opl_cli_args, [
      'worker',
      'repair',
      '--provider',
      'temporal',
      '--action',
      'restart',
    ]);
    assert.equal(providerWorkerRepairRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      providerWorkerRepairRoute.authority_boundary.can_execute_domain_action,
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
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].delete_ready,
      undefined,
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].opl_cleanup_ledger_ready,
      true,
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].domain_physical_delete_requires_owner_receipt,
      true,
    );
    assert.equal(
      drilldown.domain_legacy_cleanup_plan_refs.refs[0].domain_physical_delete_can_execute,
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
    assert.equal(drilldown.evidence_envelope.surface_kind, 'opl_evidence_envelope_projection');
    assert.equal(drilldown.evidence_envelope.total_ref_count, drilldown.summary.evidence_envelope_count);
    assert.equal(drilldown.evidence_envelope.omitted_ref_count, 0);
    assert.equal(drilldown.evidence_envelope.summary.open_envelope_count, 1);
    assert.equal(drilldown.evidence_envelope.summary.domain_ready_claim_count, 0);
    assert.equal(drilldown.evidence_envelope.summary.production_ready_claim_count, 0);
    assert.equal(drilldown.evidence_envelope.summary.artifact_authority_claim_count, 0);
    assert.equal(drilldown.evidence_envelope.authority_boundary.can_write_domain_truth, false);
    assert.equal(drilldown.evidence_envelope.authority_boundary.can_claim_production_ready, false);
    assert.deepEqual(drilldown.evidence_envelope.summary.owner_ids, [
      'med-autoscience',
      'one-person-lab',
    ]);
    assert.equal(
      drilldown.evidence_envelope.summary.owner_id_policy,
      'canonical_owner_ids_only_raw_aliases_in_full_detail_envelopes',
    );
    assert.deepEqual(
      drilldown.evidence_envelope.owner_alias_diagnostics.aliases,
      [
        {
          canonical_owner_id: 'med-autoscience',
          source_owner_alias_ids: ['medautoscience'],
        },
      ],
    );
    const reviewEnvelope = drilldown.evidence_envelope.envelopes.find(
      (entry: { envelope_id: string }) =>
        entry.envelope_id === 'stage_production_evidence:med-autoscience:review',
    );
    assert.equal(reviewEnvelope.owner, 'med-autoscience');
    assert.equal(reviewEnvelope.scope.domain_id, 'med-autoscience');
    assert.equal(reviewEnvelope.scope.source_domain_id, 'medautoscience');
    assert.equal(reviewEnvelope.status, 'open');
    assert.equal(reviewEnvelope.payload_kind, 'stage_expected_receipt_or_monitor_freshness_refs');
    assert.equal(reviewEnvelope.scope.stage_id, 'review');
    assert.equal(reviewEnvelope.claim_allowed.domain_ready, false);
    assert.equal(reviewEnvelope.claim_allowed.production_ready, false);
    assert.equal(typeof reviewEnvelope.next_route, 'string');
    assert.equal(reviewEnvelope.next_route.length > 0, true);
    const legacyCleanupApplyRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'legacy-cleanup:medautoscience:apply',
    );
    assert.equal(legacyCleanupApplyRoute.owner, 'opl');
    assert.equal(legacyCleanupApplyRoute.route_target_kind, 'opl_cli');
    assert.equal(legacyCleanupApplyRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(legacyCleanupApplyRoute.execution_surface, 'opl runtime action execute');
    assert.equal(legacyCleanupApplyRoute.opl_cleanup_ledger_ready, true);
    assert.equal(legacyCleanupApplyRoute.domain_physical_delete_requires_owner_receipt, true);
    assert.equal(legacyCleanupApplyRoute.domain_physical_delete_can_execute, false);
    assert.equal(legacyCleanupApplyRoute.domain_delete_ready, undefined);
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
    assert.deepEqual(writeProductionEvidence.unobserved_expected_receipt_refs, []);
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
    assert.equal(stageProductionAttemptRoute.route_status, 'request_route_available');
    assert.equal(stageProductionAttemptRoute.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(stageProductionAttemptRoute.creates_domain_action, false);
    assert.equal(stageProductionAttemptRoute.creates_owner_receipt, false);
    assert.deepEqual(stageProductionAttemptRoute.owner_receipt_refs, []);
    assert.equal(stageProductionAttemptRoute.closes_expected_receipt_refs, false);
    assert.equal(stageProductionAttemptRoute.closes_monitor_freshness, false);
    assert.equal(stageProductionAttemptRoute.route_target_kind, 'opl_cli');
    assert.equal(stageProductionAttemptRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(stageProductionAttemptRoute.execution_surface, 'opl runtime action execute');
    assert.equal(stageProductionAttemptRoute.route_status, 'request_route_available');
    assert.equal(stageProductionAttemptRoute.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(stageProductionAttemptRoute.creates_domain_action, false);
    assert.equal(stageProductionAttemptRoute.creates_owner_receipt, false);
    assert.deepEqual(stageProductionAttemptRoute.owner_receipt_refs, []);
    assert.equal(stageProductionAttemptRoute.closes_expected_receipt_refs, false);
    assert.equal(stageProductionAttemptRoute.closes_monitor_freshness, false);
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
    assert.equal(stageProductionAttemptRoute.production_attempt_chain.start_action_id,
      'stage-production-attempt-start:medautoscience:review');
    assert.equal(
      stageProductionAttemptRoute.production_attempt_chain.reviewer_attempt_must_be_separate_from_execution_attempt,
      true,
    );
    assert.equal(
      stageProductionAttemptRoute.production_attempt_chain.gate_attempt_must_be_separate_from_execution_attempt,
      true,
    );
    assert.equal(stageProductionAttemptRoute.production_attempt_chain.closes_domain_ready, false);

    const stageProductionAttemptStartRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_kind: string; stage_id: string }) =>
        ref.action_kind === 'stage_production_attempt_start'
        && ref.stage_id === 'review',
    );
    assert.equal(stageProductionAttemptStartRoute.owner, 'opl');
    assert.equal(stageProductionAttemptStartRoute.route_target_kind, 'opl_cli');
    assert.equal(stageProductionAttemptStartRoute.execution_surface, 'opl runtime action execute');
    assert.equal(stageProductionAttemptStartRoute.opl_cli_args.includes('--start'), true);
    assert.equal(stageProductionAttemptStartRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(stageProductionAttemptStartRoute.authority_boundary.creates_domain_owner_receipt, false);

    const stageProductionEvidenceRecordRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_kind: string; stage_id: string }) =>
        ref.action_kind === 'stage_production_evidence_receipt_record'
        && ref.stage_id === 'review',
    );
    assert.equal(
      stageProductionEvidenceRecordRoute.route_status_detail,
      'record_route_available_waiting_for_domain_app_or_live_refs_payload',
    );
    assert.equal(
      stageProductionEvidenceRecordRoute.payload_requirement,
      'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_source_scope_runtime_event_or_monitor_freshness',
    );
    assert.equal(stageProductionEvidenceRecordRoute.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(stageProductionEvidenceRecordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(stageProductionEvidenceRecordRoute.can_close_without_domain_or_app_payload, false);
    assert.deepEqual(stageProductionEvidenceRecordRoute.payload_template, {
      domain_receipt_refs: [],
      evidence_refs: [],
      typed_blocker_refs: [],
      no_regression_refs: [],
      owner_chain_refs: [],
      source_scope_refs: [],
      runtime_event_refs: [],
    });
    assert.deepEqual(
      stageProductionEvidenceRecordRoute.payload_ref_hints.domain_receipt_refs_should_cover,
      ['mas:review-receipt', 'owner_receipt:review'],
    );
    assert.deepEqual(
      stageProductionEvidenceRecordRoute.payload_ref_hints.evidence_refs_should_cover_monitor_freshness,
      ['metric:review/currentness'],
    );
    assert.deepEqual(
      stageProductionEvidenceRecordRoute.payload_ref_hints.source_scope_refs_should_cover,
      ['source:review'],
    );
    assert.deepEqual(
      stageProductionEvidenceRecordRoute.payload_ref_hints.runtime_event_refs_should_cover,
      ['runtime_event:review.receipt_recorded'],
    );
    assert.equal(
      stageProductionEvidenceRecordRoute.payload_template_policy,
      'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit',
    );
    assert.equal(
      stageProductionEvidenceRecordRoute.open_reason,
      'unobserved_stage_evidence_refs_require_domain_app_or_live_payload_before_closure',
    );

    const domainDispatchEvidenceRecordRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_kind: string; stage_attempt_id: string }) =>
        ref.action_kind === 'domain_dispatch_evidence_receipt_record'
        && ref.stage_attempt_id === attemptId,
    );
    assert.equal(domainDispatchEvidenceRecordRoute.owner, 'opl');
    assert.equal(domainDispatchEvidenceRecordRoute.route_target_kind, 'opl_cli');
    assert.equal(domainDispatchEvidenceRecordRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(domainDispatchEvidenceRecordRoute.execution_surface, 'opl runtime action execute');
    assert.equal(domainDispatchEvidenceRecordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(domainDispatchEvidenceRecordRoute.can_close_without_domain_or_app_payload, false);
    assert.equal(domainDispatchEvidenceRecordRoute.creates_domain_action, false);
    assert.equal(domainDispatchEvidenceRecordRoute.creates_owner_receipt, false);
    assert.deepEqual(domainDispatchEvidenceRecordRoute.owner_receipt_refs, []);
    assert.deepEqual(domainDispatchEvidenceRecordRoute.payload_template, {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      no_regression_refs: [],
      owner_chain_refs: [],
      evidence_refs: [],
    });
    assert.equal(
      domainDispatchEvidenceRecordRoute.payload_requirement,
      'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
    );
    assert.equal(
      domainDispatchEvidenceRecordRoute.open_reason,
      'domain_dispatch_attempt_missing_owner_receipt_or_typed_blocker_refs',
    );
    assert.equal(domainDispatchEvidenceRecordRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(domainDispatchEvidenceRecordRoute.authority_boundary.creates_owner_receipt, false);
    assert.equal(domainDispatchEvidenceRecordRoute.authority_boundary.closes_domain_ready, false);
    assert.equal(domainDispatchEvidenceRecordRoute.authority_boundary.closes_production_ready, false);

    const omaProductionConsumptionRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'oma_production_consumption:opl-meta-agent:record',
    );
    assert.equal(
      omaProductionConsumptionRoute.action_kind,
      'oma_production_consumption_receipt_record',
    );
    assert.equal(omaProductionConsumptionRoute.owner, 'opl');
    assert.equal(omaProductionConsumptionRoute.route_target_kind, 'opl_cli');
    assert.equal(omaProductionConsumptionRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(omaProductionConsumptionRoute.route_requires_domain_or_app_payload, true);
    assert.equal(omaProductionConsumptionRoute.can_close_without_domain_or_app_payload, false);
    assert.deepEqual(omaProductionConsumptionRoute.payload_template, {
      long_soak_refs: [],
      typed_blocker_refs: [],
      operator_evidence_refs: [],
    });
    assert.deepEqual(
      omaProductionConsumptionRoute.copyable_runtime_action_execute_commands.record_with_payload,
      [
        'runtime',
        'action',
        'execute',
        '--action',
        'oma_production_consumption:opl-meta-agent:record',
        '--payload-file',
        '<payload.json>',
      ],
    );
    assert.equal(
      omaProductionConsumptionRoute.payload_workorder.surface_kind,
      'opl_oma_production_consumption_payload_workorder',
    );
    assert.equal(
      omaProductionConsumptionRoute.payload_workorder.empty_payload_template_is_success_evidence,
      false,
    );
    assert.equal(omaProductionConsumptionRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(omaProductionConsumptionRoute.authority_boundary.can_create_owner_receipt, false);
    assert.equal(omaProductionConsumptionRoute.authority_boundary.can_claim_production_ready, false);

    const domainRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_kind: string }) => ref.action_kind === 'domain_handler_repair_command',
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
    assert.equal(bridgeStageProductionAttemptRoute.route_status, 'request_route_available');
    assert.equal(
      bridgeStageProductionAttemptRoute.request_scope,
      'opl_owned_stage_attempt_request_only',
    );
    assert.equal(bridgeStageProductionAttemptRoute.creates_domain_action, false);
    assert.equal(bridgeStageProductionAttemptRoute.creates_owner_receipt, false);
    assert.deepEqual(bridgeStageProductionAttemptRoute.owner_receipt_refs, []);
    assert.equal(bridgeStageProductionAttemptRoute.closes_expected_receipt_refs, false);
    assert.equal(bridgeStageProductionAttemptRoute.closes_monitor_freshness, false);
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
          ref.action_id === providerWorkerRepairRoute.action_id
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );
    const bridgeProviderWorkerRepairRoute = drilldown.app_execution_bridge.safe_action_routes.find(
      (ref: { action_id: string }) => ref.action_id === providerWorkerRepairRoute.action_id,
    );
    assert.equal(bridgeProviderWorkerRepairRoute.action_kind, 'provider_worker_restart');
    assert.equal(
      bridgeProviderWorkerRepairRoute.provider_worker_lifecycle_status,
      'worker_source_stale',
    );
    assert.equal(
      bridgeProviderWorkerRepairRoute.provider_worker_repair_action_id,
      'restart_temporal_worker',
    );
    assert.deepEqual(
      bridgeProviderWorkerRepairRoute.opl_cli_args,
      providerWorkerRepairRoute.opl_cli_args,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean; opl_cli_args: string[] }) =>
          ref.action_id === stageProductionAttemptStartRoute.action_id
          && ref.can_submit_to_safe_action_shell
          && ref.opl_cli_args.includes('--start'),
      ),
      true,
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
    const bridgeStageProductionEvidenceRecordRoute = drilldown.app_execution_bridge.safe_action_routes.find(
      (ref: { action_id: string }) => ref.action_id === stageProductionEvidenceRecordRoute.action_id,
    );
    assert.equal(bridgeStageProductionEvidenceRecordRoute.can_submit_to_safe_action_shell, true);
    assert.equal(
      bridgeStageProductionEvidenceRecordRoute.route_status_detail,
      'record_route_available_waiting_for_domain_app_or_live_refs_payload',
    );
    assert.equal(
      bridgeStageProductionEvidenceRecordRoute.payload_requirement,
      'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_source_scope_runtime_event_or_monitor_freshness',
    );
    assert.equal(bridgeStageProductionEvidenceRecordRoute.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(bridgeStageProductionEvidenceRecordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(bridgeStageProductionEvidenceRecordRoute.can_close_without_domain_or_app_payload, false);
    assert.deepEqual(
      bridgeStageProductionEvidenceRecordRoute.payload_template,
      stageProductionEvidenceRecordRoute.payload_template,
    );
    assert.deepEqual(
      bridgeStageProductionEvidenceRecordRoute.payload_ref_hints,
      stageProductionEvidenceRecordRoute.payload_ref_hints,
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
      drilldown.app_execution_bridge.route_submission_policy.stage_attempt_requests_close_expected_receipts,
      false,
    );
    assert.equal(
      drilldown.app_execution_bridge.route_submission_policy.stage_attempt_requests_close_monitor_freshness,
      false,
    );
    assert.equal(
      drilldown.app_execution_bridge.route_submission_policy.direct_domain_action_execution_allowed,
      false,
    );
    assertEvidenceTailAndDomainRefs(drilldown, snapshot);
  } finally {
    try {
      process.kill(workerProbe.pid!, 'SIGTERM');
    } catch {
      // The fixture process may already be gone on fast local cleanup.
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
