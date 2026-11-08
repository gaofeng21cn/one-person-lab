import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  createOplConnectionAuthorizationService,
  OplConnectionProviderError,
  type OplConnectionCapability,
} from '../../src/adapters/integration/connection-authorization.ts';
import {
  createOplConnection,
  deleteOplConnection,
  listOplConnections,
  updateOplConnection,
} from '../../src/adapters/integration/connection-registry.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';

async function withState(run: (root: string) => void | Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-connection-authorization-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try {
    await run(root);
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function descriptor(packageId: string): InstalledPackageDescriptor {
  return {
    manifest: {
      package_id: packageId,
      display_name: packageId === 'research-agent' ? 'Research Agent' : 'Mail Mini App',
      content_digest: `sha256:${'b'.repeat(64)}`,
    },
    manifest_sha256: 'a'.repeat(64),
    enabled: true,
    readiness: { installed: true, physical_status: 'available', callability: 'callable' },
  } as InstalledPackageDescriptor;
}

function connection(type = 'mail') {
  return createOplConnection({
    connection_id: 'work-mail',
    name: 'Work mailbox',
    connection_type: type,
    endpoint: 'https://mail.example.test',
    credential_handle: 'env:MAIL_PRIVATE_CREDENTIAL',
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  connection();
  const descriptors = new Map(['research-agent', 'mail-miniapp'].map((id) => [id, descriptor(id)]));
  let calls = 0;
  let capabilities: OplConnectionCapability[] = [{ capability_id: 'mail.read', title: 'Read mail', risk: 'read' }];
  let beforeList: (() => Promise<void>) | undefined;
  let invoke: (input: any) => Promise<any> = async () => ({ count: 1 });
  const service = createOplConnectionAuthorizationService({
    descriptorDiscovery: { discover: () => descriptors },
    providers: [{
      provider_id: 'mail',
      listCapabilities: async () => {
        await beforeList?.();
        return capabilities;
      },
      invoke: async (input: any) => { calls += 1; return invoke(input); },
    }],
  });
  return {
    service,
    descriptors,
    get calls() { return calls; },
    setCapabilities: (value: typeof capabilities) => { capabilities = value; },
    setBeforeList: (value?: () => Promise<void>) => { beforeList = value; },
    setInvoke: (value: typeof invoke) => { invoke = value; },
  };
}

type Fixture = ReturnType<typeof setup>;

async function approve(fixture: Fixture, packageId = 'research-agent') {
  const consumer = fixture.service.forPackage(packageId);
  const request = await consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
  const grant = await fixture.service.approveRequest(request.request_id);
  return { consumer, request, grant };
}

const invocation = () => ({ connection_id: 'work-mail', capability_id: 'mail.read', input: {} });

function notDispatched(error: unknown) {
  assert.ok(error instanceof FrameworkContractError);
  assert.equal(error.details?.disposition, 'not_dispatched');
  return true;
}

test('a connection and pending request do not grant access; consumer summary omits private bindings', async () => {
  await withState(async () => {
    const fixture = setup();
    const consumer = fixture.service.forPackage('research-agent');
    const summaries = await consumer.listConnections();
    assert.equal(summaries.length, 1);
    const summary = JSON.stringify(summaries);
    assert.equal(summary.includes('MAIL_PRIVATE_CREDENTIAL'), false);
    assert.equal(summary.includes('mail.example.test'), false);
    assert.equal(summary.includes('credential_handle'), false);
    assert.equal(summary.includes('endpoint'), false);
    await assert.rejects(consumer.invoke(invocation()), notDispatched);
    const request = await consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    assert.equal(request.status, 'requested');
    await assert.rejects(consumer.invoke(invocation()), notDispatched);
    fixture.service.denyRequest(request.request_id);
    await assert.rejects(fixture.service.approveRequest(request.request_id), notDispatched);
    assert.equal(fixture.calls, 0);
  });
});

test('one consumer revocation preserves the other consumer grant and does not disconnect the account', async () => {
  await withState(async () => {
    const fixture = setup();
    const first = await approve(fixture);
    const second = await approve(fixture, 'mail-miniapp');
    assert.deepEqual((await first.consumer.invoke(invocation())).result, { count: 1 });
    fixture.service.revokeGrant(first.grant.grant_id);
    await assert.rejects(first.consumer.invoke(invocation()), notDispatched);
    assert.equal((await second.consumer.invoke(invocation())).disposition, 'completed');
    assert.equal(listOplConnections().connections.length, 1);
    assert.equal(fixture.calls, 2);
  });
});

test('fresh descriptor identity and both digests bind consumers and approvals', async () => {
  await withState(async () => {
    const fixture = setup();
    const { consumer } = await approve(fixture);
    const original = fixture.descriptors.get('research-agent')!;
    fixture.descriptors.set('research-agent', { ...original, manifest_sha256: 'c'.repeat(64) });
    await assert.rejects(consumer.invoke(invocation()), notDispatched);
    const updated = fixture.service.forPackage('research-agent');
    await assert.rejects(updated.invoke(invocation()), notDispatched);
    const request = await updated.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    fixture.descriptors.set('research-agent', {
      ...fixture.descriptors.get('research-agent')!,
      manifest: { ...original.manifest, content_digest: `sha256:${'d'.repeat(64)}` },
    });
    await assert.rejects(fixture.service.approveRequest(request.request_id), notDispatched);
    await assert.rejects(updated.invoke(invocation()), notDispatched);
    fixture.descriptors.set('research-agent', { ...original, manifest: { ...original.manifest, package_id: 'different-package' } });
    assert.throws(() => fixture.service.forPackage('research-agent'), notDispatched);
    assert.equal(fixture.calls, 0);
  });
});

test('missing, unavailable, uninstalled, or disabled descriptors cannot mint bindings or invoke', async () => {
  await withState(async () => {
    const fixture = setup();
    const { consumer } = await approve(fixture);
    const original = fixture.descriptors.get('research-agent')!;
    for (const changed of [
      { ...original, enabled: false },
      { ...original, readiness: { ...original.readiness, installed: false } },
      { ...original, readiness: { ...original.readiness, physical_status: 'unavailable' as const } },
      { ...original, readiness: { ...original.readiness, callability: 'disabled' as const } },
    ]) {
      fixture.descriptors.set('research-agent', changed);
      assert.throws(() => fixture.service.forPackage('research-agent'), notDispatched);
      await assert.rejects(consumer.invoke(invocation()), notDispatched);
    }
    fixture.descriptors.delete('research-agent');
    assert.throws(() => fixture.service.forPackage('research-agent'), notDispatched);
    await assert.rejects(consumer.invoke(invocation()), notDispatched);
    assert.equal(fixture.calls, 0);
  });
});

test('binding changes, disable cycles, and connection recreation never resurrect old grants', async () => {
  await withState(async () => {
    const fixture = setup();
    let approved = await approve(fixture);
    const firstRevision = listOplConnections().connections[0]!.security_revision;
    updateOplConnection('work-mail', { endpoint: 'https://other.example.test' });
    updateOplConnection('work-mail', { endpoint: 'https://mail.example.test' });
    assert.notEqual(listOplConnections().connections[0]!.security_revision, firstRevision);
    await assert.rejects(approved.consumer.invoke(invocation()), notDispatched);
    approved = await approve(fixture);
    updateOplConnection('work-mail', { disabled: true });
    updateOplConnection('work-mail', { disabled: false });
    await assert.rejects(approved.consumer.invoke(invocation()), notDispatched);
    approved = await approve(fixture);
    const beforeDelete = listOplConnections().connections[0]!.security_revision;
    deleteOplConnection('work-mail');
    connection();
    assert.notEqual(listOplConnections().connections[0]!.security_revision, beforeDelete);
    await assert.rejects(approved.consumer.invoke(invocation()), notDispatched);
    assert.equal(fixture.calls, 0);
  });
});

test('missing providers and undeclared or removed capabilities fail before provider dispatch', async () => {
  await withState(async () => {
    const fixture = setup();
    const consumer = fixture.service.forPackage('research-agent');
    await assert.rejects(consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.send'] }), notDispatched);
    const { consumer: approved } = await approve(fixture);
    fixture.setCapabilities([]);
    await assert.rejects(approved.invoke(invocation()), notDispatched);
    updateOplConnection('work-mail', { connection_type: 'unregistered-provider' });
    await assert.rejects(consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] }), notDispatched);
    await assert.rejects(consumer.invoke(invocation()), notDispatched);
    assert.equal(fixture.calls, 0);
  });
});

test('a descriptor changed during asynchronous capability discovery cannot create an access request', async () => {
  await withState(async () => {
    const fixture = setup();
    const consumer = fixture.service.forPackage('research-agent');
    const entered = deferred();
    const release = deferred();
    fixture.setBeforeList(async () => { entered.resolve(); await release.promise; });
    const request = consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    await entered.promise;
    const original = fixture.descriptors.get('research-agent')!;
    fixture.descriptors.set('research-agent', { ...original, manifest_sha256: 'e'.repeat(64) });
    release.resolve();
    await assert.rejects(request, notDispatched);
    assert.equal(fixture.service.listProjection().requests.length, 0);
  });
});

test('approval rechecks a pending request after asynchronous capability discovery', async () => {
  await withState(async () => {
    const fixture = setup();
    const consumer = fixture.service.forPackage('research-agent');
    const request = await consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    const entered = deferred();
    const release = deferred();
    fixture.setBeforeList(async () => { entered.resolve(); await release.promise; });
    const approval = fixture.service.approveRequest(request.request_id);
    await entered.promise;
    fixture.service.denyRequest(request.request_id);
    release.resolve();
    await assert.rejects(approval, notDispatched);
    assert.equal(fixture.service.listProjection().grants.length, 0);
    assert.equal(fixture.calls, 0);
  });
});

test('revocation while invoke is awaiting capabilities prevents dispatch', async () => {
  await withState(async () => {
    const fixture = setup();
    const { consumer, grant } = await approve(fixture);
    const entered = deferred();
    const release = deferred();
    fixture.setBeforeList(async () => { entered.resolve(); await release.promise; });
    const pending = consumer.invoke(invocation());
    await entered.promise;
    fixture.service.revokeGrant(grant.grant_id);
    release.resolve();
    await assert.rejects(pending, notDispatched);
    assert.equal(fixture.calls, 0);
  });
});

test('post-dispatch revocation withholds a result without retrying the provider', async () => {
  await withState(async () => {
    const fixture = setup();
    const { consumer, grant } = await approve(fixture);
    const entered = deferred();
    const release = deferred();
    fixture.setInvoke(async () => { entered.resolve(); await release.promise; return { private_result: 'DO_NOT_RELEASE' }; });
    const pending = consumer.invoke(invocation());
    await entered.promise;
    fixture.service.revokeGrant(grant.grant_id);
    release.resolve();
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(JSON.stringify(error).includes('DO_NOT_RELEASE'), false);
      return true;
    });
    assert.equal(fixture.calls, 1);
    assert.equal(JSON.stringify(fixture.service.listProjection()).includes('DO_NOT_RELEASE'), false);
  });
});

