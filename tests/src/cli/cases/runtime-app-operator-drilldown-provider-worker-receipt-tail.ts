import {
  assert,
  test,
} from '../helpers.ts';
import {
  applyAppOperatorDrilldownDetail,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/detail-view.ts';

test('runtime App drilldown keeps blocked transport redrive behind MAS owner handoff record', () => {
  const ownerHandoffRecordRoute = {
    action_id: 'domain_dispatch:medautoscience:attempt-1:record',
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    can_submit_to_safe_action_shell: true,
    payload_owner: 'domain_repository_or_app_live_operator',
    authority_split: {
      opl_transport_liveness_owner: true,
      mas_publication_quality_owner: true,
      mas_artifact_package_authority_owner: true,
      mas_owner_receipt_owner: true,
    },
    payload_template: {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      owner_chain_refs: [],
      no_regression_refs: [],
      evidence_refs: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  };
  const projection = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        ownerHandoffRecordRoute,
        {
          ref: 'opl family-runtime queue redrive task-dm002 --reason provider_transport_retry_requested --source app-operator',
          action_id: 'family-runtime-queue:task-dm002:redrive',
          action_kind: 'blocked_transport_redrive',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
          domain_id: 'medautoscience',
          task_id: 'task-dm002',
          task_kind: 'domain_owner/default-executor-dispatch',
          blocked_transport_dead_letter_reason: 'temporal_stage_attempt_not_completed',
          provider_transport_redrive_command:
            'opl family-runtime queue redrive task-dm002 --reason provider_transport_retry_requested --source app-operator',
          authority_split: {
            opl_transport_liveness_owner: true,
            mas_publication_quality_owner: true,
            mas_artifact_package_authority_owner: true,
            mas_owner_receipt_owner: true,
          },
          authority_boundary: {
            can_write_domain_truth: false,
            can_authorize_quality_verdict: false,
            can_authorize_artifact_package: false,
            can_create_owner_receipt: false,
            can_claim_production_ready: false,
          },
        },
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'full');
  const nextSafeAction = projection.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(nextSafeAction.action_id, 'domain_dispatch:medautoscience:attempt-1:record');
  assert.equal(nextSafeAction.action_kind, 'domain_dispatch_evidence_receipt_record');
  assert.equal(nextSafeAction.route_requires_domain_or_app_payload, true);
  assert.equal(nextSafeAction.can_close_without_domain_or_app_payload, false);
  const ownerDeltaNextAction =
    projection.attention_first_payload.current_owner_delta_read_model.next_safe_action_or_none;
  assert.ok(ownerDeltaNextAction);
  assert.equal(ownerDeltaNextAction.default_planning_root, 'current_owner_delta');
  assert.equal(
    projection.attention_first_payload.owner_delta_first.next_owner,
    'domain_repository_or_app_live_operator',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'domain_dispatch:medautoscience:attempt-1:record',
    '--payload-file',
    '<payload.json>',
  ]);
  assert.equal(nextSafeAction.authority_split.opl_transport_liveness_owner, true);
  assert.equal(nextSafeAction.authority_split.mas_publication_quality_owner, true);
  assert.equal(nextSafeAction.can_execute_domain_action_directly, false);
  assert.equal(
    projection.operator_action_routing_refs.refs.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'family-runtime-queue:task-dm002:redrive'
        && ref.action_kind === 'blocked_transport_redrive',
    ),
    true,
  );
});

test('runtime App drilldown keeps provider worker repair audit-only when MAS owner handoff payload work is the current owner delta', () => {
  const workerRestartRoute = {
    ref: 'opl family-runtime repair --provider temporal',
    action_id: 'provider-worker:temporal:restart',
    action_kind: 'provider_worker_restart',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    provider_kind: 'temporal',
    provider_worker_lifecycle_status: 'worker_source_stale',
    provider_worker_repair_action_id: 'restart_temporal_worker',
    provider_worker_repair_command:
      'opl family-runtime worker stop --provider temporal',
    provider_worker_required_next_action:
      'Run supervisor-aware Temporal worker repair before redriving blocked transport or recording MAS owner refs.',
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  };
  const transportRedriveRoute = {
    action_id: 'family-runtime:redrive:mas-default-executor:task-1',
    action_kind: 'blocked_transport_redrive',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    can_submit_to_safe_action_shell: true,
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  };
  const ownerHandoffRoute = {
    action_id: 'domain_dispatch:medautoscience:attempt-1:record',
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    submit_via: 'opl runtime action execute',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    can_submit_to_safe_action_shell: true,
    payload_owner: 'med-autoscience',
    payload_template: {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      owner_chain_refs: [],
      no_regression_refs: [],
      evidence_refs: [],
    },
    required_operator_payload_refs: [
      'domain_receipt_refs',
      'typed_blocker_refs',
      'owner_chain_refs',
      'no_regression_refs',
    ],
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
      mas_closes_publication_quality: true,
      mas_closes_artifact_package_authority: true,
      mas_closes_owner_receipt: true,
    },
  };
  const projection = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        ownerHandoffRoute,
        transportRedriveRoute,
        workerRestartRoute,
      ],
    },
    app_execution_bridge: {
      safe_action_routes: [
        ownerHandoffRoute,
        transportRedriveRoute,
        workerRestartRoute,
      ],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'full');

  const nextSafeAction = projection.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);
  assert.equal(nextSafeAction.action_id, 'domain_dispatch:medautoscience:attempt-1:record');
  assert.equal(nextSafeAction.action_kind, 'domain_dispatch_evidence_receipt_record');
  assert.equal(nextSafeAction.can_execute_domain_action_directly, false);
  assert.equal(nextSafeAction.can_submit_to_safe_action_shell, true);
  assert.equal(projection.attention_first_payload.additional_safe_action_count, 0);
  assert.equal(projection.app_execution_bridge.safe_action_routes.length, 3);
  const ownerDeltaNextAction =
    projection.attention_first_payload.current_owner_delta_read_model.next_safe_action_or_none;
  assert.ok(ownerDeltaNextAction);
  assert.equal(
    ownerDeltaNextAction.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    projection.attention_first_payload.owner_delta_first.next_owner,
    'med-autoscience',
  );
  assert.equal(
    ownerDeltaNextAction.owner,
    'med-autoscience',
  );
  assert.equal(
    ownerDeltaNextAction.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    projection.operator_action_routing_refs.refs.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'provider-worker:temporal:restart'
        && ref.action_kind === 'provider_worker_restart',
    ),
    true,
  );
  assert.equal(
    projection.app_execution_bridge.safe_action_routes.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'family-runtime:redrive:mas-default-executor:task-1'
        && ref.action_kind === 'blocked_transport_redrive',
    ),
    true,
  );
  assert.equal(
    projection.app_execution_bridge.safe_action_routes.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'domain_dispatch:medautoscience:attempt-1:record'
        && ref.action_kind === 'domain_dispatch_evidence_receipt_record',
    ),
    true,
  );
});
