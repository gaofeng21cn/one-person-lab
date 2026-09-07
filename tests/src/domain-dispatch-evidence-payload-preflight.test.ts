import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertDomainDispatchEvidencePayloadReady,
  preflightDomainDispatchEvidencePayload,
} from '../../src/authority/evidence/domain-dispatch-evidence-payload-preflight.ts';
import { FrameworkContractError } from '../../src/authority/contracts/contracts.ts';

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

test('every declared target identity field rejects a mismatched domain payload', () => {
  for (const field of ['study_id', 'grant_run_id', 'book_id', 'work_item_id', 'custom_case_key']) {
    const route = { target_identity: { domain_id: 'fixture', [field]: 'expected' } };
    const mismatch = preflightDomainDispatchEvidencePayload({
      domain_id: 'fixture', [field]: 'different', artifact_refs: ['fixture://artifact'],
    }, route);
    assert.equal(mismatch.status, 'blocked', field);
    assert.deepEqual(mismatch.identity_binding.conflict_fields, [field]);
    const match = preflightDomainDispatchEvidencePayload({
      domain_id: 'fixture', [field]: 'expected', artifact_refs: ['fixture://artifact'],
    }, route);
    assert.equal(match.status, 'ready_to_record', field);
  }
});

test('a matching payload cannot mask a conflicting local owner reference', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-evidence-identity-'));
  try {
    fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({ book_id: 'expected' }));
    fs.writeFileSync(path.join(root, 'wrong.json'), JSON.stringify({ book_id: 'different' }));
    const preflight = preflightDomainDispatchEvidencePayload({
      book_id: 'expected', domain_receipt_refs: ['current.json', 'wrong.json'],
    }, { workspace_root: root, target_identity: { book_id: 'expected' } });
    assert.equal(preflight.status, 'blocked');
    assert.deepEqual(preflight.identity_binding.conflict_fields, ['book_id']);
    assert.ok(preflight.identity_conflicts.some((conflict) => conflict.payload_value === 'different'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('body and readiness claims are forbidden in any domain result collection', () => {
  const preflight = preflightDomainDispatchEvidencePayload({
    artifact_refs: ['fixture://draft'],
    grant_results: [{ body_included: true, readiness_claims: { submission_ready: true } }],
  });
  assert.equal(preflight.status, 'blocked');
  assert.deepEqual(preflight.forbidden_payload_authority_claims.map((claim) => claim.path), [
    'grant_results[0].body_included', 'grant_results[0].readiness_claims.submission_ready',
  ]);
});

test('local receipts bind source fingerprints using the same domain and attempt distinction as payloads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-evidence-source-'));
  try {
    const receipt = path.join(root, 'source.json');
    fs.writeFileSync(receipt, JSON.stringify({ source_fingerprint: 'domain-current' }));
    const route = { workspace_root: root, target_identity: {
      source_fingerprint: 'attempt-current', domain_source_fingerprint: 'domain-current',
    } };
    const payload = { source_fingerprint: 'domain-current', stage_attempt_source_fingerprint: 'attempt-current',
      domain_receipt_refs: ['source.json'] };
    assert.equal(preflightDomainDispatchEvidencePayload(payload, route).status, 'ready_to_record');
    fs.writeFileSync(receipt, JSON.stringify({ source_fingerprint: 'domain-stale' }));
    const mismatch = preflightDomainDispatchEvidencePayload(payload, route);
    assert.equal(mismatch.status, 'blocked');
    assert.ok(mismatch.identity_binding.conflict_fields.includes('domain_source_fingerprint'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
