import {
  ActivityCancellationType,
  CancellationScope,
  ContinueAsNew,
  allHandlersFinished,
  condition,
  continueAsNew,
  defineQuery,
  defineUpdate,
  patched,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type { FoundryRunState } from '../../authority/evolution/index.ts';
import type { FoundryProviderOperationCursor } from './foundry-provider-stage-run.ts';
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

const providerActivities = proxyActivities<FoundryTemporalActivities>({
  scheduleToCloseTimeout: '2 minutes',
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    maximumInterval: '10 seconds',
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ['FrameworkContractError', 'FoundryUnknownActivityOutcomeError'],
  },
});

function stateFor(
  runId: string,
  requestDigest: string,
  inspection: FoundryRunWorkflowState['inspection'],
  providerOperationCursor: FoundryProviderOperationCursor | null,
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
    provider_operation_cursor: providerOperationCursor,
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

function transientProviderObservationFailure(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object') break;
    const failure = current as { name?: unknown; type?: unknown; cause?: unknown };
    if (
      failure.name === 'TimeoutFailure'
      || failure.type === 'TimeoutFailure'
      || failure.name === 'FoundryTransientActivityError'
      || failure.type === 'FoundryTransientActivityError'
    ) {
      return true;
    }
    current = failure.cause;
  }
  return false;
}

const PROVIDER_OBSERVATION_INTERVAL = '5 seconds';
const PROVIDER_OBSERVATIONS_PER_EXECUTION = 64;

