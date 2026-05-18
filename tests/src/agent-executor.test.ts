import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFakeCodexFixture } from './cli/helpers.ts';
import {
  inspectAgentExecutor,
  resolveAgentExecutorKind,
  runAgentExecutor,
} from '../../src/agent-executor.ts';
import { FrameworkContractError } from '../../src/contracts.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function makeExecutable(name: string, body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-executor-'));
  const file = path.join(fixtureRoot, name);
  fs.writeFileSync(file, body, { mode: 0o755 });
  return { fixtureRoot, file };
}

test('agent executor registry resolves explicit, stage-attempt, env, and default order', () => {
  assert.equal(resolveAgentExecutorKind({ explicitExecutor: 'hermes-agent' }), 'hermes_agent');
  assert.equal(resolveAgentExecutorKind({ stageAttemptExecutor: 'claude_code' }), 'claude_code');
  assert.equal(resolveAgentExecutorKind({ env: { OPL_EXECUTOR_KIND: 'claude_code' } }), 'claude_code');
  assert.equal(resolveAgentExecutorKind({}), 'codex_cli');
  assert.throws(
    () => resolveAgentExecutorKind({ explicitExecutor: 'external_llm' }),
    /Unsupported OPL executor kind/,
  );
});

test('codex_cli executor returns the shared AgentExecutionReceipt shape', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-agent-executor"}\\n'
  printf '{"item":{"type":"agent_message","text":"Codex executor done"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = runAgentExecutor({
      executor_kind: 'codex_cli',
      prompt: 'Run a default executor task.',
      cwd: repoRoot,
    });

    assert.equal(receipt.surface_kind, 'opl_agent_execution_receipt');
    assert.equal(receipt.executor_kind, 'codex_cli');
    assert.equal(receipt.session_id, 'thread-agent-executor');
    assert.equal(receipt.non_equivalence_notice, 'codex_cli_first_class_default');
    assert.equal(receipt.proof?.default_executor, true);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('hermes_agent execution requires full loop proof with tool events', () => {
  const helper = makeExecutable(
    'hermes-helper',
    `#!/usr/bin/env node
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  if (request.domain_payload?.route_id !== 'critique') {
    process.stderr.write('missing domain payload');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify({
    surface_kind: 'opl_agent_execution_receipt',
    executor_kind: 'hermes_agent',
    mode: 'agent_loop',
    cwd: request.cwd,
    prompt_preview: request.prompt.slice(0, 120),
    session_id: 'hermes-session-1',
    event_summary: [
      { event_kind: 'tool_start', value: 'shell' },
      { event_kind: 'tool_complete', value: 'ok' }
    ],
    stdout_preview: 'ok',
    stderr_preview: '',
    exit_code: 0,
    closeout_packet: null,
    executor_contract: { entrypoint: 'run_agent.AIAgent.run_conversation', model: 'gpt-test' },
    capabilities: ['full_agent_loop_receipt', 'tool_event_proof'],
    proof: { full_agent_loop_proved: true, tool_call_count: 1, event_count: 2 }
  }));
});
`,
  );
  try {
    const receipt = runAgentExecutor({
      executor_kind: 'hermes_agent',
      prompt: 'Return a typed closeout if available.',
      cwd: repoRoot,
      domain_payload: { route_id: 'critique' },
      env: { OPL_HERMES_AGENT_EXECUTOR_BIN: helper.file },
    });

    assert.equal(receipt.executor_kind, 'hermes_agent');
    assert.equal(receipt.session_id, 'hermes-session-1');
    assert.equal(receipt.executor_contract?.entrypoint, 'run_agent.AIAgent.run_conversation');
    assert.equal(receipt.event_summary.length, 2);
    assert.equal(receipt.proof?.full_agent_loop_proved, true);
    assert.equal(receipt.non_equivalence_notice, 'connectivity_lifecycle_receipt_audit_only');
  } finally {
    fs.rmSync(helper.fixtureRoot, { recursive: true, force: true });
  }
});

test('hermes_agent execution accepts log output before the final receipt line', () => {
  const helper = makeExecutable(
    'hermes-helper',
    `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write('log: find pyproject.toml\\n');
  process.stdout.write(JSON.stringify({
    surface_kind: 'opl_agent_execution_receipt',
    executor_kind: 'hermes_agent',
    mode: 'agent_loop',
    cwd: process.cwd(),
    prompt_preview: 'logged helper',
    session_id: 'hermes-session-logged',
    event_summary: [
      { event_kind: 'tool_start', value: 'find' },
      { event_kind: 'tool_complete', value: 'ok' }
    ],
    stdout_preview: 'ok',
    stderr_preview: '',
    exit_code: 0,
    closeout_packet: null,
    capabilities: ['full_agent_loop_receipt', 'tool_event_proof'],
    proof: { full_agent_loop_proved: true, tool_call_count: 1, event_count: 2 }
  }) + '\\n');
});
`,
  );
  try {
    const receipt = runAgentExecutor({
      executor_kind: 'hermes_agent',
      prompt: 'Return a receipt after logs.',
      cwd: repoRoot,
      env: { OPL_HERMES_AGENT_EXECUTOR_BIN: helper.file },
    });

    assert.equal(receipt.session_id, 'hermes-session-logged');
    assert.equal(receipt.event_summary.length, 2);
  } finally {
    fs.rmSync(helper.fixtureRoot, { recursive: true, force: true });
  }
});

