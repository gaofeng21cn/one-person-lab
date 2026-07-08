import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FrameworkContracts, JsonRecord } from '../../kernel/types.ts';
import {
  countValue as numberValue,
  record,
  recordList,
  stringList,
  stringValue,
} from '../../kernel/json-record.ts';
import {
  OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS,
  buildObservabilitySemanticConventionExportSeed,
  buildObservabilitySemanticConventionReadback,
  renderObservabilitySemanticConventionOpenMetrics,
  type ObservabilityMetricInstrument,
  type ObservabilitySemanticConventionInput,
} from '../ledger/index.ts';
import {
  requireRuntimeTraySnapshotProvider,
  type RuntimeTraySnapshotProvider,
} from './runtime-tray-snapshot-provider.ts';
export { runObservabilityCollectorSmoke } from './observability-export-parts/collector-smoke.ts';
import {
  AUTHORITY_BOUNDARY,
  DEFAULT_METRICS_ENDPOINT_HOST,
  DEFAULT_METRICS_ENDPOINT_PATH,
  DEFAULT_METRICS_ENDPOINT_PORT,
  booleanValue,
  buildEndpointReadback,
  buildObservabilityExporterSeedReadback,
  buildObservabilityOwnerRouteReadback,
  errorMessage,
  firstString,
  metricValueOrUndefined,
  normalizeMetricsPath,
  writeJsonResponse,
  type ObservabilityExportFormat,
  type ObservabilityMetricsEndpointHandle,
  type ObservabilityMetricsEndpointOptions,
} from './observability-export-parts/shared.ts';

export type {
  ObservabilityCollectorSmokeOptions,
  ObservabilityCollectorSmokeReadback,
  ObservabilityExportFormat,
  ObservabilityMetricsEndpointHandle,
  ObservabilityMetricsEndpointOptions,
  ObservabilityMetricsEndpointReadback,
} from './observability-export-parts/shared.ts';

function counterRecord(value: unknown) {
  const input = record(value);
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, count]) => typeof count === 'number' && Number.isFinite(count))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function attemptStatus(attempt: JsonRecord) {
  return stringValue(attempt.local_status)
    ?? stringValue(record(attempt.filter_keys).status)
    ?? 'unknown';
}

function attemptDomain(attempt: JsonRecord) {
  return stringValue(attempt.domain_id)
    ?? stringValue(record(attempt.filter_keys).domain_id)
    ?? 'unknown';
}

function attemptHasFlag(attempt: JsonRecord, flag: string) {
  return Array.isArray(attempt.attention_flags) && attempt.attention_flags.includes(flag);
}

function countAttempts(attempts: JsonRecord[], predicate: (attempt: JsonRecord) => boolean) {
  return attempts.filter(predicate).length;
}

function byDomainStatus(attempts: JsonRecord[]) {
  return attempts.reduce<Record<string, Record<string, number>>>((groups, attempt) => {
    const domainId = attemptDomain(attempt);
    const status = attemptStatus(attempt);
    groups[domainId] ??= {};
    groups[domainId][status] = (groups[domainId][status] ?? 0) + 1;
    return groups;
  }, {});
}

function buildProviderExport(snapshot: JsonRecord) {
  const runtimeHealth = record(snapshot.runtime_health);
  const proof = record(snapshot.provider_continuous_proof);
  const providerKind = stringValue(runtimeHealth.provider_kind);
  const diagnosticProviderReady = booleanValue(runtimeHealth.provider_ready);
  const providerReady = providerKind === 'temporal' ? diagnosticProviderReady : false;
  return {
    readiness: {
      provider_kind: providerKind,
      provider_ready: providerReady,
      diagnostic_provider_ready: diagnosticProviderReady,
      retired_local_provider_counts_as_provider_ready: false,
      runtime_health_status: stringValue(runtimeHealth.status),
    },
    proof_counts: {
      proof_event_count: numberValue(proof.proof_event_count),
      proven_event_count: numberValue(proof.proven_event_count),
      continuous_proof_status: stringValue(proof.continuous_proof_status),
      proof_slo_status: stringValue(proof.proof_slo_status),
      proof_freshness_status: stringValue(proof.proof_freshness_status),
      latest_event_age_seconds: typeof proof.latest_event_age_seconds === 'number'
        ? proof.latest_event_age_seconds
        : null,
      latest_closeout_status: stringValue(proof.latest_closeout_status),
    },
  };
}

