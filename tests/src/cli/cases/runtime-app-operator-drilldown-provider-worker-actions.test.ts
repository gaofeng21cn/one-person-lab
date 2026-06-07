import net from 'node:net';

import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import type { JsonRecord } from '../../../../src/runtime-tray-snapshot-types.ts';
import {
  applyAppOperatorDrilldownDetail,
} from '../../../../src/runtime-tray-app-operator-drilldown-parts/detail-view.ts';
import {
  buildProviderActionRoutes,
} from '../../../../src/runtime-tray-app-operator-drilldown-parts/provider-action-routes.ts';
import {
  buildProviderWorkerActionRoutes,
} from '../../../../src/runtime-tray-app-operator-drilldown-parts/provider-worker-action-routes.ts';
import {
  buildProviderSchedulerActionRoutes,
} from '../../../../src/runtime-tray-app-operator-drilldown-parts/provider-scheduler-action-routes.ts';

test('runtime App drilldown exposes provider worker start route when Temporal service is reachable but worker is not ready', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-worker-start-route-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  try {
    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: temporalAddress,
      OPL_TEMPORAL_NAMESPACE: 'opl-worker-start-route',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-worker-start-route',
    }).app_operator_drilldown;

    const startRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'provider-worker:temporal:start',
    );
    assert.equal(startRoute.action_kind, 'provider_worker_start');
    assert.equal(startRoute.owner, 'opl');
    assert.equal(startRoute.route_target_kind, 'opl_cli');
    assert.equal(startRoute.execution_surface, 'opl runtime action execute');
    assert.equal(startRoute.provider_worker_lifecycle_status, 'worker_not_ready');
    assert.equal(startRoute.provider_worker_repair_action_id, 'start_temporal_worker');
    assert.deepEqual(startRoute.opl_cli_args, ['worker', 'start', '--provider', 'temporal']);
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === 'provider-worker:temporal:start'
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'provider-worker:temporal:start',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: temporalAddress,
      OPL_TEMPORAL_NAMESPACE: 'opl-worker-start-route',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-worker-start-route',
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_provider_worker_repair');
    assert.equal(execution.execution.execution_status, 'dry_run');
    assert.equal(
      execution.execution.executed_runtime_command,
      'opl family-runtime worker start --provider temporal',
    );
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
  } finally {
    server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime App drilldown selects provider worker start when worker is not ready', () => {
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          ref: 'opl family-runtime worker start --provider temporal',
          action_id: 'provider-worker:temporal:start',
          action_kind: 'provider_worker_start',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
          provider_kind: 'temporal',
          provider_worker_lifecycle_status: 'worker_not_ready',
          provider_worker_repair_action_id: 'start_temporal_worker',
          provider_worker_repair_command: 'opl family-runtime worker start --provider temporal',
          provider_worker_required_next_action:
            'Start Temporal worker before rerunning provider proof or provider-backed Codex stages.',
          opl_cli_args: ['worker', 'start', '--provider', 'temporal'],
          authority_boundary: {
            can_write_domain_truth: false,
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
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(nextSafeAction.action_id, 'provider-worker:temporal:start');
  assert.equal(nextSafeAction.action_kind, 'provider_worker_start');
  assert.equal(nextSafeAction.provider_worker_repair_action_id, 'start_temporal_worker');
  assert.equal(
    nextSafeAction.provider_worker_repair_command,
    'opl family-runtime worker start --provider temporal',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'provider-worker:temporal:start',
  ]);
});

