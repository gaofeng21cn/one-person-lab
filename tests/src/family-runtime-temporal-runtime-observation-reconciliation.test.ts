import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
  listStageAttemptCloseouts,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { runTemporalProviderSloTick } from '../../src/modules/runway/family-runtime-provider-slo-executor.ts';
import { runTemporalProviderCadenceReadback } from '../../src/modules/runway/family-runtime-scheduler.ts';
import {
  createFamilyRuntimeQueueTables,
  familyRuntimePaths,
  insertEvent,
  listEvents,
} from '../../src/modules/runway/family-runtime-store.ts';
import {
  DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS,
  readFreshTemporalStageAttemptRuntimeObservation,
  reconcileTemporalStageAttemptRuntimeObservations,
} from '../../src/modules/runway/family-runtime-temporal-runtime-observation-reconciliation.ts';
import { temporalWorkerStatus } from './cli/cases/family-runtime-provider-slo-fixtures.ts';

function withDb(fn: (db: DatabaseSync) => Promise<void> | void) {
  const db = new DatabaseSync(':memory:');
  createStageAttemptTable(db);
  createFamilyRuntimeQueueTables(db);
  return Promise.resolve(fn(db)).finally(() => db.close());
}

function createAttempt(db: DatabaseSync, suffix: string) {
  return createStageAttempt(db, {
    domainId: 'redcube',
    stageId: 'runtime-reconciliation',
    providerKind: 'temporal',
    workspaceLocator: { workspace_root: `/tmp/runtime-reconciliation-${suffix}` },
    sourceFingerprint: `sha256:runtime-reconciliation-${suffix}`,
    executorKind: 'codex_cli',
    newAttempt: true,
  }).attempt;
}

function runningReceipt(attempt: { stage_attempt_id: string; workflow_id: string }) {
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: attempt.stage_attempt_id,
    workflow_id: attempt.workflow_id,
    run_id: `run-${attempt.stage_attempt_id}`,
    workflow_status: 'RUNNING',
    query_source: 'workflow_query',
    query: {
      surface_kind: 'temporal_stage_attempt_query',
      status: 'running',
      updated_at: '2026-07-21T00:00:01.000Z',
    },
  };
}

function completedReceipt(attempt: { stage_attempt_id: string; workflow_id: string }) {
  return {
    ...runningReceipt(attempt),
    workflow_status: 'COMPLETED',
    query: {
      surface_kind: 'temporal_stage_attempt_query',
      status: 'completed',
      updated_at: '2026-07-21T00:00:01.000Z',
      activity_events: [],
      closeout_packet: null,
      completion_boundary: {
        provider_completion: 'completed',
        domain_ready_verdict: null,
        provider_completion_is_domain_ready: false,
      },
    },
  };
}

function bindAttemptToStageRun(
  db: DatabaseSync,
  attempt: { stage_attempt_id: string },
  input: { stageRunId: string; launchStatus: 'started' | 'closed' },
) {
  db.prepare('UPDATE stage_attempts SET stage_run_id = ? WHERE stage_attempt_id = ?').run(
    input.stageRunId,
    attempt.stage_attempt_id,
  );
  db.prepare(`
    INSERT INTO stage_run_launches (
      stage_run_id, stage_run_invocation_id, stage_run_spec_sha256,
      domain_id, stage_id, workflow_id, stage_run_input_json,
      launch_status, terminal_status, created_at, updated_at
    ) VALUES (?, ?, ?, 'redcube', 'runtime-reconciliation', ?, '{}', ?, ?, ?, ?)
  `).run(
    input.stageRunId,
    `invocation:${input.stageRunId}`,
    'a'.repeat(64),
    `workflow:${input.stageRunId}`,
    input.launchStatus,
    input.launchStatus === 'closed' ? 'completed' : null,
    '2026-07-21T00:00:00.000Z',
    '2026-07-21T00:00:00.000Z',
  );
}

