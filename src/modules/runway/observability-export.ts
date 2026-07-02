import { buildRuntimeTraySnapshot } from '../console/runtime-tray-snapshot.ts';
import type { JsonRecord } from '../console/runtime-tray-snapshot-types.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

export type ObservabilityExportFormat = 'json' | 'openmetrics';

const AUTHORITY_BOUNDARY = {
  opl: 'read_only_observability_export_projection',
  source_authority: 'opl_runtime_ledger_provider_receipts_snapshot_and_domain_projection_refs',
  can_execute_repair: false,
  can_write_domain_truth: false,
  can_authorize_quality_verdict: false,
  can_authorize_ready_verdict: false,
  can_authorize_artifact_export: false,
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

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
  return {
    readiness: {
      provider_kind: stringValue(runtimeHealth.provider_kind),
      provider_ready: booleanValue(runtimeHealth.provider_ready),
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

export async function buildObservabilityExport(
  contracts: FrameworkContracts,
  options: { format?: ObservabilityExportFormat } = {},
) {
  const payload = await buildRuntimeTraySnapshot(contracts);
  const snapshot = record(payload.runtime_tray_snapshot);
  const workbench = record(snapshot.stage_attempt_workbench);
  const attempts = recordList(workbench.attempts);
  return {
    surface_kind: 'opl_runtime_observability_export',
    schema_version: 'observability_export.v1',
    format: options.format ?? 'json',
    generated_at: stringValue(snapshot.last_updated) ?? new Date().toISOString(),
    source_surfaces: [
      'opl_runtime_ledger',
      'temporal_provider_proof_receipts',
      'runtime_tray_snapshot',
      'stage_attempt_workbench',
      'domain_owned_projection_refs',
    ],
    provider: buildProviderExport(snapshot),
    stage_attempts: buildStageAttemptExport(workbench, attempts),
    gates_and_blockers: buildGatesAndBlockersExport(workbench, attempts),
    memory_writeback: buildMemoryWritebackExport(workbench),
    slo_receipt_history: buildSloReceiptHistoryExport(snapshot),
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
  const lines = [
    '# HELP opl_provider_ready Current configured family runtime provider readiness from the OPL read model.',
    '# TYPE opl_provider_ready gauge',
    metricLine('opl_provider_ready', providerReady, { provider_kind: providerKind }),
    '# HELP opl_provider_proofs_total Temporal/provider residency proof receipts observed in the OPL ledger.',
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
