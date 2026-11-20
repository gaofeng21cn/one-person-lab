import assert from 'node:assert/strict';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { validateWorkflowStageRunInput } from '../../src/adapters/execution/family-runtime-temporal-workflow-ingress.ts';
import { stageRunQualityCycleId } from '../../src/adapters/execution/family-runtime-temporal-workflow-values.ts';
import { reconstructRepairerRecoveryArtifactAuthority } from '../../src/adapters/execution/family-runtime-temporal-workflow-artifact-authority.ts';
import { requireTemporalStageRunRecoveryResume } from '../../src/adapters/execution/family-runtime-temporal.ts';

const producerRef = 'opl://stage_attempts/sat_producer_0';
const reviewerRef = 'opl://stage_attempts/sat_reviewer_0';
const repairerRef = 'opl://stage_attempts/sat_repairer_1';
const reviewedIdentity = {
  artifact_refs: ['artifact:deck-v1'],
  artifact_hashes: [`sha256:${'1'.repeat(64)}`],
  artifact_identity_receipt_refs: ['receipt:deck-v1'],
};
const repairerIdentity = {
  artifact_refs: ['artifact:deck-v2'],
  artifact_hashes: [`sha256:${'2'.repeat(64)}`],
  artifact_identity_receipt_refs: ['receipt:deck-v2'],
};

function legacyRecoveryFixture() {
  const base: any = {
    stage_run_id: 'stage-run:old-recovery',
    stage_run_invocation_id: 'inv:1',
    stage_run_spec_sha256: `sha256:${'a'.repeat(64)}`,
    stage_run_spec: {},
    parent_route_decision_ref: null,
    workflow_id: 'workflow:old-recovery',
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
    declared_stage_ids: ['artifact_creation'],
    workspace_locator: {},
    source_fingerprint: null,
    executor_kind: 'codex',
    stage_packet_ref: 'packet:1',
    quality_policy_ref: 'policy:1',
    domain_pack_root: '/tmp/domain-pack',
    stage_manifest_ref: 'manifest:1',
    stage_manifest_sha256: `sha256:${'b'.repeat(64)}`,
    stage_role: 'artifact_creation',
    quality_policy: { formal_review: { required: true, max_repair_rounds: 1 } },
    role_prompt_refs: { producer: 'p', reviewer: 'r', repairer: 'rp', re_reviewer: 'rr' },
    quality_rubric_refs: ['rubric:1'],
    knowledge_refs: [],
    skill_refs: [],
    policy_refs: [],
  };
  const producer = {
    attempt_role: 'producer',
    quality_round_index: 0,
    stage_attempt_id: 'sat_producer_0',
    workflow_id: 'wf:producer',
    execution_session_ref: 'codex://threads/producer',
    artifact_producer_attempt_ref: null,
    status: 'completed',
    ...reviewedIdentity,
    total_tokens_observed: null,
  };
  const reviewer = {
    ...producer,
    attempt_role: 'reviewer',
    stage_attempt_id: 'sat_reviewer_0',
    workflow_id: 'wf:reviewer',
    execution_session_ref: 'codex://threads/reviewer',
    artifact_producer_attempt_ref: producerRef,
  };
  const repairer = {
    ...producer,
    attempt_role: 'repairer',
    quality_round_index: 1,
    stage_attempt_id: 'sat_repairer_1',
    workflow_id: 'wf:repairer',
    execution_session_ref: 'codex://threads/repairer',
    artifact_producer_attempt_ref: producerRef,
    ...repairerIdentity,
  };
  const receipt: any = {
    stage_run_id: base.stage_run_id,
    quality_cycle_id: stageRunQualityCycleId(base),
    producer_attempt_ref: producerRef,
    reviewer_attempt_ref: reviewerRef,
    reviewed_artifact_refs: reviewedIdentity.artifact_refs,
    reviewed_artifact_hashes: reviewedIdentity.artifact_hashes,
    verdict: 'repair_required',
    review_input_snapshot_status: 'materialized',
    opl_reviewer_input_snapshot_manifest: {
      members: [{
        member_id: 'member:reviewed',
        sha256: reviewedIdentity.artifact_hashes[0],
        size_bytes: 1,
        immutable_ref: {
          kind: 'opl_reviewer_input_snapshot_member',
          ref: 'file:///tmp/reviewed',
          size_bytes: 1,
          sha256: reviewedIdentity.artifact_hashes[0],
        },
      }],
    },
  };
  const recovery: any = {
    surface_kind: 'opl_stage_run_recovery_resume',
    version: 'opl-stage-run-recovery-resume.v1',
    recovery_id: 'recovery:1',
    quality_cycle_id: stageRunQualityCycleId(base),
    resume_after_role: 'repairer',
    artifact_producer_attempt_ref: repairerRef,
    artifact_producer_attempt_summary: repairer,
    prior_attempt_summaries: [producer, reviewer, repairer],
    findings: [{
      finding_id: 'F1',
      severity: 'critical',
      required: true,
      evidence_refs: ['evidence:F1'],
      repair_expectation: 'Repair it.',
    }],
    repair_map: [{
      finding_id: 'F1',
      repair_status: 'repaired',
      changed_artifact_refs: repairerIdentity.artifact_refs,
      repair_evidence_refs: ['evidence:repair'],
    }],
    review_receipts: [receipt],
    repair_rounds_used: 1,
    quality_debt_refs: [],
    route_quality_debt_refs: [],
    ...repairerIdentity,
  };
  return { input: { ...base, recovery_resume: recovery }, recovery, producer, reviewer, repairer, receipt };
}

