import { Worker } from '@temporalio/worker';

import { familyRuntimePaths } from '../family-runtime-store.ts';
import * as activities from '../family-runtime-temporal-activities.ts';
import { currentWorkerSourceVersion } from './worker-state.ts';
import {
  buildTemporalStageAttemptWorkerOptions,
  type TemporalStageAttemptWorkerOptionsBuild,
} from './workflow-bundle.ts';

export async function runTemporalStageAttemptReplayGate(input: {
  history: unknown;
  workflowId?: string;
  workflowsPath: string;
  sourceModuleUrl: string;
}): Promise<{
  surface_kind: 'temporal_stage_attempt_replay_gate';
  provider_kind: 'temporal';
  replay_status: 'passed';
  workflow_id: string | null;
  worker_options: TemporalStageAttemptWorkerOptionsBuild['worker_options'];
  workflow_bundle: TemporalStageAttemptWorkerOptionsBuild['workflow_bundle'];
}> {
  const built = await buildTemporalStageAttemptWorkerOptions({
    paths: familyRuntimePaths(),
    workflowsPath: input.workflowsPath,
    activities,
    sourceVersion: currentWorkerSourceVersion(input.sourceModuleUrl),
  });
  await Worker.runReplayHistory(
    built.worker_options,
    input.history,
    input.workflowId,
  );
  return {
    surface_kind: 'temporal_stage_attempt_replay_gate',
    provider_kind: 'temporal',
    replay_status: 'passed',
    workflow_id: input.workflowId ?? null,
    worker_options: built.worker_options,
    workflow_bundle: built.workflow_bundle,
  };
}
