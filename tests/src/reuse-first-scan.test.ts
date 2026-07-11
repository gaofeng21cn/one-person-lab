import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(repoRoot, 'scripts', 'reuse-first-scan.mjs');

test('reuse-first scan prints help without reading repo contracts', () => {
  const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: node scripts\/reuse-first-scan\.mjs/);
  assert.match(result.stdout, /--diff-ref <ref>/);
  assert.doesNotMatch(result.stdout, /--mode|--format|--summary|--strict/);
  assert.doesNotMatch(result.stdout, /historical-worklist/);
});

test('reuse-first strict diff allows an explicit local exception', (t) => {
  const fixture = makeFixture(t, true);
  writeFixtureFile(
    fixture,
    'src/example.ts',
    'const parsed = JSON.parse("{}"); // reuse-first: allow local fixture parser\n',
  );

  const result = runScan(fixture, ['--diff-ref', 'HEAD']);
  const output = parseJsonText(result.stdout) as any;

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.mode, 'strict_diff');
  assert.equal(output.strict, true);
  assert.equal(output.status, 'ok');
  assert.equal(output.finding_count, 0);
});

test('reuse-first strict diff scans untracked files and blocks hard categories', (t) => {
  const fixture = makeFixture(t, true);
  writeFixtureFile(fixture, 'src/new-boundary.ts', 'const parsed = JSON.parse("{}");\n');

  const result = runScan(fixture, ['--diff-ref', 'HEAD']);
  const output = parseJsonText(result.stdout) as any;
  const finding = output.findings[0];

  assert.equal(result.status, 1);
  assert.equal(output.gate_status, 'hard_fail');
  assert.equal(output.hard_gate_finding_count, 1);
  assert.equal(finding.path, 'src/new-boundary.ts');
  assert.equal(finding.gate_mode, 'hard');
  assert.equal(finding.refusal_or_adoption_decision_required, true);
  assert.equal(typeof finding.mature_module_candidate, 'string');
  assert.match(finding.review_date, /^\d{4}-\d{2}-\d{2}$/);
});

test('reuse-first strict diff scans added lines in tracked files', (t) => {
  const fixture = makeFixture(t, true);
  writeFixtureFile(fixture, 'src/existing.ts', 'export const baseline = true;\n');
  runGit(fixture, ['add', 'src/existing.ts']);
  runGit(fixture, ['commit', '-m', 'tracked baseline']);
  fs.appendFileSync(path.join(fixture, 'src', 'existing.ts'), 'const parsed = JSON.parse("{}");\n');

  const result = runScan(fixture, ['--diff-ref', 'HEAD']);
  const output = parseJsonText(result.stdout) as any;

  assert.equal(result.status, 1);
  assert.equal(output.hard_gate_finding_count, 1);
  assert.equal(output.findings[0].path, 'src/existing.ts');
  assert.equal(output.findings[0].line, 2);
});

test('reuse-first strict diff keeps advisory categories non-blocking', (t) => {
  const fixture = makeFixture(t, true);
  writeFixtureFile(fixture, 'src/new-observability.ts', 'const ledgerName = "evidence_ledger";\n');

  const result = runScan(fixture, ['--diff-ref', 'HEAD']);
  const output = parseJsonText(result.stdout) as any;

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.gate_status, 'advisory_attention');
  assert.equal(output.hard_gate_finding_count, 0);
  assert.equal(output.advisory_finding_count, 1);
  assert.equal(output.findings[0].gate_mode, 'advisory');
});

function makeFixture(t: { after: (fn: () => void) => void }, committed = false) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reuse-first-scan-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const contractDir = path.join(fixture, 'contracts', 'opl-framework');
  fs.mkdirSync(contractDir, { recursive: true });
  const contract = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    'utf8',
  )) as any;
  contract.scan.roots = ['src'];
  fs.writeFileSync(
    path.join(contractDir, 'reuse-first-governance.json'),
    `${JSON.stringify(contract, null, 2)}\n`,
  );
  if (committed) {
    runGit(fixture, ['init']);
    runGit(fixture, ['config', 'user.email', 'test@example.com']);
    runGit(fixture, ['config', 'user.name', 'Test User']);
    runGit(fixture, ['add', 'contracts/opl-framework/reuse-first-governance.json']);
    runGit(fixture, ['commit', '-m', 'baseline']);
  }
  return fixture;
}

function runScan(fixture: string, args: string[] = []) {
  return spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    ...args,
  ], { encoding: 'utf8' });
}

function writeFixtureFile(fixture: string, relativePath: string, body: string) {
  const targetFile = path.join(fixture, relativePath);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, body);
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
