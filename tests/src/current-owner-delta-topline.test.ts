import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const modulePath = 'src/current-owner-delta-topline.ts';
const projectionModulePath = 'src/current-owner-delta-projection.ts';

test('current owner delta topline uses OPL runtime owner when StageRun execution authorization is blocked', async () => {
  const module = await import(pathToFileURL(path.join(repoRoot, modulePath)).href);
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
        default_planning_root: 'current_owner_delta_or_provider_human_hard_gate',
        current_owner: 'med-autoscience',
        owner: 'med-autoscience',
        route_requires_domain_or_app_payload: true,
      },
    },
  });

  assert.equal(topline.operator_current_owner_delta_owner, 'med-autoscience');
  assert.equal(topline.operator_next_owner, 'one-person-lab');
  assert.equal(topline.operator_next_action_owner, 'one-person-lab');
  assert.equal(
    topline.operator_next_required_action,
    'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
  );
  assert.equal(
    topline.operator_payload_requirement,
    'opl_execution_authorization_and_closeout_binding_refs_required',
  );
  assert.deepEqual(topline.operator_accepted_answer_shape, [
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
    'owner_answer_binding_ref',
  ]);
  assert.equal(
    topline.operator_next_action_source,
    'stage_run_execution_authorization',
  );
  assert.equal(
    topline.operator_next_action_authority_boundary.derivation_source,
    'stage_run_execution_authorization',
  );
  assert.equal(
    topline.stage_run_next_required_owner_action.next_required_owner,
    'one-person-lab',
  );
  assert.equal(
    topline.stage_run_next_required_owner_action.next_required_action,
    'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
  );
  assert.equal(topline.stage_run_cockpit_summary.current_owner_delta_owner, 'med-autoscience');
  assert.equal(topline.stage_run_cockpit_summary.current_owner, 'one-person-lab');
  assert.equal(topline.stage_run_cockpit_summary.next_required_owner, 'one-person-lab');
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
