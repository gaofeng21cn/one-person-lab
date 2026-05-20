import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

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
  assert.equal(output.agent_lab_workbench.promotion_gates.length, 6);
  assert.equal(output.agent_lab_workbench.online_learning_refs.transitions.length, 6);
  assert.equal(output.agent_lab_workbench.online_learning_refs.can_train_or_deploy_model_weights, false);
  assert.equal(output.agent_lab_workbench.authority_boundary.can_write_domain_truth, false);
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

test('agent-lab export emits refs-only connector envelopes for optional targets', () => {
  const inspect = runCli(['agent-lab', 'export', '--target', 'inspect-ai', '--json']);
  const openinference = runCli(['agent-lab', 'export', '--target', 'openinference', '--json']);
  const langfuse = runCli(['agent-lab', 'export', '--target', 'langfuse', '--json']);
  const phoenix = runCli(['agent-lab', 'export', '--target', 'phoenix', '--json']);
  const json = runCli(['agent-lab', 'export', '--target', 'json', '--json']);

  assert.equal(inspect.agent_lab_export.surface_kind, 'opl_agent_lab_export_envelope');
  assert.equal(inspect.agent_lab_export.target, 'inspect-ai');
  assert.equal(inspect.agent_lab_export.upload_external_service, false);
  assert.equal(inspect.agent_lab_export.reads_domain_body, false);
  assert.equal(inspect.agent_lab_export.connector_payload.tasks.length, 6);
  assert.equal(openinference.agent_lab_export.connector_payload.traces.length, 4);
  assert.equal(langfuse.agent_lab_export.connector_payload.datasets.length, 2);
  assert.equal(phoenix.agent_lab_export.connector_payload.experiments.length, 2);
  assert.equal(json.agent_lab_export.connector_payload.suite_results.length, 2);
});

test('agent-lab cost-estimate emits a refs-only RCA 40-slide token and cost estimate', () => {
  const output = runCli(['agent-lab', 'cost-estimate', '--preset', 'rca-ppt-40', '--json']);

  assert.equal(output.version, 'g2');
  assert.equal(output.agent_lab_cost_estimate.surface_id, 'opl_agent_lab_cost_estimate');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.surface_kind, 'opl_agent_lab_cost_estimate');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.version, 'opl-agent-lab.v1.cost-estimate');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.refs_only, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.preset_id, 'rca-ppt-40');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.domain_id, 'redcube-ai');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.artifact_profile.artifact_kind, 'presentation_deck');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.artifact_profile.slide_count, 40);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.models.text_model, 'gpt-5.5');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.models.reasoning_effort, 'xhigh');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.models.image_model, 'gpt-image-2');
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.pricing_snapshot.status, 'snapshot_ref_only');
  assert.match(output.agent_lab_cost_estimate.cost_estimate.pricing_snapshot.pricing_ref, /^pricing-snapshot-ref:/);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.uncertainty.status, 'estimate_only');
  assert.ok(output.agent_lab_cost_estimate.cost_estimate.uncertainty.factors.includes('model_pricing_may_change'));

  assert.deepEqual(output.agent_lab_cost_estimate.cost_estimate.per_stage_estimates.map((entry: any) => entry.stage_id), [
    'intake',
    'outline',
    'slide_generation',
    'image_generation',
    'render_review',
    'revision',
  ]);
  for (const stage of output.agent_lab_cost_estimate.cost_estimate.per_stage_estimates) {
    assert.equal(stage.refs_only, true);
    assert.equal(stage.token_estimate.estimated_input_tokens > 0, true);
    assert.equal(stage.token_estimate.estimated_output_tokens > 0, true);
    assert.equal(stage.token_estimate.estimated_total_tokens > 0, true);
    assert.equal(stage.cost_estimate.estimated_cost_usd >= 0, true);
    assert.match(stage.estimate_ref, /^cost-estimate-ref:agent-lab\/rca-ppt-40\//);
  }

  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_input_tokens > 0, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_output_tokens > 0, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_total_tokens > 0, true);
  assert.equal(output.agent_lab_cost_estimate.cost_estimate.total_estimate.estimated_cost_usd > 0, true);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_write_domain_truth, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_mutate_domain_artifact, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_authorize_export_verdict, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_write_owner_receipt, false);
  assert.equal(output.agent_lab_cost_estimate.authority_boundary.can_write_memory_body, false);
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

