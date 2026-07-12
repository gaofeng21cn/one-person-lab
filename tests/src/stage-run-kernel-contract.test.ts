import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import './stage-run-kernel-contract-cases/read-model-identity-binding.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/stage-run-kernel-contract.json';
const modulePath = 'src/modules/stagecraft/stage-run-kernel.ts';
const cockpitModulePath = 'src/modules/stagecraft/stage-run-cockpit.ts';

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

function assertIncludesAll(values: string[], expected: string[]) {
  for (const value of expected) assert.ok(values.includes(value), value);
}

function assertBoundaryFalse(boundary: Record<string, unknown>) {
  for (const key of [
    'opl_can_write_domain_truth',
    'opl_can_mutate_artifact_body',
    'opl_can_store_memory_body',
    'opl_can_create_owner_receipt',
    'opl_can_create_typed_blocker',
    'opl_can_authorize_publication_or_quality_verdict',
    'read_model_can_be_truth_source',
    'provider_completion_counts_as_domain_accepted',
    'authorization_receipt_is_domain_owner_answer',
    'queued_attempt_counts_as_active_lease',
    'registered_workflow_counts_as_execution_authorized',
  ]) {
    if (key in boundary) assert.equal(boundary[key], false, key);
  }
}

function currentPointer(stageRunId: string, generation: number) {
  return { stage_run_id: stageRunId, generation, current: true };
}

function refsOnlyAuthorityBoundary() {
  return {
    opl_can_write_domain_truth: false,
    opl_can_create_owner_receipt: false,
    opl_can_create_typed_blocker: false,
  };
}

function activeAttemptRefs(stageRunId: string, generation: number) {
  return {
    provider_attempt_ref: `temporal://attempt/${stageRunId}`,
    attempt_lease_ref: `opl://leases/${stageRunId}:g${generation}`,
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: `opl://execution-authorizations/${stageRunId}:g${generation}`,
  };
}

function closeoutReceiptBinding(stageRunId: string, generation: number) {
  return {
    closeout_receipt_ref: 'mas://receipts/handoff-owner',
    closeout_receipt_stage_run_id: stageRunId,
    closeout_receipt_generation: generation,
    closeout_receipt_manifest_ref: 'mas://stage-manifests/publication-handoff',
    stage_manifest_ref: 'mas://stage-manifests/publication-handoff',
    closeout_receipt_current_pointer_ref: `opl://current-pointers/${stageRunId}:g${generation}`,
    current_pointer_ref: `opl://current-pointers/${stageRunId}:g${generation}`,
    closeout_receipt_source_fingerprint: `sha256:source-${generation}`,
    closeout_receipt_idempotency_key: `${stageRunId}:g${generation}`,
  };
}

function ownerAnswerBinding({
  stageRunId,
  generation,
  ownerAnswerRef,
  ownerAnswerKind,
  manifestRef,
  includeIdempotency = true,
}: {
  stageRunId: string;
  generation: number;
  ownerAnswerRef: string;
  ownerAnswerKind: string;
  manifestRef: string;
  includeIdempotency?: boolean;
}) {
  return {
    owner_answer_ref: ownerAnswerRef,
    owner_answer_kind: ownerAnswerKind,
    owner_answer_stage_run_id: stageRunId,
    owner_answer_generation: generation,
    owner_answer_manifest_ref: manifestRef,
    stage_manifest_ref: manifestRef,
    owner_answer_current_pointer_ref: `opl://current-pointers/${stageRunId}:g${generation}`,
    current_pointer_ref: `opl://current-pointers/${stageRunId}:g${generation}`,
    owner_answer_source_fingerprint: `sha256:source-${generation}`,
    ...(includeIdempotency ? { owner_answer_idempotency_key: `${stageRunId}:g${generation}` } : {}),
  };
}

