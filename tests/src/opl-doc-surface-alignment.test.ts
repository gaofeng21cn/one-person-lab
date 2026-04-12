import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function collectMarkdownFiles(relativeRoot: string): string[] {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  const stats = fs.statSync(absoluteRoot);

  if (stats.isFile()) {
    return [relativeRoot];
  }

  const files: string[] = [];

  function walk(currentRelativeDir: string) {
    const absoluteDir = path.join(repoRoot, currentRelativeDir);
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = path.join(currentRelativeDir, entry.name);

      if (entry.isDirectory()) {
        if (
          relativePath.startsWith(`docs${path.sep}plans`) ||
          relativePath.startsWith(`docs${path.sep}specs`) ||
          entry.name.startsWith('.')
        ) {
          continue;
        }

        walk(relativePath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(relativePath);
      }
    }
  }

  walk(relativeRoot);
  return files.sort();
}

function findBrokenLocalMarkdownLinks(relativePath: string) {
  const content = read(relativePath);
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  const brokenLinks: string[] = [];

  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1]?.split('#', 1)[0]?.trim();

    if (
      !rawTarget ||
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('#')
    ) {
      continue;
    }

    const resolvedPath = path.resolve(path.dirname(path.join(repoRoot, relativePath)), rawTarget);

    if (!fs.existsSync(resolvedPath)) {
      brokenLinks.push(rawTarget);
    }
  }

  return brokenLinks;
}

test('public bilingual truth surfaces distinguish Codex development host from Hermes target substrate', () => {
  const publicDocs = [
    'README.md',
    'README.zh-CN.md',
    'docs/roadmap.md',
    'docs/roadmap.zh-CN.md',
    'docs/unified-harness-engineering-substrate.md',
    'docs/unified-harness-engineering-substrate.zh-CN.md',
  ];

  for (const relativePath of publicDocs) {
    const content = read(relativePath);
    assert.match(content, /Codex-only|Codex/);
    assert.match(content, /Hermes-Agent/);
    assert.match(content, /development host|开发宿主|future.*substrate|未来产品 runtime substrate 方向/);
    assert.doesNotMatch(content, /Codex.?优先的 host-agent runtime/);
  }
});

test('core and reference docs freeze the external-kernel managed-integration model', () => {
  const readme = read('README.md');
  const readmeZh = read('README.zh-CN.md');
  const status = read('docs/status.md');
  const architecture = read('docs/architecture.md');
  const referenceDoc = read('docs/references/opl-product-entry-and-hermes-kernel-integration.md');

  assert.match(readme, /external kernel, managed by OPL product packaging/i);
  assert.match(readmeZh, /external kernel, managed by OPL product packaging/);
  assert.match(status, /direct product entry|external kernel, managed by OPL product packaging/);
  assert.match(architecture, /OPL Product Entry -> OPL Gateway -> Hermes Kernel/);
  assert.match(referenceDoc, /方案 A/);
  assert.match(referenceDoc, /方案 B/);
  assert.match(referenceDoc, /方案 C/);
  assert.match(referenceDoc, /结论：[\s\S]{0,80}- 不选。/);
  assert.match(referenceDoc, /结论：[\s\S]{0,80}- 选择方案 C。/);
  assert.match(referenceDoc, /代码层外部依赖，产品层托管集成/);
});

test('core maintainer docs exist and are linked from docs index', () => {
  const docsIndex = read('docs/README.md');
  const docsIndexZh = read('docs/README.zh-CN.md');
  const coreDocs = [
    'docs/project.md',
    'docs/status.md',
    'docs/architecture.md',
    'docs/invariants.md',
    'docs/decisions.md',
  ];

  for (const relativePath of coreDocs) {
    assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} should exist`);
    assert.match(docsIndex, new RegExp(relativePath.split('/').pop()!.replace('.', '\\.')));
    assert.match(docsIndexZh, new RegExp(relativePath.split('/').pop()!.replace('.', '\\.')));
  }
});

test('repo-tracked README/docs/contracts markdown links resolve locally', () => {
  const files = [
    ...collectMarkdownFiles('README.md'),
    ...collectMarkdownFiles('README.zh-CN.md'),
    ...collectMarkdownFiles('docs'),
    ...collectMarkdownFiles('contracts'),
  ];

  const broken = files.flatMap((relativePath) =>
    findBrokenLocalMarkdownLinks(relativePath).map((target) => `${relativePath} -> ${target}`),
  );

  assert.deepEqual(broken, []);
});
