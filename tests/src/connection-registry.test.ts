import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  createOplConnection,
  deleteOplConnection,
  listOplConnections,
  setDefaultOplConnection,
  testOplConnection,
  updateOplConnection,
} from '../../src/modules/connect/connection-registry.ts';

function withStateDir(run: (stateDir: string) => void | Promise<void>) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-connection-registry-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  return Promise.resolve(run(stateDir)).finally(() => {
    if (previous === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previous;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
}

test('connection registry persists credential handles only and rejects secret payloads without writing', async () => {
  await withStateDir((stateDir) => {
    const created = createOplConnection({
      connection_id: 'research-api',
      name: 'Research API',
      connection_type: 'http_api',
      endpoint: 'https://api.example.test/v1',
      credential_handle: 'env:RESEARCH_API_TOKEN',
    });

    assert.equal(created.connection_registry.connection!.credential_handle, 'env:RESEARCH_API_TOKEN');
    assert.equal(created.connection_registry.connection!.status, 'untested');
    assert.equal(JSON.stringify(created).includes('api_key'), false);

    const registryFile = path.join(stateDir, 'connection-registry.json');
    const before = fs.readFileSync(registryFile, 'utf8');
    assert.throws(
      () => createOplConnection({
        connection_id: 'unsafe',
        name: 'Unsafe',
        connection_type: 'http_api',
        endpoint: 'https://unsafe.example.test',
        credential_handle: 'env:UNSAFE_TOKEN',
        metadata: { api_key: 'plain-text-key' },
      } as never),
      (error: unknown) => error instanceof FrameworkContractError
        && error.code === 'cli_usage_error'
        && error.details?.reason_code === 'credential_payload_forbidden',
    );
    assert.equal(fs.readFileSync(registryFile, 'utf8'), before);
    assert.equal(JSON.stringify(listOplConnections()).includes('plain-text-key'), false);
    assert.throws(
      () => createOplConnection({
        connection_id: 'unsupported-handle',
        name: 'Unsupported handle',
        connection_type: 'http_api',
        credential_handle: 'env://UNSUPPORTED_TOKEN',
      }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.reason_code === 'credential_handle_invalid',
    );
  });
});

test('connection registry enforces default deletion and typed status transitions', async () => {
  await withStateDir(async () => {
    createOplConnection({
      connection_id: 'primary',
      name: 'Primary',
      connection_type: 'http_api',
      endpoint: 'https://primary.example.test',
      credential_handle: 'env:PRIMARY_TOKEN',
    });
    createOplConnection({
      connection_id: 'secondary',
      name: 'Secondary',
      connection_type: 'http_api',
      endpoint: 'https://secondary.example.test',
      credential_handle: 'codex:selected_provider',
      disabled: true,
    });
    setDefaultOplConnection('primary');

    assert.throws(
      () => deleteOplConnection('primary'),
      (error: unknown) => error instanceof FrameworkContractError
        && error.code === 'cli_usage_error'
        && error.details?.reason_code === 'default_connection_delete_forbidden',
    );
    assert.equal(listOplConnections().connections.length, 2);
    assert.equal(listOplConnections().connections[1]?.status, 'disabled');

    const missingCredential = await testOplConnection('primary');
    assert.equal(missingCredential.connection_test.status, 'attention_needed');
    assert.equal(missingCredential.connection_test.checks[0]?.code, 'credential_env_missing');
    process.env.PRIMARY_TOKEN = 'test-secret-value';
    const tested = await testOplConnection('primary');
    delete process.env.PRIMARY_TOKEN;
    assert.equal(tested.connection_test.status, 'ready');
    assert.equal(tested.connection_test.runtime_readiness_claimed, false);
    assert.deepEqual(
      Object.keys(tested.connection_test).sort(),
      [
        'checked_at',
        'checks',
        'connection_id',
        'runtime_readiness_claimed',
        'status',
        'surface_kind',
      ],
    );

    const updated = updateOplConnection('primary', { endpoint: 'not-a-url' });
    assert.equal(updated.connection_registry.connection!.status, 'untested');
    const failed = await testOplConnection('primary');
    assert.equal(failed.connection_test.status, 'attention_needed');
    assert.equal(JSON.stringify(failed).includes('header'), false);
    assert.equal(JSON.stringify(failed).includes('secret'), false);
    assert.equal(JSON.stringify(failed).includes('body'), false);
  });
});
