import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ScheduleAlreadyRunning, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';

import { FrameworkContractError } from './contracts.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';
import * as activities from './family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowInput, requireTemporalStageAttemptWorkflowInputLaunchable,
  guardTemporalStageAttemptWorkflowInputPayload,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
  SCHEDULER_TICK_WORKFLOW_NAME,
  type TemporalStageAttemptSignalKind,
  type TemporalStageAttemptSignalPayload,
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from './family-runtime-temporal.ts';
import {
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
} from './family-runtime-temporal-readiness.ts';
import {
  buildTemporalStageAttemptMemo,
  buildTemporalStageAttemptSearchAttributes,
  buildTemporalStageAttemptVisibilityReadiness,
  inspectTemporalStageAttemptVisibilityReadiness,
  ensureTemporalStageAttemptVisibilityReady,
  temporalTestServerAllowsUnindexedVisibility,
} from './family-runtime-temporal-visibility.ts';
export {
  inspectTemporalStageAttemptVisibilityReadiness,
} from './family-runtime-temporal-visibility.ts';
export {
  buildTemporalWorkerLifecycleContract,
  buildTemporalWorkerReadiness,
  resolveTemporalWorkerReadinessStatus,
  type TemporalWorkerReadinessStatus,
} from './family-runtime-temporal-readiness.ts';
import {
  stageAttemptOperatorUpdate,
  stageAttemptQuery,
} from './family-runtime-temporal-workflows.ts';
import {
  inspectTemporalServiceLifecycle,
  probeTemporalServer,
  resolveTemporalAddressForPaths,
} from './family-runtime-temporal-service.ts';
import {
  requireTemporalAddress,
  type TemporalClientOptions,
  type TemporalWorkerPaths,
  withTemporalClient,
} from './family-runtime-temporal-client.ts';
import {
  currentWorkerSourceVersion,
  processIsAlive,
  readTemporalWorkerState,
  removeTemporalWorkerState,
  temporalWorkerStatePath,
  writeTemporalWorkerState,
} from './family-runtime-temporal-provider-parts/worker-state.ts';
import {
  stopOrphanTemporalForegroundWorkers,
  stopWorkerPid,
} from './family-runtime-temporal-provider-parts/worker-process.ts';
import {
  inspectTemporalWorkerLifecycleFast,
} from './family-runtime-temporal-provider-parts/worker-lifecycle-fast.ts';
import {
  inspectTemporalWorkerRuntimeDependencies,
} from './family-runtime-temporal-provider-parts/worker-dependencies.ts';
import {
  buildTemporalStageAttemptWorkerOptions,
} from './family-runtime-temporal-provider-parts/workflow-bundle.ts';
import {
  runTemporalStageAttemptReplayGate,
} from './family-runtime-temporal-provider-parts/replay-gate.ts';
import {
  temporalProductionProbeInput,
  temporalProductionTypedCloseoutPacket,
} from './family-runtime-temporal-provider-parts/production-proof.ts';
export {
  queryTemporalStageAttemptWorkflow,
} from './family-runtime-temporal-provider-parts/attempt-query.ts';

type TemporalLifecycleInspectionDetail = 'fast' | 'full';

type StageAttemptPayload = Parameters<typeof buildTemporalStageAttemptWorkflowInput>[0] & {
  stage_attempt_id: string;
  workflow_id: string;
  provider_kind: string;
};

type TemporalSchedulerInfoProjection = {
  num_actions_skipped_overlap?: number;
  running_actions?: unknown[];
};

function workflowModulePath() {
  const extension = path.extname(fileURLToPath(import.meta.url)) === '.ts' ? '.ts' : '.js';
  return fileURLToPath(new URL(`./family-runtime-temporal-workflows${extension}`, import.meta.url));
}

export async function inspectTemporalWorkerLifecycle(paths: TemporalWorkerPaths) {
  return inspectTemporalWorkerLifecycleWithDetail(paths, { detail: 'full' });
}

