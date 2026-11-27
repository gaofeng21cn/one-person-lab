import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PackError,
  buildPackage,
  computePackageContentDigest,
  createPackageSourceArchive,
  extractPackageSourceArchive,
  packageSourceArchiveMembersStayWithinRoot,
  verifyReleaseLock,
} from '../src/index.ts';

function writeMinimalPackage(dir: string): void {
  fs.mkdirSync(path.join(dir, 'skills', 'demo-skill'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(
    path.join(dir, 'skills', 'demo-skill', 'SKILL.md'),
    '# Demo Skill\nUsed for build tests.\n',
  );
  fs.writeFileSync(
    path.join(dir, 'opl-package.json'),
    JSON.stringify(
      {
        schema_version: 'opl.package.v2',
        identity: {
          id: 'demo-pack',
          version: '1.2.3',
          intent: 'extension',
          name: { 'zh-CN': '示例包', 'en-US': 'Demo Pack' },
          summary: { 'zh-CN': '示例摘要', 'en-US': 'Demo summary' },
          publisher: 'one-person-lab',
          icon: 'assets/icon.png',
        },
        provides: {
          skills: [{ id: 'demo-skill', path: './skills/demo-skill' }],
        },
      },
      null,
      2,
    ),
  );
}

test('computePackageContentDigest uses canonical 64-bit UInt64BE length framing independent of order', () => {
  const files: Record<string, Buffer> = {
    'b/two.txt': Buffer.from('hello'),
    'a/one.txt': Buffer.from('world!'),
  };
  const d1 = computePackageContentDigest(['b/two.txt', 'a/one.txt'], (p) => files[p]);
  const d2 = computePackageContentDigest(['a/one.txt', './b/two.txt'], (p) => files[p]);
  assert.equal(d1, d2);
  assert.match(d1, /^sha256:[0-9a-f]{64}$/);
});

test('buildPackage creates idempotent opl-release.lock.json and verifyReleaseLock fails closed on 1-byte tamper or extra file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-build-'));
  try {
    writeMinimalPackage(tmpDir);
    // Noise ignored by buildPackage
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'foo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'foo', 'index.js'), 'module.exports = 1;\n');

    const res1 = buildPackage(tmpDir, { builtAt: '2026-11-25T00:00:00.000Z' });
    const res2 = buildPackage(tmpDir, { builtAt: '2026-11-25T00:00:00.000Z' });
    assert.equal(res1.digest, res2.digest);
    assert.deepEqual(res1.lock.paths, [
      'assets/icon.png',
      'opl-package.json',
      'skills/demo-skill/SKILL.md',
    ]);
    assert.equal(fs.existsSync(res1.lock_path), true);

    const verified = verifyReleaseLock(tmpDir);
    assert.equal(verified.digest, res1.digest);

    // 1-byte tamper detection
    const skillPath = path.join(tmpDir, 'skills', 'demo-skill', 'SKILL.md');
    const orig = fs.readFileSync(skillPath, 'utf8');
    fs.writeFileSync(skillPath, `${orig}!`);
    assert.throws(
      () => verifyReleaseLock(tmpDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_LOCK_MISMATCH',
    );
    fs.writeFileSync(skillPath, orig);

    // Extra unlocked file detection
    fs.writeFileSync(path.join(tmpDir, 'injected.txt'), 'extra');
    assert.throws(
      () => verifyReleaseLock(tmpDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_LOCK_MISMATCH',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildPackage rejects missing manifest paths and escaping/release symlinks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-sec-'));
  const outsideFile = path.join(tmpDir, 'outside.txt');
  const pkgDir = path.join(tmpDir, 'pkg');
  try {
    fs.writeFileSync(outsideFile, 'secret');
    writeMinimalPackage(pkgDir);

    // Escaping symlink
    fs.symlinkSync(outsideFile, path.join(pkgDir, 'leak.txt'));
    assert.throws(
      () => buildPackage(pkgDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
    );
    fs.rmSync(path.join(pkgDir, 'leak.txt'));

    // Missing icon path
    fs.rmSync(path.join(pkgDir, 'assets', 'icon.png'));
    assert.throws(
      () => buildPackage(pkgDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_MISSING_PATH',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('matches real opl-channel-weixin canonical 64-bit content_lock digest if present on disk', (t) => {
  const weixinDir = '/Users/gaofeng/workspace/one-person-lab-app/packages/opl-channel-weixin';
  const manifestPath = path.join(weixinDir, 'opl-package.json');
  if (!fs.existsSync(manifestPath)) {
    t.skip('External one-person-lab-app checkout not present');
    return;
  }
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    content_lock?: { paths?: string[]; digest?: string };
  };
  const paths = raw.content_lock?.paths ?? [];
  const expectedDigest = raw.content_lock?.digest;
  if (!paths.length || !expectedDigest) {
    t.skip('opl-channel-weixin content_lock absent');
    return;
  }
  if (!paths.every((rel) => fs.existsSync(path.join(weixinDir, rel)))) {
    t.skip('opl-channel-weixin build artifacts not built on disk');
    return;
  }
  const actual = computePackageContentDigest(paths, (rel) =>
    fs.readFileSync(path.join(weixinDir, rel)),
  );
  assert.equal(actual, expectedDigest);
});

test('buildPackage validates cli argv[1..] paths, rejects symlinked opl-release.lock.json, and archive allows normalized ./ prefixes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-lock-hard-'));
  const pkgDir = path.join(tmpDir, 'pkg');
  const outsideLock = path.join(tmpDir, 'outside-lock.json');

  try {
    writeMinimalPackage(pkgDir);
    // 1. CLI argv[1..] relative path missing -> PACK_MISSING_PATH
    const manifestPath = path.join(pkgDir, 'opl-package.json');
    const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        ...rawManifest,
        provides: {
          ...(rawManifest.provides as Record<string, unknown>),
          contribution_handler: { kind: 'cli', argv: ['node', './dist/missing-handler.js'] },
        },
      }),
    );
    assert.throws(
      () => buildPackage(pkgDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_MISSING_PATH',
    );

    // Restore valid handler path & build
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'dist', 'handler.js'), 'export {};\n');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        ...rawManifest,
        provides: {
          ...(rawManifest.provides as Record<string, unknown>),
          contribution_handler: { kind: 'cli', argv: ['node', './dist/handler.js'] },
        },
      }),
    );
    buildPackage(pkgDir);

    // 2. Symlinked opl-release.lock.json -> PACK_SYMLINK_ESCAPE in both verifyReleaseLock and buildPackage(writeLock: true)
    const lockPath = path.join(pkgDir, 'opl-release.lock.json');
    fs.renameSync(lockPath, outsideLock);
    const outsideOriginal = fs.readFileSync(outsideLock, 'utf8');
    fs.symlinkSync(outsideLock, lockPath);
    assert.throws(
      () => verifyReleaseLock(pkgDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
    );
    assert.throws(
      () => buildPackage(pkgDir, { writeLock: true }),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
    );
    assert.equal(fs.readFileSync(outsideLock, 'utf8'), outsideOriginal);
    fs.rmSync(lockPath);
    fs.renameSync(outsideLock, lockPath);

    // 3. Archive member check allows ./-prefixed files while rejecting bare '.', '..', and escapes
    assert.equal(
      packageSourceArchiveMembersStayWithinRoot([
        { path: './opl-package.json', kind: 'file' },
        { path: './skills/demo-skill/SKILL.md', kind: 'file' },
      ]),
      true,
    );
    assert.equal(
      packageSourceArchiveMembersStayWithinRoot([{ path: '.', kind: 'directory' }]),
      false,
    );
    assert.equal(
      packageSourceArchiveMembersStayWithinRoot([{ path: './', kind: 'directory' }]),
      false,
    );
    assert.equal(
      packageSourceArchiveMembersStayWithinRoot([{ path: './../evil.txt', kind: 'file' }]),
      false,
    );

    const archivePath = path.join(tmpDir, 'dot-rel.tar.gz');
    const extractDir = path.join(tmpDir, 'extracted');
    createPackageSourceArchive(pkgDir, archivePath, ['./opl-package.json', './assets/icon.png']);
    const extracted = extractPackageSourceArchive(archivePath, extractDir);
    assert.equal(extracted.length, 2);
    assert.equal(fs.existsSync(path.join(extractDir, 'opl-package.json')), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildPackage excludes Python cache dirs and *.pyc files at any depth while rejecting cache-named symlinks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-pycache-'));
  const outsideFile = path.join(tmpDir, 'outside.txt');
  const cleanDir = path.join(tmpDir, 'clean');
  const noisyDir = path.join(tmpDir, 'noisy');
  try {
    fs.writeFileSync(outsideFile, 'secret\n');
    writeMinimalPackage(cleanDir);
    fs.mkdirSync(path.join(cleanDir, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(cleanDir, 'runtime', 'app.py'), 'print("ok")\n');

    fs.cpSync(cleanDir, noisyDir, { recursive: true });
    fs.mkdirSync(path.join(noisyDir, 'runtime', '__pycache__'), { recursive: true });
    fs.writeFileSync(path.join(noisyDir, 'runtime', '__pycache__', 'app.cpython-312.pyc'), 'pyc');
    fs.mkdirSync(path.join(noisyDir, '.pytest_cache', 'v', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(noisyDir, '.pytest_cache', 'v', 'cache', 'lastfailed'), '{}');
    fs.mkdirSync(path.join(noisyDir, '.ruff_cache', '0.1'), { recursive: true });
    fs.writeFileSync(path.join(noisyDir, '.ruff_cache', '0.1', 'state'), '1');
    fs.mkdirSync(path.join(noisyDir, '.venv', 'bin'), { recursive: true });
    fs.symlinkSync(outsideFile, path.join(noisyDir, '.venv', 'bin', 'python'));
    fs.writeFileSync(path.join(noisyDir, 'runtime', 'stray.pyc'), 'pyc');

    const cleanBuild = buildPackage(cleanDir, { builtAt: '2026-11-26T00:00:00.000Z' });
    const noisyBuild = buildPackage(noisyDir, { builtAt: '2026-11-26T00:00:00.000Z' });
    assert.equal(noisyBuild.digest, cleanBuild.digest);
    assert.deepEqual(noisyBuild.lock.paths, cleanBuild.lock.paths);
    assert.equal(
      noisyBuild.lock.paths.some(
        (p) =>
          p.includes('__pycache__') ||
          p.includes('.pytest_cache') ||
          p.includes('.ruff_cache') ||
          p.includes('.venv') ||
          p.endsWith('.pyc'),
      ),
      false,
    );

    // Symlink named __pycache__ or *.pyc must still fail closed with PACK_SYMLINK_ESCAPE
    const pycacheLink = path.join(cleanDir, 'runtime', '__pycache__');
    fs.symlinkSync(outsideFile, pycacheLink);
    assert.throws(
      () => buildPackage(cleanDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
    );
    fs.rmSync(pycacheLink);

    const pycLink = path.join(cleanDir, 'runtime', 'evil.pyc');
    fs.symlinkSync(outsideFile, pycLink);
    assert.throws(
      () => buildPackage(cleanDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
    );
    fs.rmSync(pycLink);

    const venvLink = path.join(cleanDir, '.venv');
    fs.symlinkSync(outsideFile, venvLink);
    assert.throws(
      () => buildPackage(cleanDir),
      (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildPackage excludes nested node_modules, .codegraph, and .tsbuildinfo at any depth while rejecting excluded-named symlinks and honoring dryRun', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-m8-excl-'));
  const outsideFile = path.join(tmpDir, 'outside.txt');
  const cleanDir = path.join(tmpDir, 'clean');
  const noisyDir = path.join(tmpDir, 'noisy');
  try {
    fs.writeFileSync(outsideFile, 'secret\n');
    writeMinimalPackage(cleanDir);
    fs.mkdirSync(path.join(cleanDir, 'workbench', 'src'), { recursive: true });
    fs.writeFileSync(path.join(cleanDir, 'workbench', 'src', 'index.ts'), 'export const ok = true;\n');

    fs.cpSync(cleanDir, noisyDir, { recursive: true });
    // Nested node_modules with internal symlink (mirrors opl-relay/workbench/node_modules/.bin/esbuild)
    fs.mkdirSync(path.join(noisyDir, 'workbench', 'node_modules', '.bin'), { recursive: true });
    fs.mkdirSync(path.join(noisyDir, 'workbench', 'node_modules', 'esbuild', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(noisyDir, 'workbench', 'node_modules', 'esbuild', 'bin', 'esbuild'), '#!/bin/sh\n');
    fs.symlinkSync(
      '../esbuild/bin/esbuild',
      path.join(noisyDir, 'workbench', 'node_modules', '.bin', 'esbuild'),
    );
    // .codegraph directory at root and nested
    fs.mkdirSync(path.join(noisyDir, '.codegraph'), { recursive: true });
    fs.writeFileSync(path.join(noisyDir, '.codegraph', 'codegraph.db'), 'sqlite-bytes');
    fs.mkdirSync(path.join(noisyDir, 'workbench', '.codegraph'), { recursive: true });
    fs.writeFileSync(path.join(noisyDir, 'workbench', '.codegraph', '.gitignore'), '*\n');
    // .tsbuildinfo directory (mirrors redcube-ai/.tsbuildinfo/*) and *.tsbuildinfo files
    fs.mkdirSync(path.join(noisyDir, '.tsbuildinfo'), { recursive: true });
    fs.writeFileSync(path.join(noisyDir, '.tsbuildinfo', 'tests.tsbuildinfo'), '{}');
    fs.writeFileSync(path.join(noisyDir, 'workbench', 'tsconfig.tsbuildinfo'), '{}');

    const cleanBuild = buildPackage(cleanDir, {
      builtAt: '2026-11-27T00:00:00.000Z',
      writeLock: false,
    });
    assert.equal(fs.existsSync(path.join(cleanDir, 'opl-release.lock.json')), false);

    // dryRun: true must not write opl-release.lock.json when absent
    const noisyDryBuild = buildPackage(noisyDir, {
      builtAt: '2026-11-27T00:00:00.000Z',
      dryRun: true,
    });
    assert.equal(fs.existsSync(path.join(noisyDir, 'opl-release.lock.json')), false);
    assert.equal(noisyDryBuild.digest, cleanBuild.digest);
    assert.deepEqual(noisyDryBuild.lock.paths, cleanBuild.lock.paths);
    assert.equal(
      noisyDryBuild.lock.paths.some(
        (p) =>
          p.includes('node_modules') ||
          p.includes('.codegraph') ||
          p.includes('.tsbuildinfo'),
      ),
      false,
    );

    // dryRun: true must not modify a pre-existing opl-release.lock.json
    const lockPath = path.join(noisyDir, 'opl-release.lock.json');
    const sentinelLock = '{"sentinel":true}\n';
    fs.writeFileSync(lockPath, sentinelLock, 'utf8');
    const pastTime = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, pastTime, pastTime);
    const beforeStat = fs.statSync(lockPath);
    buildPackage(noisyDir, { dryRun: true });
    const afterStat = fs.statSync(lockPath);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), sentinelLock);
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);

    // Symlinks literally named node_modules, .codegraph, .tsbuildinfo, or *.tsbuildinfo MUST fail closed
    for (const badRel of [
      'workbench/node_modules',
      '.codegraph',
      '.tsbuildinfo',
      'workbench/evil.tsbuildinfo',
    ]) {
      const linkPath = path.join(cleanDir, badRel);
      fs.symlinkSync(outsideFile, linkPath);
      assert.throws(
        () => buildPackage(cleanDir, { dryRun: true }),
        (err: unknown) => err instanceof PackError && err.code === 'PACK_SYMLINK_ESCAPE',
        `Expected PACK_SYMLINK_ESCAPE for symlink ${badRel}`,
      );
      fs.rmSync(linkPath);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
