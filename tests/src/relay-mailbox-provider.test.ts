import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createOplConnectionAuthorizationService,
  OplConnectionProviderError,
} from '../../src/adapters/integration/connection-authorization.ts';
import {
  createOplRelayMailboxConnectionProvider,
  importOplRelayMailboxConnection,
  listOplRelayMailboxConnections,
} from '../../src/adapters/integration/relay-mailbox-provider.ts';
import type {
  RelayConnectCommandRunner,
  RelayConnectRequest,
} from '../../src/adapters/integration/relay-mailbox-provider.ts';
import { listOplConnectionAuthorization } from '../../src/adapters/integration/connection-composition.ts';
import { listOplConnections } from '../../src/adapters/integration/connection-registry.ts';

const mailboxRef = `relay-mailbox://${'a'.repeat(64)}`;
const revision = 'b'.repeat(64);
const capabilities = ['mailbox.search', 'mailbox.read', 'draft.create'];

async function withState(run: () => void | Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-relay-connection-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runnerFor(input: {
  calls?: RelayConnectRequest[];
  currentRevision?: () => string;
  invokeResult?: Record<string, unknown>;
} = {}): RelayConnectCommandRunner {
  return ({ request }) => {
    input.calls?.push(request);
    if (request.operation === 'list') {
      return {
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          disposition: 'completed',
          result: { mailboxes: [{
            mailbox_ref: mailboxRef,
            account_id: 'work',
            email: 'owner@example.test',
            revision: input.currentRevision?.() ?? revision,
          }] },
        }),
      };
    }
    if (request.operation === 'inspect') {
      return {
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          disposition: 'completed',
          result: {
            mailbox: {
              mailbox_ref: mailboxRef,
              account_id: 'work',
              email: 'owner@example.test',
              revision: input.currentRevision?.() ?? revision,
            },
            capabilities,
          },
        }),
      };
    }
    return {
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        disposition: 'completed',
        result: input.invokeResult ?? { source: 'relay-local-cache', messages: [] },
      }),
    };
  };
}

test('imports a Relay mailbox using its owner label and persists its account revision privately', async () => {
  await withState(() => {
    const calls: RelayConnectRequest[] = [];
    const result = importOplRelayMailboxConnection(mailboxRef, { runner: runnerFor({ calls }) });
    const connection = listOplConnections().connections[0];
    assert.equal(result.connection.display_name, 'owner@example.test');
    assert.equal(result.connection.connection_type, 'opl-relay');
    assert.equal(result.connection.account_label, 'owner@example.test');
    assert.equal(JSON.stringify(result).includes('credential_handle'), false);
    assert.equal(JSON.stringify(result).includes(mailboxRef), false);
    assert.equal(connection?.connection_type, 'opl-relay');
    assert.equal(connection?.name, 'owner@example.test');
    assert.equal(connection?.account_label, 'owner@example.test');
    assert.equal(connection?.endpoint, null);
    assert.match(connection?.credential_handle ?? '', /^provider:opl-relay:/);
    assert.equal(calls.map((call) => call.operation).join(','), 'list,inspect');
    const registry = JSON.stringify(listOplConnections());
    assert.equal(registry.includes('fixture-only'), false);
    assert.equal(registry.includes('owner@example.test'), true);

    const changed = importOplRelayMailboxConnection(mailboxRef, {
      runner: runnerFor({ calls: [], currentRevision: () => 'c'.repeat(64) }),
    });
    assert.notEqual(changed.connection.security_revision, result.connection.security_revision);
  });
});

test('uses only the pinned Relay account, its approved capability and bounded input', async () => {
  await withState(async () => {
    const calls: RelayConnectRequest[] = [];
    importOplRelayMailboxConnection(mailboxRef, { runner: runnerFor({ calls }) });
    const connection = listOplConnections().connections[0]!;
    const provider = createOplRelayMailboxConnectionProvider({ runner: runnerFor({ calls }) });
    const available = await provider.listCapabilities(connection);
    assert.deepEqual(available.map((entry) => entry.capability_id), capabilities);
    assert.equal(JSON.stringify(available).includes(mailboxRef), false);
    await provider.invoke({
      connection,
      consumer_package_id: 'mail-miniapp',
      capability_id: 'mailbox.search',
      invocation_id: 'inv-1',
      input: { query: 'grant report', limit: 5 },
    });
    const invoke = calls.find((request) => request.operation === 'invoke')!;
    assert.deepEqual(invoke.credential_handle, { opaque: mailboxRef, revision });
    assert.equal('consumer_package_id' in invoke, false);

    await assert.rejects(provider.invoke({
      connection,
      consumer_package_id: 'mail-miniapp',
      capability_id: 'mailbox.search',
      invocation_id: 'inv-2',
      input: { account_id: 'other', query: 'private' },
    }), (error: unknown) => error instanceof OplConnectionProviderError
      && error.disposition === 'not_dispatched');
    assert.equal(calls.filter((request) => request.operation === 'invoke').length, 1);
  });
});

