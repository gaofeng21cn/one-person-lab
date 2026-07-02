import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentLabAheEvidenceReadModel } from '../../src/modules/foundry-lab/agent-lab-ahe-evidence.ts';
import { buildAgentLabCodexAttemptTraceFlywheel } from '../../src/modules/foundry-lab/agent-lab-codex-attempt-flywheel.ts';
import { buildSampleAgentLabSuite } from '../../src/modules/foundry-lab/agent-lab.ts';

function aheRefs(suffix: string) {
  return {
    change_evaluation_refs: [
      `change-evaluation-ref:${suffix}`,
      `change-evaluation-ref:${suffix}`,
      ' ',
    ],
    predicted_impact_refs: [`predicted-impact-ref:${suffix}`],
    failure_evidence_refs: [`failure-evidence-ref:${suffix}`],
    root_cause_refs: [`root-cause-ref:${suffix}`],
    targeted_fix_refs: [`targeted-fix-ref:${suffix}`],
    risk_task_refs: [`risk-task-ref:${suffix}`],
    next_run_falsification_refs: [`next-run-falsification-ref:${suffix}`],
  };
}

test('Agent Lab AHE evidence helper normalizes and deduplicates task and result refs', () => {
  const suite = buildSampleAgentLabSuite();
  const taskId = suite.tasks[0].task_id;
  suite.tasks = [
    {
      ...suite.tasks[0],
      mechanism_evolution_inputs: {
        ahe_evidence_refs: aheRefs('task'),
      },
    },
  ];

  const result = buildAgentLabAheEvidenceReadModel({
    suite,
    results: [
      {
        task_id: taskId,
        ahe_evidence: {
          change_evaluation_refs: ['change-evaluation-ref:task', 'change-evaluation-ref:result'],
          failure_evidence_refs: ['failure-evidence-ref:task', 'failure-evidence-ref:result'],
        },
      },
    ],
  });
  const task = result.tasks[0];

  assert.equal(result.surface_kind, 'opl_agent_lab_ahe_evidence_read_model');
  assert.equal(result.refs_only, true);
  assert.equal(result.status, 'ready_for_review');
  assert.equal(task.status, 'ready_for_review');
  assert.deepEqual(task.change_evaluation_refs, [
    'change-evaluation-ref:task',
    'change-evaluation-ref:result',
  ]);
  assert.deepEqual(task.failure_evidence_refs, [
    'failure-evidence-ref:task',
    'failure-evidence-ref:result',
  ]);
  assert.deepEqual(task.missing_required_ref_fields, []);
  assert.equal(task.promotion_authorization.authorized, false);
  assert.equal(result.summary.promotion_authorized_count, 0);
  assert.equal(task.authority_boundary.can_authorize_quality_verdict, false);
});

