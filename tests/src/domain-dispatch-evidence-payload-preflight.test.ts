import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDomainDispatchEvidencePayloadReady,
  preflightDomainDispatchEvidencePayload,
} from '../../src/domain-dispatch-evidence-payload-preflight.ts';
import { FrameworkContractError } from '../../src/contracts.ts';

const route = {
  action_id: 'domain_dispatch:medautoscience:sat-dm003:record',
  required_evidence_refs: [
    'mas://dm003/paper-facing-artifact-delta',
    'mas://dm003/ai-reviewer-currentness',
    'mas://dm003/domain-owner-receipt',
  ],
};

test('domain dispatch evidence payload must cover every route-declared required ref', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_receipt_refs: ['mas://dm003/domain-owner-receipt'],
      evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    },
    route,
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.can_record_refs_only_receipt, false);
  assert.equal(preflight.selected_payload_path, 'blocked');
  assert.equal(preflight.payload_path_policy, 'choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_never_counts_as_success');
  assert.equal(preflight.accepted_payload_paths.success_refs_path.status, 'not_ready');
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.status, 'not_ready');
  assert.deepEqual(preflight.required_evidence_refs, route.required_evidence_refs);
  assert.deepEqual(preflight.missing_required_evidence_refs, ['mas://dm003/ai-reviewer-currentness']);
  assert.equal(preflight.required_evidence_refs_covered, false);
});

test('typed blocker refs may close a route-declared required evidence gap without claiming success', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      typed_blocker_refs: ['mas://dm003/blockers/ai-reviewer-currentness'],
    },
    route,
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'typed_blocker_path');
  assert.equal(preflight.typed_blocker_path_ready, true);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.status, 'ready');
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(preflight.success_path_ready, false);
  assert.deepEqual(preflight.missing_required_evidence_refs, route.required_evidence_refs);
});

test('domain dispatch evidence payload records only when success refs cover all required refs', () => {
  const preflight = assertDomainDispatchEvidencePayloadReady(route, {
    domain_receipt_refs: ['mas://dm003/domain-owner-receipt'],
    owner_chain_refs: ['mas://dm003/ai-reviewer-currentness'],
    evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
  });

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'success_refs_path');
  assert.equal(preflight.accepted_payload_paths.success_refs_path.status, 'ready');
  assert.equal(preflight.accepted_payload_paths.success_refs_path.typed_blocker_refs_must_be_absent, true);
  assert.equal(preflight.required_evidence_refs_covered, true);
  assert.deepEqual(preflight.missing_required_evidence_refs, []);
});

test('missing route-required refs fail closed with structured preflight details', () => {
  assert.throws(
    () => assertDomainDispatchEvidencePayloadReady(route, {
      domain_receipt_refs: ['mas://dm003/domain-owner-receipt'],
      evidence_refs: ['mas://dm003/unrelated-proof'],
    }),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      const details = (error as FrameworkContractError).details as {
        error_kind: string;
        preflight: { missing_required_evidence_refs: string[] };
      };
      assert.equal(details.error_kind, 'domain_dispatch_evidence_required_refs_missing');
      assert.deepEqual(details.preflight.missing_required_evidence_refs, [
        'mas://dm003/paper-facing-artifact-delta',
        'mas://dm003/ai-reviewer-currentness',
      ]);
      return true;
    },
  );
});
