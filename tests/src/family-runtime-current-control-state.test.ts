import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { enqueueTask } from '../../src/family-runtime-enqueue.ts';
import { createFamilyRuntimeQueueTables, inspectTask } from '../../src/family-runtime-store.ts';
import {
  createStageAttempt,
  ingestStageAttemptCloseout,
  recordStageAttemptActivityHeartbeat,
} from '../../src/family-runtime-stage-attempts.ts';
import { deriveCurrentControlStateForTask } from '../../src/family-runtime-current-control-state.ts';

function withDb(fn: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    fn(db);
  } finally {
    db.close();
  }
}

function enqueueDefaultTask(db: DatabaseSync, payload: Record<string, unknown> = {}) {
  const result = enqueueTask(db, {
    domainId: 'medautoscience',
    taskKind: 'domain_owner/default-executor-dispatch',
    payload: {
      profile: '/tmp/mas.profile.toml',
      study_id: '002-dm',
      quest_id: '002-dm',
      action_type: 'run_quality_repair_batch',
      dispatch_ref: 'dispatch/latest.json',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      source_fingerprint: 'truth:epoch-1',
      route_epoch: 'route:epoch-1',
      truth_epoch: 'truth:epoch-1',
      ...payload,
    },
    dedupeKey: `dedupe:${crypto.randomUUID()}`,
    source: 'test',
  });
  assert.ok(result.task);
  return result.task;
}

function enqueuePaperMissionStageRouteTask(db: DatabaseSync, payload: Record<string, unknown> = {}) {
  const result = enqueueTask(db, {
    domainId: 'medautoscience',
    taskKind: 'paper_mission/stage-route',
    payload: {
      surface_kind: 'opl_mas_paper_mission_route_runtime_request',
      schema_version: 1,
      runtime_request_status: 'queued_request',
      runtime_request_kind: 'mas_paper_mission_stage_route',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      mission_id: 'paper-mission::003',
      candidate_ref: '/tmp/yang/ops/medautoscience/paper_mission_candidate_package/run/003/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction::003::submission_milestone_candidate::followthrough',
      opl_route_command_ref: 'paper-mission-transaction::003::submission_milestone_candidate::followthrough#opl_route_command',
      command_kind: 'resume_stage',
      route_target: 'continue paper-facing submission milestone work',
      workspace_root: '/tmp/yang',
      domain_workspace_root: '/tmp/yang',
      route_command_materialized: true,
      ...payload,
    },
    dedupeKey: `paper-mission-route:${crypto.randomUUID()}`,
    source: 'test',
  });
  assert.ok(result.task);
  return result.task;
}

function createTaskAttempt(
  db: DatabaseSync,
  task: ReturnType<typeof enqueueDefaultTask>,
  input: {
    sourceFingerprint?: string | null;
    workspaceEpochs?: Record<string, unknown>;
    start?: boolean;
  } = {},
) {
  const attempt = createStageAttempt(db, {
    domainId: 'medautoscience',
    stageId: 'domain_owner/default-executor-dispatch',
    providerKind: 'temporal',
    workspaceLocator: {
      workspace_root: '/tmp/mas',
      route_epoch: 'route:epoch-1',
      truth_epoch: 'truth:epoch-1',
      ...input.workspaceEpochs,
    },
    sourceFingerprint: input.sourceFingerprint === null
      ? undefined
      : input.sourceFingerprint ?? 'truth:epoch-1',
    executorKind: 'codex_cli',
    taskId: task.task_id,
    newAttempt: true,
  }).attempt;
  if (input.start) {
    db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
      attempt.stage_attempt_id,
    );
  }
  return attempt;
}

function optionalStringField(record: unknown, key: string) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function optionalBooleanField(record: unknown, key: string) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

test('current control state binds MAS default executor task freshness to domain source fingerprint', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      source_fingerprint: 'mas-domain-source:fresh',
    });
    createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.deepEqual(state.stale_epoch_kinds, []);
    assert.equal(state.source_fingerprint, 'opl-stage-source:derived');
  });
});

