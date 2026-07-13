import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommandStreaming,
} from '../src/modules/runway/codex.ts';
import { codexStageRunnerCostSummaryFrom } from '../src/modules/runway/family-runtime-codex-session-usage.ts';
import { openQueueDb } from '../src/modules/runway/family-runtime-store.ts';
import {
  createStageAttempt,
  inspectStageAttempt,
  persistStageAttemptUsageObservation,
  recordStageAttemptActivityHeartbeat,
} from '../src/modules/runway/family-runtime-stage-attempts.ts';

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-token-telemetry-canary-state-'));
const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-token-telemetry-canary-workspace-'));
const previousStateDir = process.env.OPL_STATE_DIR;
process.env.OPL_STATE_DIR = stateRoot;
const { db } = openQueueDb();

try {
  const attempt = createStageAttempt(db, {
    domainId: 'example-domain',
    stageId: 'token-telemetry-live-canary',
    providerKind: 'temporal',
    workspaceLocator: { workspace_root: workspaceRoot },
    executorKind: 'codex_cli',
    checkpointRefs: ['canary:token-telemetry'],
  }).attempt;
  let executionSessionRef: string | null = null;
  const args = buildCodexExecArgs(
    'Reply with exactly OPL_TOKEN_TELEMETRY_CANARY_OK. Do not use tools.',
    { cwd: workspaceRoot, json: true },
  );
  const result = await runCodexCommandStreaming(args, {
    cwd: workspaceRoot,
    timeoutMs: 180_000,
    noOutputTimeoutMs: 90_000,
    commandNoProgressTimeoutMs: 90_000,
    onStdoutEvent(event) {
      if (event.type !== 'thread.started') return;
      executionSessionRef = `codex://threads/${event.threadId}`;
      recordStageAttemptActivityHeartbeat(db, {
        stageAttemptId: attempt.stage_attempt_id,
        heartbeatKind: 'token_telemetry_live_canary_progress',
        runnerEventKind: event.type,
        executionSessionRef,
      });
    },
  });
  assert.equal(result.exitCode, 0, `codex exec failed: ${result.stderr}`);
  const parsed = parseCodexExecOutput(result.stdout);
  executionSessionRef ??= parsed.threadId ? `codex://threads/${parsed.threadId}` : null;
  assert.ok(executionSessionRef, 'codex exec did not emit thread.started');
  const costSummary = codexStageRunnerCostSummaryFrom(result.stdout, 'codex_cli');
  const first = persistStageAttemptUsageObservation(db, {
    stageAttemptId: attempt.stage_attempt_id,
    costSummary,
    executionSessionRef,
    observedAt: new Date().toISOString(),
  });
  const replay = persistStageAttemptUsageObservation(db, {
    stageAttemptId: attempt.stage_attempt_id,
    costSummary,
    executionSessionRef,
    observedAt: new Date().toISOString(),
  });
  const readback = inspectStageAttempt(db, attempt.stage_attempt_id);
  assert.equal(readback.stage_attempt_id, attempt.stage_attempt_id);
  assert.equal(readback.execution_session_ref, executionSessionRef);
  assert.equal(readback.usage_observation?.telemetry_status, 'observed');
  assert.equal(readback.usage_projection.telemetry_status, 'observed');
  assert.ok(readback.usage_projection.token.total_tokens_observed > 0);
  assert.equal(first.authoritative_source_count, 1);
  assert.equal(replay.idempotent_noop, true);

  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    stage_attempt_id: attempt.stage_attempt_id,
    execution_session_ref: readback.execution_session_ref,
    telemetry_status: readback.usage_projection.telemetry_status,
    source_ref: readback.usage_projection.source_ref,
    token_usage: readback.usage_observation?.token_usage,
    projected_total_tokens: readback.usage_projection.token.total_tokens_observed,
    replay_idempotent_noop: replay.idempotent_noop,
  }, null, 2)}\n`);
} finally {
  db.close();
  if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
  else process.env.OPL_STATE_DIR = previousStateDir;
  fs.rmSync(stateRoot, { recursive: true, force: true });
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
}
