import { spawnSync } from 'node:child_process';
import { after } from 'node:test';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import './agent-lab-cases/export-and-cost.ts';
import './agent-lab-loop-risk.test.ts';

const agentLabCliStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-cli-state-'));
const previousOplStateDir = process.env.OPL_STATE_DIR;
process.env.OPL_STATE_DIR = agentLabCliStateRoot;
after(() => {
  if (previousOplStateDir === undefined) {
    delete process.env.OPL_STATE_DIR;
  } else {
    process.env.OPL_STATE_DIR = previousOplStateDir;
  }
  fs.rmSync(agentLabCliStateRoot, { recursive: true, force: true });
});

function stageCompletionPolicy(policyRef: string) {
  return {
    surface_kind: 'domain_stage_completion_policy',
    policy_ref: policyRef,
    completion_judgment_owner: 'domain_stage',
    closeout_packet_required: true,
    provider_completion_is_domain_completion: false,
    opl_content_judgment_allowed: false,
    next_stage_transition_owner: 'opl_runtime',
    required_closeout_outcomes: [
      'completed_and_continue',
      'completed_and_wait_owner',
      'route_back',
      'blocked',
      'rejected',
    ],
    accepted_closeout_ref_fields: [
      'owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'route_back_ref',
    ],
    authority_boundary: {
      opl_can_decide_domain_completion: false,
      provider_completion_counts_as_stage_complete: false,
    },
  };
}

