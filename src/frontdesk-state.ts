import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type FrontDeskStatePaths = {
  home_dir: string;
  state_dir: string;
  workspace_registry_file: string;
  workspace_root_file: string;
  session_ledger_file: string;
  task_state_dir: string;
  runtime_modes_file: string;
  update_channel_file: string;
  service_config_file: string;
  desktop_config_file: string;
  desktop_pilot_root: string;
};

function normalizeExplicitStateDir() {
  return process.env.OPL_STATE_DIR?.trim() || null;
}

export function resolveFrontDeskStatePaths(): FrontDeskStatePaths {
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
    service_config_file: path.join(stateDir, 'service-config.json'),
    desktop_config_file: path.join(stateDir, 'desktop-pilot', 'config', 'desktop-config.json'),
    desktop_pilot_root: path.join(stateDir, 'desktop-pilot'),
  };
}

export function ensureFrontDeskStateDir(paths = resolveFrontDeskStatePaths()) {
  fs.mkdirSync(paths.state_dir, { recursive: true });
  return paths;
}
