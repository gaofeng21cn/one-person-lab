import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const script = path.join(repoRoot, 'scripts', 'reuse-first-scan.mjs');

test('reuse-first scan reports hand-written boundary candidates without failing advisory mode', () => {
  const fixture = makeFixture();
  const targetFile = path.join(fixture, 'src', 'example.ts');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, [
    'function isRecord(value: unknown) {',
    '  return typeof value === "object";',
    '}',
    '',
  ].join('\n'));

  const result = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.status, 'attention');
  assert.equal(output.finding_count, 1);
  assert.equal(output.returned_finding_count, 1);
  assert.equal(output.findings[0].category, 'handwritten_json_boundary');
});

test('reuse-first scan allows explicit local exceptions', () => {
  const fixture = makeFixture();
  const targetFile = path.join(fixture, 'src', 'example.ts');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, [
    'const parsed = JSON.parse("{}"); // reuse-first: allow local fixture parser',
    '',
  ].join('\n'));

  const result = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.status, 'ok');
  assert.equal(output.finding_count, 0);
});

test('reuse-first diff scan includes untracked files', () => {
  const fixture = makeFixture();
  runGit(fixture, ['init']);
  runGit(fixture, ['config', 'user.email', 'test@example.com']);
  runGit(fixture, ['config', 'user.name', 'Test User']);
  runGit(fixture, ['add', 'contracts/opl-framework/reuse-first-governance.json']);
  runGit(fixture, ['commit', '-m', 'baseline']);
  const targetFile = path.join(fixture, 'src', 'new-boundary.ts');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, 'const parsed = JSON.parse("{}");\n');

  const result = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    '--mode',
    'diff',
    '--diff-ref',
    'HEAD',
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.finding_count, 1);
  assert.equal(output.findings[0].path, 'src/new-boundary.ts');
});

function makeFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reuse-first-scan-'));
  const contractDir = path.join(fixture, 'contracts', 'opl-framework');
  fs.mkdirSync(contractDir, { recursive: true });
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    'utf8',
  ));
  contract.scan.roots = ['src'];
  fs.writeFileSync(
    path.join(contractDir, 'reuse-first-governance.json'),
    `${JSON.stringify(contract, null, 2)}\n`,
  );
  return fixture;
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
