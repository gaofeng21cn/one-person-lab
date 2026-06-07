import { assert } from '../helpers.ts';

export function assertStageOperatingPrincipleChecksPassed(repo: any) {
  const checks = repo.stage_operating_principle_checks;
  assert.equal(checks.status, 'passed');
  assert.equal(checks.policy_status, 'declared');
  assert.equal(checks.management_boundary.stage_unit, 'coarse_grained_stage_attempt');
  assert.deepEqual(checks.management_boundary.required_boundary_controls, [
    'stage_goal',
    'input_refs',
    'current_owner',
    'accepted_answer_shape',
    'owner_receipt_or_typed_blocker',
    'handoff_packet',
    'current_pointer',
    'authority_boundary',
  ]);
  assert.equal(checks.speed_policy.executor_autonomy_inside_stage, true);
  assert.equal(checks.speed_policy.strategy_refs_block_launch_by_default, false);
  assert.equal(checks.speed_policy.quality_gaps_block_ordinary_progress_by_default, false);
  assert.equal(checks.default_read_surface.root, 'current_owner_delta');
  assert.deepEqual(checks.demoted_default_surfaces, [
    'raw_worklist',
    'stage_replay_packet',
    'provider_trace',
    'evidence_accounting',
    'private_residue_inventory',
    'cleanup_delete_gate',
  ]);
  assert.equal(checks.authority_boundary.policy_can_claim_domain_ready, false);
}
