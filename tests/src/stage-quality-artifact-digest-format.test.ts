import assert from 'node:assert/strict';
import test from 'node:test';
import { qualityArtifactIdentity } from '../../src/adapters/execution/family-runtime-temporal-workflow-artifacts.ts';
import type { TemporalStageAttemptWorkflowState } from '../../src/adapters/execution/family-runtime-temporal.ts';

const digest = 'ab'.repeat(32);
const ref = 'file:///synthetic/reviewed-artifact.json';
const state = { stage_attempt_id: 'sat-digest-format', closeout_packet: {} } as TemporalStageAttemptWorkflowState;

test('review accepts equivalent SHA-256 notation while preserving the original identity receipt', () => {
  for (const inputHash of [digest, `sha256:${digest}`]) {
    const identity = { artifactRefs: [ref], artifactHashes: [inputHash], artifactIdentityReceiptRefs: ['receipt:original'] };
    for (const declaredHash of [digest, `sha256:${digest}`, digest.toUpperCase()]) {
      assert.equal(qualityArtifactIdentity(state, {
        artifact_refs: [ref], artifact_hashes: [declaredHash],
      }, true, identity, true, true), identity);
    }
    for (const changed of [
      { artifact_refs: [ref], artifact_hashes: ['cd'.repeat(32)] },
      { artifact_refs: ['file:///synthetic/another-artifact.json'], artifact_hashes: [inputHash] },
      { artifact_refs: [ref], artifact_hashes: [`sha512:${digest}`] },
      { artifact_refs: [ref], artifact_hashes: [digest.slice(1)] },
    ]) {
      assert.throws(() => qualityArtifactIdentity(state, changed, true, identity, true, true), (error: any) => {
        assert.equal(error.details.blocked_reason, 'reviewed_artifact_identity_mismatch');
        return true;
      });
    }
  }
  // Pre-patch workflow replay keeps its exact-string decision.
  assert.throws(() => qualityArtifactIdentity(state, {
    artifact_refs: [ref], artifact_hashes: [`sha256:${digest}`],
  }, true, { artifactRefs: [ref], artifactHashes: [digest], artifactIdentityReceiptRefs: [] }, true, false));
});

test('producer accepts equivalent verified metadata and still rejects changed bytes', () => {
  const producer = { ...state, closeout_packet: { closeout_ref_metadata: [{
    ref, sha256: digest, artifact_identity_receipt_ref: 'receipt:verified',
  }] } } as unknown as TemporalStageAttemptWorkflowState;
  assert.deepEqual(qualityArtifactIdentity(producer, {
    artifact_refs: [ref], artifact_hashes: [`sha256:${digest}`],
  }, true, undefined, false, true), {
    artifactRefs: [ref], artifactHashes: [`sha256:${digest}`], artifactIdentityReceiptRefs: ['receipt:verified'],
  });
  assert.throws(() => qualityArtifactIdentity(producer, {
    artifact_refs: [ref], artifact_hashes: [`sha256:${'cd'.repeat(32)}`],
  }, true, undefined, false, true), (error: any) => {
    assert.equal(error.details.blocked_reason, 'artifact_byte_identity_mismatch');
    return true;
  });
});