test('concurrent requests and approvals preserve both consumers after asynchronous discovery', async () => {
  await withState(async () => {
    const fixture = setup();
    const consumers = ['research-agent', 'mail-miniapp'].map((id) => fixture.service.forPackage(id));
    const requests = await Promise.all(consumers.map((consumer) => consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] })));
    const grants = await Promise.all(requests.map((request) => fixture.service.approveRequest(request.request_id)));
    assert.equal(fixture.service.listProjection().requests.length, 2);
    assert.equal(fixture.service.listProjection().grants.length, 2);
    assert.notEqual(grants[0].grant_id, grants[1].grant_id);
    await Promise.all(consumers.map((consumer) => consumer.invoke(invocation())));
    assert.equal(fixture.calls, 2);
    assert.equal(fixture.service.listProjection().invocations.length, 2);
  });
});

test('unknown provider outcomes are recorded once without argument, result, or error bodies', async () => {
  await withState(async (root) => {
    const fixture = setup();
    const { consumer } = await approve(fixture);
    fixture.setInvoke(async () => ({ text: 'RESULT_BODY_MUST_NOT_PERSIST' }));
    await consumer.invoke({ ...invocation(), input: { query: 'ARGUMENT_BODY_MUST_NOT_PERSIST' } });
    fixture.setInvoke(async () => { throw new Error('ERROR_BODY_MUST_NOT_PERSIST'); });
    await assert.rejects(consumer.invoke(invocation()), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.disposition, 'unknown_after_dispatch');
      assert.equal(JSON.stringify(error).includes('ERROR_BODY_MUST_NOT_PERSIST'), false);
      return true;
    });
    assert.equal(fixture.calls, 2);
    const projection = fixture.service.listProjection();
    assert.equal(projection.invocations.at(-1)?.disposition, 'unknown_after_dispatch');
    const serialized = JSON.stringify(projection);
    for (const marker of ['ARGUMENT_BODY_MUST_NOT_PERSIST', 'RESULT_BODY_MUST_NOT_PERSIST', 'ERROR_BODY_MUST_NOT_PERSIST']) {
      assert.equal(serialized.includes(marker), false);
      for (const entry of fs.readdirSync(root)) {
        const file = path.join(root, entry);
        if (fs.statSync(file).isFile()) assert.equal(fs.readFileSync(file, 'utf8').includes(marker), false);
      }
    }
  });
});

