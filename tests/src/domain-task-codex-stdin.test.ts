import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCodexExecArgs,
  runCodexCommandStreaming,
} from '../../src/modules/runway/domain-task-runtime.ts';

test('Codex exec can carry large prompts over stdin instead of argv', () => {
  const prompt = 'x'.repeat(1024 * 1024);
  const args = buildCodexExecArgs(prompt, { promptViaStdin: true });

  assert.equal(args.at(-1), '-');
  assert.equal(args.includes(prompt), false);
});

test('Codex streaming transport writes the supplied prompt to child stdin', async () => {
  const prompt = 'stdin prompt payload';
  const result = await runCodexCommandStreaming([
    '-e',
    'let body=""; process.stdin.on("data", chunk => body += chunk); process.stdin.on("end", () => process.stdout.write(body));',
  ], {
    binaryPath: process.execPath,
    stdin: prompt,
    timeoutMs: 5000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trimEnd(), prompt);
});

test('Codex streaming transport tolerates a completed child closing stdin early', async () => {
  const result = await runCodexCommandStreaming([
    '-e',
    'process.stdout.write("completed\\n"); process.exit(0);',
  ], {
    binaryPath: process.execPath,
    stdin: 'x'.repeat(4 * 1024 * 1024),
    timeoutMs: 5000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'completed\n');
});
