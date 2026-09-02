import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
  WorkflowNotFoundError,
} from '@temporalio/common';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  requireTemporalStageAttemptWorkflowInputLaunchable,
  requireTemporalStageRunRecoveryResume,
  requireTemporalStageRunWorkflowInputLaunchable,
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
  type TemporalStageAttemptSignalKind,
  type TemporalStageAttemptSignalPayload,
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageRunWorkflowInput,
} from '../family-runtime-temporal.ts';
import {
  requireTemporalAddress,
  resolveTemporalClientNamespace,
  type TemporalClientOptions,
  type TemporalWorkerPaths,
  withTemporalClient,
  withTemporalRpcDeadline,
} from '../family-runtime-temporal-client.ts';
import {
  buildTemporalStageAttemptMemo,
  buildTemporalStageAttemptSearchAttributes,
  buildTemporalStageRunMemo,
  buildTemporalStageRunSearchAttributes,
  ensureTemporalStageAttemptVisibilityReady,
  temporalTestServerAllowsUnindexedVisibility,
} from '../family-runtime-temporal-visibility.ts';
import { assertTemporalWorkflowMemoIdentity } from '../family-runtime-temporal-identity.ts';
import {
  stageAttemptOperatorUpdate,
  stageRunQuery,
} from '../family-runtime-temporal-workflows.ts';
import { requireGenericResumeAllowed } from '../family-runtime-stage-quality-attempt-boundary.ts';
import {
  resolveTemporalAddressForPaths,
} from '../family-runtime-temporal-service.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from './worker-task-queue.ts';

type StageAttemptPayload = Parameters<typeof buildTemporalStageAttemptWorkflowInput>[0] & {
  stage_attempt_id: string;
  workflow_id: string;
  provider_kind: string;
};

function assertTemporalStageRunRecoveryMemoIdentity(
  memo: Record<string, unknown> | undefined,
  input: TemporalStageRunWorkflowInput,
) {
  const recovery = requireTemporalStageRunRecoveryResume(input);
  if (!recovery) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun recovery start requires recovery resume identity.',
      { failure_code: 'stage_run_recovery_resume_missing' },
    );
  }
  const observed = memo ?? {};
  if (
    observed.recovery_id !== recovery.recovery_id
    || observed.recovery_quality_cycle_id !== recovery.quality_cycle_id
    || observed.recovery_producer_attempt_ref !== recovery.producer_attempt_ref
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun recovery memo conflicts with the requested recovery identity.',
      {
        failure_code: 'stage_run_recovery_temporal_identity_conflict',
        workflow_id: input.workflow_id,
        recovery_id: recovery.recovery_id,
        observed_recovery_id: observed.recovery_id ?? null,
      },
    );
  }
  return recovery;
}

function temporalWorkflowStatusIsRunning(value: unknown) {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return normalized === 'RUNNING' || normalized.endsWith('_RUNNING');
}

