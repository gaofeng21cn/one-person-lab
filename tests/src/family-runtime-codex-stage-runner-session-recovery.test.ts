import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeCodexFixture } from './cli/helpers.ts';
import { runPublicCodexStageRunner } from './family-runtime-codex-stage-runner-helpers.ts';
import { codexStageRunnerCostSummaryFrom } from '../../src/modules/runway/family-runtime-codex-session-usage.ts';
import {
  normalizeTypedStageCloseoutPacket,
  validateCloseoutPacketForAttempt,
} from '../../src/modules/runway/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';

test('typed closeout normalization preserves paper stage token telemetry', () => {
  const packet = normalizeTypedStageCloseoutPacket({
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: ['receipt:paper-stage-log-token-telemetry'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    token_usage: {
      status: 'observed',
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
    },
    usage_refs: ['codex_session_usage:paper#sha256:usage'],
    paper_stage_log: {
      stage_goal: 'materialize submission package',
      token_usage: {
        status: 'observed',
        input_tokens: 12,
        output_tokens: 8,
        total_tokens: 20,
      },
      token_usage_refs: ['codex_session_usage:paper#sha256:usage'],
    },
  });
  const validation = validateCloseoutPacketForAttempt({
    closeoutPacket: packet,
    attempt: {
      stage_attempt_id: 'sat_paper_stage_log_token_telemetry_test',
      domain_id: 'med-autoscience',
      workspace_locator: {
        task_kind: 'paper_mission/stage-route',
      },
    },
  });

  assert.equal(validation.rejection, null);
  assert.equal(
    (validation.closeoutPacket?.token_usage as { total_tokens?: number } | undefined)?.total_tokens,
    20,
  );
  assert.deepEqual(validation.closeoutPacket?.usage_refs, ['codex_session_usage:paper#sha256:usage']);
  assert.equal(
    (validation.closeoutPacket?.paper_stage_log?.token_usage as { total_tokens?: number } | undefined)?.total_tokens,
    20,
  );
});

test('Codex stage runner recovers terminal typed closeout from matching Codex session JSONL', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-session-recovered-closeout'],
    consumed_refs: ['paper/draft.md', 'paper/build/review_manuscript.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const threadId = 'thread-session-recovered-closeout';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-22T08:11:49.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '22');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-22T16-11-49-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-05-22T08:11:49.000Z',
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      timestamp: '2026-05-22T08:11:49.381Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(closeout) }],
        phase: 'final_answer',
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-22T08:11:49.391Z',
      type: 'event_msg',
      payload: {
        type: 'task_complete',
        last_agent_message: JSON.stringify(closeout),
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_session_recovered_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:session-recovered-closeout'],
      },
      stagePacketRef: 'packet:session-recovered-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-session-recovered-closeout']);
    assert.deepEqual(receipt.closeout_packet?.consumed_refs, closeout.consumed_refs);
    assert.equal(receipt.process_output_summary?.final_message_chars, 0);
    assert.equal(receipt.process_output_summary?.recovered_session_path, sessionPath);
    assert.equal((receipt.process_output_summary?.recovered_final_message_chars ?? 0) > 0, true);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner recovers task-complete closeout with typed object closeout refs', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_session_object_ref_closeout_test',
    closeout_refs: [
      {
        kind: 'typed_blocker_ref',
        ref: 'studies/002/artifacts/supervision/consumer/default_executor_execution/latest.json#executions[0].typed_blocker',
      },
      {
        kind: 'domain_execution_history_ref',
        ref: 'studies/002/artifacts/supervision/consumer/default_executor_execution/history.jsonl#last',
      },
      {
        ref_kind: 'stage_attempt_closeout_packet_ref',
        uri: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
        sha256: 'sha256:003-closeout',
        size_bytes: 2048,
      },
    ],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const threadId = 'thread-session-object-ref-closeout';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-06-09T10:10:20.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '06', '09');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-06-09T18-10-20-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-06-09T10:10:20.000Z',
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      timestamp: '2026-06-09T10:16:39.497Z',
      type: 'event_msg',
      payload: {
        type: 'task_complete',
        last_agent_message: JSON.stringify(closeout),
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_session_object_ref_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:session-object-ref-closeout'],
      },
      stagePacketRef: 'packet:session-object-ref-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, [
      'studies/002/artifacts/supervision/consumer/default_executor_execution/latest.json#executions[0].typed_blocker',
      'studies/002/artifacts/supervision/consumer/default_executor_execution/history.jsonl#last',
      'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
    ]);
    assert.deepEqual(receipt.closeout_packet?.closeout_ref_metadata, [
      {
        kind: 'typed_blocker_ref',
        ref: 'studies/002/artifacts/supervision/consumer/default_executor_execution/latest.json#executions[0].typed_blocker',
      },
      {
        kind: 'domain_execution_history_ref',
        ref: 'studies/002/artifacts/supervision/consumer/default_executor_execution/history.jsonl#last',
      },
      {
        ref_kind: 'stage_attempt_closeout_packet_ref',
        uri: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
        ref: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
        sha256: 'sha256:003-closeout',
        size_bytes: 2048,
      },
    ]);
    assert.equal(receipt.process_output_summary?.recovered_session_path, sessionPath);
    assert.equal(receipt.process_output_summary?.session_recovery_status, 'closeout_found');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner ingests session usage as refs-only cumulative total deltas', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-session-usage-closeout'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const threadId = 'thread-session-usage-delta';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-29T01:00:00.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  printf '{"type":"event_msg","payload":{"last_token_usage":{"input_tokens":999,"output_tokens":999,"total_tokens":1998}}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '29');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-29T01-00-00-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-05-29T01:00:00.000Z',
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:00:05.000Z',
      type: 'event_msg',
      payload: {
        absolute_cumulative_token_usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:06:00.000Z',
      type: 'event_msg',
      payload: {
        absolute_cumulative_token_usage: {
          input_tokens: 260,
          output_tokens: 140,
          total_tokens: 400,
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:06:00.500Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(closeout) }],
        phase: 'final_answer',
      },
    }),
    JSON.stringify({
      timestamp: '2026-05-29T01:06:01.000Z',
      type: 'event_msg',
      payload: {
        last_token_usage: {
          input_tokens: 999,
          output_tokens: 999,
          total_tokens: 1998,
        },
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_session_usage_delta_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:session-usage-delta'],
      },
      stagePacketRef: 'packet:session-usage-delta',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.closeout_packet?.surface_kind, 'stage_attempt_closeout_packet');
    assert.equal(receipt.cost_summary.token_usage.total_tokens, 250);
    assert.equal(receipt.cost_summary.token_usage.input_tokens, 160);
    assert.equal(receipt.cost_summary.token_usage.output_tokens, 90);
    assert.equal(receipt.cost_summary.session_usage_refs?.session_ref, `codex_session:${threadId}`);
    assert.equal(receipt.cost_summary.session_usage_refs?.source_path, sessionPath);
    assert.match(receipt.cost_summary.session_usage_refs?.source_hash ?? '', /^sha256:/);
    assert.deepEqual(receipt.cost_summary.session_usage_refs?.time_window, {
      started_at: '2026-05-29T01:00:05.000Z',
      completed_at: '2026-05-29T01:06:00.000Z',
    });
    assert.equal(receipt.cost_summary.session_usage_refs?.billing_boundary, 'refs_only_absolute_cumulative_total_delta');
    assert.equal(
      receipt.cost_summary.session_usage_refs?.ignored_usage_fields.includes('last_token_usage'),
      true,
    );
    assert.deepEqual(receipt.closeout_packet?.token_usage, {
      status: 'observed',
      input_tokens: 160,
      output_tokens: 90,
      total_tokens: 250,
      source: 'codex_session_usage_delta',
      billing_boundary: 'refs_only_absolute_cumulative_total_delta',
    });
    assert.deepEqual(receipt.closeout_packet?.usage_refs, [
      receipt.cost_summary.usage_ref,
      `codex_session:${threadId}`,
    ]);
    assert.equal(receipt.closeout_packet?.user_stage_log, undefined);
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner ingests current token_count session usage', async () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:codex-current-token-count-closeout'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
  const threadId = 'thread-current-token-count';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-07-08T14:02:14.725Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '07', '08');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-07-08T22-02-14-${threadId}.jsonl`);
  fs.writeFileSync(sessionPath, [
    JSON.stringify({
      timestamp: '2026-07-08T14:02:14.725Z',
      type: 'session_meta',
      payload: { id: threadId },
    }),
    JSON.stringify({
      timestamp: '2026-07-08T14:02:27.285Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(closeout) }],
        phase: 'final_answer',
      },
    }),
    JSON.stringify({
      timestamp: '2026-07-08T14:02:27.287Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 27_184,
            cached_input_tokens: 4_992,
            output_tokens: 38,
            reasoning_output_tokens: 31,
            total_tokens: 27_222,
          },
          last_token_usage: {
            input_tokens: 27_184,
            cached_input_tokens: 4_992,
            output_tokens: 38,
            reasoning_output_tokens: 31,
            total_tokens: 27_222,
          },
          model_context_window: 258_400,
        },
      },
    }),
    '',
  ].join('\n'));

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_current_token_count_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:current-token-count'],
      },
      stagePacketRef: 'packet:current-token-count',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });

    assert.equal(receipt.cost_summary.token_usage.total_tokens, 27_222);
    assert.equal(receipt.cost_summary.token_usage.input_tokens, 27_184);
    assert.equal(receipt.cost_summary.token_usage.output_tokens, 38);
    assert.equal(receipt.cost_summary.session_usage_refs?.session_ref, `codex_session:${threadId}`);
    assert.equal(receipt.cost_summary.session_usage_refs?.source_path, sessionPath);
    assert.equal(
      receipt.cost_summary.session_usage_refs?.billing_boundary,
      'refs_only_codex_session_last_token_usage_sum',
    );
    assert.deepEqual(receipt.closeout_packet?.token_usage, {
      status: 'observed',
      input_tokens: 27_184,
      output_tokens: 38,
      total_tokens: 27_222,
      source: 'codex_session_usage_delta',
      billing_boundary: 'refs_only_codex_session_last_token_usage_sum',
    });
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Codex stage runner cost summary reads current turn.completed usage from stdout', () => {
  const costSummary = codexStageRunnerCostSummaryFrom(JSON.stringify({
    type: 'turn.completed',
    usage: {
      input_tokens: 27_184,
      cached_input_tokens: 4_992,
      output_tokens: 38,
      reasoning_output_tokens: 31,
    },
  }), 'codex_cli');

  assert.equal(costSummary.token_usage.total_tokens, 27_222);
  assert.equal(costSummary.token_usage.input_tokens, 27_184);
  assert.equal(costSummary.token_usage.output_tokens, 38);
});

test('Codex stage runner waits briefly for delayed session JSONL closeout flush', async () => {
  const closeout = {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: ['receipt:codex-delayed-session-closeout'],
    consumed_refs: ['paper/draft.md', 'paper/build/review_manuscript.md'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'typed_blocker',
  };
  const threadId = 'thread-delayed-session-closeout';
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"timestamp":"2026-05-22T08:21:49.000Z","type":"session_meta","payload":{"id":"${threadId}"}}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousCodexHome = process.env.CODEX_HOME;
  const previousRecoveryTimeout = process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS;
  const previousRecoveryInterval = process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS;
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '22');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `rollout-2026-05-22T16-21-49-${threadId}.jsonl`);

  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.CODEX_HOME = codexHome;
    process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = '3000';
    process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = '25';
    const writeTimer = setTimeout(() => {
      fs.writeFileSync(sessionPath, [
        JSON.stringify({
          timestamp: '2026-05-22T08:21:49.000Z',
          type: 'session_meta',
          payload: { id: threadId },
        }),
        JSON.stringify({
          timestamp: '2026-05-22T08:21:49.391Z',
          type: 'event_msg',
          payload: {
            type: 'task_complete',
            last_agent_message: JSON.stringify(closeout),
          },
        }),
        '',
      ].join('\n'));
    }, 750);
    const receipt = await runPublicCodexStageRunner({
      attempt: {
        stage_attempt_id: 'sat_delayed_session_closeout_test',
        stage_id: 'domain_owner/default-executor-dispatch',
        workspace_locator: {
          workspace_root: fixtureRoot,
        },
        checkpoint_refs: ['checkpoint:delayed-session-closeout'],
      },
      stagePacketRef: 'packet:delayed-session-closeout',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
    });
    clearTimeout(writeTimer);

    assert.equal(receipt.closeout_packet?.surface_kind, 'domain_stage_closeout_packet');
    assert.deepEqual(receipt.closeout_packet?.closeout_refs, ['receipt:codex-delayed-session-closeout']);
    assert.equal(receipt.process_output_summary?.recovered_session_path, sessionPath);
    assert.equal(receipt.process_output_summary?.session_recovery_status, 'closeout_found');
  } finally {
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    previousCodexHome === undefined
      ? delete process.env.CODEX_HOME
      : process.env.CODEX_HOME = previousCodexHome;
    previousRecoveryTimeout === undefined
      ? delete process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS
      : process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    previousRecoveryInterval === undefined
      ? delete process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS
      : process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS = previousRecoveryInterval;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
