import type { Server, ServerResponse } from 'node:http';

import { stringValue } from '../../../kernel/json-record.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { RuntimeTraySnapshotProvider } from '../runtime-tray-snapshot-provider.ts';

export type ObservabilityExportFormat = 'json' | 'openmetrics' | 'collector-config-json';

export type ObservabilityExporterSeedReadback = {
  surface_kind: 'opl_observability_exporter_seed';
  seed_transport: 'openmetrics_stdout_and_http_seed_only';
  source_export_command: string;
  source_endpoint_command: string;
  collector_smoke_command: string;
  exporter_signal_mapping_ref: string;
  collector_export_boundary_ref: string;
  collector_consumption_config_ref: string;
  owner_route_ref: string;
  otlp_sdk_exporter_configured: false;
  live_endpoint_configured: false;
  external_collector_connected: false;
  payload_body_exported: false;
  runtime_ready_claim: 'not_claimed';
  domain_ready_claim: 'not_claimed';
  production_ready_claim: 'not_claimed';
};

export type ObservabilityOwnerRouteReadback = {
  surface_kind: 'opl_observability_owner_route';
  owner: 'OPL Observability';
  owner_route_status: 'owner_live_evidence_required';
  worklist_item: 'otlp_exporter_live_endpoint';
  required_evidence: string[];
  forbidden_completion_evidence: string[];
  legal_next_owner_action: string;
  stop_condition: string;
};

export type ObservabilityEndpointReadbackBoundary = {
  surface_kind: 'opl_observability_endpoint_readback_boundary';
  boundary_status: 'bounded_endpoint_readback_only';
  endpoint_kind: 'diagnostic_openmetrics_http_endpoint';
  source_export_seed_ref: string;
  owner_route_ref: string;
  proves: string[];
  does_not_prove: string[];
  external_collector_connected: false;
  payload_body_exported: false;
};

export type ObservabilityCollectorReadbackBoundary = {
  surface_kind: 'opl_observability_collector_consumption_readback_boundary';
  boundary_status: 'diagnostic_collector_probe_only';
  endpoint_mode: 'started_local_endpoint' | 'external_endpoint';
  source_export_seed_ref: string;
  source_endpoint_boundary_ref: string;
  owner_route_ref: string;
  collector_consumption_observed: boolean;
  external_collector_connected: boolean;
  payload_body_exported: false;
  proves: string[];
  does_not_prove: string[];
};

export type ObservabilityMetricsEndpointOptions = {
  contracts: FrameworkContracts;
  host?: string;
  port?: number;
  metricsPath?: string;
  once?: boolean;
  readyFile?: string;
  runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
};

export type ObservabilityMetricsEndpointReadback = {
  surface_kind: 'opl_observability_metrics_endpoint';
  schema_version: 'observability_metrics_endpoint.v1';
  endpoint: {
    host: string;
    port: number;
    metrics_path: string;
    url: string;
  };
  source_export_command: string;
  collector_consumption_config_ref: string;
  runtime_export_ref: string;
  exporter_seed: ObservabilityExporterSeedReadback;
  owner_route: ObservabilityOwnerRouteReadback;
  readback_boundary: ObservabilityEndpointReadbackBoundary;
  server_runtime: 'node_http_standard_library';
  once: boolean;
  authority_boundary: {
    can_execute_repair: false;
    can_write_domain_truth: false;
    can_create_owner_receipt: false;
    can_create_typed_blocker: false;
    can_authorize_ready_verdict: false;
    can_claim_runtime_ready: false;
    can_claim_domain_ready: false;
    can_claim_production_ready: false;
    external_collector_connected: false;
    payload_body_exported: false;
  };
};

export type ObservabilityMetricsEndpointHandle = {
  server: Server;
  readback: ObservabilityMetricsEndpointReadback;
  closed: Promise<void>;
  close: () => void;
};

export type ObservabilityCollectorSmokeOptions = {
  contracts: FrameworkContracts;
  collectorCommand?: string;
  endpoint?: string;
  host?: string;
  port?: number;
  metricsPath?: string;
  timeoutMs?: number;
  runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
  env?: Record<string, string | undefined>;
};

