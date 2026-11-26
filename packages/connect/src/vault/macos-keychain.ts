import { spawn } from 'node:child_process';

import { newId, nowIso } from '@opl/core';

import { ConnectError } from '../errors.ts';
import { isVaultOwnedHandle, normalizeCredentialHandle } from '../sanitize.ts';
import type { PutSecretInput, SecretMetadata, SecretVault } from './types.ts';

export interface KeychainCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type KeychainCommandRunner = (
  args: readonly string[],
  stdinText?: string,
) => Promise<KeychainCommandResult>;

export interface MacOsKeychainSecretVaultOptions {
  readonly serviceName?: string;
  readonly runner?: KeychainCommandRunner;
}

const DEFAULT_KEYCHAIN_SERVICE = 'io.opl.connect.vault';

function defaultSecurityRunner(
  args: readonly string[],
  stdinText?: string,
): Promise<KeychainCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/security', [...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    if (stdinText !== undefined) {
      child.stdin.write(stdinText, 'utf8');
    }
    child.stdin.end();
  });
}

function isInteractionNotAllowed(result: KeychainCommandResult): boolean {
  return result.exitCode === 36 || /errSecInteractionNotAllowed|User interaction is not allowed/i.test(result.stderr);
}

function isItemNotFound(result: KeychainCommandResult): boolean {
  return result.exitCode === 44 || /SecKeychainSearchCopyNext|could not be found in the keychain/i.test(result.stderr);
}

function encodeEnvelope(secret: string, version: number, createdAt: string, updatedAt: string): string {
  const payload = JSON.stringify({
    v: version,
    secret_b64: Buffer.from(secret, 'utf8').toString('base64'),
    created_at: createdAt,
    updated_at: updatedAt,
  });
  return Buffer.from(payload, 'utf8').toString('hex');
}

function decodeSecretPayload(rawStdout: string): string {
  const trimmed = rawStdout.trim();
  if (!trimmed) {
    throw new ConnectError('VAULT_ERROR', 'Keychain returned empty secret payload.');
  }
  let text = trimmed;
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    text = Buffer.from(trimmed, 'hex').toString('utf8');
  }
  try {
    const parsed = JSON.parse(text) as { secret_b64?: unknown };
    if (typeof parsed.secret_b64 === 'string') {
      return Buffer.from(parsed.secret_b64, 'base64').toString('utf8');
    }
  } catch {
    // Plaintext entry stored directly
  }
  return text;
}

export class MacOsKeychainSecretVault implements SecretVault {
  readonly backend = 'macos_keychain' as const;
  readonly #serviceName: string;
  readonly #runner: KeychainCommandRunner;
  readonly #hasInjectedRunner: boolean;

  constructor(options: MacOsKeychainSecretVaultOptions = {}) {
    this.#serviceName = options.serviceName?.trim() || DEFAULT_KEYCHAIN_SERVICE;
    this.#hasInjectedRunner = typeof options.runner === 'function';
    this.#runner = options.runner ?? defaultSecurityRunner;
  }

  async putSecret(input: PutSecretInput): Promise<SecretMetadata> {
    this.assertAvailable();
    if (typeof input?.secret !== 'string' || input.secret.length === 0) {
      throw new ConnectError('INVALID_INPUT', 'Secret value must be a non-empty string.');
    }
    const handle = `vault:keychain:${newId('sec')}`;
    const now = nowIso();
    await this.writeHandle(handle, input.secret, 1, now, now);
    return Object.freeze({
      handle,
      backend: this.backend,
      version: 1,
      created_at: now,
      updated_at: now,
    });
  }

  async getSecret(handle: string): Promise<string | null> {
    this.assertAvailable();
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return null;
    const result = await this.#runner([
      'find-generic-password',
      '-s',
      this.#serviceName,
      '-a',
      clean,
      '-w',
    ]);
    if (result.exitCode === 0) {
      return decodeSecretPayload(result.stdout);
    }
    if (isItemNotFound(result)) return null;
    if (isInteractionNotAllowed(result)) {
      throw new ConnectError('KEYCHAIN_INTERACTION_REQUIRED', 'macOS Keychain requires user interaction.');
    }
    throw new ConnectError('VAULT_ERROR', 'Failed to read secret from macOS Keychain.');
  }

  async hasSecret(handle: string): Promise<boolean> {
    this.assertAvailable();
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return false;
    const result = await this.#runner([
      'find-generic-password',
      '-s',
      this.#serviceName,
      '-a',
      clean,
    ]);
    if (result.exitCode === 0) return true;
    if (isItemNotFound(result)) return false;
    if (isInteractionNotAllowed(result)) {
      throw new ConnectError('KEYCHAIN_INTERACTION_REQUIRED', 'macOS Keychain requires user interaction.');
    }
    throw new ConnectError('VAULT_ERROR', 'Failed to probe secret in macOS Keychain.');
  }

  async deleteSecret(handle: string): Promise<boolean> {
    this.assertAvailable();
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return false;
    const result = await this.#runner([
      'delete-generic-password',
      '-s',
      this.#serviceName,
      '-a',
      clean,
    ]);
    if (result.exitCode === 0) return true;
    if (isItemNotFound(result)) return false;
    if (isInteractionNotAllowed(result)) {
      throw new ConnectError('KEYCHAIN_INTERACTION_REQUIRED', 'macOS Keychain requires user interaction.');
    }
    throw new ConnectError('VAULT_ERROR', 'Failed to delete secret from macOS Keychain.');
  }

  async rotateSecret(oldHandle: string, nextSecret: string): Promise<SecretMetadata> {
    this.assertAvailable();
    if (typeof nextSecret !== 'string' || nextSecret.length === 0) {
      throw new ConnectError('INVALID_INPUT', 'Next secret value must be a non-empty string.');
    }
    const cleanOld = normalizeCredentialHandle(oldHandle);
    const nextHandle = `vault:keychain:${newId('sec')}`;
    const now = nowIso();
    await this.writeHandle(nextHandle, nextSecret, 1, now, now);
    await this.deleteSecret(cleanOld).catch(() => false);
    return Object.freeze({
      handle: nextHandle,
      backend: this.backend,
      version: 1,
      created_at: now,
      updated_at: now,
    });
  }

  toJSON(): { backend: 'macos_keychain'; service: string } {
    return {
      backend: this.backend,
      service: this.#serviceName,
    };
  }

  [Symbol.for('nodejs.util.inspect.custom')](): { backend: 'macos_keychain'; service: string } {
    return this.toJSON();
  }

  private assertAvailable(): void {
    if (!this.#hasInjectedRunner && process.platform !== 'darwin') {
      throw new ConnectError('VAULT_ERROR', 'MacOsKeychainSecretVault is only supported on macOS.');
    }
  }

  private async writeHandle(
    handle: string,
    secret: string,
    version: number,
    createdAt: string,
    updatedAt: string,
  ): Promise<void> {
    const hexPayload = encodeEnvelope(secret, version, createdAt, updatedAt);
    const stdinCmd = `add-generic-password -U -s ${JSON.stringify(this.#serviceName)} -a ${JSON.stringify(handle)} -X ${hexPayload}\n`;
    const result = await this.#runner(['-i'], stdinCmd);
    if (result.exitCode === 0) return;
    if (isInteractionNotAllowed(result)) {
      throw new ConnectError('KEYCHAIN_INTERACTION_REQUIRED', 'macOS Keychain requires user interaction.');
    }
    throw new ConnectError('VAULT_ERROR', 'Failed to store secret in macOS Keychain.');
  }
}
