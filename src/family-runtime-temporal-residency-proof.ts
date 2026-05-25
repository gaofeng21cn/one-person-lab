import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from './family-runtime-temporal-activities.ts';
import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';
import {
  humanGateSignal,
  resumeSignal,
  stageAttemptQuery,
  StageAttemptWorkflow,
  userInstructionSignal,
} from './family-runtime-temporal-workflows.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts' ? '.ts' : '.js';
const workflowsPath = path.join(__dirname, `family-runtime-temporal-workflows${moduleExtension}`);

function baseInput(
  suffix: string,
  closeoutPacket: Record<string, unknown> | null,
): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: `sat_temporal_residency_${suffix}`,
    workflow_id: `wf_temporal_residency_${suffix}`,
    domain_id: 'medautoscience',
    stage_id: 'analysis-campaign',
    workspace_locator: {
      workspace_root: '/tmp/mas-temporal-residency-proof',
      artifact_root: '/tmp/mas-temporal-residency-proof/artifacts',
    },
    source_fingerprint: `sha256:temporal-residency-${suffix}`,
    executor_kind: 'codex_cli',
    retry_budget: {
      max_attempts: 3,
    },
    task_id: `task-temporal-residency-${suffix}`,
    stage_packet_ref: `packet:temporal-residency:${suffix}`,
    checkpoint_refs: [`checkpoint:temporal-residency:${suffix}`],
    closeout_packet: closeoutPacket,
  };
}

function typedCloseoutPacket() {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:temporal-residency-domain-closeout'],
    consumed_refs: ['evidence:temporal-residency-table1'],
    consumed_memory_refs: ['memory:publication-route-stoploss'],
    writeback_receipt_refs: ['memory-writeback:temporal-residency-receipt'],
    rejected_writes: [{ reason: 'domain_truth_write_forbidden' }],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'bounded_repair',
      next_owner: 'med-autoscience',
    },
  };
}

async function createWorker(testEnv: TestWorkflowEnvironment, taskQueue: string) {
  return await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: testEnv.namespace,
    taskQueue,
    workflowsPath,
    activities,
  });
}

async function runCompletedAttempt(testEnv: TestWorkflowEnvironment, taskQueue: string) {
  const worker = await createWorker(testEnv, taskQueue);
  const workflowId = `wf-temporal-residency-complete-${Date.now()}`;
  return await worker.runUntil(async () => {
    const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
      args: [baseInput('complete', typedCloseoutPacket())],
      taskQueue,
      workflowId,
    });
    await handle.signal(humanGateSignal, {
      signal_kind: 'human_gate',
      payload: {
        human_gate_ref: 'gate:temporal-residency-proof',
        reason: 'operator_review',
      },
      source: 'temporal-residency-proof',
    });
    await handle.signal(userInstructionSignal, {
      signal_kind: 'user_instruction',
      payload: {
        instruction_ref: 'user:revision-request-10',
      },
      source: 'temporal-residency-proof',
    });
    await handle.signal(resumeSignal, {
      signal_kind: 'resume',
      payload: {
        resume_ref: 'resume:temporal-residency-proof',
        reason: 'proof_resume',
      },
      source: 'temporal-residency-proof',
    });
    const queriedWhileResident = await handle.query(stageAttemptQuery);
    const finalState = await handle.result();
    return {
      workflow_id: workflowId,
      run_id: handle.firstExecutionRunId,
      queried_while_resident: queriedWhileResident,
      final_state: finalState,
    };
  });
}

async function requeryCompletedAttemptAfterWorkerRestart(
  testEnv: TestWorkflowEnvironment,
  taskQueue: string,
  workflowId: string,
) {
  const worker = await createWorker(testEnv, taskQueue);
  return await worker.runUntil(async () => {
    const handle = testEnv.client.workflow.getHandle(workflowId);
    try {
      const query = await handle.query(stageAttemptQuery);
      return {
        requery_status: 'stage_attempt_query_available_after_worker_restart',
        query_available: true,
        query,
      };
    } catch (error) {
      const description = await handle.describe();
      return {
        requery_status: 'stage_attempt_query_unavailable_after_worker_restart',
        query_available: false,
        query_error: error instanceof Error ? error.message : String(error),
        diagnostic_workflow_status: description.status.name,
        diagnostic_run_id: description.runId,
      };
    }
  });
}

