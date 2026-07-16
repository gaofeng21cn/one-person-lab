import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildCodexExecArgs,
  runDomainCodexPrompt,
  runCodexCommandStreaming,
} from '../../src/modules/runway/domain-task-runtime.ts';

test('Codex exec can carry large prompts over stdin instead of argv', () => {
  const prompt = 'x'.repeat(1024 * 1024);
  const args = buildCodexExecArgs(prompt, { promptViaStdin: true });

  assert.equal(args.at(-1), '-');
  assert.equal(args.includes(prompt), false);
});

test('Codex exec isolates package-bound Skills while preserving the real shell home', () => {
  const args = buildCodexExecArgs('run the package agent', {
    packageSkillBindings: [{
      name: 'med-autoscience',
      path: '/state/projection/.agents/skills/med-autoscience/SKILL.md',
    }],
    shellHome: '/Users/researcher',
  });
  const configs = args.flatMap((entry, index) => entry === '--config' ? [args[index + 1]] : []);

  assert.deepEqual(configs, [
    'skills.config=[{name="med-autoscience",enabled=false},{path="/state/projection/.agents/skills/med-autoscience/SKILL.md",enabled=true}]',
    'shell_environment_policy.set.HOME="/Users/researcher"',
  ]);
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

test('domain Codex prompt transport owns command execution and exact output recovery', async () => {
  const seen: { binary?: string; args?: string[]; input?: string } = {};
  const result = await runDomainCodexPrompt({
    prompt: 'build the visual artifact',
    cwd: process.cwd(),
    timeout_ms: 5000,
    command: ['/fixture/codex', '--fixture-prefix'],
    runner: async (binary, args, options) => {
      seen.binary = binary;
      seen.args = args;
      seen.input = options.input;
      const outputPath = args[args.indexOf('--output-last-message') + 1]!;
      fs.writeFileSync(outputPath, '{"artifact_ref":"fixture"}\n');
      return {
        exitCode: 0,
        stdout: '{"type":"thread.started","thread_id":"thread-1"}\n',
        stderr: '',
      };
    },
  });

  assert.equal(seen.binary, '/fixture/codex');
  assert.equal(seen.args?.[0], '--fixture-prefix');
  assert.equal(seen.args?.at(-1), '-');
  assert.equal(seen.input, 'build the visual artifact');
  assert.equal(result.session_id, 'thread-1');
  assert.equal(result.output, '{"artifact_ref":"fixture"}\n');
  assert.equal(result.authority_boundary.framework_owns_domain_output_semantics, false);
});
