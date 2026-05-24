import {
  assert,
  createDispatchFixture,
  familyRuntimeEnv,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import { DatabaseSync } from 'node:sqlite';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';

function createQueueTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE tasks (
      task_id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      task_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      dedupe_key TEXT UNIQUE,
      priority INTEGER NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      source TEXT NOT NULL,
      requires_approval INTEGER NOT NULL,
      approved_at TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      last_error TEXT,
      dead_letter_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE events (
      event_id TEXT PRIMARY KEY,
      task_id TEXT,
      domain_id TEXT,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE notifications (
      notification_id TEXT PRIMARY KEY,
      task_id TEXT,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function insertSucceededTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    domainId: string;
    taskKind: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
  },
) {
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    input.domainId,
    input.taskKind,
    JSON.stringify(input.payload),
    input.dedupeKey,
    0,
    'succeeded',
    0,
    3,
    'test',
    0,
    null,
    null,
    null,
    null,
    null,
    createdAt,
    createdAt,
  );
}

function defaultExecutorPayload(sourceFingerprint: string) {
  return {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'run_quality_repair_batch',
    dispatch_authority: 'quality_repair_batch_writer_handoff',
    next_executable_owner: 'write',
    executor_kind: 'codex_cli_default',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    workspace_root: '/tmp/explicit-workspace-root',
    source_fingerprint: sourceFingerprint,
  };
}

test('family-runtime admits MAS AI reviewer default executor dispatch without domain truth authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-ai-reviewer-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
payload = task["payload"]
assert task["task_kind"] == "domain_owner/default-executor-dispatch"
assert payload["action_type"] == "return_to_ai_reviewer_workflow"
assert payload["next_executable_owner"] == "ai_reviewer"
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_sidecar_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "will_start_llm_worker": True,
    "dispatch": {
        "execution_policy": "opl_default_executor_stage_attempt_admission",
        "result": {
            "surface": "default_executor_dispatch_request_admission",
            "status": "admitted",
            "next_owner": "ai_reviewer",
            "dispatch_ref": payload["dispatch_ref"]
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json';
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd.profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        next_executable_owner: 'ai_reviewer',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
        domain_owner: 'ai_reviewer',
        source_fingerprint: 'truth-snapshot::085b4164f248a2f4c92bf66b',
        workspace_root: '/tmp/explicit-workspace-root',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:ai-reviewer',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.domain_id, 'medautoscience');
    assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/explicit-workspace-root');
    assert.equal(attempt.workspace_locator.action_type, 'return_to_ai_reviewer_workflow');
    assert.equal(attempt.workspace_locator.dispatch_authority, 'ai_reviewer_record_production_handoff');
    assert.equal(attempt.workspace_locator.dispatch_ref, dispatchRef);
    assert.equal(attempt.workspace_locator.next_executable_owner, 'ai_reviewer');
    assert.equal(attempt.workspace_locator.domain_truth_owner, 'med-autoscience');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_artifact_gate, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
    assert.equal(attempt.workspace_locator.domain_source_fingerprint, 'truth-snapshot::085b4164f248a2f4c92bf66b');
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not auto-requeue succeeded MAS default executor dispatch from domain export updates', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:auto-requeue-guard';
    const basePayload = defaultExecutorPayload('source-before');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-provider-admission',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: basePayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        source_fingerprint: 'source-after',
        owner_route_work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-provider-admission',
    ) as { status: string; payload_json: string };
    const requeueEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'task_requeued_from_domain_export_update'",
    ).get('task-mas-default-succeeded-provider-admission') as { count: number };

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(JSON.parse(task.payload_json).source_fingerprint, 'source-before');
    assert.equal(requeueEvents.count, 0);
  } finally {
    db.close();
  }
});

