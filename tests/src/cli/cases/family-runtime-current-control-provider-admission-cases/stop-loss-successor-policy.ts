import {
  assert,
  DatabaseSync,
  createQueueTables,
  currentControlAdmissionPayload,
  enqueueTask,
  insertQueuedTask,
  record,
  test,
} from './shared.ts';
import { parseJsonText } from '../../../../../src/kernel/json-file.ts';

function stopLossDm002Payload(input: {
  actionType?: string;
  workUnitId?: string;
  workUnitFingerprint?: string;
  sourceFingerprint?: string;
  idempotencyKey?: string;
  routeIdentityKey?: string;
  successorReason?: string;
  humanGateRef?: string;
  typedBlockerRef?: string;
}) {
  const actionType = input.actionType ?? 'run_quality_repair_batch';
  const workUnitId = input.workUnitId
    ?? 'dm002_current_publication_hardening_after_current_ai_reviewer_eval';
  const workUnitFingerprint = input.workUnitFingerprint
    ?? 'owner-route::write::manuscript_story_surface_delta_missing::run_quality_repair_batch';
  const sourceFingerprint = input.sourceFingerprint ?? workUnitFingerprint;
  const truthEpoch = 'truth-event-dm002-stop-loss';
  const runtimeHealthEpoch = 'runtime-health-dm002-stop-loss';
  const payload = currentControlAdmissionPayload(
    sourceFingerprint,
    'stop-loss',
    workUnitFingerprint,
  );
  return {
    ...payload,
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: actionType,
    next_executable_owner: 'write',
    work_unit_id: workUnitId,
    work_unit_fingerprint: workUnitFingerprint,
    action_fingerprint: workUnitFingerprint,
    source_fingerprint: sourceFingerprint,
    ...(input.successorReason ? { stop_loss_successor_reason: input.successorReason } : {}),
    ...(input.humanGateRef ? { human_gate_ref: input.humanGateRef } : {}),
    ...(input.typedBlockerRef ? { typed_blocker_ref: input.typedBlockerRef } : {}),
    owner_route_currentness_basis: {
      ...payload.owner_route_currentness_basis,
      generated_at: '2026-06-12T00:00:00+00:00',
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
      truth_epoch: truthEpoch,
      runtime_health_epoch: runtimeHealthEpoch,
      source_eval_id: 'dm002-current-ai-reviewer-eval',
      currentness_digest_basis: {
        runtime_digest: 'runtime-dm002-stop-loss',
        stable_truth_digest: 'truth-dm002-stop-loss',
        work_unit_digest: `work-unit:${workUnitFingerprint}`,
      },
    },
    provider_admission_identity: {
      ...payload.provider_admission_identity,
      status: 'provider_admission_pending',
      action_fingerprint: workUnitFingerprint,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
      source_fingerprint: sourceFingerprint,
      truth_epoch: truthEpoch,
      runtime_health_epoch: runtimeHealthEpoch,
      source_eval_id: 'dm002-current-ai-reviewer-eval',
      idempotency_key: input.idempotencyKey ?? [
        'owner-route',
        '002-dm-china-us-mortality-attribution',
        truthEpoch,
        'write',
        workUnitId,
        workUnitFingerprint,
      ].join('::'),
      route_identity_key: input.routeIdentityKey ?? [
        'owner-route',
        '002-dm-china-us-mortality-attribution',
        actionType,
        workUnitId,
        workUnitFingerprint,
      ].join('::'),
    },
  };
}

function insertBlockedStopLossTask(db: DatabaseSync, input: {
  taskId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
}) {
  insertQueuedTask(db, {
    taskId: input.taskId,
    domainId: 'medautoscience',
    taskKind: 'domain_owner/default-executor-dispatch',
    payload: input.payload,
    dedupeKey: input.dedupeKey,
  });
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked',
      last_error = 'progress_first_owner_delta_required',
      dead_letter_reason = 'anti_loop_budget_exhausted'
    WHERE task_id = ?
  `).run(input.taskId);
  db.prepare(`
    INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `event-${input.taskId}-anti-loop-stop-loss`,
    input.taskId,
    'medautoscience',
    'task_progress_first_anti_spin_blocked',
    'test-dm002-stop-loss-successor',
    JSON.stringify({
      reason: 'progress_first_owner_delta_required',
      stop_loss_state: {
        surface_kind: 'opl_current_owner_delta_stop_loss_state',
        status: 'frozen',
        terminal_blocker_code: 'anti_loop_budget_exhausted',
        successor_admission: {
          status: 'identity_different_successor_or_gate_required',
          same_work_unit_redrive_allowed: false,
          preferred_successor: {
            action_type: 'publishability_repair_sprint',
            work_unit_id: 'publishability_repair_sprint_after_anti_loop_budget_exhausted',
          },
          stable_operator_gate: {
            gate_kind: 'operator_or_human_decision_required',
          },
        },
      },
      stop_loss_policy: {
        surface_kind: 'opl_stop_loss_policy',
        schema_version: 'stop-loss-policy.v1',
        terminal_blocker_code: 'anti_loop_budget_exhausted',
        successor_policy: {
          same_work_unit_redrive_allowed: false,
          identity_different_successor_allowed: true,
          default_successor_action_type: 'publishability_repair_sprint',
          default_successor_work_unit_id: 'publishability_repair_sprint_after_anti_loop_budget_exhausted',
          stable_operator_gate_allowed: true,
        },
      },
    }),
    new Date().toISOString(),
  );
}

