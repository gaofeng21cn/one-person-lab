import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('repo-tracked verification command surfaces reference valid npm scripts and local test files', () => {
  const files = [
    'AGENTS.md',
    'contracts/opl-gateway/phase-1-exit-activation-package.json',
    'contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json',
    'contracts/opl-gateway/phase-2-central-reference-sync-board.json',
    'contracts/opl-gateway/phase-2-admitted-domain-delta-intake-refresh.json',
    'docs/references/opl-phase2-ecosystem-sync-owner-line.md',
  ];

  const npmRunPattern = /npm run ([a-z0-9:-]+)/gi;
  const localTestPattern = /(tests\/[^\s`'"]+\.(?:ts|mjs))/g;

  for (const relativePath of files) {
    const content = read(relativePath);

    for (const match of content.matchAll(npmRunPattern)) {
      const scriptName = match[1];
      assert.ok(
        packageJson.scripts?.[scriptName],
        `${relativePath} references missing npm script: ${scriptName}`,
      );
    }

    for (const match of content.matchAll(localTestPattern)) {
      const filePath = match[1];
      assert.ok(
        fs.existsSync(path.join(repoRoot, filePath)),
        `${relativePath} references missing test file: ${filePath}`,
      );
    }
  }
});

test('root AGENTS freezes the canonical fast and full verification entrypoints', () => {
  const agents = read('AGENTS.md');

  assert.match(agents, /npm test` and `npm run test:fast` are the default developer smoke slice/);
  assert.match(agents, /`npm run test:full` is the clean-clone verification entrypoint/);
  assert.match(agents, /keep those command surfaces aligned with `package\.json` and the checked-in tests/);
});
