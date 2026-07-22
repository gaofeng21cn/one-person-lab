import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runStandardAgentHandlerSandbox } from '../../src/modules/runway/standard-agent-handler-sandbox.ts';

function fixtureRoot() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-handler-')));
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
    workspaceRoot: checkoutRoot,
    workspaceReadRoot: checkoutRoot,
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
    workspaceRoot: checkoutRoot,
    workspaceReadRoot: checkoutRoot,
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
    workspaceRoot: checkoutRoot,
    workspaceReadRoot: checkoutRoot,
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
    workspaceRoot: checkoutRoot,
    workspaceReadRoot: checkoutRoot,
    binding: { kind: 'python_callable', module: 'sample.handler', callable: 'evaluate' },
    request: { target },
  }), /failed closed/);
  assert.equal(fs.existsSync(target), false);
});

for (const runtime of ['typescript', 'python'] as const) {
  test(`${runtime} handler can read its Study root and cannot read a sibling Study`, () => {
    const checkoutRoot = fixtureRoot();
    const workspaceRoot = fixtureRoot();
    fs.mkdirSync(path.join(workspaceRoot, 'studies', 'study-001'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, 'studies', 'study-002'), { recursive: true });
    const studyOneRoot = fs.realpathSync.native(path.join(workspaceRoot, 'studies', 'study-001'));
    const studyTwoRoot = fs.realpathSync.native(path.join(workspaceRoot, 'studies', 'study-002'));
    const studyOneFile = path.join(studyOneRoot, 'evidence.txt');
    const studyTwoFile = path.join(studyTwoRoot, 'evidence.txt');
    const siblingLink = path.join(studyOneRoot, 'sibling-evidence.txt');
    fs.writeFileSync(studyOneFile, 'study-001');
    fs.writeFileSync(studyTwoFile, 'study-002-secret');
    fs.symlinkSync(studyTwoFile, siblingLink);
    try {
      if (runtime === 'typescript') {
        fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
          "import fs from 'node:fs';",
          'export function evaluate(request: Record<string, unknown>) {',
          "  return { value: fs.readFileSync(String(request.target), 'utf8') };",
          '}',
          '',
        ].join('\n'));
      } else {
        fs.mkdirSync(path.join(checkoutRoot, 'src', 'sample'), { recursive: true });
        fs.writeFileSync(path.join(checkoutRoot, 'src', 'sample', '__init__.py'), '');
        fs.writeFileSync(path.join(checkoutRoot, 'src', 'sample', 'handler.py'), [
          'def evaluate(request):',
          '    with open(request["target"], encoding="utf-8") as handle:',
          '        return {"value": handle.read()}',
          '',
        ].join('\n'));
      }
      const binding = runtime === 'typescript'
        ? { kind: 'typescript_export' as const, file: 'handler.ts', export: 'evaluate' }
        : { kind: 'python_callable' as const, module: 'sample.handler', callable: 'evaluate' };
      const run = (target: string) => runStandardAgentHandlerSandbox({
        checkoutRoot,
        workspaceRoot,
        workspaceReadRoot: studyOneRoot,
        binding,
        request: { target },
      });

      assert.deepEqual(run(studyOneFile).output, { value: 'study-001' });
      assert.throws(
        () => run(studyTwoFile),
        (error: unknown) => {
          assert.match(String(error), /failed closed/i);
          assert.equal(
            (error as { details?: Record<string, unknown> }).details?.failure_code,
            'standard_agent_handler_execution_failed',
          );
          return true;
        },
      );
      assert.throws(() => run(siblingLink), /failed closed/i);
    } finally {
      fs.rmSync(checkoutRoot, { recursive: true, force: true });
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
}

test('handler sandbox rejects a workspace read root outside its workspace', () => {
  const checkoutRoot = fixtureRoot();
  const workspaceRoot = fixtureRoot();
  const outsideRoot = fixtureRoot();
  try {
    fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
      'export function evaluate() {',
      '  return { value: true };',
      '}',
      '',
    ].join('\n'));
    assert.throws(
      () => runStandardAgentHandlerSandbox({
        checkoutRoot,
        workspaceRoot,
        workspaceReadRoot: outsideRoot,
        binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
        request: {},
      }),
      (error: unknown) => {
        assert.equal(
          (error as { details?: Record<string, unknown> }).details?.failure_code,
          'standard_agent_handler_read_root_escape',
        );
        return true;
      },
    );
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('handler sandbox rejects a canonical Study root replaced by a sibling symlink', () => {
  const checkoutRoot = fixtureRoot();
  const workspaceRoot = fixtureRoot();
  const declaredReadRoot = path.join(workspaceRoot, 'studies', 'study-001');
  const siblingRoot = path.join(workspaceRoot, 'studies', 'study-002');
  try {
    fs.mkdirSync(declaredReadRoot, { recursive: true });
    fs.mkdirSync(siblingRoot, { recursive: true });
    fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
      'export function evaluate() {',
      '  return { value: true };',
      '}',
      '',
    ].join('\n'));
    fs.rmSync(declaredReadRoot, { recursive: true });
    fs.symlinkSync(siblingRoot, declaredReadRoot);
    assert.throws(
      () => runStandardAgentHandlerSandbox({
        checkoutRoot,
        workspaceRoot,
        workspaceReadRoot: declaredReadRoot,
        binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
        request: {},
      }),
      (error: unknown) => {
        assert.equal(
          (error as { details?: Record<string, unknown> }).details?.failure_code,
          'standard_agent_handler_read_root_not_canonical',
        );
        return true;
      },
    );
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