test('family-runtime enqueue keeps anti-loop stop-loss same work-unit redrive blocked', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'owner-route::002-dm-china-us-mortality-attribution::current-control-admission';
    const payload = stopLossDm002Payload({});
    insertBlockedStopLossTask(db, {
      taskId: 'task-dm002-stop-loss-same-lineage',
      dedupeKey,
      payload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...payload,
        provider_admission_identity: {
          ...record(payload.provider_admission_identity),
          idempotency_key: 'owner-route::dm002::attempted-redrive-same-lineage',
        },
      },
      dedupeKey,
      source: 'test-dm002-stop-loss-successor',
    });
    const task = db.prepare('SELECT status, dead_letter_reason, payload_json FROM tasks WHERE task_id = ?').get(
      'task-dm002-stop-loss-same-lineage',
    ) as { status: string; dead_letter_reason: string | null; payload_json: string };
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_stop_loss_successor_admission_blocked'
      LIMIT 1
    `).get('task-dm002-stop-loss-same-lineage') as { payload_json: string } | undefined;
    const eventPayload = event ? parseJsonText(event.payload_json) as any : null;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.status, 'blocked');
    assert.equal(task.status, 'blocked');
    assert.equal(task.dead_letter_reason, 'anti_loop_budget_exhausted');
    assert.deepEqual(parseJsonText(task.payload_json), payload);
    assert.ok(eventPayload);
    assert.equal(eventPayload.reason, 'anti_loop_stop_loss_same_work_unit_redrive_blocked');
    assert.equal(eventPayload.same_work_unit_redrive_allowed, false);
    assert.equal(eventPayload.terminal_blocker_code, 'anti_loop_budget_exhausted');
    assert.equal(eventPayload.previous_currentness_identity.work_unit_id, payload.work_unit_id);
    assert.equal(eventPayload.next_currentness_identity.work_unit_id, payload.work_unit_id);
    assert.equal(
      eventPayload.next_required_route,
      'identity_different_publishability_repair_sprint_or_typed_blocker_or_human_gate',
    );
  } finally {
    db.close();
  }
});

test('family-runtime enqueue releases same-lineage stop-loss when MAS domain progress evidence is present', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::write-repair-current';
    const payload = stopLossDm002Payload({
      workUnitId: 'medical_prose_write_repair',
      workUnitFingerprint: 'publication-blockers::0915410f804b3697',
      sourceFingerprint: 'publication-blockers::0915410f804b3697',
    });
    const progressPayload = {
      ...payload,
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      provider_attempt_or_lease_required: true,
      domain_progress_refs: [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller/repair_execution_evidence/latest.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller/repair_execution_receipts/latest.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/paper/draft.md',
      ],
      provider_admission_identity: {
        ...record(payload.provider_admission_identity),
        route_identity_key: dedupeKey,
        idempotency_key: dedupeKey,
      },
    };
    insertBlockedStopLossTask(db, {
      taskId: 'task-dm003-stop-loss-same-lineage-domain-progress',
      dedupeKey,
      payload: progressPayload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: progressPayload,
      dedupeKey,
      source: 'test-dm003-stop-loss-domain-progress',
    });
    const task = db.prepare('SELECT status, dead_letter_reason, payload_json FROM tasks WHERE task_id = ?').get(
      'task-dm003-stop-loss-same-lineage-domain-progress',
    ) as { status: string; dead_letter_reason: string | null; payload_json: string };
    const releasedEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_stop_loss_same_lineage_domain_progress_released'
      LIMIT 1
    `).get('task-dm003-stop-loss-same-lineage-domain-progress') as { payload_json: string } | undefined;
    const blockedEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_stop_loss_successor_admission_blocked'
      LIMIT 1
    `).get('task-dm003-stop-loss-same-lineage-domain-progress') as { payload_json: string } | undefined;
    const eventPayload = releasedEvent ? parseJsonText(releasedEvent.payload_json) as any : null;

    assert.equal(result.accepted, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.dead_letter_reason, null);
    assert.ok(releasedEvent);
    assert.equal(blockedEvent, undefined);
    assert.equal(eventPayload.reason, 'anti_loop_stop_loss_same_lineage_domain_progress_observed');
    assert.equal(eventPayload.same_work_unit_redrive_allowed, true);
    assert.deepEqual(eventPayload.domain_progress_refs, progressPayload.domain_progress_refs);
    assert.equal(eventPayload.authority_boundary.can_write_domain_truth, false);
  } finally {
    db.close();
  }
});

test('family-runtime enqueue preserves same-lineage typed blocker as legal anti-loop stop-loss terminal path', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'owner-route::002-dm-china-us-mortality-attribution::current-control-admission';
    const payload = stopLossDm002Payload({});
    const typedBlockerRef = [
      'mas-domain-dispatch-typed-blocker:medautoscience',
      'domain_owner-default-executor-dispatch:002-dm-china-us-mortality-attribution',
      'anti-loop-budget-exhausted-successor',
      'publication-hardening-requires-owner-answer',
    ].join(':');
    insertBlockedStopLossTask(db, {
      taskId: 'task-dm002-stop-loss-same-lineage-typed-blocker',
      dedupeKey,
      payload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: stopLossDm002Payload({
        successorReason: 'single_typed_blocker',
        typedBlockerRef,
      }),
      dedupeKey,
      source: 'test-dm002-stop-loss-successor',
    });
    const task = db.prepare('SELECT status, dead_letter_reason, payload_json FROM tasks WHERE task_id = ?').get(
      'task-dm002-stop-loss-same-lineage-typed-blocker',
    ) as { status: string; dead_letter_reason: string | null; payload_json: string };
    const terminalEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_stop_loss_terminal_path_observed'
      LIMIT 1
    `).get('task-dm002-stop-loss-same-lineage-typed-blocker') as { payload_json: string } | undefined;
    const blockedEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_stop_loss_successor_admission_blocked'
      LIMIT 1
    `).get('task-dm002-stop-loss-same-lineage-typed-blocker') as { payload_json: string } | undefined;
    const eventPayload = terminalEvent ? parseJsonText(terminalEvent.payload_json) as any : null;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.status, 'blocked');
    assert.equal(task.status, 'blocked');
    assert.equal(task.dead_letter_reason, 'anti_loop_budget_exhausted');
    assert.deepEqual(parseJsonText(task.payload_json), payload);
    assert.ok(terminalEvent);
    assert.equal(blockedEvent, undefined);
    assert.equal(eventPayload.reason, 'anti_loop_stop_loss_terminal_path_observed');
    assert.equal(eventPayload.legal_terminal_path, 'single_typed_blocker');
    assert.equal(eventPayload.successor_route_reason, 'single_typed_blocker');
    assert.deepEqual(eventPayload.typed_blocker_refs, [typedBlockerRef]);
    assert.equal(eventPayload.same_work_unit_redrive_allowed, false);
    assert.equal(eventPayload.next_required_route, 'terminal_path_observed_no_default_redrive');
    assert.equal(eventPayload.authority_boundary.can_create_typed_blocker, false);
    assert.equal(eventPayload.authority_boundary.can_write_domain_truth, false);
  } finally {
    db.close();
  }
});

test('family-runtime enqueue admits identity-different anti-loop stop-loss successor with route reason', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const blockedDedupeKey = 'owner-route::002-dm-china-us-mortality-attribution::current-control-admission';
    const blockedPayload = stopLossDm002Payload({});
    const successorPayload = stopLossDm002Payload({
      actionType: 'publishability_repair_sprint',
      workUnitId: 'publishability_repair_sprint_after_anti_loop_budget_exhausted',
      workUnitFingerprint:
        'publishability_repair_sprint_after_anti_loop_budget_exhausted::anti_loop_budget_exhausted::002-dm-china-us-mortality-attribution',
      sourceFingerprint:
        'anti-loop-successor:medautoscience:002-dm-china-us-mortality-attribution:publishability_repair_sprint:anti_loop_budget_exhausted:owner-route::write::manuscript_story_surface_delta_missing::run_quality_repair_batch',
      idempotencyKey:
        'owner-route::002-dm-china-us-mortality-attribution::truth-event-dm002-stop-loss::write::publishability_repair_sprint_after_anti_loop_budget_exhausted::successor',
      routeIdentityKey:
        'owner-route::002-dm-china-us-mortality-attribution::publishability_repair_sprint::publishability_repair_sprint_after_anti_loop_budget_exhausted',
      successorReason: 'anti_loop_budget_exhausted_successor',
    });
    insertBlockedStopLossTask(db, {
      taskId: 'task-dm002-stop-loss-exhausted-lineage',
      dedupeKey: blockedDedupeKey,
      payload: blockedPayload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: successorPayload,
      dedupeKey:
        'owner-route::002-dm-china-us-mortality-attribution::publishability-repair-sprint-after-stop-loss',
      source: 'test-dm002-stop-loss-successor',
    });
    const row = db.prepare('SELECT task_id, status, payload_json FROM tasks WHERE dedupe_key = ?').get(
      'owner-route::002-dm-china-us-mortality-attribution::publishability-repair-sprint-after-stop-loss',
    ) as { task_id: string; status: string; payload_json: string };
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_stop_loss_successor_admitted'
      LIMIT 1
    `).get(row.task_id) as { payload_json: string } | undefined;
    const payload = parseJsonText(row.payload_json) as any;
    const eventPayload = event ? parseJsonText(event.payload_json) as any : null;

    assert.equal(result.accepted, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(row.status, 'queued');
    assert.equal(payload.action_type, 'publishability_repair_sprint');
    assert.equal(
      payload.work_unit_id,
      'publishability_repair_sprint_after_anti_loop_budget_exhausted',
    );
    assert.equal(
      payload.provider_admission_identity.idempotency_key,
      'owner-route::002-dm-china-us-mortality-attribution::truth-event-dm002-stop-loss::write::publishability_repair_sprint_after_anti_loop_budget_exhausted::successor',
    );
    assert.equal(
      payload.provider_admission_identity.route_identity_key,
      'owner-route::002-dm-china-us-mortality-attribution::publishability_repair_sprint::publishability_repair_sprint_after_anti_loop_budget_exhausted',
    );
    assert.ok(eventPayload);
    assert.equal(eventPayload.reason, 'anti_loop_stop_loss_identity_different_successor_admitted');
    assert.equal(eventPayload.successor_route_reason, 'anti_loop_budget_exhausted_successor');
    assert.equal(eventPayload.previous_stop_loss_task_id, 'task-dm002-stop-loss-exhausted-lineage');
    assert.equal(eventPayload.previous_currentness_identity.action_type, 'run_quality_repair_batch');
    assert.equal(eventPayload.next_currentness_identity.action_type, 'publishability_repair_sprint');
    assert.equal(eventPayload.identity_difference.action_type, true);
    assert.equal(eventPayload.identity_difference.work_unit_id, true);
    assert.equal(eventPayload.identity_difference.work_unit_fingerprint, true);
    assert.equal(eventPayload.identity_difference.source_fingerprint, true);
    assert.equal(eventPayload.same_work_unit_redrive_allowed, false);
    assert.equal(eventPayload.authority_boundary.can_create_typed_blocker, false);
    assert.equal(eventPayload.authority_boundary.can_claim_publication_ready, false);
  } finally {
    db.close();
  }
});

