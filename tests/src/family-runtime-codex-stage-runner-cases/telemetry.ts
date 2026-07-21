import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  codexStageRunnerCostSummaryFrom,
  extractCodexSessionUsageRef,
} from '../../../src/modules/runway/family-runtime-codex-session-usage.ts';
import {
  executorUsageObservationFromCostSummary,
  persistStageAttemptUsageObservation,
} from '../../../src/modules/runway/family-runtime-stage-attempt-usage-observation.ts';
import {
  buildStageAttemptUsageProjection,
  summarizeStageAttemptUsageProjections,
} from '../../../src/modules/runway/family-runtime-stage-attempt-usage.ts';
import { createStageAttemptTable } from '../../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import { createStageAttempt } from '../../../src/modules/runway/family-runtime-stage-attempts-parts/create.ts';
import { inspectStageAttempt } from '../../../src/modules/runway/family-runtime-stage-attempts-parts/inspect.ts';
import { recordStageAttemptActivityHeartbeat } from '../../../src/modules/runway/family-runtime-stage-attempts-parts/signals-heartbeat.ts';
import { createFakeCodexFixture } from '../cli/helpers.ts';
import { runPublicCodexStageRunner } from '../family-runtime-codex-stage-runner-helpers.ts';

const OBSERVED_AT = '2026-07-13T00:00:02.000Z';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('Codex runner parses the authoritative turn.completed usage fields', () => {
  const summary = codexStageRunnerCostSummaryFrom([
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-telemetry' }),
    JSON.stringify({
      type: 'turn.completed',
      usage: {
        input_tokens: 23_272,
        cached_input_tokens: 6_912,
        output_tokens: 19,
        reasoning_output_tokens: 10,
        total_tokens: 23_291,
      },
    }),
  ].join('\n'), 'codex_cli', null, OBSERVED_AT);

  assert.equal(summary.telemetry_status, 'observed');
  assert.equal(summary.telemetry_source, 'codex_exec_turn_completed');
  assert.equal(summary.observed_at, OBSERVED_AT);
  assert.match(summary.source_ref ?? '', /^codex:\/\/threads\/thread-telemetry\/events\/turn\.completed/);
  assert.deepEqual(summary.token_usage, {
    input_tokens: 23_272,
    cached_input_tokens: 6_912,
    output_tokens: 19,
    reasoning_output_tokens: 10,
    total_tokens: 23_291,
  });
  assert.equal(
    summary.usage_observation.accounting_semantics.input_tokens_include_cached_input_tokens,
    true,
  );
});

test('explicit observed zero remains distinct from missing usage', () => {
  const observed = codexStageRunnerCostSummaryFrom(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  }), 'codex_cli', null, OBSERVED_AT);
  const missing = codexStageRunnerCostSummaryFrom('{"type":"turn.completed"}', 'codex_cli', null, OBSERVED_AT);

  assert.equal(observed.telemetry_status, 'observed');
  assert.equal(observed.token_usage?.total_tokens, 0);
  assert.equal(missing.telemetry_status, 'missing');
  assert.equal(missing.token_usage, null);
  assert.equal(missing.missing_reason, 'turn_completed_usage_missing');
});

test('turn.completed is authoritative when session JSONL also contains usage', () => {
  const sessionUsage = extractCodexSessionUsageRef({
    threadId: 'thread-one-source',
    sessionPath: '/tmp/thread-one-source.jsonl',
    output: JSON.stringify({
      timestamp: '2026-07-13T00:00:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 300, output_tokens: 30, total_tokens: 330 } },
      },
    }),
  });
  const summary = codexStageRunnerCostSummaryFrom([
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-one-source' }),
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    }),
  ].join('\n'), 'codex_cli', sessionUsage, OBSERVED_AT);

  assert.equal(summary.telemetry_source, 'codex_exec_turn_completed');
  assert.equal(summary.token_usage?.total_tokens, 110);
});

test('session token_count is used only as fallback and preserves diagnostic token subsets', () => {
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
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 10,
              reasoning_output_tokens: 5,
              total_tokens: 110,
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-13T00:00:01.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: 200,
              cached_input_tokens: 80,
              output_tokens: 20,
              reasoning_output_tokens: 10,
              total_tokens: 220,
            },
          },
        },
      }),
    ].join('\n'),
  });

  assert.deepEqual(usage?.token_delta, {
    input_tokens: 300,
    cached_input_tokens: 120,
    output_tokens: 30,
    reasoning_output_tokens: 15,
    total_tokens: 330,
  });
  const summary = codexStageRunnerCostSummaryFrom('', 'codex_cli', usage, OBSERVED_AT);
  assert.equal(summary.telemetry_source, 'codex_session_token_count');
  assert.equal(summary.token_usage?.total_tokens, 330);
});

