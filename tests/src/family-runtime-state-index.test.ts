import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { runCli } from './cli/helpers/runner.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  createFamilyRuntimeQueueTables,
  insertEvent,
} from '../../src/adapters/execution/family-runtime-store.ts';
import { pruneRuntimeQueueHistory } from '../../src/adapters/execution/family-runtime-queue-retention.ts';
import { createStageAttempt } from '../../src/adapters/execution/family-runtime-stage-attempts.ts';

function withTempState<T>(fn: (root: string) => T) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-index-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function tableNames(dbPath: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return (db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all() as Array<{ name: string }>).map((row) => row.name);
  } finally {
    db.close();
  }
}

function tableCount(dbPath: string, table: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  } finally {
    db.close();
  }
}

function tableValue<T>(dbPath: string, query: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(query).get() as T;
  } finally {
    db.close();
  }
}

function writeJson(file: string, payload: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

test('opl index rebuild materializes refs-only SQLite sidecar databases', () => {
  withTempState((root) => {
    const rebuilt = runCli(['index', 'rebuild', '--domain', 'medautoscience'], { OPL_STATE_DIR: root });
    const index = rebuilt.state_index;

    assert.equal(index.surface_kind, 'opl_state_index_kernel');
    assert.equal(index.action, 'rebuild');
    assert.equal(index.status, 'ready');
    assert.equal(index.summary.database_count, 4);
    assert.equal(index.summary.ready_database_count, 4);
    assert.equal(index.authority_boundary.sqlite_sidecar_source_of_truth, false);
    assert.equal(index.authority_boundary.stores_artifact_body, false);
    assert.equal(index.authority_boundary.sqlite_record_counts_as_stage_complete, false);
    const stageAttemptIndex = index.databases.find(
      (database: { database_id: string }) => database.database_id === 'stage_attempt_index',
    );
    assert.deepEqual(stageAttemptIndex?.owned_tables, [
      'tasks',
      'events',
      'notifications',
      'stage_attempts',
      'stage_quality_cycles',
      'stage_run_launches',
    ]);
    assert.deepEqual(stageAttemptIndex?.missing_tables, []);

    const runtimeRoot = path.join(root, 'family-runtime');
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'queue.sqlite')), true);
    assert.equal(tableNames(path.join(runtimeRoot, 'queue.sqlite')).includes('queue_holds'), false);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'lifecycle-index.sqlite')), true);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'artifact-index.sqlite')), true);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'read-model.sqlite')), true);
    assert.equal(tableNames(path.join(runtimeRoot, 'artifact-index.sqlite')).includes('artifact_refs'), true);
    assert.equal(tableNames(path.join(runtimeRoot, 'read-model.sqlite')).includes('owner_route_index'), true);
    assert.equal(index.stage_artifact_projection.scanned_attempt_count, 0);
  });
});

