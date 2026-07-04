import type { Server, ServerResponse } from 'node:http';

import { stringValue } from '../../../kernel/json-record.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import type { RuntimeTraySnapshotProvider } from '../runtime-tray-snapshot-provider.ts';

export type ObservabilityExportFormat = 'json' | 'openmetrics' | 'collector-config-json';

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
  source_authority: 'opl_runtime_ledger_provider_receipts_snapshot_and_domain_projection_refs',
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
export const COLLECTOR_SMOKE_METRIC_NAMES = [
  'opl_provider_ready',
  'opl_queue_length',
  'opl_observability_collector_consumption_config',
];

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
    source_export_command: 'opl runtime observability-export --format openmetrics',
    collector_consumption_config_ref:
      'contracts/opl-framework/observability-semantic-conventions-contract.json#/export_readback_seed/collector_consumption_config',
    runtime_export_ref: 'opl runtime observability-export --format openmetrics',
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
