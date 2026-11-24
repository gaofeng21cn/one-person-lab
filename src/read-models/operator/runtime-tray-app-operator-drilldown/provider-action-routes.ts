import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import { buildProviderSchedulerActionRoutes } from './provider-scheduler-action-routes.ts';
import { buildProviderWorkerActionRoutes } from './provider-worker-action-routes.ts';
import {
  buildProgressFirstSupervisionActionRoutes,
} from './progress-first-supervision-action-routes.ts';

export function buildProviderActionRoutes(input: {
  periodicRefs: JsonRecord;
  stageAttemptWorkbench: JsonRecord;
  providerInspection?: JsonRecord;
}) {
  const providerWorkerActionRoutes = buildProviderWorkerActionRoutes({
    stageAttemptWorkbench: input.stageAttemptWorkbench,
    providerInspection: input.providerInspection,
  });
  return [
    ...providerWorkerActionRoutes,
    ...buildProgressFirstSupervisionActionRoutes({
      stageAttemptWorkbench: input.stageAttemptWorkbench,
    }),
    ...buildProviderSchedulerActionRoutes(input.periodicRefs, {
      providerWorkerActionRoutes,
    }),
  ];
}