test('opl index rebuild projects Stage Folder refs into artifact and read-model sidecars', () => {
  withTempState((root) => {
    const opened = runCli(
      [
        'stage',
        'open',
        '--domain',
        'redcube_ai',
        '--program',
        'program-a',
        '--topic',
        'topic-a',
        '--deliverable',
        'deck-a',
        '--stage',
        'artifact_creation',
        '--stage-order',
        '4',
        '--attempt',
        'attempt-a',
      ],
      { OPL_STATE_DIR: root },
    ).stage_artifact_runtime as {
      attempt_workspace: { outputs_dir: string; receipts_dir: string };
    };
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'deck.png'), 'png');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'owner.json'), {
      receipt_ref: 'rca-owner-receipt:deck-a',
    });
    runCli(
      [
        'stage',
        'commit',
        '--domain',
        'redcube_ai',
        '--program',
        'program-a',
        '--topic',
        'topic-a',
        '--deliverable',
        'deck-a',
        '--stage',
        'artifact_creation',
        '--attempt',
        'attempt-a',
        '--terminal-status',
        'success',
        '--required-output',
        'deck.png',
        '--owner-receipt-ref',
        'rca-owner-receipt:deck-a',
      ],
      { OPL_STATE_DIR: root },
    );

    const rebuilt = runCli(['index', 'rebuild', '--domain', 'redcube_ai'], { OPL_STATE_DIR: root }).state_index;
    const runtimeRoot = path.join(root, 'family-runtime');
    const artifactDb = path.join(runtimeRoot, 'artifact-index.sqlite');
    const readModelDb = path.join(runtimeRoot, 'read-model.sqlite');

    assert.equal(rebuilt.status, 'ready');
    assert.equal(rebuilt.stage_artifact_projection.scanned_attempt_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.scanned_deliverable_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.manifest_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.artifact_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.receipt_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.operator_read_model_rows.artifact_drilldown_rows, 1);
    assert.equal(tableCount(artifactDb, 'manifest_index'), 1);
    assert.equal(tableCount(artifactDb, 'artifact_refs'), 1);
    assert.equal(tableCount(artifactDb, 'receipt_refs'), 1);
    assert.equal(tableCount(readModelDb, 'artifact_drilldown'), 1);
    assert.equal(tableCount(readModelDb, 'owner_route_index'), 1);

    const manifestRow = tableValue<{ domain_id: string; stage_id: string; receipt_ref: string }>(
      artifactDb,
      'SELECT domain_id, stage_id, receipt_ref FROM manifest_index',
    );
    assert.deepEqual({ ...manifestRow }, {
      domain_id: 'redcube_ai',
      stage_id: 'artifact_creation',
      receipt_ref: 'rca-owner-receipt:deck-a',
    });
    const artifactRow = tableValue<{ locator_json: string }>(artifactDb, 'SELECT locator_json FROM artifact_refs');
    assert.equal(
      (parseJsonText(artifactRow.locator_json) as { output_ref_kind?: string }).output_ref_kind,
      'physical_file_ref',
    );
    const drilldownRow = tableValue<{ drilldown_json_ref: string }>(
      readModelDb,
      'SELECT drilldown_json_ref FROM artifact_drilldown',
    );
    assert.equal(
      (parseJsonText(drilldownRow.drilldown_json_ref) as { artifact_body_access?: boolean }).artifact_body_access,
      false,
    );
  });
});