function buildStageAttemptExport(workbench: JsonRecord, attempts: JsonRecord[]) {
  const summary = record(workbench.summary);
  return {
    total: numberValue(summary.total),
    by_status: counterRecord(summary.by_status),
    by_domain: counterRecord(summary.by_domain),
    by_stage: counterRecord(summary.by_stage),
    by_domain_status: byDomainStatus(attempts),
  };
}

function buildGatesAndBlockersExport(workbench: JsonRecord, attempts: JsonRecord[]) {
  const summary = record(workbench.summary);
  const attentionCounters = record(summary.attention_counters);
  return {
    attention_count: numberValue(summary.attention_count),
    human_gate_count: numberValue(summary.human_gate_count ?? attentionCounters.human_gate_count),
    dead_letter_count: numberValue(summary.dead_letter_count ?? attentionCounters.dead_letter_count),
    blocker_count: countAttempts(attempts, (attempt) =>
      attemptHasFlag(attempt, 'blocked') && !attemptHasFlag(attempt, 'human_gate')
    ),
    resume_count: numberValue(summary.resume_count ?? attentionCounters.resume_count),
    rejected_writes_attention_count: numberValue(attentionCounters.rejected_writes_count),
  };
}

function buildMemoryWritebackExport(workbench: JsonRecord) {
  const memorySummary = record(record(workbench.memory_locator_index).summary);
  const workbenchMemoryCounters = record(record(workbench.summary).memory_ref_counters);
  return {
    consumed_memory_ref_count: numberValue(
      memorySummary.consumed_memory_ref_count ?? workbenchMemoryCounters.consumed_memory_ref_count,
    ),
    writeback_receipt_count: numberValue(
      memorySummary.writeback_receipt_ref_count ?? workbenchMemoryCounters.writeback_receipt_ref_count,
    ),
    rejected_write_count: numberValue(memorySummary.rejected_write_count),
    attempts_with_consumed_memory_refs: numberValue(workbenchMemoryCounters.attempts_with_consumed_memory_refs),
    attempts_with_writeback_receipt_refs: numberValue(workbenchMemoryCounters.attempts_with_writeback_receipt_refs),
  };
}

function buildSloReceiptHistoryExport(snapshot: JsonRecord) {
  const proof = record(snapshot.provider_continuous_proof);
  const repairLoop = record(proof.operator_slo_repair_loop);
  const receipts = record(repairLoop.execution_receipts);
  return {
    event_count: numberValue(receipts.event_count),
    executed_count: numberValue(receipts.executed_count),
    skipped_count: numberValue(receipts.skipped_count),
    blocked_count: numberValue(receipts.blocked_count),
    proven_count: numberValue(receipts.proven_count),
    latest_event_id: stringValue(receipts.latest_event_id),
    latest_event_created_at: stringValue(receipts.latest_event_created_at),
    receipt_policy: stringValue(receipts.receipt_policy),
  };
}

function sourceRefs(snapshot: JsonRecord) {
  return recordList(snapshot.source_refs).map((ref) => ({
    ref_kind: stringValue(ref.ref_kind),
    ref: stringValue(ref.ref),
    role: stringValue(ref.role),
    label: stringValue(ref.label),
  }));
}

function selectedSemanticAttempt(snapshot: JsonRecord, attempts: JsonRecord[]) {
  const operatorProjection = record(snapshot.app_operator_drilldown);
  const attentionPayload = record(operatorProjection.attention_first_payload);
  const currentOwnerDelta = record(attentionPayload.current_owner_delta);
  const selectedAttemptId = firstString(
    currentOwnerDelta.stage_attempt_id,
    record(operatorProjection.current_owner_delta).stage_attempt_id,
  );
  return {
    currentOwnerDelta,
    attempt: attempts.find((attempt) => stringValue(attempt.stage_attempt_id) === selectedAttemptId)
      ?? attempts.find((attempt) => attemptHasFlag(attempt, 'human_gate') || attemptHasFlag(attempt, 'blocked'))
      ?? attempts[0]
      ?? {},
  };
}

