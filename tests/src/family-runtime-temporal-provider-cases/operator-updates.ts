import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Worker } from '@temporalio/worker';

import * as activities from '../../../src/modules/runway/family-runtime-temporal-activities.ts';
import { signalTemporalStageAttemptWorkflow } from '../../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from '../../../src/modules/runway/family-runtime-temporal.ts';
import {
  stageAttemptQuery,
  StageAttemptWorkflow,
  stageAttemptOperatorUpdate,
  resumeSignal,
} from '../../../src/modules/runway/family-runtime-temporal-workflows.ts';
import { createTemporalTestWorkflowEnvironment } from '../temporal-test-environment.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function workflowInput(): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: 'sat_temporal_update',
    workflow_id: 'wf_temporal_update',
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
    workspace_locator: { workspace_root: '/tmp/redcube-runtime' },
    source_fingerprint: 'sha256:operator-update',
    executor_kind: 'codex_cli',
    retry_budget: {},
    task_id: 'task-temporal-update',
    stage_packet_ref: 'packet:artifact-creation',
    checkpoint_refs: ['checkpoint:seed'],
    codex_stage_runner: { runner_mode: 'dry_run' },
    closeout_packet: {
      surface_kind: 'stage_memory_closeout_packet',
      closeout_refs: ['receipt:domain-closeout'],
      next_owner: 'redcube',
      domain_ready_verdict: 'domain_gate_pending',
    },
  };
}

function qualityWorkflowInput(): TemporalStageAttemptWorkflowInput {
  return {
    ...workflowInput(),
    stage_attempt_id: 'sat_temporal_quality_update',
    workflow_id: 'wf_temporal_quality_update',
    stage_run_id: 'sr_temporal_quality_update',
    stage_run_content_binding_version: 'opl-stage-run-attempt-content-binding.v1',
    quality_cycle_id: 'sqc_temporal_quality_update',
    attempt_role: 'producer',
    quality_round_index: 0,
    quality_rubric_refs: ['agent/quality_gates/stage.md'],
    quality_role_prompt_ref: 'agent/prompts/stage-quality.md#producer',
    context_manifest_ref: 'opl://stage-quality-context/quality-update',
    no_context_inheritance: true,
  };
}

test('Temporal StageAttemptWorkflow acks operator actions through Updates', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-attempt-update-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [workflowInput()],
        taskQueue,
        workflowId: `wf-temporal-update-test-${Date.now()}`,
      });
      const ack = await handle.executeUpdate(stageAttemptOperatorUpdate, {
        args: [{
          signal_kind: 'human_gate',
          payload: { human_gate_ref: 'gate:update-review', reason: 'needs_review' },
          source: 'test-update',
        }],
      });
      return { ack, finalState: await handle.result() };
    });

    assert.equal(result.ack.update_status, 'accepted');
    assert.equal(result.ack.signal_kind, 'human_gate');
    assert.equal(result.ack.signal_count, 1);
    assert.deepEqual(result.finalState.human_gate_refs, ['gate:update-review']);
    assert.equal(result.finalState.signals[0].source, 'test-update');
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow rejects invalid operator Updates before mutation', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-attempt-update-reject-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [workflowInput()],
        taskQueue,
        workflowId: `wf-temporal-update-reject-test-${Date.now()}`,
      });
      await assert.rejects(
        handle.executeUpdate(stageAttemptOperatorUpdate, {
          args: [{ signal_kind: 'human_gate', payload: { reason: 'missing_ref' }, source: 'test-update' }],
        }),
        (error) => error instanceof Error
          && error.name === 'WorkflowUpdateFailedError'
          && error.cause instanceof Error
          && /human_gate update requires payload\.human_gate_ref/.test(error.cause.message),
      );
      const queriedState = await handle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery);
      return { queriedState, finalState: await handle.result() };
    });

    assert.equal(result.queriedState.signals.length, 0);
    assert.equal(result.finalState.signals.length, 0);
    assert.deepEqual(result.finalState.human_gate_refs, []);
  } finally {
    await testEnv.teardown();
  }
});

test('new quality Attempt without content binding version fails before executor activity', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-attempt-binding-reject-test-${Date.now()}`;
  let codexActivities = 0;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async () => {
          codexActivities += 1;
          return {};
        },
      },
    });
    await worker.runUntil(async () => {
      const input = qualityWorkflowInput();
      delete input.stage_run_content_binding_version;
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [input],
        taskQueue,
        workflowId: `wf-temporal-binding-reject-test-${Date.now()}`,
      });
      const result = await handle.result();
      assert.equal(result.status, 'failed');
      assert.match(result.activity_events.at(-1)?.error as string, /immutable content binding version/);
    });
    assert.equal(codexActivities, 0);
  } finally {
    await testEnv.teardown();
  }
});

test('quality Attempt rejects generic resume through public API, Update, and direct Signal', async () => {
  const input = qualityWorkflowInput();
  await assert.rejects(signalTemporalStageAttemptWorkflow({
    attempt: { ...input, provider_kind: 'temporal' },
    signalKind: 'resume',
    payload: { reason: 'must-create-new-attempt' },
  }), (error: any) => {
    assert.equal(error.details?.failure_code, 'stage_run_quality_attempt_generic_resume_forbidden');
    return true;
  });

  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-attempt-quality-resume-test-${Date.now()}`;
  let releaseActivity!: () => void;
  let markActivityStarted!: () => void;
  let dispatchActivities = 0;
  const activityStarted = new Promise<void>((resolve) => { markActivityStarted = resolve; });
  const activityReleased = new Promise<void>((resolve) => { releaseActivity = resolve; });
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async (attempt: TemporalStageAttemptWorkflowInput) => {
          markActivityStarted();
          await activityReleased;
          return {
            surface_kind: 'temporal_codex_stage_activity_receipt',
            activity_kind: 'codex_stage_activity',
            activity_status: 'completed',
            stage_attempt_id: attempt.stage_attempt_id,
            stage_id: attempt.stage_id,
            checkpoint_refs: attempt.checkpoint_refs ?? [],
            closeout_packet: attempt.closeout_packet,
          };
        },
        domainHandlerDispatchActivity: async () => {
          dispatchActivities += 1;
          return {};
        },
      },
    });
    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [input],
        taskQueue,
        workflowId: `wf-temporal-quality-resume-test-${Date.now()}`,
      });
      try {
        await activityStarted;
        await assert.rejects(handle.executeUpdate(stageAttemptOperatorUpdate, {
          args: [{
            signal_kind: 'resume',
            payload: { reason: 'must-create-new-attempt' },
            source: 'quality-resume-update-test',
          }],
        }), (error: any) => /StageRun controller must create a new Attempt/.test(
          `${error?.message ?? ''} ${error?.cause?.message ?? ''}`,
        ));
        await handle.signal(resumeSignal, {
          signal_kind: 'resume',
          payload: { reason: 'must-create-new-attempt' },
          source: 'quality-resume-signal-test',
        });
        const invalidated = await handle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery);
        assert.equal(invalidated.status, 'failed');
        releaseActivity();
        return await handle.result();
      } finally {
        releaseActivity();
      }
    });
    assert.equal(result.status, 'failed');
    const rejection = result.route_impact.generic_resume_rejection as Record<string, unknown>;
    assert.equal(rejection.failure_code, 'stage_run_quality_attempt_generic_resume_forbidden');
    assert.equal(dispatchActivities, 0);
  } finally {
    releaseActivity?.();
    await testEnv.teardown();
  }
});
