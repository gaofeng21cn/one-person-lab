import {
  buildDomainSourceRefIntegrityGuard,
} from './framework-tranche-backlog-parts/domain-source-ref-integrity-guard.ts';
import {
  buildDomainProgressTransitionRuntimeGuardReadback,
  buildGeneratedHostedBoundaryReadback,
  buildMemoryArtifactLifecycleBoundaryGuardReadback,
  buildOrdinaryProgressGuardReadback,
  buildPrimitiveRuntimeOwnerRouteGuardReadback,
  buildRuntimeEnvironmentSubstrateGuardReadback,
} from './framework-tranche-backlog-parts/guard-readbacks.ts';
import {
  APP_SHELL_CONVERGENCE_STRUCTURE_READBACK,
  CROSS_REPO_REF_INTEGRITY_GUARD,
  CURRENT_TRANCHE_LANES,
  FRAMEWORK_TRANCHE_MILESTONES,
} from './framework-tranche-backlog-parts/tranche-data.ts';
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

function selectedMilestoneIds() {
  return [...new Set(CURRENT_TRANCHE_LANES.flatMap((lane) => lane.milestone_ids))];
}

function buildCurrentTrancheReadback() {
  const selectedIds = selectedMilestoneIds();
  const selectedMilestoneSet = new Set(selectedIds);
  return {
    tranche_id: 'opl-family-ideal-operating-model-tranche-20260621',
    tranche_role:
      'non_live_functional_structure_milestone_tranche_not_full_completion_audit',
    selected_lane_count: CURRENT_TRANCHE_LANES.length,
    selected_lane_count_within_policy:
      CURRENT_TRANCHE_LANES.length >= 2 && CURRENT_TRANCHE_LANES.length <= 4,
    selected_milestone_ids: selectedIds,
    closed_or_advanced_structural_milestone_ids:
      FRAMEWORK_TRANCHE_MILESTONES
        .filter((milestone) => (
          selectedMilestoneSet.has(milestone.milestone_id)
          && milestone.state !== 'open'
        ))
        .map((milestone) => milestone.milestone_id),
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
    },
    lanes: CURRENT_TRANCHE_LANES.map((lane) => ({
      ...lane,
      milestone_priorities: lane.milestone_ids.map((milestoneId) => (
        FRAMEWORK_TRANCHE_MILESTONES.find((milestone) => milestone.milestone_id === milestoneId)?.priority
        ?? 'P2'
      )),
      milestone_states: lane.milestone_ids.map((milestoneId) => (
        FRAMEWORK_TRANCHE_MILESTONES.find((milestone) => milestone.milestone_id === milestoneId)?.state
        ?? 'open'
      )),
      authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
    })),
  };
}

export function buildFrameworkTrancheBacklogReadback(contracts: FrameworkContracts) {
  const milestone_state_counts = milestoneCounts();
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
      current_tranche: buildCurrentTrancheReadback(),
      priority_order: ['P0', 'P1', 'P2'] as const,
      forbidden_surfaces: ['AGUI/agui-codex'],
      app_shell_policy: {
        mainline: 'AionUI/opl-aion-shell',
        foreground_alternative: 'Hermes Desktop/hermes-codex',
        archived_technical_proof_only: 'AGUI/agui-codex',
        convergence_readback: APP_SHELL_CONVERGENCE_STRUCTURE_READBACK,
      },
      cross_repo_ref_integrity_guard: CROSS_REPO_REF_INTEGRITY_GUARD,
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
      domain_progress_transition_runtime_guard:
        buildDomainProgressTransitionRuntimeGuardReadback(contracts),
      memory_artifact_lifecycle_boundary_guard:
        buildMemoryArtifactLifecycleBoundaryGuardReadback(),
      runtime_environment_substrate_guard: buildRuntimeEnvironmentSubstrateGuardReadback(contracts),
      ordinary_progress_guard: buildOrdinaryProgressGuardReadback(contracts),
      milestones: FRAMEWORK_TRANCHE_MILESTONES,
    },
  };
}
