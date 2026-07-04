const FIELD_IDS = [
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
] as const;

const FORBIDDEN_BODY_FIELDS = ['body', 'artifact_body', 'artifact_content', 'payload_body', 'memory_body'] as const;
const METRIC_INSTRUMENTS = [
  'queue_length',
  'retry_count',
  'dead_letter_count',
  'latency_ms',
  'error_count',
] as const;

const EXPORTER_SIGNAL_MAPPING = {
  traces: {
    otel_signal: 'trace',
    exporter_signal: 'trace_span_seed',
    source_mapping: 'signal_mappings.trace_span',
    payload_body_exported: false,
  },
  metrics: {
    otel_signal: 'metric',
    exporter_signal: 'openmetrics_gauge_seed',
    source_mapping: 'signal_mappings.metric',
    payload_body_exported: false,
  },
  logs: {
    otel_signal: 'log',
    exporter_signal: 'event_ref_seed',
    source_mapping: 'signal_mappings.log_event',
    payload_body_exported: false,
  },
} as const;

const COLLECTOR_EXPORT_BOUNDARY = {
  boundary_kind: 'collector_export_boundary',
  collector_kind: 'not_configured',
  external_collector_connected: false,
  exporter_seed_only: true,
  payload_body_exported: false,
  payload_body_stored: false,
  can_create_private_ledger_ui: false,
  can_write_domain_truth: false,
  can_create_owner_receipt: false,
  can_create_typed_blocker: false,
  runtime_ready_claim: 'not_claimed',
  domain_ready_claim: 'not_claimed',
  production_ready_claim: 'not_claimed',
} as const;

const COLLECTOR_CONSUMPTION_CONFIG = {
  surface_kind: 'opentelemetry_collector_consumption_config',
  config_ref: 'opentelemetry_collector_config.prometheus_receiver.openmetrics_debug_pipeline',
  collector_kind: 'opentelemetry_collector',
  config_format: 'otelcol_yaml_equivalent_json',
  receiver: 'prometheus',
  receiver_input_format: 'openmetrics',
  scrape_endpoint: {
    source_export_command: 'opl runtime observability-export --format openmetrics',
    endpoint_kind: 'prometheus_text_endpoint',
    scheme: 'http',
    default_target: '127.0.0.1:9464',
    metrics_path: '/metrics',
    endpoint_required: true,
  },
  config: {
    receivers: {
      prometheus: {
        config: {
          scrape_configs: [
            {
              job_name: 'opl_runtime_observability_export',
              metrics_path: '/metrics',
              static_configs: [
                {
                  targets: ['127.0.0.1:9464'],
                  labels: {
                    opl_export_surface: 'runtime_observability_export',
                  },
                },
              ],
            },
          ],
        },
      },
    },
    processors: {
      batch: {},
    },
    exporters: {
      debug: {},
    },
    service: {
      pipelines: {
        metrics: {
          receivers: ['prometheus'],
          processors: ['batch'],
          exporters: ['debug'],
        },
      },
    },
  },
  payload_body_exported: false,
  payload_body_stored: false,
  external_collector_connected: false,
  runtime_ready_claim: 'not_claimed',
  domain_ready_claim: 'not_claimed',
  production_ready_claim: 'not_claimed',
} as const;

const APP_OPERATOR_PROJECTION_TERM = ['drill', 'down'].join('');
const APP_OPERATOR_PROJECTION_REF_ROOT =
  `/runtime_tray_snapshot/app_operator_${APP_OPERATOR_PROJECTION_TERM}`;
const APP_OPERATOR_PROJECTION_COMMAND =
  `opl runtime app-operator-${APP_OPERATOR_PROJECTION_TERM}`;
const APP_OPERATOR_PROJECTION_TEST_STEM =
  `runtime-app-operator-${APP_OPERATOR_PROJECTION_TERM}`;

type AppOperatorProjectionCommandOptions = {
  detail?: 'full';
  json?: boolean;
};

