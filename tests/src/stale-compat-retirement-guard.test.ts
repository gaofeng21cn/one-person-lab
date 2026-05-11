import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const scannedRoots = [
  'src',
  'contracts',
  'examples',
  'tests/src',
  'tests/fixtures/family-manifests',
  'python/opl-harness-shared/src',
  'python/opl-harness-shared/tests',
];

const scannedNarrativeRoots = [
  'docs/active',
];

const scannedNarrativeFiles = [
  'docs/status.md',
  'docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md',
  'src/cli/cases/public-command-specs.ts',
];

const forbiddenTerms = [
  ['front', 'door'].join(''),
  ['front', 'desk'].join(''),
  ['product', '-', 'front', 'door'].join(''),
  ['product', '_', 'front', 'door'].join(''),
  ['open', '_', 'front', 'door'].join(''),
  ['open', '_', 'front', 'desk'].join(''),
  ['gateway', '_interaction_contract'].join(''),
  ['front', 'door_owner'].join(''),
  ['natural_language_', 'front', 'door'].join(''),
  ['host', '_agent'].join(''),
  ['hermes_native', '_proof'].join(''),
  ['compatibility', '_aliases'].join(''),
  ['legacy', '_boundary_terms'].join(''),
  ['mcp', '-stdio'].join(''),
];

const staleDefaultTerms = [
  'hermes-first',
  'gateway-first',
  'gateway handoff',
  ['front', 'door'].join(''),
  ['front', ' door'].join(''),
  'local-manager',
  'local manager',
  'default-compat',
  'compatibility alias',
];

const staleDefaultContexts = [
  'default',
  'current',
  'mainline',
  'active',
  'target',
  'authoritative',
  'production',
  '默认',
  '当前',
  '主线',
  '活跃',
  '目标',
  '生产',
  '权威',
];

const allowedRetirementContexts = [
  'archive',
  'archived',
  'diagnostic',
  'explicit',
  'fail-closed',
  'fixture',
  'historical',
  'history',
  'legacy',
  'not ',
  'optional',
  'provenance',
  'retire',
  'retired',
  'tombstone',
  'do not',
  '不再',
  '不能',
  '不得',
  '不是',
  '只保留',
  '历史',
  '显式',
  '来源',
  '退役',
  '降级',
  '清理',
];

const textFileExtensions = new Set([
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.ts',
]);

function* walk(relativeRoot: string): Generator<string> {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      yield* walk(relativePath);
      continue;
    }
    if (entry.isFile() && textFileExtensions.has(path.extname(entry.name))) {
      yield relativePath;
    }
  }
}

function staleDefaultViolation(line: string) {
  const lower = line.toLowerCase();
  if (!staleDefaultTerms.some((term) => lower.includes(term))) {
    return null;
  }
  if (!staleDefaultContexts.some((term) => lower.includes(term))) {
    return null;
  }
  if (allowedRetirementContexts.some((term) => lower.includes(term))) {
    return null;
  }
  return line.trim();
}

test('active OPL source, contracts, fixtures, and tests do not reintroduce retired compatibility vocabulary', () => {
  const violations: string[] = [];

  for (const relativeRoot of scannedRoots) {
    for (const relativePath of walk(relativeRoot)) {
      const lower = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').toLowerCase();
      for (const term of forbiddenTerms) {
        if (lower.includes(term.toLowerCase())) {
          violations.push(`${relativePath}: ${term}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('active docs and public command specs do not describe retired compatibility surfaces as default paths', () => {
  const violations: string[] = [];
  const relativePaths = [
    ...scannedNarrativeFiles,
    ...scannedNarrativeRoots.flatMap((relativeRoot) => [...walk(relativeRoot)]),
  ];

  for (const relativePath of relativePaths) {
    const lines = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const violation = staleDefaultViolation(line);
      if (violation) {
        violations.push(`${relativePath}:${index + 1}: ${violation}`);
      }
    });
  }

  assert.deepEqual(violations, []);
});