test('runtime App drilldown keeps provider worker start out of the default next step when owner delta is open', () => {
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          ref: 'opl family-runtime worker start --provider temporal',
          action_id: 'provider-worker:temporal:start',
          action_kind: 'provider_worker_start',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
          provider_kind: 'temporal',
          provider_worker_lifecycle_status: 'worker_not_ready',
          provider_worker_repair_action_id: 'start_temporal_worker',
          provider_worker_repair_command: 'opl family-runtime worker start --provider temporal',
          provider_worker_required_next_action:
            'Start Temporal worker before rerunning provider proof or provider-backed Codex stages.',
          opl_cli_args: ['worker', 'start', '--provider', 'temporal'],
          authority_boundary: {
            can_write_domain_truth: false,
            can_claim_production_ready: false,
          },
        },
      ],
    },
    workstream_operating_loop: {
      summary: {
        workstream_count: 1,
        goal_oracle_missing_count: 0,
        next_steering_action_count: 1,
      },
      workstreams: [
        {
          workstream_id: 'medautoscience:dm002-publication-handoff',
          domain_id: 'medautoscience',
          stage_id: 'publication_handoff_owner_gate',
          stage_attempt_id: 'sat-dm002-handoff',
          next_steering_action: {
            action_id: 'provide_owner_receipt_or_typed_blocker',
            action_kind: 'owner_steering_required',
            owner: 'medautoscience',
            status: 'owner_delta_required',
            required_next_refs_any_of: [
              'domain_owner_receipt_ref',
              'quality_gate_receipt_ref',
              'typed_blocker_ref',
            ],
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

  const providerWorkerRoute = drilldown.operator_action_routing_refs.refs.find(
    (ref: { action_id: string }) => ref.action_id === 'provider-worker:temporal:start',
  );
  assert.ok(providerWorkerRoute);
  assert.equal(providerWorkerRoute.action_kind, 'provider_worker_start');
  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.next_owner,
    'med-autoscience',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.primary_item.source,
    'workstream_operating_loop',
  );
  assert.equal(
    drilldown.attention_first_payload.current_owner_delta_read_model.default_summary.default_path_root,
    'current_owner_delta',
  );
  const ownerDeltaNextAction =
    drilldown.attention_first_payload.current_owner_delta_read_model.next_safe_action_or_none;
  assert.ok(ownerDeltaNextAction);
  assert.equal(
    ownerDeltaNextAction.action_kind,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assert.equal(
    ownerDeltaNextAction.owner,
    'med-autoscience',
  );
  assert.equal(
    ownerDeltaNextAction.default_planning_root,
    'current_owner_delta',
  );
});

test('runtime App drilldown does not select developer-checkout shared-state worker start as executable', () => {
  const workerRoutes = buildProviderWorkerActionRoutes({
    stageAttemptWorkbench: {},
    providerInspection: {
      details: {
        worker_readiness: {
          lifecycle_status: 'worker_not_ready',
          repair_action: {
            action_id: 'start_temporal_worker',
            next_command: 'opl family-runtime worker start --provider temporal',
          },
          worker_mutation_guard: {
            surface_kind: 'temporal_worker_mutation_guard',
            mutation_guard_status: 'blocked_developer_checkout_shared_state',
            allowed: false,
            state_dir_explicit: false,
            explicit_developer_override: false,
          },
        },
      },
    },
  });
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: workerRoutes,
    },
    app_execution_bridge: {
      safe_action_routes: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_claim_production_ready: false,
    },
  }, 'full');

  const route = drilldown.operator_action_routing_refs.refs[0];
  assert.equal(route.action_id, 'provider-worker:temporal:start');
  assert.equal(route.route_status, 'blocked_by_provider_worker_mutation_guard');
  assert.equal(route.default_actionable, false);
  assert.equal(route.can_submit_to_safe_action_shell, false);
  assert.equal(route.provider_worker_mutation_guard.allowed, false);
  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(
    drilldown.app_execution_bridge.safe_action_routes.some(
      (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
        ref.action_id === 'provider-worker:temporal:start'
        && ref.can_submit_to_safe_action_shell,
    ),
    false,
  );
});

