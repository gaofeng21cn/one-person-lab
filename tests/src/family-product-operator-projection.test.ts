import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

test('family product operator projection consumes runtime, quality, and incident contracts', () => {
  const contract = readJson('contracts/opl-framework/family-product-operator-projection.json');

  for (const source of [
    'contracts/opl-framework/family-runtime-attempt-contract.json',
    'contracts/opl-framework/family-domain-quality-projection-contract.json',
    'contracts/opl-framework/family-incident-learning-loop.json',
  ]) {
    assert.ok((contract.source_contracts as string[]).includes(source));
    assert.equal(fs.existsSync(path.join(repoRoot, source)), true);
  }
});

test('family product operator projection answers operator status questions with source refs and owner split', () => {
  const contract = readJson('contracts/opl-framework/family-product-operator-projection.json');

  for (const field of [
    'domain_id',
    'active_item',
    'attempt_summary',
    'quality_summary',
    'incident_summary',
    'current_blocker',
    'auto_continue',
    'next_surface_ref',
    'human_gate_reason',
    'source_refs',
    'freshness',
    'owner_split',
  ]) {
    assert.ok((contract.required_projection_fields as string[]).includes(field));
  }
});

test('family product operator projection preserves Codex-default runtime and prevents local scheduler takeover', () => {
  const contract = readJson('contracts/opl-framework/family-product-operator-projection.json');

  for (const semantic of [
    'Codex-default session/runtime',
    'explicit domain activation',
    'explicit runtime switch',
  ]) {
    assert.ok((contract.preserved_runtime_semantics as string[]).includes(semantic));
  }
  for (const nonGoal of [
    'local daemon',
    'scheduler takeover',
    'session kernel ownership',
    'memory kernel ownership',
    'domain runtime truth ownership',
    'domain quality authority',
  ]) {
    assert.ok((contract.non_goals as string[]).includes(nonGoal));
  }
});

test('test:meta includes OPL family external orchestration contract tests', () => {
  const lanes = spawnSync(process.execPath, ['scripts/test-lanes.mjs', 'list'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(lanes.status, 0, lanes.stderr);

  for (const testFile of [
    'tests/src/family-runtime-attempt-contract.test.ts',
    'tests/src/family-domain-quality-projection-contract.test.ts',
    'tests/src/family-incident-learning-loop.test.ts',
    'tests/src/family-product-operator-projection.test.ts',
  ]) {
    assert.match(lanes.stdout, new RegExp(testFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
