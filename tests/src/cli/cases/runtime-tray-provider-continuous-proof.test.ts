import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

import { assert, createFamilyContractsFixtureRoot, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

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
      snapshot.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.event_count,
      1,
    );
    assert.equal(
      snapshot.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.latest_receipt_summary.receipt_status,
      'blocked',
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
      task_queue: 'opl-stage-attempts',
      started_at: new Date().toISOString(),
      status: 'ready',
    }, null, 2)}\n`);
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
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

test('runtime snapshot lists proven provider continuous proof as recent operator evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-proven-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const proofCreatedAt = new Date().toISOString();
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_proven',
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
    ${JSON.stringify(proofCreatedAt)}
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

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const proofItem = snapshot.recent_items.find((item: { item_id: string }) =>
      item.item_id === 'opl:provider-continuous-proof:temporal'
    );

    assert.equal(snapshot.provider_continuous_proof.continuous_proof_status, 'all_observed_proofs_proven');
    assert.equal(proofItem.status, 'all_observed_proofs_proven');
    assert.equal(proofItem.action_owner, 'none');
    assert.equal(proofItem.requires_user_action, false);
    assert.equal(proofItem.provider_continuous_proof.latest_closeout_status, 'production_residency_proven');
    assert.equal(proofItem.provider_continuous_proof.slo_execution_receipt_event_count, 0);
    assert.equal(proofItem.provider_continuous_proof.latest_event_created_at, proofCreatedAt);
    assert.equal(typeof proofItem.provider_continuous_proof.latest_event_age_seconds, 'number');
    assert.equal(proofItem.provider_continuous_proof.proof_freshness_status, 'fresh');
    assert.equal(proofItem.provider_continuous_proof.proof_slo_status, 'proof_fresh');
    assert.equal(proofItem.provider_continuous_proof.operator_slo_repair_loop.repair_state, 'cadence_current');
    assert.equal(
      proofItem.provider_continuous_proof.operator_slo_repair_loop.latest_receipt_summary.receipt_status,
      'proven',
    );
    assert.equal(
      proofItem.provider_continuous_proof.operator_slo_repair_loop.execution_receipts.event_count,
      0,
    );
    assert.equal(
      proofItem.provider_continuous_proof.operator_slo_repair_loop.authority_boundary.can_authorize_domain_ready,
      false,
    );
    assert.equal(
      proofItem.provider_continuous_proof.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot routes stale proven provider proof to operator attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-provider-proof-stale-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_stale',
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
    '2026-05-13T00:00:00.000Z'
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