async function runBlockedAttempt(testEnv: TestWorkflowEnvironment, taskQueue: string) {
  const worker = await createWorker(testEnv, taskQueue);
  const workflowId = `wf-temporal-residency-blocked-${Date.now()}`;
  return await worker.runUntil(async () => {
    const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
      args: [baseInput('blocked', null)],
      taskQueue,
      workflowId,
    });
    const finalState = await handle.result();
    return {
      workflow_id: workflowId,
      run_id: handle.firstExecutionRunId,
      final_state: finalState,
    };
  });
}

export async function runTemporalResidencyProof() {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-temporal-residency-proof-${Date.now()}`;
  try {
    const completed = await runCompletedAttempt(testEnv, taskQueue);
    const requery = await requeryCompletedAttemptAfterWorkerRestart(
      testEnv,
      taskQueue,
      completed.workflow_id,
    );
    const blocked = await runBlockedAttempt(testEnv, taskQueue);
    const completedState = completed.final_state;
    const blockedState = blocked.final_state;
    const requeryState = requery.query_available && 'query' in requery ? requery.query : null;
    const requeryMatchedAttempt =
      requery.query_available && requeryState?.stage_attempt_id === completedState.stage_attempt_id;
    const checks = {
      temporal_test_server_started: true,
      worker_completed_attempt: completedState.status === 'completed',
      worker_restart_requery: requeryMatchedAttempt,
      signal_history_preserved: completedState.signals.length === 3,
      typed_closeout_required_for_completed:
        completedState.completion_boundary.provider_completion === 'completed'
        && completedState.closeout_refs.length > 0,
      missing_closeout_blocks_completion:
        blockedState.status === 'blocked'
        && blockedState.completion_boundary.provider_completion === 'not_completed',
      domain_truth_boundary_preserved:
        completedState.authority_boundary.domain === 'truth_quality_artifact_gate_owner'
        && completedState.completion_boundary.provider_completion_is_domain_ready === false,
    };
    const proven = Object.values(checks).every(Boolean);
    return {
      surface_kind: 'opl_temporal_residency_live_proof',
      provider_kind: 'temporal',
      proof_environment: 'temporal_test_server_and_real_worker',
      closeout_status: proven ? 'production_residency_code_path_proven' : 'production_residency_code_path_failed',
      task_queue: taskQueue,
      checks,
      completed_attempt: {
        workflow_id: completed.workflow_id,
        run_id: completed.run_id,
        status: completedState.status,
        signal_count: completedState.signals.length,
        closeout_refs: completedState.closeout_refs,
        consumed_refs: completedState.consumed_refs,
        consumed_memory_refs: completedState.consumed_memory_refs,
        writeback_receipt_refs: completedState.writeback_receipt_refs,
        domain_ready_verdict: completedState.completion_boundary.domain_ready_verdict,
      },
      restarted_worker_requery: {
        workflow_id: completed.workflow_id,
        requery_status: requery.requery_status,
        query_available: requery.query_available,
        status: requeryState?.status ?? null,
        run_id: requeryState ? completed.run_id : null,
        diagnostic_workflow_status:
          'diagnostic_workflow_status' in requery ? requery.diagnostic_workflow_status : null,
        diagnostic_run_id:
          'diagnostic_run_id' in requery ? requery.diagnostic_run_id : null,
      },
      blocked_attempt: {
        workflow_id: blocked.workflow_id,
        run_id: blocked.run_id,
        status: blockedState.status,
        provider_completion: blockedState.completion_boundary.provider_completion,
        closeout_refs: blockedState.closeout_refs,
        blocked_reason:
          blockedState.activity_events.find(
            (event) => event.activity_kind === 'domain_handler_dispatch_activity',
          )?.blocked_reason ?? null,
      },
      authority_boundary: {
        opl: 'temporal_residency_proof_and_transport_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  } finally {
    await testEnv.teardown();
  }
}
