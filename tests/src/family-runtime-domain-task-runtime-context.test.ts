import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  buildOplDomainTaskRuntimeContext,
} from '../../src/modules/runway/family-runtime-domain-task-runtime-context.ts';
import {
  createFamilyRuntimeQueueTables,
  inspectTask,
} from '../../src/modules/runway/family-runtime-store.ts';
import { createStageAttempt } from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { queryStageAttempt } from '../../src/modules/runway/family-runtime-stage-attempt-query.ts';

const identity = {
  surface_kind: 'opl_stage_run_currentness_identity',
  schema_version: 1,
  domain_id: 'medautoscience',
  study_id_or_quest_id: 'study-dm002',
  stage_id: 'domain_owner/default-executor-dispatch',
  stage_attempt_id: 'sat-dm002-current',
  action_type: 'complete_medical_paper_readiness',
  work_unit_id: 'publication-readiness',
  work_unit_fingerprint: 'sha256:work-unit-current',
  source_fingerprint: 'sha256:source-current',
  truth_epoch: 'truth-current',
  runtime_health_epoch: 'runtime-current',
  source_eval_id: 'source-eval-current',
  idempotency_key: 'request-current',
  route_identity_key: 'route-current',
  attempt_idempotency_key: 'attempt-current',
  recovery_obligation_id: null,
  dispatch_ref: 'packets/dm002-current.json',
  stage_packet_ref: 'packets/dm002-current.json',
  stage_packet_refs: ['packets/dm002-current.json'],
  provider_attempt_identity: { body: 'provider admission body must not cross' },
  owner_route_currentness_basis: { body: 'currentness basis body must not cross' },
  provider_attempt_ref: 'opl://stage-attempts/sat-dm002-current',
  active_lease_ref: 'opl://stage-attempts/sat-dm002-current/leases/current/active',
  execution_authorization_ref:
    'opl://stage-attempts/sat-dm002-current/execution-authorizations/current',
  workflow_id: 'wf-dm002-current',
  task_id: 'frt-dm002-current',
};

function currentControlState() {
  return {
    surface_kind: 'opl_current_control_state',
    current_stage_attempt_id: 'sat-dm002-current',
    running_provider_attempt: true,
    reconciliation_status: 'running',
    owner_receipt_refs: ['mas://dm002/owner-receipt'],
    typed_blocker_refs: ['mas://dm002/typed-blocker'],
    stage_run_currentness_identity: identity,
    missing_stage_run_currentness_identity_fields: [],
  };
}

function stageAttemptQuery() {
  return {
    attempt: {
      stage_attempt_id: 'sat-dm002-current',
      status: 'running',
      human_gate_refs: ['mas://dm002/human-gate'],
      route_impact: {
        next_owner: 'medautoscience',
        selected_action_id: 'complete_medical_paper_readiness',
        evidence_refs: ['mas://dm002/evidence'],
        user_stage_log: { body: 'must not cross the OPL envelope' },
      },
    },
    canonical_outcome: 'blocked',
    resume_ledger: [{ signal_id: 'sig-resume-current', payload: { body: 'resume body' } }],
    domain_output: { output_ref: 'mas://dm002/domain-output', body: 'domain body' },
  };
}

test('domain task runtime context is a current body-free refs-only envelope', () => {
  const context = buildOplDomainTaskRuntimeContext({
    currentControlState: currentControlState(),
    stageAttemptQuery: stageAttemptQuery(),
  });

  assert.deepEqual(Object.keys(context), [
    'surface_kind',
    'stage_run_currentness_identity',
    'stage_attempt_id',
    'status',
    'canonical_outcome',
    'running_provider_attempt',
    'reconciliation_status',
    'provider_attempt_ref',
    'owner_receipt_refs',
    'typed_blocker_refs',
    'human_gate_refs',
    'resume_refs',
    'domain_output_ref',
    'route_impact',
    'authority_boundary',
  ]);
  assert.equal(context.provider_attempt_ref, identity.provider_attempt_ref);
  assert.deepEqual(context.resume_refs, [
    'opl://stage-attempts/sat-dm002-current/signals/sig-resume-current',
  ]);
  assert.deepEqual(context.route_impact, {
    next_owner: 'medautoscience',
    selected_action_id: 'complete_medical_paper_readiness',
    evidence_refs: ['mas://dm002/evidence'],
  });
  assert.equal(context.authority_boundary.provider_completion_is_domain_ready, false);
  assert.equal(JSON.stringify(context).includes('body'), false);
  assert.equal(JSON.stringify(context).includes('stdout'), false);
  assert.equal(JSON.stringify(context).includes('sqlite'), false);
  assert.equal(JSON.stringify(context).includes('domain_ready_verdict'), false);
});

