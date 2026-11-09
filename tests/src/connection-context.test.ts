import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { activateInstalledPackageConnectionContext, createOplConnectionContextHost } from '../../src/host/connection-context.ts';
import { createOplConnectionAuthorizationService } from '../../src/adapters/integration/connection-authorization.ts';
import { createOplConnection } from '../../src/adapters/integration/connection-registry.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';

function descriptor(packageId: string, sourcePath = `/fixture/${packageId}`): InstalledPackageDescriptor {
  return {
    manifest: { package_id: packageId, content_digest: `sha256:${'b'.repeat(64)}` },
    manifest_sha256: 'a'.repeat(64),
    sourcePath,
    carrier_readback: { kind: 'codex_plugin_manager', identity: `${packageId}@fixture` },
    enabled: true,
    readiness: { installed: true, physical_status: 'available', callability: 'callable' },
  } as InstalledPackageDescriptor;
}

async function fixture(run: (value: ReturnType<typeof setup>) => Promise<void> | void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-connection-context-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  try { await run(setup()); }
  finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function setup() {
  createOplConnection({
    connection_id: 'work-mail', name: 'Work mail', connection_type: 'fixture-mail',
    credential_handle: 'env:FIXTURE_MAIL_CREDENTIAL',
  });
  const descriptors = new Map(['app-host', 'research-agent'].map((id) => [id, descriptor(id)]));
  const descriptorDiscovery = { discover: () => descriptors };
  const calls: string[] = [];
  const authorization = createOplConnectionAuthorizationService({
    descriptorDiscovery,
    providers: [{
      provider_id: 'fixture-mail',
      listCapabilities: () => [{ capability_id: 'mail.read', title: 'Read mail', risk: 'read' }],
      async invoke(request) {
        calls.push(request.consumer_package_id);
        return { count: 1 };
      },
    }],
  });
  const host = createOplConnectionContextHost({ descriptorDiscovery, authorization });
  return { descriptors, authorization, host, calls };
}

function rejected(reason: string) {
  return (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    assert.equal(error.details?.reason_code, reason);
    assert.equal(error.details?.disposition, 'not_dispatched');
    return true;
  };
}

test('trusted activation injects only a fixed consumer port and pending requests cannot self-approve', async () => {
  await fixture(async ({ host, descriptors, authorization, calls }) => {
    const context = host.activate(descriptors.get('app-host')!);
    assert.equal(context.package_id, 'app-host');
    assert.equal(Object.isFrozen(context.connect), true);
    assert.deepEqual(Object.keys(context.connect).sort(), ['invoke', 'listConnections', 'requestAccess']);
    const pending = await context.connect.requestAccess('work-mail', ['mail.read']);
    assert.equal(pending.consumer_package_id, 'app-host');
    await assert.rejects(context.connect.invoke('work-mail', 'mail.read', {}), rejected('connection_grant_missing'));
    await authorization.approveRequest(pending.request_id);
    // A page may display another Package or include arbitrary business input;
    // neither changes the runtime closure's authenticated consumer.
    const result = await context.connect.invoke('work-mail', 'mail.read', { package_id: 'research-agent' });
    assert.deepEqual(result.result, { count: 1 });
    assert.deepEqual(calls, ['app-host']);
  });
});

test('activation rejects absent, unavailable, or mismatched installed descriptors before a port exists', async () => {
  await fixture(({ host, descriptors }) => {
    assert.throws(() => host.activate(descriptor('uninstalled')), rejected('installed_package_descriptor_missing'));
    const current = descriptors.get('app-host')!;
    assert.throws(() => host.activate({ ...current, manifest_sha256: 'c'.repeat(64) }), rejected('activation_descriptor_stale'));
    descriptors.set('app-host', { ...current, enabled: false });
    assert.throws(() => host.activate(current), rejected('installed_package_descriptor_not_callable'));
  });
});

test('a runtime activation cannot adopt package updates, carrier moves, or changed source roots', async () => {
  await fixture(async ({ host, descriptors }) => {
    const current = descriptors.get('app-host')!;
    for (const updated of [
      { ...current, manifest_sha256: 'c'.repeat(64) },
      { ...current, manifest: { ...current.manifest, content_digest: `sha256:${'d'.repeat(64)}` } },
      { ...current, sourcePath: '/fixture/replaced' },
      { ...current, carrier_readback: { ...current.carrier_readback, identity: 'replacement@fixture' } },
    ]) {
      descriptors.set('app-host', current);
      const context = host.activate(current);
      descriptors.set('app-host', updated);
      assert.throws(() => context.connect.listConnections(), rejected('activation_descriptor_changed'));
      assert.throws(() => context.connect.requestAccess('work-mail', ['mail.read']), rejected('activation_descriptor_changed'));
      assert.throws(() => context.connect.invoke('work-mail', 'mail.read', {}), rejected('activation_descriptor_changed'));
    }
    const updated = descriptors.get('app-host')!;
    assert.equal((await host.activate(updated).connect.listConnections()).length, 1);
  });
});

test('retained consumer closures stop working after runtime disposal or package removal', async () => {
  await fixture(({ host, descriptors }) => {
    const current = descriptors.get('app-host')!;
    const disposed = host.activate(current);
    const invoke = disposed.connect.invoke;
    disposed.dispose();
    disposed.dispose();
    assert.throws(() => invoke('work-mail', 'mail.read', {}), rejected('activation_disposed'));
    const removed = host.activate(current);
    descriptors.delete('app-host');
    assert.throws(() => removed.connect.listConnections(), rejected('installed_package_descriptor_missing'));
  });
});

test('domain activation binds only its own installed source root', async () => {
  await fixture(({ descriptors, authorization }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-relay-root-'));
    const current = descriptor('app-host', root);
    descriptors.set('app-host', current);
    const context = activateInstalledPackageConnectionContext({
      packageRoot: root,
      packageId: 'app-host',
    }, { descriptorDiscovery: { discover: () => descriptors }, authorization });
    assert.equal(context.package_id, 'app-host');
    context.dispose();
    assert.throws(() => activateInstalledPackageConnectionContext({
      packageRoot: path.join(root, 'replaced'), packageId: 'app-host',
    }, { descriptorDiscovery: { discover: () => descriptors }, authorization }), rejected('activation_source_root_mismatch'));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
