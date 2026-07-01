import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentLabArisMaturityControlsReadModel,
  buildAgentLabDomainFeedbackSelfEvolutionReadModel,
} from '../../src/agent-lab-complete.ts';

test('Agent Lab absorbs ARIS maturity controls as refs-only policies without ARIS runtime dependency', () => {
  const result = buildAgentLabArisMaturityControlsReadModel(['suite:opl-agent-lab-sample-suite']);

  assert.equal(result.surface_kind, 'opl_agent_lab_aris_maturity_controls_read_model');
  assert.equal(result.status, 'ready_for_agent_lab_control_plane_consumption');
  assert.equal(result.refs_only, true);
  assert.equal(result.runtime_dependency_required, false);
  assert.deepEqual(result.source_pattern_refs, [
    'aris:v0.4.11/effort-assurance-axis',
    'aris:v0.4.11/helper-drift-inventory-report',
    'aris:v0.4.11/permission-current-date-fail-closed',
    'aris:v0.4.11/mcp-stream-reliability-policy',
  ]);
  assert.equal(result.summary.control_count, 4);
  assert.deepEqual(result.controls.effort_assurance_axes.effort_axis.levels, [
    'quick_smoke',
    'standard_regression',
    'deep_soak',
    'owner_chain_proof',
  ]);
  assert.deepEqual(result.controls.effort_assurance_axes.assurance_axis.required_for_promotion, [
    'contract_gate',
    'independent_review',
    'no_forbidden_write_proof',
  ]);
  assert.equal(result.controls.helper_inventory_drift_report.drift_report_status,
    'inventory_current_no_silent_drift');
  assert.equal(result.controls.helper_inventory_drift_report.fail_policy,
    'fail_closed_on_missing_inventory_or_unverified_drift');
  assert.equal(result.controls.helper_inventory_drift_report.can_execute_helper, false);
  assert.ok(result.controls.helper_inventory_drift_report.inventory_refs.includes(
    'helper-inventory-ref:agent-lab/mcp-tools',
  ));
  assert.ok(result.controls.helper_inventory_drift_report.drift_guard_refs.includes(
    'drift-guard-ref:agent-lab/helper-command-contract-current',
  ));
  assert.ok(result.controls.fail_closed_invariants.required_context_refs.includes(
    'context-ref:agent-lab/current-date',
  ));
  assert.ok(result.controls.fail_closed_invariants.required_context_refs.includes(
    'context-ref:agent-lab/permission-scope',
  ));
  assert.equal(result.controls.fail_closed_invariants.missing_context_policy,
    'fail_closed_with_typed_blocker_ref');
  assert.match(result.controls.fail_closed_invariants.typed_blocker_ref, /^typed-blocker-ref:/);
  assert.equal(result.controls.mcp_stream_reliability_policy.no_silent_drop, true);
  assert.ok(result.controls.mcp_stream_reliability_policy.required_failure_outputs.includes(
    'retry_or_dead_letter_ref',
  ));
  assert.ok(result.controls.mcp_stream_reliability_policy.required_failure_outputs.includes('stream_replay_ref'));
  assert.ok(result.forbidden_payloads.includes('runtime_dependency'));
  assert.ok(result.forbidden_payloads.includes('mcp_payload_body'));
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);
  assert.equal(result.authority_boundary.can_modify_managed_runtime, false);
});

test('Agent Lab projects domain feedback work orders without creating a runner or domain authority', () => {
  const result = buildAgentLabDomainFeedbackSelfEvolutionReadModel({
    sourceRefs: ['suite-result:mas/domain-feedback'],
    externalSuiteRefs: ['external-suite-ref:mas/reviewer-feedback'],
    developerWorkOrderCandidateRefs: ['developer-work-order-candidate-ref:mas/reviewer-feedback-patch'],
    completionRefs: ['work-order-completion-ref:mas/reviewer-feedback-patch'],
    blockerRefs: ['typed-blocker-ref:mas/reviewer-feedback-owner-required'],
  });

  assert.equal(result.surface_kind, 'opl_agent_lab_domain_feedback_self_evolution_read_model');
  assert.equal(result.status, 'work_order_status_projection_ready');
  assert.equal(result.refs_only, true);
  assert.deepEqual(result.status_shape, ['queued', 'runnable', 'completed_or_blocker']);
  assert.equal(result.summary.work_order_count, 3);
  assert.equal(result.summary.queued_count, 1);
  assert.equal(result.summary.runnable_count, 1);
  assert.equal(result.summary.completed_or_blocker_count, 1);
  assert.deepEqual(result.status_buckets.queued, ['feedback-work-order:mas/external-suite-feedback-intake']);
  assert.deepEqual(result.status_buckets.runnable, ['feedback-work-order:mas/developer-work-order-candidate']);
  assert.deepEqual(result.status_buckets.completed_or_blocker, [
    'feedback-work-order:agent-lab/completed-or-blocker-readback',
  ]);

  const runnable = result.work_order_status_items.find((item) => item.status === 'runnable');
  assert.ok(runnable);
  assert.equal(runnable.runnable, true);
  assert.equal(runnable.execution_surface, 'opl work-order execute');
  assert.equal(runnable.execution_precondition, 'materialized_developer_work_order_file_required');
  assert.equal(runnable.developer_work_order_candidate_ref,
    'developer-work-order-candidate-ref:mas/reviewer-feedback-patch');

  const terminal = result.work_order_status_items.find((item) => item.status === 'completed_or_blocker');
  assert.ok(terminal);
  assert.equal(terminal.terminal, true);
  assert.equal(terminal.terminal_outcome, 'blocked_with_domain_owned_typed_blocker_ref');
  assert.equal(terminal.completion_ref, 'work-order-completion-ref:mas/reviewer-feedback-patch');
  assert.equal(terminal.blocker_ref, 'typed-blocker-ref:mas/reviewer-feedback-owner-required');

  assert.equal(result.app_projection.action_surface_is_existing_primitive, true);
  assert.equal(result.app_projection.creates_runner_or_queue, false);
  assert.equal(result.app_projection.writes_runtime_db, false);
  assert.equal(result.app_projection.writes_provider_queue, false);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.authority_boundary.can_create_owner_receipt, false);
  assert.equal(result.authority_boundary.can_create_typed_blocker, false);
  assert.equal(result.authority_boundary.can_create_human_gate, false);
  assert.equal(result.authority_boundary.can_write_runtime_db, false);
  assert.equal(result.non_goals.includes('second_runner_or_queue'), true);
});