function assertInvalidLineage(input: any) {
  assert.throws(() => validateWorkflowStageRunInput(input), (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    assert.equal(error.details?.failure_code, 'stage_run_recovery_previous_reviewed_lineage_invalid');
    return true;
  });
}

function assertAuthorityMismatch(input: any) {
  assert.throws(() => validateWorkflowStageRunInput(input), (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    assert.equal(error.details?.failure_code, 'stage_run_recovery_artifact_authority_mismatch');
    return true;
  });
}

function explicitRecoveryFixture() {
  const fixture = legacyRecoveryFixture();
  const reconstructed = reconstructRepairerRecoveryArtifactAuthority({
    repairerSummary: fixture.repairer as any,
    priorAttemptSummaries: fixture.recovery.prior_attempt_summaries,
    reviewReceipts: fixture.recovery.review_receipts,
  })!;
  fixture.recovery.artifact_refs = reconstructed.artifact_refs;
  fixture.recovery.artifact_hashes = reconstructed.artifact_hashes;
  fixture.recovery.artifact_identity_receipt_refs = reconstructed.artifact_identity_receipt_refs;
  fixture.recovery.artifact_identity_authority = reconstructed.artifact_identity_authority;
  return fixture;
}

test('legacy replay validation keeps pre-B2 semantics without calling Temporal patched outside a workflow', () => {
  const { input, recovery } = legacyRecoveryFixture();
  recovery.prior_attempt_summaries = [recovery.artifact_producer_attempt_summary];
  recovery.review_receipts = [];
  assert.doesNotThrow(() => validateWorkflowStageRunInput(input, {
    recoveryArtifactIdentityAuthorityRequired: false,
  }));
  assertInvalidLineage(input);
});

test('a new execution uniquely reconstructs reviewed authority and pending repair from a legacy payload', () => {
  const { input, recovery, repairer } = legacyRecoveryFixture();
  assert.doesNotThrow(() => validateWorkflowStageRunInput(input));
  assert.doesNotThrow(() => requireTemporalStageRunRecoveryResume(input));
  const reconstructed = reconstructRepairerRecoveryArtifactAuthority({
    repairerSummary: repairer as any,
    priorAttemptSummaries: recovery.prior_attempt_summaries,
    reviewReceipts: recovery.review_receipts,
  });
  assert.deepEqual(reconstructed?.artifact_refs, reviewedIdentity.artifact_refs);
  assert.deepEqual(reconstructed?.artifact_identity_authority.pending_repair?.artifact_refs,
    repairerIdentity.artifact_refs);
  assert.equal(reconstructed?.artifact_identity_authority.immutable_artifact_refs.length, 1);
  recovery.artifact_refs = reconstructed!.artifact_refs;
  recovery.artifact_hashes = reconstructed!.artifact_hashes;
  recovery.artifact_identity_receipt_refs = reconstructed!.artifact_identity_receipt_refs;
  recovery.artifact_identity_authority = reconstructed!.artifact_identity_authority;
  assert.doesNotThrow(() => validateWorkflowStageRunInput(input));
  assert.doesNotThrow(() => requireTemporalStageRunRecoveryResume(input));
});

