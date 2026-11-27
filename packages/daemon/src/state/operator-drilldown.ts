import type { DaemonRuntime } from './runtime.ts';

const sampleLimit = 100;

// Select reference columns at the source. Task goals, provider sessions, error
// details and Ledger payloads can contain user data and do not belong in release evidence.
export function readOperatorDrilldown(runtime: DaemonRuntime) {
  const { db } = runtime;
  db.exec('SAVEPOINT operator_drilldown');
  try {
    const rows = (sql: string) => db.prepare(sql).all(sampleLimit);
    return {
      schema: 'opl.operator_drilldown.v2',
      api_version: '2.0',
      detail: 'full',
      generated_at: new Date().toISOString(),
      daemon: { version: runtime.version, started_at: runtime.startedAt },
      storage: runtime.runwayStore.healthCheck(),
      registered_executors: runtime.runwayRuntime.listExecutors().map(({ executor_id }) => executor_id),
      sample_limit: sampleLimit,
      summary: db.prepare(`
        SELECT (SELECT count(*) FROM tasks) AS task_count,
               (SELECT count(*) FROM stage_runs) AS stage_run_count,
               (SELECT count(*) FROM attempts) AS attempt_count,
               (SELECT count(*) FROM ledger_entries) AS ledger_entry_count,
               (SELECT count(*) FROM package_operations) AS package_operation_count
      `).get(),
      tasks: rows(`SELECT task_id, workspace_id, agent_id, status, revision, updated_at
                  FROM tasks ORDER BY updated_at DESC, rowid DESC LIMIT ?`),
      stage_runs: rows(`SELECT stage_run_id, task_id, stage_id, status, executor_id, revision, updated_at
                       FROM stage_runs ORDER BY updated_at DESC, rowid DESC LIMIT ?`),
      attempts: rows(`SELECT attempt_id, stage_run_id, role, executor_id, status, lease_expires_at,
                            started_at, finished_at
                     FROM attempts ORDER BY started_at DESC, rowid DESC LIMIT ?`),
      ledger_refs: rows(`SELECT entry_id, task_id, stage_run_id, attempt_id, entry_kind, owner_id, created_at
                        FROM ledger_entries ORDER BY created_at DESC, rowid DESC LIMIT ?`),
      package_operations: rows(`SELECT op_id, batch_id, package_id, action, status, updated_at
                               FROM package_operations ORDER BY updated_at DESC, rowid DESC LIMIT ?`),
    };
  } finally {
    db.exec('RELEASE operator_drilldown');
  }
}
