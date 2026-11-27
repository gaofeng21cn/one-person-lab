import { RunwayError, type AttemptRole, type ExecuteStageOptions, type SandboxMode } from '@opl/runway';
import { DaemonRpcError } from '../../errors.ts';
import type { RpcHandler } from '../../server/socket-server.ts';
import type { DaemonRuntime } from '../../state/runtime.ts';
import {
  pickBoolean,
  pickNumber,
  pickOptionalString,
  pickRecord,
  pickString,
  pickStringArray,
} from '../../utils/normalize.ts';
import { requireTrustedHost } from '../context.ts';

export function registerRunwayRoutes(handlers: Map<string, RpcHandler>, runtime: DaemonRuntime): void {
  handlers.set('runway.task.create', (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId') ?? '';
    const agentId = pickString(params, 'agent_id', 'agentId');
    const title = pickString(params, 'title') ?? '';
    const goalPrompt = pickString(params, 'goal_prompt', 'goalPrompt', 'goal') ?? '';
    const autoStart = pickBoolean(params, 'auto_start', 'autoStart') ?? false;
    const explicitStages = Array.isArray(params.stages)
      ? (params.stages as Array<{ stage_id?: string; executor_id?: string; model_id?: string | null }>)
      : undefined;
    const resolvedStages =
      explicitStages && explicitStages.length > 0
        ? explicitStages
        : runtime.resolveAgentStages(agentId);
    const bundle = runtime.runwayRuntime.createTask({
      workspace_id: workspaceId,
      agent_id: agentId ?? null,
      title,
      goal_prompt: goalPrompt,
      ...(resolvedStages.length > 0 ? { stages: resolvedStages } : {}),
    });
    if (autoStart) {
      void runtime.launchNextStageInBackground(bundle.task_id);
    }
    return bundle;
  });

  handlers.set('runway.task.list', (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    const status = pickString(params, 'status') as
      | 'active'
      | 'paused_by_human'
      | 'awaiting_human'
      | 'completed'
      | 'cancelled'
      | 'failed'
      | undefined;
    return runtime.runwayRuntime.listTasks({ workspace_id: workspaceId, status });
  });

  handlers.set('runway.task.get', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.get requires task_id.');
    }
    return runtime.runwayRuntime.getTask(taskId);
  });

  handlers.set('runway.stage.start', async (params) => {
    const taskId = pickString(params, 'task_id', 'taskId');
    const explicitStageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const stageId = pickString(params, 'stage_id', 'stageId');
    const executorId = pickString(params, 'executor_id', 'executorId');
    const modelId = pickString(params, 'model_id', 'modelId');
    const role = pickString(params, 'role') as AttemptRole | undefined;
    const reviewedAttemptId = pickString(params, 'reviewed_attempt_id', 'reviewedAttemptId');
    if (('reviewed_attempt_id' in params || 'reviewedAttemptId' in params) && !reviewedAttemptId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'reviewed_attempt_id must identify a producer or repair Attempt.');
    }
    const completeStageStatus = params.complete_stage_status ?? params.completeStageStatus;
    if (completeStageStatus !== undefined && completeStageStatus !== 'completed' && completeStageStatus !== 'awaiting_review') {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'complete_stage_status must be completed or awaiting_review.');
    }
    const sandboxMode = pickString(params, 'sandbox_mode', 'sandboxMode') as SandboxMode | undefined;
    const resumeSessionRef = pickString(params, 'resume_session_ref', 'resumeSessionRef');
    const envTimeoutRaw = process.env.OPL_RUNWAY_ATTEMPT_TIMEOUT_MS?.trim();
    const envTimeout = envTimeoutRaw ? Number(envTimeoutRaw) : undefined;
    const timeoutMs =
      pickNumber(params, 'timeout_ms', 'timeoutMs')
      ?? (envTimeout !== undefined && Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined);
    const promptOverride = pickOptionalString(params, 'prompt_override', 'promptOverride');
    const awaitCompletion = pickBoolean(params, 'await_completion', 'awaitCompletion') ?? false;

    const blockingStageStatuses = new Set([
      'running',
      'human_gate',
      'paused_by_human',
      'repair_required',
      'awaiting_review',
    ]);
    const assertTaskStageStartable = (
      bundle: ReturnType<typeof runtime.runwayRuntime.getTask>,
      targetStageRunId?: string,
    ): void => {
      if (runtime.hasActiveTaskLoop(bundle.task_id)) {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `Task '${bundle.task_id}' already has an active stage execution loop running.`,
          { task_id: bundle.task_id, ...(targetStageRunId ? { stage_run_id: targetStageRunId } : {}) },
        );
      }
      const launchingStageRunId = runtime.getLaunchingTaskStage(bundle.task_id);
      if (launchingStageRunId) {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `Task '${bundle.task_id}' already has stage '${launchingStageRunId}' launching.`,
          {
            task_id: bundle.task_id,
            blocking_stage_run_id: launchingStageRunId,
            ...(targetStageRunId ? { stage_run_id: targetStageRunId } : {}),
          },
        );
      }
      const blocking = bundle.stage_runs.find(
        (sr) => sr.stage_run_id !== targetStageRunId && blockingStageStatuses.has(sr.status),
      );
      if (blocking) {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `Task '${bundle.task_id}' has stage '${blocking.stage_id}' in blocking state '${blocking.status}'.`,
          {
            task_id: bundle.task_id,
            blocking_stage_run_id: blocking.stage_run_id,
            blocking_status: blocking.status,
            ...(targetStageRunId ? { stage_run_id: targetStageRunId } : {}),
          },
        );
      }
    };

    let stageRunId = explicitStageRunId;
    if (!stageRunId) {
      if (!taskId) {
        throw new DaemonRpcError(
          -32602,
          'INVALID_INPUT',
          'runway.stage.start requires stage_run_id or task_id.',
        );
      }
      if (stageId) {
        const bundle = runtime.runwayRuntime.getTask(taskId);
        if (bundle.task.status === 'paused_by_human') {
          throw new RunwayError(
            'TASK_PAUSED_BY_HUMAN',
            `Task '${taskId}' is paused_by_human and cannot start stage '${stageId}'.`,
            { task_id: taskId, stage_id: stageId },
          );
        }
        const matched = bundle.stage_runs.find((sr) => sr.stage_id === stageId);
        assertTaskStageStartable(bundle, matched?.stage_run_id);
        if (!matched) {
          if (bundle.task.status === 'cancelled') {
            throw new RunwayError('INVALID_STAGE_STATE', 'A cancelled task cannot start a new stage.');
          }
          runtime.runwayRuntime.resolveReviewTarget(bundle, undefined, role ?? 'producer', {
            reviewed_attempt_id: reviewedAttemptId,
            resume_session_ref: resumeSessionRef,
          });
        }
        stageRunId = matched
          ? matched.stage_run_id
          : runtime.prepareDynamicStageForStart({
              task_id: taskId,
              stage_id: stageId,
              executor_id: executorId,
              model_id: modelId,
            });
      } else {
        const initialBundle = runtime.runwayRuntime.getTask(taskId);
        if (initialBundle.task.status === 'paused_by_human') {
          throw new RunwayError(
            'TASK_PAUSED_BY_HUMAN',
            `Task '${taskId}' is paused_by_human and cannot claim stages.`,
            { task_id: taskId },
          );
        }
        assertTaskStageStartable(initialBundle);
        const claimed = runtime.runwayStore.claimNextQueuedStage(taskId);
        if (!claimed) {
          throw new RunwayError(
            'INVALID_STAGE_STATE',
            `No queued stage available to start on task '${taskId}'.`,
            { task_id: taskId },
          );
        }
        stageRunId = claimed.stage_run_id;
      }
    }

    const stage = runtime.runwayStore.getStageRun(stageRunId);
    const taskBundle = runtime.runwayRuntime.getTask(stage.task_id);
    if (taskId && taskId !== stage.task_id) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'The requested StageRun belongs to a different task.');
    }
    if (stageId && stageId !== stage.stage_id) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'stage_id and stage_run_id identify different stages.');
    }
    if (taskBundle.task.status === 'paused_by_human' || stage.status === 'paused_by_human') {
      throw new RunwayError(
        'TASK_PAUSED_BY_HUMAN',
        `StageRun '${stageRunId}' is paused_by_human and cannot be executed.`,
        { task_id: taskBundle.task_id, stage_run_id: stageRunId },
      );
    }
    assertTaskStageStartable(taskBundle, stageRunId);
    const reviewing = stage.status === 'awaiting_review' && role === 'reviewer';
    const resuming = resumeSessionRef && (stage.status === 'completed' || stage.status === 'failed');
    if (taskBundle.task.status === 'cancelled' || (stage.status !== 'queued' && stage.status !== 'repair_required' && !reviewing && !resuming)) {
      throw new RunwayError(
        'INVALID_STAGE_STATE',
        `StageRun '${stageRunId}' cannot start from status '${stage.status}'.`,
        { task_id: taskBundle.task_id, stage_run_id: stageRunId, status: stage.status },
      );
    }
    runtime.executorRegistry.get(stage.executor_id);

    const execOptions: ExecuteStageOptions = {
      ...(modelId ? { model_id: modelId } : {}),
      ...(role ? { role } : {}),
      ...(reviewedAttemptId ? { reviewed_attempt_id: reviewedAttemptId } : {}),
      ...(completeStageStatus ? { complete_stage_status: completeStageStatus } : {}),
      ...(sandboxMode ? { sandbox_mode: sandboxMode } : {}),
      ...(resumeSessionRef ? { resume_session_ref: resumeSessionRef } : {}),
      ...(timeoutMs !== undefined ? { timeout_ms: timeoutMs } : {}),
      ...(promptOverride !== undefined ? { prompt_override: promptOverride } : {}),
    };

    if (awaitCompletion) {
      return await runtime.runStageExecutionTracked(taskBundle.task_id, stageRunId, () =>
        runtime.runwayRuntime.executeStage(stageRunId, execOptions),
      );
    }

    runtime.runwayRuntime.resolveReviewTarget(taskBundle, stage, role ?? 'producer', execOptions);
    void runtime.launchStageInBackground(stageRunId, execOptions, taskBundle.task_id);
    return {
      ok: true,
      started: true,
      task_id: taskBundle.task_id,
      stage_run_id: stageRunId,
      stage_id: stage.stage_id,
      executor_id: stage.executor_id,
    };
  });

  const handleTaskPause: RpcHandler = async (params, conn) => {
    requireTrustedHost(conn, 'runway.task.pause');
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    const reason = pickString(params, 'reason');
    const actorId = pickString(params, 'actor_id', 'actorId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.pause requires task_id.');
    }
    return await runtime.runwayRuntime.pauseTask({ task_id: taskId, reason, actor_id: actorId });
  };
  handlers.set('runway.task.pause', handleTaskPause);
  handlers.set('runway.stage.pause', handleTaskPause);

  const handleTaskResume: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.task.resume');
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    const reason = pickString(params, 'reason');
    const actorId = pickString(params, 'actor_id', 'actorId');
    const autoStart = pickBoolean(params, 'auto_start', 'autoStart') ?? false;
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.resume requires task_id.');
    }
    const res = runtime.runwayRuntime.resumeTask({ task_id: taskId, reason, actor_id: actorId });
    if (autoStart) {
      void runtime.launchNextStageInBackground(taskId);
    }
    return res;
  };
  handlers.set('runway.task.resume', handleTaskResume);
  handlers.set('runway.stage.resume', handleTaskResume);

  const handleTaskCancel: RpcHandler = async (params, conn) => {
    requireTrustedHost(conn, 'runway.task.cancel');
    const taskId = pickString(params, 'task_id', 'taskId', 'id') ?? '';
    const reason = pickString(params, 'reason');
    const actorId = pickString(params, 'actor_id', 'actorId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.task.cancel requires task_id.');
    }
    return await runtime.runwayRuntime.cancelTask({ task_id: taskId, reason, actor_id: actorId });
  };
  handlers.set('runway.task.cancel', handleTaskCancel);
  handlers.set('runway.stage.cancel', handleTaskCancel);

  const handleHumanGateResolve: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.humanGate.resolve');
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId') ?? '';
    const decision = pickString(params, 'decision') ?? '';
    const expectedRevision = pickNumber(params, 'expected_revision', 'expectedRevision');
    const actorId = pickString(params, 'actor_id', 'actorId');
    const waivedDebtIds = pickStringArray(params, 'waived_debt_ids', 'waivedDebtIds');
    const notes = pickString(params, 'notes', 'reason');
    const res = runtime.runwayRuntime.resolveHumanGate({
      stage_run_id: stageRunId,
      decision,
      expected_revision: expectedRevision,
      actor_id: actorId,
      waived_debt_ids: waivedDebtIds,
      notes,
    });
    if (res.status === 'queued') {
      const bundle = runtime.runwayRuntime.getTask(res.task_id);
      const stageAttempts = bundle.attempts.filter((a) => a.stage_run_id === res.stage_run_id);
      if (stageAttempts.length > 0) {
        void runtime.launchNextStageInBackground(res.task_id);
      }
    }
    return res;
  };
  handlers.set('runway.humanGate.resolve', handleHumanGateResolve);
  handlers.set('runway.stage.decide', handleHumanGateResolve);

  handlers.set('runway.executors.list', () => ({
    executors: runtime.runwayRuntime.listExecutors().map((cap) => ({
      ...cap,
      id: cap.executor_id,
      status: 'available',
    })),
  }));

  handlers.set('runway.executors.health', async () => {
    const report = await runtime.runwayRuntime.healthCheckExecutors();
    return {
      ok: true,
      executors: Object.entries(report).map(([id, item]) => ({
        id,
        ...item,
        healthy: item.available,
      })),
    };
  });

  const handleScheduleCreate: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.schedule.create');
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId') ?? '';
    const scheduleId = pickString(params, 'schedule_id', 'scheduleId');
    const agentId = pickString(params, 'agent_id', 'agentId');
    const cronExpr = pickString(params, 'cron_expr', 'cronExpr', 'cron') ?? '';
    const timezone = pickString(params, 'timezone');
    const overlapPolicy = pickString(params, 'overlap_policy', 'overlapPolicy') as
      | 'skip'
      | 'buffer_one'
      | 'cancel_other'
      | 'queue'
      | 'allow'
      | undefined;
    const payload = pickRecord(params, 'payload', 'payload_json', 'payloadJson') ?? {};
    const enabled = pickBoolean(params, 'enabled');
    const nextRunAt = pickString(params, 'next_run_at', 'nextRunAt');
    return runtime.runwayStore.upsertSchedule({
      schedule_id: scheduleId,
      workspace_id: workspaceId,
      agent_id: agentId ?? null,
      cron_expr: cronExpr,
      timezone,
      overlap_policy: overlapPolicy,
      payload,
      enabled,
      ...(nextRunAt ? { next_run_at: nextRunAt } : {}),
    });
  };
  handlers.set('runway.schedule.create', handleScheduleCreate);
  handlers.set('runway.schedules.upsert', handleScheduleCreate);

  const handleScheduleList: RpcHandler = (params) => {
    const workspaceId = pickString(params, 'workspace_id', 'workspaceId');
    return {
      schedules: runtime.runwayStore.listSchedules(workspaceId),
    };
  };
  handlers.set('runway.schedule.list', handleScheduleList);
  handlers.set('runway.schedules.list', handleScheduleList);

  handlers.set('runway.schedule.toggle', (params, conn) => {
    requireTrustedHost(conn, 'runway.schedule.toggle');
    const scheduleId = pickString(params, 'schedule_id', 'scheduleId', 'id') ?? '';
    const enabled = pickBoolean(params, 'enabled');
    if (!scheduleId || enabled === undefined) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.schedule.toggle requires schedule_id and enabled.');
    }
    return runtime.runwayStore.toggleSchedule(scheduleId, enabled);
  });

  const handleScheduleDelete: RpcHandler = (params, conn) => {
    requireTrustedHost(conn, 'runway.schedules.delete');
    const scheduleId = pickString(params, 'schedule_id', 'scheduleId', 'id') ?? '';
    if (!scheduleId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'runway.schedules.delete requires schedule_id.');
    }
    return runtime.runwayStore.deleteSchedule(scheduleId);
  };
  handlers.set('runway.schedules.delete', handleScheduleDelete);
  handlers.set('runway.schedule.delete', handleScheduleDelete);
}
