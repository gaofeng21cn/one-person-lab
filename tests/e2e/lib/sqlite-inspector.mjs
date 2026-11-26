import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export const EXPECTED_TABLES = [
  "schema_migrations",
  "workspaces",
  "knowledge_sources",
  "knowledge_snapshots",
  "installed_packages",
  "package_operations",
  "connections",
  "connection_grants",
  "tasks",
  "stage_runs",
  "attempts",
  "ledger_entries",
  "schedules",
];

export const EXPECTED_INDEXES = [
  "idx_grants_lookup",
  "idx_stage_runs_task",
  "idx_attempts_live",
  "idx_ledger_task",
];

export const EXPECTED_COLUMNS = {
  schema_migrations: ["version", "name", "applied_at"],
  workspaces: ["workspace_id", "name", "root_path", "domain_id", "revision", "metadata_json", "created_at", "updated_at"],
  knowledge_sources: ["source_id", "scope", "adapter_kind", "root_path", "accepted_revision", "status", "updated_at"],
  knowledge_snapshots: ["snapshot_id", "stage_run_id", "source_id", "revision", "manifest_json", "created_at"],
  installed_packages: [
    "package_id", "version", "intent", "origin", "install_mode", "install_path",
    "content_digest", "manifest_json", "enabled", "carrier_synced", "installed_at", "updated_at",
  ],
  package_operations: [
    "op_id", "batch_id", "package_id", "action", "target_version", "status",
    "reload_mode", "progress_json", "error_json", "created_at", "updated_at",
  ],
  connections: [
    "connection_id", "provider_type", "display_name", "account_label",
    "credential_handle", "security_revision", "status", "updated_at",
  ],
  connection_grants: [
    "grant_id", "consumer_package_id", "consumer_content_digest", "connection_id",
    "connection_security_revision", "capability_id", "capability_title", "capability_risk",
    "status", "created_at", "updated_at",
  ],
  tasks: ["task_id", "workspace_id", "agent_id", "title", "goal_prompt", "status", "revision", "created_at", "updated_at"],
  stage_runs: [
    "stage_run_id", "task_id", "stage_id", "seq_no", "status", "executor_id",
    "model_id", "human_gate_json", "revision", "started_at", "finished_at", "updated_at",
  ],
  attempts: [
    "attempt_id", "stage_run_id", "attempt_no", "role", "executor_id", "executor_session_ref",
    "local_pid", "status", "lease_expires_at", "usage_json", "error_json", "started_at", "finished_at",
  ],
  ledger_entries: ["entry_id", "task_id", "stage_run_id", "attempt_id", "entry_kind", "owner_id", "payload_json", "created_at"],
  schedules: [
    "schedule_id", "workspace_id", "agent_id", "cron_expr", "timezone", "overlap_policy",
    "payload_json", "enabled", "next_run_at", "last_run_at", "last_task_id", "updated_at",
  ],
};

export function txImmediate(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const res = fn();
    db.exec("COMMIT");
    return res;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback failure if already rolled back
    }
    throw err;
  }
}

