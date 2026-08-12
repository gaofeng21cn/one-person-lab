import type { DatabaseSync } from 'node:sqlite';

import {
  getStageAttemptRow,
} from './family-runtime-stage-attempt-ledger.ts';
import { requireResolvedPersistedStageAttemptIdentity } from './family-runtime-persisted-identity-admission.ts';

type TemporalStageAttemptUnavailableObservation = {
  surface_kind: 'temporal_stage_attempt_query_unavailable';
  provider_kind: 'temporal';
  stage_attempt_id: string;
  workflow_id: string;
  status: 'unavailable';
  reason: string;
};

function isTemporalStageAttemptUnavailableObservation(
  observation: unknown,
): observation is TemporalStageAttemptUnavailableObservation {
  return (
    typeof observation === 'object'
    && observation !== null
    && !Array.isArray(observation)
    && (observation as Record<string, unknown>).surface_kind === 'temporal_stage_attempt_query_unavailable'
    && (observation as Record<string, unknown>).provider_kind === 'temporal'
    && (observation as Record<string, unknown>).status === 'unavailable'
    && typeof (observation as Record<string, unknown>).stage_attempt_id === 'string'
    && typeof (observation as Record<string, unknown>).workflow_id === 'string'
    && typeof (observation as Record<string, unknown>).reason === 'string'
  );
}

export function syncStageAttemptFromTemporalUnavailableObservation(
  db: DatabaseSync,
  observation: unknown,
) {
  if (!isTemporalStageAttemptUnavailableObservation(observation)) {
    return null;
  }
  if (observation.reason !== 'temporal_workflow_not_started_or_not_found') {
    return null;
  }
  const row = getStageAttemptRow(db, observation.stage_attempt_id);
  if (
    !row
    || row.provider_kind !== 'temporal'
    || row.workflow_id !== observation.workflow_id
  ) {
    return null;
  }
  requireResolvedPersistedStageAttemptIdentity({
    db,
    stageAttemptId: observation.stage_attempt_id,
    operation: 'sync_stage_attempt_from_temporal_unavailable_observation',
  });
  return null;
}
