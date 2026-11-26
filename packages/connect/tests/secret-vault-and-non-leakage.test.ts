import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import util from 'node:util';

import {
  EventBus,
  createClientContext,
  openSqliteStore,
  runMigrations,
} from '@opl/core';
import { queryTimeline } from '@opl/ledger';

import {
  ConnectError,
  ConnectProviderError,
  EncryptedFileSecretVault,
  InMemorySecretVault,
  MacOsKeychainSecretVault,
  assertCredentialHandleOnlyPayload,
  assertNoSecretPayload,
  createConnectService,
  createDefaultSecretVault,
  type ConnectEvents,
  type ConnectionProvider,
} from '../src/index.ts';

function makeTempDir(prefix = 'connect-vault-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedInstalledPackage(
  db: ReturnType<typeof openSqliteStore>,
  packageId: string,
  digest: string,
  installPath: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at) VALUES (?, '1.0.0', 'agent', 'opl', 'release', ?, ?, ?, 1, 0, ?, ?)",
  ).run(packageId, installPath, digest, JSON.stringify({ identity: { id: packageId, name: packageId } }), now, now);
}

function seedWorkspaceAndTask(
  db: ReturnType<typeof openSqliteStore>,
  workspaceRoot: string,
): { workspaceId: string; taskId: string } {
  const now = new Date().toISOString();
  const workspaceId = 'ws_connect_test';
  const taskId = 'task_connect_test';
  db.prepare(
    'INSERT INTO workspaces (workspace_id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(workspaceId, 'Connect Test WS', workspaceRoot, now, now);
  db.prepare(
    "INSERT INTO tasks (task_id, workspace_id, title, goal_prompt, status, created_at, updated_at) VALUES (?, ?, 'Connect Test', 'Verify non-leakage', 'active', ?, ?)",
  ).run(taskId, workspaceId, now, now);
  return { workspaceId, taskId };
}

test('InMemorySecretVault hides secrets from listHandles, JSON.stringify, and util.inspect', async () => {
  const vault = new InMemorySecretVault();
  const canary = 'opl_canary_mem_secret_7f6e5d4c';
  const meta = await vault.putSecret({ namespace: 'mail', secret: canary });

  assert.match(meta.handle, /^vault:memory:/);
  assert.equal(await vault.hasSecret(meta.handle), true);
  assert.equal(await vault.getSecret(meta.handle), canary);
  assert.equal(JSON.stringify(vault).includes(canary), false);
  assert.equal(util.inspect(vault).includes(canary), false);
  assert.equal(JSON.stringify(vault.listHandles()).includes(canary), false);

  const rotated = await vault.rotateSecret(meta.handle, 'opl_canary_mem_secret_next_1122');
  assert.notEqual(rotated.handle, meta.handle);
  assert.equal(await vault.hasSecret(meta.handle), false);
  assert.equal(await vault.getSecret(rotated.handle), 'opl_canary_mem_secret_next_1122');

  assert.equal(await vault.deleteSecret(rotated.handle), true);
  assert.equal(await vault.getSecret(rotated.handle), null);
});

test('EncryptedFileSecretVault encrypts with AES-256-GCM, 0o600 permissions, and fails closed on tamper/missing key', async () => {
  const tmpDir = makeTempDir('connect-encvault-');
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  try {
    const canary = 'opl_canary_secret_9a8b7c6d';
    const vault = new EncryptedFileSecretVault({ stateDir: tmpDir });
    const meta = await vault.putSecret({ namespace: 'provider-x', secret: canary });

    assert.match(meta.handle, /^vault:encfile:/);
    assert.equal(fs.statSync(vault.vaultFile).mode & 0o777, 0o600);
    assert.equal(fs.statSync(vault.keyFile).mode & 0o777, 0o600);

    const rawVaultBytes = fs.readFileSync(vault.vaultFile, 'utf8');
    const rawKeyBytes = fs.readFileSync(vault.keyFile, 'utf8');
    assert.equal(rawVaultBytes.includes(canary), false);
    assert.equal(rawKeyBytes.includes(canary), false);

    // Re-open from disk and decrypt
    const reopened = new EncryptedFileSecretVault({ stateDir: tmpDir });
    assert.equal(await reopened.getSecret(meta.handle), canary);

    // 1-byte ciphertext tamper must fail closed
    const parsed = JSON.parse(rawVaultBytes) as {
      entries: Record<string, { ciphertext_b64: string; tag_b64: string }>;
    };
    const origCipher = Buffer.from(parsed.entries[meta.handle]!.ciphertext_b64, 'base64');
    origCipher[0] = origCipher[0]! ^ 0xff;
    parsed.entries[meta.handle]!.ciphertext_b64 = origCipher.toString('base64');
    fs.writeFileSync(vault.vaultFile, JSON.stringify(parsed), 'utf8');

    await assert.rejects(
      () => reopened.getSecret(meta.handle),
      (err: unknown) => err instanceof ConnectError && err.code === 'VAULT_ERROR',
    );

    // Missing keyfile for existing vault must fail closed
    fs.rmSync(vault.keyFile, { force: true });
    const missingKeyVault = new EncryptedFileSecretVault({ stateDir: tmpDir });
    await assert.rejects(
      () => missingKeyVault.getSecret(meta.handle),
      (err: unknown) => err instanceof ConnectError && err.code === 'VAULT_ERROR',
    );
  } finally {
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MacOsKeychainSecretVault uses stdin -X hex (never argv) and createDefaultSecretVault stays non-interactive under tests', async () => {
  const defaultVault = createDefaultSecretVault({ stateDir: makeTempDir('connect-defaultvault-'), preferOsKeychain: true });
  assert.equal(defaultVault.backend, 'encrypted_file');
  fs.rmSync(path.dirname((defaultVault as EncryptedFileSecretVault).vaultFile), { recursive: true, force: true });
  // Cleanup parent temp dir
  fs.rmSync(path.dirname(path.dirname((defaultVault as EncryptedFileSecretVault).vaultFile)), { recursive: true, force: true });

  const capturedCalls: Array<{ args: readonly string[]; stdinText?: string }> = [];
  let storedHex = '';
  const keychainVault = new MacOsKeychainSecretVault({
    runner: async (args, stdinText) => {
      capturedCalls.push({ args, stdinText });
      if (args[0] === '-i' && stdinText) {
        const match = /-X\s+([0-9a-fA-F]+)/.exec(stdinText);
        if (match) storedHex = match[1]!;
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'find-generic-password' && args.includes('-w')) {
        return { exitCode: 0, stdout: storedHex, stderr: '' };
      }
      if (args[0] === 'find-generic-password') {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'delete-generic-password') {
        storedHex = '';
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 1, stdout: '', stderr: 'unexpected' };
    },
  });

  const secret = 'opl_canary_keychain_445566';
  const meta = await keychainVault.putSecret({ secret });
  assert.match(meta.handle, /^vault:keychain:/);
  // Secret must NEVER appear on command line args
  for (const call of capturedCalls) {
    assert.equal(call.args.join(' ').includes(secret), false);
  }
  assert.equal(await keychainVault.getSecret(meta.handle), secret);

  const lockedVault = new MacOsKeychainSecretVault({
    runner: async () => ({
      exitCode: 36,
      stdout: '',
      stderr: 'security: SecKeychainItemCreateFromContent: User interaction is not allowed (errSecInteractionNotAllowed)',
    }),
  });
  await assert.rejects(
    () => lockedVault.putSecret({ secret }),
    (err: unknown) => err instanceof ConnectError && err.code === 'KEYCHAIN_INTERACTION_REQUIRED',
  );
});

test('3-layer secret non-leakage across SQLite, raw DB bytes, EventBus, DTOs, Ledger, and ConnectError', async () => {
  const tmpDir = makeTempDir('connect-nonleak-');
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;

  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  try {
    runMigrations(db);
    const { taskId } = seedWorkspaceAndTask(db, tmpDir);
    const pkgId = 'pkg-mail-consumer';
    const digest = `sha256:${'a'.repeat(64)}`;
    seedInstalledPackage(db, pkgId, digest, tmpDir);

    const canarySecret = 'opl_canary_secret_9a8b7c6d';
    const events: unknown[] = [];
    const eventBus = new EventBus<ConnectEvents>();
    eventBus.on('event.connect.changed', (ev) => {
      events.push(ev);
    });

    const provider: ConnectionProvider = {
      provider_type: 'mail-stub',
      listCapabilities: () => [
        { capability_id: 'mail.read', title: 'Read Mail', risk: 'read' },
        { capability_id: 'mail.fail', title: 'Fail With Secret', risk: 'read' },
        { capability_id: 'mail.leak', title: 'Leak Secret Output', risk: 'read' },
      ],
      invoke: async ({ capability_id, secret }) => {
        assert.equal(secret, canarySecret);
        if (capability_id === 'mail.fail') {
          throw new ConnectProviderError(
            'upstream_auth_failed',
            'provider_reported',
            `Upstream rejected ${canarySecret}`,
          );
        }
        if (capability_id === 'mail.leak') {
          return { leaked_api_key: canarySecret };
        }
        return { count: 2, summary: 'ok' };
      },
    };

    const connect = createConnectService({
      db,
      stateDir: tmpDir,
      eventBus,
      providers: [provider],
    });

    const appCtx = createClientContext({ session_id: 'sess_1', client_kind: 'opl_app' });

    // Reject raw secret handles / legacy env: / codex: handles
    for (const badHandle of ['env:API_KEY', 'codex:selected_provider', 'raw-secret-string']) {
      await assert.rejects(
        () =>
          connect.add(appCtx, {
            provider_type: 'mail-stub',
            display_name: 'Bad',
            credential_handle: badHandle,
          }),
        (err: unknown) => err instanceof ConnectError && err.code === 'INVALID_CREDENTIAL_HANDLE',
      );
    }

    // Reject raw secret properties smuggled in add payload
    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Smuggled',
          credential_handle: 'provider:mail-stub:acct_1',
          ...({ api_key: canarySecret } as Record<string, unknown>),
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );

    const conn = await connect.add(
      appCtx,
      {
        provider_type: 'mail-stub',
        display_name: 'Work Mailbox',
        account_label: 'alice@example.com',
        endpoint: 'https://mail.example.com/api',
        capabilities: [
          { capability_id: 'mail.read', title: 'Read Mail', risk: 'read' },
          { capability_id: 'mail.fail', title: 'Fail With Secret', risk: 'read' },
          { capability_id: 'mail.leak', title: 'Leak Secret Output', risk: 'read' },
        ],
        secret: canarySecret,
      },
      { task_id: taskId, owner_id: 'opl-connect' },
    );

    // Public DTOs never contain credential_handle, secret, or endpoint
    assert.equal('credential_handle' in conn, false);
    assert.equal('secret' in conn, false);
    assert.equal('endpoint' in conn, false);

    const port = connect.forPackage(pkgId, { audit_context: { task_id: taskId } });
    const req = await port.requestAccess({
      connection_id: conn.connection_id,
      capability_ids: ['mail.read', 'mail.fail', 'mail.leak'],
    });
    await connect.approveRequest(appCtx, { request_id: req.request_id }, { task_id: taskId });

    // Reject secret inside invocation input
    await assert.rejects(
      () =>
        port.invoke({
          connection_id: conn.connection_id,
          capability_id: 'mail.read',
          input: { token: canarySecret },
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );

    // Normal invoke succeeds
    const okRes = await port.invoke({
      connection_id: conn.connection_id,
      capability_id: 'mail.read',
      input: { query: 'inbox' },
    });
    assert.equal(okRes.disposition, 'completed');
    assert.deepEqual(okRes.result, { count: 2, summary: 'ok' });

    // Provider output containing secret field is blocked
    await assert.rejects(
      () =>
        port.invoke({
          connection_id: conn.connection_id,
          capability_id: 'mail.leak',
          input: { query: 'leak' },
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );

    // Provider error containing secret is sanitized (and ConnectError.toJSON never leaks)
    let caughtErr: ConnectError | null = null;
    try {
      await port.invoke({
        connection_id: conn.connection_id,
        capability_id: 'mail.fail',
        input: { query: 'fail' },
      });
    } catch (err) {
      caughtErr = err as ConnectError;
    }
    assert.ok(caughtErr instanceof ConnectError);
    assert.equal(caughtErr.message.includes(canarySecret), false);
    assert.equal(JSON.stringify(caughtErr.toJSON()).includes(canarySecret), false);

    // Check SQLite tables + raw opl.db bytes + EventBus + Projections + Ledger
    const connRows = db.prepare('SELECT * FROM connections').all() as Array<Record<string, unknown>>;
    const grantRows = db.prepare('SELECT * FROM connection_grants').all() as Array<Record<string, unknown>>;
    const auditRows = db.prepare('SELECT * FROM connect_audit_events').all() as Array<Record<string, unknown>>;
    const ledgerRows = queryTimeline(db, { task_id: taskId });

    const serializedSurfaces = [
      JSON.stringify(connRows),
      JSON.stringify(grantRows),
      JSON.stringify(auditRows),
      JSON.stringify(ledgerRows),
      JSON.stringify(events),
      JSON.stringify(connect.list()),
      JSON.stringify(connect.listProjection()),
      JSON.stringify(await connect.checkConnection(conn.connection_id)),
    ];

    for (const surface of serializedSurfaces) {
      assert.equal(surface.includes(canarySecret), false, 'Canary secret leaked into connect/ledger surface');
    }

    // Raw DB file bytes must never contain the canary secret
    const dbBytes = fs.readFileSync(dbPath);
    assert.equal(dbBytes.includes(Buffer.from(canarySecret, 'utf8')), false);
    assert.ok(ledgerRows.length >= 3);
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('assertNoSecretPayload, metadata scrubbing, and EncryptedFileSecretVault reject bypasses and entry swaps', async () => {
  // 1. Secret value patterns with &, #, and 12-15 char sk- tokens
  const secretPayloads: Array<Record<string, unknown>> = [
    { url: 'https://example.com/?k=sk-live_1234567890abcdef&x=1' },
    { url: 'https://example.com/?k=ghp_1234567890abcdefghij&x=1' },
    { url: 'https://example.com/#token=sk-live_1234567890abcdef' },
    { note: 'sk-123456789012345' },
    { note: 'sk-123456789012' },
    { secretValue: 'my_plain_secret_not_matching_sk' },
    { api_key_v2: 'my_plain_secret_not_matching_sk' },
    { apiKeyV2: 'my_plain_secret_not_matching_sk' },
    { clientSecretOld: 'plain' },
    { accessTokenNext: 'plain' },
    { authorizationHeader: 'Basic abc' },
    { credentialsMap: { user: 'a' } },
    { credentialHandle: 'vault:encfile:12345678' },
  ];
  for (const payload of secretPayloads) {
    assert.throws(
      () => assertNoSecretPayload(payload),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
      `Expected SECRET_PAYLOAD_FORBIDDEN for ${JSON.stringify(payload)}`,
    );
  }

  // ConnectError.details also strips camelCase credentialHandle
  const errWithDetail = new ConnectError('INVALID_INPUT', 'detail test', {
    details: { credentialHandle: 'vault:encfile:12345678', safeKey: 'ok' },
  });
  assert.deepEqual(errWithDetail.details, { safeKey: 'ok' });

  // Safe non-secret keys remain permitted
  assert.deepEqual(
    assertNoSecretPayload({
      capability_title: 'Read Mail',
      input_tokens: 120,
      max_tokens: 4096,
      outputTokens: 64,
      token_count: 184,
      credential_present: true,
    }),
    {
      capability_title: 'Read Mail',
      input_tokens: 120,
      max_tokens: 4096,
      outputTokens: 64,
      token_count: 184,
      credential_present: true,
    },
  );
  assertCredentialHandleOnlyPayload({
    provider_type: 'mail-stub',
    credential_handle: 'provider:mail-stub:acct_1',
  });
  assertCredentialHandleOnlyPayload({
    provider_type: 'mail-stub',
    credentialHandle: 'provider:mail-stub:acct_1',
  });

  // 2. ConnectionRegistry.add metadata scrubbing & rotateCredential smuggling
  const tmpDir = makeTempDir('connect-scrub-reg-');
  const prevStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = tmpDir;
  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  try {
    runMigrations(db);
    const connect = createConnectService({ db, stateDir: tmpDir });
    const appCtx = createClientContext({ session_id: 'sess_app', client_kind: 'opl_app' });

    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Valid Name',
          endpoint: 'https://api.example.com/v1?api_key=sk-live_querysecret12345678',
          secret: 'clean_secret',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );
    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Valid Name',
          endpoint: 'https://api.example.com/v1?api_key=plain_query_secret',
          secret: 'clean_secret',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );
    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Valid Name',
          endpoint: 'https://api.example.com/v1#access_token=plain_frag_secret',
          secret: 'clean_secret',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );
    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Valid Name',
          endpoint: 'https://api.example.com/v1#Bearer%20secret_token_123456',
          secret: 'clean_secret',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );
    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Valid Name',
          endpoint: 'https://api.example.com/v1#/callback?api_key=plain_unprefixed_secret',
          secret: 'clean_secret',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );
    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Conn sk-live_1234567890abcdef',
          secret: 'clean_secret',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );
    await assert.rejects(
      () =>
        connect.add(appCtx, {
          provider_type: 'mail-stub',
          display_name: 'Clean Name',
          account_label: 'user ghp_1234567890abcdefghij',
          secret: 'clean_secret',
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );
    assert.equal(connect.list({ include_deleted: true }).length, 0);

    const conn = await connect.add(appCtx, {
      provider_type: 'mail-stub',
      display_name: 'Clean Connection',
      secret: 'clean_secret_v1',
    });
    await assert.rejects(
      () =>
        connect.rotateCredential(appCtx, {
          connection_id: conn.connection_id,
          credential_handle: 'provider:mail-stub:acct_2',
          ...({ secretValue: 'smuggled' } as Record<string, unknown>),
        }),
      (err: unknown) => err instanceof ConnectError && err.code === 'SECRET_PAYLOAD_FORBIDDEN',
    );

    // 3. EncryptedFileSecretVault full-object entry swap defense
    const vault = new EncryptedFileSecretVault({ stateDir: tmpDir });
    const m1 = await vault.putSecret({ namespace: 'swap', secret: 'secret_alpha_111' });
    const m2 = await vault.putSecret({ namespace: 'swap', secret: 'secret_beta_222' });

    const vaultObj = JSON.parse(fs.readFileSync(vault.vaultFile, 'utf8')) as {
      schema_version: string;
      entries: Record<string, { handle: string } & Record<string, unknown>>;
    };
    // Case A: full-object copy without rewriting inner handle
    vaultObj.entries[m1.handle] = { ...vaultObj.entries[m2.handle]! };
    fs.writeFileSync(vault.vaultFile, JSON.stringify(vaultObj), 'utf8');
    await assert.rejects(
      () => vault.getSecret(m1.handle),
      (err: unknown) => err instanceof ConnectError && err.code === 'VAULT_ERROR',
    );

    // Case B: full-object copy WITH inner handle rewritten to m1.handle -> AAD mismatch fails GCM
    vaultObj.entries[m1.handle] = { ...vaultObj.entries[m2.handle]!, handle: m1.handle };
    fs.writeFileSync(vault.vaultFile, JSON.stringify(vaultObj), 'utf8');
    await assert.rejects(
      () => vault.getSecret(m1.handle),
      (err: unknown) => err instanceof ConnectError && err.code === 'VAULT_ERROR',
    );
  } finally {
    db.close();
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
