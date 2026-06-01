import { assert } from '../helpers.ts';

export function assertFrameworkWorkstreamOperatingLoop(readiness: any) {
  const workstreamOperatingLoop =
    readiness.attention_first_payload.workstream_operating_loop;
  assert.equal(
    readiness.workstream_operating_loop.surface_kind,
    'opl_workstream_operating_loop_projection',
  );
  assert.equal(
    workstreamOperatingLoop.surface_kind,
    'opl_workstream_operating_loop_projection',
  );
  assert.equal(
    readiness.workstream_operating_loop.summary.workstream_count,
    workstreamOperatingLoop.summary.workstream_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.workstream_operating_loop_workstream_count,
    workstreamOperatingLoop.summary.workstream_count,
  );
  assert.equal(
    readiness.summary.workstream_operating_loop_artifact_first_review_available_count,
    workstreamOperatingLoop.summary.artifact_first_review_available_count,
  );
  assert.equal(workstreamOperatingLoop.false_authority_flags.can_read_artifact_body, false);
  assert.equal(workstreamOperatingLoop.false_authority_flags.can_write_domain_truth, false);
  assert.equal(workstreamOperatingLoop.false_authority_flags.can_create_owner_receipt, false);
  assert.equal(workstreamOperatingLoop.false_authority_flags.can_claim_domain_ready, false);
  assert.equal(workstreamOperatingLoop.false_authority_flags.can_claim_production_ready, false);
}
