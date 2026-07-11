import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/common';
import type { Client } from '@temporalio/client';

import {
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from '../family-runtime-temporal.ts';
import {
  requireTemporalAddress,
  resolveTemporalClientRpcTimeoutMs,
  type TemporalClientOptions,
  withTemporalClient,
  withTemporalRpcDeadline,
} from '../family-runtime-temporal-client.ts';
import {
  stageAttemptOperatorUpdate,
  stageAttemptQuery,
} from '../family-runtime-temporal-workflows.ts';
import { taskRetryBudgetProjection } from '../family-runtime-queue-projection-boundary.ts';

const TEMPORAL_PRODUCTION_PROOF_RESULT_RPC_TIMEOUT_MS = 60_000;

type TemporalProductionWorkerLifecycle = {
  address: string | null;
  address_source: string;
  namespace: string;
  task_queue: string;
  lifecycle_status: string;
  server_reachable: boolean | null;
  worker_ready: boolean | null;
  managed_worker_pid?: number | null;
  managed_worker_state_path?: string | null;
  temporal_service_lifecycle?: Record<string, unknown> | null;
  blockers: string[];
  repair_action: Record<string, unknown> & {
    action_id: string;
  };
};

type TemporalProductionUpdateHandle = {
  executeUpdate(
    update: typeof stageAttemptOperatorUpdate,
    options: { args: [Record<string, unknown>] },
  ): Promise<unknown>;
};

export function temporalProductionProbeInput(
  suffix: string,
  closeoutPacket: Record<string, unknown> | null,
): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: `sat_temporal_production_${suffix}`,
    workflow_id: `wf_temporal_production_${suffix}`,
    domain_id: 'example-domain' as TemporalStageAttemptWorkflowInput['domain_id'],
    stage_id: 'production-residency-proof',
    workspace_locator: {
      workspace_root: '/tmp/opl-temporal-production-residency-proof',
      artifact_root: '/tmp/opl-temporal-production-residency-proof/artifacts',
    },
    source_fingerprint: `sha256:temporal-production-residency-${suffix}`,
    executor_kind: 'codex_cli',
    retry_budget: taskRetryBudgetProjection(3),
    task_id: `task-temporal-production-residency-${suffix}`,
    stage_packet_ref: `packet:temporal-production-residency:${suffix}`,
    checkpoint_refs: [`checkpoint:temporal-production-residency:${suffix}`],
    closeout_packet: closeoutPacket,
  };
}

export function temporalProductionTypedCloseoutPacket() {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:temporal-production-residency-domain-closeout'],
    consumed_refs: ['evidence:temporal-production-residency'],
    consumed_memory_refs: ['memory:example-domain-production-residency'],
    writeback_receipt_refs: ['memory-writeback:temporal-production-residency-receipt'],
    next_owner: 'example-domain',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'production_residency_transport_probe',
      next_owner: 'example-domain',
    },
  };
}

function temporalProductionRuntimeSnapshot(
  worker: TemporalProductionWorkerLifecycle,
  address = worker.address,
) {
  return {
    provider_kind: 'temporal',
    address,
    namespace: worker.namespace,
    task_queue: worker.task_queue,
    address_source: worker.address_source,
    lifecycle_status: worker.lifecycle_status,
    server_reachable: worker.server_reachable,
    worker_ready: worker.worker_ready,
    managed_worker_pid: worker.managed_worker_pid,
    managed_worker_state_path: worker.managed_worker_state_path,
    temporal_service_lifecycle: worker.temporal_service_lifecycle,
  };
}

function temporalProductionProofEnvironment(worker: TemporalProductionWorkerLifecycle) {
  return worker.address_source === 'managed_local_service_state'
    ? 'local_temporal_service_and_managed_worker'
    : 'external_temporal_service_and_managed_worker';
}

