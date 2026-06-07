import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWorklistCurrentOwnerDeltaReadModel,
} from '../../../../src/family-runtime-evidence-worklist-parts/current-owner-delta-projection.ts';

test('family-runtime evidence-worklist keeps raw worklist roots out of current owner delta planning', () => {
  const rawWorklistItem = {
    item_id: 'evidence-worklist:domain_dispatch:redcube:stale-audit-record',
    action_id: 'domain_dispatch:redcube:stale-audit-record:record',
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'redcube-ai',
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
    claim_scope: 'domain_dispatch_evidence_receipt',
    route_status: 'request_route_available',
    replay_ref: 'opl agents evidence apply --domain redcube --request-id stale-audit-record',
    payload_requirement:
      'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
    route_requires_domain_or_app_payload: true,
    required_return_shapes: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
    payload_workorder: {
      surface_kind: 'opl_domain_dispatch_evidence_payload_workorder',
      payload_owner: 'redcube-ai',
      required_return_shapes: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
      authority_boundary: {
        can_generate_domain_owner_receipt: false,
        can_generate_typed_blocker: false,
        can_claim_production_ready: false,
      },
    },
  };

  const projection = buildWorklistCurrentOwnerDeltaReadModel({
    drilldown: {
      attention_first_payload: {
        owner_delta_first: {
          surface_kind: 'opl_owner_delta_first_projection',
          status: 'owner_delta_required',
          next_owner: 'med-autoscience',
          next_required_delta:
            'domain_deliverable_delta_or_domain_owned_typed_blocker_required',
          required_return_shapes: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
          required_refs_any_of: [
            'domain_owner_receipt_ref',
            'quality_gate_receipt_ref',
            'typed_blocker_ref',
          ],
          stop_loss_state: {
            surface_kind: 'opl_current_owner_delta_stop_loss_state',
            status: 'frozen',
            lineage_repeat_count: 2,
            receipt_only_repeat_count: 0,
            platform_repair_only_repeat_count: 2,
            stale_route_repeat_count: 0,
            fresh_owner_delta_required_to_resume: true,
            release_conditions: ['fresh_owner_delta', 'stable_typed_blocker'],
            policy_ref: 'contracts/opl-framework/stop-loss-policy.schema.json',
          },
          primary_item: {
            step_kind: 'owner_steering_required',
            owner: 'med-autoscience',
            status: 'domain_deliverable_delta_or_domain_owned_typed_blocker_required',
          },
          raw_attention_default_policy:
            'blocked_refs_only_envelopes_stage_replay_packets_and_ledger_counters_are_full_detail_drilldown_not_primary_operator_next_step',
          authority_boundary: {
            can_create_owner_receipt: false,
            can_create_typed_blocker: false,
            can_claim_domain_ready: false,
            can_claim_production_ready: false,
          },
        },
      },
    },
    openItems: [rawWorklistItem],
    nextSafeActions: [rawWorklistItem],
    counts: {
      open_safe_action_payload_required_item_count: 1,
      open_safe_action_payload_free_item_count: 0,
    },
    compactEvidenceEnvelope: {
      summary: {
        open_envelope_count: 1,
        blocked_envelope_count: 0,
      },
    },
    domainDispatchEvidenceWorkorderSummary: {
      workorder_count: 1,
    },
    stageReplayMissingReceiptWorkorderSummary: {
      workorder_count: 0,
    },
  });

  assert.equal(projection.owner_delta_audit_tail.count_summary.open_safe_action_count, 1);
  assert.equal(projection.current_owner, 'med-autoscience');
  assert.equal(
    projection.required_delta,
    'domain_deliverable_delta_or_domain_owned_typed_blocker_required',
  );
  assert.equal(projection.current_owner_delta.current_owner, 'med-autoscience');
  assert.equal(projection.current_owner_delta.owner, 'med-autoscience');
  assert.equal(projection.current_owner_delta.domain_id, 'med-autoscience');
  assert.equal(projection.current_owner_delta.stage_id, projection.current_owner_delta.stage_ref);
  assert.equal(
    projection.current_owner_delta.desired_delta_description,
    'domain_deliverable_delta_or_domain_owned_typed_blocker_required',
  );
  assert.equal(
    projection.current_owner_delta.payload_requirement,
    'domain_deliverable_delta_or_domain_owned_typed_blocker_required',
  );
  assert.deepEqual(
    projection.current_owner_delta.required_return_shapes,
    ['domain_owner_receipt_ref', 'typed_blocker_ref', 'quality_gate_receipt_ref'],
  );
  assert.equal(
    projection.current_owner_delta.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    projection.current_owner_delta.audit_tail_policy,
    'raw_worklist_raw_evidence_replay_typed_blocker_group_private_residue_are_passive_until_folded',
  );
  assert.equal(
    projection.current_owner_delta.evidence_vault_policy,
    'record_everything_plan_from_nothing',
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.audit_tail_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.route_reconciler_role,
    'hydrate_reconcile_owner_routes_only',
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.route_reconciler_can_generate_candidates,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.route_reconciler_can_evaluate_or_rank_candidates,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.route_reconciler_can_complete_stage,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.route_reconciler_can_sign_receipts,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.raw_evidence_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.raw_worklist_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.replay_packet_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.typed_blocker_group_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.private_residue_inventory_can_drive_default_planning,
    false,
  );
  assert.equal(projection.current_owner_delta.stop_loss_state.status, 'frozen');
  assert.equal(projection.current_owner_delta.stop_loss_state.lineage_repeat_count, 2);
  assert.equal(
    projection.current_owner_delta.stop_loss_state.fresh_owner_delta_required_to_resume,
    true,
  );
  const stopLossState = projection.current_owner_delta.stop_loss_state as Record<string, unknown>;
  assert.deepEqual(stopLossState.release_conditions, ['fresh_owner_delta', 'stable_typed_blocker']);
  assert.equal(
    projection.next_safe_action_or_none?.derivation_source,
    'current_owner_delta',
  );
  assert.equal(projection.next_safe_action_or_none?.owner, 'med-autoscience');
  assert.equal(
    projection.next_safe_action_or_none?.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    projection.next_safe_action_or_none?.payload_requirement,
    'domain_deliverable_delta_or_domain_owned_typed_blocker_required',
  );
  assert.deepEqual(
    projection.next_safe_action_or_none?.accepted_answer_shape,
    ['domain_owner_receipt_ref', 'typed_blocker_ref', 'quality_gate_receipt_ref'],
  );
  assert.equal(
    projection.next_safe_action_or_none?.raw_worklist_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.next_safe_action_or_none?.private_residue_inventory_can_drive_default_planning,
    false,
  );
  assert.equal(projection.owner_delta_audit_tail.audit_next_safe_action_or_none?.owner, 'redcube-ai');
  assert.equal(
    projection.owner_delta_audit_tail.audit_next_safe_action_or_none?.payload_requirement,
    'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
  );
  assert.equal(
    projection.owner_delta_audit_tail.full_detail_refs.owner_delta_first_ref,
    '/runtime_tray_snapshot/app_operator_drilldown/attention_first_payload/owner_delta_first',
  );
  const fullDetailRefs = projection.owner_delta_audit_tail.full_detail_refs as Record<string, string>;
  assert.equal(fullDetailRefs.evidence_worklist_ref, '/family_runtime_evidence_worklist');
});

