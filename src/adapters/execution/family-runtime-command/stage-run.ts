import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';

import { DatabaseSync } from 'node:sqlite';
import {
  projectRecoveredStageRunQuery,
} from '../family-runtime-stage-run-query-projection.ts';
import { recoverStageRunCloseoutProjection } from '../family-runtime-stage-run-closeout-recovery.ts';
import {
  appendDistinctStageRunObservation,
  summarizeStageRunObservation,
  TERMINAL_STAGE_RUN_STATUSES,
  type StageRunObservation,
} from '../family-runtime-stage-run-observation.ts';
import { familyRuntimePaths, insertEvent } from '../family-runtime-store.ts';
import type { TemporalStageRunWorkflowInput } from '../family-runtime-temporal.ts';

export function parseStageRunArgs(rest: string[]): FamilyRuntimeCommandInput | null {
  const [action, identityOrFlag, ...flags] = rest;
  if (action === 'query') {
    if (!identityOrFlag || flags.length > 0) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run query requires one workflow id.', {
        usage: 'opl family-runtime stage-run query <workflow_id>',
      });
    }
    return { mode: 'stage_run_query', workflowId: identityOrFlag };
  }
  if (action === 'watch') {
    if (!identityOrFlag) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run watch requires one workflow id.', {
        usage: 'opl family-runtime stage-run watch <workflow_id> [--interval-ms <n>] [--timeout-ms <n>]',
      });
    }
    let intervalMs = 250;
    let timeoutMs = 30_000;
    for (let index = 0; index < flags.length; index += 2) {
      const flag = flags[index];
      const rawValue = flags[index + 1];
      if ((flag !== '--interval-ms' && flag !== '--timeout-ms') || !rawValue) {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run watch has invalid options.', {
          usage: 'opl family-runtime stage-run watch <workflow_id> [--interval-ms <n>] [--timeout-ms <n>]',
        });
      }
      const value = Number(rawValue);
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime stage-run watch intervals must be positive integers.', {
          option: flag,
          value: rawValue,
        });
      }
      if (flag === '--interval-ms') intervalMs = value;
      else timeoutMs = value;
    }
    return { mode: 'stage_run_watch', workflowId: identityOrFlag, intervalMs, timeoutMs };
  }
  if (action === 'recover-closeout') {
    if (
      !identityOrFlag
      || flags[0] !== '--attempt'
      || !flags[1]
      || flags.slice(2).some((flag) => !['--retry-terminal-recovery', '--retry-reviewer'].includes(flag))
      || new Set(flags.slice(2)).size !== flags.slice(2).length
    ) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'family-runtime stage-run recover-closeout requires a StageRun id and an Attempt id.',
        {
          usage: 'opl family-runtime stage-run recover-closeout <stage_run_id> --attempt <attempt_id> [--retry-terminal-recovery] [--retry-reviewer]',
        },
      );
    }
    return {
      mode: 'stage_run_recover_closeout',
      stageRunId: identityOrFlag,
      stageAttemptId: flags[1],
      retryTerminalRecovery: flags.includes('--retry-terminal-recovery'),
      retryReviewer: flags.includes('--retry-reviewer'),
    };
  }
  return null;
}


type FamilyRuntimeStageRunRuntime = {
  queryWorkflow?: (
    input: { workflowId: string },
    context: { paths: ReturnType<typeof familyRuntimePaths> },
  ) => Promise<Record<string, unknown>>;
  describeWorkflow?: (
    input: TemporalStageRunWorkflowInput,
    context: { paths: ReturnType<typeof familyRuntimePaths> },
  ) => Promise<Record<string, unknown>>;
  startRecoveryWorkflow?: (
    input: TemporalStageRunWorkflowInput,
    context: { paths: ReturnType<typeof familyRuntimePaths> },
  ) => Promise<Record<string, unknown>>;
};

async function temporalProviderModule() {
  return await import('../family-runtime-temporal-provider.ts');
}

