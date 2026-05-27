import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import {
  familyRuntimePaths,
} from '../../../../src/family-runtime-store.ts';
import {
  maybeRepairTemporalWorkerForProviderSlo,
} from '../../../../src/family-runtime-provider-slo-executor.ts';
import {
  buildTemporalVisibilityReadiness,
  buildTemporalWorkerLifecycleContract,
} from '../../../../src/family-runtime-temporal-provider.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function temporalWorkerStatus(status: 'worker_not_ready' | 'ready') {
  const visibilityReadiness = buildTemporalVisibilityReadiness({
    namespace: 'default',
    presentSearchAttributes: [
      'OplStageAttemptId',
      'OplDomainId',
      'OplStageId',
      'OplTaskId',
      'OplSourceFingerprint',
      'OplExecutorKind',
    ],
  });
  const lifecycle = {
    ...buildTemporalWorkerLifecycleContract(),
    task_queue: 'opl-stage-attempts',
    namespace: 'default',
  };
  return {
    surface_kind: 'temporal_worker_lifecycle_status',
    provider_kind: 'temporal',
    lifecycle_status: status,
    readiness_status: status,
    worker_ready: status === 'ready',
    server_reachable: true,
    address: '127.0.0.1:7233',
    address_source: 'managed_local_service_state',
    namespace: 'default',
    task_queue: 'opl-stage-attempts',
    default_task_queue: 'opl-stage-attempts',
    live_probe_started_worker: false,
    unreachable_reason: null,
    managed_worker_pid: status === 'ready' ? 12345 : null,
    managed_worker_state_path: '/tmp/temporal-worker.json',
    managed_worker_source_version: status === 'ready' ? 'worker-runtime:test' : null,
    expected_worker_source_version: 'worker-runtime:test',
    managed_worker_source_current: status === 'ready' ? true : null,
    managed_worker_workflow_bundle_path: status === 'ready' ? '/tmp/temporal-workflow-bundle/stage-attempt.js' : null,
    managed_worker_workflow_bundle_version: status === 'ready' ? 'workflow-bundle:sha256:test' : null,
    managed_worker_workflow_bundle_source_version: status === 'ready' ? 'worker-runtime:test' : null,
    managed_worker_workflow_bundle_source_current: status === 'ready' ? true : null,
    stale_worker_pid: null,
    temporal_service_lifecycle: {
      surface_kind: 'temporal_service_lifecycle_status',
      provider_kind: 'temporal',
      service_status: 'running',
      address: '127.0.0.1:7233',
      server_reachable: true,
    },
    visibility_readiness: visibilityReadiness,
    blockers: status === 'ready' ? [] : ['temporal_worker_not_ready'],
    repair_action: {
      surface_kind: 'temporal_worker_repair_action',
      provider_kind: 'temporal',
      action_id: status === 'ready' ? 'none' : 'start_temporal_worker',
      required_env: ['OPL_TEMPORAL_ADDRESS or managed local service state'],
      current_address: '127.0.0.1:7233',
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
      next_command: status === 'ready'
        ? 'opl family-runtime residency proof --provider temporal --production'
        : 'opl family-runtime worker start --provider temporal',
      repair_commands: {
        start_local_temporal_service:
          'opl family-runtime service start --provider temporal',
        configure_temporal_address:
          'export OPL_TEMPORAL_ADDRESS=127.0.0.1:7233',
        verify_temporal_server:
          'opl family-runtime worker status --provider temporal',
        start_managed_worker:
          'opl family-runtime worker start --provider temporal',
        rerun_production_proof:
          'opl family-runtime residency proof --provider temporal --production',
      },
    },
    lifecycle,
    authority_boundary: {
      opl: 'worker_lifecycle_readiness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

function insertProvenTemporalProofEvent(stateRoot: string) {
  runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_fresh',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    new Date().toISOString()
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

test('family-runtime provider-slo tick executes production proof when provider SLO is due', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-execute-'));
  try {
    runCli([
      'family-runtime',
      'residency',
      'proof',
      '--provider',
      'temporal',
      '--production',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }));
    const tick = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;

    assert.equal(tick.execution_status, 'executed');
    assert.equal(tick.skipped, false);
    assert.equal(tick.before.proof_slo_status, 'proof_blocker_observed');
    assert.equal(tick.provider_slo_execution_receipt.execution_status, 'executed');
    assert.equal(tick.provider_slo_execution_receipt.supervised_cadence_receipt, true);
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.repair_status, 'blocked');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.trigger, 'proof_blocker_observed');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.can_execute_domain_repair, false);
    assert.equal(tick.provider_slo_execution_receipt.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(tick.authority_boundary.can_write_domain_truth, false);

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const proofEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );
    const sloEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_provider_slo_execution_receipt'
    );
    assert.equal(proofEvents.length, 2);
    assert.equal(sloEvents.length, 2);
    assert.equal(sloEvents.at(-1).payload.execution_status, 'executed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo auto-starts OPL managed Temporal worker before proof', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-worker-autostart-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    let startCount = 0;
    const receipt = await maybeRepairTemporalWorkerForProviderSlo(familyRuntimePaths(), {
      inspectTemporalWorkerLifecycle: async () =>
        startCount === 0 ? temporalWorkerStatus('worker_not_ready') : temporalWorkerStatus('ready'),
      startTemporalWorkerLifecycle: async () => {
        startCount += 1;
        return {
          surface_kind: 'temporal_worker_lifecycle_start',
          provider_kind: 'temporal',
          start_status: 'started',
          status: temporalWorkerStatus('ready'),
        };
      },
    });

    assert.equal(startCount, 1);
    assert.equal(receipt.repair_status, 'executed');
    assert.equal(receipt.repair_action_id, 'start_temporal_worker');
    assert.equal(receipt.before.lifecycle_status, 'worker_not_ready');
    assert.ok(receipt.after);
    assert.equal(receipt.after.lifecycle_status, 'ready');
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo tick skips fresh cadence without rerunning proof', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-skip-'));
  try {
    insertProvenTemporalProofEvent(stateRoot);

    const skippedTick = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;

    assert.equal(skippedTick.execution_status, 'skipped');
    assert.equal(skippedTick.skipped, true);
    assert.equal(skippedTick.before.proof_slo_status, 'proof_fresh');
    assert.equal(skippedTick.provider_slo_execution_receipt.receipt_status, 'skipped');
    assert.equal(skippedTick.provider_slo_execution_receipt.skip_reason, 'cadence_current');
    assert.equal(skippedTick.provider_slo_execution_receipt.supervised_cadence_receipt, true);
    assert.equal(skippedTick.provider_slo_execution_receipt.repair_receipt.repair_status, 'skipped');
    assert.equal(skippedTick.provider_slo_execution_receipt.repair_receipt.trigger, 'cadence_current');
    assert.equal(skippedTick.provider_slo_execution_receipt.repair_receipt.next_repair_command, null);
    assert.equal(
      skippedTick.provider_slo_execution_receipt.cadence_action.dispatch_status,
      'cadence_current',
    );
    assert.equal(
      skippedTick.provider_slo_execution_receipt.authority_boundary.can_authorize_domain_ready,
      false,
    );

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const proofEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );
    const sloEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_provider_slo_execution_receipt'
    );

    assert.equal(proofEvents.length, 1);
    assert.equal(sloEvents.length, 1);
    assert.equal(sloEvents.at(-1).payload.receipt_status, 'skipped');
    assert.equal(sloEvents.at(-1).payload.skip_reason, 'cadence_current');

    const secondSkippedTick = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;
    assert.equal(secondSkippedTick.after.operator_slo_repair_loop.execution_receipts.event_count, 2);
    assert.equal(secondSkippedTick.after.operator_slo_repair_loop.execution_receipts.skipped_count, 2);
    assert.equal(secondSkippedTick.after.operator_slo_repair_loop.execution_receipts.executed_count, 0);
    assert.equal(secondSkippedTick.after.operator_slo_repair_loop.execution_receipts.latest_repair_receipt.repair_status, 'skipped');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo tick force reruns proof even when cadence is current', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-force-'));
  try {
    insertProvenTemporalProofEvent(stateRoot);
    const forced = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
      '--force',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;

    assert.equal(forced.execution_status, 'executed');
    assert.equal(forced.skipped, false);
    assert.equal(forced.force, true);
    assert.equal(forced.before.proof_slo_status, 'proof_fresh');
    assert.equal(forced.provider_slo_execution_receipt.execution_status, 'executed');
    assert.equal(forced.provider_slo_execution_receipt.repair_receipt.repair_status, 'blocked');
    assert.equal(forced.provider_slo_execution_receipt.repair_receipt.trigger, 'forced');

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const proofEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );
    assert.equal(proofEvents.length, 2);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider-slo tick persists blocked repair receipt when production proof cannot run', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-blocked-'));
  try {
    const tick = runCli([
      'family-runtime',
      'provider-slo',
      'tick',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_provider_slo_tick;

    assert.equal(tick.execution_status, 'executed');
    assert.equal(tick.skipped, false);
    assert.equal(tick.provider_slo_execution_receipt.execution_status, 'executed');
    assert.equal(tick.provider_slo_execution_receipt.receipt_status, 'blocked');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.repair_status, 'blocked');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.trigger, 'no_proof_observed');
    assert.equal(
      tick.provider_slo_execution_receipt.repair_receipt.blocker_ids.includes('temporal_runtime_not_configured'),
      true,
    );
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.next_repair_command, 'opl family-runtime service start --provider temporal');
    assert.equal(tick.provider_slo_execution_receipt.repair_receipt.can_execute_domain_repair, false);
    assert.equal(tick.after.operator_slo_repair_loop.execution_receipts.blocked_count, 1);
    assert.equal(tick.after.operator_slo_repair_loop.execution_receipts.latest_repair_receipt.repair_status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime scheduler tick owns provider cadence and queue dispatch without installing domain daemons', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-scheduler-tick-'));
  try {
    insertProvenTemporalProofEvent(stateRoot);
    const tick = runCli([
      'family-runtime',
      'scheduler',
      'tick',
      '--provider',
      'temporal',
      '--limit',
      '1',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_scheduler_tick;

    assert.equal(tick.surface_kind, 'opl_family_runtime_scheduler_tick');
    assert.equal(tick.scheduler_owner, 'opl_provider_runtime_manager');
    assert.equal(tick.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(tick.provider_kind, 'temporal');
    assert.equal(tick.provider_slo.provider_slo_execution_receipt.receipt_status, 'skipped');
    assert.equal(tick.queue_tick.source, 'opl-provider-scheduler');
    assert.equal(tick.queue_tick.hydration.source, 'opl-provider-scheduler:hydrate');
    assert.equal(tick.authority_boundary.can_install_domain_daemon, false);
    assert.equal(tick.authority_boundary.can_write_domain_truth, false);

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    assert.equal(
      events.family_runtime_events.events.some((event: { event_type: string }) =>
        event.event_type === 'opl_scheduler_tick_completed'
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime scheduler cadence is OPL-owned and fail-closed when Temporal is not ready', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-scheduler-cadence-'));
  try {
    const cadence = runCli([
      'family-runtime',
      'scheduler',
      'status',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    })).family_runtime_scheduler_cadence;

    assert.equal(cadence.surface_kind, 'opl_family_runtime_scheduler_cadence');
    assert.equal(cadence.scheduler_owner, 'opl_provider_runtime_manager');
    assert.equal(cadence.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(cadence.status, 'blocked_provider_not_ready');
    assert.equal(cadence.authority_boundary.can_install_domain_daemon, false);
    assert.equal(cadence.blocker.next_repair_command.includes('opl family-runtime service start --provider temporal'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
