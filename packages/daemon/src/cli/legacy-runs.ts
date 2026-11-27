import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// These are operator audit references written by v1. The Temporal namespace
// owns live workflow status, and only native Runway tasks can acquire a v2 lease.
export function readLegacyRuns(stateDir: string, limit = 100) {
  const database = path.join(stateDir, 'family-runtime', 'queue.sqlite');
  const source = { source: 'v1_local_audit_index', database, live_status_verified: false };
  const stat = fs.statSync(database, { throwIfNoEntry: false });
  if (!stat) return { ...source, status: 'index_absent', sections: [] };
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; BEGIN');
    const hasTable = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?");
    const sections = [];
    function collect(name: string, select: string, where = '') {
      if (!hasTable.get(name)) return;
      const from = `FROM ${name} ${where}`;
      const count = db.prepare(`SELECT count(*) AS total ${from}`).get()!.total;
      const items = db.prepare(`SELECT ${select} ${from} ORDER BY updated_at DESC, rowid DESC LIMIT ?`).all(limit);
      return { kind: name, total: count, items };
    }
    const launches = collect('stage_run_launches',
      'workflow_id, stage_run_id, domain_id, stage_id, launch_status AS last_recorded_status, terminal_status, updated_at');
    const attempts = collect('stage_attempts',
      'workflow_id, stage_attempt_id, task_id, domain_id, stage_id, status AS last_recorded_status, updated_at',
      "WHERE provider_kind='temporal'");
    if (launches) sections.push(launches);
    if (attempts) sections.push(attempts);
    return { ...source, status: sections.length ? 'read' : 'no_stage_index', limit_per_section: limit, sections };
  } finally {
    db.close();
  }
}
