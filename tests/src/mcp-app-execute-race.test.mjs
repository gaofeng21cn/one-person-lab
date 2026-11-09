import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const viewSource = fs.readFileSync(new URL('../../src/mcp-app/view.js', import.meta.url), 'utf8');
const start = viewSource.indexOf('async function executeCommand(');
const end = viewSource.indexOf('\nfunction confirmCommand(', start);
assert.ok(start >= 0 && end > start);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(packageId, readPromise) {
  const view = { package_id: packageId, view_id: 'review', data_ref: `${packageId}.v1#review` };
  const write = deferred();
  const calls = [], contexts = [];
  const state = { selected: view, selectedKey: `${packageId}:review`, itemId: 'A', focusInput: { item_id: 'A' }, result: { item_id: 'A' }, executing: false };
  const sandbox = { state, structuredClone, readGeneration: 1, EXECUTE_TOOL: 'execute', READ_TOOL: 'read',
    $: () => ({ textContent: '', setAttribute(){}, removeAttribute(){} }),
    currentViewInput: () => state.focusInput,
    callTool: async (name, input) => { calls.push({name,input}); return name === 'execute' ? write.promise : readPromise ?? { item_id: input.input.item_id, state: 'ready' }; },
    renderResult(){}, updateContext(){ contexts.push({ selectedItem: state.itemId, result: state.result }); },
    notice(){}, extractEnvelope: value => value, ownerResult: value => value, ownerReadbackRequest(){},
    app: { updateModelContext: async () => {} }, loadSelected: async () => { throw new Error('unknown outcome must not read current selection'); },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${viewSource.slice(start,end)}\nglobalThis.runExecute = executeCommand;`, sandbox);
  const selectB = () => { state.itemId = 'B'; state.focusInput = { item_id: 'B' }; state.result = { item_id: 'B', state: 'ready' }; };
  const run = () => sandbox.runExecute({ action_ref: 'save', confirmation_required: false }, { item_id: 'A', request_id: 'request-a' }, view);
  return { write, calls, contexts, state, selectB, run };
}
for (const packageId of ['domain-owner', 'opl-runtime']) test(`${packageId}: unknown write reads original target without overwriting new selection`, async () => {
  const h = harness(packageId);
  const pending = h.run();
  await new Promise(resolve => setImmediate(resolve));
  h.selectB();
  h.write.reject(new Error('transport lost after dispatch'));
  await pending;
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].name, 'execute');
  assert.equal(h.calls[1].name, 'read');
  assert.equal(h.calls[1].input.input.item_id, 'A');
  assert.equal(h.calls[1].input.input.request_id, 'request-a');
  assert.equal(h.state.itemId, 'B');
  assert.equal(h.state.result.item_id, 'B');
  assert.equal(h.contexts.length, 0);
});
test('selection changed during original target readback is not overwritten', async () => {
  const read = deferred();
  const h = harness('domain-owner', read.promise);
  const pending = h.run();
  h.write.reject(new Error('transport lost after dispatch'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls[1].input.input.item_id, 'A');
  h.selectB();
  read.resolve({ item_id: 'A', state: 'ready' });
  await pending;
  assert.equal(h.state.result.item_id, 'B');
  assert.equal(h.contexts.length, 0);
});