for (const invalid of ['missing_receipt', 'ambiguous_receipt', 'mismatched_hash', 'missing_producer', 'missing_reviewer'] as const) {
  test(`legacy repairer recovery fails closed for ${invalid}`, () => {
    const { input, recovery, receipt } = legacyRecoveryFixture();
    if (invalid === 'missing_receipt') recovery.review_receipts = [];
    if (invalid === 'ambiguous_receipt') recovery.review_receipts = [receipt, structuredClone(receipt)];
    if (invalid === 'mismatched_hash') receipt.reviewed_artifact_hashes = repairerIdentity.artifact_hashes;
    if (invalid === 'missing_producer') recovery.prior_attempt_summaries.splice(0, 1);
    if (invalid === 'missing_reviewer') recovery.prior_attempt_summaries.splice(1, 1);
    assertInvalidLineage(input);
    assert.equal(recovery.artifact_identity_authority, undefined);
  });
}

test('explicit B2 authority cannot keep repairer bytes selected or detach pending from the reviewed lineage', () => {
  const { input, recovery, repairer } = legacyRecoveryFixture();
  const reconstructed = reconstructRepairerRecoveryArtifactAuthority({
    repairerSummary: repairer as any,
    priorAttemptSummaries: recovery.prior_attempt_summaries,
    reviewReceipts: recovery.review_receipts,
  })!;
  recovery.artifact_refs = reconstructed.artifact_refs;
  recovery.artifact_hashes = reconstructed.artifact_hashes;
  recovery.artifact_identity_receipt_refs = reconstructed.artifact_identity_receipt_refs;
  recovery.artifact_identity_authority = reconstructed.artifact_identity_authority;
  assert.doesNotThrow(() => validateWorkflowStageRunInput(input));
  recovery.artifact_refs = repairerIdentity.artifact_refs;
  recovery.artifact_hashes = repairerIdentity.artifact_hashes;
  recovery.artifact_identity_receipt_refs = repairerIdentity.artifact_identity_receipt_refs;
  assertInvalidLineage(input);
});

test('a legal explicit B2 repairer authority is accepted only when it equals the receipt-derived authority', () => {
  const { input } = explicitRecoveryFixture();
  assert.doesNotThrow(() => validateWorkflowStageRunInput(input));
  assert.doesNotThrow(() => requireTemporalStageRunRecoveryResume(input));
});

for (const mutation of [
  'forged_immutable',
  'malformed_immutable',
  'arbitrary_status',
  'round_99',
  'pending_round_99',
] as const) {
  test(`explicit B2 authority rejects ${mutation} instead of overriding receipt-derived fields`, () => {
    const { input, recovery } = explicitRecoveryFixture();
    const authority = recovery.artifact_identity_authority;
    if (mutation === 'forged_immutable') {
      authority.immutable_artifact_refs = [{
        sha256: reviewedIdentity.artifact_hashes[0],
        member_id: 'forged:reviewed',
        size_bytes: 1,
        immutable_ref: {
          kind: 'forged_snapshot_member',
          ref: 'file:///tmp/forged-reviewed.bin',
          size_bytes: 1,
          sha256: reviewedIdentity.artifact_hashes[0],
        },
      }];
    }
    if (mutation === 'malformed_immutable') authority.immutable_artifact_refs = [null] as any;
    if (mutation === 'arbitrary_status') authority.status = 'producer_unreviewed';
    if (mutation === 'round_99') authority.quality_round_index = 99;
    if (mutation === 'pending_round_99') authority.pending_repair.quality_round_index = 99;
    assertAuthorityMismatch(input);
    assert.throws(() => requireTemporalStageRunRecoveryResume(input), (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, 'stage_run_recovery_artifact_authority_mismatch');
      return true;
    });
  });
}

test('repairer recovery rejects a skipped repair round', () => {
  const { input, recovery } = legacyRecoveryFixture();
  recovery.artifact_producer_attempt_summary.quality_round_index = 2;
  recovery.repair_rounds_used = 2;
  assertInvalidLineage(input);
});

test('repairer recovery rejects reviewer identity drift from the reviewed artifact identity', () => {
  const { input, recovery } = legacyRecoveryFixture();
  recovery.prior_attempt_summaries[1].artifact_refs = repairerIdentity.artifact_refs;
  recovery.prior_attempt_summaries[1].artifact_hashes = repairerIdentity.artifact_hashes;
  recovery.prior_attempt_summaries[1].artifact_identity_receipt_refs = repairerIdentity.artifact_identity_receipt_refs;
  assertInvalidLineage(input);
});

test('repairer recovery rejects a reviewer round mismatch', () => {
  const { input, recovery } = legacyRecoveryFixture();
  recovery.prior_attempt_summaries[1].quality_round_index = 7;
  assertInvalidLineage(input);
});