test('agent-lab sample exposes a minimal framework read-model sample', () => {
  const output = runCli(['agent-lab', 'sample', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_sample.surface_id, 'opl_agent_lab_framework_sample');
  assert.equal(output.agent_lab_sample.sample_result.surface_kind, 'opl_agent_lab_suite_result');
  assert.equal(output.agent_lab_sample.sample_result.status, 'passed');
  assert.equal(output.agent_lab_sample.sample_result.summary.task_count, 3);
  assert.equal(output.agent_lab_sample.sample_result.summary.recovery_probe_count, 5);
  assert.equal(output.agent_lab_sample.sample_result.summary.scorecard_passed_count, 3);
  assert.equal(output.agent_lab_sample.sample_result.summary.ai_review_approved_count, 0);
  assert.equal(output.agent_lab_sample.sample_result.summary.promotable_candidate_count, 0);
  assert.equal(output.agent_lab_sample.sample_result.summary.promotion_gate_passed_count, 3);
  assert.equal(output.agent_lab_sample.sample_result.summary.stage_completion_policy_blocker_count, 0);
  assert.equal(output.agent_lab_sample.sample_result.observations.domain_stage_completion_policies_observed, true);
  assert.equal(output.agent_lab_sample.sample_result.runs[0].stage_completion_policy_assessment.status, 'passed');
  assert.equal(output.agent_lab_sample.sample_result.executor_capability_aperture.summary.codex_cli_task_count, 3);
  assert.equal(output.agent_lab_sample.sample_result.executor_capability_aperture.authority_boundary
    .can_constrain_executor_reasoning, false);
  assert.deepEqual(output.agent_lab_sample.ref_summary.scorecard_refs, [
    'quality-scorecard:mas/paper-repair-smoke',
    'quality-scorecard:mag/grant-section-smoke',
    'quality-scorecard:rca/visual-deliverable-smoke',
  ]);
  assert.equal(output.agent_lab_sample.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_sample.authority_boundary.can_write_memory_body, false);
});

test('agent-lab longline exposes the central cross-domain longline suite and repo test reduction guidance', () => {
  const output = runCli(['agent-lab', 'longline', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_longline.surface_id, 'opl_agent_lab_longline_suite');
  assert.equal(output.agent_lab_longline.suite_result.status, 'passed');
  assert.equal(output.agent_lab_longline.suite_result.suite_kind, 'agent_lab_longline_suite');
  assert.equal(output.agent_lab_longline.suite_result.observations.domain_stage_completion_policies_observed, true);
  assert.equal(output.agent_lab_longline.suite_result.summary.stage_completion_policy_blocker_count, 0);
  assert.equal(output.agent_lab_longline.suite_result.longline_summary.longline_task_count, 3);
  assert.equal(output.agent_lab_longline.suite_result.longline_summary.ready_to_reduce_domain_longline_tests, true);
  assert.deepEqual(output.agent_lab_longline.suite_result.longline_summary.domain_ids, [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);
  assert.equal(output.agent_lab_longline.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_longline.authority_boundary.can_write_domain_truth, false);
});

test('agent-lab run accepts the MAG live owner acceptance suite as refs-only coordination evidence', () => {
  const suitePath = path.join(repoRoot, 'contracts/opl-framework/agent-lab-mag-live-acceptance-suite.json');
  const output = runCli(['agent-lab', 'run', '--suite', suitePath, '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_run.surface_id, 'opl_agent_lab_external_suite_run');
  assert.equal(output.agent_lab_run.suite_result.status, 'passed');
  assert.equal(output.agent_lab_run.suite_result.observations.domain_stage_completion_policies_observed, true);
  assert.equal(output.agent_lab_run.suite_result.summary.owner_or_human_gate_required_count, 1);
  assert.equal(output.agent_lab_run.suite_result.summary.promotable_candidate_count, 0);
  assert.deepEqual(output.agent_lab_run.suite_result.domain_summary.map((entry: any) => entry.domain_id), [
    'med-autogrant',
  ]);
  assert.ok(output.agent_lab_run.ref_summary.improvement_candidate_refs.includes(
    'improvement-candidate:mag/owner-live-acceptance-receipt-scaleout',
  ));
  assert.equal(output.agent_lab_run.authority_boundary.can_write_domain_truth, false);
  assert.equal(output.agent_lab_run.authority_boundary.can_write_memory_body, false);
  assert.equal(output.agent_lab_run.authority_boundary.can_authorize_quality_verdict, false);
});

test('agent-lab complete exposes the complete eval, observability, and optimizer control plane', () => {
  const output = runCli(['agent-lab', 'complete', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_complete.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.equal(output.agent_lab_complete.status, 'ready_for_opl_native_use');
  assert.equal(output.agent_lab_complete.readiness.ready_to_connect_inspect_ai_adapter, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_optimizer_candidate_refs, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_integration_contracts, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_review_trace_ledger, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_log_driven_mechanism_candidates, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_stage_executor_policy_read_model, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_executor_capability_aperture, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_token_cost_estimates, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_efficiency_nonregression_read_model, true);
  assert.equal(output.agent_lab_complete.readiness.ready_to_emit_codex_attempt_trace_flywheel, true);
  assert.equal(output.agent_lab_complete.readiness.automatic_mechanism_promotion_ready, false);
  assert.equal(output.agent_lab_complete.readiness.automatic_model_training_ready, false);
  assert.equal(output.agent_lab_complete.readiness.automatic_default_agent_promotion_ready,
    'risk_tiered_after_independent_ai_review');
  assert.equal(output.agent_lab_complete.readiness.app_workbench_consumption_ready, true);
  assert.ok(output.agent_lab_complete.eval_adapters.some((entry: any) => entry.adapter_id === 'inspect-ai'));
  assert.ok(output.agent_lab_complete.observability_exports.some((entry: any) => entry.export_id === 'phoenix'));
  assert.equal(output.agent_lab_complete.integration_contracts.summary.contract_count, 3);
  assert.equal(output.agent_lab_complete.review_trace_ledger.summary.independent_no_shared_context_count, 2);
  assert.equal(output.agent_lab_complete.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(output.agent_lab_complete.stage_executor_policy.trial_ready_candidate_count, 1);
  assert.equal(output.agent_lab_complete.codex_attempt_trace_flywheel.summary.codex_cli_attempt_count, 3);
  assert.equal(output.agent_lab_complete.codex_attempt_trace_bundle.surface_kind,
    'opl_agent_lab_codex_attempt_trace_bundle');
  assert.equal(output.agent_lab_complete.codex_attempt_trace_bundle.summary.attempt_trace_count, 3);
  assert.equal(output.agent_lab_complete.replay_fork_variant_cockpit.surface_kind,
    'opl_agent_lab_replay_fork_variant_cockpit');
  assert.equal(output.agent_lab_complete.replay_fork_variant_cockpit.summary.variant_count, 0);
  assert.equal(output.agent_lab_complete.token_cost_estimates.length, 1);
  assert.equal(output.agent_lab_complete.token_cost_estimates[0].preset_id, 'rca-ppt-40');
  assert.equal(output.agent_lab_complete.token_cost_estimates[0].total_estimate.estimated_cost_usd, 38.84);
  assert.equal(output.agent_lab_complete.token_cost_estimates[0].authority_boundary.can_claim_actual_invoice_cost,
    false);
  assert.equal(output.agent_lab_complete.efficiency_nonregression.surface_kind,
    'opl_agent_lab_efficiency_nonregression_read_model');
  assert.equal(output.agent_lab_complete.efficiency_nonregression.refs_only, true);
  assert.equal(output.agent_lab_complete.efficiency_nonregression.status, 'ready');
  assert.equal(output.agent_lab_complete.efficiency_nonregression.authority_boundary.can_write_domain_truth, false);
  assert.equal(output.agent_lab_complete.efficiency_nonregression.authority_boundary.can_authorize_quality_verdict,
    false);
  assert.equal(output.agent_lab_complete.efficiency_nonregression.authority_boundary
    .can_promote_default_agent_without_gate, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.surface_kind,
    'opl_agent_lab_executor_capability_lease_read_model');
  assert.equal(output.agent_lab_complete.executor_capability_aperture.lease_kind,
    'executor_capability_lease');
  assert.equal(output.agent_lab_complete.executor_capability_aperture.read_model_role,
    'runtime_issued_executor_capability_lease');
  assert.equal(output.agent_lab_complete.executor_capability_aperture.semantic_boundary,
    'runtime_issued_launch_audit_receipt_boundary_only_not_codex_internal_reasoning_contract');
  assert.equal(output.agent_lab_complete.executor_capability_aperture.summary.expected_receipt_ref_count, 3);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.summary.runtime_issued_lease_count, 3);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.constrains_launch_audit_and_receipt_only, true);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.does_not_constrain_codex_internal_reasoning,
    true);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.tasks[0].executor_capability_lease.lease_kind,
    'executor_capability_lease');
  assert.match(output.agent_lab_complete.executor_capability_aperture.tasks[0].executor_capability_lease.lease_ref,
    /^executor-capability-lease:/);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.tasks[0].executor_capability_lease
    .allowed_effects.can_write_domain_truth, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.tasks[0].executor_capability_lease
    .allowed_effects.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.tasks[0].executor_capability_lease
    .allowed_effects.can_mutate_artifact_body, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.tasks[0].executor_capability_lease
    .allowed_effects.can_promote_default_agent, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_change_default_executor, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_execute_non_default_executor, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_claim_quality_equivalence, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_claim_tool_semantics_equivalence, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_claim_resume_equivalence, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_authorize_domain_ready, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_mutate_artifact_body, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_write_domain_truth, false);
  assert.equal(output.agent_lab_complete.executor_capability_aperture.authority_boundary
    .can_promote_default_agent, false);
  assert.equal(output.agent_lab_complete.codex_attempt_trace_flywheel.promotion_eligibility
    .flywheel_can_authorize_domain_ready, false);
  assert.equal(output.agent_lab_complete.codex_attempt_trace_flywheel.promotion_eligibility
    .flywheel_can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_complete.codex_attempt_trace_flywheel.promotion_eligibility
    .flywheel_can_promote_default_agent, false);
  assert.equal(output.agent_lab_complete.codex_attempt_trace_flywheel.promotion_eligibility
    .flywheel_can_train_or_deploy_model_weights, false);
  assert.equal(output.agent_lab_complete.codex_attempt_trace_flywheel.promotion_eligibility
    .flywheel_can_mutate_artifact_body, false);
});

test('agent-lab workbench exposes the App-ready read model', () => {
  const output = runCli(['agent-lab', 'workbench', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_workbench.surface_kind, 'opl_agent_lab_workbench_read_model');
  assert.equal(output.agent_lab_workbench.app_workbench_consumption_ready, true);
  assert.equal(output.agent_lab_workbench.observability_export_readiness.upload_external_service, false);
  assert.equal(output.agent_lab_workbench.observability_export_readiness.reads_domain_body, false);
  assert.equal(output.agent_lab_workbench.optimizer_candidates.length, 6);
  assert.equal(output.agent_lab_workbench.integration_contracts.surface_kind,
    'opl_agent_lab_integration_contract_read_model');
  assert.equal(output.agent_lab_workbench.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(output.agent_lab_workbench.log_driven_mechanism_candidates.summary.high_risk_count, 0);
  assert.equal(output.agent_lab_workbench.stage_executor_policy.default_executor_kind, 'codex_cli');
  assert.equal(output.agent_lab_workbench.stage_executor_policy.authority_boundary.can_change_default_executor,
    false);
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_flywheel.surface_kind,
    'opl_agent_lab_codex_attempt_trace_flywheel');
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_flywheel.summary.trace_ready_count, 3);
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_bundle.surface_kind,
    'opl_agent_lab_codex_attempt_trace_bundle');
  assert.equal(output.agent_lab_workbench.replay_fork_variant_cockpit.surface_kind,
    'opl_agent_lab_replay_fork_variant_cockpit');
  assert.equal(output.agent_lab_workbench.source_results.codex_attempt_trace_bundle_ref,
    output.agent_lab_workbench.codex_attempt_trace_bundle.bundle_id);
  assert.equal(output.agent_lab_workbench.source_results.replay_fork_variant_cockpit_ref,
    output.agent_lab_workbench.replay_fork_variant_cockpit.cockpit_id);
  assert.equal(output.agent_lab_workbench.token_cost_estimates.length, 1);
  assert.equal(output.agent_lab_workbench.token_cost_estimates[0].totals.estimated_cost_per_slide_usd, 0.971);
  assert.equal(output.agent_lab_workbench.efficiency_nonregression.surface_kind,
    'opl_agent_lab_efficiency_nonregression_read_model');
  assert.equal(output.agent_lab_workbench.efficiency_nonregression.refs_only, true);
  assert.equal(output.agent_lab_workbench.efficiency_nonregression.status, 'ready');
  assert.equal(output.agent_lab_workbench.efficiency_nonregression.authority_boundary.can_write_owner_receipt, false);
  assert.equal(output.agent_lab_workbench.efficiency_nonregression.authority_boundary.can_mutate_domain_artifact,
    false);
  assert.deepEqual(output.agent_lab_workbench.source_results.token_cost_estimate_refs,
    output.agent_lab_workbench.token_cost_estimates.map((estimate: any) => estimate.estimate_id));
  assert.equal(output.agent_lab_workbench.source_results.efficiency_nonregression_read_model_ref,
    output.agent_lab_workbench.efficiency_nonregression.read_model_id);
  assert.equal(output.agent_lab_workbench.source_results.executor_capability_aperture_ref,
    output.agent_lab_workbench.executor_capability_aperture.read_model_id);
  assert.equal(output.agent_lab_workbench.source_results.codex_attempt_trace_flywheel_ref,
    output.agent_lab_workbench.codex_attempt_trace_flywheel.read_model_id);
  assert.equal(output.agent_lab_workbench.executor_capability_aperture.summary.codex_cli_task_count, 3);
  assert.equal(output.agent_lab_workbench.executor_capability_aperture.authority_boundary
    .can_execute_non_default_executor, false);
  assert.equal(output.agent_lab_workbench.executor_capability_aperture.authority_boundary
    .can_claim_quality_equivalence, false);
  assert.equal(output.agent_lab_workbench.executor_capability_aperture.authority_boundary
    .can_claim_tool_semantics_equivalence, false);
  assert.equal(output.agent_lab_workbench.executor_capability_aperture.authority_boundary
    .can_claim_resume_equivalence, false);
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_flywheel.authority_boundary
    .can_authorize_domain_ready, false);
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_flywheel.authority_boundary
    .can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_flywheel.authority_boundary
    .can_promote_default_agent, false);
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_flywheel.authority_boundary
    .can_train_or_deploy_model_weights, false);
  assert.equal(output.agent_lab_workbench.codex_attempt_trace_flywheel.authority_boundary
    .can_mutate_artifact_body, false);
  assert.equal(output.agent_lab_workbench.promotion_gates.length, 6);
  assert.equal(output.agent_lab_workbench.online_learning_refs.transitions.length, 6);
  assert.equal(output.agent_lab_workbench.online_learning_refs.can_train_or_deploy_model_weights, false);
  assert.equal(output.agent_lab_workbench.authority_boundary.can_write_domain_truth, false);
});

