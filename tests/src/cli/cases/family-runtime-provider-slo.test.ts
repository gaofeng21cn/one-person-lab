import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

import { assert, createFakeCodexFixture, createFakeLaunchctlFixture, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import {
  createFamilyRuntimeQueueTables,
  familyRuntimePaths,
} from '../../../../src/modules/runway/family-runtime-store.ts';
import { runTemporalProviderCadenceReadback } from '../../../../src/modules/runway/family-runtime-scheduler.ts';
import {
  runTemporalProviderSloTick,
} from '../../../../src/modules/runway/family-runtime-provider-slo-executor.ts';
import { inspectFamilyRuntimeProvidersWithLifecycle } from '../../../../src/modules/runway/family-runtime-providers.ts';
import {
  buildProviderContinuousProof,
} from '../../../../src/modules/runway/family-runtime-provider-continuous-proof.ts';
import {
  FAMILY_RUNTIME_PROVIDER_KINDS,
} from '../../../../src/modules/runway/family-runtime-types.ts';
import {
  assertBlockedProviderCadenceReadback,
  assertTemporalWorkerLivenessBlocker,
} from './family-runtime-provider-slo-assertions.ts';
import {
  temporalWorkerStatus,
} from './family-runtime-provider-slo-fixtures.ts';

type ProviderLifecycleProjection = Awaited<ReturnType<typeof inspectFamilyRuntimeProvidersWithLifecycle>>;
type ProviderSloTick = Awaited<ReturnType<typeof runTemporalProviderSloTick>>;
type TemporalWorkerRepairReceipt = ProviderSloTick['provider_worker_repair_receipt'];
type TemporalWorkerStatus = Parameters<typeof temporalWorkerStatus>[0];

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function temporalProviderLifecycle(workerStatus: TemporalWorkerStatus): ProviderLifecycleProjection {
  const workerReadiness = temporalWorkerStatus(workerStatus);
  const ready = workerStatus === 'ready';
  return {
    selected_provider: 'temporal',
    allowed_providers: [...FAMILY_RUNTIME_PROVIDER_KINDS],
    default_resolution: {
      env: 'OPL_FAMILY_RUNTIME_PROVIDER',
      fallback: 'temporal',
      production_required_provider: 'temporal',
      local_sqlite_role: 'retired_runtime_provider',
      fail_closed_when_temporal_not_ready: true,
    },
    providers: {
      temporal: {
        provider_kind: 'temporal',
        status: ready ? 'ready' : 'provider_code_landed_unconfigured',
        ready,
        degraded_reason: ready ? null : workerReadiness.blockers[0] ?? null,
        capabilities: [],
        details: {
          address: workerReadiness.address,
          address_source: workerReadiness.address_source,
          namespace: workerReadiness.namespace,
          task_queue: workerReadiness.task_queue,
          worker_ready: ready,
          worker_readiness: workerReadiness,
        },
      },
    },
    provider_catalog: {},
  };
}

function temporalProviderWorkerRepairReceipt(
  status: TemporalWorkerRepairReceipt['repair_status'],
  repairActionId: string,
): TemporalWorkerRepairReceipt {
  return {
    surface_kind: 'opl_temporal_provider_worker_repair_receipt',
    provider_kind: 'temporal',
    trigger: 'provider_slo_tick',
    repair_status: status,
    repair_action_id: repairActionId,
    command: repairActionId === 'restart_temporal_worker'
      ? 'opl family-runtime worker stop --provider temporal'
      : 'opl family-runtime worker start --provider temporal',
    before: temporalWorkerStatus(repairActionId === 'restart_temporal_worker' ? 'worker_source_stale' : 'worker_not_ready'),
    after: status === 'executed' ? temporalWorkerStatus('ready') : null,
    stop: null,
    start: null,
    restart_guard: null,
    restart_reason: repairActionId === 'restart_temporal_worker' ? 'worker_source_stale' : null,
    restart_strategy: repairActionId === 'restart_temporal_worker' ? 'manual_stop_then_start' : null,
    supervisor_state: null,
    blocker_ids: [],
    error: null,
    can_execute_domain_repair: false,
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
      can_execute_domain_repair: false,
    },
  };
}

