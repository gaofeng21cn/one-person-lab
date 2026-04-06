import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');

function runBuiltCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('built cli lists admitted workstreams', () => {
  const output = runBuiltCli(['list-workstreams']);

  assert.equal(output.version, 'g2');
  assert.deepEqual(
    output.workstreams.map((entry) => entry.workstream_id),
    ['research_ops', 'presentation_ops'],
  );
});

test('built cli resolves presentation delivery to redcube', () => {
  const output = runBuiltCli([
    'resolve-request-surface',
    '--intent',
    'presentation_delivery',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a defense-ready slide deck for a thesis committee.',
  ]);

  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.workstream_id, 'presentation_ops');
  assert.equal(output.resolution.domain_id, 'redcube');
});
