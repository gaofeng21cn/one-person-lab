import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { requireTemporalStageRunRecoveryResume } from '../../src/adapters/execution/family-runtime-temporal-recovery.ts';
import { validateWorkflowStageRunInput } from '../../src/adapters/execution/family-runtime-temporal-workflow-ingress.ts';
import { stageRunQualityCycleId } from '../../src/adapters/execution/family-runtime-temporal-workflow-values.ts';
import {
  artifactIdentityAuthorityFromReviewReceipt,
  artifactIdentityAuthorityWithPendingRepair,
  producerArtifactIdentityAuthority,
  resolveRecoveryArtifactAuthority,
} from '../../src/adapters/execution/family-runtime-temporal-workflow-artifact-authority.ts';

const H1 = `sha256:${'1'.repeat(64)}`;
const H2 = `sha256:${'2'.repeat(64)}`;
const H3 = `sha256:${'3'.repeat(64)}`;
const reviewedIdentity = {
  artifact_refs: ['artifact:deck-v1-a', 'artifact:deck-v1-b'],
  artifact_hashes: [H1, H2],
  artifact_identity_receipt_refs: ['receipt:deck-v1-a', 'receipt:deck-v1-b'],
};
const repairedIdentity = {
  artifact_refs: ['artifact:deck-v2-a', 'artifact:deck-v2-b'],
  artifact_hashes: [H2, H3],
  artifact_identity_receipt_refs: ['receipt:deck-v2-a', 'receipt:deck-v2-b'],
};
const producerRef = 'opl://stage_attempts/sat_matrix_producer_0';
const reviewerRef = 'opl://stage_attempts/sat_matrix_reviewer_0';
const repairerRef = 'opl://stage_attempts/sat_matrix_repairer_1';

function immutableRef(hash: string, suffix: string) {
  return {
    sha256: hash,
    member_id: `member:${suffix}`,
    size_bytes: 1,
    immutable_ref: {
      kind: 'opl_reviewer_input_snapshot_member',
      ref: `file:///tmp/${suffix}`,
      size_bytes: 1,
      sha256: hash,
    },
  };
}

