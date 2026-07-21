import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { TemporalStageRunWorkflowInput } from './family-runtime-temporal.ts';
import { preflightFamilyRuntimeDomainLifecycleAdmission } from './family-runtime-domain-lifecycle-admission.ts';
import {
  claimStageRunStart,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
} from './family-runtime-stage-run-launch-registry.ts';

const TERMINAL_TEMPORAL_WORKFLOW_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
  'CANCELED',
  'CANCELLED',
  'TERMINATED',
]);

function terminalTemporalWorkflowStatus(receipt: Record<string, unknown>) {
  const workflowStatus = receipt.workflow_status;
  return typeof workflowStatus === 'string'
    && TERMINAL_TEMPORAL_WORKFLOW_STATUSES.has(workflowStatus.toUpperCase())
    ? workflowStatus.toLowerCase()
    : null;
}

export async function launchRegisteredStageRun(input: {
  db: DatabaseSync;
  stageRunInput: TemporalStageRunWorkflowInput;
  start: boolean;
  startWorkflow: (
    workflowInput: TemporalStageRunWorkflowInput,
  ) => Promise<Record<string, unknown>>;
  describeWorkflow?: (
    workflowInput: TemporalStageRunWorkflowInput,
  ) => Promise<Record<string, unknown>>;
  now?: () => Date;
  startLeaseMs?: number;
}) {
  preflightFamilyRuntimeDomainLifecycleAdmission({
    domainId: input.stageRunInput.domain_id,
    stageId: input.stageRunInput.stage_id,
    actionId: input.stageRunInput.action_id,
    domainPackRoot: input.stageRunInput.domain_pack_root,
    workspaceLocator: input.stageRunInput.workspace_locator,
  });
  const registration = registerStageRunLaunch(input.db, input.stageRunInput);
  let launch = registration.launch;
  const receipt = (startStatus: 'registered' | 'existing' | 'starting' | 'started' | 'recovered', options: {
    launch?: typeof launch;
    temporalStart?: Record<string, unknown> | null;
    providerObservationError?: string | null;
  } = {}) => ({
    surface_kind: 'opl_stage_run_durable_launch_receipt' as const,
    version: 'opl-stage-run-durable-launch-receipt.v2' as const,
    start_status: startStatus,
    registered: registration.registered,
    idempotent_replay: registration.idempotent_replay,
    launch: options.launch ?? launch,
    temporal_start: options.temporalStart ?? (options.launch ?? launch).temporal_start_receipt,
    provider_observation_error: options.providerObservationError ?? null,
  });
  if (!input.start) {
    return receipt(registration.registered ? 'registered' : 'existing');
  }

  const persistObservation = (observation: Record<string, unknown>) => {
    if (observation.workflow_found === false) return null;
    const started = recordStageRunTemporalStart(input.db, {
      stageRunId: launch.stage_run_id,
      temporalStartReceipt: observation,
      now: input.now?.(),
    });
    const terminalStatus = terminalTemporalWorkflowStatus(observation);
    return terminalStatus
      ? recordStageRunClosed(input.db, {
          stageRunId: launch.stage_run_id,
          terminalStatus,
          now: input.now?.(),
        }) ?? started
      : started;
  };

  if (launch.launch_status === 'closed') return receipt('existing');
  if (launch.launch_status === 'started' && !input.describeWorkflow) return receipt('existing');
  if (
    (launch.launch_status === 'started' || launch.launch_status === 'starting')
    && input.describeWorkflow
  ) {
    try {
      const observation = await input.describeWorkflow(launch.stage_run_input);
      const reconciled = persistObservation(observation);
      if (reconciled) {
        launch = reconciled;
        return receipt('existing', { launch, temporalStart: observation });
      }
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
      if (launch.launch_status === 'started') {
        return receipt('existing', {
          providerObservationError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const claim = claimStageRunStart(input.db, {
    stageRunId: launch.stage_run_id,
    now: input.now?.(),
    leaseMs: input.startLeaseMs,
  });
  launch = claim.launch;
  if (!claim.claimed || !claim.claim_token) {
    return receipt(claim.claim_status === 'active_starting' ? 'starting' : 'existing', { launch });
  }
  try {
    const temporalStart = await input.startWorkflow(launch.stage_run_input);
    const started = recordStageRunTemporalStart(input.db, {
      stageRunId: launch.stage_run_id,
      temporalStartReceipt: temporalStart,
      claimToken: claim.claim_token,
      now: input.now?.(),
    });
    const terminalStatus = terminalTemporalWorkflowStatus(temporalStart);
    const persistedLaunch = terminalStatus
      ? recordStageRunClosed(input.db, {
          stageRunId: launch.stage_run_id,
          terminalStatus,
          now: input.now?.(),
        }) ?? started
      : started;
    return receipt(
      registration.registered && claim.claim_status === 'claimed' ? 'started' : 'recovered',
      { launch: persistedLaunch, temporalStart },
    );
  } catch (error) {
    const afterFailure = recordStageRunStartFailure(input.db, {
      stageRunId: launch.stage_run_id,
      claimToken: claim.claim_token,
      error,
      now: input.now?.(),
    });
    if (afterFailure.launch_status === 'started' || afterFailure.launch_status === 'closed') {
      return receipt('existing', { launch: afterFailure });
    }
    throw error;
  }
}
