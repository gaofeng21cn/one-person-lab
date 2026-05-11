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
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');

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
    'idempotency_key',
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
    'provider_run',
    'activity_events',
    'user_instruction_refs',
    'resume_refs',
    'consumed_memory_refs',
    'writeback_receipt_refs',
    'route_impact',
    'closeout_receipt_status',
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
    'operator_visibility',
    'completion_boundary',
  ]) {
    assert.ok((contract.required_projection_fields as string[]).includes(field));
  }
  assert.equal((contract.provider_lifecycle_contract as Record<string, any>).temporal.workflow_name, 'StageAttemptWorkflow');
  assert.deepEqual((contract.provider_lifecycle_contract as Record<string, any>).temporal.signals, [
    'HumanGateSignal',
    'UserInstructionSignal',
    'ResumeSignal',
  ]);
  assert.equal((contract.typed_closeout_contract as Record<string, any>).required_for_completed_status, true);
  assert.equal((contract.typed_closeout_contract as Record<string, any>).free_text_closeout_accepted, false);
  for (const trackedRef of [
    'closeout_refs',
    'consumed_refs',
    'consumed_memory_refs',
    'writeback_receipt_refs',
    'rejected_writes',
    'route_impact',
    'next_owner',
  ]) {
    assert.ok(((contract.typed_closeout_contract as Record<string, any>).tracked_refs as string[]).includes(trackedRef));
  }
  for (const field of [
    'provider_run',
    'activity_events',
    'user_instructions',
    'resume_signals',
    'consumed_memory_refs',
    'writeback_receipt_refs',
    'closeout_receipt_status',
    'route_impact',
  ]) {
    assert.ok((contract.operator_visibility_fields as string[]).includes(field));
  }
});

test('family runtime attempt contract keeps OPL runtime manager observability-only', () => {
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');

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
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');

  for (const unsupported of ['Linear', 'Symphony scheduler', 'external issue tracker']) {
    assert.ok((contract.unsupported_required_entries as string[]).includes(unsupported));
  }
});

test('standard domain-agent skeleton contract keeps repo source separate from real artifacts', () => {
  const contract = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');

  assert.deepEqual(contract.required_repo_source_dirs, ['agent', 'contracts', 'runtime', 'docs']);
  assert.deepEqual(contract.forbidden_repo_source_dirs, ['artifacts']);
  assert.equal((contract.artifact_boundary as Record<string, unknown>).repo_contains_real_artifacts, false);
  assert.equal((contract.artifact_boundary as Record<string, unknown>).artifact_roots_are_locators, true);
  assert.ok(((contract.artifact_boundary as Record<string, string[]>).opl_forbidden_content).includes('quality_verdict'));
});
