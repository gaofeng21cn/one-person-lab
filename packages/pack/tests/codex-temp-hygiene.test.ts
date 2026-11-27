import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_CARRIER_TMP_MAX_AGE_MS,
  createProcessCodexRunner,
  pruneCodexCarrierTmpArtifacts,
  prunePackStateArtifacts,
  prunePackageDownloadCache,
} from '../src/index.ts';

function setMtime(target: string, mtimeMs: number): void {
  const sec = mtimeMs / 1000;
  fs.utimesSync(target, sec, sec);
}

test('pruneCodexCarrierTmpArtifacts removes stale git-* and .staging orphans while respecting locks, recency, symlinks and pass budget', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-v2-carrier-tmp-hygiene-'));
  try {
    const nowMs = Date.UTC(2026, 10, 27, 10, 0, 0);
    const staleMs = nowMs - DEFAULT_CARRIER_TMP_MAX_AGE_MS - 60_000;
    const recentMs = nowMs - 60_000;
    const oldLockMs = nowMs - 60 * 60 * 1000;

    const codexHome = path.join(root, 'codex-home');
    const tmpRoot = path.join(codexHome, '.tmp');
    const stagingRoot = path.join(tmpRoot, '.staging');
    const mktStagingRoot = path.join(tmpRoot, 'marketplaces', '.staging');
    const outsideTarget = path.join(root, 'outside-keep');
    fs.mkdirSync(stagingRoot, { recursive: true });
    fs.mkdirSync(mktStagingRoot, { recursive: true });
    fs.mkdirSync(outsideTarget, { recursive: true });
    fs.writeFileSync(path.join(outsideTarget, 'keep.txt'), 'keep');

    const staleGitA = path.join(tmpRoot, 'git-AAA111');
    const staleGitB = path.join(tmpRoot, 'git-BBB222');
    const freshGit = path.join(tmpRoot, 'git-CCC333');
    const staleStage = path.join(stagingRoot, 'marketplace-macos-OLD111');
    const freshStage = path.join(stagingRoot, 'marketplace-macos-NEW111');
    const staleMktStage = path.join(mktStagingRoot, 'marketplace-OLD222');
    const symlinkGit = path.join(tmpRoot, 'git-SYMLINK');
    const lockFile = path.join(tmpRoot, '.staging.lock');
    const syncLockFile = path.join(tmpRoot, 'plugins.sync.lock');
    const mktLockFile = path.join(tmpRoot, 'marketplaces', '.staging.lock');
    const realMarketplace = path.join(tmpRoot, 'marketplaces', 'opl-link');

    for (const dir of [staleGitA, staleGitB, freshGit, staleStage, freshStage, staleMktStage, realMarketplace]) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'HEAD'), 'ref: refs/heads/main\n');
    }
    fs.symlinkSync(outsideTarget, symlinkGit);
    fs.writeFileSync(lockFile, '');
    fs.writeFileSync(syncLockFile, '');
    fs.writeFileSync(mktLockFile, '');

    setMtime(staleGitA, staleMs);
    setMtime(staleGitB, staleMs);
    setMtime(freshGit, recentMs);
    setMtime(staleStage, staleMs);
    setMtime(freshStage, recentMs);
    setMtime(staleMktStage, staleMs);
    setMtime(lockFile, recentMs);
    setMtime(syncLockFile, oldLockMs);
    setMtime(mktLockFile, oldLockMs);

    const firstPass = pruneCodexCarrierTmpArtifacts(codexHome, { nowMs, maxEntriesPerPass: 100 });
    assert.equal(firstPass.existed, true);
    assert.equal(firstPass.truncated, false);
    assert.equal(fs.existsSync(staleGitA), false);
    assert.equal(fs.existsSync(staleGitB), false);
    assert.equal(fs.existsSync(freshGit), true);
    assert.equal(fs.existsSync(staleStage), true, 'active .staging.lock must protect .staging entries');
    assert.equal(fs.existsSync(staleMktStage), false, 'quiet marketplaces/.staging stale entry should be removed');
    assert.equal(fs.existsSync(lockFile), true);
    assert.equal(fs.existsSync(syncLockFile), true);
    assert.equal(fs.existsSync(realMarketplace), true);
    assert.equal(fs.lstatSync(symlinkGit).isSymbolicLink(), true);
    assert.equal(fs.existsSync(path.join(outsideTarget, 'keep.txt')), true);

    setMtime(lockFile, oldLockMs);
    const secondPass = pruneCodexCarrierTmpArtifacts(codexHome, { nowMs });
    assert.equal(secondPass.removed_entries, 1);
    assert.equal(fs.existsSync(staleStage), false);
    assert.equal(fs.existsSync(freshStage), true);

    const thirdPass = pruneCodexCarrierTmpArtifacts(codexHome, { nowMs });
    assert.equal(thirdPass.removed_entries, 0);

    for (let index = 0; index < 5; index += 1) {
      const dir = path.join(tmpRoot, `git-CAP${index}`);
      fs.mkdirSync(dir, { recursive: true });
      setMtime(dir, staleMs);
    }
    const capped = pruneCodexCarrierTmpArtifacts(codexHome, { nowMs, maxEntriesPerPass: 2 });
    assert.equal(capped.truncated, true);
    assert.ok(capped.removed_entries <= 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prunePackageDownloadCache and prunePackStateArtifacts handle v2 sha256_* cache dirs, active locks, quotas and *.tmp-/*.bak- staging', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-v2-pack-hygiene-'));
  try {
    const nowMs = Date.UTC(2026, 10, 27, 10, 0, 0);
    const staleMs = nowMs - DEFAULT_CARRIER_TMP_MAX_AGE_MS - 120_000;
    const recentMs = nowMs - 30_000;
    const oldDownloadMs = nowMs - 10 * 24 * 60 * 60 * 1000;
    const stateDir = path.join(root, 'state');
    const codexHome = path.join(root, 'codex-home');
    const env = { HOME: root, OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome };

    const staleGit = path.join(codexHome, '.tmp', 'git-OLD001');
    const legacyInternalGit = path.join(stateDir, 'internal-package-carrier', '.tmp', 'git-LEG001');
    const stalePkgTmp = path.join(stateDir, 'packages', 'demo-pkg', '1.0.0.tmp-packop_123');
    const stalePkgBak = path.join(stateDir, 'packages', 'demo-pkg', '1.0.0.bak-packop_123');
    const livePkgDir = path.join(stateDir, 'packages', 'demo-pkg', '1.0.0');
    const freshPkgTmp = path.join(stateDir, 'packages', 'demo-pkg', '1.1.0.tmp-packop_456');

    for (const dir of [staleGit, legacyInternalGit, stalePkgTmp, stalePkgBak, livePkgDir, freshPkgTmp]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    for (const stale of [staleGit, legacyInternalGit, stalePkgTmp, stalePkgBak]) {
      setMtime(stale, staleMs);
    }
    setMtime(livePkgDir, staleMs);
    setMtime(freshPkgTmp, recentMs);

    const cacheRoot = path.join(stateDir, 'cache', 'downloads');
    const expiredDigest = `sha256_${'a'.repeat(64)}`;
    const oldQuotaDigest = `sha256_${'b'.repeat(64)}`;
    const newestDigest = `sha256_${'c'.repeat(64)}`;
    const activeDigest = `sha256_${'d'.repeat(64)}`;

    for (const [digest, size, mtime, active] of [
      [expiredDigest, 200, oldDownloadMs, false],
      [oldQuotaDigest, 600, nowMs - 2 * 60 * 60 * 1000, false],
      [newestDigest, 500, nowMs - 10 * 60 * 1000, false],
      [activeDigest, 400, oldDownloadMs, true],
    ] as const) {
      const dir = path.join(cacheRoot, digest);
      fs.mkdirSync(dir, { recursive: true });
      const archive = path.join(dir, 'archive.tar.gz');
      fs.writeFileSync(archive, Buffer.alloc(size, 1));
      setMtime(archive, mtime);
      setMtime(dir, mtime);
      if (active) fs.writeFileSync(path.join(dir, 'download.lock'), String(process.pid));
    }

    const summary = prunePackStateArtifacts({
      stateDir,
      env,
      nowMs,
      maxDownloadTotalBytes: 1_000,
    });
    assert.equal(summary.surface_kind, 'opl_pack_state_hygiene.v2');
    assert.equal(summary.carrier_tmp.length, 2);
    assert.equal(fs.existsSync(staleGit), false);
    assert.equal(fs.existsSync(legacyInternalGit), false);
    assert.equal(fs.existsSync(stalePkgTmp), false);
    assert.equal(fs.existsSync(stalePkgBak), false);
    assert.equal(fs.existsSync(livePkgDir), true);
    assert.equal(fs.existsSync(freshPkgTmp), true);
    assert.deepEqual(summary.removed_package_staging_dirs.sort(), [
      'demo-pkg/1.0.0.bak-packop_123',
      'demo-pkg/1.0.0.tmp-packop_123',
    ]);

    assert.deepEqual(summary.package_downloads.skipped_active_digests, [activeDigest]);
    assert.deepEqual([...summary.package_downloads.removed_digests].sort(), [expiredDigest, oldQuotaDigest]);
    assert.equal(fs.existsSync(path.join(cacheRoot, expiredDigest)), false);
    assert.equal(fs.existsSync(path.join(cacheRoot, oldQuotaDigest)), false);
    assert.equal(fs.existsSync(path.join(cacheRoot, newestDigest)), true);
    assert.equal(fs.existsSync(path.join(cacheRoot, activeDigest)), true);

    const preserved = prunePackageDownloadCache(cacheRoot, {
      nowMs,
      maxTotalBytes: 100,
      preserveDigests: [`sha256:${'c'.repeat(64)}`],
    });
    assert.equal(preserved.removed_digests.length, 0);
    assert.equal(fs.existsSync(path.join(cacheRoot, newestDigest)), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createProcessCodexRunner cleans newly leaked .tmp/git-* and .staging orphans and terminates process group on completion or timeout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-v2-codex-runner-hygiene-'));
  try {
    const codexHome = path.join(root, 'codex-home');
    const tmpRoot = path.join(codexHome, '.tmp');
    const preExistingGit = path.join(tmpRoot, 'git-EXISTING');
    fs.mkdirSync(preExistingGit, { recursive: true });

    const binary = path.join(root, 'fake-codex.mjs');
    const childPidFile = path.join(root, 'child-pid.txt');
    fs.writeFileSync(
      binary,
      `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const tmp = path.join(process.env.CODEX_HOME, '.tmp');
const leak = (suffix) => {
  fs.mkdirSync(path.join(tmp, 'git-' + suffix), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.staging', 'marketplace-macos-' + suffix), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.staging.lock'), '');
};

const cmd = process.argv.slice(2).join(' ');
if (cmd === 'plugin list --json') {
  leak('CLIFAIL');
  process.exit(1);
} else if (cmd === 'plugin hang') {
  leak('CLITIMEOUT');
  setInterval(() => {}, 1_000);
} else if (cmd === 'app-server --stdio') {
  fs.writeFileSync(process.env.FIXTURE_PID_FILE, String(process.pid));
  const mode = process.env.FIXTURE_MODE || 'ok';
  leak('APPSERVER_' + mode.toUpperCase());
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      console.log(JSON.stringify({ id: req.id, result: { userAgent: 'fixture' } }));
    } else if (req.method === 'skills/list') {
      if (mode === 'bad-skills') {
        console.log(JSON.stringify({ id: req.id, result: { unexpected: [] } }));
        return;
      }
      const skill = { path: '/sample/SKILL.md', enabled: false, pluginId: 'example@opl-local' };
      const skills = [skill, { ...skill, pluginId: 'example@other', path: '/other/SKILL.md' }];
      console.log(JSON.stringify({ id: req.id, result: { data: [{ cwd: '.', skills, errors: [] }] } }));
    } else if (req.method === 'plugin/list') {
      if (mode === 'stall') return;
      console.log(JSON.stringify({ id: req.id, result: { marketplaces: [], marketplaceLoadErrors: [] } }));
    }
  });
}
`,
    );
    fs.chmodSync(binary, 0o755);

    const env = {
      ...process.env,
      HOME: root,
      CODEX_HOME: codexHome,
      FIXTURE_PID_FILE: childPidFile,
    };

    const runner = createProcessCodexRunner({ binary });
    const timed = createProcessCodexRunner({ binary, timeoutMs: 700 });

    const cliFailed = await runner.runCli(['plugin', 'list', '--json'], env);
    assert.equal(cliFailed.status, 1);
    assert.equal(fs.existsSync(path.join(tmpRoot, 'git-CLIFAIL')), false);
    assert.equal(fs.existsSync(path.join(tmpRoot, '.staging', 'marketplace-macos-CLIFAIL')), false);
    assert.equal(fs.existsSync(path.join(tmpRoot, '.staging.lock')), true);
    assert.equal(fs.existsSync(preExistingGit), true);

    const cliTimeout = await timed.runCli(['plugin', 'hang'], env);
    assert.equal(cliTimeout.status, null);
    assert.equal(fs.existsSync(path.join(tmpRoot, 'git-CLITIMEOUT')), false);
    assert.equal(fs.existsSync(path.join(tmpRoot, '.staging', 'marketplace-macos-CLITIMEOUT')), false);

    assert.deepEqual(await runner.readInstalledSkillPaths!('example@opl-local', env), ['/sample/SKILL.md']);
    await assert.rejects(runner.readInstalledSkillPaths!('example@opl-local', { ...env, FIXTURE_MODE: 'bad-skills' }), /skills.list response/);

    const listOk = await runner.listPlugins({ marketplaceKinds: ['local'] }, { ...env, FIXTURE_MODE: 'ok' });
    assert.deepEqual(listOk.marketplaces, []);
    assert.equal(fs.existsSync(path.join(tmpRoot, 'git-APPSERVER_OK')), false);
    assert.equal(fs.existsSync(preExistingGit), true);
    assert.throws(() => process.kill(Number(fs.readFileSync(childPidFile, 'utf8')), 0), { code: 'ESRCH' });

    await assert.rejects(
      timed.listPlugins({ marketplaceKinds: ['local'] }, { ...env, FIXTURE_MODE: 'stall' }),
      /timed out/,
    );
    assert.equal(fs.existsSync(path.join(tmpRoot, 'git-APPSERVER_STALL')), false);
    assert.equal(fs.existsSync(path.join(tmpRoot, '.staging', 'marketplace-macos-APPSERVER_STALL')), false);
    assert.equal(fs.existsSync(preExistingGit), true);
    assert.throws(() => process.kill(Number(fs.readFileSync(childPidFile, 'utf8')), 0), { code: 'ESRCH' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
