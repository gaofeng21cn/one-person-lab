import { spawnSync } from 'node:child_process';

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
    assert.equal(snapshot.stage_attempt_workbench.action_routing.summary.action_count, 13);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.summary.domain_sidecar_route_count, 2);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.authority_boundary.can_execute_domain_action, false);
    assert.equal(snapshot.stage_attempt_workbench.action_routing.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.summary.operator_conflict_count, 2);
    assert.equal(snapshot.stage_attempt_workbench.operator_conflicts.length, 2);
    assert.equal(snapshot.operator_conflicts.length, 2);
    assert.equal(
      snapshot.operator_conflicts.some((envelope: { classification: string; authority_boundary: { provider_completion_is_domain_ready: boolean } }) =>
        envelope.classification === 'evidence_blocker'
        && envelope.authority_boundary.provider_completion_is_domain_ready === false
      ),
      true,
    );
    assert.equal(
      snapshot.stage_attempt_workbench.attempts[0].operator_conflicts.some((envelope: { classification: string }) =>
        envelope.classification === 'authority_conflict'
      ),
      true,
    );
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.surface_kind, 'opl_stage_attempt_control_loop_summary');
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.projection_scope, 'stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.summary.attempt_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.summary.route_decision_attempt_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.summary.action_route_count, 13);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.summary.receipt_ref_count, 2);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.summary.blocker_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.summary.human_gate_count, 0);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.summary.dead_letter_count, 0);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.authority_boundary.can_execute_domain_action, false);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.authority_boundary.can_write_domain_truth, false);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(snapshot.stage_attempt_workbench.control_loop_summary.authority_boundary.provider_completion_is_domain_ready, false);
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
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].action_routing.summary.action_count, 13);
    assert.equal(
      snapshot.stage_attempt_workbench.attempts[0].action_routing.actions.some((action: { action_kind: string }) =>
        action.action_kind === 'projection_drilldown:lifecycle_primitives'
      ),
      true,
    );
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
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.projection_scope, 'stage_attempt');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.trigger.source_fingerprint, 'sha256:analysis-source');
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.trigger.stage_packet_refs, [
      'packet:analysis',
    ]);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.decision.decision, 'bounded_repair');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.action_route.next_owner, 'med-autoscience');
    assert.equal(
      snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.action_route.route_refs.includes(
        'domain_owner:med-autoscience',
      ),
      true,
    );
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.receipts.receipt_refs, [
      'receipt:analysis-closeout',
      'memory-writeback:receipt-1',
    ]);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.retry_budget.attempt_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.retry_budget.retry_budget.max_attempts, 3);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.state.blocker_status, 'blocked_by_attention');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.state.human_gate, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.state.dead_letter, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.authority_boundary.can_execute_domain_action, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.authority_boundary.can_write_domain_truth, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].control_loop_summary.authority_boundary.can_authorize_quality_verdict, false);
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
    assert.equal(attemptItem.stage_attempt_workbench.control_loop_summary.receipts.receipt_refs[0], 'receipt:analysis-closeout');
    assert.equal(
      attemptItem.stage_attempt_workbench.control_loop_summary.action_route.route_refs.includes(
        'medautosci sidecar dispatch --task <task.json> --format json',
      ),
      true,
    );
    assert.equal(attemptItem.stage_attempt_workbench.control_loop_summary.authority_boundary.can_execute_domain_action, false);
    assert.equal(attemptItem.stage_attempt_workbench.control_loop_summary.authority_boundary.can_write_domain_truth, false);
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