export async function inspectTemporalWorkerLifecycleWithDetail(
  paths: TemporalWorkerPaths,
  input: { detail?: TemporalLifecycleInspectionDetail } = {},
) {
  const detail = input.detail ?? 'full';
  if (detail === 'fast') {
    return inspectTemporalWorkerLifecycleFast(paths);
  }
  const service = await inspectTemporalServiceLifecycle(paths);
  const { address, addressSource } = resolveTemporalAddressForPaths(paths);
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const state = readTemporalWorkerState(paths);
  const stateMatchesConfig =
    state?.address === address
    && state.namespace === namespace
    && state.task_queue === taskQueue;
  const expectedWorkerSourceVersion = currentWorkerSourceVersion(import.meta.url);
  const stateSourceCurrent = stateMatchesConfig && state
    ? state.source_version === expectedWorkerSourceVersion
    : false;
  const stateProcessAlive = state ? processIsAlive(state.pid) : false;
  const statePidAlive = stateMatchesConfig && stateProcessAlive;
  const pidAlive = statePidAlive && stateSourceCurrent;
  const envWorkerReady = process.env.OPL_TEMPORAL_WORKER_ENABLED?.trim() === '1'
    || process.env.OPL_TEMPORAL_WORKER_STATUS?.trim() === 'ready';
  const serverReachable = address ? await probeTemporalServer(address) : false;
  const dependencyHealth = inspectTemporalWorkerRuntimeDependencies({ moduleUrl: import.meta.url });
  const workerReady = Boolean(serverReachable && dependencyHealth.status === 'ready' && (pidAlive || envWorkerReady));
  const visibilityReadiness = serverReachable
    ? await inspectTemporalStageAttemptVisibilityReadiness(paths)
    : null;
  const readiness = buildTemporalWorkerReadiness({
    address,
    addressSource,
    namespace,
    taskQueue,
    workerEnabled: envWorkerReady ? '1' : null,
    workerStatus: pidAlive ? 'ready' : null,
    serverReachable,
    managedWorkerPid: pidAlive && state ? state.pid : null,
    managedWorkerStatePath: temporalWorkerStatePath(paths),
    managedWorkerSourceVersion: state?.source_version ?? null,
    expectedWorkerSourceVersion,
    managedWorkerSourceCurrent: stateMatchesConfig && state ? stateSourceCurrent : null,
    managedWorkerWorkflowBundlePath: state?.workflow_bundle_path ?? null,
    managedWorkerWorkflowBundleVersion: state?.workflow_bundle_version ?? null,
    managedWorkerWorkflowBundleSourceVersion: state?.workflow_bundle_source_version ?? null,
    workerDependencyHealth: dependencyHealth,
    staleWorkerPid: statePidAlive && !stateSourceCurrent && state ? state.pid : null,
    temporalServiceLifecycle: service,
    visibilityReadiness,
  });
  if (state && !stateProcessAlive && state.status === 'ready') {
    removeTemporalWorkerState(paths);
  }
  return {
    ...readiness,
    surface_kind: 'temporal_worker_lifecycle_status',
    lifecycle_status: readiness.readiness_status,
    inspection_detail: 'full',
  };
}

export async function inspectTemporalVisibilityReadiness(options: TemporalClientOptions = {}) {
  return inspectTemporalStageAttemptVisibilityReadiness(options.paths);
}

export function buildTemporalVisibilityReadiness(input: {
  namespace?: string | null;
  presentSearchAttributes?: string[] | null;
} = {}) {
  const namespace = input.namespace ?? resolveTemporalNamespace();
  const present = input.presentSearchAttributes ?? null;
  return buildTemporalStageAttemptVisibilityReadiness({
    namespace,
    taskQueue: resolveTemporalTaskQueue(),
    observedCustomAttributes: present
      ? Object.fromEntries(present.map((attribute) => [attribute, 'Keyword']))
      : null,
  });
}

export async function ensureTemporalVisibilityReadiness(options: TemporalClientOptions = {}) {
  return withTemporalClient(async (_client, connection) => {
    const before = await inspectTemporalStageAttemptVisibilityReadiness(options.paths);
    const after = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalNamespace(),
      address: resolveTemporalAddressForPaths(options.paths).address,
    });
    return {
      surface_kind: 'temporal_visibility_repair_receipt',
      provider_kind: 'temporal',
      namespace: resolveTemporalNamespace(),
      installed_search_attributes: before.missing_search_attributes.map((attribute) => attribute.name),
      visibility_readiness: after,
      repair_status: after.readiness_status === 'ready' || after.readiness_status === 'test_server_unindexed_visibility'
        ? 'ready'
        : 'blocked',
      authority_boundary: {
        opl: 'temporal_visibility_metadata_repair_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }, options);
}

export async function startTemporalStageAttemptWorkflow(
  attempt: StageAttemptPayload,
  options: TemporalClientOptions = {},
) {
  if (attempt.provider_kind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'Temporal start requires a temporal stage attempt.', {
      stage_attempt_id: attempt.stage_attempt_id,
      provider_kind: attempt.provider_kind,
    });
  }
  const workflowInput = requireTemporalStageAttemptWorkflowInputLaunchable(
    buildTemporalStageAttemptWorkflowInput(attempt),
  );
  if (!resolveTemporalAddressForPaths(options.paths).address) requireTemporalAddress();
  return withTemporalClient(async (client, connection) => {
    const visibilityReadiness = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalNamespace(),
      address: resolveTemporalAddressForPaths(options.paths).address,
    });
    const launchInput: TemporalStageAttemptWorkflowInput = {
      ...workflowInput,
      visibility_search_attributes_upsert_enabled: visibilityReadiness.readiness_status === 'ready',
    };
    const handle = await client.workflow.start('StageAttemptWorkflow', {
      args: [launchInput],
      taskQueue: resolveTemporalTaskQueue(),
      workflowId: attempt.workflow_id,
      staticSummary: `OPL stage attempt ${attempt.stage_attempt_id}`,
      staticDetails: [
        `OPL stage attempt: ${attempt.stage_attempt_id}`,
        `Domain: ${attempt.domain_id}`,
        `Stage: ${attempt.stage_id}`,
        `Executor: ${attempt.executor_kind}`,
      ].join('\n'),
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      memo: buildTemporalStageAttemptMemo(launchInput),
      ...temporalTestServerAllowsUnindexedVisibility()
        ? {}
        : { searchAttributes: buildTemporalStageAttemptSearchAttributes(launchInput) },
    });
    return {
      surface_kind: 'temporal_stage_attempt_start_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: handle.workflowId,
      first_execution_run_id: handle.firstExecutionRunId,
      eagerly_started: handle.eagerlyStarted,
      namespace: resolveTemporalNamespace(),
      task_queue: resolveTemporalTaskQueue(),
      visibility_readiness: visibilityReadiness,
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }, options);
}

