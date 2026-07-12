import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

import { assert, createFamilyContractsFixtureRoot, fs, installRuntimePackageFixture, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { resolveTemporalWorkerTaskQueue } from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';

type RuntimeEventRow = {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

function insertRuntimeEvents(queueDb: string, rows: RuntimeEventRow[]) {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[1]);
const rows = JSON.parse(process.argv[2]);
const stmt = db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)");
for (const row of rows) {
  stmt.run(row.eventId, row.eventType, 'test', JSON.stringify(row.payload), row.createdAt);
}
db.close();`,
    queueDb,
    JSON.stringify(rows),
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

function providerProofPayload(input: {
  closeoutStatus?: string;
  receiptKind?: string;
  receiptStatus?: string;
} = {}) {
  return {
    provider_kind: 'temporal',
    proof_mode: 'external_temporal_service_worker',
    closeout_status: input.closeoutStatus ?? 'production_residency_proven',
    proof_receipt: {
      receipt_kind: input.receiptKind ?? 'temporal_production_residency_proof',
      receipt_status: input.receiptStatus ?? 'proven',
      provider_kind: 'temporal',
    },
  };
}

function sloExecutionReceiptPayload(input: {
  command?: string;
  executionStatus?: string;
  receiptStatus?: string;
  repairStatus?: string;
  skipReason?: string;
  productionCapabilityReceipt?: Record<string, unknown>;
} = {}) {
  return {
    surface_kind: 'opl_temporal_provider_slo_execution_receipt',
    provider_kind: 'temporal',
    ...(input.command ? { command: input.command } : {}),
    execution_status: input.executionStatus ?? 'executed',
    receipt_status: input.receiptStatus ?? 'proven',
    receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
    ...(input.skipReason ? { skip_reason: input.skipReason } : {}),
    ...(input.productionCapabilityReceipt
      ? { production_capability_receipt: input.productionCapabilityReceipt }
      : {}),
    repair_receipt: {
      repair_status: input.repairStatus ?? 'executed',
      can_execute_domain_repair: false,
    },
    authority_boundary: {
      can_authorize_domain_ready: false,
    },
  };
}

test('runtime snapshot projects provider continuous proof receipt without domain readiness authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'residency', 'proof', '--provider', 'temporal', '--production'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.provider_continuous_proof.surface_kind, 'opl_temporal_provider_continuous_proof_projection');
    assert.equal(snapshot.provider_continuous_proof.proof_event_count, 1);
    assert.equal(snapshot.provider_continuous_proof.slo_execution_receipt_event_count, 1);
    assert.equal(typeof snapshot.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(
      snapshot.provider_continuous_proof.latest_slo_execution_receipt.surface_kind,
      'opl_temporal_provider_slo_execution_receipt',
    );
    assert.equal(snapshot.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(snapshot.provider_continuous_proof.proof_slo_status, 'proof_blocker_observed');
    assert.equal(snapshot.provider_continuous_proof.cadence_window.window_status, 'window_repair_receipt_observed');
    assert.equal(snapshot.provider_continuous_proof.cadence_window.long_window_evidence_ready, false);
    assert.equal(snapshot.provider_continuous_proof.cadence_window.observed_slo_execution_receipt_count, 1);
    assert.equal(snapshot.provider_continuous_proof.cadence_window.blocked_repair_receipt_count, 1);
    assert.equal(snapshot.provider_continuous_proof.latest_closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(snapshot.provider_continuous_proof.latest_proof_receipt.receipt_status, 'blocked');
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.repair_state,
      'needs_provider_repair_then_proof_rerun',
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.operator_commands[0].execution_policy,
      'manual_or_supervised_no_auto_execution',
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.operator_cadence_action.action_id,
      'temporal-provider-production-proof-cadence',
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.operator_cadence_action.expected_event_type,
      'temporal_provider_slo_execution_receipt',
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.operator_cadence_action.dispatch_status,
      'execution_due_or_repair_required',
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.operator_cadence_action.authority_boundary.can_auto_execute,
      false,
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.event_count,
      1,
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.latest_receipt_summary.receipt_status,
      'blocked',
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.blocked_count,
      1,
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.authority_boundary.can_execute_repair_command,
      false,
    );
    assert.equal(snapshot.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready, false);
    const proofItem = snapshot.attention_items.find((item: { item_id: string }) =>
      item.item_id === 'opl:provider-continuous-proof:temporal'
    );
    assert.equal(proofItem.project_id, 'opl');
    assert.equal(proofItem.action_owner, 'infrastructure');
    assert.equal(proofItem.requires_user_action, false);
    assert.equal(proofItem.action_kind, 'infrastructure_recovery');
    assert.equal(proofItem.provider_continuous_proof.latest_closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(proofItem.provider_continuous_proof.slo_execution_receipt_event_count, 1);
    assert.equal(
      proofItem.provider_continuous_proof.latest_slo_execution_receipt.authority_boundary.can_authorize_domain_ready,
      false,
    );
    assert.equal(typeof proofItem.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(proofItem.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(proofItem.provider_continuous_proof.proof_slo_status, 'proof_blocker_observed');
    assert.equal(proofItem.provider_continuous_proof.cadence_window.window_status, 'window_repair_receipt_observed');
    assert.equal(
      proofItem.provider_continuous_proof.operator_slo_repair_loop.operator_cadence.max_proof_age_seconds,
      86400,
    );
    assert.equal(
      proofItem.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'provider_continuous_proof'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot workbench shows current managed Temporal readiness without rewriting attempt receipt', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-current-provider-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const service = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  service.unref();
  worker.unref();

  try {
    assert.equal(typeof service.pid, 'number');
    assert.equal(typeof worker.pid, 'number');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    const taskQueue = resolveTemporalWorkerTaskQueue({ root: runtimeRoot });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: service.pid,
      address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:runtime-tray-provider-proof-current',
    }, null, 2)}\n`);
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:runtime-tray-provider-proof-current',
    };
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'ai_reviewer_re_eval',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], env);

    const output = runCli(['runtime', 'snapshot'], env);
    const snapshot = output.runtime_tray_snapshot;
    const workbenchAttempt = snapshot.stage_attempt_workbench.attempts[0];
    const attemptItem = [...snapshot.attention_items, ...snapshot.recent_items, ...snapshot.running_items].find(
      (item: { item_id: string }) =>
        item.item_id === `opl:stage-attempt:${created.family_runtime_stage_attempt.attempt.stage_attempt_id}`,
    );

    assert.equal(created.family_runtime_stage_attempt.attempt.provider_receipt.provider_ready, false);
    assert.equal(snapshot.runtime_health.status, 'running');
    assert.equal(workbenchAttempt.current_provider_readiness.provider_ready, true);
    assert.equal(workbenchAttempt.current_provider_readiness.status, 'ready');
    assert.equal(workbenchAttempt.current_provider_readiness.details.address_source, 'managed_local_service_state');
    assert.equal(
      workbenchAttempt.current_provider_readiness.provider_receipt_is_creation_time_snapshot,
      true,
    );
    assert.equal(
      attemptItem.stage_attempt_workbench.attempt.current_provider_readiness.provider_ready,
      true,
    );
  } finally {
    process.kill(service.pid!, 'SIGTERM');
    process.kill(worker.pid!, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot keeps fresh proven provider proof in the provider read model only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-proven-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const proofCreatedAt = new Date().toISOString();
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    insertRuntimeEvents(queueDb, [{
      eventId: 'evt_provider_proof_proven',
      eventType: 'temporal_residency_proof',
      payload: providerProofPayload(),
      createdAt: proofCreatedAt,
    }]);

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const allItems = [...snapshot.running_items, ...snapshot.attention_items, ...snapshot.recent_items];

    assert.equal(snapshot.provider_continuous_proof.continuous_proof_status, 'all_observed_proofs_proven');
    assert.equal(snapshot.provider_continuous_proof.latest_closeout_status, 'production_residency_proven');
    assert.equal(snapshot.provider_continuous_proof.slo_execution_receipt_event_count, 0);
    assert.equal(snapshot.provider_continuous_proof.latest_event_created_at, proofCreatedAt);
    assert.equal(typeof snapshot.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(snapshot.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(snapshot.provider_continuous_proof.proof_slo_status, 'proof_fresh');
    assert.equal(snapshot.provider_continuous_proof.cadence_window.window_status, 'window_evidence_incomplete');
    assert.equal(snapshot.provider_continuous_proof.cadence_window.long_window_evidence_ready, false);
    assert.equal(snapshot.provider_continuous_proof.cadence_window.observed_slo_execution_receipt_count, 0);
    assert.equal(snapshot.provider_continuous_proof.cadence_window.missing_slo_execution_receipt_count, 7);
    assert.equal(snapshot.provider_continuous_proof.operator_slo_repair_loop.repair_state, 'cadence_current');
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.latest_receipt_summary.receipt_status,
      'proven',
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.event_count,
      0,
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.executed_count,
      0,
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.authority_boundary.can_authorize_domain_ready,
      false,
    );
    assert.equal(
      snapshot.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(allItems.some((item: { item_id: string }) => item.item_id === 'opl:provider-continuous-proof:temporal'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot and App drilldown project Temporal restart requery signal history capability SLO', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-capability-slo-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const createdAt = new Date().toISOString();
    const checks = {
      external_temporal_server_reachable: true,
      managed_worker_ready: true,
      worker_completed_attempt: true,
      worker_restart_requery: true,
      signal_history_preserved: true,
      typed_closeout_required_for_completed: true,
      missing_closeout_blocks_completion: true,
      retry_or_dead_letter_boundary_observed: true,
      domain_truth_boundary_preserved: true,
    };
    insertRuntimeEvents(queueDb, [
      {
        eventId: 'evt_provider_capability_slo_proof',
        eventType: 'temporal_residency_proof',
        payload: providerProofPayload(),
        createdAt,
      },
      {
        eventId: 'evt_provider_capability_slo_execution',
        eventType: 'temporal_provider_slo_execution_receipt',
        payload: sloExecutionReceiptPayload({
          command: 'opl family-runtime residency proof --provider temporal --production',
          productionCapabilityReceipt: {
            surface_kind: 'opl_temporal_provider_production_capability_receipt',
            provider_kind: 'temporal',
            receipt_status: 'proven',
            capability_status: 'capability_proven',
            checks,
            failed_check_ids: [],
            proven_check_count: Object.keys(checks).length,
            required_check_count: Object.keys(checks).length,
            completed_workflow_id: 'wf-capability-completed',
            blocked_workflow_id: 'wf-capability-blocked',
            restarted_worker_requery_status: 'stage_attempt_query_available_after_worker_restart',
          },
        }),
        createdAt,
      },
      {
        eventId: 'evt_provider_capability_slo_skipped_after_proof',
        eventType: 'temporal_provider_slo_execution_receipt',
        payload: sloExecutionReceiptPayload({
          command: 'opl family-runtime residency proof --provider temporal --production',
          executionStatus: 'skipped',
          receiptStatus: 'skipped',
          repairStatus: 'skipped',
          skipReason: 'cadence_current',
        }),
        createdAt: new Date(Date.parse(createdAt) + 1000).toISOString(),
      },
    ]);

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const capability = output.runtime_tray_snapshot.provider_continuous_proof.provider_capability_slo;

    assert.equal(capability.status, 'capability_slo_satisfied');
    assert.equal(capability.restart_requery_ready, true);
    assert.equal(capability.signal_history_ready, true);
    assert.equal(capability.typed_closeout_required_ready, true);
    assert.equal(capability.missing_closeout_block_ready, true);
    assert.equal(capability.retry_dead_letter_boundary_ready, true);
    assert.equal(capability.domain_truth_boundary_preserved, true);
    assert.equal(capability.latest_capability_event_id, 'evt_provider_capability_slo_execution');
    assert.deepEqual(capability.failed_check_ids, []);
    assert.equal(capability.authority_boundary.can_authorize_domain_ready, false);

    const appOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const summary = appOutput.app_operator_drilldown.summary;
    assert.equal(summary.provider_capability_slo_status, 'capability_slo_satisfied');
    assert.equal(summary.provider_capability_restart_requery_ready, true);
    assert.equal(summary.provider_capability_signal_history_ready, true);
    assert.equal(summary.provider_capability_typed_closeout_ready, true);
    assert.equal(summary.provider_capability_retry_dead_letter_ready, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot treats a newer proven provider proof as current after an older blocker', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-recovered-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    insertRuntimeEvents(queueDb, [
      {
        eventId: 'evt_provider_proof_blocked',
        eventType: 'temporal_residency_proof',
        payload: providerProofPayload({
          closeoutStatus: 'production_residency_needs_live_evidence',
          receiptKind: 'temporal_production_residency_blocker',
          receiptStatus: 'blocked',
        }),
        createdAt: '2026-05-15T00:00:00.000Z',
      },
      {
        eventId: 'evt_provider_proof_recovered',
        eventType: 'temporal_residency_proof',
        payload: providerProofPayload(),
        createdAt: new Date().toISOString(),
      },
    ]);

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const proof = output.runtime_tray_snapshot.provider_continuous_proof;
    const allItems = [
      ...output.runtime_tray_snapshot.running_items,
      ...output.runtime_tray_snapshot.attention_items,
      ...output.runtime_tray_snapshot.recent_items,
    ];

    assert.equal(proof.proof_event_count, 2);
    assert.equal(proof.proven_event_count, 1);
    assert.equal(proof.continuous_proof_status, 'latest_proof_proven');
    assert.equal(proof.proof_slo_status, 'proof_fresh');
    assert.equal(proof.cadence_window.window_status, 'window_evidence_incomplete');
    assert.equal(proof.cadence_window.long_window_evidence_ready, false);
    assert.equal(proof.operator_slo_repair_loop.repair_state, 'cadence_current');
    assert.equal(proof.operator_slo_repair_loop.execution_receipts.blocked_count, 0);
    assert.equal(allItems.some((item: { item_id: string }) => item.item_id === 'opl:provider-continuous-proof:temporal'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot routes stale proven provider proof to operator attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-stale-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const staleProofCreatedAt = new Date(Date.now() - 5_000).toISOString();
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    insertRuntimeEvents(queueDb, [{
      eventId: 'evt_provider_proof_stale',
      eventType: 'temporal_residency_proof',
      payload: providerProofPayload(),
      createdAt: staleProofCreatedAt,
    }]);

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_PROVIDER_PROOF_MAX_AGE_SECONDS: '1',
    });
    const snapshot = output.runtime_tray_snapshot;
    const proofItem = snapshot.attention_items.find((item: { item_id: string }) =>
      item.item_id === 'opl:provider-continuous-proof:temporal'
    );

    assert.equal(snapshot.provider_continuous_proof.continuous_proof_status, 'all_observed_proofs_proven');
    assert.equal(snapshot.provider_continuous_proof.proof_slo_status, 'proof_stale');
    assert.equal(snapshot.provider_continuous_proof.cadence_window.window_status, 'window_evidence_incomplete');
    assert.equal(snapshot.provider_continuous_proof.cadence_window.long_window_evidence_ready, false);
    assert.equal(proofItem.status, 'all_observed_proofs_proven');
    assert.equal(proofItem.status_label, 'Provider proof 已过期');
    assert.equal(proofItem.action_owner, 'infrastructure');
    assert.equal(proofItem.requires_user_action, false);
    assert.equal(proofItem.provider_continuous_proof.proof_freshness_status, 'stale');
    assert.equal(
      proofItem.provider_continuous_proof.operator_slo_repair_loop.repair_state,
      'needs_operator_cadence_refresh',
    );
    assert.equal(
      proofItem.provider_continuous_proof.operator_slo_repair_loop.operator_cadence.overdue_by_seconds > 0,
      true,
    );
    assert.equal(
      proofItem.provider_continuous_proof.operator_slo_repair_loop.operator_commands[0].command,
      'opl family-runtime residency proof --provider temporal --production',
    );
    assert.equal(proofItem.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot marks Temporal provider cadence window ready only after supervised execution receipts cover the window', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-window-ready-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const eventRows = Array.from({ length: 7 }, (_, index) => {
      const createdAt = new Date(now - (6 - index) * dayMs).toISOString();
      return {
        proofEventId: `evt_provider_proof_window_${index}`,
        receiptEventId: `evt_provider_slo_window_${index}`,
        createdAt,
      };
    });
    insertRuntimeEvents(queueDb, eventRows.flatMap((row) => [
      {
        eventId: row.proofEventId,
        eventType: 'temporal_residency_proof',
        payload: providerProofPayload(),
        createdAt: row.createdAt,
      },
      {
        eventId: row.receiptEventId,
        eventType: 'temporal_provider_slo_execution_receipt',
        payload: sloExecutionReceiptPayload(),
        createdAt: row.createdAt,
      },
    ]));

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const window = output.runtime_tray_snapshot.provider_continuous_proof.cadence_window;
    const allItems = [
      ...output.runtime_tray_snapshot.running_items,
      ...output.runtime_tray_snapshot.attention_items,
      ...output.runtime_tray_snapshot.recent_items,
    ];

    assert.equal(window.window_status, 'window_cadence_satisfied');
    assert.equal(window.long_window_evidence_ready, true);
    assert.equal(window.expected_slo_execution_receipt_count, 7);
    assert.equal(window.observed_slo_execution_receipt_count, 7);
    assert.equal(window.missing_slo_execution_receipt_count, 0);
    assert.equal(window.blocked_repair_receipt_count, 0);
    assert.equal(output.runtime_tray_snapshot.provider_continuous_proof.proof_slo_status, 'proof_fresh');
    assert.equal(allItems.some((item: { item_id: string }) => item.item_id === 'opl:provider-continuous-proof:temporal'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot treats historical provider blockers as repaired after a fully covered proven cadence window', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-window-repaired-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const eventRows = Array.from({ length: 7 }, (_, index) => {
      const createdAt = new Date(now - (6 - index) * dayMs).toISOString();
      return {
        proofEventId: `evt_provider_proof_repaired_window_${index}`,
        receiptEventId: `evt_provider_slo_repaired_window_${index}`,
        createdAt,
        blocked: index === 0,
      };
    });
    insertRuntimeEvents(queueDb, eventRows.flatMap((row) => [
      {
        eventId: row.proofEventId,
        eventType: 'temporal_residency_proof',
        payload: providerProofPayload(row.blocked
          ? {
              closeoutStatus: 'production_residency_needs_live_evidence',
              receiptKind: 'temporal_production_residency_blocker',
              receiptStatus: 'blocked',
            }
          : {}),
        createdAt: row.createdAt,
      },
      {
        eventId: row.receiptEventId,
        eventType: 'temporal_provider_slo_execution_receipt',
        payload: sloExecutionReceiptPayload({
          receiptStatus: row.blocked ? 'blocked' : 'proven',
          repairStatus: row.blocked ? 'blocked' : 'executed',
        }),
        createdAt: row.createdAt,
      },
    ]));

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const window = output.runtime_tray_snapshot.provider_continuous_proof.cadence_window;

    assert.equal(output.runtime_tray_snapshot.provider_continuous_proof.continuous_proof_status, 'latest_proof_proven');
    assert.equal(output.runtime_tray_snapshot.provider_continuous_proof.proof_slo_status, 'proof_fresh');
    assert.equal(window.expected_slo_execution_receipt_count, 7);
    assert.equal(window.observed_slo_execution_receipt_count, 7);
    assert.equal(window.missing_slo_execution_receipt_count, 0);
    assert.equal(window.blocked_proof_event_count, 1);
    assert.equal(window.blocked_slo_execution_receipt_count, 1);
    assert.equal(window.blocked_repair_receipt_count, 1);
    assert.equal(window.window_status, 'window_cadence_satisfied');
    assert.equal(window.long_window_evidence_ready, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
