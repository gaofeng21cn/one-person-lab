import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusedViewInput, ownerReadbackRequest, resolveViewHandoff } from '../../src/mcp-app/handoff.js';

const view = { package_id: 'fixture', view_id: 'review', data_ref: 'fixture.v1#review' };

test('same-package navigation cannot reuse another view target or edit a captured input', () => {
  const input = { workspace_path: '/a', target: { id: 'a', revision: 2 } };
  const focused = focusedViewInput(view, 'fixture:review', input);
  input.target.revision = 3;
  assert.equal(focused.target.revision, 2);
  assert.deepEqual(focusedViewInput({ ...view, view_id: 'other' }, 'fixture:review', input), {});
  assert.deepEqual(focusedViewInput({ ...view, package_id: 'other' }, 'fixture:review', input), {});
});

test('owner readback keeps the original package and only uses declared read refs', () => {
  const input = { item_id: 'a', revision: 2 };
  const receiptView = { ...view, view_id: 'status', data_ref: 'fixture.v1#status' };
  const result = { readback: { package_id: 'another-package', data_ref: receiptView.data_ref, input: { request_id: 'request-a' } } };
  assert.deepEqual(ownerReadbackRequest(view, input, result, [view, receiptView]), {
    package_id: 'fixture', ref: receiptView.data_ref, input: { request_id: 'request-a' },
  });
  assert.deepEqual(ownerReadbackRequest(view, input, result, [view]), {
    package_id: 'fixture', ref: view.data_ref, input,
  });
});


test('runtime handoff can only open a declared view and preserves exact review evidence', () => {
  const target = { package_id: 'opl-runtime', view_id: 'opl.runtime.item' };
  const handoff = { ...target, input: { item_id: 'task-a', review_context: { artifact_refs: ['artifacts/review.md'], artifact_hashes: ['sha256:accepted'] } } };
  assert.equal(resolveViewHandoff(handoff, [view]), null);
  const opened = resolveViewHandoff(handoff, [view, target]);
  handoff.input.item_id = 'task-b';
  assert.equal(opened?.input.item_id, 'task-a');
  assert.deepEqual(opened?.input.review_context.artifact_hashes, ['sha256:accepted']);
});