export async function signalTemporalStageAttemptWorkflow(input: {
  attempt: StageAttemptPayload;
  signalKind: TemporalStageAttemptSignalKind;
  payload: Record<string, unknown>;
  source?: string;
  paths?: TemporalWorkerPaths;
}) {
  if (input.attempt.provider_kind !== 'temporal') {
    return null;
  }
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(input.attempt.workflow_id);
    const signal: TemporalStageAttemptSignalPayload = {
      signal_kind: input.signalKind,
      payload: input.payload,
      source: input.source ?? 'opl-cli',
      received_at: new Date().toISOString(),
    };
    const updateReceipt = await handle.executeUpdate(stageAttemptOperatorUpdate, {
      args: [signal],
    });
    return {
      surface_kind: 'temporal_stage_attempt_operator_update_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: input.attempt.stage_attempt_id,
      workflow_id: input.attempt.workflow_id,
      signal_kind: input.signalKind,
      update_receipt: updateReceipt,
      authority_boundary: {
        opl: 'temporal_update_ack_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }, { paths: input.paths });
}

function temporalAddressForScheduler(paths: TemporalWorkerPaths) {
  const { address } = resolveTemporalAddressForPaths(paths);
  return address;
}

export function buildTemporalSchedulerHealthProjection(input: {
  scheduleStatus: string;
  info: TemporalSchedulerInfoProjection | null;
}) {
  const runningActions = Array.isArray(input.info?.running_actions)
    ? input.info.running_actions
    : [];
  const skippedOverlap = Number.isFinite(input.info?.num_actions_skipped_overlap)
    ? Number(input.info?.num_actions_skipped_overlap)
    : 0;
  const needsInstall = input.scheduleStatus === 'not_installed';
  const needsAttention = needsInstall
    || (input.scheduleStatus === 'active' && runningActions.length > 0);
  return {
    surface_kind: 'temporal_scheduler_cadence_health',
    health_status: needsAttention ? 'attention_required' : 'healthy',
    running_action_count: runningActions.length,
    num_actions_skipped_overlap: skippedOverlap,
    historical_overlap_skip_observed: skippedOverlap > 0,
    overlap_policy: 'SKIP',
    repair_action: needsInstall
      ? {
          action_id: 'install_scheduler_cadence',
          reason: 'scheduler_cadence_not_installed',
          next_command: 'opl family-runtime scheduler install --provider temporal',
        }
      : needsAttention
        ? {
          action_id: 'inspect_or_repair_stale_scheduler_tick',
          reason: 'running_scheduler_tick_action_observed',
          safe_first_steps: [
            'opl family-runtime worker status --provider temporal',
            'opl family-runtime worker stop --provider temporal',
            'opl family-runtime worker start --provider temporal',
            'temporal workflow describe --workflow-id <running_tick_workflow_id>',
          ],
          terminate_stale_workflow_requires_operator: true,
          next_command: 'opl family-runtime scheduler status --provider temporal',
        }
        : {
            action_id: 'none',
            reason: skippedOverlap > 0
              ? 'scheduler_cadence_healthy_historical_overlap_skip_retained'
              : 'scheduler_cadence_healthy',
            next_command: null,
          },
    authority_boundary: {
      opl: 'scheduler_cadence_health_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_terminate_workflow_automatically: false,
      can_write_domain_truth: false,
    },
  };
}

export async function ensureTemporalSchedulerCadence(paths: TemporalWorkerPaths, input: {
  intervalMs?: number;
  limit?: number;
  hydrate?: boolean;
} = {}) {
  const intervalMs = input.intervalMs ?? 5 * 60 * 1000;
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  const workflowId = 'opl-family-runtime-provider-scheduler-tick';
  return withTemporalClient(async (client) => {
    const options = {
      scheduleId,
      spec: {
        intervals: [{ every: intervalMs }],
      },
      action: {
        type: 'startWorkflow' as const,
        workflowType: SCHEDULER_TICK_WORKFLOW_NAME,
        workflowId,
        taskQueue: resolveTemporalTaskQueue(),
        workflowRunTimeout: SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
        workflowExecutionTimeout: SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
        args: [{
          provider_kind: 'temporal',
          tick_source: 'temporal-schedule',
          force: false,
          limit: input.limit ?? 10,
          hydrate: input.hydrate ?? true,
        }],
      },
      policies: {
        overlap: ScheduleOverlapPolicy.SKIP,
        catchupWindow: '5 minutes',
      },
      memo: {
        owner: 'one-person-lab',
        surface_kind: 'opl_family_runtime_temporal_scheduler',
      },
      state: {
        note: 'OPL-owned family runtime provider scheduler; replaces domain LaunchAgent/supervision daemons.',
      },
    };
    try {
      const handle = await client.schedule.create(options);
      return {
        surface_kind: 'temporal_scheduler_cadence_install_receipt',
        provider_kind: 'temporal',
        install_status: 'created',
        schedule_id: handle.scheduleId,
        interval_ms: intervalMs,
        workflow_id: workflowId,
        task_queue: resolveTemporalTaskQueue(),
      };
    } catch (error) {
      if (error instanceof ScheduleAlreadyRunning) {
        const handle = client.schedule.getHandle(scheduleId);
        await handle.update(() => ({
          spec: options.spec,
          action: options.action,
          policies: options.policies,
          state: {
            paused: false,
            note: options.state.note,
          },
        }));
        return {
          surface_kind: 'temporal_scheduler_cadence_install_receipt',
          provider_kind: 'temporal',
          install_status: 'updated_existing',
          schedule_id: scheduleId,
          interval_ms: intervalMs,
          workflow_id: workflowId,
          task_queue: resolveTemporalTaskQueue(),
        };
      }
      throw error;
    }
  }, { addressOverride: temporalAddressForScheduler(paths) });
}

export async function inspectTemporalSchedulerCadence(paths: TemporalWorkerPaths) {
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  return withTemporalClient(async (client) => {
    try {
      const description = await client.schedule.getHandle(scheduleId).describe();
      return {
        surface_kind: 'temporal_scheduler_cadence_status',
        provider_kind: 'temporal',
        schedule_status: description.state.paused ? 'paused' : 'active',
        schedule_id: scheduleId,
        action: description.action,
        spec: description.spec,
        policies: description.policies,
        info: {
          next_action_times: description.info.nextActionTimes.map((entry) => entry.toISOString()),
          num_actions_taken: description.info.numActionsTaken,
          num_actions_missed_catchup_window: description.info.numActionsMissedCatchupWindow,
          num_actions_skipped_overlap: description.info.numActionsSkippedOverlap,
          running_actions: description.info.runningActions,
        },
        health: buildTemporalSchedulerHealthProjection({
          scheduleStatus: description.state.paused ? 'paused' : 'active',
          info: {
            num_actions_skipped_overlap: description.info.numActionsSkippedOverlap,
            running_actions: description.info.runningActions,
          },
        }),
      };
    } catch (error) {
      if (error instanceof ScheduleNotFoundError) {
        return {
          surface_kind: 'temporal_scheduler_cadence_status',
          provider_kind: 'temporal',
          schedule_status: 'not_installed',
          schedule_id: scheduleId,
          action: null,
          spec: null,
          policies: null,
          info: null,
          health: buildTemporalSchedulerHealthProjection({
            scheduleStatus: 'not_installed',
            info: null,
          }),
        };
      }
      throw error;
    }
  }, { addressOverride: temporalAddressForScheduler(paths) });
}

export async function removeTemporalSchedulerCadence(paths: TemporalWorkerPaths) {
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  return withTemporalClient(async (client) => {
    try {
      await client.schedule.getHandle(scheduleId).delete();
      return {
        surface_kind: 'temporal_scheduler_cadence_remove_receipt',
        provider_kind: 'temporal',
        remove_status: 'deleted',
        schedule_id: scheduleId,
      };
    } catch (error) {
      if (error instanceof ScheduleNotFoundError) {
        return {
          surface_kind: 'temporal_scheduler_cadence_remove_receipt',
          provider_kind: 'temporal',
          remove_status: 'already_absent',
          schedule_id: scheduleId,
        };
      }
      throw error;
    }
  }, { addressOverride: temporalAddressForScheduler(paths) });
}

export async function triggerTemporalSchedulerCadence(paths: TemporalWorkerPaths) {
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  return withTemporalClient(async (client) => {
    await client.schedule.getHandle(scheduleId).trigger(ScheduleOverlapPolicy.SKIP);
    return {
      surface_kind: 'temporal_scheduler_cadence_trigger_receipt',
      provider_kind: 'temporal',
      trigger_status: 'triggered',
      schedule_id: scheduleId,
    };
  }, { addressOverride: temporalAddressForScheduler(paths) });
}

export async function runTemporalStageAttemptWorkerUntil<T>(fn: () => Promise<T>) {
  const sourceVersion = currentWorkerSourceVersion(import.meta.url);
  const dependencyHealth = inspectTemporalWorkerRuntimeDependencies({ moduleUrl: import.meta.url });
  if (dependencyHealth.status !== 'ready') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker runtime dependencies are unavailable; worker start is fail-closed before workflow bundle materialization.',
      {
        lifecycle_status: 'worker_dependency_unavailable',
        provider_kind: 'temporal',
        worker_dependency_health: dependencyHealth,
      },
    );
  }
  const built = await buildTemporalStageAttemptWorkerOptions({
    paths: familyRuntimePaths(),
    workflowsPath: workflowModulePath(),
    activities,
    sourceVersion,
  });
  const nativeConnection = await NativeConnection.connect({ address: requireTemporalAddress() });
  try {
    const worker = await Worker.create({
      connection: nativeConnection,
      ...built.worker_options,
    });
    return await worker.runUntil(fn);
  } finally {
    await nativeConnection.close();
  }
}

