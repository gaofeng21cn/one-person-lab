import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { Worker } from '@temporalio/worker';

import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import './family-runtime-temporal-terminal-sync-cases/attempt-precedence.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
  queryStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import * as activities from '../../src/modules/runway/family-runtime-temporal-activities.ts';
import { codexStageRunnerCostSummaryFrom } from '../../src/modules/runway/family-runtime-codex-session-usage.ts';
import { openQueueDb } from '../../src/modules/runway/family-runtime-store.ts';
import { StageAttemptWorkflow } from '../../src/modules/runway/family-runtime-temporal-workflows.ts';
import {
  blockedTemporalObservation,
  canceledTemporalObservation,
  completedTemporalObservation,
  createQueueTables,
  insertDomainRouteTask,
  missingWorkflowObservation,
  withStageAttemptDb,
} from './family-runtime-temporal-terminal-sync-cases/helpers.ts';
import { createTemporalTestWorkflowEnvironment } from './temporal-test-environment.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const genericObservationIdentity = { domainId: 'redcube', stageId: 'domain_route/stage-route', checkpointRef: 'checkpoint:generic-domain-route', nextOwner: 'redcube' } as const;

function createGenericDomainHandlerAttempt(db: Parameters<typeof createStageAttempt>[0], taskId: string) {
  return createStageAttempt(db, {
    domainId: 'redcube', stageId: 'domain_route/stage-route', providerKind: 'temporal',
    workspaceLocator: { route_ref: 'domain_route/stage-route' }, sourceFingerprint: 'sha256:generic-domain-route', executorKind: 'domain_handler',
    taskId, checkpointRefs: ['checkpoint:generic-domain-route'],
  }).attempt;
}

