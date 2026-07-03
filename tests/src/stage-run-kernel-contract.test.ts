import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import './stage-run-kernel-contract-cases/read-model-identity-binding.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/stage-run-kernel-contract.json';
const modulePath = 'src/modules/stagecraft/stage-run-kernel.ts';
const cockpitModulePath = 'src/modules/console/app-state-stage-run-cockpit.ts';

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
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

  for (const payload of [
    'artifact body',
    'memory body',
    'domain truth body',
    'owner receipt body',
    'typed blocker body',
    'publication verdict body',
    'quality verdict body',
  ]) {
    assert.equal(contract.forbidden_payloads.includes(payload), true, `missing forbidden payload ${payload}`);
  }

  assert.equal(contract.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(contract.authority_boundary.opl_can_mutate_artifact_body, false);
  assert.equal(contract.authority_boundary.opl_can_store_memory_body, false);
  assert.equal(contract.authority_boundary.opl_can_create_owner_receipt, false);
  assert.equal(contract.authority_boundary.opl_can_create_typed_blocker, false);
  assert.equal(contract.authority_boundary.opl_can_authorize_publication_or_quality_verdict, false);
  assert.equal(contract.authority_boundary.read_model_can_be_truth_source, false);
  assert.equal(contract.authority_boundary.provider_completion_counts_as_domain_accepted, false);
});

test('StageRun Kernel contract separates launch, closeout, advisory, and forbidden authority fields', () => {
  const contract = readJson<Record<string, any>>(contractPath);
  const writingRules = contract.contract_writing_rules;
  const conformance = contract.conformance_output;

  assert.deepEqual(writingRules.required_for_launch, [
    'stage_run_id',
    'domain_id',
    'stage_id',
    'generation',
    'current_pointer',
    'stage_manifest',
    'owner',
    'selected_executor',
    'authority_boundary',
    'required_role_artifacts',
    'expected_receipt_or_blocker',
    'input_refs',
    'replay_audit_lineage_refs',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
    'workspace_scope_ref',
    'artifact_scope_ref',
    'source_fingerprint',
    'idempotency_key',
  ]);
  assert.deepEqual(writingRules.required_for_closeout, [
    'current_generation_role_artifacts',
    'stage_manifest_validity',
    'owner_receipt_or_typed_blocker',
    'current_pointer',
    'content_hashes',
    'lineage_refs',
    'closeout_receipt_ref',
    'closeout_receipt_stage_run_binding',
    'closeout_receipt_stage_manifest_binding',
    'closeout_receipt_current_pointer_binding',
    'closeout_receipt_source_fingerprint_binding',
    'closeout_owner_answer_idempotency_binding',
  ]);
  assert.deepEqual(writingRules.advisory_for_context, [
    'prompt_refs',
    'skill_refs',
    'tool_affordance_refs',
    'knowledge_refs',
    'rubric_refs',
    'evaluation_refs',
    'assumption_refs',
    'monitor_refs',
  ]);
  assert.deepEqual(writingRules.route_back_when_missing, [
    'prompt_refs',
    'skill_refs',
    'tool_affordance_refs',
    'knowledge_refs',
    'rubric_refs',
    'evaluation_refs',
  ]);
  assert.deepEqual(writingRules.forbidden_as_authority, [
    'State Index',
    'stage_progress_log',
    'provider completion',
    'readiness',
    'verified ledger',
    'file presence',
    'conformance passed',
  ]);

  assert.deepEqual(conformance.required_sections, [
    'status',
    'launch_blockers',
    'closeout_blockers',
    'execution_authorization',
    'closeout_binding_blockers',
    'advisory_warnings',
    'route_back_recommendations',
    'audit_drilldown_refs',
    'forbidden_authority_flags',
  ]);
  assert.deepEqual(conformance.default_blocking_sections, [
    'launch_blockers',
    'closeout_blockers',
    'execution_authorization',
    'closeout_binding_blockers',
  ]);
  assert.deepEqual(conformance.non_blocking_default_sections, [
    'advisory_warnings',
    'route_back_recommendations',
    'audit_drilldown_refs',
  ]);
});

