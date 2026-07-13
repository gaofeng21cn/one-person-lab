import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('whitepaper publication deploys the approved artifact and closes with exact-byte readback', () => {
  const reusable = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'reusable-whitepaper.yml'), 'utf8');
  assert.match(reusable, /environment: whitepaper-production/);
  assert.match(reusable, /actions\/download-artifact@/);
  assert.match(reusable, /verify-whitepaper-publication\.ts/);
  assert.match(reusable, /git -C site push origin gh-pages/);
  assert.doesNotMatch(reusable, /checkout --orphan|push .*--force/);
});

test('local publish entry requests the governed workflow instead of mutating gh-pages', () => {
  const publish = fs.readFileSync(path.join(repoRoot, 'scripts', 'publish-docs-latest.sh'), 'utf8');
  assert.match(publish, /HEAD == origin\/main/);
  assert.match(publish, /gh workflow run whitepaper\.yml/);
  assert.doesNotMatch(publish, /worktree add|checkout --orphan|push .*--force/);
});
