import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type OplStatePaths = {
  home_dir: string;
  state_dir: string;
  workspace_registry_file: string;
  workspace_root_file: string;
  session_ledger_file: string;
  task_state_dir: string;
  runtime_modes_file: string;
  update_channel_file: string;
  developer_supervisor_config_file: string;
  external_evidence_ledger_file: string;
  managed_install_update_ledger_file: string;
  oma_app_live_path_ledger_file: string;
  oma_production_consumption_ledger_file: string;
  app_release_user_path_evidence_ledger_file: string;
  developer_mode_closeout_ledger_file: string;
  domain_manifest_projection_cache_file: string;
  desktop_config_file: string;
  desktop_pilot_root: string;
};

function normalizeExplicitStateDir() {
  return process.env.OPL_STATE_DIR?.trim() || null;
}

export function resolveOplStatePaths(): OplStatePaths {
  const explicitStateDir = normalizeExplicitStateDir();
  const homeDir = process.env.HOME?.trim() || os.homedir();
  const stateDir = explicitStateDir
    ? path.resolve(explicitStateDir)
    : path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');

  return {
    home_dir: homeDir,
    state_dir: stateDir,
    workspace_registry_file: path.join(stateDir, 'workspace-registry.json'),
    workspace_root_file: path.join(stateDir, 'workspace-root.json'),
    session_ledger_file: path.join(stateDir, 'session-ledger.json'),
    task_state_dir: path.join(stateDir, 'tasks'),
    runtime_modes_file: path.join(stateDir, 'runtime-modes.json'),
    update_channel_file: path.join(stateDir, 'update-channel.json'),
    developer_supervisor_config_file: path.join(stateDir, 'developer-supervisor.json'),
    external_evidence_ledger_file: path.join(stateDir, 'external-evidence-ledger.json'),
    managed_install_update_ledger_file: path.join(stateDir, 'managed-install-update-ledger.json'),
    oma_app_live_path_ledger_file: path.join(stateDir, 'oma-app-live-path-ledger.json'),
    oma_production_consumption_ledger_file: path.join(
      stateDir,
      'oma-production-consumption-ledger.json',
    ),
    app_release_user_path_evidence_ledger_file: path.join(
      stateDir,
      'app-release-user-path-evidence-ledger.json',
    ),
    developer_mode_closeout_ledger_file: path.join(stateDir, 'developer-mode-closeout-ledger.json'),
    domain_manifest_projection_cache_file: path.join(stateDir, 'domain-manifest-projection-cache.json'),
    desktop_config_file: path.join(stateDir, 'desktop-pilot', 'config', 'desktop-config.json'),
    desktop_pilot_root: path.join(stateDir, 'desktop-pilot'),
  };
}

export function ensureOplStateDir(paths = resolveOplStatePaths()) {
  fs.mkdirSync(paths.state_dir, { recursive: true });
  return paths;
}
