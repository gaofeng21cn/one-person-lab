import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compactCloseoutPacketForTemporalResult,
} from '../../../src/adapters/execution/family-runtime-temporal-activities.ts';
import {
  evaluateStageQualityAttemptRoute,
} from '../../../src/authority/stages/stage-quality-route-selection.ts';

test('Temporal Codex activity compacts typed closeout packets before activity completion', () => {
  const largeCloseout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_large_temporal_payload',
    stage_run_id: 'sr_large_temporal_payload',
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
    scope_digest: `sha256:${'a'.repeat(64)}`,
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
  assert.equal(compacted.stage_run_id, 'sr_large_temporal_payload');
  assert.equal(compacted.scope_digest, `sha256:${'a'.repeat(64)}`);
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
  assert.ok(compacted.temporal_payload_policy.retained_fields.includes('stage_run_id'));
  assert.ok(compacted.temporal_payload_policy.retained_fields.includes('scope_digest'));
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

test('Temporal closeout history drops recommendation-only reason from a decisive route', () => {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:reviewer-closeout'],
    route_impact: {
      stage_quality_cycle: { outcome: 'quality_debt', findings: [] },
      stage_route_decision: {
        decision_kind: 'advance',
        target_stage_id: 'baseline_and_evidence_setup',
        reason: 'Human-readable rationale belongs to recommendations, not decisions.',
        evidence_refs: ['receipt:reviewer-closeout'],
      },
    },
  };
  const compacted = compactCloseoutPacketForTemporalResult(closeout);

  assert.ok(compacted);
  assert.deepEqual(
    (compacted.route_impact as Record<string, Record<string, unknown>>).stage_route_decision,
    {
      decision_kind: 'advance',
      target_stage_id: 'baseline_and_evidence_setup',
      evidence_refs: ['receipt:reviewer-closeout'],
    },
  );
  const reviewerAttempt = {
    attempt_role: 'reviewer',
    stage_id: 'direction_and_route_selection',
    context_manifest: {
      cross_stage_route_selection: {
        surface_kind: 'opl_stage_run_route_selection_context',
        version: 'stage-run-route-selection-context.v1',
        current_attempt_role: 'reviewer',
        configured_decisive_attempt_roles: ['reviewer', 're_reviewer'],
        declared_stage_ids: ['direction_and_route_selection', 'baseline_and_evidence_setup'],
        max_repair_rounds: 3,
      },
    },
  };
  const accepted = evaluateStageQualityAttemptRoute({
    attempt: reviewerAttempt,
    routeImpact: compacted.route_impact,
  });
  assert.equal(accepted.decision?.target_stage_id, 'baseline_and_evidence_setup');
  assert.deepEqual(accepted.decision_rejection_reasons, []);

  const closeoutWithUnknownField = structuredClone(closeout);
  (closeoutWithUnknownField.route_impact.stage_route_decision as Record<string, unknown>).unexpected = true;
  const compactedWithUnknownField = compactCloseoutPacketForTemporalResult(closeoutWithUnknownField);
  assert.ok(compactedWithUnknownField);
  const rejected = evaluateStageQualityAttemptRoute({
    attempt: reviewerAttempt,
    routeImpact: compactedWithUnknownField.route_impact,
  });
  assert.equal(rejected.decision, null);
  assert.ok(rejected.decision_rejection_reasons.includes(
    'route_selection_contains_unsupported_fields',
  ));
});
