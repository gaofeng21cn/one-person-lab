import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

test('CLI modularization keeps stable entry files while extracting modules and cases', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'cli.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'cli', 'main.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tests', 'src', 'cli.test.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tests', 'src', 'cli', 'cases')), true);
});
