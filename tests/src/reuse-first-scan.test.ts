import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const script = path.join(repoRoot, 'scripts', 'reuse-first-scan.mjs');

test('reuse-first scan prints help without reading repo contracts', () => {
  const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: node scripts\/reuse-first-scan\.mjs/);
  assert.match(result.stdout, /--format <json\|summary>/);
  assert.equal(result.stderr, '');
});

test('reuse-first scan supports explicit json and compact summary output', () => {
  const fixture = makeFixture();
  const targetFile = path.join(fixture, 'src', 'example.ts');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, 'const parsed = JSON.parse("{}");\n');

  const jsonResult = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    '--format',
    'json',
  ], { encoding: 'utf8' });
  const jsonOutput = parseJsonText(jsonResult.stdout) as any;
  const summaryResult = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    '--summary',
  ], { encoding: 'utf8' });
  const summaryOutput = parseJsonText(summaryResult.stdout) as any;

  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  assert.equal(jsonOutput.surface_kind, 'opl_reuse_first_scan');
  assert.equal(jsonOutput.findings.length, 1);
  assert.equal(summaryResult.status, 0, summaryResult.stderr);
  assert.equal(summaryOutput.surface_kind, 'opl_reuse_first_scan_summary');
  assert.equal(summaryOutput.finding_count, 1);
  assert.equal(summaryOutput.returned_finding_count, 0);
  assert.equal(summaryOutput.omitted_finding_count, 1);
  assert.equal('findings' in summaryOutput, false);
});

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
  const output = parseJsonText(result.stdout) as any;

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
  const output = parseJsonText(result.stdout) as any;

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
  const output = parseJsonText(result.stdout) as any;

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
  const output = parseJsonText(result.stdout) as any;
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
  const output = parseJsonText(result.stdout) as any;

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
      {
        id: 'owner-decision-boundary',
        status: 'owner_decision_required',
        categories: ['handwritten_json_boundary'],
        path_prefixes: ['src/owner'],
        owner: 'OPL Owner',
        phase: 'Phase 2',
        action: 'decide_boundary_owner',
        expiry: '2026-10-31',
        decision_ref: 'test#owner-decision-boundary',
      },
      {
        id: 'projection-boundary',
        status: 'allowed_projection_boundary',
        categories: ['handwritten_json_boundary'],
        path_prefixes: ['src/projection'],
        owner: 'OPL Projection',
        phase: 'Phase 10',
        action: 'keep_projection_boundary',
        expiry: '2026-12-31',
        decision_ref: 'test#projection-boundary',
      },
    ],
    residualReadback: {
      owner_route_worklist: [
        {
          id: 'external_temporal_durable_lifecycle',
          status: 'owner_live_evidence_required',
          owner: 'OPL Runway Runtime',
        },
        {
          id: 'already-routed-tail',
          status: 'owner_accepted',
          owner: 'OPL Domain Owner',
        },
      ],
      completion_readback_rules: [
        'owner-live evidence remains open until owner receipt, typed blocker, or route-back evidence exists',
      ],
    },
    ownerLivePreflight: {
      current_evidence_available: false,
      open_item_count: 2,
      claim_boundary: {
        can_claim_runtime_ready: false,
        can_claim_release_ready: false,
        can_claim_production_ready: false,
        can_claim_domain_ready: false,
        can_claim_owner_acceptance: false,
      },
      fresh_evidence_audit_2026_07_05: {
        audit_result: 'no_owner_live_evidence_found',
        items: [
          {
            id: 'external_temporal_durable_lifecycle',
            evidence_found: false,
          },
          {
            id: 'app_release_owner_route',
            evidence_found: false,
          },
        ],
        claim_boundary: {
          can_mark_preflight_closed: false,
        },
      },
    },
  });
  writeFixtureFile(fixture, 'src/known/example.ts', 'const parsed = JSON.parse("{}");\n');
  writeFixtureFile(fixture, 'src/runtime/queue.ts', 'const ddl = "CREATE TABLE IF NOT EXISTS tasks";\n');
  writeFixtureFile(fixture, 'src/owner/boundary.ts', 'const parsed = JSON.parse("{}");\n');
  writeFixtureFile(fixture, 'src/projection/boundary.ts', 'const parsed = JSON.parse("{}");\n');
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
  const output = parseJsonText(result.stdout) as any;
  const summary = output.historical_decision_summary;

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.gate_status, 'hard_fail');
  assert.equal(output.finding_count, 5);
  assert.equal(output.total_finding_count, 5);
  assert.equal(output.open_worklist_finding_count, 4);
  assert.equal(output.blocking_worklist_finding_count, 3);
  assert.equal(output.allowed_projection_finding_count, 1);
  assert.equal(output.accepted_migration_worklist_finding_count, 1);
  assert.equal(output.must_migrate_finding_count, 1);
  assert.equal(output.owner_decision_required_finding_count, 1);
  assert.equal(output.undecisioned_finding_count, 1);
  assert.equal(output.owner_route_worklist_count, 2);
  assert.equal(output.owner_live_evidence_required_count, 1);
  assert.equal(output.owner_route_open_count, 1);
  assert.equal(output.owner_live_preflight_open_item_count, 2);
  assert.equal(output.owner_live_preflight_current_evidence_available, false);
  assert.equal(output.owner_live_preflight_can_claim_runtime_ready, false);
  assert.equal(output.owner_live_preflight_can_claim_release_ready, false);
  assert.equal(output.owner_live_preflight_can_claim_production_ready, false);
  assert.equal(output.owner_live_preflight_can_claim_domain_ready, false);
  assert.equal(output.owner_live_preflight_can_claim_owner_acceptance, false);
  assert.equal(output.owner_live_evidence_audit_result, 'no_owner_live_evidence_found');
  assert.equal(output.owner_live_evidence_audit_item_count, 2);
  assert.equal(output.owner_live_evidence_found_count, 0);
  assert.equal(output.owner_live_evidence_audit_can_mark_preflight_closed, false);
  assert.equal(output.residual_readback.owner_route_worklist_count, 2);
  assert.equal(output.residual_readback.owner_live_evidence_required_count, 1);
  assert.equal(output.residual_readback.owner_route_open_count, 1);
  assert.equal(output.returned_finding_count, 0);
  assert.equal(summary.applied, true);
  assert.equal(summary.finding_count, 5);
  assert.equal(summary.total_finding_count, 5);
  assert.equal(summary.open_worklist_finding_count, 4);
  assert.equal(summary.blocking_worklist_finding_count, 3);
  assert.equal(summary.allowed_projection_finding_count, 1);
  assert.equal(summary.accepted_migration_worklist_finding_count, 1);
  assert.equal(summary.must_migrate_finding_count, 1);
  assert.equal(summary.owner_decision_required_finding_count, 1);
  assert.equal(summary.owner_route_worklist_count, 2);
  assert.equal(summary.owner_live_evidence_required_count, 1);
  assert.equal(summary.owner_route_open_count, 1);
  assert.equal(summary.owner_live_preflight_open_item_count, 2);
  assert.equal(summary.owner_live_preflight_current_evidence_available, false);
  assert.equal(summary.owner_live_preflight_can_claim_runtime_ready, false);
  assert.equal(summary.owner_live_preflight_can_claim_release_ready, false);
  assert.equal(summary.owner_live_preflight_can_claim_production_ready, false);
  assert.equal(summary.owner_live_preflight_can_claim_domain_ready, false);
  assert.equal(summary.owner_live_preflight_can_claim_owner_acceptance, false);
  assert.equal(summary.owner_live_evidence_audit_result, 'no_owner_live_evidence_found');
  assert.equal(summary.owner_live_evidence_audit_item_count, 2);
  assert.equal(summary.owner_live_evidence_found_count, 0);
  assert.equal(summary.owner_live_evidence_audit_can_mark_preflight_closed, false);
  assert.equal(summary.residual_readback.owner_route_worklist_count, 2);
  assert.equal(summary.decisioned_finding_count, 4);
  assert.equal(summary.undecisioned_finding_count, 1);
  assertSummaryCount(summary.by_decision_status, 'accepted_migration_worklist', 1);
  assertSummaryCount(summary.by_decision_status, 'must_migrate', 1);
  assertSummaryCount(summary.by_decision_status, 'owner_decision_required', 1);
  assertSummaryCount(summary.by_decision_status, 'allowed_projection_boundary', 1);
  assertSummaryCount(summary.by_decision_status, 'undecisioned', 1);
  assertSummaryCount(summary.by_category, 'handwritten_json_boundary', 4);
  assertSummaryCount(summary.by_path_prefix, 'src/known', 1);
  assertSummaryCount(summary.by_path_prefix, 'src/runtime', 1);
  assertSummaryCount(summary.by_path_prefix, 'src/owner', 1);
  assertSummaryCount(summary.by_path_prefix, 'src/projection', 1);
  assertSummaryCount(summary.by_path_prefix, 'src/unknown.ts', 1);
  assert.ok(summary.false_ready_guard.includes('worklist decision is not risk eliminated'));
});