function temporalWorkerLivenessBlocker() {
  return {
    blocker_kind: 'platform_dependency',
    blocker_id: 'temporal_worker_not_ready',
    next_repair_command: 'opl family-runtime worker start --provider temporal',
    next_repair_action: temporalWorkerStatus('worker_not_ready').repair_action,
    worker_lifecycle_status: 'worker_not_ready',
    temporal_service_status: 'running',
    temporal_server_reachable: true,
    liveness_blocker_first: true,
  };
}

function providerSloTick(
  workerRepairReceipt: TemporalWorkerRepairReceipt,
): ProviderSloTick {
  const proof = buildProviderContinuousProof([]);
  const receipt: ProviderSloTick['provider_slo_execution_receipt'] = {
    surface_kind: 'opl_temporal_provider_slo_execution_receipt',
    provider_kind: 'temporal',
    command: 'opl family-runtime residency proof --provider temporal --production',
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
    supervised_cadence_receipt: true,
    execution_status: 'skipped',
    receipt_status: 'skipped',
    receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
    skip_reason: 'cadence_current',
    repair_receipt: {
      surface_kind: 'opl_temporal_provider_slo_repair_receipt',
      provider_kind: 'temporal',
      trigger: 'cadence_current',
      repair_status: 'skipped',
      cadence_owner: 'provider_backed_family_runtime',
      execution_owner: 'operator_or_infrastructure',
      execution_policy: 'supervised_command_receipt_only',
      command: 'opl family-runtime residency proof --provider temporal --production',
      blocker_ids: [],
      next_repair_command: null,
      can_execute_domain_repair: false,
      authority_boundary: {
        can_authorize_domain_ready: false,
        can_authorize_quality_verdict: false,
        can_authorize_artifact_export: false,
        can_write_domain_truth: false,
        can_execute_domain_repair: false,
      },
    },
    proof_slo_status: proof.proof_slo_status,
    proof_freshness_status: proof.proof_freshness_status,
    continuous_proof_status: proof.continuous_proof_status,
    latest_proof_event_id: proof.latest_event_id,
    latest_proof_event_created_at: proof.latest_event_created_at,
    cadence_action: proof.operator_slo_repair_loop.operator_cadence_action,
    proves_only: 'temporal_service_worker_residency_cadence_execution',
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
  return {
    surface_id: 'opl_family_runtime_provider_slo_tick',
    provider_kind: 'temporal',
    execution_status: 'skipped',
    skipped: true,
    force: false,
    provider_worker_repair_receipt: workerRepairReceipt,
    before: proof,
    after: proof,
    provider_slo_execution_receipt: receipt,
    event_id: 'evt_provider_slo_test',
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
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

test('family-runtime provider-worker supervisor installs a KeepAlive resident Temporal worker', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-worker-supervisor-home-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-worker-supervisor-state-'));
  const launchctl = createFakeLaunchctlFixture();
  const codex = createFakeCodexFixture('printf \'{}\\n\'');
  const env = familyRuntimeEnv(stateRoot, {
    HOME: homeRoot,
    PATH: `${codex.fixtureRoot}:${launchctl.fixtureRoot}:/usr/bin:/bin`,
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
    TEMPORAL_ADDRESS: '',
  });
  try {
    insertProvenTemporalProofEvent(stateRoot);
    const legacyPlistPath = path.join(homeRoot, 'Library', 'LaunchAgents', 'ai.opl.family-runtime.provider-slo.plist');
    fs.mkdirSync(path.dirname(legacyPlistPath), { recursive: true });
    fs.writeFileSync(legacyPlistPath, '<plist><dict><key>StartInterval</key><integer>300</integer></dict></plist>');

    const before = runCli([
      'family-runtime',
      'provider-worker',
      'supervisor',
      'status',
      '--provider',
      'temporal',
    ], env).family_runtime_provider_worker_supervisor;

    assert.equal(before.status, 'not_installed');
    assert.equal(before.temporal_worker_dependency, true);
    assert.equal(before.provider_scheduler_dependency, false);
    assert.equal(before.authority_boundary.can_write_domain_truth, false);

    const installed = runCli([
      'family-runtime',
      'provider-worker',
      'supervisor',
      'install',
      '--provider',
      'temporal',
    ], env).family_runtime_provider_worker_supervisor;

    assert.equal(installed.status, 'installed');
    assert.equal(installed.provider_kind, 'temporal');
    assert.equal(installed.supervisor_owner, 'opl_provider_runtime_manager');
    assert.equal(installed.supervisor_role, 'provider_worker_process_supervisor');
    assert.equal(installed.temporal_worker_dependency, true);
    assert.equal(installed.provider_scheduler_dependency, false);
    assert.equal(installed.keep_alive, true);
    assert.equal(installed.run_at_load, true);
    assert.equal(installed.resident_worker_process, true);
    assert.equal(installed.primary_dispatcher, false);
    assert.equal(installed.provider_slo_tick_is_fallback_health_check, true);
    assert.equal(installed.command.join(' '), 'opl family-runtime worker start --provider temporal --foreground');
    assert.equal(installed.environment_variables.OPL_FAMILY_RUNTIME_PROVIDER, 'temporal');
    assert.equal(installed.environment_variables.OPL_STATE_DIR, stateRoot);
    assert.equal(installed.environment_variables.OPL_CODEX_BIN, codex.codexPath);
    assert.equal(installed.environment_variables.PATH, `${codex.fixtureRoot}:${launchctl.fixtureRoot}:/usr/bin:/bin`);
    assert.equal(installed.health_check_command.join(' '), 'opl family-runtime provider-slo tick --provider temporal');
    assert.equal(installed.legacy_watchdog_cleanup.removed, true);
    assert.equal(fs.existsSync(legacyPlistPath), false);
    assert.equal(installed.authority_boundary.can_execute_domain_action, false);
    assert.equal(installed.authority_boundary.can_write_domain_truth, false);

    const plist = fs.readFileSync(installed.plist_path, 'utf8');
    assert.match(plist, /ai\.opl\.family-runtime\.provider-worker/);
    assert.match(plist, /<key>KeepAlive<\/key>/);
    assert.match(plist, /<key>RunAtLoad<\/key>/);
    assert.match(plist, /family-runtime-temporal-provider/);
    assert.match(plist, /--temporal-worker-foreground/);
    assert.match(plist, /--family-runtime-root/);
    assert.match(plist, /OPL_STATE_DIR/);
    assert.match(plist, /OPL_CODEX_BIN/);
    assert.match(plist, new RegExp(codex.codexPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(plist, /<key>PATH<\/key>/);
    assert.match(plist, new RegExp(stateRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(plist, /StartInterval/);
    assert.doesNotMatch(plist, /<string>provider-slo<\/string>/);
    assert.doesNotMatch(plist, /<string>tick<\/string>/);
    assert.doesNotMatch(plist, /scheduler tick/);
    assert.doesNotMatch(plist, /SchedulerTickWorkflow/);

    const launchctlCalls = fs.readFileSync(launchctl.callsPath, 'utf8');
    assert.match(launchctlCalls, /bootout gui\/\d+ .*ai\.opl\.family-runtime\.provider-slo\.plist/);
    assert.match(launchctlCalls, /bootstrap gui\/\d+ .*ai\.opl\.family-runtime\.provider-worker\.plist/);

    const trigger = runCli([
      'family-runtime',
      'provider-worker',
      'supervisor',
      'trigger',
      '--provider',
      'temporal',
    ], {
      ...env,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).family_runtime_provider_worker_supervisor;

    assert.equal(trigger.status, 'triggered');
    assert.equal(trigger.provider_slo_tick.surface_id, 'opl_family_runtime_provider_slo_tick');
    assert.equal(trigger.provider_slo_tick.provider_worker_repair_receipt.repair_status, 'skipped');
    assert.equal(trigger.provider_slo_tick.provider_slo_execution_receipt.receipt_status, 'skipped');
    assert.equal(trigger.provider_slo_tick.provider_slo_execution_receipt.skip_reason, 'cadence_current');
    assert.equal(trigger.provider_slo_tick.authority_boundary.can_write_domain_truth, false);
    assert.equal(trigger.temporal_worker_dependency, true);
    assert.equal(trigger.provider_scheduler_dependency, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(launchctl.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
  }
});

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

test('family-runtime records Temporal provider cadence without local queue runtime', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-cadence-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousTemporalAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousTemporalWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_TEMPORAL_ADDRESS = '127.0.0.1:7233';
    process.env.OPL_TEMPORAL_WORKER_STATUS = 'ready';
    insertProvenTemporalProofEvent(stateRoot);
    const paths = familyRuntimePaths();
    fs.mkdirSync(paths.root, { recursive: true });
    const db = new DatabaseSync(paths.queue_db);
    createFamilyRuntimeQueueTables(db);
    const tick = await runTemporalProviderCadenceReadback(
      db,
      paths,
      { providerKind: 'temporal', limit: 1 },
    );

    assert.equal(tick.surface_kind, 'opl_temporal_provider_cadence_readback');
    assert.equal(tick.scheduler_owner, 'opl_provider_runtime_manager');
    assert.equal(tick.cadence_owner, 'provider_backed_family_runtime');
    assert.equal(tick.provider_kind, 'temporal');
    assert.equal(tick.provider_slo.provider_slo_execution_receipt.receipt_status, 'skipped');
    assert.equal(tick.retired_queue_tick, null);
    assert.equal(tick.queue_projection_bridge.surface_kind, 'opl_provider_cadence_projection_bridge');
    assert.equal(tick.queue_projection_bridge.bridge_status, 'retired_local_queue_runtime');
    assert.equal(tick.queue_projection_bridge.local_queue_runtime_retired, true);
    assert.equal(tick.queue_projection_bridge.durable_lifecycle_truth, false);
    assert.equal(tick.queue_projection_bridge.can_authorize_lifecycle_progress, false);
    assert.equal(tick.authority_boundary.can_install_domain_daemon, false);
    assert.equal(tick.authority_boundary.can_write_domain_truth, false);
    assert.equal(tick.authority_boundary.can_authorize_lifecycle_progress, false);

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    assert.equal(
      events.family_runtime_events.events.some((event: { event_type: string }) =>
        event.event_type === 'opl_temporal_provider_cadence_readback_completed'
      ),
      true,
    );
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    if (previousTemporalAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousTemporalAddress;
    }
    if (previousTemporalWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousTemporalWorkerStatus;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider cadence readback fails closed when worker liveness remains blocked after SLO repair', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-scheduler-worker-liveness-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const paths = familyRuntimePaths();
    fs.mkdirSync(paths.root, { recursive: true });
    const db = new DatabaseSync(paths.queue_db);
    createFamilyRuntimeQueueTables(db);
    const tick = await runTemporalProviderCadenceReadback(
      db,
      paths,
      { providerKind: 'temporal', limit: 1 },
      {
        inspectProvidersWithLifecycle: async () => temporalProviderLifecycle('worker_not_ready'),
        runProviderSloTick: async () => providerSloTick(
          temporalProviderWorkerRepairReceipt('blocked', 'start_temporal_worker'),
        ),
      },
    );

    assertBlockedProviderCadenceReadback(tick);
    assert.equal(tick.provider_kind, 'temporal');
    assert.equal(tick.provider_slo.provider_worker_repair_receipt.repair_status, 'blocked');
    assert.equal(tick.provider_slo.provider_worker_repair_receipt.repair_action_id, 'start_temporal_worker');
    assertTemporalWorkerLivenessBlocker(tick.provider_liveness_blocker);
    assert.equal(tick.provider_liveness_blocker.blocker_id, 'temporal_worker_not_ready');
    assert.equal(tick.provider_liveness_blocker.worker_lifecycle_status, 'worker_not_ready');
    assert.equal(tick.provider_liveness_blocker.temporal_service_status, 'running');
    assert.equal(tick.provider_liveness_blocker.next_repair_command, 'opl family-runtime worker start --provider temporal');
    assert.equal(tick.provider_liveness_blocker.next_repair_action.action_id, 'start_temporal_worker');
    assert.equal(tick.retired_queue_tick, null);
    assert.equal(tick.queue_projection_bridge.bridge_status, 'blocked_provider_not_ready');
    assert.equal(tick.queue_projection_bridge.blocked_reason, 'temporal_worker_not_ready');
    assert.equal(tick.queue_projection_bridge.local_queue_runtime_retired, true);
    assert.equal(tick.queue_projection_bridge.durable_lifecycle_truth, false);
    assert.equal(tick.queue_projection_bridge.can_authorize_lifecycle_progress, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime provider cadence repairs worker liveness without local queue admission', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-cadence-repair-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const paths = familyRuntimePaths();
    fs.mkdirSync(paths.root, { recursive: true });
    const db = new DatabaseSync(paths.queue_db);
    createFamilyRuntimeQueueTables(db);
    let inspectionCount = 0;

    const tick = await runTemporalProviderCadenceReadback(
      db,
      paths,
      { providerKind: 'temporal', limit: 1 },
      {
        inspectProvidersWithLifecycle: async () => {
          inspectionCount += 1;
          const workerStatus = inspectionCount === 1 ? 'worker_source_stale' : 'ready';
          return temporalProviderLifecycle(workerStatus);
        },
        runProviderSloTick: async () => providerSloTick(
          temporalProviderWorkerRepairReceipt('executed', 'restart_temporal_worker'),
        ),
      },
    );

    assert.equal(tick.status, undefined);
    assert.equal(tick.provider_slo.provider_worker_repair_receipt.repair_status, 'executed');
    assert.equal(tick.provider_slo.provider_worker_repair_receipt.repair_action_id, 'restart_temporal_worker');
    assert.equal(tick.provider_readiness_after_slo.provider_kind, 'temporal');
    assert.equal(tick.provider_readiness_after_slo.ready, true);
    assert.equal(tick.provider_readiness_after_slo.degraded_reason, null);
    assert.equal(tick.provider_readiness_after_slo.worker_lifecycle_status, 'ready');
    assert.equal(tick.provider_runtime_after_slo.providers.temporal?.ready, true);
    assert.equal(tick.queue_projection_bridge.bridge_status, 'retired_local_queue_runtime');
    assert.equal(tick.queue_projection_bridge.selected_task_projection_count, 0);
    assert.equal(tick.queue_projection_bridge.dispatch_projection_count, 0);
    assert.equal(tick.queue_projection_bridge.local_queue_runtime_retired, true);
    assert.equal(tick.queue_projection_bridge.durable_lifecycle_truth, false);
    assert.equal(tick.retired_queue_tick, null);
    assert.equal(inspectionCount, 2);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
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

test('family-runtime scheduler cadence surfaces worker liveness repair when Temporal service is running', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-scheduler-cadence-worker-'));
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  try {
    const cadence = runCli([
      'family-runtime',
      'scheduler',
      'status',
      '--provider',
      'temporal',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: temporalAddress,
      OPL_TEMPORAL_NAMESPACE: 'opl-scheduler-cadence-worker',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-scheduler-cadence-worker',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
    })).family_runtime_scheduler_cadence;

    assert.equal(cadence.status, 'blocked_provider_not_ready');
    assert.equal(cadence.blocker.blocker_id, 'temporal_worker_not_ready');
    assert.equal(cadence.blocker.worker_lifecycle_status, 'worker_not_ready');
    assert.equal(cadence.blocker.temporal_service_status, 'external_running');
    assert.equal(cadence.blocker.next_repair_command, 'opl family-runtime worker start --provider temporal');
    assert.equal(cadence.blocker.next_repair_action.action_id, 'start_temporal_worker');
    assert.equal(cadence.blocker.liveness_blocker_first, true);
    assert.equal(cadence.blocker.next_repair_command.includes('service start'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