function stageRunExecutionAuthorizationInput(overrides: Record<string, any> = {}) {
  const stageRunId = overrides.stage_run_id ?? 'stage-run-exec-auth';
  const generation = overrides.generation ?? 1;
  return {
    phase: overrides.phase ?? 'launch',
    stage_run_id: stageRunId,
    domain_id: overrides.domain_id ?? 'mas',
    stage_id: overrides.stage_id ?? 'publication_handoff_owner_gate',
    generation,
    current_pointer: overrides.current_pointer ?? currentPointer(stageRunId, generation),
    selected_executor: overrides.selected_executor ?? 'codex_cli',
    source_fingerprint: overrides.source_fingerprint ?? `sha256:source-${generation}`,
    idempotency_key: overrides.idempotency_key ?? `${stageRunId}:g${generation}`,
    workspace_scope_ref: overrides.workspace_scope_ref ?? `opl://workspace/${stageRunId}`,
    artifact_scope_ref: overrides.artifact_scope_ref ?? `opl://artifacts/${stageRunId}`,
    authority_boundary: overrides.authority_boundary ?? refsOnlyAuthorityBoundary(),
    forbidden_write_required: overrides.forbidden_write_required ?? false,
    ...overrides,
  };
}

function assertBoundCloseoutBinding(binding: Record<string, any>) {
  for (const key of [
    'bound_to_stage_run',
    'bound_to_stage_manifest',
    'bound_to_current_pointer',
    'bound_to_source_fingerprint',
    'bound_to_idempotency_key',
  ]) {
    assert.equal(binding[key], true, key);
  }
}

function assertExecutionAuthorized(report: Record<string, any>) {
  assert.equal(report.status, 'authorized');
  assert.equal(report.execution_authorized, true);
  assert.deepEqual(report.closeout_binding_blockers, []);
  assert.equal(report.opl_runtime_blocker, null);
  assertBoundCloseoutBinding(report.closeout_binding);
}

function assertRuntimeBlockedByCloseoutBinding(report: Record<string, any>) {
  assert.equal(report.opl_runtime_blocker.owner, 'one-person-lab');
  assert.deepEqual(report.opl_runtime_blocker.blocked_authority, ['closeout_receipt_binding']);
  assert.equal(report.opl_runtime_blocker.domain_typed_blocker_created, false);
}

test('StageRun Kernel contract freezes OPL refs-only substrate and MAS authority boundary', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, contractPath)), true, 'StageRun Kernel contract is missing');
  const contract = readJson<Record<string, any>>(contractPath);

  assert.equal(contract.surface_kind, 'opl_stage_run_kernel_contract');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.state, 'active_contract');
  assert.equal(contract.machine_boundary.opl_owns.stage_run_spec, true);
  assert.equal(contract.machine_boundary.opl_owns.stage_run_status, true);
  assert.equal(contract.machine_boundary.opl_owns.event_log, true);
  assert.equal(contract.machine_boundary.opl_owns.projection_rebuild, true);
  assert.equal(contract.machine_boundary.mas_owns.stage_semantics, true);
  assert.equal(contract.machine_boundary.mas_owns.owner_receipt_signing, true);
  assert.equal(contract.machine_boundary.mas_owns.typed_blocker_creation, true);
  assert.equal(contract.machine_boundary.mas_owns.publication_verdict, true);
});

test('StageRun Kernel contract forbids body storage and domain authority promotion', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  assertIncludesAll(contract.forbidden_payloads, [
    'artifact body',
    'memory body',
    'domain truth body',
    'owner receipt body',
    'typed blocker body',
    'publication verdict body',
    'quality verdict body',
  ]);

  assertBoundaryFalse(contract.authority_boundary);
});

