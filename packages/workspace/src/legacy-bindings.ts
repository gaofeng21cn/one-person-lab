import fs from 'node:fs';
import path from 'node:path';
import { isRecord, txImmediate, type SqliteDb } from '@opl/core';

interface LegacyBinding {
  binding_id: string;
  project_id: string;
  project_scope_id: string | null;
  status: 'active' | 'inactive';
  label: string | null;
  created_at: string;
  updated_at: string;
}

function existingBindings(registry: unknown): Map<string, LegacyBinding[]> {
  if (!isRecord(registry) || registry.version !== 'g2' || !Array.isArray(registry.bindings)) {
    throw new Error('Unrecognized v1 workspace registry format.');
  }
  const roots = new Map<string, LegacyBinding[]>();
  for (const raw of registry.bindings) {
    if (!isRecord(raw) || (raw.status !== 'active' && raw.status !== 'inactive')
      || typeof raw.binding_id !== 'string' || !raw.binding_id
      || typeof raw.project_id !== 'string' || !raw.project_id
      || typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string'
      || typeof raw.workspace_path !== 'string' || !path.isAbsolute(raw.workspace_path)) continue;
    let root: string;
    try {
      root = fs.realpathSync(raw.workspace_path);
      if (!fs.statSync(root).isDirectory()) continue;
    } catch {
      // A removable volume may be available on a later daemon start.
      continue;
    }
    const bindings = roots.get(root) ?? [];
    bindings.push({
      binding_id: raw.binding_id,
      project_id: raw.project_id,
      project_scope_id: typeof raw.project_scope_id === 'string' ? raw.project_scope_id : null,
      status: raw.status,
      label: typeof raw.label === 'string' ? raw.label : null,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    });
    roots.set(root, bindings);
  }
  return roots;
}

export function importLegacyWorkspaceBindings(db: SqliteDb, stateDir: string): void {
  const registryPath = path.join(stateDir, 'workspace-registry.json');
  let roots: Map<string, LegacyBinding[]>;
  try {
    if (!fs.statSync(registryPath, { throwIfNoEntry: false })?.isFile()) return;
    roots = existingBindings(JSON.parse(fs.readFileSync(registryPath, 'utf8')));
  } catch {
    process.emitWarning('Could not read the v1 workspace registry. Registered v2 workspaces remain available.');
    return;
  }
  if (!roots.size) return;
  txImmediate(db, () => {
    const find = db.prepare('SELECT workspace_id, metadata_json FROM workspaces WHERE root_path = ?');
    const insert = db.prepare(
      'INSERT INTO workspaces (workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT(workspace_id) DO NOTHING',
    );
    const update = db.prepare('UPDATE workspaces SET metadata_json = ?, revision = revision + 1 WHERE workspace_id = ?');
    for (const [root, bindings] of roots) {
      const existing = find.get(root) as { workspace_id: string; metadata_json: string } | undefined;
      if (existing) {
        const metadata = JSON.parse(existing.metadata_json);
        if (!isRecord(metadata)) continue;
        const previous = metadata.legacy_workspace_bindings ?? [];
        if (!Array.isArray(previous)) continue;
        const ids = new Set(previous.filter(isRecord).map(binding => binding.binding_id));
        const missing = bindings.filter(binding => !ids.has(binding.binding_id));
        if (missing.length) {
          update.run(JSON.stringify({ ...metadata, legacy_workspace_bindings: [...previous, ...missing] }), existing.workspace_id);
        }
        continue;
      }
      const primary = bindings.find(binding => binding.status === 'active') ?? bindings[0]!;
      insert.run(primary.binding_id, primary.label || path.basename(root) || 'workspace', root,
        primary.project_id, JSON.stringify({ legacy_workspace_bindings: bindings }), primary.created_at, primary.updated_at);
    }
  });
}
