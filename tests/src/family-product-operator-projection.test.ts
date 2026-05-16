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
    'control_loop_summary',
    'usage_projection',
    'resource_pressure',
    'observability_export',
  ]) {
    assert.ok((contract.required_projection_fields as string[]).includes(field));
  }
  const observability = contract.runtime_observability_export as Record<string, unknown>;
  assert.equal(observability.command, 'opl runtime observability-export [--format json|openmetrics]');
  assert.deepEqual(observability.formats, ['json', 'openmetrics']);
  assert.equal(observability.authority, 'read_only_non_authoritative');
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
    'executor auto-degradation',
    'domain action execution from observability',
    'generic fallback completion',
    'string rule retry execution',
    'generic event bus truth source',
    'generic runtime adapter success semantics',
  ]) {
    assert.ok((contract.non_goals as string[]).includes(nonGoal));
  }
});

test('family product operator projection documents safe learning from rejected generic runtime mechanisms', () => {
  const contract = readJson('contracts/opl-framework/family-product-operator-projection.json');
  const policy = contract.external_stability_learning_policy as Record<string, any>;

  for (const allowed of [
    'control_loop_classification',
    'observed_usage_budget_projection',
    'typed_slo_retry_policy_language',
    'read_only_event_and_alert_projection',
    'dashboard_grouping_vocabulary',
  ]) {
    assert.ok(policy.allowed_learning.includes(allowed));
  }
  for (const rejected of [
    'generic_fallback_completion',
    'string_rule_retry_execution',
    'generic_event_bus_as_truth',
    'generic_runtime_adapter_success_semantics',
  ]) {
    assert.ok(policy.not_core_runtime_mechanisms.includes(rejected));
  }

  assert.equal(policy.allowed_degraded_surface.surface, 'degraded_attempt_or_alternative_route_proposal');
  assert.equal(policy.allowed_degraded_surface.can_mark_success, false);
  assert.ok(policy.allowed_degraded_surface.required_operator_fields.includes('blocker'));
  assert.ok(policy.allowed_degraded_surface.required_operator_fields.includes('evidence_gap'));
  assert.ok(policy.allowed_degraded_surface.required_operator_fields.includes('owner_receipt_ref'));
  assert.equal(
    policy.operator_stability_definition,
    'failure_is_classified_recoverable_and_auditable_without_pretending_quality_completion',
  );
});

test('test:meta includes OPL family external orchestration contract tests', () => {
  const lanes = spawnSync(process.execPath, ['scripts/test-lanes.mjs', 'list'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(lanes.status, 0, lanes.stderr);

  for (const testFile of [
    'tests/src/family-runtime-attempt-contract.test.ts',
    'tests/src/functional-agent-runtime-harness.test.ts',
    'tests/src/family-domain-quality-projection-contract.test.ts',
    'tests/src/family-incident-learning-loop.test.ts',
    'tests/src/family-product-operator-projection.test.ts',
  ]) {
    assert.match(lanes.stdout, new RegExp(testFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