export async function startTemporalStageRunWorkflow(
  input: TemporalStageRunWorkflowInput,
  options: TemporalClientOptions = {},
) {
  const workflowInput = requireTemporalStageRunWorkflowInputLaunchable(input);
  const taskQueue = options.paths
    ? resolveTemporalWorkerTaskQueue(options.paths)
    : resolveTemporalTaskQueue();
  if (!resolveTemporalAddressForPaths(options.paths).address) requireTemporalAddress();
  return withTemporalClient(async (client, connection) => {
    const visibilityReadiness = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalClientNamespace(options),
      address: resolveTemporalAddressForPaths(options.paths).address,
      taskQueue,
    });
    const launchInput: TemporalStageRunWorkflowInput = {
      ...workflowInput,
      visibility_search_attributes_upsert_enabled: visibilityReadiness.readiness_status === 'ready',
    };
    let workflowId = launchInput.workflow_id;
    let firstExecutionRunId: string;
    let workflowStatus = 'RUNNING';
    let recoveredExisting = false;
    try {
      const handle = await withTemporalRpcDeadline(client, () => client.workflow.start('StageRunWorkflow', {
        args: [launchInput],
        taskQueue,
        workflowId: launchInput.workflow_id,
        memo: buildTemporalStageRunMemo(launchInput),
        ...temporalTestServerAllowsUnindexedVisibility()
          ? {}
          : { searchAttributes: buildTemporalStageRunSearchAttributes(launchInput) },
        staticSummary: `OPL StageRun ${launchInput.stage_run_id}`,
        staticDetails: [
          ...(launchInput.execution_scope?.domain_work_item_id
            ? [`Work item: ${launchInput.execution_scope.domain_work_item_id}`]
            : []),
          `StageRun: ${launchInput.stage_run_id}`,
          `Invocation: ${launchInput.stage_run_invocation_id}`,
          `Spec: ${launchInput.stage_run_spec_sha256}`,
          `Domain: ${launchInput.domain_id}`,
          `Stage: ${launchInput.stage_id}`,
          `Quality rounds: ${launchInput.quality_policy.formal_review.max_repair_rounds}`,
        ].join('\n'),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      }), options);
      workflowId = handle.workflowId;
      firstExecutionRunId = handle.firstExecutionRunId;
      const description = await withTemporalRpcDeadline(client, () => handle.describe(), options);
      assertTemporalWorkflowMemoIdentity({
        workflowId: description.workflowId,
        memo: description.memo,
        expected: launchInput as TemporalStageRunWorkflowInput & Record<string, unknown>,
        operation: 'start_temporal_stage_run',
      });
      workflowStatus = description.status.name;
      firstExecutionRunId = firstExecutionRunId || description.runId;
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = client.workflow.getHandle(launchInput.workflow_id);
      const description = await withTemporalRpcDeadline(client, () => existing.describe(), options);
      assertTemporalWorkflowMemoIdentity({
        workflowId: description.workflowId,
        memo: description.memo,
        expected: launchInput as TemporalStageRunWorkflowInput & Record<string, unknown>,
        operation: 'recover_existing_temporal_stage_run',
      });
      workflowId = description.workflowId;
      firstExecutionRunId = description.runId;
      workflowStatus = description.status.name;
      recoveredExisting = true;
    }
    return {
      surface_kind: 'temporal_stage_run_start_receipt',
      provider_kind: 'temporal',
      stage_run_id: launchInput.stage_run_id,
      stage_run_invocation_id: launchInput.stage_run_invocation_id,
      stage_run_spec_sha256: launchInput.stage_run_spec_sha256,
      workflow_id: workflowId,
      first_execution_run_id: firstExecutionRunId,
      workflow_status: workflowStatus,
      recovered_existing_execution: recoveredExisting,
      execution_scope: launchInput.execution_scope ?? null,
      task_queue: taskQueue,
      visibility_readiness: visibilityReadiness,
      max_repair_rounds: launchInput.quality_policy.formal_review.max_repair_rounds,
      authority_boundary: {
        opl: 'durable_quality_loop_orchestration_and_refs_transport_only',
        domain: 'review_findings_repair_artifact_and_quality_verdict_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }, options);
}

export async function startTemporalStageRunRecoveryWorkflow(
  input: TemporalStageRunWorkflowInput,
  options: TemporalClientOptions = {},
) {
  const workflowInput = requireTemporalStageRunWorkflowInputLaunchable(input);
  const recovery = requireTemporalStageRunRecoveryResume(workflowInput)!;
  const taskQueue = options.paths
    ? resolveTemporalWorkerTaskQueue(options.paths)
    : resolveTemporalTaskQueue();
  if (!resolveTemporalAddressForPaths(options.paths).address) requireTemporalAddress();
  return withTemporalClient(async (client, connection) => {
    const visibilityReadiness = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalClientNamespace(options),
      address: resolveTemporalAddressForPaths(options.paths).address,
      taskQueue,
    });
    const launchInput: TemporalStageRunWorkflowInput = {
      ...workflowInput,
      visibility_search_attributes_upsert_enabled: visibilityReadiness.readiness_status === 'ready',
    };
    const receiptFromDescription = (
      description: Awaited<ReturnType<ReturnType<typeof client.workflow.getHandle>['describe']>>,
      recoveredExistingExecution: boolean,
    ) => {
      assertTemporalWorkflowMemoIdentity({
        workflowId: description.workflowId,
        memo: description.memo,
        expected: launchInput as TemporalStageRunWorkflowInput & Record<string, unknown>,
        operation: 'start_temporal_stage_run_recovery',
      });
      assertTemporalStageRunRecoveryMemoIdentity(description.memo, launchInput);
      return {
        surface_kind: 'temporal_stage_run_recovery_start_receipt',
        version: 'opl-temporal-stage-run-recovery-start-receipt.v1',
        provider_kind: 'temporal',
        recovery_id: recovery.recovery_id,
        stage_run_id: launchInput.stage_run_id,
        stage_run_invocation_id: launchInput.stage_run_invocation_id,
        stage_run_spec_sha256: launchInput.stage_run_spec_sha256,
        quality_cycle_id: recovery.quality_cycle_id,
        producer_attempt_ref: recovery.producer_attempt_ref,
        workflow_id: description.workflowId,
        recovery_run_id: description.runId,
        workflow_status: description.status.name,
        recovered_existing_execution: recoveredExistingExecution,
        execution_scope: launchInput.execution_scope ?? null,
        task_queue: taskQueue,
        visibility_readiness: visibilityReadiness,
        authority_boundary: {
          opl: 'same_stage_run_durable_quality_loop_recovery_only',
          domain: 'review_findings_repair_artifact_and_quality_verdict_owner',
          producer_attempt_reexecution_allowed: false,
        },
      } as const;
    };

    const existingHandle = client.workflow.getHandle(launchInput.workflow_id);
    try {
      const existing = await withTemporalRpcDeadline(client, () => existingHandle.describe(), options);
      assertTemporalWorkflowMemoIdentity({
        workflowId: existing.workflowId,
        memo: existing.memo,
        expected: launchInput as TemporalStageRunWorkflowInput & Record<string, unknown>,
        operation: 'inspect_temporal_stage_run_before_recovery',
      });
      if (
        existing.memo?.recovery_id === recovery.recovery_id
        && temporalWorkflowStatusIsRunning(existing.status.name)
      ) {
        return receiptFromDescription(existing, true);
      }
      if (
        (existing.memo?.recovery_id && existing.memo.recovery_id !== recovery.recovery_id)
        || temporalWorkflowStatusIsRunning(existing.status.name)
      ) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal StageRun recovery found a different live or recovered execution.',
          {
            failure_code: 'stage_run_recovery_temporal_identity_conflict',
            workflow_id: launchInput.workflow_id,
            recovery_id: recovery.recovery_id,
            observed_recovery_id: existing.memo?.recovery_id ?? null,
            observed_workflow_status: existing.status.name,
          },
        );
      }
    } catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) throw error;
    }

    try {
      const handle = await withTemporalRpcDeadline(client, () => client.workflow.start('StageRunWorkflow', {
        args: [launchInput],
        taskQueue,
        workflowId: launchInput.workflow_id,
        memo: buildTemporalStageRunMemo(launchInput),
        ...temporalTestServerAllowsUnindexedVisibility()
          ? {}
          : { searchAttributes: buildTemporalStageRunSearchAttributes(launchInput) },
        staticSummary: `OPL StageRun recovery ${launchInput.stage_run_id}`,
        staticDetails: [
          `StageRun: ${launchInput.stage_run_id}`,
          `Recovery: ${recovery.recovery_id}`,
          `Producer Attempt: ${recovery.producer_attempt_ref}`,
        ].join('\n'),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      }), options);
      const description = await withTemporalRpcDeadline(client, () => handle.describe(), options);
      return receiptFromDescription(description, false);
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = await withTemporalRpcDeadline(client, () => existingHandle.describe(), options);
      return receiptFromDescription(existing, true);
    }
  }, options);
}

