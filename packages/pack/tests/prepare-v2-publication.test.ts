import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractPackageSourceArchive, verifyReleaseLock } from '../src/index.ts';

const builder = fileURLToPath(new URL('../../../scripts/prepare-v2-package-publication.mjs', import.meta.url));

test('the candidate CLI packages frozen Git bytes and rejects replacing an immutable release', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-v2-publication-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ownerRoot = path.join(root, 'owner');
  fs.mkdirSync(path.join(ownerRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ownerRoot, 'assets/icon.png'), 'canonical bytes');
  fs.writeFileSync(path.join(ownerRoot, 'opl-package.json'), JSON.stringify({
    schema_version: 'opl.package.v2',
    identity: {
      id: 'demo', version: '1.2.3', intent: 'extension',
      name: { 'zh-CN': '示例', 'en-US': 'Example' },
      summary: { 'zh-CN': '示例摘要', 'en-US': 'Example summary' },
      publisher: 'test', icon: 'assets/icon.png',
    },
  }));
  const git = (...args: string[]) => execFileSync('git', ['-C', ownerRoot, ...args], { encoding: 'utf8' }).trim();
  git('init', '--initial-branch=main');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'original');
  const commit = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(ownerRoot, 'assets/icon.png'), 'uncommitted bytes');
  fs.writeFileSync(path.join(ownerRoot, 'personal.txt'), 'untracked');

  const outputDirectory = path.join(root, 'output');
  const prepare = (revision: string, output = outputDirectory, version = '1.2.3') =>
    JSON.parse(execFileSync(process.execPath, ['--conditions=opl-source', '--experimental-strip-types', builder,
      '--owner-root', ownerRoot, '--source-commit', revision, '--package-id', 'demo', '--package-version', version,
      '--output-directory', output], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const release = prepare(commit);
  const repeat = prepare(commit, path.join(root, 'second-output'));
  assert.equal(release.archive_sha256, repeat.archive_sha256);
  assert.equal(prepare(commit).archive_sha256, release.archive_sha256);
  assert.equal(release.package_format, 'v2');
  assert.equal(release.source_commit, commit);
  assert.equal(release.file_count, 2);

  const extracted = path.join(root, 'consumer');
  extractPackageSourceArchive(release.archive_path, extracted);
  assert.equal(verifyReleaseLock(extracted).digest, release.content_digest);
  assert.equal(fs.readFileSync(path.join(extracted, 'assets/icon.png'), 'utf8'), 'canonical bytes');
  assert.equal(fs.existsSync(path.join(extracted, 'personal.txt')), false);
  assert.throws(() => prepare(commit, outputDirectory, '1.2.4'), /Owner descriptor does not select demo@1\.2\.4/);
  git('add', 'assets/icon.png');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'different content');
  assert.throws(() => prepare(git('rev-parse', 'HEAD')), / EEXIST: /);
  assert.equal(prepare(commit).archive_sha256, release.archive_sha256);
});
