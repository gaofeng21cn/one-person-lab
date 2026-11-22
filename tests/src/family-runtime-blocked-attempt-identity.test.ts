import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const SOURCE = fs.readFileSync(
  new URL('../../src/adapters/execution/family-runtime-temporal-stage-run-workflow.ts', import.meta.url),
  'utf8',
);

test('a blocked Attempt does not inherit the previous Stage artifact identity', () => {
  // Projecting attemptInput's refs made a blocked producer look like it owned the previous
  // Stage's artifacts, so the projection failed with
  // stage_quality_cycle_attempt_artifact_identity_mismatch and masked the real blocked reason.
  const fallback = SOURCE.slice(SOURCE.indexOf('artifactRefs: [],') - 700, SOURCE.indexOf('artifactRefs: [],') + 120);
  assert.match(fallback, /produced\s*\n?\s*\/\/ nothing|produced nothing/);
  assert.match(SOURCE, /artifactRefs: \[\],\s*\n\s*artifactHashes: \[\],\s*\n\s*artifactIdentityReceiptRefs: \[\],/);
});

test('the inherited identity is still used for the StageRun current pointer', () => {
  // Upstream rewrote the ternary to lead with the producer branch; the meaning is unchanged:
  // the producer takes the new Attempt identity, every other role keeps the Stage's current refs.
  assert.match(SOURCE, /artifact_refs: attemptInput\.role === 'producer' \? artifactIdentity\.artifactRefs : state\.artifact_refs/);
});