test('stale Relay account revision fails before invocation', async () => {
  await withState(async () => {
    importOplRelayMailboxConnection(mailboxRef, { runner: runnerFor() });
    const connection = listOplConnections().connections[0]!;
    const calls: RelayConnectRequest[] = [];
    const provider = createOplRelayMailboxConnectionProvider({
      runner: runnerFor({ calls, currentRevision: () => 'd'.repeat(64) }),
    });
    await assert.rejects(Promise.resolve(provider.listCapabilities(connection)), /Connection provider operation failed/);
    assert.equal(calls.some((request) => request.operation === 'invoke'), false);
  });
});

test('authorization service records provider outcomes without storing mail arguments or results', async () => {
  await withState(async () => {
    importOplRelayMailboxConnection(mailboxRef, { runner: runnerFor() });
    const connection = listOplConnections().connections[0]!;
    const descriptors = new Map([['mail-miniapp', {
      manifest: { package_id: 'mail-miniapp', content_digest: `sha256:${'e'.repeat(64)}` },
      manifest_sha256: 'f'.repeat(64), enabled: true,
      readiness: { installed: true, physical_status: 'available', callability: 'callable' },
    } as never]]);
    const service = createOplConnectionAuthorizationService({
      descriptorDiscovery: { discover: () => descriptors },
      providers: [createOplRelayMailboxConnectionProvider({ runner: runnerFor({
        invokeResult: { source: 'relay-local-cache', message: { body_text: 'Sensitive mailbox content' } },
      }) })],
    });
    const consumer = service.forPackage('mail-miniapp');
    const request = await consumer.requestAccess(connection.connection_id, ['mailbox.read']);
    await service.approveRequest(request.request_id);
    const invokeResult = await consumer.invoke(connection.connection_id, 'mailbox.read', {
      storage_ref: 'email-store://message/1',
    });
    assert.deepEqual(invokeResult.result, {
      source: 'relay-local-cache', message: { body_text: 'Sensitive mailbox content' },
    });
    const history = JSON.stringify(service.listProjection().invocations);
    assert.equal(history.includes('Sensitive mailbox content'), false);
    assert.equal(history.includes('email-store://message/1'), false);
  });
});

test('maps Relay unknown-after-dispatch without retrying a local draft request', async () => {
  await withState(async () => {
    importOplRelayMailboxConnection(mailboxRef, { runner: runnerFor() });
    const connection = listOplConnections().connections[0]!;
    let invokeCalls = 0;
    const provider = createOplRelayMailboxConnectionProvider({ runner: ({ request }) => {
      if (request.operation === 'invoke') {
        invokeCalls += 1;
        return { status: 0, stdout: JSON.stringify({
          ok: false,
          disposition: 'unknown_after_dispatch',
          error: { code: 'private-token-value', message: 'private-token-value' },
        }) };
      }
      return runnerFor()({ binary: 'opl-relay', request });
    } });
    await assert.rejects(provider.invoke({
      connection,
      consumer_package_id: 'mail-miniapp',
      capability_id: 'draft.create',
      invocation_id: 'inv-3',
      input: { storage_ref: 'email-store://message/1', body: 'Reply', request_id: 'draft-1' },
    }), (error: unknown) => error instanceof OplConnectionProviderError
      && error.disposition === 'unknown_after_dispatch'
      && error.providerCode === 'relay_provider_error'
      && !error.message.includes('private-token-value'));
    assert.equal(invokeCalls, 1);
  });
});


test('settings authorization lists selectable Relay mailboxes through the local owner without secret fields', async () => {
  await withState(() => {
    const calls: RelayConnectRequest[] = [];
    const projection = listOplConnectionAuthorization({
      descriptorDiscovery: { discover: () => new Map() },
      relayRunner: ({ request }) => {
        calls.push(request);
        return { status: 0, stdout: JSON.stringify({ ok: true, disposition: 'completed', result: { mailboxes: [{
          mailbox_ref: mailboxRef, email: 'owner@example.test', account_id: 'work', revision,
          password: 'must-not-leak', credential_handle: 'must-not-leak',
        }] } }) };
      },
    });
    assert.equal(projection.available_connections_status, 'available');
    assert.deepEqual(projection.available_connections, [{
      mailbox_ref: mailboxRef, display_name: 'owner@example.test', account_label: 'owner@example.test', provider_type: 'opl-relay',
    }]);
    assert.deepEqual(calls.map((call) => call.operation), ['list']);
    assert.equal(JSON.stringify(projection).includes('must-not-leak'), false);
    assert.deepEqual(listOplConnections().connections, []);
  });
});

test('unavailable or malformed Relay mailbox metadata is distinct from an empty configured list', () => {
  const unavailable = listOplRelayMailboxConnections({ runner: () => ({ status: 1, stdout: 'private details' }) });
  assert.equal(unavailable.available_connections_status, 'unavailable');
  assert.deepEqual(unavailable.available_connections, []);
  assert.equal(JSON.stringify(unavailable).includes('private details'), false);
  const empty = listOplRelayMailboxConnections({ runner: () => ({ status: 0, stdout: JSON.stringify({
    ok: true, disposition: 'completed', result: { mailboxes: [] },
  }) }) });
  assert.equal(empty.available_connections_status, 'available');
  const malformed = listOplRelayMailboxConnections({ runner: () => ({ status: 0, stdout: JSON.stringify({
    ok: true, disposition: 'completed', result: { mailboxes: [{ mailbox_ref: '/private/account', email: 'user@example.test' }] },
  }) }) });
  assert.equal(malformed.available_connections_status, 'unavailable');
});
