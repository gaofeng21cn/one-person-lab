import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  recordStageRunExecutionAuthorizationReceipts,
} from '../../src/stage-run-execution-authorization-ledger.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const modulePath = 'src/current-owner-delta-topline.ts';
const projectionModulePath = 'src/current-owner-delta-projection.ts';

test('current owner delta topline keeps domain owner when only owner answer binding is missing', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-delta-topline-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  try {
    recordStageRunExecutionAuthorizationReceipts([{
      stage_run_id: 'app-stage-run:med-autoscience:paper-closeout',
      domain_id: 'med-autoscience',
      stage_id: 'paper_closeout',
      phase: 'launch',
      selected_executor: 'codex_cli',
      provider_attempt_ref: 'temporal://attempt/sat-owner-delta-topline',
      stage_attempt_id: 'sat-owner-delta-topline',
      attempt_lease_ref: 'opl://stage-attempts/sat-owner-delta-topline/leases/task-owner-delta-topline/active',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref:
        'opl://stage-attempts/sat-owner-delta-topline/execution-authorizations/task-owner-delta-topline/wf-owner-delta-topline',
      workspace_scope_ref: 'workspace:/tmp/mas',
      artifact_scope_ref: 'stage-packet:owner-delta-topline',
      source_fingerprint: 'sha256:owner-delta-topline-test',
      idempotency_key: 'idem-owner-delta-topline',
      current_pointer_ref: 'opl://stage-runs/app-stage-run%3Amed-autoscience%3Apaper-closeout/current',
      stage_manifest_ref: 'opl://stage-manifests/paper_closeout',
    }]);

    const topline = module.buildCurrentOwnerDeltaTopline({
      currentOwnerDeltaReadModel: {
        surface_kind: 'opl_current_owner_delta_read_model',
        current_owner_delta: {
          surface_kind: 'opl_current_owner_delta',
          delta_id: 'current-owner-delta:med-autoscience:paper-closeout:owner-answer',
          domain: 'med-autoscience',
          domain_id: 'med-autoscience',
          current_owner: 'med-autoscience',
          owner: 'med-autoscience',
          stage_ref: 'paper_closeout',
          desired_delta_kind: 'owner_answer',
          desired_delta_description: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
          payload_requirement: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
          accepted_answer_shape: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          hard_gate: {
            state: 'owner_delta_open',
            human_or_domain_owner_required: true,
          },
          source_fingerprint: 'sha256:owner-delta-topline-test',
          audit_refs: {},
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
          accepted_answer_shape: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          route_requires_domain_or_app_payload: true,
        },
      },
    });

    assert.equal(topline.operator_current_owner_delta_owner, 'med-autoscience');
    assert.equal(topline.operator_next_owner, 'med-autoscience');
    assert.equal(topline.operator_next_action_owner, 'med-autoscience');
    assert.equal(
      topline.operator_next_required_action,
      'domain_owner_receipt_quality_gate_or_typed_blocker_required',
    );
    assert.equal(
      topline.operator_payload_requirement,
      'domain_owner_receipt_quality_gate_or_typed_blocker_required',
    );
    assert.deepEqual(topline.operator_accepted_answer_shape, [
      'domain_owner_receipt_ref',
      'quality_gate_receipt_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      topline.operator_next_action_source,
      'current_owner_delta',
    );
    assert.equal(
      topline.operator_next_action_authority_boundary.derivation_source,
      'current_owner_delta',
    );
    assert.equal(
      topline.stage_run_next_required_owner_action.next_required_owner,
      'med-autoscience',
    );
    assert.equal(
      topline.stage_run_next_required_owner_action.next_required_action,
      'domain_owner_receipt_quality_gate_or_typed_blocker_required',
    );
    assert.equal(topline.stage_run_cockpit_summary.current_owner_delta_owner, 'med-autoscience');
    assert.equal(topline.stage_run_cockpit_summary.current_owner, 'med-autoscience');
    assert.equal(topline.stage_run_cockpit_summary.next_required_owner, 'med-autoscience');
    assert.equal(topline.stage_run_cockpit_summary.execution_authorization_phase, 'closeout');
    assert.deepEqual(topline.stage_run_cockpit_summary.blocked_authority, [
      'closeout_receipt_binding',
    ]);
    assert.equal(topline.stage_run_cockpit_summary.launch_blocker_count, 0);
    assert.equal(topline.stage_run_cockpit_summary.closeout_binding_blocker_count, 6);
    assert.equal(topline.stage_run_cockpit_summary.route_requires_domain_or_app_payload, true);
    assert.equal(topline.stage_run_cockpit_summary.route_requires_opl_runtime_refs, false);
    assert.equal(topline.stage_run_cockpit_summary.closeout_binding_blocked, true);
    assert.equal(topline.stage_run_cockpit_summary.execution_authorization_refs_missing, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('current owner delta topline keeps current owner delta as ordinary root when StageRun launch refs are missing', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-delta-topline-stage-run-missing-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  try {
    const topline = module.buildCurrentOwnerDeltaTopline({
      currentOwnerDeltaReadModel: {
        surface_kind: 'opl_current_owner_delta_read_model',
        current_owner_delta: {
          surface_kind: 'opl_current_owner_delta',
          delta_id: 'current-owner-delta:medautoscience:reviewer-refresh:owner-answer',
          domain: 'medautoscience',
          domain_id: 'medautoscience',
          current_owner: 'med-autoscience',
          owner: 'med-autoscience',
          stage_ref: 'publication_aftercare/reviewer-refresh',
          stage_id: 'publication_aftercare/reviewer-refresh',
          lineage_ref: 'sat_missing_stage_run_refs',
          desired_delta_kind: 'owner_answer_or_typed_blocker',
          desired_delta_description: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
          payload_requirement: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
          accepted_answer_shape: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          required_return_shapes: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          hard_gate: {
            state: 'owner_delta_open',
            human_or_domain_owner_required: true,
            domain_ready_authorized: false,
            quality_or_export_authorized: false,
          },
          source_fingerprint: 'owner-delta-first:mas-reviewer-refresh',
          audit_refs: {},
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
          accepted_answer_shape: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          route_requires_domain_or_app_payload: true,
          can_create_owner_receipt: false,
          can_claim_domain_ready: false,
        },
      },
    });

    assert.equal(topline.operator_next_action_source, 'current_owner_delta');
    assert.equal(topline.operator_next_action_owner, 'med-autoscience');
    assert.equal(
      topline.operator_next_action_kind,
      'current_owner_delta_owner_answer_or_typed_blocker_required',
    );
    assert.equal(
      topline.operator_next_action.default_planning_root,
      'current_owner_delta',
    );
    assert.equal(
      topline.operator_next_action_authority_boundary.route_requires_domain_or_app_payload,
      true,
    );
    assert.equal(
      topline.operator_next_action_authority_boundary.route_requires_opl_runtime_refs,
      false,
    );
    assert.equal(
      topline.stage_run_next_required_owner_action.next_required_owner,
      'one-person-lab',
    );
    assert.equal(
      topline.stage_run_next_required_owner_action.action_kind,
      'stage_run_execution_authorization_or_closeout_binding_required',
    );
    assert.equal(
      topline.stage_run_execution_authorization_next_action_authority_boundary.route_requires_opl_runtime_refs,
      true,
    );
    assert.equal(topline.stage_run_cockpit_summary.execution_authorized, false);
    assert.equal(topline.stage_run_cockpit_summary.execution_authorization_refs_missing, true);
    assert.equal(topline.stage_run_cockpit_summary.closeout_binding_blocked, true);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('current owner delta topline folds closed StageRun owner answer into default hard gate', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-delta-topline-closed-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
  try {
    const stageRunId = 'app-stage-run:med-autoscience:paper-closeout-closed';
    const currentPointerRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`;
    recordStageRunExecutionAuthorizationReceipts([{
      stage_run_id: stageRunId,
      domain_id: 'med-autoscience',
      stage_id: 'paper_closeout_closed',
      generation: 0,
      phase: 'closeout',
      selected_executor: 'codex_cli',
      provider_attempt_ref: 'temporal://attempt/sat-owner-delta-topline-closed',
      stage_attempt_id: 'sat-owner-delta-topline-closed',
      attempt_lease_ref: 'opl://stage-attempts/sat-owner-delta-topline-closed/leases/task-owner-delta-topline/active',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref:
        'opl://stage-attempts/sat-owner-delta-topline-closed/execution-authorizations/task-owner-delta-topline/wf-owner-delta-topline',
      workspace_scope_ref: 'workspace:/tmp/mas',
      artifact_scope_ref: 'stage-packet:owner-delta-topline-closed',
      source_fingerprint: 'sha256:owner-delta-topline-closed-test',
      idempotency_key: 'idem-owner-delta-topline-closed',
      current_pointer_ref: currentPointerRef,
      stage_manifest_ref: 'opl://stage-manifests/paper_closeout_closed',
      owner_answer_ref: 'mas://owner-answer/dm003/typed-blocker',
      owner_answer_kind: 'typed_blocker',
      owner_answer_stage_run_id: stageRunId,
      owner_answer_generation: 0,
      owner_answer_manifest_ref: 'opl://stage-manifests/paper_closeout_closed',
      owner_answer_current_pointer_ref: currentPointerRef,
      owner_answer_source_fingerprint: 'sha256:owner-delta-topline-closed-test',
      owner_answer_idempotency_key: 'idem-owner-delta-topline-closed',
    }]);

    const topline = module.buildCurrentOwnerDeltaTopline({
      currentOwnerDeltaReadModel: {
        surface_kind: 'opl_current_owner_delta_read_model',
        current_owner_delta: {
          surface_kind: 'opl_current_owner_delta',
          delta_id: 'current-owner-delta:med-autoscience:paper-closeout-closed:owner-answer',
          domain: 'med-autoscience',
          domain_id: 'med-autoscience',
          current_owner: 'med-autoscience',
          owner: 'med-autoscience',
          stage_ref: 'paper_closeout_closed',
          stage_id: 'paper_closeout_closed',
          lineage_ref: 'sat-owner-delta-topline-closed',
          desired_delta_kind: 'owner_answer',
          desired_delta_description: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
          payload_requirement: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
          accepted_answer_shape: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          hard_gate: {
            state: 'owner_delta_open',
            human_or_domain_owner_required: true,
            domain_ready_authorized: false,
          },
          source_fingerprint: 'sha256:owner-delta-topline-closed-test',
          audit_refs: {},
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
          accepted_answer_shape: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          route_requires_domain_or_app_payload: true,
        },
      },
    });

    assert.equal(topline.current_owner_delta.latest_owner_answer_ref, 'mas://owner-answer/dm003/typed-blocker');
    assert.equal(topline.current_owner_delta.latest_owner_answer_kind, 'typed_blocker');
    assert.equal(topline.current_owner_delta.hard_gate.state, 'domain_owner_answer_recorded');
    assert.equal(topline.current_owner_delta.hard_gate.human_or_domain_owner_required, false);
    assert.equal(topline.current_owner_delta.hard_gate.domain_ready_authorized, false);
    assert.equal(topline.current_owner_delta.hard_gate.quality_or_export_authorized, false);
    assert.equal(
      topline.current_owner_delta.stage_run_closeout_binding_ref,
      '/stage_run_cockpit/execution_authorization/closeout_binding',
    );
    assert.equal(topline.current_owner_delta_read_model.current_owner_delta, topline.current_owner_delta);
    assert.equal(topline.current_owner_delta_read_model.next_safe_action_or_none, null);
    assert.equal(topline.current_owner_delta_next_action, null);
    assert.equal(topline.operator_next_action, null);
    assert.equal(topline.operator_next_action_source, 'stage_run_execution_authorization_closed');
    assert.equal(topline.stage_run_next_required_owner_action, null);
    assert.deepEqual(topline.stage_run_next_missing_input_refs, []);
    assert.deepEqual(topline.operator_next_missing_input_refs, []);
    assert.equal(topline.stage_run_cockpit_summary.execution_authorized, true);
    assert.equal(topline.stage_run_cockpit_summary.closeout_binding_blocker_count, 0);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('current owner delta hard gate ignores generic audit-only open safe-action counts', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, projectionModulePath)).href);
  const readModel = module.buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: 'one-person-lab',
      next_required_delta: 'no_opl_operator_actionable_delta_required',
      required_return_shapes: ['typed_blocker_ref'],
    },
    nextSafeAction: {
      action_id: 'legacy-cleanup:medautoscience:apply',
      action_kind: 'legacy_cleanup_apply',
      owner: 'opl',
      ref: 'opl agents legacy-cleanup apply --domain medautoscience --mode apply',
      route_requires_domain_or_app_payload: false,
    },
    countSummary: {
      openSafeActionCount: 1,
      payloadRequiredCount: 0,
      payloadFreeCount: 1,
      blockedRefsOnlyCount: 0,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 0,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
  });

  assert.equal(readModel.default_summary.default_path_root, 'current_owner_delta');
  assert.equal(
    readModel.default_summary.ordinary_progress_spine_ref,
    '/current_owner_delta/ordinary_progress_spine',
  );
  assert.equal(
    readModel.default_summary.progress_delta_receipt_ref,
    '/current_owner_delta/progress_delta_receipt',
  );
  assert.equal(
    readModel.current_owner_delta.ordinary_progress_spine.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    readModel.current_owner_delta.ordinary_progress_spine.default_next_action_derives_from,
    'current_owner_delta',
  );
  assert.equal(
    readModel.current_owner_delta.progress_delta_receipt.ordinary_receipt_kind,
    'ProgressDeltaReceipt',
  );
  assert.equal(
    readModel.current_owner_delta.progress_delta_receipt.stage_transition_requires_owner_receipt_or_typed_blocker,
    true,
  );
  assert.equal(
    readModel.current_owner_delta.progress_delta_receipt.cannot_authorize.includes('production_ready'),
    true,
  );
  assert.equal(
    readModel.current_owner_delta.artifact_tier_policy.default_ordinary_tier,
    'T0_progress_delta',
  );
  assert.equal(
    readModel.current_owner_delta.audit_sidecar_policy.blocked_refs_only_can_generate_default_next_action,
    false,
  );
  assert.equal(
    readModel.current_owner_delta.authority_boundary.blocked_refs_only_can_drive_default_planning,
    false,
  );
  assert.equal(readModel.current_owner_delta.desired_delta_kind, 'none');
  assert.equal(readModel.current_owner_delta.hard_gate.state, 'none');
  assert.equal(readModel.current_owner_delta.hard_gate.human_or_domain_owner_required, false);
  assert.equal(readModel.next_safe_action_or_none, null);
  assert.equal(readModel.owner_delta_audit_tail.count_summary.open_safe_action_count, 1);
  assert.equal(
    readModel.owner_delta_audit_tail.audit_next_safe_action_or_none.action_kind,
    'legacy_cleanup_apply',
  );
});

test('current owner delta hard gate requires domain owner when answer shape is owner receipt or blocker', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, projectionModulePath)).href);
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
    countSummary: {
      openSafeActionCount: 0,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 0,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 0,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
  });

  assert.equal(readModel.current_owner_delta.current_owner, 'med-autoscience');
  assert.equal(readModel.current_owner_delta.stage_id, 'paper_autonomy/guarded-apply');
  assert.equal(readModel.current_owner_delta.latest_owner_answer_ref, null);
  assert.equal(readModel.current_owner_delta.hard_gate.state, 'owner_delta_open');
  assert.equal(readModel.current_owner_delta.hard_gate.human_or_domain_owner_required, true);
  assert.equal(
    readModel.next_safe_action_or_none.action_kind,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assert.equal(readModel.next_safe_action_or_none.route_requires_domain_or_app_payload, true);
  assert.equal(readModel.next_safe_action_or_none.can_create_owner_receipt, false);
  assert.equal(readModel.next_safe_action_or_none.can_claim_domain_ready, false);
});

test('current owner delta keeps blocked refs-only residue as audit sidecar only', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, projectionModulePath)).href);
  const readModel = module.buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: 'one-person-lab',
      next_required_delta: 'no_opl_operator_actionable_delta_required',
      required_return_shapes: ['typed_blocker_ref'],
    },
    nextSafeAction: {
      action_id: 'private-residue:mas:blocked-refs-only',
      action_kind: 'private_residue_refs_only_attention',
      owner: 'one-person-lab',
      ref: 'opl audit private-residue --domain medautoscience --detail full',
      route_requires_domain_or_app_payload: false,
    },
    countSummary: {
      openSafeActionCount: 0,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 3,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 3,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
  });

  assert.equal(readModel.default_summary.default_path_root, 'current_owner_delta');
  assert.equal(
    readModel.default_next_action_derivation_policy,
    'derive_default_next_action_only_from_current_owner_delta',
  );
  assert.equal(
    readModel.current_owner_delta.ordinary_progress_spine.default_next_action_derives_from,
    'current_owner_delta',
  );
  assert.equal(
    readModel.current_owner_delta.ordinary_progress_spine.default_next_action_must_not_derive_from
      .includes('audit_sidecar'),
    true,
  );
  assert.equal(readModel.current_owner_delta.desired_delta_kind, 'none');
  assert.equal(readModel.current_owner_delta.hard_gate.state, 'none');
  assert.equal(readModel.current_owner_delta.hard_gate.human_or_domain_owner_required, false);
  assert.equal(readModel.current_owner_delta.hard_gate.audit_sidecar_blocked_refs_only_count, 3);
  assert.equal(readModel.current_owner_delta.hard_gate.audit_sidecar_hard_gate_upgrade_required, false);
  assert.equal(
    readModel.current_owner_delta.authority_boundary.blocked_refs_only_can_drive_default_planning,
    false,
  );
  assert.equal(
    readModel.current_owner_delta.audit_sidecar_policy.blocked_refs_only_can_generate_default_next_action,
    false,
  );
  assert.equal(
    readModel.current_owner_delta.audit_sidecar_policy.audit_next_safe_action_can_generate_default_next_action,
    false,
  );
  assert.equal(readModel.next_safe_action_or_none, null);
  assert.equal(readModel.owner_delta_audit_tail.count_summary.blocked_refs_only_count, 3);
  assert.equal(
    readModel.owner_delta_audit_tail.audit_next_safe_action_or_none.action_kind,
    'private_residue_refs_only_attention',
  );
});

test('current owner delta provider hard gate remains explicit even with receipt-shaped answers', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, projectionModulePath)).href);
  const nextAction = module.buildDefaultNextActionFromCurrentOwnerDelta({
    surface_kind: 'opl_current_owner_delta',
    delta_id: 'current-owner-delta:opl:provider-liveness',
    current_owner: 'one-person-lab',
    owner: 'one-person-lab',
    domain_id: 'one-person-lab',
    desired_delta_kind: 'provider_liveness',
    payload_requirement: 'provider_worker_liveness_required',
    accepted_answer_shape: [
      'provider_worker_repair_receipt_ref',
      'domain_owner_receipt_ref',
    ],
    hard_gate: {
      state: 'provider_liveness_required',
      provider_liveness_required: true,
      human_or_domain_owner_required: false,
    },
  });

  assert.equal(nextAction.action_kind, 'provider_hard_gate_required');
  assert.equal(nextAction.default_planning_root, 'current_owner_delta');
  assert.equal(nextAction.hard_gate.provider_liveness_required, true);
  assert.equal(nextAction.hard_gate.human_or_domain_owner_required, false);
  assert.equal(nextAction.route_requires_opl_runtime_refs, true);
  assert.equal(nextAction.route_requires_domain_or_app_payload, false);
  assert.equal(nextAction.can_close_without_domain_or_app_payload, true);
  assert.equal(nextAction.can_execute_domain_action, false);
  assert.equal(nextAction.can_create_owner_receipt, false);
  assert.equal(nextAction.can_create_typed_blocker, false);
});
