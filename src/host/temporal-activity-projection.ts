import type { EvaluationExecutor } from '../authority/evolution/index.ts';
import {
  buildFoundryTemporalActivities,
  codexStageActivity,
  createProductionFoundryKernel,
  createProductionFoundryProviderOperationCoordinator,
  createProductionFoundryProviderOperationRuntime,
  domainHandlerDispatchActivity,
  schedulerTickActivity,
  stageQualityAttemptMaterializeActivity,
  stageQualityAttemptSyncActivity,
  stageQualityCycleProjectActivity,
  stageQualityReviewReceiptActivity,
  stageRunRouteLaunchActivity,
} from '../adapters/execution/index.ts';
import {
  createCordisAgentExecutorRequest,
  createCordisStageRouteComposition,
} from './plugins/cordis-agent-executor-experiment.ts';
import {
  createCordisRunwayAttemptComposition,
} from './plugins/cordis-runway-attempt.ts';
import {
  createCordisFoundryDevComposition,
} from './composition-profiles.ts';
import {
  registerTemporalActivityProjection,
} from '../kernel/temporal-activity-registration.ts';

export type CordisTemporalActivityOptions = {
  // Constructed by trusted Host code in this worker process, never a workflow payload.
  trusted_evaluation_runtime?: EvaluationExecutor;
};

export function buildCordisTemporalActivities(options: CordisTemporalActivityOptions = {}) {
  const createStageRouteComposition = () => createCordisStageRouteComposition();
  return {
    ...buildFoundryTemporalActivities(
      (input) => createProductionFoundryKernel({
        ...input,
        trusted_evaluation_runtime: options.trusted_evaluation_runtime,
        create_foundry_dev_composition: createCordisFoundryDevComposition,
        create_stage_route_composition: createStageRouteComposition,
      }),
      (input) => createProductionFoundryProviderOperationRuntime({
        ...input,
        create_foundry_dev_composition: createCordisFoundryDevComposition,
        create_stage_route_composition: createStageRouteComposition,
      }),
      () => createProductionFoundryProviderOperationCoordinator(),
    ),
    codexStageActivity: (input: Parameters<typeof codexStageActivity>[0]) =>
      codexStageActivity(input, {
        createAttemptComposition: ({ attemptRef }) => createCordisRunwayAttemptComposition({
          attemptRef,
          createAgentExecutorRequest: createCordisAgentExecutorRequest,
        }),
      }),
    domainHandlerDispatchActivity,
    schedulerTickActivity,
    stageQualityAttemptMaterializeActivity: (
      input: Parameters<typeof stageQualityAttemptMaterializeActivity>[0],
    ) => stageQualityAttemptMaterializeActivity(input, { createStageRouteComposition }),
    stageQualityAttemptSyncActivity,
    stageQualityCycleProjectActivity,
    stageQualityReviewReceiptActivity,
    stageRunRouteLaunchActivity: (
      input: Parameters<typeof stageRunRouteLaunchActivity>[0],
    ) => stageRunRouteLaunchActivity(input, { createStageRouteComposition }),
  };
}

export function registerCordisTemporalActivities(options?: CordisTemporalActivityOptions) {
  registerTemporalActivityProjection(options
    ? () => buildCordisTemporalActivities(options)
    : buildCordisTemporalActivities);
}