test('opl index rebuild projects medautoscience Stage Folder refs with normalized domain filter', () => {
  withTempState((root) => {
    const opened = runCli(
      [
        'stage',
        'open',
        '--domain',
        'medautoscience',
        '--program',
        'state-index-canary',
        '--topic',
        'dm-cvd',
        '--deliverable',
        'dm002-runtime-state-index',
        '--stage',
        'runtime_storage_refs',
        '--stage-order',
        '1',
        '--attempt',
        'canary-2026-06-04',
      ],
      { OPL_STATE_DIR: root },
    ).stage_artifact_runtime as {
      attempt_workspace: { outputs_dir: string; receipts_dir: string };
    };
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'restore_proof_canary.json'), '{}');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'mas-owner.json'), {
      receipt_ref: 'mas-runtime-storage-restore-proof-canary:dm002:20260604T015617Z',
    });
    runCli(
      [
        'stage',
        'commit',
        '--domain',
        'medautoscience',
        '--program',
        'state-index-canary',
        '--topic',
        'dm-cvd',
        '--deliverable',
        'dm002-runtime-state-index',
        '--stage',
        'runtime_storage_refs',
        '--attempt',
        'canary-2026-06-04',
        '--terminal-status',
        'success',
        '--required-output',
        'restore_proof_canary.json',
        '--owner-receipt-ref',
        'mas-runtime-storage-restore-proof-canary:dm002:20260604T015617Z',
      ],
      { OPL_STATE_DIR: root },
    );

    const rebuilt = runCli(['index', 'rebuild', '--domain', 'med-autoscience'], { OPL_STATE_DIR: root }).state_index;
    const runtimeRoot = path.join(root, 'family-runtime');
    const artifactDb = path.join(runtimeRoot, 'artifact-index.sqlite');
    const readModelDb = path.join(runtimeRoot, 'read-model.sqlite');

    assert.equal(rebuilt.status, 'ready');
    assert.equal(rebuilt.stage_artifact_projection.filtered_domain_id, 'med-autoscience');
    assert.equal(rebuilt.stage_artifact_projection.scanned_attempt_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.scanned_deliverable_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.current_pointer_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.manifest_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.artifact_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.receipt_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.operator_read_model_rows.artifact_drilldown_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.operator_read_model_rows.owner_route_rows, 1);
    assert.equal(tableCount(artifactDb, 'manifest_index'), 1);
    assert.equal(tableCount(artifactDb, 'stage_current_pointers'), 1);
    assert.equal(tableCount(readModelDb, 'owner_route_index'), 1);

    const currentPointerRow = tableValue<{ payload_ref_json: string }>(
      artifactDb,
      'SELECT payload_ref_json FROM stage_current_pointers',
    );
    const currentPointerPayload = parseJsonText(currentPointerRow.payload_ref_json) as {
      pointer_role?: string;
      stage_run_current_pointer?: boolean;
      stage_run_terminal_state?: boolean;
      current_owner_delta?: boolean;
    };
    assert.equal(
      currentPointerPayload.pointer_role,
      'artifact_attempt_pointer_not_stage_run_current_pointer',
    );
    assert.equal(currentPointerPayload.stage_run_current_pointer, false);
    assert.equal(currentPointerPayload.stage_run_terminal_state, false);
    assert.equal(currentPointerPayload.current_owner_delta, false);
    const ownerRouteRow = tableValue<{ route_json_ref: string }>(
      readModelDb,
      'SELECT route_json_ref FROM owner_route_index',
    );
    const ownerRoutePayload = parseJsonText(ownerRouteRow.route_json_ref) as {
      pointer_role?: string;
      stage_run_current_pointer?: boolean;
      stage_run_terminal_state?: boolean;
      current_owner_delta?: boolean;
    };
    assert.equal(
      ownerRoutePayload.pointer_role,
      'artifact_attempt_pointer_not_stage_run_current_pointer',
    );
    assert.equal(ownerRoutePayload.stage_run_current_pointer, false);
    assert.equal(ownerRoutePayload.stage_run_terminal_state, false);
    assert.equal(ownerRoutePayload.current_owner_delta, false);

    const manifestRow = tableValue<{ domain_id: string; stage_id: string; receipt_ref: string }>(
      artifactDb,
      'SELECT domain_id, stage_id, receipt_ref FROM manifest_index',
    );
    assert.deepEqual({ ...manifestRow }, {
      domain_id: 'medautoscience',
      stage_id: 'runtime_storage_refs',
      receipt_ref: 'mas-runtime-storage-restore-proof-canary:dm002:20260604T015617Z',
    });
  });
});

test('opl index doctor reports missing sidecar databases before rebuild', () => {
  withTempState((root) => {
    const doctor = runCli(['index', 'doctor'], { OPL_STATE_DIR: root }).state_index;

    assert.equal(doctor.action, 'doctor');
    assert.equal(doctor.status, 'degraded');
    assert.equal(doctor.summary.missing_database_count, 4);
    assert.equal(doctor.summary.maintenance_run_ref, null);
    assert.deepEqual(
      doctor.databases.map((database: { status: string }) => database.status),
      ['missing', 'missing', 'missing', 'missing'],
    );
  });
});

test('opl index checkpoint integrity-check and backup maintain existing sidecar databases', () => {
  withTempState((root) => {
    runCli(['index', 'rebuild'], { OPL_STATE_DIR: root });

    const checkpoint = runCli(['index', 'checkpoint'], { OPL_STATE_DIR: root }).state_index;
    assert.equal(checkpoint.status, 'ready');
    assert.equal(checkpoint.checkpoint_results.length, 4);
    assert.equal(checkpoint.summary.maintenance_run_ref.startsWith('opl-state-index-maintenance:checkpoint:'), true);

    const integrity = runCli(['index', 'integrity-check'], { OPL_STATE_DIR: root }).state_index;
    assert.equal(integrity.status, 'ready');
    assert.deepEqual(
      integrity.databases.map((database: { integrity_check: string }) => database.integrity_check),
      ['ok', 'ok', 'ok', 'ok'],
    );

    const backup = runCli(['index', 'backup'], { OPL_STATE_DIR: root }).state_index.backup;
    assert.equal(backup.files.length, 4);
    assert.equal(fs.existsSync(backup.backup_root), true);
    assert.equal(backup.files.every((file: { backup_path: string }) => fs.existsSync(file.backup_path)), true);
    assert.equal(backup.retention.status, 'bounded');
    assert.deepEqual(backup.retention.policy, {
      max_count: 3,
      max_age_days: 14,
      max_bytes: 8 * 1024 * 1024 * 1024,
    });
    assert.equal(backup.retention.protected_backup_root, backup.backup_root);
    assert.equal(backup.retention.retained.length, 1);
    assert.equal(backup.retention.pruned.length, 0);
  });
});

