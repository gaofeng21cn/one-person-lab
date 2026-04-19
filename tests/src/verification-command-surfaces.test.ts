import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('repo-tracked verification command surfaces reference valid npm scripts and local test files', () => {
  const files = [
    'AGENTS.md',
    'contracts/opl-gateway/phase-1-exit-activation-package.json',
    'contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json',
    'contracts/opl-gateway/phase-2-central-reference-sync-board.json',
    'contracts/opl-gateway/phase-2-admitted-domain-delta-intake-refresh.json',
  ];

  const npmRunPattern = /npm run ([a-z0-9:-]+)/gi;
  const localTestPattern = /(tests\/[^\s`'"]+\.(?:ts|mjs))/g;

  for (const relativePath of files) {
    const content = read(relativePath);

    for (const match of content.matchAll(npmRunPattern)) {
      const scriptName = match[1];
      assert.ok(
        packageJson.scripts?.[scriptName],
        `${relativePath} references missing npm script: ${scriptName}`,
      );
    }

    for (const match of content.matchAll(localTestPattern)) {
      const filePath = match[1];
      assert.ok(
        fs.existsSync(path.join(repoRoot, filePath)),
        `${relativePath} references missing test file: ${filePath}`,
      );
    }
  }
});

test('repository home and project docs describe OPL as gateway and headless adapter surfaces', () => {
  const englishReadme = read('README.md');
  const chineseReadme = read('README.zh-CN.md');
  const projectDoc = read('docs/project.md');

  assert.match(englishReadme, /gateway/i);
  assert.match(englishReadme, /headless adapter/i);
  assert.doesNotMatch(englishReadme, /unified workbench/i);
  assert.doesNotMatch(englishReadme, /OPL owns the unified workbench itself/i);

  assert.match(chineseReadme, /gateway/i);
  assert.match(chineseReadme, /headless adapter/i);
  assert.doesNotMatch(chineseReadme, /统一工作台/);
  assert.doesNotMatch(chineseReadme, /负责的是统一工作台本身/);

  assert.match(projectDoc, /headless adapter/i);
  assert.match(projectDoc, /gateway\s*\/\s*federation/i);
  assert.doesNotMatch(projectDoc, /GUI 产品壳与模块管理器/);
  assert.doesNotMatch(projectDoc, /OPL 自己负责 GUI/);
});

test('docs guides stay as entry indexes rather than live command matrices', () => {
  const englishGuide = read('docs/README.md');
  const chineseGuide = read('docs/README.zh-CN.md');

  for (const guide of [englishGuide, chineseGuide]) {
    assert.match(guide, /Layer 1|第一层/);
    assert.match(guide, /Layer 4|第四层/);
    assert.doesNotMatch(guide, /opl web/i);
    assert.doesNotMatch(guide, /frontdesk service/i);
    assert.doesNotMatch(guide, /scripts\/verify\.sh/i);
    assert.doesNotMatch(guide, /grouped command matrix/i);
  }
});

test('status doc keeps public runtime truth separate from maintainer verification flow', () => {
  const statusDoc = read('docs/status.md');

  assert.match(statusDoc, /headless adapter/i);
  assert.match(statusDoc, /external overlay/i);
  assert.match(statusDoc, /domain runtime ownership/i);
  assert.doesNotMatch(statusDoc, /## 默认验证/);
  assert.doesNotMatch(statusDoc, /scripts\/verify\.sh/);
});

test('scripts/verify.sh provides the canonical verification wrapper', () => {
  const verifyScript = read('scripts/verify.sh');

  assert.match(verifyScript, /npm test/);
  assert.match(verifyScript, /npm run family:shared-release -- check/);
  assert.match(verifyScript, /npm run test:meta/);
  assert.match(verifyScript, /npm run test:artifact/);
  assert.match(verifyScript, /npm run test:full/);
});

test('package.json exposes the canonical family shared release maintenance command', () => {
  assert.equal(packageJson.scripts?.['family:shared-release'], 'node ./scripts/family-shared-release.mjs');
  assert.equal(packageJson.exports?.['./family-shared-release'], './dist/family-shared-release.js');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/family-shared-release.mjs')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/family-shared-release.ts')),
    true,
  );
});
