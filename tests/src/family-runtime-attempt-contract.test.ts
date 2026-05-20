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

function requirePattern(patterns: Map<string, Record<string, any>>, pattern: string) {
  const value = patterns.get(pattern);
  assert.ok(value, `missing external stability pattern: ${pattern}`);
  return value;
}

test('family runtime attempt contract documents attempt, retry, workspace, and reconciliation fields', () => {
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');

  assert.equal(contract.provider_model, 'provider_backed_stage_attempt_runtime');
  assert.deepEqual(contract.allowed_providers, ['local_sqlite', 'temporal']);
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
    'usage_projection',
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
    'control_loop_summary',
    'usage_projection',
    'resource_pressure',
    'observability_export',
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
    'usage_projection',
  ]) {
    assert.ok((contract.operator_visibility_fields as string[]).includes(field));
  }
  for (const field of [
    'control_loop_summary',
    'usage_projection',
    'resource_pressure',
    'runtime_observability_export',
  ]) {
    assert.ok((contract.stability_projection_fields as string[]).includes(field));
  }
  const stabilityBoundary = contract.stability_projection_authority_boundary as Record<string, unknown>;
  assert.equal(stabilityBoundary.can_execute_domain_action, false);
  assert.equal(stabilityBoundary.can_change_executor, false);
  assert.equal(stabilityBoundary.can_auto_degrade, false);
  assert.equal(stabilityBoundary.can_write_domain_truth, false);
  assert.equal(stabilityBoundary.can_authorize_quality_verdict, false);
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

test('family runtime attempt contract treats external stability mechanisms as typed proposals or read-only projections', () => {
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');
  const policy = contract.external_stability_pattern_policy as Record<string, any>;
  const patterns = new Map((policy.patterns as Record<string, any>[]).map((entry) => [entry.pattern, entry]));

  assert.equal(policy.core_runtime_import_allowed, false);
  assert.equal(policy.stability_definition, 'failure_classified_recoverable_auditable_without_quality_downgrade');

  const fallback = requirePattern(patterns, 'generic_fallback');
  assert.ok(fallback.allowed_absorption.includes('degraded_attempt'));
  assert.ok(fallback.allowed_absorption.includes('alternative_route_proposal'));
  assert.ok(fallback.required_refs.includes('owner_receipt_ref'));
  assert.ok(fallback.forbidden_core_semantics.includes('fallback_complete'));
  assert.ok(fallback.forbidden_core_semantics.includes('silent_success_on_degraded_evidence'));

  const retry = requirePattern(patterns, 'string_rule_retry');
  assert.ok(retry.allowed_absorption.includes('typed_slo_retry_policy_schema'));
  assert.ok(retry.required_schema_fields.includes('trigger_kind'));
  assert.ok(retry.required_schema_fields.includes('metric_source'));
  assert.ok(retry.required_schema_fields.includes('receipt_refs'));
  assert.equal(retry.parse_failure, 'fail_closed');

  const eventBus = requirePattern(patterns, 'generic_event_bus');
  assert.ok(eventBus.allowed_absorption.includes('read_only_event_classification_projection'));
  assert.ok(eventBus.truth_sources.includes('opl_stage_attempt_ledger'));
  assert.ok(eventBus.truth_sources.includes('domain_owned_receipt'));
  assert.ok(eventBus.forbidden_core_semantics.includes('second_truth_source'));

  const adapter = requirePattern(patterns, 'generic_runtime_adapter');
  assert.ok(adapter.allowed_absorption.includes('explicit_executor_adapter_registry'));
  assert.ok(adapter.required_adapter_contract.includes('receipt_shape'));
  assert.ok(adapter.required_adapter_contract.includes('tool_event_proof'));
  assert.ok(adapter.required_adapter_contract.includes('fail_closed_gate'));
  assert.ok(adapter.forbidden_core_semantics.includes('subprocess_started_equals_success'));
  assert.ok(adapter.forbidden_core_semantics.includes('executor_quality_equivalence'));
});

test('standard domain-agent skeleton contract keeps repo source separate from real artifacts', () => {
  const contract = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');

  assert.deepEqual(contract.required_repo_source_dirs, ['agent', 'contracts', 'runtime', 'docs']);
  assert.deepEqual(contract.forbidden_repo_source_dirs, ['artifacts']);
  assert.equal((contract.artifact_boundary as Record<string, unknown>).repo_contains_real_artifacts, false);
  assert.equal((contract.artifact_boundary as Record<string, unknown>).artifact_roots_are_locators, true);
  assert.ok(((contract.artifact_boundary as Record<string, string[]>).opl_forbidden_content).includes('quality_verdict'));
});