test('family-runtime enqueue preserves human gate as legal anti-loop stop-loss terminal path', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const blockedDedupeKey = 'owner-route::002-dm-china-us-mortality-attribution::current-control-admission';
    const blockedPayload = stopLossDm002Payload({});
    const humanGatePayload = stopLossDm002Payload({
      actionType: 'publishability_repair_sprint',
      workUnitId: 'publishability_repair_sprint_after_anti_loop_budget_exhausted',
      workUnitFingerprint: 'dm002-stop-loss-human-gate',
      sourceFingerprint: 'dm002-stop-loss-human-gate-source',
      successorReason: 'human_or_operator_gate',
      humanGateRef: 'human-gate:dm002-stop-loss-successor',
    });
    insertBlockedStopLossTask(db, {
      taskId: 'task-dm002-stop-loss-human-gate-lineage',
      dedupeKey: blockedDedupeKey,
      payload: blockedPayload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: humanGatePayload,
      dedupeKey: 'owner-route::002-dm-china-us-mortality-attribution::human-gate-after-stop-loss',
      source: 'test-dm002-stop-loss-successor',
      requiresApproval: true,
    });
    const row = db.prepare('SELECT task_id, status, requires_approval, last_error FROM tasks WHERE dedupe_key = ?').get(
      'owner-route::002-dm-china-us-mortality-attribution::human-gate-after-stop-loss',
    ) as { task_id: string; status: string; requires_approval: number; last_error: string | null };
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_stop_loss_successor_admitted'
      LIMIT 1
    `).get(row.task_id) as { payload_json: string } | undefined;
    const eventPayload = event ? parseJsonText(event.payload_json) as any : null;

    assert.equal(result.accepted, true);
    assert.equal(result.task?.status, 'waiting_approval');
    assert.equal(row.status, 'waiting_approval');
    assert.equal(row.requires_approval, 1);
    assert.equal(row.last_error, null);
    assert.ok(eventPayload);
    assert.equal(eventPayload.successor_route_reason, 'human_or_operator_gate');
    assert.equal(eventPayload.legal_terminal_path, 'human_or_operator_gate');
    assert.equal(eventPayload.human_gate_ref, 'human-gate:dm002-stop-loss-successor');
    assert.equal(eventPayload.authority_boundary.can_write_domain_truth, false);
  } finally {
    db.close();
  }
});