export async function runTemporalStageAttemptWorkerForever() {
  return runTemporalStageAttemptWorkerUntil(
    () => new Promise<never>(() => {
      // Keep the worker resident until the process receives a termination signal.
    }),
  );
}

export async function runTemporalProductionResidencyProof(paths: TemporalWorkerPaths) {
  const worker = await inspectTemporalWorkerLifecycle(paths);
  const proofEnvironment = worker.address_source === 'managed_local_service_state'
    ? 'local_temporal_service_and_managed_worker'
    : 'external_temporal_service_and_managed_worker';
  if (worker.lifecycle_status !== 'ready') {
    const blockers = worker.blockers.length > 0 ? worker.blockers : ['temporal_worker_not_ready'];
    return {
      surface_kind: 'opl_temporal_external_production_residency_proof',
      provider_kind: 'temporal',
      proof_environment: proofEnvironment,
      closeout_status: 'production_residency_blocked',
      blocker: {
        blocker_kind: 'platform_dependency',
        blocker_status: worker.lifecycle_status,
        blocker_ids: blockers,
        owner: 'operator',
        required_before: 'production_residency_proof',
        repair_action: worker.repair_action,
      },
      blockers,
      temporal_worker_lifecycle: worker,
      runtime_snapshot: {
        provider_kind: 'temporal',
        address: worker.address,
        namespace: worker.namespace,
        task_queue: worker.task_queue,
        address_source: worker.address_source,
        lifecycle_status: worker.lifecycle_status,
        server_reachable: worker.server_reachable,
        worker_ready: worker.worker_ready,
        managed_worker_pid: worker.managed_worker_pid,
        managed_worker_state_path: worker.managed_worker_state_path,
        temporal_service_lifecycle: worker.temporal_service_lifecycle,
      },
      checks: {
        external_temporal_server_reachable: worker.server_reachable === true,
        managed_worker_ready: worker.worker_ready === true,
        worker_completed_attempt: false,
        worker_restart_requery: false,
        signal_history_preserved: false,
        typed_closeout_required_for_completed: false,
        missing_closeout_blocks_completion: false,
        retry_or_dead_letter_boundary_observed: false,
        domain_truth_boundary_preserved: true,
      },
      completed_attempt: null,
      restarted_worker_requery: null,
      blocked_attempt: null,
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_blocker',
        receipt_status: 'blocked',
        provider_kind: 'temporal',
        blocker_ids: blockers,
        repair_action_id: worker.repair_action.action_id,
      },
      authority_boundary: {
        opl: 'temporal_residency_proof_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }

  const address = worker.address || requireTemporalAddress();
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const completedWorkflowId = `wf-temporal-production-complete-${suffix}`;
  const blockedWorkflowId = `wf-temporal-production-blocked-${suffix}`;
  try {
    return await withTemporalClient(async (client) => {
    const completedHandle = await client.workflow.start('StageAttemptWorkflow', {
      args: [
        {
          ...temporalProductionProbeInput('complete', temporalProductionTypedCloseoutPacket()),
          workflow_id: completedWorkflowId,
        },
      ],
      taskQueue,
      workflowId: completedWorkflowId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
    await completedHandle.executeUpdate(stageAttemptOperatorUpdate, { args: [{
      signal_kind: 'human_gate',
      payload: {
        human_gate_ref: 'gate:temporal-production-residency-proof',
        reason: 'operator_review',
      },
      source: 'temporal-production-residency-proof',
    }] });
    await completedHandle.executeUpdate(stageAttemptOperatorUpdate, { args: [{
      signal_kind: 'user_instruction',
      payload: {
        instruction_ref: 'user:production-residency-revision-request',
      },
      source: 'temporal-production-residency-proof',
    }] });
    await completedHandle.executeUpdate(stageAttemptOperatorUpdate, { args: [{
      signal_kind: 'resume',
      payload: {
        resume_ref: 'resume:temporal-production-residency-proof',
        reason: 'proof_resume',
      },
      source: 'temporal-production-residency-proof',
    }] });
    const queriedWhileResident = await completedHandle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery);
    const completedState = await completedHandle.result();

    const restartedHandle = client.workflow.getHandle(
      completedWorkflowId,
      undefined,
      { firstExecutionRunId: completedHandle.firstExecutionRunId },
    );
    let requery: {
      requery_status: string;
      query_available: boolean;
      query?: TemporalStageAttemptWorkflowState;
      diagnostic_workflow_status?: string;
      diagnostic_run_id?: string;
      query_error?: string;
    };
    try {
      requery = {
        requery_status: 'stage_attempt_query_available_after_worker_restart',
        query_available: true,
        query: await restartedHandle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery),
      };
    } catch (error) {
      const description = await restartedHandle.describe();
      requery = {
        requery_status: 'stage_attempt_query_unavailable_after_worker_restart',
        query_available: false,
        query_error: error instanceof Error ? error.message : String(error),
        diagnostic_workflow_status: description.status.name,
        diagnostic_run_id: description.runId,
      };
    }

    const blockedHandle = await client.workflow.start('StageAttemptWorkflow', {
      args: [
        {
          ...temporalProductionProbeInput('blocked', null),
          workflow_id: blockedWorkflowId,
        },
      ],
      taskQueue,
      workflowId: blockedWorkflowId,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
    const blockedState = await blockedHandle.result();
    const requeryState = requery.query_available && requery.query ? requery.query : null;
    const checks = {
      external_temporal_server_reachable: true,
      managed_worker_ready: true,
      worker_completed_attempt: completedState.status === 'completed',
      worker_restart_requery: requeryState?.stage_attempt_id === completedState.stage_attempt_id,
      signal_history_preserved:
        completedState.signals.length === 3
        && queriedWhileResident.signals.length === 3,
      typed_closeout_required_for_completed:
        completedState.completion_boundary.provider_completion === 'completed'
        && completedState.closeout_refs.length > 0,
      missing_closeout_blocks_completion:
        blockedState.status === 'blocked'
        && blockedState.completion_boundary.provider_completion === 'not_completed',
      retry_or_dead_letter_boundary_observed:
        blockedState.activity_events.some(
          (event: Record<string, unknown>) => event.activity_kind === 'domain_handler_dispatch_activity'
            && event.blocked_reason === 'typed_closeout_packet_required',
        ),
      domain_truth_boundary_preserved:
        completedState.authority_boundary.domain === 'truth_quality_artifact_gate_owner'
        && completedState.completion_boundary.provider_completion_is_domain_ready === false,
    };
    const proven = Object.values(checks).every(Boolean);
    return {
      surface_kind: 'opl_temporal_external_production_residency_proof',
      provider_kind: 'temporal',
      proof_environment: proofEnvironment,
      closeout_status: proven ? 'production_residency_proven' : 'production_residency_failed',
      address,
      namespace,
      task_queue: taskQueue,
      temporal_worker_lifecycle: worker,
      blockers: proven ? [] : ['temporal_production_residency_checks_failed'],
      runtime_snapshot: {
        provider_kind: 'temporal',
        address,
        namespace,
        task_queue: taskQueue,
        address_source: worker.address_source,
        lifecycle_status: worker.lifecycle_status,
        server_reachable: worker.server_reachable,
        worker_ready: worker.worker_ready,
        managed_worker_pid: worker.managed_worker_pid,
        managed_worker_state_path: worker.managed_worker_state_path,
        temporal_service_lifecycle: worker.temporal_service_lifecycle,
      },
      checks,
      completed_attempt: {
        workflow_id: completedHandle.workflowId,
        run_id: completedHandle.firstExecutionRunId,
        status: completedState.status,
        signal_count: completedState.signals.length,
        closeout_refs: completedState.closeout_refs,
        consumed_refs: completedState.consumed_refs,
        consumed_memory_refs: completedState.consumed_memory_refs,
        writeback_receipt_refs: completedState.writeback_receipt_refs,
        domain_ready_verdict: completedState.completion_boundary.domain_ready_verdict,
      },
      restarted_worker_requery: {
        workflow_id: completedWorkflowId,
        requery_status: requery.requery_status,
        query_available: requery.query_available,
        status: requeryState?.status ?? null,
        run_id: requeryState ? completedHandle.firstExecutionRunId : null,
        diagnostic_workflow_status: requery.diagnostic_workflow_status ?? null,
        diagnostic_run_id: requery.diagnostic_run_id ?? null,
      },
      blocked_attempt: {
        workflow_id: blockedHandle.workflowId,
        run_id: blockedHandle.firstExecutionRunId,
        status: blockedState.status,
        provider_completion: blockedState.completion_boundary.provider_completion,
        closeout_refs: blockedState.closeout_refs,
        blocked_reason:
          blockedState.activity_events.find(
            (event: Record<string, unknown>) => event.activity_kind === 'domain_handler_dispatch_activity',
          )?.blocked_reason ?? null,
      },
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: proven ? 'proven' : 'failed',
        provider_kind: 'temporal',
        completed_workflow_id: completedHandle.workflowId,
        blocked_workflow_id: blockedHandle.workflowId,
        repair_action_id: 'none',
      },
      authority_boundary: {
        opl: 'temporal_residency_proof_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
    }, { addressOverride: address });
  } catch (error) {
    const blockerIds = ['temporal_worker_transport_probe_failed'];
    return {
      surface_kind: 'opl_temporal_external_production_residency_proof',
      provider_kind: 'temporal',
      proof_environment: proofEnvironment,
      closeout_status: 'production_residency_blocked',
      blocker: {
        blocker_kind: 'platform_dependency',
        blocker_status: 'worker_transport_probe_failed',
        blocker_ids: blockerIds,
        owner: 'operator',
        required_before: 'production_residency_proof',
        repair_action: worker.repair_action,
        error_message: error instanceof Error ? error.message : String(error),
      },
      blockers: blockerIds,
      temporal_worker_lifecycle: worker,
      runtime_snapshot: {
        provider_kind: 'temporal',
        address,
        namespace,
        task_queue: taskQueue,
        address_source: worker.address_source,
        lifecycle_status: worker.lifecycle_status,
        server_reachable: worker.server_reachable,
        worker_ready: worker.worker_ready,
        managed_worker_pid: worker.managed_worker_pid,
        managed_worker_state_path: worker.managed_worker_state_path,
        temporal_service_lifecycle: worker.temporal_service_lifecycle,
      },
      checks: {
        external_temporal_server_reachable: worker.server_reachable === true,
        managed_worker_ready: worker.worker_ready === true,
        worker_completed_attempt: false,
        worker_restart_requery: false,
        signal_history_preserved: false,
        typed_closeout_required_for_completed: false,
        missing_closeout_blocks_completion: false,
        retry_or_dead_letter_boundary_observed: false,
        domain_truth_boundary_preserved: true,
      },
      completed_attempt: null,
      restarted_worker_requery: null,
      blocked_attempt: null,
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_blocker',
        receipt_status: 'blocked',
        provider_kind: 'temporal',
        blocker_ids: blockerIds,
        repair_action_id: worker.repair_action.action_id,
      },
      authority_boundary: {
        opl: 'temporal_residency_proof_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }
}

export async function runTemporalWorkerForeground(paths: TemporalWorkerPaths) {
  const { address } = resolveTemporalAddressForPaths(paths);
  if (!address) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker foreground requires OPL_TEMPORAL_ADDRESS, TEMPORAL_ADDRESS, or managed local service state.',
      {
        required_env: ['OPL_TEMPORAL_ADDRESS or managed local service state'],
        provider_kind: 'temporal',
      },
    );
  }
  const sourceVersion = currentWorkerSourceVersion(import.meta.url);
  const built = await buildTemporalStageAttemptWorkerOptions({
    paths,
    workflowsPath: workflowModulePath(),
    activities,
    sourceVersion,
  });
  writeTemporalWorkerState(paths, {
    provider_kind: 'temporal',
    pid: process.pid,
    address,
    namespace: resolveTemporalNamespace(),
    task_queue: resolveTemporalTaskQueue(),
    started_at: new Date().toISOString(),
    status: 'starting',
    source_version: sourceVersion,
    workflow_bundle_path: built.workflow_bundle.code_path,
    workflow_bundle_version: built.workflow_bundle.workflow_bundle_version,
    workflow_bundle_source_version: built.workflow_bundle.workflow_bundle_source_version,
  });
  const nativeConnection = await NativeConnection.connect({ address });
  try {
    const worker = await Worker.create({
      connection: nativeConnection,
      ...built.worker_options,
    });
    writeTemporalWorkerState(paths, {
      provider_kind: 'temporal',
      pid: process.pid,
      address,
      namespace: resolveTemporalNamespace(),
      task_queue: resolveTemporalTaskQueue(),
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: sourceVersion,
      workflow_bundle_path: built.workflow_bundle.code_path,
      workflow_bundle_version: built.workflow_bundle.workflow_bundle_version,
      workflow_bundle_source_version: built.workflow_bundle.workflow_bundle_source_version,
    });
    await worker.run();
  } finally {
    removeTemporalWorkerState(paths);
    await nativeConnection.close();
  }
}

export async function startTemporalWorkerLifecycle(paths: TemporalWorkerPaths, input: { detach?: boolean } = {}) {
  const status = await inspectTemporalWorkerLifecycle(paths);
  if (status.lifecycle_status === 'not_configured') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker start requires OPL_TEMPORAL_ADDRESS or TEMPORAL_ADDRESS.',
      {
        lifecycle_status: status.lifecycle_status,
        required_env: ['OPL_TEMPORAL_ADDRESS'],
        provider_kind: 'temporal',
      },
    );
  }
  if (status.lifecycle_status === 'server_unreachable') {
    throw new FrameworkContractError('contract_shape_invalid', 'Temporal server is unreachable; worker start is fail-closed.', {
      lifecycle_status: status.lifecycle_status,
      address: status.address,
      provider_kind: 'temporal',
    });
  }
  if (status.lifecycle_status === 'worker_dependency_unavailable') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal worker runtime dependencies are unavailable; worker start is fail-closed before workflow bundle materialization.',
      {
        lifecycle_status: status.lifecycle_status,
        provider_kind: 'temporal',
        worker_dependency_health: status.worker_dependency_health,
        repair_action: status.repair_action,
      },
    );
  }
  if (status.lifecycle_status === 'ready') {
    return {
      surface_kind: 'temporal_worker_lifecycle_start',
      provider_kind: 'temporal',
      start_status: 'already_ready',
      status,
    };
  }
  if (input.detach === false) {
    await runTemporalWorkerForeground(paths);
    return {
      surface_kind: 'temporal_worker_lifecycle_start',
      provider_kind: 'temporal',
      start_status: 'foreground_completed',
      status: await inspectTemporalWorkerLifecycle(paths),
    };
  }

  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(import.meta.url), '--temporal-worker-foreground'],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        OPL_TEMPORAL_ADDRESS: status.address ?? process.env.OPL_TEMPORAL_ADDRESS,
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      },
    },
  );
  child.unref();
  const sourceVersion = currentWorkerSourceVersion(import.meta.url);
  const workflowBundle = await buildTemporalStageAttemptWorkerOptions({
    paths,
    workflowsPath: workflowModulePath(),
    activities,
    sourceVersion,
  });
  writeTemporalWorkerState(paths, {
    provider_kind: 'temporal',
    pid: child.pid ?? 0,
    address: status.address ?? requireTemporalAddress(),
    namespace: status.namespace,
    task_queue: status.task_queue,
    started_at: new Date().toISOString(),
    status: 'ready',
    source_version: sourceVersion,
    workflow_bundle_path: workflowBundle.workflow_bundle.code_path,
    workflow_bundle_version: workflowBundle.workflow_bundle.workflow_bundle_version,
    workflow_bundle_source_version: workflowBundle.workflow_bundle.workflow_bundle_source_version,
  });
  return {
    surface_kind: 'temporal_worker_lifecycle_start',
    provider_kind: 'temporal',
    start_status: 'started',
    status: await inspectTemporalWorkerLifecycle(paths),
  };
}

