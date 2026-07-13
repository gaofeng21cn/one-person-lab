import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDomainDispatchEvidencePayloadReady,
  preflightDomainDispatchEvidencePayload,
} from '../../src/modules/ledger/domain-dispatch-evidence-payload-preflight.ts';
import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';

test('readable artifact ref records progress without owner receipt or typed blocker', () => {
  const preflight = assertDomainDispatchEvidencePayloadReady({}, {
    artifact_refs: ['mas://paper/negative-analysis-draft'],
  });

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'progress_refs_path');
  assert.equal(preflight.progress_path_ready, true);
  assert.equal(preflight.accepted_payload_paths.progress_refs_path.next_declared_stage_may_start, true);
  assert.equal(preflight.accepted_payload_paths.progress_refs_path.records_quality_debt, true);
  assert.equal(preflight.accepted_ref_counts.progress_artifact_refs, 1);
});

test('diagnostic and negative-result refs are progress artifacts', () => {
  const preflight = preflightDomainDispatchEvidencePayload({
    diagnostic_refs: ['mas://analysis/nonconvergence-diagnostic'],
    negative_result_refs: ['mas://analysis/null-result'],
  });

  assert.equal(preflight.can_record_refs_only_receipt, true);
  assert.equal(preflight.selected_payload_path, 'progress_refs_path');
  assert.equal(preflight.accepted_ref_counts.progress_artifact_refs, 2);
});

test('missing transport identity is advisory and never blocks progress recording', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    { artifact_refs: ['rca://deck/page-draft'] },
    {
      target_identity: {
        stage_run_id: 'stage-run:rca:author-page',
        source_fingerprint: 'sha256:current',
        idempotency_key: 'idem-current',
        provider_attempt_ref: 'temporal://attempt/current',
      },
    },
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.identity_binding.status, 'payload_identity_not_provided');
  assert.deepEqual(preflight.identity_binding.missing_transport_identity_fields, [
    'stage_run_id',
    'source_fingerprint',
    'idempotency_key',
    'provider_attempt_ref',
  ]);
  assert.equal(
    preflight.identity_binding.policy,
    'identity_conflict_blocks_wrong_target_mutation_missing_transport_identity_is_advisory_only',
  );
});

test('conflicting identity blocks wrong-target mutation', () => {
  assert.throws(
    () => assertDomainDispatchEvidencePayloadReady(
      {
        target_identity: {
          domain_id: 'rca',
          stage_attempt_id: 'sat-current',
          source_fingerprint: 'sha256:current',
        },
      },
      {
        domain_id: 'mas',
        stage_attempt_id: 'sat-stale',
        source_fingerprint: 'sha256:stale',
        artifact_refs: ['mas://artifact/stale'],
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.error_kind, 'domain_dispatch_evidence_receipt_conflict');
      return true;
    },
  );
});

test('quality receipt and typed blocker remain valid evidence paths without ready authority', () => {
  const quality = preflightDomainDispatchEvidencePayload({
    domain_receipt_refs: ['mag://quality/owner-receipt'],
  });
  const blocker = preflightDomainDispatchEvidencePayload({
    typed_blocker_refs: ['mag://blocker/permission'],
  });

  assert.equal(quality.selected_payload_path, 'success_refs_path');
  assert.equal(quality.accepted_payload_paths.success_refs_path.can_claim_domain_ready, false);
  assert.equal(blocker.selected_payload_path, 'typed_blocker_path');
  assert.equal(blocker.accepted_payload_paths.typed_blocker_path.success_claimed, false);
});
