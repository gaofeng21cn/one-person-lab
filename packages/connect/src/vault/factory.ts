import { EncryptedFileSecretVault } from './encrypted-file.ts';
import { InMemorySecretVault } from './in-memory.ts';
import { MacOsKeychainSecretVault, type KeychainCommandRunner } from './macos-keychain.ts';
import type { SecretVault } from './types.ts';

export interface CreateDefaultSecretVaultOptions {
  readonly backend?: 'memory' | 'encrypted_file' | 'macos_keychain';
  readonly stateDir?: string;
  readonly masterKey?: Uint8Array | string;
  readonly preferOsKeychain?: boolean;
  readonly keychainServiceName?: string;
  readonly keychainRunner?: KeychainCommandRunner;
}

function isAutomatedTestContext(): boolean {
  return Boolean(
    process.env.NODE_TEST_CONTEXT?.trim()
    || process.env.JEST_WORKER_ID?.trim()
    || process.env.VITEST_WORKER_ID?.trim()
    || process.env.CI?.trim(),
  );
}

export function createDefaultSecretVault(
  options: CreateDefaultSecretVaultOptions = {},
): SecretVault {
  if (options.backend === 'memory') {
    return new InMemorySecretVault();
  }
  if (options.backend === 'macos_keychain') {
    return new MacOsKeychainSecretVault({
      serviceName: options.keychainServiceName,
      runner: options.keychainRunner,
    });
  }
  if (options.backend === 'encrypted_file') {
    return new EncryptedFileSecretVault({
      stateDir: options.stateDir,
      masterKey: options.masterKey,
    });
  }

  const canUseKeychain =
    process.platform === 'darwin'
    && options.preferOsKeychain === true
    && !isAutomatedTestContext();

  if (canUseKeychain) {
    return new MacOsKeychainSecretVault({
      serviceName: options.keychainServiceName,
      runner: options.keychainRunner,
    });
  }

  return new EncryptedFileSecretVault({
    stateDir: options.stateDir,
    masterKey: options.masterKey,
  });
}
