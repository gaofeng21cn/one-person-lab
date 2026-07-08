import { spawnSync } from 'node:child_process';

import { SearchAttributeType } from '@temporalio/common';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../../../src/modules/runway/family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowInputForTest,
  startTemporalStageAttemptWorkflow,
} from '../../../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';
import { buildTemporalStageAttemptWorkflowInput } from '../../../../src/modules/runway/family-runtime-temporal.ts';
import { runFamilyRuntime } from '../../../../src/modules/runway/family-runtime.ts';
import {
  assert,
  cliPath,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  parseJsonText,
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
import './family-runtime-stage-attempts-temporal-provider-cases/local-ledger-fail-closed.ts';

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
      cliPath,
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
    const output = parseJsonText(result.stdout || result.stderr) as any;
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
      cliPath,
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
    const output = parseJsonText(start.stdout || start.stderr) as any;

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

test('family-runtime temporal attempt query reads managed local service state when env address is absent', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-query-managed-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createSearchableTemporalTestEnvironment();
  const taskQueue = `opl-stage-query-managed-${Date.now()}`;
  const { fixtureRoot: codexFixtureRoot, codexPath } = createTemporalCloseoutCodexFixture(
    ['receipt:managed-query'],
  );
  const masWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-managed-query-mas-'));
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
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
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
      JSON.stringify({ workspace_root: masWorkspaceRoot }),
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
    const lifecycleReadback =
      (result.family_runtime_stage_attempt_query.stage_attempt_query as Record<string, any>)
        .temporal_durable_lifecycle_readback;

    assert.equal(temporalQuery.surface_kind, 'temporal_stage_attempt_query_receipt');
    assert.equal(temporalQuery.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(temporalQuery.workflow_id, attempt.workflow_id);
    assert.equal(lifecycleReadback.readback_status, 'bound_to_temporal_query');
    assert.equal(lifecycleReadback.workflow_history_identity.workflow_id, attempt.workflow_id);
    assert.equal(lifecycleReadback.workflow_history_identity.run_id, (temporalQuery as Record<string, any>).run_id);
    assert.equal(lifecycleReadback.schedule_identity.schedule_id, 'opl-family-runtime-provider-scheduler');
    assert.equal(lifecycleReadback.task_queue_identity.default_task_queue, taskQueue);
    assert.equal(lifecycleReadback.observed_evidence.includes('temporal_workflow_query_readback'), true);
    assert.equal(lifecycleReadback.ready_claim_allowed, false);
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
    fs.rmSync(masWorkspaceRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt start uses managed worker task queue for explicit state root', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-start-managed-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createSearchableTemporalTestEnvironment();
  const { fixtureRoot: codexFixtureRoot, codexPath } = createTemporalCloseoutCodexFixture(
    ['receipt:managed-start'],
  );
  const masWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-managed-start-mas-'));
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
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
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
      JSON.stringify({ workspace_root: masWorkspaceRoot }),
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
    fs.rmSync(masWorkspaceRoot, { recursive: true, force: true });
  }
});
