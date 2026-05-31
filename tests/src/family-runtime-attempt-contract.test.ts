import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

const retiredStageExecutionLogName = ['stage', 'execution', 'log'].join('_');

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256Stable(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function requirePattern(patterns: Map<string, Record<string, any>>, pattern: string) {
  const value = patterns.get(pattern);
  assert.ok(value, `missing external stability pattern: ${pattern}`);
  return value;
}

function* walkTextFiles(relativeRoot: string): Generator<string> {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (relativePath.startsWith('docs/history/')) {
      continue;
    }
    if (entry.isDirectory()) {
      yield* walkTextFiles(relativePath);
      continue;
    }
    if (entry.isFile() && ['.json', '.md', '.mjs', '.ts'].includes(path.extname(entry.name))) {
      yield relativePath;
    }
  }
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
    'owner_route_refs',
    'typed_blocker_refs',
    'owner_receipt_refs',
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
    'current_control_state',
    'route_hydration_status',
    'stage_graph_ref',
    'last_observed_projection',
    'operator_visibility',
    'completion_boundary',
    'owner_route_boundary',
    'control_loop_summary',
    'usage_projection',
    'stage_progress_log',
    'attempt_true_path_proof',
    'temporal_visibility',
    'temporal_webui_ref',
    'resource_pressure',
    'observability_export',
    'memory_trace_projection',
    'model_route_cost_projection',
    'effective_current_context',
    'family_stall_lineage',
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
    'user_stage_log',
    'human_stage_log',
    'human_summary',
    'paper_stage_log',
    'stage_log_summary',
    'route_impact',
    'next_owner',
  ]) {
    assert.ok(((contract.typed_closeout_contract as Record<string, any>).tracked_refs as string[]).includes(trackedRef));
  }
  for (const field of [
    'codex_stage_activity_timeout_policy',
    'provider_run',
    'activity_events',
    'user_instructions',
    'resume_signals',
    'consumed_memory_refs',
    'writeback_receipt_refs',
    'closeout_receipt_status',
    'route_impact',
    'usage_projection',
    'stage_progress_log',
    'attempt_true_path_proof',
    'temporal_visibility',
    'temporal_webui_ref',
  ]) {
    assert.ok((contract.operator_visibility_fields as string[]).includes(field));
  }
  for (const field of [
    'control_loop_summary',
    'usage_projection',
    'stage_progress_log',
    'resource_pressure',
    'runtime_observability_export',
  ]) {
    assert.ok((contract.stability_projection_fields as string[]).includes(field));
  }
  const temporalProvider = (contract.provider_lifecycle_contract as Record<string, any>).temporal;
  assert.deepEqual(temporalProvider.required_search_attributes, [
    'OplStageAttemptId',
    'OplDomainId',
    'OplStageId',
    'OplAttemptStatus',
    'OplStagePhase',
    'OplBlockedReason',
    'OplTaskId',
    'OplSourceFingerprint',
    'OplExecutorKind',
  ]);
  assert.deepEqual(temporalProvider.updates, [
    'StageAttemptOperatorUpdate',
  ]);
  assert.equal(
    temporalProvider.visibility_payload_policy,
    'refs_and_indexable_summary_only_no_transcript_artifact_memory_or_domain_body',
  );
  const stageProgressLog = contract.stage_progress_log_contract as Record<string, any>;
  assert.equal(stageProgressLog.surface_kind, 'opl_stage_progress_log');
  assert.deepEqual(stageProgressLog.forbidden_derivation_sources, [
    'domain_truth_body',
    'domain_memory_body',
    'artifact_body',
    'quality_verdict_body',
  ]);
  assert.equal(
    stageProgressLog.projection_policy,
    'temporal_backed_opl_refs_only_stage_observability_no_domain_truth',
  );
  assert.deepEqual(stageProgressLog.required_sections, [
    'intended_work',
    'actual_work',
    'timeline',
    'usage',
    'memory_trace_projection',
    'model_route_cost_projection',
    'user_stage_log',
    'evidence_refs',
    'temporal_visibility',
    'temporal_webui_ref',
    'authority_boundary',
  ]);
  const userStageLog = stageProgressLog.user_stage_log_contract as Record<string, any>;
  assert.equal(userStageLog.surface_kind, 'opl_user_stage_log');
  assert.equal(
    userStageLog.projection_policy,
    'opl_time_usage_refs_plus_domain_provided_human_semantics_no_domain_inference',
  );
  assert.deepEqual(userStageLog.domain_semantic_sources, [
    'typed_closeout_packet.user_stage_log',
    'typed_closeout_packet.stage_log_summary',
    'typed_closeout_packet.human_stage_log',
    'typed_closeout_packet.human_summary',
    'typed_closeout_packet.paper_stage_log',
    'route_impact.user_stage_log',
    'route_impact.stage_log_summary',
    'route_impact.human_stage_log',
    'route_impact.human_summary',
    'route_impact.paper_stage_log',
  ]);
  assert.ok(userStageLog.required_sections.includes('problem_summary'));
  assert.ok(userStageLog.required_sections.includes('stage_work_done'));
  assert.ok(userStageLog.required_sections.includes('changed_stage_surfaces'));
  assert.ok(userStageLog.required_sections.includes('progress_delta_classification'));
  assert.ok(userStageLog.required_sections.includes('deliverable_progress_delta'));
  assert.ok(userStageLog.required_sections.includes('platform_repair_delta'));
  assert.ok(userStageLog.required_sections.includes('next_forced_delta'));
  assert.ok(userStageLog.required_sections.includes('paper_work_done'));
  assert.ok(userStageLog.required_sections.includes('token_usage'));
  assert.deepEqual(userStageLog.legacy_alias_sections, ['paper_work_done', 'changed_paper_surfaces']);
  assert.equal(userStageLog.progress_delta_policy.surface_kind, 'opl_stage_progress_delta_policy');
  assert.deepEqual(userStageLog.progress_delta_policy.required_fields, [
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
  ]);
  assert.equal(userStageLog.progress_delta_policy.platform_only_is_not_deliverable_progress, true);
  assert.equal(userStageLog.semantic_missing_policy, 'emit_missing_domain_semantic_summary_without_inventing_domain_work');
  assert.equal(userStageLog.token_policy, 'observed_or_explicit_missing_null_no_zero_fill');
  assert.equal(userStageLog.authority_boundary.can_infer_domain_semantics, false);
  assert.equal(stageProgressLog.temporal_visibility_contract.surface_kind, 'temporal_stage_attempt_visibility');
  assert.equal(stageProgressLog.temporal_visibility_contract.required_for_provider, 'temporal');
  assert.deepEqual(stageProgressLog.temporal_visibility_contract.search_attributes, [
    'OplStageAttemptId',
    'OplDomainId',
    'OplStageId',
    'OplAttemptStatus',
    'OplStagePhase',
    'OplBlockedReason',
    'OplTaskId',
    'OplSourceFingerprint',
    'OplExecutorKind',
  ]);
  assert.equal(stageProgressLog.temporal_webui_ref_contract.surface_kind, 'temporal_webui_ref');
  assert.equal(stageProgressLog.temporal_webui_ref_contract.ref_role, 'operator_debug_link_only');
  assert.equal(stageProgressLog.temporal_webui_ref_contract.user_primary_app_surface, false);
  assert.equal(stageProgressLog.authority_boundary.can_execute_domain_action, false);
  assert.equal(stageProgressLog.authority_boundary.can_write_domain_truth, false);
  assert.equal(stageProgressLog.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(stageProgressLog.authority_boundary.provider_completion_is_domain_ready, false);
  const truePathProof = contract.attempt_true_path_proof_contract as Record<string, any>;
  assert.equal(truePathProof.surface_name, 'attempt_true_path_proof');
  assert.equal(truePathProof.surface_kind, 'opl_stage_attempt_true_path_proof');
  assert.equal(
    truePathProof.projection_policy,
    'same_stage_attempt_refs_only_no_domain_truth_no_long_soak_claim',
  );
  assert.equal(truePathProof.surface_refs.includes('attempt_query_ref'), true);
  assert.equal(truePathProof.surface_refs.includes('queue_inspect_ref'), true);
  assert.equal(truePathProof.surface_refs.includes('app_drilldown_ref'), true);
  assert.equal(truePathProof.surface_refs.includes('temporal_webui_ref'), true);
  assert.equal(truePathProof.forbidden_derivation_sources.includes('long_soak_claim'), true);
  assert.equal(truePathProof.authority_boundary.can_claim_domain_ready, false);
  assert.equal(truePathProof.authority_boundary.can_claim_long_soak, false);
  assert.equal(truePathProof.authority_boundary.can_claim_artifact_authority, false);
  const stabilityBoundary = contract.stability_projection_authority_boundary as Record<string, unknown>;
  assert.equal(stabilityBoundary.can_execute_domain_action, false);
  assert.equal(stabilityBoundary.can_change_executor, false);
  assert.equal(stabilityBoundary.can_auto_degrade, false);
  assert.equal(stabilityBoundary.can_write_domain_truth, false);
  assert.equal(stabilityBoundary.can_authorize_quality_verdict, false);
});

