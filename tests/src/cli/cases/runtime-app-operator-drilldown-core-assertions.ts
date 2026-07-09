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
  assert.equal(projection.summary.operator_action_route_count, projection.operator_action_routing_refs.refs.length);
  assert.equal(projection.summary.operator_executable_route_count, projection.app_execution_bridge.summary.safe_action_route_count);
  assert.equal(projection.summary.functional_privatization_default_watchlist_count, 0);
  assert.equal(projection.summary.functional_privatization_semantic_equivalence_review_count, 0);
  assert.equal(projection.summary.evidence_envelope_domain_ready_claim_count, 0);
  assert.equal(projection.summary.evidence_envelope_production_ready_claim_count, 0);
  assert.equal(projection.summary.evidence_envelope_artifact_authority_claim_count, 0);
  assert.equal(Object.hasOwn(projection.summary, 'deprecated_alias_metadata'), false);

  const semanticConventions = projection.semantic_conventions;
  assert.equal(semanticConventions.surface_kind, 'opl_observability_export_readback_seed');
  assert.equal(semanticConventions.summary.body_included, false);
  assert.equal(semanticConventions.authority_boundary.no_domain_ready_claim, true);

  assert.equal(projection.route_graph_refs.refs[0].ref, `/stage_attempt_workbench/attempts/${attemptId}/route_decision_graph`);
  assert.equal(projection.runtime_visualization_projection.surface_kind, 'opl_app_runtime_visualization_projection');
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
    projection.runtime_visualization_projection.timeline.events.some(
      (event: { event_kind: string; stage_attempt_id: string }) =>
        event.event_kind === 'stage_attempt_status' && event.stage_attempt_id === attemptId,
    ),
    true,
  );
  assert.equal(projection.runtime_visualization_projection.authority_boundary.can_create_owner_receipt, false);
  assert.equal(projection.runtime_visualization_projection.authority_boundary.can_authorize_publication_ready, false);

  assert.equal(projection.stage_progress_log.attempt_count, 1);
  assert.equal(projection.stage_progress_log.attempt_refs.includes(`/stage_attempt_workbench/attempts/${attemptId}/stage_progress_log`), true);
  assert.equal(projection.stage_progress_log.authority_boundary.can_read_memory_body, false);
  assert.equal(projection.stage_progress_log.authority_boundary.provider_completion_is_domain_ready, false);
  assert.equal(projection.domain_current_work_unit_projection.summary.current_work_unit_count, projection.domain_current_work_unit_projection.items.length);
  assert.equal(projection.domain_current_work_unit_projection.authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.domain_current_work_unit_projection.authority_boundary.can_execute_domain_action, false);

  assert.deepEqual(
    projection.runtime_workbench,
    {
      ...projection.runtime_visualization_projection.runtime_workbench,
      memory_trace_projection: projection.memory_trace_projection,
      workstream_operating_loop: projection.workstream_operating_loop,
      current_work_unit_first_read_model: projection.current_work_unit_first_read_model,
      domain_current_work_unit_projection: projection.domain_current_work_unit_projection,
    },
  );
  assert.deepEqual(projection.visual_ref_groups, projection.runtime_visualization_projection.visual_ref_groups);
  assert.equal(
    projection.visual_ref_groups.stage_progress_log_refs.some(
      (ref: { ref: string; stage_attempt_id: string }) =>
        ref.ref === `/stage_attempt_workbench/attempts/${attemptId}/stage_progress_log`
        && ref.stage_attempt_id === attemptId,
    ),
    true,
  );
  assert.deepEqual(
    projection.runtime_visualization_projection.research_lens.paper_route_lens_refs.map(
      (ref: { ref: string }) => ref.ref,
    ),
    ['mas://studies/dm-cvd/paper-route-lens/latest.json'],
  );
  assert.equal(projection.runtime_visualization_projection.research_lens.authority_boundary.can_read_paper_body, false);

  assert.equal(projection.review_repair_queue_refs.items[0].repair_target, `opl family-runtime attempt query ${attemptId}`);
  assert.equal(projection.artifact_gallery_refs.content_policy, 'locator_only_no_artifact_content');
  assert.deepEqual(projection.package_export_lifecycle_refs.package_refs, ['package:submission-minimal']);
  assert.deepEqual(projection.package_export_lifecycle_refs.export_refs, ['export:current-package']);
  assert.deepEqual(projection.memory_writeback_refs.consumed_memory_refs, ['memory:route-policy']);
  assertMemoryTraceProjection(projection);
  assert.deepEqual(projection.quality_readiness_refs.quality_refs, ['publication_eval/latest.json']);
  assert.deepEqual(projection.quality_readiness_refs.readiness_refs, ['controller_decisions/latest.json']);
  assert.equal(projection.provider_slo_operator_action_refs.refs[0].execution_owner, 'operator_or_infrastructure');
  assert.equal(projection.periodic_execution_refs.authority_boundary.can_write_domain_truth, false);
  assert.equal(
    projection.domain_evidence_request_refs.replacement_expectations.some(
      (ref: { ref: string; coverage: { coverage_status: string } }) =>
        ref.ref === 'artifact_package_lifecycle_shell'
        && ref.coverage.coverage_status === 'opl_replacement_surface_available',
    ),
    true,
  );
}
