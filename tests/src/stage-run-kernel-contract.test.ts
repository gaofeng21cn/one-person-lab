import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  evaluateStageRunProgress,
  rebuildStageRunReadModel,
  stageRunEvent,
} from '../../src/modules/stagecraft/stage-run-kernel.ts';
import { buildAppStageRunCockpit } from '../../src/modules/stagecraft/stage-run-cockpit.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function contract() {
  return parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/stage-run-kernel-contract.json'),
    'utf8',
  )) as Record<string, any>;
}

test('StageRun contract is passive transport and Codex owns semantic routing', () => {
  const value = contract();
  const serialized = JSON.stringify(value);

  assert.equal(value.contract_kind, 'opl_stage_run_kernel_contract.v2');
  assert.equal(value.machine_boundary.codex_cli_owns.semantic_stage_selection, true);
  assert.equal(value.progress_first_policy.readable_artifact_allows_any_declared_stage, true);
  assert.equal(value.progress_first_policy.quality_budget_exhaustion_blocks_route, false);
  assert.equal(value.launch_policy.framework_semantic_route_role, 'none');
  assert.equal(Object.hasOwn(value.authority_boundary, 'opl_can_create_execution_authorization_blocker'), false);
  assert.equal(serialized.includes('stage_run_execution_authorization_ledger'), false);
  assert.equal(serialized.includes('closeout_binding_gate'), false);
});

test('launch metadata gaps are advisory while unsafe authority and forbidden writes hard stop', () => {
  const advisory = evaluateStageRunProgress({
    phase: 'launch',
    stage_run_id: 'run:1',
    domain_id: 'rca',
    stage_id: 'author_image_pages',
  });
  assert.equal(advisory.status, 'progress_ready_with_quality_debt');
  assert.deepEqual(advisory.launch_hard_stop_reasons, []);

  const unsafe = evaluateStageRunProgress({
    phase: 'launch',
    stage_run_id: 'run:1',
    domain_id: 'rca',
    stage_id: 'author_image_pages',
    authority_boundary: {
      opl_can_write_domain_truth: true,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: true,
  });
  assert.deepEqual(unsafe.launch_hard_stop_reasons.sort(), [
    'authority_boundary_invalid',
    'forbidden_write_required',
  ]);
});

test('readable artifact advances without typed closeout owner answer or review receipt', () => {
  const report = evaluateStageRunProgress({
    phase: 'closeout',
    stage_run_id: 'run:mas:negative-result',
    domain_id: 'mas',
    stage_id: 'bounded_analysis_campaign',
    consumable_artifact_refs: ['mas://analysis/null-result-with-diagnostic'],
  });

  assert.equal(report.transition_outcome, 'completed_with_quality_debt');
  assert.deepEqual(report.closeout_hard_stop_reasons, []);
  assert.ok(report.quality_debt_reasons.includes('owner_answer_missing_for_quality_or_ready_claim'));
});

test('zero readable artifact becomes a no-output diagnostic and next-stage quality debt', () => {
  const report = evaluateStageRunProgress({
    phase: 'closeout',
    stage_run_id: 'run:empty',
    domain_id: 'rca',
    stage_id: 'author_image_pages',
  });

  assert.equal(report.status, 'progress_ready_with_quality_debt');
  assert.equal(report.transition_outcome, 'completed_with_quality_debt');
  assert.deepEqual(report.closeout_hard_stop_reasons, []);
  assert.ok(report.progress_diagnostic_refs.includes('opl://stage-run/run%3Aempty/no-output-diagnostic'));
  assert.ok(report.quality_debt_reasons.includes('no_consumable_artifact_or_owner_answer'));
});

test('StageRun event log stays refs-only and ignores stale identity-bound authority events', () => {
  const events = [
    stageRunEvent({
      event_id: 'e1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'run:1',
      generation: 1,
      observed_at: '2026-07-12T00:00:00Z',
    }),
    stageRunEvent({
      event_id: 'e2',
      event_kind: 'artifact_ref_observed',
      stage_run_id: 'run:1',
      generation: 1,
      observed_at: '2026-07-12T00:01:00Z',
      artifact_ref: 'rca://deck/page-1',
    }),
  ];
  const projection = rebuildStageRunReadModel(events).stage_runs[0];

  assert.equal(projection.stage_run_id, 'run:1');
  assert.equal(projection.artifact_body_included, false);
  assert.equal(projection.domain_truth_included, false);
});

test('StageRun event rejects embedded body and domain verdict authority', () => {
  assert.throws(() => stageRunEvent({
    event_id: 'e1',
    event_kind: 'artifact_ref_observed',
    stage_run_id: 'run:1',
    generation: 1,
    observed_at: '2026-07-12T00:00:00Z',
    artifact_body: 'forbidden',
  }));
  assert.throws(() => stageRunEvent({
    event_id: 'e2',
    event_kind: 'provider_completed',
    stage_run_id: 'run:1',
    generation: 1,
    observed_at: '2026-07-12T00:00:00Z',
    domain_ready: true,
  }));
});

test('App cockpit exposes progress and route options without a next authorization action', () => {
  const cockpit = buildAppStageRunCockpit({
    domain: 'rca',
    current_owner: 'rca',
    stage_id: 'author_image_pages',
    consumable_artifact_refs: ['rca://deck/page-draft'],
  });

  assert.equal(cockpit.next_required_owner_action, null);
  assert.equal(cockpit.stage_run_current_owner_delta.next_stage_may_start, true);
  assert.deepEqual(cockpit.stage_run_current_owner_delta.route_options, [
    'skip',
    'repeat',
    'reverse',
    'route_back',
    'advance',
  ]);
  assert.equal(Object.hasOwn(cockpit, 'execution_authorization'), false);
});
