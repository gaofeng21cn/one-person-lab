import assert from 'node:assert/strict';
import test from 'node:test';

import {
  frameworkAttentionNextSafeActions,
} from '../../../../src/modules/console/framework-readiness-attention-actions.ts';

type StageReplayGuidanceAction = Record<string, unknown> & {
  action_kind?: string;
  action_id?: string;
  step_kind?: string;
  evidence_closure_gate?: string;
  item_id?: string;
  domain_id?: string;
  stage_id?: string;
  default_guidance_kind?: string;
  can_submit_record_to_safe_action_shell?: boolean;
  can_execute_domain_action?: boolean;
  can_create_owner_receipt?: boolean;
  can_close_domain_ready?: boolean;
  can_claim_production_ready?: boolean;
};

test('framework readiness exposes stage replay missing receipt guidance without authority', () => {
  const replayAttention = {
    item_id: 'stage-replay-missing-receipt-workorder:med-autoscience:publication:owner-receipt',
    domain_id: 'med-autoscience',
    stage_id: 'publication',
    missing_ref: 'owner_receipt:publication',
    missing_ref_kind: 'owner_receipt',
    target_identity: {
      domain_id: 'med-autoscience',
      stage_id: 'publication',
      missing_ref: 'owner_receipt:publication',
    },
    direct_ledger_handoff: {
      record_success_command: 'opl runtime stage-replay-missing-receipt record --payload success.json',
      verify_command: 'opl runtime stage-replay-missing-receipt verify --receipt opl://receipt',
    },
    default_next_action_guidance: {
      action_kind: 'record_payload',
      step_kind: 'record_stage_replay_missing_receipt_payload',
      owner: 'domain_or_human_gate_owner',
      payload_path: 'success_refs_path',
      record_command: 'opl runtime stage-replay-missing-receipt record --payload success.json',
      verify_command: 'opl runtime stage-replay-missing-receipt verify --receipt opl://receipt',
      alternative_action_kinds: ['record_typed_blocker_payload', 'ask_human'],
      can_submit_to_safe_action_shell: false,
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_claim_production_ready: false,
    },
  };
  const actions = frameworkAttentionNextSafeActions({
    blockers: [],
    warnings: [{ warning_id: 'stage_replay_missing_receipt_attention' }],
    operatorActionableAttentionCount: 1,
    domainBlockedAttentionCount: 0,
    ownerPayloadGroups: [],
    ownerHandoffPacket: {},
    appReleaseUserPathEvidence: {
      open_gate_count: 0,
      pending_verify_receipt_ref_count: 0,
    },
    domainDispatchEvidenceWorkorderGroupAttentionItems: [],
    stageReplayMissingReceiptWorkorderAttentionItems: [replayAttention],
    itemLimit: 5,
  }) as StageReplayGuidanceAction[];

  assert.equal(replayAttention.default_next_action_guidance.action_kind, 'record_payload');
  assert.equal(
    replayAttention.default_next_action_guidance.step_kind,
    'record_stage_replay_missing_receipt_payload',
  );
  assert.equal(replayAttention.default_next_action_guidance.owner, 'domain_or_human_gate_owner');
  assert.equal(replayAttention.default_next_action_guidance.payload_path, 'success_refs_path');
  assert.equal(replayAttention.default_next_action_guidance.can_create_owner_receipt, false);
  assert.equal(replayAttention.default_next_action_guidance.can_claim_production_ready, false);

  const stageReplayAction = actions.find((action) =>
    action.action_kind === 'stage_replay_missing_receipt_guidance'
  );
  assert.equal(Boolean(stageReplayAction), true);
  assert.equal(stageReplayAction?.action_id, 'review_stage_replay_missing_receipt_workorder');
  assert.equal(stageReplayAction?.step_kind, 'record_stage_replay_missing_receipt_payload');
  assert.equal(stageReplayAction?.evidence_closure_gate, 'stage_replay_missing_receipt_refs_gate');
  assert.equal(stageReplayAction?.item_id, replayAttention.item_id);
  assert.equal(stageReplayAction?.domain_id, replayAttention.domain_id);
  assert.equal(stageReplayAction?.stage_id, replayAttention.stage_id);
  assert.equal(stageReplayAction?.default_guidance_kind, 'record_payload');
  assert.equal(stageReplayAction?.can_submit_record_to_safe_action_shell, false);
  assert.equal(stageReplayAction?.can_execute_domain_action, false);
  assert.equal(stageReplayAction?.can_create_owner_receipt, false);
  assert.equal(stageReplayAction?.can_close_domain_ready, false);
  assert.equal(stageReplayAction?.can_claim_production_ready, false);
});