test('StageRun Kernel contract freezes launch closeout and advisory conformance layers', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  assert.deepEqual(contract.admission_policy.launch_hard_blockers, [
    'identity',
    'owner',
    'scope',
    'selected_executor',
    'authority_boundary',
    'required_role_artifacts',
    'expected_receipt_or_typed_blocker_shape',
    'forbidden_write',
    'replay_audit_lineage',
    'provider_attempt',
    'attempt_lease',
    'execution_authorization_decision',
    'workspace_artifact_scope',
    'source_fingerprint',
    'idempotency_key',
  ]);
  assert.equal(contract.admission_policy.strategy_refs_default, 'advisory_or_route_back');
  assert.equal(contract.admission_policy.prompt_skill_tool_knowledge_missing_blocks_launch_by_default, false);
  assert.deepEqual(contract.admission_policy.closeout_hard_blockers, [
    'required_role_artifacts',
    'manifest_validity',
    'owner_receipt_or_typed_blocker',
    'current_pointer',
    'content_hash',
    'generation',
    'lineage_refs',
    'closeout_receipt_binding',
  ]);
  assert.deepEqual(contract.conformance_output.layers, [
    'launch_blockers',
    'closeout_blockers',
    'execution_authorization',
    'closeout_binding_blockers',
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
  assert.equal(
    contract.execution_authorization_policy.ledger_surface.authority_boundary
      .authorization_receipt_is_domain_owner_answer,
    false,
  );
  assert.equal(
    contract.execution_authorization_policy.ledger_surface.authority_boundary
      .queued_attempt_counts_as_active_lease,
    false,
  );
  assert.equal(
    contract.execution_authorization_policy.ledger_surface.authority_boundary
      .registered_workflow_counts_as_execution_authorized,
    false,
  );
  assert.equal(
    contract.execution_authorization_policy.closeout_binding_blockers.includes(
      'closeout_owner_answer_idempotency_binding_missing',
    ),
    true,
  );
  assert.equal(
    contract.execution_authorization_policy.closeout_binding_blockers.includes(
      'quality_gate_independent_attempt_binding_missing',
    ),
    true,
  );
  assert.equal(
    contract.execution_authorization_policy.closeout_binding_blockers.includes(
      'quality_gate_same_attempt_self_review_forbidden',
    ),
    true,
  );
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
    current_pointer: {
      stage_run_id: 'stage-run-1',
      generation: 1,
      current: true,
    },
    owner: 'mas',
    scope_refs: ['mas://study/DM002'],
    selected_executor: 'codex_cli',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
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
    current_pointer: {
      stage_run_id: 'stage-run-1',
      generation: 1,
      current: true,
    },
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

test('StageRun closeout admission rejects provider completion without owner receipt or typed blocker', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'closeout',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: {
      stage_run_id: 'stage-run-1',
      generation: 1,
      current: true,
    },
    manifest_valid: true,
    required_role_artifacts: ['ai_reviewer_record'],
    produced_role_artifacts: ['ai_reviewer_record'],
    content_hashes: ['sha256:abc'],
    lineage_refs: ['opl://lineage/stage-run-1'],
    provider_completed: true,
    read_model_refreshed: true,
    owner_receipt_refs: [],
    typed_blocker_refs: [],
  });

  assert.equal(report.status, 'blocked');
  assert.deepEqual(report.launch_blockers, []);
  assert.deepEqual(report.closeout_blockers, ['owner_receipt_or_typed_blocker_missing']);
  assert.equal(report.forbidden_authority_flags.includes('provider_completed_cannot_close_stage'), true);
  assert.equal(report.forbidden_authority_flags.includes('read_model_refreshed_cannot_close_stage'), true);
  assert.equal(report.default_blocked, true);
});

