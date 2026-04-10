import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

test('repo keeps a single top-level tests directory', () => {
  const rootDirectories = new Set(
    fs.readdirSync(repoRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );

  assert.ok(rootDirectories.has('tests'));
  assert.ok(!rootDirectories.has('test'));
  assert.ok(!rootDirectories.has('test-dist'));
  assert.ok(fs.statSync(path.join(repoRoot, 'tests', 'src')).isDirectory());
  assert.ok(fs.statSync(path.join(repoRoot, 'tests', 'built')).isDirectory());
});