export async function FoundryRunWorkflow(
  input: FoundryRunWorkflowInput,
): Promise<FoundryRunWorkflowState> {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.request_digest)) {
    throw new Error('FoundryRun Workflow input requires an exact request_digest.');
  }
  const durableProviderOperationsEnabled = patched('opl-foundry-durable-provider-operation-v1');
  const providerGenerationV2Enabled = patched('opl-foundry-durable-provider-generation-v2');
  let state = stateFor(
    input.run_id,
    input.request_digest,
    null,
    providerGenerationV2Enabled ? input.provider_operation_cursor ?? null : null,
  );
  const workflowIsTerminal = () => state.workflow_status === 'terminal';
  let mutationTail = Promise.resolve();
  let activeAdvanceScope: CancellationScope | null = null;
  let activeProviderOperation: {
    operation: ReturnType<typeof foundryAdvanceOperationForInspection>;
    cursor: FoundryProviderOperationCursor;
  } | null = null;
  let providerCancellationRequested = false;
  let providerTransitionInFlight = false;
  let providerObservations = 0;
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
    state = stateFor(
      input.run_id,
      input.request_digest,
      inspection,
      state.provider_operation_cursor,
    );
    return state;
  };
  const adoptProviderCursor = (
    operation: ReturnType<typeof foundryAdvanceOperationForInspection>,
    cursor: FoundryProviderOperationCursor,
  ) => {
    if (cursor.operation_key !== operation.operation_key) {
      throw new Error('Foundry provider cursor does not bind the current immutable operation.');
    }
    activeProviderOperation = { operation, cursor };
    state = { ...state, provider_operation_cursor: cursor };
    return cursor;
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
    if (!durableProviderOperationsEnabled) {
      adoptInspection(await serialize(
        () => activities.foundryCancelRunActivity(cancellation),
      ));
      activeAdvanceScope?.cancel();
      return state;
    }
    if (!providerGenerationV2Enabled) {
      await serialize(() => activities.foundryAuthorizeCancelRunActivity(cancellation));
      providerCancellationRequested = true;
      await condition(() => !providerTransitionInFlight);
      const providerOperation = activeProviderOperation;
      if (providerOperation) {
        const cancelledCursor = await providerActivities.foundryCancelProviderOperationActivity({
          operation: providerOperation.operation,
          cursor: providerOperation.cursor,
        });
        adoptProviderCursor(providerOperation.operation, cancelledCursor);
      }
      adoptInspection(await serialize(
        () => activities.foundryCancelRunActivity(cancellation),
      ));
      activeAdvanceScope?.cancel();
      return state;
    }
    await serialize(() => activities.foundryAuthorizeCancelRunActivity(cancellation));
    providerCancellationRequested = true;
    let providerCancelCommitted = false;
    try {
      await condition(() => !providerTransitionInFlight);
      const providerOperation = activeProviderOperation;
      if (providerOperation) {
        const cancelledCursor = await providerActivities.foundryCancelProviderOperationActivity({
          operation: providerOperation.operation,
          cursor: providerOperation.cursor,
        });
        providerCancelCommitted = true;
        adoptProviderCursor(providerOperation.operation, cancelledCursor);
      }
      adoptInspection(await serialize(
        () => activities.foundryCancelRunActivity(cancellation),
      ));
      activeAdvanceScope?.cancel();
      return state;
    } catch (error) {
      if (!providerCancelCommitted) {
        providerCancellationRequested = false;
      } else {
        const message = error instanceof Error ? error.message : String(error);
        try {
          adoptInspection(await serialize(
            () => activities.foundryFailRunActivity({
              run_id: input.run_id,
              failure_code: 'foundry_cancel_commit_failed_after_provider_cancel',
              failure_message: message,
            }),
          ));
        } finally {
          if (!workflowIsTerminal()) providerCancellationRequested = false;
        }
      }
      throw error;
    }
  });

  if (providerGenerationV2Enabled) {
    await serialize(async () => {
      adoptInspection(await activities.foundryStartRunActivity(input));
      const resumedCursor = state.provider_operation_cursor;
      if (resumedCursor?.status === 'pending') {
        const resumedOperation = foundryAdvanceOperationForInspection(state.inspection!);
        adoptProviderCursor(resumedOperation, resumedCursor);
      }
    });
  } else {
    adoptInspection(await serialize(() => activities.foundryStartRunActivity(input)));
  }

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
      let launchedProviderCursor: FoundryProviderOperationCursor | null = null;
      if (
        durableProviderOperationsEnabled
        && (nextOperation.phase === 'design' || nextOperation.phase === 'diagnose')
      ) {
        const resumedCursor = providerGenerationV2Enabled
          && state.provider_operation_cursor?.status === 'pending'
          && state.provider_operation_cursor.operation_key === nextOperation.operation_key
          ? state.provider_operation_cursor
          : null;
        if (resumedCursor) {
          launchedProviderCursor = adoptProviderCursor(nextOperation, resumedCursor);
        } else {
          providerTransitionInFlight = true;
          try {
            const launchOperation = providerGenerationV2Enabled
              ? {
                  ...nextOperation,
                  provider_operation_protocol: 'opl-foundry-provider-operation-cursor.v2' as const,
                }
              : nextOperation;
            const launched = await providerActivities
              .foundryLaunchProviderOperationActivity.executeWithOptions(
                { activityId: `${nextOperation.operation_key}/provider/launch` },
                [launchOperation],
              );
            launchedProviderCursor = launched
              ? adoptProviderCursor(nextOperation, launched)
              : null;
          } finally {
            providerTransitionInFlight = false;
          }
        }
      }
      if (launchedProviderCursor) {
        let cursor = launchedProviderCursor;
        if (!providerGenerationV2Enabled) {
          while (cursor.status !== 'terminal' && !providerCancellationRequested) {
            providerTransitionInFlight = true;
            try {
              cursor = adoptProviderCursor(
                nextOperation,
                await providerActivities.foundryObserveProviderOperationActivity({
                  operation: nextOperation,
                  cursor,
                }),
              );
            } finally {
              providerTransitionInFlight = false;
            }
            if (cursor.status !== 'terminal' && !providerCancellationRequested) {
              await sleep('1 second');
            }
          }
          if (providerCancellationRequested) {
            await condition(() => state.workflow_status === 'terminal');
            continue;
          }
        } else {
          while (cursor.status !== 'terminal') {
            if (providerCancellationRequested) {
              await condition(() =>
                workflowIsTerminal() || !providerCancellationRequested);
              if (workflowIsTerminal()) break;
              continue;
            }
            providerTransitionInFlight = true;
            try {
              try {
                cursor = adoptProviderCursor(
                  nextOperation,
                  await providerActivities.foundryObserveProviderOperationActivity({
                    operation: nextOperation,
                    cursor,
                  }),
                );
              } catch (error) {
                if (!transientProviderObservationFailure(error)) throw error;
              }
            } finally {
              providerTransitionInFlight = false;
            }
            if (cursor.status !== 'terminal') {
              providerObservations += 1;
              if (providerObservations >= PROVIDER_OBSERVATIONS_PER_EXECUTION) {
                await condition(allHandlersFinished);
                if (workflowIsTerminal()) break;
                await continueAsNew<typeof FoundryRunWorkflow>({
                  ...input,
                  provider_operation_cursor: cursor,
                });
              }
              await sleep(PROVIDER_OBSERVATION_INTERVAL);
            }
          }
          if (workflowIsTerminal()) continue;
        }
        providerTransitionInFlight = true;
        try {
          cursor = adoptProviderCursor(
            nextOperation,
            await providerActivities.foundryReadProviderOperationTerminalActivity({
              operation: nextOperation,
              cursor,
            }),
          );
        } finally {
          providerTransitionInFlight = false;
        }
        if (providerGenerationV2Enabled) {
          await condition(allHandlersFinished);
          if (workflowIsTerminal()) continue;
        }
        if (providerGenerationV2Enabled && providerCancellationRequested) {
          await condition(() => workflowIsTerminal() || !providerCancellationRequested);
          if (workflowIsTerminal()) continue;
        }
      }
      scope = new CancellationScope();
      activeAdvanceScope = scope;
      const advanceOperation = providerGenerationV2Enabled
        && state.provider_operation_cursor?.status === 'terminal'
        && state.provider_operation_cursor.operation_key === nextOperation.operation_key
        ? { ...nextOperation, provider_operation_cursor: state.provider_operation_cursor }
        : nextOperation;
      adoptInspection(await scope.run(
        () => advanceActivities.foundryAdvanceRunActivity.executeWithOptions(
          { activityId: nextOperation.operation_key },
          [advanceOperation],
        ),
      ));
    } catch (error) {
      if (error instanceof ContinueAsNew) throw error;
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
      activeProviderOperation = null;
      if (scope && activeAdvanceScope === scope) activeAdvanceScope = null;
    }
  }
  return state;
}