test('StageRun Kernel contract separates launch, closeout, advisory, and forbidden authority fields', () => {
  const contract = readJson<Record<string, any>>(contractPath);
  const writingRules = contract.contract_writing_rules;
  const conformance = contract.conformance_output;

  assertIncludesAll(writingRules.required_for_launch, [
    'stage_run_id',
    'domain_id',
    'stage_id',
    'current_pointer',
    'owner',
    'selected_executor',
    'authority_boundary',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
    'workspace_scope_ref',
    'artifact_scope_ref',
    'source_fingerprint',
    'idempotency_key',
  ]);
  assertIncludesAll(writingRules.required_for_closeout, [
    'consumable_artifact_progress_or_owner_answer',
    'current_pointer',
  ]);
  assertIncludesAll(writingRules.required_for_quality_or_ready_closeout, [
    'owner_receipt_or_quality_gate_receipt',
    'closeout_receipt_ref',
    'closeout_receipt_stage_run_binding',
    'closeout_receipt_stage_manifest_binding',
    'closeout_receipt_current_pointer_binding',
    'closeout_receipt_source_fingerprint_binding',
    'closeout_owner_answer_idempotency_binding',
  ]);
  assertIncludesAll(writingRules.advisory_for_context, [
    'prompt_refs',
    'skill_refs',
    'tool_affordance_refs',
    'knowledge_refs',
    'rubric_refs',
    'evaluation_refs',
    'required_role_artifacts',
    'expected_receipt_or_blocker',
    'replay_audit_lineage_refs',
  ]);
  assertIncludesAll(writingRules.route_back_when_missing, [
    'prompt_refs',
    'skill_refs',
    'knowledge_refs',
    'rubric_refs',
    'evaluation_refs',
  ]);
  assertIncludesAll(writingRules.forbidden_as_authority, [
    'stage_progress_log',
    'provider completion',
    'conformance passed',
  ]);

  assertIncludesAll(conformance.required_sections, [
    'status',
    'launch_blockers',
    'closeout_blockers',
    'execution_authorization',
    'closeout_binding_blockers',
    'transition_outcome',
    'quality_debt_reasons',
    'advisory_warnings',
    'forbidden_authority_flags',
  ]);
  assertIncludesAll(conformance.default_blocking_sections, [
    'launch_blockers',
    'closeout_blockers',
    'execution_authorization',
    'closeout_binding_blockers',
  ]);
  assertIncludesAll(conformance.non_blocking_default_sections, [
    'quality_debt_reasons',
    'advisory_warnings',
    'route_back_recommendations',
    'audit_drilldown_refs',
  ]);
});

test('StageRun Kernel contract freezes launch closeout and advisory conformance layers', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  assertIncludesAll(contract.admission_policy.launch_hard_blockers, [
    'identity',
    'owner',
    'selected_executor',
    'authority_boundary',
    'forbidden_write',
    'provider_attempt',
    'attempt_lease',
    'execution_authorization_decision',
    'workspace_artifact_scope',
    'source_fingerprint',
    'idempotency_key',
  ]);
  assert.equal(contract.admission_policy.strategy_refs_default, 'advisory_or_route_back');
  assert.equal(contract.admission_policy.prompt_skill_tool_knowledge_missing_blocks_launch_by_default, false);
  assertIncludesAll(contract.admission_policy.closeout_hard_blockers, [
    'zero_consumable_artifact_without_owner_answer_or_hard_stop',
    'current_pointer',
    'generation',
    'invalid_supplied_owner_answer_binding',
  ]);
  assertIncludesAll(contract.conformance_output.layers, [
    'launch_blockers',
    'closeout_blockers',
    'execution_authorization',
    'closeout_binding_blockers',
    'transition_outcome',
    'quality_debt_reasons',
    'advisory_warnings',
    'route_back_recommendations',
    'audit_drilldown_refs',
    'forbidden_authority_flags',
  ]);
  assert.equal(contract.conformance_output.default_blocking_layers_only.includes('advisory_warnings'), false);
  assert.equal(contract.execution_authorization_policy.blocked_result.owner, 'one-person-lab');
  assert.equal(
    contract.execution_authorization_policy.blocked_result.blocker_code,
    'stage_run_execution_authorization_blocked',
  );
  assert.equal(contract.execution_authorization_policy.blocked_result.domain_typed_blocker_created, false);
  assert.deepEqual(contract.execution_authorization_policy.ledger_surface.cli_commands, [
    'opl runtime stage-run-authorization record',
    'opl runtime stage-run-authorization verify',
    'opl runtime stage-run-authorization list',
  ]);
  assert.equal(
    contract.execution_authorization_policy.ledger_surface.authority_boundary.refs_only,
    true,
  );
  assertBoundaryFalse(contract.execution_authorization_policy.ledger_surface.authority_boundary);
  assertIncludesAll(contract.execution_authorization_policy.closeout_binding_blockers, [
    'closeout_owner_answer_idempotency_binding_missing',
    'quality_gate_independent_attempt_binding_missing',
    'quality_gate_same_attempt_self_review_forbidden',
  ]);
  assert.equal(contract.forbidden_as_authority.includes('provider completion'), true);
  assert.equal(contract.forbidden_as_authority.includes('conformance passed'), true);
});

