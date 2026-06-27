import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compactCloseoutPacketForTemporalResult,
} from '../../../src/family-runtime-temporal-activities.ts';

test('Temporal Codex activity compacts typed closeout packets before activity completion', () => {
  const largeCloseout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_large_temporal_payload',
    idempotency_key: 'idem-large-temporal-payload',
    closeout_refs: [
      'receipt:large-closeout',
      {
        ref_kind: 'stage_attempt_closeout_packet_ref',
        uri: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
        sha256: 'sha256:003-closeout',
        size_bytes: 2048,
      },
    ],
    consumed_refs: ['paper:draft.md'],
    consumed_memory_refs: ['memory:route-policy'],
    writeback_receipt_refs: ['memory-writeback:receipt-1'],
    rejected_writes: [{ reason: 'domain_truth_write_forbidden', body: 'small ref-only reason' }],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: { next_owner: 'publication_gate' },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
    paper_stage_log: {
      stage_name: 'run_gate_clearing_batch',
      stage_work_done: ['x'.repeat(2_000_000)],
      paper_work_done: ['y'.repeat(2_000_000)],
    },
    user_stage_log: {
      body: 'z'.repeat(2_000_000),
    },
    full_transcript: 'must-not-enter-temporal-completion',
  };

  const compacted = compactCloseoutPacketForTemporalResult(largeCloseout);
  assert.ok(compacted);
  assert.equal(compacted.surface_kind, 'stage_attempt_closeout_packet');
  assert.equal(compacted.stage_attempt_id, 'sat_large_temporal_payload');
  assert.deepEqual(compacted.closeout_refs, [
    'receipt:large-closeout',
    'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
  ]);
  assert.deepEqual(compacted.closeout_ref_metadata, [
    {
      ref_kind: 'stage_attempt_closeout_packet_ref',
      uri: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
      ref: 'file:///tmp/mas/studies/003/artifacts/supervision/consumer/default_executor_execution/sat_85bd.closeout.json',
      sha256: 'sha256:003-closeout',
      size_bytes: 2048,
    },
  ]);
  assert.deepEqual(compacted.consumed_refs, ['paper:draft.md']);
  assert.deepEqual(compacted.consumed_memory_refs, ['memory:route-policy']);
  assert.deepEqual(compacted.writeback_receipt_refs, ['memory-writeback:receipt-1']);
  assert.deepEqual(compacted.rejected_writes, [{ reason: 'domain_truth_write_forbidden', body: 'small ref-only reason' }]);
  assert.equal(compacted.next_owner, 'med-autoscience');
  assert.equal(compacted.domain_ready_verdict, 'domain_gate_pending');
  assert.deepEqual(compacted.route_impact, { next_owner: 'publication_gate' });
  const compactedRecord = compacted as Record<string, unknown>;
  assert.equal(compactedRecord.paper_stage_log, undefined);
  assert.equal(compactedRecord.user_stage_log, undefined);
  assert.equal(compactedRecord.full_transcript, undefined);
  assert.equal(compacted.temporal_payload_policy.full_closeout_body_omitted, true);
  assert.equal(compacted.temporal_payload_policy.retained_fields.includes('closeout_ref_metadata'), true);
  assert.equal(JSON.stringify(compacted).includes('must-not-enter-temporal-completion'), false);
  assert.ok(
    Buffer.byteLength(JSON.stringify(compacted), 'utf8') < 20_000,
    'Temporal completion payload must stay refs-only and small.',
  );
});
