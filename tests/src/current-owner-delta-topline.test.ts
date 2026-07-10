import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recordStageRunExecutionAuthorizationReceipts } from '../../src/modules/stagecraft/stage-run-execution-authorization-ledger.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const projectionModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src/modules/ledger/current-owner-delta-projection.ts'),
).href;
const toplineModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src/modules/ledger/current-owner-delta-topline.ts'),
).href;

const EMPTY_COUNTS = {
  openSafeActionCount: 0,
  payloadRequiredCount: 0,
  payloadFreeCount: 0,
  blockedRefsOnlyCount: 0,
  evidenceEnvelopeOpenCount: 0,
  evidenceEnvelopeBlockedCount: 0,
  domainDispatchWorkorderCount: 0,
  stageReplayMissingReceiptWorkorderCount: 0,
};

function ownerAnswerReadModel(overrides: Record<string, unknown> = {}) {
  const acceptedAnswerShape = [
    'domain_owner_receipt_ref',
    'quality_gate_receipt_ref',
    'typed_blocker_ref',
  ];
  return {
    surface_kind: 'opl_current_owner_delta_read_model',
    current_owner_delta: {
      surface_kind: 'opl_current_owner_delta',
      delta_id: 'current-owner-delta:med-autoscience:paper-closeout:owner-answer',
      domain: 'med-autoscience',
      domain_id: 'med-autoscience',
      current_owner: 'med-autoscience',
      owner: 'med-autoscience',
      stage_ref: 'paper_closeout',
      stage_id: 'paper_closeout',
      desired_delta_kind: 'owner_answer',
      desired_delta_description: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      payload_requirement: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      accepted_answer_shape: acceptedAnswerShape,
      hard_gate: {
        state: 'owner_delta_open',
        human_or_domain_owner_required: true,
        domain_ready_authorized: false,
      },
      source_fingerprint: 'sha256:owner-delta-topline-test',
      audit_refs: {},
      ...overrides,
    },
    next_safe_action_or_none: {
      surface_kind: 'opl_current_owner_delta_default_next_action',
      action_kind: 'current_owner_delta_owner_answer_or_typed_blocker_required',
      derivation_source: 'current_owner_delta',
      default_planning_root: 'current_owner_delta',
      current_owner: 'med-autoscience',
      owner: 'med-autoscience',
      next_required_owner: 'med-autoscience',
      next_required_action: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      payload_requirement: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      accepted_answer_shape: acceptedAnswerShape,
      route_requires_domain_or_app_payload: true,
    },
  };
}

test('current owner delta requires a domain-owned answer without minting authority', async () => {
  const module = await import(projectionModuleUrl);
  const readModel = module.buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: 'med-autoscience',
      domain_id: 'medautoscience',
      next_required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      required_return_shapes: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
      ],
      primary_item: {
        stage_id: 'paper_autonomy/guarded-apply',
        stage_attempt_id: 'sat-owner-answer-missing',
      },
    },
    countSummary: EMPTY_COUNTS,
  });

  assert.equal(readModel.current_owner_delta.current_owner, 'med-autoscience');
  assert.equal(readModel.current_owner_delta.hard_gate.state, 'owner_delta_open');
  assert.equal(readModel.current_owner_delta.hard_gate.human_or_domain_owner_required, true);
  assert.equal(readModel.next_safe_action_or_none.route_requires_domain_or_app_payload, true);
  assert.equal(readModel.next_safe_action_or_none.can_create_owner_receipt, false);
  assert.equal(readModel.next_safe_action_or_none.can_claim_domain_ready, false);
  assert.equal(readModel.current_owner_delta.authority_boundary.can_write_domain_truth, false);
});