test('family runtime attempt contract defines current control state as OPL-only reconciled projection', () => {
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');
  const projection = contract.current_control_state_projection as Record<string, any>;

  assert.equal(projection.surface_kind, 'opl_current_control_state');
  assert.deepEqual(projection.required_derivation_sources, [
    'family_runtime_queue_task',
    'stage_attempt_ledger',
    'provider_run_projection',
    'typed_stage_closeout_ledger',
  ]);
  assert.ok(projection.fail_closed_reasons.includes('missing_identity'));
  assert.ok(projection.fail_closed_reasons.includes('stale_route_epoch'));
  assert.ok(projection.fail_closed_reasons.includes('stale_source_fingerprint'));
  assert.ok(projection.fail_closed_reasons.includes('stale_truth_epoch'));
  assert.ok(projection.fail_closed_reasons.includes('provider_completed_without_typed_closeout'));
  assert.equal(projection.temporal_ordering_policy, 'newest_queue_or_stage_attempt_wins_over_older_terminal_attempt');
  assert.equal(projection.forbidden_derivation_sources.includes('mas_latest'), true);
  assert.equal(projection.forbidden_derivation_sources.includes('mas_dispatch_latest'), true);
  assert.equal(projection.authority_boundary.can_claim_domain_ready, false);
  assert.equal(projection.authority_boundary.can_claim_publication_ready, false);
  assert.equal(projection.authority_boundary.can_claim_artifact_ready, false);
});