function taskState(db: Parameters<typeof createStageAttempt>[0], taskId: string) {
  return db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(taskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
}

test('identity-unresolved attempts reject Temporal terminal and unavailable sync without mutation', () => {
  withStageAttemptDb((db) => {
    const attempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/redcube-runtime' },
      sourceFingerprint: 'sha256:legacy-unresolved-terminal-sync',
      executorKind: 'codex_cli',
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved', status = 'running'
      WHERE stage_attempt_id = ?
    `).run(attempt.stage_attempt_id);
    const before = inspectStageAttempt(db, attempt.stage_attempt_id);
    const isUnresolvedExecutionError = (error: unknown) => error instanceof FrameworkContractError
      && error.details?.failure_code === 'runtime_execution_identity_unresolved';

    assert.throws(() => syncStageAttemptFromTemporalTerminalObservation(db,
      completedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        createdAt: new Date().toISOString(),
        domainId: attempt.domain_id,
        stageId: attempt.stage_id,
        checkpointRef: 'checkpoint:legacy-unresolved-terminal-sync',
        nextOwner: attempt.domain_id,
      })), isUnresolvedExecutionError);
    assert.throws(() => syncStageAttemptFromTemporalTerminalObservation(db,
      missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      })), isUnresolvedExecutionError);

    assert.deepEqual(inspectStageAttempt(db, attempt.stage_attempt_id), before);
    const readback = queryStageAttempt(db, attempt.stage_attempt_id).stage_attempt_query;
    assert.deepEqual(readback.closeouts, []);
    assert.equal(readback.attempt.identity_state, 'identity_unresolved');
    assert.equal(readback.workflow_input, null);
    assert.equal(readback.codex_stage_activity, null);
    assert.equal(readback.execution_identity_admission.launch_allowed, false);
  });
});

for (const [name, taskStatus, attemptStatus, providerStatus] of [
  ['unclaimed', 'queued', 'queued', 'registered'],
  ['checkpointed', 'succeeded', 'checkpointed', 'checkpointed'],
] as const) {
  test(`missing Temporal workflow preserves ${name} generic domain handler state`, () => {
    withStageAttemptDb((db) => {
      const createdAt = new Date().toISOString(), taskId = `task-generic-${name}`;
      createQueueTables(db);
      insertDomainRouteTask(db, { taskId, status: taskStatus, createdAt });
      const attempt = createGenericDomainHandlerAttempt(db, taskId);
      if (attemptStatus === 'checkpointed') {
        db.prepare(`UPDATE stage_attempts SET status = 'checkpointed', provider_run_json = json_set(provider_run_json,
          '$.provider_status', 'checkpointed'), updated_at = ? WHERE stage_attempt_id = ?`)
          .run(createdAt, attempt.stage_attempt_id);
      }

      const synced = syncStageAttemptFromTemporalTerminalObservation(db, missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id, workflowId: attempt.workflow_id }));
      const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
      assert.equal(synced, null);
      assert.equal(inspected.status, attemptStatus); assert.equal(inspected.provider_run.provider_status, providerStatus);
      assert.deepEqual({ ...taskState(db, taskId) }, { status: taskStatus, last_error: null, dead_letter_reason: null });
    });
  });
}

for (const [name, observation, expectedStatus, expectedTaskReason] of [
  ['quality-debt', blockedTemporalObservation, 'completed', 'domain_route_consumable_progress_observed'],
  ['completed', completedTemporalObservation, 'completed', 'domain_route_consumable_progress_observed'],
] as const) {
  test(`Temporal terminal sync owns generic domain-route ${name} transition`, () => {
    withStageAttemptDb((db) => {
      const createdAt = new Date().toISOString(), taskId = `task-generic-${name}`;
      createQueueTables(db);
      insertDomainRouteTask(db, { taskId, status: 'running', createdAt });
      const attempt = createGenericDomainHandlerAttempt(db, taskId);

      const synced = syncStageAttemptFromTemporalTerminalObservation(db, observation({
        stageAttemptId: attempt.stage_attempt_id, workflowId: attempt.workflow_id,
        createdAt, ...genericObservationIdentity }));
      const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
      assert.equal(synced?.status, expectedStatus); assert.equal(inspected.provider_run.provider_status, expectedStatus);
      assert.deepEqual(
        { ...taskState(db, taskId) },
        { status: 'succeeded', last_error: null, dead_letter_reason: null },
      );
      if (name === 'quality-debt') {
        assert.ok(inspected.closeout_refs.some((ref) => ref.includes('quality-debt-diagnostics')));
      }
      assert.equal(inspected.blocked_reason, null);
      assert.equal(expectedTaskReason, 'domain_route_consumable_progress_observed');
    });
  });
}

test('Temporal terminal sync persists Codex session identity and usage idempotently', () => {
  withStageAttemptDb((db) => {
    const createdAt = '2026-07-13T00:00:02.000Z';
    const attempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'telemetry-stage',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/redcube-runtime' },
      sourceFingerprint: 'sha256:temporal-token-telemetry',
      executorKind: 'codex_cli',
      checkpointRefs: ['checkpoint:telemetry-stage'],
    }).attempt;
    const costSummary = codexStageRunnerCostSummaryFrom([
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-temporal-telemetry' }),
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: 120,
          cached_input_tokens: 40,
          output_tokens: 30,
          reasoning_output_tokens: 10,
          total_tokens: 150,
        },
      }),
    ].join('\n'), 'codex_cli', null, createdAt);
    const terminal = completedTemporalObservation({
      stageAttemptId: attempt.stage_attempt_id,
      workflowId: attempt.workflow_id,
      createdAt,
      domainId: 'redcube',
      stageId: 'telemetry-stage',
      checkpointRef: 'checkpoint:telemetry-stage',
      nextOwner: 'redcube',
    });
    const observation = {
      ...terminal,
      query: {
        ...terminal.query,
        activity_events: [{
          activity_kind: 'codex_stage_activity',
          progress_summary: {
            execution_session_ref: 'codex://threads/thread-temporal-telemetry',
          },
          cost_summary: costSummary,
        }],
      },
    };

    syncStageAttemptFromTemporalTerminalObservation(db, observation);
    syncStageAttemptFromTemporalTerminalObservation(db, observation);
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);

    assert.equal(inspected.execution_session_ref, 'codex://threads/thread-temporal-telemetry');
    assert.equal(inspected.usage_observation?.telemetry_status, 'observed');
    assert.equal(inspected.usage_projection.token.observed_count, 1);
    assert.equal(inspected.usage_projection.token.total_tokens_observed, 150);
  });
});

test('Temporal activity terminal sync preserves refs-only domain output through query', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-terminal-sync-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const { db } = openQueueDb();
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-temporal-domain-output-${Date.now()}`;
  try {
    createStageAttemptTable(db);
    const attempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'domain_route/stage-route',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/redcube-runtime' },
      sourceFingerprint: 'sha256:temporal-domain-output',
      executorKind: 'domain_handler',
    }).attempt;
    const outputRef = 'file:///tmp/redcube-runtime/domain-output.json';
    const domainOutput = {
      surface_kind: 'domain_owned_stage_output_ref',
      version: 'domain-owned-stage-output-ref.v1',
      domain_id: 'redcube',
      output_ref: outputRef,
    };
    const closeoutRef = {
      ref: outputRef,
      kind: 'redcube_stage_closeout_payload',
      sha256: 'sha256:temporal-domain-output',
    };
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    const temporalQuery = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          domain_id: 'redcube',
          stage_id: attempt.stage_id,
          workspace_locator: { workspace_root: '/tmp/redcube-runtime' },
          source_fingerprint: attempt.source_fingerprint,
          executor_kind: 'domain_handler',
          retry_budget: { max_attempts: 1 },
          codex_stage_runner: { runner_mode: 'dry_run' },
          closeout_packet: {
            surface_kind: 'domain_stage_closeout_packet',
            closeout_refs: [closeoutRef],
            domain_output: domainOutput,
          },
        }],
        taskQueue,
        workflowId: attempt.workflow_id,
      });
      return await handle.result();
    });
    assert.deepEqual(temporalQuery.closeout_packet?.domain_output, domainOutput);
    assert.deepEqual(temporalQuery.closeout_packet?.closeout_ref_metadata, [closeoutRef]);
    syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: temporalQuery,
    });

    const query = queryStageAttempt(db, attempt.stage_attempt_id).stage_attempt_query;
    assert.deepEqual(query.domain_output, domainOutput);
    assert.deepEqual(query.closeouts[0].packet.closeout_ref_metadata, [closeoutRef]);
  } finally {
    db.close();
    await testEnv.teardown();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
test('Temporal cancellation remains provider-only for a generic domain route', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString(), taskId = 'task-generic-canceled';
    createQueueTables(db);
    insertDomainRouteTask(db, { taskId, status: 'running', createdAt });
    const attempt = createGenericDomainHandlerAttempt(db, taskId);

    const synced = syncStageAttemptFromTemporalTerminalObservation(db, canceledTemporalObservation({
      stageAttemptId: attempt.stage_attempt_id, workflowId: attempt.workflow_id, workflowStatus: 'CANCELLED' }));
    assert.equal(synced?.blocked_reason, 'temporal_workflow_canceled');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'canceled');
    assert.deepEqual({ ...taskState(db, taskId) }, { status: 'dead_letter',
      last_error: 'temporal_workflow_canceled', dead_letter_reason: 'temporal_workflow_canceled' });
  });
});
