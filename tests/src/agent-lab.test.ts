import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildAgentLabExportEnvelope,
  buildAgentLabEvolutionResult,
  buildAgentLabMechanismReadModel,
  buildAgentLabOptimizeResult,
  buildAgentLabWorkbenchReadModel,
  buildCompleteAgentLabControlPlane,
  buildDeveloperModeAgentLabRepairRouteReadModel,
} from '../../src/agent-lab-complete.ts';
import {
  buildSampleAgentLabSuite,
  runAgentLabSuite,
} from '../../src/agent-lab.ts';
import { buildLonglineAgentLabSuite } from '../../src/agent-lab-longline.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

test('Agent Lab runs MAS, MAG, and RCA task manifests through recovery, scoring, and promotion gates without domain authority', () => {
  const result = runAgentLabSuite(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_suite_result');
  assert.equal(result.version, 'opl-agent-lab.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.summary.task_count, 3);
  assert.equal(result.summary.run_count, 3);
  assert.equal(result.summary.passed_run_count, 3);
  assert.equal(result.summary.blocked_run_count, 0);
  assert.equal(result.summary.recovery_probe_count, 5);
  assert.equal(result.summary.recovery_passed_count, 5);
  assert.equal(result.summary.scorecard_passed_count, 3);
  assert.equal(result.summary.improvement_candidate_count, 3);
  assert.equal(result.summary.promotable_candidate_count, 3);
  assert.equal(result.summary.forbidden_authority_flag_count, 0);
  assert.equal(result.summary.memory_body_observed, false);
  assert.deepEqual(result.missing_observations, []);

  for (const observation of Object.values(result.observations)) {
    assert.equal(observation, true);
  }

  assert.deepEqual(result.domain_summary.map((entry) => entry.domain_id), [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);
  assert.deepEqual(result.refs.domain_quality_scorecard_refs, [
    'quality-scorecard:mas/paper-repair-smoke',
    'quality-scorecard:mag/grant-section-smoke',
    'quality-scorecard:rca/visual-deliverable-smoke',
  ]);
  assert.ok(result.refs.recovery_probe_refs.includes('recovery-probe:common/resume-after-interruption'));
  assert.ok(result.refs.improvement_candidate_refs.includes('improvement-candidate:mag/stage-policy-tightening'));
  assert.ok(result.refs.promotion_gate_refs.includes('promotion-gate:rca/visual-route-smoke'));
  assert.equal(result.authority_boundary.can_authorize_domain_ready, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_authorize_export_verdict, false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);

  const masRun = result.runs.find((entry) => entry.domain_id === 'med-autoscience');
  assert.ok(masRun);
  assert.equal(masRun.status, 'passed');
  assert.deepEqual(masRun.failure_taxonomy, []);
  assert.equal(masRun.trajectory.agent_executor, 'codex_cli');
  assert.equal(masRun.trajectory.stage_attempt_refs[0], 'stage-attempt:mas/paper-repair-smoke');
  assert.equal(masRun.scorecard.domain_owned, true);
  assert.equal(masRun.scorecard.opl_scorecard_role, 'scorecard_ref_projection_only');
});

test('Agent Lab blocks memory body payloads instead of treating them as OPL-applied learning', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks[0] = {
    ...suite.tasks[0],
    trajectory: {
      ...suite.tasks[0].trajectory,
      memory_body: 'domain memory body must stay out of OPL Agent Lab',
    },
  };

  const result = runAgentLabSuite(suite);

  assert.equal(result.status, 'blocked');
  assert.equal(result.observations.no_memory_body_observed, false);
  assert.equal(result.summary.memory_body_observed, true);
  assert.ok(result.missing_observations.includes('no_memory_body_observed'));
  assert.equal(result.authority_boundary.can_write_memory_body, false);
});

test('Agent Lab blocks forbidden OPL authority claims in task manifests or scorecards', () => {
  const suite = buildSampleAgentLabSuite();
  suite.authority_boundary = {
    ...suite.authority_boundary,
    can_modify_managed_runtime: true,
  };
  suite.tasks[1] = {
    ...suite.tasks[1],
    scorecard: {
      ...suite.tasks[1].scorecard,
      authority_boundary: {
        ...suite.tasks[1].scorecard.authority_boundary,
        can_authorize_quality_verdict: true,
      },
    },
  };
  suite.tasks[2] = {
    ...suite.tasks[2],
    promotion_gate: {
      ...suite.tasks[2].promotion_gate,
      authority_boundary: {
        ...suite.tasks[2].promotion_gate.authority_boundary,
        can_write_owner_receipt: true,
      },
    },
  };

  const result = runAgentLabSuite(suite);

  assert.equal(result.status, 'blocked');
  assert.equal(result.observations.forbidden_authority_flags_all_false, false);
  assert.equal(result.summary.forbidden_authority_flag_count, 3);
  assert.deepEqual(result.refs.forbidden_authority_flags, [
    'suite:authority_boundary.can_modify_managed_runtime',
    'task:agent-lab-task:mag/grant-section-smoke:scorecard.authority_boundary.can_authorize_quality_verdict',
    'task:agent-lab-task:rca/visual-deliverable-smoke:promotion_gate.authority_boundary.can_write_owner_receipt',
  ]);
  assert.ok(result.missing_observations.includes('forbidden_authority_flags_all_false'));
});

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

test('Agent Lab contract is tracked and exported as an OPL framework surface', () => {
  const contract = readJson('contracts/opl-framework/agent-lab-contract.json');
  const packageJson = readJson('package.json');

  assert.equal(contract.contract_kind, 'opl_agent_lab_contract.v1');
  assert.equal(contract.surface_kind, 'opl_agent_lab_contract');
  assert.equal(contract.contract_version, 'opl-agent-lab.v1');
  assert.deepEqual(contract.result_surface.suite_kinds, [
    'agent_lab_sample_suite',
    'agent_lab_longline_suite',
    'agent_lab_external_suite',
  ]);
  assert.ok(contract.result_surface.ref_fields.includes('mechanism_evolution_input_refs'));
  assert.equal(contract.external_suite_runner_surface.surface_kind, 'opl_agent_lab_external_suite_run');
  assert.equal(contract.external_suite_runner_surface.cli, 'opl agent-lab run --suite <suite.json>');
  assert.ok(contract.input_surfaces.includes('runtime_event_ledger_refs'));
  assert.ok(contract.input_surfaces.includes('provider_switch_hygiene_refs'));
  assert.ok(contract.input_surfaces.includes('claim_assurance_map_refs'));
  assert.ok(contract.input_surfaces.includes('helper_skill_drift_guard_refs'));
  assert.ok(contract.input_surfaces.includes('assurance_contract_refs'));
  assert.ok(contract.input_surfaces.includes('adversarial_review_gate_refs'));
  assert.ok(contract.input_surfaces.includes('experiment_queue_recovery_refs'));
  assert.ok(contract.input_surfaces.includes('publication_aftercare_plan_refs'));
  assert.equal(contract.mechanism_evolution_input_surface.surface_kind,
    'opl_agent_lab_mechanism_evolution_input_refs');
  assert.equal(contract.mechanism_evolution_input_surface.refs_only, true);
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('runtime_event_ledger_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes(
    'provider_switch_hygiene_refs',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('claim_assurance_map_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('helper_skill_drift_guard_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('assurance_contract_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('adversarial_review_gate_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('experiment_queue_recovery_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.input_ref_groups.includes('publication_aftercare_plan_refs'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes('runtime_event_ledger'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'provider_switch_hygiene',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes('claim_assurance_map'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'helper_skill_drift_guard',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes('assurance_contract'));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'adversarial_review_gate',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'experiment_queue_recovery',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.typed_body_free_surfaces.includes(
    'publication_aftercare_plan',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.consumer_outputs.includes(
    'agent_lab_evolve.suite_result.refs.mechanism_evolution_input_refs',
  ));
  assert.ok(contract.mechanism_evolution_input_surface.forbidden_payloads.includes('owner_receipt_body'));
  assert.ok(contract.mechanism_evolution_input_surface.forbidden_payloads.includes('shared_submission_action'));
  assert.equal(contract.mechanism_surface.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(contract.mechanism_surface.cli, 'opl agent-lab mechanism');
  assert.ok(contract.mechanism_surface.fields.includes('mechanism_ref'));
  assert.ok(contract.mechanism_surface.fields.includes('next_mechanism_candidate'));
  assert.ok(contract.mechanism_surface.fields.includes('mechanism_promotion_policy'));
  assert.ok(contract.mechanism_surface.fields.includes('mechanism_version_ledger'));
  assert.ok(contract.mechanism_surface.fields.includes('independent_ai_review_receipt'));
  assert.ok(contract.mechanism_surface.fields.includes('integration_contracts'));
  assert.ok(contract.mechanism_surface.fields.includes('review_trace_ledger'));
  assert.ok(contract.mechanism_surface.fields.includes('log_driven_mechanism_candidates'));
  assert.ok(contract.mechanism_surface.fields.includes('rollback'));
  assert.equal(contract.mechanism_surface.automatic_mechanism_promotion_ready, true);
  assert.equal(contract.mechanism_surface.risk_tiers.low_risk.auto_promotion, 'auto_promote_to_stable');
  assert.equal(contract.mechanism_surface.risk_tiers.medium_risk.auto_promotion, 'auto_promote_to_canary');
  assert.equal(contract.mechanism_surface.risk_tiers.high_risk.auto_promotion,
    'blocked_route_owner_or_human_gate');
  assert.equal(contract.developer_mode_repair_route_surface.surface_kind,
    'opl_agent_lab_developer_mode_repair_route_read_model');
  assert.equal(contract.developer_mode_repair_route_surface.cli, 'opl agent-lab workbench');
  assert.equal(contract.developer_mode_repair_route_surface.refs_only, true);
  assert.deepEqual(contract.developer_mode_repair_route_surface.route_modes, [
    'repo_developer_direct_fix',
    'fork_pull_request',
  ]);
  assert.ok(contract.developer_mode_repair_route_surface.output_refs.includes('candidate_fix_ref'));
  assert.ok(contract.developer_mode_repair_route_surface.output_refs.includes('repo_worktree_ref'));
  assert.ok(contract.developer_mode_repair_route_surface.output_refs.includes('pr_ref'));
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_domain_truth, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_domain_artifact, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_memory_body, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_quality_verdict, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(contract.developer_mode_repair_route_surface.non_authority_outputs.modifies_managed_runtime, false);
  assert.equal(contract.evolution_surface.surface_kind, 'opl_agent_lab_evolution_result');
  assert.equal(contract.evolution_surface.cli, 'opl agent-lab evolve --suite <suite.json>');
  assert.equal(contract.evolution_surface.refs_only, true);
  assert.equal(contract.evolution_surface.writes_domain_truth, false);
  assert.equal(contract.evolution_surface.writes_memory_body, false);
  assert.equal(contract.evolution_surface.mutates_artifact, false);
  assert.equal(contract.evolution_surface.automatic_mechanism_promotion_ready, true);
  assert.equal(contract.evolution_surface.requires_independent_ai_review, true);
  assert.ok(contract.evolution_surface.outputs.includes('integration_contracts'));
  assert.ok(contract.evolution_surface.outputs.includes('review_trace_ledger'));
  assert.ok(contract.evolution_surface.outputs.includes('log_driven_mechanism_candidates'));
  assert.ok(contract.evolution_surface.outputs.includes('log_mined_candidate_refs'));
  assert.ok(contract.evolution_surface.outputs.includes('mechanism_promotion_decision'));
  assert.ok(contract.evolution_surface.outputs.includes('independent_ai_review_receipt'));
  assert.ok(contract.evolution_surface.outputs.includes('promotion_receipt'));
  assert.ok(contract.evolution_surface.outputs.includes('rollback'));
  assert.equal(contract.longline_surface.surface_kind, 'opl_agent_lab_longline_summary');
  assert.equal(contract.longline_surface.suite_kind, 'agent_lab_longline_suite');
  assert.equal(contract.complete_control_plane_surface.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.ok(contract.complete_control_plane_surface.eval_adapters.includes('inspect-ai'));
  assert.ok(contract.complete_control_plane_surface.observability_exports.includes('langfuse'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('log_driven_candidate_read_model'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('integration_contract_read_model'));
  assert.ok(contract.complete_control_plane_surface.optimizer_loop_fields.includes('review_trace_ledger'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes('automatic_mechanism_promotion_ready'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes('ready_to_emit_integration_contracts'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes('ready_to_emit_review_trace_ledger'));
  assert.ok(contract.complete_control_plane_surface.readiness_fields.includes(
    'ready_to_emit_log_driven_mechanism_candidates',
  ));
  assert.equal(contract.integration_contract_surface.surface_kind,
    'opl_agent_lab_integration_contract_read_model');
  assert.equal(contract.integration_contract_surface.refs_only, true);
  assert.ok(contract.integration_contract_surface.required_fields.includes('activation_predicate'));
  assert.ok(contract.integration_contract_surface.failure_outputs.includes('typed_blocker_ref'));
  assert.equal(contract.review_trace_ledger_surface.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(contract.review_trace_ledger_surface.refs_only, true);
  assert.ok(contract.review_trace_ledger_surface.trace_kinds.includes('independent_ai_reviewer_trace_ref'));
  assert.ok(contract.review_trace_ledger_surface.required_fields.includes('no_shared_context'));
  assert.equal(contract.log_driven_candidate_surface.surface_kind,
    'opl_agent_lab_log_driven_mechanism_candidate_read_model');
  assert.equal(contract.log_driven_candidate_surface.refs_only, true);
  assert.ok(contract.log_driven_candidate_surface.input_refs.includes('usage_log_refs'));
  assert.ok(contract.log_driven_candidate_surface.candidate_kinds.includes('workflow_default'));
  assert.equal(contract.export_surface.surface_kind, 'opl_agent_lab_export_envelope');
  assert.ok(contract.export_surface.source_ref_groups.includes('integration_contract_refs'));
  assert.ok(contract.export_surface.source_ref_groups.includes('review_trace_refs'));
  assert.ok(contract.export_surface.source_ref_groups.includes('review_evidence_refs'));
  assert.ok(contract.export_surface.source_ref_groups.includes('log_mined_candidate_refs'));
  assert.ok(contract.longline_surface.summary_fields.includes('ready_to_reduce_domain_longline_tests'));
  assert.ok(contract.longline_surface.repo_test_candidates_to_move_to_opl.includes(
    'provider-hosted soak orchestration',
  ));
  assert.equal(packageJson.exports['./agent-lab'], './dist/agent-lab.js');

  for (const observation of [
    'task_manifests_observed',
    'agent_trajectories_observed',
    'recovery_probes_observed',
    'domain_quality_scorecard_refs_observed',
    'failure_taxonomy_observed',
    'improvement_candidates_observed',
    'promotion_gates_observed',
    'no_memory_body_observed',
    'forbidden_authority_flags_all_false',
  ]) {
    assert.ok(contract.required_observations.includes(observation));
  }

  for (const retainedAuthority of [
    'domain truth',
    'domain quality verdict',
    'domain artifact authority',
    'domain memory body',
    'writeback accept/reject decision',
    'owner receipt',
  ]) {
    assert.ok(contract.domain_retained_authority.includes(retainedAuthority));
  }
});

test('Agent Lab longline suite centralizes planned MAS, MAG, and RCA soak tests into OPL-owned read-model gates', () => {
  const result = runAgentLabSuite(buildLonglineAgentLabSuite());

  assert.equal(result.status, 'passed');
  assert.equal(result.suite_kind, 'agent_lab_longline_suite');
  assert.equal(result.summary.task_count, 3);
  assert.equal(result.summary.recovery_probe_count, 7);
  assert.equal(result.longline_summary.longline_task_count, 3);
  assert.equal(result.longline_summary.repo_test_replacement_candidate_count, 3);
  assert.equal(result.longline_summary.ready_to_reduce_domain_longline_tests, true);
  assert.deepEqual(result.longline_summary.domain_ids, [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
  ]);

  assert.deepEqual(result.longline_summary.recommended_repo_test_disposition, [
    {
      domain_id: 'med-autoscience',
      keep_in_domain_repo: [
        'publication-quality scorer',
        'owner receipt fixture',
        'paper artifact authority checks',
      ],
      move_to_opl_agent_lab: [
        'provider-hosted guarded apply soak orchestration',
        'resume/retry/dead-letter recovery probe',
        'no-forbidden-write cross-domain regression',
      ],
    },
    {
      domain_id: 'med-autogrant',
      keep_in_domain_repo: [
        'fundability scorer',
        'grant owner receipt fixture',
        'proposal artifact authority checks',
      ],
      move_to_opl_agent_lab: [
        'controlled grant-stage soak orchestration',
        'receipt reconciliation projection',
        'no-forbidden-write cross-domain regression',
      ],
    },
    {
      domain_id: 'redcube-ai',
      keep_in_domain_repo: [
        'visual quality scorer',
        'render/export owner receipt fixture',
        'artifact authority checks',
      ],
      move_to_opl_agent_lab: [
        'controlled visual-stage soak orchestration',
        'hosted-attempt reconciliation projection',
        'no-forbidden-write cross-domain regression',
      ],
    },
  ]);

  assert.ok(result.refs.recovery_probe_refs.includes('recovery-probe:longline/temporal-worker-restart-requery'));
  assert.ok(result.refs.promotion_gate_refs.includes('promotion-gate:longline/mas-paper-owner-chain'));
  assert.ok(result.refs.domain_quality_scorecard_refs.includes('quality-scorecard:longline/rca-visual-no-regression'));
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_mutate_domain_artifact, false);
});

test('Agent Lab complete control plane exposes eval adapters, observability exports, and optimizer boundary', () => {
  const result = buildCompleteAgentLabControlPlane();

  assert.equal(result.surface_kind, 'opl_agent_lab_complete_control_plane');
  assert.equal(result.status, 'ready_for_opl_native_use');
  assert.equal(result.readiness.complete_control_plane_ready, true);
  assert.equal(result.readiness.ready_to_connect_inspect_ai_adapter, true);
  assert.equal(result.readiness.ready_to_export_observability_refs, true);
  assert.equal(result.readiness.ready_to_emit_mechanism_read_model, true);
  assert.equal(result.readiness.ready_to_emit_evolution_segments, true);
  assert.equal(result.readiness.ready_to_emit_optimizer_candidate_refs, true);
  assert.equal(result.readiness.ready_to_emit_rl_transition_refs, true);
  assert.equal(result.readiness.ready_to_emit_developer_mode_repair_routes, true);
  assert.equal(result.readiness.ready_to_emit_integration_contracts, true);
  assert.equal(result.readiness.ready_to_emit_review_trace_ledger, true);
  assert.equal(result.readiness.ready_to_emit_log_driven_mechanism_candidates, true);
  assert.equal(result.readiness.automatic_mechanism_promotion_ready, true);
  assert.equal(result.readiness.automatic_model_training_ready, false);
  assert.equal(result.readiness.automatic_default_agent_promotion_ready,
    'risk_tiered_after_independent_ai_review');
  assert.equal(result.readiness.app_workbench_consumption_ready, true);
  assert.ok(result.eval_adapters.some((entry) => entry.adapter_id === 'inspect-ai'));
  assert.ok(result.eval_adapters.some((entry) => entry.adapter_id === 'metr-task-standard'));
  assert.ok(result.observability_exports.some((entry) => entry.export_id === 'langfuse'));
  assert.ok(result.observability_exports.some((entry) => entry.export_id === 'phoenix'));
  assert.equal(result.developer_mode_repair_routes.surface_kind,
    'opl_agent_lab_developer_mode_repair_route_read_model');
  assert.deepEqual(result.optimizer_loop.loop_steps, [
    'collect_trajectory_refs',
    'collect_usage_and_blocker_event_refs',
    'mine_real_logs_into_mechanism_candidate_refs',
    'optional_web_research_for_mechanism_context',
    'freeze_dataset_or_longline_suite',
    'score_with_domain_owned_scorecard_refs',
    'validate_cross_surface_integration_contracts',
    'select_mechanism_editable_surface_refs',
    'emit_meta_edit_receipt_ref',
    'generate_next_mechanism_candidate_ref',
    'classify_mechanism_change_risk',
    'run_independent_ai_review_without_shared_context',
    'record_review_trace_refs',
    'run_regression_and_recovery_gates',
    'auto_promote_low_and_medium_risk_with_versioned_canary',
    'route_high_risk_to_owner_or_human_gate',
    'record_rollback_target_ref',
    'record_evolution_segment_refs',
  ]);
  assert.equal(result.integration_contracts.surface_kind, 'opl_agent_lab_integration_contract_read_model');
  assert.equal(result.integration_contracts.summary.contract_count, 3);
  assert.equal(result.integration_contracts.summary.owner_route_ref_count, 3);
  assert.equal(result.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(result.review_trace_ledger.summary.trace_count, 3);
  assert.equal(result.review_trace_ledger.summary.independent_no_shared_context_count, 2);
  assert.equal(result.log_driven_mechanism_candidates.surface_kind,
    'opl_agent_lab_log_driven_mechanism_candidate_read_model');
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.log_driven_mechanism_candidates.summary.high_risk_count, 0);
  assert.equal(result.optimizer_loop.integration_contract_read_model.read_model_id,
    result.integration_contracts.read_model_id);
  assert.equal(result.optimizer_loop.review_trace_ledger.ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.optimizer_loop.log_driven_candidate_read_model.read_model_id,
    result.log_driven_mechanism_candidates.read_model_id);
  assert.equal(result.optimizer_loop.mechanism_object.promotion_mode,
    'risk_tiered_auto_promotion_with_independent_ai_review');
  assert.equal(result.mechanism_control_plane.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(result.mechanism_control_plane.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(result.mechanism_control_plane.mechanism_promotion_policy.automatic_mechanism_promotion_ready, true);
  assert.equal(result.mechanism_control_plane.independent_ai_review_receipt.review_context_inherits_executor_context,
    false);
  assert.equal(result.optimizer_loop.rl_boundary.can_emit_transition_refs, true);
  assert.equal(result.optimizer_loop.rl_boundary.can_train_or_deploy_model_weights, false);
  assert.equal(result.authority_boundary.can_promote_default_agent_without_gate, false);
});

test('Agent Lab workbench read model is ready for App consumption without taking domain authority', () => {
  const result = buildAgentLabWorkbenchReadModel();

  assert.equal(result.surface_kind, 'opl_agent_lab_workbench_read_model');
  assert.equal(result.status, 'ready_for_app_workbench_consumption');
  assert.equal(result.app_workbench_consumption_ready, true);
  assert.equal(result.observability_export_readiness.ready_to_export_observability_refs, true);
  assert.equal(result.observability_export_readiness.upload_external_service, false);
  assert.equal(result.observability_export_readiness.reads_domain_body, false);
  assert.equal(result.mechanism.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(result.mechanism.refs_only, true);
  assert.equal(result.mechanism.mechanism_promotion_policy.automatic_mechanism_promotion_ready, true);
  assert.equal(result.mechanism.mechanism_version_ledger.current_version, result.mechanism.mechanism_version);
  assert.match(result.mechanism.rollback.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.integration_contracts.surface_kind, 'opl_agent_lab_integration_contract_read_model');
  assert.equal(result.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.source_results.integration_contract_read_model_ref, result.integration_contracts.read_model_id);
  assert.equal(result.source_results.review_trace_ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.source_results.log_driven_mechanism_candidate_read_model_ref,
    result.log_driven_mechanism_candidates.read_model_id);
  assert.equal(result.optimizer_candidates.length, 6);
  assert.equal(result.promotion_gates.length, 6);
  assert.equal(result.developer_mode_repair_routes.status, 'ready_for_developer_mode_patrol_consumption');
  assert.equal(result.developer_mode_repair_routes.summary.route_count, 2);
  assert.equal(result.online_learning_refs.transitions.length, 6);
  assert.equal(result.online_learning_refs.can_train_or_deploy_model_weights, false);
  assert.equal(result.online_learning_refs.can_promote_default_agent_without_gate, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
});

test('Agent Lab Developer Mode repair route projects patrol fixes as refs only', () => {
  const result = buildDeveloperModeAgentLabRepairRouteReadModel();

  assert.equal(result.surface_kind, 'opl_agent_lab_developer_mode_repair_route_read_model');
  assert.equal(result.status, 'ready_for_developer_mode_patrol_consumption');
  assert.equal(result.developer_mode_required, true);
  assert.equal(result.refs_only, true);
  assert.deepEqual(result.patrol_projection.route_outputs, [
    'issue_ref',
    'blocker_ref',
    'owner_route_ref',
    'candidate_fix_ref',
    'repo_worktree_ref',
    'branch_ref',
    'pr_ref',
    'acceptance_evidence_ref',
    'follow_up_queue_item_ref',
  ]);
  assert.equal(result.summary.route_count, 2);
  assert.equal(result.summary.direct_owner_route_count, 1);
  assert.equal(result.summary.fork_pr_route_count, 1);
  assert.equal(result.summary.follow_up_queue_item_ref_count, 2);

  for (const route of result.routes) {
    assert.match(route.issue_ref, /^issue-ref:/);
    assert.match(route.blocker_ref, /^blocker-ref:/);
    assert.match(route.owner_route_ref, /^owner-route:/);
    assert.match(route.candidate_fix_ref, /^candidate-fix-ref:/);
    assert.match(route.repo_worktree_ref, /^repo-worktree-ref:/);
    assert.match(route.branch_ref, /^git-branch-ref:/);
    assert.match(route.pr_ref, /^github-pr-ref:/);
    assert.match(route.acceptance_evidence_ref, /^acceptance-evidence-ref:/);
    assert.match(route.follow_up_queue_item_ref, /^queue-item-ref:/);
    assert.equal(route.authority_boundary.writes_domain_truth, false);
    assert.equal(route.authority_boundary.writes_domain_artifact, false);
    assert.equal(route.authority_boundary.writes_memory_body, false);
    assert.equal(route.authority_boundary.writes_quality_verdict, false);
    assert.equal(route.authority_boundary.writes_owner_receipt, false);
    assert.equal(route.authority_boundary.modifies_managed_runtime, false);
  }

  const directRoute = result.routes.find((route) => route.route_mode === 'repo_developer_direct_fix');
  const forkRoute = result.routes.find((route) => route.route_mode === 'fork_pull_request');
  assert.ok(directRoute);
  assert.ok(forkRoute);
  assert.equal(directRoute.repo_developer_match_required, true);
  assert.equal(forkRoute.repo_developer_match_required, false);
  assert.equal(result.non_authority_outputs.writes_domain_truth, false);
  assert.equal(result.non_authority_outputs.writes_domain_artifact, false);
  assert.equal(result.non_authority_outputs.writes_memory_body, false);
  assert.equal(result.non_authority_outputs.writes_quality_verdict, false);
  assert.equal(result.non_authority_outputs.writes_owner_receipt, false);
  assert.equal(result.non_authority_outputs.modifies_managed_runtime, false);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
  assert.equal(result.authority_boundary.can_write_memory_body, false);
  assert.equal(result.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.authority_boundary.can_write_owner_receipt, false);
  assert.equal(result.authority_boundary.can_modify_managed_runtime, false);
});

test('Agent Lab mechanism read model makes mechanism editable surfaces first-class without write authority', () => {
  const result = buildAgentLabMechanismReadModel();

  assert.equal(result.surface_kind, 'opl_agent_lab_mechanism_read_model');
  assert.equal(result.version, 'opl-agent-lab-mechanism.v1');
  assert.equal(result.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(result.mechanism_version, 'opl-agent-lab-mechanism.v1');
  assert.equal(result.status, 'mechanism_auto_promotion_ready_with_independent_ai_review');
  assert.equal(result.editable_surfaces.length, 4);
  assert.ok(result.editable_surfaces.some((surface) => surface.surface_kind === 'stage_policy_ref'));
  assert.equal(result.mechanism_promotion_policy.automatic_mechanism_promotion_ready, true);
  assert.equal(result.mechanism_promotion_policy.risk_tiers.low_risk.auto_promotion, 'auto_promote_to_stable');
  assert.equal(result.mechanism_promotion_policy.risk_tiers.medium_risk.auto_promotion, 'auto_promote_to_canary');
  assert.equal(result.mechanism_promotion_policy.risk_tiers.high_risk.auto_promotion,
    'blocked_route_owner_or_human_gate');
  assert.ok(result.mechanism_promotion_policy.required_gate_refs.includes(
    result.independent_ai_review_receipt.receipt_ref,
  ));
  assert.equal(result.independent_ai_review_receipt.receipt_kind, 'independent_ai_review_receipt_ref');
  assert.equal(result.independent_ai_review_receipt.review_context_inherits_executor_context, false);
  assert.equal(result.independent_ai_review_receipt.verdict, 'approved_for_risk_tiered_auto_promotion');
  assert.equal(result.mechanism_version_ledger.current_version, result.mechanism_version);
  assert.equal(result.mechanism_version_ledger.versions.length, 2);
  assert.equal(result.integration_contracts.summary.contract_count, 3);
  assert.equal(result.review_trace_ledger.summary.trace_count, 3);
  assert.equal(result.review_trace_ledger.summary.independent_no_shared_context_count, 2);
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.next_mechanism_candidate.log_mined_candidate_refs.length, 4);
  assert.equal(result.next_mechanism_candidate.review_trace_ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.match(result.rollback.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.meta_edit_receipt.receipt_kind, 'mechanism_meta_edit_receipt_ref');
  assert.equal(result.meta_edit_receipt.writes_domain_truth, false);
  assert.equal(result.meta_edit_receipt.writes_memory_body, false);
  assert.equal(result.meta_edit_receipt.mutates_artifact, false);
  assert.equal(result.meta_edit_receipt.trains_or_deploys_model_weights, false);
  assert.equal(result.meta_edit_receipt.promotes_default_agent, false);
  assert.equal(result.evolution_segment.segment_kind, 'mechanism_baseline_segment_ref');
  assert.equal(result.evidence_delta.domain_truth_delta_written, false);
  assert.equal(result.evidence_delta.memory_body_delta_written, false);
  assert.equal(result.evidence_delta.artifact_delta_written, false);
  assert.equal(result.next_mechanism_candidate.risk_tier, 'medium_risk');
  assert.equal(result.next_mechanism_candidate.default_promotion, true);
  assert.equal(result.next_mechanism_candidate.promotion_decision, 'auto_promote_to_canary');
  assert.match(result.next_mechanism_candidate.promotion_receipt_ref, /^mechanism-promotion-receipt:/);
  assert.match(result.next_mechanism_candidate.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.refs_only, true);
  assert.equal(result.authority_boundary.can_write_domain_truth, false);
});

test('Agent Lab evolution result emits versioned auto-promotion decisions without domain truth, memory, artifact, or weight writes', () => {
  const result = buildAgentLabEvolutionResult(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_evolution_result');
  assert.equal(result.status, 'mechanism_auto_promoted_to_canary');
  assert.equal(result.mechanism_ref, 'mechanism:agent-lab/default-stage-led-agent-mechanism');
  assert.equal(result.mechanism_version, 'opl-agent-lab-mechanism.v1');
  assert.equal(result.editable_surfaces.length, 4);
  assert.equal(result.integration_contracts.surface_kind, 'opl_agent_lab_integration_contract_read_model');
  assert.equal(result.review_trace_ledger.surface_kind, 'opl_agent_lab_review_trace_ledger');
  assert.equal(result.log_driven_mechanism_candidates.surface_kind,
    'opl_agent_lab_log_driven_mechanism_candidate_read_model');
  assert.equal(result.log_mined_candidate_refs.length, 4);
  assert.equal(result.mechanism_promotion_decision.automatic_mechanism_promotion_ready, true);
  assert.equal(result.mechanism_promotion_decision.promotion_decision, 'auto_promote_to_canary');
  assert.equal(result.mechanism_promotion_decision.risk_tier, 'medium_risk');
  assert.equal(result.mechanism_promotion_decision.canary.required, true);
  assert.match(result.mechanism_promotion_decision.rollback_target_ref, /^mechanism-version-ref:/);
  assert.equal(result.independent_ai_review_receipt.verdict, 'approved_for_risk_tiered_auto_promotion');
  assert.equal(result.independent_ai_review_receipt.review_context_inherits_executor_context, false);
  assert.match(result.promotion_receipt.receipt_ref, /^mechanism-promotion-receipt:/);
  assert.equal(result.promotion_receipt.promoted_to_status, 'canary');
  assert.equal(result.meta_edit_receipt.writes_domain_truth, false);
  assert.equal(result.meta_edit_receipt.writes_memory_body, false);
  assert.equal(result.meta_edit_receipt.mutates_artifact, false);
  assert.equal(result.evolution_segment.segment_kind, 'mechanism_suite_evolution_segment_ref');
  assert.equal(result.evidence_delta.suite_status, 'passed');
  assert.equal(result.evidence_delta.blocked_evidence_refs.length, 0);
  assert.equal(result.evidence_delta.domain_truth_delta_written, false);
  assert.equal(result.evidence_delta.memory_body_delta_written, false);
  assert.equal(result.evidence_delta.artifact_delta_written, false);
  assert.equal(result.next_mechanism_candidate.source_candidate_refs.length, 3);
  assert.equal(result.next_mechanism_candidate.source_transition_refs.length, 3);
  assert.equal(result.next_mechanism_candidate.source_log_mined_candidate_refs.length, 4);
  assert.equal(result.next_mechanism_candidate.review_trace_ledger_ref, result.review_trace_ledger.ledger_ref);
  assert.equal(result.next_mechanism_candidate.default_promotion, true);
  assert.equal(result.next_mechanism_candidate.promotion_decision, 'auto_promote_to_canary');
  assert.equal(result.automatic_model_training_ready, false);
  assert.equal(result.automatic_mechanism_promotion_ready, true);
  assert.equal(result.automatic_default_agent_promotion_ready, 'risk_tiered_after_independent_ai_review');
  assert.equal(result.refs_only, true);
  assert.equal(result.authority_boundary.can_train_or_deploy_model_weights, false);
});

test('Agent Lab export envelope maps refs to connector payloads without uploading or reading domain bodies', () => {
  const inspect = buildAgentLabExportEnvelope('inspect-ai');
  const openinference = buildAgentLabExportEnvelope('openinference');
  const langfuse = buildAgentLabExportEnvelope('langfuse');
  const phoenix = buildAgentLabExportEnvelope('phoenix');
  const json = buildAgentLabExportEnvelope('json');

  assert.equal(inspect.surface_kind, 'opl_agent_lab_export_envelope');
  assert.equal(inspect.target, 'inspect-ai');
  assert.equal(inspect.upload_external_service, false);
  assert.equal(inspect.reads_domain_body, false);
  assert.equal((inspect.connector_payload as any).tasks.length, 6);
  assert.equal((openinference.connector_payload as any).traces.length, 4);
  assert.equal((langfuse.connector_payload as any).datasets.length, 2);
  assert.equal((phoenix.connector_payload as any).experiments.length, 2);
  assert.equal((json.connector_payload as any).suite_results.length, 2);
  assert.equal(inspect.source_refs.integration_contract_refs.length, 3);
  assert.equal(inspect.source_refs.review_trace_refs.length, 3);
  assert.equal(inspect.source_refs.log_mined_candidate_refs.length, 4);
  assert.ok(inspect.source_refs.review_evidence_refs.includes('evidence-ref:agent-lab/no-forbidden-write-proof'));
  assert.equal(inspect.authority_boundary.can_authorize_export_verdict, false);
});

test('Agent Lab optimize returns gated candidate and RL transition refs without training or default promotion', () => {
  const result = buildAgentLabOptimizeResult(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_optimize_result');
  assert.equal(result.status, 'gated_candidate_set_ready');
  assert.equal(result.suite_result.status, 'passed');
  assert.equal(result.gated_optimizer_candidate_set.candidate_count, 3);
  assert.equal(result.gated_optimizer_candidate_set.promotable_candidate_count, 3);
  assert.equal(result.gated_optimizer_candidate_set.auto_promotable_candidate_count, 3);
  assert.ok(result.gated_optimizer_candidate_set.candidates.every((candidate: any) =>
    candidate.independent_ai_review_ref && candidate.rollback_target_ref));
  assert.equal(result.log_driven_mechanism_candidates.summary.candidate_count, 4);
  assert.equal(result.log_mined_candidate_refs.length, 4);
  assert.equal(result.rl_transition_refs.transition_count, 3);
  assert.equal(result.automatic_mechanism_promotion_ready, true);
  assert.equal(result.automatic_model_training_ready, false);
  assert.equal(result.automatic_default_agent_promotion_ready, 'risk_tiered_after_independent_ai_review');
  assert.equal(result.authority_boundary.can_promote_default_agent_without_gate, false);
});
