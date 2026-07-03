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

test('reuse-first strict diff fails only hard gate categories with decision metadata', () => {
  const fixture = makeCommittedFixture();
  const targetFile = path.join(fixture, 'src', 'new-schema-boundary.ts');
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
    '--strict',
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);
  const finding = output.findings[0];

  assert.equal(result.status, 1);
  assert.equal(output.gate_status, 'hard_fail');
  assert.equal(output.hard_gate_finding_count, 1);
  assert.equal(output.advisory_finding_count, 0);
  assert.equal(finding.gate_mode, 'hard');
  assert.ok(finding.risk_categories.includes('private_schema_validator'));
  assert.equal(finding.refusal_or_adoption_decision_required, true);
  assert.equal(typeof finding.mature_module_candidate, 'string');
  assert.equal(typeof finding.owner, 'string');
  assert.match(finding.review_date, /^\d{4}-\d{2}-\d{2}$/);
});

test('reuse-first strict diff keeps advisory categories non-blocking', () => {
  const fixture = makeCommittedFixture();
  const targetFile = path.join(fixture, 'src', 'new-observability.ts');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, 'const ledgerName = "evidence_ledger";\n');

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
    '--strict',
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.gate_status, 'advisory_attention');
  assert.equal(output.hard_gate_finding_count, 0);
  assert.equal(output.advisory_finding_count, 1);
  assert.equal(output.findings[0].gate_mode, 'advisory');
  assert.ok(output.findings[0].risk_categories.includes('observability_ledger'));
});

test('reuse-first full scan reports historical decision worklist summary', () => {
  const fixture = makeFixture();
  writeHistoricalWorklist(fixture, {
    items: [
      {
        id: 'known-json-boundary',
        status: 'accepted_migration_worklist',
        categories: ['handwritten_json_boundary'],
        path_prefixes: ['src/known'],
        owner: 'OPL Schema',
        phase: 'Phase 1',
        action: 'migrate_to_schema_registry',
        expiry: '2026-09-30',
        decision_ref: 'test#known-json-boundary',
      },
      {
        id: 'runtime-queue-boundary',
        status: 'must_migrate',
        categories: ['custom_runtime_queue'],
        path_prefixes: ['src/runtime'],
        owner: 'OPL Runtime',
        phase: 'Phase 4',
        action: 'move_to_temporal',
        expiry: '2026-09-30',
        decision_ref: 'test#runtime-queue-boundary',
      },
    ],
  });
  writeFixtureFile(fixture, 'src/known/example.ts', 'const parsed = JSON.parse("{}");\n');
  writeFixtureFile(fixture, 'src/runtime/queue.ts', 'const ddl = "CREATE TABLE IF NOT EXISTS tasks";\n');
  writeFixtureFile(fixture, 'src/unknown.ts', 'const parsed = JSON.parse("{}");\n');

  const result = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    '--historical-worklist',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-historical-worklist.json'),
    '--max-findings=0',
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);
  const summary = output.historical_decision_summary;

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.finding_count, 3);
  assert.equal(output.returned_finding_count, 0);
  assert.equal(summary.applied, true);
  assert.equal(summary.finding_count, 3);
  assert.equal(summary.decisioned_finding_count, 2);
  assert.equal(summary.undecisioned_finding_count, 1);
  assertSummaryCount(summary.by_decision_status, 'accepted_migration_worklist', 1);
  assertSummaryCount(summary.by_decision_status, 'must_migrate', 1);
  assertSummaryCount(summary.by_decision_status, 'undecisioned', 1);
  assertSummaryCount(summary.by_category, 'handwritten_json_boundary', 2);
  assertSummaryCount(summary.by_path_prefix, 'src/known', 1);
  assertSummaryCount(summary.by_path_prefix, 'src/runtime', 1);
  assertSummaryCount(summary.by_path_prefix, 'src/unknown.ts', 1);
  assert.ok(summary.false_ready_guard.includes('worklist decision is not risk eliminated'));
});

test('reuse-first diff gate ignores broad historical worklist decisions', () => {
  const fixture = makeCommittedFixture();
  writeHistoricalWorklist(fixture, {
    items: [
      {
        id: 'broad-src-allowance',
        status: 'allowed_projection_boundary',
        categories: ['handwritten_json_boundary'],
        path_prefixes: ['src'],
        owner: 'OPL Test',
        phase: 'Phase 10',
        action: 'classify_historical_only',
        expiry: '2026-12-31',
        decision_ref: 'test#broad-src-allowance',
      },
    ],
  });
  writeFixtureFile(fixture, 'src/new-boundary.ts', 'const parsed = JSON.parse("{}");\n');

  const result = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    '--historical-worklist',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-historical-worklist.json'),
    '--mode',
    'diff',
    '--diff-ref',
    'HEAD',
    '--strict',
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(output.gate_status, 'hard_fail');
  assert.equal(output.historical_decision_summary.applied, false);
  assert.match(output.historical_decision_summary.reason, /diff gate ignores historical worklist/);
  assert.equal(output.findings[0].historical_decision, undefined);
});

test('reuse-first scan allows update rollback only as command registry metadata', () => {
  const fixture = makeFixture();
  const contractPath = path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.scan.roots = ['contracts'];
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  writeFixtureFile(
    fixture,
    'contracts/opl-framework/cli-command-registry.json',
    '{ "required_command_ids": ["update rollback"] }\n',
  );
  writeFixtureFile(fixture, 'contracts/other/update-contract.json', '{ "command": "update rollback" }\n');

  const result = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    contractPath,
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.finding_count, 1);
  assert.equal(output.findings[0].path, 'contracts/other/update-contract.json');
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

function writeHistoricalWorklist(
  fixture: string,
  overrides: {
    items: Array<Record<string, unknown>>;
  },
) {
  const contractDir = path.join(fixture, 'contracts', 'opl-framework');
  fs.mkdirSync(contractDir, { recursive: true });
  fs.writeFileSync(
    path.join(contractDir, 'reuse-first-historical-worklist.json'),
    `${JSON.stringify({
      contract_kind: 'opl_reuse_first_historical_worklist.v1',
      surface_kind: 'opl_reuse_first_historical_worklist',
      owner: 'one-person-lab',
      purpose: 'Test historical reuse-first worklist.',
      state: 'active_contract',
      machine_boundary: 'Historical classification only.',
      default_owner: 'OPL Governance',
      decision_statuses: [
        'undecisioned',
        'accepted_migration_worklist',
        'allowed_projection_boundary',
        'must_migrate',
        'owner_decision_required',
      ],
      false_ready_guard: [
        'worklist decision is not risk eliminated',
        'worklist decision is not release ready',
      ],
      items: overrides.items,
    }, null, 2)}\n`,
  );
}

function writeFixtureFile(fixture: string, relativePath: string, body: string) {
  const targetFile = path.join(fixture, relativePath);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, body);
}

function assertSummaryCount(
  rows: Array<{ key: string; finding_count: number }>,
  key: string,
  expectedCount: number,
) {
  const row = rows.find((entry) => entry.key === key);
  assert.equal(row?.finding_count, expectedCount);
}

function makeCommittedFixture() {
  const fixture = makeFixture();
  runGit(fixture, ['init']);
  runGit(fixture, ['config', 'user.email', 'test@example.com']);
  runGit(fixture, ['config', 'user.name', 'Test User']);
  runGit(fixture, ['add', 'contracts/opl-framework/reuse-first-governance.json']);
  runGit(fixture, ['commit', '-m', 'baseline']);
  return fixture;
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
