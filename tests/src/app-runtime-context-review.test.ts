import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runtimeArtifactReview, validateRuntimeReviewContext } from '../../src/read-models/operator/app-contribution-runtime-context.ts';
import { executeFrameworkMcpAppAction, runtimeActionsForItem, OPL_RUNTIME_ACTION_REF } from '../../src/read-models/operator/app-mcp-runtime-actions.ts';
import type { WorkItemProjectionItem } from '../../src/read-models/operator/work-item-projection/types.ts';

test('artifact handoff binds original task and exact bytes without copying contents', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-context-'));
  try {
    const project = path.join(workspace, 'book');
    fs.mkdirSync(project);
    const file = path.join(project, 'chapter.md');
    fs.writeFileSync(file, 'Original chapter');
    const item = { item_id: 'canonical-book', identity: {
      agent_id: 'book-owner', domain_id: 'books', work_item_id: 'book', domain_work_item_id: 'book',
      work_item_scope_id: 'book-scope', identity_state: 'resolved', workspace_path: workspace,
      work_item_root: project,
    } } as unknown as WorkItemProjectionItem;
    const review = runtimeArtifactReview(item, { id: 'chapter', path: file }) as any;
    assert.equal(review.revision, `sha256:${createHash('sha256').update('Original chapter').digest('hex')}`);
    assert.deepEqual(review.review_context.artifact_refs, ['book/chapter.md']);
    assert.equal(review.runtime_handoff.input.item_id, 'canonical-book');
    assert.equal(JSON.stringify(review).includes('Original chapter'), false);
    validateRuntimeReviewContext(item, review.review_context);
    assert.deepEqual(runtimeArtifactReview(item, { id: 'chapter', path: file }), review);
    fs.writeFileSync(file, 'Revised chapter');
    assert.throws(() => validateRuntimeReviewContext(item, review.review_context), /changed/);
    const fresh = runtimeArtifactReview(item, { id: 'chapter', path: file }) as any;
    validateRuntimeReviewContext(item, fresh.review_context);
    assert.throws(() => validateRuntimeReviewContext(item, {
      ...fresh.review_context, work_item_identity: { ...fresh.review_context.work_item_identity, work_item_id: 'another' },
    }), /selected task/);
    assert.throws(() => validateRuntimeReviewContext(item, {
      ...fresh.review_context, artifact_refs: ['../outside'],
    }), /changed/);
    const shared = path.join(workspace, 'index.md');
    fs.writeFileSync(shared, 'Shared index');
    validateRuntimeReviewContext(item, { ...fresh.review_context, artifact_refs: ['index.md'],
      artifact_hashes: [`sha256:${createHash('sha256').update('Shared index').digest('hex')}`] });
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside.md`);
    fs.writeFileSync(outside, 'Private material');
    const linked = path.join(project, 'linked.md');
    fs.symlinkSync(outside, linked);
    assert.deepEqual(runtimeArtifactReview(item, { path: linked }), { path: linked });
    assert.throws(() => validateRuntimeReviewContext(item, {
      ...fresh.review_context, artifact_refs: ['book/linked.md'],
    }), /changed/);
    fs.unlinkSync(outside);
    fs.unlinkSync(file);
    assert.throws(() => validateRuntimeReviewContext(item, fresh.review_context), /changed/);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});

test('runtime decision reads current artifact bytes before dispatch and carries the evidence to its original owner', async () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-dispatch-')));
  try {
    const file = path.join(workspace, 'decision.md');
    fs.writeFileSync(file, 'Revise the introduction');
    const item = { item_id: 'book', identity: {
      agent_id: 'writer', domain_id: 'books', work_item_id: 'book', domain_work_item_id: 'book',
      work_item_scope_id: 'scope', identity_state: 'resolved', workspace_path: workspace,
      work_item_root: workspace,
    }, visibility: { state: 'visible' }, execution: { attempt_id: 'attempt', attempt_ids: ['attempt'] },
    lifecycle: {}, action: {} } as unknown as WorkItemProjectionItem;
    const route = { action_id: 'decision', action_kind: 'provider_signal:human_gate', owner: 'provider',
      route_target_kind: 'provider_signal', stage_attempt_id: 'attempt', ref: 'human-gate:attempt' };
    const snapshot = { runtime_tray_snapshot: { app_operator_drilldown: {
      operator_action_routing_refs: { refs: [route] },
      app_execution_bridge: { safe_action_routes: [{ ...route, can_submit_to_safe_action_shell: true }] },
    } } };
    const action = runtimeActionsForItem(item, snapshot.runtime_tray_snapshot)[0];
    const review = runtimeArtifactReview(item, { path: file }) as any;
    const calls: string[][] = [];
    const services = { contracts: {}, projectionProvider: () => ({ items: [item] }),
      runtimeSnapshotProvider: async () => snapshot,
      familyRuntime: async (args: string[]) => { calls.push(args); return { stage_attempt_id: 'attempt' }; },
    };
    const request = { ref: OPL_RUNTIME_ACTION_REF, input: { ...action.input,
      payload: { human_gate_ref: 'decision.md', review_context: review.review_context },
    }, confirmed: true };
    await executeFrameworkMcpAppAction(request, services as any);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], 'attempt');
    assert.deepEqual(JSON.parse(calls[0][6]).review_context, review.review_context);
    fs.writeFileSync(file, 'New decision');
    await assert.rejects(executeFrameworkMcpAppAction(request, services as any), /artifact changed/);
    assert.equal(calls.length, 1, 'stale evidence must never reach the runtime owner');
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