test('StageRun closeout admission blocks forbidden authority signals even with owner receipt', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunAdmission({
    phase: 'closeout',
    stage_run_id: 'stage-run-1',
    domain_id: 'mas',
    stage_id: 'ai_reviewer_publication_eval_rebuild',
    generation: 1,
    current_pointer: {
      stage_run_id: 'stage-run-1',
      generation: 1,
      current: true,
    },
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

  assert.equal(report.status, 'blocked');
  assert.deepEqual(report.closeout_blockers, []);
  assert.deepEqual(report.forbidden_authority_flags, [
    'provider_completed_cannot_close_stage',
    'conformance_passed_cannot_close_stage',
  ]);
  assert.equal(report.default_blocked, true);
});

test('StageRun execution authorization blocks launch without provider attempt lease and decision', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunExecutionAuthorization({
    phase: 'launch',
    stage_run_id: 'stage-run-exec-auth',
    domain_id: 'mas',
    stage_id: 'publication_handoff_owner_gate',
    generation: 1,
    current_pointer: {
      stage_run_id: 'stage-run-exec-auth',
      generation: 1,
      current: true,
    },
    selected_executor: 'codex_cli',
    source_fingerprint: 'sha256:source-1',
    idempotency_key: 'stage-run-exec-auth:g1',
    workspace_scope_ref: 'opl://workspace/stage-run-exec-auth',
    artifact_scope_ref: 'opl://artifacts/stage-run-exec-auth',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: false,
  });

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
  const report = module.evaluateStageRunExecutionAuthorization({
    phase: 'closeout',
    stage_run_id: 'stage-run-exec-auth',
    domain_id: 'mas',
    stage_id: 'publication_handoff_owner_gate',
    generation: 2,
    current_pointer: {
      stage_run_id: 'stage-run-exec-auth',
      generation: 2,
      current: true,
    },
    selected_executor: 'codex_cli',
    source_fingerprint: 'sha256:source-2',
    idempotency_key: 'stage-run-exec-auth:g2',
    provider_attempt_ref: 'temporal://attempt/stage-run-exec-auth',
    attempt_lease_ref: 'opl://leases/stage-run-exec-auth:g2',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: 'opl://execution-authorizations/stage-run-exec-auth:g2',
    workspace_scope_ref: 'opl://workspace/stage-run-exec-auth',
    artifact_scope_ref: 'opl://artifacts/stage-run-exec-auth',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: false,
    closeout_receipt_ref: 'mas://receipts/handoff-owner',
    closeout_receipt_stage_run_id: 'stage-run-exec-auth',
    closeout_receipt_generation: 2,
    closeout_receipt_manifest_ref: 'mas://stage-manifests/publication-handoff',
    stage_manifest_ref: 'mas://stage-manifests/publication-handoff',
    closeout_receipt_current_pointer_ref: 'opl://current-pointers/stage-run-exec-auth:g2',
    current_pointer_ref: 'opl://current-pointers/stage-run-exec-auth:g2',
    closeout_receipt_source_fingerprint: 'sha256:source-2',
    closeout_receipt_idempotency_key: 'stage-run-exec-auth:g2',
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
  });

  assert.equal(report.status, 'authorized');
  assert.equal(report.execution_authorized, true);
  assert.deepEqual(report.launch_blockers, []);
  assert.deepEqual(report.closeout_binding_blockers, []);
  assert.equal(report.opl_runtime_blocker, null);
  assert.equal(report.closeout_binding.bound_to_stage_run, true);
  assert.equal(report.closeout_binding.bound_to_stage_manifest, true);
  assert.equal(report.closeout_binding.bound_to_current_pointer, true);
  assert.equal(report.closeout_binding.bound_to_source_fingerprint, true);
  assert.equal(report.closeout_binding.bound_to_idempotency_key, true);
});

test('StageRun execution authorization binds typed blocker answer to StageRun manifest pointer source and idempotency', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunExecutionAuthorization({
    phase: 'closeout',
    stage_run_id: 'stage-run-typed-blocker',
    domain_id: 'mas',
    stage_id: 'publication_handoff_owner_gate',
    generation: 3,
    current_pointer: {
      stage_run_id: 'stage-run-typed-blocker',
      generation: 3,
      current: true,
    },
    selected_executor: 'codex_cli',
    source_fingerprint: 'sha256:source-3',
    idempotency_key: 'stage-run-typed-blocker:g3',
    provider_attempt_ref: 'temporal://attempt/stage-run-typed-blocker',
    attempt_lease_ref: 'opl://leases/stage-run-typed-blocker:g3',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: 'opl://execution-authorizations/stage-run-typed-blocker:g3',
    workspace_scope_ref: 'opl://workspace/stage-run-typed-blocker',
    artifact_scope_ref: 'opl://artifacts/stage-run-typed-blocker',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: false,
    owner_answer_ref: 'mas://typed-blockers/publication-handoff',
    owner_answer_kind: 'typed_blocker',
    owner_answer_stage_run_id: 'stage-run-typed-blocker',
    owner_answer_generation: 3,
    owner_answer_manifest_ref: 'mas://stage-manifests/publication-handoff',
    stage_manifest_ref: 'mas://stage-manifests/publication-handoff',
    owner_answer_current_pointer_ref: 'opl://current-pointers/stage-run-typed-blocker:g3',
    current_pointer_ref: 'opl://current-pointers/stage-run-typed-blocker:g3',
    owner_answer_source_fingerprint: 'sha256:source-3',
    owner_answer_idempotency_key: 'stage-run-typed-blocker:g3',
  });

  assert.equal(report.status, 'authorized');
  assert.equal(report.execution_authorized, true);
  assert.equal(report.opl_runtime_blocker, null);
  assert.equal(report.closeout_binding.owner_answer_kind, 'typed_blocker');
  assert.equal(report.closeout_binding.owner_answer_ref, 'mas://typed-blockers/publication-handoff');
  assert.deepEqual(report.closeout_binding_blockers, []);
  assert.equal(report.closeout_binding.bound_to_stage_run, true);
  assert.equal(report.closeout_binding.bound_to_stage_manifest, true);
  assert.equal(report.closeout_binding.bound_to_current_pointer, true);
  assert.equal(report.closeout_binding.bound_to_source_fingerprint, true);
  assert.equal(report.closeout_binding.bound_to_idempotency_key, true);
});

