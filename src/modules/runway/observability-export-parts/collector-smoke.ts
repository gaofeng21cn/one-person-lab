import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { record, recordList, stringValue } from '../../../kernel/json-record.ts';
import {
  OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS,
} from '../../ledger/index.ts';
import {
  COLLECTOR_SMOKE_METRIC_NAMES,
  DEFAULT_COLLECTOR_SMOKE_TIMEOUT_MS,
  DEFAULT_METRICS_ENDPOINT_HOST,
  DEFAULT_METRICS_ENDPOINT_PATH,
  buildEndpointReadback,
  errorMessage,
  normalizeMetricsPath,
  targetForEndpoint,
  writeJsonResponse,
  type ObservabilityCollectorSmokeOptions,
  type ObservabilityCollectorSmokeReadback,
  type ObservabilityMetricsEndpointHandle,
  type ObservabilityMetricsEndpointOptions,
} from './shared.ts';

function normalizeCollectorSmokeTimeoutMs(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value as number : DEFAULT_COLLECTOR_SMOKE_TIMEOUT_MS;
}

function collectorEndpointFromUrl(rawEndpoint: string) {
  const parsed = new URL(rawEndpoint);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('runtime observability-collector-smoke --endpoint must be http or https.');
  }
  return {
    url: parsed.toString(),
    target: targetForEndpoint(parsed),
    metricsPath: normalizeMetricsPath(parsed.pathname === '/' ? '/metrics' : parsed.pathname),
    scheme: parsed.protocol.replace(':', ''),
  };
}

