import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type MemoryLocatorAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: unknown[];
  route_impact?: JsonRecord;
  workspace_locator?: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringList);
  }
  if (isRecord(value)) {
    return [
      stringValue(value.ref),
      stringValue(value.ref_id),
      stringValue(value.path),
      stringValue(value.uri),
    ].filter((ref): ref is string => Boolean(ref));
  }
  return [];
}

function refsFromRecord(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) {
    return [];
  }
  return keys.flatMap((key) => stringList(record[key]));
}

function rejectedWriteRefs(rejectedWrites: JsonRecord[]) {
  return uniqueStrings(rejectedWrites.flatMap((rejection) => stringList(rejection)));
}

function memoryTraceAuthorityBoundary() {
  return {
    opl: 'memory_trace_refs_projection_only',
    domain: 'memory_body_writeback_accept_reject_owner',
    can_read_memory_body: false,
    can_write_domain_memory_body: false,
    can_accept_or_reject_memory_writeback: false,
    can_authorize_quality_verdict: false,
  };
}

export function buildMemoryTraceProjection(
  attempt: MemoryLocatorAttempt,
  projectionScope = 'stage_attempt',
) {
  const rejectedWrites = recordList(attempt.rejected_writes);
  const consumedMemoryRefs = uniqueStrings(attempt.consumed_memory_refs);
  const writebackReceiptRefs = uniqueStrings(attempt.writeback_receipt_refs);
  const recallTraceRefs = uniqueStrings(refsFromRecord(attempt.route_impact, [
    'memory_recall_trace_ref',
    'memory_recall_trace_refs',
    'recall_trace_ref',
    'recall_trace_refs',
  ]));
  const retrievalTraceRefs = uniqueStrings(refsFromRecord(attempt.route_impact, [
    'memory_retrieval_trace_ref',
    'memory_retrieval_trace_refs',
    'retrieval_trace_ref',
    'retrieval_trace_refs',
  ]));
  const sourceRefs = uniqueStrings(refsFromRecord(attempt.workspace_locator, [
    'source_ref',
    'source_refs',
  ]));
  const rejectedRefs = rejectedWriteRefs(rejectedWrites);
  const traceObserved = consumedMemoryRefs.length > 0
    || recallTraceRefs.length > 0
    || retrievalTraceRefs.length > 0
    || writebackReceiptRefs.length > 0
    || rejectedRefs.length > 0
    || sourceRefs.length > 0;

  return {
    surface_kind: 'opl_memory_trace_projection',
    projection_scope: projectionScope,
    availability: traceObserved ? 'memory_trace_refs_observed' : 'no_memory_trace_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    consumed_memory_refs: consumedMemoryRefs,
    recall_trace_refs: recallTraceRefs,
    retrieval_trace_refs: retrievalTraceRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    rejected_write_refs: rejectedRefs,
    source_refs: sourceRefs,
    summary: {
      consumed_memory_ref_count: consumedMemoryRefs.length,
      recall_trace_ref_count: recallTraceRefs.length,
      retrieval_trace_ref_count: retrievalTraceRefs.length,
      writeback_receipt_ref_count: writebackReceiptRefs.length,
      rejected_write_ref_count: rejectedRefs.length,
      source_ref_count: sourceRefs.length,
      projection_policy: 'memory_trace_refs_only_no_memory_body',
    },
    false_authority_flags: {
      can_read_memory_body: false,
      can_write_domain_memory_body: false,
      can_accept_or_reject_memory_writeback: false,
      can_authorize_quality_verdict: false,
    },
    authority_boundary: memoryTraceAuthorityBoundary(),
  };
}

export function summarizeMemoryTraceProjections(
  projections: ReturnType<typeof buildMemoryTraceProjection>[],
  projectionScope = 'stage_attempt_workbench',
) {
  const consumedMemoryRefs = uniqueStrings(projections.flatMap((projection) => projection.consumed_memory_refs));
  const recallTraceRefs = uniqueStrings(projections.flatMap((projection) => projection.recall_trace_refs));
  const retrievalTraceRefs = uniqueStrings(projections.flatMap((projection) => projection.retrieval_trace_refs));
  const writebackReceiptRefs = uniqueStrings(projections.flatMap((projection) => projection.writeback_receipt_refs));
  const rejectedWriteRefs = uniqueStrings(projections.flatMap((projection) => projection.rejected_write_refs));
  const sourceRefs = uniqueStrings(projections.flatMap((projection) => projection.source_refs));
  const traceObserved = projections.some((projection) => projection.availability === 'memory_trace_refs_observed');

  return {
    surface_kind: 'opl_memory_trace_projection',
    projection_scope: projectionScope,
    availability: traceObserved ? 'memory_trace_refs_observed' : 'no_memory_trace_refs',
    attempts: projections,
    consumed_memory_refs: consumedMemoryRefs,
    recall_trace_refs: recallTraceRefs,
    retrieval_trace_refs: retrievalTraceRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    rejected_write_refs: rejectedWriteRefs,
    source_refs: sourceRefs,
    summary: {
      attempt_count: projections.length,
      attempt_with_memory_trace_ref_count: projections.filter((projection) =>
        projection.availability === 'memory_trace_refs_observed'
      ).length,
      consumed_memory_ref_count: consumedMemoryRefs.length,
      recall_trace_ref_count: recallTraceRefs.length,
      retrieval_trace_ref_count: retrievalTraceRefs.length,
      writeback_receipt_ref_count: writebackReceiptRefs.length,
      rejected_write_ref_count: rejectedWriteRefs.length,
      source_ref_count: sourceRefs.length,
      projection_policy: 'memory_trace_refs_only_no_memory_body',
    },
    false_authority_flags: {
      can_read_memory_body: false,
      can_write_domain_memory_body: false,
      can_accept_or_reject_memory_writeback: false,
      can_authorize_quality_verdict: false,
    },
    authority_boundary: memoryTraceAuthorityBoundary(),
  };
}

