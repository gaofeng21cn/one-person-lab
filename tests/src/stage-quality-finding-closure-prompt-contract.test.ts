import assert from 'node:assert/strict';
import test from 'node:test';

import contract from '../../contracts/opl-framework/stage-quality-cycle-contract.json' with { type: 'json' };
import { runnerPromptFor } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import {
  evaluateStageQualityFindingClosure,
  type StageQualityFinding,
  type StageQualityFindingClosure,
  type StageQualityRepairMapEntry,
  type StageQualityReReviewResult,
} from '../../src/authority/stages/stage-quality-cycle.ts';

function promptContract() {
  const prompt = runnerPromptFor({
    attempt: {
      stage_attempt_id: 'sat_finding_closure_contract',
      stage_run_id: 'sr_finding_closure_contract',
      quality_cycle_id: 'qc_finding_closure_contract',
      attempt_role: 're_reviewer',
      quality_round_index: 1,
      stage_id: 'review',
      workspace_locator: { workspace_root: '/tmp/opl-finding-closure-contract' },
    },
  });
  const match = prompt.match(/<opl_finding_closure_contract>\n([^\n]+)\n<\/opl_finding_closure_contract>/);
  assert.ok(match);
  const projected = JSON.parse(match[1]!) as typeof contract.finding_closure_contract;
  assert.deepEqual(projected, contract.finding_closure_contract);
  return projected;
}

function requiredFields(fields: string[], values: Record<string, unknown>) {
  return Object.fromEntries(fields.map((field) => {
    assert.ok(Object.hasOwn(values, field), `No fixture value for required field ${field}`);
    return [field, values[field]];
  }));
}

function closureInput() {
  const projected = promptContract();
  return {
    findings: [requiredFields(projected.initial_finding_required_fields, {
      finding_id: 'finding:required', severity: 'major', required: true,
      evidence_refs: ['artifact:original'], repair_expectation: 'Repair the cited defect.',
    }) as StageQualityFinding],
    repairMap: [requiredFields(projected.repair_map_required_fields, {
      finding_id: 'finding:required', repair_status: 'repaired',
      changed_artifact_refs: ['artifact:repaired'], repair_evidence_refs: ['evidence:repair'],
    }) as StageQualityRepairMapEntry],
    reReview: {
      finding_closures: [requiredFields(projected.finding_closure_required_fields, {
        finding_id: 'finding:required', status: 'closed', evidence_refs: ['evidence:closure'],
      }) as StageQualityFindingClosure],
      repair_regressions: [],
      critical_new_findings: [],
      optional_observations: [requiredFields(projected.optional_observation_required_fields, {
        observation_id: 'observation:optional', evidence_refs: ['artifact:repaired'],
        summary: 'A non-blocking follow-up suggestion.',
      }) as StageQualityReReviewResult['optional_observations'][number]],
    },
  };
}

test('re-review prompt projects canonical closure fields consumed by the real evaluator', () => {
  const projected = promptContract();
  assert.deepEqual(projected.finding_closure_required_fields, ['finding_id', 'status', 'evidence_refs']);
  assert.deepEqual(projected.optional_observation_required_fields, ['observation_id', 'evidence_refs', 'summary']);
  const result = evaluateStageQualityFindingClosure(closureInput());
  assert.equal(result.trigger_repair, false);
  assert.deepEqual(result.optional_observation_ids, ['observation:optional']);
});

test('every projected severity, repair status and closure status matches the runtime enums', () => {
  const projected = promptContract();
  for (const severity of projected.initial_finding_severities) {
    for (const repairStatus of projected.repair_statuses) {
      for (const status of projected.finding_closure_statuses) {
        const input = closureInput();
        input.findings[0]!.severity = severity as StageQualityFinding['severity'];
        input.repairMap[0]!.repair_status = repairStatus as StageQualityRepairMapEntry['repair_status'];
        input.reReview.finding_closures[0]!.status = status as StageQualityFindingClosure['status'];
        assert.equal(evaluateStageQualityFindingClosure(input).trigger_repair, status !== 'closed');
      }
    }
  }
});

test('closure_status cannot replace the required status key', () => {
  const input = closureInput();
  const { status, ...closure } = input.reReview.finding_closures[0]!;
  input.reReview.finding_closures[0] = { ...closure, closure_status: status } as unknown as StageQualityFindingClosure;
  assert.throws(() => evaluateStageQualityFindingClosure(input), /Re-review closure status is invalid/);
});

test('observation cannot replace the required summary key', () => {
  const input = closureInput();
  const { summary, ...observation } = input.reReview.optional_observations[0]!;
  input.reReview.optional_observations[0] = { ...observation, observation: summary } as unknown as StageQualityReReviewResult['optional_observations'][number];
  assert.throws(() => evaluateStageQualityFindingClosure(input), /optional_observations.*summary must be a non-empty string/);
});