function firstRouteRef(currentOwnerDelta: JsonRecord, attempt: JsonRecord) {
  const auditRefs = record(currentOwnerDelta.audit_refs);
  const controlLoop = record(attempt.control_loop_summary);
  const actionRoute = record(controlLoop.action_route);
  return firstString(
    currentOwnerDelta.route_ref,
    currentOwnerDelta.live_attempt_ref,
    auditRefs.audit_next_safe_action_ref,
    stringList(actionRoute.route_refs)[0],
    record(attempt.route_impact).route_ref,
  );
}

function firstReceiptRef(currentOwnerDelta: JsonRecord, attempt: JsonRecord) {
  const controlLoopReceipts = record(record(attempt.control_loop_summary).receipts);
  return firstString(
    currentOwnerDelta.receipt_ref,
    currentOwnerDelta.latest_owner_answer_ref,
    stringList(controlLoopReceipts.receipt_refs)[0],
    stringList(attempt.closeout_refs)[0],
    stringList(attempt.writeback_receipt_refs)[0],
  );
}

function firstTypedBlockerRef(currentOwnerDelta: JsonRecord, attempt: JsonRecord) {
  const latestOwnerAnswerKind = stringValue(currentOwnerDelta.latest_owner_answer_kind);
  const latestOwnerAnswerRef = stringValue(currentOwnerDelta.latest_owner_answer_ref);
  return firstString(
    currentOwnerDelta.typed_blocker_ref,
    latestOwnerAnswerKind?.includes('typed_blocker') ? latestOwnerAnswerRef : null,
    stringList(attempt.typed_blocker_refs)[0],
    stringList(record(attempt.conflict_or_blocker_envelopes).typed_blocker_refs)[0],
  );
}

function semanticMetricValues(input: {
  stageAttempts: ReturnType<typeof buildStageAttemptExport>;
  gatesAndBlockers: ReturnType<typeof buildGatesAndBlockersExport>;
  memoryWriteback: ReturnType<typeof buildMemoryWritebackExport>;
  attempts: JsonRecord[];
}) {
  const retryCount = input.attempts.reduce((sum, attempt) => {
    const retryBudget = record(record(attempt.usage_projection).retry_budget);
    return sum + numberValue(retryBudget.used_attempts);
  }, 0);
  const observedDurations = input.attempts
    .map((attempt) => record(record(attempt.usage_projection).duration).duration_ms_observed)
    .filter((duration): duration is number => typeof duration === 'number' && Number.isFinite(duration));
  const latencyMs = observedDurations.length > 0
    ? observedDurations.reduce((sum, duration) => sum + duration, 0)
    : undefined;
  return {
    queue_length: metricValueOrUndefined(input.stageAttempts.total),
    retry_count: metricValueOrUndefined(retryCount),
    dead_letter_count: metricValueOrUndefined(input.gatesAndBlockers.dead_letter_count),
    latency_ms: latencyMs,
    error_count: metricValueOrUndefined(
      input.gatesAndBlockers.blocker_count
      + input.gatesAndBlockers.dead_letter_count
      + input.memoryWriteback.rejected_write_count,
    ),
  } satisfies Partial<Record<ObservabilityMetricInstrument, number | undefined>>;
}

