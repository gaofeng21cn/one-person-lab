import assert from 'node:assert/strict';
import test from 'node:test';

const { MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES, stringifyBoundedStageAttemptJson } = await import(
  '../../src/adapters/execution/family-runtime-stage-attempts-parts/shared.ts'
);

test('admits the 68 884-byte hydrated packet that a real blueprint Stage produced', () => {
  // agent-blueprint-authoring authored a 33 KB packet and cited it; hydration merged the body
  // and metadata into 68 884 bytes, which the old 64 KiB bound rejected.
  const packet = { surface_kind: 'stage_attempt_closeout_packet', payload: 'x'.repeat(68_884) };
  const serialized = stringifyBoundedStageAttemptJson(packet, 'stage_attempt_closeout.packet_json');
  assert.ok(Buffer.byteLength(serialized) > 68_884);
});

test('stays well under the Temporal payload limit', () => {
  assert.ok(MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES >= 256 * 1024);
  assert.ok(MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES <= 1024 * 1024);
});

test('still rejects a packet that is genuinely unbounded', () => {
  const packet = { payload: 'x'.repeat(MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES + 10) };
  assert.throws(
    () => stringifyBoundedStageAttemptJson(packet, 'stage_attempt_closeout.packet_json'),
    /exceeds the persisted StageAttempt JSON byte limit/,
  );
});