export type ObservabilityCollectorSmokeReadback = {
  surface_kind: 'opl_observability_collector_smoke';
  schema_version: 'observability_collector_smoke.v1';
  status: 'observed' | 'blocked';
  collector: {
    command_source: '--collector-command' | 'OPL_OTELCOL_COMMAND' | 'PATH' | 'missing';
    command: string | null;
    resolved_command: string | null;
    attempted_commands: string[];
  };
  endpoint: {
    mode: 'started_local_endpoint' | 'external_endpoint';
    url: string | null;
    target: string | null;
    metrics_path: string;
  };
  collector_config: {
    config_ref: string;
    config_format: 'otelcol_yaml_equivalent_json';
    config_file: string | null;
    receiver: 'prometheus';
    exporter: 'debug';
  };
  evidence: {
    collector_process_started: boolean;
    collector_consumption_observed: boolean;
    observed_metric_name: string | null;
    observed_stream: 'stdout' | 'stderr' | null;
    output_bytes: number;
    timeout_ms: number;
  };
  owner_route: ObservabilityOwnerRouteReadback;
  readback_boundary: ObservabilityCollectorReadbackBoundary;
  typed_blocker: null | {
    blocker_type:
      | 'collector_binary_missing'
      | 'collector_spawn_failed'
      | 'collector_timeout_no_metric'
      | 'collector_exited_without_metric';
    message: string;
    next_owner: 'operator';
    attempted_commands: string[];
  };
  authority_boundary: {
    payload_body_exported: false;
    payload_body_stored: false;
    external_collector_connected: boolean;
    can_write_domain_truth: false;
    can_create_owner_receipt: false;
    can_create_typed_blocker: false;
    can_claim_runtime_ready: false;
    can_claim_domain_ready: false;
    can_claim_production_ready: false;
  };
};

export const AUTHORITY_BOUNDARY = {
  opl: 'read_only_observability_export_projection',
  source_authority: 'opl_runtime_authority_refs_provider_receipts_snapshot_and_domain_projection_refs',
  can_execute_repair: false,
  can_write_domain_truth: false,
  can_authorize_quality_verdict: false,
  can_authorize_ready_verdict: false,
  can_authorize_artifact_export: false,
};

export const DEFAULT_METRICS_ENDPOINT_HOST = '127.0.0.1';
export const DEFAULT_METRICS_ENDPOINT_PORT = 9464;
export const DEFAULT_METRICS_ENDPOINT_PATH = '/metrics';
export const DEFAULT_COLLECTOR_SMOKE_TIMEOUT_MS = 8_000;
export const OBSERVABILITY_CONTRACT_REF = 'contracts/opl-framework/observability-semantic-conventions-contract.json';
export const OBSERVABILITY_EXPORT_COMMAND = 'opl runtime observability-export --format openmetrics';
export const OBSERVABILITY_ENDPOINT_COMMAND = 'opl runtime observability-endpoint --port 9464 --metrics-path /metrics';
export const OBSERVABILITY_COLLECTOR_SMOKE_COMMAND = 'opl runtime observability-collector-smoke';
export const OBSERVABILITY_EXPORTER_SEED_REF =
  `${OBSERVABILITY_CONTRACT_REF}#/export_readback_seed/exporter_seed`;
export const OBSERVABILITY_OWNER_ROUTE_REF =
  `${OBSERVABILITY_CONTRACT_REF}#/export_readback_seed/owner_route`;
export const OBSERVABILITY_COLLECTOR_CONFIG_REF =
  `${OBSERVABILITY_CONTRACT_REF}#/export_readback_seed/collector_consumption_config`;
export const OBSERVABILITY_ENDPOINT_BOUNDARY_REF =
  `${OBSERVABILITY_CONTRACT_REF}#/export_readback_seed/endpoint_readback_boundary`;
export const COLLECTOR_SMOKE_METRIC_NAMES = [
  'opl_provider_ready',
  'opl_queue_length',
  'opl_observability_collector_consumption_config',
];

export function buildObservabilityExporterSeedReadback(): ObservabilityExporterSeedReadback {
  return {
    surface_kind: 'opl_observability_exporter_seed',
    seed_transport: 'openmetrics_stdout_and_http_seed_only',
    source_export_command: OBSERVABILITY_EXPORT_COMMAND,
    source_endpoint_command: OBSERVABILITY_ENDPOINT_COMMAND,
    collector_smoke_command: OBSERVABILITY_COLLECTOR_SMOKE_COMMAND,
    exporter_signal_mapping_ref: 'semantic_conventions.exporter_signal_mapping',
    collector_export_boundary_ref: 'semantic_conventions.collector_export_boundary',
    collector_consumption_config_ref: OBSERVABILITY_COLLECTOR_CONFIG_REF,
    owner_route_ref: OBSERVABILITY_OWNER_ROUTE_REF,
    otlp_sdk_exporter_configured: false,
    live_endpoint_configured: false,
    external_collector_connected: false,
    payload_body_exported: false,
    runtime_ready_claim: 'not_claimed',
    domain_ready_claim: 'not_claimed',
    production_ready_claim: 'not_claimed',
  };
}