test('runtime App drilldown blocks provider SLO proof when worker repair is mutation-guarded', () => {
  const workerRoutes = buildProviderWorkerActionRoutes({
    stageAttemptWorkbench: {},
    providerInspection: {
      details: {
        worker_readiness: {
          lifecycle_status: 'worker_not_ready',
          repair_action: {
            action_id: 'start_temporal_worker',
            next_command: 'opl family-runtime worker start --provider temporal',
          },
          worker_mutation_guard: {
            surface_kind: 'temporal_worker_mutation_guard',
            mutation_guard_status: 'blocked_developer_checkout_shared_state',
            allowed: false,
            state_dir_explicit: false,
            explicit_developer_override: false,
          },
        },
      },
    },
  });
  const providerSloRoutes = buildProviderSchedulerActionRoutes({
    refs: [{
      ref: 'opl family-runtime residency proof --provider temporal --production',
      role: 'provider_slo:provider_slo_cadence_execution',
      provider_kind: 'temporal',
      schedule_id: 'opl-family-runtime-provider-scheduler',
      dispatch_status: 'execution_due_or_repair_required',
      repair_command: 'opl family-runtime residency proof --provider temporal --production',
      required_next_action:
        'Repair Temporal service/worker readiness, rerun production proof, and keep failed receipts visible.',
      can_execute: false,
    }],
  }, { providerWorkerActionRoutes: workerRoutes });
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        ...workerRoutes,
        ...providerSloRoutes,
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

  const providerSloRoute = drilldown.operator_action_routing_refs.refs.find(
    (ref: { action_id: string }) => ref.action_id === 'provider-slo:temporal:production-proof',
  ) as JsonRecord | undefined;
  assert.ok(providerSloRoute);
  assert.equal(providerSloRoute.route_status, 'blocked_by_provider_worker_mutation_guard');
  assert.equal(providerSloRoute.default_actionable, false);
  assert.equal(providerSloRoute.can_submit_to_safe_action_shell, false);
  assert.equal(providerSloRoute.provider_worker_blocked_action_id, 'provider-worker:temporal:start');
  assert.equal(drilldown.attention_first_payload.next_safe_action, null);
  assert.equal(
    drilldown.app_execution_bridge.safe_action_routes.some(
      (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
        ref.action_id === 'provider-slo:temporal:production-proof'
        && ref.can_submit_to_safe_action_shell,
    ),
    false,
  );
});

test('runtime action execute dry-run blocks mutation-guarded provider SLO proof route', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-provider-slo-worker-guard-home-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const server = net.createServer((socket) => socket.end());
  try {
    const stateRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state');
    fs.mkdirSync(path.join(stateRoot, 'family-runtime'), { recursive: true });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'provider-slo:temporal:production-proof',
      '--dry-run',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: '',
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: temporalAddress,
      OPL_TEMPORAL_NAMESPACE: 'opl-provider-slo-worker-guard',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-provider-slo-worker-guard',
    }).runtime_operator_action_execution;

    assert.equal(execution.route.route_status, 'blocked_by_provider_worker_mutation_guard');
    assert.equal(execution.route.default_actionable, false);
    assert.equal(execution.route.can_submit_to_safe_action_shell, false);
    assert.equal(execution.execution.execution_status, 'blocked');
    assert.equal(execution.execution.execution_kind, 'blocked_safe_action_route');
    assert.equal(execution.execution.executed_runtime_command, null);
    assert.equal(
      execution.execution.result.provider_worker_mutation_guard.mutation_guard_status,
      'blocked_developer_checkout_shared_state',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime App drilldown selects provider worker repair before provider proof when worker source is stale', () => {
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: [
        {
          ref: 'opl family-runtime residency proof --provider temporal --production',
          action_id: 'provider-slo:temporal:production-proof',
          action_kind: 'provider_slo_cadence_execution',
          owner: 'opl',
          route_target_kind: 'opl_cli',
          execution_policy: 'opl_safe_action_shell',
          execution_surface: 'opl runtime action execute',
          submit_via: 'opl runtime action execute',
          can_submit_to_safe_action_shell: true,
          provider_kind: 'temporal',
          provider_repair_action_id: 'restart_temporal_worker',
          provider_repair_command:
            'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
          provider_required_next_action: 'Restart stale Temporal worker before rerunning provider proof.',
          provider_slo_dispatch_status: 'execution_due_or_repair_required',
          opl_cli_args: ['residency', 'proof', '--provider', 'temporal', '--production'],
          authority_boundary: {
            can_write_domain_truth: false,
            can_claim_production_ready: false,
          },
        },
        {
          ref: 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
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
            'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
          provider_worker_required_next_action:
            'Restart stale Temporal worker before rerunning provider proof.',
          opl_cli_args: ['worker', 'repair', '--provider', 'temporal', '--action', 'restart'],
          authority_boundary: {
            can_write_domain_truth: false,
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
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(nextSafeAction.action_id, 'provider-worker:temporal:restart');
  assert.equal(nextSafeAction.action_kind, 'provider_worker_restart');
  assert.equal(nextSafeAction.provider_worker_repair_action_id, 'restart_temporal_worker');
  assert.equal(
    nextSafeAction.provider_worker_repair_command,
    'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'provider-worker:temporal:restart',
  ]);
});

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
  const drilldown = applyAppOperatorDrilldownDetail({
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
  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);

  assert.equal(nextSafeAction.action_id, 'domain_dispatch:medautoscience:attempt-1:record');
  assert.equal(nextSafeAction.action_kind, 'domain_dispatch_evidence_receipt_record');
  assert.equal(nextSafeAction.route_requires_domain_or_app_payload, true);
  assert.equal(nextSafeAction.can_close_without_domain_or_app_payload, false);
  const ownerDeltaNextAction =
    drilldown.attention_first_payload.current_owner_delta_read_model.next_safe_action_or_none;
  assert.ok(ownerDeltaNextAction);
  assert.equal(ownerDeltaNextAction.default_planning_root, 'current_owner_delta');
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.next_owner,
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
    drilldown.operator_action_routing_refs.refs.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'family-runtime-queue:task-dm002:redrive'
        && ref.action_kind === 'blocked_transport_redrive',
    ),
    true,
  );
});

