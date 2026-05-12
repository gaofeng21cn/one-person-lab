import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeCodexFixture } from './cli/helpers.ts';
import type { AgentExecutionReceipt } from '../../src/agent-executor.ts';
import { runProductEntryExec } from '../../src/product-entry.ts';

function makeExecutable(name: string, body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-product-entry-executor-'));
  const file = path.join(fixtureRoot, name);
  fs.writeFileSync(file, body, { mode: 0o755 });
  return { fixtureRoot, file };
}

function requireAgentExecutionReceipt(receipt?: AgentExecutionReceipt) {
  assert.ok(receipt, 'product entry output must include an agent execution receipt.');
  return receipt;
}

function requireCloseoutRefs(receipt: AgentExecutionReceipt) {
  const closeoutRefs = receipt.closeout_packet?.closeout_refs;
  assert.ok(Array.isArray(closeoutRefs), 'agent execution receipt must include closeout refs.');
  return closeoutRefs;
}

test('Product Entry exec defaults to codex_cli through the OPL agent executor receipt', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-product-entry-exec"}\\n'
  printf '{"item":{"type":"agent_message","text":"Product entry exec complete"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const output = runProductEntryExec({
      dryRun: false,
      prompt: 'Run a product-entry exec task.',
    });

    assert.equal(output.product_entry.executor_backend, 'codex_cli');
    const receipt = requireAgentExecutionReceipt(output.product_entry.agent_execution_receipt);
    assert.equal(receipt.executor_kind, 'codex_cli');
    assert.equal(output.product_entry.codex.session_id, 'thread-product-entry-exec');
    assert.equal(output.product_entry.codex.response, 'Product entry exec complete');
    assert.equal(output.product_entry.codex.exit_code, 0);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Product Entry exec can explicitly select a non-default OPL executor', () => {
  const fake = makeExecutable(
    'claude',
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:product-entry-claude"]}\\n\'\n',
  );
  const previousClaudeBin = process.env.OPL_CLAUDE_CODE_BIN;
  const previousPath = process.env.PATH;
  try {
    process.env.OPL_CLAUDE_CODE_BIN = fake.file;
    process.env.PATH = '';
    const output = runProductEntryExec({
      dryRun: false,
      prompt: 'Run through Claude Code.',
      executorKind: 'claude_code',
    });

    assert.equal(output.product_entry.executor_backend, 'claude_code');
    const receipt = requireAgentExecutionReceipt(output.product_entry.agent_execution_receipt);
    assert.equal(receipt.executor_kind, 'claude_code');
    assert.equal(requireCloseoutRefs(receipt)[0], 'receipt:product-entry-claude');
    assert.equal(receipt.proof?.fallback_allowed, false);
  } finally {
    if (previousClaudeBin === undefined) {
      delete process.env.OPL_CLAUDE_CODE_BIN;
    } else {
      process.env.OPL_CLAUDE_CODE_BIN = previousClaudeBin;
    }
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});
