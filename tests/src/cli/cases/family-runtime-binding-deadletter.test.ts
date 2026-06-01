import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime requeues dead-lettered MAS repair exports when nested work-unit fingerprint changes under same owner', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-nested-source-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-nested-source-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchCountPath = path.join(fixtureRoot, 'dispatch.count');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
fingerprint="$(cat ${shellSingleQuote(path.join(fixtureRoot, 'fingerprint'))})"
context_version="$(cat ${shellSingleQuote(path.join(fixtureRoot, 'context-version'))})"
cat <<JSON
{
  "surface_kind": "mas_family_domain_handler_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/repair-recheck",
      "priority": 60,
      "source": "mas-runtime-owner-route",
      "dedupe_key": "mas:dm002:repair-recheck:nested-source-fingerprint",
      "dispatch_owner": "med-autoscience",
      "owner_route_ref": "owner-route:mas/DM002/nested-source-fingerprint",
      "payload": {
        "profile": "dm-cvd.workspace.toml",
        "study_id": "002-dm-china-us-mortality-attribution",
        "repair_work_unit": {
          "work_unit_id": "unit_harmonized_validation_uncertainty_and_grouped_calibration",
          "source_fingerprint": "$fingerprint",
          "context_refs": ["context:$context_version"]
        }
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
task_path="$1"
cp "$task_path" ${shellSingleQuote(dispatchedTaskPath)}
count=0
if [ -f ${shellSingleQuote(dispatchCountPath)} ]; then
  count="$(cat ${shellSingleQuote(dispatchCountPath)})"
fi
count=$((count + 1))
printf '%s\\n' "$count" > ${shellSingleQuote(dispatchCountPath)}
if [ "$count" -le 3 ]; then
  echo "repair work-unit owner receipt missing" >&2
  exit 42
fi
cat <<'JSON'
{"accepted":true,"surface_kind":"mas_family_domain_handler_dispatch_receipt","receipt_ref":"receipt:dm002/nested-repair-redrive"}
JSON
`,
    { mode: 0o755 },
  );
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
  });
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'repair-work-unit-fingerprint-v1\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'context-version'), 'v1\n', 'utf8');
    for (let index = 0; index < 3; index += 1) {
      runCli(['family-runtime', 'tick', '--source', `dm002-repair-v1-${index}`, '--hydrate'], env);
    }
    const deadLetterQueue = runCli(['family-runtime', 'queue', 'list'], env);
    const deadLetterTask = deadLetterQueue.family_runtime_queue.tasks[0];
    assert.equal(deadLetterTask.status, 'dead_letter');
    assert.equal(deadLetterTask.attempts, 3);
    assert.equal(
      deadLetterTask.payload.repair_work_unit.source_fingerprint,
      'repair-work-unit-fingerprint-v1',
    );

    fs.writeFileSync(path.join(fixtureRoot, 'context-version'), 'v2\n', 'utf8');
    const sameFingerprint = runCli(['family-runtime', 'tick', '--source', 'dm002-repair-v1-repeat', '--hydrate'], env);
    assert.equal(sameFingerprint.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(sameFingerprint.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(sameFingerprint.family_runtime_tick.selected_count, 0);

    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'repair-work-unit-fingerprint-v2\n', 'utf8');
    const updatedFingerprint = runCli(['family-runtime', 'tick', '--source', 'dm002-repair-v2', '--hydrate'], env);
    const refreshed = runCli(['family-runtime', 'queue', 'inspect', deadLetterTask.task_id], env);
    const task = refreshed.family_runtime_task.task;
    const events = refreshed.family_runtime_task.events;
    const dispatchedTask = JSON.parse(fs.readFileSync(dispatchedTaskPath, 'utf8'));

    assert.equal(updatedFingerprint.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(updatedFingerprint.family_runtime_tick.hydration.requeued_count, 1);
    assert.equal(updatedFingerprint.family_runtime_tick.selected_count, 1);
    assert.equal(updatedFingerprint.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.attempts, 1);
    assert.equal(
      task.payload.repair_work_unit.source_fingerprint,
      'repair-work-unit-fingerprint-v2',
    );
    assert.equal(
      dispatchedTask.payload.repair_work_unit.source_fingerprint,
      'repair-work-unit-fingerprint-v2',
    );
    assert.equal(
      events.some((event: { event_type: string; payload: { reason?: string } }) =>
        event.event_type === 'task_requeued_from_dead_letter_after_domain_owner_update'
        && event.payload.reason === 'domain_export_source_fingerprint_changed_after_dead_letter'
      ),
      true,
    );
    assert.equal(fs.readFileSync(dispatchCountPath, 'utf8').trim(), '4');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime retains stale MAS paper autonomy dead letters when export fingerprints change', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-stale-paper-autonomy-state-'));
  const env = familyRuntimeEnv(stateRoot);
  const stalePayloadV1 = {
    profile: 'dm-cvd.workspace.toml',
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    repair_work_unit: {
      work_unit_id: 'unit_superseded_quality_repair_batch',
      source_fingerprint: 'stale-repair-work-unit-fingerprint-v1',
      owner: 'quality_repair_batch',
      callable_surface: 'quality_repair_batch.run_quality_repair_batch',
    },
    opl_domain_export_context: {
      owner_fingerprint: 'mas-export-owner-v1',
    },
  };
  const stalePayloadV2 = {
    ...stalePayloadV1,
    repair_work_unit: {
      ...stalePayloadV1.repair_work_unit,
      source_fingerprint: 'stale-repair-work-unit-fingerprint-v2',
    },
  };
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      JSON.stringify(stalePayloadV1),
      '--dedupe-key',
      'mas:dm003:repair-recheck:stale-owner-route',
    ], env);
    const deadLetterTask = enqueue.family_runtime_enqueue.task;
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'dead_letter',
          attempts = 3,
          last_error = ?,
          dead_letter_reason = 'retry_budget_exhausted'
        WHERE task_id = ?
      `).run('Domain dispatch failed: controller_route_work_unit_unsupported', deadLetterTask.task_id);
    } finally {
      queueDb.close();
    }

    const reenqueued = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      JSON.stringify(stalePayloadV2),
      '--dedupe-key',
      'mas:dm003:repair-recheck:stale-owner-route',
      '--source',
      'dm003-stale-repair-v2',
    ], env);
    const retained = runCli(['family-runtime', 'queue', 'inspect', deadLetterTask.task_id], env);
    const retainedTask = retained.family_runtime_task.task;

    assert.equal(reenqueued.family_runtime_enqueue.accepted, false);
    assert.equal(reenqueued.family_runtime_enqueue.idempotent_noop, true);
    assert.equal(reenqueued.family_runtime_enqueue.requeued_from_terminal, undefined);
    assert.equal(retainedTask.status, 'dead_letter');
    assert.equal(retainedTask.attempts, 3);
    assert.equal(
      retainedTask.payload.repair_work_unit.source_fingerprint,
      'stale-repair-work-unit-fingerprint-v1',
    );
    assert.equal(
      retained.family_runtime_task.events.some((event: { event_type: string; payload: { reason?: string } }) =>
        event.event_type === 'task_dead_letter_redrive_blocked_by_domain_currentness'
        && event.payload.reason === 'mas_paper_autonomy_stale_or_unsupported_owner_route'
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime still requeues current MAS paper autonomy dead letters when source fingerprints change', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-current-paper-autonomy-state-'));
  const env = familyRuntimeEnv(stateRoot);
  const payloadV1 = {
    profile: 'dm-cvd.workspace.toml',
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    repair_work_unit: {
      work_unit_id: 'unit_current_quality_repair_batch',
      source_fingerprint: 'current-repair-work-unit-fingerprint-v1',
      owner: 'quality_repair_batch',
      callable_surface: 'quality_repair_batch.run_quality_repair_batch',
    },
    opl_domain_export_context: {
      owner_fingerprint: 'mas-export-owner-v1',
    },
  };
  const payloadV2 = {
    ...payloadV1,
    repair_work_unit: {
      ...payloadV1.repair_work_unit,
      source_fingerprint: 'current-repair-work-unit-fingerprint-v2',
    },
  };
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      JSON.stringify(payloadV1),
      '--dedupe-key',
      'mas:dm003:repair-recheck:current-owner-route',
    ], env);
    const deadLetterTask = enqueue.family_runtime_enqueue.task;
    const queueDb = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      queueDb.prepare(`
        UPDATE tasks
        SET status = 'dead_letter',
          attempts = 3,
          last_error = ?,
          dead_letter_reason = 'retry_budget_exhausted'
        WHERE task_id = ?
      `).run('Domain dispatch failed: repair work-unit owner receipt missing', deadLetterTask.task_id);
    } finally {
      queueDb.close();
    }

    const reenqueued = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/repair-recheck',
      '--payload',
      JSON.stringify(payloadV2),
      '--dedupe-key',
      'mas:dm003:repair-recheck:current-owner-route',
      '--source',
      'dm003-current-repair-v2',
    ], env);
    const retained = runCli(['family-runtime', 'queue', 'inspect', deadLetterTask.task_id], env);
    const task = retained.family_runtime_task.task;

    assert.equal(reenqueued.family_runtime_enqueue.accepted, true);
    assert.equal(reenqueued.family_runtime_enqueue.requeued_from_terminal, true);
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(
      task.payload.repair_work_unit.source_fingerprint,
      'current-repair-work-unit-fingerprint-v2',
    );
    assert.equal(
      retained.family_runtime_task.events.some((event: { event_type: string; payload: { reason?: string } }) =>
        event.event_type === 'task_requeued_from_dead_letter_after_domain_owner_update'
        && event.payload.reason === 'domain_export_source_fingerprint_changed_after_dead_letter'
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
