import {
  buildDomainSourceRefIntegrityGuard,
} from './framework-tranche-backlog-parts/domain-source-ref-integrity-guard.ts';
import {
  buildActiveCleanupNoResurrectionGuardReadback,
  buildDomainProgressTransitionRuntimeGuardReadback,
  buildGeneratedHostedBoundaryReadback,
  buildMemoryArtifactLifecycleBoundaryGuardReadback,
  buildOrdinaryProgressGuardReadback,
  buildPrimitiveRuntimeOwnerRouteGuardReadback,
  buildRuntimeEnvironmentSubstrateGuardReadback,
  buildStandardAgentLandingAcceptanceGuardReadback,
} from './framework-tranche-backlog-parts/guard-readbacks.ts';
import { buildOperatorCompactReadbackGuard } from './framework-tranche-backlog-parts/operator-compact-readback-guard.ts';
import { buildSourceStructureOperatorReadback } from './source-structure-operator-readback.ts';
import {
  APP_SHELL_CONVERGENCE_STRUCTURE_READBACK,
  CROSS_REPO_REF_INTEGRITY_GUARD,
  CURRENT_TRANCHE_LANES,
  FOUNDRY_SUPPORT_EXTENSION_MEMBERSHIP_READBACK,
  FRAMEWORK_TRANCHE_MILESTONES,
  MAS_CONFORMANCE_RESIDUE_CLOSEOUT_READBACK,
  NEXT_TRANCHE_SELECTED_LANES,
} from './framework-tranche-backlog-parts/tranche-data.ts';
import { buildTrancheRollforwardGuard } from './framework-tranche-backlog-parts/tranche-rollforward-guard.ts';
import {
  NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
  type MilestoneState,
} from './framework-tranche-backlog-parts/shared.ts';
import type { FrameworkContracts } from './types.ts';

function milestoneCounts() {
  return FRAMEWORK_TRANCHE_MILESTONES.reduce<Record<MilestoneState, number>>(
    (counts, milestone) => {
      counts[milestone.state] += 1;
      return counts;
    },
    {
      open: 0,
      partial: 0,
      closed_structure_gate: 0,
      deferred_live_evidence: 0,
    },
  );
}

