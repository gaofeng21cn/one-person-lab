import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';
import {
  runObservabilityCollectorSmoke,
  startObservabilityMetricsEndpoint,
} from '../../../../src/modules/runway/observability-export.ts';
import { assert, createFamilyContractsFixtureRoot, fs, installRuntimePackageFixture, loadFrameworkContracts, os, path, repoRoot, runCli, runCliRaw, test } from '../helpers.ts';

test('runtime observability export aggregates provider, stage, gate, memory, and SLO receipt counters read-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-observability-export-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    installRuntimePackageFixture(stateRoot, 'mas');
    installRuntimePackageFixture(stateRoot, 'rca');
    installRuntimePackageFixture(stateRoot, 'mag');
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
      'temporal',
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
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
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
      'temporal',
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
    db.prepare("UPDATE stage_attempts SET status = 'human_gate', human_gate_refs_json = '[\\"gate:review\\"]', blocked_reason = NULL WHERE stage_attempt_id = ?").run(${JSON.stringify(gatedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id)});
    db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(deadLetterAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id)});
    db.prepare("INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?)").run('sig_observability_human_gate_fixture', ${JSON.stringify(gatedAttempt.family_runtime_stage_attempt.attempt.stage_attempt_id)}, 'human_gate', '{"human_gate_ref":"gate:review"}', 'test-fixture-projection', '2026-05-14T00:00:01.000Z');
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
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const observability = output.observability_export;

    assert.equal(observability.surface_kind, 'opl_runtime_observability_export');
    assert.equal(observability.format, 'json');
    assert.equal(observability.source_surfaces.includes('opl_runtime_authority_refs'), true);
    assert.equal(observability.source_surfaces.includes('opentelemetry_current_owner_delta_ref'), true);
    assert.equal(observability.provider.readiness.provider_ready, false);
    assert.equal(observability.provider.readiness.diagnostic_provider_ready, false);
    assert.equal(observability.provider.readiness.retired_local_provider_counts_as_provider_ready, false);
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
      observability.semantic_conventions.summary.collector_consumption_status,
      'collector_config_consumable_no_external_collector',
    );
    assert.equal(observability.semantic_conventions.summary.collector_config_consumable, true);
    assert.equal(
      observability.semantic_conventions.runtime_export_binding.binding_policy,
      'runtime_export_refs_only_no_payload_body_no_ready_claim',
    );
    assert.equal(
      observability.semantic_conventions.runtime_export_binding.source_surfaces.includes(
        'opentelemetry_current_owner_delta_ref',
      ),
      true,
    );
    assert.equal(
      observability.semantic_conventions.runtime_export_binding.source_projection_boundary,
      'refs_only_current_owner_projection_no_observability_ui',
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
      observability.semantic_conventions.runtime_export_binding.exporter_seed_ref,
      'semantic_conventions.exporter_seed',
    );
    assert.equal(
      observability.semantic_conventions.runtime_export_binding.owner_route_ref,
      'semantic_conventions.owner_route',
    );
    assert.equal(
      observability.semantic_conventions.exporter_seed.surface_kind,
      'opl_observability_exporter_seed',
    );
    assert.equal(
      observability.semantic_conventions.exporter_seed.seed_transport,
      'openmetrics_stdout_and_http_seed_only',
    );
    assert.equal(
      observability.semantic_conventions.exporter_seed.owner_route_ref,
      'contracts/opl-framework/observability-semantic-conventions-contract.json#/export_readback_seed/owner_route',
    );
    assert.equal(observability.semantic_conventions.owner_route.owner, 'OPL Observability');
    assert.equal(
      observability.semantic_conventions.owner_route.worklist_item,
      'otlp_exporter_live_endpoint',
    );
    assert.equal(
      observability.semantic_conventions.owner_route.owner_route_status,
      'owner_live_evidence_required',
    );
    assert.equal(
      observability.semantic_conventions.summary.owner_route_status,
      'owner_live_evidence_required',
    );
    assert.equal(
      observability.semantic_conventions.exporter_signal_mapping.metrics.exporter_signal,
      'openmetrics_gauge_seed',
    );
    assert.equal(observability.semantic_conventions.collector_export_boundary.external_collector_connected, false);
    assert.equal(observability.semantic_conventions.collector_export_boundary.exporter_seed_only, true);
    assert.equal(observability.semantic_conventions.collector_export_boundary.payload_body_exported, false);
    assert.equal(
      observability.semantic_conventions.collector_consumption_config.collector_kind,
      'opentelemetry_collector',
    );
    assert.equal(
      observability.semantic_conventions.collector_consumption_config.receiver,
      'prometheus',
    );
    assert.equal(
      observability.semantic_conventions.collector_consumption_config.receiver_input_format,
      'openmetrics',
    );
    assert.equal(
      observability.semantic_conventions.collector_consumption_config.scrape_endpoint.source_endpoint_command,
      'opl runtime observability-endpoint --port 9464 --metrics-path /metrics',
    );
    assert.deepEqual(
      observability.semantic_conventions.collector_consumption_config.config.service.pipelines.metrics,
      {
        receivers: ['prometheus'],
        processors: ['batch'],
        exporters: ['debug'],
      },
    );
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
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    assert.match(openMetrics.stdout, /# TYPE opl_provider_ready gauge/);
    assert.match(openMetrics.stdout, /opl_provider_ready\{provider_kind="temporal"\} 0/);
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
    assert.match(openMetrics.stdout, /# TYPE opl_observability_collector_consumption_config gauge/);
    assert.match(openMetrics.stdout, /opl_observability_collector_consumption_config\{[^}]*collector_kind="opentelemetry_collector"[^}]*\} 1/);
    assert.match(openMetrics.stdout, /opl_observability_collector_consumption_config\{[^}]*receiver="prometheus"[^}]*\} 1/);
    assert.match(openMetrics.stdout, /opl_observability_collector_consumption_config\{[^}]*config_consumable="true"[^}]*\} 1/);
    assert.match(openMetrics.stdout, /opl_authority_boundary\{can_execute_repair="false",can_write_domain_truth="false",can_authorize_quality_verdict="false",can_authorize_ready_verdict="false"\} 1/);

    const collectorConfigResult = runCliRaw(['runtime', 'observability-export', '--format', 'collector-config-json'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const collectorConfig = parseJsonText(collectorConfigResult.stdout) as any;
    assert.deepEqual(collectorConfig.service.pipelines.metrics, {
      receivers: ['prometheus'],
      processors: ['batch'],
      exporters: ['debug'],
    });
    assert.equal(
      collectorConfig.receivers.prometheus.config.scrape_configs[0].job_name,
      'opl_runtime_observability_export',
    );
    assert.equal(
      collectorConfig.receivers.prometheus.config.scrape_configs[0].static_configs[0].targets[0],
      '127.0.0.1:9464',
    );
    assert.equal(JSON.stringify(collectorConfig).includes('must-not-leak'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime observability metrics endpoint serves the OpenMetrics export over HTTP read-only', async () => {
  const handle = await startObservabilityMetricsEndpoint({
    contracts: loadFrameworkContracts(repoRoot),
    host: '127.0.0.1',
    port: 0,
    once: true,
    runtimeSnapshotProvider: async () => ({
      runtime_tray_snapshot: {
        last_updated: '2026-07-04T00:00:00.000Z',
        runtime_health: {
          provider_kind: 'temporal',
          provider_ready: false,
          status: 'ready',
        },
        provider_continuous_proof: {
          proof_event_count: 0,
          proven_event_count: 0,
          continuous_proof_status: 'not_claimed',
          proof_slo_status: 'not_claimed',
          proof_freshness_status: 'not_claimed',
          operator_slo_repair_loop: {
            execution_receipts: {
              event_count: 0,
              executed_count: 0,
              skipped_count: 0,
              blocked_count: 0,
              proven_count: 0,
              receipt_policy: 'refs_only',
            },
          },
        },
        stage_attempt_workbench: {
          summary: {
            total: 1,
            by_status: {
              completed: 1,
            },
            by_domain: {
              medautoscience: 1,
            },
            by_stage: {
              analysis: 1,
            },
            attention_counters: {},
            memory_ref_counters: {
              attempts_with_consumed_memory_refs: 0,
              attempts_with_writeback_receipt_refs: 0,
            },
          },
          attempts: [
            {
              stage_attempt_id: 'sat_endpoint',
              attempt_id: 'attempt_endpoint',
              domain_id: 'medautoscience',
              local_status: 'completed',
              workflow_id: 'workflow_endpoint',
              task_queue: 'opl-runtime-test',
              source_fingerprint: 'sha256:endpoint',
              usage_projection: {
                retry_budget: {
                  used_attempts: 0,
                },
                duration: {
                  duration_ms_observed: 123,
                },
              },
            },
          ],
          memory_locator_index: {
            summary: {
              consumed_memory_ref_count: 0,
              writeback_receipt_ref_count: 0,
              rejected_write_count: 0,
            },
          },
        },
        app_operator_drilldown: {
          current_owner_delta: {
            stage_attempt_id: 'sat_endpoint',
            stage_run_id: 'stage-run:endpoint',
            current_owner: 'OPL Runway',
            domain_id: 'medautoscience',
            route_ref: 'route:endpoint',
            receipt_ref: 'receipt:endpoint',
            generation: 1,
            source_fingerprint: 'sha256:endpoint',
          },
          attention_first_payload: {
            current_owner_delta: {},
          },
        },
        source_refs: [],
      },
    }),
  });

  try {
    assert.equal(handle.readback.surface_kind, 'opl_observability_metrics_endpoint');
    assert.equal(handle.readback.endpoint.metrics_path, '/metrics');
    assert.equal(handle.readback.authority_boundary.can_write_domain_truth, false);
    assert.equal(handle.readback.authority_boundary.can_claim_runtime_ready, false);
    assert.equal(handle.readback.authority_boundary.external_collector_connected, false);
    assert.equal(handle.readback.server_runtime, 'node_http_standard_library');
    assert.equal(handle.readback.exporter_seed.live_endpoint_configured, false);
    assert.equal(
      handle.readback.owner_route.worklist_item,
      'otlp_exporter_live_endpoint',
    );
    assert.equal(
      handle.readback.readback_boundary.boundary_status,
      'bounded_endpoint_readback_only',
    );
    assert.equal(
      handle.readback.readback_boundary.does_not_prove.includes('otlp_exporter_live_endpoint'),
      true,
    );

    const response = await fetch(handle.readback.endpoint.url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /openmetrics/);
    assert.equal(response.headers.get('x-opl-authority-boundary'), 'read_only_non_authoritative');
    const body = await response.text();

    assert.match(body, /# TYPE opl_provider_ready gauge/);
    assert.match(body, /opl_provider_ready\{provider_kind="temporal"\} 0/);
    assert.match(body, /# TYPE opl_queue_length gauge/);
    assert.match(body, /opl_queue_length(?:\{[^}]*\})? 1/);
    assert.match(body, /opl_observability_collector_consumption_config\{[^}]*metrics_path="\/metrics"[^}]*\} 1/);
    assert.match(body, /opl_authority_boundary\{can_execute_repair="false",can_write_domain_truth="false",can_authorize_quality_verdict="false",can_authorize_ready_verdict="false"\} 1/);
    assert.equal(body.includes('must-not-leak'), false);

    await handle.closed;
  } finally {
    handle.close();
  }
});

test('runtime observability collector smoke observes fake Collector debug output', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-fake-otelcol-'));
  const fakeCollector = path.join(tempRoot, 'otelcol-fake');
  fs.writeFileSync(
    fakeCollector,
    [
      '#!/bin/sh',
      'test "$1" = "--config" || exit 2',
      'test -f "$2" || exit 3',
      'grep -q \'"receivers"\' "$2" || exit 4',
      'printf "%s\\n" "debug exporter metric opl_provider_ready 1" >&2',
      'sleep 2',
    ].join('\n'),
  );
  fs.chmodSync(fakeCollector, 0o755);

  try {
    const output = runCli(['runtime', 'observability-collector-smoke', '--timeout-ms', '2000'], {
      OPL_OTELCOL_COMMAND: fakeCollector,
    });
    const smoke = output.observability_collector_smoke;

    assert.equal(smoke.surface_kind, 'opl_observability_collector_smoke');
    assert.equal(smoke.schema_version, 'observability_collector_smoke.v1');
    assert.equal(smoke.status, 'observed');
    assert.equal(smoke.collector.command_source, 'OPL_OTELCOL_COMMAND');
    assert.equal(smoke.collector.resolved_command, fakeCollector);
    assert.equal(smoke.endpoint.mode, 'started_local_endpoint');
    assert.equal(smoke.endpoint.metrics_path, '/metrics');
    assert.match(smoke.endpoint.target, /^127\.0\.0\.1:\d+$/);
    assert.equal(smoke.collector_config.receiver, 'prometheus');
    assert.equal(smoke.collector_config.exporter, 'debug');
    assert.equal(fs.existsSync(smoke.collector_config.config_file), true);
    const config = parseJsonText(fs.readFileSync(smoke.collector_config.config_file, 'utf8')) as any;
    assert.equal(config.receivers.prometheus.config.scrape_configs[0].metrics_path, '/metrics');
    assert.deepEqual(config.processors.batch, {
      timeout: '1s',
      send_batch_size: 1,
    });
    assert.deepEqual(
      config.service.pipelines.metrics,
      {
        receivers: ['prometheus'],
        processors: ['batch'],
        exporters: ['debug'],
      },
    );
    assert.equal(smoke.evidence.collector_process_started, true);
    assert.equal(smoke.evidence.collector_consumption_observed, true);
    assert.equal(smoke.evidence.observed_metric_name, 'opl_provider_ready');
    assert.equal(smoke.evidence.observed_stream, 'stderr');
    assert.equal(smoke.typed_blocker, null);
    assert.equal(smoke.authority_boundary.external_collector_connected, true);
    assert.equal(smoke.authority_boundary.payload_body_exported, false);
    assert.equal(smoke.authority_boundary.can_write_domain_truth, false);
    assert.equal(smoke.authority_boundary.can_create_owner_receipt, false);
    assert.equal(smoke.authority_boundary.can_create_typed_blocker, false);
    assert.equal(smoke.authority_boundary.can_claim_runtime_ready, false);
    assert.equal(smoke.authority_boundary.can_claim_domain_ready, false);
    assert.equal(smoke.authority_boundary.can_claim_production_ready, false);
    assert.equal(smoke.owner_route.owner, 'OPL Observability');
    assert.equal(smoke.owner_route.worklist_item, 'otlp_exporter_live_endpoint');
    assert.equal(smoke.readback_boundary.endpoint_mode, 'started_local_endpoint');
    assert.equal(smoke.readback_boundary.collector_consumption_observed, true);
    assert.equal(smoke.readback_boundary.external_collector_connected, true);
    fs.rmSync(path.dirname(smoke.collector_config.config_file), { recursive: true, force: true });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('runtime observability collector smoke local endpoint is deterministic and closes Collector process', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-fetching-otelcol-'));
  const fakeCollector = path.join(tempRoot, 'otelcol-fetching-fake');
  const fakeCollectorModule = `${fakeCollector}.mjs`;
  const jsonFileModule = pathToFileURL(path.join(repoRoot, 'src/kernel/json-file.ts')).href;
  fs.writeFileSync(
    fakeCollectorModule,
    [
      "import { readFileSync } from 'node:fs';",
      `import { parseJsonText } from ${JSON.stringify(jsonFileModule)};`,
      "if (process.argv[2] !== '--config') process.exit(2);",
      "const config = parseJsonText(readFileSync(process.argv[3], 'utf8'));",
      'const scrape = config.receivers.prometheus.config.scrape_configs[0];',
      "const target = scrape.static_configs[0].targets[0];",
      "const scheme = scrape.scheme || 'http';",
      "const metricsPath = scrape.metrics_path || '/metrics';",
      "fetch(`${scheme}://${target}${metricsPath}`)",
      "  .then(async (response) => ({ status: response.status, body: await response.text() }))",
      "  .then(({ status, body }) => {",
      "    if (status !== 200 || !body.includes('opl_provider_ready') || !body.includes('provider_kind=\"collector_smoke\"') || !body.includes('opl_queue_length')) {",
      "      console.error(body);",
      '      process.exit(5);',
      '    }',
      '    console.error(body);',
      "    setInterval(() => {}, 1000);",
      '  })',
      "  .catch((error) => { console.error(error && error.stack ? error.stack : String(error)); process.exit(6); });",
    ].join('\n'),
  );
  fs.writeFileSync(
    fakeCollector,
    [
      '#!/bin/sh',
      `exec ${JSON.stringify(process.execPath)} --experimental-strip-types ${JSON.stringify(fakeCollectorModule)} "$@"`,
    ].join('\n'),
  );
  fs.chmodSync(fakeCollector, 0o755);

  try {
    const smoke = await runObservabilityCollectorSmoke({
      contracts: loadFrameworkContracts(repoRoot),
      collectorCommand: fakeCollector,
      timeoutMs: 5000,
      runtimeSnapshotProvider: async () => {
        throw new Error('collector smoke local endpoint must not depend on live runtime snapshot provider');
      },
    });

    assert.equal(smoke.status, 'observed');
    assert.equal(smoke.evidence.collector_process_started, true);
    assert.equal(smoke.evidence.collector_consumption_observed, true);
    assert.match(
      smoke.evidence.observed_metric_name ?? '',
      /^(opl_provider_ready|opl_queue_length|opl_observability_collector_consumption_config)$/,
    );
    assert.equal(smoke.evidence.observed_stream, 'stderr');
    assert.equal(smoke.authority_boundary.external_collector_connected, true);
    assert.equal(smoke.authority_boundary.can_claim_runtime_ready, false);
    const configFile = smoke.collector_config.config_file;
    if (!configFile) throw new Error('collector smoke should expose the generated Collector config file');
    fs.rmSync(path.dirname(configFile), { recursive: true, force: true });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('runtime observability collector smoke returns typed blocker when Collector binary is missing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-missing-otelcol-'));
  const missingCollector = path.join(tempRoot, 'missing-otelcol');

  try {
    const output = runCli([
      'runtime',
      'observability-collector-smoke',
      '--collector-command',
      missingCollector,
      '--timeout-ms',
      '50',
    ]);
    const smoke = output.observability_collector_smoke;

    assert.equal(smoke.status, 'blocked');
    assert.equal(smoke.collector.command_source, 'missing');
    assert.equal(smoke.collector.command, null);
    assert.deepEqual(smoke.collector.attempted_commands, [missingCollector]);
    assert.equal(smoke.evidence.collector_process_started, false);
    assert.equal(smoke.evidence.collector_consumption_observed, false);
    assert.equal(smoke.typed_blocker.blocker_type, 'collector_binary_missing');
    assert.equal(smoke.typed_blocker.next_owner, 'operator');
    assert.equal(smoke.authority_boundary.external_collector_connected, false);
    assert.equal(smoke.authority_boundary.payload_body_exported, false);
    assert.equal(smoke.authority_boundary.can_claim_runtime_ready, false);
    assert.equal(smoke.authority_boundary.can_claim_domain_ready, false);
    assert.equal(smoke.authority_boundary.can_claim_production_ready, false);
    assert.equal(smoke.owner_route.owner_route_status, 'owner_live_evidence_required');
    assert.equal(smoke.readback_boundary.endpoint_mode, 'started_local_endpoint');
    assert.equal(smoke.readback_boundary.collector_consumption_observed, false);
    assert.equal(
      smoke.readback_boundary.does_not_prove.includes('otlp_exporter_live_endpoint'),
      true,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
