import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defaultPayloadConverter,
  fromPayloadsAtIndex,
} from '@temporalio/common/lib/converter/payload-converter.js';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../../src/modules/runway/family-runtime-temporal-activities.ts';
import {
  type TemporalStageAttemptWorkflowInput,
} from '../../../src/modules/runway/family-runtime-temporal.ts';
import {
  StageAttemptWorkflow,
} from '../../../src/modules/runway/family-runtime-temporal-workflows.ts';
import { codexActivityEventForTemporalHistory } from '../../../src/modules/runway/family-runtime-temporal-history-summary.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function firstActivityResultFromHistory(history: { events?: Array<Record<string, any>> | null }) {
  const completion = (history.events ?? []).find((event) => event.activityTaskCompletedEventAttributes);
  const payloads = completion?.activityTaskCompletedEventAttributes?.result?.payloads;
  return fromPayloadsAtIndex<Record<string, any>>(defaultPayloadConverter, 0, payloads);
}

function workflowInput(): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: 'sat_temporal_test',
    workflow_id: 'wf_temporal_test',
    domain_id: 'medautoscience',
    stage_id: 'analysis-campaign',
    workspace_locator: {
      workspace_root: '/tmp/mas',
    },
    source_fingerprint: 'sha256:test',
    executor_kind: 'codex_cli',
    retry_budget: {
      max_attempts: 3,
    },
    task_id: 'task-temporal-test',
    stage_packet_ref: 'packet:analysis',
    checkpoint_refs: ['checkpoint:seed'],
    codex_stage_runner: {
      runner_mode: 'dry_run',
    },
    closeout_packet: {
      surface_kind: 'stage_memory_closeout_packet',
      closeout_refs: ['receipt:domain-closeout'],
      consumed_refs: ['evidence:table1'],
      consumed_memory_refs: ['memory:route-policy'],
      writeback_receipt_refs: ['memory-writeback:receipt-1'],
      rejected_writes: [{ reason: 'domain_router_rejected' }],
      next_owner: 'med-autoscience',
      domain_ready_verdict: 'domain_gate_pending',
      route_impact: { route: 'review', next_owner: 'med-autoscience' },
    },
  };
}

