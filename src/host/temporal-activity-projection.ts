import {
  buildFoundryTemporalActivities,
  codexStageActivity,
  createProductionFoundryKernel,
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

export function buildCordisTemporalActivities() {
  const createStageRouteComposition = () => createCordisStageRouteComposition();
  return {
    ...buildFoundryTemporalActivities(() => createProductionFoundryKernel({
      create_foundry_dev_composition: createCordisFoundryDevComposition,
    })),
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

export function registerCordisTemporalActivities() {
  registerTemporalActivityProjection(buildCordisTemporalActivities);
}
