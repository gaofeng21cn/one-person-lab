import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentLabAheEvidenceReadModel } from '../../src/agent-lab-ahe-evidence.ts';
import { buildSampleAgentLabSuite } from '../../src/agent-lab.ts';

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