test('standard domain-agent scaffold contract forbids domain-owned generic framework primitives', () => {
  const contract = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');
  const scaffold = contract.new_agent_scaffold as Record<string, any>;

  assert.equal(scaffold.surface_kind, 'opl_standard_domain_agent_scaffold');
  assert.equal(scaffold.owner, 'one-person-lab');
  assert.equal(scaffold.command, 'opl agents scaffold');
  assert.equal(scaffold.generation_policy.scaffold_command_is_read_only, true);
  assert.equal(scaffold.generation_policy.creates_files, false);
  assert.deepEqual(scaffold.docs_taxonomy, [
    'active',
    'public',
    'product',
    'runtime',
    'delivery',
    'source',
    'policies',
    'specs',
    'references',
    'history',
  ]);
  for (const primitive of [
    'scheduler_supervision_cadence',
    'provider_slo_and_wakeup_transport',
    'queue_attempt_ledger',
    'generic_transition_runner',
    'workspace_source_intake_shell',
    'memory_locator_writeback_transport',
    'artifact_package_lifecycle_shell',
    'operator_workbench_drilldown_shell',
    'observability_repair_projection',
    'pack_compiler_generated_surface',
  ]) {
    assert.ok(scaffold.opl_owned_generic_primitives.includes(primitive));
  }
  for (const forbiddenRole of [
    'generic_scheduler_owner',
    'generic_queue_owner',
    'generic_attempt_ledger_owner',
    'generic_operator_workbench_owner',
    'generated_surface_owner_in_domain_repo',
  ]) {
    assert.ok(scaffold.forbidden_domain_generic_owner_roles.includes(forbiddenRole));
  }
  assert.ok(scaffold.declarative_domain_pack.includes('domain_truth_schema'));
  assert.ok(scaffold.declarative_domain_pack.includes('owner_receipt_schema'));
  assert.ok(scaffold.minimal_authority_functions.includes('quality_or_export_verdict_authorizer'));
  assert.equal(scaffold.pack_compiler_contract.generated_surface_owner, 'one-person-lab');
  assert.ok(scaffold.generated_surface_contract.surfaces.includes('cli'));
  assert.ok(scaffold.generated_surface_contract.surfaces.includes('skill'));
  assert.ok(scaffold.required_contract_surfaces.includes('pack_compiler_input'));
  assert.ok(scaffold.required_contract_surfaces.includes('generated_surface_handoff'));
  assert.ok(scaffold.required_contract_surfaces.includes('workspace_lifecycle_policy'));
  assert.ok(scaffold.domain_retained_thin_surfaces_deprecated.includes('domain_truth'));
  assert.ok(scaffold.retirement_gate_required_evidence.includes('no_active_default_caller'));
  assert.ok(scaffold.required_verification.includes('git_diff_check'));
  assert.ok(scaffold.required_verification.includes('agent_pack_required_paths_resolve'));
  assert.ok(scaffold.required_verification.includes('stage_prompt_skill_knowledge_quality_gate_refs_resolve'));
  assert.ok(scaffold.required_verification.includes('generated_surface_handoff_parity'));
  assert.ok(scaffold.required_verification.includes('workspace_file_lifecycle_policy_declared'));
  assert.equal(scaffold.workspace_file_lifecycle_policy.surface_kind, 'opl_domain_workspace_file_lifecycle_policy');
  assert.equal(
    scaffold.workspace_file_lifecycle_policy.repo_source_boundaries.runtime_artifacts_live_in_source_repo,
    false,
  );
  assert.equal(
    scaffold.workspace_file_lifecycle_policy.workspace_runtime_artifact_roots.repo_source_policy,
    'locator_index_schema_receipt_refs_only',
  );
  assert.equal(
    scaffold.workspace_file_lifecycle_policy.authority_boundary
      .policy_can_claim_domain_ready_or_artifact_authority,
    false,
  );
  assert.equal(scaffold.agent_pack_contract.canonical_semantic_pack_root, 'agent/');
  assert.deepEqual(scaffold.agent_pack_contract.required_sections, [
    'agent/prompts',
    'agent/stages',
    'agent/skills',
    'agent/knowledge',
    'agent/quality_gates',
  ]);
  assert.deepEqual(scaffold.agent_pack_contract.stage_ref_requirements, [
    'prompt_refs:agent/prompts/*',
    'skills:agent/skills/* or skill_id',
    'knowledge_refs:agent/knowledge/*',
    'evaluation:agent/quality_gates/*',
  ]);
});
