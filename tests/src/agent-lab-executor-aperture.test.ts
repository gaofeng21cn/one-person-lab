import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSampleAgentLabSuite,
  runAgentLabSuite,
} from '../../src/agent-lab.ts';

test('Agent Lab executor capability aperture accepts declared non-default executor metadata as audit boundary only', () => {
  const suite = buildSampleAgentLabSuite();
  suite.tasks[0] = {
    ...suite.tasks[0],
    executor_capability_aperture: {
      executor_kind: 'claude_code',
      executor_binding_ref: 'executor-binding-ref:claude-code/mas-review-smoke',
      model_reasoning: {
        model_ref: 'model-profile:claude-code/sonnet-xhigh',
        model: 'claude-sonnet',
        reasoning_effort: 'high',
        provider: 'claude_code',
        source_ref: 'model-profile-ref:claude-code/declared',
      },
      required_capabilities: [
        'capability-ref:executor/tool-use',
        'capability-ref:executor/subagent-review',
      ],
      subagent_refs: ['subagent-ref:reviewer/independent-audit'],
      expected_receipt_refs: ['executor-receipt:claude-code/mas-review-smoke'],
      risk_lane: 'medium_risk',
      budget: {
        budget_ref: 'budget-ref:executor/mas-review-smoke',
        max_minutes: 45,
        max_stage_attempts: 4,
      },
    },
  };

  const result = runAgentLabSuite(suite);
  const aperture = result.executor_capability_aperture.tasks[0];

  assert.equal(result.executor_capability_aperture.summary.non_default_executor_task_count, 1);
  assert.equal(result.executor_capability_aperture.summary.subagent_capability_declared_task_count, 1);
  assert.equal(result.executor_capability_aperture.summary.medium_risk_count, 1);
  assert.equal(aperture.executor.executor_kind, 'claude_code');
  assert.equal(aperture.executor.executor_binding_ref, 'executor-binding-ref:claude-code/mas-review-smoke');
  assert.equal(aperture.executor.non_default_executor_requires_binding_ref, true);
  assert.equal(aperture.model_reasoning.model_ref, 'model-profile:claude-code/sonnet-xhigh');
  assert.equal(aperture.model_reasoning.reasoning_effort, 'high');
  assert.equal(aperture.model_reasoning.model_reasoning_is_launch_audit_metadata_only, true);
  assert.ok(aperture.capabilities.tool.required_capability_refs.includes('capability-ref:executor/tool-use'));
  assert.deepEqual(aperture.capabilities.subagent.subagent_refs, ['subagent-ref:reviewer/independent-audit']);
  assert.equal(aperture.budget.max_minutes, 45);
  assert.ok(aperture.expected_receipt.expected_receipt_refs.includes(
    'executor-receipt:claude-code/mas-review-smoke',
  ));
  assert.equal(aperture.audit_boundary.can_replace_ai_judgment, false);
  assert.equal(aperture.audit_boundary.can_change_default_executor, false);
  assert.equal(aperture.audit_boundary.can_execute_non_default_executor, false);
  assert.equal(aperture.audit_boundary.can_claim_quality_equivalence, false);
  assert.equal(aperture.audit_boundary.can_claim_tool_semantics_equivalence, false);
  assert.equal(aperture.audit_boundary.can_claim_resume_equivalence, false);
  assert.equal(aperture.audit_boundary.can_authorize_domain_ready, false);
  assert.equal(aperture.audit_boundary.can_authorize_quality_verdict, false);
  assert.equal(aperture.audit_boundary.can_mutate_artifact_body, false);
  assert.equal(aperture.audit_boundary.can_write_domain_truth, false);
  assert.equal(result.executor_capability_aperture.authority_boundary.can_constrain_executor_reasoning, false);
});
