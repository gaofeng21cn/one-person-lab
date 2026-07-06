import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'source-module-public-imports.mjs');

test('source module public imports supports help and explicit json format', () => {
  const help = spawnSync(process.execPath, [scriptPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const json = spawnSync(process.execPath, [
    scriptPath,
    '--source-module',
    'atlas',
    '--format',
    'json',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const output = parseJsonText(json.stdout) as any;

  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: node scripts\/source-module-public-imports\.mjs/);
  assert.match(help.stdout, /--format json/);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(output.status, 'ok');
  assert.deepEqual(output.source_modules, ['atlas']);
  assert.equal(Array.isArray(output.changed_files), true);
});
