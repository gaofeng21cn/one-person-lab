import { Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';

import {
  FoundryTransientActivityError,
  FoundryOperationResultUnavailableError,
  foundryEvaluationOperationIdentity,
  type FoundryKernel,
  type FoundryRunInspection,
  type FoundryRunState,
} from '../foundry/index.ts';
import type {
  FoundryAdvanceRunActivityInput,
  FoundryCancelUpdate,
  FoundryOwnerDecisionUpdate,
  FoundryRunWorkflowInput,
  FoundryTemporalActivities,
} from './foundry-temporal.ts';
import { foundryAdvanceOperationKey } from './foundry-temporal.ts';

export type FoundryKernelFactory = () => Promise<FoundryKernel> | FoundryKernel;

async function productionKernel() {
  const runtime = await import('./foundry-production-runtime.ts');
  return runtime.createProductionFoundryKernel();
}

const ADVANCE_SUCCESSORS: Record<FoundryAdvanceRunActivityInput['phase'], ReadonlySet<FoundryRunState>> = {
  start_design: new Set(['designing', 'failed', 'quarantined']),
  design: new Set(['materializing', 'failed', 'quarantined']),
  materialize: new Set(['evaluating', 'failed', 'quarantined']),
  evaluate: new Set(['qualified', 'evidence_ready', 'completed_unqualified', 'failed', 'quarantined']),
  start_diagnosis: new Set(['diagnosing', 'failed', 'quarantined']),
  diagnose: new Set(['materializing', 'completed_unqualified', 'failed', 'quarantined']),
  qualification_route: new Set(['canary', 'awaiting_owner_canary', 'completed_qualified', 'failed', 'quarantined']),
  canary: new Set(['activating', 'awaiting_owner_active', 'evidence_ready', 'completed_unqualified', 'failed', 'quarantined']),
  activate: new Set(['completed_active', 'failed', 'quarantined']),
};

const ADVANCE_STATE_BY_PHASE: Record<FoundryAdvanceRunActivityInput['phase'], FoundryRunState> = {
  start_design: 'accepted',
  design: 'designing',
  materialize: 'materializing',
  evaluate: 'evaluating',
  start_diagnosis: 'evidence_ready',
  diagnose: 'diagnosing',
  qualification_route: 'qualified',
  canary: 'canary',
  activate: 'activating',
};

const JOURNALED_EVALUATION_PHASES = new Set<FoundryAdvanceRunActivityInput['phase']>([
  'evaluate',
  'canary',
]);

function failClosed(message: string, input: FoundryAdvanceRunActivityInput, inspection?: FoundryRunInspection): never {
  throw ApplicationFailure.nonRetryable(message, 'FoundryUnknownActivityOutcomeError', {
    operation_key: input.operation_key,
    expected_revision: input.expected_revision,
    expected_state: input.expected_state,
    actual_revision: inspection?.run.revision ?? null,
    actual_state: inspection?.run.state ?? null,
  });
}

function validateOperationIdentity(input: FoundryAdvanceRunActivityInput) {
  if (
    input.surface_kind !== 'opl_temporal_foundry_advance_operation'
    || input.version !== 'opl-temporal-foundry-advance-operation.v1'
    || !input.run_id.trim()
    || !Number.isSafeInteger(input.generation)
    || input.generation < 0
    || !Number.isSafeInteger(input.expected_revision)
    || input.expected_revision < 1
    || !Object.hasOwn(ADVANCE_STATE_BY_PHASE, input.phase)
    || ADVANCE_STATE_BY_PHASE[input.phase] !== input.expected_state
    || !/^sha256:[a-f0-9]{64}$/.test(input.input_digest)
    || input.operation_key !== foundryAdvanceOperationKey(input)
  ) {
    failClosed('Foundry Temporal advance operation identity is invalid.', input);
  }
  const info = Context.current().info;
  if (info.activityId !== input.operation_key) {
    failClosed('Foundry Temporal activityId does not bind the immutable operation key.', input);
  }
  return info;
}

function recoveredResult(
  input: FoundryAdvanceRunActivityInput,
  inspection: FoundryRunInspection,
) {
  return inspection.run.revision === input.expected_revision + 1
    && ADVANCE_SUCCESSORS[input.phase].has(inspection.run.state);
}

function assertCurrentOperation(
  input: FoundryAdvanceRunActivityInput,
  inspection: FoundryRunInspection,
) {
  if (inspection.run.run_id !== input.run_id) {
    failClosed('Foundry Temporal advance operation resolved a different run.', input, inspection);
  }
  if (recoveredResult(input, inspection)) return 'recovered' as const;
  if (
    inspection.run.revision !== input.expected_revision
    || inspection.run.state !== input.expected_state
    || inspection.run.generation !== input.generation
    || inspection.run.last_event_hash !== input.input_digest
  ) {
    failClosed('Foundry Temporal advance operation drifted from its frozen ledger input.', input, inspection);
  }
  return 'execute' as const;
}

export function buildFoundryTemporalActivities(
  createKernel: FoundryKernelFactory = productionKernel,
): FoundryTemporalActivities {
  return {
    async foundryStartRunActivity(input: FoundryRunWorkflowInput) {
      const kernel = await createKernel();
      const started = await kernel.startRun({ request: input.request, run_id: input.run_id });
      return kernel.inspectRun(started.run_id);
    },
    async foundryAdvanceRunActivity(input: FoundryAdvanceRunActivityInput) {
      const info = validateOperationIdentity(input);
      const kernel = await createKernel();
      const before = await kernel.inspectRun(input.run_id);
      if (assertCurrentOperation(input, before) === 'recovered') return before;
      try {
        let operationKey: string | undefined;
        if (input.phase === 'evaluate' || input.phase === 'canary') {
          operationKey = foundryEvaluationOperationIdentity({
              run_id: input.run_id,
              generation: input.generation,
              phase: input.phase,
              input_digest: input.input_digest,
            }).operation_key;
        }
        const after = await kernel.advanceRunStep(input.run_id, {
          operation_key: operationKey,
          replay_only: info.attempt > 1 && JOURNALED_EVALUATION_PHASES.has(input.phase),
        });
        if (!recoveredResult(input, after)) {
          failClosed('Foundry Temporal advance operation returned without one exact ledger transition.', input, after);
        }
        return after;
      } catch (error) {
        if (error instanceof FoundryOperationResultUnavailableError) {
          failClosed(
            'Foundry evaluation outcome is unknown and no durable operation result exists; refusing to repeat it.',
            input,
            before,
          );
        }
        if (error instanceof FoundryTransientActivityError) {
          throw ApplicationFailure.retryable(error.message, error.name);
        }
        throw error;
      }
    },
    async foundrySubmitOwnerDecisionActivity(input: FoundryOwnerDecisionUpdate) {
      return (await createKernel()).submitOwnerDecision(input, { advance: false });
    },
    async foundryCancelRunActivity(input: FoundryCancelUpdate) {
      return (await createKernel()).cancelRun(input);
    },
    async foundryFailRunActivity(input) {
      return (await createKernel()).failRun(input);
    },
  };
}

const productionActivities = buildFoundryTemporalActivities();

export const foundryStartRunActivity = productionActivities.foundryStartRunActivity;
export const foundryAdvanceRunActivity = productionActivities.foundryAdvanceRunActivity;
export const foundrySubmitOwnerDecisionActivity = productionActivities.foundrySubmitOwnerDecisionActivity;
export const foundryCancelRunActivity = productionActivities.foundryCancelRunActivity;
export const foundryFailRunActivity = productionActivities.foundryFailRunActivity;