export async function runFamilyRuntimeStageRunCommand(context: {
  db: DatabaseSync;
  paths: ReturnType<typeof familyRuntimePaths>;
  parsed: FamilyRuntimeCommandInput;
  stageRunRuntime?: FamilyRuntimeStageRunRuntime;
  onStageRunObservation?: (observation: StageRunObservation) => void;
}): Promise<Record<string, unknown>> {
  const { db, paths, parsed, stageRunRuntime, onStageRunObservation } = context;
  if (parsed.mode === 'stage_run_query') {
    const stage_run_query = stageRunRuntime?.queryWorkflow
      ? await stageRunRuntime.queryWorkflow({ workflowId: parsed.workflowId }, { paths })
      : await (await temporalProviderModule()).queryTemporalStageRunWorkflow({
          workflowId: parsed.workflowId,
          paths,
        });
    const projectedStageRunQuery = isRecord(stage_run_query)
      ? projectRecoveredStageRunQuery(db, stage_run_query)
      : stage_run_query;
    return { version: 'g2', family_runtime_stage_run_query: projectedStageRunQuery };
  }
  if (parsed.mode === 'stage_run_watch') {
    const observations: StageRunObservation[] = [];
    const startedAt = Date.now();
    let workflowId = parsed.workflowId;
    const visitedWorkflows = new Set([workflowId]);
    let latest: Record<string, unknown> | null = null;
    let projected: unknown = null;
    let timedOut = false;
    while (true) {
      const queried = stageRunRuntime?.queryWorkflow
        ? await stageRunRuntime.queryWorkflow({ workflowId }, { paths })
        : await (await temporalProviderModule()).queryTemporalStageRunWorkflow({
            workflowId,
            paths,
          });
      latest = isRecord(queried) ? queried : null;
      projected = latest ? projectRecoveredStageRunQuery(db, latest) : queried;
      const previousCount = observations.length;
      appendDistinctStageRunObservation(
        observations,
        summarizeStageRunObservation(projected, workflowId),
      );
      if (observations.length !== previousCount) {
        onStageRunObservation?.(observations[observations.length - 1]!);
      }
      const observedState = isRecord(projected) ? projected : latest;
      const status = observedState && typeof observedState.status === 'string'
        ? observedState.status
        : null;
      const nextWorkflowId = observations[observations.length - 1]?.next_workflow_id;
      if (status && TERMINAL_STAGE_RUN_STATUSES.has(status)) {
        if ((status !== 'completed' && status !== 'completed_with_quality_debt') || !nextWorkflowId) break;
        if (visitedWorkflows.has(nextWorkflowId)) {
          throw new FrameworkContractError('contract_shape_invalid', 'StageRun watch encountered a workflow cycle.', {
            workflow_id: nextWorkflowId,
            observations,
          });
        }
        workflowId = nextWorkflowId;
        visitedWorkflows.add(workflowId);
      }
      if (Date.now() - startedAt >= parsed.timeoutMs) {
        timedOut = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, parsed.intervalMs));
    }
    return {
      version: 'g2',
      family_runtime_stage_run_watch: {
        surface_kind: 'opl_family_runtime_stage_run_watch',
        version: 'opl-family-runtime-stage-run-watch.v1',
        workflow_id: parsed.workflowId,
        current_workflow_id: workflowId,
        observations,
        latest: projected,
        terminal: !timedOut && observations.length > 0
          && observations[observations.length - 1]!.status !== null
          && TERMINAL_STAGE_RUN_STATUSES.has(observations[observations.length - 1]!.status!),
        timed_out: timedOut,
        interval_ms: parsed.intervalMs,
        timeout_ms: parsed.timeoutMs,
      },
    };
  }
  if (parsed.mode === 'stage_run_recover_closeout') {
    const recovery = await recoverStageRunCloseoutProjection(db, {
      stageRunId: parsed.stageRunId,
      stageAttemptId: parsed.stageAttemptId,
    }, {
      retryTerminalRecovery: parsed.retryTerminalRecovery,
      retryReviewer: parsed.retryReviewer,
      describeWorkflow: async (workflowInput) =>
        stageRunRuntime?.describeWorkflow
          ? await stageRunRuntime.describeWorkflow(workflowInput, { paths })
          : await (await temporalProviderModule()).describeTemporalStageRunWorkflow(
              workflowInput,
              { paths },
            ),
      startWorkflow: async (workflowInput) =>
        stageRunRuntime?.startRecoveryWorkflow
          ? await stageRunRuntime.startRecoveryWorkflow(workflowInput, { paths })
          : await (await temporalProviderModule()).startTemporalStageRunRecoveryWorkflow(
              workflowInput,
              { paths },
            ),
    });
    insertEvent(db, {
      eventType: 'stage_run_closeout_recovered',
      source: 'opl-cli',
      payload: recovery,
    });
    return { version: 'g2', family_runtime_stage_run_closeout_recovery: recovery };
  }
  throw new Error(`Unhandled family runtime stage-run mode: ${(parsed as { mode: string }).mode}`);
}
