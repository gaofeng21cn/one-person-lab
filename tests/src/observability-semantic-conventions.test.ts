import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS,
  appOperatorProjectionCommand,
  appOperatorProjectionRef,
  appOperatorProjectionTestRef,
  buildObservabilitySemanticConventionExportSeed,
  buildObservabilitySemanticConventionReadback,
  renderObservabilitySemanticConventionOpenMetrics,
} from '../../src/modules/ledger/observability-semantic-conventions.ts';
import { buildEvidenceEnvelopeProjection } from '../../src/modules/ledger/evidence-envelope.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

const expectedFields = [
  'stage_run_id',
  'attempt_id',
  'domain_id',
  'owner_id',
  'route_ref',
  'receipt_ref',
  'typed_blocker_ref',
  'workflow_id',
  'task_queue',
  'generation',
  'source_fingerprint',
];
const expectedOtelAttributes = [
  'opl.stage_run.id',
  'opl.stage_attempt.id',
  'opl.domain.id',
  'opl.owner.id',
  'opl.route.ref',
  'opl.receipt.ref',
  'opl.typed_blocker.ref',
  'opl.workflow.id',
  'opl.task_queue.name',
  'opl.generation',
  'opl.source.fingerprint',
];

function contract() {
  return parseJsonText(
    fs.readFileSync(
      new URL('../../contracts/opl-framework/observability-semantic-conventions-contract.json', import.meta.url),
      'utf8',
    ),
  ) as {
    schema_version: string;
    fields: Array<{ id: string; otel_attribute: string }>;
    signal_mappings: Record<string, { canonical_fields: string[]; instruments?: string[] }>;
    export_readback_seed: Record<string, unknown>;
    authority_boundary: Record<string, boolean>;
  };
}

test('observability semantic conventions freeze the OPL vocabulary and signal mappings', () => {
  const semanticContract = contract();

  assert.equal(semanticContract.schema_version, 'opl_observability_semantic_conventions.v1');
  assert.deepEqual(semanticContract.fields.map((field) => field.id), expectedFields);
  assert.deepEqual(OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.fields.map((field) => field.id), expectedFields);
  assert.deepEqual(
    semanticContract.fields.map((field) => field.otel_attribute),
    expectedOtelAttributes,
  );
  assert.deepEqual(
    OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.trace_span.canonical_fields,
    [
      'stage_run_id',
      'attempt_id',
      'domain_id',
      'owner_id',
      'route_ref',
      'workflow_id',
      'task_queue',
      'generation',
      'source_fingerprint',
    ],
  );
  assert.deepEqual(
    OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.metric.instruments,
    ['queue_length', 'retry_count', 'dead_letter_count', 'latency_ms', 'error_count'],
  );
  assert.deepEqual(
    OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.log_event.canonical_fields,
    [
      'stage_run_id',
      'attempt_id',
      'domain_id',
      'owner_id',
      'route_ref',
      'receipt_ref',
      'typed_blocker_ref',
      'source_fingerprint',
    ],
  );
  assert.equal(semanticContract.export_readback_seed.surface_kind, 'opl_observability_export_readback_seed');
  assert.deepEqual(semanticContract.export_readback_seed.formats, ['json', 'openmetrics', 'collector-config-json']);
  assert.deepEqual(semanticContract.export_readback_seed.forbidden_body_fields, [
    'body',
    'artifact_body',
    'artifact_content',
    'payload_body',
    'memory_body',
  ]);
  assert.equal(
    (semanticContract.export_readback_seed.exporter_signal_mapping as any).metrics.exporter_signal,
    'openmetrics_gauge_seed',
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_export_boundary as any).external_collector_connected,
    false,
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_export_boundary as any).exporter_seed_only,
    true,
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_export_boundary as any).runtime_ready_claim,
    'not_claimed',
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_config as any).collector_kind,
    'opentelemetry_collector',
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_config as any).receiver,
    'prometheus',
  );
  assert.deepEqual(
    (semanticContract.export_readback_seed.collector_consumption_config as any).config.service.pipelines.metrics,
    {
      receivers: ['prometheus'],
      processors: ['batch'],
      exporters: ['debug'],
    },
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_config as any)
      .config.receivers.prometheus.config.scrape_configs[0].scrape_interval,
    '1s',
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_config as any).config.exporters.debug.verbosity,
    'detailed',
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_config as any).scrape_endpoint.metrics_path,
    '/metrics',
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_config as any).scrape_endpoint.source_endpoint_command,
    'opl runtime observability-endpoint --port 9464 --metrics-path /metrics',
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_smoke as any).command_id,
    'runtime observability-collector-smoke',
  );
  assert.deepEqual(
    (semanticContract.export_readback_seed.collector_consumption_smoke as any).collector_command_resolution_order,
    ['--collector-command', 'OPL_OTELCOL_COMMAND', 'otelcol-contrib', 'otelcol'],
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_smoke as any).payload_body_exported,
    false,
  );
  assert.equal(
    (semanticContract.export_readback_seed.collector_consumption_smoke as any).runtime_ready_claim,
    'not_claimed',
  );
  assert.equal(semanticContract.export_readback_seed.readiness_claim, 'not_claimed');
  assert.equal(semanticContract.authority_boundary.ledger_refs_only, true);
  assert.equal(semanticContract.authority_boundary.can_create_private_ledger_ui, false);
  assert.equal(semanticContract.authority_boundary.can_claim_runtime_ready, false);
});

