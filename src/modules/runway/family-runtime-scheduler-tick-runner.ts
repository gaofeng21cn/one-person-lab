import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../charter/index.ts';
import type { FamilyRuntimeDomainProfiles, FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { enqueueTask } from './family-runtime-enqueue.ts';
import { dispatchFamilyRuntimeTask } from './family-runtime-task-dispatch.ts';
import { hydrateDomainTasks } from './family-runtime-domain-intake.ts';
import { queryTemporalStageAttemptReadModel } from './family-runtime-temporal-query.ts';
import { runFamilyRuntimeQueueTick } from './family-runtime-tick.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';

type SchedulerDispatchResult = Awaited<ReturnType<typeof dispatchFamilyRuntimeTask>>;
type QueryTemporalStageAttemptReadModel = typeof queryTemporalStageAttemptReadModel;

export function runSchedulerQueueTick(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  source: string,
  limit: number,
  hydrate: boolean,
  taskScope?: FamilyRuntimeTaskScope,
  domainProfiles?: FamilyRuntimeDomainProfiles,
  options?: {
    temporalProviderModule: Parameters<typeof dispatchFamilyRuntimeTask>[3]['temporalProviderModule'];
    queryTemporalStageAttemptReadModel?: QueryTemporalStageAttemptReadModel;
    dispatchEnabled?: boolean;
    blockedReason?: string;
  },
) {
  if (!options?.temporalProviderModule) {
    throw new FrameworkContractError('contract_shape_invalid', 'Scheduler queue tick requires an explicit Temporal provider module loader.');
  }
  if (options.dispatchEnabled === false) {
    const hydration = hydrate
      ? hydrateDomainTasks(db, paths, {
        source: `${source}:hydrate`,
        taskScope,
        domainProfiles,
      }, enqueueTask)
      : {
        source,
        task_scope: taskScope ?? null,
        enqueued_count: 0,
        requeued_count: 0,
        idempotent_noop_count: 0,
        blocked_count: 0,
        filtered_count: 0,
        exports: [],
      };
    return {
      source,
      task_scope: taskScope ?? null,
      hydration,
      selected_count: 0,
      filtered_count: 0,
      dispatches: [],
      dispatch_blocked_reason: options.blockedReason ?? 'provider_not_ready',
      progress_first_owner_delta_admission: {
        surface_kind: 'opl_progress_first_owner_delta_admission',
        admission_policy: 'owner_delta_materialized_before_provider_dispatch',
        admission_status: 'dispatch_blocked_provider_not_ready',
        selected_before_maintenance_count: 0,
        final_selected_count: 0,
        maintenance_reconcile_ran_before_dispatch: false,
        maintenance_reconcile_deferred_by_owner_delta: false,
        authority_boundary: {
          opl: 'queue_admission_ordering_and_provider_dispatch_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    };
  }
  return runFamilyRuntimeQueueTick(db, paths, {
    source,
    limit,
    hydrate,
    taskScope,
    domainProfiles,
  }, {
    enqueueTask,
    queryTemporalStageAttempt: (attempt) => (
      options.queryTemporalStageAttemptReadModel ?? queryTemporalStageAttemptReadModel
    )(attempt, { paths }),
    dispatchTask: (queueDb, queuePaths, row) => dispatchFamilyRuntimeTask(queueDb, queuePaths, row, {
      temporalProviderModule: options.temporalProviderModule,
      queryTemporalStageAttemptReadModel: options.queryTemporalStageAttemptReadModel,
    }),
  });
}
