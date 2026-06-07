import { assert } from '../helpers.ts';
import {
  assertDomainDispatchGroupExecutorHints,
  assertSameDomainDispatchGroupExecutorHints,
} from './domain-dispatch-group-executor-hints-assertions.ts';

export function assertFrameworkReadinessDomainDispatchWorkorders(
  readiness: any,
  nextSafeActions: any[],
) {
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary.domain_id_policy,
    'canonical_owner_facing_ids_only_workorder_items_keep_command_domain_ids_for_action_routes',
  );
  assert.deepEqual(
    [...readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary.domain_ids]
      .sort(),
    readiness.evidence_envelope.summary.owner_ids
      .filter((owner: string) => owner !== 'one-person-lab')
      .sort(),
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary
      .route_domain_id_policy,
    'command_domain_ids_for_opl_runtime_action_execute_routes_not_default_owner_semantics',
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_policy,
    'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.length,
    Math.min(
      readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.domain_stage_group_count,
      5,
    ),
  );
  assert.deepEqual(
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_group_attention_items.map(
      (item: { group_id: string }) => item.group_id,
    ),
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.map(
      (item: { group_id: string }) => item.group_id,
    ),
  );
  assert.deepEqual(
    readiness.evidence_tails.stage_receipt_freshness_tail
      .domain_dispatch_evidence_workorder_group_attention_items.map(
        (item: { group_id: string }) => item.group_id,
      ),
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.map(
      (item: { group_id: string }) => item.group_id,
    ),
  );
  const firstDispatchWorkorderGroup =
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items[0];
  if (firstDispatchWorkorderGroup) {
    assert.equal(typeof firstDispatchWorkorderGroup.canonical_domain_id, 'string');
    assert.equal(firstDispatchWorkorderGroup.canonical_domain_id.includes('-'), true);
    assert.equal(firstDispatchWorkorderGroup.owner, firstDispatchWorkorderGroup.canonical_domain_id);
    assert.equal(typeof firstDispatchWorkorderGroup.stage_id, 'string');
    assert.equal(firstDispatchWorkorderGroup.workorder_count > 0, true);
    assert.equal(firstDispatchWorkorderGroup.stage_attempt_count > 0, true);
    assert.equal(firstDispatchWorkorderGroup.sample_stage_attempt_ids.length <= 3, true);
    assert.equal(firstDispatchWorkorderGroup.sample_action_refs.length <= 3, true);
    assertDomainDispatchGroupExecutorHints(firstDispatchWorkorderGroup);
    assert.equal(firstDispatchWorkorderGroup.sample_required_evidence_refs.length <= 3, true);
    assert.equal(firstDispatchWorkorderGroup.stage_attempt_id_omitted_count >= 0, true);
    assert.equal(firstDispatchWorkorderGroup.action_ref_omitted_count >= 0, true);
    assert.equal(firstDispatchWorkorderGroup.required_evidence_ref_omitted_count >= 0, true);
    assert.equal(Object.hasOwn(firstDispatchWorkorderGroup, 'required_evidence_refs'), false);
    assert.equal(firstDispatchWorkorderGroup.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(firstDispatchWorkorderGroup.route_requires_domain_or_app_payload, true);
    assert.equal(firstDispatchWorkorderGroup.can_create_owner_receipt, false);
    assert.equal(firstDispatchWorkorderGroup.can_close_domain_ready, false);
    assert.equal(firstDispatchWorkorderGroup.can_claim_production_ready, false);
    assert.equal(firstDispatchWorkorderGroup.worklist_item_is_completion_claim, false);
  }
  if (readiness.attention_first_payload.blockers.length === 0) {
    const dispatchGroupAction = nextSafeActions.find(
      (action: { action_kind?: string }) =>
        action.action_kind === 'domain_dispatch_evidence_group_workorder',
    );
    assert.equal(Boolean(dispatchGroupAction), Boolean(firstDispatchWorkorderGroup));
    if (firstDispatchWorkorderGroup && dispatchGroupAction) {
      const actionKinds = nextSafeActions.map((action: { action_kind?: string }) => action.action_kind);
      const dispatchIndex = actionKinds.indexOf('domain_dispatch_evidence_group_workorder');
      const ownerPayloadIndex = actionKinds.indexOf('owner_payload_group_scaleout');
      const ownerHandoffIndex = actionKinds.indexOf('owner_handoff_packet_review');
      assert.equal(dispatchIndex > 0, true);
      if (ownerPayloadIndex >= 0) {
        assert.equal(dispatchIndex < ownerPayloadIndex, true);
      }
      if (ownerHandoffIndex >= 0) {
        assert.equal(dispatchIndex < ownerHandoffIndex, true);
      }
      assert.equal(dispatchGroupAction.action_id, 'review_domain_dispatch_group_workorder');
      assert.equal(dispatchGroupAction.step_kind, 'domain_dispatch_evidence_group_workorder');
      assert.equal(
        dispatchGroupAction.evidence_closure_gate,
        'domain_dispatch_owner_chain_payload_gate',
      );
      assert.equal(
        dispatchGroupAction.payload_requirement,
        'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
      );
      assert.equal(dispatchGroupAction.owner, firstDispatchWorkorderGroup.canonical_domain_id);
      assert.equal(dispatchGroupAction.payload_owner, firstDispatchWorkorderGroup.payload_owner);
      assert.equal(
        dispatchGroupAction.canonical_domain_id,
        firstDispatchWorkorderGroup.canonical_domain_id,
      );
      assert.equal(dispatchGroupAction.stage_id, firstDispatchWorkorderGroup.stage_id);
      assert.equal(dispatchGroupAction.workorder_count, firstDispatchWorkorderGroup.workorder_count);
      assert.equal(
        dispatchGroupAction.stage_attempt_count,
        firstDispatchWorkorderGroup.stage_attempt_count,
      );
      assert.equal(dispatchGroupAction.sample_stage_attempt_ids.length <= 3, true);
      assert.equal(dispatchGroupAction.sample_action_refs.length <= 3, true);
      assertSameDomainDispatchGroupExecutorHints(dispatchGroupAction, firstDispatchWorkorderGroup);
      assert.equal(dispatchGroupAction.sample_required_evidence_refs.length <= 3, true);
      assert.deepEqual(
        dispatchGroupAction.required_operator_payload_refs,
        firstDispatchWorkorderGroup.required_operator_payload_refs,
      );
      assert.equal(
        dispatchGroupAction.payload_path_policy,
        firstDispatchWorkorderGroup.payload_path_policy,
      );
      assert.equal(
        dispatchGroupAction.accepted_payload_paths.typed_blocker_path.success_claimed,
        false,
      );
      assert.equal(
        dispatchGroupAction.payload_preflight_policy,
        firstDispatchWorkorderGroup.payload_preflight_policy,
      );
      assert.equal(
        dispatchGroupAction.payload_preflight_blocked_error_kind,
        'domain_dispatch_evidence_payload_preflight_blocked',
      );
      assert.deepEqual(
        dispatchGroupAction.required_return_shapes,
        firstDispatchWorkorderGroup.required_return_shapes,
      );
      assert.equal(Object.hasOwn(dispatchGroupAction, 'required_evidence_refs'), false);
      assert.equal(dispatchGroupAction.full_detail_section, 'domain_dispatch_evidence');
      assert.equal(dispatchGroupAction.authority, 'operator_attention_only');
      assert.equal(dispatchGroupAction.can_execute_domain_action, false);
      assert.equal(dispatchGroupAction.can_write_domain_truth, false);
      assert.equal(dispatchGroupAction.can_create_owner_receipt, false);
      assert.equal(dispatchGroupAction.can_close_domain_ready, false);
      assert.equal(dispatchGroupAction.can_claim_production_ready, false);
    }
  }
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_route_attention_fallback_policy,
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.length > 0
      ? 'route_workorders_available_in_evidence_worklist_and_full_drilldown_group_guidance_is_default'
      : 'route_workorders_used_only_when_owner_stage_group_guidance_is_unavailable',
  );
  assert.equal(
    readiness.domain_dispatch_attention
      .domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.equal(
    readiness.domain_dispatch_attention.domain_dispatch_evidence_receipt_action_route_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.equal(
    readiness.evidence_tails.stage_receipt_freshness_tail
      .domain_dispatch_evidence_workorder_packet_summary.workorder_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.deepEqual(
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
    readiness.evidence_tails.stage_receipt_freshness_tail
      .domain_dispatch_evidence_workorder_attention_items.map(
        (item: { action_id: string }) => item.action_id,
      ),
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_attention_items.length,
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.length > 0
      ? 0
      : readiness.evidence_worklist.domain_dispatch_evidence_workorder_attention_items.length,
  );
  for (const dispatchWorkorder of readiness.evidence_worklist
    .domain_dispatch_evidence_workorder_attention_items) {
    assert.equal(dispatchWorkorder.action_kind, 'domain_dispatch_evidence_receipt_record');
    assert.equal(dispatchWorkorder.route_domain_id, dispatchWorkorder.domain_id);
    assert.equal(typeof dispatchWorkorder.canonical_domain_id, 'string');
    assert.equal(dispatchWorkorder.canonical_domain_id.includes('-'), true);
    assert.equal(dispatchWorkorder.owner, dispatchWorkorder.canonical_domain_id);
    assert.equal(
      dispatchWorkorder.domain_id_policy,
      'domain_id_is_route_domain_id_for_action_execution_canonical_domain_id_is_owner_facing_semantics',
    );
    assert.equal(dispatchWorkorder.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(dispatchWorkorder.route_requires_domain_or_app_payload, true);
    assert.equal(dispatchWorkorder.can_execute, false);
    assert.equal(dispatchWorkorder.creates_domain_action, false);
    assert.equal(dispatchWorkorder.creates_owner_receipt, false);
    assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('domain_receipt_refs'), true);
    assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('typed_blocker_refs'), true);
    assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('owner_chain_refs'), true);
    assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('no_regression_refs'), true);
    assert.equal(
      dispatchWorkorder.payload_preflight_blocked_error_kind,
      'domain_dispatch_evidence_payload_preflight_blocked',
    );
    assert.equal(dispatchWorkorder.empty_payload_template_is_success_evidence, false);
    assert.equal(dispatchWorkorder.worklist_item_is_completion_claim, false);
  }
}