test('family runtime attempt contract defines stage_progress_log as the canonical refs-only progress surface', () => {
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');
  const projection = contract.stage_progress_log_contract as Record<string, any>;

  assert.equal(projection.surface_name, 'stage_progress_log');
  assert.equal(projection.surface_kind, 'opl_stage_progress_log');
  assert.equal(projection.projection_policy, 'temporal_backed_opl_refs_only_stage_observability_no_domain_truth');
  assert.deepEqual(projection.required_derivation_sources, [
    'stage_attempt_ledger',
    'provider_run_projection',
    'activity_events',
    'typed_closeout_packet_refs',
    'domain_owned_receipt_refs',
    'stage_attempt_usage_projection',
    'memory_locator_index_projection',
    'model_route_cost_projection',
  ]);
  assert.deepEqual(projection.forbidden_derivation_sources, [
    'domain_truth_body',
    'domain_memory_body',
    'artifact_body',
    'quality_verdict_body',
  ]);
  assert.equal(projection.authority_boundary.can_execute_domain_action, false);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.authority_boundary.can_read_memory_body, false);
  assert.equal(projection.authority_boundary.can_read_artifact_body, false);
  assert.equal(projection.authority_boundary.can_authorize_quality_verdict, false);
  const memoryTrace = contract.memory_trace_projection_contract as Record<string, any>;
  assert.equal(memoryTrace.surface_kind, 'opl_memory_trace_projection');
  assert.equal(memoryTrace.authority_boundary.can_read_memory_body, false);
  assert.equal(memoryTrace.authority_boundary.can_write_domain_memory_body, false);
  assert.equal(memoryTrace.authority_boundary.can_accept_or_reject_memory_writeback, false);
  assert.ok(memoryTrace.exported_surfaces.includes('stage_progress_log.memory_trace_projection'));
  const modelRouteCost = contract.model_route_cost_projection_contract as Record<string, any>;
  assert.equal(modelRouteCost.surface_kind, 'opl_model_route_cost_projection');
  assert.equal(modelRouteCost.authority_boundary.can_change_executor, false);
  assert.equal(modelRouteCost.authority_boundary.can_auto_degrade, false);
  assert.equal(modelRouteCost.authority_boundary.can_replace_quality_gate, false);
  assert.ok(modelRouteCost.exported_surfaces.includes('stage_progress_log.model_route_cost_projection'));
  const userStageLog = projection.user_stage_log_contract as Record<string, any>;
  assert.equal(userStageLog.surface_kind, 'opl_user_stage_log');
  assert.equal(userStageLog.authority_boundary.can_infer_domain_semantics, false);
  assert.equal(userStageLog.authority_boundary.can_write_domain_truth, false);
  assert.equal(userStageLog.progress_delta_policy.platform_only_is_not_deliverable_progress, true);
  assert.equal((contract.operator_visibility_fields as string[]).includes('stage_progress_log'), true);
  assert.equal((contract.operator_visibility_fields as string[]).includes('attempt_true_path_proof'), true);
  assert.equal((contract.operator_visibility_fields as string[]).includes(retiredStageExecutionLogName), false);
  assert.equal((contract.stability_projection_fields as string[]).includes('stage_progress_log'), true);
  assert.equal((contract.stability_projection_fields as string[]).includes(retiredStageExecutionLogName), false);
});

