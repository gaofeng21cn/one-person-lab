import assert from 'node:assert/strict';
import test from 'node:test';

import {
  codexStageRunnerCostSummaryFrom,
  extractCodexSessionUsageRef,
} from '../../../src/modules/runway/family-runtime-codex-session-usage.ts';
import { buildStageAttemptUsageProjection } from '../../../src/modules/runway/family-runtime-stage-attempt-usage.ts';

test('Codex runner records turn.completed usage as observed telemetry', () => {
  const summary = codexStageRunnerCostSummaryFrom([
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-telemetry' }),
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 23_272, cached_input_tokens: 6_912, output_tokens: 9 },
    }),
  ].join('\n'), 'codex_cli');

  assert.equal(summary.usage_status, 'observed');
  assert.equal(summary.cost_status, 'observed');
  assert.equal(summary.telemetry_source, 'codex_exec_turn_completed');
  assert.equal(summary.missing_reason, null);
  assert.deepEqual(summary.token_usage, {
    input_tokens: 23_272,
    output_tokens: 9,
    total_tokens: 23_281,
  });
});

test('Codex runner preserves an explicitly observed zero instead of treating it as missing', () => {
  const summary = codexStageRunnerCostSummaryFrom(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  }), 'codex_cli');

  assert.equal(summary.usage_status, 'observed');
  assert.deepEqual(summary.token_usage, { input_tokens: 0, output_tokens: 0, total_tokens: 0 });
});

test('Codex runner represents unobserved usage as null with a reason', () => {
  const live = codexStageRunnerCostSummaryFrom('{"type":"turn.completed"}', 'codex_cli');
  assert.equal(live.usage_status, 'missing');
  assert.equal(live.token_usage, null);
  assert.equal(live.estimated_cost_usd, null);
  assert.equal(live.missing_reason, 'codex_cli_token_usage_not_observed');

  const dryRun = codexStageRunnerCostSummaryFrom('', 'dry_run');
  assert.equal(dryRun.usage_status, 'not_measured');
  assert.equal(dryRun.token_usage, null);
  assert.equal(dryRun.missing_reason, 'runner_mode_did_not_execute_codex_cli');
});

test('Codex session token_count events remain an observed usage source', () => {
  const usage = extractCodexSessionUsageRef({
    threadId: 'thread-session-telemetry',
    sessionPath: '/tmp/thread-session-telemetry.jsonl',
    output: [
      JSON.stringify({
        timestamp: '2026-07-13T00:00:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-13T00:00:01.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 200, output_tokens: 20, total_tokens: 220 },
          },
        },
      }),
    ].join('\n'),
  });

  assert.deepEqual(usage?.token_delta, { input_tokens: 300, output_tokens: 30, total_tokens: 330 });
  const summary = codexStageRunnerCostSummaryFrom('', 'codex_cli', usage);
  assert.equal(summary.usage_status, 'observed');
  assert.equal(summary.telemetry_source, 'codex_session_token_count');
  assert.equal(summary.token_usage?.total_tokens, 330);
});

test('Stage attempt usage projection carries the concrete telemetry missing reason', () => {
  const projection = buildStageAttemptUsageProjection({
    stageAttemptId: 'sat_missing_telemetry_reason',
    status: 'completed',
    retryBudget: {},
    attemptCount: 1,
    providerRun: {
      cost_summary: {
        usage_status: 'missing',
        token_usage: null,
        missing_reason: 'codex_cli_token_usage_not_observed',
      },
    },
    activityEvents: [],
    routeImpact: {},
  });

  assert.equal(projection.telemetry_status, 'missing');
  assert.equal(projection.token.observed_count, 0);
  assert.equal(projection.token.total_tokens_observed, null);
  assert.equal(projection.missing_usage_telemetry_reason, 'codex_cli_token_usage_not_observed');
});
