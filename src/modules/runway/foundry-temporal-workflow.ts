import {
  ActivityCancellationType,
  CancellationScope,
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

const advanceActivities = proxyActivities<FoundryTemporalActivities>({
  scheduleToCloseTimeout: '35 minutes',
  startToCloseTimeout: '30 minutes',
  cancellationType: ActivityCancellationType.TRY_CANCEL,
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
  requestDigest: string,
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
    request_digest: requestDigest,
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
  if (!/^sha256:[a-f0-9]{64}$/.test(input.request_digest)) {
    throw new Error('FoundryRun Workflow input requires an exact request_digest.');
  }
  let state = stateFor(input.run_id, input.request_digest, null);
  let mutationTail = Promise.resolve();
  let activeAdvanceScope: CancellationScope | null = null;
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
  const adoptInspection = (inspection: NonNullable<FoundryRunWorkflowState['inspection']>) => {
    if (
      inspection.run.run_id !== input.run_id
      || inspection.run.request_digest !== input.request_digest
    ) {
      throw new Error('Foundry activity returned an inspection for a different immutable run request.');
    }
    const current = state.inspection;
    if (current && inspection.run.revision < current.run.revision) return state;
    if (
      current
      && inspection.run.revision === current.run.revision
      && inspection.run.last_event_hash !== current.run.last_event_hash
    ) {
      throw new Error('Foundry activities returned conflicting event chains at the same revision.');
    }
    state = stateFor(input.run_id, input.request_digest, inspection);
    return state;
  };
  setHandler(foundryRunQuery, () => state);

  setHandler(foundryOwnerDecisionUpdate, async (decision) => {
    requireMatchingRun(input.run_id, decision.run_id);
    adoptInspection(await serialize(
      () => activities.foundrySubmitOwnerDecisionActivity(decision),
    ));
    return state;
  });
  setHandler(foundryCancelUpdate, async (cancellation) => {
    requireMatchingRun(input.run_id, cancellation.run_id);
    adoptInspection(await serialize(
      () => activities.foundryCancelRunActivity(cancellation),
    ));
    activeAdvanceScope?.cancel();
    return state;
  });

  adoptInspection(await serialize(() => activities.foundryStartRunActivity(input)));

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
    let operation: ReturnType<typeof foundryAdvanceOperationForInspection> | null = null;
    let scope: CancellationScope | null = null;
    try {
      if (!state.inspection) throw new Error('FoundryRun inspection is unavailable during automatic advance.');
      const nextOperation = foundryAdvanceOperationForInspection(state.inspection);
      operation = nextOperation;
      scope = new CancellationScope();
      activeAdvanceScope = scope;
      adoptInspection(await scope.run(
        () => advanceActivities.foundryAdvanceRunActivity.executeWithOptions(
          { activityId: nextOperation.operation_key },
          [nextOperation],
        ),
      ));
    } catch (error) {
      const current = state.inspection;
      const operationStillCurrent = operation !== null
        && current?.run.revision === operation.expected_revision
        && current.run.state === operation.expected_state
        && current.run.last_event_hash === operation.input_digest;
      if (
        (current ? TERMINAL_STATES.has(current.run.state) : false)
        || !operationStillCurrent
      ) {
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      adoptInspection(await serialize(
        () => activities.foundryFailRunActivity({
          run_id: input.run_id,
          failure_code: foundryActivityFailureCode(error),
          failure_message: message,
        }),
      ));
    } finally {
      if (scope && activeAdvanceScope === scope) activeAdvanceScope = null;
    }
  }
  return state;
}