test('StageRun Kernel primitive rebuilds refs-only read model from event log', async () => {
  assert.equal(fs.existsSync(path.join(repoRoot, modulePath)), true, 'StageRun Kernel primitive module is missing');
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-1',
      generation: 1,
      spec_ref: 'mas://stage-spec/ai-reviewer-rebuild',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'inputs_ready',
      stage_run_id: 'stage-run-1',
      generation: 1,
      input_refs: ['mas://artifact-ref/manuscript'],
      input_fingerprint: 'sha256:input-1',
      observed_at: '2026-06-05T00:01:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-3',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-1',
      generation: 1,
      owner_receipt_ref: 'mas://owner-receipt/stage-run-1',
      observed_at: '2026-06-05T00:02:00.000Z',
    }),
  ]);

  assert.equal(readModel.surface_kind, 'opl_stage_run_read_model');
  assert.equal(readModel.projection_role, 'rebuildable_refs_only_projection');
  assert.equal(readModel.stage_runs.length, 1);
  assert.equal(readModel.stage_runs[0].status, 'domain_accepted');
  assert.equal(readModel.stage_runs[0].observed_generation, 1);
  assert.deepEqual(readModel.stage_runs[0].consumed_refs, ['mas://artifact-ref/manuscript']);
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, ['mas://owner-receipt/stage-run-1']);
  assert.equal(readModel.stage_runs[0].artifact_body_included, false);
  assert.equal(readModel.stage_runs[0].memory_body_included, false);
  assert.equal(readModel.stage_runs[0].domain_truth_included, false);
  assert.equal(readModel.authority_boundary.opl_can_create_owner_receipt, false);
  assert.equal(readModel.authority_boundary.read_model_can_be_truth_source, false);
});

test('StageRun Kernel primitive keeps provider completion terminalizing until owner receipt or typed blocker', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-provider-completed',
      generation: 1,
      spec_ref: 'mas://stage-spec/ai-reviewer-rebuild',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-2',
      event_kind: 'provider_completed',
      stage_run_id: 'stage-run-provider-completed',
      generation: 1,
      provider_attempt_ref: 'temporal://attempt/provider-completed',
      observed_at: '2026-06-05T00:10:00.000Z',
    }),
  ]);

  assert.equal(readModel.stage_runs[0].status, 'terminalizing');
  assert.deepEqual(readModel.stage_runs[0].provider_attempt_refs, ['temporal://attempt/provider-completed']);
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, []);
  assert.deepEqual(readModel.stage_runs[0].typed_blocker_refs, []);
  assert.equal(readModel.authority_boundary.provider_completion_counts_as_domain_accepted, false);
});

test('StageRun Kernel primitive ignores stale generation receipts for current closeout', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const readModel = module.rebuildStageRunReadModel([
    module.stageRunEvent({
      event_id: 'event-old-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-generation',
      generation: 1,
      spec_ref: 'mas://stage-spec/old',
      observed_at: '2026-06-05T00:00:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-old-2',
      event_kind: 'owner_receipt_observed',
      stage_run_id: 'stage-run-generation',
      generation: 1,
      owner_receipt_ref: 'mas://owner-receipt/old',
      observed_at: '2026-06-05T00:01:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-new-1',
      event_kind: 'stage_run_declared',
      stage_run_id: 'stage-run-generation',
      generation: 2,
      spec_ref: 'mas://stage-spec/current',
      observed_at: '2026-06-05T00:02:00.000Z',
    }),
    module.stageRunEvent({
      event_id: 'event-new-2',
      event_kind: 'provider_completed',
      stage_run_id: 'stage-run-generation',
      generation: 2,
      provider_attempt_ref: 'temporal://attempt/current',
      observed_at: '2026-06-05T00:03:00.000Z',
    }),
  ]);

  assert.equal(readModel.stage_runs[0].observed_generation, 2);
  assert.equal(readModel.stage_runs[0].status, 'terminalizing');
  assert.equal(readModel.stage_runs[0].spec_ref, 'mas://stage-spec/current');
  assert.deepEqual(readModel.stage_runs[0].owner_receipt_refs, []);
  assert.deepEqual(readModel.stage_runs[0].provider_attempt_refs, ['temporal://attempt/current']);
});

