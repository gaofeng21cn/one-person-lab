import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'family-structure-advisory.mjs');

test('family structure advisory classifies tracked structural risks without failing the lane', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-structure-advisory-'));
  try {
    run('git', ['init'], fixtureRoot);
    run('git', ['config', 'user.email', 'test@example.invalid'], fixtureRoot);
    run('git', ['config', 'user.name', 'Test User'], fixtureRoot);

    writeLines(fixtureRoot, 'src/product_entry_parts/manifest_builder.py', 860);
    writeLines(fixtureRoot, 'src/part_001.py', 12);
    writeLines(fixtureRoot, 'src/shared.py', 610);
    writeLines(fixtureRoot, 'schemas/v1/public.schema.json', 1005);
    writeLines(fixtureRoot, 'src/vendor/generated.ts', 1500);

    run('git', ['add', '.'], fixtureRoot);

    const result = spawnSync(
      process.execPath,
      [scriptPath, '--repo', `fixture=${fixtureRoot}`, '--format=json'],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.advisory_only, true);

    const fixture = report.repositories[0];
    assert.equal(fixture.repo, 'fixture');
    assert.equal(fixture.summary.missing_verify_entry, true);
    assert.deepEqual(
      fixture.categories.needs_design_pass.map((finding: { path: string }) => finding.path),
      ['src/product_entry_parts/manifest_builder.py'],
    );
    assert.deepEqual(
      fixture.categories.mechanical_residue.map((finding: { path: string }) => finding.path),
      ['src/part_001.py'],
    );
    assert.deepEqual(
      fixture.categories.public_surface_risk.map((finding: { path: string }) => finding.path).sort(),
      ['schemas/v1/public.schema.json', 'src/shared.py'],
    );
    assert.deepEqual(
      fixture.categories.safe_to_keep.map((finding: { path: string }) => finding.path),
      ['src/vendor/generated.ts'],
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package exposes the family structure advisory command and tracked report', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts?.['family:structure-advisory'], 'node ./scripts/family-structure-advisory.mjs');
  assert.equal(fs.existsSync(scriptPath), true);
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'docs/references/operating-governance/family-structure-advisory-report.md')),
    true,
  );
});

function writeLines(root: string, relativePath: string, lines: number) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    Array.from({ length: lines }, (_, index) => `line_${index + 1} = ${index + 1}`).join('\n'),
  );
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