export async function describeTemporalStageRunWorkflow(
  input: TemporalStageRunWorkflowInput,
  options: TemporalClientOptions = {},
) {
  const workflowInput = requireTemporalStageRunWorkflowInputLaunchable(input);
  if (!resolveTemporalAddressForPaths(options.paths).address) requireTemporalAddress();
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(workflowInput.workflow_id);
    try {
      const description = await withTemporalRpcDeadline(client, () => handle.describe(), options);
      assertTemporalWorkflowMemoIdentity({
        workflowId: description.workflowId,
        memo: description.memo,
        expected: workflowInput as TemporalStageRunWorkflowInput & Record<string, unknown>,
        operation: 'describe_temporal_stage_run',
      });
      if (workflowInput.recovery_resume) {
        assertTemporalStageRunRecoveryMemoIdentity(description.memo, workflowInput);
      }
      return {
        surface_kind: 'temporal_stage_run_observation_receipt',
        provider_kind: 'temporal',
        workflow_found: true,
        stage_run_id: workflowInput.stage_run_id,
        stage_run_invocation_id: workflowInput.stage_run_invocation_id,
        stage_run_spec_sha256: workflowInput.stage_run_spec_sha256,
        workflow_id: description.workflowId,
        first_execution_run_id: description.runId,
        workflow_status: description.status.name,
        recovery_id: workflowInput.recovery_resume?.recovery_id ?? null,
      };
    } catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) throw error;
      return {
        surface_kind: 'temporal_stage_run_observation_receipt',
        provider_kind: 'temporal',
        workflow_found: false,
        stage_run_id: workflowInput.stage_run_id,
        stage_run_invocation_id: workflowInput.stage_run_invocation_id,
        stage_run_spec_sha256: workflowInput.stage_run_spec_sha256,
        workflow_id: workflowInput.workflow_id,
        first_execution_run_id: null,
        workflow_status: 'NOT_FOUND',
      };
    }
  }, options);
}

