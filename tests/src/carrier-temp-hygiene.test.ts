import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_CARRIER_TMP_MAX_AGE_MS,
  pruneCodexCarrierTmpArtifacts,
  pruneOplPackageStateArtifacts,
  prunePackageDownloadCache,
} from '../../src/adapters/integration/agent-package-registry/carrier-temp-hygiene.ts';
import { defaultRunner } from '../../src/adapters/integration/agent-package-registry/configured-codex-plugin-carrier-native.ts';
import { readCodexLocalPluginList } from '../../src/adapters/integration/agent-package-registry/codex-plugin-local-readback.ts';

function setMtime(target: string, mtimeMs: number) {
  const sec = mtimeMs / 1000;
  fs.utimesSync(target, sec, sec);
}

test('pruneCodexCarrierTmpArtifacts removes stale git-* and .staging orphans while respecting locks, recency, symlinks and pass budget', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-carrier-tmp-hygiene-'));
  try {
    const nowMs = Date.UTC(2026, 10, 26, 12, 0, 0);
    const staleMs = nowMs - DEFAULT_CARRIER_TMP_MAX_AGE_MS - 60_000;
    const recentMs = nowMs - 60_000;
    const oldLockMs = nowMs - 60 * 60 * 1000;

    const codexHome = path.join(root, 'carrier');
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

    // Make top-level lock recent first: .staging must be skipped while stale git-* is still pruned.
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

    // Once lock ages out, stale .staging entry is removed while fresh entry remains.
    setMtime(lockFile, oldLockMs);
    const secondPass = pruneCodexCarrierTmpArtifacts(codexHome, { nowMs });
    assert.equal(secondPass.removed_entries, 1);
    assert.equal(fs.existsSync(staleStage), false);
    assert.equal(fs.existsSync(freshStage), true);

    // Idempotent repeat removes nothing.
    const thirdPass = pruneCodexCarrierTmpArtifacts(codexHome, { nowMs });
    assert.equal(thirdPass.removed_entries, 0);

    // Budget cap truncates cleanly without scanning unbounded directories.
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

test('pruneOplPackageStateArtifacts cleans orphaned staging dirs and enforces package-downloads TTL and size quota', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-state-hygiene-'));
  try {
    const nowMs = Date.UTC(2026, 10, 26, 12, 0, 0);
    const staleMs = nowMs - DEFAULT_CARRIER_TMP_MAX_AGE_MS - 120_000;
    const recentMs = nowMs - 30_000;
    const oldDownloadMs = nowMs - 10 * 24 * 60 * 60 * 1000;
    const stateDir = path.join(root, 'state');
    const userCodexHome = path.join(root, 'user-codex');
    const env = { HOME: root, OPL_STATE_DIR: stateDir, CODEX_HOME: userCodexHome };

    const stalePkgStage = path.join(stateDir, 'package-staging-OLD111');
    const freshPkgStage = path.join(stateDir, 'package-staging-NEW111');
    const deadMktStage = path.join(stateDir, 'codex-plugin-marketplaces', 'foo.999999.11111111-1111-4111-8111-111111111111.staging');
    const liveMktStage = path.join(stateDir, 'codex-plugin-marketplaces', `bar.${process.pid}.22222222-2222-4222-8222-222222222222.staging`);
    const deadMktPrev = path.join(stateDir, 'codex-plugin-marketplaces', 'baz.999999.previous');
    const staleProjStage = path.join(stateDir, 'agent-package-skill-projections', '.staging-OLD');
    const liveProj = path.join(stateDir, 'agent-package-skill-projections', 'gen-live');
    const internalStaleGit = path.join(stateDir, 'internal-package-carrier', '.tmp', 'git-INT001');
    const userStaleGit = path.join(userCodexHome, '.tmp', 'git-USR001');

    for (const dir of [stalePkgStage, freshPkgStage, deadMktStage, liveMktStage, deadMktPrev, staleProjStage, liveProj, internalStaleGit, userStaleGit]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    for (const stale of [stalePkgStage, deadMktStage, liveMktStage, deadMktPrev, staleProjStage, internalStaleGit, userStaleGit]) {
      setMtime(stale, staleMs);
    }
    setMtime(freshPkgStage, recentMs);

    const downloadsRoot = path.join(stateDir, 'package-downloads');
    const expiredDigest = 'a'.repeat(64);
    const oldQuotaDigest = 'b'.repeat(64);
    const newestDigest = 'c'.repeat(64);
    const activeDigest = 'd'.repeat(64);
    for (const [digest, size, mtime, active] of [
      [expiredDigest, 200, oldDownloadMs, false],
      [oldQuotaDigest, 600, nowMs - 2 * 60 * 60 * 1000, false],
      [newestDigest, 500, nowMs - 10 * 60 * 1000, false],
      [activeDigest, 400, oldDownloadMs, true],
    ] as const) {
      const dir = path.join(downloadsRoot, digest);
      fs.mkdirSync(dir, { recursive: true });
      const archive = path.join(dir, 'archive.tar.gz');
      fs.writeFileSync(archive, Buffer.alloc(size, 1));
      setMtime(archive, mtime);
      setMtime(dir, mtime);
      if (active) fs.writeFileSync(path.join(dir, 'download.lock'), String(process.pid));
    }

    const summary = pruneOplPackageStateArtifacts(env, {
      nowMs,
      maxDownloadTotalBytes: 1_000,
    });
    assert.equal(summary.surface_kind, 'opl_package_state_hygiene.v1');
    assert.deepEqual(summary.removed_package_staging_dirs, ['package-staging-OLD111']);
    assert.equal(fs.existsSync(freshPkgStage), true);
    assert.equal(fs.existsSync(deadMktStage), false);
    assert.equal(fs.existsSync(deadMktPrev), false);
    assert.equal(fs.existsSync(liveMktStage), true, 'live PID marketplace staging must be preserved');
    assert.deepEqual(summary.removed_skill_projection_staging_dirs, ['.staging-OLD']);
    assert.equal(fs.existsSync(liveProj), true);
    assert.equal(fs.existsSync(internalStaleGit), false);
    assert.equal(fs.existsSync(userStaleGit), false);

    // Download cache: expired removed, active (400B) + newest (500B) = 900B <= 1000B, so oldQuota (600B) evicted.
    assert.deepEqual(summary.package_downloads.skipped_active_digests, [activeDigest]);
    assert.deepEqual(summary.package_downloads.removed_digests.sort(), [expiredDigest, oldQuotaDigest]);
    assert.equal(fs.existsSync(path.join(downloadsRoot, expiredDigest)), false);
    assert.equal(fs.existsSync(path.join(downloadsRoot, oldQuotaDigest)), false);
    assert.equal(fs.existsSync(path.join(downloadsRoot, newestDigest)), true);
    assert.equal(fs.existsSync(path.join(downloadsRoot, activeDigest)), true);

    // Explicit preserveDigests protects a digest from eviction.
    const preserved = prunePackageDownloadCache(env, {
      nowMs,
      maxTotalBytes: 100,
      preserveDigests: [`sha256:${newestDigest}`],
    });
    assert.equal(preserved.removed_digests.length, 0);
    assert.equal(fs.existsSync(path.join(downloadsRoot, newestDigest)), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('defaultRunner and readCodexLocalPluginList clean up newly leaked .tmp/git-* and .staging orphans in finally', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-carrier-finally-cleanup-'));
  try {
    const stateDir = path.join(root, 'state');
    const internalHome = path.join(stateDir, 'internal-package-carrier');
    const tmpRoot = path.join(internalHome, '.tmp');
    const preExistingGit = path.join(tmpRoot, 'git-EXISTING');
    fs.mkdirSync(preExistingGit, { recursive: true });
    const binary = path.join(root, 'fake-codex.cjs');
    fs.writeFileSync(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const tmp = path.join(process.env.CODEX_HOME, '.tmp');
const leak = (suffix) => {
  fs.mkdirSync(path.join(tmp, 'git-' + suffix), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.staging', 'marketplace-macos-' + suffix), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.staging.lock'), '');
};
const cmd = process.argv.slice(2).join(' ');
if (cmd === 'plugin list --json') {
  leak('RUNNERFAIL');
  process.exit(1);
} else if (cmd === 'plugin marketplace list --json') {
  console.log(JSON.stringify({ marketplaces: [] }));
} else if (cmd === 'app-server --stdio') {
  leak('READBACKOK');
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const req = JSON.parse(line);
    if (req.method === 'initialize') console.log(JSON.stringify({ id: req.id, result: { userAgent: 'fixture' } }));
    else if (req.method === 'plugin/list') console.log(JSON.stringify({ id: req.id, result: { marketplaces: [], marketplaceLoadErrors: [] } }));
  });
}
`);
    fs.chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: root, OPL_STATE_DIR: stateDir, CODEX_HOME: internalHome };

    const failed = defaultRunner({ binary, args: ['plugin', 'list', '--json'], env });
    assert.equal(failed.status, 1);
    assert.equal(fs.existsSync(path.join(tmpRoot, 'git-RUNNERFAIL')), false);
    assert.equal(fs.existsSync(path.join(tmpRoot, '.staging', 'marketplace-macos-RUNNERFAIL')), false);
    assert.equal(fs.existsSync(path.join(tmpRoot, '.staging.lock')), true);
    assert.equal(fs.existsSync(preExistingGit), true, 'pre-existing entries are left to TTL pruning');

    const readback = readCodexLocalPluginList({ binary, env });
    assert.equal(readback.status, 0, readback.stderr);
    assert.equal(fs.existsSync(path.join(tmpRoot, 'git-READBACKOK')), false);
    assert.equal(fs.existsSync(path.join(tmpRoot, '.staging', 'marketplace-macos-READBACKOK')), false);
    assert.equal(fs.existsSync(preExistingGit), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
