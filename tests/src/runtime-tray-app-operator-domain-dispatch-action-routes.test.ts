import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDomainDispatchEvidenceReceiptRoutes,
} from '../../src/modules/console/runtime-tray-app-operator-drilldown-parts/domain-dispatch-action-routes.ts';

function readyTargetIdentity(stageAttemptId: string) {
  return {
    stage_run_id: `run:${stageAttemptId}`,
    source_fingerprint: `sha256:${stageAttemptId}`,
    idempotency_key: `idem:${stageAttemptId}`,
    provider_attempt_ref: `provider:${stageAttemptId}`,
  };
}

test('domain dispatch receipt routes build record workorder without domain authority', () => {
  const routes = buildDomainDispatchEvidenceReceiptRoutes({
    attempts: [
      {
        domain_id: 'medautoscience',
        stage_id: 'write',
        stage_attempt_id: 'sat-record',
        ref: 'opl://attempts/sat-record/domain-dispatch',
        source_fingerprint: 'sha256:attempt-record',
        target_identity: readyTargetIdentity('sat-record'),
        workspace_locator: {
          workspace_root: '/tmp/mas',
          workspace_path: '/tmp/mas/studies/dm-cvd',
        },
      },
      {
        domain_id: 'medautoscience',
        stage_attempt_id: 'sat-closed',
        owner_receipt_refs: ['receipt:closed'],
      },
      {
        domain_id: 'medautoscience',
        stage_attempt_id: 'sat-blocked',
        typed_blocker_refs: ['blocker:closed'],
      },
      {
        domain_id: 'medautoscience',
        stage_attempt_id: 'sat-not-actionable',
        default_actionable: false,
      },
    ],
  });

  assert.equal(routes.length, 1);
  const route = routes[0] as Record<string, any>;
  assert.equal(route.action_id, 'domain_dispatch:medautoscience:sat-record:record');
  assert.equal(route.action_kind, 'domain_dispatch_evidence_receipt_record');
  assert.equal(route.route_requires_domain_or_app_payload, true);
  assert.equal(route.can_close_without_domain_or_app_payload, false);
  assert.equal(route.creates_domain_action, false);
  assert.equal(route.creates_owner_receipt, false);
  assert.equal(route.payload_workorder.surface_kind, 'opl_domain_dispatch_progress_evidence_payload_workorder');
  assert.equal(
    route.payload_workorder.accepted_payload_paths.typed_blocker_path.success_claimed,
    false,
  );
  assert.deepEqual(route.payload_template.transport_identity, {
    surface_kind: 'opl_stage_run_transport_identity',
    stage_run_id: 'run:sat-record',
    source_fingerprint: 'sha256:sat-record',
    idempotency_key: 'idem:sat-record',
    provider_attempt_ref: 'provider:sat-record',
  });
  assert.equal(route.payload_workorder.accepted_payload_paths.progress_refs_path.next_declared_stage_may_start, true);
  assert.equal(route.authority_boundary.can_write_domain_truth, false);
  assert.equal(route.authority_boundary.creates_owner_receipt, false);
  assert.equal(route.authority_boundary.closes_domain_ready, false);
  assert.equal(route.workspace_root, '/tmp/mas');
  assert.equal(route.workspace_path, '/tmp/mas/studies/dm-cvd');
});

test('domain dispatch receipt routes build verify route from recorded OPL receipt ref', () => {
  const routes = buildDomainDispatchEvidenceReceiptRoutes({
    attempts: [
      {
        domain_id: 'medautoscience',
        stage_id: 'write',
        stage_attempt_id: 'sat-verify',
        dispatch_evidence_receipt_status: 'recorded',
        dispatch_evidence_receipt_refs: ['receipt:recorded'],
        target_identity: readyTargetIdentity('sat-verify'),
      },
    ],
  });

  assert.equal(routes.length, 1);
  const route = routes[0] as Record<string, any>;
  assert.equal(route.action_id, 'domain_dispatch:medautoscience:sat-verify:verify');
  assert.equal(route.action_kind, 'domain_dispatch_evidence_receipt_verify');
  assert.equal(route.route_requires_domain_or_app_payload, false);
  assert.equal(route.can_close_without_domain_or_app_payload, true);
  assert.equal(route.payload_template, null);
  assert.deepEqual(route.payload_workorder, {});
  assert.deepEqual(route.required_operator_payload_refs, []);
  assert.equal(route.transport_identity_observation, null);
  assert.equal(route.closes_domain_dispatch_owner_chain, true);
  assert.deepEqual(route.opl_cli_args, [
    'agents',
    'evidence',
    'apply',
    '--domain',
    'medautoscience',
    '--request-id',
    'domain_dispatch:medautoscience:sat-verify',
    '--mode',
    'verify',
    '--request-pack-id',
    'medautoscience.domain_dispatch_evidence',
    '--source-ref',
    '/stage_attempt_workbench/attempts/sat-verify/domain_dispatch_evidence',
    '--receipt-ref',
    'receipt:recorded',
  ]);
  assert.equal(
    route.copyable_runtime_action_execute_commands.verify_recorded_receipt,
    'opl runtime action execute --action domain_dispatch:medautoscience:sat-verify:verify',
  );
});