test('current control state treats queued MAS PaperMission stage-route as provider admission requested', () => {
  withDb((db) => {
    const task = enqueuePaperMissionStageRouteTask(db, {
      route_identity_key: undefined,
      attempt_idempotency_key: undefined,
      request_idempotency_key: undefined,
      opl_route_handoff_record: {
        opl_runtime_carrier: {
          action_type: 'continue_same_stage',
          work_unit_id: 'submission_milestone_candidate',
          work_unit_fingerprint: 'paper-mission::003::submission_milestone_candidate::followthrough',
          route_identity_key: 'paper-mission-transaction::003::submission_milestone_candidate::followthrough::route',
          attempt_idempotency_key: '003::submission_milestone_candidate::followthrough::opl-attempt',
          request_idempotency_key: '003::submission_milestone_candidate::followthrough::opl-request',
        },
      },
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);
    const identity = state.stage_run_currentness_identity as Record<string, unknown>;

    assert.equal(state.reconciliation_status, 'provider_admission_requested');
    assert.equal(state.current_attempt_state, 'provider_start_pending');
    assert.equal(state.blocker_reason, 'provider_attempt_start_pending');
    assert.equal(identity.route_identity_key, 'paper-mission-transaction::003::submission_milestone_candidate::followthrough::route');
    assert.equal(identity.attempt_idempotency_key, '003::submission_milestone_candidate::followthrough::opl-attempt');
    assert.equal(identity.idempotency_key, '003::submission_milestone_candidate::followthrough::opl-request');
    assert.equal(identity.work_unit_id, 'submission_milestone_candidate');
    assert.equal(identity.work_unit_fingerprint, 'paper-mission::003::submission_milestone_candidate::followthrough');
    assert.equal(state.running_provider_attempt, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
  });
});

test('current control state exposes active provider attempt identity without domain readiness claims', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.equal(state.current_attempt_state, 'running');
    assert.equal(state.active_run_id, `opl-stage-attempt://${attempt.stage_attempt_id}`);
    assert.equal(state.active_stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(state.running_provider_attempt, true);
    assert.equal(state.task_id, task.task_id);
    assert.equal(state.workflow_id, attempt.workflow_id);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('current control state marks live MAS attempt stale when a newer same-study work unit is current', () => {
  withDb((db) => {
    const staleTask = enqueueDefaultTask(db, {
      study_id: 'DM002',
      quest_id: 'DM002',
      action_type: 'return_to_ai_reviewer_workflow',
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_old_inputs',
      dispatch_ref: 'studies/DM002/default-executor-dispatch/old-ai-reviewer.json',
      next_executable_owner: 'ai_reviewer',
      source_fingerprint: 'mas-domain-source:old-work-unit',
    });
    const staleAttempt = createTaskAttempt(db, staleTask, {
      sourceFingerprint: 'opl-stage-source:old-work-unit',
      workspaceEpochs: {
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_old_inputs',
        dispatch_ref: 'studies/DM002/default-executor-dispatch/old-ai-reviewer.json',
        domain_source_fingerprint: 'mas-domain-source:old-work-unit',
      },
      start: true,
    });
    const currentTask = enqueueDefaultTask(db, {
      study_id: 'DM002',
      quest_id: 'DM002',
      action_type: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
      dispatch_ref: 'studies/DM002/default-executor-dispatch/current-finalize.json',
      next_executable_owner: 'write',
      source_fingerprint: 'mas-domain-source:current-work-unit',
    });
    db.prepare(`
      UPDATE tasks
      SET status = 'running', lease_owner = 'test-live-worker',
        lease_expires_at = '2999-01-01T00:00:00.000Z',
        created_at = '2026-06-02T00:00:00.000Z'
      WHERE task_id = ?
    `).run(staleTask.task_id);
    db.prepare(`
      UPDATE tasks
      SET created_at = '2026-06-02T00:00:01.000Z'
      WHERE task_id = ?
    `).run(currentTask.task_id);

    const state = deriveCurrentControlStateForTask(db, staleTask.task_id);

    assert.equal(state.reconciliation_status, 'blocked_stale_work_unit');
    assert.equal(state.current_attempt_state, 'blocked');
    assert.equal(state.blocker_reason, 'stale/superseded_by_current_work_unit');
    assert.equal(state.running_provider_attempt, false);
    assert.equal(state.active_run_id, null);
    assert.equal(state.active_stage_attempt_id, null);
    assert.equal(state.current_stage_attempt_id, staleAttempt.stage_attempt_id);
    const diagnostic = state.stale_work_unit_diagnostic;
    assert.ok(diagnostic);
    assert.equal(diagnostic.diagnostic, 'stale/superseded_by_current_work_unit');
    assert.equal(diagnostic.superseded_by_task_id, currentTask.task_id);
    assert.deepEqual(diagnostic.mismatched_identity_fields, [
      'action_type',
      'work_unit_id',
      'dispatch_ref',
    ]);
    assert.equal(
      diagnostic.current_work_unit.work_unit_id,
      'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    );
    assert.equal(
      diagnostic.stale_work_unit.work_unit_id,
      'produce_ai_reviewer_publication_eval_record_against_old_inputs',
    );
  });
});

test('current control state carries stage progress log observability for the active attempt', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });
    recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: attempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_runner_progress',
      runnerEventKind: 'agent_message',
      checkpointRefs: ['studies/002-dm/dispatch.json'],
      observedAt: '2026-05-27T05:07:17.035Z',
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.stage_progress_log.surface_kind, 'opl_stage_progress_log_summary');
    assert.equal(state.stage_progress_log.attempt_count, 1);
    assert.equal(state.stage_progress_log.runner_progress_event_count, 1);
    assert.equal(state.stage_progress_log.progress_delta_receipt_ref_count, 1);
    assert.deepEqual(state.stage_progress_log.progress_delta_receipt_refs, [
      `progress-delta:${attempt.stage_attempt_id}`,
    ]);
    assert.deepEqual(state.stage_progress_log.attempt_refs, [
      `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}/stage_progress_log`,
    ]);
    assert.equal(state.stage_progress_log.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(state.active_stage_attempt_stage_progress_log_ref, (
      `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}/stage_progress_log`
    ));
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('current control state uses provider activity heartbeat as running liveness projection', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = json_set(provider_run_json, '$.last_heartbeat_at', ?),
        activity_events_json = json_insert(activity_events_json, '$[#]', json(?))
      WHERE stage_attempt_id = ?
    `).run(
      '2026-05-27T05:01:17.035Z',
      JSON.stringify({
        event_time: '2026-05-27T05:04:47.035Z',
        activity_kind: 'codex_stage_activity',
        activity_status: 'running',
        heartbeat_kind: 'codex_stage_activity_supervision',
      }),
      attempt.stage_attempt_id,
    );

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.equal(state.current_attempt_state, 'running');
    assert.equal(state.provider_run.last_heartbeat_at, '2026-05-27T05:04:47.035Z');
    assert.equal(state.provider_run.ledger_last_heartbeat_at, '2026-05-27T05:01:17.035Z');
    assert.equal(state.provider_run.liveness_source, 'provider_activity_event');
    assert.equal(state.running_provider_attempt, true);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('stage attempt activity heartbeat writer feeds current control liveness projection', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
      start: true,
    });

    recordStageAttemptActivityHeartbeat(db, {
      stageAttemptId: attempt.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_runner_progress',
      runnerEventKind: 'agent_message',
      checkpointRefs: ['dispatch/latest.json'],
      observedAt: '2026-05-27T05:07:17.035Z',
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.provider_run.last_heartbeat_at, '2026-05-27T05:07:17.035Z');
    assert.equal(state.provider_run.liveness_source, 'provider_activity_event');
    assert.equal(state.provider_run.last_runner_event_kind, 'agent_message');
    assert.equal(state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
  });
});

test('current control state fails closed when task or attempt identity is incomplete', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    createTaskAttempt(db, task, { sourceFingerprint: null });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'blocked_missing_identity');
    assert.equal(state.current_attempt_state, 'blocked');
    assert.equal(state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('current control state fails closed on stale route source or truth epochs', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      source_fingerprint: 'truth:epoch-2',
      route_epoch: 'route:epoch-2',
      truth_epoch: 'truth:epoch-2',
    });
    createTaskAttempt(db, task, {
      sourceFingerprint: 'truth:epoch-1',
      workspaceEpochs: {
        route_epoch: 'route:epoch-1',
        truth_epoch: 'truth:epoch-1',
      },
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'blocked_stale_epoch');
    assert.deepEqual(state.stale_epoch_kinds, ['source_fingerprint', 'route_epoch', 'truth_epoch']);
    assert.equal(state.current_attempt_state, 'blocked');
  });
});

test('current control state requires typed closeout when provider reports completed', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const attempt = createTaskAttempt(db, task);
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'completed')
      WHERE stage_attempt_id = ?
    `).run(attempt.stage_attempt_id);

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'blocked_provider_completed_missing_typed_closeout');
    assert.equal(state.current_attempt_state, 'blocked');
    assert.deepEqual(state.closeout_refs, []);
    assert.equal(state.closeout_receipt_status, null);
  });
});

