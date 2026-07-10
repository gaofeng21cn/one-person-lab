import { ScheduleAlreadyRunning, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';

import {
  resolveTemporalTaskQueue,
  SCHEDULER_TICK_WORKFLOW_NAME,
  SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
} from '../family-runtime-temporal.ts';
import type { FamilyRuntimeDomainProfiles } from '../family-runtime-command.ts';
import {
  type TemporalWorkerPaths,
  withTemporalClient,
  withTemporalRpcDeadline,
} from '../family-runtime-temporal-client.ts';
import {
  resolveTemporalAddressForPaths,
} from '../family-runtime-temporal-service.ts';
import { resolveFamilyRuntimeDomainProfiles } from '../family-runtime-domain-profiles.ts';

type TemporalSchedulerInfoProjection = {
  num_actions_skipped_overlap?: number;
  running_actions?: unknown[];
};

function temporalAddressForScheduler(paths: TemporalWorkerPaths) {
  const { address } = resolveTemporalAddressForPaths(paths);
  return address;
}

function temporalSchedulerClientOptions(paths: TemporalWorkerPaths) {
  return { addressOverride: temporalAddressForScheduler(paths) };
}

export function buildTemporalSchedulerTickWorkflowArgs(input: {
  limit?: number;
  hydrate?: boolean;
  domainProfiles?: FamilyRuntimeDomainProfiles;
} = {}) {
  const domainProfiles = resolveFamilyRuntimeDomainProfiles(input.domainProfiles);
  return {
    provider_kind: 'temporal' as const,
    tick_source: 'temporal-schedule',
    force: false,
    limit: input.limit ?? 10,
    hydrate: input.hydrate ?? true,
    ...(domainProfiles ? { domain_profiles: domainProfiles } : {}),
  };
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
  domainProfiles?: FamilyRuntimeDomainProfiles;
} = {}) {
  const intervalMs = input.intervalMs ?? 5 * 60 * 1000;
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  const workflowId = 'opl-family-runtime-provider-scheduler-tick';
  return withTemporalClient(async (client) => {
    const workflowArgs = buildTemporalSchedulerTickWorkflowArgs(input);
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
        args: [workflowArgs],
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
      const handle = await withTemporalRpcDeadline(
        client,
        () => client.schedule.create(options),
        temporalSchedulerClientOptions(paths),
      );
      return {
        surface_kind: 'temporal_scheduler_cadence_install_receipt',
        provider_kind: 'temporal',
        install_status: 'created',
        schedule_id: handle.scheduleId,
        interval_ms: intervalMs,
        workflow_id: workflowId,
        task_queue: resolveTemporalTaskQueue(),
        domain_profiles: workflowArgs.domain_profiles ?? null,
      };
    } catch (error) {
      if (error instanceof ScheduleAlreadyRunning) {
        const handle = client.schedule.getHandle(scheduleId);
        await withTemporalRpcDeadline(client, () => handle.update(() => ({
          spec: options.spec,
          action: options.action,
          policies: options.policies,
          state: {
            paused: false,
            note: options.state.note,
          },
        })), temporalSchedulerClientOptions(paths));
        return {
          surface_kind: 'temporal_scheduler_cadence_install_receipt',
          provider_kind: 'temporal',
          install_status: 'updated_existing',
          schedule_id: scheduleId,
          interval_ms: intervalMs,
          workflow_id: workflowId,
          task_queue: resolveTemporalTaskQueue(),
          domain_profiles: workflowArgs.domain_profiles ?? null,
        };
      }
      throw error;
    }
  }, temporalSchedulerClientOptions(paths));
}

export async function inspectTemporalSchedulerCadence(paths: TemporalWorkerPaths) {
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  return withTemporalClient(async (client) => {
    try {
      const handle = client.schedule.getHandle(scheduleId);
      const description = await withTemporalRpcDeadline(
        client,
        () => handle.describe(),
        temporalSchedulerClientOptions(paths),
      );
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
  }, temporalSchedulerClientOptions(paths));
}

export async function removeTemporalSchedulerCadence(paths: TemporalWorkerPaths) {
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  return withTemporalClient(async (client) => {
    try {
      const handle = client.schedule.getHandle(scheduleId);
      await withTemporalRpcDeadline(
        client,
        () => handle.delete(),
        temporalSchedulerClientOptions(paths),
      );
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
  }, temporalSchedulerClientOptions(paths));
}

export async function triggerTemporalSchedulerCadence(paths: TemporalWorkerPaths) {
  const scheduleId = 'opl-family-runtime-provider-scheduler';
  return withTemporalClient(async (client) => {
    const handle = client.schedule.getHandle(scheduleId);
    await withTemporalRpcDeadline(
      client,
      () => handle.trigger(ScheduleOverlapPolicy.SKIP),
      temporalSchedulerClientOptions(paths),
    );
    return {
      surface_kind: 'temporal_scheduler_cadence_trigger_receipt',
      provider_kind: 'temporal',
      trigger_status: 'triggered',
      schedule_id: scheduleId,
    };
  }, temporalSchedulerClientOptions(paths));
}