function buildCurrentTrancheReadback(
  rollforwardGuard: ReturnType<typeof buildTrancheRollforwardGuard>,
) {
  const selectedLaneCount = NEXT_TRANCHE_SELECTED_LANES.length;
  const selectedMilestoneIds = [
    ...new Set(NEXT_TRANCHE_SELECTED_LANES.flatMap((lane) => lane.milestone_ids)),
  ];
  const lanes = NEXT_TRANCHE_SELECTED_LANES.map((lane) => ({
    ...lane,
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  }));
  return {
    tranche_id: 'opl-family-ideal-operating-model-tranche-20260622d',
    tranche_role:
      'fresh_non_live_functional_structure_tranche_selected_not_full_completion_audit',
    current_work_order_status:
      selectedLaneCount >= 2 && selectedLaneCount <= 4
        ? 'active_non_live_structure_lanes_selected'
        : 'selected_lane_count_outside_policy',
    selected_lane_count: selectedLaneCount,
    selected_lane_count_within_policy: selectedLaneCount >= 2 && selectedLaneCount <= 4,
    selected_milestone_ids: selectedMilestoneIds,
    closed_or_advanced_structural_milestone_ids: [],
    next_selection_required: false,
    closed_tranche_ref: rollforwardGuard.archived_tranche_readback.tranche_id,
    lane_selection_policy: {
      prefer_open_coherent_worktree_owned_by_current_session: true,
      otherwise_select_highest_value_clean_repo_gap: true,
      disjoint_write_sets_required: true,
      unresolved_unclear_owner_lanes_are_avoided: true,
      live_evidence_lanes_deferred: true,
      root_checkout_role: 'read_absorb_push_readback_cleanup_only',
    },
    write_set_isolation_guard: {
      each_lane_requires_isolated_worktree: true,
      root_checkout_may_hold_preflight_push_only: true,
      root_checkout_must_not_hold_implementation_writes: true,
      lane_write_sets_are_declared_disjoint: true,
      conflicts_require_owner_route_or_new_tranche: true,
    },
    required_closeout_evidence: [
      'source_or_contract_delta_landed',
      'CLI_or_API_readback_available_when_surface_exists',
      'repo_native_tests_or_focused_contract_guard_passed',
      'docs_folded_back_to_owner_surface',
      'worktree_absorption_audit_or_equivalent_main_diff_readback',
      'push_to_origin_main',
      'remote_sha_readback_equal',
      'worktree_and_branch_cleanup',
    ],
    tranche_closeout_progress: {
      progress_status:
        'domain_lane_remote_readbacks_landed_self_lane_requires_post_push_readback',
      selected_lane_count: selectedLaneCount,
      remote_readback_matched_lane_count: 2,
      pending_self_lane_count: 1,
      absorbed_remote_readbacks: [
        {
          lane_id: 'rca-private-platform-json-readback-20260622d',
          repo: 'redcube-ai',
          commit_sha: '0726ef03f158a0c90484edc53536f17cfe59a42f',
          remote_ref: 'refs/heads/main',
          remote_sha_matches_local: true,
          readback_summary:
            'private-platform:readback emitted parseable 321420-byte JSON with json_transport_guard=complete_parseable_json_required',
        },
        {
          lane_id: 'opl-doc-native-support-readback-20260622d',
          repo: 'opl-doc',
          commit_sha: '95b3cfaa4d35aa5791919d20052cb1c2d8d54841',
          remote_ref: 'refs/heads/main',
          remote_sha_matches_local: true,
          readback_summary:
            'native-check --format json emitted support_profile_guard=opl-doc.support-profile.no-resurrection.v1 and audit=passed_no_resurrection_guard',
        },
      ],
      self_lane_closeout_evidence_ref:
        'one-person-lab main push plus fresh git ls-remote origin refs/heads/main after this readback is absorbed',
      false_ready_boundary: {
        static_backlog_can_self_certify_own_push: false,
        external_remote_sha_readback_can_claim_runtime_ready: false,
        tranche_closeout_progress_can_claim_full_goal_completion: false,
      },
    },
    full_goal_completion_guard: {
      this_tranche_can_update_milestone_backlog: true,
      this_tranche_can_claim_full_goal_completion: false,
      plan_completion_audit_required_before_full_goal_completion: true,
      all_items_require_fresh_executable_evidence_before_100_percent: true,
      docs_tests_contracts_readmodels_refs_only_are_not_enough_for_readiness: true,
    },
    false_ready_guard: {
      selected_lane_count_can_claim_goal_complete: false,
      pushed_commits_can_claim_runtime_ready: false,
      closed_structure_gate_can_claim_live_evidence_complete: false,
      remote_sha_readback_can_claim_domain_ready: false,
      no_active_selection_can_claim_goal_complete: false,
    },
    lanes,
  };
}