function fixture(role: 'producer' | 'reviewer' | 'repairer') {
  const base: any = {
    stage_run_id: `stage-run:matrix-${role}`,
    stage_run_invocation_id: `inv:matrix-${role}`,
    stage_run_spec_sha256: `sha256:${'a'.repeat(64)}`,
    stage_run_spec: {},
    parent_route_decision_ref: null,
    workflow_id: `workflow:matrix-${role}`,
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
    stage_attempt_id: 'sat_matrix_producer_0',
    workflow_id: 'wf:matrix-producer',
    execution_session_ref: 'codex://threads/matrix-producer',
    artifact_producer_attempt_ref: null,
    status: 'completed',
    ...reviewedIdentity,
    total_tokens_observed: null,
  };
  const reviewer = {
    ...producer,
    attempt_role: 'reviewer',
    stage_attempt_id: 'sat_matrix_reviewer_0',
    workflow_id: 'wf:matrix-reviewer',
    execution_session_ref: 'codex://threads/matrix-reviewer',
    artifact_producer_attempt_ref: producerRef,
  };
  const repairer = {
    ...producer,
    attempt_role: 'repairer',
    quality_round_index: 1,
    stage_attempt_id: 'sat_matrix_repairer_1',
    workflow_id: 'wf:matrix-repairer',
    execution_session_ref: 'codex://threads/matrix-repairer',
    artifact_producer_attempt_ref: producerRef,
    ...repairedIdentity,
  };
  const findings = [{
    finding_id: 'F1',
    severity: 'critical',
    required: true,
    evidence_refs: ['evidence:F1'],
    repair_expectation: 'Repair it.',
  }];
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
      members: [immutableRef(H1, 'deck-v1-a'), immutableRef(H2, 'deck-v1-b')],
    },
    revision_transport: {
      surface_kind: 'opl_revision_transport',
      opl_revision_intake_ref: { kind: 'opl_revision_intake', ref: 'intake:matrix' },
      opl_stage_review_receipt_ref: { kind: 'opl_stage_review_receipt', ref: 'receipt:matrix' },
    },
    finding_lineage: {
      findings_sha256: `sha256:${crypto.createHash('sha256').update(canonicalJsonText(findings)).digest('hex')}`,
    },
  };
  const recovery: any = {
    surface_kind: 'opl_stage_run_recovery_resume',
    version: 'opl-stage-run-recovery-resume.v1',
    recovery_id: `recovery:matrix-${role}`,
    quality_cycle_id: stageRunQualityCycleId(base),
    ...reviewedIdentity,
    quality_debt_refs: [],
    route_quality_debt_refs: [],
  };
  if (role === 'producer') {
    Object.assign(recovery, {
      producer_attempt_ref: producerRef,
      producer_attempt_summary: producer,
      prior_attempt_summaries: [producer],
      repair_rounds_used: 0,
      artifact_identity_authority: producerArtifactIdentityAuthority({ attemptRef: producerRef }),
    });
  } else {
    Object.assign(recovery, {
      resume_after_role: role,
      reviewer_attempt_ref: reviewerRef,
      artifact_producer_attempt_ref: role === 'repairer' ? repairerRef : producerRef,
      artifact_producer_attempt_summary: role === 'repairer' ? repairer : producer,
      prior_attempt_summaries: role === 'repairer' ? [producer, reviewer, repairer] : [producer, reviewer],
      findings,
      repair_map: role === 'repairer' ? [{
        finding_id: 'F1',
        repair_status: 'repaired',
        changed_artifact_refs: repairedIdentity.artifact_refs,
        repair_evidence_refs: ['evidence:repair'],
      }] : [],
      review_receipts: [receipt],
      repair_rounds_used: role === 'repairer' ? 1 : 0,
    });
    const reviewedAuthority = artifactIdentityAuthorityFromReviewReceipt({
      receipt,
      status: 'reviewed_with_open_findings',
      qualityRoundIndex: 0,
    });
    recovery.artifact_identity_authority = role === 'reviewer'
      ? reviewedAuthority
      : artifactIdentityAuthorityWithPendingRepair(reviewedAuthority, {
          attempt_ref: repairerRef,
          quality_round_index: 1,
          ...repairedIdentity,
          disposition: 'unreviewed_repair',
        }, producerRef);
  }
  return {
    input: { ...base, recovery_resume: recovery },
    recovery,
    producer,
    reviewer,
    repairer,
    receipt,
  };
}

function legacyFixture(role: 'producer' | 'reviewer' | 'repairer') {
  const value = fixture(role);
  delete value.recovery.artifact_identity_authority;
  if (role === 'repairer') Object.assign(value.recovery, repairedIdentity);
  return value;
}

function outcomes(input: any) {
  return [
    () => validateWorkflowStageRunInput(input),
    () => requireTemporalStageRunRecoveryResume(input),
  ];
}

function assertAccepted(input: any) {
  for (const validate of outcomes(input)) assert.doesNotThrow(validate);
}

function assertRejected(input: any, failureCode: string) {
  for (const validate of outcomes(input)) {
    assert.throws(validate, (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.details?.failure_code, failureCode);
      return true;
    });
  }
}