test('current control state lets succeeded domain handler task supersede missing workflow observation', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      source_fingerprint: 'mas-domain-source:fresh',
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'opl-stage-source:derived',
      workspaceEpochs: {
        domain_source_fingerprint: 'mas-domain-source:fresh',
      },
    });
    db.prepare(`
      UPDATE tasks
      SET status = 'succeeded', attempts = 2
      WHERE task_id = ?
    `).run(task.task_id);
    db.prepare(`
      UPDATE stage_attempts
      SET executor_kind = 'domain_handler',
        status = 'failed',
        blocked_reason = 'temporal_workflow_not_started_or_not_found',
        provider_run_json = json_set(
          provider_run_json,
          '$.provider_status', 'failed',
          '$.completed_at', '2026-05-28T08:44:39.753Z',
          '$.terminal_observation.reason', 'temporal_workflow_not_started_or_not_found'
        ),
        activity_events_json = json_insert(activity_events_json, '$[#]', json(?))
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify({
        event_time: '2026-05-28T08:43:37.258Z',
        activity_kind: 'domain_handler_dispatch_activity',
        activity_status: 'checkpointed',
        closeout_refs: [],
      }),
      attempt.stage_attempt_id,
    );

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'succeeded');
    assert.equal(state.current_attempt_state, 'succeeded');
    assert.equal(state.blocker_reason, null);
    assert.equal(state.running_provider_attempt, false);
    assert.equal(state.active_run_id, null);
    assert.equal(state.provider_run.provider_status, 'failed');
    assert.equal(optionalBooleanField(state, 'terminal_provider_transport_observation_superseded'), true);
    assert.equal(
      optionalStringField(state, 'superseded_terminal_observation_reason'),
      'temporal_workflow_not_started_or_not_found',
    );
    assert.equal(optionalStringField(state, 'superseded_by_task_status'), 'succeeded');
    assert.equal(state.stage_progress_log.blocked_attempt_count, 1);
    assert.equal(state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
  });
});

test('current control state ignores older terminal attempt when a newer attempt is running', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const olderAttempt = createTaskAttempt(db, task, { sourceFingerprint: 'truth:older' });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'failed',
        blocked_reason = 'temporal_workflow_failed',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
      WHERE stage_attempt_id = ?
    `).run(olderAttempt.stage_attempt_id);
    createTaskAttempt(db, task, { start: true });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'running');
    assert.equal(state.current_attempt_state, 'running');
    assert.equal(state.current_stage_attempt_id === olderAttempt.stage_attempt_id, false);
    assert.equal(state.superseded_terminal_attempt_refs.length, 1);
  });
});

