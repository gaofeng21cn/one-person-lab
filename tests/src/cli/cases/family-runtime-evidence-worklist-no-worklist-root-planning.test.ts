import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorklistOwnerDeltaActionProjection,
} from '../../../../src/modules/runway/family-runtime-evidence-worklist-parts/current-owner-delta-projection.ts';

type ProjectionInput = Parameters<typeof buildWorklistOwnerDeltaActionProjection>[0];

function project(options: {
  openItems?: Record<string, unknown>[];
  nextSafeActions?: Record<string, unknown>[];
  ownerDeltaFirst?: Record<string, unknown>;
  replayWorkorderCount?: number;
} = {}) {
  const ownerDeltaFirst = {
    surface_kind: 'opl_owner_delta_first_projection',
    status: 'owner_delta_required',
    next_owner: 'med-autoscience',
    next_required_delta: 'owner_answer_or_typed_blocker_required',
    required_return_shapes: ['owner_answer_ref', 'typed_blocker_ref'],
    primary_item: { owner: 'med-autoscience', stage_id: 'domain_route/reconcile-apply' },
    authority_boundary: {
      raw_worklist_can_drive_default_planning: false,
      replay_packet_can_drive_default_planning: false,
    },
    ...options.ownerDeltaFirst,
  };
  return buildWorklistOwnerDeltaActionProjection({
    drilldown: { attention_first_payload: { owner_delta_first: ownerDeltaFirst } },
    openItems: options.openItems ?? [],
    nextSafeActions: options.nextSafeActions ?? [],
    counts: {
      open_safe_action_payload_required_item_count: options.openItems?.length ?? 0,
      open_safe_action_payload_free_item_count: 0,
    },
    compactEvidenceEnvelope: { summary: { open_envelope_count: 0, blocked_envelope_count: 0 } },
    domainDispatchEvidenceWorkorderSummary: { workorder_count: options.openItems?.length ?? 0 },
    stageReplayMissingReceiptWorkorderSummary: {
      workorder_count: options.replayWorkorderCount ?? 0,
    },
  } as ProjectionInput).currentOwnerDeltaReadModel;
}

test('evidence worklist keeps raw audit items out of current-owner planning', () => {
  const rawItem = {
    item_id: 'evidence-worklist:domain_dispatch:redcube:stale-audit-record',
    action_id: 'domain_dispatch:redcube:stale-audit-record:record',
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'redcube-ai',
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
    claim_scope: 'domain_dispatch_evidence_receipt',
    payload_requirement: 'domain_app_or_live_refs_payload_required',
    route_requires_domain_or_app_payload: true,
    required_return_shapes: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
  };
  const projection = project({
    openItems: [rawItem],
    nextSafeActions: [rawItem],
    ownerDeltaFirst: {
      next_required_delta: 'domain_deliverable_delta_or_domain_owned_typed_blocker_required',
    },
  });

  assert.equal(projection.current_owner, 'med-autoscience');
  assert.equal(projection.current_owner_delta.default_planning_root, 'current_owner_delta');
  assert.equal(projection.current_owner_delta.authority_boundary.raw_worklist_can_drive_default_planning, false);
  assert.equal(projection.current_owner_delta.authority_boundary.route_reconciler_can_sign_receipts, false);
  assert.equal(Object.hasOwn(projection.current_owner_delta, 'stop_loss_state'), false);
  assert.equal(
    projection.next_safe_action_or_none?.derivation_source,
    'current_owner_delta',
  );
  assert.equal(projection.next_safe_action_or_none?.owner, 'med-autoscience');
  assert.equal(projection.owner_delta_audit_tail.audit_next_safe_action_or_none?.owner, 'redcube-ai');
});

test('evidence worklist keeps replay guidance as audit-only owner input', () => {
  const replay = {
    action_id: 'review_stage_replay_missing_receipt_workorder',
    action_kind: 'stage_replay_missing_receipt_guidance',
    owner: 'domain_or_human_gate_owner',
    payload_requirement: 'stage_replay_missing_receipt_refs_payload_required',
    route_requires_domain_or_app_payload: false,
    can_create_owner_receipt: false,
  };
  const projection = project({ nextSafeActions: [replay], replayWorkorderCount: 14 });

  assert.equal(
    projection.current_owner_delta.advisory_warnings.some(
      (warning: { warning_id?: string }) =>
        warning.warning_id === 'stage_replay_missing_receipts_are_audit_tail',
    ),
    true,
  );
  assert.equal(projection.current_owner_delta.authority_boundary.replay_packet_can_drive_default_planning, false);
  assert.equal(projection.next_safe_action_or_none?.derivation_source, 'current_owner_delta');
  assert.equal(
    projection.owner_delta_audit_tail.audit_next_safe_action_or_none?.action_kind,
    'stage_replay_missing_receipt_guidance',
  );
});

test('evidence worklist keeps current owner delta visible when the worklist is empty', () => {
  const projection = project({ replayWorkorderCount: 14 });

  assert.equal(projection.owner_delta_audit_tail.count_summary.open_safe_action_count, 0);
  assert.equal(projection.owner_delta_audit_tail.audit_next_safe_action_or_none, null);
  assert.equal(projection.current_owner_delta.current_owner, 'med-autoscience');
  assert.equal(
    projection.default_summary.next_action_kind,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assert.equal(projection.next_safe_action_or_none?.owner, 'med-autoscience');
  assert.equal(projection.next_safe_action_or_none?.route_requires_domain_or_app_payload, true);
  assert.equal(projection.next_safe_action_or_none?.can_submit_to_safe_action_shell, false);
  assert.equal(projection.next_safe_action_or_none?.worklist_item_is_completion_claim, false);
});
