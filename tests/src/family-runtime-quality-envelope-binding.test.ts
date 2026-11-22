import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const SOURCE = fs.readFileSync(
  new URL(
    '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/artifact-identity-verification-parts/closeout-boundary.ts',
    import.meta.url,
  ),
  'utf8',
);

test('binds verified artifact identity even when the domain declared no stage_quality_cycle', () => {
  // OMA's route_impact carries consumable_artifact_refs and no stage_quality_cycle. Gating the
  // binding on isRecord(routeImpact.stage_quality_cycle) left the envelope empty, and the review
  // receipt then rejected a correct review.
  assert.match(SOURCE, /\.\.\.\(pairs\.length > 0/);
  assert.doesNotMatch(SOURCE, /\.\.\.\(isRecord\(routeImpact\.stage_quality_cycle\)/);
});

test('still merges any existing domain envelope instead of replacing it', () => {
  assert.match(SOURCE, /stage_quality_cycle: \{\s*\n\s*\.\.\.qualityEnvelope,/);
});
