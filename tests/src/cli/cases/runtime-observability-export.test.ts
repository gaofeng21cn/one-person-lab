import { spawnSync } from 'node:child_process';

import { assert, createFamilyContractsFixtureRoot, fs, os, path, repoRoot, runCli, runCliRaw, test } from '../helpers.ts';

test('runtime observability export aggregates provider, stage, gate, memory, and SLO receipt counters read-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-observability-export-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const proofResult = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_proof_observability',
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
    ${JSON.stringify(new Date().toISOString())}
  );
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_provider_slo_receipt_observability',
    'temporal_provider_slo_execution_receipt',
    'test',
    JSON.stringify({
      surface_kind: 'opl_temporal_provider_slo_execution_receipt',
      provider_kind: 'temporal',
      execution_status: 'executed',
      receipt_status: 'proven',
      receipt_kind: 'opl_temporal_provider_slo_execution_receipt'
    }),
    ${JSON.stringify(new Date().toISOString())}
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
    assert.equal(proofResult.status, 0, proofResult.stderr);

    const completedAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      completedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"domain_ready_verdict":"domain_gate_pending"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const gatedAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'family-runtime',
      'attempt',
      'signal',
      gatedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--kind',
      'human_gate',
      '--payload',
      '{"human_gate_ref":"gate:review"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const deadLetterAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'draft',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const statusResult = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("UPDATE stage_attempts SET status = 'human_gate' WHERE stage_attempt_id = ?").run(${JSON.stringify(gatedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id)});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(deadLetterAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id)});
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(statusResult.status, 0, statusResult.stderr);

    const output = runCli(['runtime', 'observability-export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const observability = output.observability_export;

    assert.equal(observability.surface_kind, 'opl_runtime_observability_export');
    assert.equal(observability.format, 'json');
    assert.equal(observability.provider.readiness.provider_ready, true);
    assert.equal(observability.provider.proof_counts.proof_event_count, 1);
    assert.equal(observability.provider.proof_counts.proven_event_count, 1);
    assert.equal(observability.stage_attempts.total, 3);
    assert.equal(observability.stage_attempts.by_status.completed, 1);
    assert.equal(observability.stage_attempts.by_status.human_gate, 1);
    assert.equal(observability.stage_attempts.by_status.dead_lettered, 1);
    assert.equal(observability.stage_attempts.by_domain.medautoscience, 1);
    assert.equal(observability.gates_and_blockers.human_gate_count, 1);
    assert.equal(observability.gates_and_blockers.dead_letter_count, 1);
    assert.equal(observability.gates_and_blockers.blocker_count, 1);
    assert.equal(observability.memory_writeback.writeback_receipt_count, 1);
    assert.equal(observability.memory_writeback.rejected_write_count, 1);
    assert.equal(observability.slo_receipt_history.event_count, 1);
    assert.equal(observability.slo_receipt_history.executed_count, 1);
    assert.equal(observability.slo_receipt_history.proven_count, 1);
    assert.equal(observability.semantic_conventions.surface_kind, 'opl_observability_export_readback_seed');
    assert.equal(observability.semantic_conventions.summary.semantic_convention_status, 'runtime_export_bound');
    assert.equal(observability.semantic_conventions.summary.body_included, false);
    assert.equal(
      observability.semantic_conventions.summary.collector_export_boundary,
      'seed_only_no_external_collector',
    );
    assert.equal(
      observability.semantic_conventions.runtime_export_binding.binding_policy,
      'runtime_export_refs_only_no_payload_body_no_ready_claim',
    );
    assert.equal(
      observability.semantic_conventions.runtime_export_binding.exporter_signal_mapping_ref,
      'semantic_conventions.exporter_signal_mapping',
    );
    assert.equal(
      observability.semantic_conventions.runtime_export_binding.collector_export_boundary_ref,
      'semantic_conventions.collector_export_boundary',
    );
    assert.equal(
      observability.semantic_conventions.exporter_signal_mapping.metrics.exporter_signal,
      'openmetrics_gauge_seed',
    );
    assert.equal(observability.semantic_conventions.collector_export_boundary.external_collector_connected, false);
    assert.equal(observability.semantic_conventions.collector_export_boundary.exporter_seed_only, true);
    assert.equal(observability.semantic_conventions.collector_export_boundary.payload_body_exported, false);
    assert.equal(
      observability.semantic_conventions.forbidden_body_fields.includes('payload_body'),
      true,
    );
    assert.equal(observability.semantic_conventions.authority_boundary.no_runtime_ready_claim, true);
    assert.equal(observability.semantic_conventions.authority_boundary.no_domain_ready_claim, true);
    assert.equal(observability.authority_boundary.can_execute_repair, false);
    assert.equal(observability.authority_boundary.can_write_domain_truth, false);
    assert.equal(observability.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(observability.authority_boundary.can_authorize_ready_verdict, false);

    const openMetrics = runCliRaw(['runtime', 'observability-export', '--format', 'openmetrics'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    assert.match(openMetrics.stdout, /# TYPE opl_provider_ready gauge/);
    assert.match(openMetrics.stdout, /opl_provider_ready\{provider_kind="local_sqlite"\} 1/);
    assert.match(openMetrics.stdout, /opl_stage_attempts_total\{domain_id="medautoscience",status="completed"\} 1/);
    assert.match(openMetrics.stdout, /opl_human_gate_total 1/);
    assert.match(openMetrics.stdout, /opl_dead_letter_total 1/);
    assert.match(openMetrics.stdout, /opl_blocker_total 1/);
    assert.match(openMetrics.stdout, /opl_memory_writeback_receipts_total 1/);
    assert.match(openMetrics.stdout, /opl_memory_writeback_rejected_total 1/);
    assert.match(openMetrics.stdout, /opl_provider_slo_receipts_total\{receipt_status="proven"\} 1/);
    assert.match(openMetrics.stdout, /# TYPE opl_queue_length gauge/);
    assert.match(openMetrics.stdout, /opl_queue_length(?:\{[^}]*\})? 3/);
    assert.match(openMetrics.stdout, /# TYPE opl_observability_export_boundary gauge/);
    assert.match(openMetrics.stdout, /# TYPE opl_observability_exporter_signal_mapping gauge/);
    assert.match(openMetrics.stdout, /opl_observability_exporter_signal_mapping\{[^}]*metrics="openmetrics_gauge_seed"[^}]*\} 1/);
    assert.match(openMetrics.stdout, /# TYPE opl_observability_collector_export_boundary gauge/);
    assert.match(openMetrics.stdout, /opl_observability_collector_export_boundary\{[^}]*external_collector_connected="false"[^}]*\} 1/);
    assert.match(openMetrics.stdout, /opl_observability_collector_export_boundary\{[^}]*payload_body_exported="false"[^}]*\} 1/);
    assert.match(openMetrics.stdout, /opl_observability_collector_export_boundary\{[^}]*runtime_ready_claim="not_claimed"[^}]*\} 1/);
    assert.match(openMetrics.stdout, /opl_authority_boundary\{can_execute_repair="false",can_write_domain_truth="false",can_authorize_quality_verdict="false",can_authorize_ready_verdict="false"\} 1/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
