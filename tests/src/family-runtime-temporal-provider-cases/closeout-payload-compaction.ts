import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compactCloseoutPacketForTemporalResult,
} from '../../../src/modules/runway/family-runtime-temporal-activities.ts';

test('Temporal Codex activity compacts typed closeout packets before activity completion', () => {
  const largeCloseout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_large_temporal_payload',
    idempotency_key: 'idem-large-temporal-payload',
    closeout_refs: [
      'receipt:large-closeout',
      {
        ref_kind: 'stage_attempt_closeout_packet_ref',
        uri: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
        sha256: 'sha256:closeout',
        size_bytes: 2048,
      },
    ],
    consumed_refs: ['artifact:draft'],
    consumed_memory_refs: ['memory:route-policy'],
    writeback_receipt_refs: ['memory-writeback:receipt-1'],
    rejected_writes: [{ reason: 'domain_truth_write_forbidden', body: 'small ref-only reason' }],
    domain_ready_verdict: 'domain_gate_pending',
    domain_output: {
      surface_kind: 'domain_owned_stage_output_ref',
      version: 'domain-owned-stage-output-ref.v1',
      domain_id: 'redcube',
      output_ref: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
    },
    human_stage_log: {
      stage_work_done: ['x'.repeat(2_000_000)],
      deliverable_work_done: ['y'.repeat(2_000_000)],
    },
    user_stage_log: {
      stage_work_done: ['z'.repeat(2_000_000)],
    },
    full_transcript: 'must-not-enter-temporal-completion',
  };

  const compacted = compactCloseoutPacketForTemporalResult(largeCloseout);
  assert.ok(compacted);
  assert.deepEqual(compacted.closeout_refs, [
    'receipt:large-closeout',
    'file:///tmp/redcube-runtime/artifacts/closeout.json',
  ]);
  assert.deepEqual(compacted.closeout_ref_metadata, [{
    ref_kind: 'stage_attempt_closeout_packet_ref',
    uri: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
    sha256: 'sha256:closeout',
    size_bytes: 2048,
    ref: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
  }]);
  assert.deepEqual(compacted.domain_output, {
    surface_kind: 'domain_owned_stage_output_ref',
    version: 'domain-owned-stage-output-ref.v1',
    domain_id: 'redcube',
    output_ref: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
  });
  assert.equal((compacted.route_impact as Record<string, { stage_work_done: string[] }>).user_stage_log.stage_work_done[0].endsWith('[omitted:2000000 chars]'), true);
  const compactedRecord = compacted as Record<string, unknown>;
  assert.equal(compactedRecord.human_stage_log, undefined);
  assert.equal(compactedRecord.user_stage_log, undefined);
  assert.equal(compactedRecord.full_transcript, undefined);
  assert.equal(compacted.temporal_payload_policy.full_closeout_body_omitted, true);
  assert.equal(JSON.stringify(compacted).includes('must-not-enter-temporal-completion'), false);
  assert.ok(compacted.temporal_payload_policy.retained_fields.includes('domain_output'));
  assert.ok(Buffer.byteLength(JSON.stringify(compacted), 'utf8') < 20_000);
});

test('Temporal Codex activity rejects object closeout refs carrying nested body metadata', () => {
  assert.equal(compactCloseoutPacketForTemporalResult({
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: [{
      ref_kind: 'stage_attempt_closeout_packet_ref',
      uri: 'file:///tmp/redcube-runtime/artifacts/closeout.json',
      payload: { artifact_body: 'must-not-enter-temporal' },
    }],
  }), null);
});

test('Temporal Codex activity rejects inline domain output payloads', () => {
  const outputRef = 'file:///tmp/redcube-runtime/artifacts/closeout.json';
  assert.equal(compactCloseoutPacketForTemporalResult({
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: [outputRef],
    domain_output: {
      surface_kind: 'domain_owned_stage_output_ref',
      version: 'domain-owned-stage-output-ref.v1',
      domain_id: 'redcube',
      output_ref: outputRef,
      payload: { artifact_body: 'must-not-enter-temporal' },
    },
  }), null);
});