export function buildObservabilityOwnerRouteReadback(): ObservabilityOwnerRouteReadback {
  return {
    surface_kind: 'opl_observability_owner_route',
    owner: 'OPL Observability',
    owner_route_status: 'owner_live_evidence_required',
    worklist_item: 'otlp_exporter_live_endpoint',
    required_evidence: [
      'OTLP or OpenTelemetry SDK exporter owner lane',
      'live endpoint readback outside bounded smoke-only path',
      'external collector consumption readback',
      'semantic convention mapping for trace, metric, log, and event refs',
    ],
    forbidden_completion_evidence: [
      'OpenMetrics smoke endpoint alone',
      'CLI diagnostic operator projection',
      'phase10-src-modules-observability finding_count=0',
      'strict diff gate',
    ],
    legal_next_owner_action:
      'Open an OPL Observability owner lane for OTLP/OpenTelemetry SDK exporter and external collector consumption; bounded OpenMetrics seed remains diagnostic only.',
    stop_condition:
      'CLI operator projection reads the same current owner delta through trace, metric, log, and event vocabulary from a live exporter/collector path, or Observability emits a typed blocker.',
  };
}

export function buildEndpointReadbackBoundary(): ObservabilityEndpointReadbackBoundary {
  return {
    surface_kind: 'opl_observability_endpoint_readback_boundary',
    boundary_status: 'bounded_endpoint_readback_only',
    endpoint_kind: 'diagnostic_openmetrics_http_endpoint',
    source_export_seed_ref: OBSERVABILITY_EXPORTER_SEED_REF,
    owner_route_ref: OBSERVABILITY_OWNER_ROUTE_REF,
    proves: [
      'openmetrics_http_scrape_shape',
      'refs_only_authority_boundary',
      'collector_config_target_shape',
    ],
    does_not_prove: [
      'otlp_exporter_live_endpoint',
      'external_collector_connected',
      'runtime_ready',
      'domain_ready',
      'production_ready',
      'owner_acceptance',
    ],
    external_collector_connected: false,
    payload_body_exported: false,
  };
}

export function buildCollectorReadbackBoundary(input: {
  endpointMode: 'started_local_endpoint' | 'external_endpoint';
  collectorConsumptionObserved: boolean;
  externalCollectorConnected: boolean;
}): ObservabilityCollectorReadbackBoundary {
  return {
    surface_kind: 'opl_observability_collector_consumption_readback_boundary',
    boundary_status: 'diagnostic_collector_probe_only',
    endpoint_mode: input.endpointMode,
    source_export_seed_ref: OBSERVABILITY_EXPORTER_SEED_REF,
    source_endpoint_boundary_ref: OBSERVABILITY_ENDPOINT_BOUNDARY_REF,
    owner_route_ref: OBSERVABILITY_OWNER_ROUTE_REF,
    collector_consumption_observed: input.collectorConsumptionObserved,
    external_collector_connected: input.externalCollectorConnected,
    payload_body_exported: false,
    proves: [
      'collector_can_consume_bounded_openmetrics_surface',
      'collector_debug_output_observed_metric',
    ],
    does_not_prove: [
      'otlp_exporter_live_endpoint',
      'runtime_ready',
      'domain_ready',
      'production_ready',
      'owner_acceptance',
    ],
  };
}

export function buildEndpointReadback(input: {
  host: string;
  port: number;
  metricsPath: string;
  once: boolean;
}): ObservabilityMetricsEndpointReadback {
  return {
    surface_kind: 'opl_observability_metrics_endpoint',
    schema_version: 'observability_metrics_endpoint.v1',
    endpoint: {
      host: input.host,
      port: input.port,
      metrics_path: input.metricsPath,
      url: `http://${input.host}:${input.port}${input.metricsPath}`,
    },
    source_export_command: OBSERVABILITY_EXPORT_COMMAND,
    collector_consumption_config_ref: OBSERVABILITY_COLLECTOR_CONFIG_REF,
    runtime_export_ref: OBSERVABILITY_EXPORT_COMMAND,
    exporter_seed: buildObservabilityExporterSeedReadback(),
    owner_route: buildObservabilityOwnerRouteReadback(),
    readback_boundary: buildEndpointReadbackBoundary(),
    server_runtime: 'node_http_standard_library',
    once: input.once,
    authority_boundary: {
      can_execute_repair: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_ready_verdict: false,
      can_claim_runtime_ready: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      external_collector_connected: false,
      payload_body_exported: false,
    },
  };
}

export function writeJsonResponse(response: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function firstString(...values: unknown[]) {
  return values.map(stringValue).find((value) => value !== null) ?? null;
}

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function normalizeMetricsPath(value: string | undefined) {
  const metricsPath = stringValue(value) ?? DEFAULT_METRICS_ENDPOINT_PATH;
  return metricsPath.startsWith('/') ? metricsPath : `/${metricsPath}`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function metricValueOrUndefined(value: number) {
  return Number.isFinite(value) ? value : undefined;
}

function defaultPortForProtocol(protocol: string) {
  return protocol === 'https:' ? '443' : '80';
}

export function targetForEndpoint(url: URL) {
  const port = url.port || defaultPortForProtocol(url.protocol);
  return `${url.hostname}:${port}`;
}