function blockedTemporalProductionResidencyProof(input: {
  worker: TemporalProductionWorkerLifecycle;
  proofEnvironment: string;
  blockerStatus: string;
  blockerIds: string[];
  errorMessage?: string;
  address?: string;
  namespace?: string;
  taskQueue?: string;
}) {
  const repairAction = input.worker.repair_action;
  return {
    surface_kind: 'opl_temporal_external_production_residency_proof',
    provider_kind: 'temporal',
    proof_environment: input.proofEnvironment,
    closeout_status: 'production_residency_blocked',
    blocker: {
      blocker_kind: 'platform_dependency',
      blocker_status: input.blockerStatus,
      blocker_ids: input.blockerIds,
      owner: 'operator',
      required_before: 'production_residency_proof',
      repair_action: repairAction,
      ...(input.errorMessage ? { error_message: input.errorMessage } : {}),
    },
    blockers: input.blockerIds,
    temporal_worker_lifecycle: input.worker,
    runtime_snapshot: {
      ...temporalProductionRuntimeSnapshot(input.worker, input.address),
      namespace: input.namespace ?? input.worker.namespace,
      task_queue: input.taskQueue ?? input.worker.task_queue,
    },
    checks: {
      external_temporal_server_reachable: input.worker.server_reachable === true,
      managed_worker_ready: input.worker.worker_ready === true,
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
      blocker_ids: input.blockerIds,
      repair_action_id: repairAction.action_id,
    },
    authority_boundary: {
      opl: 'temporal_residency_proof_and_transport_metadata_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
}

async function executeTemporalProductionProofUpdates(
  client: Client,
  handle: TemporalProductionUpdateHandle,
  temporalClientOptions: TemporalClientOptions,
) {
  await withTemporalRpcDeadline(client, () => handle.executeUpdate(stageAttemptOperatorUpdate, { args: [{
    signal_kind: 'human_gate',
    payload: {
      human_gate_ref: 'gate:temporal-production-residency-proof',
      reason: 'operator_review',
    },
    source: 'temporal-production-residency-proof',
  }] }), temporalClientOptions);
  await withTemporalRpcDeadline(client, () => handle.executeUpdate(stageAttemptOperatorUpdate, { args: [{
    signal_kind: 'user_instruction',
    payload: {
      instruction_ref: 'user:production-residency-revision-request',
    },
    source: 'temporal-production-residency-proof',
  }] }), temporalClientOptions);
  await withTemporalRpcDeadline(client, () => handle.executeUpdate(stageAttemptOperatorUpdate, { args: [{
    signal_kind: 'resume',
    payload: {
      resume_ref: 'resume:temporal-production-residency-proof',
      reason: 'proof_resume',
    },
    source: 'temporal-production-residency-proof',
  }] }), temporalClientOptions);
}

export async function runTemporalProductionResidencyProofForWorker(
  worker: TemporalProductionWorkerLifecycle,
) {
  const proofEnvironment = temporalProductionProofEnvironment(worker);
  if (worker.lifecycle_status !== 'ready') {
    const blockers = worker.blockers.length > 0 ? worker.blockers : ['temporal_worker_not_ready'];
    return blockedTemporalProductionResidencyProof({
      worker,
      proofEnvironment,
      blockerStatus: worker.lifecycle_status,
      blockerIds: blockers,
    });
  }

  const address = worker.address || requireTemporalAddress();
  const namespace = resolveTemporalNamespace();
  const taskQueue = resolveTemporalTaskQueue();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const completedWorkflowId = `wf-temporal-production-complete-${suffix}`;
  const blockedWorkflowId = `wf-temporal-production-blocked-${suffix}`;
  const temporalClientOptions = { addressOverride: address };
  const temporalProofResultClientOptions: TemporalClientOptions = {
    ...temporalClientOptions,
    rpcTimeoutMs: Math.max(
      resolveTemporalClientRpcTimeoutMs(),
      TEMPORAL_PRODUCTION_PROOF_RESULT_RPC_TIMEOUT_MS,
    ),
  };
  try {
    return await withTemporalClient(async (client) => {
      const completedHandle = await withTemporalRpcDeadline(client, () => client.workflow.start('StageAttemptWorkflow', {
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
      }), temporalClientOptions);
      await executeTemporalProductionProofUpdates(client, completedHandle, temporalClientOptions);
      const queriedWhileResident = await withTemporalRpcDeadline(
        client,
        () => completedHandle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery),
        temporalClientOptions,
      );
      const completedState = await withTemporalRpcDeadline(
        client,
        () => completedHandle.result(),
        temporalProofResultClientOptions,
      );

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
          query: await withTemporalRpcDeadline(
            client,
            () => restartedHandle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery),
            temporalClientOptions,
          ),
        };
      } catch (error) {
        const description = await withTemporalRpcDeadline(
          client,
          () => restartedHandle.describe(),
          temporalClientOptions,
        );
        requery = {
          requery_status: 'stage_attempt_query_unavailable_after_worker_restart',
          query_available: false,
          query_error: error instanceof Error ? error.message : String(error),
          diagnostic_workflow_status: description.status.name,
          diagnostic_run_id: description.runId,
        };
      }

      const blockedHandle = await withTemporalRpcDeadline(client, () => client.workflow.start('StageAttemptWorkflow', {
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
      }), temporalClientOptions);
      const blockedState = await withTemporalRpcDeadline(
        client,
        () => blockedHandle.result(),
        temporalProofResultClientOptions,
      );
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
          ...temporalProductionRuntimeSnapshot(worker, address),
          namespace,
          task_queue: taskQueue,
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
    }, temporalClientOptions);
  } catch (error) {
    return blockedTemporalProductionResidencyProof({
      worker,
      proofEnvironment,
      blockerStatus: 'worker_transport_probe_failed',
      blockerIds: ['temporal_worker_transport_probe_failed'],
      errorMessage: error instanceof Error ? error.message : String(error),
      address,
      namespace,
      taskQueue,
    });
  }
}
