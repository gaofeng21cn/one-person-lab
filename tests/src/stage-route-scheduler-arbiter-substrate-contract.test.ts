import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;
}

test('stage route scheduler contract declares the OPL arbiter substrate against false running and no-progress loops', () => {
  const contract = readJson('contracts/opl-framework/stage-route-scheduler-contract.json');
  const substrate = contract.stage_route_arbiter_substrate_contract as Record<string, any>;

  assert.equal(substrate.surface_kind, 'opl_stage_route_arbiter_substrate_contract');
  assert.equal(substrate.owner, 'one-person-lab');
  assert.deepEqual(substrate.ordinary_path, [
    'fresh_current_owner_delta',
    'domain_provider_admission_identity',
    'stage_run_currentness_identity',
    'provider_attempt_or_owner_callable',
    'terminal_closeout_packet_ref',
    'domain_closeout_consumption_ref',
    'next_current_owner_delta_or_typed_blocker',
  ]);
  assert.deepEqual(substrate.currentness_precedence, [
    'terminal_closeout_for_same_stage_attempt',
    'strict_live_attempt_for_same_identity',
    'accepted_closeout_or_executed_typed_blocker_for_same_identity',
    'fresh_provider_admission_identity',
    'stable_domain_typed_blocker',
    'diagnostic_or_stale_residue',
  ]);

  const surfaces = substrate.required_substrate_surfaces as Record<string, any>;
  const identity = surfaces.stage_run_currentness_identity;
  assert.equal(
    identity.implementation_ref,
    'src/family-runtime-stage-run-currentness-identity.ts#buildStageRunCurrentnessIdentity',
  );
  assert.equal(
    identity.test_ref,
    'tests/src/family-runtime-stage-run-currentness-identity.test.ts',
  );
  for (const field of [
    'domain_id',
    'study_id_or_quest_id',
    'stage_attempt_id',
    'action_type',
    'work_unit_id',
    'work_unit_fingerprint',
    'truth_epoch',
    'runtime_health_epoch',
    'source_eval_id',
    'idempotency_key',
    'dispatch_ref',
    'stage_packet_ref',
    'stage_packet_refs',
  ]) {
    assert.ok(identity.required_fields.includes(field));
  }
  assert.equal(
    identity.match_policy,
    'all_required_current_owner_delta_provider_admission_selected_dispatch_and_stage_packet_fields_must_match; missing route_identity_key, attempt_idempotency_key, dispatch_ref, stage_packet_ref, or stage_packet_refs fails closed',
  );
  assert.equal(
    identity.missing_identity_effect,
    'fail_closed_no_stage_run_currentness_match_no_live_skip_no_terminal_reconcile',
  );
  assert.ok(identity.reset_evidence.includes('domain_owner_receipt_ref'));
  assert.ok(identity.reset_evidence.includes('typed_blocker_ref'));
  assert.ok(identity.reset_evidence.includes('provider_hard_gate_clearance'));

  const terminalOrdering = surfaces.terminal_closeout_precedes_live_projection;
  assert.ok(terminalOrdering.required_observations.includes('typed_closeout_packet_ref_or_blocker_ref'));
  assert.ok(terminalOrdering.required_observations.includes('linked_queue_task_identity'));
  assert.equal(terminalOrdering.forbidden_fallbacks.includes('active_run_id_non_null'), true);
  assert.equal(terminalOrdering.forbidden_fallbacks.includes('stale_transport_status'), true);

  const budget = surfaces.no_progress_budget_contract;
  assert.deepEqual(budget.budget_scope, [
    'domain_id',
    'study_id_or_quest_id',
    'action_type',
    'work_unit_id',
    'work_unit_fingerprint',
    'source_eval_id',
  ]);
  for (const noProgressClass of [
    'read_model_reconcile_only',
    'stale_route_redrive_only',
    'platform_repair_only',
    'owner_output_already_current',
    'no_deliverable_delta',
  ]) {
    assert.ok(budget.no_progress_classes.includes(noProgressClass));
  }
  assert.equal(
    budget.budget_exhaustion_action,
    'freeze_default_redrive_and_project_stop_loss_state_until_fresh_owner_delta_domain_answer_human_decision_or_provider_hard_gate_clearance',
  );
  assert.equal(budget.budget_exhaustion_terminal_blocker_code, 'anti_loop_budget_exhausted');
  assert.equal(budget.same_work_unit_redrive_after_budget_exhaustion_allowed, false);
  assert.equal(
    budget.successor_admission_policy.default_successor_action_type,
    'publishability_repair_sprint',
  );
  assert.equal(
    budget.successor_admission_policy.default_successor_work_unit_id,
    'publishability_repair_sprint_after_anti_loop_budget_exhausted',
  );
  assert.equal(
    budget.successor_admission_policy.identity_must_differ_by_any_of.includes('source_fingerprint'),
    true,
  );
  assert.equal(budget.successor_admission_policy.stable_operator_or_human_gate_allowed, true);
  assert.equal(budget.successor_admission_policy.authority_boundary.can_create_owner_receipt, false);
  assert.ok(budget.counts_as_progress_refs.includes('domain_owner_receipt_ref'));
  assert.ok(budget.counts_as_progress_refs.includes('paper_or_artifact_delta_ref'));

  const workerStale = surfaces.worker_source_stale_supervisor_projection;
  assert.equal(workerStale.status, 'fail_closed_supervisor_guard');
  assert.ok(workerStale.automatic_restart_allowed_when.includes('active_stage_attempt_count_is_zero'));
  assert.ok(workerStale.blocked_when_active_attempt_states.includes('running'));
  assert.ok(workerStale.blocked_when_active_attempt_states.includes('human_gate'));

  const traceRefs = surfaces.trace_span_correlation_refs;
  assert.ok(traceRefs.required_ref_families.includes('workflow_ref'));
  assert.ok(traceRefs.required_ref_families.includes('domain_receipt_or_blocker_ref'));
  assert.equal(
    traceRefs.policy,
    'observability links are refs-only drilldown evidence and never a planning root or domain authority source',
  );

  const attemptList = surfaces.attempt_list_audit_safe_readout;
  assert.equal(
    attemptList.implementation_ref,
    'src/family-runtime-stage-attempt-monitoring.ts#listStageAttemptsWithMonitoringProjection',
  );
  assert.equal(attemptList.test_ref, 'tests/src/cli/cases/family-runtime-stage-attempt-monitoring.test.ts');
  assert.equal(
    attemptList.default_unfiltered_policy,
    'unfiltered_json_attempt_list_defaults_to_compact_timeline_audit_safe_readout',
  );
  assert.equal(attemptList.default_limit, 25);
  for (const requiredShape of [
    'view_mode=compact_timeline',
    'filters.compact_timeline=true',
    'summary.compact_timeline_limit=25',
    'items=array',
    'attempts=array',
    'compact_timeline=array',
  ]) {
    assert.ok(attemptList.required_default_shape.includes(requiredShape));
  }
  for (const heavyField of ['provider_run', 'activity_events', 'route_impact']) {
    assert.ok(attemptList.omitted_heavy_fields_default.includes(heavyField));
  }
  assert.ok(attemptList.consumer_must_not_interpret.includes('compact_timeline_omitted_total_as_no_active_attempts'));
  assert.ok(attemptList.consumer_must_not_interpret.includes('provider_readiness_projection_as_domain_progress'));
  assert.equal(attemptList.authority_boundary.opl_can_project_bounded_attempt_readout, true);
  assert.equal(attemptList.authority_boundary.opl_can_infer_no_active_attempts_from_bounded_readout, false);
  assert.equal(attemptList.authority_boundary.opl_can_restart_worker_from_bounded_readout_only, false);
  assert.equal(attemptList.authority_boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(attemptList.authority_boundary.provider_completion_is_domain_ready, false);

  const domainProgress = substrate.domain_progress_transition_runtime_first_slice;
  assert.equal(
    domainProgress.surface_kind,
    'opl_domain_progress_transition_runtime_first_slice',
  );
  assert.equal(
    domainProgress.status,
    'runtime_slice_landed_non_ready',
  );
  assert.equal(
    domainProgress.implementation_refs.runtime_source,
    'src/family-runtime-domain-progress-transition-runtime.ts',
  );
  assert.equal(
    domainProgress.implementation_refs.current_control_consumer,
    'src/family-runtime-domain-intake-parts/current-control-provider-admission.ts',
  );
  assert.equal(domainProgress.brand_module_partition.module_count_policy, 'no_new_brand_module');
  assert.match(domainProgress.brand_module_partition.Runway, /exactly-one transition/);
  assert.match(domainProgress.brand_module_partition.Pack, /transition request and normalized command\/outbox\/event shape/);
  assert.match(domainProgress.brand_module_partition.Console, /observed_generation/);
  assert.deepEqual(domainProgress.allowed_transition_decisions, [
    'execute_current_owner_delta',
    'consume_terminal_closeout',
    'materialize_recovery_action',
    'wait_for_owner_with_resume_token',
    'stop_with_stable_typed_blocker',
    'stop_with_owner_receipt',
  ]);
  assert.equal(domainProgress.decision_surface_policy.read_model_can_execute, false);
  assert.equal(domainProgress.decision_surface_policy.observability_can_close_owner_answer, false);
  assert.match(
    domainProgress.concepts.TransitionObligationStore.landed_support,
    /domain transition request or OPL-native command record/,
  );
  assert.match(
    domainProgress.concepts.TransitionObligationStore.landed_support,
    /aggregate\/study\/work-unit identity/,
  );
  assert.match(
    domainProgress.concepts.TransitionObligationStore.landed_support,
    /without domain truth authority/,
  );
  assert.equal(domainProgress.concepts.TransitionObligationStore.durable_substrate_first_slice.obligation_store, 'append_only_physical_jsonl_identity_bound');
  assert.equal(
    domainProgress.concepts.TransitionObligationStore.durable_substrate_first_slice.command_event_log,
    'in_memory_jsonl_friendly_append_only_command_event_outbox_entries',
  );
  assert.equal(
    domainProgress.concepts.TransitionObligationStore.durable_substrate_first_slice.idempotency_readback,
    'command_event_outbox_transaction_readback_by_idempotency_key',
  );
  assert.equal(domainProgress.concepts.TransitionObligationStore.durable_substrate_first_slice.closeout_inbox, 'append_only_physical_jsonl_pending_consumed_rejected_identity_bound');
  assert.equal(
    domainProgress.concepts.TransitionObligationStore.durable_substrate_first_slice.same_identity_redrive_policy,
    'fail_closed_when_decision_is_not_current_latest_for_identity',
  );
  assert.match(
    domainProgress.concepts.TransitionObligationStore.remaining_gap,
    /provider-backed runtime soak/,
  );
  assert.match(
    domainProgress.concepts.TransitionDecisionEngine.landed_support,
    /DomainProgressTransitionRuntime first slice/,
  );
  assert.match(
    domainProgress.concepts.TransitionDecisionEngine.landed_support,
    /domain transition request or OPL-native command identity is required/,
  );
  assert.match(
    domainProgress.concepts.TransitionDecisionEngine.landed_support,
    /legacy supervisor apply alias is fail-closed/,
  );
  assert.match(
    domainProgress.concepts.TransitionDecisionEngine.landed_support,
    /NonAdvancingApply is projected as metadata rather than progress/,
  );
  assert.equal(domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.ledger, 'append_only_physical_jsonl');
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.transactional_outbox,
    'event_and_outbox_item_share_one_runtime_transaction_result_with_dedupe_readback',
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.fixed_point_reconciler,
    'observations_and_command_produce_exactly_one_transition_or_non_advancing_apply',
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.replay_harness,
    'multi_step_trace_exposes_step_evidence_for_exactly_one_or_non_advancing_apply',
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.human_gate_resume_token,
    'transport_shape_landed_without_opl_supplying_human_or_domain_answer',
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.read_model_rebuild_metadata,
    'derived_from_event_id_observed_generation_derived_generation_authority_false',
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.current_latest_policy,
    'exactly_one_latest_current_decision_per_obligation_identity',
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.durable_substrate_first_slice.queue_empty_terminal_evidence,
    false,
  );
  assert.match(
    domainProgress.concepts.TransitionDecisionEngine.remaining_gap,
    /end-to-end runtime soak/,
  );
  assert.ok(
    domainProgress.concepts.TransitionDecisionEngine.required_decision_refs.stop_with_owner_receipt.includes(
      'owner_receipt_ref',
    ),
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.runtime_apply_targets.stop_with_owner_receipt.kind,
    'owner_receipt_consumption',
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.runtime_apply_targets.stop_with_owner_receipt.provider_admission_required,
    false,
  );
  assert.equal(
    domainProgress.concepts.TransitionDecisionEngine.runtime_apply_targets.stop_with_owner_receipt.authority_boundary.opl_can_create_domain_owner_receipt,
    false,
  );
  assert.equal(
    domainProgress.concepts.ReadModelMetadataKernel.forbidden_payload.includes('paper_body'),
    true,
  );
  assert.ok(domainProgress.not_complete_claims.includes(
    'execute_decision_runtime_admission_path_does_not_mean_all_six_decisions_have_provider_tick_or_owner_runtime',
  ));
  assert.ok(domainProgress.not_complete_claims.includes(
    'mapping_landed_does_not_mean_domain_progress_transition_runtime_landed',
  ));

  assert.equal(
    substrate.current_control_admission_currentness_policy_ref,
    'current_control_admission_currentness_policy',
  );
  assert.equal(substrate.authority_boundary.opl_can_reconcile_attempt_ledger, true);
  assert.equal(substrate.authority_boundary.opl_can_restart_worker_without_supervisor_guard, false);
  assert.equal(substrate.authority_boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(substrate.authority_boundary.opl_can_create_domain_typed_blocker, false);
  assert.equal(substrate.authority_boundary.provider_completion_is_domain_ready, false);
});
