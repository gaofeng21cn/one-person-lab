import assert from 'node:assert/strict';

export const PACK_COMPILER_DEFAULT_DOMAIN_ALIASES = ['mas', 'mag', 'rca'];
export const PACK_COMPILER_GENERATED_SURFACE_COUNT_PER_DOMAIN = 7;

export function assertReadyPackCompilerSummary(summary: {
  total_domain_count: number;
  ready_domain_count: number;
  blocked_domain_count: number;
  generated_surface_count: number;
  generated_surface_ready_count: number;
  generated_surface_blocked_count: number;
  domain_generated_surface_owner_claim_count: number;
  generated_artifact_drift_aligned_count: number;
  generated_artifact_drift_detected_count: number;
}) {
  const expectedSurfaceCount = PACK_COMPILER_DEFAULT_DOMAIN_ALIASES.length
    * PACK_COMPILER_GENERATED_SURFACE_COUNT_PER_DOMAIN;
  assert.equal(summary.total_domain_count, PACK_COMPILER_DEFAULT_DOMAIN_ALIASES.length);
  assert.equal(summary.ready_domain_count, PACK_COMPILER_DEFAULT_DOMAIN_ALIASES.length);
  assert.equal(summary.blocked_domain_count, 0);
  assert.equal(summary.generated_surface_count, expectedSurfaceCount);
  assert.equal(summary.generated_surface_ready_count, expectedSurfaceCount);
  assert.equal(summary.generated_surface_blocked_count, 0);
  assert.equal(summary.domain_generated_surface_owner_claim_count, 0);
  assert.equal(summary.generated_artifact_drift_aligned_count, PACK_COMPILER_DEFAULT_DOMAIN_ALIASES.length);
  assert.equal(summary.generated_artifact_drift_detected_count, 0);
}