test('runtime snapshot exposes route-impact no-regression evidence in operator workbench refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-no-regression-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'proposal_authoring',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mag',
        controlled_stage_attempt: {
          action_kind: 'grant_stage_attempt_apply',
          contract_id: 'opl_temporal_controlled_stage_attempt_apply_contract',
        },
      }),
      '--source-fingerprint',
      'sha256:mag-no-regression',
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
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['mag-closeout:proposal-authoring'],
        consumed_refs: ['mag-evidence:proposal-authoring'],
        next_owner: 'med-autogrant',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'no_regression_evidence',
          no_regression_evidence_ref: 'receipt:mag:no-regression',
          no_regression_evidence_observed: true,
          direct_skill_ref: 'skill:medautogrant',
          direct_skill_command: 'medautogrant product-entry status --format json',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attemptId,
    );
    const attemptItem = [...snapshot.attention_items, ...snapshot.recent_items, ...snapshot.running_items].find(
      (item: { item_id: string }) => item.item_id === `opl:stage-attempt:${attemptId}`,
    );

    assert.equal(workbenchAttempt.controlled_apply_contract.apply_status, 'no_regression_evidence_observed');
    assert.deepEqual(workbenchAttempt.controlled_apply_contract.no_regression_evidence_refs, [
      'receipt:mag:no-regression',
    ]);
    assert.deepEqual(attemptItem.stage_attempt_workbench.controlled_apply_contract.no_regression_evidence_refs, [
      'receipt:mag:no-regression',
    ]);
    assert.equal(
      workbenchAttempt.artifact_gallery.items.some((item: { ref: string }) =>
        item.ref === 'receipt:mag:no-regression'
      ),
      true,
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.artifact_gallery.items.some((item: { ref: string }) =>
        item.ref === 'receipt:mag:no-regression'
      ),
      true,
    );
    assert.equal(workbenchAttempt.action_routing.summary.direct_skill_route_count, 2);
    assert.equal(
      workbenchAttempt.action_routing.actions.some((action: { route_target_kind: string; command_or_surface_ref: string }) =>
        action.route_target_kind === 'direct_skill' &&
        action.command_or_surface_ref === 'skill:medautogrant'
      ),
      true,
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.action_routing.actions.some((action: { route_target_kind: string; command_or_surface_ref: string }) =>
        action.route_target_kind === 'direct_skill' &&
        action.command_or_surface_ref === 'medautogrant product-entry status --format json'
      ),
      true,
    );
    assert.equal(workbenchAttempt.action_routing.authority_boundary.can_execute_direct_skill, false);
    assert.equal(workbenchAttempt.controlled_apply_contract.no_forbidden_write_proof.opl_writes_domain_artifact, false);
    assert.equal(attemptItem.stage_attempt_workbench.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot exposes lifecycle guarded-apply receipt refs in operator artifact gallery', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-lifecycle-receipt-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const workspaceLocator = {
      workspace_root: '/tmp/rca',
      runtime_root: '/tmp/rca/runtime',
      artifact_root: '/tmp/rca/artifacts',
      lifecycle_apply_requests: [
        {
          action_id: 'cleanup-visual-runtime-cache',
          action_kind: 'safe_cleanup',
          target_ref: 'artifact:rca:runtime-cache',
          authority_owner: 'redcube',
          owner_scope: 'domain_owned_artifact',
          restore_ref: 'restore:rca:runtime-cache',
          domain_receipt_ref: 'receipt:rca:lifecycle-cleanup',
        },
      ],
    };
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'visual-review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(workspaceLocator),
      '--source-fingerprint',
      'sha256:rca-lifecycle-receipt',
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
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['rca-closeout:visual-review'],
        consumed_refs: ['rca-artifact:review-delta'],
        next_owner: 'redcube',
        domain_ready_verdict: 'domain_gate_pending',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attemptId,
    );
    const attemptItem = [...snapshot.attention_items, ...snapshot.recent_items, ...snapshot.running_items].find(
      (item: { item_id: string }) => item.item_id === `opl:stage-attempt:${attemptId}`,
    );

    assert.equal(workbenchAttempt.lifecycle_primitives.guarded_apply_proof.apply_status, 'domain_receipt_observed');
    assert.equal(
      workbenchAttempt.lifecycle_primitives.guarded_apply_proof.summary.domain_receipt_observed_count,
      1,
    );
    assert.equal(workbenchAttempt.lifecycle_primitives.guarded_apply_proof.summary.domain_writes_performed, false);
    assert.equal(
      workbenchAttempt.lifecycle_primitives.guarded_apply_proof.actions[0].apply_decision,
      'domain_receipt_observed',
    );
    assert.equal(
      workbenchAttempt.lifecycle_primitives.guarded_apply_proof.actions[0].domain_receipt_ref.ref,
      'receipt:rca:lifecycle-cleanup',
    );
    assert.equal(
      workbenchAttempt.artifact_gallery.items.some((item: { ref: string }) =>
        item.ref === 'receipt:rca:lifecycle-cleanup'
      ),
      true,
    );
    assert.equal(
      workbenchAttempt.artifact_gallery.items.some((item: { ref: string }) =>
        item.ref === 'restore:rca:runtime-cache'
      ),
      true,
    );
    assert.equal(workbenchAttempt.artifact_gallery.summary.lifecycle_restore_ref_count, 1);
    assert.equal(workbenchAttempt.artifact_gallery.summary.lifecycle_domain_receipt_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.summary.lifecycle_restore_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.artifact_gallery.summary.lifecycle_domain_receipt_ref_count, 1);
    assert.equal(
      attemptItem.stage_attempt_workbench.artifact_gallery.items.some((item: { ref: string }) =>
        item.ref === 'receipt:rca:lifecycle-cleanup'
      ),
      true,
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.lifecycle_primitives.guarded_apply_proof.apply_status,
      'domain_receipt_observed',
    );
    assert.equal(attemptItem.stage_attempt_workbench.artifact_gallery.authority_boundary.can_mutate_artifact, false);
    assert.equal(attemptItem.stage_attempt_workbench.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot exposes transition bridge owner evidence as refs-only operator projection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-transition-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const workspaceLocator = {
      workspace_root: '/tmp/mag',
      transition_bridge: {
        surface_kind: 'opl_family_transition_provider_bridge',
        transition_id: 'call_intake_complete_to_fundability_strategy',
        transition_status: 'transition_applied',
        current_state: 'call_and_candidate_intake',
        next_state: 'fundability_strategy',
        event: 'domain_tick',
        owner_route: {
          owner: 'med-autogrant',
          route_ref: 'mag-transition:call_intake_complete_to_fundability_strategy',
        },
        evidence: {
          receipt_refs: ['mag-transition-receipt:intake_handoff_receipt'],
          owner_receipt_refs: ['mag-owner-receipt:intake_handoff_receipt'],
          no_regression_evidence_refs: ['mag-no-regression:intake_handoff'],
          typed_blocker_refs: ['mag-blocker:fundability-owner-followup'],
          typed_blockers: [
            {
              blocker_id: 'mag-blocker:fundability-owner-followup',
              reason: 'domain_owner_followup_required',
              refs: ['mag-blocker:fundability-owner-followup'],
            },
          ],
          domain_owner_receipt_observed: true,
          no_regression_evidence_observed: true,
          typed_blocker_count: 1,
          opl_evidence_boundary: 'refs_only_no_domain_verdict_authority',
        },
        opl_executes_domain_action: false,
        opl_writes_domain_truth: false,
        opl_authorizes_domain_verdict: false,
        domain_owner_receipt_required: true,
      },
    };
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'family_transition:call_intake_complete_to_fundability_strategy',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(workspaceLocator),
      '--source-fingerprint',
      'sha256:mag-transition-workbench',
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
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['mag-closeout:transition-provider-attempt'],
        consumed_refs: ['mag-oracle-fixture:call_intake_ready_to_fundability_strategy'],
        next_owner: 'med-autogrant',
        domain_ready_verdict: 'domain_gate_pending',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attemptId,
    );
    const attemptItem = [...snapshot.attention_items, ...snapshot.recent_items, ...snapshot.running_items].find(
      (item: { item_id: string }) => item.item_id === `opl:stage-attempt:${attemptId}`,
    );

    assert.equal(snapshot.stage_attempt_workbench.transition_bridge_evidence.projection_scope, 'stage_attempt_workbench');
    assert.equal(
      snapshot.stage_attempt_workbench.transition_bridge_evidence.summary.attempt_with_transition_bridge_count,
      1,
    );
    assert.equal(snapshot.stage_attempt_workbench.transition_bridge_evidence.summary.owner_receipt_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.transition_bridge_evidence.summary.no_regression_evidence_ref_count, 1);
    assert.equal(snapshot.stage_attempt_workbench.transition_bridge_evidence.summary.typed_blocker_ref_count, 1);
    assert.deepEqual(snapshot.stage_attempt_workbench.filter_metadata.transition_bridge_flags, [
      'has_transition_bridge',
      'has_transition_owner_receipt_refs',
      'has_transition_no_regression_evidence_refs',
      'has_transition_typed_blockers',
    ]);
    assert.equal(
      snapshot.stage_attempt_workbench.transition_bridge_evidence.authority_boundary.can_execute_domain_action,
      false,
    );
    assert.equal(workbenchAttempt.transition_bridge_evidence.transition_id, 'call_intake_complete_to_fundability_strategy');
    assert.equal(workbenchAttempt.transition_bridge_evidence.domain_owner_receipt_required, true);
    assert.deepEqual(workbenchAttempt.transition_bridge_evidence.evidence.receipt_refs, [
      'mag-transition-receipt:intake_handoff_receipt',
    ]);
    assert.deepEqual(workbenchAttempt.transition_bridge_evidence.evidence.owner_receipt_refs, [
      'mag-owner-receipt:intake_handoff_receipt',
    ]);
    assert.deepEqual(workbenchAttempt.transition_bridge_evidence.evidence.no_regression_evidence_refs, [
      'mag-no-regression:intake_handoff',
    ]);
    assert.deepEqual(workbenchAttempt.transition_bridge_evidence.evidence.typed_blocker_refs, [
      'mag-blocker:fundability-owner-followup',
    ]);
    assert.equal(workbenchAttempt.transition_bridge_evidence.evidence.domain_owner_receipt_observed, true);
    assert.equal(workbenchAttempt.transition_bridge_evidence.evidence.no_regression_evidence_observed, true);
    assert.equal(workbenchAttempt.transition_bridge_evidence.evidence.typed_blocker_count, 1);
    assert.equal(
      workbenchAttempt.transition_bridge_evidence.evidence.opl_evidence_boundary,
      'refs_only_no_domain_verdict_authority',
    );
    assert.equal(
      workbenchAttempt.transition_bridge_evidence.authority_boundary.can_authorize_domain_verdict,
      false,
    );
    assert.equal(workbenchAttempt.filter_keys.has_transition_bridge, true);
    assert.equal(workbenchAttempt.filter_keys.has_transition_owner_receipt_refs, true);
    assert.equal(workbenchAttempt.filter_keys.has_transition_no_regression_evidence_refs, true);
    assert.equal(workbenchAttempt.filter_keys.has_transition_typed_blockers, true);
    assert.equal(
      workbenchAttempt.action_routing.actions.some((action: { action_kind: string }) =>
        action.action_kind === 'projection_drilldown:transition_bridge_evidence'
      ),
      true,
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.transition_bridge_evidence.evidence.owner_receipt_refs[0],
      'mag-owner-receipt:intake_handoff_receipt',
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.transition_bridge_evidence.authority_boundary.can_write_domain_truth,
      false,
    );
    assert.equal(attemptItem.stage_attempt_workbench.provider_completion_is_domain_ready, false);
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
    assert.equal(workbench.action_routing.summary.app_surface_route_count, 30);
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
    assert.equal(workbench.operator_conflicts.length >= 2, true);
    assert.equal(output.runtime_tray_snapshot.operator_conflicts.length >= 2, true);
    assert.equal(
      output.runtime_tray_snapshot.operator_conflicts.some((envelope: { classification: string; status: string }) =>
        envelope.classification === 'human_gate' && envelope.status === 'waiting_for_human'
      ),
      true,
    );
    assert.equal(
      output.runtime_tray_snapshot.operator_conflicts.some((envelope: { classification: string; status: string }) =>
        envelope.classification === 'execution_retryable' && envelope.status === 'dead_lettered'
      ),
      true,
    );
    assert.equal(deadLetter.review_repair_queue.summary.dead_letter_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
