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
  const contract = readJson('contracts/opl-gateway/family-runtime-attempt-contract.json');

  assert.equal(contract.provider_model, 'provider_backed_stage_attempt_runtime');
  assert.deepEqual(contract.allowed_providers, ['local_sqlite', 'hermes_legacy', 'temporal']);
  for (const state of [
    'queued',
    'running',
    'checkpointed',
    'human_gate',
    'completed',
    'failed',
    'blocked',
    'dead_lettered',
  ]) {
    assert.ok((contract.attempt_states as string[]).includes(state));
  }
  for (const field of [
    'stage_attempt_id',
    'provider_kind',
    'workflow_id',
    'domain_id',
    'stage_id',
    'workspace_locator',
    'source_fingerprint',
    'executor_kind',
    'status',
    'checkpoint_refs',
    'closeout_refs',
    'human_gate_refs',
    'retry_budget',
    'provider_receipt',
    'authority_boundary',
  ]) {
    assert.ok((contract.required_ledger_fields as string[]).includes(field));
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
    assert.ok((contract.required_projection_fields as string[]).includes(field));
  }
});

test('family runtime attempt contract keeps OPL runtime manager observability-only', () => {
  const contract = readJson('contracts/opl-gateway/family-runtime-attempt-contract.json');

  assert.equal(contract.observability_only, true);
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
  const contract = readJson('contracts/opl-gateway/family-runtime-attempt-contract.json');

  for (const unsupported of ['Linear', 'Symphony scheduler', 'external issue tracker']) {
    assert.ok((contract.unsupported_required_entries as string[]).includes(unsupported));
  }
});