test('family-runtime refreshes refs-only evidence payloads on succeeded MAS default executor dispatches', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:evidence-payload-refresh';
    const basePayload = defaultExecutorPayload('source-current');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-provider-admission-evidence-payload',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: basePayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        domain_dispatch_evidence_record_payload: {
          surface_kind: 'mas_domain_dispatch_evidence_record_payload',
          record_payload: {
            domain_id: 'medautoscience',
            task_kind: 'domain_owner/default-executor-dispatch',
            study_id: '002-dm-china-us-mortality-attribution',
            domain_source_fingerprint: 'source-current',
            typed_blocker_refs: ['mas-typed-blocker:DM002'],
            no_regression_refs: ['mas-no-forbidden-write:DM002'],
            evidence_refs: ['dispatch.json'],
          },
        },
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-provider-admission-evidence-payload',
    ) as { status: string; payload_json: string };
    const payload = JSON.parse(task.payload_json);
    const requeueEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'task_requeued_from_domain_export_update'",
    ).get('task-mas-default-succeeded-provider-admission-evidence-payload') as { count: number };

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(payload.domain_dispatch_evidence_record_payload.surface_kind, 'mas_domain_dispatch_evidence_record_payload');
    assert.deepEqual(
      payload.domain_dispatch_evidence_record_payload.record_payload.typed_blocker_refs,
      ['mas-typed-blocker:DM002'],
    );
    assert.equal(requeueEvents.count, 0);
  } finally {
    db.close();
  }
});

test('family-runtime still requeues generic succeeded tasks when domain export changes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mag:generic:succeeded:export-update';
    insertSucceededTask(db, {
      taskId: 'task-generic-succeeded-export-update',
      domainId: 'medautogrant',
      taskKind: 'user-loop/wakeup',
      payload: { workspace_root: '/tmp/mag', source_fingerprint: 'source-before' },
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautogrant',
      taskKind: 'user-loop/wakeup',
      payload: { workspace_root: '/tmp/mag', source_fingerprint: 'source-after' },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-generic-succeeded-export-update',
    ) as { status: string; payload_json: string };

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(task.status, 'queued');
    assert.equal(JSON.parse(task.payload_json).source_fingerprint, 'source-after');
  } finally {
    db.close();
  }
});

