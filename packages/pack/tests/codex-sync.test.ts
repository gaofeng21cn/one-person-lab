import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import {
  PackError,
  createPackService,
  discoverExternalCodexPlugins,
  ensureMarketplaceAvailable,
  parsePackageManifestV2,
  projectPackageToCodexMarketplace,
  removeCodexMarketplaceProjection,
  syncPackageToCodex,
  unsyncPackageFromCodex,
  type CodexCarrierRunner,
  type OplPackageManifestV2,
} from '../src/index.ts';

function createTempPackage(dir: string, manifestObj: Record<string, unknown>, customSkillDir?: string): void {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(dir, 'bin', 'srv.mjs'), 'console.log("ok");\n');
  const skillDir = path.join(dir, customSkillDir ?? 'skills/my-pkg');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# My Skill\n');
  fs.writeFileSync(path.join(dir, 'opl-package.json'), JSON.stringify(manifestObj, null, 2));
}

test('carriers/codex-sync projects installable skill and icon files, mcp.json absolute paths, and marketplace manifests', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-codex-'));
  const pkgDir = path.join(tmpDir, 'pkg');
  const marketplaceRoot = path.join(tmpDir, 'marketplace');
  const stateDir = path.join(tmpDir, 'state');

  try {
    const manifestObj = {
      schema_version: 'opl.package.v2',
      identity: {
        id: 'my-pkg',
        version: '0.5.0',
        intent: 'app',
        name: { 'zh-CN': '我的包', 'en-US': 'My Package' },
        summary: { 'zh-CN': '摘要', 'en-US': 'Summary' },
        publisher: 'one-person-lab',
        icon: 'assets/icon.png',
        default_prompts: ['Check status'],
      },
      permissions: {
        workspace: { access: 'read_write' },
      },
      provides: {
        skills: [{ id: 'my-skill', path: './custom/my-skill' }],
        mcp_servers: [
          {
            id: 'local-mcp',
            transport: 'stdio',
            command: 'node',
            args: ['./bin/srv.mjs', '--stdio'],
          },
        ],
      },
      host_hints: {
        codex: {
          plugin_name: 'my-codex-plugin',
          category: 'Productivity',
          brand_color: '#1260E8',
        },
      },
    };
    createTempPackage(pkgDir, manifestObj, 'custom/my-skill');
    const manifest = parsePackageManifestV2(manifestObj);
    const realPkgDir = fs.realpathSync(pkgDir);

    const cliCalls: string[][] = [];
    const runner: CodexCarrierRunner = {
      async runCli(args) {
        cliCalls.push([...args]);
        if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
          return { status: 0, stdout: JSON.stringify({ marketplaces: [] }), stderr: '', error: null };
        }
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        const pluginDir = path.join(marketplaceRoot, 'plugins', 'my-codex-plugin');
        return {
          marketplaces: [
            {
              name: 'opl-local',
              path: marketplaceRoot,
              plugins: [
                {
                  id: 'my-codex-plugin@opl-local',
                  name: 'my-codex-plugin',
                  version: '0.5.0',
                  localVersion: '0.5.0',
                  installed: true,
                  enabled: true,
                  source: { type: 'local', path: pluginDir },
                  interface: null,
                  marketplaceName: 'opl-local',
                  marketplacePath: marketplaceRoot,
                },
              ],
            },
          ],
          marketplaceLoadErrors: [],
        };
      },
    };

    const syncRes = await syncPackageToCodex({
      manifest,
      installPath: pkgDir,
      enabled: true,
      action: 'link',
      marketplaceRoot,
      stateDir,
      runner,
    });
    assert.equal(syncRes.synced, true);
    assert.equal(syncRes.verified_by_readback, true);
    assert.ok(syncRes.plugin_dir);

    const skillFile = path.join(syncRes.plugin_dir, 'skills', 'my-skill', 'SKILL.md');
    assert.ok(fs.lstatSync(path.dirname(skillFile)).isDirectory());
    assert.deepEqual(fs.readFileSync(skillFile), fs.readFileSync(path.join(pkgDir, 'custom/my-skill/SKILL.md')));
    const icon = path.join(syncRes.plugin_dir, 'assets/icon.png');
    assert.ok(fs.lstatSync(path.dirname(icon)).isDirectory());
    assert.deepEqual(fs.readFileSync(icon), fs.readFileSync(path.join(pkgDir, 'assets/icon.png')));

    // Verify plugin.json and mcp.json absolute path resolution
    const pluginJson = JSON.parse(
      fs.readFileSync(path.join(syncRes.plugin_dir, '.codex-plugin', 'plugin.json'), 'utf8'),
    ) as { name: string; mcpServers: string; interface: { brandColor: string; capabilities: string[] } };
    assert.equal(pluginJson.name, 'my-codex-plugin');
    assert.equal(pluginJson.mcpServers, './mcp.json');
    assert.equal(pluginJson.interface.brandColor, '#1260E8');
    assert.deepEqual(pluginJson.interface.capabilities, ['Interactive', 'Write']);

    const mcpJson = JSON.parse(
      fs.readFileSync(path.join(syncRes.plugin_dir, 'mcp.json'), 'utf8'),
    ) as { mcpServers: Record<string, { command: string; args: string[]; cwd: string }> };
    assert.equal(mcpJson.mcpServers['local-mcp'].args[0], path.join(realPkgDir, 'bin', 'srv.mjs'));
    assert.equal(mcpJson.mcpServers['local-mcp'].cwd, realPkgDir);

    // Both .agents/plugins/marketplace.json and marketplace.json exist
    const agentsMp = JSON.parse(
      fs.readFileSync(path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'), 'utf8'),
    ) as { plugins: Array<{ name: string; source: { source: string; path: string } }> };
    assert.equal(agentsMp.plugins[0].name, 'my-codex-plugin');
    assert.equal(agentsMp.plugins[0].source.source, 'local');
    assert.equal(agentsMp.plugins[0].source.path, './plugins/my-codex-plugin');
    assert.equal(fs.existsSync(path.join(marketplaceRoot, 'marketplace.json')), true);
    assert.ok(cliCalls.some((c) => c.join(' ') === 'plugin add my-codex-plugin@opl-local --json'));

    // sync_enabled: false cleans up prior projection
    const disabledManifest = parsePackageManifestV2({
      ...manifestObj,
      host_hints: { codex: { sync_enabled: false, plugin_name: 'my-codex-plugin' } },
    });
    const skipped = await syncPackageToCodex({
      manifest: disabledManifest,
      installPath: pkgDir,
      enabled: true,
      marketplaceRoot,
      stateDir,
    });
    assert.equal(skipped.synced, false);
    assert.equal(skipped.skipped_reason, 'sync_disabled');
    assert.equal(fs.existsSync(syncRes.plugin_dir), false);

    // Real source repo untouched
    assert.equal(fs.existsSync(path.join(pkgDir, 'custom', 'my-skill', 'SKILL.md')), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('linked Codex plugins expose only declared skills as the checkout changes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-linked-skills-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkgDir = path.join(root, 'pkg');
  const manifest = parsePackageManifestV2({
    schema_version: 'opl.package.v2',
    identity: {
      id: 'linked', version: '1.0.0', intent: 'extension', publisher: 'example',
      name: { 'zh-CN': '技能', 'en-US': 'Skills' },
      summary: { 'zh-CN': '技能包', 'en-US': 'Skills package' },
    },
    provides: { skills: [{ id: 'selected', path: './skills/selected' }] },
  });
  createTempPackage(pkgDir, manifest, 'skills/selected');
  const projected = projectPackageToCodexMarketplace({
    manifest, installPath: pkgDir, marketplaceRoot: path.join(root, 'marketplace'),
  });
  const added = path.join(pkgDir, 'skills', 'work-in-progress');
  fs.mkdirSync(added);
  fs.writeFileSync(path.join(added, 'SKILL.md'), '# Unlisted skill');
  const skillsDir = path.join(projected.plugin_dir, 'skills');
  assert.deepEqual(fs.readdirSync(skillsDir), ['selected']);
  assert.ok(fs.lstatSync(path.join(skillsDir, 'selected')).isDirectory());
  assert.equal(fs.readFileSync(path.join(skillsDir, 'selected/SKILL.md'), 'utf8'), '# My Skill\n');
  const outside = path.join(root, 'outside');
  fs.writeFileSync(outside, 'outside package');
  fs.symlinkSync(outside, path.join(pkgDir, 'skills/selected/reference.md'));
  assert.throws(() => projectPackageToCodexMarketplace({
    manifest, installPath: pkgDir, marketplaceRoot: path.join(root, 'marketplace'),
  }), (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE');
  assert.equal(fs.readFileSync(path.join(skillsDir, 'selected/SKILL.md'), 'utf8'), '# My Skill\n');
  assert.equal(fs.existsSync(path.join(skillsDir, 'selected/reference.md')), false);

});

test('codex-sync imports external Codex plugins and handles marketplace transient retry & rollback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-ext-'));
  const stateDir = path.join(tmpDir, 'state');
  const marketplaceRoot = path.join(tmpDir, 'marketplace');

  try {
    // Codex canonicalizes local sources, including macOS /var and junctions.
    const realSource = path.join(tmpDir, 'real-marketplace');
    const sourceAlias = path.join(tmpDir, 'marketplace-alias');
    fs.mkdirSync(realSource);
    fs.symlinkSync(realSource, sourceAlias, 'junction');
    await ensureMarketplaceAvailable({
      marketplaceName: 'opl-local',
      marketplaceSource: sourceAlias,
      action: 'sync',
      runner: {
        async runCli(args) {
          assert.deepEqual(args, ['plugin', 'marketplace', 'list', '--json']);
          const entry = { name: 'opl-local', marketplaceSource: { sourceType: 'local', source: fs.realpathSync(realSource) } };
          return { status: 0, stdout: JSON.stringify({ marketplaces: [entry] }), stderr: '', error: null };
        },
        async listPlugins() { throw new Error('Unexpected plugin read'); },
      },
    });

    // 1. Test ensureMarketplaceAvailable transient retry (ECONNRESET -> success)
    let upgradeCalls = 0;
    const retryRunner: CodexCarrierRunner = {
      async runCli(args) {
        if (args[2] === 'list') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [
                {
                  name: 'opl-local',
                  marketplaceSource: { sourceType: 'git', source: 'https://github.com/org/mp.git' },
                },
              ],
            }),
            stderr: '',
            error: null,
          };
        }
        if (args[2] === 'upgrade') {
          upgradeCalls += 1;
          if (upgradeCalls === 1) {
            return {
              status: 1,
              stdout: '',
              stderr: 'fatal: HTTP2 framing error',
              error: null,
            };
          }
          return { status: 0, stdout: '{}', stderr: '', error: null };
        }
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        return { marketplaces: [], marketplaceLoadErrors: [] };
      },
    };
    await ensureMarketplaceAvailable({
      marketplaceName: 'opl-local',
      marketplaceSource: 'https://github.com/org/mp.git',
      action: 'update',
      runner: retryRunner,
      waitForRetry: async () => {},
    });
    assert.equal(upgradeCalls, 2);

    // 2. Test git->local marketplace replacement rollback on add failure
    const rollbackCalls: string[][] = [];
    const failingAddRunner: CodexCarrierRunner = {
      async runCli(args) {
        rollbackCalls.push([...args]);
        if (args[2] === 'list') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [
                {
                  name: 'opl-local',
                  marketplaceSource: { sourceType: 'git', source: 'https://github.com/org/old.git' },
                },
              ],
            }),
            stderr: '',
            error: null,
          };
        }
        if (args[2] === 'add' && args[3] === '/tmp/new-local-mp') {
          return { status: 1, stdout: '', stderr: 'add failed', error: null };
        }
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        return { marketplaces: [], marketplaceLoadErrors: [] };
      },
    };
    await assert.rejects(
      () =>
        ensureMarketplaceAvailable({
          marketplaceName: 'opl-local',
          marketplaceSource: '/tmp/new-local-mp',
          action: 'install',
          runner: failingAddRunner,
        }),
      PackError,
    );
    assert.ok(
      rollbackCalls.some(
        (c) => c[2] === 'add' && c[3] === 'https://github.com/org/old.git',
      ),
    );

    // 3. Test external Codex plugin discovery & PackService codexSync import
    const db = openSqliteStore(path.join(stateDir, 'opl.db'));
    let remoteStillInstalled = true;
    const extRunner: CodexCarrierRunner = {
      async runCli() {
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        return {
          marketplaces: [
            {
              name: 'openai-curated-remote',
              path: null,
              plugins: [
                {
                  id: 'build-mcp-apps@openai-curated-remote',
                  name: 'build-mcp-apps',
                  version: '1.0.1',
                  localVersion: '1.0.1',
                  installed: remoteStillInstalled,
                  enabled: true,
                  source: { type: 'remote' },
                  interface: {
                    displayName: 'Build MCP Apps',
                    shortDescription: 'Scaffold MCP Apps',
                    developerName: 'OpenAI',
                  },
                  marketplaceName: 'openai-curated-remote',
                  marketplacePath: null,
                },
                {
                  id: 'local-ext@user-mp',
                  name: 'local-ext',
                  version: '0.2.0',
                  localVersion: null,
                  installed: true,
                  enabled: true,
                  source: { type: 'local', path: '/tmp/user-plugins/local-ext' },
                  interface: null,
                  marketplaceName: 'user-mp',
                  marketplacePath: '/tmp/user-mp',
                },
              ],
            },
          ],
          marketplaceLoadErrors: [],
        };
      },
    };

    const svc = createPackService({
      db,
      stateDir,
      marketplaceRoot,
      codexRunner: extRunner,
    });
    const firstSync = await svc.codexSync({ importExternal: true });
    assert.equal(firstSync.imported_external.length, 2);
    assert.equal(firstSync.imported_external[0].origin, 'external');
    assert.equal(svc.list({ origin: 'external' }).length, 2);

    // Simulate uninstalling one external plugin in Codex App -> reconciliation removes it
    remoteStillInstalled = false;
    await svc.codexSync({ importExternal: true });
    assert.equal(svc.list({ origin: 'external' }).length, 1);

    // Unsync readback check
    const emptyRunner: CodexCarrierRunner = {
      async runCli() {
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        return { marketplaces: [], marketplaceLoadErrors: [] };
      },
    };
    const unsync = await unsyncPackageFromCodex({
      packageId: 'non-existent',
      marketplaceRoot,
      stateDir,
      runner: emptyRunner,
    });
    assert.equal(unsync.verified_by_readback, true);

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('codex-sync blocks plugin_name traversal, scopes readback + localVersion, calls plugin remove on disable, and normalizes non-SemVer external versions', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-codex-sec-'));
  const pkgDir = path.join(tmpDir, 'pkg');
  const marketplaceRoot = path.join(tmpDir, 'marketplace');
  const victimDir = path.join(tmpDir, 'victim-dir');
  const victimFile = path.join(victimDir, 'important.txt');

  try {
    fs.mkdirSync(victimDir, { recursive: true });
    fs.writeFileSync(victimFile, 'do-not-delete');
    fs.mkdirSync(path.join(marketplaceRoot, 'plugins'), { recursive: true });

    const validManifestObj = {
      schema_version: 'opl.package.v2',
      identity: {
        id: 'safe-pkg',
        version: '1.2.3',
        intent: 'extension',
        name: { 'zh-CN': '安全包', 'en-US': 'Safe Pkg' },
        summary: { 'zh-CN': '摘要', 'en-US': 'Summary' },
        publisher: 'one-person-lab',
      },
      provides: {
        skills: [{ id: 'safe-pkg', path: './skills/safe-pkg' }],
      },
    };
    createTempPackage(pkgDir, validManifestObj, 'skills/safe-pkg');

    // 1. Traversal plugin_name rejected before any rmSync in both project & remove
    const craftedManifest = {
      ...parsePackageManifestV2(validManifestObj),
      host_hints: { codex: { plugin_name: '../../victim-dir' } },
    } as unknown as OplPackageManifestV2;

    assert.throws(
      () =>
        projectPackageToCodexMarketplace({
          manifest: craftedManifest,
          installPath: pkgDir,
          marketplaceRoot,
        }),
      (err: unknown) => err instanceof PackError && err.code === 'INVALID_MANIFEST',
    );
    assert.throws(
      () =>
        removeCodexMarketplaceProjection({
          packageId: 'safe-pkg',
          pluginName: '../../victim-dir',
          marketplaceRoot,
        }),
      (err: unknown) => err instanceof PackError && err.code === 'INVALID_MANIFEST',
    );
    assert.equal(fs.existsSync(victimFile), true, 'Victim directory outside plugins_dir must never be deleted');

    // 2. Scoped readback ignores same-name plugin in another marketplace & checks localVersion when version is null
    const manifest = parsePackageManifestV2(validManifestObj);
    const pluginDir = path.join(marketplaceRoot, 'plugins', 'safe-pkg');
    let reportedVersion: string | null = '1.2.3';
    let reportedLocalVersion: string | null = '1.2.3';
    const cliCalls: string[][] = [];

    const scopedRunner: CodexCarrierRunner = {
      async runCli(args) {
        cliCalls.push([...args]);
        if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [{ name: 'opl-local', sourceType: 'local', marketplaceSource: marketplaceRoot }],
            }),
            stderr: '',
            error: null,
          };
        }
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        return {
          marketplaces: [
            {
              name: 'external-other-mp',
              path: path.join(tmpDir, 'other-mp'),
              plugins: [
                {
                  id: 'safe-pkg@external-other-mp',
                  name: 'safe-pkg',
                  version: '9.9.9',
                  localVersion: '9.9.9',
                  installed: true,
                  enabled: true,
                  source: { type: 'local', path: path.join(tmpDir, 'other-mp', 'plugins', 'safe-pkg') },
                  interface: null,
                  marketplaceName: 'external-other-mp',
                  marketplacePath: path.join(tmpDir, 'other-mp'),
                },
              ],
            },
            {
              name: 'opl-local',
              path: marketplaceRoot,
              plugins: [
                {
                  id: 'safe-pkg@opl-local',
                  name: 'safe-pkg',
                  version: reportedVersion,
                  localVersion: reportedLocalVersion,
                  installed: true,
                  enabled: true,
                  source: { type: 'local', path: pluginDir },
                  interface: null,
                  marketplaceName: 'opl-local',
                  marketplacePath: marketplaceRoot,
                },
              ],
            },
          ],
          marketplaceLoadErrors: [],
        };
      },
    };

    // Succeeds even with same-name plugin in external-other-mp
    const okRes = await syncPackageToCodex({
      manifest,
      installPath: pkgDir,
      enabled: true,
      marketplaceRoot,
      runner: scopedRunner,
    });
    assert.equal(okRes.verified_by_readback, true);

    // Rejects when version === null and localVersion is stale
    reportedVersion = null;
    reportedLocalVersion = '0.0.1-stale';
    await assert.rejects(
      () =>
        syncPackageToCodex({
          manifest,
          installPath: pkgDir,
          enabled: true,
          marketplaceRoot,
          runner: scopedRunner,
        }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_CODEX_SYNC_FAILED',
    );

    // Unsync branch (enabled: false) calls codex plugin remove
    const disabledRes = await syncPackageToCodex({
      manifest,
      installPath: pkgDir,
      enabled: false,
      marketplaceRoot,
      runner: scopedRunner,
    });
    assert.equal(disabledRes.synced, false);
    assert.ok(cliCalls.some((c) => c.join(' ') === 'plugin remove safe-pkg@opl-local --json'));

    // 3. discoverExternalCodexPlugins coerces/falls back non-SemVer versions without throwing
    const nonSemverRunner: CodexCarrierRunner = {
      async runCli() {
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        return {
          marketplaces: [
            {
              name: 'third-party-mp',
              path: null,
              plugins: [
                {
                  id: 'date-ver@third-party-mp',
                  name: 'date-ver',
                  version: '2026.01.01',
                  localVersion: null,
                  installed: true,
                  enabled: true,
                  source: { type: 'remote' },
                  interface: null,
                  marketplaceName: 'third-party-mp',
                  marketplacePath: null,
                },
                {
                  id: 'pad-ver@third-party-mp',
                  name: 'pad-ver',
                  version: '01.0.0',
                  localVersion: '01.0.0',
                  installed: true,
                  enabled: true,
                  source: { type: 'remote' },
                  interface: null,
                  marketplaceName: 'third-party-mp',
                  marketplacePath: null,
                },
                {
                  id: 'four-seg@third-party-mp',
                  name: 'four-seg',
                  version: '1.2.3.4',
                  localVersion: null,
                  installed: true,
                  enabled: true,
                  source: { type: 'remote' },
                  interface: null,
                  marketplaceName: 'third-party-mp',
                  marketplacePath: null,
                },
                {
                  id: 'build-ver@third-party-mp',
                  name: 'build-ver',
                  version: '1.0.0 build 5',
                  localVersion: null,
                  installed: true,
                  enabled: true,
                  source: { type: 'remote' },
                  interface: null,
                  marketplaceName: 'third-party-mp',
                  marketplacePath: null,
                },
                {
                  id: 'garbage-ver@third-party-mp',
                  name: 'weird name!',
                  version: 'unparseable',
                  localVersion: 'unparseable',
                  installed: true,
                  enabled: true,
                  source: { type: 'remote' },
                  interface: null,
                  marketplaceName: 'third-party-mp',
                  marketplacePath: null,
                },
              ],
            },
          ],
          marketplaceLoadErrors: [],
        };
      },
    };
    const discovered = await discoverExternalCodexPlugins({
      runner: nonSemverRunner,
      marketplaceRoot,
    });
    assert.equal(discovered.length, 5);
    assert.equal(discovered[0].summary.version, '0.1.0');
    assert.equal(discovered[1].summary.version, '0.1.0');
    assert.equal(discovered[2].summary.version, '1.2.3');
    assert.equal(discovered[3].summary.version, '1.0.0');
    assert.equal(discovered[4].summary.version, '0.1.0');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncPackageToCodex invokes codex plugin add (succeeds) rather than deprecated plugin install (exits 2)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-codex-add-'));
  const pkgDir = path.join(tmpDir, 'pkg');
  const marketplaceRoot = path.join(tmpDir, 'marketplace');

  try {
    const manifestObj = {
      schema_version: 'opl.package.v2',
      identity: {
        id: 'strict-pkg',
        version: '0.1.0',
        intent: 'extension',
        name: { 'zh-CN': '严格测试', 'en-US': 'Strict Pkg' },
        summary: { 'zh-CN': '摘要', 'en-US': 'Summary' },
        publisher: 'one-person-lab',
        icon: 'assets/icon.png',
      },
      provides: {
        skills: [{ id: 'strict-pkg', path: './skills/strict-pkg' }],
      },
    };
    createTempPackage(pkgDir, manifestObj, 'skills/strict-pkg');
    const manifest = parsePackageManifestV2(manifestObj);
    const pluginDir = path.join(marketplaceRoot, 'plugins', 'strict-pkg');
    const cliCalls: string[][] = [];

    const strictRunner: CodexCarrierRunner = {
      async runCli(args) {
        cliCalls.push([...args]);
        if (args[0] === 'plugin' && args[1] === 'install') {
          return {
            status: 2,
            stdout: '',
            stderr: "error: unrecognized subcommand 'install'\n\n  tip: a similar subcommand exists: 'list'\n",
            error: null,
          };
        }
        if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [{ name: 'opl-local', sourceType: 'local', marketplaceSource: marketplaceRoot }],
            }),
            stderr: '',
            error: null,
          };
        }
        if (args[0] === 'plugin' && args[1] === 'add') {
          return { status: 0, stdout: '{}', stderr: '', error: null };
        }
        return { status: 0, stdout: '{}', stderr: '', error: null };
      },
      async listPlugins() {
        return {
          marketplaces: [
            {
              name: 'opl-local',
              path: marketplaceRoot,
              plugins: [
                {
                  id: 'strict-pkg@opl-local',
                  name: 'strict-pkg',
                  version: '0.1.0',
                  localVersion: '0.1.0',
                  installed: true,
                  enabled: true,
                  source: { type: 'local', path: pluginDir },
                  interface: null,
                  marketplaceName: 'opl-local',
                  marketplacePath: marketplaceRoot,
                },
              ],
            },
          ],
          marketplaceLoadErrors: [],
        };
      },
    };

    const badInstallRes = await strictRunner.runCli(['plugin', 'install', 'strict-pkg@opl-local', '--json']);
    assert.equal(badInstallRes.status, 2);
    cliCalls.length = 0;

    const syncRes = await syncPackageToCodex({
      manifest,
      installPath: pkgDir,
      enabled: true,
      action: 'install',
      marketplaceRoot,
      runner: strictRunner,
    });
    assert.equal(syncRes.synced, true);
    assert.equal(syncRes.verified_by_readback, true);
    assert.ok(cliCalls.some((c) => c.join(' ') === 'plugin add strict-pkg@opl-local --json'));
    assert.equal(cliCalls.some((c) => c[0] === 'plugin' && c[1] === 'install'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('installed presence reads the configured carrier and files without writing either', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-presence-'));
  const marketplaceRoot = path.join(root, 'marketplace');
  const stateDir = path.join(root, 'state');
  const source = path.join(root, 'pkg');
  const id = 'live-proof';
  const pluginDir = path.join(marketplaceRoot, 'plugins', id);
  fs.mkdirSync(stateDir);
  const db = openSqliteStore(path.join(stateDir, 'opl.db'));
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });

  createTempPackage(source, {
    schema_version: 'opl.package.v2',
    identity: {
      id, version: '1.0.0', intent: 'extension', publisher: 'test',
      name: { 'zh-CN': id, 'en-US': id }, summary: { 'zh-CN': id, 'en-US': id },
    },
    provides: { skills: [{ id, path: './skills/my-pkg' }] },
  });
  let listed = true;
  let offline = false;
  let ownerPath = path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  let reads = 0;
  let loadErrorSource = path.join(root, 'other', 'marketplace.json');
  const service = createPackService({ db, stateDir, marketplaceRoot, codexRunner: {
    async runCli() { throw new Error('presence must only read'); },
    async listPlugins() {
      reads++;
      if (offline) throw new PackError('PACK_CODEX_SYNC_FAILED', 'carrier unavailable');
      return {
        marketplaceLoadErrors: [{ marketplacePath: loadErrorSource, message: 'unavailable' }],
        marketplaces: [{ name: 'opl-local', path: ownerPath, plugins: [{
          id: id + '@opl-local', name: id, version: null, localVersion: '1.0.0',
          installed: listed, enabled: listed, interface: null,
          source: { type: 'local', path: pluginDir }, marketplaceName: 'opl-local', marketplacePath: ownerPath,
        }] }],
      };
    },
  } });
  const linked = await service.link({ dir: source, syncCodex: false });
  projectPackageToCodexMarketplace({ manifest: linked.package.manifest, installPath: source, marketplaceRoot });
  const inspect = () => service.readInstalledPackagePresence(id);
  assert.deepEqual(await inspect(), { carrier_ready: true, files_present: true });
  loadErrorSource = ownerPath;
  await assert.rejects(inspect, { code: 'PACK_CODEX_SYNC_FAILED' });
  loadErrorSource = path.join(root, 'other', 'marketplace.json');
  listed = false;
  assert.deepEqual(await inspect(), { carrier_ready: false, files_present: true });
  listed = true;
  ownerPath = path.join(root, 'other', 'marketplace.json');
  assert.deepEqual(await inspect(), { carrier_ready: false, files_present: true });
  offline = true;
  await assert.rejects(inspect, { code: 'PACK_CODEX_SYNC_FAILED' });
  fs.unlinkSync(path.join(source, 'skills/my-pkg/SKILL.md'));
  assert.deepEqual(await inspect(), { carrier_ready: false, files_present: false });
  assert.equal(reads, 5);
});
