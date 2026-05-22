import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
  compactDomainDispatchEvidenceWorkorderGroupAttentionItems,
} from '../../src/domain-dispatch-evidence-workorder-packet.ts';

function typedBlockerPath(value: unknown) {
  return (value as { typed_blocker_path: { success_claimed: boolean } }).typed_blocker_path;
}

function fingerprintBindingMode(value: unknown) {
  return (value as {
    payload_source_fingerprint_binding: { source_fingerprint_binds_to: string };
  }).payload_source_fingerprint_binding.source_fingerprint_binds_to;
}

function providerAttemptSourceKeyFields(value: unknown) {
  return (value as {
    payload_source_fingerprint_binding: { provider_attempt_source_key_fields: string[] };
  }).payload_source_fingerprint_binding.provider_attempt_source_key_fields;
}

function domainDispatchRoute(
  domainId: string,
  stageAttemptId: string,
  identityOverrides: Record<string, unknown> = {},
) {
  return {
    action_id: `domain_dispatch:${domainId}:${stageAttemptId}:record`,
    action_kind: 'domain_dispatch_evidence_receipt_record',
    domain_id: domainId,
    stage_id: 'review',
    stage_attempt_id: stageAttemptId,
    stage_attempt_source_fingerprint: `fp-${stageAttemptId}`,
    target_identity: {
      domain_id: domainId,
      stage_id: 'review',
      stage_attempt_id: stageAttemptId,
      task_kind: 'review',
      study_id: `study-${stageAttemptId}`,
      source_fingerprint: `fp-${stageAttemptId}`,
      profile: `/profiles/${stageAttemptId}.toml`,
      profile_name: `profile-${stageAttemptId}`,
      ...identityOverrides,
    },
    identity_binding_policy:
      'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
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
  assert.deepEqual(
    packet.workorders.map((workorder) => workorder.target_identity),
    [
      {
        domain_id: 'medautoscience',
        stage_id: 'review',
        stage_attempt_id: 'sat-mas',
        task_kind: 'review',
        study_id: 'study-sat-mas',
        source_fingerprint: 'fp-sat-mas',
        profile: '/profiles/sat-mas.toml',
        profile_name: 'profile-sat-mas',
      },
      {
        domain_id: 'medautogrant',
        stage_id: 'review',
        stage_attempt_id: 'sat-mag',
        task_kind: 'review',
        study_id: 'study-sat-mag',
        source_fingerprint: 'fp-sat-mag',
        profile: '/profiles/sat-mag.toml',
        profile_name: 'profile-sat-mag',
      },
      {
        domain_id: 'redcube',
        stage_id: 'review',
        stage_attempt_id: 'sat-rca',
        task_kind: 'review',
        study_id: 'study-sat-rca',
        source_fingerprint: 'fp-sat-rca',
        profile: '/profiles/sat-rca.toml',
        profile_name: 'profile-sat-rca',
      },
    ],
  );
  assert.equal(
    packet.workorders.every((workorder) =>
      workorder.identity_binding_policy
        === 'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity'
    ),
    true,
  );
  assert.equal(packet.summary.identity_binding_guidance_count, 3);
  assert.equal(
    packet.workorders.every((workorder) =>
      workorder.identity_binding_guidance.policy
        === 'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity'
    ),
    true,
  );
  assert.deepEqual(
    packet.workorders.map((workorder) =>
      fingerprintBindingMode(workorder.identity_binding_guidance)
    ),
    [
      'stage_attempt_source_fingerprint',
      'stage_attempt_source_fingerprint',
      'stage_attempt_source_fingerprint',
    ],
  );
  assert.equal(
    packet.workorders.every((workorder) =>
      workorder.identity_binding_guidance.matching_policy
        === 'study_task_profile_match_is_not_sufficient_payload_identity_must_match_all_comparable_target_fields'
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
  assert.deepEqual(
    attentionItems.map((item) => item.target_identity),
    packet.workorders.map((workorder) => workorder.target_identity),
  );
  assert.equal(
    attentionItems.every((item) =>
      item.identity_binding_policy
        === 'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity'
    ),
    true,
  );
  assert.deepEqual(
    attentionItems.map((item) =>
      fingerprintBindingMode(item.identity_binding_guidance)
    ),
    [
      'stage_attempt_source_fingerprint',
      'stage_attempt_source_fingerprint',
      'stage_attempt_source_fingerprint',
    ],
  );
});

test('domain dispatch workorder packet exposes domain-source fingerprint binding guidance', () => {
  const packet = buildDomainDispatchEvidenceWorkorderPacket([
    domainDispatchRoute('medautoscience', 'sat-domain-source', {
      domain_source_fingerprint: 'domain-source-1',
    }),
  ]);

  const [workorder] = packet.workorders;
  assert.equal(
    fingerprintBindingMode(workorder.identity_binding_guidance),
    'domain_source_fingerprint',
  );
  assert.deepEqual(
    providerAttemptSourceKeyFields(workorder.identity_binding_guidance),
    ['stage_attempt_source_fingerprint', 'provider_attempt_source_key'],
  );
  assert.equal(
    workorder.identity_binding_guidance.stale_payload_policy,
    'do_not_record_stale_or_drifted_domain_payload_generate_new_owner_payload_or_typed_blocker_ref',
  );
  assert.equal(
    packet.domain_stage_group_summary.groups[0].identity_binding_guidance_count,
    1,
  );
  assert.deepEqual(
    packet.domain_stage_group_summary.groups[0].identity_source_fingerprint_binding_modes,
    ['domain_source_fingerprint'],
  );

  const [attentionItem] = compactDomainDispatchEvidenceWorkorderAttentionItems(packet);
  assert.equal(
    fingerprintBindingMode(attentionItem.identity_binding_guidance),
    'domain_source_fingerprint',
  );

  const [groupItem] = compactDomainDispatchEvidenceWorkorderGroupAttentionItems(packet);
  assert.equal(
    groupItem.identity_binding_policy,
    'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
  );
  assert.equal(groupItem.identity_binding_guidance_count, 1);
  assert.deepEqual(groupItem.identity_source_fingerprint_binding_modes, [
    'domain_source_fingerprint',
  ]);
});