for (const [name, patch] of [
  ['missing identity', {
    missing_stage_run_currentness_identity_fields: ['truth_epoch'],
  }],
  ['stale identity', {
    reconciliation_status: 'blocked_stale_epoch',
  }],
] as const) {
  test(`domain task runtime context fails closed for ${name}`, () => {
    assert.throws(
      () => buildOplDomainTaskRuntimeContext({
        currentControlState: { ...currentControlState(), ...patch },
        stageAttemptQuery: stageAttemptQuery(),
      }),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.match((error as Error).message, /current StageRun identity/i);
        return true;
      },
    );
  });
}

function insertTask(db: DatabaseSync, input: {
  taskId: string;
  payload: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at,
      lease_owner, lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    ) VALUES (?, 'medautoscience', 'domain_owner/default-executor-dispatch', ?, NULL, 0, 'queued',
      0, 3, 'test', 0, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `).run(input.taskId, JSON.stringify(input.payload), now, now);
}

function currentTaskPayload() {
  return {
    study_id: 'study-dm002',
    stage_id: 'domain_owner/default-executor-dispatch',
    action_type: 'complete_medical_paper_readiness',
    work_unit_id: 'publication-readiness',
    work_unit_fingerprint: 'sha256:work-unit-current',
    source_fingerprint: 'sha256:source-current',
    truth_epoch: 'truth-current',
    runtime_health_epoch: 'runtime-current',
    source_eval_id: 'source-eval-current',
    idempotency_key: 'request-current',
    route_identity_key: 'route-current',
    attempt_idempotency_key: 'attempt-current',
    dispatch_ref: 'packets/dm002-current.json',
    stage_packet_ref: 'packets/dm002-current.json',
    stage_packet_refs: ['packets/dm002-current.json'],
  };
}

function createAttempt(db: DatabaseSync, taskId: string, payload: Record<string, unknown>) {
  return createStageAttempt(db, {
    domainId: 'medautoscience',
    stageId: 'domain_owner/default-executor-dispatch',
    providerKind: 'temporal',
    workspaceLocator: {
      surface_kind: 'opl_provider_hosted_task_workspace_locator',
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      workspace_root: '/tmp/mas',
      ...payload,
    },
    sourceFingerprint: typeof payload.source_fingerprint === 'string'
      ? payload.source_fingerprint
      : undefined,
    executorKind: 'codex_cli',
    taskId,
    checkpointRefs: typeof payload.stage_packet_ref === 'string'
      ? [payload.stage_packet_ref]
      : [],
  }).attempt;
}

test('attempt query and task inspect expose the canonical runtime-context consumer readback', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const taskId = 'frt-domain-runtime-context-current';
    const payload = currentTaskPayload();
    insertTask(db, { taskId, payload });
    const attempt = createAttempt(db, taskId, payload);

    const query = queryStageAttempt(db, attempt.stage_attempt_id).stage_attempt_query;
    const inspection = inspectTask(db, taskId).task;
    const expectedRef =
      `opl://stage-attempts/${encodeURIComponent(attempt.stage_attempt_id)}/opl-runtime-context`;

    assert.equal(query.opl_runtime_context_consumer_ref, expectedRef);
    assert.equal(inspection.opl_runtime_context_consumer_ref, expectedRef);
    assert.deepEqual(inspection.opl_runtime_context, query.opl_runtime_context);
    assert.equal(query.opl_runtime_context.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(query.opl_runtime_context.authority_boundary.provider_completion_is_domain_ready, false);
    const serialized = JSON.stringify(query.opl_runtime_context);
    assert.equal(serialized.includes('stdout'), false);
    assert.equal(serialized.includes('sqlite'), false);
    assert.equal(serialized.includes('domain_ready_verdict'), false);
  } finally {
    db.close();
  }
});

test('attempt query and task inspect keep incomplete identity blocked and body-free', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const taskId = 'frt-domain-runtime-context-incomplete';
    insertTask(db, { taskId, payload: {} });
    const attempt = createAttempt(db, taskId, {});

    const query = queryStageAttempt(db, attempt.stage_attempt_id).stage_attempt_query;
    const inspection = inspectTask(db, taskId).task;
    const blockedContext = query.opl_runtime_context as {
      projection_status?: string;
      blocker_reason?: string;
      authority_boundary: { task_materialization_allowed?: boolean };
    };

    assert.equal(blockedContext.projection_status, 'blocked');
    assert.equal(blockedContext.blocker_reason, 'current_stage_run_identity_required');
    assert.equal(
      blockedContext.authority_boundary.task_materialization_allowed,
      false,
    );
    assert.deepEqual(inspection.opl_runtime_context, query.opl_runtime_context);
    const serialized = JSON.stringify(inspection.opl_runtime_context);
    assert.equal(serialized.includes('body'), false);
    assert.equal(serialized.includes('stdout'), false);
    assert.equal(serialized.includes('sqlite'), false);
  } finally {
    db.close();
  }
});
