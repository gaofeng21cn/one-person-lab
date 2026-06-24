import { spawnSync } from 'node:child_process';

import { SearchAttributeType } from '@temporalio/common';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../../../src/family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowInputForTest,
  startTemporalStageAttemptWorkflow,
} from '../../../../src/family-runtime-temporal-provider.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-task-queue.ts';
import {
  CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from '../../../../src/family-runtime-temporal-constants.ts';
import { buildTemporalStageAttemptWorkflowInput } from '../../../../src/family-runtime-temporal.ts';
import { runFamilyRuntime } from '../../../../src/family-runtime.ts';
import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import {
  assertProviderReadinessCurrentness,
  buildTemporalStartManifest,
  createTemporalCloseoutCodexFixture,
  type TemporalStageAttemptCreateOutput,
  type TemporalStageAttemptQueryOutput,
} from './family-runtime-stage-attempts-temporal-provider-fixtures.ts';
import './family-runtime-stage-attempts-temporal-provider-cases/current-provider-readiness.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function createSearchableTemporalTestEnvironment() {
  return TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [
        { name: 'OplStageAttemptId', type: SearchAttributeType.KEYWORD },
        { name: 'OplDomainId', type: SearchAttributeType.KEYWORD },
        { name: 'OplStageId', type: SearchAttributeType.KEYWORD },
        { name: 'OplAttemptStatus', type: SearchAttributeType.KEYWORD },
        { name: 'OplStagePhase', type: SearchAttributeType.KEYWORD },
        { name: 'OplBlockedReason', type: SearchAttributeType.KEYWORD },
        { name: 'OplTaskId', type: SearchAttributeType.KEYWORD },
        { name: 'OplSourceFingerprint', type: SearchAttributeType.KEYWORD },
        { name: 'OplExecutorKind', type: SearchAttributeType.KEYWORD },
      ],
    },
  });
}

