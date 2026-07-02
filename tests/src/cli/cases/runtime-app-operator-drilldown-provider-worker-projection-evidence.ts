import {
  assert,
  test,
} from '../helpers.ts';
import {
  applyAppOperatorDrilldownDetail,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/detail-view.ts';
import {
  buildProviderActionRoutes,
} from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/provider-action-routes.ts';

test('runtime App drilldown keeps active attempts with missing progress signals actionable', () => {
  const progressFirstRoutes = buildProviderActionRoutes({
    periodicRefs: { refs: [] },
    providerInspection: {
      details: {
        worker_readiness: {
          lifecycle_status: 'ready',
          readiness_status: 'ready',
          repair_action: { action_id: 'none' },
        },
      },
    },
    stageAttemptWorkbench: {
      evidence_attempts: [],
      attempts: [
        {
          stage_attempt_id: 'attempt-progress-first-1',
          task_id: 'task-progress-first-1',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          provider_kind: 'temporal',
          local_status: 'running',
          provider_run: {
            provider_status: 'running',
          },
          current_provider_readiness: {
            details: {
              worker_readiness: {
                lifecycle_status: 'worker_not_ready',
                readiness_status: 'worker_not_ready',
                repair_action: {
                  action_id: 'start_temporal_worker',
                  next_command: 'opl family-runtime worker start --provider temporal',
                },
              },
            },
          },
          current_control_state: {
            task_kind: 'domain_owner/default-executor-dispatch',
          },
          closeout_refs: [],
          stage_progress_log: {
            user_stage_log: {
              semantic_status: 'missing_domain_semantic_summary',
            },
            timeline: {},
          },
        },
      ],
    },
  });
  const drilldown = applyAppOperatorDrilldownDetail({
    operator_action_routing_refs: {
      refs: progressFirstRoutes,
    },
    app_execution_bridge: {
      safe_action_routes: progressFirstRoutes,
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
  assert.equal(drilldown.attention_first_payload.additional_safe_action_count, 0);

  const progressAction = progressFirstRoutes.find((route: { action_kind: string }) =>
    route.action_kind === 'progress_first_attempt_supervision'
  );
  assert.ok(progressAction);
  assert.equal(progressAction.stage_attempt_id, 'attempt-progress-first-1');
  assert.deepEqual(progressAction.missing_progress_signals, [
    'worker_liveness',
    'latest_progress_delta',
    'stage_log',
    'owner_closeout',
    'next_action',
  ]);
  assert.equal(progressAction.can_submit_to_safe_action_shell, false);
  assert.equal(progressAction.default_actionable, false);
  assert.equal(progressAction.default_actionability_status, 'diagnostic_only_not_operator_actionable');
  assert.equal(progressAction.execution_policy, 'diagnostic_query_only');
  assert.equal(progressAction.route_status, 'diagnostic_only');
  assert.equal(
    progressAction.route_status_detail_semantics,
    'read_only_operator_diagnostic_not_safe_action_or_closeable_workorder',
  );
  assert.equal(progressAction.authority_boundary.can_write_domain_truth, false);
});

test('runtime App drilldown scopes progress-first supervision to current workbench attempts', () => {
  const progressFirstRoutes = buildProviderActionRoutes({
    periodicRefs: { refs: [] },
    providerInspection: {
      details: {
        worker_readiness: {
          lifecycle_status: 'ready',
          readiness_status: 'ready',
          repair_action: { action_id: 'none' },
        },
      },
    },
    stageAttemptWorkbench: {
      evidence_attempts: [
        {
          stage_attempt_id: 'attempt-progress-first-history-1',
          task_id: 'task-progress-first-history-1',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          provider_kind: 'temporal',
          local_status: 'running',
          provider_run: {
            provider_status: 'running',
          },
          current_provider_readiness: {
            details: {
              worker_readiness: {
                lifecycle_status: 'ready',
                readiness_status: 'ready',
                repair_action: {
                  action_id: 'none',
                },
              },
            },
          },
          current_control_state: {
            task_kind: 'domain_owner/default-executor-dispatch',
          },
          closeout_refs: [],
          stage_progress_log: {
            user_stage_log: {
              semantic_status: 'missing_domain_semantic_summary',
            },
            timeline: {},
          },
        },
      ],
      attempts: [
        {
          stage_attempt_id: 'attempt-progress-first-current-1',
          task_id: 'task-progress-first-current-1',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          provider_kind: 'temporal',
          local_status: 'running',
          provider_run: {
            provider_status: 'running',
          },
          current_provider_readiness: {
            details: {
              worker_readiness: {
                lifecycle_status: 'ready',
                readiness_status: 'ready',
                repair_action: {
                  action_id: 'none',
                },
              },
            },
          },
          current_control_state: {
            task_kind: 'domain_owner/default-executor-dispatch',
          },
          closeout_refs: [],
          stage_progress_log: {
            user_stage_log: {
              semantic_status: 'missing_domain_semantic_summary',
            },
            timeline: {},
          },
        },
      ],
    },
  });

  const progressActions = progressFirstRoutes.filter((route: { action_kind: string }) =>
    route.action_kind === 'progress_first_attempt_supervision'
  );

  assert.deepEqual(progressActions.map((action: { stage_attempt_id: string | null }) => action.stage_attempt_id), [
    'attempt-progress-first-current-1',
  ]);
});

test('runtime App drilldown classifies stale active attempts that lack next action', () => {
  const progressFirstRoutes = buildProviderActionRoutes({
    periodicRefs: { refs: [] },
    providerInspection: {
      details: {
        worker_readiness: {
          lifecycle_status: 'ready',
          readiness_status: 'ready',
          repair_action: { action_id: 'none' },
        },
      },
    },
    stageAttemptWorkbench: {
      evidence_attempts: [],
      attempts: [
        {
          stage_attempt_id: 'attempt-progress-first-stale',
          task_id: 'task-progress-first-stale',
          domain_id: 'medautoscience',
          stage_id: 'domain_owner/default-executor-dispatch',
          provider_kind: 'temporal',
          local_status: 'running',
          provider_run: {
            provider_status: 'running',
            last_heartbeat_at: '2026-05-31T00:00:00.000Z',
            progress_freshness_status: 'stale',
          },
          current_provider_readiness: {
            details: {
              worker_readiness: {
                lifecycle_status: 'ready',
                readiness_status: 'ready',
                repair_action: {
                  action_id: 'none',
                },
              },
            },
          },
          current_control_state: {
            task_kind: 'domain_owner/default-executor-dispatch',
          },
          closeout_refs: ['owner-closeout:attempt-progress-first-stale'],
          stage_progress_log: {
            freshness_status: 'stale',
            user_stage_log: {
              semantic_status: 'provided_by_domain',
              progress_delta_classification: 'platform_repair',
              next_forced_delta: '',
            },
            timeline: {
              last_heartbeat_at: '2026-05-31T00:00:00.000Z',
              progress_freshness_status: 'stale',
            },
          },
        },
      ],
    },
  });

  const progressAction = progressFirstRoutes.find((route: { action_kind: string }) =>
    route.action_kind === 'progress_first_attempt_supervision'
  ) as Record<string, any> | undefined;

  assert.ok(progressAction);
  assert.deepEqual(progressAction.missing_progress_signals, [
    'next_action',
    'stale_progress',
  ]);
  assert.equal(progressAction.supervisor_safe_action_kind, 'require_domain_typed_blocker_or_fresh_progress_delta');
  assert.equal(progressAction.typed_blocker_requirement.status, 'required_when_no_fresh_progress_delta');
  assert.equal(progressAction.typed_blocker_requirement.owner, 'domain_owner');
  assert.equal(progressAction.authority_boundary.can_create_typed_blocker, false);
});
