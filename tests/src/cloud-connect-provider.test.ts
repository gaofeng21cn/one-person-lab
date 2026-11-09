import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createOplCloudConnectionProvider, importOplCloudConnection, listOplCloudProviderConnections,
  type CloudConnectCommandRunner, type CloudConnectRequest,
} from '../../src/adapters/integration/cloud-connect-provider.ts';
import { createDefaultConnectionAuthorizationService } from '../../src/adapters/integration/connection-composition.ts';
import { listOplConnections } from '../../src/adapters/integration/connection-registry.ts';
import { OplConnectionProviderError } from '../../src/adapters/integration/connection-authorization.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';

const ref = 'cloud:00000000-0000-4000-8000-000000000001';
const revision = 'rev:00000000-0000-4000-8000-000000000002';

async function withState(run: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cloud-connect-'));
  const prior = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try { await run(root); } finally {
    if (prior === undefined) delete process.env.OPL_STATE_DIR; else process.env.OPL_STATE_DIR = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function fixture() {
  const info = {
    cloud_ref: ref, revision, credential_id: 'agent-one', label: 'Research Cloud', tenant_id: 'tenant-one',
    audience: 'opl-cloud-mcp', expires_at: new Date(Date.now() + 3600_000).toISOString(),
    endpoint: 'https://cloud.example.test', status: 'ready', status_code: 'READY',
    capabilities: ['cloud_get_workspace', 'cloud_get_workspace_operation'],
  };
  let response = { id: 'workspace-one', state: 'running' } as Record<string, unknown>;
  let failure: null | { code: string; disposition: string } = null;
  const calls: CloudConnectRequest[] = [];
  const runner: CloudConnectCommandRunner = ({ request }) => {
    calls.push(request);
    if (request.operation === 'invoke' && failure) return {
      status: 0, stdout: JSON.stringify({ ok: false, disposition: failure.disposition, error: { code: failure.code } }),
    };
    return { status: 0, stdout: JSON.stringify({ ok: true, disposition: 'completed', result:
      request.operation === 'list' ? { connections: [info] }
        : request.operation === 'inspect' ? { connection: info } : response }) };
  };
  return { info, runner, calls, setFailure(value: typeof failure) { failure = value; }, setResponse(value: Record<string, unknown>) { response = value; } };
}

function descriptor(): InstalledPackageDescriptor {
  return {
    manifest: { package_id: 'cloud-consumer', display_name: 'Cloud consumer', content_digest: `sha256:${'b'.repeat(64)}` },
    manifest_sha256: 'a'.repeat(64), enabled: true,
    readiness: { installed: true, physical_status: 'available', callability: 'callable' },
  } as InstalledPackageDescriptor;
}

test('Cloud metadata and registry contain opaque references, while owner JSON remains unchanged', async () => {
  await withState(async (root) => {
    const f = fixture();
    f.info.label = '🧪'.repeat(100);
    Object.assign(f.info, { credential: 'never-project-this-secret' });
    assert.equal(listOplCloudProviderConnections({ runner: f.runner }).connections[0]?.label, f.info.label);
    assert.equal(JSON.stringify(listOplCloudProviderConnections({ runner: f.runner })).includes('never-project'), false);
    importOplCloudConnection(ref, { runner: f.runner });
    const connection = listOplConnections().connections[0]!;
    const provider = createOplCloudConnectionProvider({ runner: f.runner });
    assert.equal((await provider.listCapabilities(connection))[0]!.risk, 'read');
    f.setResponse({ source: '/api/v2/workspaces/workspace-one', revision: 'sha256:exact', data: { id: 'workspace-one', status: 'unknown' } });
    const result = await provider.invoke({ connection, consumer_package_id: 'cloud-consumer', capability_id: 'cloud_get_workspace', invocation_id: 'one', input: { id: 'workspace-one', expectedRevision: 'sha256:exact' } });
    assert.deepEqual(result, { source: '/api/v2/workspaces/workspace-one', revision: 'sha256:exact', data: { id: 'workspace-one', status: 'unknown' } });
    const invocation = f.calls.at(-1)!;
    assert.deepEqual(invocation.credential_handle, { opaque: ref, revision });
    assert.equal(JSON.stringify(invocation).includes('consumer_package_id'), false);
    assert.equal(JSON.stringify(fs.readdirSync(root)).includes('credential'), false);
    assert.equal(JSON.stringify(connection).includes('never-project'), false);
  });
});

test('default composition applies current Package grants, revocation, expiry and helper revision', async () => {
  await withState(async () => {
    const f = fixture();
    const imported = importOplCloudConnection(ref, { runner: f.runner });
    const descriptors = new Map([['cloud-consumer', descriptor()]]);
    const service = createDefaultConnectionAuthorizationService({ descriptorDiscovery: { discover: () => descriptors }, cloudRunner: f.runner });
    const consumer = service.forPackage('cloud-consumer');
    const input = { connection_id: imported.connection.connection_id, capability_id: 'cloud_get_workspace', input: { id: 'workspace-one' } };
    await assert.rejects(consumer.invoke(input));
    const request = await consumer.requestAccess({ connection_id: input.connection_id, capability_ids: [input.capability_id] });
    const grant = await service.approveRequest(request.request_id);
    assert.equal((await consumer.invoke(input)).disposition, 'completed');
    service.revokeGrant(grant.grant_id);
    const count = f.calls.filter((entry) => entry.operation === 'invoke').length;
    await assert.rejects(consumer.invoke(input));
    assert.equal(f.calls.filter((entry) => entry.operation === 'invoke').length, count);
    const provider = createOplCloudConnectionProvider({ runner: f.runner });
    const connection = listOplConnections().connections[0]!;
    f.info.expires_at = new Date(Date.now() - 1000).toISOString();
    assert.deepEqual(await provider.listCapabilities(connection), []);
    f.info.revision = 'rev:00000000-0000-4000-8000-000000000003';
    assert.throws(() => provider.listCapabilities(connection), /Connection provider/);
    descriptors.clear();
    assert.throws(() => service.forPackage('cloud-consumer'));
  });
});

test('Cloud argument injection is refused before dispatch; owner rejection and unknown are distinct', async () => {
  await withState(async () => {
    const f = fixture();
    importOplCloudConnection(ref, { runner: f.runner });
    const connection = listOplConnections().connections[0]!;
    const provider = createOplCloudConnectionProvider({ runner: f.runner });
    const input = { connection, consumer_package_id: 'cloud-consumer', capability_id: 'cloud_get_workspace_operation', invocation_id: 'one', input: { id: 'operation-one' } };
    for (const extra of [{ actor: 'other' }, { headers: { Authorization: 'bearer' } }, { path: '/api/v2/purchase' }, { endpoint: 'https://other.invalid' }]) {
      await assert.rejects(provider.invoke({ ...input, input: { ...input.input, ...extra } }), (error) => error instanceof OplConnectionProviderError && error.disposition === 'not_dispatched');
    }
    assert.equal(f.calls.filter((entry) => entry.operation === 'invoke').length, 0);
    f.setFailure({ code: 'CREDENTIAL_REVOKED', disposition: 'provider_reported' });
    await assert.rejects(provider.invoke(input), (error) => error instanceof OplConnectionProviderError && error.disposition === 'provider_reported');
    f.setFailure({ code: 'HTTP_RESPONSE_LOST', disposition: 'unknown_after_dispatch' });
    await assert.rejects(provider.invoke(input), (error) => error instanceof OplConnectionProviderError && error.disposition === 'unknown_after_dispatch');
    assert.equal(f.calls.filter((entry) => entry.operation === 'invoke').length, 2);
    f.setFailure(null);
    f.setResponse({ source: '/api/v2/operations/workspace/operation-one', data: { operationId: 'operation-one', owner: 'workspace', status: 'unknown' } });
    const read = await provider.invoke(input);
    assert.deepEqual(read, { source: '/api/v2/operations/workspace/operation-one', data: { operationId: 'operation-one', owner: 'workspace', status: 'unknown' } });
  });
});
