import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('whitepaper publication deploys one complete family artifact and closes with complete public readback', () => {
  const reusable = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'reusable-whitepaper.yml'), 'utf8');
  const entry = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'whitepaper.yml'), 'utf8');
  assert.match(entry, /schedule:/);
  assert.match(entry, /repository: gaofeng21cn\/one-person-lab-app/);
  assert.match(entry, /repository: gaofeng21cn\/one-person-lab-cloud/);
  assert.match(entry, /repository: gaofeng21cn\/med-autoscience/);
  assert.match(entry, /repository: gaofeng21cn\/opl-flow/);
  assert.match(entry, /npm run docs:whitepapers:family/);
  assert.match(entry, /stage-family-whitepaper-artifact\.ts/);
  assert.match(entry, /environment: whitepaper-production/);
  assert.match(entry, /needs: build-family/);
  assert.match(entry, /rsync -a --delete artifact\/whitepapers\/ site\/latest\/whitepapers\//);
  assert.match(entry, /verify-family-whitepaper-publication\.ts/);
  assert.match(entry, /git -C site push origin gh-pages/);
  assert.doesNotMatch(entry, /checkout --orphan|push .*--force/);
  assert.match(reusable, /Reusable Whitepaper Build/);
  assert.doesNotMatch(reusable, /\n  publish:\n/);
  assert.doesNotMatch(reusable, /environment: whitepaper-production/);
});

test('local publish entry requests the governed workflow instead of mutating gh-pages', () => {
  const publish = fs.readFileSync(path.join(repoRoot, 'scripts', 'publish-docs-latest.sh'), 'utf8');
  assert.match(publish, /HEAD == origin\/main/);
  assert.match(publish, /gh workflow run whitepaper\.yml/);
  assert.doesNotMatch(publish, /worktree add|checkout --orphan|push .*--force/);
});