test('typed provider failures retain only their disposition and never cause automatic retries', async () => {
  await withState(async () => {
    const fixture = setup();
    const { consumer } = await approve(fixture);
    for (const disposition of ['not_dispatched', 'provider_reported', 'unknown_after_dispatch'] as const) {
      fixture.setInvoke(async () => { throw new OplConnectionProviderError('provider_failure', disposition); });
      await assert.rejects(consumer.invoke(invocation()), (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.details?.disposition, disposition);
        return true;
      });
    }
    assert.equal(fixture.calls, 3);
  });
});

test('provider credential fields cannot be returned to consumers or written to history', async () => {
  await withState(async () => {
    const fixture = setup();
    const { consumer } = await approve(fixture);
    fixture.setInvoke(async () => ({ nested: { access_token: 'PROVIDER_SECRET_MUST_NOT_ESCAPE' } }));
    await assert.rejects(consumer.invoke(invocation()), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(JSON.stringify(error).includes('PROVIDER_SECRET_MUST_NOT_ESCAPE'), false);
      return true;
    });
    assert.equal(fixture.calls, 1);
    assert.equal(JSON.stringify(fixture.service.listProjection()).includes('PROVIDER_SECRET_MUST_NOT_ESCAPE'), false);
  });
});

test('invocation metadata retains a bounded recent history', async () => {
  await withState(async () => {
    const fixture = setup();
    const { consumer } = await approve(fixture);
    const first = await consumer.invoke(invocation());
    for (let index = 0; index < 300; index += 1) await consumer.invoke(invocation());
    const history = fixture.service.listProjection().invocations;
    assert.ok(history.length > 0 && history.length <= 256);
    assert.equal(history.some((item) => item.invocation_id === first.invocation_id), false);
    assert.equal(fixture.calls, 301);
  });
});