export function openOplDb(dbPath, { readOnly = false } = {}) {
  if (readOnly && !fs.existsSync(dbPath)) {
    throw new Error(`SQLite database does not exist: ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath, { readOnly });
  if (!readOnly) {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  }
  return db;
}

/**
 * Note: In SQLite, only `journal_mode = WAL` persists in the database file header.
 * `foreign_keys`, `busy_timeout`, `synchronous`, and `temp_store` are per-connection PRAGMAs.
 */
export function assertPragmas(db, { checkConnectionDefaults = true } = {}) {
  const jm = db.prepare("PRAGMA journal_mode").get();
  assert.equal(String(jm?.journal_mode || "").toLowerCase(), "wal", "Expected SQLite journal_mode = wal");

  if (checkConnectionDefaults) {
    const fk = db.prepare("PRAGMA foreign_keys").get();
    assert.equal(Number(fk?.foreign_keys), 1, "Expected PRAGMA foreign_keys = 1");

    const bt = db.prepare("PRAGMA busy_timeout").get();
    const btVal = Number(bt?.timeout ?? bt?.busy_timeout ?? 0);
    assert.ok(btVal >= 5000, `Expected PRAGMA busy_timeout >= 5000, got ${btVal}`);

    const sync = db.prepare("PRAGMA synchronous").get();
    const syncVal = Number(sync?.synchronous);
    assert.ok(syncVal === 1 || syncVal === 2, `Expected PRAGMA synchronous NORMAL (1) or FULL (2), got ${syncVal}`);

    const ts = db.prepare("PRAGMA temp_store").get();
    const tsVal = Number(ts?.temp_store);
    assert.ok(tsVal === 0 || tsVal === 2, `Expected PRAGMA temp_store MEMORY (2) or DEFAULT (0), got ${tsVal}`);
  }
}

export function assertSchema(db) {
  const tableRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  const tableSet = new Set(tableRows.map((r) => r.name));
  for (const tbl of EXPECTED_TABLES) {
    assert.ok(tableSet.has(tbl), `Missing expected SQLite table: ${tbl}`);
  }

  const indexRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
    .all();
  const indexSet = new Set(indexRows.map((r) => r.name));
  for (const idx of EXPECTED_INDEXES) {
    assert.ok(indexSet.has(idx), `Missing expected SQLite index: ${idx}`);
  }

  for (const tbl of EXPECTED_TABLES) {
    const cols = db.prepare(`PRAGMA table_info('${tbl}')`).all().map((r) => r.name);
    const colSet = new Set(cols);
    for (const expectedCol of EXPECTED_COLUMNS[tbl]) {
      assert.ok(colSet.has(expectedCol), `Missing expected column '${expectedCol}' in table '${tbl}'`);
    }
  }
}

export function assertDqsZeroEnforced(db) {
  let threw = false;
  try {
    db.prepare('SELECT "bad_double_quoted_literal" AS x').all();
  } catch (err) {
    threw = true;
    assert.match(String(err.message), /no such column/i, `Expected DQS=0 'no such column' error, got: ${err.message}`);
  }
  assert.equal(threw, true, "Expected Node.js DatabaseSync DQS=0 to reject double-quoted SQL literal");
}

export function getTask(db, taskId) {
  return db.prepare("SELECT * FROM tasks WHERE task_id = ?").get(taskId) ?? null;
}

export function listTasks(db, whereStatus) {
  if (whereStatus) {
    return db.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC").all(whereStatus);
  }
  return db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all();
}

export function getStageRuns(db, taskId) {
  return db.prepare("SELECT * FROM stage_runs WHERE task_id = ? ORDER BY seq_no ASC").all(taskId);
}

export function getStageRun(db, stageRunId) {
  return db.prepare("SELECT * FROM stage_runs WHERE stage_run_id = ?").get(stageRunId) ?? null;
}

export function getAttempts(db, stageRunId) {
  return db.prepare("SELECT * FROM attempts WHERE stage_run_id = ? ORDER BY attempt_no ASC").all(stageRunId);
}

export function getAttempt(db, attemptId) {
  return db.prepare("SELECT * FROM attempts WHERE attempt_id = ?").get(attemptId) ?? null;
}

export function countTasks(db, workspaceId) {
  if (workspaceId) {
    return Number(db.prepare("SELECT COUNT(*) AS cnt FROM tasks WHERE workspace_id = ?").get(workspaceId)?.cnt ?? 0);
  }
  return Number(db.prepare("SELECT COUNT(*) AS cnt FROM tasks").get()?.cnt ?? 0);
}

export function assertTaskStatus(db, taskId, expectedStatus) {
  const row = getTask(db, taskId);
  assert.ok(row, `Task not found: ${taskId}`);
  assert.equal(row.status, expectedStatus, `Expected task '${taskId}' status '${expectedStatus}', got '${row.status}'`);
  return row;
}

export function assertStageRunStatus(db, stageRunId, expectedStatus, minRevision) {
  const row = db.prepare("SELECT * FROM stage_runs WHERE stage_run_id = ?").get(stageRunId);
  assert.ok(row, `StageRun not found: ${stageRunId}`);
  assert.equal(row.status, expectedStatus, `Expected stage_run '${stageRunId}' status '${expectedStatus}', got '${row.status}'`);
  if (minRevision !== undefined) {
    assert.ok(row.revision >= minRevision, `Expected stage_run '${stageRunId}' revision >= ${minRevision}, got ${row.revision}`);
  }
  return row;
}

export function assertNoDuplicateAttempts(db, stageRunId, expectedCount) {
  const rows = getAttempts(db, stageRunId);
  assert.equal(rows.length, expectedCount, `Expected ${expectedCount} attempts for '${stageRunId}', got ${rows.length}`);
  return rows;
}

export function assertPausedByHumanSovereignty(db, taskId, expectedMaxAttemptsByStage = {}) {
  const task = assertTaskStatus(db, taskId, "paused_by_human");
  const stages = getStageRuns(db, taskId);
  for (const sr of stages) {
    assert.notEqual(sr.status, "running", `Stage '${sr.stage_run_id}' must not be running while task '${taskId}' is paused_by_human`);
    assert.notEqual(sr.status, "queued", `Stage '${sr.stage_run_id}' must not be queued while task '${taskId}' is paused_by_human`);
    const attempts = getAttempts(db, sr.stage_run_id);
    for (const att of attempts) {
      assert.notEqual(att.status, "running", `Attempt '${att.attempt_id}' must not be running while task '${taskId}' is paused_by_human`);
    }
    if (expectedMaxAttemptsByStage[sr.stage_run_id] !== undefined) {
      assert.ok(
        attempts.length <= expectedMaxAttemptsByStage[sr.stage_run_id],
        `Unexpected new attempt spawned for paused stage '${sr.stage_run_id}'`
      );
    }
  }
  return { task, stages };
}

export function getLedgerEntries(db, taskId, entryKind) {
  if (entryKind) {
    return db
      .prepare("SELECT * FROM ledger_entries WHERE task_id = ? AND entry_kind = ? ORDER BY created_at ASC")
      .all(taskId, entryKind);
  }
  return db.prepare("SELECT * FROM ledger_entries WHERE task_id = ? ORDER BY created_at ASC").all(taskId);
}

export function assertLedgerRefsOnly(db, taskId, forbiddenStrings = []) {
  const rows = getLedgerEntries(db, taskId);
  for (const row of rows) {
    assert.ok(
      Buffer.byteLength(row.payload_json, "utf8") <= 16384,
      `Ledger entry '${row.entry_id}' payload exceeds 16KB Refs-only budget`
    );
    const parsed = JSON.parse(row.payload_json);
    assert.equal(typeof parsed, "object", `Ledger entry '${row.entry_id}' payload_json must parse to an object`);
    assert.ok(!/-----BEGIN\s+[A-Z ]+PRIVATE KEY-----/.test(row.payload_json), `Private key leaked in ledger entry '${row.entry_id}'`);
    assert.ok(!/\bsk-[A-Za-z0-9]{16,}\b/.test(row.payload_json), `API key pattern leaked in ledger entry '${row.entry_id}'`);
    for (const secret of forbiddenStrings) {
      if (secret) {
        assert.ok(!row.payload_json.includes(secret), `Forbidden secret leaked in ledger entry '${row.entry_id}'`);
      }
    }
    if (row.entry_kind === "artifact_ref") {
      assert.ok(typeof parsed.path === "string" && parsed.path.length > 0, `artifact_ref '${row.entry_id}' missing path`);
      assert.ok(parsed.content === undefined && parsed.body === undefined, `artifact_ref '${row.entry_id}' must not embed inline content/body`);
    }
  }
  return rows;
}

export function getConnection(db, connectionId) {
  return db.prepare("SELECT * FROM connections WHERE connection_id = ?").get(connectionId) ?? null;
}

export function getGrants(db, { consumerPackageId, connectionId, capabilityId } = {}) {
  const clauses = [];
  const params = [];
  if (consumerPackageId) {
    clauses.push("consumer_package_id = ?");
    params.push(consumerPackageId);
  }
  if (connectionId) {
    clauses.push("connection_id = ?");
    params.push(connectionId);
  }
  if (capabilityId) {
    clauses.push("capability_id = ?");
    params.push(capabilityId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM connection_grants ${where} ORDER BY created_at ASC`).all(...params);
}

export function assertNoPlaintextSecrets(db, forbiddenSecrets = []) {
  const activeSecrets = forbiddenSecrets.filter((s) => typeof s === "string" && s.length > 0);
  if (activeSecrets.length === 0) return;

  const queries = [
    ["connections", "SELECT * FROM connections"],
    ["connection_grants", "SELECT * FROM connection_grants"],
    ["ledger_entries", "SELECT * FROM ledger_entries"],
    ["tasks", "SELECT * FROM tasks"],
    ["attempts", "SELECT * FROM attempts"],
  ];

  for (const [tableName, sql] of queries) {
    const rows = db.prepare(sql).all();
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      for (const secret of activeSecrets) {
        assert.ok(!serialized.includes(secret), `Plaintext secret leaked in table '${tableName}'`);
      }
    }
  }
}