test('Temporal Codex activity result stored in history is refs-only by default', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-activity-summary-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities,
    });

    const history = await worker.runUntil(async () => {
      const input = workflowInput();
      const workflowId = `wf-temporal-activity-summary-test-${Date.now()}`;
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          ...input,
          closeout_packet: null,
          executor_kind: 'codex_cli',
          codex_stage_runner: {
            runner_mode: 'dry_run',
          },
        }],
        taskQueue,
        workflowId,
      });
      await handle.result();
      return await handle.fetchHistory();
    });

    const activityReceipt = firstActivityResultFromHistory(history);
    assert.equal(activityReceipt.stdout, undefined);
    assert.equal(activityReceipt.stderr, undefined);
    assert.equal(activityReceipt.log_body, undefined);
    assert.equal(activityReceipt.agent_execution_receipt, undefined);
    assert.equal(JSON.stringify(activityReceipt).includes('command_preview'), false);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow stores refs-only Codex activity summaries in workflow state', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-payload-guard-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async (input: TemporalStageAttemptWorkflowInput) => ({
          surface_kind: 'temporal_codex_stage_activity_receipt',
          activity_kind: 'codex_stage_activity',
          activity_status: 'completed',
          stage_attempt_id: input.stage_attempt_id,
          stage_id: input.stage_id,
          checkpoint_refs: input.checkpoint_refs ?? [],
          process_output_summary: {
            exit_code: 130,
            final_message_chars: 180_000,
            stderr_tail: ['y'.repeat(4_000)],
            timeout_reason: 'activity_cancelled',
            blocked_reason: 'codex_cli_activity_cancelled',
            recovered_session_path: '/tmp/codex/session.jsonl',
            external_sandbox_execution: {
              execution_substrate: 'external_sandbox',
              provider_kind: 'e2b',
              sandbox_id: 'sandbox_temporal_summary_test',
              sandbox_domain: 'sandbox.e2b.test',
              sandbox_reuse: 'created',
              template: 'codex-template',
              sandbox_workspace_root: '/home/user/workspace',
              workspace_transport: {
                transport_kind: 'git_clone',
                repo_url: 'https://github.com/example/domain.git',
                checkout_ref: 'abc123',
                clone_exit_code: 0,
                checkout_exit_code: 0,
              },
              command_exit_code: 130,
              jsonl_stdout_bytes: 1024,
              diff_refs: {
                changed_file_refs: ['artifacts/stage-output.json'],
                diff_stat: [' artifacts/stage-output.json | 1 +'],
              },
              external_api_called: true,
              credential_material_logged: false,
              forwarded_env_keys: ['OPL_STAGE_PACKET_REF'],
            },
          },
          progress_summary: {
            runner_events: [{
              event_kind: 'agent_message',
              value: 'x'.repeat(4_000),
            }],
          },
          stdout: 'must-not-enter-workflow-history',
          stderr: 'must-not-enter-workflow-history',
          log_body: 'must-not-enter-workflow-history',
        }),
      },
    });

    const result = await worker.runUntil(async () => {
      const input = workflowInput();
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          ...input,
          closeout_packet: null,
        }],
        taskQueue,
        workflowId: `wf-temporal-payload-guard-test-${Date.now()}`,
      });
      return await handle.result();
    });

    const codexEvent = result.activity_events.find(
      (event) => event.activity_kind === 'codex_stage_activity' && event.activity_status === 'completed',
    ) as Record<string, any> | undefined;
    assert.ok(codexEvent, 'workflow state must keep a small Codex activity event summary.');
    assert.equal(codexEvent.stdout, undefined);
    assert.equal(codexEvent.stderr, undefined);
    assert.equal(codexEvent.log_body, undefined);
    assert.equal(codexEvent.closeout_packet, undefined);
    assert.equal(codexEvent.process_output_summary.final_message_chars, 180_000);
    assert.deepEqual(codexEvent.process_output_summary.stderr_tail, []);
    assert.equal(codexEvent.process_output_summary.recovered_session_path, '/tmp/codex/session.jsonl');
    const expectedSandboxExecution = {
      execution_substrate: 'external_sandbox',
      provider_kind: 'e2b',
      sandbox_id: 'sandbox_temporal_summary_test',
      sandbox_domain: 'sandbox.e2b.test',
      sandbox_reuse: 'created',
      template: 'codex-template',
      image: null,
      container_name: null,
      sandbox_workspace_root: '/home/user/workspace',
      workspace_transport: {
        transport_kind: 'git_clone',
        repo_url: 'https://github.com/example/domain.git',
        checkout_ref: 'abc123',
        clone_exit_code: 0,
        checkout_exit_code: 0,
      },
      command_exit_code: 130,
      jsonl_stdout_bytes: 1024,
      diff_refs: {
        changed_file_refs: ['artifacts/stage-output.json'],
        diff_stat: [' artifacts/stage-output.json | 1 +'],
      },
      external_api_called: true,
      docker_cli_called: false,
      credential_material_logged: false,
      host_workspace_mutated: false,
      forwarded_env_keys: ['OPL_STAGE_PACKET_REF'],
    };
    assert.deepEqual(codexEvent.process_output_summary.sandbox_execution, expectedSandboxExecution);
    assert.deepEqual(codexEvent.process_output_summary.external_sandbox_execution, expectedSandboxExecution);
    assert.deepEqual(codexEvent.progress_summary.runner_events, [{
      event_kind: 'agent_message',
      value: '[omitted:4000 chars]',
    }]);
    assert.equal(codexEvent.provider_blocker.blocked_reason, 'codex_cli_activity_cancelled');
    assert.equal(JSON.stringify(codexEvent).includes('must-not-enter-workflow-history'), false);
    assert.equal(JSON.stringify(codexEvent).includes('xxxx'), false);
    assert.equal(JSON.stringify(codexEvent).includes('yyyy'), false);

    const dispatchEvent = result.activity_events.find(
      (event) => event.activity_kind === 'domain_handler_dispatch_activity',
    );
    assert.equal(dispatchEvent?.activity_status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'codex_cli_activity_cancelled');
    assert.deepEqual(result.closeout_refs, [
      'opl://stage-attempts/sat_temporal_test/runtime-blockers/codex_cli_activity_cancelled',
    ]);
    assert.equal(result.completion_boundary.provider_completion, 'not_completed');
    assert.equal(result.completion_boundary.provider_completion_is_domain_ready, false);
    assert.equal(
      (dispatchEvent?.route_impact as Record<string, unknown>)?.runtime_blocker_is_domain_owner_answer,
      false,
    );
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal Codex activity summary projects local sandbox execution refs', () => {
  const codexEvent = codexActivityEventForTemporalHistory({
    process_output_summary: {
      exit_code: 0,
      final_message_chars: 128,
      sandbox_execution: {
        execution_substrate: 'local_sandbox',
        provider_kind: 'local_devcontainer',
        image: 'opl/devcontainer-codex:test',
        container_name: 'opl-stage-test',
        sandbox_workspace_root: '/workspace/stage',
        workspace_transport: {
          transport_kind: 'git_clone',
          repo_url: 'https://github.com/example/domain.git',
          checkout_ref: 'abc123',
          clone_exit_code: 0,
          checkout_exit_code: 0,
        },
        command_exit_code: 0,
        jsonl_stdout_bytes: 256,
        diff_refs: {
          changed_file_refs: ['artifacts/local-stage-output.json'],
          diff_stat: [' artifacts/local-stage-output.json | 1 +'],
        },
        external_api_called: false,
        docker_cli_called: true,
        credential_material_logged: false,
        host_workspace_mutated: false,
        forwarded_env_keys: ['OPL_STAGE_PACKET_REF'],
      },
    },
    progress_summary: {
      runner_events: [],
    },
  });

  assert.ok(codexEvent.process_output_summary?.sandbox_execution);
  const sandboxExecution = codexEvent.process_output_summary.sandbox_execution;
  assert.equal(sandboxExecution.provider_kind, 'local_devcontainer');
  assert.equal(sandboxExecution.docker_cli_called, true);
  assert.equal(sandboxExecution.external_api_called, false);
  assert.equal(sandboxExecution.host_workspace_mutated, false);
  assert.equal(codexEvent.process_output_summary.external_sandbox_execution, undefined);
});