function buildRuntimeSemanticConventionProjection(input: {
  snapshot: JsonRecord;
  attempts: JsonRecord[];
  stageAttempts: ReturnType<typeof buildStageAttemptExport>;
  gatesAndBlockers: ReturnType<typeof buildGatesAndBlockersExport>;
  memoryWriteback: ReturnType<typeof buildMemoryWritebackExport>;
}) {
  const { currentOwnerDelta, attempt } = selectedSemanticAttempt(input.snapshot, input.attempts);
  const hardGate = record(currentOwnerDelta.hard_gate);
  const semanticInput: ObservabilitySemanticConventionInput = {
    current_owner_delta: {
      stage_run_id: firstString(
        currentOwnerDelta.stage_run_id,
        hardGate.owner_answer_stage_run_id,
        hardGate.closeout_receipt_stage_run_id,
      ) ?? undefined,
      current_owner: firstString(currentOwnerDelta.current_owner, currentOwnerDelta.owner, attempt.next_owner)
        ?? undefined,
      domain_id: firstString(currentOwnerDelta.domain_id, currentOwnerDelta.domain, attempt.domain_id) ?? undefined,
      route_ref: firstRouteRef(currentOwnerDelta, attempt) ?? undefined,
      receipt_ref: firstReceiptRef(currentOwnerDelta, attempt) ?? undefined,
      typed_blocker_ref: firstTypedBlockerRef(currentOwnerDelta, attempt) ?? undefined,
      source_fingerprint: firstString(currentOwnerDelta.source_fingerprint, attempt.source_fingerprint) ?? undefined,
    },
    stage_attempt: {
      stage_attempt_id: stringValue(attempt.stage_attempt_id) ?? undefined,
      attempt_id: firstString(attempt.attempt_id, attempt.stage_attempt_id) ?? undefined,
      generation: typeof currentOwnerDelta.generation === 'number' ? currentOwnerDelta.generation : undefined,
    },
    provider_attempt: {
      workflow_id: stringValue(attempt.workflow_id) ?? undefined,
      task_queue: firstString(attempt.task_queue, record(attempt.provider_run).task_queue) ?? undefined,
    },
    metric_values: semanticMetricValues(input),
  };
  const readback = buildObservabilitySemanticConventionReadback(semanticInput);
  const seed = buildObservabilitySemanticConventionExportSeed(semanticInput);
  const exporterSeed = buildObservabilityExporterSeedReadback();
  const ownerRoute = buildObservabilityOwnerRouteReadback();
  return {
    ...seed,
    runtime_export_binding: {
      source_export_schema_version: 'observability_export.v1',
      source_surfaces: [
        'runtime_tray_snapshot',
        'stage_attempt_workbench',
        'opentelemetry_current_owner_delta_ref',
        'provider_continuous_proof',
      ],
      source_projection_command_ref: 'opl runtime app-operator-drilldown --detail full --json',
      source_projection_boundary: 'refs_only_current_owner_projection_no_observability_ui',
      exporter_signal_mapping_ref: 'semantic_conventions.exporter_signal_mapping',
      collector_export_boundary_ref: 'semantic_conventions.collector_export_boundary',
      exporter_seed_ref: 'semantic_conventions.exporter_seed',
      owner_route_ref: 'semantic_conventions.owner_route',
      selected_stage_attempt_id: stringValue(attempt.stage_attempt_id),
      selected_domain_id: stringValue(attempt.domain_id),
      selected_status: attemptStatus(attempt),
      binding_policy: 'runtime_export_refs_only_no_payload_body_no_ready_claim',
    },
    exporter_seed: exporterSeed,
    owner_route: ownerRoute,
    canonical_fields: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.fields,
    canonical_attributes: readback.canonical_attributes,
    signal_mappings: OPL_OBSERVABILITY_SEMANTIC_CONVENTIONS.signal_mappings,
    forbidden_body_policy: {
      body_included: false,
      body_policy: seed.summary.body_policy,
      forbidden_body_fields_present: readback.forbidden_body_fields_present,
    },
    summary: {
      ...seed.summary,
      semantic_convention_status: 'runtime_export_bound',
      body_included: false,
      owner_route_status: ownerRoute.owner_route_status,
      domain_authority_claim: 'not_claimed',
      runtime_ready_claim: 'not_claimed',
      production_ready_claim: 'not_claimed',
    },
    authority_boundary: {
      ...seed.authority_boundary,
      no_domain_authority: true,
      no_runtime_ready_claim: true,
      no_domain_ready_claim: true,
      no_production_ready_claim: true,
    },
  };
}

