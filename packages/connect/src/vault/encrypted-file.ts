import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  isRecord,
  newId,
  nowIso,
  resolveStatePaths,
  withAdvisoryLockSync,
  writeExclusiveFileSync,
} from '@opl/core';

import { ConnectError } from '../errors.ts';
import { isVaultOwnedHandle, normalizeCredentialHandle } from '../sanitize.ts';
import type { PutSecretInput, SecretMetadata, SecretVault } from './types.ts';

interface EncryptedVaultRecord {
  readonly handle: string;
  readonly backend: 'encrypted_file';
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly iv_b64: string;
  readonly tag_b64: string;
  readonly ciphertext_b64: string;
}

interface EncryptedVaultFile {
  readonly schema_version: 'opl.connect.vault.v1';
  readonly entries: Record<string, EncryptedVaultRecord>;
}

export interface EncryptedFileSecretVaultOptions {
  readonly stateDir?: string;
  readonly vaultFile?: string;
  readonly keyFile?: string;
  readonly masterKey?: Uint8Array | string;
  readonly lockTimeoutMs?: number;
}

function parseMasterKeyInput(raw: Uint8Array | string): Buffer {
  if (raw instanceof Uint8Array) {
    if (raw.byteLength !== 32) {
      throw new ConnectError('VAULT_ERROR', 'Master key must be exactly 32 bytes.');
    }
    return Buffer.from(raw);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
  }
  throw new ConnectError('VAULT_ERROR', 'Master key must be a 32-byte Uint8Array or 64-hex string.');
}

function writeFileAtomicSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tempPath = `${targetPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    const fd = fs.openSync(tempPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempPath, targetPath);
    fs.chmodSync(targetPath, 0o600);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function buildAad(handle: string, version: number): Buffer {
  return Buffer.from(`${handle}|v${version}`, 'utf8');
}

function encryptSecret(
  key: Buffer,
  handle: string,
  version: number,
  plaintext: string,
): { iv_b64: string; tag_b64: string; ciphertext_b64: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(buildAad(handle, version));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv_b64: iv.toString('base64'),
    tag_b64: tag.toString('base64'),
    ciphertext_b64: encrypted.toString('base64'),
  };
}

function decryptSecret(key: Buffer, record: EncryptedVaultRecord, expectedHandle: string): string {
  try {
    const iv = Buffer.from(record.iv_b64, 'base64');
    const tag = Buffer.from(record.tag_b64, 'base64');
    const ciphertext = Buffer.from(record.ciphertext_b64, 'base64');
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error('Invalid IV or tag length.');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(buildAad(expectedHandle, record.version));
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new ConnectError('VAULT_ERROR', 'Failed to decrypt secret from encrypted vault.', {
      cause: error,
    });
  }
}

export class EncryptedFileSecretVault implements SecretVault {
  readonly backend = 'encrypted_file' as const;
  readonly vaultFile: string;
  readonly keyFile: string;
  readonly #lockFile: string;
  readonly #lockTimeoutMs: number;
  readonly #explicitMasterKey: Buffer | null;

  constructor(options: EncryptedFileSecretVaultOptions = {}) {
    let resolvedConnectDir: string | null = null;
    if (!options.vaultFile || (!options.masterKey && !options.keyFile)) {
      const paths = resolveStatePaths({ stateDir: options.stateDir });
      resolvedConnectDir = path.join(paths.state_dir, 'connect');
    }
    this.vaultFile = path.resolve(
      options.vaultFile ?? path.join(resolvedConnectDir!, 'vault.enc.json'),
    );
    this.keyFile = path.resolve(
      options.keyFile ?? path.join(path.dirname(this.vaultFile), 'vault.master.key'),
    );
    this.#lockFile = `${this.vaultFile}.lock`;
    this.#lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    this.#explicitMasterKey = options.masterKey !== undefined
      ? parseMasterKeyInput(options.masterKey)
      : null;
  }

  async putSecret(input: PutSecretInput): Promise<SecretMetadata> {
    if (typeof input?.secret !== 'string' || input.secret.length === 0) {
      throw new ConnectError('INVALID_INPUT', 'Secret value must be a non-empty string.');
    }
    const handle = `vault:encfile:${newId('sec')}`;
    const now = nowIso();
    return this.withLockedStore((store, key) => {
      const sealed = encryptSecret(key, handle, 1, input.secret);
      const record: EncryptedVaultRecord = {
        handle,
        backend: this.backend,
        version: 1,
        created_at: now,
        updated_at: now,
        ...sealed,
      };
      store.entries[handle] = record;
      this.writeStoreSync(store);
      return Object.freeze({
        handle: record.handle,
        backend: record.backend,
        version: record.version,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    });
  }

  async getSecret(handle: string): Promise<string | null> {
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return null;
    return this.withLockedStore((store, key) => {
      const record = store.entries[clean];
      if (!record) return null;
      return decryptSecret(key, record, clean);
    });
  }

  async hasSecret(handle: string): Promise<boolean> {
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return false;
    return withAdvisoryLockSync(
      this.#lockFile,
      () => {
        const store = this.readStoreSync();
        return Object.hasOwn(store.entries, clean);
      },
      { timeoutMs: this.#lockTimeoutMs, mode: 0o600 },
    );
  }

  async deleteSecret(handle: string): Promise<boolean> {
    const clean = normalizeCredentialHandle(handle);
    if (!isVaultOwnedHandle(clean)) return false;
    return withAdvisoryLockSync(
      this.#lockFile,
      () => {
        const store = this.readStoreSync();
        if (!Object.hasOwn(store.entries, clean)) return false;
        delete store.entries[clean];
        this.writeStoreSync(store);
        return true;
      },
      { timeoutMs: this.#lockTimeoutMs, mode: 0o600 },
    );
  }

  async rotateSecret(oldHandle: string, nextSecret: string): Promise<SecretMetadata> {
    if (typeof nextSecret !== 'string' || nextSecret.length === 0) {
      throw new ConnectError('INVALID_INPUT', 'Next secret value must be a non-empty string.');
    }
    const cleanOld = normalizeCredentialHandle(oldHandle);
    const nextHandle = `vault:encfile:${newId('sec')}`;
    const now = nowIso();
    return this.withLockedStore((store, key) => {
      const prev = store.entries[cleanOld];
      const nextVersion = prev ? prev.version + 1 : 1;
      const sealed = encryptSecret(key, nextHandle, nextVersion, nextSecret);
      const record: EncryptedVaultRecord = {
        handle: nextHandle,
        backend: this.backend,
        version: nextVersion,
        created_at: now,
        updated_at: now,
        ...sealed,
      };
      store.entries[nextHandle] = record;
      if (prev) {
        delete store.entries[cleanOld];
      }
      this.writeStoreSync(store);
      return Object.freeze({
        handle: record.handle,
        backend: record.backend,
        version: record.version,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    });
  }

  listHandles(): readonly SecretMetadata[] {
    const store = this.readStoreSync();
    return Object.values(store.entries).map((entry) =>
      Object.freeze({
        handle: entry.handle,
        backend: entry.backend,
        version: entry.version,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
      }),
    );
  }

  toJSON(): { backend: 'encrypted_file'; vault_file: string; handles: readonly SecretMetadata[] } {
    return {
      backend: this.backend,
      vault_file: this.vaultFile,
      handles: this.listHandles(),
    };
  }

  [Symbol.for('nodejs.util.inspect.custom')](): { backend: 'encrypted_file'; vault_file: string } {
    return {
      backend: this.backend,
      vault_file: this.vaultFile,
    };
  }

  private ensureDirsSync(): void {
    fs.mkdirSync(path.dirname(this.vaultFile), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.dirname(this.keyFile), { recursive: true, mode: 0o700 });
  }

  private loadOrCreateMasterKeySync(): Buffer {
    if (this.#explicitMasterKey) {
      return Buffer.from(this.#explicitMasterKey);
    }
    this.ensureDirsSync();
    if (fs.existsSync(this.keyFile)) {
      const raw = fs.readFileSync(this.keyFile);
      if (raw.byteLength === 32) {
        return raw;
      }
      const asText = raw.toString('utf8').trim();
      if (/^[0-9a-fA-F]{64}$/.test(asText)) {
        return Buffer.from(asText, 'hex');
      }
      throw new ConnectError('VAULT_ERROR', 'Vault master key file is corrupted.');
    }
    if (fs.existsSync(this.vaultFile)) {
      throw new ConnectError(
        'VAULT_ERROR',
        'Vault master key file is missing for an existing encrypted vault.',
      );
    }
    const generated = crypto.randomBytes(32);
    try {
      writeExclusiveFileSync(this.keyFile, generated, 0o600);
      return generated;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const raw = fs.readFileSync(this.keyFile);
        if (raw.byteLength === 32) return raw;
      }
      throw new ConnectError('VAULT_ERROR', 'Failed to initialize vault master key file.', {
        cause: error,
      });
    }
  }

  private readStoreSync(): EncryptedVaultFile {
    if (!fs.existsSync(this.vaultFile)) {
      return { schema_version: 'opl.connect.vault.v1', entries: {} };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.vaultFile, 'utf8'));
    } catch (error) {
      throw new ConnectError('VAULT_ERROR', 'Encrypted vault file is corrupted.', {
        cause: error,
      });
    }
    if (
      !isRecord(parsed)
      || parsed.schema_version !== 'opl.connect.vault.v1'
      || !isRecord(parsed.entries)
    ) {
      throw new ConnectError('VAULT_ERROR', 'Encrypted vault file has invalid schema.');
    }
    const entries: Record<string, EncryptedVaultRecord> = {};
    for (const [k, v] of Object.entries(parsed.entries)) {
      if (
        k === '__proto__'
        || k === 'constructor'
        || k === 'prototype'
        || !isRecord(v)
        || typeof v.handle !== 'string'
        || v.handle !== k
        || typeof v.iv_b64 !== 'string'
        || typeof v.tag_b64 !== 'string'
        || typeof v.ciphertext_b64 !== 'string'
        || typeof v.version !== 'number'
        || !Number.isInteger(v.version)
        || v.version < 1
      ) {
        throw new ConnectError('VAULT_ERROR', 'Encrypted vault contains invalid entry.');
      }
      entries[k] = {
        handle: v.handle,
        backend: 'encrypted_file',
        version: v.version,
        created_at: typeof v.created_at === 'string' ? v.created_at : '',
        updated_at: typeof v.updated_at === 'string' ? v.updated_at : '',
        iv_b64: v.iv_b64,
        tag_b64: v.tag_b64,
        ciphertext_b64: v.ciphertext_b64,
      };
    }
    return { schema_version: 'opl.connect.vault.v1', entries };
  }

  private writeStoreSync(store: EncryptedVaultFile): void {
    writeFileAtomicSync(this.vaultFile, `${JSON.stringify(store, null, 2)}\n`);
  }

  private withLockedStore<T>(fn: (store: EncryptedVaultFile, key: Buffer) => T): T {
    this.ensureDirsSync();
    return withAdvisoryLockSync(
      this.#lockFile,
      () => {
        const key = this.loadOrCreateMasterKeySync();
        const store = this.readStoreSync();
        return fn(store, key);
      },
      { timeoutMs: this.#lockTimeoutMs, mode: 0o600 },
    );
  }
}