test('agent-lab evolve runs an external suite into a refs-only mechanism evolution segment', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-evolve-suite-'));
  const suitePath = path.join(tmpDir, 'suite.json');
  const suite = {
    suite_id: 'opl-meta-agent-evolution-suite',
    suite_kind: 'agent_lab_external_suite',
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [
      {
        task_id: 'agent-lab-task:opl-meta-agent/evolution-candidate',
        domain_id: 'opl-meta-agent',
        task_family: 'agent_mechanism_evolution',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:opl-meta-agent/evolution',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:opl-meta-agent/evolution',
        agent_entry_ref: 'domain-agent-entry:evolution-agent',
        stage_refs: ['stage:evolution/baseline'],
        oracle_refs: ['oracle:evolution/baseline-valid'],
        scorer_refs: ['scorer:evolution/acceptance'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:evolution/resume',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:evolution/resume'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:evolution/candidate',
          run_ref: 'run:evolution/candidate',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:evolution/candidate'],
          tool_call_refs: ['tool-call:evolution/run-suite'],
          artifact_refs: ['artifact-ref:evolution/config-locator'],
          receipt_refs: ['owner-receipt:evolution/baseline'],
          repair_refs: ['repair-ref:evolution/no-current-repair'],
          trace_refs: ['trace-ref:evolution/candidate'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:evolution/baseline',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:evolution/pass'],
          evidence_refs: ['evidence-ref:evolution/baseline'],
          review_refs: ['review-ref:evolution/domain-owner'],
          quality_gate_refs: ['quality-gate:evolution/owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:evolution/stage-policy',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:evolution/default',
          evidence_refs: ['failure-taxonomy:evolution/no-current-failure'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:evolution/candidate',
        },
        mechanism_evolution_inputs: {
          surface_kind: 'mas_agent_lab_mechanism_evolution_inputs',
          target_opl_surface: 'opl_agent_lab_evolution_result',
          target_opl_cli: 'opl agent-lab evolve --suite <suite.json> --json',
          automatic_mechanism_promotion_route: 'risk_tiered_auto_promotion_with_independent_ai_review',
          research_wiki_refs: ['file-ref:study/artifacts/research_wiki/latest.json'],
          failed_route_refs: ['failed-route:mas/dm002/internal-quality-language'],
          reviewer_direct_evidence_refs: ['review-ref:mas/dm002/ai-reviewer-direct-evidence'],
          analysis_queue_manifest_refs: ['file-ref:study/artifacts/analysis_queue/latest.json'],
          runtime_event_ledger_refs: ['runtime-event-ledger:mas/dm002/stage-events'],
          provider_switch_hygiene_refs: ['provider-switch-hygiene:mas/dm002/provider-executor'],
          claim_assurance_map_refs: ['claim-assurance:mas/dm002/no-unbacked-claims'],
          target_editable_surface_refs: ['mechanism-edit-ref:mas/analysis-campaign-queue-routing'],
          evidence_delta_refs: ['evidence-ref:mas/dm002/reviewer-routeback'],
          runtime_event_ledger: {
            surface_kind: 'mas_runtime_event_ledger_refs',
            ledger_kind: 'body_free_runtime_event_ledger_refs',
            body_included: false,
            event_ledger_refs: ['runtime-event-ledger:mas/dm002/stage-events'],
            runtime_event_refs: ['runtime-event:mas/dm002/reviewer-routeback'],
            stage_attempt_event_refs: ['stage-attempt-event:mas/dm002/reviewer-repair'],
            provider_event_refs: ['provider-event:temporal/mas-dm002-replay'],
            executor_event_refs: ['executor-event:codex/mas-dm002-reviewer-repair'],
            blocker_refs: ['blocker-ref:mas/dm002/no-current-blocker'],
          },
          provider_switch_hygiene: {
            surface_kind: 'mas_provider_switch_hygiene_refs',
            hygiene_kind: 'body_free_provider_switch_hygiene_refs',
            body_included: false,
            provider_switch_hygiene_refs: ['provider-provider-switch-hygiene:mas/dm002/local-to-temporal'],
            executor_switch_hygiene_refs: ['executor-provider-switch-hygiene:mas/dm002/codex-default'],
            provider_refs: ['provider-ref:temporal/mas-dm002'],
            executor_refs: ['executor-ref:codex-cli/mas-dm002'],
            switch_receipt_refs: ['switch-receipt:mas/dm002/provider-executor'],
            no_downgrade_proof_refs: ['no-downgrade-proof:mas/dm002/provider-executor'],
          },
          claim_assurance_map: {
            surface_kind: 'mas_claim_assurance_map_refs',
            assurance_kind: 'body_free_claim_assurance_map_refs',
            body_included: false,
            claim_assurance_map_refs: ['claim-assurance:mas/dm002/no-unbacked-claims'],
            claim_refs: ['claim-ref:hdl-unit-contamination'],
            direct_evidence_refs: ['direct-evidence-ref:mas/dm002/hdl-unit-contamination'],
            reviewer_receipt_refs: ['reviewer-receipt:mas/dm002/claim-assurance'],
            contradiction_refs: ['contradiction-ref:mas/dm002/no-current-contradiction'],
            uncertainty_refs: ['uncertainty-ref:mas/dm002/hdl-unit-boundary'],
            no_unbacked_claim_proof_refs: ['no-unbacked-claim-proof:mas/dm002'],
          },
          research_memory_graph: {
            surface_kind: 'mas_research_memory_graph',
            graph_kind: 'body_free_research_memory_graph',
            body_included: false,
            manifest_refs: ['file-ref:study/artifacts/research_wiki/latest.json'],
            paper_refs: ['paper-ref:dm002-current-draft'],
            claim_refs: ['claim-ref:hdl-unit-contamination'],
            experiment_refs: ['experiment-ref:external-validation-replay'],
            failed_idea_refs: ['failed-idea:mechanical-completeness-gate'],
            negative_result_refs: ['negative-result:uncalibrated-risk-collapse'],
            reusable_rationale_refs: ['rationale-ref:ai-reviewer-quality-route-back'],
            failed_route_refs: ['failed-route:internal-quality-language'],
          },
          analysis_queue_manifest: {
            surface_kind: 'mas_analysis_queue_manifest',
            manifest_kind: 'body_free_analysis_queue_manifest',
            body_included: false,
            queue_ref: 'analysis-queue:dm002/reviewer-repair',
            state: 'active',
            items: [
              {
                ref: 'analysis-queue:hdl-harmonization',
                state: 'ready',
                retry_count: 1,
                budget_cost: 3,
                source_refs: ['review-ref:hdl-harmonization'],
              },
            ],
          },
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:evolution/candidate',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:evolution/baseline'],
          regression_suite_refs: ['regression-suite:evolution/baseline'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:evolution/baseline'],
        },
      },
    ],
  };

  try {
    fs.writeFileSync(suitePath, `${JSON.stringify(suite, null, 2)}\n`);
    const output = runCli(['agent-lab', 'evolve', '--suite', suitePath, '--json']);

    assert.equal(output.version, 'g2');
    assert.equal(output.agent_lab_evolve.surface_kind, 'opl_agent_lab_evolution_result');
    assert.equal(output.agent_lab_evolve.status, 'blocked_from_auto_promotion');
    assert.equal(output.agent_lab_evolve.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
    assert.equal(output.agent_lab_evolve.editable_surfaces.length, 4);
    assert.equal(output.agent_lab_evolve.mechanism_promotion_decision.promotion_decision,
      'blocked_from_auto_promotion');
    assert.equal(output.agent_lab_evolve.integration_contracts.summary.contract_count, 3);
    assert.equal(output.agent_lab_evolve.review_trace_ledger.summary.trace_count, 3);
    assert.equal(output.agent_lab_evolve.log_mined_candidate_refs.length, 4);
    assert.ok(output.agent_lab_evolve.suite_result.refs.mechanism_evolution_input_refs.includes(
      'analysis-queue:hdl-harmonization',
    ));
    assert.ok(output.agent_lab_evolve.suite_result.refs.mechanism_evolution_input_refs.includes(
      'runtime-event-ledger:mas/dm002/stage-events',
    ));
    assert.ok(output.agent_lab_evolve.suite_result.refs.mechanism_evolution_input_refs.includes(
      'provider-provider-switch-hygiene:mas/dm002/local-to-temporal',
    ));
    assert.ok(output.agent_lab_evolve.suite_result.refs.mechanism_evolution_input_refs.includes(
      'claim-assurance:mas/dm002/no-unbacked-claims',
    ));
    assert.equal(output.agent_lab_evolve.suite_result.runs[0].mechanism_evolution_inputs.research_memory_graph
      .body_included, false);
    assert.equal(output.agent_lab_evolve.suite_result.runs[0].mechanism_evolution_inputs.analysis_queue_manifest
      .body_included, false);
    assert.equal(output.agent_lab_evolve.suite_result.runs[0].mechanism_evolution_inputs.runtime_event_ledger
      .body_included, false);
    assert.equal(output.agent_lab_evolve.suite_result.runs[0].mechanism_evolution_inputs
      .provider_switch_hygiene.body_included, false);
    assert.equal(output.agent_lab_evolve.suite_result.runs[0].mechanism_evolution_inputs.claim_assurance_map
      .body_included, false);
    assert.ok(output.agent_lab_evolve.log_driven_mechanism_candidates.log_evidence.source_refs.includes(
      'provider-provider-switch-hygiene:mas/dm002/local-to-temporal',
    ));
    assert.ok(output.agent_lab_evolve.evidence_delta.added_evidence_refs.includes(
      'claim-assurance:mas/dm002/no-unbacked-claims',
    ));
    assert.equal(output.agent_lab_evolve.independent_ai_review_receipt.review_context_inherits_executor_context,
      false);
    assert.equal(output.agent_lab_evolve.independent_ai_review_assessment.review_status, 'review_pending');
    assert.equal(output.agent_lab_evolve.independent_ai_review_assessment.ai_review_approved, false);
    assert.equal(output.agent_lab_evolve.promotion_receipt.promoted_to_status, 'blocked');
    assert.equal(output.agent_lab_evolve.meta_edit_receipt.writes_domain_truth, false);
    assert.equal(output.agent_lab_evolve.meta_edit_receipt.writes_memory_body, false);
    assert.equal(output.agent_lab_evolve.meta_edit_receipt.mutates_artifact, false);
    assert.equal(output.agent_lab_evolve.evolution_segment.segment_kind, 'mechanism_suite_evolution_segment_ref');
    assert.equal(output.agent_lab_evolve.evidence_delta.domain_truth_delta_written, false);
    assert.equal(output.agent_lab_evolve.evidence_delta.memory_body_delta_written, false);
    assert.equal(output.agent_lab_evolve.evidence_delta.artifact_delta_written, false);
    assert.equal(output.agent_lab_evolve.next_mechanism_candidate.default_promotion, false);
    assert.equal(output.agent_lab_evolve.next_mechanism_candidate.source_log_mined_candidate_refs.length, 4);
    assert.ok(output.agent_lab_evolve.next_mechanism_candidate.source_mechanism_evolution_input_refs.includes(
      'paper-ref:dm002-current-draft',
    ));
    assert.ok(output.agent_lab_evolve.next_mechanism_candidate.source_mechanism_evolution_input_refs.includes(
      'runtime-event-ledger:mas/dm002/stage-events',
    ));
    assert.equal(output.agent_lab_evolve.next_mechanism_candidate.promotion_decision,
      'blocked_from_auto_promotion');
    assert.equal(output.agent_lab_evolve.automatic_mechanism_promotion_ready, false);
    assert.equal(output.agent_lab_evolve.automatic_model_training_ready, false);
    assert.equal(output.agent_lab_evolve.automatic_default_agent_promotion_ready,
      'risk_tiered_after_independent_ai_review');
    assert.equal(output.agent_lab_evolve.refs_only, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('bin/opl routes agent-lab commands into the OPL CLI instead of Codex passthrough', () => {
  const result = spawnSync(
    path.join(repoRoot, 'bin', 'opl'),
    ['agent-lab', 'complete', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_SKIP_SKILL_SYNC: '1',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.agent_lab_complete.surface_kind, 'opl_agent_lab_complete_control_plane');
});

test('agent-lab command surface does not embed the independent meta-agent product', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples as string[];

  assert.equal(commands.some((command: string) => command.includes('meta-builder')), false);
  assert.equal(commands.some((command: string) => command.includes('meta-agent')), false);
  assert.equal(examples.some((example) => example.includes('meta-builder')), false);
  assert.equal(examples.some((example) => example.includes('meta-agent')), false);
});

test('agent-lab command surface does not add domain-specific production evidence lanes', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples as string[];

  assert.equal(commands.some((command: string) => command === 'agent-lab mag-live-acceptance'), false);
  assert.equal(commands.some((command: string) => command.includes('mag-live-acceptance')), false);
  assert.equal(examples.some((example) => example.includes('mag-live-acceptance')), false);
});