export async function buildObservabilityExport(
  contracts: FrameworkContracts,
  options: {
    format?: ObservabilityExportFormat;
    runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
  } = {},
) {
  const runtimeSnapshotProvider = requireRuntimeTraySnapshotProvider(
    options.runtimeSnapshotProvider,
    'runtime observability-export',
  );
  const payload = await runtimeSnapshotProvider(contracts);
  const snapshot = record(payload.runtime_tray_snapshot);
  const workbench = record(snapshot.stage_attempt_workbench);
  const attempts = recordList(workbench.attempts);
  const provider = buildProviderExport(snapshot);
  const stageAttempts = buildStageAttemptExport(workbench, attempts);
  const gatesAndBlockers = buildGatesAndBlockersExport(workbench, attempts);
  const memoryWriteback = buildMemoryWritebackExport(workbench);
  const sloReceiptHistory = buildSloReceiptHistoryExport(snapshot);
  return {
    surface_kind: 'opl_runtime_observability_export',
    schema_version: 'observability_export.v1',
    format: options.format ?? 'json',
    generated_at: stringValue(snapshot.last_updated) ?? new Date().toISOString(),
    source_surfaces: [
      'opl_runtime_authority_refs',
      'temporal_provider_proof_receipts',
      'runtime_tray_snapshot',
      'stage_attempt_workbench',
      'opentelemetry_current_owner_delta_ref',
      'observability_semantic_conventions_contract',
      'domain_owned_projection_refs',
    ],
    provider,
    stage_attempts: stageAttempts,
    gates_and_blockers: gatesAndBlockers,
    memory_writeback: memoryWriteback,
    slo_receipt_history: sloReceiptHistory,
    semantic_conventions: buildRuntimeSemanticConventionProjection({
      snapshot,
      attempts,
      stageAttempts,
      gatesAndBlockers,
      memoryWriteback,
    }),
    source_refs: sourceRefs(snapshot),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

function labelValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(values: Record<string, string | null>) {
  const entries = Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}="${labelValue(value ?? '')}"`);
  return entries.length > 0 ? `{${entries.join(',')}}` : '';
}

function metricLine(name: string, value: number, metricLabels: Record<string, string | null> = {}) {
  return `${name}${labels(metricLabels)} ${value}`;
}

function linesForCounterRecord(
  metricName: string,
  values: Record<string, unknown>,
  labelName: string,
) {
  return Object.entries(values)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([key, value]) => metricLine(metricName, Number(value), { [labelName]: key }));
}

function linesForDomainStatus(values: Record<string, Record<string, number>>) {
  return Object.entries(values).flatMap(([domainId, byStatus]) =>
    Object.entries(byStatus).map(([status, count]) =>
      metricLine('opl_stage_attempts_total', count, { domain_id: domainId, status })
    )
  );
}

export function renderObservabilityOpenMetrics(exportPayload: Awaited<ReturnType<typeof buildObservabilityExport>>) {
  const providerKind = exportPayload.provider.readiness.provider_kind ?? 'unknown';
  const providerReady = exportPayload.provider.readiness.provider_ready === true ? 1 : 0;
  const semanticConventionLines = renderObservabilitySemanticConventionOpenMetrics(exportPayload.semantic_conventions)
    .trimEnd()
    .split('\n')
    .filter((line) => line !== '# EOF');
  const lines = [
    '# HELP opl_provider_ready Current configured family runtime provider readiness from the OPL read model.',
    '# TYPE opl_provider_ready gauge',
    metricLine('opl_provider_ready', providerReady, { provider_kind: providerKind }),
    '# HELP opl_provider_proofs_total Temporal/provider residency proof receipts observed in OPL runtime authority refs.',
    '# TYPE opl_provider_proofs_total counter',
    metricLine('opl_provider_proofs_total', exportPayload.provider.proof_counts.proof_event_count, {
      provider_kind: providerKind,
      proof_slo_status: exportPayload.provider.proof_counts.proof_slo_status,
    }),
    metricLine('opl_provider_proofs_proven_total', exportPayload.provider.proof_counts.proven_event_count, {
      provider_kind: providerKind,
      continuous_proof_status: exportPayload.provider.proof_counts.continuous_proof_status,
    }),
    '# HELP opl_stage_attempts_total Stage attempts grouped by domain and status.',
    '# TYPE opl_stage_attempts_total gauge',
    ...linesForDomainStatus(exportPayload.stage_attempts.by_domain_status),
    ...linesForCounterRecord('opl_stage_attempts_by_status_total', exportPayload.stage_attempts.by_status, 'status'),
    '# HELP opl_runtime_attention_totals Human gates, dead letters, and blockers from stage attempt projection.',
    '# TYPE opl_runtime_attention_totals gauge',
    metricLine('opl_human_gate_total', exportPayload.gates_and_blockers.human_gate_count),
    metricLine('opl_dead_letter_total', exportPayload.gates_and_blockers.dead_letter_count),
    metricLine('opl_blocker_total', exportPayload.gates_and_blockers.blocker_count),
    '# HELP opl_memory_writeback_totals Memory writeback receipt and rejection counters without memory body access.',
    '# TYPE opl_memory_writeback_totals gauge',
    metricLine('opl_memory_writeback_receipts_total', exportPayload.memory_writeback.writeback_receipt_count),
    metricLine('opl_memory_writeback_rejected_total', exportPayload.memory_writeback.rejected_write_count),
    '# HELP opl_provider_slo_receipts_total Provider SLO execution receipts grouped by receipt status.',
    '# TYPE opl_provider_slo_receipts_total counter',
    metricLine('opl_provider_slo_receipts_total', exportPayload.slo_receipt_history.proven_count, {
      receipt_status: 'proven',
    }),
    metricLine('opl_provider_slo_receipts_total', exportPayload.slo_receipt_history.blocked_count, {
      receipt_status: 'blocked',
    }),
    metricLine('opl_provider_slo_receipts_executed_total', exportPayload.slo_receipt_history.executed_count),
    metricLine('opl_provider_slo_receipts_skipped_total', exportPayload.slo_receipt_history.skipped_count),
    ...semanticConventionLines,
    '# HELP opl_authority_boundary Constant guard showing this export is read-only and non-authoritative.',
    '# TYPE opl_authority_boundary gauge',
    metricLine('opl_authority_boundary', 1, {
      can_execute_repair: String(exportPayload.authority_boundary.can_execute_repair),
      can_write_domain_truth: String(exportPayload.authority_boundary.can_write_domain_truth),
      can_authorize_quality_verdict: String(exportPayload.authority_boundary.can_authorize_quality_verdict),
      can_authorize_ready_verdict: String(exportPayload.authority_boundary.can_authorize_ready_verdict),
    }),
    '# EOF',
  ];
  return `${lines.join('\n')}\n`;
}

export async function startObservabilityMetricsEndpoint(
  options: ObservabilityMetricsEndpointOptions,
): Promise<ObservabilityMetricsEndpointHandle> {
  const host = stringValue(options.host) ?? DEFAULT_METRICS_ENDPOINT_HOST;
  const port = options.port ?? DEFAULT_METRICS_ENDPOINT_PORT;
  const metricsPath = normalizeMetricsPath(options.metricsPath);
  let closeStarted = false;

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
    if (request.method !== 'GET' || requestUrl.pathname !== metricsPath) {
      if (options.once === true) response.once('finish', () => close());
      writeJsonResponse(response, 404, {
        error: 'metrics_endpoint_not_found',
        metrics_path: metricsPath,
      });
      return;
    }

    void (async () => {
      try {
        const exportPayload = await buildObservabilityExport(options.contracts, {
          format: 'openmetrics',
          runtimeSnapshotProvider: options.runtimeSnapshotProvider,
        });
        response.writeHead(200, {
          'content-type': 'application/openmetrics-text; version=1.0.0; charset=utf-8',
          'cache-control': 'no-store',
          'x-opl-authority-boundary': 'read_only_non_authoritative',
        });
        response.end(renderObservabilityOpenMetrics(exportPayload));
      } catch (error) {
        writeJsonResponse(response, 500, {
          error: 'observability_export_failed',
          message: errorMessage(error),
        });
      }
    })();
    if (options.once === true) response.once('finish', () => close());
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
  const readback = buildEndpointReadback({
    host,
    port: address.port,
    metricsPath,
    once: options.once === true,
  });

  if (options.readyFile) {
    await writeFile(options.readyFile, `${JSON.stringify(readback, null, 2)}\n`);
  }

  return {
    server,
    readback,
    closed,
    close,
  };
}

export async function serveObservabilityMetricsEndpoint(options: ObservabilityMetricsEndpointOptions) {
  const handle = await startObservabilityMetricsEndpoint(options);
  await handle.closed;
  return handle.readback;
}
