import {
  assert,
  test,
} from '../helpers.ts';
import {
  applyAppOperatorDrilldownDetail,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/detail-view.ts';
import {
  buildProviderWorkerActionRoutes,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/provider-worker-action-routes.ts';

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
            'opl family-runtime worker stop --provider temporal',
          provider_required_next_action: 'Run supervisor-aware Temporal worker repair before rerunning provider proof.',
          provider_slo_dispatch_status: 'execution_due_or_repair_required',
          opl_cli_args: ['residency', 'proof', '--provider', 'temporal', '--production'],
          authority_boundary: {
            can_write_domain_truth: false,
            can_claim_production_ready: false,
          },
        },
        {
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
            'Run supervisor-aware Temporal worker repair before rerunning provider proof.',
          opl_cli_args: ['repair', '--provider', 'temporal'],
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
    'opl family-runtime worker stop --provider temporal',
  );
  assert.deepEqual(nextSafeAction.submit_args, [
    'runtime',
    'action',
    'execute',
    '--action',
    'provider-worker:temporal:restart',
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
