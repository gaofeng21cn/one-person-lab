import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string) {
  return parseJsonText(read(relativePath)) as Record<string, unknown>;
}

test('family product operator projection consumes runtime, quality, and incident contracts', () => {
  const contract = readJson('contracts/opl-framework/family-product-operator-projection.json');

  for (const source of [
    'contracts/opl-framework/family-runtime-attempt-contract.json',
    'contracts/opl-framework/stage-quality-cycle-contract.json',
    'contracts/opl-framework/family-domain-quality-projection-contract.json',
    'contracts/opl-framework/family-incident-learning-loop.json',
  ]) {
    assert.ok((contract.source_contracts as string[]).includes(source));
    assert.equal(fs.existsSync(path.join(repoRoot, source)), true);
  }
});

test('family product projection keeps quality Attempts in drilldown instead of presenting sub-Stages', () => {
  const contract = readJson('contracts/opl-framework/family-product-operator-projection.json');
  const visibility = contract.stage_quality_cycle_visibility as Record<string, any>;

  assert.deepEqual(visibility.default_user_fields, [
    'current_stage', 'stage_artifact', 'completed_or_quality_debt', 'next_stage',
  ]);
  assert.deepEqual(visibility.developer_operator_drilldown_only, [
    'attempt_role', 'quality_round_index', 'execution_session_ref',
    'artifact_identity_receipt_refs', 'review_receipts',
    'finding_lineage', 'repair_lineage', 'quality_debt_refs',
    'quality_debt_reason_codes', 'token_and_cost',
  ]);
  assert.equal(visibility.attempt_must_not_be_presented_as_sub_stage, true);
  assert.equal(
    visibility.completed_with_quality_debt_blocks_quality_export_publication_submission_ready_claims,
    true,
  );
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
    'effective_current_context',
    'family_stall_lineage',
    'usage_projection',
    'resource_pressure',
    'observability_export',
  ]) {
    assert.ok((contract.required_projection_fields as string[]).includes(field));
  }
  const observability = contract.runtime_observability_export as Record<string, unknown>;
  assert.equal(observability.command, 'opl runtime observability-export [--format json|openmetrics|collector-config-json]');
  assert.equal(
    observability.metrics_endpoint_command,
    'opl runtime observability-endpoint [--host <host>] [--port <port>] [--metrics-path <path>]',
  );
  assert.deepEqual(observability.formats, ['json', 'openmetrics', 'collector-config-json', 'http_openmetrics_endpoint']);
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

test('family product operator projection pins OPL as App state/action producer only', () => {
  const contract = readJson('contracts/opl-framework/family-product-operator-projection.json');
  const boundary = contract.app_runtime_boundary as Record<string, any>;

  assert.equal(boundary.framework_role, 'gui_ready_state_action_producer_only');
  assert.equal(boundary.default_state_command, 'opl app state --profile fast --json');
  assert.equal(
    boundary.fast_work_item_projection_producer_contract_ref,
    'contracts/opl-framework/app-runtime-fast-work-item-projection-contract.json',
  );
  assert.equal(boundary.default_operator_payload, 'current_owner_delta');
  assert.equal('compatibility_operator_payload' in boundary, false);
  assert.equal(boundary.full_state_command, 'opl app state --profile full --json');
  assert.equal(
    boundary.action_command,
    'opl app action execute --action <id> [--payload <json>] [--dry-run] --json',
  );
  assert.equal(
    boundary.full_runtime_drilldown_exception,
    'opl runtime app-operator-drilldown --detail full --json',
  );
  assert.equal(boundary.state_owner, 'one-person-lab');
  assert.equal(boundary.gui_product_truth_owner, 'one-person-lab-app');
  assert.equal(boundary.shell_role, 'implementation_adapter_only');
  assert.equal(boundary.default_read_surface_policy.default_projection, 'opl_current_owner_delta');
  assert.equal('compatibility_projection' in boundary.default_read_surface_policy, false);
  assert.equal('compatibility_payload_policy' in boundary.default_read_surface_policy, false);
  assert.deepEqual(boundary.default_read_surface_policy.first_screen_answers, [
    'current_owner_delta',
    'next_safe_action_or_none',
    'current_owner',
    'required_delta',
    'accepted_return_shapes',
    'ordinary_progress_spine',
    'progress_delta_receipt',
    'artifact_tier_policy',
    'audit_sidecar_policy',
    'readiness_false_flags',
    'hard_gate',
    'latest_owner_answer_ref',
  ]);
  assert.equal(
    boundary.default_read_surface_policy.first_screen_answers.includes('count_summary'),
    false,
  );
  assert.deepEqual(boundary.default_read_surface_policy.diagnostic_only_answers, [
    'count_summary',
    'audit_next_safe_action_or_none',
    'full_detail_refs',
  ]);
  assert.equal(
    boundary.default_read_surface_policy.full_detail_policy,
    'explicit_full_detail_or_lazy_diagnostic_only',
  );
  assert.equal(boundary.default_read_surface_policy.raw_refs_policy, 'raw_refs_require_explicit_full_detail');
  const cacheCurrentness = boundary.default_read_surface_policy.projection_cache_currentness_policy;
  assert.equal(cacheCurrentness.cache_surface_kind, 'opl_current_owner_delta_read_model_projection_cache');
  assert.equal(cacheCurrentness.ordinary_read_requires_currentness_identity, true);
  assert.ok(cacheCurrentness.currentness_identity_fields.includes('source_fingerprint'));
  assert.ok(cacheCurrentness.currentness_identity_fields.includes('truth_epoch'));
  assert.deepEqual(cacheCurrentness.accepted_source_surfaces, ['framework_readiness']);
  assert.equal(cacheCurrentness.stale_cache_result, 'cache_miss_return_null');
  assert.equal(cacheCurrentness.legacy_cache_without_currentness_identity_result, 'cache_miss_return_null');
  assert.equal(cacheCurrentness.stale_projection_allowed_role, 'explicit_drilldown_or_audit_only');
  assert.ok(cacheCurrentness.ordinary_fresh_sources.includes('current_execution_envelope'));
  assert.ok(cacheCurrentness.ordinary_fresh_sources.includes('current_owner_delta'));
  assert.equal(cacheCurrentness.cache_can_generate_default_next_action_when_stale, false);
  assert.equal(boundary.default_read_surface_policy.full_detail_auto_poll, false);
  assert.equal(boundary.default_read_surface_policy.shell_must_not_derive_layout_from_raw_runtime_projection, true);
  assert.equal(boundary.default_read_surface_policy.shell_must_not_use_full_drilldown_as_normal_state, true);
  assert.equal(
    boundary.rules.some((rule: string) =>
      rule.includes('must not use it as normal GUI page state')
    ),
    true,
  );
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
    'tests/src/family-domain-quality-projection-contract.test.ts',
    'tests/src/family-incident-learning-loop.test.ts',
    'tests/src/family-product-operator-projection.test.ts',
  ]) {
    assert.match(lanes.stdout, new RegExp(testFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