test('Temporal running query refreshes a TTL-bound cache without changing ledger status', async () => {
  await withDb(async (db) => {
    const attempt = createAttempt(db, 'fresh');
    const original = inspectStageAttempt(db, attempt.stage_attempt_id);
    let queryCount = 0;
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'provider_slo_tick',
      ttlMs: 1_000,
      now: () => '2026-07-21T00:00:00.000Z',
      queryTemporalStageAttemptReadModel: async () => {
        queryCount += 1;
        return runningReceipt(attempt);
      },
    });
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
    const observation = readFreshTemporalStageAttemptRuntimeObservation(
      inspected.provider_run,
      {
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        nowMs: Date.parse('2026-07-21T00:00:00.999Z'),
      },
    );

    assert.equal(queryCount, 1);
    assert.equal(report.selected_total, 1);
    assert.equal(report.refreshed_total, 1);
    assert.equal(report.failed_total, 0);
    assert.equal(inspected.status, 'queued');
    assert.equal(inspected.provider_run.provider_status, 'registered');
    assert.equal(inspected.updated_at, original.updated_at);
    assert.equal(observation?.surface_kind, 'temporal_stage_attempt_runtime_observation');
    assert.equal(observation?.source, 'temporal_workflow_query');
    assert.equal(observation?.effective_runtime_status, 'running');
    assert.equal(observation?.provider_completion_is_domain_ready, false);
    assert.equal(observation?.ttl_ms, 1_000);
    assert.equal(observation?.expires_at, '2026-07-21T00:00:01.000Z');
    assert.equal(readFreshTemporalStageAttemptRuntimeObservation(inspected.provider_run, {
      stageAttemptId: attempt.stage_attempt_id,
      workflowId: 'wf-copied-to-wrong-attempt',
      nowMs: Date.parse('2026-07-21T00:00:00.999Z'),
    }), null);
    assert.equal(
      readFreshTemporalStageAttemptRuntimeObservation(
        inspected.provider_run,
        {
          stageAttemptId: attempt.stage_attempt_id,
          workflowId: attempt.workflow_id,
          nowMs: Date.parse('2026-07-21T00:00:01.000Z'),
        },
      ),
      null,
    );
    assert.equal(
      listEvents(db).filter((event) => event.event_type === 'temporal_stage_attempt_runtime_observation_reconciliation').length,
      1,
    );
  });
});

test('provider completion stays non-domain-ready and never writes a running cache', async () => {
  await withDb(async (db) => {
    const attempt = createAttempt(db, 'provider-completed');
    await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'provider_slo_tick',
      now: () => '2026-07-21T00:00:00.000Z',
      queryTemporalStageAttemptReadModel: async () => completedReceipt(attempt),
    });

    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
    const closeout = listStageAttemptCloseouts(db, attempt.stage_attempt_id).at(-1);
    const closeoutAuthority = closeout?.packet.authority_boundary as Record<string, unknown> | undefined;
    assert.equal(inspected.status, 'completed');
    assert.equal(inspected.provider_run.runtime_observation, undefined);
    assert.equal(closeout?.packet.domain_ready_verdict, null);
    assert.equal(closeoutAuthority?.opl, 'temporal_closeout_transport_projection_only');
  });
});

test('provider-SLO skipped cadence still reconciles running Attempt observations', async () => {
  await withDb(async (db) => {
    const attempt = createAttempt(db, 'slo-skipped');
    insertEvent(db, {
      eventType: 'temporal_residency_proof',
      source: 'test',
      payload: {
        provider_kind: 'temporal',
        proof_mode: 'external_temporal_service_worker',
        closeout_status: 'production_residency_proven',
        proof_receipt: {
          receipt_kind: 'temporal_production_residency_proof',
          receipt_status: 'proven',
          provider_kind: 'temporal',
        },
      },
    });
    const tick = await runTemporalProviderSloTick(db, familyRuntimePaths(), {
      workerRepairDeps: {
        inspectTemporalWorkerLifecycle: async () => temporalWorkerStatus('ready'),
      },
      runtimeObservationReconciliationDeps: {
        queryTemporalStageAttemptReadModel: async () => runningReceipt(attempt),
      },
    });

    assert.equal(tick.execution_status, 'skipped');
    assert.equal(tick.stage_attempt_runtime_reconciliation.refreshed_total, 1);
  });
});