test('StageRun execution authorization fails closed on quality gate self-review closeout', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunExecutionAuthorization({
    phase: 'closeout',
    stage_run_id: 'stage-run-quality-gate',
    domain_id: 'mas',
    stage_id: 'publication_quality_review',
    stage_kind: 'review',
    generation: 4,
    current_pointer: {
      stage_run_id: 'stage-run-quality-gate',
      generation: 4,
      current: true,
    },
    selected_executor: 'codex_cli',
    source_fingerprint: 'sha256:source-4',
    idempotency_key: 'stage-run-quality-gate:g4',
    provider_attempt_ref: 'temporal://attempt/stage-run-quality-gate',
    attempt_lease_ref: 'opl://leases/stage-run-quality-gate:g4',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: 'opl://execution-authorizations/stage-run-quality-gate:g4',
    workspace_scope_ref: 'opl://workspace/stage-run-quality-gate',
    artifact_scope_ref: 'opl://artifacts/stage-run-quality-gate',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: false,
    owner_answer_ref: 'mas://quality-gates/publication-review',
    owner_answer_kind: 'quality_gate_receipt',
    owner_answer_stage_run_id: 'stage-run-quality-gate',
    owner_answer_generation: 4,
    owner_answer_manifest_ref: 'mas://stage-manifests/publication-quality-review',
    stage_manifest_ref: 'mas://stage-manifests/publication-quality-review',
    owner_answer_current_pointer_ref: 'opl://current-pointers/stage-run-quality-gate:g4',
    current_pointer_ref: 'opl://current-pointers/stage-run-quality-gate:g4',
    owner_answer_source_fingerprint: 'sha256:source-4',
    owner_answer_idempotency_key: 'stage-run-quality-gate:g4',
    quality_gate_attempt_ref: 'temporal://attempt/stage-run-quality-gate',
  });

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
  assert.equal(report.opl_runtime_blocker.owner, 'one-person-lab');
  assert.deepEqual(report.opl_runtime_blocker.blocked_authority, [
    'closeout_receipt_binding',
  ]);
  assert.equal(report.opl_runtime_blocker.domain_typed_blocker_created, false);
});