test('family-runtime evidence-worklist keeps stage replay guidance out of default owner planning', () => {
  const stageReplayGuidance = {
    action_id: 'review_stage_replay_missing_receipt_workorder',
    action_kind: 'stage_replay_missing_receipt_guidance',
    step_kind: 'record_stage_replay_missing_receipt_payload',
    owner: 'domain_or_human_gate_owner',
    domain_id: 'med-autoscience',
    stage_id: 'publication',
    missing_ref: 'owner_receipt:publication',
    missing_ref_kind: 'owner_receipt',
    payload_requirement: 'stage_replay_missing_receipt_refs_payload_required',
    route_requires_domain_or_app_payload: false,
    next_safe_action_ref: 'stage-replay-missing-receipt-workorder:med-autoscience:publication',
    can_submit_record_to_safe_action_shell: false,
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
  };

  const projection = buildWorklistCurrentOwnerDeltaReadModel({
    drilldown: {
      attention_first_payload: {
        owner_delta_first: {
          surface_kind: 'opl_owner_delta_first_projection',
          status: 'owner_delta_required',
          next_owner: 'med-autoscience',
          next_required_delta: 'owner_answer_or_typed_blocker_required',
          required_return_shapes: ['owner_answer_ref', 'typed_blocker_ref'],
          primary_item: {
            owner: 'med-autoscience',
            stage_id: 'domain_route/reconcile-apply',
          },
          authority_boundary: {
            replay_packet_can_drive_default_planning: false,
          },
        },
      },
    },
    openItems: [],
    nextSafeActions: [stageReplayGuidance],
    counts: {
      open_safe_action_payload_required_item_count: 0,
      open_safe_action_payload_free_item_count: 0,
    },
    compactEvidenceEnvelope: {
      summary: {
        open_envelope_count: 0,
        blocked_envelope_count: 0,
      },
    },
    domainDispatchEvidenceWorkorderSummary: {
      workorder_count: 0,
    },
    stageReplayMissingReceiptWorkorderSummary: {
      workorder_count: 14,
    },
  });

  assert.equal(
    projection.current_owner_delta.advisory_warnings.some(
      (warning: { warning_id?: string; default_planning_role?: string }) =>
        warning.warning_id === 'stage_replay_missing_receipts_are_audit_tail'
        && warning.default_planning_role === 'audit_metric_only',
    ),
    true,
  );
  assert.equal(
    projection.current_owner_delta.authority_boundary.replay_packet_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.next_safe_action_or_none?.derivation_source,
    'current_owner_delta',
  );
  assert.equal(
    projection.next_safe_action_or_none?.action_kind,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assert.equal(
    projection.next_safe_action_or_none?.replay_packet_can_drive_default_planning,
    false,
  );
  assert.equal(
    projection.owner_delta_audit_tail.audit_next_safe_action_or_none?.action_kind,
    'stage_replay_missing_receipt_guidance',
  );
  assert.equal(
    projection.owner_delta_audit_tail.audit_next_safe_action_or_none?.owner,
    'domain_or_human_gate_owner',
  );
  assert.equal(
    projection.owner_delta_audit_tail.audit_next_safe_action_or_none?.can_create_owner_receipt,
    false,
  );
});

test('family-runtime evidence-worklist keeps current owner delta visible when ordinary worklist is empty', () => {
  const projection = buildWorklistCurrentOwnerDeltaReadModel({
    drilldown: {
      attention_first_payload: {
        owner_delta_first: {
          surface_kind: 'opl_owner_delta_first_projection',
          status: 'owner_delta_required',
          next_owner: 'med-autoscience',
          next_required_delta: 'owner_answer_or_typed_blocker_required',
          required_return_shapes: ['owner_answer_ref', 'typed_blocker_ref'],
          primary_item: {
            owner: 'med-autoscience',
            stage_id: 'domain_route/reconcile-apply',
          },
          authority_boundary: {
            raw_worklist_can_drive_default_planning: false,
          },
        },
      },
    },
    openItems: [],
    nextSafeActions: [],
    counts: {
      open_safe_action_payload_required_item_count: 0,
      open_safe_action_payload_free_item_count: 0,
    },
    compactEvidenceEnvelope: {
      summary: {
        open_envelope_count: 0,
        blocked_envelope_count: 1965,
      },
    },
    domainDispatchEvidenceWorkorderSummary: {
      workorder_count: 0,
    },
    stageReplayMissingReceiptWorkorderSummary: {
      workorder_count: 14,
    },
  });

  assert.equal(projection.owner_delta_audit_tail.count_summary.open_safe_action_count, 0);
  assert.equal(projection.owner_delta_audit_tail.audit_next_safe_action_or_none, null);
  assert.equal(projection.current_owner_delta.current_owner, 'med-autoscience');
  assert.equal(
    projection.default_summary.next_action_kind,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assert.equal(
    projection.next_safe_action_or_none?.derivation_source,
    'current_owner_delta',
  );
  assert.equal(
    projection.next_safe_action_or_none?.action_kind,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assert.equal(projection.next_safe_action_or_none?.owner, 'med-autoscience');
  assert.equal(projection.next_safe_action_or_none?.route_requires_domain_or_app_payload, true);
  assert.equal(projection.next_safe_action_or_none?.can_submit_to_safe_action_shell, false);
  assert.equal(projection.next_safe_action_or_none?.worklist_item_is_completion_claim, false);
  assert.equal(projection.next_safe_action_or_none?.raw_worklist_can_drive_default_planning, false);
});
