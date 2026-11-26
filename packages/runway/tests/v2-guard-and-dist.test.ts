import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runV2ImportGuard } from '../../../scripts/check-v2-import-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(HERE, '..', '..', '..');

test('v2 import guard passes for @opl/runway with DQS=0 and exact DAG edges', () => {
  const report = runV2ImportGuard({ rootDir: ROOT_DIR });
  assert.equal(report.ok, true, `Guard violations: ${JSON.stringify(report.violations)}`);
  assert.ok(report.packagesChecked.includes('runway'));
  assert.ok(report.dagEdges.includes('runway -> core'));
  assert.ok(report.dagEdges.includes('runway -> workspace'));
  assert.ok(report.dagEdges.includes('runway -> connect'));
  assert.ok(report.dagEdges.includes('runway -> pack'));
  assert.ok(report.dagEdges.includes('runway -> ledger'));
  assert.equal(report.violations.length, 0);
});

test('compiled @opl/runway dist/index.js and declarations exist and export core symbols', async () => {
  const distJs = path.join(ROOT_DIR, 'packages', 'runway', 'dist', 'index.js');
  const distDts = path.join(ROOT_DIR, 'packages', 'runway', 'dist', 'index.d.ts');
  assert.equal(fs.existsSync(distJs), true, 'packages/runway/dist/index.js must exist');
  assert.equal(fs.existsSync(distDts), true, 'packages/runway/dist/index.d.ts must exist');

  const mod = await import('@opl/runway');
  assert.equal(typeof mod.SqliteRunwayStore, 'function');
  assert.equal(typeof mod.RunwayRuntime, 'function');
  assert.equal(typeof mod.LeaseManager, 'function');
  assert.equal(typeof mod.ScheduleRunner, 'function');
  assert.equal(typeof mod.ExecutorRegistry, 'function');
  assert.equal(typeof mod.CodexExecutorAdapter, 'function');
  assert.equal(typeof mod.AntigravityExecutorAdapter, 'function');
  assert.equal(typeof mod.computeNextCronTime, 'function');
  assert.equal(typeof mod.normalizeOverlapPolicy, 'function');
});