test('StageRun launch admission treats missing strategy refs as advisory instead of hard blockers', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'launch',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: currentPointer('stage-run-1', 1),
    owner: 'mas',
    scope_refs: ['mas://study/DM002'],
    selected_executor: 'codex_cli',
    authority_boundary: refsOnlyAuthorityBoundary(),
    required_role_artifacts: ['ai_reviewer_record'],
    expected_receipt_or_blocker_shape: 'owner_receipt_or_typed_blocker',
    input_refs: ['mas://artifact/manuscript'],
    replay_audit_refs: ['opl://lineage/stage-run-1'],
    missing_strategy_refs: ['prompt_refs', 'skill_refs', 'knowledge_refs'],
  });

  assert.equal(report.status, 'passed_with_advisory');
  assert.deepEqual(report.launch_blockers, []);
  assert.deepEqual(report.closeout_blockers, []);
  assert.deepEqual(report.advisory_warnings, [
    'strategy_ref_missing:prompt_refs',
    'strategy_ref_missing:skill_refs',
    'strategy_ref_missing:knowledge_refs',
  ]);
  assert.equal(report.default_blocked, false);
});

test('StageRun closeout admission keeps advisory route-back refs out of closeout hard blockers', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'closeout',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: currentPointer('stage-run-1', 1),
    manifest_valid: true,
    required_role_artifacts: ['ai_reviewer_record'],
    produced_role_artifacts: ['ai_reviewer_record'],
    content_hashes: ['sha256:abc'],
    lineage_refs: ['opl://lineage/stage-run-1'],
    owner_receipt_refs: ['mas://owner-receipt/stage-run-1'],
    typed_blocker_refs: [],
    missing_strategy_refs: [
      'prompt_refs',
      'skill_refs',
      'tool_affordance_refs',
      'knowledge_refs',
      'rubric_refs',
      'controlled_canary_evidence_refs',
    ],
    route_back_missing_refs: ['quality_gap_receipt_ref'],
    audit_drilldown_refs: ['opl://audit/stage-run-1'],
  });

  assert.equal(report.status, 'passed_with_advisory');
  assert.deepEqual(report.launch_blockers, []);
  assert.deepEqual(report.closeout_blockers, []);
  assert.deepEqual(report.forbidden_authority_flags, []);
  assert.deepEqual(report.advisory_warnings, [
    'strategy_ref_missing:prompt_refs',
    'strategy_ref_missing:skill_refs',
    'strategy_ref_missing:tool_affordance_refs',
    'strategy_ref_missing:knowledge_refs',
    'strategy_ref_missing:rubric_refs',
    'strategy_ref_missing:controlled_canary_evidence_refs',
  ]);
  assert.deepEqual(report.route_back_recommendations, [
    'route_back_missing:quality_gap_receipt_ref',
  ]);
  assert.deepEqual(report.audit_drilldown_refs, ['opl://audit/stage-run-1']);
  assert.equal(report.default_blocked, false);
});

test('StageRun closeout admission advances consumable artifacts without owner receipt as quality debt', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'closeout',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: currentPointer('stage-run-1', 1),
    manifest_valid: true,
    required_role_artifacts: ['ai_reviewer_record'],
    produced_role_artifacts: ['ai_reviewer_record'],
    content_hashes: ['sha256:abc'],
    lineage_refs: ['opl://lineage/stage-run-1'],
    consumable_artifact_refs: ['mas://artifacts/ai-reviewer-record'],
    provider_completed: true,
    read_model_refreshed: true,
    owner_receipt_refs: [],
    typed_blocker_refs: [],
  });

  assert.equal(report.status, 'passed_with_advisory');
  assert.deepEqual(report.launch_blockers, []);
  assert.deepEqual(report.closeout_blockers, []);
  assert.deepEqual(report.forbidden_authority_flags, []);
  assert.equal(report.transition_outcome, 'completed_with_quality_debt');
  assert.deepEqual(report.quality_debt_reasons, ['owner_answer_missing_for_quality_or_ready_claim']);
  assert.equal(report.default_blocked, false);
});