export function buildFrameworkTrancheBacklogReadback(contracts: FrameworkContracts) {
  const milestone_state_counts = milestoneCounts();
  const trancheRollforwardGuard = buildTrancheRollforwardGuard(
    CURRENT_TRANCHE_LANES,
    FRAMEWORK_TRANCHE_MILESTONES,
  );
  return {
    version: 'g2',
    framework_tranche_backlog: {
      surface_kind: 'opl_family_ideal_operating_model_tranche_backlog_readback',
      backlog_role:
        'milestone_tranche_execution_index_not_completion_audit_not_second_active_backlog',
      owner: 'one-person-lab',
      active_gap_owner_ref: 'docs/active/current-state-vs-ideal-gap.md',
      north_star_refs: [
        'docs/active/opl-family-ideal-operating-model-redesign.md',
        'contracts/opl-framework/target-operating-architecture-contract.json',
      ],
      source_contract_refs: [
        'contracts/opl-framework/target-operating-architecture-contract.json',
        'contracts/opl-framework/opl-flow-completion-audit-contract.json',
        'contracts/opl-framework/standard-agent-landing-acceptance-contract.json',
        'contracts/opl-framework/standard-agent-landing-evidence-status.json',
        'contracts/opl-framework/private-platform-residue-owner-decisions.json',
      ],
      target_operating_architecture_ref:
        `contracts/opl-framework/target-operating-architecture-contract.json#${contracts.targetOperatingArchitecture.schema_version}`,
      milestone_state_counts,
      default_tranche_policy: {
        lane_count_min: 2,
        lane_count_max: 4,
        use_isolated_worktree_per_lane: true,
        prefer_open_coherent_lane_owned_by_current_session: true,
        avoid_unclear_unresolved_lane_owner: true,
        root_checkout_role: 'read_absorb_push_readback_cleanup_only',
        live_evidence_deferred: true,
        docs_tests_readmodel_refs_only_do_not_count_as_ready: true,
      },
      current_tranche: buildCurrentTrancheReadback(trancheRollforwardGuard),
      tranche_rollforward_guard: trancheRollforwardGuard,
      last_closed_tranche: trancheRollforwardGuard.archived_tranche_readback,
      priority_order: ['P0', 'P1', 'P2'] as const,
      forbidden_surfaces: ['AGUI/agui-codex'],
      app_shell_policy: {
        mainline: 'AionUI/opl-aion-shell',
        foreground_alternative: 'Hermes Desktop/hermes-codex',
        archived_technical_proof_only: 'AGUI/agui-codex',
        convergence_readback: APP_SHELL_CONVERGENCE_STRUCTURE_READBACK,
      },
      cross_repo_ref_integrity_guard: CROSS_REPO_REF_INTEGRITY_GUARD,
      mas_conformance_residue_closeout_readback:
        MAS_CONFORMANCE_RESIDUE_CLOSEOUT_READBACK,
      foundry_support_extension_membership_readback:
        FOUNDRY_SUPPORT_EXTENSION_MEMBERSHIP_READBACK,
      domain_source_ref_integrity_guard:
        buildDomainSourceRefIntegrityGuard(NO_SECOND_TRUTH_AUTHORITY_BOUNDARY),
      authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
      false_ready_guard: {
        tests_or_contracts_can_claim_ready: false,
        docs_or_readmodels_can_claim_ready: false,
        refs_only_ledgers_can_claim_ready: false,
        tranche_backlog_can_claim_goal_complete: false,
        plan_completion_audit_required_for_full_goal_completion: true,
      },
      primitive_runtime_owner_route_guard:
        buildPrimitiveRuntimeOwnerRouteGuardReadback(contracts),
      generated_hosted_surface_boundary: buildGeneratedHostedBoundaryReadback(contracts),
      standard_agent_landing_acceptance_guard:
        buildStandardAgentLandingAcceptanceGuardReadback(contracts),
      domain_progress_transition_runtime_guard:
        buildDomainProgressTransitionRuntimeGuardReadback(contracts),
      memory_artifact_lifecycle_boundary_guard:
        buildMemoryArtifactLifecycleBoundaryGuardReadback(),
      runtime_environment_substrate_guard: buildRuntimeEnvironmentSubstrateGuardReadback(contracts),
      ordinary_progress_guard: buildOrdinaryProgressGuardReadback(contracts),
      active_cleanup_no_resurrection_guard:
        buildActiveCleanupNoResurrectionGuardReadback(),
      operator_compact_readback_guard:
        buildOperatorCompactReadbackGuard(contracts),
      source_structure_operator_guard:
        buildSourceStructureOperatorReadback().source_structure_operator_readback,
      milestones: FRAMEWORK_TRANCHE_MILESTONES,
    },
  };
}
