import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(repoRoot, 'scripts', 'build-opl-family-whitepapers.ts');

test('family whitepaper registry exposes the complete four-document release set', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', runner, '--list'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { whitepapers: Array<Record<string, unknown>> };
  assert.deepEqual(output.whitepapers.map(({ id }) => id), ['opl-framework', 'opl-app', 'opl-cloud', 'mas']);
  assert.equal(new Set(output.whitepapers.map(({ repo_root }) => repo_root)).size, 4);
  assert.ok(output.whitepapers.every(({ profile }) => profile === 'contracts/whitepaper_profile.json'));
  assert.ok(output.whitepapers.every((entry) => !('source' in entry) && !('watch_paths' in entry)));
});