test('observability helper owns legacy Console operator projection refs', () => {
  const legacyTerm = ['drill', 'down'].join('');
  assert.equal(
    appOperatorProjectionCommand({ json: true }),
    `opl runtime app-operator-${legacyTerm} --json`,
  );
  assert.equal(
    appOperatorProjectionCommand({ detail: 'full', json: true }),
    `opl runtime app-operator-${legacyTerm} --detail full --json`,
  );
  assert.equal(
    appOperatorProjectionRef('semantic_conventions'),
    `/runtime_tray_snapshot/app_operator_${legacyTerm}/semantic_conventions`,
  );
  assert.equal(
    appOperatorProjectionTestRef(),
    `tests/src/cli/cases/runtime-app-operator-${legacyTerm}.test.ts`,
  );
});

test('observability readback projects current owner refs without becoming a ledger UI', () => {
  const readback = buildObservabilitySemanticConventionReadback({
    current_owner_delta: {
      stage_run_id: 'stage-run:mas:review',
      current_owner: 'medautoscience',
      domain_id: 'medautoscience',
      route_ref: 'route:mas:review',
      receipt_ref: 'receipt:mas:review',
      typed_blocker_ref: 'typed-blocker:mas:owner-gate',
      source_fingerprint: 'sha256:source',
    },
    stage_attempt: {
      stage_attempt_id: 'sat_123',
      generation: 3,
    },
    provider_attempt: {
      workflow_id: 'workflow:mas:review',
      task_queue: 'opl-family-runtime',
    },
    artifact_body: 'must-not-leak',
  });

  assert.equal(readback.surface_kind, 'opl_observability_semantic_conventions_readback');
  assert.equal(readback.authority_boundary.ledger_refs_only, true);
  assert.equal(readback.authority_boundary.can_create_private_ledger_ui, false);
  assert.equal(readback.authority_boundary.can_store_payload_body, false);
  assert.deepEqual(readback.forbidden_body_fields_present, ['artifact_body']);
  assert.deepEqual(readback.forbidden_body_fields, [
    'body',
    'artifact_body',
    'artifact_content',
    'payload_body',
    'memory_body',
  ]);
  assert.equal(readback.exporter_signal_mapping.traces.otel_signal, 'trace');
  assert.equal(readback.collector_export_boundary.can_create_private_ledger_ui, false);
  assert.equal(readback.collector_export_boundary.payload_body_exported, false);
  assert.deepEqual(readback.canonical_attributes, {
    stage_run_id: 'stage-run:mas:review',
    attempt_id: 'sat_123',
    domain_id: 'medautoscience',
    owner_id: 'medautoscience',
    route_ref: 'route:mas:review',
    receipt_ref: 'receipt:mas:review',
    typed_blocker_ref: 'typed-blocker:mas:owner-gate',
    workflow_id: 'workflow:mas:review',
    task_queue: 'opl-family-runtime',
    generation: 3,
    source_fingerprint: 'sha256:source',
  });
  assert.equal(readback.signals.trace_span.attributes['opl.stage_run.id'], 'stage-run:mas:review');
  assert.equal(readback.signals.metric.attributes['opl.task_queue.name'], 'opl-family-runtime');
  assert.equal(readback.signals.log_event.attributes['opl.receipt.ref'], 'receipt:mas:review');
  assert.deepEqual(readback.signals.log_event.ref_fields, ['route_ref', 'receipt_ref', 'typed_blocker_ref']);
});

