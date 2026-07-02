import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildDeliveryFeedbackEvent,
  buildFeedbackOpsReadModel,
  buildFeedbackOpsReconcileReceipt,
  readFeedbackOpsEvents,
  submitDeliveryFeedbackEvent,
} from '../../src/agent-lab-feedbackops.ts';
import { resolveOplStatePaths } from '../../src/runtime-state-paths.ts';
import { contractsDir } from './cli/helpers.ts';

function asRecord(value: unknown): Record<string, any> {
  assert.equal(Boolean(value) && typeof value === 'object' && !Array.isArray(value), true);
  return value as Record<string, any>;
}

test('FeedbackOps captures explicit delivery feedback as refs-only idempotent events', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-feedbackops-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;

  try {
    const paths = resolveOplStatePaths();
    const first = submitDeliveryFeedbackEvent({
      targetAgentId: 'mas',
      deliveryRef: 'paper:obesity/current-package',
      feedbackRef: 'user-feedback:obesity/high-quality-sci',
      feedbackKind: 'quality_gap',
      developerWorkOrderCandidateRef: 'developer-work-order-candidate-ref:mas/obesity-feedbackops',
      idempotencyKey: 'feedbackops-test-key',
    }, paths);
    const duplicate = submitDeliveryFeedbackEvent({
      targetAgentId: 'mas',
      deliveryRef: 'paper:obesity/current-package',
      feedbackRef: 'user-feedback:obesity/high-quality-sci',
      feedbackKind: 'quality_gap',
      idempotencyKey: 'feedbackops-test-key',
    }, paths);

    assert.equal(first.status, 'captured');
    assert.equal(duplicate.status, 'duplicate_idempotent_event');
    assert.equal(readFeedbackOpsEvents(paths).length, 1);
    const event = asRecord(first.event);
    const boundary = asRecord(event.authority_boundary);
    assert.equal(boundary.can_write_target_domain_truth, false);
    assert.equal(boundary.can_create_owner_receipt, false);
    assert.equal(event.accepted_feedback_profiles[0], 'target_agent_feedback_external_suite');
    assert.equal(fs.existsSync(paths.agent_lab_feedbackops_event_ledger_file), true);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('FeedbackOps read model gates execution on explicit developer-mode direct route', () => {
  const suiteReady = buildDeliveryFeedbackEvent({
    targetAgentId: 'mas',
    deliveryRef: 'paper:obesity/current-package',
    feedbackRef: 'user-feedback:obesity/missing-refs',
    idempotencyKey: 'suite-ready',
  });
  const queued = buildDeliveryFeedbackEvent({
    targetAgentId: 'rca',
    deliveryRef: 'deck:case-review/current',
    feedbackRef: 'user-feedback:rca/style-gap',
    developerWorkOrderCandidateRef: 'developer-work-order-candidate-ref:rca/style-gap',
    idempotencyKey: 'queued',
  });
  const terminal = buildDeliveryFeedbackEvent({
    targetAgentId: 'oma',
    deliveryRef: 'agent-lab:feedbackops',
    feedbackRef: 'user-feedback:oma/trigger-gap',
    blockerRef: 'typed-blocker-ref:oma/owner-required',
    idempotencyKey: 'terminal',
  });

  const withoutDirectRoute = buildFeedbackOpsReadModel({
    events: [suiteReady, queued, terminal],
    developerMode: { status: 'ready', allowed_route: 'observe-only' },
  });
  assert.equal(withoutDirectRoute.status_buckets.suite_ready.length, 1);
  assert.match(withoutDirectRoute.status_buckets.suite_ready[0], /^feedback-work-order:mas\/feedback_event_/);
  assert.equal(withoutDirectRoute.summary.queued_requires_developer_mode_count, 1);
  assert.equal(withoutDirectRoute.summary.executable_count, 0);
  assert.equal(withoutDirectRoute.summary.completed_or_blocker_count, 1);

  const directRoute = buildFeedbackOpsReadModel({
    events: [queued],
    developerMode: { effective_state: 'active_direct', allowed_route: 'direct_repo_fix' },
  });
  assert.equal(directRoute.summary.executable_count, 1);
  assert.equal(directRoute.work_order_status_items[0].execution_surface, 'opl work-order execute');
  assert.equal(directRoute.work_order_status_items[0].runnable, true);
  assert.equal(directRoute.app_projection.creates_runner_or_queue, false);
  assert.equal(directRoute.authority_boundary.can_create_typed_blocker, false);

  const receipt = buildFeedbackOpsReconcileReceipt({
    developerMode: { effective_state: 'active_direct', allowed_route: 'direct_repo_fix' },
  });
  assert.equal(receipt.status, 'reconciled_refs_only');
  assert.equal(receipt.execution_owner, 'opl_work_order_execute_when_developer_mode_allows');
});

test('FeedbackOps contract declares universal trigger and no-authority boundary', () => {
  const contract = JSON.parse(fs.readFileSync(
    path.join(contractsDir, 'agent-lab-contract.json'),
    'utf8',
  ));
  const surface = contract.feedbackops_delivery_feedback_surface;

  assert.equal(surface.surface_kind, 'opl_feedbackops_read_model');
  assert.equal(surface.refs_only, true);
  assert.equal(surface.trigger_policy.feedback_capture_requires_developer_mode, false);
  assert.equal(surface.trigger_policy.developer_mode_required_for_execution, true);
  assert.equal(surface.accepted_feedback_profiles.includes('target_agent_feedback_external_suite'), true);
  assert.equal(surface.statuses.includes('queued_requires_developer_mode'), true);
  assert.equal(surface.authority_boundary.can_create_second_runner_or_queue, false);
  assert.equal(surface.authority_boundary.can_write_target_domain_truth, false);
  assert.equal(surface.authority_boundary.can_authorize_target_domain_quality_or_export, false);
  assert.equal(surface.authority_boundary.can_create_owner_receipt, false);
});