test('active contract, source, and test surfaces do not emit retired stage execution log naming', () => {
  const violations: string[] = [];

  for (const relativePath of ['contracts', 'src', 'tests/src'].flatMap((root) => [...walkTextFiles(root)])) {
    const lines = read(relativePath).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(retiredStageExecutionLogName)) {
        violations.push(`${relativePath}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(violations, []);
});

test('stage route scheduler contract freezes route hydration as OPL reconciliation, not nested stages', () => {
  const contract = readJson('contracts/opl-framework/stage-route-scheduler-contract.json');

  assert.equal(contract.model, 'stage_graph_reconciliation_with_owner_route_hydration');
  const definitions = contract.canonical_definitions as Record<string, any>;
  assert.equal(definitions.stage.owner, 'one-person-lab');
  assert.equal(definitions.stage.meaning.includes('attempt unit'), true);
  assert.equal(definitions.route.owner, 'domain-agent');
  assert.equal(definitions.route.is_executable_stage, false);
  assert.equal(definitions.route.is_small_stage, false);
  assert.equal(definitions.route.can_complete_stage_attempt, false);
  assert.equal(definitions.route_hydration.owner, 'one-person-lab');
  assert.ok(definitions.route_hydration.machine_surfaces.includes('opl family-runtime tick --hydrate'));
  assert.ok(definitions.attempt_ledger.machine_surfaces.includes('family-runtime-attempt-contract.json'));

  const masReference = contract.mas_reference_flow as Record<string, string[]>;
  assert.ok(masReference.domain_owner_outputs.includes('owner_route_refs'));
  assert.ok(masReference.domain_owner_outputs.includes('typed_blocker_refs'));
  assert.ok(masReference.opl_owned_hydration_outputs.includes('typed_queue_task'));
  assert.ok(masReference.opl_owned_hydration_outputs.includes('stage_attempt_ledger_entry'));
  assert.ok(masReference.forbidden_interpretations.includes('MAS route is a nested OPL stage'));

  const layers = new Map((contract.scheduler_layers as Record<string, any>[]).map((entry) => [entry.layer, entry]));
  assert.ok(layers.has('stage_graph'));
  assert.ok(layers.has('owner_route_hydration'));
  assert.ok(layers.has('reconciliation_loop'));
  assert.ok(layers.has('attempt_ledger'));
  assert.equal(layers.get('owner_route_hydration')?.authority_boundary, 'transport_and_projection_only');

  for (const step of [
    'discover_domain_owner_route_refs',
    'hydrate_route_ref_into_typed_queue_or_stage_attempt_request',
    'append_attempt_ledger_or_conflict_envelope',
    'reconcile_actual_status_back_to_operator_read_model',
  ]) {
    assert.ok((contract.reconciliation_steps as string[]).includes(step));
  }

  const patterns = new Map((contract.external_patterns_absorbed as Record<string, any>[]).map((entry) => [entry.source, entry]));
  assert.ok(patterns.get('Temporal durable execution')?.absorbed_as.includes('event_history'));
  assert.ok(patterns.get('LangGraph checkpoint and conditional edges')?.absorbed_as.includes('checkpoint_refs'));
  assert.ok(patterns.get('Kubernetes controller reconciliation and spec/status split')?.absorbed_as.includes('reconciliation_status'));
  assert.ok(patterns.get('Dagster asset graph and op boundary')?.absorbed_as.includes('graph_projection_for_dependencies'));

  for (const forbidden of [
    'route_is_small_stage',
    'queue_task_admitted_equals_domain_work_done',
    'provider_completed_equals_owner_receipt',
    'OPL_hydration_writes_domain_truth',
  ]) {
    assert.ok((contract.forbidden_semantics as string[]).includes(forbidden));
  }
  const boundary = contract.authority_boundary as Record<string, boolean>;
  assert.equal(boundary.opl_can_hydrate_route_refs, true);
  assert.equal(boundary.opl_can_schedule_stage_attempts, true);
  assert.equal(boundary.opl_can_execute_route_as_stage, false);
  assert.equal(boundary.opl_can_sign_domain_owner_receipt, false);
  assert.equal(boundary.opl_can_authorize_quality_verdict, false);
});

test('family runtime attempt contract binds attempt ledger fields to the stage route scheduler boundary', () => {
  const contract = readJson('contracts/opl-framework/family-runtime-attempt-contract.json');

  assert.equal(contract.stage_route_scheduler_contract_ref, 'contracts/opl-framework/stage-route-scheduler-contract.json');
  assert.deepEqual(contract.stage_route_boundary, {
    stage_is_opl_attempt_unit: true,
    route_is_domain_owner_semantic: true,
    route_is_small_stage: false,
    route_hydrated_into_stage_or_queue_by_opl: true,
    route_completion_is_stage_completion: false,
    provider_completion_is_owner_receipt: false,
  });

  const hydration = contract.route_hydration_contract as Record<string, any>;
  assert.ok(hydration.input_refs.includes('owner_route_refs'));
  assert.ok(hydration.input_refs.includes('typed_blocker_refs'));
  assert.ok(hydration.output_records.includes('typed_queue_task'));
  assert.ok(hydration.output_records.includes('stage_attempt_request'));
  assert.ok(hydration.output_records.includes('conflict_or_blocker_envelope'));
  assert.ok(hydration.reconciliation_statuses.includes('hydrated_to_stage_attempt'));
  assert.ok(hydration.reconciliation_statuses.includes('route_back_projected'));
  assert.ok(hydration.forbidden_semantics.includes('route_is_small_stage'));
  assert.ok(hydration.forbidden_semantics.includes('provider_completion_equals_owner_receipt'));
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

test('foundry agent series policy release records a verifiable Progress-First policy bundle fingerprint', () => {
  const release = readJson('contracts/opl-framework/foundry-agent-series-policy-release.json');
  const foundryContract = readJson('contracts/opl-framework/foundry-agent-series-contract.json');
  const skeleton = readJson('contracts/opl-framework/standard-domain-agent-skeleton-contract.json');
  const scaffold = skeleton.new_agent_scaffold as Record<string, any>;
  const agentPackContract = scaffold.agent_pack_contract as Record<string, any>;

  assert.equal(release.surface_kind, 'opl_foundry_agent_series_policy_release');
  assert.equal(release.release_contract_ref, 'contracts/opl-framework/foundry-agent-series-policy-release.json');
  assert.equal(release.series_contract_ref, 'contracts/opl-framework/foundry-agent-series-contract.json');
  assert.equal(release.fingerprint_algorithm, 'sha256:stable-json');
  assert.equal(release.policy_bundle_fingerprint, sha256Stable(release.policy_bundle));
  assert.deepEqual(foundryContract.shared_policy_release, {
    policy_release_contract_ref: 'contracts/opl-framework/foundry-agent-series-policy-release.json',
    policy_bundle_fingerprint: release.policy_bundle_fingerprint,
    fingerprint_algorithm: 'sha256:stable-json',
    domain_contract_policy_release_pin_required: true,
    domain_adapter_must_not_copy_policy_body_as_authority: true,
    consumer_alignment_check: 'foundry:policy-release',
  });
  assert.deepEqual(scaffold.foundry_agent_series_policy_release, release);
  assert.deepEqual(agentPackContract.foundry_agent_series_policy_release, release);
  assert.equal(
    (release.policy_bundle as Record<string, any>).authority_boundary.policy_release_can_claim_domain_ready,
    false,
  );
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
  const primitiveIds = scaffold.opl_owned_generic_primitives.map(
    (primitive: { primitive_id: string }) => primitive.primitive_id,
  );
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
    assert.ok(primitiveIds.includes(primitive));
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
  assert.ok(scaffold.required_contract_surfaces.includes('foundry_agent_series_contract'));
  assert.ok(scaffold.required_contract_surfaces.includes('progress_delta_policy'));
  assert.ok(scaffold.required_contract_surfaces.includes('typed_blocker_lineage_policy'));
  assert.ok(scaffold.required_contract_surfaces.includes('workspace_lifecycle_policy'));
  assert.ok(scaffold.domain_retained_thin_surfaces_deprecated.includes('domain_truth'));
  assert.ok(scaffold.domain_retained_thin_surfaces_deprecated.includes(
    'domain_handler_target_or_opaque_ref_projection_output',
  ));
  assert.equal(scaffold.domain_retained_thin_surfaces_deprecated.includes('sidecar_or_projection_adapter'), false);
  assert.ok(scaffold.retirement_gate.required_evidence.includes('no_active_default_caller'));
  assert.ok(scaffold.required_verification.includes('git_diff_check'));
  assert.ok(scaffold.required_verification.includes('agent_pack_required_paths_resolve'));
  assert.ok(scaffold.required_verification.includes('stage_prompt_skill_knowledge_quality_gate_refs_resolve'));
  assert.ok(scaffold.required_verification.includes('generated_surface_handoff_parity'));
  assert.ok(scaffold.required_verification.includes('workspace_file_lifecycle_policy_declared'));
  assert.ok(scaffold.default_runtime_policy.provider_managed_surfaces.includes('stage_progress_log'));
  assert.equal(
    scaffold.default_runtime_policy.required_user_stage_log.missing_semantic_summary_status,
    'missing_domain_semantic_summary',
  );
  assert.ok(scaffold.default_runtime_policy.required_user_stage_log.canonical_domain_fields.includes(
    'stage_work_done',
  ));
  assert.ok(scaffold.default_runtime_policy.required_user_stage_log.accepted_domain_semantic_sources.includes(
    'human_stage_log',
  ));
  assert.equal(scaffold.default_runtime_policy.required_user_stage_log.authority_boundary.opl_can_infer_domain_semantics, false);
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
    'selected_executor:codex_cli default binding or explicit non-default executor binding',
    'user_stage_log_requirement:domain provides human-readable stage semantics; OPL projects timing usage refs only',
    'stage_contract.requires and stage_contract.ensures',
    'stage_contract.expected_receipt_refs',
    'stage_contract.user_stage_log_contract',
    'stage_contract.progress_delta_policy',
    'stage_contract.typed_blocker_lineage_policy',
    'independent_gate_policy:execution_review_separation',
  ]);
  assert.equal(scaffold.foundry_agent_series_contract.surface_kind, 'opl_foundry_agent_series_contract');
  assert.equal(
    scaffold.foundry_agent_series_contract.shared_policy_release.policy_release_contract_ref,
    'contracts/opl-framework/foundry-agent-series-policy-release.json',
  );
  assert.equal(
    scaffold.foundry_agent_series_contract.shared_policy_release.consumer_alignment_check,
    'foundry:policy-release',
  );
  assert.deepEqual(scaffold.foundry_agent_series_contract.shared_progress_projection_fields, [
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
  ]);
  assert.equal(scaffold.default_runtime_policy.surface_kind, 'opl_standard_agent_default_runtime_policy');
  assert.equal(scaffold.default_runtime_policy.default_runtime_path, 'opl_temporal_hosted_autonomous');
  assert.equal(scaffold.default_runtime_policy.temporal_hosted_autonomy_default_enabled, true);
  assert.equal(scaffold.default_runtime_policy.default_executor_kind, 'codex_cli');
  assert.equal(scaffold.default_runtime_policy.domain_agent_internal_daemon_allowed, false);
  assert.equal(scaffold.default_runtime_policy.codex_app_drives_long_running_tasks, false);
});
