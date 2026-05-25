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
  assert.equal(
    preflight.payload_path_policy,
    'choose_success_closeout_refs_path_or_domain_owned_typed_blocker_path_evidence_refs_are_supplemental',
  );
  assert.equal(preflight.accepted_payload_paths.success_refs_path.status, 'not_ready');
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.status, 'not_ready');
  assert.deepEqual(preflight.required_evidence_refs, route.required_evidence_refs);
  assert.deepEqual(preflight.missing_required_evidence_refs, ['mas://dm003/ai-reviewer-currentness']);
  assert.equal(preflight.required_evidence_refs_covered, false);
});

test('generic evidence refs are supplemental and cannot close domain dispatch on their own', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    },
    {
      action_id: 'domain_dispatch:medautoscience:sat-dm003:record',
      required_evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    },
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.can_record_refs_only_receipt, false);
  assert.equal(preflight.selected_payload_path, 'blocked');
  assert.equal(preflight.required_evidence_refs_covered, true);
  assert.equal(preflight.accepted_payload_paths.success_refs_path.status, 'not_ready');
  assert.deepEqual(preflight.required_any_operator_payload_refs, [
    'domain_receipt_refs',
    'typed_blocker_refs',
    'owner_chain_refs',
    'no_regression_refs',
  ]);
  assert.deepEqual(preflight.supplemental_operator_payload_refs, ['evidence_refs']);
  assert.deepEqual(preflight.missing_payload_fields, [
    'domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs',
  ]);
  assert.equal(preflight.accepted_ref_counts.evidence_refs, 1);
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

test('MAS paper-line owner-chain result payload feeds success refs without a ready claim', () => {
  const preflight = assertDomainDispatchEvidencePayloadReady(route, {
    evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    paper_line_owner_chain_results: [
      {
        surface_kind: 'mas_paper_line_owner_chain_result',
        paper_line_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        result_kind: 'owner_receipt',
        owner_receipt_refs: ['mas://dm003/domain-owner-receipt'],
        stable_typed_blocker_refs: [],
        progress_delta_refs: ['mas://dm003/ai-reviewer-currentness'],
        no_forbidden_write_proof_ref: 'mas://dm003/no-forbidden-write',
        body_included: false,
        readiness_claims: {
          claims_paper_closure: false,
          claims_publication_ready: false,
          claims_artifact_mutation_authorized: false,
          claims_current_package_updated: false,
        },
      },
    ],
  });

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'success_refs_path');
  assert.equal(preflight.accepted_ref_counts.domain_receipt_refs, 1);
  assert.equal(preflight.accepted_ref_counts.owner_chain_refs, 2);
  assert.equal(preflight.accepted_ref_counts.typed_blocker_refs, 0);
  assert.equal(preflight.accepted_payload_paths.success_refs_path.can_claim_domain_ready, false);
  assert.deepEqual(preflight.missing_required_evidence_refs, []);
});

test('MAS paper-line stable typed blocker result feeds blocker path without success', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      paper_line_owner_chain_results: [
        {
          surface_kind: 'mas_paper_line_owner_chain_result',
          paper_line_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          result_kind: 'stable_typed_blocker',
          owner_receipt_refs: [],
          stable_typed_blocker_refs: ['mas://dm003/blockers/ai-reviewer-currentness'],
          body_included: false,
        },
      ],
    },
    route,
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'typed_blocker_path');
  assert.equal(preflight.accepted_ref_counts.domain_receipt_refs, 0);
  assert.equal(preflight.accepted_ref_counts.owner_chain_refs, 0);
  assert.equal(preflight.accepted_ref_counts.typed_blocker_refs, 1);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.can_claim_domain_ready, false);
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

test('domain dispatch evidence separates OPL attempt key from domain source freshness', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      study_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: '4a0c28ae63dc5d68',
      typed_blocker_refs: ['mas://typed-blockers/default-executor-pending'],
    },
    {
      action_id: 'domain_dispatch:medautoscience:sat-default-executor:record',
      target_identity: {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        source_fingerprint: 'mas_default_executor_source_76b3786a207154317d53c958',
        domain_source_fingerprint: '4a0c28ae63dc5d68',
      },
    },
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.identity_binding.status, 'matched');
  assert.deepEqual(preflight.identity_binding.conflict_fields, []);
  assert.equal(
    preflight.identity_binding.payload_identity.domain_source_fingerprint,
    '4a0c28ae63dc5d68',
  );
  assert.equal(
    preflight.identity_binding.target_identity.source_fingerprint,
    'mas_default_executor_source_76b3786a207154317d53c958',
  );
  assert.equal(preflight.identity_binding.payload_identity.source_fingerprint, undefined);
});

test('domain source freshness mismatch still fails closed', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      study_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'stale-domain-source',
      typed_blocker_refs: ['mas://typed-blockers/default-executor-pending'],
    },
    {
      target_identity: {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        source_fingerprint: 'mas_default_executor_source_76b3786a207154317d53c958',
        domain_source_fingerprint: '4a0c28ae63dc5d68',
      },
    },
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.identity_binding.status, 'conflict');
  assert.deepEqual(preflight.identity_binding.conflict_fields, ['domain_source_fingerprint']);
  assert.equal(preflight.can_record_refs_only_receipt, false);
});

test('explicit OPL attempt key still conflicts independently from domain source freshness', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      study_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: '4a0c28ae63dc5d68',
      stage_attempt_source_fingerprint: 'wrong-provider-attempt-key',
      typed_blocker_refs: ['mas://typed-blockers/default-executor-pending'],
    },
    {
      target_identity: {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        source_fingerprint: 'mas_default_executor_source_76b3786a207154317d53c958',
        domain_source_fingerprint: '4a0c28ae63dc5d68',
      },
    },
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.identity_binding.status, 'conflict');
  assert.deepEqual(preflight.identity_binding.conflict_fields, ['source_fingerprint']);
  assert.equal(preflight.can_record_refs_only_receipt, false);
});