test('reuse-first strict full scan does not block on allowed historical projections', () => {
  const fixture = makeFixture();
  writeHistoricalWorklist(fixture, {
    items: [
      {
        id: 'shared-json-boundary',
        status: 'allowed_projection_boundary',
        categories: ['handwritten_json_boundary'],
        path_prefixes: ['src/kernel'],
        owner: 'OPL Schema',
        phase: 'Phase 1',
        action: 'keep_shared_boundary',
        expiry: '2026-12-31',
        decision_ref: 'test#shared-json-boundary',
      },
    ],
  });
  writeFixtureFile(fixture, 'src/kernel/json.ts', 'const parsed = JSON.parse("{}");\n');

  const result = spawnSync(process.execPath, [
    script,
    '--root',
    fixture,
    '--contract',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-governance.json'),
    '--historical-worklist',
    path.join(fixture, 'contracts', 'opl-framework', 'reuse-first-historical-worklist.json'),
    '--strict',
  ], { encoding: 'utf8' });
  const output = parseJsonText(result.stdout) as any;

  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.gate_status, 'advisory_attention');
  assert.equal(output.finding_count, 1);
  assert.equal(output.hard_gate_finding_count, 1);
  assert.equal(output.allowed_projection_finding_count, 1);
  assert.equal(output.open_worklist_finding_count, 0);
  assert.equal(output.blocking_worklist_finding_count, 0);
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
  const output = parseJsonText(result.stdout) as any;

  assert.equal(result.status, 1);
  assert.equal(output.gate_status, 'hard_fail');
  assert.equal(output.historical_decision_summary.applied, false);
  assert.match(output.historical_decision_summary.reason, /diff gate ignores historical worklist/);
  assert.equal(output.residual_readback, undefined);
  assert.equal(output.owner_route_worklist_count, undefined);
  assert.equal(output.owner_live_preflight_open_item_count, undefined);
  assert.equal(output.owner_live_evidence_audit_result, undefined);
  assert.equal(output.historical_decision_summary.owner_live_preflight_open_item_count, undefined);
  assert.equal(output.historical_decision_summary.owner_live_evidence_audit_result, undefined);
  assert.equal(output.findings[0].historical_decision, undefined);
});

function makeFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-reuse-first-scan-'));
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
  return fixture;
}

function writeHistoricalWorklist(
  fixture: string,
  overrides: {
    items: Array<Record<string, unknown>>;
    residualReadback?: Record<string, unknown>;
    ownerLivePreflight?: Record<string, unknown>;
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
      ...(overrides.residualReadback
        ? { residual_readback_2026_07_05: overrides.residualReadback }
        : {}),
      ...(overrides.ownerLivePreflight
        ? { owner_live_evidence_preflight_2026_07_05: overrides.ownerLivePreflight }
        : {}),
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
