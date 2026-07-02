import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSampleAgentLabSuite,
  runAgentLabSuite,
} from '../../src/modules/foundry-lab/agent-lab.ts';

test('Agent Lab projects MAS mechanism evolution inputs as body-free refs for evolve consumption', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks[0] = {
    ...suite.tasks[0],
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
      helper_skill_drift_guard_refs: ['helper-skill-drift-guard:aris/codex-skill-resolver'],
      assurance_contract_refs: ['assurance-contract:aris/submission-gate'],
      adversarial_review_gate_refs: ['adversarial-review-gate:aris/cross-model-review'],
      experiment_queue_recovery_refs: ['experiment-queue-recovery:aris/retry-wave'],
      publication_aftercare_plan_refs: ['publication-aftercare-plan:aris/resubmit-talk-package'],
      target_editable_surface_refs: ['mechanism-edit-ref:mas/analysis-campaign-queue-routing'],
      evidence_delta_refs: ['evidence-ref:mas/dm002/reviewer-routeback'],
      independent_ai_review_receipt_ref: 'ai-reviewer-receipt:mas/dm002/mechanism-direct-evidence-review',
      version_ledger_ref: 'mechanism-version-ledger:mas/dm002/medical-manuscript-quality',
      rollback_ref: 'mechanism-rollback-ref:mas/agent-lab-medical-manuscript-quality',
      helper_skill_drift_guard: {
        surface_kind: 'aris_helper_skill_drift_guard_refs',
        guard_kind: 'body_free_skill_resolver_drift_guard',
        body_included: false,
        policy_mode: 'fail_closed',
        helper_resolver_chain_refs: ['helper-resolver-chain:aris/codex-skill-mirror'],
        source_commit_pin_refs: ['source-commit-pin:aris/skills-codex'],
        drift_test_refs: ['drift-test:aris/codex-skill-mirror'],
        backfill_command_refs: ['backfill-command:aris/install-aris-codex-reconcile'],
        advisory_policy_refs: ['advisory-policy:aris/local-skill-reconcile'],
        fail_closed_policy_refs: ['fail-closed-policy:aris/skill-source-drift'],
        guard_refs: ['guard-ref:aris/no-silent-helper-drift'],
        resolver_chain: [
          {
            resolver_ref: 'resolver-ref:aris/codex-skill-symlink',
            layer: 'codex_skill_mirror',
            policy_mode: 'fail_closed',
          },
        ],
      },
      assurance_contract: {
        surface_kind: 'aris_assurance_contract_refs',
        contract_kind: 'body_free_submission_assurance_contract',
        body_included: false,
        assurance_contract_refs: ['assurance-contract:aris/submission-gate'],
        input_hash_refs: ['input-hash-ref:aris/current-package'],
        external_verifier_refs: ['external-verifier-ref:aris/cspaper-signal'],
        currentness_proof_refs: ['currentness-proof-ref:aris/no-stale-provider-switch'],
        assurance_trace_refs: ['assurance-trace-ref:aris/submission-audit'],
        submission_gate_refs: ['submission-gate-ref:aris/conference-ready'],
        no_silent_skip_proof_refs: ['no-silent-skip-proof-ref:aris/assurance-gate'],
      },
      adversarial_review_gate: {
        surface_kind: 'aris_adversarial_review_gate_refs',
        gate_kind: 'body_free_cross_model_review_gate',
        body_included: false,
        adversarial_review_gate_refs: ['adversarial-review-gate:aris/cross-model-review'],
        attack_thread_refs: ['attack-thread-ref:aris/reviewer-model-family'],
        defense_thread_refs: ['defense-thread-ref:aris/executor-revision'],
        judge_receipt_refs: ['judge-receipt-ref:aris/no-shared-context'],
        negative_evidence_refs: ['negative-evidence-ref:aris/claim-killed-by-seed-study'],
        unresolved_attack_refs: ['unresolved-attack-ref:aris/no-current-attack'],
        blocker_refs: ['blocker-ref:aris/no-current-review-blocker'],
        debate_trace_refs: ['debate-trace-ref:aris/cross-model-review-loop'],
      },
      experiment_queue_recovery: {
        surface_kind: 'aris_experiment_queue_recovery_refs',
        recovery_kind: 'body_free_experiment_queue_recovery',
        body_included: false,
        experiment_queue_recovery_refs: ['experiment-queue-recovery:aris/retry-wave'],
        queue_refs: ['queue-ref:aris/experiment-wave'],
        state_refs: ['queue-state-ref:aris/retry-ready'],
        retry_refs: ['retry-ref:aris/resource-failure-redrive'],
        retry_reason_refs: ['retry-reason-ref:aris/preempted-gpu'],
        resource_failure_refs: ['resource-failure-ref:aris/remote-gpu-evicted'],
        wave_gate_refs: ['wave-gate-ref:aris/next-ablation-wave'],
        stale_worker_cleanup_refs: ['stale-worker-cleanup-ref:aris/worker-lease-expired'],
        crash_recovery_refs: ['crash-recovery-ref:aris/experiment-process-restart'],
        budget_guard_refs: ['budget-guard-ref:aris/max-gpu-hours'],
      },
      publication_aftercare_plan: {
        surface_kind: 'aris_publication_aftercare_plan_refs',
        plan_kind: 'body_free_publication_aftercare_refs',
        body_included: false,
        publication_aftercare_plan_refs: ['publication-aftercare-plan:aris/resubmit-talk-package'],
        resubmission_plan_refs: ['resubmission-plan-ref:aris/new-venue-route'],
        venue_route_refs: ['venue-route-ref:aris/neurips-to-iclr'],
        talk_package_refs: ['talk-package-ref:aris/beamer-pptx'],
        slides_polish_refs: ['slides-polish-ref:aris/reviewer-facing-talk'],
        overleaf_sync_refs: ['overleaf-sync-ref:aris/no-write-from-opl'],
        author_handoff_refs: ['author-handoff-ref:aris/final-human-submit'],
        external_suite_task_refs: ['external-suite-task-ref:aris/aftercare-smoke'],
      },
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
        retry_policy: {
          policy_ref: 'retry-policy:mas/analysis-campaign/manual-owner-retry',
          max_retry_count: 2,
        },
        budget: { budget_ref: 'analysis-budget:dm002/reviewer-repair', max_cost: 8 },
        items: [
          {
            ref: 'analysis-queue:hdl-harmonization',
            state: 'ready',
            retry_count: 1,
            budget_cost: 3,
            source_refs: ['review-ref:hdl-harmonization'],
          },
        ],
        manifest_refs: ['file-ref:study/artifacts/analysis_queue/latest.json'],
      },
    },
  };

  const result = runAgentLabSuite(suite);
  const masRun = result.runs.find((entry) => entry.domain_id === 'med-autoscience');

  assert.ok(masRun);
  const mechanismInputs = masRun.mechanism_evolution_inputs;
  assert.ok(mechanismInputs);
  assert.ok(mechanismInputs.research_memory_graph);
  assert.ok(mechanismInputs.analysis_queue_manifest);
  assert.equal(mechanismInputs.surface_kind, 'mas_agent_lab_mechanism_evolution_inputs');
  assert.equal(mechanismInputs.research_memory_graph.body_included, false);
  assert.equal(mechanismInputs.analysis_queue_manifest.body_included, false);
  assert.ok(mechanismInputs.runtime_event_ledger);
  assert.ok(mechanismInputs.provider_switch_hygiene);
  assert.ok(mechanismInputs.claim_assurance_map);
  assert.ok(mechanismInputs.helper_skill_drift_guard);
  assert.ok(mechanismInputs.assurance_contract);
  assert.ok(mechanismInputs.adversarial_review_gate);
  assert.ok(mechanismInputs.experiment_queue_recovery);
  assert.ok(mechanismInputs.publication_aftercare_plan);
  assert.equal(mechanismInputs.runtime_event_ledger.body_included, false);
  assert.equal(mechanismInputs.provider_switch_hygiene.body_included, false);
  assert.equal(mechanismInputs.claim_assurance_map.body_included, false);
  assert.equal(mechanismInputs.helper_skill_drift_guard.body_included, false);
  assert.equal(mechanismInputs.assurance_contract.body_included, false);
  assert.equal(mechanismInputs.adversarial_review_gate.body_included, false);
  assert.equal(mechanismInputs.experiment_queue_recovery.body_included, false);
  assert.equal(mechanismInputs.publication_aftercare_plan.body_included, false);
  assert.equal(mechanismInputs.helper_skill_drift_guard.can_execute_helper, false);
  assert.equal(mechanismInputs.assurance_contract.can_authorize_submission_action, false);
  assert.equal(mechanismInputs.adversarial_review_gate.can_authorize_quality_verdict, false);
  assert.equal(mechanismInputs.publication_aftercare_plan.can_push_submission, false);
  assert.deepEqual(mechanismInputs.research_memory_graph.claim_refs, [
    'claim-ref:hdl-unit-contamination',
  ]);
  assert.deepEqual(mechanismInputs.analysis_queue_manifest.items.map((item: any) => item.ref), [
    'analysis-queue:hdl-harmonization',
  ]);
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('paper-ref:dm002-current-draft'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('analysis-queue:hdl-harmonization'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('runtime-event-ledger:mas/dm002/stage-events'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes(
    'provider-provider-switch-hygiene:mas/dm002/local-to-temporal',
  ));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('claim-assurance:mas/dm002/no-unbacked-claims'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('helper-resolver-chain:aris/codex-skill-mirror'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('assurance-contract:aris/submission-gate'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('attack-thread-ref:aris/reviewer-model-family'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('queue-ref:aris/experiment-wave'));
  assert.ok(result.refs.mechanism_evolution_input_refs.includes('talk-package-ref:aris/beamer-pptx'));
  assert.equal(result.refs.mechanism_evolution_input_refs.includes(''), false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);
});
