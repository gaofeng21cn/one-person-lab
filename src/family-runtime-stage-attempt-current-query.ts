import { DatabaseSync } from 'node:sqlite';

import {
  inspectFamilyRuntimeProviderWithLifecycle,
} from './family-runtime-providers.ts';
import { queryStageAttempt } from './family-runtime-stage-attempt-query.ts';
import {
  inspectStageAttempt,
} from './family-runtime-stage-attempts.ts';
import {
  buildStageAttemptCurrentProviderReadinessPayload,
} from './family-runtime-stage-attempt-provider-readiness-currentness.ts';
import type { TemporalStageAttemptVisibilityReadiness } from './family-runtime-temporal-visibility.ts';

type ProviderReadinessPaths = {
  root: string;
};

type ProviderReadinessOptions = {
  managedProviderProjection?: {
    managed_temporal_state_consistency?: Record<string, unknown> | null;
  } | null;
};

function temporalVisibilityReadinessFromProviderInspection(
  provider: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>>,
) {
  const temporalReadiness = provider.details?.temporal_visibility_readiness;
  return temporalReadiness && typeof temporalReadiness === 'object' && !Array.isArray(temporalReadiness)
    ? temporalReadiness as TemporalStageAttemptVisibilityReadiness
    : null;
}

export async function queryStageAttemptWithCurrentProviderReadiness(
  db: DatabaseSync,
  stageAttemptId: string,
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions = {},
  queryOptions: {
    temporalQuery?: Record<string, unknown> | null;
  } = {},
) {
  const attempt = inspectStageAttempt(db, stageAttemptId);
  const provider = await inspectFamilyRuntimeProviderWithLifecycle(attempt.provider_kind, paths, options);
  return queryStageAttempt(db, stageAttemptId, {
    temporalVisibilityReadiness: temporalVisibilityReadinessFromProviderInspection(provider),
    temporalQuery: queryOptions.temporalQuery ?? null,
    currentProviderReadiness: buildStageAttemptCurrentProviderReadinessPayload(provider, attempt.provider_kind),
  });
}
