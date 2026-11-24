import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  callExternalCliConnect,
  decodeExternalCliCredentialHandle,
  encodeExternalCliCredentialHandle,
} from '../../src/adapters/integration/external-cli-connection-provider.ts';
import { createDefaultConnectionAuthorizationService } from '../../src/adapters/integration/connection-composition.ts';
import { OplConnectionProviderError } from '../../src/adapters/integration/connection-authorization.ts';
import { createOplConnection } from '../../src/adapters/integration/connection-registry.ts';

function baseCallOptions(
  runner: Parameters<typeof callExternalCliConnect>[0]['runner'],
  operation: 'list' | 'inspect' | 'invoke' = 'inspect',
) {
  return {
    binary: 'custom-provider',
    runner,
    request: { schema_version: 'custom-connect.v1', operation },
    spawnFailedCode: 'custom_spawn_failed',
    processFailedCode: 'custom_process_failed',
    responseUnavailableCode: 'custom_response_unavailable',
    responseInvalidCode: 'custom_response_invalid',
    defaultProviderErrorCode: 'custom_provider_error',
  };
}

test('callExternalCliConnect enforces envelope validation and disposition mapping', () => {
  assert.deepEqual(
    callExternalCliConnect(
      baseCallOptions(() => ({
        status: 0,
        stdout: JSON.stringify({ ok: true, disposition: 'completed', result: { items: [1] } }),
      })),
    ),
    { items: [1] },
  );

  assert.throws(
    () =>
      callExternalCliConnect({
        ...baseCallOptions(
          () => ({
            status: 1,
            stdout: JSON.stringify({
              ok: false,
              disposition: 'provider_reported',
              error: { code: 'CUSTOM_DENIED' },
            }),
          }),
          'invoke',
        ),
        allowProviderReportedDisposition: true,
        isAllowedProviderCode: (code) => code === 'CUSTOM_DENIED',
      }),
    (err: unknown) =>
      err instanceof OplConnectionProviderError
      && err.providerCode === 'CUSTOM_DENIED'
      && err.disposition === 'provider_reported',
  );

  assert.throws(
    () =>
      callExternalCliConnect({
        ...baseCallOptions(
          () => ({
            status: 1,
            stdout: JSON.stringify({ ok: true, disposition: 'completed', result: {} }),
          }),
          'invoke',
        ),
        checkStatusBeforeParse: true,
      }),
    (err: unknown) =>
      err instanceof OplConnectionProviderError
      && err.providerCode === 'custom_process_failed'
      && err.disposition === 'unknown_after_dispatch',
  );
});

test('external CLI credential handle encode/decode round-trips and rejects tampering', () => {
  const encoded = encodeExternalCliCredentialHandle('provider:custom:', {
    ref: 'custom://123',
    revision: 'rev1',
  });
  assert.deepEqual(
    decodeExternalCliCredentialHandle(encoded, 'provider:custom:', 'custom_handle_invalid'),
    { ref: 'custom://123', revision: 'rev1' },
  );
  assert.throws(
    () => decodeExternalCliCredentialHandle('wrong:prefix', 'provider:custom:', 'custom_handle_invalid'),
    (err: unknown) =>
      err instanceof OplConnectionProviderError && err.providerCode === 'custom_handle_invalid',
  );
});

import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';

test('createDefaultConnectionAuthorizationService accepts pluggable extraProviders', async () => {
  const prevStateDir = process.env.OPL_STATE_DIR;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ext-cli-provider-'));
  process.env.OPL_STATE_DIR = tmpDir;
  try {
    createOplConnection({
      connection_id: 'custom-provider-conn-1',
      name: 'Custom External Service',
      connection_type: 'custom-provider',
      account_label: 'demo',
      endpoint: null,
      credential_handle: encodeExternalCliCredentialHandle('provider:custom:', { opaque: 'abc' }),
    });
    const descriptor = {
      manifest: {
        package_id: 'custom-consumer',
        display_name: 'Custom Consumer',
        content_digest: `sha256:${'b'.repeat(64)}`,
      },
      manifest_sha256: 'a'.repeat(64),
      enabled: true,
      readiness: { installed: true, physical_status: 'available', callability: 'callable' },
    } as InstalledPackageDescriptor;
    const service = createDefaultConnectionAuthorizationService({
      descriptorDiscovery: { discover: () => new Map([['custom-consumer', descriptor]]) },
      extraProviders: [
        {
          provider_id: 'custom-provider',
          listCapabilities: () => [{ capability_id: 'custom.ping', title: 'Ping', risk: 'read' }],
          invoke: async ({ input }) => ({ pong: true, input }),
        },
      ],
    });
    const req = await service.forPackage('custom-consumer').requestAccess({
      connection_id: 'custom-provider-conn-1',
      capability_ids: ['custom.ping'],
    });
    assert.equal(req.capability_ids[0], 'custom.ping');
    await service.approveRequest(req.request_id);
    const result = await service.forPackage('custom-consumer').invoke({
      connection_id: 'custom-provider-conn-1',
      capability_id: 'custom.ping',
      input: { echo: 1 },
    });
    assert.deepEqual(result.result, { pong: true, input: { echo: 1 } });
  } finally {
    if (prevStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
