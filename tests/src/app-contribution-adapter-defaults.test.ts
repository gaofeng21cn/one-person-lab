import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';

import { runDeclarativeAppContribution } from '../../src/read-models/operator/app-contribution-adapter.ts';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-adapter-defaults-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'workspace.json'), JSON.stringify({ workspace_id: 'default-workspace' }));
  fs.writeFileSync(path.join(root, 'selected.json'), JSON.stringify({ workspace_id: 'selected-workspace' }));
  const inputSchema = {
    type: 'object',
    properties: { workspace_file: { type: 'string', default: 'workspace.json' } },
    required: ['workspace_file'],
  };
  fs.writeFileSync(path.join(root, 'app-contribution-adapter.json'), JSON.stringify({
    schema_version: 'opl-package-app-contribution-adapter.v1',
    reads: {
      'fixture.v1#workspace': {
        kind: 'json_file', root: 'package', path: '${input.workspace_file}', input_schema: inputSchema,
      },
      'fixture.v1#both': [
        { kind: 'json_file', root: 'package', path: 'workspace.json' },
        { kind: 'json_file', root: 'package', path: 'selected.json' },
      ],
    },
    actions: {
      'fixture.v1#change': {
        kind: 'command', cwd: 'package', argv: ['./must-not-run'], input_schema: inputSchema,
      },
    },
  }));
  return (operation: 'read' | 'execute', ref: string, input: Record<string, unknown> = {}) => (
    runDeclarativeAppContribution({
      packageRoot: root,
      request: { schema_version: 'opl-package-app-contribution-request.v1', operation, ref, input },
    }) as { ok: boolean; result: unknown }
  );
}

test('read defaults satisfy required fields before expanding file templates', (t) => {
  const invoke = fixture(t);
  const input = {};
  const response = invoke('read', 'fixture.v1#workspace', input);
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { workspace_id: 'default-workspace' });
  assert.deepEqual(input, {});
});

test('explicit read input takes precedence over schema defaults', (t) => {
  const invoke = fixture(t);
  const response = invoke('read', 'fixture.v1#workspace', { workspace_file: 'selected.json' });
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { workspace_id: 'selected-workspace' });
});

test('execute requires explicit input even when its schema declares a default', (t) => {
  const invoke = fixture(t);
  const response = invoke('execute', 'fixture.v1#change');
  assert.equal(response.ok, true);
  assert.equal((response.result as Record<string, unknown>).state, 'input_required');
  assert.deepEqual((response.result as Record<string, unknown>).missing_fields, ['workspace_file']);
});

test('array entries read each declared file', (t) => {
  const invoke = fixture(t);
  const response = invoke('read', 'fixture.v1#both');
  assert.equal(response.ok, true);
  const result = response.result as { state: string; data: { items: Array<{ value: unknown }> } };
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.data.items.map((item) => item.value), [
    { workspace_id: 'default-workspace' },
    { workspace_id: 'selected-workspace' },
  ]);
});