export type MemoryTraceProjection = ReturnType<typeof buildMemoryTraceProjection>;

export function buildAttemptMemoryLocatorIndex(attempt: MemoryLocatorAttempt) {
  const rejectedWrites = recordList(attempt.rejected_writes);
  const consumedMemoryRefs = uniqueStrings(attempt.consumed_memory_refs);
  const writebackReceiptRefs = uniqueStrings(attempt.writeback_receipt_refs);
  const memoryTraceProjection = buildMemoryTraceProjection(attempt);
  const hasMemoryEvidence = consumedMemoryRefs.length > 0
    || writebackReceiptRefs.length > 0
    || rejectedWrites.length > 0;
  return {
    surface_kind: 'opl_memory_locator_index_projection',
    projection_scope: 'stage_attempt',
    index_role: 'generic_memory_locator_index_shell',
    availability: hasMemoryEvidence ? 'memory_refs_observed' : 'no_memory_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    rejected_writes: rejectedWrites,
    memory_trace_projection: memoryTraceProjection,
    summary: {
      consumed_memory_ref_count: consumedMemoryRefs.length,
      writeback_receipt_ref_count: writebackReceiptRefs.length,
      rejected_write_count: rejectedWrites.length,
      projection_policy: 'memory_refs_and_receipts_only_no_memory_body',
    },
    authority_boundary: {
      opl: 'memory_locator_index_and_receipt_projection_only',
      domain: 'memory_body_writeback_accept_reject_owner',
      can_read_memory_body: false,
      can_accept_or_reject_writeback: false,
      can_write_domain_memory_body: false,
    },
  };
}

export function buildWorkbenchMemoryLocatorIndex(attempts: MemoryLocatorAttempt[]) {
  const perAttempt = attempts.map(buildAttemptMemoryLocatorIndex);
  const consumedMemoryRefs = uniqueStrings(perAttempt.flatMap((projection) => projection.consumed_memory_refs));
  const writebackReceiptRefs = uniqueStrings(perAttempt.flatMap((projection) => projection.writeback_receipt_refs));
  const rejectedWrites = perAttempt.flatMap((projection) => projection.rejected_writes);
  const memoryTraceProjection = summarizeMemoryTraceProjections(
    perAttempt.map((projection) => projection.memory_trace_projection),
  );
  return {
    surface_kind: 'opl_memory_locator_index_projection',
    projection_scope: 'stage_attempt_workbench',
    index_role: 'generic_memory_locator_index_shell',
    availability: perAttempt.some((projection) => projection.availability === 'memory_refs_observed')
      ? 'memory_refs_observed'
      : 'no_memory_refs',
    attempts: perAttempt,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    rejected_writes: rejectedWrites,
    memory_trace_projection: memoryTraceProjection,
    summary: {
      attempt_count: attempts.length,
      attempt_with_memory_ref_count: perAttempt.filter((projection) =>
        projection.summary.consumed_memory_ref_count > 0
          || projection.summary.writeback_receipt_ref_count > 0
          || projection.summary.rejected_write_count > 0
      ).length,
      consumed_memory_ref_count: consumedMemoryRefs.length,
      writeback_receipt_ref_count: writebackReceiptRefs.length,
      rejected_write_count: rejectedWrites.length,
      projection_policy: 'memory_refs_and_receipts_only_no_memory_body',
    },
    authority_boundary: {
      opl: 'memory_locator_index_and_receipt_projection_only',
      domain: 'memory_body_writeback_accept_reject_owner',
      can_read_memory_body: false,
      can_accept_or_reject_writeback: false,
      can_write_domain_memory_body: false,
    },
  };
}
