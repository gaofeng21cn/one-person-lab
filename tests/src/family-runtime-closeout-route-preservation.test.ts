import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCloseoutFromCodexMessages } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/session-closeout-recovery.ts';
import {
  normalizeTypedStageCloseoutPacket,
  validateCloseoutPacketForAttempt,
} from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { buildRawArtifactProgressCloseoutPacket } from '../../src/adapters/execution/family-runtime-codex-stage-runner.ts';

const DECISION = {
  decision_kind: 'advance',
  target_stage_id: 'design-basis-admission',
  evidence_refs: ['opl://evidence/route-1'],
};

function typedPacket(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_route_fixture',
    closeout_refs: ['opl://stage-attempts/sat_route_fixture/artifacts/decision.json'],
    consumed_refs: ['opl://stage-packets/mission-intake'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'ibd_evidence',
    domain_ready_verdict: null,
    route_impact: { stage_route_decision: DECISION },
    ...overrides,
  };
}

function rawArtifact() {
  return {
    output_ref: 'file:///tmp/raw-executor-output.txt',
    metadata_ref: 'file:///tmp/raw-executor-output.metadata.json',
    sha256: 'a'.repeat(64),
    size_bytes: 4096,
  };
}

function progressEnvelope() {
  return buildRawArtifactProgressCloseoutPacket({
    attempt: { stage_attempt_id: 'sat_route_fixture', domain_id: 'ibd_evidence' },
    stagePacketRef: 'opl://stage-packets/mission-intake',
    rawArtifact: rawArtifact(),
    normalizationFindings: ['typed_closeout_not_required_raw_artifact_advanced'],
  });
}

test('a fenced typed closeout surrounded by prose is selectable', () => {
  const packet = typedPacket();
  const messages = [
    'I finished the mission-intake work and wrote the decision file.\n',
    `\`\`\`json\n${JSON.stringify(packet, null, 2)}\n\`\`\`\n`,
    'Let me know if you want me to continue.',
  ];
  const parsed = parseCloseoutFromCodexMessages(messages);
  assert.ok(parsed, 'fenced closeout must be selectable');
  assert.equal(parsed.surface_kind, 'stage_attempt_closeout_packet');
  assert.deepEqual(
    (parsed.route_impact as Record<string, unknown>).stage_route_decision,
    DECISION,
  );
});

test('a bare typed closeout is still selectable without a fence', () => {
  const parsed = parseCloseoutFromCodexMessages([JSON.stringify(typedPacket())]);
  assert.ok(parsed);
  assert.deepEqual(
    (parsed.route_impact as Record<string, unknown>).stage_route_decision,
    DECISION,
  );
});

test('a fenced block holding non-JSON is not guessed at', () => {
  const messages = [
    'Here is the plan, not a closeout.\n',
    '```json\n{ "surface_kind": "stage_attempt_closeout_packet", \n```\n',
  ];
  assert.equal(parseCloseoutFromCodexMessages(messages), null);
});

// The framework progress envelope is controller-owned transport. It may not carry
// domain routing semantics: `verifyFrameworkRawProgressEnvelope` matches its route
// impact against an exact canonical field set, so any injected route field turns a
// recoverable transport defect into an authority-boundary hard stop.
test('the framework progress envelope keeps its canonical route impact shape', () => {
  const envelope = progressEnvelope();
  const routeImpact = envelope.route_impact as Record<string, unknown>;
  assert.equal(routeImpact.framework_generated_envelope, true);
  assert.equal(routeImpact.next_stage_may_start, true);
  assert.deepEqual(routeImpact.normalization_findings, ['typed_closeout_not_required_raw_artifact_advanced']);
  assert.equal(envelope.authority_boundary.opl, 'raw_executor_output_progress_envelope_only');
  assert.deepEqual(
    Object.keys(routeImpact).sort(),
    [
      'artifact_metadata_refs',
      'consumable_artifact_refs',
      'framework_generated_envelope',
      'negative_or_partial_output_counts_as_progress',
      'next_stage_may_start',
      'normalization_findings',
      'quality_debt_refs',
      'route_back_may_target_any_declared_stage',
      'route_back_selection_owner',
      'transition_outcome',
    ],
  );
  assert.equal('stage_route_decision' in routeImpact, false);
  assert.equal('stage_route_recommendation' in routeImpact, false);
});

test('the progress envelope records why a typed closeout was not used', () => {
  const envelope = buildRawArtifactProgressCloseoutPacket({
    attempt: { stage_attempt_id: 'sat_route_fixture', domain_id: 'ibd_evidence' },
    stagePacketRef: 'opl://stage-packets/mission-intake',
    rawArtifact: rawArtifact(),
    normalizationFindings: [
      'typed_closeout_stage_attempt_id_mismatch',
      'closeout_identity_verification_raw_executor_output_semantic_authority_violation',
      'typed_closeout_not_required_raw_artifact_advanced',
    ],
  });
  assert.deepEqual(
    (envelope.route_impact as Record<string, unknown>).normalization_findings,
    [
      'typed_closeout_stage_attempt_id_mismatch',
      'closeout_identity_verification_raw_executor_output_semantic_authority_violation',
      'typed_closeout_not_required_raw_artifact_advanced',
    ],
  );
});

// A mistyped opaque id is a transport defect, but it must still be rejected rather
// than silently re-bound: the same check is what stops a stale closeout recovered
// from a previous Attempt's session from being adopted by the current one.
test('a mistyped stage_attempt_id is rejected instead of re-bound', () => {
  const attempt = { stage_attempt_id: 'sat_cb3e45cb4753d21c13fd0074' };
  const result = validateCloseoutPacketForAttempt({
    closeoutPacket: normalizeTypedStageCloseoutPacket(typedPacket({
      stage_attempt_id: 'sat_cb3e45cb475d21c13fd0074',
    })),
    attempt,
  });
  assert.equal(result.closeoutPacket, null);
  assert.equal(result.rejection?.reason, 'stage_attempt_id_mismatch');
  assert.equal(result.rejection?.stage_attempt_id, 'sat_cb3e45cb475d21c13fd0074');
});

test('an exactly matching stage_attempt_id passes the identity-echo check', () => {
  const attempt = { stage_attempt_id: 'sat_route_fixture' };
  const result = validateCloseoutPacketForAttempt({
    closeoutPacket: normalizeTypedStageCloseoutPacket(typedPacket()),
    attempt,
  });
  // The echo check is only the first gate; the packet below carries no execution
  // scope, so a later gate may still reject it. What matters here is that the
  // matching id is not the reason.
  assert.notEqual(result.rejection?.reason, 'stage_attempt_id_mismatch');
});

test('closeout_ref_metadata still rejects unsupported domain fields', () => {
  assert.throws(
    () => normalizeTypedStageCloseoutPacket(typedPacket({
      closeout_refs: [{
        ref: 'opl://stage-attempts/sat_route_fixture/artifacts/decision.json',
        ref_kind: 'artifact',
        sha256: 'b'.repeat(64),
        artifact_type: 'knowledge',
      }],
    })),
    /unsupported field/,
  );
});