export async function stopTemporalWorkerLifecycle(paths: TemporalWorkerPaths) {
  const before = await inspectTemporalWorkerLifecycle(paths);
  const state = readTemporalWorkerState(paths);
  let stoppedPid: number | null = null;
  let stopStatus = 'not_running';
  const stop_actions: Record<string, unknown>[] = [];
  if (state && processIsAlive(state.pid)) {
    stoppedPid = state.pid;
    const stopped = await stopWorkerPid(state.pid);
    stop_actions.push(...stopped.actions);
    stopStatus = stopped.status;
  }
  const orphanStops = await stopOrphanTemporalForegroundWorkers({
    modulePath: fileURLToPath(import.meta.url),
    excludePids: state?.pid ? [state.pid] : [],
  });
  if (stopStatus === 'not_running' && orphanStops.orphan_stopped_pids.length > 0) {
    stopStatus = 'stopped';
  }
  if (orphanStops.orphan_stop_incomplete_pids.length > 0) {
    stopStatus = 'stop_incomplete';
  }
  removeTemporalWorkerState(paths);
  return {
    surface_kind: 'temporal_worker_lifecycle_stop',
    provider_kind: 'temporal',
    stop_status: stopStatus,
    stopped_pid: stoppedPid,
    stop_actions,
    orphan_stopped_pids: orphanStops.orphan_stopped_pids,
    orphan_stop_incomplete_pids: orphanStops.orphan_stop_incomplete_pids,
    orphan_stop_actions: orphanStops.orphan_stop_actions,
    before,
    status: await inspectTemporalWorkerLifecycle(paths),
  };
}

