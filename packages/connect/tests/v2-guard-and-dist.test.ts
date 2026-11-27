import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runV2ImportGuard } from '../../../scripts/check-v2-import-guard.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function makeTempFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-v2-guard-'));
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
  }
  return root;
}

test('v2:guard passes on opl-v2 worktree with @opl/connect registered in DAG', () => {
  const report = runV2ImportGuard({ rootDir: REPO_ROOT });
  assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
  for (const pkg of ['connect', 'core', 'ledger']) {
    assert.ok(report.packagesChecked.includes(pkg), `Missing ${pkg} in packagesChecked`);
  }
  assert.ok(report.dagEdges.includes('connect -> core'));
  assert.ok(report.dagEdges.includes('connect -> ledger'));
  assert.deepEqual(report.violations, []);
});

test('packages/connect/src contains zero Cordis, legacy src/, or hardcoded domain package IDs', () => {
  const connectSrcDir = path.join(REPO_ROOT, 'packages', 'connect', 'src');
  const forbiddenPatterns = [
    /@deepseek-ai\/cordis/,
    /@temporalio\//,
    /canonical_codex_app_server/,
    /opl-channel-weixin/,
    /opl-relay/,
    /opl-framework/,
    /codex:selected_provider/,
    /env:[A-Z_]/,
  ];
  const stack = [connectSrcDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && full.endsWith('.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        for (const pat of forbiddenPatterns) {
          assert.equal(pat.test(text), false, `Forbidden pattern ${pat} found in ${full}`);
        }
      }
    }
  }
});

test('v2:guard M1.2 Caveat #2 hardening catches regex/template desyncs, shorthand ATTACH, and non-core dynamic imports', () => {
  const fixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': 'export const ok = 1;\n',
    'packages/connect/package.json': JSON.stringify({
      name: '@opl/connect',
      version: '2.0.0',
      dependencies: { '@opl/core': '2.0.0', '@opl/ledger': '2.0.0' },
    }),
    'packages/connect/src/index.ts': `
      export const re = /['"]/g;
      export const s1 = 'SELECT "bad_after_regex" FROM connections';
      export const braceTpl = \`\${'{'}\`;
      export const s2 = 'SELECT "bad_after_brace_tpl" FROM connections';
      export const s3 = 'ATTACH "evil.db" AS e';
      export const proseOk = 'attach "readme" without alias';
      export async function loadDyn(x: string) {
        return import(x);
      }
    `,
    'packages/ledger/package.json': JSON.stringify({
      name: '@opl/ledger',
      version: '2.0.0',
      dependencies: { '@opl/core': '2.0.0' },
    }),
    'packages/ledger/src/index.ts': 'export const l = 1;\n',
  });

  try {
    const report = runV2ImportGuard({ rootDir: fixture });
    assert.equal(report.ok, false);
    const sqlViolations = report.violations.filter((v) => v.rule === 'dqs0-ts-sql-double-quote');
    assert.equal(sqlViolations.length, 3, JSON.stringify(report.violations, null, 2));
    const dynViolations = report.violations.filter((v) => v.rule === 'dynamic-import-forbidden');
    assert.equal(dynViolations.length, 1);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('compiled dist/ ESM entrypoints resolve cleanly for @opl/connect', async () => {
  const distIndex = path.join(REPO_ROOT, 'packages', 'connect', 'dist', 'index.js');
  const distDts = path.join(REPO_ROOT, 'packages', 'connect', 'dist', 'index.d.ts');
  assert.equal(fs.existsSync(distIndex), true);
  assert.equal(fs.existsSync(distDts), true);

  const mod = (await import('@opl/connect')) as Record<string, unknown>;
  assert.equal(typeof mod.createConnectService, 'function');
  assert.equal(typeof mod.EncryptedFileSecretVault, 'function');
  assert.equal(typeof mod.ChannelProviderHost, 'function');
});

test('v2:guard rejects script imports of workspace package internals', t => {
  const fixture = makeTempFixture({
    'scripts/direct.mjs': "import { read } from '../packages/pack/src/read.ts';",
    'scripts/nested/lazy.ts': "export const load = () => import('../../packages/core/src/paths.ts');",
    'scripts/public.js': "export { read } from '@opl/pack';",
  });
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const violations = runV2ImportGuard({ rootDir: fixture }).violations
    .filter(violation => violation.rule === 'script-package-internal-import');
  assert.deepEqual(violations.map(violation => violation.file), ['scripts/direct.mjs', 'scripts/nested/lazy.ts']);
});

test('v2:guard tokenizeTsForImports handles regex literals and nested templates inside ${...} without desync', () => {
  const fixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': 'export const ok = 1;\n',
    'packages/connect/package.json': JSON.stringify({
      name: '@opl/connect',
      version: '2.0.0',
      dependencies: { '@opl/core': '2.0.0' },
    }),
    'packages/connect/src/regex-template.ts': `
      export const cleaned = \`\${'abc'.replace(/['"]/g, '')}\`;
      import { forbiddenA } from '@opl/runway';
      export { forbiddenA };
    `,
    'packages/connect/src/nested-template.ts': `
      export const nested = \`\${\`inner \${'\`'}\`}\`;
      export * from '@opl/runway';
      export const dyn = (p: string) => \`\${import(p)}\`;
    `,
  });

  try {
    const report = runV2ImportGuard({ rootDir: fixture });
    assert.equal(report.ok, false);
    const dagImports = report.violations.filter((v) => v.rule === 'dag-violation-import');
    assert.equal(dagImports.length, 2, JSON.stringify(report.violations, null, 2));
    const dynImports = report.violations.filter((v) => v.rule === 'dynamic-import-forbidden');
    assert.equal(dynImports.length, 1, JSON.stringify(report.violations, null, 2));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('v2:guard handles control-flow ) regexes and ASI newline regexes without hiding DAG or DQS=0 violations', () => {
  const fixture = makeTempFixture({
    'packages/core/package.json': JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    'packages/core/src/index.ts': 'export const ok = 1;\n',
    'packages/connect/package.json': JSON.stringify({
      name: '@opl/connect',
      version: '2.0.0',
      dependencies: { '@opl/core': '2.0.0' },
    }),
    'packages/connect/src/control-flow-regex.ts': `
      export function check(cond: boolean, s: string) {
        if (cond) /['"]/g.test(s);
        while (false) /['"]/g.test(s);
        if ((1 + 2) / 3 > 0) /['"]/g.test(s);
      }
      import { badAfterControlFlow } from '@opl/runway';
      export const sqlBadA = 'SELECT "bad_after_if_regex" FROM connections';
      export { badAfterControlFlow };
    `,
    'packages/connect/src/asi-newline-regex.ts': `
      const b = 'abc'
      /['"]/g.test(b)
      import { badAfterAsi } from '@opl/runway';
      export const sqlBadB = 'SELECT "bad_after_asi_regex" FROM connections';
      export { badAfterAsi };
    `,
    'packages/connect/src/multiline-division.ts': `
      export function divide(a: number, b: number, c: number) {
        const x = a
          / b;
        const y = a
          / b / c;
        return x + y;
      }
      export const sqlOk = "not sql";
    `,
  });

  try {
    const report = runV2ImportGuard({ rootDir: fixture });
    assert.equal(report.ok, false);
    const dagImports = report.violations.filter((v) => v.rule === 'dag-violation-import');
    assert.equal(dagImports.length, 2, JSON.stringify(report.violations, null, 2));
    const sqlViolations = report.violations.filter((v) => v.rule === 'dqs0-ts-sql-double-quote');
    assert.equal(sqlViolations.length, 2, JSON.stringify(report.violations, null, 2));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