test('StageRun execution authorization authorizes independent quality gate receipt binding', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunExecutionAuthorization({
    phase: 'closeout',
    stage_run_id: 'stage-run-quality-gate-independent',
    domain_id: 'mas',
    stage_id: 'publication_quality_review',
    stage_kind: 'review',
    generation: 5,
    current_pointer: {
      stage_run_id: 'stage-run-quality-gate-independent',
      generation: 5,
      current: true,
    },
    selected_executor: 'codex_cli',
    source_fingerprint: 'sha256:source-5',
    idempotency_key: 'stage-run-quality-gate-independent:g5',
    provider_attempt_ref: 'temporal://attempt/stage-run-quality-gate-independent',
    attempt_lease_ref: 'opl://leases/stage-run-quality-gate-independent:g5',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: 'opl://execution-authorizations/stage-run-quality-gate-independent:g5',
    workspace_scope_ref: 'opl://workspace/stage-run-quality-gate-independent',
    artifact_scope_ref: 'opl://artifacts/stage-run-quality-gate-independent',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: false,
    owner_answer_ref: 'mas://quality-gates/publication-review-independent',
    owner_answer_kind: 'quality_gate_receipt',
    owner_answer_stage_run_id: 'stage-run-quality-gate-independent',
    owner_answer_generation: 5,
    owner_answer_manifest_ref: 'mas://stage-manifests/publication-quality-review',
    stage_manifest_ref: 'mas://stage-manifests/publication-quality-review',
    owner_answer_current_pointer_ref: 'opl://current-pointers/stage-run-quality-gate-independent:g5',
    current_pointer_ref: 'opl://current-pointers/stage-run-quality-gate-independent:g5',
    owner_answer_source_fingerprint: 'sha256:source-5',
    owner_answer_idempotency_key: 'stage-run-quality-gate-independent:g5',
    quality_gate_attempt_ref: 'temporal://attempt/stage-run-quality-gate-independent-reviewer',
  });

  assert.equal(report.status, 'authorized');
  assert.equal(report.execution_authorized, true);
  assert.deepEqual(report.closeout_binding_blockers, []);
  assert.equal(report.opl_runtime_blocker, null);
  assert.equal(report.closeout_binding.owner_answer_kind, 'quality_gate_receipt');
  assert.equal(report.closeout_binding.bound_to_stage_run, true);
  assert.equal(report.closeout_binding.bound_to_stage_manifest, true);
  assert.equal(report.closeout_binding.bound_to_current_pointer, true);
  assert.equal(report.closeout_binding.bound_to_source_fingerprint, true);
  assert.equal(report.closeout_binding.bound_to_idempotency_key, true);
});

test('StageRun execution authorization fails closed when owner answer idempotency binding is absent', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  const report = module.evaluateStageRunExecutionAuthorization({
    phase: 'closeout',
    stage_run_id: 'stage-run-typed-blocker',
    domain_id: 'mas',
    stage_id: 'publication_handoff_owner_gate',
    generation: 3,
    current_pointer: {
      stage_run_id: 'stage-run-typed-blocker',
      generation: 3,
      current: true,
    },
    selected_executor: 'codex_cli',
    source_fingerprint: 'sha256:source-3',
    idempotency_key: 'stage-run-typed-blocker:g3',
    provider_attempt_ref: 'temporal://attempt/stage-run-typed-blocker',
    attempt_lease_ref: 'opl://leases/stage-run-typed-blocker:g3',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref: 'opl://execution-authorizations/stage-run-typed-blocker:g3',
    workspace_scope_ref: 'opl://workspace/stage-run-typed-blocker',
    artifact_scope_ref: 'opl://artifacts/stage-run-typed-blocker',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    forbidden_write_required: false,
    owner_answer_ref: 'mas://typed-blockers/publication-handoff',
    owner_answer_kind: 'typed_blocker',
    owner_answer_stage_run_id: 'stage-run-typed-blocker',
    owner_answer_generation: 3,
    owner_answer_manifest_ref: 'mas://stage-manifests/publication-handoff',
    stage_manifest_ref: 'mas://stage-manifests/publication-handoff',
    owner_answer_current_pointer_ref: 'opl://current-pointers/stage-run-typed-blocker:g3',
    current_pointer_ref: 'opl://current-pointers/stage-run-typed-blocker:g3',
    owner_answer_source_fingerprint: 'sha256:source-3',
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.execution_authorized, false);
  assert.equal(
    report.closeout_binding_blockers.includes('closeout_owner_answer_idempotency_binding_missing'),
    true,
  );
  assert.equal(report.opl_runtime_blocker.owner, 'one-person-lab');
  assert.equal(report.opl_runtime_blocker.domain_typed_blocker_created, false);
  assert.deepEqual(report.opl_runtime_blocker.blocked_authority, [
    'closeout_receipt_binding',
  ]);
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

  assert.equal(cockpit.execution_authorization.status, 'authorized');
  assert.equal(cockpit.execution_authorization.execution_authorized, true);
  assert.equal(cockpit.execution_authorization.opl_runtime_blocker, null);
  assert.equal(
    cockpit.execution_authorization.closeout_binding.owner_answer_ref,
    'mas://typed-blockers/dm002/publication-handoff',
  );
  assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_kind, 'typed_blocker');
  assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_stage_run, true);
  assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_stage_manifest, true);
  assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_current_pointer, true);
  assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_source_fingerprint, true);
  assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_idempotency_key, true);
  assert.equal(cockpit.next_required_owner_action, null);
});
