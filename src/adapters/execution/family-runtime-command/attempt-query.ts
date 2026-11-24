import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import {
  inspectStageAttempt,
  inspectStageAttemptWithCurrentProviderReadiness,
  queryStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../family-runtime-stage-attempts.ts';
import { queryStageAttemptWithCurrentProviderReadiness } from '../family-runtime-stage-attempt-current-query.ts';
import { listStageAttemptsWithMonitoringProjection } from '../family-runtime-stage-attempt-monitoring.ts';
import { queryTemporalStageAttemptReadModel } from '../family-runtime-temporal-query.ts';
import type { FamilyRuntimeAttemptCommandContext } from './attempt-shared.ts';
import { stageAttemptAllowsRuntimeRefresh } from './attempt-shared.ts';

export type AttemptListCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_list' }>;
};

export async function runAttemptListCommand(
  context: AttemptListCommandContext,
): Promise<Record<string, unknown>> {
  const { db, paths, parsed, managedProviderProjection } = context;
  const projection = await listStageAttemptsWithMonitoringProjection(db, paths, {
    managedProviderProjection: managedProviderProjection(),
  }, parsed.filters);
  return {
    version: 'g2',
    family_runtime_stage_attempts: {
      surface_id: 'opl_family_runtime_stage_attempts',
      provider_runtime_metadata: projection.provider_runtime_metadata,
      summary: projection.summary,
      filters: projection.filters,
      view_mode: projection.compact_timeline ? 'compact_timeline' : 'full',
      items: projection.compact_timeline ?? projection.attempts,
      attempts: projection.compact_timeline ?? projection.attempts,
      ...(projection.compact_timeline ? { compact_timeline: projection.compact_timeline } : {}),
    },
  };
}

export type AttemptInspectCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_inspect' }>;
};

export async function runAttemptInspectCommand(
  context: AttemptInspectCommandContext,
): Promise<Record<string, unknown>> {
  const { db, paths, parsed, managedProviderProjection } = context;
  const currentAttempt = inspectStageAttempt(db, parsed.stageAttemptId);
  const mayRefresh = stageAttemptAllowsRuntimeRefresh(
    db,
    parsed.stageAttemptId,
    'family_runtime_attempt_inspect_refresh',
  );
  const temporal_query = mayRefresh
    ? await queryTemporalStageAttemptReadModel(currentAttempt, { paths })
    : null;
  if (mayRefresh) syncStageAttemptFromTemporalTerminalObservation(db, temporal_query);
  return {
    version: 'g2',
    family_runtime_stage_attempt: {
      surface_id: 'opl_family_runtime_stage_attempt',
      attempt: await inspectStageAttemptWithCurrentProviderReadiness(db, parsed.stageAttemptId, paths, {
        managedProviderProjection: managedProviderProjection(),
      }),
      temporal_query,
    },
  };
}

export type AttemptQueryCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_query' }>;
};

export async function runAttemptQueryCommand(
  context: AttemptQueryCommandContext,
): Promise<Record<string, unknown>> {
  const { db, paths, parsed, managedProviderProjection } = context;
  const localQuery = queryStageAttempt(db, parsed.stageAttemptId);
  const attempt = localQuery.stage_attempt_query.attempt;
  const mayRefresh = stageAttemptAllowsRuntimeRefresh(
    db,
    parsed.stageAttemptId,
    'family_runtime_attempt_query_refresh',
  );
  const temporal_query = mayRefresh
    ? await queryTemporalStageAttemptReadModel(attempt, { paths })
    : null;
  if (mayRefresh) syncStageAttemptFromTemporalTerminalObservation(db, temporal_query);
  const projectedQuery = await queryStageAttemptWithCurrentProviderReadiness(db, parsed.stageAttemptId, paths, {
    managedProviderProjection: managedProviderProjection(),
  }, {
    temporalQuery: temporal_query && typeof temporal_query === 'object' && !Array.isArray(temporal_query)
      ? temporal_query
      : null,
  });
  return {
    version: 'g2',
    family_runtime_stage_attempt_query: {
      surface_id: 'opl_family_runtime_stage_attempt_query',
      attempt: projectedQuery.stage_attempt_query.attempt,
      attempt_ref: `opl://stage_attempts/${projectedQuery.stage_attempt_query.attempt.stage_attempt_id}`,
      attempt_status: projectedQuery.stage_attempt_query.attempt.status,
      current_provider_readiness: projectedQuery.stage_attempt_query.current_provider_readiness,
      temporal_durable_lifecycle_readback:
        projectedQuery.stage_attempt_query.temporal_durable_lifecycle_readback,
      ...projectedQuery,
      temporal_query,
    },
  };
}