test('opl index backup prunes old generations by age and count after the new backup succeeds', () => {
  withTempState((root) => {
    runCli(['index', 'rebuild'], { OPL_STATE_DIR: root });
    const backupStorageRoot = path.join(root, 'family-runtime', 'backups');
    const env = {
      OPL_STATE_DIR: root,
      OPL_STATE_INDEX_BACKUP_MAX_COUNT: '2',
      OPL_STATE_INDEX_BACKUP_MAX_AGE_DAYS: '1',
      OPL_STATE_INDEX_BACKUP_MAX_BYTES: String(1024 * 1024 * 1024),
    };
    runCli(['index', 'backup'], env);
    runCli(['index', 'backup'], env);
    const legacyBackup = path.join(
      backupStorageRoot,
      'queue.sqlite.backup-20260101T000000+0800-legacy',
    );
    fs.writeFileSync(legacyBackup, 'legacy recovery backup');
    const oldTime = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(legacyBackup, oldTime, oldTime);
    const backup = runCli(['index', 'backup'], env).state_index.backup;

    assert.equal(fs.existsSync(backup.backup_root), true);
    assert.equal(fs.existsSync(legacyBackup), false);
    assert.equal(backup.retention.status, 'bounded');
    assert.equal(backup.retention.retained.length, 2);
    assert.ok(backup.retention.pruned.length >= 1);
    assert.match(backup.retention.pruned[0].generation_id, /^legacy:/);
    assert.ok(backup.retention.pruned.some(
      (generation: { reasons: string[] }) => generation.reasons.includes('max_count'),
    ));
    assert.ok(backup.retention.reclaimed_bytes > 0);
  });
});

test('opl index backup never deletes the newly successful backup when it alone exceeds the byte budget', () => {
  withTempState((root) => {
    runCli(['index', 'rebuild'], { OPL_STATE_DIR: root });
    const backup = runCli(['index', 'backup'], {
      OPL_STATE_DIR: root,
      OPL_STATE_INDEX_BACKUP_MAX_COUNT: '3',
      OPL_STATE_INDEX_BACKUP_MAX_AGE_DAYS: '14',
      OPL_STATE_INDEX_BACKUP_MAX_BYTES: '1',
    }).state_index.backup;

    assert.equal(backup.retention.status, 'latest_backup_retained_over_byte_budget');
    assert.equal(backup.retention.retained.length, 1);
    assert.equal(backup.retention.retained[0].paths.includes(backup.backup_root), true);
    assert.equal(fs.existsSync(backup.backup_root), true);
  });
});

