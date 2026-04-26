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
    'docs/references/family-shared-release-maintenance.md',
    'contracts/opl-gateway/phase-1-exit-activation-package.json',
    'contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json',
    'contracts/opl-gateway/phase-2-central-reference-sync-board.json',
    'contracts/opl-gateway/phase-2-admitted-domain-delta-intake-refresh.json',
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

test('scripts/verify.sh provides the canonical verification wrapper', () => {
  const verifyScript = read('scripts/verify.sh');

  assert.match(verifyScript, /node scripts\/line-budget\.mjs/);
  assert.equal(
    (verifyScript.match(/node scripts\/line-budget\.mjs/g) ?? []).length,
    1,
  );
  assert.match(verifyScript, /npm test/);
  assert.match(verifyScript, /npm run family:shared-release -- check/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_family_shared_release\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_dependency_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_launcher\.py/);
  assert.match(verifyScript, /npm run test:meta/);
  assert.match(verifyScript, /npm run test:artifact/);
  assert.match(verifyScript, /npm run test:full/);
  assert.match(verifyScript, /npm run native:doctor/);
  assert.match(verifyScript, /npm run native:prebuild-check/);
  assert.match(verifyScript, /npm run native:pack-check/);
  assert.match(verifyScript, /npm run native:test/);
  assert.match(verifyScript, /npm run native:build/);
  assert.match(verifyScript, /npm run native:cache/);
  assert.match(verifyScript, /npm run native:family-smoke/);
  assert.match(verifyScript, /smoke\|fast\|family\|meta\|artifact\|native\|full\|lint\|line-budget\|typecheck/);
});

test('lint includes the tracked code line-budget guard', () => {
  assert.equal(packageJson.scripts?.lint, 'node ./scripts/lint.mjs && node ./scripts/line-budget.mjs');
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/line-budget.mjs')), true);
});

test('test:full delegates to the parallel test lane wrapper', () => {
  const script = read('scripts/run-parallel-test-lanes.sh');

  assert.equal(packageJson.scripts?.['test:full'], './scripts/run-parallel-test-lanes.sh full');
  assert.match(script, /Usage: \$0 full/);
  assert.match(script, /"test:fast"/);
  assert.match(script, /"test:meta"/);
  assert.match(script, /"test:artifact"/);
  assert.match(script, /npm run "\$\{lane\}"/);
});

test('package.json exposes the canonical family shared release maintenance command', () => {
  assert.equal(packageJson.scripts?.['family:shared-release'], 'node ./scripts/family-shared-release.mjs');
  assert.equal(packageJson.exports?.['./family-shared-release'], './dist/family-shared-release.js');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/family-shared-release.mjs')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/family-shared-release.ts')),
    true,
  );
});

test('package.json exposes native helper gate scripts and package dry-run check', () => {
  assert.equal(packageJson.scripts?.['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
  assert.equal(packageJson.scripts?.['native:prebuild'], 'node ./scripts/native-helper-prebuild.mjs install');
  assert.equal(packageJson.scripts?.['native:prebuild-pack'], 'node ./scripts/native-helper-prebuild.mjs pack');
  assert.equal(packageJson.scripts?.['native:prebuild-check'], 'node ./scripts/native-helper-prebuild.mjs check');
  assert.equal(packageJson.scripts?.['native:pack-check'], 'node ./scripts/native-helper-pack-check.mjs');
  assert.equal(packageJson.scripts?.['native:test'], 'cargo test --workspace');
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-prebuild.mjs')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-pack-check.mjs')), true);
});

test('package.json exposes the native MAS/MAG family indexing smoke command', () => {
  assert.equal(packageJson.scripts?.['native:family-smoke'], 'node ./scripts/native-helper-family-smoke.mjs');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/native-helper-family-smoke.mjs')),
    true,
  );
});
