import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { legacyDefaultStateEntry, resolveStatePaths, txImmediate, type SqliteDb } from '@opl/core';
import { DaemonRpcError } from '../errors.ts';

export function initializeWorkspaceRoot(db: SqliteDb, stateDir: string): void {
  txImmediate(db, () => {
    if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'workspace_root_preferences'").get()) return;
    db.exec(`
      CREATE TABLE workspace_root_preferences (
        preference_id INTEGER PRIMARY KEY CHECK(preference_id = 1),
        selected_path TEXT,
        status TEXT NOT NULL CHECK(status IN ('configured', 'invalid')),
        updated_at TEXT NOT NULL
      );
    `);
    const current = path.join(stateDir, 'workspace-root.json');
    const legacy = legacyDefaultStateEntry(resolveStatePaths({ stateDir }), 'workspace-root.json');
    let file = current;
    if (!fs.existsSync(current) && legacy && fs.existsSync(legacy)) file = legacy;
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      const selected = typeof value?.selected_path === 'string' ? value.selected_path.trim() : '';
      if (value?.selected_path !== null && !selected) throw new Error('Invalid workspace root preference.');
      if (selected) {
        db.prepare("INSERT OR IGNORE INTO workspace_root_preferences (preference_id, selected_path, status, updated_at) VALUES (1, ?, 'configured', ?)")
          .run(selected, typeof value.updated_at === 'string' ? value.updated_at : new Date(0).toISOString());
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      db.prepare("INSERT INTO workspace_root_preferences (preference_id, selected_path, status, updated_at) VALUES (1, NULL, 'invalid', ?)")
        .run(new Date(0).toISOString());
    }
  });
}

export function readWorkspaceRoot(db: SqliteDb) {
  let selected: string | null = process.env.OPL_WORKSPACE_ROOT?.trim() || null;
  let source: 'env' | 'state' | 'default_home' = 'env';
  if (!selected) {
    source = 'state';
    const row = db.prepare('SELECT selected_path, status FROM workspace_root_preferences WHERE preference_id = 1').get() as
      { selected_path: string | null; status: string } | undefined;
    if (row?.status === 'invalid') {
      return { selected_path: null, source, exists: false, writable: false, health_status: 'attention_needed' } as const;
    }
    selected = row?.selected_path ?? null;
    if (!selected) {
      source = 'default_home';
      selected = process.env.HOME?.trim() || os.homedir();
    }
  }
  let exists = false;
  let writable = false;
  try {
    exists = fs.statSync(selected).isDirectory();
    if (exists) {
      fs.accessSync(selected, fs.constants.W_OK);
      writable = true;
    }
  } catch { /* A missing or inaccessible selection can be repaired in Settings. */ }
  return { selected_path: selected, source, exists, writable, health_status: writable ? 'ready' : 'attention_needed' } as const;
}

export const workspaceRootAction = {
  action_id: 'workspace_root_set',
  label: 'Configure workspace root',
  owner: 'one-person-lab',
  route: 'opl app action execute --action workspace_root_set',
  delegated_surface: 'opl workspace root set',
  payload_fields: ['path'],
  mutates: 'opl_workspace_root_config',
  dry_run_supported: true,
  confirmation_required: false,
} as const;

export function executeWorkspaceRootAction(db: SqliteDb, payload: Record<string, unknown>, dryRun: boolean) {
  if (process.env.OPL_WORKSPACE_ROOT?.trim()) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'The deployment manages the workspace root.');
  }
  const requested = payload.path ?? payload.workspace_root ?? payload.workspaceRoot;
  if (typeof requested !== 'string' || !requested.trim()) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Choose an existing directory.');
  }
  const selected = path.resolve(requested.trim());
  if (!fs.statSync(selected, { throwIfNoEntry: false })?.isDirectory()) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Choose an existing directory.');
  }
  if (!dryRun) {
    db.prepare(`
      INSERT INTO workspace_root_preferences (preference_id, selected_path, status, updated_at) VALUES (1, ?, 'configured', ?)
      ON CONFLICT(preference_id) DO UPDATE SET selected_path=excluded.selected_path, status='configured', updated_at=excluded.updated_at
    `).run(selected, new Date().toISOString());
  }
  return {
    ok: true, status: dryRun ? 'preview' : 'executed',
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1', action_id: workspaceRootAction.action_id,
      dry_run: dryRun, delegated_surface: workspaceRootAction.delegated_surface,
      result: { workspace_root: dryRun
        ? { selected_path: selected, status: 'dry_run' }
        : readWorkspaceRoot(db) },
    },
  };
}
