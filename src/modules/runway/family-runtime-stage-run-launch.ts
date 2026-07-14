import type { DatabaseSync } from 'node:sqlite';

import type { TemporalStageRunWorkflowInput } from './family-runtime-temporal.ts';
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
}) {
  const registration = registerStageRunLaunch(input.db, input.stageRunInput);
  const launch = registration.launch;
  if (!input.start) {
    return {
      surface_kind: 'opl_stage_run_durable_launch_receipt',
      version: 'opl-stage-run-durable-launch-receipt.v1',
      start_status: registration.registered ? 'registered' as const : 'existing' as const,
      registered: registration.registered,
      idempotent_replay: registration.idempotent_replay,
      launch,
      temporal_start: launch.temporal_start_receipt,
    };
  }
  const claim = claimStageRunStart(input.db, launch.stage_run_id);
  const replayingUnknownStart = !claim.claimed && claim.launch.launch_status === 'starting';
  const reconcilingStartedExecution = !claim.claimed && claim.launch.launch_status === 'started';
  if (!claim.claimed && !replayingUnknownStart && !reconcilingStartedExecution) {
    return {
      surface_kind: 'opl_stage_run_durable_launch_receipt',
      version: 'opl-stage-run-durable-launch-receipt.v1',
      start_status: 'existing' as const,
      registered: false,
      idempotent_replay: true,
      launch: claim.launch,
      temporal_start: claim.launch.temporal_start_receipt,
    };
  }
  let temporalStart: Record<string, unknown>;
  try {
    temporalStart = await input.startWorkflow(claim.launch.stage_run_input);
  } catch (error) {
    const failed = recordStageRunStartFailure(input.db, {
      stageRunId: claim.launch.stage_run_id,
      error,
    });
    if (failed.launch_status === 'started' || failed.launch_status === 'closed') {
      return {
        surface_kind: 'opl_stage_run_durable_launch_receipt',
        version: 'opl-stage-run-durable-launch-receipt.v1',
        start_status: 'existing' as const,
        registered: false,
        idempotent_replay: true,
        launch: failed,
        temporal_start: failed.temporal_start_receipt,
      };
    }
    throw error;
  }
  const started = recordStageRunTemporalStart(input.db, {
    stageRunId: claim.launch.stage_run_id,
    temporalStartReceipt: temporalStart,
  });
  const terminalStatus = terminalTemporalWorkflowStatus(temporalStart);
  const persistedLaunch = terminalStatus
    ? recordStageRunClosed(input.db, {
        stageRunId: claim.launch.stage_run_id,
        terminalStatus,
      }) ?? started
    : started;
  return {
    surface_kind: 'opl_stage_run_durable_launch_receipt',
    version: 'opl-stage-run-durable-launch-receipt.v1',
    start_status: registration.registered ? 'started' as const : 'recovered' as const,
    registered: registration.registered,
    idempotent_replay: registration.idempotent_replay,
    launch: persistedLaunch,
    temporal_start: persistedLaunch.temporal_start_receipt ?? temporalStart,
  };
}