test('StageRun closeout admission treats provider and conformance signals as non-authoritative advisory context', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'closeout',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: currentPointer('stage-run-1', 1),
    manifest_valid: true,
    required_role_artifacts: ['ai_reviewer_record'],
    produced_role_artifacts: ['ai_reviewer_record'],
    content_hashes: ['sha256:abc'],
    lineage_refs: ['opl://lineage/stage-run-1'],
    owner_receipt_refs: ['mas://owner-receipt/stage-run-1'],
    typed_blocker_refs: [],
    provider_completed: true,
    conformance_passed: true,
  });

  assert.equal(report.status, 'passed_with_advisory');
  assert.deepEqual(report.closeout_blockers, []);
  assert.deepEqual(report.forbidden_authority_flags, []);
  assert.equal(report.transition_outcome, 'completed');
  assert.equal(report.default_blocked, false);
});

test('StageRun execution authorization blocks launch without provider attempt lease and decision', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunExecutionAuthorization(stageRunExecutionAuthorizationInput());

  assert.equal(report.surface_kind, 'opl_stage_run_execution_authorization_report');
  assert.equal(report.status, 'blocked');
  assert.equal(report.execution_authorized, false);
  assert.deepEqual(report.launch_blockers, [
    'provider_attempt_ref_missing',
    'attempt_lease_ref_missing',
    'execution_authorization_decision_ref_missing',
  ]);
  assert.deepEqual(report.closeout_binding_blockers, []);
  assert.equal(report.opl_runtime_blocker.owner, 'one-person-lab');
  assert.equal(report.opl_runtime_blocker.blocker_code, 'stage_run_execution_authorization_blocked');
  assert.deepEqual(report.opl_runtime_blocker.blocked_authority, [
    'execution_authorization',
  ]);
  assert.equal(report.authority_boundary.opl_can_create_typed_blocker, false);
  assert.equal(report.authority_boundary.opl_can_create_execution_authorization_blocker, true);
  assert.equal(report.authority_boundary.execution_blocker_is_domain_typed_blocker, false);
});

test('StageRun execution authorization binds closeout receipt to current manifest pointer and source fingerprint', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const stageRunId = 'stage-run-exec-auth';
  const generation = 2;
  const report = module.evaluateStageRunExecutionAuthorization(stageRunExecutionAuthorizationInput({
    phase: 'closeout',
    generation,
    ...activeAttemptRefs(stageRunId, generation),
    ...closeoutReceiptBinding(stageRunId, generation),
    missing_strategy_refs: [
      'prompt_refs',
      'skill_refs',
      'tool_affordance_refs',
      'knowledge_refs',
      'rubric_refs',
      'controlled_canary_evidence_refs',
    ],
    route_back_missing_refs: ['quality_gap_receipt_ref'],
    audit_drilldown_refs: ['opl://audit/stage-run-exec-auth'],
  }));

  assertExecutionAuthorized(report);
  assert.deepEqual(report.launch_blockers, []);
});

test('StageRun execution authorization advances a consumable artifact without owner answer as quality debt', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const stageRunId = 'stage-run-progress-first';
  const generation = 2;
  const report = module.evaluateStageRunExecutionAuthorization(stageRunExecutionAuthorizationInput({
    phase: 'closeout',
    stage_run_id: stageRunId,
    generation,
    ...activeAttemptRefs(stageRunId, generation),
    consumable_artifact_refs: ['mas://artifacts/current-stage-draft'],
  }));

  assert.equal(report.status, 'authorized');
  assert.equal(report.execution_authorized, true);
  assert.deepEqual(report.closeout_binding_blockers, []);
  assert.deepEqual(report.quality_debt_reasons, ['owner_answer_missing_for_quality_or_ready_claim']);
  assert.equal(report.transition_authorized_with_quality_debt, true);
  assert.equal(report.opl_runtime_blocker, null);
});

test('StageRun execution authorization binds typed blocker answer to StageRun manifest pointer source and idempotency', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const stageRunId = 'stage-run-typed-blocker';
  const generation = 3;
  const report = module.evaluateStageRunExecutionAuthorization(stageRunExecutionAuthorizationInput({
    phase: 'closeout',
    stage_run_id: stageRunId,
    generation,
    ...activeAttemptRefs(stageRunId, generation),
    ...ownerAnswerBinding({
      stageRunId,
      generation,
      ownerAnswerRef: 'mas://typed-blockers/publication-handoff',
      ownerAnswerKind: 'typed_blocker',
      manifestRef: 'mas://stage-manifests/publication-handoff',
    }),
  }));

  assertExecutionAuthorized(report);
  assert.equal(report.closeout_binding.owner_answer_kind, 'typed_blocker');
  assert.equal(report.closeout_binding.owner_answer_ref, 'mas://typed-blockers/publication-handoff');
});