test('runtime queue retention bounds events, notifications, and terminal closeout history', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const oversizedEvent = insertEvent(db, {
      eventType: 'oversized_diagnostic',
      source: 'test',
      payload: {
        recursive_diagnostic: Object.fromEntries(
          Array.from({ length: 40 }, (_, index) => [`field_${index}`, 'x'.repeat(4_096)]),
        ),
      },
    });
    const oversizedPayload = db.prepare(
      'SELECT payload_json FROM events WHERE event_id = ?',
    ).get(oversizedEvent.event_id) as { payload_json: string };
    assert.ok(Buffer.byteLength(oversizedPayload.payload_json) < 64 * 1024);
    assert.equal(
      (parseJsonText(oversizedPayload.payload_json) as { truncated?: boolean }).truncated,
      true,
    );

    const event = db.prepare(`
      INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at)
      VALUES (?, NULL, NULL, ?, ?, ?, ?)
    `);
    for (const [index, createdAt] of [
      ['old-event', '2026-05-01T00:00:00.000Z'],
      ['recent-event-a', '2026-07-24T00:00:00.000Z'],
      ['recent-event-b', '2026-07-25T00:00:00.000Z'],
    ]) {
      event.run(index, 'test_event', 'test', '{}', createdAt);
    }

    const notification = db.prepare(`
      INSERT INTO notifications(
        notification_id, task_id, severity, title, body, channel, status, payload_json, created_at
      ) VALUES (?, NULL, 'info', 'test', 'test', 'local_inbox', 'written', '{}', ?)
    `);
    for (const [index, createdAt] of [
      ['old-notification', '2026-05-01T00:00:00.000Z'],
      ['recent-notification-a', '2026-07-24T00:00:00.000Z'],
      ['recent-notification-b', '2026-07-25T00:00:00.000Z'],
    ]) {
      notification.run(index, createdAt);
    }

    const attempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'storage_retention',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/opl-storage-retention' },
    }).attempt;
    db.prepare("UPDATE stage_attempts SET status = 'completed' WHERE stage_attempt_id = ?")
      .run(attempt.stage_attempt_id);
    const closeout = db.prepare(`
      INSERT INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
      VALUES (?, ?, '{}', ?)
    `);
    for (const [index, createdAt] of [
      ['old-closeout', '2026-05-01T00:00:00.000Z'],
      ['recent-closeout-a', '2026-07-24T00:00:00.000Z'],
      ['recent-closeout-b', '2026-07-25T00:00:00.000Z'],
    ]) {
      closeout.run(index, attempt.stage_attempt_id, createdAt);
    }
    const activeAttempt = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'active_storage_retention',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/opl-active-storage-retention' },
    }).attempt;
    closeout.run(
      'active-closeout',
      activeAttempt.stage_attempt_id,
      '2026-05-01T00:00:00.000Z',
    );

    const retention = pruneRuntimeQueueHistory(db, {
      event_max_count: 2,
      event_max_age_days: 30,
      notification_max_count: 1,
      notification_max_age_days: 30,
      stage_attempt_closeout_max_count: 1,
      stage_attempt_closeout_max_age_days: 30,
    }, Date.parse('2026-07-25T12:00:00.000Z'));

    assert.equal(retention.events.retained, 2);
    assert.equal(retention.notifications.retained, 1);
    assert.equal(retention.stage_attempt_closeouts.retained, 1);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM events WHERE event_id = 'old-event'").get() as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE notification_id = 'old-notification'").get() as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM stage_attempt_closeouts WHERE closeout_id = 'old-closeout'").get() as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM stage_attempt_closeouts WHERE closeout_id = 'active-closeout'").get() as { count: number }).count,
      1,
    );
  } finally {
    db.close();
  }
});

test('runtime queue retention limits each cleanup pass to five thousand rows', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createFamilyRuntimeQueueTables(db);
    const event = db.prepare(`
      INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at)
      VALUES (?, NULL, NULL, 'retention_batch_fixture', 'test', '{}', ?)
    `);
    for (let index = 0; index < 5_002; index += 1) {
      event.run(`event-${String(index).padStart(5, '0')}`, '2026-07-25T00:00:00.000Z');
    }
    const policy = {
      event_max_count: 1,
      event_max_age_days: 365,
      notification_max_count: 1,
      notification_max_age_days: 365,
      stage_attempt_closeout_max_count: 1,
      stage_attempt_closeout_max_age_days: 365,
    };

    const first = pruneRuntimeQueueHistory(db, policy, Date.parse('2026-07-25T12:00:00.000Z'));
    assert.deepEqual(first.events, {
      before: 5_002,
      retained: 2,
      pruned: 5_000,
      status: 'prune_in_progress',
    });

    const second = pruneRuntimeQueueHistory(db, policy, Date.parse('2026-07-25T12:00:00.000Z'));
    assert.deepEqual(second.events, {
      before: 2,
      retained: 1,
      pruned: 1,
      status: 'bounded',
    });
  } finally {
    db.close();
  }
});
