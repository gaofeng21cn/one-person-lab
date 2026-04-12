import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type FrontDeskStatePaths = {
  home_dir: string;
  state_dir: string;
  workspace_registry_file: string;
  session_ledger_file: string;
  service_config_file: string;
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
    service_config_file: path.join(stateDir, 'service-config.json'),
  };
}

export function ensureFrontDeskStateDir(paths = resolveFrontDeskStatePaths()) {
  fs.mkdirSync(paths.state_dir, { recursive: true });
  return paths;
}
