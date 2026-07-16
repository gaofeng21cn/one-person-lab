import {
  condition,
  defineQuery,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type { FoundryRunState } from '../foundry/index.ts';
import {
  FOUNDRY_CANCEL_UPDATE_NAME,
  FOUNDRY_OWNER_DECISION_UPDATE_NAME,
  FOUNDRY_RUN_QUERY_NAME,
  foundryAdvanceOperationForInspection,
  type FoundryCancelUpdate,
  type FoundryOwnerDecisionUpdate,
  type FoundryRunWorkflowInput,
  type FoundryRunWorkflowState,
  type FoundryTemporalActivities,
} from './foundry-temporal.ts';

const TERMINAL_STATES = new Set<FoundryRunState>([
  'completed_active',
  'completed_qualified',
  'completed_unqualified',
  'rejected',
  'cancelled',
  'failed',
  'quarantined',
]);

export const foundryRunQuery = defineQuery<FoundryRunWorkflowState>(FOUNDRY_RUN_QUERY_NAME);
export const foundryOwnerDecisionUpdate = defineUpdate<
  FoundryRunWorkflowState,
  [FoundryOwnerDecisionUpdate]
>(FOUNDRY_OWNER_DECISION_UPDATE_NAME);
export const foundryCancelUpdate = defineUpdate<
  FoundryRunWorkflowState,
  [FoundryCancelUpdate]
>(FOUNDRY_CANCEL_UPDATE_NAME);

const activities = proxyActivities<FoundryTemporalActivities>({
  scheduleToCloseTimeout: '35 minutes',
  startToCloseTimeout: '30 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    maximumInterval: '10 seconds',
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ['FrameworkContractError'],
  },
});

function stateFor(
  runId: string,
  inspection: FoundryRunWorkflowState['inspection'],
): FoundryRunWorkflowState {
  const runState = inspection?.run.state ?? null;
  const workflowStatus = runState === 'awaiting_owner_canary' || runState === 'awaiting_owner_active'
    ? runState
    : runState && TERMINAL_STATES.has(runState)
      ? 'terminal'
      : inspection ? 'running' : 'starting';
  return {
    surface_kind: 'opl_temporal_foundry_run',
    version: 'opl-temporal-foundry-run.v1',
    provider_kind: 'temporal',
    run_id: runId,
    workflow_status: workflowStatus,
    inspection,
  };
}

function requireMatchingRun(expectedRunId: string, actualRunId: string) {
  if (actualRunId !== expectedRunId) {
    throw new Error(`Foundry update targets ${actualRunId}; expected ${expectedRunId}.`);
  }
}

function foundryActivityFailureCode(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object') break;
    const failure = current as { type?: unknown; cause?: unknown };
    if (failure.type === 'FoundryUnknownActivityOutcomeError') {
      return 'foundry_activity_unknown_outcome';
    }
    current = failure.cause;
  }
  return 'foundry_activity_retry_exhausted';
}

export async function FoundryRunWorkflow(
  input: FoundryRunWorkflowInput,
): Promise<FoundryRunWorkflowState> {
  let state = stateFor(input.run_id, null);
  let mutationTail = Promise.resolve();
  const serialize = async <T>(operation: () => Promise<T>) => {
    const previous = mutationTail;
    let release!: () => void;
    mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };
  setHandler(foundryRunQuery, () => state);

  setHandler(foundryOwnerDecisionUpdate, async (decision) => {
    requireMatchingRun(input.run_id, decision.run_id);
    state = stateFor(input.run_id, await serialize(
      () => activities.foundrySubmitOwnerDecisionActivity(decision),
    ));
    return state;
  });
  setHandler(foundryCancelUpdate, async (cancellation) => {
    requireMatchingRun(input.run_id, cancellation.run_id);
    state = stateFor(input.run_id, await serialize(
      () => activities.foundryCancelRunActivity(cancellation),
    ));
    return state;
  });

  state = stateFor(input.run_id, await serialize(() => activities.foundryStartRunActivity(input)));

  while (state.workflow_status !== 'terminal') {
    if (
      state.workflow_status === 'awaiting_owner_canary'
      || state.workflow_status === 'awaiting_owner_active'
    ) {
      await condition(() =>
        state.workflow_status !== 'awaiting_owner_canary'
        && state.workflow_status !== 'awaiting_owner_active');
      continue;
    }
    try {
      if (!state.inspection) throw new Error('FoundryRun inspection is unavailable during automatic advance.');
      const operation = foundryAdvanceOperationForInspection(state.inspection);
      state = stateFor(input.run_id, await serialize(
        () => activities.foundryAdvanceRunActivity.executeWithOptions(
          { activityId: operation.operation_key },
          [operation],
        ),
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state = stateFor(input.run_id, await serialize(
        () => activities.foundryFailRunActivity({
          run_id: input.run_id,
          failure_code: foundryActivityFailureCode(error),
          failure_message: message,
        }),
      ));
    }
  }
  return state;
}
