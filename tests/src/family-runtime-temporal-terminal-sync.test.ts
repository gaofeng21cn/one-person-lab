import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import './family-runtime-temporal-terminal-sync-cases/attempt-precedence.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
  queryStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import * as activities from '../../src/modules/runway/family-runtime-temporal-activities.ts';
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
  ['blocked', blockedTemporalObservation, 'blocked', 'zero_readable_artifact'],
  ['completed', completedTemporalObservation, 'completed', 'domain_route_domain_gate_pending'],
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
      assert.deepEqual({ ...taskState(db, taskId) }, { status: 'blocked', last_error: expectedTaskReason, dead_letter_reason: expectedTaskReason });
    });
  });
}

test('Temporal activity terminal sync preserves refs-only domain output through query', async () => {
  const db = new DatabaseSync(':memory:');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
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