test('family-runtime blocks MAS default executor dispatch when Temporal cannot start Codex writer attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "domain_owner/default-executor-dispatch"
payload = task["payload"]
assert payload["study_id"] == "002-dm-china-us-mortality-attribution"
assert payload["dispatch_ref"].endswith("default_executor_dispatches/run_quality_repair_batch.json")
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_sidecar_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "will_start_llm_worker": True,
    "dispatch": {
        "execution_policy": "opl_default_executor_stage_attempt_admission",
        "result": {
            "surface": "default_executor_dispatch_request_admission",
            "status": "admitted",
            "next_owner": "write",
            "dispatch_ref": payload["dispatch_ref"]
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd.profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        source_refs: [
          {
            role: 'default_executor_dispatch_request',
            ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
            exists: true,
            body_included: false,
          },
        ],
        workspace_root: '/tmp/explicit-workspace-root',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.domain_id, 'medautoscience');
    assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.task_id, taskId);
    assert.equal(attempt.status, 'blocked');
    assert.match(attempt.blocked_reason, /OPL_TEMPORAL_ADDRESS/);
    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/explicit-workspace-root');
    assert.equal(attempt.workspace_locator.dispatch_ref, 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json');
    assert.equal(attempt.workspace_locator.next_executable_owner, 'write');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
    assert.deepEqual(attempt.checkpoint_refs, [
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime derives MAS default executor workspace root from profile when payload omits workspace_root', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-root-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_sidecar_dispatch_receipt",
  "dispatch": {
    "action_type": "default_executor_dispatch_request",
    "result": {"status": "admitted"}
  }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:profile-root',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/dm-cvd');
    assert.equal(attempt.workspace_locator.domain_truth_owner, 'med-autoscience');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime redrives MAS default executor dispatch with changed source fingerprint', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-redrive-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_sidecar_dispatch_receipt",
  "dispatch": {
    "execution_policy": "opl_default_executor_stage_attempt_admission",
    "result": {"status": "admitted"}
  }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:redrive';
    const basePayload = {
      profile: '/tmp/dm-cvd.profile.toml',
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      action_type: 'run_quality_repair_batch',
      dispatch_authority: 'quality_repair_batch_writer_handoff',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      dispatch_ref: dispatchRef,
      authority_boundary: 'mas_default_executor_dispatch_request_only',
      workspace_root: '/tmp/explicit-workspace-root',
      source_fingerprint: 'source-before',
    };
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify(basePayload),
      '--dedupe-key',
      dedupeKey,
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const firstAttempt = blockedTask.family_runtime_task.stage_attempts[0];

    assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(blockedTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(firstAttempt.status, 'blocked');

    const redrive = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        ...basePayload,
        source_fingerprint: 'source-after',
      }),
      '--dedupe-key',
      dedupeKey,
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    runCli(['family-runtime', 'tick', '--source', 'test-redrive'], env);
    const afterTickTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = afterTickTask.family_runtime_task.stage_attempts;
    const sourceFingerprints = attempts.map((attempt: { source_fingerprint: string }) => attempt.source_fingerprint);
    const snapshot = runCli(['runtime', 'snapshot'], env).runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.evidence_attempts.find(
      (attempt: { task_id?: string }) => attempt.task_id === taskId,
    );

    assert.equal(redrive.family_runtime_enqueue.requeued_from_terminal, true);
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.status, 'blocked');
    assert.equal(afterTickTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(attempts.length, 2);
    assert.notEqual(sourceFingerprints[0], sourceFingerprints[1]);
    assert.equal(sourceFingerprints.every((fingerprint: string) => fingerprint.startsWith('mas_default_executor_source_')), true);
    assert.equal(workbenchAttempt.workspace_locator.domain_source_fingerprint, 'source-after');
    assert.equal(
      afterTickTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_requeued_from_blocked_after_domain_owner_update'
        && event.payload.reason === 'mas_default_executor_source_fingerprint_changed_after_blocked'
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive reruns blocked MAS default executor provider transport without source changes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-operator-redrive-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_sidecar_dispatch_receipt",
  "dispatch": {
    "execution_policy": "opl_default_executor_stage_attempt_admission",
    "result": {"status": "admitted"}
  }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const payload = {
      profile: '/tmp/dm-cvd.profile.toml',
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      action_type: 'run_quality_repair_batch',
      dispatch_authority: 'quality_repair_batch_writer_handoff',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      dispatch_ref: dispatchRef,
      authority_boundary: 'mas_default_executor_dispatch_request_only',
      workspace_root: '/tmp/explicit-workspace-root',
      source_fingerprint: 'source-stable',
    };
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify(payload),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:operator-redrive',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const firstAttempt = blockedTask.family_runtime_task.stage_attempts[0];

    assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(blockedTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(firstAttempt.status, 'blocked');

    const redrive = runCli([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'provider_runtime_fixed_after_closeout_ingestion_patch',
      '--source',
      'test-redrive',
    ], env);
    const redrivenTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    runCli(['family-runtime', 'tick', '--source', 'test-after-redrive'], env);
    const afterTickTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempts = afterTickTask.family_runtime_task.stage_attempts;
    const sourceFingerprints = attempts.map((attempt: { source_fingerprint: string }) => attempt.source_fingerprint);

    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'queued');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'queued');
    assert.equal(redrivenTask.family_runtime_task.task.status, 'queued');
    assert.equal(afterTickTask.family_runtime_task.task.status, 'blocked');
    assert.equal(afterTickTask.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(attempts.length, 2);
    assert.deepEqual([...new Set(sourceFingerprints)].length, 1);
    assert.equal(sourceFingerprints[0].startsWith('mas_default_executor_source_'), true);
    assert.equal(
      afterTickTask.family_runtime_task.events.some((event: { event_type: string; payload: Record<string, unknown> }) => (
        event.event_type === 'task_operator_redrive_from_blocked_provider_transport'
        && event.payload.source_fingerprint_changed === false
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
      )),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime operator redrive rejects non-default-executor blocked tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-redrive-reject-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'artifact/override',
      '--payload',
      '{"domain_truth_write":true}',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const failure = runCliFailure([
      'family-runtime',
      'queue',
      'redrive',
      taskId,
      '--reason',
      'operator_must_not_redrive_domain_truth_write',
    ], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.equal(failure.payload.error.details.blocker_id, 'family_runtime_redrive_blocked');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'domain_forbidden_write');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