export function getInstalledPackage(db, packageId) {
  return db.prepare("SELECT * FROM installed_packages WHERE package_id = ?").get(packageId) ?? null;
}

export function getPackageOperations(db, packageId) {
  if (packageId) {
    return db.prepare("SELECT * FROM package_operations WHERE package_id = ? ORDER BY created_at ASC").all(packageId);
  }
  return db.prepare("SELECT * FROM package_operations ORDER BY created_at ASC").all();
}

export function getWorkspace(db, workspaceId) {
  return db.prepare("SELECT * FROM workspaces WHERE workspace_id = ?").get(workspaceId) ?? null;
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row?.ok);
}

function getTableColumnNames(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info('${tableName}')`).all().map((r) => r.name));
}

export function getKnowledgeSource(db, sourceId) {
  return db.prepare("SELECT * FROM knowledge_sources WHERE source_id = ?").get(sourceId) ?? null;
}

export function getKnowledgeSources(db, workspaceId) {
  if (workspaceId) {
    const ksCols = getTableColumnNames(db, "knowledge_sources");
    if (ksCols.has("workspace_id")) {
      return db
        .prepare(
          "SELECT * FROM knowledge_sources WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY updated_at ASC"
        )
        .all(workspaceId);
    }

    for (const joinTbl of ["workspace_knowledge_sources", "workspace_sources"]) {
      if (tableExists(db, joinTbl)) {
        return db
          .prepare(
            `SELECT ks.* FROM knowledge_sources ks JOIN ${joinTbl} j ON j.source_id = ks.source_id WHERE j.workspace_id = ? ORDER BY ks.updated_at ASC`
          )
          .all(workspaceId);
      }
    }

    const ws = getWorkspace(db, workspaceId);
    if (ws && typeof ws.metadata_json === "string") {
      try {
        const meta = JSON.parse(ws.metadata_json);
        const boundIds = meta?.source_ids ?? meta?.knowledge_source_ids ?? meta?.sources;
        if (Array.isArray(boundIds) && boundIds.length > 0) {
          const ids = boundIds
            .map((item) => (typeof item === "string" ? item : item?.source_id ?? item?.sourceId))
            .filter((id) => typeof id === "string" && id.length > 0);
          if (ids.length > 0) {
            const placeholders = ids.map(() => "?").join(", ");
            return db
              .prepare(`SELECT * FROM knowledge_sources WHERE source_id IN (${placeholders}) ORDER BY updated_at ASC`)
              .all(...ids);
          }
        }
      } catch {
        // ignore invalid metadata_json
      }
    }
  }
  return db.prepare("SELECT * FROM knowledge_sources ORDER BY updated_at ASC").all();
}

export function getKnowledgeSnapshots(db, stageRunId) {
  if (stageRunId) {
    return db.prepare("SELECT * FROM knowledge_snapshots WHERE stage_run_id = ? ORDER BY created_at ASC").all(stageRunId);
  }
  return db.prepare("SELECT * FROM knowledge_snapshots ORDER BY created_at ASC").all();
}

export function getKnowledgeSnapshotsBySource(db, sourceId) {
  return db.prepare("SELECT * FROM knowledge_snapshots WHERE source_id = ? ORDER BY created_at ASC").all(sourceId);
}

export function getConnectAuditEvents(db, { connectionId, consumerPackageId, grantId, kind } = {}) {
  if (!tableExists(db, "connect_audit_events")) {
    return [];
  }
  const clauses = [];
  const params = [];
  if (connectionId) {
    clauses.push("connection_id = ?");
    params.push(connectionId);
  }
  if (consumerPackageId) {
    clauses.push("consumer_package_id = ?");
    params.push(consumerPackageId);
  }
  if (grantId) {
    clauses.push("grant_id = ?");
    params.push(grantId);
  }
  if (kind) {
    clauses.push("kind = ?");
    params.push(kind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM connect_audit_events ${where} ORDER BY created_at ASC`).all(...params);
}

