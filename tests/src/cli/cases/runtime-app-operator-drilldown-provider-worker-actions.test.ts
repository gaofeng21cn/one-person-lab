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
import {
  applyAppOperatorDrilldownDetail,
} from '../../../../src/runtime-tray-app-operator-drilldown-parts/detail-view.ts';
import {
  buildProviderWorkerActionRoutes,
} from '../../../../src/runtime-tray-app-operator-drilldown-parts/provider-worker-action-routes.ts';

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
  }, 'summary');
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

test('provider worker routes prefer stage workbench repair when provider inspection has no actionable worker repair', () => {
  const routes = buildProviderWorkerActionRoutes({
    providerInspection: {
      details: {
        worker_readiness: {
          lifecycle_status: 'ready',
          repair_action: {
            action_id: 'none',
          },
        },
      },
    },
    stageAttemptWorkbench: {
      summary: {
        observability_slo: {
          attempts: [
            {
              provider_readiness: {
                details: {
                  worker_readiness: {
                    lifecycle_status: 'worker_not_ready',
                    repair_action: {
                      action_id: 'start_temporal_worker',
                      next_command: 'opl family-runtime worker start --provider temporal',
                    },
                  },
                },
              },
            },
          ],
        },
      },
      attempts: [],
      evidence_attempts: [],
    },
  });

  assert.equal(routes.length, 1);
  assert.equal(routes[0].action_id, 'provider-worker:temporal:start');
  assert.equal(routes[0].provider_worker_repair_action_id, 'start_temporal_worker');
});