test('StageRun execution authorization fails closed on quality gate self-review closeout', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const stageRunId = 'stage-run-quality-gate';
  const generation = 4;
  const report = module.evaluateStageRunExecutionAuthorization(stageRunExecutionAuthorizationInput({
    phase: 'closeout',
    stage_run_id: stageRunId,
    stage_id: 'publication_quality_review',
    stage_kind: 'review',
    generation,
    ...activeAttemptRefs(stageRunId, generation),
    ...ownerAnswerBinding({
      stageRunId,
      generation,
      ownerAnswerRef: 'mas://quality-gates/publication-review',
      ownerAnswerKind: 'quality_gate_receipt',
      manifestRef: 'mas://stage-manifests/publication-quality-review',
    }),
    quality_gate_attempt_ref: 'temporal://attempt/stage-run-quality-gate',
  }));

  assert.equal(report.status, 'blocked');
  assert.equal(report.execution_authorized, false);
  assert.equal(
    report.closeout_binding_blockers.includes('quality_gate_same_attempt_self_review_forbidden'),
    true,
  );
  assert.equal(
    report.closeout_binding_blockers.includes('quality_gate_independent_attempt_binding_missing'),
    false,
  );
  assertRuntimeBlockedByCloseoutBinding(report);
});

test('StageRun execution authorization authorizes independent quality gate receipt binding', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const stageRunId = 'stage-run-quality-gate-independent';
  const generation = 5;
  const report = module.evaluateStageRunExecutionAuthorization(stageRunExecutionAuthorizationInput({
    phase: 'closeout',
    stage_run_id: stageRunId,
    stage_id: 'publication_quality_review',
    stage_kind: 'review',
    generation,
    ...activeAttemptRefs(stageRunId, generation),
    ...ownerAnswerBinding({
      stageRunId,
      generation,
      ownerAnswerRef: 'mas://quality-gates/publication-review-independent',
      ownerAnswerKind: 'quality_gate_receipt',
      manifestRef: 'mas://stage-manifests/publication-quality-review',
    }),
    quality_gate_attempt_ref: 'temporal://attempt/stage-run-quality-gate-independent-reviewer',
  }));

  assertExecutionAuthorized(report);
  assert.equal(report.closeout_binding.owner_answer_kind, 'quality_gate_receipt');
});

test('StageRun execution authorization fails closed when owner answer idempotency binding is absent', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const stageRunId = 'stage-run-typed-blocker';
  const generation = 3;
  const report = module.evaluateStageRunExecutionAuthorization(stageRunExecutionAuthorizationInput({
    phase: 'closeout',
    stage_run_id: stageRunId,
    generation,
    ...activeAttemptRefs(stageRunId, generation),
    ...ownerAnswerBinding({
      stageRunId,
      generation,
      ownerAnswerRef: 'mas://typed-blockers/publication-handoff',
      ownerAnswerKind: 'typed_blocker',
      manifestRef: 'mas://stage-manifests/publication-handoff',
      includeIdempotency: false,
    }),
  }));

  assert.equal(report.status, 'blocked');
  assert.equal(report.execution_authorized, false);
  assert.equal(
    report.closeout_binding_blockers.includes('closeout_owner_answer_idempotency_binding_missing'),
    true,
  );
  assertRuntimeBlockedByCloseoutBinding(report);
});

