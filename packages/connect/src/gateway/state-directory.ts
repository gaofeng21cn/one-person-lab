import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { legacyDefaultStateEntry, resolveStatePaths } from '@opl/core';

const stateDirectory = new AsyncLocalStorage<string>();

export function withGatewayStateDirectory<T>(directory: string, operation: () => T): T {
  return stateDirectory.run(directory, operation);
}

export function gatewayStorePaths() {
  const paths = resolveStatePaths({ stateDir: stateDirectory.getStore() });
  const directory = path.join(paths.state_dir, 'gateway');
  return {
    gateway_account_dir: directory,
    gateway_installation_file: path.join(directory, 'installation.json'),
    gateway_account_file: path.join(directory, 'account.json'),
    gateway_credentials_file: path.join(directory, 'credentials.json'),
    gateway_account_lock_file: path.join(directory, 'account.lock'),
  };
}

export function legacyGatewayDirectory() {
  return legacyDefaultStateEntry(resolveStatePaths({ stateDir: stateDirectory.getStore() }), 'gateway');
}
