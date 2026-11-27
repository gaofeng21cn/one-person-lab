import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { resolveStatePaths } from '@opl/core';

const stateDirectory = new AsyncLocalStorage<string>();

export function withGatewayStateDirectory<T>(directory: string, operation: () => T): T {
  return stateDirectory.run(directory, operation);
}

export function gatewayStorePaths() {
  const paths = resolveStatePaths({ stateDir: stateDirectory.getStore() });
  let directory = path.join(paths.state_dir, 'gateway');
  // Older native installations used the macOS layout on every platform.
  // Keep their single existing session available after a native upgrade.
  if (process.platform !== 'darwin' && !fs.existsSync(directory)) {
    const defaultRoot = process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(paths.home_dir, 'AppData', 'Local'), 'OPL', 'state')
      : path.join(process.env.XDG_STATE_HOME || path.join(paths.home_dir, '.local', 'state'), 'opl');
    const legacy = path.join(paths.home_dir, 'Library', 'Application Support', 'OPL', 'state', 'gateway');
    if (path.resolve(paths.state_dir) === path.resolve(defaultRoot) && fs.existsSync(path.join(legacy, 'account.json'))) {
      directory = legacy;
    }
  }
  return {
    gateway_account_dir: directory,
    gateway_installation_file: path.join(directory, 'installation.json'),
    gateway_account_file: path.join(directory, 'account.json'),
    gateway_credentials_file: path.join(directory, 'credentials.json'),
    gateway_account_lock_file: path.join(directory, 'account.lock'),
  };
}