export function buildTemporalStageAttemptWorkflowInputForTest(input: TemporalStageAttemptWorkflowInput): TemporalStageAttemptWorkflowInput {
  return guardTemporalStageAttemptWorkflowInputPayload(input);
}

export async function buildTemporalStageAttemptWorkerOptionsForTest(
  paths: TemporalWorkerPaths,
  input: { sourceVersion?: string } = {},
) {
  return buildTemporalStageAttemptWorkerOptions({
    paths,
    workflowsPath: workflowModulePath(),
    activities,
    sourceVersion: input.sourceVersion ?? currentWorkerSourceVersion(import.meta.url),
  });
}

export async function buildTemporalStageAttemptReplayGateForTest(history: unknown, workflowId?: string) {
  return runTemporalStageAttemptReplayGate({
    history,
    workflowId,
    workflowsPath: workflowModulePath(),
    sourceModuleUrl: import.meta.url,
  });
}

export function resolveTemporalWorkerForegroundPaths(): TemporalWorkerPaths { return familyRuntimePaths(); }

if (process.argv[2] === '--temporal-worker-foreground') {
  void runTemporalWorkerForeground(resolveTemporalWorkerForegroundPaths()).catch((error) => {
    process.stderr.write(error instanceof Error ? `${error.message}\n` : 'Temporal worker failed.\n');
    process.exitCode = 1;
  });
}
