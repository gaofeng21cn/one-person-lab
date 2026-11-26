import { newId, nowIso } from '@opl/core';

import { ConnectError } from '../errors.ts';
import { isVaultOwnedHandle, normalizeCredentialHandle } from '../sanitize.ts';
import type { PutSecretInput, SecretMetadata, SecretVault } from './types.ts';

interface StoredEntry {
  readonly value: string;
  readonly metadata: SecretMetadata;
}

export class InMemorySecretVault implements SecretVault {
  readonly backend = 'memory' as const;
  readonly #secrets = new Map<string, StoredEntry>();

  async putSecret(input: PutSecretInput): Promise<SecretMetadata> {
    if (typeof input?.secret !== 'string' || input.secret.length === 0) {
      throw new ConnectError('INVALID_INPUT', 'Secret value must be a non-empty string.');
    }
    const handle = `vault:memory:${newId('sec')}`;
    const now = nowIso();
    const metadata: SecretMetadata = Object.freeze({
      handle,
      backend: this.backend,
      version: 1,
      created_at: now,
      updated_at: now,
    });
    this.#secrets.set(handle, { value: input.secret, metadata });
    return metadata;
  }

  async getSecret(handle: string): Promise<string | null> {
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return null;
    return this.#secrets.get(clean)?.value ?? null;
  }

  async hasSecret(handle: string): Promise<boolean> {
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return false;
    return this.#secrets.has(clean);
  }

  async deleteSecret(handle: string): Promise<boolean> {
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return false;
    return this.#secrets.delete(clean);
  }

  async rotateSecret(oldHandle: string, nextSecret: string): Promise<SecretMetadata> {
    if (typeof nextSecret !== 'string' || nextSecret.length === 0) {
      throw new ConnectError('INVALID_INPUT', 'Next secret value must be a non-empty string.');
    }
    const cleanOld = normalizeCredentialHandle(oldHandle);
    const prev = this.#secrets.get(cleanOld);
    const nextVersion = prev ? prev.metadata.version + 1 : 1;
    const handle = `vault:memory:${newId('sec')}`;
    const now = nowIso();
    const metadata: SecretMetadata = Object.freeze({
      handle,
      backend: this.backend,
      version: nextVersion,
      created_at: now,
      updated_at: now,
    });
    this.#secrets.set(handle, { value: nextSecret, metadata });
    if (prev) {
      this.#secrets.delete(cleanOld);
    }
    return metadata;
  }

  listHandles(): readonly SecretMetadata[] {
    return [...this.#secrets.values()].map((entry) => entry.metadata);
  }

  toJSON(): { backend: 'memory'; handles: readonly SecretMetadata[] } {
    return {
      backend: this.backend,
      handles: this.listHandles(),
    };
  }

  [Symbol.for('nodejs.util.inspect.custom')](): { backend: 'memory'; count: number } {
    return {
      backend: this.backend,
      count: this.#secrets.size,
    };
  }
}
