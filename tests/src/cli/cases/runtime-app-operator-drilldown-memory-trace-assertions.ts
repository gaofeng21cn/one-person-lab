import { assert } from '../helpers.ts';

export function assertMemoryTraceProjection(projection: any): void {
  assert.equal(
    projection.memory_trace_projection.surface_kind,
    'opl_memory_trace_projection',
  );
  assert.equal(projection.memory_trace_projection.projection_scope, 'stage_attempt_workbench');
  assert.deepEqual(projection.memory_trace_projection.consumed_memory_refs, ['memory:route-policy']);
  assert.deepEqual(projection.memory_trace_projection.recall_trace_refs, [
    'memory-recall-trace:write/route-policy',
  ]);
  assert.deepEqual(projection.memory_trace_projection.retrieval_trace_refs, [
    'memory-retrieval-trace:write/route-policy',
  ]);
  assert.deepEqual(projection.memory_trace_projection.writeback_receipt_refs, [
    'memory-writeback:receipt-1',
  ]);
  assert.deepEqual(projection.memory_trace_projection.rejected_write_refs, [
    'memory-rejected-write:write/unsafe-body',
  ]);
  assert.deepEqual(projection.memory_trace_projection.source_refs, ['source:dataset']);
  assert.equal(projection.memory_trace_projection.summary.rejected_write_ref_count, 1);
  assert.equal(projection.memory_trace_projection.false_authority_flags.can_read_memory_body, false);
  assert.equal(
    projection.memory_trace_projection.false_authority_flags.can_write_domain_memory_body,
    false,
  );
  assert.equal(
    projection.memory_trace_projection.false_authority_flags.can_accept_or_reject_memory_writeback,
    false,
  );
  assert.equal(
    projection.memory_trace_projection.false_authority_flags.can_authorize_quality_verdict,
    false,
  );
  assert.equal(JSON.stringify(projection.memory_trace_projection).includes(
    'domain-owned rejected write body',
  ), false);
  assert.equal(
    projection.runtime_workbench.memory_trace_projection.surface_kind,
    'opl_memory_trace_projection',
  );
}
