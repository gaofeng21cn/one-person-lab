import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

test('family runtime attempt contract documents attempt, retry, workspace, and reconciliation fields', () => {
  const doc = read('docs/references/family-runtime-attempt-contract.md');
  const contract = readJson('contracts/opl-gateway/family-runtime-attempt-contract.json');

  for (const state of ['unclaimed', 'claimed', 'running', 'retry_queued', 'released', 'succeeded', 'failed', 'blocked']) {
    assert.match(doc, new RegExp(state));
    assert.ok((contract.attempt_states as string[]).includes(state));
  }
  for (const field of [
    'attempt_count',
    'retry_policy',
    'workspace_boundary',
    'owner_repo',
    'failure_reason',
    'reconciliation_status',
    'last_observed_projection',
  ]) {
    assert.match(doc, new RegExp(field));
    assert.ok((contract.required_projection_fields as string[]).includes(field));
  }
});

test('family runtime attempt contract keeps OPL runtime manager observability-only', () => {
  const doc = read('docs/references/family-runtime-attempt-contract.md');
  const contract = readJson('contracts/opl-gateway/family-runtime-attempt-contract.json');

  assert.equal(contract.observability_only, true);
  assert.match(doc, /observability-only projection/);
  for (const nonGoal of [
    'scheduler kernel owner',
    'session kernel owner',
    'memory kernel owner',
    'domain runtime truth owner',
    'domain quality judgment owner',
  ]) {
    assert.ok((contract.opl_runtime_manager_non_goals as string[]).includes(nonGoal));
  }
});

test('family runtime attempt contract rejects external required scheduler entries', () => {
  const doc = read('docs/references/family-runtime-attempt-contract.md');
  const contract = readJson('contracts/opl-gateway/family-runtime-attempt-contract.json');

  for (const boundary of [
    'Linear required entry',
    'Symphony scheduler owner',
    'external issue tracker required entry',
    'generic task scheduler replacing `Codex-default session/runtime`',
  ]) {
    assert.match(doc, new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const unsupported of ['Linear', 'Symphony scheduler', 'external issue tracker']) {
    assert.ok((contract.unsupported_required_entries as string[]).includes(unsupported));
  }
});