test('healthy scheduler cadence refreshes runtime observations while provider proof is deferred', async () => {
  await withDb(async (db) => {
    const attempt = createAttempt(db, 'scheduler');
    const cadence = await runTemporalProviderCadenceReadback(db, familyRuntimePaths(), {
      providerKind: 'temporal',
    }, {
      inspectProvidersWithLifecycle: async () => ({
        providers: {
          temporal: {
            ready: true,
            status: 'ready',
            degraded_reason: null,
            details: {},
          },
        },
      } as never),
      runtimeObservationReconciliationDeps: {
        queryTemporalStageAttemptReadModel: async () => runningReceipt(attempt),
      },
    });

    assert.equal(cadence.provider_slo.execution_status, 'skipped');
    assert.equal(cadence.stage_attempt_runtime_reconciliation.refreshed_total, 1);
  });
});

test('one Temporal query failure is isolated while other Attempts refresh', async () => {
  await withDb(async (db) => {
    const failedAttempt = createAttempt(db, 'failed');
    const refreshedAttempt = createAttempt(db, 'refreshed');
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'temporal_scheduler_cadence',
      queryTemporalStageAttemptReadModel: async (attempt: { stage_attempt_id: string; workflow_id: string }) => {
        if (attempt.stage_attempt_id === failedAttempt.stage_attempt_id) {
          throw new Error('Temporal query unavailable for one Attempt');
        }
        return runningReceipt(refreshedAttempt);
      },
    });

    const failed = inspectStageAttempt(db, failedAttempt.stage_attempt_id);
    const refreshed = inspectStageAttempt(db, refreshedAttempt.stage_attempt_id);
    const refreshedObservation = readFreshTemporalStageAttemptRuntimeObservation(refreshed.provider_run, {
      stageAttemptId: refreshedAttempt.stage_attempt_id,
      workflowId: refreshedAttempt.workflow_id,
    });
    assert.equal(report.selected_total, 2);
    assert.equal(report.refreshed_total, 1);
    assert.equal(report.failed_total, 1);
    assert.equal(failed.provider_run.runtime_observation, undefined);
    assert.equal(refreshedObservation?.effective_runtime_status, 'running');
  });
});

test('default reconciliation serializes heavyweight Temporal queries', async () => {
  await withDb(async (db) => {
    const attempts = [
      createAttempt(db, 'serialized-a'),
      createAttempt(db, 'serialized-b'),
      createAttempt(db, 'serialized-c'),
    ];
    let activeQueries = 0;
    let maximumConcurrentQueries = 0;
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'provider_slo_tick',
      queryTemporalStageAttemptReadModel: async (attempt) => {
        activeQueries += 1;
        maximumConcurrentQueries = Math.max(maximumConcurrentQueries, activeQueries);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeQueries -= 1;
        return runningReceipt(attempt);
      },
    });

    assert.equal(report.concurrency, 1);
    assert.equal(report.refreshed_total, attempts.length);
    assert.equal(maximumConcurrentQueries, 1);
  });
});

