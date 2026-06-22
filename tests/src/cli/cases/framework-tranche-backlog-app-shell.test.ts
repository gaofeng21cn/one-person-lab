import { assert, runCli, test } from '../helpers.ts';

test('framework tranche backlog exposes App shell and support-reference guards', () => {
  const readback = runCli(['framework', 'tranche-backlog', '--family-defaults']).framework_tranche_backlog;

  const milestonesById = Object.fromEntries(
    readback.milestones.map((milestone: { milestone_id: string }) => [milestone.milestone_id, milestone]),
  );

  assert.equal(readback.app_shell_policy.mainline, 'AionUI/opl-aion-shell');
  assert.equal(readback.app_shell_policy.foreground_alternative, 'Hermes Desktop/hermes-codex');
  assert.equal(readback.app_shell_policy.archived_technical_proof_only, 'AGUI/agui-codex');
  assert.equal(
    readback.app_shell_policy.convergence_readback.status,
    'closed_structure_gate_not_live_evidence',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.absorbed_origin_main_sha,
    '9cb0196c06d1203a33d9aad20b9299eac6f36a0e',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.readback_command,
    'npm run validate:shell-convergence',
  );
  assert.deepEqual(
    readback.app_shell_policy.convergence_readback.default_candidate_validation_scope,
    ['hermes-codex'],
  );
  assert.deepEqual(
    readback.app_shell_policy.convergence_readback.archived_technical_proofs,
    ['agui-codex'],
  );
  assert.deepEqual(readback.app_shell_policy.convergence_readback.false_ready_boundary, {
    active_shell_switch_allowed_by_this_readback: false,
    can_claim_active_shell_adopted: false,
    can_claim_app_release_ready: false,
    can_claim_production_ready: false,
    can_claim_live_user_path: false,
    can_claim_live_evidence: false,
    can_claim_packaged_gui_acceptance: false,
  });
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_functional_convergence_readback
      .surface_kind,
    'opl_hermes_candidate_functional_convergence_readback',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_functional_convergence_readback
      .absorbed_origin_main_sha,
    'bd139d5e1bcb57e47defbd59f411032e0b240a60',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_functional_convergence_readback
      .false_ready_boundary.can_claim_app_release_ready,
    false,
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .surface_kind,
    'opl_hermes_candidate_operator_functional_surface_readback',
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .absorbed_origin_main_sha,
    'bd139d5e1bcb57e47defbd59f411032e0b240a60',
  );
  assert.deepEqual(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .operator_surface_ids,
    [
      'domain_skill_catalog',
      'ordinary_session_prompt_path',
      'operator_settings_and_model_access',
      'composer_affordances',
    ],
  );
  assert.equal(
    readback.app_shell_policy.convergence_readback.hermes_candidate_operator_functional_surface_readback
      .false_ready_boundary.can_claim_app_operator_sustained_consumption,
    false,
  );
  assert.ok(
    readback.last_closed_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'mag-source-purity-cli-readback-20260622'
      && lane.repo === 'med-autogrant'
    )),
  );
  assert.ok(
    readback.last_closed_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'rca-tail-owner-delta-readback-20260622'
      && lane.repo === 'redcube-ai'
    )),
  );
  assert.ok(
    readback.last_closed_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'opl-bookforge-foundry-membership-classification-20260622'
      && lane.repo === 'one-person-lab'
    )),
  );
  assert.ok(
    readback.last_closed_tranche.lanes.some((lane: { lane_id: string; repo: string }) => (
      lane.lane_id === 'opl-oma-conformance-residue-classification-20260622'
      && lane.repo === 'one-person-lab'
    )),
  );
  assert.ok(
    readback.milestones.some((milestone: { milestone_id: string; priority: string }) =>
      milestone.milestone_id === 'opl_primitive_runtime_owner_route_guard'
      && milestone.priority === 'P0'
    ),
  );
  const supportMilestone = readback.milestones.find(
    (milestone: { milestone_id: string }) =>
      milestone.milestone_id === 'support_repo_profile_no_resurrection',
  );
  assert.ok(supportMilestone);
  assert.ok(
    supportMilestone.current_truth_refs.includes('opl-doc:contracts/support-repo-policy.json'),
  );
  assert.equal(
    supportMilestone.current_truth_refs.includes('opl-doc:contracts/support_repo_policy.json'),
    false,
  );
  assert.ok(
    milestonesById['strict_source_purity_private_wrapper_retirement'].current_truth_refs.includes(
      'med-autogrant:authority morphology-guard#strict_source_purity_no_second_truth_guard',
    ),
  );
  assert.ok(
    milestonesById['oma_script_to_pack_hygiene'].current_truth_refs.includes(
      'opl-meta-agent:npm run source-structure:json --silent',
    ),
  );
  assert.ok(
    readback.milestones.every((milestone: { authority_boundary: { can_create_second_active_backlog: boolean } }) =>
      milestone.authority_boundary.can_create_second_active_backlog === false
    ),
  );
});
