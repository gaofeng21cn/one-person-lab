import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import type { JsonRecord } from '../../../kernel/json-record.ts';
import {
  record,
  stringList,
  stringValue,
  uniqueStrings,
} from './value-utils.ts';

export function buildMemoryTraceProjection(workbench: JsonRecord) {
  const trace = record(workbench.memory_trace_projection);
  return {
    surface_kind: 'opl_memory_trace_projection',
    projection_scope: 'stage_attempt_workbench',
    availability: stringValue(trace.availability) ?? 'no_memory_trace_refs',
    consumed_memory_refs: uniqueStrings(stringList(trace.consumed_memory_refs)),
    recall_trace_refs: uniqueStrings(stringList(trace.recall_trace_refs)),
    retrieval_trace_refs: uniqueStrings(stringList(trace.retrieval_trace_refs)),
    writeback_receipt_refs: uniqueStrings(stringList(trace.writeback_receipt_refs)),
    rejected_write_refs: uniqueStrings(stringList(trace.rejected_write_refs)),
    source_refs: uniqueStrings(stringList(trace.source_refs)),
    summary: record(trace.summary),
    false_authority_flags: {
      can_read_memory_body: false,
      can_write_domain_memory_body: false,
      can_accept_or_reject_memory_writeback: false,
      can_authorize_quality_verdict: false,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
