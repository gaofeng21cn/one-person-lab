import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
} from '../../src/domain-dispatch-evidence-workorder-packet.ts';

function domainDispatchRoute(domainId: string, stageAttemptId: string) {
  return {
    action_id: `domain_dispatch:${domainId}:${stageAttemptId}:record`,
    action_kind: 'domain_dispatch_evidence_receipt_record',
    domain_id: domainId,
    stage_id: 'review',
    stage_attempt_id: stageAttemptId,
    request_id: `domain_dispatch:${domainId}:${stageAttemptId}`,
    request_pack_id: `${domainId}.domain_dispatch_evidence`,
    payload_owner: 'domain_repository_or_app_live_operator',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    can_execute: false,
    creates_domain_action: false,
    creates_owner_receipt: false,
    ref: `opl agents evidence apply --domain ${domainId}`,
    required_operator_payload_refs: [
      'domain_receipt_refs',
      'typed_blocker_refs',
      'owner_chain_refs',
      'no_regression_refs',
      'evidence_refs',
    ],
    required_evidence_refs: [
      `domain_dispatch:${domainId}:${stageAttemptId}:owner_receipt_or_typed_blocker`,
    ],
    payload_template: {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
    },
  };
}

test('domain dispatch workorder packet keeps default summary canonical while preserving route ids', () => {
  const packet = buildDomainDispatchEvidenceWorkorderPacket([
    domainDispatchRoute('medautoscience', 'sat-mas'),
    domainDispatchRoute('medautogrant', 'sat-mag'),
    domainDispatchRoute('redcube', 'sat-rca'),
  ]);

  assert.deepEqual([...packet.summary.domain_ids].sort(), [
    'med-autogrant',
    'med-autoscience',
    'redcube-ai',
  ]);
  assert.equal(
    packet.summary.domain_id_policy,
    'canonical_owner_facing_ids_only_workorder_items_keep_command_domain_ids_for_action_routes',
  );
  assert.deepEqual([...packet.summary.route_domain_ids].sort(), [
    'medautogrant',
    'medautoscience',
    'redcube',
  ]);
  assert.equal(
    packet.summary.route_domain_id_policy,
    'command_domain_ids_for_opl_runtime_action_execute_routes_not_default_owner_semantics',
  );
  assert.deepEqual(
    packet.workorders.map((workorder) => workorder.domain_id).sort(),
    ['medautogrant', 'medautoscience', 'redcube'],
  );
  assert.deepEqual(
    packet.workorders.map((workorder) => workorder.route_domain_id).sort(),
    ['medautogrant', 'medautoscience', 'redcube'],
  );
  assert.deepEqual(
    packet.workorders.map((workorder) => workorder.canonical_domain_id).sort(),
    ['med-autogrant', 'med-autoscience', 'redcube-ai'],
  );
  assert.equal(
    packet.workorders.every((workorder) =>
      workorder.domain_id_policy
        === 'domain_id_is_route_domain_id_for_action_execution_canonical_domain_id_is_owner_facing_semantics'
    ),
    true,
  );
  assert.equal(packet.summary.domain_count, 3);
  assert.equal(packet.summary.workorder_count, 3);
  assert.equal(packet.authority_boundary.can_generate_domain_owner_receipt, false);
  assert.equal(packet.authority_boundary.can_execute_domain_action, false);

  const attentionItems = compactDomainDispatchEvidenceWorkorderAttentionItems(packet);
  assert.deepEqual(
    attentionItems.map((item) => item.domain_id).sort(),
    ['medautogrant', 'medautoscience', 'redcube'],
  );
  assert.deepEqual(
    attentionItems.map((item) => item.route_domain_id).sort(),
    ['medautogrant', 'medautoscience', 'redcube'],
  );
  assert.deepEqual(
    attentionItems.map((item) => item.canonical_domain_id).sort(),
    ['med-autogrant', 'med-autoscience', 'redcube-ai'],
  );
  assert.equal(
    attentionItems.every((item) =>
      item.domain_id_policy
        === 'domain_id_is_route_domain_id_for_action_execution_canonical_domain_id_is_owner_facing_semantics'
    ),
    true,
  );
});
