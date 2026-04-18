import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type FrontDeskStatePaths = {
  home_dir: string;
  state_dir: string;
  workspace_registry_file: string;
  session_ledger_file: string;
  task_state_dir: string;
  service_config_file: string;
  desktop_config_file: string;
  desktop_pilot_root: string;
  librechat_service_file: string;
  librechat_pilot_root: string;
  paperclip_control_plane_file: string;
  paperclip_projection_registry_file: string;
  paperclip_operator_loop_file: string;
};

export function resolveFrontDeskStatePaths(): FrontDeskStatePaths {
  const explicitStateDir = process.env.OPL_FRONTDESK_STATE_DIR?.trim();
  const homeDir = process.env.HOME?.trim() || os.homedir();
  const stateDir = explicitStateDir || path.join(homeDir, 'Library', 'Application Support', 'OPL', 'frontdesk');

  return {
    home_dir: homeDir,
    state_dir: stateDir,
    workspace_registry_file: path.join(stateDir, 'workspace-registry.json'),
    session_ledger_file: path.join(stateDir, 'session-ledger.json'),
    task_state_dir: path.join(stateDir, 'tasks'),
    service_config_file: path.join(stateDir, 'service-config.json'),
    desktop_config_file: path.join(stateDir, 'desktop-pilot', 'config', 'desktop-config.json'),
    desktop_pilot_root: path.join(stateDir, 'desktop-pilot'),
    librechat_service_file: path.join(stateDir, 'librechat-service.json'),
    librechat_pilot_root: path.join(stateDir, 'librechat-pilot'),
    paperclip_control_plane_file: path.join(stateDir, 'paperclip-control-plane.json'),
    paperclip_projection_registry_file: path.join(stateDir, 'paperclip-projection-registry.json'),
    paperclip_operator_loop_file: path.join(stateDir, 'paperclip-operator-loop.json'),
  };
}

export function ensureFrontDeskStateDir(paths = resolveFrontDeskStatePaths()) {
  fs.mkdirSync(paths.state_dir, { recursive: true });
  return paths;
}