test('observability export seed groups trace metric and log signals without payload body or readiness claims', () => {
  const seed = buildObservabilitySemanticConventionExportSeed({
    current_owner_delta: {
      stage_run_id: 'stage-run:mas:review',
      current_owner: 'medautoscience',
      domain_id: 'medautoscience',
      route_ref: 'route:mas:review',
      receipt_ref: 'receipt:mas:review',
      typed_blocker_ref: 'typed-blocker:mas:owner-gate',
      source_fingerprint: 'sha256:source',
    },
    stage_attempt: {
      attempt_id: 'sat_123',
      generation: 3,
    },
    provider_attempt: {
      workflow_id: 'workflow:mas:review',
      task_queue: 'opl-family-runtime',
    },
    metric_values: {
      queue_length: 7,
      latency_ms: 1200,
    },
    payload_body: 'must-not-leak',
  });

  assert.equal(seed.surface_kind, 'opl_observability_export_readback_seed');
  assert.equal(seed.summary.readiness_claim, 'not_claimed');
  assert.equal(seed.summary.collector_export_boundary, 'seed_only_no_external_collector');
  assert.equal(seed.summary.collector_consumption_status, 'collector_config_consumable_no_external_collector');
  assert.equal(seed.summary.collector_config_consumable, true);
  assert.equal(seed.summary.observed_metric_count, 2);
  assert.equal(seed.collector_export_boundary.collector_kind, 'not_configured');
  assert.equal(seed.collector_export_boundary.external_collector_connected, false);
  assert.equal(seed.collector_export_boundary.exporter_seed_only, true);
  assert.equal(seed.collector_export_boundary.payload_body_exported, false);
  assert.equal(seed.collector_consumption_config.collector_kind, 'opentelemetry_collector');
  assert.equal(seed.collector_consumption_config.receiver, 'prometheus');
  assert.equal(seed.collector_consumption_config.receiver_input_format, 'openmetrics');
  assert.equal(seed.collector_consumption_config.scrape_endpoint.default_target, '127.0.0.1:9464');
  assert.equal(seed.collector_consumption_config.scrape_endpoint.endpoint_required, true);
  assert.equal(
    seed.collector_consumption_config.scrape_endpoint.source_endpoint_command,
    'opl runtime observability-endpoint --port 9464 --metrics-path /metrics',
  );
  assert.deepEqual(seed.collector_consumption_config.config.service.pipelines.metrics.receivers, ['prometheus']);
  assert.deepEqual(seed.collector_consumption_config.config.service.pipelines.metrics.processors, ['batch']);
  assert.deepEqual(seed.collector_consumption_config.config.service.pipelines.metrics.exporters, ['debug']);
  assert.equal(
    seed.collector_consumption_config.config.receivers.prometheus.config.scrape_configs[0].job_name,
    'opl_runtime_observability_export',
  );
  assert.equal(seed.exporter_signal_mapping.metrics.exporter_signal, 'openmetrics_gauge_seed');
  assert.equal(seed.authority_boundary.can_store_payload_body, false);
  assert.equal(seed.authority_boundary.can_claim_runtime_ready, false);
  assert.deepEqual(seed.forbidden_body_fields_present, ['payload_body']);
  assert.equal(seed.signal_groups.traces[0].span_name, 'opl.stage_attempt');
  assert.equal(seed.signal_groups.traces[0].attributes['opl.stage_attempt.id'], 'sat_123');
  assert.equal(seed.signal_groups.metrics[0].openmetrics_name, 'opl_queue_length');
  assert.equal(seed.signal_groups.metrics[0].value, 7);
  assert.equal(seed.signal_groups.logs[0].body_included, false);
  assert.equal(JSON.stringify(seed).includes('must-not-leak'), false);

  const openmetrics = renderObservabilitySemanticConventionOpenMetrics(seed);
  assert.match(openmetrics, /# TYPE opl_queue_length gauge/);
  assert.match(openmetrics, /opl_queue_length\{[^}]*opl_domain_id="medautoscience"[^}]*\} 7/);
  assert.match(openmetrics, /opl_latency_ms\{[^}]*opl_task_queue_name="opl-family-runtime"[^}]*\} 1200/);
  assert.match(openmetrics, /# TYPE opl_observability_exporter_signal_mapping gauge/);
  assert.match(openmetrics, /opl_observability_exporter_signal_mapping\{[^}]*metrics="openmetrics_gauge_seed"[^}]*\} 1/);
  assert.match(openmetrics, /# TYPE opl_observability_collector_export_boundary gauge/);
  assert.match(openmetrics, /opl_observability_collector_export_boundary\{[^}]*external_collector_connected="false"[^}]*\} 1/);
  assert.match(openmetrics, /opl_observability_collector_export_boundary\{[^}]*payload_body_exported="false"[^}]*\} 1/);
  assert.match(openmetrics, /opl_observability_collector_export_boundary\{[^}]*runtime_ready_claim="not_claimed"[^}]*\} 1/);
  assert.match(openmetrics, /# TYPE opl_observability_collector_consumption_config gauge/);
  assert.match(openmetrics, /opl_observability_collector_consumption_config\{[^}]*collector_kind="opentelemetry_collector"[^}]*\} 1/);
  assert.match(openmetrics, /opl_observability_collector_consumption_config\{[^}]*receiver="prometheus"[^}]*\} 1/);
  assert.match(openmetrics, /opl_observability_collector_consumption_config\{[^}]*config_consumable="true"[^}]*\} 1/);
  assert.match(openmetrics, /can_claim_runtime_ready="false"/);
  assert.equal(openmetrics.includes('must-not-leak'), false);
});

