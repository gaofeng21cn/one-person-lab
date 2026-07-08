import { assert } from '../helpers.ts';
import { assertOwnerDeltaFirstAppOperatorProjection } from './owner-payload-workorder-assertions.ts';
import { assertMemoryTraceProjection } from './runtime-app-operator-drilldown-memory-trace-assertions.ts';

export function assertCoreAppOperatorDrilldownProjection(
  projection: any,
  attemptId: string,
): void {
  assert.equal(projection.surface_kind, 'opl_app_operator_drilldown_read_model');
  assert.equal(projection.projection_scope, 'runtime_snapshot');
  assert.equal(projection.consumer, 'one_person_lab_app_operator_workbench');
  assert.equal(projection.availability, 'available');
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.authority_boundary.can_read_memory_body, false);
  assert.equal(projection.authority_boundary.can_read_artifact_body, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(projection.authority_boundary.can_authorize_export_verdict, false);
  assert.equal(projection.authority_boundary.can_execute_domain_action, false);
  assert.equal(projection.authority_boundary.provider_completion_is_domain_ready, false);
  assert.deepEqual(projection.non_goals, [
    'does_not_write_domain_truth',
    'does_not_read_or_store_memory_body',
    'does_not_read_or_mutate_artifact_body',
    'does_not_authorize_quality_readiness_or_export_verdict',
    'does_not_directly_execute_domain_actions',
  ]);
  assertOwnerDeltaFirstAppOperatorProjection(projection);

  assert.equal(projection.summary.stage_attempt_count, 1);
  assert.equal(projection.summary.domain_projection_ref_count >= 3, true);
  assert.equal(projection.summary.route_graph_ref_count, 1);
  assert.equal(projection.summary.review_repair_queue_item_count, 1);
  assert.equal(projection.summary.artifact_gallery_item_count, 3);
  assert.equal(projection.summary.package_ref_count, 1);
  assert.equal(projection.summary.export_ref_count, 1);
  assert.equal(projection.summary.memory_ref_count, 1);
  assert.equal(projection.summary.memory_writeback_ref_count, 2);
  assert.equal(projection.summary.quality_ref_count, 1);
  assert.equal(projection.summary.readiness_ref_count, 1);
  assert.equal(projection.summary.runtime_visualization_node_count > 0, true);
  assert.equal(projection.summary.runtime_visualization_edge_count > 0, true);
  assert.equal(projection.summary.runtime_visualization_timeline_event_count > 0, true);
  assert.equal(projection.summary.runtime_visualization_paper_route_lens_ref_count, 1);
  assert.equal(projection.summary.runtime_visualization_stage_progress_event_count >= 0, true);
  assert.equal(projection.summary.runtime_visualization_temporal_stage_progress_ref_count >= 0, true);
  assert.equal(projection.summary.provider_slo_action_count, 1);
  assert.equal(projection.summary.provider_cadence_window_status, 'window_evidence_incomplete');
  assert.equal(projection.summary.provider_cadence_window_long_evidence_ready, false);
  assert.equal(projection.summary.provider_cadence_window_expected_receipt_count, 7);
  assert.equal(projection.summary.provider_cadence_window_observed_receipt_count, 0);
  assert.equal(projection.summary.provider_cadence_window_missing_receipt_count, 7);
  assert.equal(projection.summary.provider_cadence_window_blocked_repair_receipt_count, 0);
  assert.equal(projection.summary.periodic_execution_ref_count, 5);
  assert.equal(
    projection.summary.operator_action_route_count,
    projection.operator_action_routing_refs.refs.length,
  );
  assert.equal(projection.summary.operator_action_route_count >= 26, true);
  assert.equal(
    projection.summary.operator_action_route_count,
    30,
  );
  assert.equal(
    projection.summary.operator_executable_route_count,
    projection.app_execution_bridge.summary.safe_action_route_count,
  );
  assert.equal(projection.summary.operator_executable_route_count >= 16, true);
  assert.equal(
    projection.summary.operator_executable_route_count,
    20,
  );
  assert.equal(projection.summary.stage_production_evidence_receipt_action_route_count, 2);
  assert.equal(
    projection.summary.stage_production_evidence_receipt_record_requires_domain_or_app_payload_count,
    2,
  );
  assert.equal(
    projection.summary.stage_production_evidence_receipt_record_payload_template_count,
    2,
  );
  assert.equal(projection.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
  assert.equal(
    projection.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
    1,
  );
  assert.equal(projection.summary.domain_dispatch_evidence_receipt_record_payload_template_count, 1);
  assert.equal(projection.summary.oma_production_consumption_action_route_count, 1);
  assert.equal(projection.summary.codex_app_runtime_evidence_action_route_count, 1);
  assert.equal(projection.summary.codex_app_runtime_evidence_record_action_route_count, 1);
  assert.equal(projection.summary.codex_app_runtime_evidence_verify_action_route_count, 0);
  assert.equal(projection.summary.codex_app_runtime_evidence_open_gate_count, 1);
  assert.equal(projection.summary.domain_owned_action_route_count, 2);
  assert.equal(projection.summary.functional_privatization_default_watchlist_count, 0);
  assert.equal(projection.summary.functional_privatization_semantic_equivalence_review_count, 0);
  assert.equal(projection.summary.domain_external_evidence_request_count, 1);
  assert.equal(projection.summary.domain_open_evidence_request_count, 0);
  assert.equal(projection.summary.domain_recorded_evidence_receipt_request_count, 0);
  assert.equal(projection.summary.domain_verified_evidence_receipt_request_count, 1);
  assert.equal(projection.summary.domain_external_evidence_receipt_count, 1);
  assert.equal(projection.summary.domain_external_verified_evidence_receipt_count, 1);
  assert.equal(projection.summary.domain_external_verified_memory_writeback_receipt_ref_count, 1);
  assert.equal(projection.summary.domain_external_verified_artifact_mutation_receipt_ref_count, 1);
  assert.equal(projection.summary.domain_external_verified_package_lifecycle_receipt_ref_count, 1);
  assert.equal(projection.summary.domain_external_verified_lifecycle_receipt_ref_count, 1);
  assert.equal(projection.summary.domain_external_verified_restore_proof_ref_count, 1);
  assert.equal(projection.summary.domain_evidence_gate_count, 1);
  assert.equal(projection.summary.domain_remaining_evidence_gate_count, 0);
  assert.equal(projection.summary.domain_open_evidence_gate_request_count, 0);
  assert.equal(projection.summary.domain_recorded_evidence_gate_request_count, 0);
  assert.equal(projection.summary.domain_verified_evidence_gate_request_count, 1);
  assert.equal(projection.summary.domain_evidence_gate_receipt_count, 1);
  assert.equal(projection.summary.domain_evidence_gate_verified_receipt_count, 1);
  assert.equal(projection.summary.domain_opl_replacement_expectation_count, 1);
  assert.equal(projection.summary.domain_replacement_surface_available_count, 1);
  assert.equal(projection.summary.domain_remaining_bridge_module_count, 1);
  assert.equal(projection.summary.domain_legacy_cleanup_plan_count, 1);
  assert.equal(projection.summary.domain_legacy_cleanup_ready_plan_count, 1);
  assert.equal(projection.summary.domain_legacy_cleanup_blocked_plan_count, 0);
  assert.equal(projection.summary.domain_legacy_cleanup_action_count, 1);
  assert.equal(projection.summary.domain_legacy_cleanup_opl_apply_ready_count, 1);
  assert.equal(projection.summary.domain_legacy_cleanup_opl_cleanup_ledger_ready_count, 1);
  assert.equal(
    projection.summary.domain_legacy_cleanup_domain_physical_delete_requires_owner_receipt_count,
    1,
  );
  assert.equal(projection.summary.domain_legacy_cleanup_domain_physical_delete_can_execute_count, 0);
  assert.equal(projection.summary.domain_legacy_cleanup_delete_ready_count, undefined);
  assert.equal(projection.summary.stage_production_evidence_domain_count, 1);
  assert.equal(projection.summary.stage_production_evidence_stage_count, 2);
  assert.equal(projection.summary.stage_production_evidence_observed_stage_count, 1);
  assert.equal(projection.summary.stage_production_evidence_missing_caller_stage_count, 1);
  assert.equal(projection.summary.stage_production_evidence_missing_expected_receipt_stage_count, 1);
  assert.equal(projection.summary.stage_production_evidence_expected_receipt_declared_stage_count, 2);
  assert.equal(projection.summary.stage_production_evidence_expected_receipt_observed_stage_count, 1);
  assert.equal(projection.summary.stage_production_evidence_expected_receipt_unobserved_stage_count, 1);
  assert.equal(projection.summary.stage_production_evidence_missing_executor_binding_stage_count, 1);
  assert.equal(projection.summary.stage_production_evidence_executor_binding_observed_stage_count, 1);
  assert.equal(projection.summary.stage_production_evidence_missing_monitor_freshness_stage_count, 2);
  assert.equal(projection.summary.stage_production_evidence_monitor_declared_stage_count, 2);
  assert.equal(projection.summary.stage_production_evidence_monitor_freshness_observed_stage_count, 0);
  assert.equal(projection.summary.stage_production_evidence_monitor_freshness_unobserved_stage_count, 2);
  assert.equal(projection.summary.stage_production_attempt_request_route_count, 1);
  assert.equal(projection.summary.app_operator_production_evidence_tail_item_count >= 1, true);
  assert.equal(projection.summary.app_operator_production_evidence_tail_open_item_count >= 1, true);
  assert.equal(projection.summary.evidence_envelope_count > 0, true);
  assert.equal(projection.summary.evidence_envelope_open_count, 1);
  assert.equal(
    projection.summary.evidence_envelope_open_count
      + projection.summary.evidence_envelope_closed_count
      + projection.summary.evidence_envelope_blocked_count,
    projection.summary.evidence_envelope_count,
  );
  assert.equal(projection.summary.evidence_envelope_blocked_count >= 0, true);
  assert.equal(projection.summary.evidence_envelope_domain_ready_claim_count, 0);
  assert.equal(projection.summary.evidence_envelope_production_ready_claim_count, 0);
  assert.equal(projection.summary.evidence_envelope_artifact_authority_claim_count, 0);
  const semanticConventions = projection.semantic_conventions; // reuse-first: allow existing drilldown readback under semantic conventions.
  assert.equal(semanticConventions.surface_kind, 'opl_observability_export_readback_seed');
  assert.equal(
    semanticConventions.evidence_envelope_binding.source_surface,
    'opl_evidence_envelope_projection',
  );
  assert.equal(semanticConventions.summary.body_included, false);
  assert.equal(semanticConventions.authority_boundary.no_domain_ready_claim, true);
  assert.equal(Object.hasOwn(projection.summary, 'deprecated_alias_metadata'), false);

  assert.equal(projection.route_graph_refs.surface_kind, 'opl_app_drilldown_route_graph_refs');
  assert.equal(projection.route_graph_refs.refs[0].ref, `/stage_attempt_workbench/attempts/${attemptId}/route_decision_graph`);
  assert.equal(
    projection.runtime_visualization_projection.surface_kind,
    'opl_app_runtime_visualization_projection',
  );
  assert.equal(
    projection.runtime_visualization_projection.projection_policy,
    'refs_only_no_domain_truth_memory_body_artifact_body_or_verdict',
  );
  assert.equal(
    projection.runtime_visualization_projection.graph.nodes.some(
      (node: { node_kind: string; stage_attempt_id: string }) =>
        node.node_kind === 'stage_attempt' && node.stage_attempt_id === attemptId,
    ),
    true,
  );
  assert.equal(
    projection.runtime_visualization_projection.graph.edges.some(
      (edge: { edge_kind: string; stage_attempt_id: string }) =>
        edge.edge_kind === 'attempt_has_route_graph' && edge.stage_attempt_id === attemptId,
    ),
    true,
  );
  assert.equal(
    projection.runtime_visualization_projection.timeline.events.some(
      (event: { event_kind: string; stage_attempt_id: string }) =>
        event.event_kind === 'stage_attempt_status' && event.stage_attempt_id === attemptId,
    ),
    true,
  );
  assert.equal(projection.stage_progress_log.surface_kind, 'opl_stage_progress_log_summary');
  assert.equal(projection.stage_progress_log.attempt_count, 1);
  assert.equal(projection.stage_progress_log.user_duration_observed_attempt_count, 1);
  assert.equal(projection.stage_progress_log.user_duration_fallback_attempt_count, 0);
  assert.equal(Array.isArray(projection.stage_progress_log.attempt_refs), true);
  assert.equal(
    projection.stage_progress_log.attempt_refs.includes(
      `/stage_attempt_workbench/attempts/${attemptId}/stage_progress_log`,
    ),
    true,
  );
  assert.equal(projection.stage_progress_log.authority_boundary.can_read_memory_body, false);
  assert.equal(projection.stage_progress_log.authority_boundary.can_read_artifact_body, false);
  assert.equal(
    projection.stage_progress_log.authority_boundary.provider_completion_is_domain_ready,
    false,
  );
  assert.equal(
    projection.domain_current_work_unit_projection.surface_kind,
    'opl_domain_current_work_unit_projection',
  );
  assert.equal(
    projection.domain_current_work_unit_projection.projection_policy,
    'runtime_tray_domain_current_work_unit_refs_only_no_domain_truth_reduction',
  );
  assert.equal(
    projection.domain_current_work_unit_projection.summary.current_work_unit_count,
    projection.domain_current_work_unit_projection.items.length,
  );
  assert.equal(
    projection.domain_current_work_unit_projection.authority_boundary.can_write_domain_truth,
    false,
  );
  assert.equal(
    projection.domain_current_work_unit_projection.authority_boundary.can_execute_domain_action,
    false,
  );
  assert.equal(
    projection.domain_current_work_unit_projection.authority_boundary.provider_completion_is_domain_ready,
    false,
  );
  assert.deepEqual(
    projection.runtime_workbench,
    {
      ...projection.runtime_visualization_projection.runtime_workbench,
      memory_trace_projection: projection.memory_trace_projection,
      workstream_operating_loop: projection.workstream_operating_loop,
      domain_current_work_unit_projection: projection.domain_current_work_unit_projection,
    },
  );
  assert.deepEqual(
    projection.visual_ref_groups,
    projection.runtime_visualization_projection.visual_ref_groups,
  );
  assert.equal(
    projection.visual_ref_groups.stage_progress_log_refs.some(
      (ref: { ref: string; stage_attempt_id: string }) =>
        ref.ref === `/stage_attempt_workbench/attempts/${attemptId}/stage_progress_log`
        && ref.stage_attempt_id === attemptId,
    ),
    true,
  );
  assert.equal(
    projection.runtime_visualization_projection.summary.temporal_stage_progress_ref_count,
    projection.visual_ref_groups.stage_progress_log_refs.filter(
      (ref: { temporal_webui_url?: string }) => Boolean(ref.temporal_webui_url),
    ).length,
  );
  assert.deepEqual(
    projection.runtime_visualization_projection.research_lens.paper_route_lens_refs.map(
      (ref: { ref: string }) => ref.ref,
    ),
    ['mas://studies/dm-cvd/paper-route-lens/latest.json'],
  );
  assert.equal(
    projection.runtime_visualization_projection.research_lens.authority_boundary.can_read_paper_body,
    false,
  );
  assert.equal(
    projection.runtime_visualization_projection.authority_boundary.can_create_owner_receipt,
    false,
  );
  assert.equal(
    projection.runtime_visualization_projection.authority_boundary.can_authorize_publication_ready,
    false,
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.surface_kind,
    'opl_app_runtime_workbench_visualization_model',
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.layout_model,
    'vertical_summary_action_queue_lane_map_task_drilldown.v1',
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.refresh_policy.summary_poll_interval_seconds,
    10,
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.refresh_policy.full_detail_auto_poll,
    false,
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.refresh_policy.per_token_streaming,
    false,
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.performance_policy.global_map_renderer,
    'lightweight_dom_css_lane_map',
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.summary_cards
      .some((card: { card_id: string; value: number }) =>
        card.card_id === 'active_tasks' && card.value === 1
      ),
    true,
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.action_queue.items
      .some((item: { task_id: string; priority_bucket: string; safe_action_ref_count: number }) =>
        item.task_id === 'task-app-drilldown'
        && item.priority_bucket === 'can_continue'
        && item.safe_action_ref_count > 0
      ),
    true,
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.domain_lane_map.lanes
      .some((lane: { domain_id: string; lane_label: string; active_task_count: number }) =>
        lane.domain_id === 'medautoscience'
        && lane.lane_label === 'MAS'
        && lane.active_task_count === 1
      ),
    true,
  );
  assert.equal(
    projection.runtime_visualization_projection.runtime_workbench.task_drilldowns
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
  assert.equal(projection.review_repair_queue_refs.items[0].repair_target, `opl family-runtime attempt query ${attemptId}`);
  assert.equal(projection.artifact_gallery_refs.content_policy, 'locator_only_no_artifact_content');
  assert.equal(projection.artifact_gallery_refs.refs.length, 3);
  assert.deepEqual(projection.package_export_lifecycle_refs.package_refs, ['package:submission-minimal']);
  assert.deepEqual(projection.package_export_lifecycle_refs.export_refs, ['export:current-package']);
  assert.deepEqual(projection.memory_writeback_refs.consumed_memory_refs, ['memory:route-policy']);
  assertMemoryTraceProjection(projection);
  assert.equal(projection.ref_family_refs.summary.memory_ref_count, 3);
  assert.deepEqual(projection.quality_readiness_refs.quality_refs, ['publication_eval/latest.json']);
  assert.deepEqual(projection.quality_readiness_refs.readiness_refs, ['controller_decisions/latest.json']);
  assert.equal(projection.provider_slo_operator_action_refs.refs[0].ref, 'opl family-runtime residency proof --provider temporal --production');
  assert.equal(projection.provider_slo_operator_action_refs.refs[0].execution_owner, 'operator_or_infrastructure');
  assert.equal(projection.periodic_execution_refs.surface_kind, 'opl_app_drilldown_periodic_execution_refs');
  assert.equal(projection.periodic_execution_refs.schedule_id, 'opl-family-runtime-provider-scheduler');
  assert.equal(
    projection.periodic_execution_refs.refs.some(
      (ref: { role: string; ref: string }) =>
        ref.role === 'scheduler_cadence_manual_trigger'
        && ref.ref === 'opl family-runtime scheduler trigger --provider temporal',
    ),
    true,
  );
  assert.equal(
    projection.domain_evidence_request_refs.replacement_expectations.some(
      (ref: { ref: string; coverage: { coverage_status: string } }) =>
        ref.ref === 'artifact_package_lifecycle_shell'
        && ref.coverage.coverage_status === 'opl_replacement_surface_available',
    ),
    true,
  );
  assert.equal(
    projection.periodic_execution_refs.authority_boundary.can_write_domain_truth,
    false,
  );
}