test('agent-lab efficiency exposes generic refs-only efficiency non-regression readiness', () => {
  const output = runCli(['agent-lab', 'efficiency', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_efficiency.surface_id, 'opl_agent_lab_efficiency_nonregression');
  assert.equal(output.agent_lab_efficiency.read_model.surface_kind,
    'opl_agent_lab_efficiency_nonregression_read_model');
  assert.equal(output.agent_lab_efficiency.read_model.refs_only, true);
  assert.equal(output.agent_lab_efficiency.read_model.status, 'ready');
  assert.equal(output.agent_lab_efficiency.read_model.readiness_status, 'ready');
  assert.equal(output.agent_lab_efficiency.read_model.evidence_groups.duration_refs.length > 0, true);
  assert.equal(output.agent_lab_efficiency.read_model.evidence_groups.cost_refs.length > 0, true);
  assert.equal(output.agent_lab_efficiency.read_model.evidence_groups.cache_hit_refs.length > 0, true);
  assert.equal(output.agent_lab_efficiency.read_model.evidence_groups.reuse_scope_refs.length > 0, true);
  assert.equal(output.agent_lab_efficiency.read_model.evidence_groups.quality_floor_refs.length > 0, true);
  assert.equal(output.agent_lab_efficiency.read_model.evidence_groups.no_forbidden_write_refs.length > 0, true);
  assert.equal(output.agent_lab_efficiency.read_model.evidence_groups.owner_route_refs.length > 0, true);
  assert.equal(output.agent_lab_efficiency.authority_boundary.can_write_domain_truth, false);
  assert.equal(output.agent_lab_efficiency.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_efficiency.authority_boundary.can_write_owner_receipt, false);
});

test('agent-lab run/efficiency consumes an RCA refs-only handoff suite', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-rca-efficiency-suite-'));
  try {
    const suitePath = path.join(fixtureRoot, 'rca-efficiency-suite.json');
    const rcaHandoff = {
      surface_kind: 'rca_efficiency_handoff_projection',
      owner: 'redcube_ai',
      consumer: 'opl_agent_lab',
      refs_only: true,
      agent_lab_suite_input: {
        suite_kind: 'standard',
        suite_id: 'redcube-ai.efficiency-observability.standard.v1',
        domain_id: 'redcube-ai',
        domain_specific_suite_kind_required: false,
        claims_visual_ready: false,
        claims_exportable: false,
        claims_handoffable: false,
      },
      efficiency_signal_refs: {
        duration_refs: ['workspace-runtime-ref:route-summary:run-1#/elapsed_ms'],
        cost_refs: ['workspace-runtime-ref:route-summary:run-1#/cost_summary'],
        cache_refs: ['workspace-runtime-ref:route-summary:run-1#/cache_status'],
        reuse_refs: ['workspace-runtime-ref:route-artifact:run-1#/render_execution/reused_slide_ids'],
      },
      quality_floor_refs: {
        review_export_gate_refs: ['workspace-runtime-ref:review-export:run-1'],
        screenshot_review_gate_refs: ['workspace-runtime-ref:screenshot_review:run-1'],
        visual_memory_authority_refs: ['redcube product manifest#/domain_memory_descriptor_locator/memory_locator'],
        owner_receipt_refs: ['rca-owner-receipt:visual-stage:run-1'],
        export_authority_refs: ['contracts/artifact_locator_contract.json'],
      },
      authority_boundary: {
        no_forbidden_write: true,
        opl_agent_lab_can_write_rca_visual_truth: false,
        opl_agent_lab_can_authorize_quality_verdict: false,
        opl_agent_lab_can_authorize_exportable: false,
      },
    };
    fs.writeFileSync(suitePath, JSON.stringify({
      suite_id: 'redcube-ai.efficiency-observability.standard.v1',
      suite_kind: 'standard',
      rca_efficiency_handoff_projection: rcaHandoff,
      required_observations: [],
      tasks: [],
    }), 'utf8');

    const output = runCli(['agent-lab', 'run/efficiency', '--suite', suitePath, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_run_efficiency.surface_id, 'opl_agent_lab_efficiency_suite_run');
    assert.equal(output.agent_lab_run_efficiency.suite_result.suite_kind, 'standard');
    assert.equal(output.agent_lab_run_efficiency.read_model.status, 'ready');
    assert.deepEqual(output.agent_lab_run_efficiency.read_model.evidence_groups.duration_refs, [
      'workspace-runtime-ref:route-summary:run-1#/elapsed_ms',
    ]);
    assert.deepEqual(output.agent_lab_run_efficiency.read_model.evidence_groups.cost_refs, [
      'workspace-runtime-ref:route-summary:run-1#/cost_summary',
    ]);
    assert.deepEqual(output.agent_lab_run_efficiency.read_model.evidence_groups.cache_hit_refs, [
      'workspace-runtime-ref:route-summary:run-1#/cache_status',
    ]);
    assert.deepEqual(output.agent_lab_run_efficiency.read_model.evidence_groups.reuse_scope_refs, [
      'workspace-runtime-ref:route-artifact:run-1#/render_execution/reused_slide_ids',
    ]);
    assert.equal(output.agent_lab_run_efficiency.read_model.evidence_groups.quality_floor_refs.length, 5);
    assert.deepEqual(output.agent_lab_run_efficiency.read_model.evidence_groups.no_forbidden_write_refs, [
      'no-forbidden-write:redcube_ai/efficiency-handoff',
    ]);
    assert.deepEqual(output.agent_lab_run_efficiency.read_model.evidence_groups.owner_route_refs, ['redcube_ai']);
    assert.equal(output.agent_lab_run_efficiency.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.agent_lab_run_efficiency.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(output.agent_lab_run_efficiency.authority_boundary.can_mutate_domain_artifact, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('agent-lab stage-executor-policy exposes refs-only optimization candidates', () => {
  const output = runCli(['agent-lab', 'stage-executor-policy', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_stage_executor_policy.surface_kind,
    'opl_agent_lab_stage_executor_policy_read_model');
  assert.equal(output.agent_lab_stage_executor_policy.default_executor_kind, 'codex_cli');
  assert.equal(output.agent_lab_stage_executor_policy.trial_ready_candidate_count, 1);
  assert.equal(output.agent_lab_stage_executor_policy.blocked_candidate_count, 1);
  assert.equal(output.agent_lab_stage_executor_policy.test_matrix.non_default_executor_launch_policy,
    'explicit_binding_required_fail_closed');
  assert.equal(output.agent_lab_stage_executor_policy.recommended_trials[0].executor_kind, 'antigravity_cli');
  assert.equal(output.agent_lab_stage_executor_policy.recommended_trials[0].model, 'gemini-3.5-flash');
  assert.equal(output.agent_lab_stage_executor_policy.recommended_trials[0].reasoning_effort, 'high');
  assert.equal(output.agent_lab_stage_executor_policy.recommended_trials[0].can_start_as_default, false);
  assert.equal(output.agent_lab_stage_executor_policy.typed_blockers[0].blocker_kind,
    'non_default_executor_binding_ref_missing');
  assert.equal(output.agent_lab_stage_executor_policy.authority_boundary.can_execute_non_default_executor, false);
  assert.equal(output.agent_lab_stage_executor_policy.authority_boundary.can_claim_quality_equivalence, false);
});

test('agent-lab mechanism exposes a first-class refs-only mechanism object', () => {
  const output = runCli(['agent-lab', 'mechanism', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_mechanism.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(output.agent_lab_mechanism.status, 'review_pending');
  assert.equal(output.agent_lab_mechanism.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(output.agent_lab_mechanism.mechanism_version, 'opl-agent-lab-mechanism.v1');
  assert.equal(output.agent_lab_mechanism.editable_surfaces.length, 4);
  assert.equal(output.agent_lab_mechanism.meta_edit_receipt.writes_domain_truth, false);
  assert.equal(output.agent_lab_mechanism.meta_edit_receipt.writes_memory_body, false);
  assert.equal(output.agent_lab_mechanism.meta_edit_receipt.mutates_artifact, false);
  assert.equal(output.agent_lab_mechanism.evolution_segment.segment_kind, 'mechanism_baseline_segment_ref');
  assert.equal(output.agent_lab_mechanism.evidence_delta.domain_truth_delta_written, false);
  assert.equal(output.agent_lab_mechanism.mechanism_promotion_policy.automatic_mechanism_promotion_ready, false);
  assert.equal(output.agent_lab_mechanism.independent_ai_review_receipt.review_context_inherits_executor_context,
    false);
  assert.equal(output.agent_lab_mechanism.independent_ai_review_receipt.receipt_source, 'generated_fixture');
  assert.equal(output.agent_lab_mechanism.independent_ai_review_assessment.review_status, 'review_pending');
  assert.equal(output.agent_lab_mechanism.independent_ai_review_assessment.ai_review_approved, false);
  assert.equal(output.agent_lab_mechanism.integration_contracts.summary.contract_count, 3);
  assert.equal(output.agent_lab_mechanism.review_trace_ledger.summary.trace_count, 3);
  assert.equal(output.agent_lab_mechanism.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(output.agent_lab_mechanism.next_mechanism_candidate.log_mined_candidate_refs.length, 4);
  assert.equal(output.agent_lab_mechanism.next_mechanism_candidate.default_promotion, false);
  assert.equal(output.agent_lab_mechanism.next_mechanism_candidate.promotion_decision,
    'blocked_from_auto_promotion');
  assert.equal(output.agent_lab_mechanism.refs_only, true);
});

test('agent-lab workflow-template exposes Foundry Lab dynamic workflow template catalog', () => {
  const output = runCli(['agent-lab', 'workflow-template', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_workflow_template.surface_kind,
    'opl_agent_lab_workflow_template_catalog');
  assert.equal(output.agent_lab_workflow_template.refs_only, true);
  assert.equal(output.agent_lab_workflow_template.template_catalog.template_count, 8);
  assert.deepEqual(
    output.agent_lab_workflow_template.template_catalog.patterns.map((entry: any) => entry.pattern_id),
    [
      'classify_and_act',
      'fan_out_and_synthesize',
      'adversarial_verification',
      'generate_and_filter',
      'tournament',
      'loop_until_done',
      'model_routing',
      'worktree_isolation',
    ],
  );
  assert.deepEqual(output.agent_lab_workflow_template.allowed_outputs, [
    'suite_topology_ref',
    'verifier_ref',
    'work_order_draft_ref',
  ]);
  assert.deepEqual(output.agent_lab_workflow_template.forbidden_claims, [
    'runtime_substrate',
    'ordinary_workflow_compiler',
    'domain_truth',
    'quality_verdict',
    'owner_receipt',
  ]);
  assert.equal(output.agent_lab_workflow_template.authority_boundary.can_define_runtime_substrate, false);
  assert.equal(output.agent_lab_workflow_template.authority_boundary.can_compile_ordinary_user_workflow, false);
  assert.equal(output.agent_lab_workflow_template.authority_boundary.can_write_domain_truth, false);
  assert.equal(output.agent_lab_workflow_template.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_workflow_template.authority_boundary.can_write_owner_receipt, false);
});

test('agent-lab run accepts an external OPL-compatible suite generated by an OPL meta-agent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-external-suite-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const suite = {
    suite_id: 'opl-meta-agent-self-bootstrap-suite',
    suite_kind: 'agent_lab_external_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:opl-meta-agent/sample-brief-agent-baseline',
        domain_id: 'opl-meta-agent',
        task_family: 'agent_building_baseline',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:opl-meta-agent/sample-brief-agent',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:opl-meta-agent/sample-brief-agent',
        agent_entry_ref: 'domain-agent-entry:sample-brief-agent',
        stage_refs: ['stage:sample-brief-agent/intake', 'stage:sample-brief-agent/draft'],
        stage_completion_policy: stageCompletionPolicy('stage-completion-policy:opl-meta-agent/sample-brief-agent'),
        oracle_refs: ['oracle:opl-meta-agent/baseline-contract-valid'],
        scorer_refs: ['scorer:opl-meta-agent/baseline-acceptance'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:opl-meta-agent/resume-after-interruption',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:opl-meta-agent/resume-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:opl-meta-agent/sample-brief-agent-baseline',
          run_ref: 'run:opl-meta-agent/sample-brief-agent-baseline',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:opl-meta-agent/sample-brief-agent-baseline'],
          tool_call_refs: ['tool-call:opl-agents-scaffold'],
          artifact_refs: ['artifact-ref:sample-brief-agent/package'],
          receipt_refs: ['owner-receipt:opl-meta-agent/baseline-delivery'],
          repair_refs: ['repair-ref:opl-meta-agent/no-current-repair'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:opl-meta-agent/baseline-acceptance',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:descriptor-valid', 'metric-ref:agent-lab-suite-valid'],
          evidence_refs: ['evidence-ref:sample-brief-agent/scaffold-validation'],
          review_refs: ['review-ref:opl-meta-agent/baseline-review'],
          quality_gate_refs: ['quality-gate:opl-meta-agent/baseline-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:opl-meta-agent/rubric-gap-tightening',
          candidate_kind: 'rubric_gap',
          target_ref: 'quality-gate:opl-meta-agent/baseline-owner',
          evidence_refs: ['failure-taxonomy:opl-meta-agent/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:opl-meta-agent/sample-brief-agent',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:opl-meta-agent/sample-brief-agent',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:opl-meta-agent/baseline-acceptance'],
          regression_suite_refs: ['regression-suite:opl-meta-agent/self-bootstrap'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:opl-meta-agent/self-bootstrap'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'run', '--suite', suitePath, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_run.surface_id, 'opl_agent_lab_external_suite_run');
    assert.equal(output.agent_lab_run.suite_result.status, 'passed');
    assert.deepEqual(output.agent_lab_run.suite_result.refs.stage_completion_policy_refs, [
      'stage-completion-policy:opl-meta-agent/sample-brief-agent',
    ]);
    assert.equal(output.agent_lab_run.suite_result.suite_kind, 'agent_lab_external_suite');
    assert.deepEqual(output.agent_lab_run.suite_result.domain_summary.map((entry: any) => entry.domain_id), [
      'opl-meta-agent',
    ]);
    assert.ok(output.agent_lab_run.ref_summary.improvement_candidate_refs.includes(
      'improvement-candidate:opl-meta-agent/rubric-gap-tightening',
    ));
    assert.equal(output.agent_lab_run.authority_boundary.can_write_memory_body, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab blocks stages that do not declare domain-owned completion policy', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-stage-completion-gap-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const suite = {
    suite_id: 'stage-completion-gap-suite',
    suite_kind: 'agent_lab_external_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:sample/stage-completion-gap',
        domain_id: 'sample-domain-agent',
        task_family: 'stage_completion_gap',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:sample/stage-completion-gap',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:sample/stage-completion-gap',
        agent_entry_ref: 'domain-agent-entry:sample-domain-agent',
        stage_refs: ['stage:sample/draft'],
        oracle_refs: ['oracle:sample/stage-completion-gap'],
        scorer_refs: ['scorer:sample/stage-completion-gap'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:sample/resume',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:sample/resume'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:sample/stage-completion-gap',
          run_ref: 'run:sample/stage-completion-gap',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:sample/stage-completion-gap'],
          tool_call_refs: ['tool-call:sample/run'],
          artifact_refs: ['artifact-ref:sample/draft'],
          receipt_refs: ['owner-receipt:sample/draft'],
          repair_refs: ['repair-ref:sample/no-current-repair'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:sample/stage-completion-gap',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:sample/pass'],
          evidence_refs: ['evidence-ref:sample/pass'],
          review_refs: ['review-ref:sample/domain-owner'],
          quality_gate_refs: ['quality-gate:sample/owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:sample/stage-completion-gap',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:sample/draft',
          evidence_refs: ['failure-taxonomy:sample/no-current-failure'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:sample/stage-completion-gap',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:sample/stage-completion-gap',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:sample/stage-completion-gap'],
          regression_suite_refs: ['regression-suite:sample/stage-completion-gap'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:sample/stage-completion-gap'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'run', '--suite', suitePath, '--json']);
    const result = output.agent_lab_run.suite_result;

    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.missing_observations, ['domain_stage_completion_policies_observed']);
    assert.equal(result.summary.stage_completion_policy_blocker_count, 1);
    assert.equal(result.runs[0].stage_completion_policy_assessment.status, 'blocked');
    assert.deepEqual(result.runs[0].stage_completion_policy_assessment.blockers, [
      'stage_completion_policy_missing',
    ]);
    assert.deepEqual(result.refs.stage_completion_policy_blocker_refs, [
      'stage-completion-policy-blocker:stage_completion_policy_missing',
    ]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab run returns refs-only domain agent production evidence gate results from an external suite', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-agent-production-evidence-suite-'));
  const suitePath = path.join(tmpDir, 'agent_production_evidence_suite.json');
  const suite = {
    suite_id: 'domain-agent-production-evidence-suite',
    suite_kind: 'agent_production_evidence_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_write_owner_receipt: false,
    },
    production_evidence_gate: {
      surface_kind: 'production_evidence_gate_refs',
      gate_ids: [
        'production-evidence-gate:domain-agent/runtime-watch',
        'production-evidence-gate:domain-agent/quality-eval',
      ],
      gate_result_refs: ['gate-result-ref:domain-agent/production-evidence/agent-lab-run'],
      owner_route_ref: 'owner-route:domain-agent/quality-owner',
      no_forbidden_write_proof_refs: ['no-forbidden-write:domain-agent/agent-lab-production-evidence'],
      typed_blocker_refs: ['typed-blocker-ref:domain-agent/owner-receipt-required'],
      required_owner_receipt_refs: ['required-owner-receipt-ref:domain-agent/production-evidence-closeout'],
      domain_verdict_claimed: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:domain-agent/production-evidence',
        domain_id: 'sample-domain-agent',
        task_family: 'production_evidence_gate',
        environment: {
          environment_kind: 'provider_hosted',
          workspace_locator_ref: 'workspace-locator:domain-agent/production-evidence',
          sandbox_policy: 'refs_only_no_artifact_mutation',
          network_policy: 'production_evidence_refs_only',
        },
        instructions_ref: 'instructions-ref:domain-agent/production-evidence-suite',
        agent_entry_ref: 'domain-agent-entry:sample-domain-agent',
        stage_refs: ['stage-ref:domain-agent/runtime-watch', 'stage-ref:domain-agent/quality-eval'],
        stage_completion_policy: stageCompletionPolicy('stage-completion-policy:sample-domain-agent/production-evidence'),
        oracle_refs: ['oracle-ref:domain-agent/production-evidence-contract'],
        scorer_refs: ['scorer-ref:domain-agent/quality-owner'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:domain-agent/runtime-watch-resume',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['runtime-watch-ref:domain-agent/latest'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory-ref:domain-agent/production-evidence',
          run_ref: 'run-ref:domain-agent/production-evidence',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt-ref:domain-agent/production-evidence'],
          tool_call_refs: ['tool-call-ref:domain-agent/read-production-evidence'],
          artifact_refs: ['artifact-locator-ref:domain-agent/current-package'],
          receipt_refs: [],
          repair_refs: ['repair-ref:domain-agent/no-current-repair'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard-ref:domain-agent/production-evidence',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:domain-agent/production-evidence-present'],
          evidence_refs: ['evidence-ref:domain-agent/production-evidence-suite'],
          review_refs: ['review-ref:domain-agent/owner-review-required'],
          quality_gate_refs: ['quality-gate-ref:domain-agent/quality-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate-ref:domain-agent/no-op-production-evidence-handoff',
          candidate_kind: 'test_metadata',
          target_ref: 'handoff-ref:domain-agent/production-evidence',
          evidence_refs: ['failure-taxonomy:domain-agent/no-current-failure'],
          allowed_change_scope: 'candidate_config_only',
          promotion_gate_ref: 'promotion-gate-ref:domain-agent/production-evidence',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate-ref:domain-agent/production-evidence',
          gate_status: 'passed',
          required_refs: ['quality-scorecard-ref:domain-agent/production-evidence'],
          regression_suite_refs: ['regression-suite-ref:domain-agent/production-evidence'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:domain-agent/agent-lab-production-evidence'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'run', '--suite', suitePath, '--json']);
    const gateResult = output.agent_lab_run.suite_result.production_evidence_gate_result;

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_run.suite_result.suite_kind, 'agent_production_evidence_suite');
    assert.equal(output.agent_lab_run.suite_result.status, 'passed');
    assert.equal(output.agent_lab_run.suite_result.summary.stage_completion_policy_blocker_count, 0);
    assert.equal(gateResult.surface_kind, 'opl_agent_lab_production_evidence_gate_result');
    assert.equal(gateResult.status, 'passed');
    assert.equal(gateResult.domain_verdict_claimed, false);
    assert.equal(gateResult.writes_domain_truth, false);
    assert.equal(gateResult.writes_quality_verdict, false);
    assert.equal(gateResult.writes_domain_artifact_body, false);
    assert.equal(gateResult.writes_memory_body, false);
    assert.equal(gateResult.writes_owner_receipt, false);
    assert.deepEqual(gateResult.gate_ids, [
      'production-evidence-gate:domain-agent/runtime-watch',
      'production-evidence-gate:domain-agent/quality-eval',
    ]);
    assert.deepEqual(gateResult.owner_route_refs, ['owner-route:domain-agent/quality-owner']);
    assert.deepEqual(gateResult.no_forbidden_write_proof_refs, [
      'no-forbidden-write:domain-agent/agent-lab-production-evidence',
    ]);
    assert.deepEqual(gateResult.typed_blocker_refs, ['typed-blocker-ref:domain-agent/owner-receipt-required']);
    assert.deepEqual(gateResult.required_receipt_refs, [
      'required-owner-receipt-ref:domain-agent/production-evidence-closeout',
    ]);
    assert.deepEqual(gateResult.gate_result_refs, [
      'gate-result-ref:domain-agent/production-evidence/agent-lab-run',
    ]);
    assert.deepEqual(output.agent_lab_run.ref_summary.production_evidence_gate_result_refs, [
      'gate-result-ref:domain-agent/production-evidence/agent-lab-run',
    ]);
    assert.deepEqual(output.agent_lab_run.ref_summary.production_evidence_owner_route_refs, [
      'owner-route:domain-agent/quality-owner',
    ]);
    assert.deepEqual(output.agent_lab_run.ref_summary.production_evidence_typed_blocker_refs, [
      'typed-blocker-ref:domain-agent/owner-receipt-required',
    ]);
    assert.deepEqual(output.agent_lab_run.ref_summary.production_evidence_required_receipt_refs, [
      'required-owner-receipt-ref:domain-agent/production-evidence-closeout',
    ]);
    assert.equal(output.agent_lab_run.authority_boundary.can_write_owner_receipt, false);
    assert.equal(output.agent_lab_run.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab optimize runs an external suite into gated candidate and RL transition refs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-optimize-suite-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const suite = {
    suite_id: 'opl-meta-agent-optimizer-suite',
    suite_kind: 'agent_lab_external_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:opl-meta-agent/optimizer-candidate',
        domain_id: 'opl-meta-agent',
        task_family: 'agent_optimizer_candidate',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:opl-meta-agent/optimizer',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:opl-meta-agent/optimizer',
        agent_entry_ref: 'domain-agent-entry:optimizer-agent',
        stage_refs: ['stage:optimizer/baseline'],
        stage_completion_policy: stageCompletionPolicy('stage-completion-policy:opl-meta-agent/optimizer-candidate'),
        oracle_refs: ['oracle:optimizer/baseline-valid'],
        scorer_refs: ['scorer:optimizer/acceptance'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:optimizer/resume',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:optimizer/resume'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:optimizer/candidate',
          run_ref: 'run:optimizer/candidate',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:optimizer/candidate'],
          tool_call_refs: ['tool-call:optimizer/run-suite'],
          artifact_refs: ['artifact-ref:optimizer/config-locator'],
          receipt_refs: ['owner-receipt:optimizer/baseline'],
          repair_refs: ['repair-ref:optimizer/no-current-repair'],
          trace_refs: ['trace-ref:optimizer/candidate'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:optimizer/baseline',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:optimizer/pass'],
          evidence_refs: ['evidence-ref:optimizer/baseline'],
          review_refs: ['review-ref:optimizer/domain-owner'],
          quality_gate_refs: ['quality-gate:optimizer/owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:optimizer/prompt',
          candidate_kind: 'prompt',
          target_ref: 'prompt-ref:optimizer/default',
          evidence_refs: ['failure-taxonomy:optimizer/no-current-failure'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:optimizer/candidate',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:optimizer/candidate',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:optimizer/baseline'],
          regression_suite_refs: ['regression-suite:optimizer/baseline'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:optimizer/baseline'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'optimize', '--suite', suitePath, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_optimize.surface_kind, 'opl_agent_lab_optimize_result');
    assert.equal(output.agent_lab_optimize.status, 'review_pending');
    assert.equal(output.agent_lab_optimize.gated_optimizer_candidate_set.candidate_count, 1);
    assert.equal(output.agent_lab_optimize.gated_optimizer_candidate_set.auto_promotable_candidate_count, 0);
    assert.equal(output.agent_lab_optimize.gated_optimizer_candidate_set.ai_review_approved_count, 0);
    assert.equal(output.agent_lab_optimize.log_driven_mechanism_candidates.summary.candidate_count, 4);
    assert.equal(output.agent_lab_optimize.log_mined_candidate_refs.length, 4);
    assert.equal(output.agent_lab_optimize.rl_transition_refs.transition_count, 1);
    assert.equal(output.agent_lab_optimize.automatic_mechanism_promotion_ready, false);
    assert.equal(output.agent_lab_optimize.automatic_model_training_ready, false);
    assert.equal(output.agent_lab_optimize.automatic_default_agent_promotion_ready,
      'risk_tiered_after_independent_ai_review');
    assert.equal(output.agent_lab_optimize.authority_boundary.can_promote_default_agent_without_gate, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agent-lab rho emits a no-apply backend plan with refs-only candidate surfaces', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-rho-project-'));
  try {
    const output = runCli(['agent-lab', 'rho', '--project', fixtureRoot, '--json']);
    const plan = output.agent_lab_rho.backend_plan;

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_rho.surface_id, 'opl_agent_lab_rho_backend');
    assert.equal(plan.surface_kind, 'opl_agent_lab_rho_backend_plan');
    assert.equal(plan.backend, 'rho');
    assert.equal(plan.apply_mode, 'no_apply');
    assert.equal(plan.refs_only, true);
    assert.equal(plan.project_ref, `project-ref:${fixtureRoot}`);
    assert.match(plan.plan_id, /^oalrho_/);
    assert.equal(plan.trajectory_digest_refs.length, 1);
    assert.equal(plan.diagnosis_refs.length, 1);
    assert.equal(plan.candidate_harness_refs.length, 1);
    assert.equal(plan.self_preference_score_refs.length, 1);
    assert.match(plan.winner_ref, /^rho-winner-ref:/);
    assert.equal(plan.candidate_diff_refs.length, 1);
    assert.equal(plan.work_order_draft_refs.length, 1);
    assert.equal(plan.promotion_evidence_refs.length, 1);
    assert.equal(plan.can_write_domain_truth, false);
    assert.equal(plan.can_write_memory_body, false);
    assert.equal(plan.can_mutate_artifact_body, false);
    assert.equal(plan.can_write_owner_receipt, false);
    assert.equal(plan.can_direct_apply, false);
    assert.equal(plan.can_promote_default_agent, false);
    assert.equal(plan.can_promote_default_agent_without_gate, false);
    assert.equal(plan.authority_boundary.can_write_domain_truth, false);
    assert.equal(plan.authority_boundary.can_write_memory_body, false);
    assert.equal(plan.authority_boundary.can_mutate_domain_artifact, false);
    assert.equal(plan.authority_boundary.can_write_owner_receipt, false);
    assert.equal(plan.authority_boundary.can_promote_default_agent_without_gate, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
