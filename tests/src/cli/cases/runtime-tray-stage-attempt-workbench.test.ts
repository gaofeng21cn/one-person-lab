import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

import { assert, createFamilyContractsFixtureRoot, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('runtime snapshot projects stage attempt workbench without owning domain verdicts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","runtime_root":"/tmp/mas/runtime","artifact_root":"/tmp/mas/artifacts","profile_ref":"profile:nfpitnet","source_refs":["source:dataset"],"material_refs":["material:table1"],"missing_material_refs":["material:irb"],"restore_refs":["restore:mas-runtime-loop"]}',
      '--task',
      'task-runtime-snapshot-attempt',
      '--checkpoint-ref',
      'checkpoint:analysis-seed',
      '--source-fingerprint',
      'sha256:analysis-source',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--stage-packet-ref',
      'packet:analysis',
      '--checkpoint-ref',
      'checkpoint:analysis-midpoint',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_refs":["evidence:table1"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair","quality_refs":["publication_eval/latest.json"],"readiness_refs":["controller_decisions/latest.json"],"slo_ref":"slo:analysis-currentness","breached_slo_ids":["ai_reviewer_currentness"],"repair_command":"medautosci sidecar dispatch --task <task.json> --format json","package_refs":["package:submission-minimal"],"export_refs":["export:current-package"],"gap_report_refs":["gap:package-readiness"],"handoff_refs":["handoff:manual-submission"],"external_submission_status_ref":"portal:manual-boundary"}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const nativeIndexDir = path.join(stateRoot, 'runtime-manager');
    fs.mkdirSync(nativeIndexDir, { recursive: true });
    fs.writeFileSync(
      path.join(nativeIndexDir, 'native-state-index.json'),
      `${JSON.stringify({
        surface_kind: 'opl_runtime_manager_native_state_projection',
        version: 'v1',
        generated_at: '2026-05-14T00:00:00.000Z',
        lifecycle: {
          expires_at: '2099-01-01T00:00:00.000Z',
        },
        native_indexes: {
          state_index: {
            helper_id: 'opl-state-indexer',
            request_id: 'runtime-manager-state-index',
            status: 'ok',
            helper_version: '0.1.0',
            binary_version: '0.1.0',
            crate_name: 'opl-native-helper',
            crate_version: '0.1.0',
            result: {
              surface_kind: 'native_state_index',
            },
            errors: [],
          },
        },
      }, null, 2)}\n`,
    );

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.stage_attempt_workbench.surface_kind, 'opl_stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.availability, 'available');
    assert.equal(snapshot.stage_attempt_workbench.provider_completion_is_domain_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.summary.total, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.by_domain.medautoscience, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.by_stage['analysis-campaign'], 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.by_status.completed, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.memory_ref_counters.consumed_memory_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.summary.memory_ref_counters.writeback_receipt_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.surface_kind, 'opl_artifact_gallery_projection');
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.gallery_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.renderer_role, 'generic_artifact_gallery_handoff_shell');
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.summary.attempt_with_artifact_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.summary.item_count, 3);
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.authority_boundary.can_read_artifact_body, false);
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.authority_boundary.can_mutate_artifact, false);
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.route_decision_graph.surface_kind, 'opl_route_decision_graph_projection');
    assert.equal(snapshot.stage_attempt_workbench.route_decision_graph.graph_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.route_decision_graph.renderer_role, 'generic_route_decision_graph_shell');
    assert.equal(snapshot.stage_attempt_workbench.route_decision_graph.summary.route_evidence_attempt_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.route_decision_graph.summary.route_decision_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.route_decision_graph.authority_boundary.can_infer_route_decision, false);
    assert.equal(snapshot.stage_attempt_workbench.route_decision_graph.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.review_repair_queue.surface_kind, 'opl_review_repair_queue_projection');
    assert.equal(snapshot.stage_attempt_workbench.review_repair_queue.queue_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.review_repair_queue.transport_role, 'generic_review_repair_transport');
    assert.equal(snapshot.stage_attempt_workbench.review_repair_queue.summary.item_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.review_repair_queue.summary.rejected_write_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.review_repair_queue.authority_boundary.can_decide_repair, false);
    assert.equal(snapshot.stage_attempt_workbench.review_repair_queue.authority_boundary.can_authorize_review_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.surface_kind, 'opl_quality_readiness_projection');
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.projection_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.renderer_role, 'generic_quality_readiness_projection_shell');
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.summary.attempt_with_domain_readiness_verdict_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.summary.quality_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.summary.readiness_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.quality_readiness.authority_boundary.can_authorize_submission_readiness, false);
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.surface_kind, 'opl_observability_slo_projection');
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.projection_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.transport_role, 'generic_observability_slo_repair_command_projection');
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.summary.attempt_with_slo_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.summary.repair_command_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.summary.breached_slo_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.authority_boundary.can_execute_repair_command, false);
    assert.equal(snapshot.stage_attempt_workbench.observability_slo.authority_boundary.can_authorize_slo_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.surface_kind, 'opl_workspace_source_intake_projection');
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.projection_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.shell_role, 'generic_workspace_source_intake_shell');
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.summary.attempt_with_workspace_root_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.summary.source_fingerprint_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.summary.missing_material_attention_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.authority_boundary.can_authorize_source_readiness, false);
    assert.equal(snapshot.stage_attempt_workbench.workspace_source_intake.authority_boundary.can_select_domain_profile, false);
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.surface_kind, 'opl_memory_locator_index_projection');
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.projection_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.index_role, 'generic_memory_locator_index_shell');
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.summary.consumed_memory_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.summary.writeback_receipt_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.summary.rejected_write_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.authority_boundary.can_read_memory_body, false);
    assert.equal(snapshot.stage_attempt_workbench.memory_locator_index.authority_boundary.can_accept_or_reject_writeback, false);
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.surface_kind, 'opl_package_export_lifecycle_projection');
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.projection_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.shell_role, 'generic_package_export_lifecycle_shell');
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.summary.package_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.summary.export_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.summary.gap_report_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.summary.handoff_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.authority_boundary.can_authorize_package_readiness, false);
    assert.equal(snapshot.stage_attempt_workbench.package_export_lifecycle.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.surface_kind, 'opl_operator_action_routing_projection');
    assert.equal(snapshot.stage_attempt_workbench.action_routing.routing_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.action_routing.summary.attempt_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.summary.action_count, 12);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.summary.domain_sidecar_route_count, 2);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.authority_boundary.can_execute_domain_action, false);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.groups.by_domain.medautoscience.total, 1);
    assert.deepEqual(snapshot.stage_attempt_workbench.filter_metadata.group_keys, ['domain_id', 'stage_id', 'status']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].provider_kind, 'local_sqlite');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].stage_id, 'analysis-campaign');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.provider_completion, 'completed');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.provider_completion_is_domain_ready, false);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].lifecycle_primitives.artifact_locator_index.workspace_root, '/tmp/mas');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].lifecycle_primitives.artifact_locator_index.artifact_root, '/tmp/mas/artifacts');
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].lifecycle_primitives.restore_proof.required_refs, [
      'restore:mas-runtime-loop',
      'receipt:analysis-closeout',
      'evidence:table1',
      'memory-writeback:receipt-1',
    ]);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].lifecycle_primitives.restore_proof.opl_cleanup_allowed, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].artifact_gallery.gallery_scope, 'stage_attempt');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].artifact_gallery.summary.item_count, 3);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].artifact_gallery.summary.content_policy, 'locator_only_no_artifact_content');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].artifact_gallery.items[0].handoff_target, `opl family-runtime attempt query ${attempt.family_runtime_stage_attempt.attempt.stage_attempt_id}`);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].artifact_gallery.authority_boundary.can_read_artifact_body, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].controlled_apply_contract.apply_status, 'no_controlled_apply_request');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].rejected_writes[0].reason, 'domain_truth_write_forbidden');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].route_impact.decision, 'bounded_repair');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].route_decision_graph.graph_scope, 'stage_attempt');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].route_decision_graph.summary.route_decision_ref_observed, true);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].route_decision_graph.summary.domain_ref_count, 4);
    assert.equal(
      snapshot.stage_attempt_workbench.attempts[0].route_decision_graph.nodes.some((node: { node_kind: string }) =>
        node.node_kind === 'domain_route_decision_ref'
      ),
      true,
    );
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].route_decision_graph.authority_boundary.can_write_domain_truth, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].review_repair_queue.queue_scope, 'stage_attempt');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].review_repair_queue.summary.rejected_write_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].review_repair_queue.items[0].repair_target, `opl family-runtime attempt query ${attempt.family_runtime_stage_attempt.attempt.stage_attempt_id}`);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].review_repair_queue.authority_boundary.can_write_domain_truth, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].quality_readiness.projection_scope, 'stage_attempt');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].quality_readiness.domain_ready_verdict, 'domain_gate_pending');
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].quality_readiness.quality_refs, ['publication_eval/latest.json']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].quality_readiness.readiness_refs, ['controller_decisions/latest.json']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].quality_readiness.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].observability_slo.projection_scope, 'stage_attempt');
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].observability_slo.slo_refs, ['slo:analysis-currentness']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].observability_slo.breached_slo_ids, ['ai_reviewer_currentness']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].observability_slo.repair_commands[0].command, 'medautosci sidecar dispatch --task <task.json> --format json');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].observability_slo.authority_boundary.can_execute_repair_command, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].workspace_source_intake.projection_scope, 'stage_attempt');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].workspace_source_intake.source_fingerprint, 'sha256:analysis-source');
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].workspace_source_intake.source_refs, ['source:dataset']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].workspace_source_intake.material_refs, ['material:table1']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].workspace_source_intake.missing_material_attention_refs, ['material:irb']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].workspace_source_intake.authority_boundary.can_authorize_source_readiness, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].memory_locator_index.projection_scope, 'stage_attempt');
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].memory_locator_index.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].memory_locator_index.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].memory_locator_index.rejected_writes[0].reason, 'domain_truth_write_forbidden');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].memory_locator_index.authority_boundary.can_read_memory_body, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].package_export_lifecycle.projection_scope, 'stage_attempt');
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].package_export_lifecycle.package_refs, ['package:submission-minimal']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].package_export_lifecycle.export_refs, ['export:current-package']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].package_export_lifecycle.gap_report_refs, ['gap:package-readiness']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].package_export_lifecycle.handoff_refs, ['handoff:manual-submission']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].package_export_lifecycle.external_submission_status_ref, 'portal:manual-boundary');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].package_export_lifecycle.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].action_routing.routing_scope, 'stage_attempt');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].action_routing.summary.action_count, 12);
    assert.equal(
      snapshot.stage_attempt_workbench.attempts[0].action_routing.actions.some((action: { action_kind: string }) =>
        action.action_kind === 'projection_drilldown:artifact_gallery'
      ),
      true,
    );
    assert.equal(
      snapshot.stage_attempt_workbench.attempts[0].action_routing.actions.some((action: { route_target_kind: string; command_or_surface_ref: string }) =>
        action.route_target_kind === 'domain_sidecar' &&
        action.command_or_surface_ref === 'medautosci sidecar dispatch --task <task.json> --format json'
      ),
      true,
    );
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].action_routing.authority_boundary.can_execute_domain_action, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].filter_keys.domain_id, 'medautoscience');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].filter_keys.has_consumed_memory_refs, true);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].filter_keys.has_writeback_receipt_refs, true);
    assert.equal(snapshot.native_helper_execution_envelope.surface_kind, 'opl_native_helper_execution_envelope_projection');
    assert.equal(snapshot.native_helper_execution_envelope.envelope_scope, 'runtime_snapshot');
    assert.equal(snapshot.native_helper_execution_envelope.availability, 'native_execution_index_observed');
    assert.equal(snapshot.native_helper_execution_envelope.execution_policy, 'read_existing_native_index_only_no_helper_execution');
    assert.equal(snapshot.native_helper_execution_envelope.helper_indexes[0].helper_id, 'opl-state-indexer');
    assert.equal(snapshot.native_helper_execution_envelope.helper_indexes[0].result_surface_kind, 'native_state_index');
    assert.equal(snapshot.native_helper_execution_envelope.authority_boundary.can_execute_helper_without_operator, false);
    assert.equal(snapshot.native_helper_execution_envelope.authority_boundary.can_mutate_domain_artifact, false);
    const attemptItem = snapshot.attention_items.find((item: { item_id: string }) =>
      item.item_id === `opl:stage-attempt:${attempt.family_runtime_stage_attempt.attempt.stage_attempt_id}`
    );
    assert.ok(attemptItem);
    assert.equal(attemptItem.project_id, 'medautoscience');
    assert.equal(attemptItem.action_owner, 'opl');
    assert.equal(attemptItem.action_kind, 'quality_gate');
    assert.equal(attemptItem.command, `opl family-runtime attempt query ${attempt.family_runtime_stage_attempt.attempt.stage_attempt_id}`);
    assert.equal(attemptItem.stage_attempt_workbench.provider_completion_is_domain_ready, false);
    assert.equal(attemptItem.stage_attempt_workbench.completion_boundary.domain_ready_verdict, 'domain_gate_pending');
    assert.deepEqual(attemptItem.stage_attempt_workbench.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(attemptItem.stage_attempt_workbench.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(attemptItem.stage_attempt_workbench.lifecycle_primitives.artifact_locator_index.content_policy, 'locator_only_no_artifact_content');
    assert.equal(attemptItem.stage_attempt_workbench.lifecycle_primitives.restore_proof.opl_cleanup_allowed, false);
    assert.equal(attemptItem.stage_attempt_workbench.artifact_gallery.renderer_role, 'generic_artifact_gallery_handoff_shell');
    assert.equal(attemptItem.stage_attempt_workbench.artifact_gallery.summary.content_policy, 'locator_only_no_artifact_content');
    assert.equal(attemptItem.stage_attempt_workbench.artifact_gallery.authority_boundary.can_mutate_artifact, false);
    assert.equal(
      attemptItem.stage_attempt_workbench.lifecycle_primitives.authority_boundary.domain,
      'artifact_content_retention_restore_authority',
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.controlled_apply_contract.no_forbidden_write_proof.opl_writes_domain_artifact,
      false,
    );
    assert.equal(attemptItem.stage_attempt_workbench.rejected_writes[0].reason, 'domain_truth_write_forbidden');
    assert.equal(attemptItem.stage_attempt_workbench.route_decision_graph.renderer_role, 'generic_route_decision_graph_shell');
    assert.equal(attemptItem.stage_attempt_workbench.route_decision_graph.summary.route_decision_ref_observed, true);
    assert.equal(attemptItem.stage_attempt_workbench.route_decision_graph.authority_boundary.can_infer_route_decision, false);
    assert.equal(attemptItem.stage_attempt_workbench.review_repair_queue.transport_role, 'generic_review_repair_transport');
    assert.equal(attemptItem.stage_attempt_workbench.review_repair_queue.summary.rejected_write_count, 1);
    assert.equal(attemptItem.stage_attempt_workbench.review_repair_queue.authority_boundary.can_decide_repair, false);
    assert.equal(attemptItem.stage_attempt_workbench.quality_readiness.renderer_role, 'generic_quality_readiness_projection_shell');
    assert.equal(attemptItem.stage_attempt_workbench.quality_readiness.authority_boundary.can_authorize_submission_readiness, false);
    assert.equal(attemptItem.stage_attempt_workbench.observability_slo.transport_role, 'generic_observability_slo_repair_command_projection');
    assert.equal(attemptItem.stage_attempt_workbench.observability_slo.authority_boundary.can_execute_repair_command, false);
    assert.equal(attemptItem.stage_attempt_workbench.workspace_source_intake.shell_role, 'generic_workspace_source_intake_shell');
    assert.equal(attemptItem.stage_attempt_workbench.workspace_source_intake.authority_boundary.can_select_domain_profile, false);
    assert.equal(attemptItem.stage_attempt_workbench.memory_locator_index.index_role, 'generic_memory_locator_index_shell');
    assert.equal(attemptItem.stage_attempt_workbench.memory_locator_index.authority_boundary.can_accept_or_reject_writeback, false);
    assert.equal(attemptItem.stage_attempt_workbench.package_export_lifecycle.shell_role, 'generic_package_export_lifecycle_shell');
    assert.equal(attemptItem.stage_attempt_workbench.package_export_lifecycle.authority_boundary.can_authorize_package_readiness, false);
    assert.equal(attemptItem.stage_attempt_workbench.action_routing.routing_scope, 'stage_attempt');
    assert.equal(attemptItem.stage_attempt_workbench.action_routing.summary.domain_sidecar_route_count, 2);
    assert.equal(attemptItem.stage_attempt_workbench.action_routing.authority_boundary.can_execute_domain_action, false);
    assert.equal(attemptItem.stage_attempt_workbench.authority_boundary.opl_writes_memory_body, false);
    assert.equal(
      attemptItem.stage_attempt_workbench.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'stage_attempt_workbench'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot projects provider continuous proof receipt without domain readiness authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'residency', 'proof', '--provider', 'temporal', '--production'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.provider_continuous_proof.surface_kind, 'opl_temporal_provider_continuous_proof_projection');
    assert.equal(snapshot.provider_continuous_proof.proof_event_count, 1);
    assert.equal(typeof snapshot.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(snapshot.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(snapshot.provider_continuous_proof.proof_slo_status, 'proof_blocker_observed');
    assert.equal(snapshot.provider_continuous_proof.latest_closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(snapshot.provider_continuous_proof.latest_proof_receipt.receipt_status, 'blocked');
    assert.equal(snapshot.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready, false);
    const proofItem = snapshot.attention_items.find((item: { item_id: string }) =>
      item.item_id === 'opl:provider-continuous-proof:temporal'
    );
    assert.equal(proofItem.project_id, 'opl');
    assert.equal(proofItem.action_owner, 'infrastructure');
    assert.equal(proofItem.requires_user_action, false);
    assert.equal(proofItem.action_kind, 'infrastructure_recovery');
    assert.equal(proofItem.provider_continuous_proof.latest_closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(typeof proofItem.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(proofItem.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(proofItem.provider_continuous_proof.proof_slo_status, 'proof_blocker_observed');
    assert.equal(
      proofItem.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'provider_continuous_proof'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot workbench shows current managed Temporal readiness without rewriting attempt receipt', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-current-provider-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const service = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  service.unref();
  worker.unref();

  try {
    assert.equal(typeof service.pid, 'number');
    assert.equal(typeof worker.pid, 'number');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: service.pid,
      address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
      started_at: new Date().toISOString(),
      status: 'ready',
    }, null, 2)}\n`);
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_DISABLE_HERMES_ONLINE: '1',
    };
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'ai_reviewer_re_eval',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], env);

    const output = runCli(['runtime', 'snapshot'], env);
    const snapshot = output.runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.attempts[0];
    const attemptItem = [...snapshot.attention_items, ...snapshot.recent_items, ...snapshot.running_items].find(
      (item: { item_id: string }) =>
        item.item_id === `opl:stage-attempt:${created.family_runtime_stage_attempt.attempt.stage_attempt_id}`,
    );

    assert.equal(created.family_runtime_stage_attempt.attempt.provider_receipt.provider_ready, false);
    assert.equal(snapshot.runtime_health.status, 'running');
    assert.equal(workbenchAttempt.current_provider_readiness.provider_ready, true);
    assert.equal(workbenchAttempt.current_provider_readiness.status, 'ready');
    assert.equal(workbenchAttempt.current_provider_readiness.details.address_source, 'managed_local_service_state');
    assert.equal(
      workbenchAttempt.current_provider_readiness.provider_receipt_is_creation_time_snapshot,
      true,
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.attempt.current_provider_readiness.provider_ready,
      true,
    );
  } finally {
    process.kill(service.pid!, 'SIGTERM');
    process.kill(worker.pid!, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot lists proven provider continuous proof as recent operator evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-proven-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const proofCreatedAt = new Date().toISOString();
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_proven',
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
    ${JSON.stringify(proofCreatedAt)}
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

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const proofItem = snapshot.recent_items.find((item: { item_id: string }) =>
      item.item_id === 'opl:provider-continuous-proof:temporal'
    );

    assert.equal(snapshot.provider_continuous_proof.continuous_proof_status, 'all_observed_proofs_proven');
    assert.equal(proofItem.status, 'all_observed_proofs_proven');
    assert.equal(proofItem.action_owner, 'none');
    assert.equal(proofItem.requires_user_action, false);
    assert.equal(proofItem.provider_continuous_proof.latest_closeout_status, 'production_residency_proven');
    assert.equal(proofItem.provider_continuous_proof.latest_event_created_at, proofCreatedAt);
    assert.equal(typeof proofItem.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(proofItem.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(proofItem.provider_continuous_proof.proof_slo_status, 'proof_fresh');
    assert.equal(
      proofItem.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot routes stale proven provider proof to operator attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-stale-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_stale',
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
    '2026-05-13T00:00:00.000Z'
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

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_PROVIDER_PROOF_MAX_AGE_SECONDS: '1',
    });
    const snapshot = output.runtime_tray_snapshot;
    const proofItem = snapshot.attention_items.find((item: { item_id: string }) =>
      item.item_id === 'opl:provider-continuous-proof:temporal'
    );

    assert.equal(snapshot.provider_continuous_proof.continuous_proof_status, 'all_observed_proofs_proven');
    assert.equal(snapshot.provider_continuous_proof.proof_slo_status, 'proof_stale');
    assert.equal(proofItem.status, 'all_observed_proofs_proven');
    assert.equal(proofItem.status_label, 'Provider proof 已过期');
    assert.equal(proofItem.action_owner, 'infrastructure');
    assert.equal(proofItem.requires_user_action, false);
    assert.equal(proofItem.provider_continuous_proof.proof_freshness_status, 'stale');
    assert.equal(proofItem.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot projects multi-attempt workbench groups, filters, and attention counters', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-ledger-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const completedAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const completedAttemptId = completedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      completedAttemptId,
      '--stage-packet-ref',
      'packet:analysis',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_memory_refs":["memory:route-policy","memory:dataset-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"domain_ready_verdict":"domain_gate_pending"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });

    const gatedAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const gatedAttemptId = gatedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      gatedAttemptId,
      '--kind',
      'human_gate',
      '--payload',
      '{"human_gate_ref":"gate:review","reason":"operator_review"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      gatedAttemptId,
      '--kind',
      'user_instruction',
      '--payload',
      '{"instruction_ref":"user:review-note"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      gatedAttemptId,
      '--kind',
      'resume',
      '--payload',
      '{"resume_token":"resume:review"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const deadLetterAttempt = runCli([
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
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    const deadLetterAttemptId = deadLetterAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE stage_attempts SET status = 'human_gate' WHERE stage_attempt_id = ?").run(${JSON.stringify(gatedAttemptId)});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(deadLetterAttemptId)});
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

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const workbench = output.runtime_tray_snapshot.stage_attempt_workbench;
    const gated = workbench.attempts.find((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === gatedAttemptId);
    const completed = workbench.attempts.find((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === completedAttemptId);
    const deadLetter = workbench.attempts.find((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === deadLetterAttemptId);

    assert.equal(workbench.provider_completion_is_domain_ready, false);
    assert.equal(workbench.summary.total, 3);
    assert.equal(workbench.summary.by_domain.medautoscience, 1);
    assert.equal(workbench.summary.by_domain.redcube, 1);
    assert.equal(workbench.summary.by_domain.medautogrant, 1);
    assert.equal(workbench.summary.by_stage['analysis-campaign'], 1);
    assert.equal(workbench.summary.by_stage.review, 1);
    assert.equal(workbench.summary.by_stage.draft, 1);
    assert.equal(workbench.summary.by_status.completed, 1);
    assert.equal(workbench.summary.by_status.human_gate, 1);
    assert.equal(workbench.summary.by_status.dead_lettered, 1);
    assert.equal(workbench.summary.attention_count, 2);
    assert.equal(workbench.summary.human_gate_count, 1);
    assert.equal(workbench.summary.resume_count, 1);
    assert.equal(workbench.summary.dead_letter_count, 1);
    assert.equal(workbench.summary.memory_ref_counters.consumed_memory_ref_count, 2);
    assert.equal(workbench.summary.memory_ref_counters.writeback_receipt_ref_count, 1);
    assert.equal(workbench.summary.memory_ref_counters.attempts_with_consumed_memory_refs, 1);
    assert.equal(workbench.summary.memory_ref_counters.attempts_with_writeback_receipt_refs, 1);
    assert.equal(workbench.artifact_gallery.gallery_scope, 'stage_attempt_workbench');
    assert.equal(workbench.artifact_gallery.summary.attempt_count, 3);
    assert.equal(workbench.artifact_gallery.summary.attempt_with_artifact_ref_count, 1);
    assert.equal(workbench.artifact_gallery.summary.item_count, 2);
    assert.equal(workbench.artifact_gallery.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(workbench.route_decision_graph.graph_scope, 'stage_attempt_workbench');
    assert.equal(workbench.route_decision_graph.summary.attempt_count, 3);
    assert.equal(workbench.route_decision_graph.summary.route_evidence_attempt_count, 1);
    assert.equal(workbench.route_decision_graph.summary.route_decision_ref_count, 0);
    assert.equal(workbench.route_decision_graph.authority_boundary.can_write_domain_truth, false);
    assert.equal(workbench.review_repair_queue.queue_scope, 'stage_attempt_workbench');
    assert.equal(workbench.review_repair_queue.summary.attempt_count, 3);
    assert.equal(workbench.review_repair_queue.summary.attempt_with_queue_item_count, 2);
    assert.equal(workbench.review_repair_queue.summary.human_gate_count, 1);
    assert.equal(workbench.review_repair_queue.summary.dead_letter_count, 1);
    assert.equal(workbench.review_repair_queue.authority_boundary.can_authorize_review_verdict, false);
    assert.equal(workbench.action_routing.routing_scope, 'stage_attempt_workbench');
    assert.equal(workbench.action_routing.summary.attempt_count, 3);
    assert.equal(workbench.action_routing.summary.opl_cli_route_count, 3);
    assert.equal(workbench.action_routing.summary.app_surface_route_count, 27);
    assert.equal(workbench.action_routing.summary.provider_signal_route_count, 2);
    assert.equal(workbench.action_routing.summary.domain_sidecar_route_count, 3);
    assert.equal(workbench.action_routing.authority_boundary.can_execute_domain_action, false);
    assert.equal(workbench.action_routing.authority_boundary.can_execute_provider_signal, false);
    assert.equal(workbench.groups.by_domain.medautoscience.total, 1);
    assert.equal(workbench.groups.by_domain.medautoscience.memory_ref_counters.consumed_memory_ref_count, 2);
    assert.equal(workbench.groups.by_domain.redcube.human_gate_count, 1);
    assert.equal(workbench.groups.by_domain.redcube.resume_count, 1);
    assert.equal(workbench.groups.by_domain.medautogrant.dead_letter_count, 1);
    assert.equal(workbench.groups.by_status.human_gate.attempt_ids[0], gatedAttemptId);
    assert.equal(workbench.groups.by_status.dead_lettered.attempt_ids[0], deadLetterAttemptId);

    assert.equal(completed.filter_keys.domain_id, 'medautoscience');
    assert.equal(completed.filter_keys.stage_id, 'analysis-campaign');
    assert.equal(completed.filter_keys.status, 'completed');
    assert.equal(completed.filter_keys.has_consumed_memory_refs, true);
    assert.equal(completed.filter_keys.has_writeback_receipt_refs, true);
    assert.equal(gated.human_gate_ledger[0].payload.reason, 'operator_review');
    assert.equal(gated.user_instruction_ledger[0].payload.instruction_ref, 'user:review-note');
    assert.equal(gated.resume_ledger[0].payload.resume_token, 'resume:review');
    assert.deepEqual(gated.attention_flags, ['human_gate', 'resume_available']);
    assert.equal(gated.review_repair_queue.summary.human_gate_count, 1);
    assert.deepEqual(gated.review_repair_queue.items[0].human_gate_refs, ['gate:review']);
    assert.equal(gated.filter_keys.human_gate, true);
    assert.equal(gated.filter_keys.resume_available, true);
    assert.equal(deadLetter.dead_letter.reason, 'retry_budget_exhausted');
    assert.deepEqual(deadLetter.attention_flags, ['dead_lettered', 'blocked']);
    assert.equal(deadLetter.review_repair_queue.summary.dead_letter_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