export async function queryTemporalStageRunWorkflow(input: {
  workflowId: string;
  paths?: TemporalWorkerPaths;
}) {
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(input.workflowId);
    return await withTemporalRpcDeadline(client, () => handle.query(stageRunQuery), {
      paths: input.paths,
    });
  }, { paths: input.paths });
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
  const taskQueue = options.paths
    ? resolveTemporalWorkerTaskQueue(options.paths)
    : resolveTemporalTaskQueue();
  if (!resolveTemporalAddressForPaths(options.paths).address) requireTemporalAddress();
  return withTemporalClient(async (client, connection) => {
    const visibilityReadiness = await ensureTemporalStageAttemptVisibilityReady(connection, {
      namespace: resolveTemporalClientNamespace(options),
      address: resolveTemporalAddressForPaths(options.paths).address,
      taskQueue,
    });
    const launchInput: TemporalStageAttemptWorkflowInput = {
      ...workflowInput,
      visibility_search_attributes_upsert_enabled: visibilityReadiness.readiness_status === 'ready',
    };
    const handle = await withTemporalRpcDeadline(client, () => client.workflow.start('StageAttemptWorkflow', {
      args: [launchInput],
      taskQueue,
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
    }), options);
    const description = await withTemporalRpcDeadline(client, () => handle.describe(), options);
    assertTemporalWorkflowMemoIdentity({
      workflowId: description.workflowId,
      memo: description.memo,
      expected: launchInput as TemporalStageAttemptWorkflowInput & Record<string, unknown>,
      operation: 'start_temporal_stage_attempt',
    });
    return {
      surface_kind: 'temporal_stage_attempt_start_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: handle.workflowId,
      first_execution_run_id: handle.firstExecutionRunId,
      execution_scope: launchInput.execution_scope ?? null,
      eagerly_started: handle.eagerlyStarted,
      namespace: resolveTemporalClientNamespace(options),
      task_queue: taskQueue,
      transport_identity: {
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        source_fingerprint: attempt.source_fingerprint,
      },
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
  requireGenericResumeAllowed(
    input.attempt as unknown as Record<string, unknown>,
    input.signalKind,
  );
  const expectedInput = requireTemporalStageAttemptWorkflowInputLaunchable(
    buildTemporalStageAttemptWorkflowInput(input.attempt),
  );
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(input.attempt.workflow_id);
    const description = await withTemporalRpcDeadline(client, () => handle.describe(), { paths: input.paths });
    assertTemporalWorkflowMemoIdentity({
      workflowId: description.workflowId,
      memo: description.memo,
      expected: expectedInput as TemporalStageAttemptWorkflowInput & Record<string, unknown>,
      operation: 'signal_temporal_stage_attempt',
    });
    const signal: TemporalStageAttemptSignalPayload = {
      signal_kind: input.signalKind,
      payload: input.payload,
      source: input.source ?? 'opl-cli',
      received_at: new Date().toISOString(),
    };
    const updateReceipt = await withTemporalRpcDeadline(client, () => handle.executeUpdate(stageAttemptOperatorUpdate, {
      args: [signal],
    }), { paths: input.paths });
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

export function buildTemporalStageAttemptMissingWorkflowCancelReceipt(input: {
  stageAttemptId: string;
  workflowId: string;
  reason: string;
  source?: string;
  message?: string;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_cancel_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    cancel_requested_at: new Date().toISOString(),
    reason: input.reason,
    source: input.source ?? 'opl-cli',
    cancel_status: 'workflow_not_started_or_not_found',
    degraded_reason: 'temporal_workflow_not_started_or_not_found',
    error: {
      code: 'temporal_workflow_not_found',
      message: input.message ?? `workflow not found for ID: ${input.workflowId}`,
    },
    authority_boundary: {
      opl: 'temporal_workflow_cancellation_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
}

export async function cancelTemporalStageAttemptWorkflow(input: {
  attempt: StageAttemptPayload;
  reason: string;
  source?: string;
  paths?: TemporalWorkerPaths;
}) {
  if (input.attempt.provider_kind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'Temporal cancel requires a temporal stage attempt.', {
      stage_attempt_id: input.attempt.stage_attempt_id,
      provider_kind: input.attempt.provider_kind,
    });
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new FrameworkContractError('cli_usage_error', 'Temporal cancel requires a non-empty reason.', {
      stage_attempt_id: input.attempt.stage_attempt_id,
    });
  }
  return withTemporalClient(async (client) => {
    const handle = client.workflow.getHandle(input.attempt.workflow_id);
    try {
      await withTemporalRpcDeadline(client, () => handle.cancel(), { paths: input.paths });
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return buildTemporalStageAttemptMissingWorkflowCancelReceipt({
          stageAttemptId: input.attempt.stage_attempt_id,
          workflowId: input.attempt.workflow_id,
          reason,
          source: input.source,
          message: error.message,
        });
      }
      throw error;
    }
    return {
      surface_kind: 'temporal_stage_attempt_cancel_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: input.attempt.stage_attempt_id,
      workflow_id: input.attempt.workflow_id,
      cancel_requested_at: new Date().toISOString(),
      reason,
      source: input.source ?? 'opl-cli',
      authority_boundary: {
        opl: 'temporal_workflow_cancellation_transport_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }, { paths: input.paths });
}