test('Agent Lab Codex attempt trace flywheel normalizes trace refs and forks blocked evidence', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks = [suite.tasks[0]];
  const taskId = suite.tasks[0].task_id;
  const failureDeltaRef = 'failure-delta:mas/reviewer-repair-prompt';

  const result = buildAgentLabCodexAttemptTraceFlywheel({
    suite,
    results: [
      {
        task_id: taskId,
        status: 'blocked',
        failure_taxonomy: ['promotion_independent_ai_review_receipt_missing'],
        promotion_safety_assessment: {
          missing_required_refs: ['promotion_independent_ai_review_receipt_missing'],
          failure_delta_refs: [failureDeltaRef],
        },
      },
    ],
  });
  const attempt = result.attempts[0];

  assert.equal(result.surface_kind, 'opl_agent_lab_codex_attempt_trace_flywheel');
  assert.equal(result.refs_only, true);
  assert.equal(result.codex_attempt_trace_bundle.surface_kind, 'opl_agent_lab_codex_attempt_trace_bundle');
  assert.equal(result.codex_attempt_trace_bundle.summary.attempt_trace_count, 1);
  assert.equal(result.codex_attempt_trace_bundle.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(result.replay_fork_variant_cockpit.surface_kind, 'opl_agent_lab_replay_fork_variant_cockpit');
  assert.equal(result.replay_fork_variant_cockpit.summary.blocked_evidence_ref_count >= 3, true);
  assert.equal(result.replay_fork_variant_cockpit.summary.learning_only_variant_count, 3);
  assert.equal(result.replay_fork_variant_cockpit.summary.promotion_eligible_variant_count, 0);
  assert.equal(result.replay_fork_variant_cockpit.authority_boundary.can_mutate_artifact_body, false);
  assert.equal(result.summary.attempt_count, 1);
  assert.equal(result.summary.codex_cli_attempt_count, 1);
  assert.equal(result.summary.blocked_evidence_attempt_count, 1);
  assert.equal(result.summary.fork_candidate_count, 3);
  assert.equal(result.summary.promotion_eligible_candidate_count, 0);
  assert.equal(attempt.status, 'blocked_evidence_ready_for_fork');
  assert.deepEqual(attempt.generated_typed_blocker_refs, []);
  assert.ok(result.refs.command_refs.includes('command-ref:codex/mas-paper-repair-smoke'));
  assert.ok(result.refs.file_refs.includes('file-ref:mas/current-package-fixture'));
  assert.ok(result.refs.subagent_refs.includes('subagent-ref:codex/mas-reviewer-repair'));
  assert.ok(result.refs.worktree_refs.includes('worktree-ref:codex/mas-paper-repair-smoke'));
  assert.ok(result.refs.test_refs.includes('test-ref:mas/paper-autonomy-smoke'));
  assert.ok(result.refs.web_source_refs.includes('source-ref:mas/reviewer-guideline-fixture'));
  assert.ok(result.refs.review_receipt_refs.includes('review-receipt-ref:mas/ai-reviewer-fixture'));
  assert.ok(result.refs.blocked_evidence_refs.includes(failureDeltaRef));
  assert.equal(result.variant_candidates.length, 3);
  assert.ok(result.variant_candidates.every((candidate) =>
    candidate.evidence_delta.blocked_evidence_refs.includes(failureDeltaRef)
    && candidate.predicted_impact_refs.length > 0
    && candidate.next_run_falsification_refs.length > 0
    && candidate.cost_duration.estimated_cost_units > 0
    && candidate.cost_duration.estimated_duration_minutes > 0
    && candidate.regression_count > 0
    && candidate.learning_only === true
    && candidate.authority_boundary.can_authorize_quality_verdict === false
    && candidate.authority_boundary.can_mutate_artifact_body === false
    && candidate.promotion_eligibility.eligible_for_variant_eval
    && candidate.promotion_eligibility.eligible_for_existing_promotion_gate === false
    && candidate.promotion_eligibility.can_authorize_domain_ready === false
    && candidate.promotion_eligibility.can_authorize_quality_verdict === false
    && candidate.promotion_eligibility.can_mutate_artifact_body === false
    && candidate.promotion_eligibility.can_promote_default_agent === false));
  assert.deepEqual(result.replay_fork_variant_cockpit.learning_only_variant_refs, result.refs.variant_candidate_refs);
});

test('Agent Lab AHE evidence helper emits typed blocker when required refs are missing', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks = [
    {
      ...suite.tasks[0],
      mechanism_evolution_inputs: {
        ahe_evidence_refs: {
          predicted_impact_refs: ['predicted-impact-ref:only-advisory-context'],
          risk_task_refs: ['risk-task-ref:only-risk-context'],
        },
      },
    },
  ];

  const result = buildAgentLabAheEvidenceReadModel({ suite });
  const task = result.tasks[0];

  assert.equal(result.status, 'typed_blocker');
  assert.equal(task.status, 'typed_blocker');
  assert.deepEqual(task.missing_required_ref_fields, [
    'change_evaluation_refs',
    'failure_evidence_refs',
    'root_cause_refs',
    'targeted_fix_refs',
    'next_run_falsification_refs',
  ]);
  assert.ok(task.typed_blocker);
  assert.equal(task.typed_blocker.blocker_kind, 'ahe_evidence_refs_missing');
  assert.deepEqual(task.typed_blocker.missing_ref_fields, task.missing_required_ref_fields);
  assert.equal(task.promotion_authorization.authorized, false);
});

test('Agent Lab AHE evidence helper keeps fixture generated and suite pass refs review pending without promotion authority', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks = [
    {
      ...suite.tasks[0],
      mechanism_evolution_inputs: {
        ahe_evidence_refs: {
          change_evaluation_refs: ['fixture:ahe/change-evaluation'],
          predicted_impact_refs: ['generated:ahe/predicted-impact'],
          failure_evidence_refs: ['suite-pass:ahe/failure-evidence'],
          root_cause_refs: ['fixture:ahe/root-cause'],
          targeted_fix_refs: ['generated:ahe/targeted-fix'],
          risk_task_refs: ['suite-result:ahe/risk-task'],
          next_run_falsification_refs: ['suite-pass:ahe/next-run-falsification'],
        },
      },
    },
  ];

  const result = buildAgentLabAheEvidenceReadModel({ suite });
  const task = result.tasks[0];

  assert.equal(result.status, 'review_pending');
  assert.equal(task.status, 'review_pending');
  assert.deepEqual(task.missing_required_ref_fields, []);
  assert.deepEqual(task.review_pending_ref_fields, [
    'change_evaluation_refs',
    'predicted_impact_refs',
    'failure_evidence_refs',
    'root_cause_refs',
    'targeted_fix_refs',
    'risk_task_refs',
    'next_run_falsification_refs',
  ]);
  assert.equal(task.promotion_authorization.authorized, false);
  assert.equal(task.promotion_authorization.fixture_generated_or_suite_pass_refs_are_advisory_only, true);
  assert.equal(result.summary.promotion_authorized_count, 0);
});
