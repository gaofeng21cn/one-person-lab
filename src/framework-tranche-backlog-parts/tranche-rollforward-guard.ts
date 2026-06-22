import type {
  FrameworkTrancheMilestone,
  TrancheExecutionLane,
} from './shared.ts';
import { NO_SECOND_TRUTH_AUTHORITY_BOUNDARY } from './shared.ts';

type LaneWithMilestoneStates = TrancheExecutionLane & {
  milestone_states: string[];
  authority_boundary: Record<string, boolean>;
};

function milestoneById(milestones: readonly FrameworkTrancheMilestone[]) {
  return new Map(milestones.map((milestone) => [milestone.milestone_id, milestone]));
}

function laneMilestoneStates(
  lanes: readonly TrancheExecutionLane[],
  milestones: readonly FrameworkTrancheMilestone[],
): LaneWithMilestoneStates[] {
  const milestonesById = milestoneById(milestones);
  return lanes.map((lane) => ({
    ...lane,
    milestone_states: lane.milestone_ids.map((milestoneId) =>
      milestonesById.get(milestoneId)?.state ?? 'open'
    ),
    authority_boundary: { ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY },
  }));
}

function laneIsClosed(lane: LaneWithMilestoneStates) {
  return lane.milestone_states.length > 0
    && lane.milestone_states.every((state) => state === 'closed_structure_gate');
}

export function buildTrancheRollforwardGuard(
  closedTrancheLanes: readonly TrancheExecutionLane[],
  milestones: readonly FrameworkTrancheMilestone[],
) {
  const lanesWithStates = laneMilestoneStates(closedTrancheLanes, milestones);
  const closedLaneIds = lanesWithStates
    .filter(laneIsClosed)
    .map((lane) => lane.lane_id);
  const activeLaneIds = lanesWithStates
    .filter((lane) => !laneIsClosed(lane))
    .map((lane) => lane.lane_id);
  const allSelectedLanesClosed = lanesWithStates.length > 0
    && closedLaneIds.length === lanesWithStates.length;

  return {
    surface_kind: 'opl_framework_tranche_rollforward_guard',
    status: allSelectedLanesClosed
      ? 'closed_tranche_archived_next_selection_required'
      : 'active_or_partial_tranche_present',
    source_tranche_id: 'opl-family-ideal-operating-model-tranche-20260622',
    source_tranche_is_current_work_order: false,
    selected_lane_count: lanesWithStates.length,
    closed_lane_count: closedLaneIds.length,
    active_or_partial_lane_count: activeLaneIds.length,
    closed_lane_ids: closedLaneIds,
    active_or_partial_lane_ids: activeLaneIds,
    next_selection_required: allSelectedLanesClosed,
    next_selection_policy: {
      fresh_gate_required: true,
      lane_count_min: 2,
      lane_count_max: 4,
      can_select_archived_lane_without_new_gap: false,
      can_treat_closed_structure_gate_as_current_work: false,
      can_claim_goal_complete_from_closed_tranche: false,
      plan_completion_audit_required_before_full_goal_completion: true,
    },
    archived_tranche_readback: {
      tranche_id: 'opl-family-ideal-operating-model-tranche-20260622',
      archive_role:
        'closed_non_live_structure_tranche_evidence_archive_not_current_work_order',
      selected_lane_count: lanesWithStates.length,
      lanes: lanesWithStates,
    },
    false_ready_guard: {
      archived_tranche_can_claim_current_work_remaining: false,
      archived_tranche_can_claim_full_goal_complete: false,
      closed_structure_gate_can_claim_live_evidence_complete: false,
      next_selection_guard_can_claim_plan_completion: false,
    },
    authority_boundary: {
      ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
      can_schedule_new_lane_without_fresh_gate: false,
      can_reopen_closed_lane_as_current_without_new_gap: false,
    },
  };
}
