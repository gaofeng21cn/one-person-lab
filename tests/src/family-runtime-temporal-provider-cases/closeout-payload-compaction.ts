import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  compactCloseoutPacketForTemporalResult,
} from '../../../src/modules/runway/family-runtime-temporal-activities.ts';
import {
  createWorkItemExecutionScopeSnapshot,
} from '../../../src/modules/workspace/execution-scope.ts';

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

test('Temporal Codex activity preserves work-item StageRun identity in compacted closeout packets', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-closeout-identity-'));
  const canonicalWorkItemRoot = path.join(workspaceRoot, 'studies', 'study-001');
  fs.mkdirSync(canonicalWorkItemRoot, { recursive: true });
  try {
    const executionScope = createWorkItemExecutionScopeSnapshot({
      projectScopeId: 'project:temporal-closeout-identity',
      workspaceBindingId: 'binding:temporal-closeout-identity',
      bindingVersionId: 'binding-version:temporal-closeout-identity',
      domainId: 'medautoscience',
      workspaceRoot,
      canonicalWorkItemRoot,
      inventoryDigest: `sha256:${'1'.repeat(64)}`,
      payload: { study_id: 'study-001' },
      requirement: { kind: 'work_item', alias_fields: ['study_id'] },
    });
    const compacted = compactCloseoutPacketForTemporalResult({
      surface_kind: 'stage_attempt_closeout_packet',
      stage_attempt_id: 'sat_temporal_closeout_identity',
      stage_run_id: 'sr_temporal_closeout_identity',
      execution_scope: executionScope,
      scope_digest: executionScope.scope_digest,
      closeout_refs: ['receipt:temporal-closeout-identity'],
    });

    assert.ok(compacted);
    assert.equal(compacted.stage_run_id, 'sr_temporal_closeout_identity');
    assert.equal(compacted.scope_digest, executionScope.scope_digest);
    assert.deepEqual(compacted.execution_scope, executionScope);
    assert.ok(compacted.temporal_payload_policy.retained_fields.includes('stage_run_id'));
    assert.ok(compacted.temporal_payload_policy.retained_fields.includes('scope_digest'));
    assert.ok(compacted.temporal_payload_policy.retained_fields.includes('execution_scope'));
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
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
