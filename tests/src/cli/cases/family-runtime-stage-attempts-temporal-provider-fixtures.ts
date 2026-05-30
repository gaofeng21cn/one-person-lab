import {
  createFakeCodexFixture,
  loadFamilyManifestFixtures,
} from '../helpers.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/standard-domain-agent-scaffold-constants.ts';

export function createTemporalCloseoutCodexFixture(closeoutRefs: string[]) {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: closeoutRefs,
    consumed_refs: ['evidence:temporal-fixture'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: { decision: 'temporal_fixture' },
  };
  return createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-temporal-fixture"}\\n'
  printf '{"type":"turn.started"}\\n'
  printf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-closeout', text: JSON.stringify(closeout) } })}'
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
}

export function buildTemporalStartManifest(stageId: string) {
  return {
    ...loadFamilyManifestFixtures().medautoscience,
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'med_autoscience_stage_control_plane',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages: [{
        stage_id: stageId,
        stage_kind: 'planning',
        title: 'Direction and route selection',
        summary: 'Select the MAS route under domain authority.',
        goal: 'Prepare an admitted MAS direction and route selection attempt.',
        owner: 'med-autoscience',
        domain_stage_refs: [stageId],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['study_task_ready'],
          ensures: ['route_selected'],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [],
          source_scope_refs: [{
            ref_kind: 'json_pointer',
            ref: '/source_scope/direction_and_route_selection',
            role: 'launch_source_scope',
          }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: true,
          effect_boundary: false,
          records_runtime_events: false,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          can_write_domain_truth: false,
        },
      }],
      notes: [],
    },
  };
}