test('session absolute cumulative snapshots use the latest value exactly once', () => {
  const usage = extractCodexSessionUsageRef({
    threadId: 'thread-absolute-cumulative',
    sessionPath: '/tmp/thread-absolute-cumulative.jsonl',
    output: [
      JSON.stringify({
        timestamp: '2026-07-13T00:00:01.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 10,
              reasoning_output_tokens: 2,
              total_tokens: 110,
            },
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 10,
              reasoning_output_tokens: 2,
              total_tokens: 110,
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-13T00:00:02.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 250,
              cached_input_tokens: 120,
              output_tokens: 25,
              reasoning_output_tokens: 5,
              total_tokens: 275,
            },
            last_token_usage: {
              input_tokens: 150,
              cached_input_tokens: 80,
              output_tokens: 15,
              reasoning_output_tokens: 3,
              total_tokens: 165,
            },
          },
        },
      }),
    ].join('\n'),
  });

  assert.equal(usage?.billing_boundary, 'refs_only_absolute_cumulative_total_latest');
  assert.deepEqual(usage?.token_delta, {
    input_tokens: 250,
    cached_input_tokens: 120,
    output_tokens: 25,
    reasoning_output_tokens: 5,
    total_tokens: 275,
  });
});

test('legacy or stale worker unreported zero fails closed as stale', () => {
  const observation = executorUsageObservationFromCostSummary({
    costSummary: {
      cost_status: 'observed_or_unreported',
      token_usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    },
    observedAt: OBSERVED_AT,
    executionSessionRef: 'codex://threads/stale-worker',
    sourceFallbackRef: 'stage_attempt:sat_stale#cost_summary',
  });

  assert.equal(observation.telemetry_status, 'stale');
  assert.equal(observation.token_usage, null);
  assert.equal(observation.missing_reason, 'legacy_or_stale_worker_usage_unreported');
});

test('explicit stale worker source cannot persist an observed usage payload', () => {
  const costSummary = codexStageRunnerCostSummaryFrom(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2, total_tokens: 12 },
  }), 'codex_cli', null, OBSERVED_AT);
  const observation = executorUsageObservationFromCostSummary({
    costSummary: { ...costSummary, worker_source_current: false },
    observedAt: OBSERVED_AT,
    executionSessionRef: 'codex://threads/stale-explicit',
    sourceFallbackRef: 'stage_attempt:sat_stale_explicit#cost_summary',
  });

  assert.equal(observation.telemetry_status, 'stale');
  assert.equal(observation.token_usage, null);
  assert.equal(observation.missing_reason, 'worker_source_stale_usage_untrusted');
});

test('stage and task usage summaries preserve observed, partial, missing, and stale truth', () => {
  const observedSummary = codexStageRunnerCostSummaryFrom(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 80, cached_input_tokens: 20, output_tokens: 20, total_tokens: 100 },
  }), 'codex_cli', null, OBSERVED_AT);
  const observed = buildStageAttemptUsageProjection({
    stageAttemptId: 'sat_observed',
    status: 'completed',
    retryBudget: {},
    attemptCount: 1,
    providerRun: { cost_summary: observedSummary },
    activityEvents: [{ cost_summary: observedSummary }],
    routeImpact: {},
    usageObservation: observedSummary.usage_observation,
  });
  const secondObservedSummary = codexStageRunnerCostSummaryFrom(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 40, cached_input_tokens: 10, output_tokens: 10, total_tokens: 50 },
  }), 'codex_cli', null, '2026-07-13T00:00:03.000Z');
  const secondObserved = buildStageAttemptUsageProjection({
    stageAttemptId: 'sat_observed_second',
    status: 'completed',
    retryBudget: {},
    attemptCount: 1,
    providerRun: { cost_summary: secondObservedSummary },
    activityEvents: [],
    routeImpact: {},
    usageObservation: secondObservedSummary.usage_observation,
  });
  const missing = buildStageAttemptUsageProjection({
    stageAttemptId: 'sat_missing',
    status: 'completed',
    retryBudget: {},
    attemptCount: 1,
    providerRun: {},
    activityEvents: [],
    routeImpact: {},
    usageObservation: executorUsageObservationFromCostSummary({
      costSummary: null,
      observedAt: OBSERVED_AT,
      executionSessionRef: null,
      sourceFallbackRef: 'stage_attempt:sat_missing#cost_summary',
    }),
  });
  const currentStage = summarizeStageAttemptUsageProjections(
    [observed, secondObserved, missing],
    'current_stage',
  );
  const workItem = summarizeStageAttemptUsageProjections(
    [observed, secondObserved, observed, missing],
    'work_item',
  );

  assert.equal(observed.telemetry_status, 'observed');
  assert.equal(observed.token.observed_count, 1, 'provider/event copies must not double count');
  assert.equal(observed.token.total_tokens_observed, 100);
  assert.equal(observed.token.cached_input_tokens_observed, 20);
  assert.equal(observed.token.reasoning_output_tokens_observed, null);
  assert.equal(missing.telemetry_status, 'missing');
  assert.equal(missing.token.total_tokens_observed, null);
  assert.equal(currentStage.telemetry_status, 'partial');
  assert.equal(currentStage.token.total_tokens_observed, 150);
  assert.equal(currentStage.token.cached_input_tokens_observed, 30);
  assert.equal(currentStage.token.reasoning_output_tokens_observed, null);
  assert.equal(workItem.token.observed_count, 2, 'replayed authoritative sources must be counted once');
  assert.equal(workItem.token.total_tokens_observed, 150);
});

