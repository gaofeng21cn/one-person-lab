import { runAgentLabSuite, type AgentLabSuite, type AgentLabTaskManifest } from './agent-lab.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';

function commonAuthorityBoundary() {
  return {
    ...AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function task(input: Omit<AgentLabTaskManifest, 'authority_boundary'>): AgentLabTaskManifest {
  return {
    ...input,
    authority_boundary: commonAuthorityBoundary(),
    trajectory: {
      ...input.trajectory,
      authority_boundary: commonAuthorityBoundary(),
    },
    scorecard: {
      ...input.scorecard,
      authority_boundary: commonAuthorityBoundary(),
    },
    improvement_candidate: {
      ...input.improvement_candidate,
      authority_boundary: commonAuthorityBoundary(),
    },
    promotion_gate: {
      ...input.promotion_gate,
      authority_boundary: commonAuthorityBoundary(),
    },
  };
}

function buildLonglineAgentLabSuite(): AgentLabSuite {
  return {
    suite_id: 'opl-agent-lab-longline-suite',
    suite_kind: 'agent_lab_longline_suite',
    authority_boundary: commonAuthorityBoundary(),
    longline_summary: {
      recommended_repo_test_disposition: [
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
      ],
    },
    tasks: [
      task({
        task_id: 'agent-lab-longline-task:mas/paper-owner-chain',
        domain_id: 'med-autoscience',
        task_family: 'longline_research_foundry_owner_chain_soak',
        environment: {
          environment_kind: 'provider_hosted',
          workspace_locator_ref: 'workspace-locator:mas/real-paper-lines',
          sandbox_policy: 'provider_hosted_no_forbidden_write_guard',
          network_policy: 'domain_owner_policy',
          resource_limits: { max_hours: 24, max_stage_attempts: 9 },
        },
        instructions_ref: 'instructions:longline/mas-paper-owner-chain',
        agent_entry_ref: 'domain-agent-entry:med-autoscience',
        stage_refs: ['stage:mas/guarded-apply', 'stage:mas/reviewer-recheck', 'stage:mas/owner-receipt'],
        oracle_refs: ['oracle:mas/study-state-matrix-owner-chain'],
        scorer_refs: ['scorer:mas/publication-quality-owner-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:longline/temporal-worker-restart-requery',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['provider-proof:temporal/restart-requery'],
          },
          {
            probe_ref: 'recovery-probe:longline/mas-human-gate-resume',
            probe_kind: 'human_gate_resume',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['human-gate:mas/paper-owner-chain'],
          },
          {
            probe_ref: 'recovery-probe:longline/mas-dead-letter-repair',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['repair-receipt:mas/owner-chain-redrive'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:longline/mas-paper-owner-chain',
          run_ref: 'run:longline/mas-paper-owner-chain',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:longline/mas-paper-owner-chain'],
          tool_call_refs: ['tool-call:mas/study-state-matrix', 'tool-call:opl/family-runtime-hydrate'],
          artifact_refs: ['artifact-ref:mas/current-package-locator-only'],
          receipt_refs: ['owner-receipt:mas/stable-blocker-or-progress-delta'],
          repair_refs: ['repair-ref:mas/owner-chain-repair'],
          trace_refs: ['trace-ref:agent-lab/mas-longline'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:longline/mas-publication-owner-chain',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mas/progress-delta-or-stable-blocker'],
          evidence_refs: ['evidence-ref:mas/owner-receipt-chain'],
          review_refs: ['review-ref:mas/publication-eval-owner'],
          quality_gate_refs: ['quality-gate:mas/publication-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:longline/mas-owner-chain-routing',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:mas/guarded-apply-owner-chain',
          evidence_refs: ['failure-taxonomy:mas/longline-owner-chain'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:longline/mas-paper-owner-chain',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:longline/mas-paper-owner-chain',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:longline/mas-publication-owner-chain'],
          regression_suite_refs: ['regression-suite:agent-lab/mas-paper-longline'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:longline/mas-paper-owner-chain'],
        },
      }),
      task({
        task_id: 'agent-lab-longline-task:mag/grant-controlled-soak',
        domain_id: 'med-autogrant',
        task_family: 'longline_grant_foundry_controlled_soak',
        environment: {
          environment_kind: 'provider_hosted',
          workspace_locator_ref: 'workspace-locator:mag/grant-controlled-soak',
          sandbox_policy: 'provider_hosted_no_forbidden_write_guard',
          network_policy: 'domain_owner_policy',
          resource_limits: { max_hours: 12, max_stage_attempts: 6 },
        },
        instructions_ref: 'instructions:longline/mag-grant-controlled-soak',
        agent_entry_ref: 'domain-agent-entry:med-autogrant',
        stage_refs: ['stage:mag/strategy-review', 'stage:mag/controlled-apply', 'stage:mag/owner-receipt'],
        oracle_refs: ['oracle:mag/grant-transition-oracle'],
        scorer_refs: ['scorer:mag/fundability-owner-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:longline/mag-retry-after-tool-failure',
            probe_kind: 'retry_after_tool_failure',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:mag/controlled-soak-retry'],
          },
          {
            probe_ref: 'recovery-probe:longline/mag-receipt-reconciliation',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt-reconciliation:mag/controlled-soak'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:longline/mag-grant-controlled-soak',
          run_ref: 'run:longline/mag-grant-controlled-soak',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:longline/mag-grant-controlled-soak'],
          tool_call_refs: ['tool-call:mag/receipt-reconciliation-proof'],
          artifact_refs: ['artifact-ref:mag/proposal-package-locator-only'],
          receipt_refs: ['owner-receipt:mag/grant-controlled-soak'],
          repair_refs: ['repair-ref:mag/controlled-soak-retry'],
          trace_refs: ['trace-ref:agent-lab/mag-longline'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:longline/mag-fundability-owner-chain',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mag/fundability-evidence'],
          evidence_refs: ['evidence-ref:mag/controlled-soak-receipt'],
          review_refs: ['review-ref:mag/grant-owner'],
          quality_gate_refs: ['quality-gate:mag/fundability-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:longline/mag-controlled-soak-routing',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:mag/controlled-soak',
          evidence_refs: ['failure-taxonomy:mag/longline-controlled-soak'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:longline/mag-grant-controlled-soak',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:longline/mag-grant-controlled-soak',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:longline/mag-fundability-owner-chain'],
          regression_suite_refs: ['regression-suite:agent-lab/mag-controlled-soak'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:longline/mag-controlled-soak'],
        },
      }),
      task({
        task_id: 'agent-lab-longline-task:rca/visual-controlled-soak',
        domain_id: 'redcube-ai',
        task_family: 'longline_presentation_foundry_visual_soak',
        environment: {
          environment_kind: 'provider_hosted',
          workspace_locator_ref: 'workspace-locator:rca/visual-controlled-soak',
          sandbox_policy: 'provider_hosted_no_forbidden_write_guard',
          network_policy: 'domain_owner_policy',
          resource_limits: { max_hours: 12, max_stage_attempts: 6 },
        },
        instructions_ref: 'instructions:longline/rca-visual-controlled-soak',
        agent_entry_ref: 'domain-agent-entry:redcube-ai',
        stage_refs: ['stage:rca/render-review', 'stage:rca/no-regression', 'stage:rca/owner-receipt'],
        oracle_refs: ['oracle:rca/visual-transition-spec'],
        scorer_refs: ['scorer:rca/visual-quality-owner-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:longline/rca-artifact-restore',
            probe_kind: 'artifact_restore',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['restore-proof:rca/visual-controlled-soak'],
          },
          {
            probe_ref: 'recovery-probe:longline/rca-hosted-attempt-reconciliation',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['hosted-attempt-reconciliation:rca/visual-controlled-soak'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:longline/rca-visual-controlled-soak',
          run_ref: 'run:longline/rca-visual-controlled-soak',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:longline/rca-visual-controlled-soak'],
          tool_call_refs: ['tool-call:rca/hosted-attempt-reconciliation'],
          artifact_refs: ['artifact-ref:rca/visual-package-locator-only'],
          receipt_refs: ['owner-receipt:rca/visual-no-regression'],
          repair_refs: ['repair-ref:rca/render-retry'],
          trace_refs: ['trace-ref:agent-lab/rca-longline'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:longline/rca-visual-no-regression',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:rca/block-content-fit'],
          evidence_refs: ['evidence-ref:rca/hosted-attempt-no-regression'],
          review_refs: ['review-ref:rca/visual-owner'],
          quality_gate_refs: ['quality-gate:rca/visual-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:longline/rca-visual-soak-routing',
          candidate_kind: 'tool_policy',
          target_ref: 'tool-policy-ref:rca/visual-controlled-soak',
          evidence_refs: ['failure-taxonomy:rca/longline-visual-soak'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:longline/rca-visual-controlled-soak',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:longline/rca-visual-controlled-soak',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:longline/rca-visual-no-regression'],
          regression_suite_refs: ['regression-suite:agent-lab/rca-visual-soak'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:longline/rca-visual-soak'],
        },
      }),
    ],
  };
}

export function buildLonglineAgentLabResult() {
  return runAgentLabSuite(buildLonglineAgentLabSuite());
}
