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
  const ownerDeltaFirst = readiness.attention_first_payload.owner_delta_first;
  assert.equal(readiness.owner_delta_first.surface_kind, 'opl_owner_delta_first_projection');
  assert.equal(ownerDeltaFirst.surface_kind, 'opl_owner_delta_first_projection');
  assert.equal(
    readiness.owner_delta_first.next_owner,
    ownerDeltaFirst.next_owner,
  );
  assert.equal(
    readiness.owner_delta_first.next_required_delta,
    ownerDeltaFirst.next_required_delta,
  );
  assert.equal(
    ownerDeltaFirst.projection_policy,
    'default_operator_surface_prioritizes_next_owner_delta_raw_refs_only_counters_are_drilldown',
  );
  assert.equal(
    ownerDeltaFirst.raw_attention_default_policy,
    'blocked_refs_only_envelopes_stage_replay_packets_and_ledger_counters_are_full_detail_drilldown_not_primary_operator_next_step',
  );
  assert.equal(ownerDeltaFirst.authority_boundary.can_create_owner_receipt, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_create_typed_blocker, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_claim_production_ready, false);
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
