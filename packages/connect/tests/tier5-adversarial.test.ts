import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createClientContext, openSqliteStore, runMigrations } from '@opl/core';
import {
  ConnectError,
  EncryptedFileSecretVault,
  createConnectService,
  validateHttpEndpoint,
} from '../src/index.ts';

test('T5-CONNECT-01 (G2-12): validateHttpEndpoint blocks credentials, non-http schemes, and URL-encoded secret queries/fragments', () => {
  const badEndpoints = [
    'https://user:pass@api.example.com/v1',
    'ftp://files.example.com/pub',
    'https://api.example.com/v1?%73%65%63%72%65%74=12345',
    'https://api.example.com/v1#Bearer%20eyJhbGciOiJIUzI1NiJ9.payload.signature123',
    'https://api.example.com/v1#?access_token=tok_abc_123456',
  ];
  for (const ep of badEndpoints) {
    assert.throws(
      () => validateHttpEndpoint(ep),
      (err: unknown) =>
        err instanceof ConnectError
        && (err.code === 'SECRET_PAYLOAD_FORBIDDEN' || err.code === 'INVALID_INPUT'),
      `Expected rejection for endpoint: ${ep}`,
    );
  }
});

test('T5-CONNECT-02 (G2-12): EncryptedFileSecretVault fails closed on missing master key and prototype pollution keys', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-connect-vault-'));
  try {
    const vaultFile = path.join(tmpDir, 'vault.enc.json');
    const keyFile = path.join(tmpDir, 'vault.master.key');
    const vault = new EncryptedFileSecretVault({ vaultFile, keyFile });
    await vault.putSecret({ namespace: 'mail', secret: 'super-secret-value' });

    // Remove master key while vault.enc.json exists -> must throw VAULT_ERROR
    fs.rmSync(keyFile);
    const vaultMissingKey = new EncryptedFileSecretVault({ vaultFile, keyFile });
    await assert.rejects(
      () => vaultMissingKey.putSecret({ namespace: 'mail', secret: 'another' }),
      (err: unknown) => err instanceof ConnectError && err.code === 'VAULT_ERROR',
    );

    // Prototype pollution entry key rejected
    const protoVaultFile = path.join(tmpDir, 'proto.enc.json');
    const protoKeyFile = path.join(tmpDir, 'proto.key');
    const v2 = new EncryptedFileSecretVault({ vaultFile: protoVaultFile, keyFile: protoKeyFile });
    const initMeta = await v2.putSecret({ namespace: 'ok', secret: 'init' });
    fs.writeFileSync(
      protoVaultFile,
      '{"schema_version":"opl.connect.vault.v1","entries":{"__proto__":{"handle":"__proto__","iv_b64":"AA==","tag_b64":"AA==","ciphertext_b64":"AA==","version":1}}}',
      'utf8',
    );
    await assert.rejects(
      () => v2.getSecret(initMeta.handle),
      (err: unknown) => err instanceof ConnectError && err.code === 'VAULT_ERROR',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-CONNECT-03 (G2-04 / Bug 3): ConnectAuthorizationService.requestAccess rejects untrusted client_context without consumer_bind_token', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-connect-auth-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    runMigrations(db);
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES ('victim', '1.0.0', 'agent', 'opl', 'release', ?, 'sha256:0000', ?, 1, 0, ?, ?)",
    ).run(tmpDir, JSON.stringify({ identity: { id: 'victim' } }), now, now);

    const connect = createConnectService({ db, stateDir: tmpDir });
    const appCtx = createClientContext({ session_id: 's-app', client_kind: 'opl_app' });
    const extCtx = createClientContext({ session_id: 's-ext', client_kind: 'external' });
    const conn = await connect.add(appCtx, {
      provider_type: 'github',
      display_name: 'GH',
      capabilities: [{ capability_id: 'repo.read', title: 'Read', risk: 'read' }],
      secret: 'tok-12345',
    });

    await assert.rejects(
      () =>
        connect.requestAccess({
          client_context: extCtx,
          session_id: extCtx.session_id,
          consumer_package_id: 'victim',
          connection_id: conn.connection_id,
          capability_ids: ['repo.read'],
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'TRUSTED_HOST_REQUIRED',
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