async function executablePath(command: string, env: Record<string, string | undefined>) {
  if (command.includes('/')) {
    await access(command, fsConstants.X_OK);
    return command;
  }
  const pathEntries = (env.PATH ?? process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = join(entry, command);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}

async function resolveCollectorCommand(options: ObservabilityCollectorSmokeOptions) {
  const env = options.env ?? process.env;
  const explicitCommand = stringValue(options.collectorCommand);
  const envCommand = explicitCommand ? null : stringValue(env.OPL_OTELCOL_COMMAND);
  const candidates = explicitCommand
    ? [{ command: explicitCommand, source: '--collector-command' as const }]
    : envCommand
    ? [{ command: envCommand, source: 'OPL_OTELCOL_COMMAND' as const }]
    : [
      { command: 'otelcol-contrib', source: 'PATH' as const },
      { command: 'otelcol', source: 'PATH' as const },
    ];
  const attemptedCommands = candidates.map((candidate) => candidate.command);

  for (const candidate of candidates) {
    try {
      const resolved = await executablePath(candidate.command, env);
      if (resolved) {
        return {
          command_source: candidate.source,
          command: candidate.command,
          resolved_command: resolved,
          attempted_commands: attemptedCommands,
        };
      }
    } catch {
      // The caller reports the full attempted command set as a typed blocker.
    }
  }

  return {
    command_source: 'missing' as const,
    command: null,
    resolved_command: null,
    attempted_commands: attemptedCommands,
  };
}

function buildCollectorSmokeConfig(input: {
  target: string;
  metricsPath: string;
  scheme: string;
}) {
  const config = structuredClone(
    OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.collector_consumption_config.config,
  ) as Record<string, unknown>;
  const receivers = record(config.receivers);
  const prometheus = record(receivers.prometheus);
  const prometheusConfig = record(prometheus.config);
  const scrapeConfig = record(recordList(prometheusConfig.scrape_configs)[0]);
  const staticConfig = record(recordList(scrapeConfig.static_configs)[0]);
  staticConfig.targets = [input.target];
  scrapeConfig.static_configs = [staticConfig];
  scrapeConfig.metrics_path = input.metricsPath;
  scrapeConfig.scheme = input.scheme;
  scrapeConfig.scrape_interval = '1s';
  scrapeConfig.scrape_timeout = '1s';
  prometheusConfig.scrape_configs = [scrapeConfig];
  prometheus.config = prometheusConfig;
  receivers.prometheus = prometheus;
  config.receivers = receivers;

  const processors = record(config.processors);
  processors.batch = {
    ...record(processors.batch),
    timeout: '1s',
    send_batch_size: 1,
  };
  config.processors = processors;

  const exporters = record(config.exporters);
  exporters.debug = {
    ...record(exporters.debug),
    verbosity: 'detailed',
  };
  config.exporters = exporters;
  return config;
}

function emptyCollectorConfigReadback(configFile: string | null) {
  return {
    config_ref:
      'contracts/opl-framework/observability-semantic-conventions-contract.json#/export_readback_seed/collector_consumption_config',
    config_format: 'otelcol_yaml_equivalent_json' as const,
    config_file: configFile,
    receiver: 'prometheus' as const,
    exporter: 'debug' as const,
  };
}

function collectorSmokeBoundary(
  externalCollectorConnected: boolean,
): ObservabilityCollectorSmokeReadback['authority_boundary'] {
  return {
    payload_body_exported: false as const,
    payload_body_stored: false as const,
    external_collector_connected: externalCollectorConnected,
    can_write_domain_truth: false as const,
    can_create_owner_receipt: false as const,
    can_create_typed_blocker: false as const,
    can_claim_runtime_ready: false as const,
    can_claim_domain_ready: false as const,
    can_claim_production_ready: false as const,
  };
}

function blockedCollectorSmoke(input: {
  blockerType: NonNullable<ObservabilityCollectorSmokeReadback['typed_blocker']>['blocker_type'];
  message: string;
  collector: ObservabilityCollectorSmokeReadback['collector'];
  endpoint?: ObservabilityCollectorSmokeReadback['endpoint'];
  configFile?: string | null;
  processStarted?: boolean;
  outputBytes?: number;
  timeoutMs: number;
}): ObservabilityCollectorSmokeReadback {
  return {
    surface_kind: 'opl_observability_collector_smoke',
    schema_version: 'observability_collector_smoke.v1',
    status: 'blocked',
    collector: input.collector,
    endpoint: input.endpoint ?? {
      mode: 'started_local_endpoint',
      url: null,
      target: null,
      metrics_path: DEFAULT_METRICS_ENDPOINT_PATH,
    },
    collector_config: emptyCollectorConfigReadback(input.configFile ?? null),
    evidence: {
      collector_process_started: input.processStarted === true,
      collector_consumption_observed: false,
      observed_metric_name: null,
      observed_stream: null,
      output_bytes: input.outputBytes ?? 0,
      timeout_ms: input.timeoutMs,
    },
    typed_blocker: {
      blocker_type: input.blockerType,
      message: input.message,
      next_owner: 'operator',
      attempted_commands: input.collector.attempted_commands,
    },
    authority_boundary: collectorSmokeBoundary(false),
  };
}

function observedMetric(buffer: string) {
  return COLLECTOR_SMOKE_METRIC_NAMES.find((metricName) => buffer.includes(metricName)) ?? null;
}

function renderCollectorSmokeOpenMetrics(metricsPath: string) {
  return [
    '# HELP opl_provider_ready Collector smoke metric proving the Prometheus receiver consumed an OPL OpenMetrics endpoint.',
    '# TYPE opl_provider_ready gauge',
    'opl_provider_ready{provider_kind="collector_smoke"} 1',
    '# HELP opl_queue_length Collector smoke queue gauge kept local to the smoke endpoint.',
    '# TYPE opl_queue_length gauge',
    'opl_queue_length 0',
    '# HELP opl_observability_collector_consumption_config Collector smoke guard for the OPL Prometheus receiver config.',
    '# TYPE opl_observability_collector_consumption_config gauge',
    `opl_observability_collector_consumption_config{collector_kind="opentelemetry_collector",receiver="prometheus",config_consumable="true",metrics_path="${metricsPath}"} 1`,
    '# HELP opl_authority_boundary Constant guard showing this smoke endpoint is read-only and non-authoritative.',
    '# TYPE opl_authority_boundary gauge',
    'opl_authority_boundary{can_execute_repair="false",can_write_domain_truth="false",can_authorize_quality_verdict="false",can_authorize_ready_verdict="false"} 1',
    '# EOF',
    '',
  ].join('\n');
}

async function startCollectorSmokeMetricsEndpoint(
  options: Pick<ObservabilityMetricsEndpointOptions, 'host' | 'port' | 'metricsPath'>,
): Promise<ObservabilityMetricsEndpointHandle> {
  const host = stringValue(options.host) ?? DEFAULT_METRICS_ENDPOINT_HOST;
  const port = options.port ?? 0;
  const metricsPath = normalizeMetricsPath(options.metricsPath);
  let closeStarted = false;

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
    if (request.method !== 'GET' || requestUrl.pathname !== metricsPath) {
      writeJsonResponse(response, 404, {
        error: 'collector_smoke_metrics_endpoint_not_found',
        metrics_path: metricsPath,
      });
      return;
    }

    response.writeHead(200, {
      'content-type': 'application/openmetrics-text; version=1.0.0; charset=utf-8',
      'cache-control': 'no-store',
      'x-opl-authority-boundary': 'collector_smoke_read_only_non_authoritative',
    });
    response.end(renderCollectorSmokeOpenMetrics(metricsPath));
  });

  const closed = new Promise<void>((resolve) => {
    server.once('close', resolve);
  });

  function close() {
    if (closeStarted) return;
    closeStarted = true;
    server.close();
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    readback: buildEndpointReadback({
      host,
      port: address.port,
      metricsPath,
      once: false,
    }),
    closed,
    close,
  };
}

