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
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'cli', 'modules', 'types.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'cli', 'modules', 'runtime-helpers.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'cli', 'modules', 'request-parsers.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'cli', 'modules', 'system-action-parsers.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'cli', 'modules', 'help-output.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tests', 'src', 'cli.test.ts')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tests', 'src', 'cli', 'cases')), true);
});

test('family-runtime command parser keeps a thin public entrypoint and semantic parser parts', () => {
  const entryPath = path.join(repoRoot, 'src', 'family-runtime-command.ts');
  const partsRoot = path.join(repoRoot, 'src', 'family-runtime-command-parts');
  const entryLines = fs.readFileSync(entryPath, 'utf8').trimEnd().split('\n').length;

  assert.equal(fs.existsSync(partsRoot), true);
  assert.ok(entryLines < 260, `family-runtime-command.ts should stay thin after parser extraction, got ${entryLines}`);
  for (const fileName of [
    'attempt.ts',
    'lifecycle.ts',
    'provider.ts',
    'queue.ts',
    'scheduler.ts',
    'service-worker.ts',
    'shared.ts',
  ]) {
    assert.equal(fs.existsSync(path.join(partsRoot, fileName)), true, `${fileName} parser part is missing`);
  }
});
