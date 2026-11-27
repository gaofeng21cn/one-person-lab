import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStatePaths } from '@opl/core';
import { DaemonRpcError } from '../errors.ts';

const preferenceFile = 'workspace-root.json';

export function workspaceRootPreferencePath(stateDir: string) {
  const current = path.join(stateDir, preferenceFile);
  if (process.platform === 'darwin' || fs.existsSync(current) || process.env.OPL_STATE_DIR || process.env.OPL_DATA_DIR
      || stateDir !== resolveStatePaths().state_dir) return current;
  // v1 used this location by default on all three desktop platforms.
  const previous = path.join(os.homedir(), 'Library', 'Application Support', 'OPL', 'state', preferenceFile);
  return fs.existsSync(previous) ? previous : current;
}

export function readWorkspaceRoot(stateDir: string) {
  let selected: string | null = process.env.OPL_WORKSPACE_ROOT?.trim() || null;
  let source: 'env' | 'state' | 'default_home' = 'env';
  if (!selected) {
    source = 'state';
    try {
      const stored = JSON.parse(fs.readFileSync(workspaceRootPreferencePath(stateDir), 'utf8'));
      selected = typeof stored?.selected_path === 'string' ? stored.selected_path.trim() || null : null;
      if (stored?.selected_path !== null && !selected) throw new Error('Invalid workspace root preference.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return { selected_path: null, source, exists: false, writable: false, health_status: 'attention_needed' } as const;
      }
    }
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

export function executeWorkspaceRootAction(stateDir: string, payload: Record<string, unknown>, dryRun: boolean) {
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
    const target = workspaceRootPreferencePath(stateDir);
    const temporary = target + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({
        version: 'g1', selected_path: selected, updated_at: new Date().toISOString(),
      }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, target);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  return {
    ok: true, status: dryRun ? 'preview' : 'executed',
    app_action_execution: {
      surface_kind: 'opl_app_action_execution.v1', action_id: workspaceRootAction.action_id,
      dry_run: dryRun, delegated_surface: workspaceRootAction.delegated_surface,
      result: { workspace_root: dryRun ? { selected_path: selected, status: 'dry_run' } : readWorkspaceRoot(stateDir) },
    },
  };
}
