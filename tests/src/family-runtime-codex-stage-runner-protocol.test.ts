import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeCodexFixture } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';

test('Codex stage runner fails closed when live process stops producing output', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-no-output"}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = '100';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_runner_no_output_budget_test',
        stage_id: 'analysis-campaign',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:no-output-seed'],
      },
      stagePacketRef: 'packet:analysis',
      runnerMode: 'codex_cli',
      observedAt: '2026-05-11T00:00:00.000Z',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.runner_status.live_process_started, true);
    assert.equal(receipt.runner_status.exit_code, 124);
    assert.equal(receipt.runner_status.no_output_timeout_ms, 100);
    assert.equal(receipt.runner_status.timeout_ms, 10_000);
    assert.equal(receipt.heartbeat_summary.checkpoint_refs[0], 'checkpoint:no-output-seed');
    const processOutputSummary = receipt.process_output_summary;
    if (!processOutputSummary) {
      throw new Error('codex_cli no-output timeout receipt must include process_output_summary.');
    }
    assert.equal(processOutputSummary.exit_code, 124);
    assert.equal(processOutputSummary.timeout_reason, 'no_output_timeout');
    assert.equal(processOutputSummary.no_output_timeout_ms, 100);
    assert.ok(processOutputSummary.stderr_tail.includes('Codex command produced no output before the progress watchdog expired.'));
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousNoOutputTimeout === undefined) {
      delete process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
    } else {
      process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = previousNoOutputTimeout;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner fails closed when an active command execution stops making progress', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"session_meta","payload":{"id":"thread-command-no-progress"}}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'item.updated',
    item: {
      type: 'command_execution',
      id: 'call_runaway_grep',
      command: 'grep -R "sat_77" -n artifacts studies runtime 2>/dev/null | head -50',
      status: 'in_progress',
      aggregated_output: '',
    },
  })}'
  sleep 0.25
  printf '%s\\n' '${JSON.stringify({
    type: 'item.updated',
    item: {
      type: 'command_execution',
      id: 'call_runaway_grep',
      command: 'grep -R "sat_77" -n artifacts studies runtime 2>/dev/null | head -50',
      status: 'in_progress',
      aggregated_output: '',
    },
  })}'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCommandTimeout = process.env.OPL_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS = '100';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_live_runner_command_no_progress_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:command-no-progress'],
      },
      stagePacketRef: 'packet:command-no-progress',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_live_runner_command_no_progress_test/runtime-blockers/codex_cli_command_execution_no_progress',
    ]);
    assert.equal(receipt.closeout_packet?.authority_boundary?.provider_completion_is_domain_ready, false);
    assert.equal(receipt.runner_status.exit_code, 124);
    assert.equal(receipt.process_output_summary?.timeout_reason, 'command_no_progress_timeout');
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_command_execution_no_progress');
    assert.equal(receipt.process_output_summary?.command_no_progress_timeout_ms, 100);
    assert.equal(receipt.process_output_summary?.active_command?.tool_call_id, 'call_runaway_grep');
    assert.equal(receipt.process_output_summary?.active_command?.status, 'in_progress');
    assert.equal(
      receipt.progress_summary.runner_events.some((event) =>
        event.event_kind === 'command_execution'
          && event.value?.includes('grep -R "sat_77"')
      ),
      true,
    );
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousCommandTimeout === undefined) {
      delete process.env.OPL_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS;
    } else {
      process.env.OPL_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS = previousCommandTimeout;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner fails fast on unsupported native function calls', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"session_meta","payload":{"id":"thread-unsupported-function-call"}}\\n'
  printf '{"type":"event_msg","payload":{"type":"agent_message","message":"progress checkpoint","phase":"commentary"}}\\n'
  printf '%s\\n' '${JSON.stringify({
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"rtk sed -n 1,20p README.md"}',
      call_id: 'call_unsupported_tool_protocol',
    },
  })}'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    const startedAt = Date.now();
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_unsupported_function_call_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:unsupported-function-call'],
      },
      stagePacketRef: 'packet:unsupported-function-call',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 10_000,
    });

    assert.equal(Date.now() - startedAt < 1_900, true);
    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_unsupported_function_call_test/runtime-blockers/codex_cli_unsupported_function_call',
    ]);
    assert.equal(receipt.closeout_packet?.authority_boundary?.provider_completion_is_domain_ready, false);
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_unsupported_function_call');
    assert.equal(receipt.process_output_summary?.timeout_reason, 'unsupported_tool_protocol');
    assert.equal(receipt.process_output_summary?.pending_function_call_count, 1);
    assert.deepEqual(receipt.process_output_summary?.function_call_names, ['exec_command']);
    assert.equal(
      receipt.progress_summary.runner_events.some((event) =>
        event.event_kind === 'unsupported_function_call'
          && event.value === 'exec_command'
      ),
      true,
    );
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner diagnoses unsupported function calls from recovered session on no-output timeout', async () => {
  const threadId = 'thread-session-unsupported-function-call';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  sleep 4
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousNoOutputTimeout = process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '26');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-26T22-30-22-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: '{"cmd":"rtk cat README.md"}',
        call_id: 'call_from_session_only',
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_session_unsupported_function_call_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:session-unsupported-function-call'],
      },
      stagePacketRef: 'packet:session-unsupported-function-call',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 1_500,
    });

    assert.equal(receipt.process_output_summary?.timeout_reason, 'unsupported_tool_protocol');
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_unsupported_function_call');
    assert.equal(receipt.process_output_summary?.pending_function_call_count, 1);
    assert.deepEqual(receipt.process_output_summary?.function_call_names, ['exec_command']);
    assert.equal(
      receipt.process_output_summary?.unsupported_function_call_session_path,
      sessionPath,
    );
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    previousNoOutputTimeout === undefined
      ? delete process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS
      : process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS = previousNoOutputTimeout;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner ignores resolved function calls from recovered session output', async () => {
  const threadId = 'thread-resolved-function-call';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  sleep 2
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '26');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, `rollout-2026-05-26T22-30-22-${threadId}.jsonl`), [
    JSON.stringify({
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: '{"cmd":"rtk pwd"}',
        call_id: 'call_resolved_tool_protocol',
      },
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call_resolved_tool_protocol',
        output: 'ok',
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '1';
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_resolved_function_call_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:resolved-function-call'],
      },
      stagePacketRef: 'packet:resolved-function-call',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      noOutputTimeoutMs: 100,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'opl://stage-attempts/sat_resolved_function_call_test/runtime-blockers/codex_cli_typed_closeout_not_materialized',
    ]);
    assert.equal(receipt.closeout_packet?.authority_boundary?.provider_completion_is_domain_ready, false);
    assert.equal(receipt.process_output_summary?.timeout_reason, 'no_output_timeout');
    assert.equal(receipt.process_output_summary?.blocked_reason, 'codex_cli_typed_closeout_not_materialized');
    assert.equal(receipt.process_output_summary?.pending_function_call_count, undefined);
    assert.equal(receipt.process_output_summary?.function_call_names, undefined);
  } finally {
    previousCodexBin === undefined
      ? delete process.env.OPL_CODEX_BIN
      : process.env.OPL_CODEX_BIN = previousCodexBin;
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    previousRecoveryTimeout === undefined
      ? delete process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS
      : process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