test('App StageRun cockpit consumes typed blocker owner answer binding refs', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, cockpitModulePath)).href);
  const stageRunId = 'app-stage-run:medautoscience:publication-handoff-owner-gate';
  const currentPointerRef = `opl://current-pointers/${stageRunId}:g0`;
  const cockpit = module.buildAppStageRunCockpit({
    domain: 'medautoscience',
    current_owner: 'publication_gate_owner',
    stage_ref: 'publication_handoff_owner_gate',
    desired_delta_kind: 'typed_blocker',
    desired_delta_description: 'publication_handoff_owner_receipt_or_typed_blocker',
    accepted_answer_shape: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
    task_or_study_ref: 'mas://study/DM002',
    lineage_ref: 'mas://stage-artifact-unit/DM002/08-publication_package_handoff',
    source_fingerprint: 'sha256:dm002-publication-terminal',
    delta_id: 'dm002-publication-handoff:g0',
    live_attempt_ref: 'temporal://attempt/dm002-publication-handoff',
    latest_typed_blocker_ref: 'mas://typed-blockers/dm002/publication-handoff',
    hard_gate: {
      attempt_lease_ref: 'opl://leases/dm002-publication-handoff:g0',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref: 'opl://execution-authorizations/dm002-publication-handoff:g0',
      owner_answer_kind: 'typed_blocker',
      owner_answer_stage_run_id: stageRunId,
      owner_answer_generation: 0,
      owner_answer_manifest_ref: 'mas://stage-manifests/dm002/publication-handoff',
      stage_manifest_ref: 'mas://stage-manifests/dm002/publication-handoff',
      owner_answer_current_pointer_ref: currentPointerRef,
      current_pointer_ref: currentPointerRef,
      owner_answer_source_fingerprint: 'sha256:dm002-publication-terminal',
      owner_answer_idempotency_key: 'dm002-publication-handoff:g0',
    },
    audit_refs: {
      app_operator_drilldown_ref: 'opl://drilldown/current-owner-delta',
      workspace_scope_ref: 'mas://workspace/DM002',
      artifact_scope_ref: 'mas://stage-artifact-unit/DM002/08-publication_package_handoff',
    },
  });

  assertExecutionAuthorized(cockpit.execution_authorization);
  assert.equal(
    cockpit.execution_authorization.closeout_binding.owner_answer_ref,
    'mas://typed-blockers/dm002/publication-handoff',
  );
  assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_kind, 'typed_blocker');
  assert.equal(cockpit.next_required_owner_action, null);
});

test('App StageRun cockpit advances validated consumable artifact progress without owner answer', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, cockpitModulePath)).href);
  const cockpit = module.buildAppStageRunCockpit({
    domain: 'redcube-ai',
    current_owner: 'redcube_ai',
    stage_ref: 'author_image_pages',
    desired_delta_description: 'advance_best_available_visual_artifact',
    accepted_answer_shape: ['progress_delta_receipt_ref', 'typed_blocker_ref'],
    consumable_artifact_refs: ['rca://artifacts/slide-001.png'],
    progress_delta_receipt_ref: 'opl://progress-delta/rca/slide-001',
    task_or_study_ref: 'rca://deliverables/deck-001',
    lineage_ref: 'rca://stage-artifact-unit/deck-001/author-image-pages',
    source_fingerprint: 'sha256:deck-001-author-image-pages',
    delta_id: 'deck-001-author-image-pages:g0',
    live_attempt_ref: 'opl://attempts/deck-001-author-image-pages',
    hard_gate: {
      attempt_lease_ref: 'opl://leases/deck-001-author-image-pages:g0',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref:
        'opl://execution-authorizations/deck-001-author-image-pages:g0',
    },
    audit_refs: {
      app_operator_drilldown_ref: 'opl://drilldown/deck-001-author-image-pages',
      workspace_scope_ref: 'rca://workspace/deck-001',
      artifact_scope_ref: 'rca://stage-artifact-unit/deck-001/author-image-pages',
    },
  });

  assert.equal(cockpit.closeout_admission.status, 'passed_with_advisory');
  assert.equal(cockpit.closeout_admission.transition_outcome, 'completed_with_quality_debt');
  assert.equal(cockpit.execution_authorization.status, 'authorized');
  assert.equal(cockpit.execution_authorization.execution_authorized, true);
  assert.deepEqual(cockpit.execution_authorization.closeout_binding_blockers, []);
  assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_ref, null);
  assert.equal(cockpit.execution_authorization.transition_authorized_with_quality_debt, true);
  assert.equal(
    cockpit.stage_run_current_owner_delta.missing_role_or_answer_summary
      .progress_receipt_or_owner_answer_or_hard_stop_missing,
    false,
  );
  assert.equal(cockpit.next_required_owner_action, null);
});
