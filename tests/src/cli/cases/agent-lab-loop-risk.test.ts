import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentLabProgressFirstLoopRiskReport } from '../../../../src/agent-lab.ts';

test('Agent Lab marks a stage route cycle without budget or exit as fatal hard-loop risk', () => {
  const report = buildAgentLabProgressFirstLoopRiskReport({
    source_refs: ['contract-ref:agent-lab/loop-risk/fatal-hard-loop'],
    nodes: [
      { node_ref: 'stage:research-draft' },
      { node_ref: 'stage:quality-review' },
    ],
    routes: [
      {
        route_ref: 'route:draft-to-review',
        from_ref: 'stage:research-draft',
        to_ref: 'stage:quality-review',
      },
      {
        route_ref: 'route:review-back-to-draft',
        from_ref: 'stage:quality-review',
        to_ref: 'stage:research-draft',
      },
    ],
  });

  assert.equal(report.surface_kind, 'opl_agent_lab_progress_first_loop_risk_report');
  assert.equal(report.refs_only, true);
  assert.equal(report.risk_level, 'fatal');
  assert.equal(report.cycle_reports.length, 1);
  assert.equal(report.cycle_reports[0].risk_level, 'fatal');
  assert.ok(report.cycle_reports[0].risk_reasons.includes('hard_loop_without_same_identity_budget_or_exit'));
  assert.ok(report.cycle_reports[0].risk_reasons.includes('progress_evidence_required'));
  assert.deepEqual(report.required_repairs.map((repair) => repair.repair_kind).sort(), [
    'budget_exhausted_exit_missing',
    'carry_forward_advance_exit_missing',
    'progress_evidence_required',
    'same_identity_retry_budget_missing',
  ]);
  assert.equal(report.authority_boundary.can_write_domain_truth, false);
  assert.equal(report.authority_boundary.can_claim_quality_verdict, false);
  assert.equal(report.authority_boundary.can_claim_promotion_ready, false);
});

test('Agent Lab requires carry-forward advance when retry budget only ends in stop-loss', () => {
  const report = buildAgentLabProgressFirstLoopRiskReport({
    source_refs: ['contract-ref:agent-lab/loop-risk/stop-loss-only'],
    qualityLoops: [
      {
        loop_ref: 'quality-loop:generic/retry-until-budget-exhausted',
        loop_kind: 'quality_loop',
        stage_refs: ['stage:attempt', 'stage:review'],
        route_refs: ['route:review-back-to-attempt'],
        progress_evidence_refs: ['progress-delta-ref:attempt/generated-next-draft'],
        same_identity_retry_budget: {
          budget_ref: 'retry-budget:generic/same-identity',
          max_same_identity_retries: 2,
          exhausted_exit_ref: 'exit:generic/stop-loss',
        },
        budget_exhausted_exit: {
          exit_ref: 'exit:generic/stop-loss',
          exit_kind: 'stop_loss',
          typed_blocker_ref: 'typed-blocker:generic/anti-loop-budget-exhausted',
        },
      },
    ],
  });

  assert.equal(report.risk_level, 'high');
  assert.equal(report.cycle_reports.length, 1);
  assert.equal(report.cycle_reports[0].has_same_identity_retry_budget, true);
  assert.equal(report.cycle_reports[0].has_budget_exhausted_exit, true);
  assert.equal(report.cycle_reports[0].has_carry_forward_advance_exit, false);
  assert.equal(report.cycle_reports[0].has_progress_evidence, true);
  assert.deepEqual(report.required_repairs.map((repair) => repair.repair_kind), [
    'carry_forward_advance_exit_missing',
  ]);
});

