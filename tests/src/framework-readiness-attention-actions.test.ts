import assert from 'node:assert/strict';
import test from 'node:test';

import {
  frameworkAttentionNextSafeActions,
} from '../../src/framework-readiness-attention-actions.ts';

type JsonRecord = Record<string, unknown>;

function actionKind(action: JsonRecord) {
  return action.action_kind ?? action.step_kind;
}

function record(value: unknown): JsonRecord {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as JsonRecord;
}

test('framework readiness prioritizes concrete domain dispatch workorders before broad owner reviews', () => {
  const actions = frameworkAttentionNextSafeActions({
    blockers: [],
    warnings: [{ warning_id: 'domain_dispatch_attention' }],
    operatorActionableAttentionCount: 1,
    domainBlockedAttentionCount: 0,
    ownerPayloadGroups: [{
      owner: 'med-autoscience',
      payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
      status: 'needs_owner_payload_refs',
      attention_count: 7,
      open_envelope_count: 1,
      required_return_shapes: ['domain_owner_receipt_refs_or_typed_blocker_refs'],
    }],
    ownerHandoffPacket: {
      owner_count: 1,
      owners: [{
        owner: 'med-autoscience',
        attention_count: 7,
        open_envelope_count: 1,
        owner_payload_group_count: 1,
        domain_dispatch_group_count: 1,
      }],
    },
    appReleaseUserPathEvidence: {
      open_gate_count: 0,
      pending_verify_receipt_ref_count: 0,
    },
    omaProductionConsumptionFollowthrough: {
      open_gate_count: 0,
      pending_verify_long_soak_receipt_ref_count: 0,
    },
    domainDispatchEvidenceWorkorderGroupAttentionItems: [{
      owner: 'med-autoscience',
      canonical_domain_id: 'med-autoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      workorder_count: 1,
      stage_attempt_count: 1,
      sample_stage_attempt_ids: ['sat-default-executor-dispatch'],
      sample_record_action_ids: [
        'domain_dispatch:medautoscience:sat-default-executor-dispatch:record',
      ],
      required_return_shapes: ['domain_owner_receipt_refs_or_typed_blocker_refs'],
    }],
    itemLimit: 5,
  }) as JsonRecord[];

  assert.deepEqual(
    actions.map(actionKind),
    [
      'framework_attention_review',
      'domain_dispatch_evidence_group_workorder',
      'owner_payload_group_scaleout',
      'owner_handoff_packet_review',
    ],
  );

  const dispatchAction = actions[1];
  assert.equal(dispatchAction.authority, 'operator_attention_only');
  assert.equal(dispatchAction.can_execute_domain_action, false);
  assert.equal(dispatchAction.can_write_domain_truth, false);
  assert.equal(dispatchAction.can_create_owner_receipt, false);
  assert.equal(dispatchAction.can_close_domain_ready, false);
  assert.equal(dispatchAction.can_claim_production_ready, false);
});

test('framework readiness keeps blocked refs-only attention out of executable next actions', () => {
  const actions = frameworkAttentionNextSafeActions({
    blockers: [],
    warnings: [
      {
        warning_id: 'evidence_envelope_attention',
        open_count: 0,
        blocked_count: 7,
      },
      {
        warning_id: 'domain_dispatch_attention',
        count: 3,
      },
    ],
    operatorActionableAttentionCount: 0,
    domainBlockedAttentionCount: 10,
    ownerPayloadGroups: [{
      owner: 'med-autoscience',
      payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
      status: 'blocked_by_domain_typed_blocker_refs',
      attention_count: 7,
      open_envelope_count: 0,
      blocked_envelope_count: 7,
      required_return_shapes: ['domain_owner_receipt_refs_or_typed_blocker_refs'],
    }],
    ownerHandoffPacket: {
      owner_count: 1,
      owners: [{
        owner: 'med-autoscience',
        attention_count: 7,
        open_envelope_count: 0,
        blocked_envelope_count: 7,
        owner_payload_group_count: 1,
        domain_dispatch_group_count: 0,
      }],
    },
    appReleaseUserPathEvidence: {
      open_gate_count: 0,
      pending_verify_receipt_ref_count: 0,
    },
    omaProductionConsumptionFollowthrough: {
      open_gate_count: 0,
      pending_verify_long_soak_receipt_ref_count: 0,
    },
    domainDispatchEvidenceWorkorderGroupAttentionItems: [{
      owner: 'med-autoscience',
      canonical_domain_id: 'med-autoscience',
      stage_id: 'publication_aftercare/reviewer-refresh',
      workorder_count: 1,
      stage_attempt_count: 1,
      sample_record_action_ids: [
        'domain_dispatch:medautoscience:sat-blocked-only:record',
      ],
    }],
    itemLimit: 5,
  }) as JsonRecord[];

  assert.deepEqual(
    actions.map(actionKind),
    ['blocked_refs_only_attention_review'],
  );
  assert.equal(actions[0].authority, 'refs_only_review');
  assert.equal(actions[0].can_submit_record_to_safe_action_shell, false);
  assert.equal(actions[0].can_execute_domain_action, false);
  assert.equal(actions[0].can_create_owner_receipt, false);
  assert.equal(actions[0].can_close_domain_ready, false);
  assert.equal(actions[0].can_claim_production_ready, false);
  assert.deepEqual(actions[0].drilldown_commands, {
    framework_readiness_full: 'opl framework readiness --family-defaults --json',
    app_operator_drilldown_full: 'opl runtime app-operator-drilldown --detail full --json',
    evidence_worklist_full:
      'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
  });
  assert.deepEqual(actions[0].blocked_attention_summary, {
    domain_blocked_attention_count: 10,
    top_owner_payload_group_count: 1,
    top_owner: 'med-autoscience',
    top_payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
    top_status: 'blocked_by_domain_typed_blocker_refs',
    top_attention_count: 7,
    top_blocked_envelope_count: 7,
    top_typed_blocker_ref_count: 0,
    top_receipt_ref_count: 0,
    full_detail_sections: [
      'attention_first_payload.owner_payload_groups',
      'attention_first_payload.evidence_after_contract.owner_handoff_packet',
      'evidence_envelope',
      'domain_dispatch_attention',
    ],
  });
  const topOwnerPayloadGroups = actions[0].top_owner_payload_groups as unknown[];
  assert.equal(topOwnerPayloadGroups.length, 1);
  assert.deepEqual(record(topOwnerPayloadGroups[0]), {
    owner: 'med-autoscience',
    payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
    status: 'blocked_by_domain_typed_blocker_refs',
    attention_count: 7,
    open_envelope_count: 0,
    blocked_envelope_count: 7,
    receipt_ref_count: 0,
    typed_blocker_ref_count: 0,
  });
});