test('runtime App drilldown keeps provider worker repair audit-only when MAS owner handoff payload work is the current owner delta', () => {
  const workerRestartRoute = {
    ref: 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
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
      'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
    provider_worker_required_next_action:
      'Restart stale Temporal worker before redriving blocked transport or recording MAS owner refs.',
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
  const drilldown = applyAppOperatorDrilldownDetail({
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

  const nextSafeAction = drilldown.attention_first_payload.next_safe_action;
  assert.ok(nextSafeAction);
  assert.equal(nextSafeAction.action_id, 'domain_dispatch:medautoscience:attempt-1:record');
  assert.equal(nextSafeAction.action_kind, 'domain_dispatch_evidence_receipt_record');
  assert.equal(nextSafeAction.can_execute_domain_action_directly, false);
  assert.equal(nextSafeAction.can_submit_to_safe_action_shell, true);
  assert.equal(drilldown.attention_first_payload.additional_safe_action_count, 0);
  assert.equal(drilldown.app_execution_bridge.safe_action_routes.length, 3);
  const ownerDeltaNextAction =
    drilldown.attention_first_payload.current_owner_delta_read_model.next_safe_action_or_none;
  assert.ok(ownerDeltaNextAction);
  assert.equal(
    ownerDeltaNextAction.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    drilldown.attention_first_payload.owner_delta_first.next_owner,
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
    drilldown.operator_action_routing_refs.refs.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'provider-worker:temporal:restart'
        && ref.action_kind === 'provider_worker_restart',
    ),
    true,
  );
  assert.equal(
    drilldown.app_execution_bridge.safe_action_routes.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'family-runtime:redrive:mas-default-executor:task-1'
        && ref.action_kind === 'blocked_transport_redrive',
    ),
    true,
  );
  assert.equal(
    drilldown.app_execution_bridge.safe_action_routes.some(
      (ref: { action_id: string; action_kind: string }) =>
        ref.action_id === 'domain_dispatch:medautoscience:attempt-1:record'
        && ref.action_kind === 'domain_dispatch_evidence_receipt_record',
    ),
    true,
  );
});
