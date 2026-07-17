import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOwnerDeltaHandoffSummary,
} from '../../src/modules/console/framework-readiness-owner-delta-handoff-summary.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as JsonRecord;
}

test('owner delta handoff summary falls back to owner payload workorder fields', () => {
  const summary = buildOwnerDeltaHandoffSummary({
    ownerDeltaFirst: {
      status: 'owner_delta_required',
      next_owner: 'medautoscience',
      next_required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
      primary_item: {
        payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
      },
    },
    ownerHandoffPacket: {
      status: 'handoff_required',
      owner_count: 1,
      owners: [{
        owner: 'medautoscience',
        attention_count: 1,
        owner_payload_workorder: {
          payload_path_policy:
            'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
          payload_kinds: ['domain_owner_receipt_or_typed_blocker_refs'],
          required_operator_payload_refs: [
            'domain_owner_receipt_refs',
            'typed_blocker_refs',
          ],
          required_return_shapes: [
            'domain_owner_receipt_ref',
            'typed_blocker_ref',
          ],
          accepted_payload_paths: {
            success_refs_path: {
              required_any_operator_payload_refs: ['domain_owner_receipt_refs'],
              closes_domain_ready: false,
            },
            typed_blocker_path: {
              required_operator_payload_refs: ['typed_blocker_refs'],
              success_claimed: false,
            },
          },
        },
      }],
    },
    domainDispatchEvidenceWorkorderSummary: {
      workorder_count: 1,
      domain_count: 1,
      stage_attempt_count: 1,
    },
    openSafeActionItemCount: 1,
    openSafeActionPayloadRequiredCount: 1,
    openSafeActionPayloadFreeCount: 0,
    operatorActionableAttentionCount: 1,
    operatorPayloadRequiredAttentionCount: 1,
    operatorPayloadFreeAttentionCount: 0,
    domainBlockedAttentionCount: 0,
    evidenceEnvelopeOpenCount: 1,
    evidenceEnvelopeBlockedCount: 0,
    stageReplayMissingReceiptWorkorderCount: 0,
  });
  const ownerPayloadWorkorder = record(summary.owner_payload_workorder);
  const acceptedPayloadPaths = record(summary.accepted_payload_paths);
  const successRefsPath = record(acceptedPayloadPaths.success_refs_path);
  const typedBlockerPath = record(acceptedPayloadPaths.typed_blocker_path);

  assert.equal(summary.current_operator_action_state, 'needs_domain_or_app_live_owner_payload');
  assert.deepEqual(summary.required_refs_any_of, [
    'domain_owner_receipt_refs',
    'typed_blocker_refs',
  ]);
  assert.deepEqual(summary.required_return_shapes, [
    'domain_owner_receipt_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(summary.top_payload_kind, 'domain_owner_receipt_or_typed_blocker_refs');
  assert.equal(
    summary.payload_path_policy,
    'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
  );
  assert.deepEqual(
    summary.accepted_payload_paths,
    ownerPayloadWorkorder.accepted_payload_paths,
  );
  assert.equal(successRefsPath.closes_domain_ready, false);
  assert.equal(typedBlockerPath.success_claimed, false);
  assert.equal(summary.authority_boundary.can_create_owner_receipt, false);
  assert.equal(summary.authority_boundary.can_create_typed_blocker, false);
  assert.equal(summary.authority_boundary.can_claim_production_ready, false);
});

test('owner delta handoff summary uses selected safe action payload workorder without owner handoff', () => {
  const summary = buildOwnerDeltaHandoffSummary({
    ownerDeltaFirst: {
      status: 'operator_safe_action_available',
      next_owner: 'one-person-lab',
      next_required_delta: 'app_release_user_path_evidence_open',
      required_return_shapes: [
        'release_package_receipt_ref',
        'typed_blocker_ref',
      ],
      primary_item: {
        step_kind: 'app_release_user_path_evidence',
        payload_owner: 'app_live_operator_or_release_owner',
      },
      selected_safe_action: {
        action_kind: 'app_release_user_path_evidence_receipt_record',
        required_operator_payload_refs: [
          'release_package_refs',
          'typed_blocker_refs',
        ],
        required_return_shapes: [
          'release_package_receipt_ref',
          'typed_blocker_ref',
        ],
        payload_workorder: {
          surface_kind: 'opl_app_release_user_path_evidence_payload_workorder',
          accepted_payload_path_policy:
            'same_cohort_release_user_path_refs_release_owner_verdict_owner_acceptance_or_typed_blocker_path_empty_template_blocks',
          required_operator_payload_refs: [
            'release_package_refs',
            'typed_blocker_refs',
          ],
          required_return_shapes: [
            'release_package_receipt_ref',
            'typed_blocker_ref',
          ],
          accepted_payload_paths: {
            app_release_user_path_refs_path: {
              required_any_operator_payload_refs: ['release_package_refs'],
              typed_blocker_refs_must_be_absent: true,
              closes_app_release_user_path: false,
              closes_release_ready: false,
              closes_production_ready: false,
            },
            typed_blocker_path: {
              required_operator_payload_refs: ['typed_blocker_refs'],
              success_claimed: false,
              closes_app_release_user_path: false,
              closes_release_ready: false,
              closes_production_ready: false,
            },
          },
          empty_payload_template_is_success_evidence: false,
          authority_boundary: {
            can_create_owner_receipt: false,
            can_generate_typed_blocker: false,
            can_claim_release_ready: false,
            can_claim_production_ready: false,
            refs_only: true,
          },
        },
      },
    },
    ownerHandoffPacket: {
      status: 'clear',
      owner_count: 0,
      owners: [],
    },
    domainDispatchEvidenceWorkorderSummary: {
      workorder_count: 0,
      domain_count: 0,
      stage_attempt_count: 0,
    },
    openSafeActionItemCount: 1,
    openSafeActionPayloadRequiredCount: 0,
    openSafeActionPayloadFreeCount: 1,
    operatorActionableAttentionCount: 1,
    operatorPayloadRequiredAttentionCount: 0,
    operatorPayloadFreeAttentionCount: 1,
    domainBlockedAttentionCount: 0,
    evidenceEnvelopeOpenCount: 0,
    evidenceEnvelopeBlockedCount: 0,
    stageReplayMissingReceiptWorkorderCount: 0,
  });

  assert.equal(summary.current_operator_action_state, 'opl_safe_action_available');
  assert.equal(summary.payload_contract_source, 'owner_delta_first_selected_safe_action');
  assert.equal(
    summary.payload_contract_surface_kind,
    'opl_app_release_user_path_evidence_payload_workorder',
  );
  assert.deepEqual(summary.required_refs_any_of, [
    'release_package_refs',
    'typed_blocker_refs',
  ]);
  assert.deepEqual(summary.required_return_shapes, [
    'release_package_receipt_ref',
    'typed_blocker_ref',
  ]);
  assert.equal(
    summary.payload_path_policy,
    'same_cohort_release_user_path_refs_release_owner_verdict_owner_acceptance_or_typed_blocker_path_empty_template_blocks',
  );
  assert.equal(
    record(summary.accepted_payload_paths).typed_blocker_path
      && record(record(summary.accepted_payload_paths).typed_blocker_path).success_claimed,
    false,
  );
  assert.equal(summary.authority_boundary.can_create_owner_receipt, false);
  assert.equal(summary.authority_boundary.can_create_typed_blocker, false);
  assert.equal(summary.authority_boundary.can_claim_production_ready, false);
});
