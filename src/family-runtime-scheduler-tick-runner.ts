import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import type { FamilyRuntimeDomainProfiles, FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { enqueueTask } from './family-runtime-enqueue.ts';
import { dispatchFamilyRuntimeTask } from './family-runtime-task-dispatch.ts';
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
  },
) {
  if (!options?.temporalProviderModule) {
    throw new FrameworkContractError('contract_shape_invalid', 'Scheduler queue tick requires an explicit Temporal provider module loader.');
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
    }),
  });
}
