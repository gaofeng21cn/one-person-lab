import { record, stringValue, type JsonRecord } from '../../../../kernel/json-record.ts';
import { inspectTemporalRuntimeObservation } from '../temporal-runtime-observation.ts';
import { bindingId } from './activity-store.ts';
import { identityForItem } from './identity-admission.ts';
import type {
  WorkItemExecutionSessionBinding,
} from './types.ts';
import type { WorkItemProjectionItem } from '../types.ts';

function freshStageAttemptRuntimeObservation(attempt: JsonRecord, now = Date.now()) {
  if (stringValue(attempt.provider_kind) !== 'temporal') return null;
  const observation = record(record(attempt.provider_run).runtime_observation);
  if (
    stringValue(observation.surface_kind) !== 'temporal_stage_attempt_runtime_observation'
    || stringValue(observation.source) !== 'temporal_workflow_query'
    || stringValue(observation.stage_attempt_id) !== stringValue(attempt.stage_attempt_id)
    || stringValue(observation.workflow_id) !== stringValue(attempt.workflow_id)
  )
    return null;
  const temporal = inspectTemporalRuntimeObservation(observation, now);
  return temporal.status === 'running'
    ? {
        observed_at: temporal.observed_at,
        expires_at: temporal.expires_at,
        ttl_ms: temporal.ttl_ms,
      }
    : null;
}

export function deriveControlledExecutionSessionBindings(input: {
  items: WorkItemProjectionItem[];
  attempts: JsonRecord[];
  queueDb: string;
  now?: () => number;
}) {
  const nowMs = (input.now ?? Date.now)();
  const attemptById = new Map(
    input.attempts.map((attempt) => [stringValue(attempt.stage_attempt_id), attempt]),
  );
  const bindings: WorkItemExecutionSessionBinding[] = [];
  for (const item of input.items) {
    const attemptId = item.execution.attempt_id;
    const attempt = attemptId ? attemptById.get(attemptId) : null;
    if (!attempt) continue;
    const workflowId = stringValue(attempt.workflow_id);
    const executionSessionRef = stringValue(attempt.execution_session_ref);
    if (
      !workflowId
      || workflowId !== item.execution.workflow_id
      || !executionSessionRef
      || !/^codex:\/\/threads\/[0-9a-z-]+$/iu.test(executionSessionRef)
    )
      continue;
    const runtime = freshStageAttemptRuntimeObservation(attempt, nowMs);
    if (!runtime) continue;
    const observedMs = Date.parse(runtime.observed_at);
    bindings.push({
      binding_id: `${bindingId(executionSessionRef)}#stage-attempt=${attemptId}`,
      execution_session_ref: executionSessionRef,
      identity: identityForItem(item),
      activity_kind: 'controlled_execution',
      activity_state: 'running',
      stage_attempt_id: attemptId,
      workflow_id: workflowId,
      observed_at: runtime.observed_at,
      ttl_ms: runtime.ttl_ms,
      expires_at: runtime.expires_at,
      sequence: Number.isSafeInteger(observedMs) && observedMs >= 0 ? observedMs : 0,
      source_ref: `${input.queueDb}#stage_attempts/${attemptId}`,
      recorded_at: runtime.observed_at,
    });
  }
  return bindings;
}