test('Agent Lab reports advisory policies that incorrectly block ordinary progress', () => {
  const report = buildAgentLabProgressFirstLoopRiskReport({
    source_refs: ['contract-ref:agent-lab/loop-risk/advisory-blocks-progress'],
    qualityLoops: [
      {
        loop_ref: 'quality-loop:generic/advisory-blocks-default-next-action',
        loop_kind: 'stage_route_loop',
        stage_refs: ['stage:apply', 'stage:advisory-review'],
        progress_evidence_refs: ['progress-delta-ref:apply/usable-patch'],
        same_identity_retry_budget: {
          budget_ref: 'retry-budget:generic/bounded',
          max_same_identity_retries: 1,
          exhausted_exit_ref: 'exit:generic/carry-forward',
        },
        budget_exhausted_exit: {
          exit_ref: 'exit:generic/typed-blocker',
          exit_kind: 'typed_blocker',
        },
        carry_forward_advance_exit: {
          exit_ref: 'exit:generic/carry-forward',
          next_action_ref: 'next-action:generic/owner-handoff-with-progress',
          allowed_after_budget_exhausted: true,
          preserves_progress_evidence: true,
        },
        advisory: {
          advisory_ref: 'advisory:generic/schema-completeness',
          advisory_only: true,
          blocks_default_next_action: true,
          blocked_default_next_action_ref: 'next-action:generic/continue-with-produced-draft',
        },
      },
    ],
  });

  assert.equal(report.risk_level, 'high');
  assert.equal(report.cycle_reports[0].advisory_blocks_default_next_action, true);
  assert.ok(report.cycle_reports[0].risk_reasons.includes('advisory_blocks_default_next_action'));
  assert.deepEqual(report.required_repairs.map((repair) => repair.repair_kind), [
    'advisory_must_not_block_ordinary_progress',
  ]);
  assert.equal(report.progress_first_policy.advisory_can_block_default_next_action, false);
});

test('Agent Lab treats a bounded RCA-like visual QA loop with carry-forward exit as low risk', () => {
  const report = buildAgentLabProgressFirstLoopRiskReport({
    source_refs: ['contract-ref:agent-lab/loop-risk/rca-visual-qa-loop'],
    nodes: [
      { node_ref: 'stage:rca/html-render' },
      { node_ref: 'stage:rca/visual-qa' },
    ],
    routes: [
      {
        route_ref: 'route:rca/render-to-visual-qa',
        from_ref: 'stage:rca/html-render',
        to_ref: 'stage:rca/visual-qa',
      },
      {
        route_ref: 'route:rca/visual-qa-repair',
        from_ref: 'stage:rca/visual-qa',
        to_ref: 'stage:rca/html-render',
        progress_evidence_refs: ['progress-delta-ref:rca/rendered-html-revision'],
        same_identity_retry_budget: {
          budget_ref: 'retry-budget:rca/visual-qa-same-identity',
          max_same_identity_retries: 3,
          exhausted_exit_ref: 'exit:rca/carry-forward-advance',
        },
        budget_exhausted_exit: {
          exit_ref: 'exit:rca/anti-loop-budget-exhausted',
          exit_kind: 'typed_blocker',
          typed_blocker_ref: 'typed-blocker:rca/visual-qa-budget-exhausted',
        },
        carry_forward_advance_exit: {
          exit_ref: 'exit:rca/carry-forward-advance',
          next_action_ref: 'next-action:rca/advance-with-latest-render-and-qa-notes',
          allowed_after_budget_exhausted: true,
          preserves_progress_evidence: true,
        },
        advisory: {
          advisory_ref: 'advisory:rca/visual-polish-followup',
          advisory_only: true,
          blocks_default_next_action: false,
        },
      },
    ],
  });

  assert.equal(report.risk_level, 'low');
  assert.equal(report.cycle_reports.length, 1);
  assert.equal(report.cycle_reports[0].has_same_identity_retry_budget, true);
  assert.equal(report.cycle_reports[0].has_budget_exhausted_exit, true);
  assert.equal(report.cycle_reports[0].has_carry_forward_advance_exit, true);
  assert.equal(report.cycle_reports[0].has_progress_evidence, true);
  assert.deepEqual(report.required_repairs, []);
  assert.equal(report.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(report.authority_boundary.can_mutate_domain_artifact, false);
});