for (const role of ['producer', 'reviewer', 'repairer'] as const) {
  test(`${role}: canonical and legacy recovery derive the same authority`, () => {
    const canonical = fixture(role);
    const legacy = legacyFixture(role);
    assertAccepted(canonical.input);
    assertAccepted(legacy.input);
    const canonicalResolved = resolveRecoveryArtifactAuthority(canonical.recovery, { maxRepairRounds: 1 })!;
    const legacyResolved = resolveRecoveryArtifactAuthority(legacy.recovery, { maxRepairRounds: 1 })!;
    assert.deepEqual(legacyResolved, canonicalResolved);
    assert.equal(canonicalResolved.artifact_identity_authority.live_bytes_status, 'unknown');
  });

  test(`${role}: every persisted authority field except live observation is typed-compared`, () => {
    for (const mutation of [
      'immutable',
      'status',
      'round',
      'authoritative_ref',
      'review_ref',
      'read_policy',
      'pending',
    ] as const) {
      const value = fixture(role);
      const authority = value.recovery.artifact_identity_authority;
      if (mutation === 'immutable') {
        authority.immutable_artifact_refs = [immutableRef(H1, 'forged')];
      }
      if (mutation === 'status') authority.status = 'hard_stopped';
      if (mutation === 'round') authority.quality_round_index = 99;
      if (mutation === 'authoritative_ref') authority.authoritative_attempt_ref = 'opl://stage_attempts/forged';
      if (mutation === 'review_ref') authority.review_attempt_ref = 'opl://stage_attempts/forged';
      if (mutation === 'read_policy') authority.read_policy = 'forged_policy';
      if (mutation === 'pending' && role === 'repairer') {
        authority.pending_repair.disposition = 're_review_did_not_run';
      } else if (mutation === 'pending') {
        authority.pending_repair = {
          attempt_ref: repairerRef,
          quality_round_index: 1,
          ...repairedIdentity,
          disposition: 'unreviewed_repair',
        };
      }
      assertRejected(value.input, 'stage_run_recovery_artifact_authority_mismatch');
    }
  });

  test(`${role}: missing and duplicate required lineage are typed rejects`, () => {
    const missing = fixture(role);
    if (role === 'producer') missing.recovery.prior_attempt_summaries = [];
    else missing.recovery.prior_attempt_summaries.splice(1, 1);
    if (role === 'producer') {
      // An absent producer summary is invalid; an absent optional prior list is
      // the supported legacy producer payload and is covered above.
      delete missing.recovery.producer_attempt_summary;
    }
    for (const validate of outcomes(missing.input)) {
      assert.throws(validate, (error: unknown) => error instanceof FrameworkContractError);
    }

    const duplicate = fixture(role);
    duplicate.recovery.prior_attempt_summaries.push(
      structuredClone(duplicate.recovery.prior_attempt_summaries[0]),
    );
    assertRejected(duplicate.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');
  });

  test(`${role}: top-level identity and repair budget cannot drift`, () => {
    const identity = fixture(role);
    for (const field of [
      'artifact_refs',
      'artifact_hashes',
      'artifact_identity_receipt_refs',
    ]) identity.recovery[field] = [...identity.recovery[field]].reverse();
    assertRejected(identity.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');

    const budget = fixture(role);
    budget.recovery.repair_rounds_used = role === 'repairer' ? 0 : 1;
    assertRejected(budget.input, 'stage_run_recovery_repair_lineage_invalid');
  });

  test(`${role}: persisted live byte status is never trusted`, () => {
    const value = fixture(role);
    value.recovery.artifact_identity_authority.live_bytes_status = 'matches';
    value.recovery.artifact_identity_authority.extra_uncompared_field = 'must_not_propagate';
    assertAccepted(value.input);
    const resolved = resolveRecoveryArtifactAuthority(value.recovery, { maxRepairRounds: 1 })!;
    assert.equal(resolved.artifact_identity_authority.live_bytes_status, 'unknown');
    assert.equal('extra_uncompared_field' in resolved.artifact_identity_authority, false);
  });
}

for (const role of ['reviewer', 'repairer'] as const) {
  test(`${role}: immutable refs compare as a hash-keyed set`, () => {
    const reordered = fixture(role);
    reordered.recovery.artifact_identity_authority.immutable_artifact_refs.reverse();
    assertAccepted(reordered.input);
    const resolved = resolveRecoveryArtifactAuthority(reordered.recovery, { maxRepairRounds: 1 })!;
    assert.deepEqual(
      resolved.artifact_identity_authority.immutable_artifact_refs.map((ref) => ref.sha256),
      [H1, H2],
    );

    for (const mutation of ['duplicate', 'missing', 'extra', 'internal'] as const) {
      const value = fixture(role);
      const refs = value.recovery.artifact_identity_authority.immutable_artifact_refs;
      if (mutation === 'duplicate') refs.push(structuredClone(refs[0]));
      if (mutation === 'missing') refs.pop();
      if (mutation === 'extra') refs.push(immutableRef(H3, 'extra'));
      if (mutation === 'internal') refs[0].immutable_ref.size_bytes = 2;
      assertRejected(value.input, 'stage_run_recovery_artifact_authority_mismatch');
    }
  });
}

test('retry-reviewer producer representation derives producer_unreviewed without a decisive receipt', () => {
  const value = fixture('producer');
  value.recovery.prior_attempt_summaries.push({
    ...value.reviewer,
    status: 'blocked',
    stage_attempt_id: 'sat_matrix_blocked_reviewer_0',
  });
  delete value.recovery.review_receipts;
  assertAccepted(value.input);
  const resolved = resolveRecoveryArtifactAuthority(value.recovery, { maxRepairRounds: 1 })!;
  assert.equal(resolved.artifact_identity_authority.status, 'producer_unreviewed');
  assert.equal(resolved.artifact_identity_authority.review_attempt_ref, null);
  assert.equal(resolved.artifact_identity_authority.pending_repair, null);
});

const secondRepairedIdentity = {
  artifact_refs: ['artifact:deck-v3-a', 'artifact:deck-v3-b'],
  artifact_hashes: [H3, H1],
  artifact_identity_receipt_refs: ['receipt:deck-v3-a', 'receipt:deck-v3-b'],
};

function multiRoundRepairerFixture() {
  const value = fixture('repairer');
  value.input.quality_policy.formal_review.max_repair_rounds = 2;
  const firstReReviewer = {
    ...value.repairer,
    attempt_role: 're_reviewer',
    stage_attempt_id: 'sat_matrix_re_reviewer_1',
    workflow_id: 'wf:matrix-re-reviewer-1',
    execution_session_ref: 'codex://threads/matrix-re-reviewer-1',
    artifact_producer_attempt_ref: repairerRef,
  };
  const secondRepairerRef = 'opl://stage_attempts/sat_matrix_repairer_2';
  const secondRepairer = {
    ...value.repairer,
    quality_round_index: 2,
    stage_attempt_id: 'sat_matrix_repairer_2',
    workflow_id: 'wf:matrix-repairer-2',
    execution_session_ref: 'codex://threads/matrix-repairer-2',
    artifact_producer_attempt_ref: repairerRef,
    ...secondRepairedIdentity,
  };
  const firstReReviewReceipt = {
    ...structuredClone(value.receipt),
    producer_attempt_ref: repairerRef,
    reviewer_attempt_ref: 'opl://stage_attempts/sat_matrix_re_reviewer_1',
    reviewed_artifact_refs: repairedIdentity.artifact_refs,
    reviewed_artifact_hashes: repairedIdentity.artifact_hashes,
    opl_reviewer_input_snapshot_manifest: {
      members: [immutableRef(H2, 'deck-v2-a'), immutableRef(H3, 'deck-v2-b')],
    },
    revision_transport: {
      surface_kind: 'opl_revision_transport',
      opl_revision_intake_ref: { kind: 'opl_revision_intake', ref: 'intake:matrix-r1' },
      opl_stage_review_receipt_ref: { kind: 'opl_stage_review_receipt', ref: 'receipt:matrix-r1' },
    },
  };
  const reviewedAuthority = artifactIdentityAuthorityFromReviewReceipt({
    receipt: firstReReviewReceipt,
    status: 'reviewed_with_open_findings',
    qualityRoundIndex: 1,
  });
  Object.assign(value.recovery, {
    artifact_producer_attempt_ref: secondRepairerRef,
    artifact_producer_attempt_summary: secondRepairer,
    prior_attempt_summaries: [
      value.producer,
      value.reviewer,
      value.repairer,
      firstReReviewer,
      secondRepairer,
    ],
    review_receipts: [value.receipt, firstReReviewReceipt],
    repair_rounds_used: 2,
    artifact_refs: repairedIdentity.artifact_refs,
    artifact_hashes: repairedIdentity.artifact_hashes,
    artifact_identity_receipt_refs: repairedIdentity.artifact_identity_receipt_refs,
    artifact_identity_authority: artifactIdentityAuthorityWithPendingRepair(reviewedAuthority, {
      attempt_ref: secondRepairerRef,
      quality_round_index: 2,
      ...secondRepairedIdentity,
      disposition: 'unreviewed_repair',
    }, repairerRef),
  });
  value.recovery.repair_map[0].changed_artifact_refs = secondRepairedIdentity.artifact_refs;
  return { ...value, secondRepairer, firstReReviewer, firstReReviewReceipt };
}

test('multi-round repairer canonical and legacy histories preserve every review and pending repair', () => {
  const canonical = multiRoundRepairerFixture();
  assertAccepted(canonical.input);
  const resolved = resolveRecoveryArtifactAuthority(canonical.recovery, { maxRepairRounds: 2 })!;
  assert.equal(resolved.artifact_identity_authority.quality_round_index, 1);
  assert.equal(resolved.artifact_identity_authority.review_attempt_ref, firstReReviewerRef());
  assert.equal(resolved.artifact_identity_authority.pending_repair?.quality_round_index, 2);
  assert.deepEqual(resolved.artifact_refs, repairedIdentity.artifact_refs);

  const legacy = multiRoundRepairerFixture();
  delete legacy.recovery.artifact_identity_authority;
  Object.assign(legacy.recovery, secondRepairedIdentity);
  assertAccepted(legacy.input);
  assert.deepEqual(
    resolveRecoveryArtifactAuthority(legacy.recovery, { maxRepairRounds: 2 }),
    resolved,
  );
});

function firstReReviewerRef() {
  return 'opl://stage_attempts/sat_matrix_re_reviewer_1';
}

function permutations<T>(values: T[]): T[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((tail) => [value, ...tail]));
}

test('short histories reject every non-canonical role permutation', () => {
  let checked = 0;
  for (const make of [() => fixture('reviewer'), () => fixture('repairer')]) {
    const control = make();
    const expected = control.recovery.prior_attempt_summaries.map(
      (attempt: any) => attempt.stage_attempt_id,
    );
    for (const prior of permutations<any>(control.recovery.prior_attempt_summaries)) {
      const value = make();
      value.recovery.prior_attempt_summaries = prior.map((attempt) => structuredClone(attempt));
      const actual = prior.map((attempt) => attempt.stage_attempt_id);
      if (JSON.stringify(actual) === JSON.stringify(expected)) assertAccepted(value.input);
      else assertRejected(value.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');
      checked += 1;
    }
  }
  const multi = multiRoundRepairerFixture();
  const expected = multi.recovery.prior_attempt_summaries.map(
    (attempt: any) => attempt.stage_attempt_id,
  );
  for (const prior of permutations<any>(multi.recovery.prior_attempt_summaries)) {
    const value = multiRoundRepairerFixture();
    value.recovery.prior_attempt_summaries = prior.map((attempt) => structuredClone(attempt));
    const actual = prior.map((attempt) => attempt.stage_attempt_id);
    if (JSON.stringify(actual) === JSON.stringify(expected)) assertAccepted(value.input);
    else assertRejected(value.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');
    checked += 1;
  }
  assert.equal(checked, 128);
});

test('every short-history position rejects missing, duplicate, status, parent, and round drift', () => {
  let mutations = 0;
  for (const make of [
    () => fixture('reviewer'),
    () => fixture('repairer'),
    () => multiRoundRepairerFixture(),
  ]) {
    const length = make().recovery.prior_attempt_summaries.length;
    for (let index = 0; index < length; index += 1) {
      for (const mutation of ['missing', 'duplicate', 'status', 'parent', 'round'] as const) {
        const value = make();
        const prior = value.recovery.prior_attempt_summaries;
        if (mutation === 'missing') prior.splice(index, 1);
        if (mutation === 'duplicate') prior.splice(index, 0, structuredClone(prior[index]));
        if (mutation === 'status') prior[index].status = 'failed';
        if (mutation === 'parent') {
          prior[index].artifact_producer_attempt_ref = 'opl://stage_attempts/forged_parent';
        }
        if (mutation === 'round') prior[index].quality_round_index += 1;
        assertRejected(value.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');
        mutations += 1;
      }
    }
  }
  assert.equal(mutations, 50);
});

test('receipt history rejects missing, duplicate, orphan, future, order, verdict, and identity drift', () => {
  const mutationNames = [
    'missing',
    'duplicate',
    'orphan',
    'future',
    'order',
    'verdict',
    'reviewer',
    'producer',
    'reviewed_refs',
    'reviewed_hashes',
    'quality_cycle',
  ] as const;
  let mutations = 0;
  for (const make of [
    () => fixture('reviewer'),
    () => fixture('repairer'),
    () => multiRoundRepairerFixture(),
  ]) {
    for (const mutation of mutationNames) {
      if (mutation === 'order' && make().recovery.review_receipts.length < 2) continue;
      const value = make();
      const receipts = value.recovery.review_receipts;
      if (mutation === 'missing') receipts.pop();
      if (mutation === 'duplicate') receipts.push(structuredClone(receipts[0]));
      if (mutation === 'orphan') receipts.push({
        ...structuredClone(receipts[0]),
        reviewer_attempt_ref: 'opl://stage_attempts/orphan_reviewer',
      });
      if (mutation === 'future') receipts.push({
        ...structuredClone(receipts.at(-1)),
        producer_attempt_ref: value.recovery.artifact_producer_attempt_ref,
        reviewer_attempt_ref: 'opl://stage_attempts/future_reviewer',
      });
      if (mutation === 'order') receipts.reverse();
      if (mutation === 'verdict') receipts[0].verdict = 'pass';
      if (mutation === 'reviewer') receipts[0].reviewer_attempt_ref = 'opl://stage_attempts/forged';
      if (mutation === 'producer') receipts[0].producer_attempt_ref = 'opl://stage_attempts/forged';
      if (mutation === 'reviewed_refs') receipts[0].reviewed_artifact_refs = ['artifact:forged'];
      if (mutation === 'reviewed_hashes') receipts[0].reviewed_artifact_hashes = [H3];
      if (mutation === 'quality_cycle') receipts[0].quality_cycle_id = 'quality-cycle:forged';
      assertRejected(value.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');
      mutations += 1;
    }
  }
  assert.equal(mutations, 31);
});

test('46 direct gaps and missing producer have one typed ingress/launchable classification', () => {
  const completedReviewer = fixture('producer');
  completedReviewer.recovery.prior_attempt_summaries.push(completedReviewer.reviewer);
  completedReviewer.recovery.review_receipts = [completedReviewer.receipt];
  assertRejected(completedReviewer.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');

  const repairerAsProducer = fixture('producer');
  repairerAsProducer.recovery.prior_attempt_summaries.push(
    completedReviewer.reviewer,
    repairerAsProducer.repairer,
  );
  repairerAsProducer.recovery.review_receipts = [repairerAsProducer.receipt];
  assertRejected(repairerAsProducer.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');

  const retryWithReceipt = fixture('producer');
  retryWithReceipt.recovery.prior_attempt_summaries.push({
    ...retryWithReceipt.reviewer,
    stage_attempt_id: 'sat_matrix_blocked_with_receipt_0',
    status: 'blocked',
  });
  retryWithReceipt.recovery.review_receipts = [retryWithReceipt.receipt];
  assertRejected(retryWithReceipt.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');

  const reviewerParent = fixture('repairer');
  reviewerParent.recovery.prior_attempt_summaries[1].artifact_producer_attempt_ref =
    'opl://stage_attempts/forged_parent';
  assertRejected(reviewerParent.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');

  const reviewerWithRepairer = fixture('reviewer');
  reviewerWithRepairer.recovery.prior_attempt_summaries.splice(1, 0, reviewerWithRepairer.repairer);
  assertRejected(reviewerWithRepairer.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');

  const missingProducer = fixture('producer');
  delete missingProducer.recovery.producer_attempt_summary;
  assertRejected(missingProducer.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');
});

test('retry reviewer accepts repeated blocked attempts but rejects every decisive or future role', () => {
  const control = fixture('producer');
  control.recovery.prior_attempt_summaries.push(
    {
      ...control.reviewer,
      stage_attempt_id: 'sat_matrix_blocked_reviewer_a',
      status: 'blocked',
    },
    {
      ...control.reviewer,
      stage_attempt_id: 'sat_matrix_blocked_reviewer_b',
      workflow_id: 'wf:matrix-blocked-reviewer-b',
      execution_session_ref: null,
      status: 'blocked',
    },
  );
  assertAccepted(control.input);

  for (const status of ['completed', 'failed'] as const) {
    const value = fixture('producer');
    value.recovery.prior_attempt_summaries.push({ ...value.reviewer, status });
    assertRejected(value.input, 'stage_run_recovery_previous_reviewed_lineage_invalid');
  }
});