async function waitForCollectorMetric(input: {
  resolvedCommand: string;
  configFile: string;
  timeoutMs: number;
}) {
  return await new Promise<{
    status: 'observed' | 'blocked';
    blocker_type?: NonNullable<ObservabilityCollectorSmokeReadback['typed_blocker']>['blocker_type'];
    message?: string;
    observed_metric_name: string | null;
    observed_stream: 'stdout' | 'stderr' | null;
    output_bytes: number;
    process_started: boolean;
  }>((resolve) => {
    let settled = false;
    let childClosed = false;
    let outputBytes = 0;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let timeout: ReturnType<typeof setTimeout>;
    let killTimeout: ReturnType<typeof setTimeout> | null = null;
    let closeFallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    const child = spawn(input.resolvedCommand, ['--config', input.configFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    function clearChildTimers() {
      if (killTimeout) {
        clearTimeout(killTimeout);
        killTimeout = null;
      }
      if (closeFallbackTimeout) {
        clearTimeout(closeFallbackTimeout);
        closeFallbackTimeout = null;
      }
    }

    function childStillRunning() {
      return child.exitCode === null && child.signalCode === null;
    }

    function signalChild(signal: NodeJS.Signals) {
      try {
        child.kill(signal);
      } catch {
        // The process may already be gone; close handling below settles the parent.
      }
    }

    function stopCollectorProcess() {
      if (!childStillRunning()) return;
      signalChild('SIGTERM');
      killTimeout = setTimeout(() => {
        if (childStillRunning()) signalChild('SIGKILL');
      }, 500);
      killTimeout.unref();
    }

    function finish(result: Parameters<typeof resolve>[0]) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stopCollectorProcess();
      if (childClosed || !childStillRunning()) {
        clearChildTimers();
        resolve(result);
        return;
      }
      closeFallbackTimeout = setTimeout(() => {
        clearChildTimers();
        resolve(result);
      }, 2_000);
      closeFallbackTimeout.unref();
      child.once('close', () => {
        clearChildTimers();
        resolve(result);
      });
    }

    function onData(stream: 'stdout' | 'stderr', chunk: Buffer) {
      outputBytes += chunk.byteLength;
      const next = chunk.toString('utf8');
      if (stream === 'stdout') {
        stdoutBuffer = `${stdoutBuffer}${next}`.slice(-4096);
      } else {
        stderrBuffer = `${stderrBuffer}${next}`.slice(-4096);
      }
      const metricName = observedMetric(stream === 'stdout' ? stdoutBuffer : stderrBuffer);
      if (metricName) {
        finish({
          status: 'observed',
          observed_metric_name: metricName,
          observed_stream: stream,
          output_bytes: outputBytes,
          process_started: true,
        });
      }
    }

    timeout = setTimeout(() => {
      finish({
        status: 'blocked',
        blocker_type: 'collector_timeout_no_metric',
        message: `Collector did not emit an OPL metric within ${input.timeoutMs}ms.`,
        observed_metric_name: null,
        observed_stream: null,
        output_bytes: outputBytes,
        process_started: true,
      });
    }, input.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => onData('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => onData('stderr', chunk));
    child.once('error', (error) => {
      finish({
        status: 'blocked',
        blocker_type: 'collector_spawn_failed',
        message: errorMessage(error),
        observed_metric_name: null,
        observed_stream: null,
        output_bytes: outputBytes,
        process_started: false,
      });
    });
    child.once('close', () => {
      childClosed = true;
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      finish({
        status: 'blocked',
        blocker_type: 'collector_exited_without_metric',
        message: `Collector exited before an OPL metric was observed: code=${code ?? 'null'} signal=${signal ?? 'null'}.`,
        observed_metric_name: null,
        observed_stream: null,
        output_bytes: outputBytes,
        process_started: true,
      });
    });
  });
}

export async function runObservabilityCollectorSmoke(
  options: ObservabilityCollectorSmokeOptions,
): Promise<ObservabilityCollectorSmokeReadback> {
  const timeoutMs = normalizeCollectorSmokeTimeoutMs(options.timeoutMs);
  const collector = await resolveCollectorCommand(options);
  if (!collector.resolved_command) {
    return blockedCollectorSmoke({
      blockerType: 'collector_binary_missing',
      message: 'No OpenTelemetry Collector binary was found.',
      collector,
      timeoutMs,
    });
  }

  const endpointHandleRef: { current: ObservabilityMetricsEndpointHandle | null } = { current: null };
  try {
    const endpoint = stringValue(options.endpoint)
      ? {
        mode: 'external_endpoint' as const,
        ...collectorEndpointFromUrl(options.endpoint as string),
      }
      : await (async () => {
        endpointHandleRef.current = await startCollectorSmokeMetricsEndpoint({
          host: options.host,
          port: options.port ?? 0,
          metricsPath: options.metricsPath,
        });
        const endpointUrl = new URL(endpointHandleRef.current.readback.endpoint.url);
        return {
          mode: 'started_local_endpoint' as const,
          url: endpointHandleRef.current.readback.endpoint.url,
          target: targetForEndpoint(endpointUrl),
          metricsPath: endpointHandleRef.current.readback.endpoint.metrics_path,
          scheme: endpointUrl.protocol.replace(':', ''),
        };
      })();
    const config = buildCollectorSmokeConfig({
      target: endpoint.target,
      metricsPath: endpoint.metricsPath,
      scheme: endpoint.scheme,
    });
    const tempRoot = await mkdtemp(join(tmpdir(), 'opl-observability-collector-smoke-'));
    const configFile = join(tempRoot, 'otelcol-config.json');
    await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`);
    const endpointReadback = {
      mode: endpoint.mode,
      url: endpoint.url,
      target: endpoint.target,
      metrics_path: endpoint.metricsPath,
    };
    const result = await waitForCollectorMetric({
      resolvedCommand: collector.resolved_command,
      configFile,
      timeoutMs,
    });

    if (result.status !== 'observed') {
      return blockedCollectorSmoke({
        blockerType: result.blocker_type ?? 'collector_timeout_no_metric',
        message: result.message ?? 'Collector did not emit an OPL metric.',
        collector,
        endpoint: endpointReadback,
        configFile,
        processStarted: result.process_started,
        outputBytes: result.output_bytes,
        timeoutMs,
      });
    }

    return {
      surface_kind: 'opl_observability_collector_smoke',
      schema_version: 'observability_collector_smoke.v1',
      status: 'observed',
      collector,
      endpoint: endpointReadback,
      collector_config: emptyCollectorConfigReadback(configFile),
      evidence: {
        collector_process_started: result.process_started,
        collector_consumption_observed: true,
        observed_metric_name: result.observed_metric_name,
        observed_stream: result.observed_stream,
        output_bytes: result.output_bytes,
        timeout_ms: timeoutMs,
      },
      typed_blocker: null,
      authority_boundary: collectorSmokeBoundary(true),
    };
  } finally {
    endpointHandleRef.current?.close();
    if (endpointHandleRef.current) {
      await endpointHandleRef.current.closed;
    }
  }
}