export function assertNoRawKnowledgeContentInDb(dbPath, forbiddenBodyStrings = []) {
  const activeForbidden = (forbiddenBodyStrings || []).filter((s) => typeof s === "string" && s.length > 0);
  const rawMain = fs.readFileSync(dbPath);
  const walPath = `${dbPath}-wal`;
  const rawWal = fs.existsSync(walPath) ? fs.readFileSync(walPath) : null;

  for (const body of activeForbidden) {
    assert.equal(
      rawMain.includes(Buffer.from(body, "utf8")),
      false,
      `Raw knowledge body string leaked into SQLite database file: ${body.slice(0, 48)}`
    );
    if (rawWal) {
      assert.equal(
        rawWal.includes(Buffer.from(body, "utf8")),
        false,
        `Raw knowledge body string leaked into SQLite WAL file: ${body.slice(0, 48)}`
      );
    }
  }

  const db = openOplDb(dbPath, { readOnly: true });
  try {
    const snapshots = db.prepare("SELECT snapshot_id, manifest_json FROM knowledge_snapshots").all();
    for (const row of snapshots) {
      for (const body of activeForbidden) {
        assert.equal(
          row.manifest_json.includes(body),
          false,
          `Knowledge body leaked in knowledge_snapshots('${row.snapshot_id}').manifest_json`
        );
      }
      const parsed = JSON.parse(row.manifest_json);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.files)
          ? parsed.files
          : Array.isArray(parsed?.entries)
            ? parsed.entries
            : [];
      for (const item of items) {
        if (item && typeof item === "object") {
          assert.equal(
            item.content === undefined && item.body === undefined && item.raw_text === undefined,
            true,
            `knowledge_snapshots('${row.snapshot_id}') must store refs/digests only, not inline body`
          );
        }
      }
    }

    const sources = db.prepare("SELECT source_id, root_path FROM knowledge_sources").all();
    for (const row of sources) {
      for (const body of activeForbidden) {
        assert.equal(
          JSON.stringify(row).includes(body),
          false,
          `Knowledge body leaked in knowledge_sources('${row.source_id}')`
        );
      }
    }

    const workspaces = db.prepare("SELECT workspace_id, metadata_json FROM workspaces").all();
    for (const row of workspaces) {
      for (const body of activeForbidden) {
        assert.equal(
          row.metadata_json.includes(body),
          false,
          `Knowledge body leaked in workspaces('${row.workspace_id}').metadata_json`
        );
      }
    }
  } finally {
    db.close();
  }
}

