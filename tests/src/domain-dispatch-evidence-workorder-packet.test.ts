import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
} from '../../src/domain-dispatch-evidence-workorder-packet.ts';

function typedBlockerPath(value: unknown) {
  return (value as { typed_blocker_path: { success_claimed: boolean } }).typed_blocker_path;
}

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
    payload_workorder: {
      surface_kind: 'opl_domain_dispatch_evidence_payload_workorder',
      workorder_policy:
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      accepted_payload_paths: {
        success_refs_path: {
          required_any_operator_payload_refs: [
            'domain_receipt_refs',
            'owner_chain_refs',
            'no_regression_refs',
            'evidence_refs',
          ],
        },
        typed_blocker_path: {
          required_operator_payload_refs: ['typed_blocker_refs'],
          success_claimed: false,
        },
      },
    },
    payload_preflight_policy:
      'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
    payload_preflight_error_code: 'cli_usage_error',
    payload_preflight_blocked_error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
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
  assert.equal(packet.summary.payload_workorder_count, 3);
  assert.equal(packet.summary.payload_preflight_policy_count, 3);
  assert.equal(
    packet.summary.accepted_payload_path_policy,
    'success_refs_path_or_typed_blocker_path_empty_template_blocks',
  );
  assert.equal(packet.authority_boundary.can_generate_domain_owner_receipt, false);
  assert.equal(packet.authority_boundary.can_execute_domain_action, false);
  assert.equal(
    packet.workorders.every((workorder) =>
      workorder.payload_path_policy
        === 'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks'
    ),
    true,
  );
  assert.equal(
    packet.workorders.every((workorder) =>
      workorder.payload_preflight_policy
        === 'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight'
    ),
    true,
  );
  assert.equal(
    packet.workorders.every((workorder) =>
      typedBlockerPath(workorder.accepted_payload_paths).success_claimed === false
    ),
    true,
  );

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
  assert.equal(
    attentionItems.every((item) =>
      item.payload_preflight_blocked_error_kind
        === 'domain_dispatch_evidence_payload_preflight_blocked'
    ),
    true,
  );
  assert.equal(
    attentionItems.every((item) => item.empty_payload_template_is_success_evidence === false),
    true,
  );
});
