import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { create as tarCreate } from 'tar';

import { createClientContext, openSqliteStore } from '@opl/core';
import {
  PackError,
  buildPackage,
  createPackService,
  extractPackageSourceArchive,
  migrateV1Package,
  parsePackageManifestV2,
  projectPackageToCodexMarketplace,
} from '../src/index.ts';

function minimalManifest(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'opl.package.v2',
    identity: {
      id,
      version: '1.0.0',
      intent: 'app',
      name: { 'zh-CN': id, 'en-US': id },
      summary: { 'zh-CN': '摘要', 'en-US': 'Summary' },
      publisher: 'one-person-lab',
    },
    ...extra,
  };
}

test('T5-PACK-01 (G2-08 / Bug 5): rejects ${PLUGIN_ROOT}/.. traversal, plugin_name collision, and escaping assets/ symlink', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-pack-b5-'));
  try {
    // 1. ${PLUGIN_ROOT}/../../outside.js rejected by buildPackage
    const pkgTrav = path.join(tmpDir, 'pkg-trav');
    fs.mkdirSync(pkgTrav, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'outside.js'), 'console.log("pwn");\n', 'utf8');
    fs.writeFileSync(
      path.join(pkgTrav, 'opl-package.json'),
      JSON.stringify(
        minimalManifest('pkg-trav', {
          provides: {
            mcp_servers: [
              { id: 's1', transport: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/../outside.js'] },
            ],
          },
        }),
      ),
    );
    assert.throws(
      () => buildPackage(pkgTrav, { writeLock: false }),
      (err: unknown) => err instanceof PackError && (err.code === 'INVALID_INPUT' || err.code === 'PACK_SYMLINK_ESCAPE'),
    );

    // 2. Duplicate host_hints.codex.plugin_name across distinct package_ids rejected
    const mpRoot = path.join(tmpDir, 'marketplace');
    const pkgA = path.join(tmpDir, 'pkg-a');
    const pkgB = path.join(tmpDir, 'pkg-b');
    fs.mkdirSync(pkgA, { recursive: true });
    fs.mkdirSync(pkgB, { recursive: true });
    const mA = parsePackageManifestV2(
      minimalManifest('pkg-a', { host_hints: { codex: { plugin_name: 'shared-plugin' } } }),
    );
    const mB = parsePackageManifestV2(
      minimalManifest('pkg-b', { host_hints: { codex: { plugin_name: 'shared-plugin' } } }),
    );
    projectPackageToCodexMarketplace({ manifest: mA, installPath: pkgA, marketplaceRoot: mpRoot });
    assert.throws(
      () => projectPackageToCodexMarketplace({ manifest: mB, installPath: pkgB, marketplaceRoot: mpRoot }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_CODEX_SYNC_FAILED',
    );

    // 3. Escaping assets/ symlink rejected by direct projectPackageToCodexMarketplace
    const outsideAssets = path.join(tmpDir, 'outside-assets');
    fs.mkdirSync(outsideAssets, { recursive: true });
    const pkgEsc = path.join(tmpDir, 'pkg-esc');
    fs.mkdirSync(pkgEsc, { recursive: true });
    fs.symlinkSync(outsideAssets, path.join(pkgEsc, 'assets'), 'dir');
    const mEsc = parsePackageManifestV2(minimalManifest('pkg-esc'));
    assert.throws(
      () => projectPackageToCodexMarketplace({ manifest: mEsc, installPath: pkgEsc, marketplaceRoot: mpRoot }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-PACK-02 (G2-09 / Bug 8): PackService.install cleans up orphaned destDir on codex sync failure and archive rejects symlinks/hardlinks', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-pack-b8-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    const srcPkg = path.join(tmpDir, 'src-pkg');
    fs.mkdirSync(path.join(srcPkg, 'skills', 's1'), { recursive: true });
    fs.writeFileSync(path.join(srcPkg, 'skills', 's1', 'SKILL.md'), '# Skill\n', 'utf8');
    fs.writeFileSync(
      path.join(srcPkg, 'opl-package.json'),
      JSON.stringify(
        minimalManifest('pkg-fail', {
          provides: { skills: [{ id: 's1', path: './skills/s1' }] },
        }),
      ),
    );
    buildPackage(srcPkg, { writeLock: true });

    const stateDir = path.join(tmpDir, 'state');
    const service = createPackService({
      db,
      stateDir,
      marketplaceRoot: path.join(tmpDir, 'mp'),
      codexRunner: {
        async runCli() {
          throw new Error('codex_sync_exploded');
        },
        async listPlugins() {
          return { marketplaces: [], marketplaceLoadErrors: [] };
        },
      },
    });

    const ctx = createClientContext({ session_id: 's1', client_kind: 'opl_app' });
    await assert.rejects(
      () => service.install({ source: { kind: 'local_dir', path: srcPkg }, clientContext: ctx, syncCodex: true }),
      /codex_sync_exploded/,
    );
    assert.equal(service.inspect('pkg-fail'), null);
    assert.equal(fs.existsSync(path.join(stateDir, 'packages', 'pkg-fail', '1.0.0')), false);

    // Tar symlink & hardlink rejection
    const tarSrc = path.join(tmpDir, 'tar-src');
    fs.mkdirSync(tarSrc, { recursive: true });
    fs.writeFileSync(path.join(tarSrc, 'real.txt'), 'hi\n', 'utf8');
    fs.symlinkSync('real.txt', path.join(tarSrc, 'sym.txt'));
    const symArchive = path.join(tmpDir, 'sym.tgz');
    await tarCreate({ file: symArchive, cwd: tarSrc, gzip: true }, ['real.txt', 'sym.txt']);
    assert.throws(
      () => extractPackageSourceArchive(symArchive, path.join(tmpDir, 'extract-sym')),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_ARCHIVE_INVALID',
    );

    const linkSrc = path.join(tmpDir, 'link-src');
    fs.mkdirSync(linkSrc, { recursive: true });
    fs.writeFileSync(path.join(linkSrc, 'orig.txt'), 'hi\n', 'utf8');
    fs.linkSync(path.join(linkSrc, 'orig.txt'), path.join(linkSrc, 'hard.txt'));
    const linkArchive = path.join(tmpDir, 'hard.tgz');
    await tarCreate({ file: linkArchive, cwd: linkSrc, gzip: true }, ['orig.txt', 'hard.txt']);
    assert.throws(
      () => extractPackageSourceArchive(linkArchive, path.join(tmpDir, 'extract-hard')),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_ARCHIVE_INVALID',
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-PACK-03 (G2-10 / Bug 7): migrateV1Package relocates nested opl.package.v2 and rolls back cleanly on apply write failure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-pack-b7-'));
  try {
    const repo = path.join(tmpDir, 'nested-v2');
    const nested = path.join(repo, 'plugins', 'nested-v2');
    fs.mkdirSync(path.join(nested, 'skills', 'nested-v2'), { recursive: true });
    fs.writeFileSync(path.join(nested, 'skills', 'nested-v2', 'SKILL.md'), '# Nested V2\n', 'utf8');
    fs.writeFileSync(
      path.join(nested, 'opl-package.json'),
      JSON.stringify(
        minimalManifest('nested-v2', {
          provides: { skills: [{ id: 'nested-v2', path: './skills/nested-v2' }] },
        }),
      ),
    );

    const mig = migrateV1Package({ repoDir: repo, apply: true, clean: true });
    assert.equal(mig.applied, true);
    assert.equal(mig.cleaned, true);
    assert.equal(fs.existsSync(path.join(repo, 'opl-package.json')), true);
    assert.equal(fs.existsSync(path.join(repo, 'skills', 'nested-v2', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(repo, 'plugins')), false);

    // Rollback on apply write error (e.g. target root opl-package.json is a directory)
    const errRepo = path.join(tmpDir, 'err-repo');
    const errNested = path.join(errRepo, 'plugins', 'err-repo');
    fs.mkdirSync(path.join(errNested, 'skills', 'err-repo'), { recursive: true });
    fs.mkdirSync(path.join(errRepo, 'opl-package.json'), { recursive: true }); // force EISDIR on writeFileSync
    fs.writeFileSync(path.join(errNested, 'skills', 'err-repo', 'SKILL.md'), '# Err\n', 'utf8');
    fs.writeFileSync(
      path.join(errNested, 'opl-package.json'),
      JSON.stringify({
        surface_kind: 'opl_agent_package_manifest.v1',
        package_id: 'err-repo',
        version: '0.1.0',
        codex_surface: { plugin_id: 'err-repo', required_skill_ids: ['err-repo'] },
      }),
    );
    assert.throws(() => migrateV1Package({ repoDir: errRepo, apply: true, clean: true }));
    assert.equal(fs.existsSync(path.join(errRepo, 'skills')), false, 'Relocated skills/ must roll back on write error');
    assert.equal(fs.existsSync(path.join(errNested, 'opl-package.json')), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-PACK-04 (G2-11): OplPackageManifestV2Schema superRefine rejects subtle boundary violations', () => {
  const withHandler = {
    provides: { contribution_handler: { kind: 'cli', argv: ['./bin/ui'] } },
  };
  const badCases: Array<[string, Record<string, unknown>]> = [
    [
      'optional/presence conflict',
      minimalManifest('p1', {
        dependencies: { opl_base: '^2.0.0', packages: [{ id: 'dep-a', optional: true, presence: 'required' }] },
      }),
    ],
    [
      'duplicate skills',
      minimalManifest('p2', {
        provides: {
          skills: [
            { id: 's1', path: './skills/a' },
            { id: 's1', path: './skills/b' },
          ],
        },
      }),
    ],
    [
      'duplicate cli_bin',
      minimalManifest('p3', {
        provides: {
          cli_bin: [
            { name: 'tool', path: 'bin/a' },
            { name: 'tool', path: 'bin/b' },
          ],
        },
      }),
    ],
    [
      'duplicate mcp_servers',
      minimalManifest('p4', {
        provides: {
          mcp_servers: [
            { id: 'm1', transport: 'stdio', command: 'node' },
            { id: 'm1', transport: 'stdio', command: 'node' },
          ],
        },
      }),
    ],
    [
      'settings.section missing settings_destination',
      minimalManifest('p5', {
        ...withHandler,
        ui: {
          declarative: {
            views: [
              {
                id: 'v1',
                view_type: 'service_status',
                slot: 'settings.section',
                title: { 'zh-CN': 'V', 'en-US': 'V' },
                data_ref: 'p5#v1',
              },
            ],
          },
        },
      }),
    ],
    [
      'non-settings.section declaring settings_destination',
      minimalManifest('p6', {
        ...withHandler,
        ui: {
          declarative: {
            views: [
              {
                id: 'v1',
                view_type: 'service_status',
                slot: 'workbench.panel',
                settings_destination: 'resources',
                title: { 'zh-CN': 'V', 'en-US': 'V' },
                data_ref: 'p6#v1',
              },
            ],
          },
        },
      }),
    ],
    [
      'navigation referencing settings.section view',
      minimalManifest('p7', {
        ...withHandler,
        ui: {
          declarative: {
            navigation: [{ id: 'nav1', label: { 'zh-CN': 'N', 'en-US': 'N' }, view_id: 'v1' }],
            views: [
              {
                id: 'v1',
                view_type: 'service_status',
                slot: 'settings.section',
                settings_destination: 'resources',
                title: { 'zh-CN': 'V', 'en-US': 'V' },
                data_ref: 'p7#v1',
              },
            ],
          },
        },
      }),
    ],
    [
      'duplicate view actions',
      minimalManifest('p8', {
        ...withHandler,
        ui: {
          declarative: {
            views: [
              {
                id: 'v1',
                view_type: 'service_status',
                slot: 'workbench.panel',
                title: { 'zh-CN': 'V', 'en-US': 'V' },
                data_ref: 'p8#v1',
                actions: [
                  { id: 'act1', label: { 'zh-CN': 'A', 'en-US': 'A' }, action_ref: 'p8#a1' },
                  { id: 'act1', label: { 'zh-CN': 'B', 'en-US': 'B' }, action_ref: 'p8#a2' },
                ],
              },
            ],
          },
        },
      }),
    ],
  ];

  for (const [label, candidate] of badCases) {
    assert.throws(
      () => parsePackageManifestV2(candidate),
      (err: unknown) => err instanceof PackError && err.code === 'INVALID_MANIFEST',
      `Expected INVALID_MANIFEST for ${label}`,
    );
  }
});