test('candidate selection skips stale legacy and closed StageRun attempts before Temporal queries', async () => {
  await withDb(async (db) => {
    const activeStageRunAttempt = createAttempt(db, 'active-stage-run');
    const recentLegacyAttempt = createAttempt(db, 'recent-legacy');
    const closedStageRunAttempt = createAttempt(db, 'closed-stage-run');
    bindAttemptToStageRun(db, activeStageRunAttempt, {
      stageRunId: 'sr-runtime-observation-active',
      launchStatus: 'started',
    });
    bindAttemptToStageRun(db, closedStageRunAttempt, {
      stageRunId: 'sr-runtime-observation-closed',
      launchStatus: 'closed',
    });
    const staleAttempts = Array.from({ length: 80 }, (_, index) => createAttempt(db, `stale-${index}`));
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'checkpointed', updated_at = '2026-06-01T00:00:00.000Z'
      WHERE stage_attempt_id IN (${staleAttempts.map(() => '?').join(',')})
    `).run(...staleAttempts.map((attempt) => attempt.stage_attempt_id));

    const queriedAttemptIds: string[] = [];
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'temporal_scheduler_cadence',
      now: () => '2026-07-21T00:00:00.000Z',
      queryTemporalStageAttemptReadModel: async (attempt) => {
        queriedAttemptIds.push(attempt.stage_attempt_id);
        return runningReceipt(attempt);
      },
    });

    assert.equal(report.candidate_total, 83);
    assert.equal(report.eligible_total, 2);
    assert.equal(report.selected_total, 2);
    assert.equal(report.deferred_total, 81);
    assert.equal(report.limited_total, 0);
    assert.deepEqual(queriedAttemptIds.sort(), [
      activeStageRunAttempt.stage_attempt_id,
      recentLegacyAttempt.stage_attempt_id,
    ].sort());
    assert.equal(
      inspectStageAttempt(db, closedStageRunAttempt.stage_attempt_id).provider_run.runtime_observation,
      undefined,
    );
    assert.equal(
      inspectStageAttempt(db, staleAttempts[0]!.stage_attempt_id).provider_run.runtime_observation,
      undefined,
    );
  });
});

test('a mismatched Temporal receipt cannot be copied onto another Attempt', async () => {
  await withDb(async (db) => {
    const requestedAttempt = createAttempt(db, 'identity-requested');
    const foreignAttempt = createAttempt(db, 'identity-foreign');
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'provider_slo_tick',
      queryTemporalStageAttemptReadModel: async (attempt: { stage_attempt_id: string }) => {
        if (attempt.stage_attempt_id === requestedAttempt.stage_attempt_id) {
          return runningReceipt(foreignAttempt);
        }
        throw new Error('foreign Attempt query unavailable');
      },
    });

    assert.equal(report.refreshed_total, 0);
    assert.equal(report.failed_total, 2);
    assert.equal(inspectStageAttempt(db, requestedAttempt.stage_attempt_id).provider_run.runtime_observation, undefined);
    assert.equal(inspectStageAttempt(db, foreignAttempt.stage_attempt_id).provider_run.runtime_observation, undefined);
  });
});

test('terminal transition wins over an in-flight running observation and is never reopened', async () => {
  await withDb(async (db) => {
    const attempt = createAttempt(db, 'terminal-race');
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'provider_slo_tick',
      queryTemporalStageAttemptReadModel: async () => {
        db.prepare(`
          UPDATE stage_attempts
          SET status = 'completed', provider_run_json = json_set(provider_run_json, '$.provider_status', 'completed')
          WHERE stage_attempt_id = ?
        `).run(attempt.stage_attempt_id);
        return runningReceipt(attempt);
      },
    });

    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
    assert.equal(report.refreshed_total, 0);
    assert.equal(report.failed_total, 1);
    assert.equal(inspected.status, 'completed');
    assert.equal(inspected.provider_run.provider_status, 'completed');
    assert.equal(inspected.provider_run.runtime_observation, undefined);
  });
});

test('a StageRun closing during query prevents a late running cache write', async () => {
  await withDb(async (db) => {
    const attempt = createAttempt(db, 'stage-run-close-race');
    const stageRunId = 'sr-runtime-observation-close-race';
    bindAttemptToStageRun(db, attempt, { stageRunId, launchStatus: 'started' });
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'provider_slo_tick',
      queryTemporalStageAttemptReadModel: async () => {
        db.prepare(`
          UPDATE stage_run_launches
          SET launch_status = 'closed', terminal_status = 'completed'
          WHERE stage_run_id = ?
        `).run(stageRunId);
        return runningReceipt(attempt);
      },
    });

    assert.equal(report.refreshed_total, 0);
    assert.equal(report.failed_total, 1);
    assert.equal(
      inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.runtime_observation,
      undefined,
    );
  });
});

test('fresh-read validation rejects tampered provenance and uses the documented default TTL', () => {
  assert.equal(DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS, 600_000);
  assert.equal(
    readFreshTemporalStageAttemptRuntimeObservation({
      runtime_observation: {
        surface_kind: 'temporal_stage_attempt_runtime_observation',
        source: 'unexpected_source',
        provider_kind: 'temporal',
        observed_at: '2026-07-21T00:00:00.000Z',
        expires_at: '2026-07-21T00:10:00.000Z',
        ttl_ms: 600_000,
        provider_completion_is_domain_ready: false,
      },
    }, {
      stageAttemptId: 'sat-tampered',
      workflowId: 'wf-tampered',
      nowMs: Date.parse('2026-07-21T00:01:00.000Z'),
    }),
    null,
  );
});

test('runtime observation TTL environment accepts only bounded decimal integers', async () => {
  const previous = process.env.OPL_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS;
  try {
    process.env.OPL_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS = '1000abc';
    await withDb(async (db) => {
      const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
        trigger: 'provider_slo_tick',
      });
      assert.equal(report.ttl_ms, DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS);
    });
  } finally {
    if (previous === undefined) delete process.env.OPL_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS;
    else process.env.OPL_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS = previous;
  }
});
