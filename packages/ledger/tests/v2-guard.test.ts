import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runV2ImportGuard } from '../../../scripts/check-v2-import-guard.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function makeTempFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-guard-fixture-'));
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
  }
  return root;
}

test('v2:guard passes on actual opl-v2 worktree', () => {
  const report = runV2ImportGuard({ rootDir: REPO_ROOT });
  assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
  assert.ok(report.coreLineCount > 0 && report.coreLineCount < 3000);
  assert.deepEqual(report.violations, []);
});

test('v2:guard allows boundary-safe SQL identifiers and client kinds in packages/core', () => {
  const fixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/migrations/0001.sql': `
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY);
      CREATE TABLE ledger_entries (entry_id TEXT PRIMARY KEY);
      CREATE TABLE connections (connection_id TEXT PRIMARY KEY);
      CREATE TABLE installed_packages (package_id TEXT PRIMARY KEY, carrier_synced INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE knowledge_sources (scope TEXT CHECK (scope IN ('personal_profile', 'project_local')));
    `,
    'packages/core/src/index.ts': "export const CLIENTS = ['opl_app', 'opl_cli', 'sdk_python', 'external'] as const;\n",
    'packages/ledger/package.json': JSON.stringify({ name: '@opl/ledger', dependencies: { '@opl/core': '2.0.0' } }),
    'packages/ledger/src/index.ts': "import { CLIENTS } from '@opl/core';\nexport { CLIENTS };\n",
  });
  try {
    const report = runV2ImportGuard({ rootDir: fixture });
    assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('v2:guard rejects forbidden tokens, imports, DAG violations, line budgets, and DQS=0 double quotes', () => {
  const badTokenCases = [
    { label: 'codex', text: "export const x = 'codex_synced';\n" },
    { label: 'agy', text: 'export const runAgy = () => 1;\n' },
    { label: 'temporal', text: '// replaced temporal\nexport const x = 1;\n' },
    { label: 'OPL Pack', text: '// OPL Pack comment\nexport const x = 1;\n' },
    { label: 'opl-relay', text: "export const pkg = 'opl-relay';\n" },
    { label: 'MAS', text: "export const id = 'MAS';\n" },
    { label: '@opl/ledger', text: "import { x } from '@opl/ledger';\nexport { x };\n" },
  ];

  for (const tc of badTokenCases) {
    const fixture = makeTempFixture({
      'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
      'packages/core/src/index.ts': tc.text,
    });
    try {
      const report = runV2ImportGuard({ rootDir: fixture });
      assert.equal(report.ok, false, `Expected failure for ${tc.label}`);
      assert.ok(report.violations.length > 0);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }

  // Line budget >= 3000
  const largeFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': 'export const a = 1;\n'.repeat(3000),
  });
  try {
    const report = runV2ImportGuard({ rootDir: largeFixture });
    assert.equal(report.ok, false);
    assert.ok(report.violations.some((v) => v.rule === 'core-line-budget'));
  } finally {
    fs.rmSync(largeFixture, { recursive: true, force: true });
  }

  // DAG violation + legacy src import + DQS=0 SQL violation
  const dagAndSqlFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/migrations/bad.sql': 'CREATE TABLE t (x TEXT DEFAULT "bad");\n',
    'packages/core/src/index.ts': "export const dbSql = 'SELECT \"bad\" FROM t';\n",
    'packages/ledger/package.json': JSON.stringify({
      name: '@opl/ledger',
      dependencies: { '@opl/core': '2.0.0', '@opl/runway': '2.0.0' },
    }),
    'packages/ledger/src/index.ts': "import { x } from '../../../src/legacy.ts';\nexport { x };\n",
  });
  try {
    const report = runV2ImportGuard({ rootDir: dagAndSqlFixture });
    assert.equal(report.ok, false);
    const rules = new Set(report.violations.map((v) => v.rule));
    assert.ok(rules.has('dqs0-sql-double-quote'));
    assert.ok(rules.has('dqs0-ts-sql-double-quote'));
    assert.ok(rules.has('dag-violation-package-json'));
    assert.ok(rules.has('legacy-src-import'));
  } finally {
    fs.rmSync(dagAndSqlFixture, { recursive: true, force: true });
  }
});

test('v2:guard blocks all 6 evasion vectors while permitting safe script test imports and -phagy terms', () => {
  // 1. Static-body template literals + dynamic import/require in packages/core/src
  const templateDynamicFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/a.ts': 'export async function load() { return import(`@opl/daemon`); }\n',
    'packages/core/src/b.ts': 'export async function loadDyn(x: string) { return import(`@opl/${x}`); }\n',
    'packages/core/src/c.ts': 'export function reqDyn(x: string) { return require(x); }\n',
    'packages/ledger/package.json': JSON.stringify({ name: '@opl/ledger', dependencies: { '@opl/core': '2.0.0' } }),
    'packages/ledger/src/evil.ts': 'export const r = require(`@temporalio/worker`);\nexport async function l() { return import(`../../../src/legacy.ts`); }\n',
  });
  try {
    const report = runV2ImportGuard({ rootDir: templateDynamicFixture });
    assert.equal(report.ok, false);
    const byFile = new Map(report.violations.map((v) => [`${v.file}:${v.rule}`, v]));
    assert.ok(byFile.has('packages/core/src/a.ts:core-forbidden-import'));
    assert.ok(byFile.has('packages/core/src/b.ts:core-dynamic-import-forbidden'));
    assert.ok(byFile.has('packages/core/src/c.ts:core-dynamic-import-forbidden'));
    assert.ok(byFile.has('packages/ledger/src/evil.ts:forbidden-legacy-import'));
    assert.ok(byFile.has('packages/ledger/src/evil.ts:legacy-src-import'));
  } finally {
    fs.rmSync(templateDynamicFixture, { recursive: true, force: true });
  }

  // 2. >40-char comment lookbehind evasion (single-line & multi-line)
  const longComment = '/* ' + 'a'.repeat(80) + ' */';
  const commentFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': `
      import { x } from ${longComment} '@opl/daemon';
      export async function f() {
        await import(${longComment} '@opl/ledger');
        return import(
          // ${'b'.repeat(60)}
          '../../../src/legacy.ts'
        );
      }
      export { x };
    `,
  });
  try {
    const report = runV2ImportGuard({ rootDir: commentFixture });
    assert.equal(report.ok, false);
    const rules = report.violations.map((v) => v.rule);
    assert.ok(rules.includes('core-forbidden-import'));
    assert.ok(rules.includes('legacy-src-import'));
  } finally {
    fs.rmSync(commentFixture, { recursive: true, force: true });
  }

  // 3. Expanded SQL_STMT_RE & DQS=0 across all discovered packages/*
  const sqlFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': `
      export const s1 = 'INSERT OR REPLACE INTO tasks (task_id) VALUES ("bad")';
      export const s2 = 'REPLACE INTO tasks (task_id) VALUES ("bad")';
      export const s3 = 'ATTACH DATABASE "evil.db" AS e';
      export const s4 = 'WITH cte AS (SELECT 1) SELECT "bad" FROM cte';
    `,
    'packages/runway/package.json': JSON.stringify({ name: '@opl/runway', dependencies: { '@opl/core': '2.0.0' } }),
    'packages/runway/src/index.ts': `export const badSql = 'INSERT OR IGNORE INTO tasks (task_id) VALUES ("bad")';\n`,
  });
  try {
    const report = runV2ImportGuard({ rootDir: sqlFixture });
    assert.equal(report.ok, false);
    const sqlViolations = report.violations.filter((v) => v.rule === 'dqs0-ts-sql-double-quote');
    assert.equal(sqlViolations.length, 5);
    assert.ok(sqlViolations.some((v) => v.file === 'packages/runway/src/index.ts'));
  } finally {
    fs.rmSync(sqlFixture, { recursive: true, force: true });
  }

  // 4. agy PascalCase/camelCase evasion vs safe -phagy
  const agyFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': `
      export const AgyRunner = 1;
      export const agyClient = 2;
      export const agyRunner = 3;
      export const safeWord = 'autophagy and macrophage strategy';
    `,
  });
  try {
    const report = runV2ImportGuard({ rootDir: agyFixture });
    assert.equal(report.ok, false);
    const agyViolations = report.violations.filter((v) => v.rule.startsWith('core-forbidden-engine-agy'));
    assert.equal(agyViolations.length, 3);
  } finally {
    fs.rmSync(agyFixture, { recursive: true, force: true });
  }

  // 5. Escaping imports in packages/*/tests/ blocked, while scripts/check-v2-import-guard.mjs is allowed
  const testsEscapeFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': 'export const ok = 1;\n',
    'packages/core/tests/escape.test.ts': `
      import { a } from '../../../src/legacy.ts';
      import { b } from '../../../extensions/foundry/index.ts';
      import { c } from '@opl/daemon';
      export { a, b, c };
    `,
    'packages/ledger/package.json': JSON.stringify({ name: '@opl/ledger', dependencies: { '@opl/core': '2.0.0' } }),
    'packages/ledger/src/index.ts': 'export const l = 1;\n',
    'packages/ledger/tests/ok.test.ts': `
      import { runV2ImportGuard } from '../../../scripts/check-v2-import-guard.mjs';
      export { runV2ImportGuard };
    `,
  });
  try {
    const report = runV2ImportGuard({ rootDir: testsEscapeFixture });
    assert.equal(report.ok, false);
    assert.ok(report.violations.some((v) => v.file === 'packages/core/tests/escape.test.ts' && v.rule === 'legacy-src-import'));
    assert.ok(report.violations.some((v) => v.file === 'packages/core/tests/escape.test.ts' && v.rule === 'extensions-import-forbidden'));
    assert.ok(report.violations.some((v) => v.file === 'packages/core/tests/escape.test.ts' && v.rule === 'core-forbidden-import'));
    assert.equal(report.violations.some((v) => v.file === 'packages/ledger/tests/ok.test.ts'), false);
  } finally {
    fs.rmSync(testsEscapeFixture, { recursive: true, force: true });
  }
});

test('v2:guard --strict-m4 rejects any codex token in bin/opl while allowing clean v2 bin/opl', () => {
  const cleanReport = runV2ImportGuard({ rootDir: REPO_ROOT, strictM4: true });
  assert.equal(cleanReport.ok, true, JSON.stringify(cleanReport.violations, null, 2));

  const badBinFixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': 'export const ok = 1;\n',
    'packages/ledger/package.json': JSON.stringify({ name: '@opl/ledger', dependencies: { '@opl/core': '2.0.0' } }),
    'packages/ledger/src/index.ts': 'export const ledgerOk = 1;\n',
    'package.json': JSON.stringify({ name: 'opl-framework', version: '2.0.0', dependencies: {}, scripts: {} }),
    'bin/opl': '#!/usr/bin/env node\nimport { spawn } from "node:child_process";\nspawn("codex", ["--help"]);\n',
  });
  try {
    const report = runV2ImportGuard({ rootDir: badBinFixture, strictM4: true });
    assert.equal(report.ok, false);
    assert.ok(report.violations.some((v) => v.file === 'bin/opl' && v.rule === 'legacy-root-bin-fallback'));
  } finally {
    fs.rmSync(badBinFixture, { recursive: true, force: true });
  }
});
