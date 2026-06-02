import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOwnerDeltaHandoffSummary,
} from '../../src/framework-readiness-owner-delta-handoff-summary.ts';

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
