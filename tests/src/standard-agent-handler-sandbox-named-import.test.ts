import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runStandardAgentHandlerSandbox } from '../../src/adapters/execution/standard-agent-handler-sandbox.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';

function fixtureRoot() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-named-import-')));
}

test('TypeScript ESM named imports cannot follow a symlink outside the Study read root', () => {
  // Given a Study symlink targeting sibling evidence and a handler using an ESM named import.
  const checkoutRoot = fixtureRoot();
  const workspaceRoot = fixtureRoot();
  const studyOneRoot = path.join(workspaceRoot, 'study-001');
  const studyTwoRoot = path.join(workspaceRoot, 'study-002');
  fs.mkdirSync(studyOneRoot);
  fs.mkdirSync(studyTwoRoot);
  const siblingEvidence = path.join(studyTwoRoot, 'evidence.txt');
  const linkedEvidence = path.join(studyOneRoot, 'linked-evidence.txt');
  fs.writeFileSync(siblingEvidence, 'study-002-secret');
  fs.symlinkSync(siblingEvidence, linkedEvidence);
  fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
    "import { readFileSync } from 'node:fs';",
    'export function evaluate(request: Record<string, unknown>) {',
    "  return { value: readFileSync(String(request.target), 'utf8') };",
    '}',
    '',
  ].join('\n'));

  try {
    // When the handler follows the symlink, then the realpath read guard fails closed.
    assert.throws(
      () => runStandardAgentHandlerSandbox({
        checkoutRoot,
        workspaceRoot,
        workspaceReadRoot: studyOneRoot,
        binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
        request: { target: linkedEvidence },
      }),
      (error: unknown) => {
        assert(error instanceof FrameworkContractError);
        assert.equal(error.details?.failure_code, 'standard_agent_handler_execution_failed');
        assert.match(String(error.details?.stderr), /workspace read outside the handler scope denied/);
        return true;
      },
    );
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('TypeScript dynamic JSON imports cannot read a sibling Study', () => {
  const checkoutRoot = fixtureRoot();
  const workspaceRoot = fixtureRoot();
  const studyRoot = path.join(workspaceRoot, 'study-001');
  const siblingRoot = path.join(workspaceRoot, 'study-002');
  fs.mkdirSync(studyRoot);
  fs.mkdirSync(siblingRoot);
  const siblingEvidence = path.join(siblingRoot, 'evidence.json');
  fs.writeFileSync(siblingEvidence, JSON.stringify({ secret: 'sibling-study-only' }));
  fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
    'export async function evaluate(request: Record<string, unknown>) {',
    "  return (await import(String(request.target), { with: { type: 'json' } })).default;",
    '}',
    '',
  ].join('\n'));

  try {
    assert.throws(
      () => runStandardAgentHandlerSandbox({
        checkoutRoot,
        workspaceRoot,
        workspaceReadRoot: studyRoot,
        binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
        request: { target: siblingEvidence },
      }),
      (error: unknown) => {
        assert(error instanceof FrameworkContractError);
        assert.equal(error.details?.failure_code, 'standard_agent_handler_execution_failed');
        return true;
      },
    );
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
