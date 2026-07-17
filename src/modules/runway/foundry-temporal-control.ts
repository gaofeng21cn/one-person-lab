import crypto from 'node:crypto';

import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/common';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { foundryContentDigest } from '../foundry/index.ts';

import {
  foundryCancelUpdate,
  foundryOwnerDecisionUpdate,
  foundryRunQuery,
} from './foundry-temporal-workflow.ts';
import type {
  FoundryCancelUpdate,
  FoundryOwnerDecisionUpdate,
  FoundryRunStartInput,
  FoundryRunWorkflowState,
} from './foundry-temporal.ts';
import {
  type TemporalClientOptions,
  withTemporalClient,
  withTemporalRpcDeadline,
} from './family-runtime-temporal-client.ts';
import { resolveTemporalTaskQueue } from './family-runtime-temporal.ts';
import { resolveTemporalWorkerTaskQueue } from './family-runtime-temporal-provider-parts/worker-task-queue.ts';

export function foundryTemporalWorkflowId(runId: string) {
  return `opl-foundry-${crypto.createHash('sha256').update(runId).digest('hex')}`;
}

function taskQueue(options: TemporalClientOptions) {
  return options.paths ? resolveTemporalWorkerTaskQueue(options.paths) : resolveTemporalTaskQueue();
}

export async function startTemporalFoundryRunWorkflow(
  input: FoundryRunStartInput,
  options: TemporalClientOptions = {},
) {
  const workflowId = foundryTemporalWorkflowId(input.run_id);
  const requestDigest = foundryContentDigest(input.request);
  const workflowInput = { ...input, request_digest: requestDigest };
  return withTemporalClient(async (client) => {
    let recoveredExisting = false;
    let handle;
    try {
      handle = await withTemporalRpcDeadline(client, () => client.workflow.start('FoundryRunWorkflow', {
        args: [workflowInput],
        taskQueue: taskQueue(options),
        workflowId,
        staticSummary: `OPL FoundryRun ${input.run_id}`,
        staticDetails: [
          `FoundryRun: ${input.run_id}`,
          `Target Agent: ${input.request.target_agent_id}`,
          `Target Domain: ${input.request.target_domain_id}`,
          `Mode: ${input.request.mode}`,
        ].join('\n'),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      }), options);
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      recoveredExisting = true;
      handle = client.workflow.getHandle(workflowId);
    }
    const state: FoundryRunWorkflowState = await withTemporalRpcDeadline(
      client,
      () => handle.query(foundryRunQuery),
      options,
    );
    if (state.run_id !== input.run_id || state.request_digest !== requestDigest) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal Foundry USE_EXISTING resolved a different DesignRequest.',
        {
          workflow_id: workflowId,
          requested_run_id: input.run_id,
          resolved_run_id: state.run_id,
          requested_request_digest: requestDigest,
          resolved_request_digest: state.request_digest ?? null,
        },
      );
    }
    return {
      surface_kind: 'temporal_foundry_run_start_receipt' as const,
      version: 'opl-temporal-foundry-run-start.v1' as const,
      provider_kind: 'temporal' as const,
      run_id: input.run_id,
      request_digest: requestDigest,
      workflow_id: workflowId,
      recovered_existing_execution: recoveredExisting,
      task_queue: taskQueue(options),
      state,
    };
  }, options);
}

export async function queryTemporalFoundryRunWorkflow(
  runId: string,
  options: TemporalClientOptions = {},
) {
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(foundryTemporalWorkflowId(runId));
    return withTemporalRpcDeadline(client, () => handle.query(foundryRunQuery), options);
  }, options);
}

export async function submitTemporalFoundryOwnerDecision(
  input: FoundryOwnerDecisionUpdate,
  options: TemporalClientOptions = {},
) {
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(foundryTemporalWorkflowId(input.run_id));
    return withTemporalRpcDeadline(client, () => handle.executeUpdate(foundryOwnerDecisionUpdate, {
      args: [input],
    }), options);
  }, options);
}

export async function cancelTemporalFoundryRun(
  input: FoundryCancelUpdate,
  options: TemporalClientOptions = {},
) {
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(foundryTemporalWorkflowId(input.run_id));
    return withTemporalRpcDeadline(client, () => handle.executeUpdate(foundryCancelUpdate, {
      args: [input],
    }), options);
  }, options);
}
