import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFakeCodexFixture, shellSingleQuote } from './cli/helpers.ts';
import {
  runAgentExecutor,
  runAgentExecutorDoctor,
} from '../../src/modules/runway/agent-executor.ts';
import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function makeExecutable(name: string, body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-executor-'));
  const file = path.join(fixtureRoot, name);
  fs.writeFileSync(file, body, { mode: 0o755 });
  return { fixtureRoot, file };
}

function runCodexJsonLines(lines: Record<string, unknown>[]) {
  const output = lines.map((line) => shellSingleQuote(JSON.stringify(line))).join(' ');
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '%s\\n' ${output}
  exit 0
fi
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    return runAgentExecutor({
      executor_kind: 'codex_cli',
      prompt: 'Return one typed closeout packet.',
      cwd: repoRoot,
    });
  } finally {
    if (previousCodexBin === undefined) delete process.env.OPL_CODEX_BIN;
    else process.env.OPL_CODEX_BIN = previousCodexBin;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('agent executor registry resolves explicit, stage-attempt, env, and default order through public runners', () => {
  const hermes = makeExecutable('hermes-agent', '#!/bin/sh\nprintf "hermes fake\\n"\n');
  const antigravity = makeExecutable('antigravity', '#!/bin/sh\nprintf "antigravity fake\\n"\n');
  const claude = makeExecutable(
    'claude',
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:claude-resolve"]}\\n\'\n',
  );
  const { fixtureRoot: codexFixtureRoot, codexPath } = createFakeCodexFixture(`
  if [ "$1" = "exec" ]; then
    printf '{"type":"thread.started","thread_id":"thread-agent-executor-default"}\\n'
    printf '{"item":{"type":"agent_message","text":"Default executor done"}}\\n'
    exit 0
  fi
  exit 64
  `);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    assert.equal(
      runAgentExecutorDoctor({
        executorKind: 'hermes-agent',
        env: { OPL_HERMES_AGENT_EXECUTOR_BIN: hermes.file, PATH: '' },
      }).executor_doctor.executor_kind,
      'hermes_agent',
    );
    assert.equal(
      runAgentExecutorDoctor({
        executorKind: 'antigravity-cli',
        env: { OPL_ANTIGRAVITY_CLI_BIN: antigravity.file, PATH: '' },
      }).executor_doctor.executor_kind,
      'antigravity_cli',
    );
    assert.equal(
      runAgentExecutor({
        stage_attempt_executor_kind: 'claude_code',
        prompt: 'Resolve from stage attempt executor.',
        cwd: repoRoot,
        env: { OPL_CLAUDE_CODE_BIN: claude.file, PATH: '' },
      }).executor_kind,
      'claude_code',
    );
    assert.equal(
      runAgentExecutor({
        prompt: 'Resolve from env executor.',
        cwd: repoRoot,
        env: { OPL_EXECUTOR_KIND: 'claude_code', OPL_CLAUDE_CODE_BIN: claude.file, PATH: '' },
      }).executor_kind,
      'claude_code',
    );
    assert.equal(
      runAgentExecutor({
        prompt: 'Resolve default executor.',
        cwd: repoRoot,
      }).executor_kind,
      'codex_cli',
    );
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(hermes.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(antigravity.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(claude.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }

  assert.throws(
    () => runAgentExecutor({
      executor_kind: 'external_llm',
      prompt: 'Unsupported executor.',
      cwd: repoRoot,
    }),
    /Unsupported OPL executor kind/,
  );
});

test('agent executor registry resolves request policy before stage policy through public runner', () => {
  const antigravity = makeExecutable(
    'antigravity',
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:antigravity-policy"]}\\n\'\n',
  );
  try {
    assert.equal(
      runAgentExecutor({
        prompt: 'Resolve request policy before stage policy.',
        cwd: repoRoot,
        request_executor_policy: {
          executor_kind: 'antigravity_cli',
          executor_binding_ref: 'executor-binding:antigravity/request-policy',
        },
        stage_attempt_executor_policy: {
          executor_kind: 'claude_code',
          executor_binding_ref: 'executor-binding:claude/stage-policy',
        },
        env: { OPL_ANTIGRAVITY_CLI_BIN: antigravity.file, PATH: '' },
      }).executor_kind,
      'antigravity_cli',
    );
    assert.equal(
      runAgentExecutor({
        prompt: 'Resolve stage policy.',
        cwd: repoRoot,
        stage_attempt_executor_policy: {
          executor_kind: 'antigravity_cli',
          executor_binding_ref: 'executor-binding:antigravity/stage-policy',
        },
        env: { OPL_ANTIGRAVITY_CLI_BIN: antigravity.file, PATH: '' },
      }).executor_kind,
      'antigravity_cli',
    );
  } finally {
    fs.rmSync(antigravity.fixtureRoot, { recursive: true, force: true });
  }
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

test('codex_cli executor projects one final typed JSON agent message as closeout_packet', () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-agent-message-json'],
  };
  const receipt = runCodexJsonLines([
    { type: 'thread.started', thread_id: 'thread-codex-closeout-json' },
    { item: { type: 'agent_message', text: 'Preparing closeout.' } },
    { item: { type: 'agent_message', text: JSON.stringify(closeout) } },
  ]);

  assert.deepEqual(receipt.closeout_packet, closeout);
});

test('codex_cli executor rejects multiple or non-final typed JSON agent-message candidates', () => {
  const first = { surface_kind: 'stage_attempt_closeout_packet', closeout_refs: ['receipt:first'] };
  const second = { surface_kind: 'domain_stage_closeout_packet', closeout_refs: ['receipt:second'] };

  assert.equal(runCodexJsonLines([
    { item: { type: 'agent_message', text: JSON.stringify(first) } },
    { item: { type: 'agent_message', text: JSON.stringify(second) } },
  ]).closeout_packet, null);
  assert.equal(runCodexJsonLines([
    { item: { type: 'agent_message', text: JSON.stringify(first) } },
    { item: { type: 'agent_message', text: 'Final ordinary text.' } },
  ]).closeout_packet, null);
});

test('codex_cli executor keeps ordinary, non-object, non-typed, and event-envelope JSON as null closeout', () => {
  const invalidMessages = [
    'Ordinary final response.',
    '[]',
    JSON.stringify({ surface_kind: 'opl_agent_execution_receipt' }),
    JSON.stringify({ type: 'turn.completed' }),
  ];
  for (const text of invalidMessages) {
    assert.equal(runCodexJsonLines([
      { item: { type: 'agent_message', text } },
    ]).closeout_packet, null, text);
  }

  assert.equal(runCodexJsonLines([{
    surface_kind: 'stage_attempt_closeout_packet',
    item: { type: 'agent_message', text: 'Envelope text is not a closeout.' },
  }]).closeout_packet, null);
});

test('codex_cli executor passes model, provider, and reasoning effort as explicit request policy', () => {
  const capturePath = path.join(os.tmpdir(), `opl-agent-executor-codex-policy-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-agent-executor-policy"}\\n'
  printf '{"item":{"type":"agent_message","text":"Codex policy done"}}\\n'
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
      prompt: 'Run a default executor task with a policy.',
      cwd: repoRoot,
      model: 'gpt-5.5',
      provider: 'openai',
      reasoning_effort: 'high',
    });

    assert.equal(receipt.executor_kind, 'codex_cli');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'exec',
      '--skip-git-repo-check',
      '--full-auto',
      '--json',
      '--cd',
      repoRoot,
      '--model',
      'gpt-5.5',
      '--config',
      'model_provider="openai"',
      '--config',
      'model_reasoning_effort="high"',
      'Run a default executor task with a policy.',
    ]);
    assert.equal(receipt.proof?.reasoning_effort, 'high');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('codex_cli executor activates requested image generation and records it in the receipt', () => {
  const capturePath = path.join(os.tmpdir(), `opl-agent-executor-imagegen-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
printf '{"type":"thread.started","thread_id":"thread-agent-executor-imagegen"}\\n'
exit 0
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const receipt = runAgentExecutor({
      executor_kind: 'codex_cli',
      prompt: 'Generate an image through the executor capability.',
      cwd: repoRoot,
      required_capabilities: ['image_generation'],
    });

    assert.deepEqual(receipt.requested_capabilities, ['image_generation']);
    assert.deepEqual(receipt.activated_capabilities, ['image_generation']);
    assert.equal(receipt.capabilities.includes('image_generation'), true);
    const args = fs.readFileSync(capturePath, 'utf8').trim().split('\n');
    assert.deepEqual(args.slice(4, 6), ['--enable', 'image_generation']);
  } finally {
    previousCodexBin === undefined
      ? delete process.env.OPL_CODEX_BIN
      : process.env.OPL_CODEX_BIN = previousCodexBin;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('agent executor fails closed for unknown or unsupported required capabilities', () => {
  assert.throws(
    () => runAgentExecutor({
      executor_kind: 'codex_cli',
      prompt: 'Request an unknown capability.',
      required_capabilities: ['unknown_capability'],
    }),
    /unsupported required capabilities/,
  );
  assert.throws(
    () => runAgentExecutor({
      executor_kind: 'claude_code',
      prompt: 'Request image generation from a non-Codex executor.',
      required_capabilities: ['image_generation'],
    }),
    /not supported by the selected executor/,
  );
});

test('codex_cli executor enforces request timeout and fails closed', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
sleep 2
printf '{"type":"thread.started","thread_id":"thread-too-late"}\\n'
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    assert.throws(
      () => runAgentExecutor({
        executor_kind: 'codex_cli',
        prompt: 'This executor must time out.',
        timeout_ms: 50,
      }),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'codex_command_failed');
        const details = error.details ?? {};
        assert.equal(details.timed_out, true);
        assert.equal(details.timeout_ms, 50);
        assert.equal(details.timeout_reason, 'total_timeout');
        assert.equal(details.fallback_allowed, false);
        return true;
      },
    );
  } finally {
    previousCodexBin === undefined
      ? delete process.env.OPL_CODEX_BIN
      : process.env.OPL_CODEX_BIN = previousCodexBin;
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
  const request = JSON.parse(input); // reuse-first: allow embedded external executor fixture JSON boundary.
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
  assert.throws(
    () => runAgentExecutorDoctor({
      executorKind: 'hermes_agent',
      env: { OPL_HERMES_AGENT_EXECUTOR_BIN: '', PATH: '' },
    }),
    (error) => error instanceof FrameworkContractError
      && error.code === 'surface_not_found'
      && error.details?.fallback_allowed === false
      && Array.isArray(error.details?.issues)
      && error.details.issues[0] === 'hermes_agent_binary_missing',
  );

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

test('antigravity_cli execution uses configured binary and passes stage model policy without Codex fallback', () => {
  const fake = makeExecutable(
    'antigravity',
    [
      '#!/bin/sh',
      'printf \'executor=%s\\n\' "$1"',
      'printf \'model=%s\\n\' "$2"',
      'printf \'reasoning=%s\\n\' "$3"',
      'printf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:antigravity-html"]}\\n\'',
    ].join('\n'),
  );
  try {
    const receipt = runAgentExecutor({
      prompt: 'Build RCA HTML route.',
      cwd: repoRoot,
      stage_attempt_executor_policy: {
        executor_kind: 'antigravity_cli',
        model: 'gemini-3.5-flash',
        reasoning_effort: 'high',
        provider: 'google',
        executor_binding_ref: 'executor-binding:antigravity/rca-html-route',
      },
      env: { OPL_ANTIGRAVITY_CLI_BIN: fake.file, PATH: '' },
    });

    assert.equal(receipt.executor_kind, 'antigravity_cli');
    assert.equal(receipt.exit_code, 0);
    assert.equal(receipt.stdout_preview.includes('model=gemini-3.5-flash'), true);
    assert.equal(receipt.stdout_preview.includes('reasoning=high'), true);
    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.equal(receipt.proof?.fallback_allowed, false);
    assert.equal(receipt.proof?.model, 'gemini-3.5-flash');
    assert.equal(receipt.proof?.reasoning_effort, 'high');
    assert.equal(receipt.executor_envelope.selected_executor_is_default_quality_path, false);
    assert.equal(receipt.executor_envelope.quality_equivalence_claim, false);
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});

test('non-default stage executor policy fails closed without an executor binding ref', () => {
  const fake = makeExecutable(
    'antigravity',
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:should-not-run"]}\\n\'\n',
  );
  try {
    assert.throws(
      () => runAgentExecutor({
        prompt: 'Build RCA HTML route without binding proof.',
        cwd: repoRoot,
        stage_attempt_executor_policy: {
          executor_kind: 'antigravity_cli',
          model: 'gemini-3.5-flash',
          reasoning_effort: 'high',
          provider: 'google',
        },
        env: { OPL_ANTIGRAVITY_CLI_BIN: fake.file, PATH: '' },
      }),
      (error) => error instanceof FrameworkContractError
        && error.code === 'contract_shape_invalid'
        && error.details?.executor_kind === 'antigravity_cli'
        && error.details?.policy_kind === 'stage_attempt_executor_policy'
        && error.details?.fallback_allowed === false,
    );
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});

test('explicit antigravity_cli execution produces a receipt without Codex equivalence claims', () => {
  const fake = makeExecutable(
    'antigravity',
    '#!/bin/sh\nprintf \'{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:antigravity-run"]}\\n\'\n',
  );
  try {
    const receipt = runAgentExecutor({
      executor_kind: 'antigravity_cli',
      prompt: 'Run through Antigravity CLI.',
      cwd: repoRoot,
      env: { OPL_ANTIGRAVITY_CLI_BIN: fake.file, PATH: '' },
    });

    assert.equal(receipt.executor_kind, 'antigravity_cli');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:antigravity-run']);
    assert.equal(receipt.proof?.fallback_allowed, false);
    assert.equal(receipt.non_equivalence_notice, 'connectivity_lifecycle_receipt_audit_only');
    assert.equal(receipt.executor_envelope.selected_executor_is_default_quality_path, false);
    assert.equal(receipt.executor_envelope.reasoning_equivalence_claim, false);
    assert.equal(receipt.executor_envelope.tool_semantics_equivalence_claim, false);
    assert.equal(receipt.executor_envelope.resume_equivalence_claim, false);
    assert.equal(receipt.executor_envelope.quality_equivalence_claim, false);
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});

test('executor doctor reports Antigravity CLI binary readiness from explicit env path', () => {
  const fake = makeExecutable('antigravity', '#!/usr/bin/env bash\nprintf "antigravity fake\\n"\n');
  try {
    const doctor = runAgentExecutorDoctor({
      executorKind: 'antigravity_cli',
      env: {
        OPL_ANTIGRAVITY_CLI_BIN: fake.file,
        PATH: '',
      },
    }).executor_doctor;

    assert.equal(doctor.executor_kind, 'antigravity_cli');
    assert.equal(doctor.ready, true);
    assert.equal(doctor.binary_path, fake.file);
    assert.equal(doctor.resolution_source, 'OPL_ANTIGRAVITY_CLI_BIN');
    assert.equal(doctor.fallback_allowed, false);
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
    const doctor = runAgentExecutorDoctor({
      executorKind: 'claude_code',
      env: {
        OPL_CLAUDE_CODE_BIN: fake.file,
        PATH: '',
      },
    }).executor_doctor;

    assert.equal(doctor.executor_kind, 'claude_code');
    assert.equal(doctor.ready, true);
    assert.equal(doctor.binary_path, fake.file);
    assert.equal(doctor.resolution_source, 'OPL_CLAUDE_CODE_BIN');
  } finally {
    fs.rmSync(fake.fixtureRoot, { recursive: true, force: true });
  }
});