test('provider-owned account references remain opaque connection handles', async () => {
  await withState(() => {
    const created = createOplConnection({
      connection_id: 'relay-work-mail',
      name: 'Work mailbox',
      connection_type: 'opl-relay',
      credential_handle: 'provider:opl-relay:mailbox%40example.test',
    });
    assert.equal(created.connection_registry.connection?.status, 'untested');
    assert.equal(created.connection_registry.connection?.credential_handle, 'provider:opl-relay:mailbox%40example.test');
    assert.equal(JSON.stringify(created.connection_registry).includes('refresh_token'), false);
  });
});

test('owner projection enriches connections and authorization records without exposing binding or digests', async () => {
  await withState(async () => {
    const fixture = setup();
    updateOplConnection('work-mail', { account_label: 'work@example.test' });
    await approve(fixture);
    const projection = fixture.service.listProjection();
    assert.deepEqual(projection.connections[0], {
      connection_id: 'work-mail',
      display_name: 'Work mailbox',
      provider_type: 'mail',
      status: 'untested',
      security_revision: listOplConnections().connections[0]!.security_revision,
      account_label: 'work@example.test',
      capabilities: [{ capability_id: 'mail.read', label: 'Read mail', risk: 'read' }],
    });
    assert.equal(projection.requests[0]?.consumer_display_name, 'Research Agent');
    assert.equal(projection.requests[0]?.connection_display_name, 'Work mailbox');
    assert.deepEqual(projection.requests[0]?.capabilities, [
      { capability_id: 'mail.read', label: 'Read mail', risk: 'read' },
    ]);
    const serialized = JSON.stringify(projection);
    for (const forbidden of ['credential_handle', 'endpoint', 'consumer_manifest_sha256', 'consumer_content_digest']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
});

test('provider risk or label changes require a new request and user approval', async () => {
  await withState(async () => {
    const fixture = setup();
    const consumer = fixture.service.forPackage('research-agent');
    const request = await consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    fixture.setCapabilities([{ capability_id: 'mail.read', title: 'Read and archive mail', risk: 'local_write' }]);
    await assert.rejects(fixture.service.approveRequest(request.request_id), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.reason_code, 'provider_capability_changed');
      return true;
    });
    assert.equal(fixture.service.listProjection().grants.length, 0);
    fixture.setCapabilities([{ capability_id: 'mail.read', title: 'Read mail', risk: 'read' }]);
    const next = await consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    await fixture.service.approveRequest(next.request_id);
    fixture.setCapabilities([{ capability_id: 'mail.read', title: 'Read and archive mail', risk: 'external_write' }]);
    await assert.rejects(consumer.invoke(invocation()), notDispatched);
    assert.equal(fixture.calls, 0);
  });
});

test('invalid provider capability risk is rejected and old requests or grants project stale', async () => {
  await withState(async () => {
    const fixture = setup();
    const consumer = fixture.service.forPackage('research-agent');
    fixture.setCapabilities([{ capability_id: 'mail.read', title: 'Read mail', risk: 'unknown' as never }]);
    await assert.rejects(consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] }), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.reason_code, 'provider_capability_descriptor_invalid');
      return true;
    });
    fixture.setCapabilities([{ capability_id: 'mail.read', title: 'Read mail', risk: 'read' }]);
    const pending = await consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    updateOplConnection('work-mail', { disabled: true });
    let projection = fixture.service.listProjection();
    assert.equal(projection.requests.find((entry) => entry.request_id === pending.request_id)?.status, 'superseded');
    assert.equal(projection.requests.find((entry) => entry.request_id === pending.request_id)?.stale_reason, 'connection_disabled');
    updateOplConnection('work-mail', { disabled: false });
    projection = fixture.service.listProjection();
    assert.equal(projection.requests.find((entry) => entry.request_id === pending.request_id)?.stale_reason, 'connection_revision_changed');
    await assert.rejects(fixture.service.approveRequest(pending.request_id), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.reason_code, 'connection_revision_changed');
      return true;
    });

    const next = await consumer.requestAccess({ connection_id: 'work-mail', capability_ids: ['mail.read'] });
    const grant = await fixture.service.approveRequest(next.request_id);
    fixture.descriptors.set('research-agent', {
      ...fixture.descriptors.get('research-agent')!,
      manifest_sha256: 'f'.repeat(64),
    });
    projection = fixture.service.listProjection();
    assert.equal(projection.grants.find((entry) => entry.grant_id === grant.grant_id)?.status, 'stale');
    assert.equal(projection.grants.find((entry) => entry.grant_id === grant.grant_id)?.stale_reason, 'consumer_descriptor_changed');
    await assert.rejects(consumer.invoke(invocation()), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.reason_code, 'consumer_descriptor_changed');
      return true;
    });
    deleteOplConnection('work-mail');
    projection = fixture.service.listProjection();
    assert.equal(projection.grants.find((entry) => entry.grant_id === grant.grant_id)?.stale_reason, 'connection_missing');
  });
});