function writeReadyTemporalWorkerFixture(input: {
  runtimeRoot: string;
  address: string;
  namespace: string;
  taskQueue: string;
  sourceVersion: string;
}) {
  fs.writeFileSync(path.join(input.runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
    provider_kind: 'temporal',
    pid: process.pid,
    address: input.address,
    namespace: input.namespace,
    task_queue: input.taskQueue,
    started_at: new Date().toISOString(),
    status: 'ready',
    source_version: input.sourceVersion,
    workflow_bundle_path: path.join(input.runtimeRoot, 'test-workflow-bundle.js'),
    workflow_bundle_version: `test-bundle:${input.sourceVersion}`,
    workflow_bundle_source_version: input.sourceVersion,
  }, null, 2)}\n`);
}

test('family-runtime temporal attempt start fails closed when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-start-missing-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stageId = 'direction_and_route_selection';
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(buildTemporalStartManifest(stageId)),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      stageId,
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--checkpoint-ref',
      'packet:direction-and-route-selection',
      '--start',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);
    const attempts = runCli(
      ['family-runtime', 'attempt', 'list'],
      familyRuntimeEnv(stateRoot, { OPL_CONTRACTS_DIR: fixtureContractsRoot }),
    );

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.match(output.error.message, /OPL_TEMPORAL_ADDRESS/);
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 1);
    assert.equal(attempts.family_runtime_stage_attempts.attempts[0].provider_kind, 'temporal');
    assert.equal(attempts.family_runtime_stage_attempts.attempts[0].status, 'queued');
    assert.equal(attempts.family_runtime_stage_attempts.attempts[0].blocked_reason, null);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal workflow input carries checkpoint stage packet and live Codex runner mode', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-input-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/dm-cvd"}',
      '--executor-kind',
      'codex_cli',
      '--source-fingerprint',
      'truth-snapshot::dm002-dispatch',
      '--checkpoint-ref',
      'studies/002-dm/prompt.json',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;
    const input = buildTemporalStageAttemptWorkflowInput(created.family_runtime_stage_attempt.attempt);

    assert.equal(input.stage_packet_ref, 'studies/002-dm/prompt.json');
    assert.deepEqual(input.checkpoint_refs, ['studies/002-dm/prompt.json']);
    assert.equal(input.codex_stage_runner?.runner_mode, 'codex_cli');
    assert.equal(input.codex_stage_runner?.timeout_ms, 3_600_000);
    assert.equal(input.workspace_locator.workspace_root, '/tmp/dm-cvd');
    assert.equal(input.opl_execution_authorization?.provider_attempt_ref, `temporal://attempt/${created.family_runtime_stage_attempt.attempt.stage_attempt_id}`);
    assert.equal(input.opl_execution_authorization?.attempt_lease_status, 'active');
    assert.equal(input.opl_execution_authorization?.source_fingerprint, 'truth-snapshot::dm002-dispatch');
    assert.equal(input.opl_execution_authorization?.workspace_scope_ref, 'workspace:/tmp/dm-cvd');
    assert.equal(input.opl_execution_authorization?.artifact_scope_ref, 'stage-packet:studies/002-dm/prompt.json');
    assert.equal(input.opl_execution_authorization?.stage_run_id, 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch');
    assert.equal(input.opl_execution_authorization?.authority_boundary.opl_can_create_owner_receipt, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal workflow input does not authorize launch without source fingerprint', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-input-no-auth-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/dm-cvd"}',
      '--executor-kind',
      'codex_cli',
      '--checkpoint-ref',
      'studies/002-dm/prompt.json',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;
    const input = buildTemporalStageAttemptWorkflowInput(created.family_runtime_stage_attempt.attempt);

    assert.equal(input.opl_execution_authorization, undefined);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick starts MAS default executor dispatch as Temporal Codex writer workflow', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-default-start-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createSearchableTemporalTestEnvironment();
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION,
    OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY: process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY,
  };

  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    const taskQueue = resolveTemporalWorkerTaskQueue({ root: runtimeRoot });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: process.pid,
      address: testEnv.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'temporal test server',
    }, null, 2)}\n`);
    writeReadyTemporalWorkerFixture({
      runtimeRoot,
      address: testEnv.address,
      namespace: testEnv.namespace ?? 'default',
      taskQueue,
      sourceVersion: 'git:mas-default-start-current',
    });
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async () => ({
          status: 'checkpointed',
          checkpoint_refs: ['checkpoint:mas-default-writer-start'],
        }),
      },
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:mas-default-start-current';
    process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY = '1';

    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueue = await runFamilyRuntime([
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        source_fingerprint: 'truth-snapshot::dm002-temporal-start',
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:temporal-start',
    ]) as { family_runtime_enqueue: { task: { task_id: string } } };
    const taskId = enqueue.family_runtime_enqueue.task.task_id;

    const result = await worker.runUntil(async () => {
      const result = await runFamilyRuntime(['tick', '--source', 'test']) as unknown as {
        family_runtime_tick: {
          dispatches: Array<{
            status: string;
            temporal_start: {
              surface_kind: string;
              task_queue: string;
              execution_authorization_ledger_record: {
                status: string;
              };
              execution_authorization_receipt_refs: string[];
            };
            admitted_stage_attempt: { workflow_id: string; stage_attempt_id: string };
          }>;
        };
      };
      const startedAttempt = result.family_runtime_tick.dispatches[0].admitted_stage_attempt;
      await testEnv.sleep('2s');
      assert.ok(startedAttempt.stage_attempt_id);
      const task = await runFamilyRuntime(['queue', 'inspect', taskId]) as unknown as {
        family_runtime_task: {
          task: {
            status: string;
            last_error: string | null;
            dead_letter_reason: string | null;
          };
          events: Array<{
            event_type: string;
            payload: Record<string, unknown>;
          }>;
          stage_attempts: Array<{
            status: string;
            blocked_reason: string | null;
            provider_kind: string;
            executor_kind: string;
            stage_id: string;
            provider_run: {
              provider_status: string;
            };
            closeout_receipt_status: string;
            checkpoint_refs: string[];
          }>;
        };
      };
      return { tick: result, task, startedAttempt };
    });
    const { tick, task, startedAttempt } = result;
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'running');
    assert.equal(tick.family_runtime_tick.dispatches[0].temporal_start.surface_kind, 'temporal_stage_attempt_start_receipt');
    assert.equal(tick.family_runtime_tick.dispatches[0].temporal_start.task_queue, taskQueue);
    assert.equal(
      tick.family_runtime_tick.dispatches[0].temporal_start.execution_authorization_ledger_record.status,
      'recorded',
    );
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'typed_closeout_packet_required');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_not_completed');
    assert.equal(
      task.family_runtime_task.events.some((event) => (
        event.event_type === 'stage_attempt_terminal_blocked_task'
        && event.payload.reason === 'typed_closeout_packet_required'
      )),
      true,
    );
    assert.equal(attempt.status, 'blocked');
    assert.equal(attempt.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
    assert.equal(attempt.provider_run.provider_status, 'blocked');
    const authorizationLedger = runCli([
      'runtime',
      'stage-run-authorization',
      'list',
    ], familyRuntimeEnv(stateRoot)) as unknown as {
      stage_run_execution_authorization_ledger: {
        receipt_count: number;
        verified_receipt_count: number;
        receipts: Array<{
          stage_attempt_id: string | null;
          attempt_lease_status: string;
          execution_authorization_report: {
            status: string;
            execution_authorized: boolean;
          };
        }>;
      };
    };
    const authorizationReceipt =
      authorizationLedger.stage_run_execution_authorization_ledger.receipts.find(
        (receipt) => receipt.stage_attempt_id === startedAttempt.stage_attempt_id,
      );
    assert.ok(authorizationReceipt);
    assert.equal(
      authorizationReceipt.execution_authorization_report.status,
      'authorized',
    );
    assert.equal(authorizationReceipt.execution_authorization_report.execution_authorized, true);
    assert.equal(authorizationReceipt.attempt_lease_status, 'active');
    assert.equal(attempt.closeout_receipt_status, null);
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue inspect syncs a completed MAS default executor Temporal closeout', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-default-completed-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createSearchableTemporalTestEnvironment();
  const taskQueue = `opl-stage-mas-default-completed-${Date.now()}`;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION,
    OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY: process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY,
  };

  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: process.pid,
      address: testEnv.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'temporal test server',
    }, null, 2)}\n`);
    writeReadyTemporalWorkerFixture({
      runtimeRoot,
      address: testEnv.address,
      namespace: testEnv.namespace ?? 'default',
      taskQueue,
      sourceVersion: 'git:mas-default-completed-current',
    });
    const closeoutRefs = [
      'artifacts/supervision/reconcile/latest.json',
      'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
    ];
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async () => ({
          status: 'checkpointed',
          checkpoint_refs: ['checkpoint:mas-default-writer-start'],
          closeout_packet: {
            surface_kind: 'domain_stage_closeout_packet',
            closeout_refs: closeoutRefs,
            consumed_refs: ['dispatch:mas-default-writer-start'],
            writeback_receipt_refs: ['receipt:writer-handoff'],
            next_owner: 'medautoscience',
            domain_ready_verdict: 'domain_gate_pending',
          },
        }),
      },
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:mas-default-completed-current';
    process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY = '1';

    const dispatchRef = 'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueue = await runFamilyRuntime([
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        source_fingerprint: 'truth-snapshot::dm002-temporal-completed',
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:completed',
    ]) as { family_runtime_enqueue: { task: { task_id: string } } };
    const taskId = enqueue.family_runtime_enqueue.task.task_id;

    const result = await worker.runUntil(async () => {
      const result = await runFamilyRuntime(['tick', '--source', 'test']) as unknown as {
        family_runtime_tick: {
          dispatches: Array<{
            status: string;
            temporal_start: { surface_kind: string };
            admitted_stage_attempt: { stage_attempt_id: string };
          }>;
        };
      };
      await testEnv.sleep('2s');
      const task = await runFamilyRuntime(['queue', 'inspect', taskId]) as unknown as {
        family_runtime_task: {
          task: {
            status: string;
            last_error: string | null;
            dead_letter_reason: string | null;
          };
          app_operator_drilldown_ref?: string;
          stage_attempts: Array<{
            stage_attempt_id: string;
            status: string;
            closeout_refs: string[];
            closeout_receipt_status: string;
            provider_run: { provider_status: string };
            route_impact: { domain_ready_verdict?: string };
            stage_progress_log?: Record<string, any>;
            attempt_true_path_proof?: Record<string, any>;
          }>;
        };
      };
      return { tick: result, task };
    });
    const { tick, task } = result;
    const attempt = task.family_runtime_task.stage_attempts[0];
      const query = await runFamilyRuntime(['attempt', 'query', attempt.stage_attempt_id]) as unknown as TemporalStageAttemptQueryOutput;
    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const queryProjection = query.family_runtime_stage_attempt_query.stage_attempt_query;

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'running');
    assert.equal(task.family_runtime_task.task.status, 'succeeded');
    assert.equal(task.family_runtime_task.task.last_error, null);
    assert.equal(task.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempt.status, 'completed');
    assert.deepEqual(attempt.closeout_refs, closeoutRefs);
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(attempt.provider_run.provider_status, 'completed');
    assert.equal(attempt.route_impact.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(attempt.stage_progress_log?.surface_kind, 'opl_stage_progress_log');
    assert.equal(
      attempt.stage_progress_log?.temporal_visibility.visibility_readiness.readiness_status,
      'ready',
    );
    assert.equal(queryProjection.stage_progress_log.temporal_visibility.visibility_readiness.readiness_status, 'ready');
    assert.equal(
      queryProjection.operator_visibility.current_provider_readiness?.surface_kind,
      'stage_attempt_current_provider_readiness',
    );
    assert.equal(
      queryProjection.operator_visibility.current_provider_readiness?.provider_receipt_is_creation_time_snapshot,
      true,
    );
    assertProviderReadinessCurrentness(queryProjection.operator_visibility.provider_readiness_currentness);
    assert.equal(
      queryProjection.observability_slo.provider_readiness?.surface_kind,
      'stage_attempt_current_provider_readiness',
    );
    assert.equal(queryProjection.attempt_true_path_proof.surface_kind, 'opl_stage_attempt_true_path_proof');
    assert.equal(queryProjection.attempt_true_path_proof.proof_status, 'observed');
    assert.equal(queryProjection.attempt_true_path_proof.same_attempt_refs.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(queryProjection.attempt_true_path_proof.same_attempt_refs.task_id, taskId);
    assert.equal(
      queryProjection.attempt_true_path_proof.surfaces.queue_inspect_ref,
      `/family_runtime_task/${taskId}/stage_attempts/${attempt.stage_attempt_id}`,
    );
    assert.equal(
      queryProjection.attempt_true_path_proof.surfaces.app_drilldown_ref,
      `/runtime_tray_snapshot/app_operator_drilldown/stage_attempts/${attempt.stage_attempt_id}`,
    );
    assert.equal(queryProjection.attempt_true_path_proof.authority_boundary.can_claim_domain_ready, false);
    assert.equal(queryProjection.attempt_true_path_proof.authority_boundary.can_claim_long_soak, false);
    assert.equal(
      attempt.attempt_true_path_proof?.same_attempt_refs.stage_attempt_id,
      queryProjection.attempt_true_path_proof.same_attempt_refs.stage_attempt_id,
    );
    assert.equal(
      drilldown.attempt_true_path_proofs.some((proof: Record<string, any>) =>
        proof.same_attempt_refs.stage_attempt_id === attempt.stage_attempt_id
        && proof.same_attempt_refs.task_id === taskId
        && proof.surfaces.temporal_webui_ref === queryProjection.attempt_true_path_proof.surfaces.temporal_webui_ref
      ),
      true,
    );
    assert.equal(
      drilldown.stage_progress_log.temporal_visibility_readiness_statuses.includes('ready'),
      true,
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime Temporal start fails closed when visibility cannot be inspected', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-visibility-inspect-fail-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-visibility-fail-${Date.now()}`;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY: process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY,
  };

  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: process.pid,
      address: testEnv.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'temporal test server',
    }, null, 2)}\n`);
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    delete process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY;

    const created = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--checkpoint-ref',
      'packet:visibility-fail',
    ]) as TemporalStageAttemptCreateOutput;
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const start = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'start',
      attemptId,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    const output = JSON.parse(start.stdout || start.stderr);

    assert.notEqual(start.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.match(output.error.message, /Search Attributes could not be inspected/);
    assert.match(output.error.details.error, /ListSearchAttributes/);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt start blocks live Codex without stage packet', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-missing-packet-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/dm-cvd"}',
      '--executor-kind',
      'codex_cli',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;
    const failure = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'start',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
        OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(failure.stdout || failure.stderr);

    assert.notEqual(failure.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.equal(output.error.details.blocked_reason, 'codex_cli_stage_packet_ref_missing');
    assert.match(output.error.message, /stage packet ref/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt query keeps local ledger readable when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-query-missing-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], {
      ...familyRuntimeEnv(stateRoot),
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    assert.equal(query.family_runtime_stage_attempt_query.stage_attempt_query.attempt.stage_attempt_id, attemptId);
    const timeoutPolicy = query.family_runtime_stage_attempt_query
      .stage_attempt_query.operator_visibility.codex_stage_activity_timeout_policy;
    assert.ok(timeoutPolicy);
    assert.equal(timeoutPolicy.start_to_close_timeout, CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT);
    assert.equal(timeoutPolicy.heartbeat_timeout, CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT);
    assert.equal(timeoutPolicy.heartbeat_interval_ms, DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS);
    assert.equal(timeoutPolicy.runner_timeout_ms, DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS);
    assert.equal(timeoutPolicy.runner_no_output_timeout_ms, DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS);
    assert.equal(query.family_runtime_stage_attempt_query.temporal_query.status, 'unavailable');
    assert.equal(
      query.family_runtime_stage_attempt_query.temporal_query.reason,
      'temporal_address_not_configured',
    );
    assert.equal(
      query.family_runtime_stage_attempt_query.temporal_query.authority_boundary.opl,
      'local_stage_attempt_ledger_projection_only',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt query reads managed local service state when env address is absent', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-query-managed-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createSearchableTemporalTestEnvironment();
  const taskQueue = `opl-stage-query-managed-${Date.now()}`;
  const { fixtureRoot: codexFixtureRoot, codexPath } = createTemporalCloseoutCodexFixture(
    ['receipt:managed-query'],
  );
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
    OPL_CODEX_BIN: process.env.OPL_CODEX_BIN,
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION,
  };

  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: process.pid,
      address: testEnv.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'temporal test server',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: process.pid,
      address: testEnv.address,
      namespace: testEnv.namespace,
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:query-managed-current',
    }, null, 2)}\n`);

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:query-managed-current';
    process.env.OPL_CODEX_BIN = codexPath;
    const created = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--checkpoint-ref',
      'checkpoint:managed-query',
    ]) as TemporalStageAttemptCreateOutput;
    const attempt = created.family_runtime_stage_attempt.attempt;

    const result = await worker.runUntil(async () => {
      const input = buildTemporalStageAttemptWorkflowInputForTest({
        ...attempt,
        task_id: attempt.task_id ?? 'task-managed-query',
        stage_packet_ref: 'packet:managed-query',
        checkpoint_refs: ['checkpoint:managed-query'],
        closeout_packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: ['receipt:managed-query'],
          consumed_refs: ['evidence:managed-query'],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: { decision: 'managed_query_test' },
        },
      });
      const handle = await testEnv.client.workflow.start('StageAttemptWorkflow', {
        args: [input],
        taskQueue,
        workflowId: attempt.workflow_id,
      });
      const query: TemporalStageAttemptQueryOutput =
        await runFamilyRuntime(['attempt', 'query', attempt.stage_attempt_id]) as unknown as TemporalStageAttemptQueryOutput;
      await handle.result();
      return query;
    });

    const temporalQuery = result.family_runtime_stage_attempt_query.temporal_query;

    assert.equal(temporalQuery.surface_kind, 'temporal_stage_attempt_query_receipt');
    assert.equal(temporalQuery.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(temporalQuery.workflow_id, attempt.workflow_id);
    assert.ok(temporalQuery.query);
    assert.equal(['registered', 'running', 'checkpointed', 'completed'].includes(temporalQuery.query.status), true);
    assert.equal(temporalQuery.query.provider_kind, 'temporal');
    const stageProgressLog = result.family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log;
    assert.equal(stageProgressLog.surface_kind, 'opl_stage_progress_log');
    assert.equal(stageProgressLog.temporal_visibility.surface_kind, 'temporal_stage_attempt_visibility');
    assert.equal(stageProgressLog.temporal_visibility.workflow_id, attempt.workflow_id);
    assert.deepEqual(stageProgressLog.temporal_visibility.search_attribute_refs, [
      'temporal-search-attribute:OplStageAttemptId',
      'temporal-search-attribute:OplDomainId',
      'temporal-search-attribute:OplStageId',
      'temporal-search-attribute:OplAttemptStatus',
      'temporal-search-attribute:OplStagePhase',
      'temporal-search-attribute:OplBlockedReason',
      'temporal-search-attribute:OplTaskId',
      'temporal-search-attribute:OplSourceFingerprint',
      'temporal-search-attribute:OplExecutorKind',
    ]);
    assert.equal(stageProgressLog.temporal_webui_ref.surface_kind, 'temporal_webui_ref');
    assert.equal(stageProgressLog.temporal_webui_ref.ref_role, 'operator_debug_link_only');
    assert.equal(
      result.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility
        .stage_progress_log.temporal_webui_ref.workflow_id,
      attempt.workflow_id,
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt start uses managed worker task queue for explicit state root', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-start-managed-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createSearchableTemporalTestEnvironment();
  const { fixtureRoot: codexFixtureRoot, codexPath } = createTemporalCloseoutCodexFixture(
    ['receipt:managed-start'],
  );
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
    OPL_CODEX_BIN: process.env.OPL_CODEX_BIN,
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION,
  };

  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    const managedTaskQueue = resolveTemporalWorkerTaskQueue({ root: runtimeRoot });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: process.pid,
      address: testEnv.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'temporal test server',
    }, null, 2)}\n`);
    writeReadyTemporalWorkerFixture({
      runtimeRoot,
      address: testEnv.address,
      namespace: testEnv.namespace ?? 'default',
      taskQueue: managedTaskQueue,
      sourceVersion: 'git:start-managed-current',
    });

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue: managedTaskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = '';
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:start-managed-current';
    process.env.OPL_CODEX_BIN = codexPath;
    const created = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--checkpoint-ref',
      'checkpoint:managed-start',
    ]) as TemporalStageAttemptCreateOutput;
    const attempt = created.family_runtime_stage_attempt.attempt;

    const receipt = await worker.runUntil(async () => startTemporalStageAttemptWorkflow(attempt, {
      paths: { root: runtimeRoot },
    }));

    assert.equal(receipt.task_queue, managedTaskQueue);
    assert.notEqual(receipt.task_queue, 'opl-stage-attempts');
    assert.equal(receipt.visibility_readiness.task_queue, managedTaskQueue);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});