test('evidence envelope projection binds operator readback to semantic convention signals', () => {
  const projection = buildEvidenceEnvelopeProjection({
    appOperatorDrilldown: {
      operator_action_routing_refs: {
        refs: [
          {
            action_kind: 'stage_production_evidence_record',
            domain_id: 'medautoscience',
            stage_id: 'review',
            action_ref: 'route:stage-evidence',
          },
        ],
      },
      app_execution_bridge: { safe_action_routes: [] },
      stage_production_evidence: {
        stages: [
          {
            target_domain_id: 'medautoscience',
            stage_id: 'review',
            owner: 'medautoscience',
            missing_production_evidence: ['owner_receipt'],
            domain_owned_typed_blocker_refs: ['typed-blocker:stage'],
            stage_evidence_receipt_refs: [],
            ref: 'stage-evidence:review',
          },
        ],
      },
      domain_evidence_request_refs: {},
      domain_dispatch_evidence: {},
      domain_legacy_cleanup_plan_refs: {},
    },
  });

  const semanticConventions = projection.semantic_conventions;
  assert.equal(semanticConventions.surface_kind, 'opl_observability_export_readback_seed');
  assert.equal(
    semanticConventions.summary.semantic_convention_status,
    'evidence_envelope_projection_bound',
  );
  assert.equal(
    semanticConventions.evidence_envelope_binding.binding_policy,
    'evidence_envelope_refs_only_trace_metric_log_event_model',
  );
  assert.equal(
    semanticConventions.signal_groups.traces[0].attributes['opl.domain.id'],
    'med-autoscience',
  );
  assert.equal(
    semanticConventions.signal_groups.logs[0].attributes['opl.typed_blocker.ref'],
    'typed-blocker:stage',
  );
  assert.equal(
    semanticConventions.signal_groups.metrics.find((metric) => metric.instrument === 'queue_length')?.value,
    0,
  );
  assert.equal(
    semanticConventions.signal_groups.metrics.find((metric) => metric.instrument === 'error_count')?.value,
    1,
  );
  assert.equal(semanticConventions.authority_boundary.can_create_private_ledger_ui, false);
  assert.equal(semanticConventions.authority_boundary.no_domain_ready_claim, true);
  assert.equal(semanticConventions.summary.body_included, false);
});