test('turn.completed persists session identity and non-zero usage to the same attempt idempotently', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-token-telemetry-workspace-'));
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '{"type":"thread.started","thread_id":"thread-persisted-telemetry"}\\n'
printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","id":"msg","text":"telemetry complete"}}'
printf '%s\\n' '{"type":"turn.completed","usage":{"input_tokens":120,"cached_input_tokens":40,"output_tokens":30,"reasoning_output_tokens":10,"total_tokens":150}}'
`);
  const db = new DatabaseSync(':memory:');
  createStageAttemptTable(db);
  const attempt = createStageAttempt(db, {
    domainId: 'redcube_ai',
    stageId: 'telemetry_canary',
    providerKind: 'temporal',
    workspaceLocator: { workspace_root: workspaceRoot },
    executorKind: 'codex_cli',
    checkpointRefs: ['packet:telemetry'],
  }).attempt;
  const previousBin = process.env.OPL_CODEX_BIN;
  const previousMode = process.env.OPL_CODEX_STAGE_RUNNER_MODE;
  try {
    process.env.OPL_CODEX_BIN = codexPath;
    process.env.OPL_CODEX_STAGE_RUNNER_MODE = 'codex_cli';
    const receipt = await runPublicCodexStageRunner({
      attempt,
      stagePacketRef: 'packet:telemetry',
      runnerMode: 'codex_cli',
      timeoutMs: 10_000,
      onRunnerProgress(event) {
        if (event.event_kind === 'thread.started' && event.value) {
          recordStageAttemptActivityHeartbeat(db, {
            stageAttemptId: attempt.stage_attempt_id,
            heartbeatKind: 'codex_stage_activity_runner_progress',
            runnerEventKind: event.event_kind,
            executionSessionRef: `codex://threads/${event.value}`,
            observedAt: OBSERVED_AT,
          });
        }
      },
    });
    assert.equal(
      inspectStageAttempt(db, attempt.stage_attempt_id).execution_session_ref,
      'codex://threads/thread-persisted-telemetry',
      'thread.started must bind before terminal persistence',
    );
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).status, 'running');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'running');
    const first = persistStageAttemptUsageObservation(db, {
      stageAttemptId: attempt.stage_attempt_id,
      costSummary: receipt.cost_summary,
      observedAt: OBSERVED_AT,
      executionSessionRef: receipt.progress_summary.execution_session_ref,
    });
    const replay = persistStageAttemptUsageObservation(db, {
      stageAttemptId: attempt.stage_attempt_id,
      costSummary: receipt.cost_summary,
      observedAt: OBSERVED_AT,
      executionSessionRef: receipt.progress_summary.execution_session_ref,
    });
    const readback = inspectStageAttempt(db, attempt.stage_attempt_id);

    assert.equal(first.authoritative_source_count, 1);
    assert.equal(replay.idempotent_noop, true);
    assert.ok(readback.usage_observation);
    assert.equal(readback.usage_observation.telemetry_status, 'observed');
    assert.equal(readback.usage_projection.token.observed_count, 1);
    assert.equal(readback.usage_projection.token.total_tokens_observed, 150);
    assert.equal(readback.usage_projection.token.cached_input_tokens_observed, 40);
  } finally {
    restoreEnv('OPL_CODEX_BIN', previousBin);
    restoreEnv('OPL_CODEX_STAGE_RUNNER_MODE', previousMode);
    db.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('activity heartbeat promotes queued liveness without reopening a terminal attempt', () => {
  const db = new DatabaseSync(':memory:');
  createStageAttemptTable(db);
  try {
    const attempt = createStageAttempt(db, {
      domainId: 'redcube_ai',
      stageId: 'heartbeat_liveness',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/redcube-ai' },
      executorKind: 'codex_cli',
      checkpointRefs: ['packet:heartbeat'],
    }).attempt;

    const running = recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: attempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_runner_progress',
      runnerEventKind: 'thread.started',
      executionSessionRef: 'codex://threads/thread-heartbeat',
      observedAt: OBSERVED_AT,
    });
    assert.equal(running?.status, 'running');
    assert.equal(running?.provider_run.provider_status, 'running');
    assert.equal(running?.provider_run.started_at, OBSERVED_AT);

    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed', provider_run_json = json_set(provider_run_json, '$.provider_status', 'completed')
      WHERE stage_attempt_id = ?
    `).run(attempt.stage_attempt_id);
    const terminal = recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: attempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_runner_progress',
      observedAt: '2026-07-13T00:00:03.000Z',
    });
    assert.equal(terminal?.status, 'completed');
    assert.equal(terminal?.provider_run.provider_status, 'completed');
    assert.equal(terminal?.provider_run.last_heartbeat_at, OBSERVED_AT);
  } finally {
    db.close();
  }
});