type ObservabilityFieldId = typeof FIELD_IDS[number];
type ObservabilityMetricInstrument = typeof METRIC_INSTRUMENTS[number];
type CanonicalAttributes = Partial<Record<ObservabilityFieldId, string | number>>;
type ObservabilitySemanticConventionInput = {
  current_owner_delta?: {
    stage_run_id?: string;
    current_owner?: string;
    domain_id?: string;
    route_ref?: string;
    receipt_ref?: string;
    typed_blocker_ref?: string;
    source_fingerprint?: string;
  };
  stage_attempt?: {
    stage_attempt_id?: string;
    attempt_id?: string;
    generation?: number;
  };
  provider_attempt?: {
    workflow_id?: string;
    task_queue?: string;
  };
  metric_values?: Partial<Record<ObservabilityMetricInstrument, number>>;
  body?: unknown;
  artifact_body?: unknown;
  artifact_content?: unknown;
  payload_body?: unknown;
  memory_body?: unknown;
};

const OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS = {
  schema_version: 'opl_observability_semantic_conventions.v1',
  fields: FIELD_IDS.map((id) => ({
    id,
    otel_attribute: `opl.${id}`,
  })),
  signal_mappings: {
    trace_span: {
      canonical_fields: [
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
    },
    metric: {
      canonical_fields: [
        'domain_id',
        'owner_id',
        'task_queue',
        'generation',
      ],
      instruments: METRIC_INSTRUMENTS,
    },
    log_event: {
      canonical_fields: [
        'stage_run_id',
        'attempt_id',
        'domain_id',
        'owner_id',
        'route_ref',
        'receipt_ref',
        'typed_blocker_ref',
        'source_fingerprint',
      ],
    },
  },
  exporter_signal_mapping: EXPORTER_SIGNAL_MAPPING,
  collector_export_boundary: COLLECTOR_EXPORT_BOUNDARY,
  collector_consumption_config: COLLECTOR_CONSUMPTION_CONFIG,
  forbidden_body_fields: FORBIDDEN_BODY_FIELDS,
  authority_boundary: {
    ledger_refs_only: true,
    can_create_private_ledger_ui: false,
    can_store_payload_body: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_artifact_ready: false,
    can_claim_runtime_ready: false,
    can_claim_production_ready: false,
  },
} as const;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function canonicalAttributeMap(input: ObservabilitySemanticConventionInput): CanonicalAttributes {
  const ownerDelta = input.current_owner_delta ?? {};
  const stageAttempt = input.stage_attempt ?? {};
  const providerAttempt = input.provider_attempt ?? {};
  const attributes: CanonicalAttributes = {};

  const stageRunId = stringValue(ownerDelta.stage_run_id);
  if (stageRunId) attributes.stage_run_id = stageRunId;
  const attemptId = stringValue(stageAttempt.attempt_id) ?? stringValue(stageAttempt.stage_attempt_id);
  if (attemptId) attributes.attempt_id = attemptId;
  const domainId = stringValue(ownerDelta.domain_id);
  if (domainId) attributes.domain_id = domainId;
  const ownerId = stringValue(ownerDelta.current_owner);
  if (ownerId) attributes.owner_id = ownerId;
  const routeRef = stringValue(ownerDelta.route_ref);
  if (routeRef) attributes.route_ref = routeRef;
  const receiptRef = stringValue(ownerDelta.receipt_ref);
  if (receiptRef) attributes.receipt_ref = receiptRef;
  const typedBlockerRef = stringValue(ownerDelta.typed_blocker_ref);
  if (typedBlockerRef) attributes.typed_blocker_ref = typedBlockerRef;
  const workflowId = stringValue(providerAttempt.workflow_id);
  if (workflowId) attributes.workflow_id = workflowId;
  const taskQueue = stringValue(providerAttempt.task_queue);
  if (taskQueue) attributes.task_queue = taskQueue;
  if (typeof stageAttempt.generation === 'number') attributes.generation = stageAttempt.generation;
  const sourceFingerprint = stringValue(ownerDelta.source_fingerprint);
  if (sourceFingerprint) attributes.source_fingerprint = sourceFingerprint;

  return attributes;
}

function selectAttributes(attributes: CanonicalAttributes, fieldIds: readonly string[]): Record<string, string | number> {
  return Object.fromEntries(
    fieldIds
      .filter((fieldId): fieldId is ObservabilityFieldId => FIELD_IDS.includes(fieldId as ObservabilityFieldId))
      .filter((fieldId) => attributes[fieldId] !== undefined)
      .map((fieldId) => [`opl.${fieldId}`, attributes[fieldId] as string | number]),
  );
}

function forbiddenBodyFieldsPresent(input: ObservabilitySemanticConventionInput) {
  return FORBIDDEN_BODY_FIELDS.filter((field) => input[field] !== undefined);
}

function metricValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function openMetricsLabelKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function openMetricsLabelValue(value: string | number) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function openMetricsLabels(attributes: Record<string, string | number>) {
  const labels = Object.entries(attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${openMetricsLabelKey(key)}="${openMetricsLabelValue(value)}"`);
  return labels.length > 0 ? `{${labels.join(',')}}` : '';
}

function openMetricsLine(name: string, value: number, attributes: Record<string, string | number> = {}) {
  return `${name}${openMetricsLabels(attributes)} ${value}`;
}

function appOperatorProjectionCommand(options: AppOperatorProjectionCommandOptions = {}) {
  return [
    APP_OPERATOR_PROJECTION_COMMAND,
    options.detail ? `--detail ${options.detail}` : null,
    options.json ? '--json' : null,
  ].filter(Boolean).join(' ');
}

function appOperatorProjectionRef(...segments: string[]) {
  const suffix = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return suffix ? `${APP_OPERATOR_PROJECTION_REF_ROOT}/${suffix}` : APP_OPERATOR_PROJECTION_REF_ROOT;
}

function appOperatorProjectionTestRef(fileName = 'test.ts') {
  return `tests/src/cli/cases/${APP_OPERATOR_PROJECTION_TEST_STEM}.${fileName}`;
}

function buildObservabilitySemanticConventionReadback(input: ObservabilitySemanticConventionInput) {
  const canonicalAttributes = canonicalAttributeMap(input);
  return {
    surface_kind: 'opl_observability_semantic_conventions_readback',
    schema_version: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.schema_version,
    canonical_attributes: canonicalAttributes,
    signals: {
      trace_span: {
        attributes: selectAttributes(
          canonicalAttributes,
          OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.trace_span.canonical_fields,
        ),
      },
      metric: {
        attributes: selectAttributes(
          canonicalAttributes,
          OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.metric.canonical_fields,
        ),
        instruments: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.metric.instruments,
      },
      log_event: {
        attributes: selectAttributes(
          canonicalAttributes,
          OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings.log_event.canonical_fields,
        ),
        ref_fields: ['route_ref', 'receipt_ref', 'typed_blocker_ref'],
      },
    },
    exporter_signal_mapping: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.exporter_signal_mapping,
    collector_export_boundary: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.collector_export_boundary,
    collector_consumption_config: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.collector_consumption_config,
    forbidden_body_fields: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.forbidden_body_fields,
    forbidden_body_fields_present: forbiddenBodyFieldsPresent(input),
    authority_boundary: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.authority_boundary,
  };
}

function buildObservabilitySemanticConventionExportSeed(input: ObservabilitySemanticConventionInput) {
  const readback = buildObservabilitySemanticConventionReadback(input);
  const metricAttributes = readback.signals.metric.attributes;
  const metrics = METRIC_INSTRUMENTS.map((instrument) => {
    const value = metricValue(input.metric_values?.[instrument]);
    return {
      instrument,
      otel_metric_name: `opl.${instrument}`,
      openmetrics_name: `opl_${instrument}`,
      value,
      value_observed: value !== null,
      attributes: metricAttributes,
    };
  });

  return {
    surface_kind: 'opl_observability_export_readback_seed',
    schema_version: readback.schema_version,
    source_readback: readback.surface_kind,
    semantic_conventions_ref: 'contracts/opl-framework/observability-semantic-conventions-contract.json',
    exporter_signal_mapping: readback.exporter_signal_mapping,
    collector_export_boundary: readback.collector_export_boundary,
    collector_consumption_config: readback.collector_consumption_config,
    signal_groups: {
      traces: [
        {
          span_name: 'opl.stage_attempt',
          span_kind: 'internal',
          attributes: readback.signals.trace_span.attributes,
        },
      ],
      metrics,
      logs: [
        {
          event_name: 'opl.authority_event',
          attributes: readback.signals.log_event.attributes,
          ref_fields: readback.signals.log_event.ref_fields,
          body_included: false,
        },
      ],
    },
    summary: {
      trace_span_count: 1,
      metric_instrument_count: metrics.length,
      observed_metric_count: metrics.filter((metric) => metric.value_observed).length,
      log_event_count: 1,
      collector_export_boundary: 'seed_only_no_external_collector',
      collector_consumption_status: 'collector_config_consumable_no_external_collector',
      collector_config_consumable: true,
      body_policy: 'refs_only_no_payload_body',
      readiness_claim: 'not_claimed',
    },
    forbidden_body_fields: readback.forbidden_body_fields,
    forbidden_body_fields_present: readback.forbidden_body_fields_present,
    authority_boundary: readback.authority_boundary,
  };
}

function renderObservabilitySemanticConventionOpenMetrics(
  exportSeed: ReturnType<typeof buildObservabilitySemanticConventionExportSeed>,
) {
  const collectorConfig = exportSeed.collector_consumption_config;
  const lines = exportSeed.signal_groups.metrics
    .filter((metric) => metric.value_observed && metric.value !== null)
    .flatMap((metric) => [
      `# HELP ${metric.openmetrics_name} OPL ${metric.instrument} readback seed from refs-only semantic conventions.`,
      `# TYPE ${metric.openmetrics_name} gauge`,
      openMetricsLine(metric.openmetrics_name, metric.value ?? 0, metric.attributes),
    ]);

  return `${[
    ...lines,
    '# HELP opl_observability_export_boundary Constant guard for refs-only, non-readiness observability seed.',
    '# TYPE opl_observability_export_boundary gauge',
    openMetricsLine('opl_observability_export_boundary', 1, {
      refs_only: String(exportSeed.authority_boundary.ledger_refs_only),
      can_store_payload_body: String(exportSeed.authority_boundary.can_store_payload_body),
      can_claim_runtime_ready: String(exportSeed.authority_boundary.can_claim_runtime_ready),
      can_claim_domain_ready: String(exportSeed.authority_boundary.can_claim_domain_ready),
      can_claim_production_ready: String(exportSeed.authority_boundary.can_claim_production_ready),
    }),
    '# HELP opl_observability_exporter_signal_mapping Constant guard for OpenTelemetry-style trace metric log signal vocabulary.',
    '# TYPE opl_observability_exporter_signal_mapping gauge',
    openMetricsLine('opl_observability_exporter_signal_mapping', 1, {
      traces: exportSeed.exporter_signal_mapping.traces.exporter_signal,
      metrics: exportSeed.exporter_signal_mapping.metrics.exporter_signal,
      logs: exportSeed.exporter_signal_mapping.logs.exporter_signal,
    }),
    '# HELP opl_observability_collector_export_boundary Constant guard showing this is an exporter seed without external collector or body export.',
    '# TYPE opl_observability_collector_export_boundary gauge',
    openMetricsLine('opl_observability_collector_export_boundary', 1, {
      collector_kind: exportSeed.collector_export_boundary.collector_kind,
      external_collector_connected: String(exportSeed.collector_export_boundary.external_collector_connected),
      exporter_seed_only: String(exportSeed.collector_export_boundary.exporter_seed_only),
      payload_body_exported: String(exportSeed.collector_export_boundary.payload_body_exported),
      runtime_ready_claim: exportSeed.collector_export_boundary.runtime_ready_claim,
      domain_ready_claim: exportSeed.collector_export_boundary.domain_ready_claim,
      production_ready_claim: exportSeed.collector_export_boundary.production_ready_claim,
    }),
    '# HELP opl_observability_collector_consumption_config Constant guard for the OpenTelemetry Collector config fragment that can consume this OpenMetrics export.',
    '# TYPE opl_observability_collector_consumption_config gauge',
    openMetricsLine('opl_observability_collector_consumption_config', 1, {
      collector_kind: collectorConfig.collector_kind,
      receiver: collectorConfig.receiver,
      receiver_input_format: collectorConfig.receiver_input_format,
      config_format: collectorConfig.config_format,
      metrics_path: collectorConfig.scrape_endpoint.metrics_path,
      default_target: collectorConfig.scrape_endpoint.default_target,
      endpoint_required: String(collectorConfig.scrape_endpoint.endpoint_required),
      config_consumable: String(exportSeed.summary.collector_config_consumable),
      external_collector_connected: String(collectorConfig.external_collector_connected),
      payload_body_exported: String(collectorConfig.payload_body_exported),
      runtime_ready_claim: collectorConfig.runtime_ready_claim,
    }),
    '# EOF',
  ].join('\n')}\n`;
}

export {
  OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS,
  appOperatorProjectionCommand,
  appOperatorProjectionRef,
  appOperatorProjectionTestRef,
  buildObservabilitySemanticConventionExportSeed,
  buildObservabilitySemanticConventionReadback,
  renderObservabilitySemanticConventionOpenMetrics,
};
export type { ObservabilityMetricInstrument, ObservabilitySemanticConventionInput };
