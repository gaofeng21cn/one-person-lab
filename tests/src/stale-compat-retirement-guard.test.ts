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