test('topline composes current-owner action with StageRun owner-answer binding requirements', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-delta-open-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const stageRunId = 'app-stage-run:med-autoscience:paper-closeout';
    recordStageRunExecutionAuthorizationReceipts([{
      stage_run_id: stageRunId,
      domain_id: 'med-autoscience',
      study_id: 'study:owner-delta-topline-test',
      domain_context: {
        domain_id: 'med-autoscience',
        study_id: 'study:owner-delta-topline-test',
        stage_id: 'paper_closeout',
      },
      stage_id: 'paper_closeout',
      generation: 0,
      phase: 'launch',
      selected_executor: 'codex_cli',
      provider_attempt_ref: 'temporal://attempt/sat-owner-delta-topline-open',
      stage_attempt_id: 'sat-owner-delta-topline-open',
      attempt_lease_ref: 'opl://stage-attempts/sat-owner-delta-topline-open/leases/task/active',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref: 'opl://stage-attempts/sat-owner-delta-topline-open/authorization',
      workspace_scope_ref: 'workspace:/tmp/mas',
      artifact_scope_ref: 'stage-packet:owner-delta-topline',
      action_type: 'paper_closeout',
      work_unit_id: 'stage-packet:owner-delta-topline',
      work_unit_fingerprint: 'sha256:owner-delta-topline-test',
      source_fingerprint: 'sha256:owner-delta-topline-test',
      decision: 'authorize',
      reason: 'test_authorized_refs_only_stage_attempt_execution',
      operator: 'test:current-owner-delta-topline',
      idempotency_key: 'idem-owner-delta-topline-open',
      current_pointer_ref: `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`,
      stage_manifest_ref: 'opl://stage-manifests/paper_closeout',
    }]);

    const module = await import(toplineModuleUrl);
    const topline = module.buildCurrentOwnerDeltaTopline({
      currentOwnerDeltaReadModel: ownerAnswerReadModel(),
    });
    const ownerDeltaAction = topline.current_owner_delta_next_action;
    const stageRunAction = topline.stage_run_next_required_owner_action;

    assert.equal(stageRunAction.owner_answer_missing_before_opl_closeout_binding, true);
    assert.deepEqual(topline.operator_next_action, {
      ...ownerDeltaAction,
      missing_input_refs: stageRunAction.missing_input_refs,
      required_ref_shape: stageRunAction.required_ref_shape,
      stage_run_closeout_binding_ref: '/stage_run_cockpit/execution_authorization',
      stage_run_closeout_binding_policy:
        'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
    });
    assert.equal(topline.operator_next_action_source, 'current_owner_delta');
    assert.equal(topline.operator_next_action_owner, 'med-autoscience');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('topline consumes only an identity-bound StageRun owner answer and keeps readiness unauthorized', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-delta-closed-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const stageRunId = 'app-stage-run:med-autoscience:paper-closeout';
    const currentPointerRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`;
    recordStageRunExecutionAuthorizationReceipts([{
      stage_run_id: stageRunId,
      domain_id: 'med-autoscience',
      study_id: 'study:owner-delta-topline-test',
      domain_context: {
        domain_id: 'med-autoscience',
        study_id: 'study:owner-delta-topline-test',
        stage_id: 'paper_closeout',
      },
      stage_id: 'paper_closeout',
      generation: 0,
      phase: 'closeout',
      selected_executor: 'codex_cli',
      provider_attempt_ref: 'temporal://attempt/sat-owner-delta-topline',
      stage_attempt_id: 'sat-owner-delta-topline',
      attempt_lease_ref: 'opl://stage-attempts/sat-owner-delta-topline/leases/task/active',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref: 'opl://stage-attempts/sat-owner-delta-topline/authorization',
      workspace_scope_ref: 'workspace:/tmp/mas',
      artifact_scope_ref: 'stage-packet:owner-delta-topline',
      action_type: 'paper_closeout',
      work_unit_id: 'stage-packet:owner-delta-topline',
      work_unit_fingerprint: 'sha256:owner-delta-topline-test',
      source_fingerprint: 'sha256:owner-delta-topline-test',
      decision: 'authorize',
      reason: 'test_authorized_refs_only_stage_attempt_execution',
      operator: 'test:current-owner-delta-topline',
      idempotency_key: 'idem-owner-delta-topline',
      current_pointer_ref: currentPointerRef,
      stage_manifest_ref: 'opl://stage-manifests/paper_closeout',
      owner_answer_ref: 'mas://owner-answer/dm003/typed-blocker',
      owner_answer_kind: 'typed_blocker',
      owner_answer_stage_run_id: stageRunId,
      owner_answer_generation: 0,
      owner_answer_manifest_ref: 'opl://stage-manifests/paper_closeout',
      owner_answer_current_pointer_ref: currentPointerRef,
      owner_answer_source_fingerprint: 'sha256:owner-delta-topline-test',
      owner_answer_idempotency_key: 'idem-owner-delta-topline',
    }]);

    const module = await import(toplineModuleUrl);
    const topline = module.buildCurrentOwnerDeltaTopline({
      currentOwnerDeltaReadModel: ownerAnswerReadModel(),
    });
    assert.equal(topline.current_owner_delta.latest_owner_answer_ref, 'mas://owner-answer/dm003/typed-blocker');
    assert.equal(topline.current_owner_delta.hard_gate.state, 'domain_owner_answer_recorded');
    assert.equal(topline.current_owner_delta.hard_gate.domain_ready_authorized, false);
    assert.equal(topline.current_owner_delta.hard_gate.quality_or_export_authorized, false);
    assert.equal(topline.current_owner_delta_next_action, null);
    assert.equal(topline.operator_next_action_source, 'stage_run_execution_authorization_closed');
    assert.equal(topline.stage_run_cockpit_summary.execution_authorized, true);
    assert.equal(topline.stage_run_cockpit_summary.closeout_binding_blocker_count, 0);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('audit counters remain sidecar data and do not change current-owner identity', async () => {
  const module = await import(projectionModuleUrl);
  const input = {
    ownerDeltaFirst: {
      next_owner: 'med-autoscience',
      domain_id: 'medautoscience',
      next_required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      required_return_shapes: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
      primary_item: {
        owner: 'med-autoscience',
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        stage_attempt_id: 'sat-current-owner-answer-target',
        workstream_id: 'medautoscience:current-owner-answer-target',
      },
    },
    nextSafeAction: {
      action_id: 'legacy-cleanup:medautoscience:apply',
      action_kind: 'legacy_cleanup_apply',
      owner: 'opl',
      ref: 'opl agents legacy-cleanup apply --domain medautoscience --mode apply',
      route_requires_domain_or_app_payload: false,
    },
  };
  const first = module.buildCurrentOwnerDeltaReadModel({
    ...input,
    countSummary: { ...EMPTY_COUNTS, openSafeActionCount: 1 },
  });
  const second = module.buildCurrentOwnerDeltaReadModel({
    ...input,
    countSummary: { ...EMPTY_COUNTS, openSafeActionCount: 6, blockedRefsOnlyCount: 3 },
  });

  assert.equal(first.current_owner_delta.source_fingerprint, second.current_owner_delta.source_fingerprint);
  assert.equal(first.current_owner_delta.delta_id, second.current_owner_delta.delta_id);
  assert.equal(second.current_owner_delta.audit_sidecar_policy.blocked_refs_only_can_generate_default_next_action, false);
  assert.equal(second.current_owner_delta.authority_boundary.blocked_refs_only_can_drive_default_planning, false);
  assert.equal(first.owner_delta_audit_tail.count_summary.open_safe_action_count, 1);
  assert.equal(second.owner_delta_audit_tail.count_summary.open_safe_action_count, 6);
});

test('provider hard gate remains OPL-owned and cannot create domain receipts', async () => {
  const module = await import(projectionModuleUrl);
  const nextAction = module.buildDefaultNextActionFromCurrentOwnerDelta({
    surface_kind: 'opl_current_owner_delta',
    delta_id: 'current-owner-delta:opl:provider-liveness',
    current_owner: 'one-person-lab',
    owner: 'one-person-lab',
    domain_id: 'one-person-lab',
    desired_delta_kind: 'provider_liveness',
    payload_requirement: 'provider_worker_liveness_required',
    accepted_answer_shape: ['provider_worker_repair_receipt_ref', 'domain_owner_receipt_ref'],
    hard_gate: {
      state: 'provider_liveness_required',
      provider_liveness_required: true,
      human_or_domain_owner_required: false,
    },
  });

  assert.equal(nextAction.action_kind, 'provider_hard_gate_required');
  assert.equal(nextAction.route_requires_opl_runtime_refs, true);
  assert.equal(nextAction.route_requires_domain_or_app_payload, false);
  assert.equal(nextAction.can_execute_domain_action, false);
  assert.equal(nextAction.can_create_owner_receipt, false);
  assert.equal(nextAction.can_create_typed_blocker, false);
});
