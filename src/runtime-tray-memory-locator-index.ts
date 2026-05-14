import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type MemoryLocatorAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: unknown[];
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

export function buildAttemptMemoryLocatorIndex(attempt: MemoryLocatorAttempt) {
  const rejectedWrites = recordList(attempt.rejected_writes);
  const consumedMemoryRefs = uniqueStrings(attempt.consumed_memory_refs);
  const writebackReceiptRefs = uniqueStrings(attempt.writeback_receipt_refs);
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