test('current control state accepts only the newest typed closeout as OPL reconciled projection', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const olderAttempt = createTaskAttempt(db, task, { sourceFingerprint: 'truth:older' });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'failed',
        blocked_reason = 'temporal_workflow_failed',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
      WHERE stage_attempt_id = ?
    `).run(olderAttempt.stage_attempt_id);
    const newerAttempt = createTaskAttempt(db, task);
    ingestStageAttemptCloseout(db, {
      stageAttemptId: newerAttempt.stage_attempt_id,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:typed-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'accepted_typed_closeout');
    assert.equal(state.current_attempt_state, 'accepted_typed_closeout');
    assert.deepEqual(state.closeout_refs, ['receipt:typed-closeout']);
    assert.deepEqual(state.owner_receipt_refs, []);
    assert.equal(state.authority_boundary.opl_can_authorize_domain_ready, false);
  });
});

test('current control state classifies typed blocker refs carried in closeout refs', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const attempt = createTaskAttempt(db, task);
    const typedBlockerRef = [
      'mas-domain-dispatch-typed-blocker:medautoscience',
      'domain_owner-default-executor-dispatch:003-dpcc-primary-care-phenotype-treatment-gap',
      'truth-snapshot::971c2d5a5ef251bca15ae16d',
      'owner-receipt-or-live-paper-line-closeout-pending',
    ].join(':');
    const ordinaryCloseoutRef = 'studies/003/artifacts/typed-blocker-review-notes.json';
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: [
          ordinaryCloseoutRef,
          typedBlockerRef,
        ],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);

    assert.equal(state.reconciliation_status, 'accepted_typed_closeout');
    assert.deepEqual(state.typed_blocker_refs, [typedBlockerRef]);
    assert.equal(state.typed_blocker_refs.includes(ordinaryCloseoutRef), false);
    assert.equal(state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
  });
});

test('queue inspect exposes current control state without domain readiness claims', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db);
    const attempt = createTaskAttempt(db, task);
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attempt.stage_attempt_id,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:typed-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    });

    const inspected = inspectTask(db, task.task_id);
    const state = inspected.task.current_control_state;

    assert.equal(state.reconciliation_status, 'accepted_typed_closeout');
    assert.equal(state.current_stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
    assert.equal(Object.hasOwn(state, 'artifact_ready'), false);
  });
});

test('current control state projects stop-loss successor admission without domain authority', () => {
  withDb((db) => {
    const task = enqueueDefaultTask(db, {
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      action_type: 'publishability_repair_sprint',
      work_unit_id: 'publishability_repair_sprint_after_anti_loop_budget_exhausted',
      work_unit_fingerprint: 'dm002-stop-loss-successor',
      source_fingerprint: 'dm002-stop-loss-successor-source',
      route_identity_key: 'dm002-stop-loss-successor-route',
      idempotency_key: 'dm002-stop-loss-successor-idempotency',
      stop_loss_successor_admission: {
        surface_kind: 'opl_stop_loss_successor_admission_read_model',
        schema_version: 'stop-loss-successor-admission.v1',
        status: 'admitted',
        reason: 'anti_loop_stop_loss_identity_different_successor_admitted',
        terminal_blocker_code: 'anti_loop_budget_exhausted',
        previous_stop_loss_task_id: 'task-dm002-stop-loss-exhausted-lineage',
        successor_route_reason: 'anti_loop_budget_exhausted_successor',
        legal_terminal_path: 'publishability_repair_sprint',
        same_work_unit_redrive_allowed: false,
        authority_boundary: {
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_create_typed_blocker: false,
          can_claim_publication_ready: false,
        },
      },
    });
    const attempt = createTaskAttempt(db, task, {
      sourceFingerprint: 'dm002-stop-loss-successor-source',
      workspaceEpochs: {
        domain_source_fingerprint: 'dm002-stop-loss-successor-source',
        action_type: 'publishability_repair_sprint',
        work_unit_id: 'publishability_repair_sprint_after_anti_loop_budget_exhausted',
      },
      start: true,
    });

    const state = deriveCurrentControlStateForTask(db, task.task_id);
    const successorAdmission = state.stop_loss_successor_admission as Record<string, any>;

    assert.equal(state.reconciliation_status, 'running');
    assert.equal(state.current_stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(successorAdmission.status, 'admitted');
    assert.equal(
      successorAdmission.previous_stop_loss_task_id,
      'task-dm002-stop-loss-exhausted-lineage',
    );
    assert.equal(
      successorAdmission.successor_route_reason,
      'anti_loop_budget_exhausted_successor',
    );
    assert.equal(successorAdmission.same_work_unit_redrive_allowed, false);
    assert.equal(
      (successorAdmission.authority_boundary as Record<string, unknown>).read_model_can_create_owner_receipt,
      false,
    );
    assert.equal(
      (successorAdmission.authority_boundary as Record<string, unknown>).read_model_can_create_typed_blocker,
      false,
    );
    assert.equal(
      (successorAdmission.authority_boundary as Record<string, unknown>).read_model_can_claim_publication_ready,
      false,
    );
    assert.equal(Object.hasOwn(state, 'domain_ready'), false);
    assert.equal(Object.hasOwn(state, 'publication_ready'), false);
  });
});
