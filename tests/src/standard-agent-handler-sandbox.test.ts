import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runStandardAgentHandlerSandbox } from '../../src/modules/runway/standard-agent-handler-sandbox.ts';

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-handler-'));
}

test('TypeScript handler runs through Node permission model and emits one canonical JSON value', () => {
  const checkoutRoot = fixtureRoot();
  fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
    'export async function evaluate(request: Record<string, unknown>) {',
    "  return { z: request.value, a: 'ok' };",
    '}',
    '',
  ].join('\n'));

  const result = runStandardAgentHandlerSandbox({
    checkoutRoot,
    binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
    request: { value: 7 },
  });

  assert.equal(result.runtime_kind, 'node_permission_model');
  assert.equal(result.stdout_bytes.toString('utf8'), '{"a":"ok","z":7}\n');
  assert.deepEqual(result.output, { a: 'ok', z: 7 });
});

test('TypeScript handler cannot write files or spawn child processes', () => {
  const checkoutRoot = fixtureRoot();
  fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
    "import fs from 'node:fs';",
    "import { spawnSync } from 'node:child_process';",
    'export function evaluate() {',
    "  fs.writeFileSync(new URL('./forbidden.txt', import.meta.url), 'no');",
    "  return { child: spawnSync('/usr/bin/true').status };",
    '}',
    '',
  ].join('\n'));

  assert.throws(() => runStandardAgentHandlerSandbox({
    checkoutRoot,
    binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
    request: {},
  }), /failed closed/);
  assert.equal(fs.existsSync(path.join(checkoutRoot, 'forbidden.txt')), false);
});

test('Python handler runs through sandbox-exec and the Python audit hook', () => {
  const checkoutRoot = fixtureRoot();
  fs.mkdirSync(path.join(checkoutRoot, 'src', 'sample'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'src', 'sample', '__init__.py'), '');
  fs.writeFileSync(path.join(checkoutRoot, 'src', 'sample', 'handler.py'), [
    'def evaluate(request):',
    '    return {"z": request["value"], "a": "ok"}',
    '',
  ].join('\n'));

  const result = runStandardAgentHandlerSandbox({
    checkoutRoot,
    binding: { kind: 'python_callable', module: 'sample.handler', callable: 'evaluate' },
    request: { value: 9 },
  });

  assert.equal(result.runtime_kind, 'python_audit_hook');
  assert.equal(result.stdout_bytes.toString('utf8'), '{"a":"ok","z":9}\n');
  assert.deepEqual(result.output, { a: 'ok', z: 9 });
});

test('Python handler cannot write files', () => {
  const checkoutRoot = fixtureRoot();
  fs.mkdirSync(path.join(checkoutRoot, 'src', 'sample'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'src', 'sample', '__init__.py'), '');
  fs.writeFileSync(path.join(checkoutRoot, 'src', 'sample', 'handler.py'), [
    'def evaluate(request):',
    '    with open(request["target"], "w", encoding="utf-8") as handle:',
    '        handle.write("no")',
    '    return {"status": "unexpected"}',
    '',
  ].join('\n'));
  const target = path.join(checkoutRoot, 'forbidden.txt');

  assert.throws(() => runStandardAgentHandlerSandbox({
    checkoutRoot,
    binding: { kind: 'python_callable', module: 'sample.handler', callable: 'evaluate' },
    request: { target },
  }), /failed closed/);
  assert.equal(fs.existsSync(target), false);
});
