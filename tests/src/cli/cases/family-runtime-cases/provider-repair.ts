import { spawnSync } from 'node:child_process';

import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  cliPath,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../../helpers.ts';
import { createDispatchFixture, familyRuntimeEnv } from './helpers.ts';

test('family-runtime local provider status does not inspect a bad Hermes binary path', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-local-provider-'));
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'local_sqlite'],
      familyRuntimeEnv(stateRoot, {
        OPL_HERMES_BIN: path.join(stateRoot, 'missing-hermes'),
      }),
    );

    assert.equal(output.family_runtime.configured_provider, 'local_sqlite');
    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(output.family_runtime.readiness.diagnostic_provider_ready, true);
    assert.equal(output.family_runtime.readiness.full_online_ready, false);
    assert.equal(output.family_runtime.readiness.durable_online_ready, false);
    assert.equal(output.family_runtime.readiness.degraded, true);
    assert.equal(output.family_runtime.readiness.degraded_reason, 'local_sqlite_is_dev_ci_offline_only');
    assert.equal(output.family_runtime.readiness.local_sqlite_is_dev_ci_offline_only, true);
    assert.equal(output.family_runtime.readiness.local_sqlite_counts_as_provider_ready, false);
    assert.equal(output.family_runtime.readiness.selected_provider_can_replace_domain_daemons, false);
    assert.equal(output.family_runtime.periodic_execution.status, 'dev_offline_provider_cannot_replace_domain_daemons');
    assert.equal(output.family_runtime.periodic_execution.local_sqlite_role, 'dev_ci_offline_diagnostic_baseline_only');
    assert.equal(output.family_runtime.periodic_execution.blocker.blocker_id, 'local_sqlite_is_dev_ci_offline_only');
    assert.equal(output.family_runtime.provider_runtime.providers.local_sqlite.ready, true);
    assert.equal(output.family_runtime.provider_runtime.providers.local_sqlite.details.diagnostic_ready, true);
    assert.equal(
      output.family_runtime.provider_runtime.providers.local_sqlite.details.provider_ready_counts_as_online_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime doctor degrades explicit local sqlite because it cannot replace domain daemons', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-local-doctor-'));
  try {
    const output = runCli(
      ['family-runtime', 'doctor', '--provider', 'local_sqlite'],
      familyRuntimeEnv(stateRoot),
    );

    assert.equal(output.family_runtime_doctor.doctor_status, 'degraded');
    assert.deepEqual(output.family_runtime_doctor.blockers, ['local_sqlite_is_dev_ci_offline_only']);
    assert.equal(output.family_runtime_doctor.status.readiness.provider_ready, false);
    assert.equal(output.family_runtime_doctor.status.readiness.diagnostic_provider_ready, true);
    assert.equal(output.family_runtime_doctor.status.readiness.full_online_ready, false);
    assert.equal(
      output.family_runtime_doctor.status.readiness.selected_provider_can_replace_domain_daemons,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal provider reports landed code separately from live runtime readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-provider-'));
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );
    const provider = output.family_runtime.provider_runtime.providers.temporal;

    assert.equal(output.family_runtime.configured_provider, 'temporal');
    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(provider.status, 'provider_code_landed_unconfigured');
    assert.equal(provider.ready, false);
    assert.equal(provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(provider.details.adapter_mode, 'provider_code_landed_unconfigured');
    assert.equal(provider.capabilities.includes('stage_attempt_workflow_provider_code'), true);
    assert.equal(provider.details.worker_readiness.surface_kind, 'temporal_worker_lifecycle_status');
    assert.equal(provider.details.worker_readiness.readiness_status, 'not_configured');
    assert.equal(provider.details.worker_readiness.visibility_readiness, null);
    assert.deepEqual(provider.details.worker_readiness.blockers, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime status flags local queue lifecycle truth when Temporal is selected', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-queue-boundary-'));
  const dispatch = createDispatchFixture(`
printf '{"accepted":false,"error":"planned local queue retry"}\\n'
exit 1
`);
  try {
    const localEnv = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
      OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: dispatch.dispatchPath,
    });
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage-attempt/closeout',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:test:temporal-queue-boundary',
    ], localEnv);
    runCli(['family-runtime', 'tick', '--source', 'test'], localEnv);

    const temporalEnv = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    const queue = runCli(['family-runtime', 'queue', 'list'], temporalEnv);
    const status = runCli(['family-runtime', 'status', '--provider', 'temporal'], temporalEnv);

    assert.equal(queue.family_runtime_queue.queue.by_status.retry_waiting, 1);
    assert.equal(queue.family_runtime_queue.queue_lifecycle_boundary.gate.status, 'attention_needed');
    assert.equal(queue.family_runtime_queue.queue_lifecycle_boundary.gate.temporal_migration_required, true);
    assert.deepEqual(
      queue.family_runtime_queue.queue_lifecycle_boundary.gate.required_evidence,
      [
        'workflow_id',
        'temporal_workflow_history_or_query_readback',
        'stage_attempt_identity',
        'temporal_retry_policy_readback_for_attempt_budget',
        'temporal_activity_failure_or_dead_letter_history', // reuse-first: allow Temporal-owned dead-letter evidence vocabulary.
        'authority_event_ref_or_projection_rebuild_ref',
        'operator_projection_repair_or_retirement_receipt',
      ],
    );
    assert.deepEqual(
      queue.family_runtime_queue.queue_lifecycle_boundary.gate.allowed_readbacks,
      [
        'opl family-runtime queue list --json',
        'opl family-runtime queue inspect <task_id> --json',
        'opl runway reconcile --json',
      ],
    );
    assert.equal(queue.family_runtime_queue.queue_lifecycle_boundary.gate.scheduler_mutation_allowed, false);
    assert.equal(queue.family_runtime_queue.queue_lifecycle_boundary.gate.domain_progress_claim_allowed, false);
    assert.equal(queue.family_runtime_queue.queue_lifecycle_boundary.gate.ready_claim_allowed, false);
    assert.equal(
      queue.family_runtime_queue.queue_lifecycle_boundary.temporal_durable_lifecycle_handoff.allowed_local_action,
      'read_projection_and_emit_operator_handoff_only',
    );
    assert.equal(queue.family_runtime_queue.queue_lifecycle_boundary.gate.competing_task_count, 1);
    const competingTask = queue.family_runtime_queue.queue_lifecycle_boundary.gate.competing_tasks[0];
    assert.equal(
      competingTask.status,
      'retry_waiting',
    );
    assert.equal(typeof competingTask.attempts, 'number');
    assert.equal(competingTask.max_attempts, 3); // reuse-first: allow local max_attempts vocabulary boundary.
    assert.equal(competingTask.lease, null);
    assert.equal(competingTask.dead_letter_reason, null); // reuse-first: allow local dead-letter vocabulary boundary.
    assert.equal(competingTask.projection_handoff.allowed_local_action, 'read_projection_and_emit_operator_handoff_only');
    assert.equal(competingTask.projection_handoff.scheduler_mutation_allowed, false);
    assert.equal(competingTask.projection_handoff.domain_progress_claim_allowed, false);
    runCli([
      'family-runtime',
      'queue',
      'retire',
      '--domain',
      'medautogrant',
      '--task-kind',
      'stage-attempt/closeout',
      '--reason',
      'temporal_history_replaces_local_lifecycle_truth',
    ], temporalEnv);
    const retiredQueue = runCli(['family-runtime', 'queue', 'list'], temporalEnv);

    assert.equal(retiredQueue.family_runtime_queue.queue.by_status.blocked, 1);
    assert.equal(
      retiredQueue.family_runtime_queue.queue_lifecycle_boundary.gate.competing_statuses.includes('blocked'),
      true,
    );
    assert.equal(
      retiredQueue.family_runtime_queue.queue_lifecycle_boundary.gate.competing_tasks[0].status,
      'blocked',
    );
    assert.equal(status.family_runtime.readiness.queue_truth_competes_with_temporal, true);
    assert.equal(
      status.family_runtime.queue_lifecycle_boundary.gate.reason,
      'local_sqlite_task_lifecycle_status_without_temporal_stage_attempt',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal provider repair installs visibility Search Attributes when service is reachable', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-provider-repair-'));
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const testEnv = await TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [],
    },
  });
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      cliPath,
      'family-runtime',
      'repair',
      '--provider',
      'temporal',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: testEnv.address,
        OPL_TEMPORAL_NAMESPACE: testEnv.namespace ?? 'default',
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout); // reuse-first: allow CLI stdout JSON parser in migrated test case.
    const repair = output.family_runtime_provider.temporal_visibility_repair;
    const workerRepair = output.family_runtime_provider.temporal_worker_repair;
    assert.equal(repair.surface_kind, 'temporal_visibility_repair_receipt');
    assert.equal(repair.repair_status, 'ready');
    assert.equal(workerRepair.trigger, 'provider_repair');
    assert.equal(workerRepair.repair_status, 'skipped');
    assert.equal(workerRepair.authority_boundary.can_write_domain_truth, false);
    assert.deepEqual(repair.installed_search_attributes, [
      'OplStageAttemptId',
      'OplDomainId',
      'OplStageId',
      'OplAttemptStatus',
      'OplStagePhase',
      'OplBlockedReason',
      'OplTaskId',
      'OplSourceFingerprint',
      'OplExecutorKind',
    ]);
    assert.equal(repair.visibility_readiness.readiness_status, 'ready');
    assert.equal(fs.existsSync(queueDb), true);
  } finally {
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