test('hermes_agent execution fails closed when the helper does not return a JSON receipt', () => {
  const helper = makeExecutable(
    'hermes-helper',
    `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write('not json\\n');
});
`,
  );
  try {
    assert.throws(
      () => runAgentExecutor({
        executor_kind: 'hermes_agent',
        prompt: 'Return a receipt.',
        cwd: repoRoot,
        env: { OPL_HERMES_AGENT_EXECUTOR_BIN: helper.file },
      }),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_shape_invalid'
        && error.details?.fallback_allowed === false,
    );
  } finally {
    fs.rmSync(helper.fixtureRoot, { recursive: true, force: true });
  }
});

test('hermes_agent execution fails closed when full loop proof is incomplete', () => {
  const helper = makeExecutable(
    'hermes-helper',
    `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    surface_kind: 'opl_agent_execution_receipt',
    executor_kind: 'hermes_agent',
    mode: 'agent_loop',
    event_summary: [],
    proof: { full_agent_loop_proved: false, tool_call_count: 0 }
  }) + '\\n');
});
`,
  );
  try {
    assert.throws(
      () => runAgentExecutor({
        executor_kind: 'hermes_agent',
        prompt: 'Return a receipt.',
        cwd: repoRoot,
        env: { OPL_HERMES_AGENT_EXECUTOR_BIN: helper.file },
      }),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_shape_invalid',
    );
  } finally {
    fs.rmSync(helper.fixtureRoot, { recursive: true, force: true });
  }
});

test('hermes_agent doctor reports missing binary without Codex fallback', () => {
  const doctor = inspectAgentExecutor('hermes_agent', {
    env: { OPL_HERMES_AGENT_EXECUTOR_BIN: '', PATH: '' },
  });
  assert.equal(doctor.executor_kind, 'hermes_agent');
  assert.equal(doctor.ready, false);
  assert.equal(doctor.issues[0], 'hermes_agent_binary_missing');
  assert.equal(doctor.fallback_allowed, false);

  assert.throws(
    () => runAgentExecutor({
      executor_kind: 'hermes_agent',
      prompt: 'Return a receipt.',
      cwd: repoRoot,
      env: { OPL_HERMES_AGENT_EXECUTOR_BIN: '', PATH: '' },
    }),
    (error) => error instanceof FrameworkContractError
      && error.code === 'surface_not_found'
      && error.details?.fallback_allowed === false,
  );
});

test('claude_code execution uses configured binary without Codex fallback', () => {
  const fake = makeExecutable(
    'claude',
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:claude"]}\\n\'\n',
  );
  try {
    const receipt = runAgentExecutor({
      executor_kind: 'claude_code',
      prompt: 'Build the domain artifact.',
      cwd: repoRoot,
      env: { OPL_CLAUDE_CODE_BIN: fake.file, PATH: '' },
    });

    assert.equal(receipt.executor_kind, 'claude_code');
    assert.equal(receipt.exit_code, 0);
    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.equal(receipt.proof?.fallback_allowed, false);
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});

test('claude_code execution honors request timeout and fails closed without Codex fallback', () => {
  const fake = makeExecutable(
    'claude',
    `#!${process.execPath}
setTimeout(() => process.stdout.write("late\\n"), 2000);
`,
  );
  try {
    assert.throws(
      () => runAgentExecutor({
        executor_kind: 'claude_code',
        prompt: 'This should time out.',
        cwd: repoRoot,
        timeout_ms: 50,
        env: { OPL_CLAUDE_CODE_BIN: fake.file, PATH: '' },
      }),
      (error) => error instanceof FrameworkContractError
        && error.code === 'launcher_failed'
        && error.details?.timed_out === true
        && error.details?.timeout_ms === 50
        && error.details?.fallback_allowed === false,
    );
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});

test('executor doctor reports Claude Code binary readiness from explicit env path', () => {
  const fake = makeExecutable('claude', '#!/usr/bin/env bash\nprintf "claude fake\\n"\n');
  try {
    const doctor = inspectAgentExecutor('claude_code', {
      env: {
        OPL_CLAUDE_CODE_BIN: fake.file,
        PATH: '',
      },
    });

    assert.equal(doctor.executor_kind, 'claude_code');
    assert.equal(doctor.ready, true);
    assert.equal(doctor.binary_path, fake.file);
    assert.equal(doctor.resolution_source, 'OPL_CLAUDE_CODE_BIN');
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});