export function getSchedule(db, scheduleId) {
  return db.prepare("SELECT * FROM schedules WHERE schedule_id = ?").get(scheduleId) ?? null;
}

export function listSchedules(db, workspaceId) {
  if (workspaceId) {
    return db.prepare("SELECT * FROM schedules WHERE workspace_id = ? ORDER BY schedule_id ASC").all(workspaceId);
  }
  return db.prepare("SELECT * FROM schedules ORDER BY schedule_id ASC").all();
}

export async function waitForDbState(dbPath, predicateFn, { timeoutMs = 10_000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (fs.existsSync(dbPath)) {
      let db = null;
      try {
        db = openOplDb(dbPath, { readOnly: true });
        const result = await predicateFn(db);
        if (result) {
          return result;
        }
        lastError = null;
      } catch (err) {
        lastError = err;
      } finally {
        if (db) {
          try {
            db.close();
          } catch {
            // ignore close error
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(
    `Timed out waiting for DB state at ${dbPath} after ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ""}`
  );
}

export function seedCrashRecoveryScenario(
  db,
  {
    workspaceRoot,
    activeHangStub = { sessionRef: "codex-thread-still", localPid: 999991 },
    completedStub = { sessionRef: "codex-thread-done", localPid: 999992 },
    lostStub = { sessionRef: "ag-conv-dead", localPid: 999993 },
    pausedTask = true,
  } = {}
) {
  const ts = new Date().toISOString();
  const pastIso = new Date(Date.now() - 10_000).toISOString();
  const wsRoot = workspaceRoot || "/tmp/ws-crash";

  return txImmediate(db, () => {
    db.prepare(
      "INSERT OR REPLACE INTO workspaces (workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at) VALUES (?, ?, ?, 'mas', 1, '{}', ?, ?)"
    ).run("ws-crash", "Crash Recovery Workspace", wsRoot, ts, ts);

    db.prepare(
      "INSERT OR REPLACE INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES ('task-crash', 'ws-crash', 'mas', 'Crash Recovery Task', 'Recover cleanly', 'active', 1, ?, ?)"
    ).run(ts, ts);

    db.prepare(
      "INSERT OR REPLACE INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES ('sr-done', 'task-crash', 'build', 1, 'running', 'codex', 'gpt-5-codex', NULL, 1, ?, NULL, ?)"
    ).run(ts, ts);
    db.prepare(
      "INSERT OR REPLACE INTO attempts (attempt_id, stage_run_id, attempt_no, role, executor_id, executor_session_ref, local_pid, status, lease_expires_at, usage_json, error_json, started_at, finished_at) VALUES ('att-done', 'sr-done', 1, 'producer', 'codex', ?, ?, 'running', ?, '{}', NULL, ?, NULL)"
    ).run(completedStub.sessionRef, completedStub.localPid ?? null, pastIso, ts);

    db.prepare(
      "INSERT OR REPLACE INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES ('sr-still', 'task-crash', 'review', 2, 'running', 'codex', 'gpt-5-codex', NULL, 1, ?, NULL, ?)"
    ).run(ts, ts);
    db.prepare(
      "INSERT OR REPLACE INTO attempts (attempt_id, stage_run_id, attempt_no, role, executor_id, executor_session_ref, local_pid, status, lease_expires_at, usage_json, error_json, started_at, finished_at) VALUES ('att-still', 'sr-still', 1, 'reviewer', 'codex', ?, ?, 'running', ?, '{}', NULL, ?, NULL)"
    ).run(activeHangStub.sessionRef, activeHangStub.localPid ?? null, pastIso, ts);

    db.prepare(
      "INSERT OR REPLACE INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES ('sr-lost', 'task-crash', 'export', 3, 'running', 'antigravity', 'gemini-4-neon-high', NULL, 1, ?, NULL, ?)"
    ).run(ts, ts);
    db.prepare(
      "INSERT OR REPLACE INTO attempts (attempt_id, stage_run_id, attempt_no, role, executor_id, executor_session_ref, local_pid, status, lease_expires_at, usage_json, error_json, started_at, finished_at) VALUES ('att-lost', 'sr-lost', 1, 'utility', 'antigravity', ?, ?, 'running', ?, '{}', NULL, ?, NULL)"
    ).run(lostStub.sessionRef, lostStub.localPid ?? null, pastIso, ts);

    if (pausedTask) {
      db.prepare(
        "INSERT OR REPLACE INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES ('task-paused', 'ws-crash', 'mas', 'Paused Study', 'Wait for human', 'paused_by_human', 1, ?, ?)"
      ).run(ts, ts);
      db.prepare(
        "INSERT OR REPLACE INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES ('sr-paused', 'task-paused', 'analysis', 1, 'paused_by_human', 'codex', 'gpt-5-codex', NULL, 1, ?, NULL, ?)"
      ).run(ts, ts);
    }

    return {
      workspaceId: "ws-crash",
      taskId: "task-crash",
      pausedTaskId: pausedTask ? "task-paused" : null,
      attemptIds: ["att-done", "att-still", "att-lost"],
    };
  });
}

export function seedWakeFromSleepSchedules(
  db,
  {
    workspaceRoot,
    pastIso = "2026-01-01T00:00:00Z",
    cronExpr,
    payload,
    enabledScheduleIds = ["sch-skip", "sch-buffer", "sch-cancel"],
  } = {}
) {
  const now = new Date();
  const ts = now.toISOString();
  const effectiveCronExpr =
    cronExpr ??
    `${(now.getUTCMinutes() + 30) % 60} ${(now.getUTCHours() + 12) % 24} * * *`;
  const wsRoot = workspaceRoot || "/tmp/ws-cron";
  const enabledSet = new Set(enabledScheduleIds);
  const makePayload = (policy) =>
    JSON.stringify(
      payload ?? {
        title: `Cron ${policy} Task`,
        goal_prompt: `Scheduled tick (${policy})`,
        agent_id: "mas",
      }
    );

  return txImmediate(db, () => {
    db.prepare(
      "INSERT OR REPLACE INTO workspaces (workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at) VALUES ('ws-cron', 'Cron Workspace', ?, 'mas', 1, '{}', ?, ?)"
    ).run(wsRoot, ts, ts);

    db.prepare(
      "INSERT OR REPLACE INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES ('task-cron-active', 'ws-cron', 'mas', 'Active Cron Task', 'Still running', 'active', 1, ?, ?)"
    ).run(ts, ts);

    db.prepare(
      "INSERT OR REPLACE INTO schedules (schedule_id, workspace_id, agent_id, cron_expr, timezone, overlap_policy, payload_json, enabled, next_run_at, last_run_at, last_task_id, updated_at) VALUES ('sch-skip', 'ws-cron', 'mas', ?, 'UTC', 'skip', ?, ?, ?, NULL, 'task-cron-active', ?)"
    ).run(effectiveCronExpr, makePayload("skip"), enabledSet.has("sch-skip") ? 1 : 0, pastIso, ts);

    db.prepare(
      "INSERT OR REPLACE INTO schedules (schedule_id, workspace_id, agent_id, cron_expr, timezone, overlap_policy, payload_json, enabled, next_run_at, last_run_at, last_task_id, updated_at) VALUES ('sch-buffer', 'ws-cron', 'mas', ?, 'UTC', 'buffer_one', ?, ?, ?, NULL, 'task-cron-active', ?)"
    ).run(effectiveCronExpr, makePayload("buffer_one"), enabledSet.has("sch-buffer") ? 1 : 0, pastIso, ts);

    db.prepare(
      "INSERT OR REPLACE INTO schedules (schedule_id, workspace_id, agent_id, cron_expr, timezone, overlap_policy, payload_json, enabled, next_run_at, last_run_at, last_task_id, updated_at) VALUES ('sch-cancel', 'ws-cron', 'mas', ?, 'UTC', 'cancel_other', ?, ?, ?, NULL, 'task-cron-active', ?)"
    ).run(effectiveCronExpr, makePayload("cancel_other"), enabledSet.has("sch-cancel") ? 1 : 0, pastIso, ts);

    return {
      workspaceId: "ws-cron",
      activeTaskId: "task-cron-active",
      scheduleIds: ["sch-skip", "sch-buffer", "sch-cancel"],
    };
  });
}

export function seedStaleStageRun(db, { workspaceId = "ws-stale", workspaceRoot = "/tmp/ws-stale", taskId = "task-stale", stageRunId = "sr-stale", revision = 1 } = {}) {
  const ts = new Date().toISOString();
  return txImmediate(db, () => {
    db.prepare(
      "INSERT OR REPLACE INTO workspaces (workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at) VALUES (?, 'Stale Workspace', ?, 'mas', 1, '{}', ?, ?)"
    ).run(workspaceId, workspaceRoot, ts, ts);

    db.prepare(
      "INSERT OR REPLACE INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES (?, ?, 'mas', 'Stale Test Task', 'Check optimistic lock', 'active', 1, ?, ?)"
    ).run(taskId, workspaceId, ts, ts);

    db.prepare(
      "INSERT OR REPLACE INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES (?, ?, 'stage_1', 1, 'running', 'codex', 'gpt-5-codex', NULL, ?, ?, NULL, ?)"
    ).run(stageRunId, taskId, revision, ts, ts);

    return { workspaceId, taskId, stageRunId, revision };
  });
}
