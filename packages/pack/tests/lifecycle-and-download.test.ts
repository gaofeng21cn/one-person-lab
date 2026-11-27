import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  EventBus,
  createClientContext,
  openSqliteStore,
} from '@opl/core';
import {
  InMemorySecretVault,
  createConnectService,
} from '@opl/connect';
import {
  PackError,
  buildPackage,
  classifyReloadMode,
  combineReloadModes,
  createPackService,
  createPackageSourceArchive,
  downloadPackageArchive,
  normalizeDistributionVersion,
  packageSourceArchiveDigest,
  type PackEvents,
  type PackProgressEvent,
} from '../src/index.ts';

function writeSamplePkg(
  dir: string,
  overrides: {
    id?: string;
    version?: string;
    intent?: 'agent' | 'app' | 'extension' | 'channel';
    extraSkillText?: string;
    ui?: Record<string, unknown>;
    providesExtra?: Record<string, unknown>;
  } = {},
): void {
  const id = overrides.id ?? 'sample-pkg';
  const version = overrides.version ?? '1.0.0';
  fs.mkdirSync(path.join(dir, 'skills', id), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(
    path.join(dir, 'skills', id, 'SKILL.md'),
    `# ${id}\n${overrides.extraSkillText ?? 'Initial skill'}\n`,
  );
  const manifest = {
    schema_version: 'opl.package.v2',
    identity: {
      id,
      version,
      intent: overrides.intent ?? 'extension',
      name: { 'zh-CN': id, 'en-US': id },
      summary: { 'zh-CN': `${id} 摘要`, 'en-US': `${id} summary` },
      publisher: 'one-person-lab',
      icon: 'assets/icon.png',
    },
    provides: {
      skills: [{ id, path: `./skills/${id}` }],
      ...(overrides.providesExtra ?? {}),
    },
    ...(overrides.ui ? { ui: overrides.ui } : {}),
  };
  fs.writeFileSync(path.join(dir, 'opl-package.json'), JSON.stringify(manifest, null, 2));
}

test('Pack validates declared capability exports when a required provider is installed', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-exports-'));
  const db = openSqliteStore(path.join(root, 'opl.db'));
  t.after(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const pack = createPackService({ db, stateDir: root });
  const provider = path.join(root, 'provider-src');
  const consumer = path.join(root, 'consumer-src');
  writeSamplePkg(provider, {
    id: 'provider',
    providesExtra: {
      skills: [{ id: 'specialty', path: './skills/provider', exposure: 'opt_in' }],
      module_ids: ['provider.stats'],
    },
  });
  writeSamplePkg(consumer, { id: 'consumer' });
  const manifestPath = path.join(consumer, 'opl-package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const requirements = [
    { id: 'provider', required_capabilities: ['specialty', 'missing-skill'], required_module_ids: ['provider.stats'] },
    { id: 'optional', presence: 'optional', required_capabilities: ['unused'] },
  ];
  const writeRequirements = () => fs.writeFileSync(manifestPath, JSON.stringify({
    ...manifest, dependencies: { packages: requirements },
  }));
  const installConsumer = () => pack.install({ source: { kind: 'local_dir', path: consumer }, syncCodex: false });
  await pack.install({ source: { kind: 'local_dir', path: provider }, syncCodex: false });
  writeRequirements();
  await assert.rejects(installConsumer, (error: unknown) => {
    assert.ok(error instanceof PackError);
    assert.equal(error.code, 'PACK_DEPENDENCY_MISSING');
    assert.deepEqual(error.details.missing_capabilities, ['missing-skill']);
    return true;
  });
  assert.equal(pack.inspect('consumer'), null);
  requirements[0]!.required_capabilities = ['specialty'];
  requirements[0]!.required_module_ids = ['provider.stats', 'specialty'];
  writeRequirements();
  await assert.rejects(installConsumer, (error: unknown) => {
    assert.ok(error instanceof PackError);
    assert.equal(error.code, 'PACK_DEPENDENCY_MISSING');
    assert.deepEqual(error.details.missing_module_ids, ['specialty']);
    return true;
  });
  assert.equal(pack.inspect('consumer'), null);
  requirements[0]!.required_module_ids = ['provider.stats'];
  writeRequirements();
  assert.equal((await installConsumer()).package.enabled, true);
});

test('normalizes PEP440 versions and classifies reload_mode accurately', () => {
  assert.equal(normalizeDistributionVersion('0.3.2a1'), '0.3.2-alpha.1');
  assert.equal(normalizeDistributionVersion('1.0.0b2'), '1.0.0-beta.2');
  assert.equal(normalizeDistributionVersion('2.1.0rc3'), '2.1.0-rc.3');
  assert.equal(normalizeDistributionVersion('1.2.3'), '1.2.3');

  assert.equal(
    classifyReloadMode({
      schema_version: 'opl.package.v2',
      identity: {
        id: 'skills-only',
        version: '1.0.0',
        intent: 'extension',
        name: { 'zh-CN': 'A', 'en-US': 'A' },
        summary: { 'zh-CN': 'A', 'en-US': 'A' },
        publisher: 'opl',
      },
      provides: { skills: [{ id: 's1', path: './skills/s1' }] },
    }),
    'none',
  );

  assert.equal(
    classifyReloadMode({
      schema_version: 'opl.package.v2',
      identity: {
        id: 'dsh-ui-only',
        version: '1.0.0',
        intent: 'app',
        name: { 'zh-CN': 'B', 'en-US': 'B' },
        summary: { 'zh-CN': 'B', 'en-US': 'B' },
        publisher: 'opl',
      },
      ui: {
        dsh_client: {
          client_entry: './dist/client.js',
          slots: ['main'],
        },
      },
    }),
    'renderer_reload',
  );

  assert.equal(
    classifyReloadMode({
      schema_version: 'opl.package.v2',
      identity: {
        id: 'dsh-host',
        version: '1.0.0',
        intent: 'app',
        name: { 'zh-CN': 'C', 'en-US': 'C' },
        summary: { 'zh-CN': 'C', 'en-US': 'C' },
        publisher: 'opl',
      },
      ui: {
        dsh_client: {
          client_entry: './dist/client.js',
          host_entry: './dist/host.js',
          slots: ['main'],
        },
      },
    }),
    'restart_required',
  );

  assert.equal(combineReloadModes(['none', 'renderer_reload']), 'renderer_reload');
  assert.equal(combineReloadModes(['none', 'renderer_reload', 'restart_required']), 'restart_required');
});

test('downloadPackageArchive downloads via parallel HTTP 206 Range, verifies SHA-256, and handles cancellation', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-dl-'));
  const pkgSrc = path.join(tmpDir, 'src');
  const archiveSrc = path.join(tmpDir, 'source.tar.gz');
  const cacheRoot = path.join(tmpDir, 'cache');

  try {
    writeSamplePkg(pkgSrc, { id: 'dl-pkg', version: '1.0.0' });
    // Add ~64 KB deterministic payload so multi-chunk Range splitting exercises parallel merge
    fs.writeFileSync(path.join(pkgSrc, 'assets', 'payload.bin'), Buffer.alloc(64 * 1024, 0x41));
    const digest = createPackageSourceArchive(pkgSrc, archiveSrc, [
      'opl-package.json',
      'assets/icon.png',
      'assets/payload.bin',
      'skills/dl-pkg/SKILL.md',
    ]);
    const archiveBytes = fs.readFileSync(archiveSrc);

    const rangeRequests: string[] = [];
    const server = http.createServer((req, res) => {
      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        rangeRequests.push(rangeHeader);
        const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Number(match[2]) : archiveBytes.length - 1;
          const slice = archiveBytes.subarray(start, end + 1);
          res.writeHead(206, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(slice.length),
            'Content-Range': `bytes ${start}-${end}/${archiveBytes.length}`,
          });
          res.end(slice);
          return;
        }
      }
      res.writeHead(200, { 'Content-Length': String(archiveBytes.length) });
      res.end(archiveBytes);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const url = `http://127.0.0.1:${address.port}/archive.tar.gz`;

    try {
      const progressEvents: number[] = [];
      const downloaded = await downloadPackageArchive({
        url,
        token: 'test-token',
        digest,
        size: archiveBytes.length,
        packageId: 'dl-pkg',
        cacheRoot,
        parallelism: 4,
        minParallelBytes: 256,
        allowInsecureHttp: true,
        onProgress: (p) => {
          if (typeof p.bytes_done === 'number') progressEvents.push(p.bytes_done);
        },
      });
      assert.ok(rangeRequests.length >= 2, 'Should issue multiple parallel 206 Range requests');
      assert.equal(packageSourceArchiveDigest(downloaded), digest);
      assert.ok(progressEvents.length >= 1);

      // Tampered digest fails closed
      const badDigest = `sha256:${'0'.repeat(64)}`;
      await assert.rejects(
        () =>
          downloadPackageArchive({
            url,
            digest: badDigest,
            size: archiveBytes.length,
            packageId: 'dl-pkg',
            cacheRoot,
            allowInsecureHttp: true,
          }),
        (err: unknown) => err instanceof PackError && err.code === 'PACK_LOCK_MISMATCH',
      );

      // Cancelled AbortSignal fails with PACK_DOWNLOAD_CANCELLED
      const ac = new AbortController();
      ac.abort();
      await assert.rejects(
        () =>
          downloadPackageArchive({
            url,
            digest,
            size: archiveBytes.length,
            packageId: 'dl-pkg',
            cacheRoot: path.join(tmpDir, 'cache2'),
            allowInsecureHttp: true,
            signal: ac.signal,
          }),
        (err: unknown) => err instanceof PackError && err.code === 'PACK_DOWNLOAD_CANCELLED',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PackService SQLite lifecycle: install, update invalidating Connect grants, link/unlink preserving dev dir, and uninstall revoking grants', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-svc-'));
  const stateDir = path.join(tmpDir, 'state');
  const marketplaceRoot = path.join(tmpDir, 'codex-marketplace');
  const pkgV1Dir = path.join(tmpDir, 'pkg-v1');
  const pkgV2Dir = path.join(tmpDir, 'pkg-v2');
  const devLinkDir = path.join(tmpDir, 'dev-link-repo');

  try {
    writeSamplePkg(pkgV1Dir, {
      id: 'relay-consumer',
      version: '1.0.0',
      ui: {
        declarative: {
          views: [
            {
              id: 'relay.panel',
              view_type: 'list_detail',
              slot: 'workbench.panel',
              title: { 'zh-CN': '面板', 'en-US': 'Panel' },
              data_ref: 'relay#panel',
            },
          ],
        },
      },
      providesExtra: {
        contribution_handler: { kind: 'cli', argv: ['echo', 'ok'] },
      },
    });
    buildPackage(pkgV1Dir);

    writeSamplePkg(pkgV2Dir, {
      id: 'relay-consumer',
      version: '1.1.0',
      extraSkillText: 'Updated v1.1.0',
      ui: {
        declarative: {
          views: [
            {
              id: 'relay.panel',
              view_type: 'list_detail',
              slot: 'workbench.panel',
              title: { 'zh-CN': '面板', 'en-US': 'Panel' },
              data_ref: 'relay#panel',
            },
          ],
        },
      },
      providesExtra: {
        contribution_handler: { kind: 'cli', argv: ['echo', 'ok'] },
      },
    });
    buildPackage(pkgV2Dir);

    writeSamplePkg(devLinkDir, { id: 'linked-dev', version: '0.1.0' });

    const db = openSqliteStore(path.join(stateDir, 'opl.db'));
    const eventBus = new EventBus<PackEvents>();
    const progressLog: PackProgressEvent[] = [];
    eventBus.on('event.pack.progress', (ev) => {
      progressLog.push(ev);
    });

    const pack = createPackService({
      db,
      stateDir,
      marketplaceRoot,
      eventBus,
    });

    const connect = createConnectService({
      db,
      stateDir,
      vault: new InMemorySecretVault(),
      signingSecret: 'test-signing-secret-must-be-at-least-32-bytes!',
      verifyRuntimeDigest: (snap) => pack.verifyRuntimeDigest(snap),
    });

    const trustedApp = createClientContext({
      client_kind: 'opl_app',
      session_id: 'sess-1',
    });
    const externalScript = createClientContext({
      client_kind: 'external',
      session_id: 'sess-ext',
    });

    // Untrusted host rejected on install
    await assert.rejects(
      () =>
        pack.install({
          source: { kind: 'local_dir', path: pkgV1Dir },
          clientContext: externalScript,
        }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_TRUSTED_HOST_REQUIRED',
    );

    // Install v1.0.0
    const installed = await pack.install({
      source: { kind: 'local_dir', path: pkgV1Dir },
      clientContext: trustedApp,
    });
    assert.equal(installed.package.package_id, 'relay-consumer');
    assert.equal(installed.package.carrier_synced, true);
    assert.equal(installed.package.codex_synced, true);
    assert.equal(installed.reload_mode, 'renderer_reload');
    assert.ok(progressLog.some((e) => e.status === 'succeeded' && e.reload_mode === 'renderer_reload'));

    // Connect grants bound to v1.0.0 digest
    const conn = await connect.add(trustedApp, {
      provider_type: 'github',
      display_name: 'GitHub',
      secret: 'ghp_secret_123456',
      capabilities: [
        { capability_id: 'repo.read', title: 'Read repo', risk: 'read' },
      ],
    });
    const reqAccess = await connect.requestAccess({
      consumer_package_id: 'relay-consumer',
      connection_id: conn.connection_id,
      capability_ids: ['repo.read'],
    });
    await connect.approveRequest(trustedApp, {
      request_id: reqAccess.request_id,
      approved_by: 'tester',
    });
    const port = connect.forPackage('relay-consumer');
    const grantOk = await port.checkGrant({
      connection_id: conn.connection_id,
      capability_id: 'repo.read',
    });
    assert.equal(grantOk.allowed, true);

    // Update to v1.1.0 -> content_digest changes -> Connect port fails closed with CONSUMER_DIGEST_MISMATCH
    const updated = await pack.update({
      packageId: 'relay-consumer',
      source: { kind: 'local_dir', path: pkgV2Dir },
      clientContext: trustedApp,
    });
    assert.notEqual(updated.package.content_digest, installed.package.content_digest);
    await assert.rejects(
      () => port.checkGrant({ connection_id: conn.connection_id, capability_id: 'repo.read' }),
      (err: { code?: string }) => err.code === 'CONSUMER_DIGEST_MISMATCH',
    );

    // Uninstall revokes remaining requested/granted connection_grants inside same txImmediate
    const req2 = await connect.requestAccess({
      consumer_package_id: 'relay-consumer',
      connection_id: conn.connection_id,
      capability_ids: ['repo.read'],
    });
    await connect.approveRequest(trustedApp, {
      request_id: req2.request_id,
      approved_by: 'tester',
    });
    const uninst = await pack.uninstall({
      packageId: 'relay-consumer',
      clientContext: trustedApp,
    });
    assert.equal(uninst.removed, true);
    assert.ok(uninst.revoked_grants >= 1);
    const grantRow = db
      .prepare('SELECT status FROM connection_grants WHERE grant_id = ?')
      .get(req2.grants[0].grant_id) as { status: string };
    assert.equal(grantRow.status, 'revoked');

    // dev_link + unlink MUST preserve source dev directory
    const linked = await pack.link({ dir: devLinkDir, clientContext: trustedApp });
    assert.equal(linked.package.install_mode, 'dev_link');
    assert.equal(linked.package.origin, 'local_dev');
    const unlinked = await pack.unlink({ packageId: 'linked-dev', clientContext: trustedApp });
    assert.equal(unlinked.removed, true);
    assert.equal(fs.existsSync(path.join(devLinkDir, 'opl-package.json')), true);

    // reconcileOperations marks stale in-flight ops as interrupted
    const staleOp = pack.store.createOperation({
      package_id: 'stale-pkg',
      action: 'install',
      status: 'downloading',
    });
    const reconciled = pack.reconcileOperations();
    assert.equal(reconciled.some((r) => r.op_id === staleOp.op_id && r.status === 'interrupted'), true);

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PackService enforces update ID & digest checks, deletes release dirs under symlinked stateDir, verifies dev_link internal symlinks, checks npm integrity & dep semver, and caps fetchFull maxBytes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-r2-hard-'));
  const realStateDir = path.join(tmpDir, 'real-state');
  const symlinkStateDir = path.join(tmpDir, 'sym-state');
  const marketplaceRoot = path.join(tmpDir, 'marketplace');

  try {
    fs.mkdirSync(realStateDir, { recursive: true });
    fs.symlinkSync(realStateDir, symlinkStateDir, 'dir');

    const pkgADir = path.join(tmpDir, 'pkg-a');
    const pkgBDir = path.join(tmpDir, 'pkg-b');
    const devDir = path.join(tmpDir, 'dev-sym');
    const depConsumerDir = path.join(tmpDir, 'dep-consumer');
    writeSamplePkg(pkgADir, { id: 'pkg-a', version: '1.0.0' });
    writeSamplePkg(pkgBDir, { id: 'pkg-b', version: '2.0.0' });

    const db = openSqliteStore(path.join(realStateDir, 'opl.db'));
    const pack = createPackService({ db, stateDir: symlinkStateDir, marketplaceRoot });
    const trustedApp = createClientContext({ client_kind: 'opl_app', session_id: 'sess-r2' });

    // 1. Uninstall deletes physical release dir even under symlinked stateDir (/var -> /private/var or explicit symlink)
    const instA = await pack.install({
      source: { kind: 'local_dir', path: pkgADir },
      clientContext: trustedApp,
    });
    assert.equal(fs.existsSync(instA.package.install_path), true);

    // 2. Update rejects mismatched manifest.identity.id
    await assert.rejects(
      () =>
        pack.update({
          packageId: 'pkg-a',
          source: { kind: 'local_dir', path: pkgBDir },
          clientContext: trustedApp,
        }),
      (err: unknown) => err instanceof PackError && err.code === 'INVALID_MANIFEST',
    );
    assert.equal(pack.inspect('pkg-b'), null);
    assert.equal(pack.inspect('pkg-a')?.version, '1.0.0');

    // Uninstall pkg-a -> physical directory MUST be removed!
    await pack.uninstall({ packageId: 'pkg-a', clientContext: trustedApp });
    assert.equal(fs.existsSync(instA.package.install_path), false);

    // 3. dev_link with internal symlink + stale opl-release.lock.json passes verifyRuntimeDigest, fails closed on tamper
    writeSamplePkg(devDir, { id: 'dev-sym', version: '0.1.0' });
    buildPackage(devDir); // writes opl-release.lock.json before edits
    fs.writeFileSync(path.join(devDir, 'assets', 'real.txt'), 'hello-internal-link');
    fs.symlinkSync('real.txt', path.join(devDir, 'assets', 'alias.txt'));
    const linked = await pack.link({ dir: devDir, clientContext: trustedApp });
    const devSnap = {
      package_id: 'dev-sym',
      version: linked.package.version,
      install_path: linked.package.install_path,
      content_digest: linked.package.content_digest,
      manifest_json: linked.package.manifest_json,
    };
    assert.equal(await pack.verifyRuntimeDigest(devSnap), true);
    fs.writeFileSync(path.join(devDir, 'assets', 'real.txt'), 'tampered!');
    assert.equal(await pack.verifyRuntimeDigest(devSnap), false);

    // 4. Dependency SemVer range enforcement
    await pack.install({ source: { kind: 'local_dir', path: pkgADir }, clientContext: trustedApp });
    writeSamplePkg(depConsumerDir, { id: 'dep-consumer', version: '1.0.0' });
    const depManifestPath = path.join(depConsumerDir, 'opl-package.json');
    const depManifest = JSON.parse(fs.readFileSync(depManifestPath, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(
      depManifestPath,
      JSON.stringify({
        ...depManifest,
        dependencies: { packages: [{ id: 'pkg-a', version: '^2.0.0', presence: 'required' }] },
      }),
    );
    await assert.rejects(
      () => pack.install({ source: { kind: 'local_dir', path: depConsumerDir }, clientContext: trustedApp }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_DEPENDENCY_MISSING',
    );
    fs.writeFileSync(
      depManifestPath,
      JSON.stringify({
        ...depManifest,
        dependencies: { packages: [{ id: 'pkg-a', version: '^1.0.0', presence: 'required' }] },
      }),
    );
    const depOk = await pack.install({
      source: { kind: 'local_dir', path: depConsumerDir },
      clientContext: trustedApp,
    });
    assert.equal(depOk.package.package_id, 'dep-consumer');

    // 5. npm SRI integrity + expected_digest enforcement
    const npmSrcDir = path.join(tmpDir, 'npm-src');
    const npmTgzPath = path.join(tmpDir, 'npm-pkg.tgz');
    writeSamplePkg(npmSrcDir, { id: 'npm-pkg', version: '1.0.0' });
    createPackageSourceArchive(npmSrcDir, npmTgzPath, [
      'opl-package.json',
      'assets/icon.png',
      'skills/npm-pkg/SKILL.md',
    ]);
    const tgzBytes = fs.readFileSync(npmTgzPath);
    const goodSri = `sha512-${crypto.createHash('sha512').update(tgzBytes).digest('base64')}`;
    const badSri = `sha512-${Buffer.alloc(64, 0).toString('base64')}`;
    let servedIntegrity = badSri;
    const npmPack = createPackService({
      db,
      stateDir: symlinkStateDir,
      marketplaceRoot,
      fetchImpl: async (url) => {
        if (url.endsWith('/npm-pkg')) {
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                'dist-tags': { latest: '1.0.0' },
                versions: {
                  '1.0.0': {
                    dist: {
                      tarball: 'https://registry.npmjs.org/npm-pkg/-/npm-pkg-1.0.0.tgz',
                      integrity: servedIntegrity,
                    },
                  },
                },
              };
            },
            async text() {
              return '';
            },
            async arrayBuffer() {
              return new ArrayBuffer(0);
            },
          };
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return {};
          },
          async text() {
            return '';
          },
          async arrayBuffer() {
            return tgzBytes.buffer.slice(tgzBytes.byteOffset, tgzBytes.byteOffset + tgzBytes.byteLength);
          },
        };
      },
    });
    await assert.rejects(
      () => npmPack.install({ source: { kind: 'npm', ref: 'npm-pkg' }, clientContext: trustedApp }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_LOCK_MISMATCH',
    );
    servedIntegrity = goodSri;
    const npmInstalled = await npmPack.install({
      source: { kind: 'npm', ref: 'npm-pkg', expected_digest: goodSri },
      clientContext: trustedApp,
    });
    assert.equal(npmInstalled.package.package_id, 'npm-pkg');

    // 6. downloadPackageArchive fails closed when custom transport lacks fetchFull, and fetchFull enforces maxBytes
    await assert.rejects(
      () =>
        downloadPackageArchive({
          url: 'https://example.com/pkg.tar.gz',
          digest: `sha256:${'a'.repeat(64)}`,
          size: 1024,
          packageId: 'dl-custom',
          cacheRoot: path.join(tmpDir, 'dl-cache-1'),
          parallelism: 1,
          transport: {
            async fetchRange() {
              return { status: 200, contentRange: null, bytes: new Uint8Array(0) };
            },
          },
        }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_DOWNLOAD_FAILED',
    );

    const oversizedServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(4096, 0x42));
    });
    await new Promise<void>((resolve) => oversizedServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = oversizedServer.address();
    assert.ok(addr && typeof addr === 'object');
    try {
      await assert.rejects(
        () =>
          downloadPackageArchive({
            url: `http://127.0.0.1:${addr.port}/huge.tar.gz`,
            digest: `sha256:${'b'.repeat(64)}`,
            size: 128,
            packageId: 'dl-oversize',
            cacheRoot: path.join(tmpDir, 'dl-cache-2'),
            parallelism: 1,
            allowInsecureHttp: true,
          }),
        (err: unknown) => err instanceof PackError && err.code === 'PACK_LOCK_MISMATCH',
      );
    } finally {
      await new Promise<void>((resolve) => oversizedServer.close(() => resolve()));
    }

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PackService.uninstall cleans superseded version dirs and fetchRange rejects non-206 & oversized streams', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-r3-hard-'));
  const stateDir = path.join(tmpDir, 'state');
  const marketplaceRoot = path.join(tmpDir, 'marketplace');
  const pkgV1Dir = path.join(tmpDir, 'pkg-v1');
  const pkgV2Dir = path.join(tmpDir, 'pkg-v2');
  const devDir = path.join(tmpDir, 'dev-src');

  try {
    writeSamplePkg(pkgV1Dir, { id: 'up-clean', version: '1.0.0' });
    writeSamplePkg(pkgV2Dir, { id: 'up-clean', version: '1.1.0', extraSkillText: 'v1.1.0' });
    writeSamplePkg(devDir, { id: 'dev-keep', version: '0.1.0' });

    const db = openSqliteStore(path.join(stateDir, 'opl.db'));
    const pack = createPackService({ db, stateDir, marketplaceRoot });
    const trustedApp = createClientContext({ client_kind: 'opl_app', session_id: 'sess-r3' });

    const inst1 = await pack.install({
      source: { kind: 'local_dir', path: pkgV1Dir },
      clientContext: trustedApp,
    });
    const inst2 = await pack.update({
      packageId: 'up-clean',
      source: { kind: 'local_dir', path: pkgV2Dir },
      clientContext: trustedApp,
    });
    assert.equal(fs.existsSync(inst1.package.install_path), true);
    assert.equal(fs.existsSync(inst2.package.install_path), true);

    await pack.uninstall({ packageId: 'up-clean', clientContext: trustedApp });
    assert.equal(fs.existsSync(inst1.package.install_path), false);
    assert.equal(fs.existsSync(inst2.package.install_path), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'packages', 'up-clean')), false);

    // Ensure dev_link unlink/uninstall still preserves source dir
    await pack.link({ dir: devDir, clientContext: trustedApp, syncCodex: false });
    await pack.unlink({ packageId: 'dev-keep', clientContext: trustedApp });
    assert.equal(fs.existsSync(path.join(devDir, 'opl-package.json')), true);

    // 1. fetchRange rejects non-206 (HTTP 200 unbounded body) without buffering full 200 payload
    const non206Server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(64 * 1024, 0x41));
    });
    await new Promise<void>((resolve) => non206Server.listen(0, '127.0.0.1', () => resolve()));
    const non206Addr = non206Server.address();
    assert.ok(non206Addr && typeof non206Addr === 'object');
    try {
      await assert.rejects(
        () =>
          downloadPackageArchive({
            url: `http://127.0.0.1:${non206Addr.port}/pkg.tar.gz`,
            digest: `sha256:${'c'.repeat(64)}`,
            size: 1024,
            packageId: 'dl-non206',
            cacheRoot: path.join(tmpDir, 'cache-non206'),
            parallelism: 2,
            minParallelBytes: 256,
            allowInsecureHttp: true,
          }),
        (err: unknown) => err instanceof PackError && err.code === 'PACK_LOCK_MISMATCH',
      );
    } finally {
      await new Promise<void>((resolve) => non206Server.close(() => resolve()));
    }

    // 2. fetchRange caps streaming 206 body at end - start + 1 bytes
    let rangeBytesSent = 0;
    const oversizedRangeServer = http.createServer((req, res) => {
      const rangeHeader = req.headers.range;
      if (rangeHeader && /^bytes=0-511$/.test(rangeHeader)) {
        res.writeHead(206, {
          'Content-Type': 'application/octet-stream',
          'Content-Range': 'bytes 0-511/1024',
        });
        for (let i = 0; i < 16; i += 1) {
          const buf = Buffer.alloc(16 * 1024, 0x43);
          rangeBytesSent += buf.length;
          res.write(buf);
        }
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(4096, 0x43));
    });
    await new Promise<void>((resolve) => oversizedRangeServer.listen(0, '127.0.0.1', () => resolve()));
    const rangeAddr = oversizedRangeServer.address();
    assert.ok(rangeAddr && typeof rangeAddr === 'object');
    try {
      await assert.rejects(
        () =>
          downloadPackageArchive({
            url: `http://127.0.0.1:${rangeAddr.port}/pkg.tar.gz`,
            digest: `sha256:${'d'.repeat(64)}`,
            size: 1024,
            packageId: 'dl-range-cap',
            cacheRoot: path.join(tmpDir, 'cache-range-cap'),
            parallelism: 2,
            minParallelBytes: 256,
            allowInsecureHttp: true,
          }),
        (err: unknown) => err instanceof PackError && err.code === 'PACK_LOCK_MISMATCH',
      );
      assert.ok(rangeBytesSent > 0);
    } finally {
      await new Promise<void>((resolve) => oversizedRangeServer.close(() => resolve()));
    }

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
