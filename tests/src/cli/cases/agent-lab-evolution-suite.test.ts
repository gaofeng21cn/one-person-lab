import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function stageCompletionPolicy(policyRef: string) {
  return {
    surface_kind: 'domain_stage_completion_policy',
    policy_ref: policyRef,
    completion_judgment_owner: 'domain_stage',
    closeout_packet_required: false,
    raw_artifact_sufficient_for_progress: true,
    provider_completion_is_domain_completion: false,
    opl_content_judgment_allowed: false,
    semantic_route_decision_owner: 'decisive_codex_attempt',
    stage_transition_materialization_owner: 'opl_stage_run_controller',
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
        stage_completion_policy: stageCompletionPolicy('stage-completion-policy:opl-meta-agent/evolution-candidate'),
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
