import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasCompleteImmutableArtifactCoverage,
  immutableArtifactRefsFromSnapshotManifest,
} from '../../src/adapters/execution/family-runtime-temporal-workflow-artifact-authority.ts';
import { buildRecoveryWorkflowState } from '../../src/adapters/execution/family-runtime-stage-run-closeout-recovery/workflow-state.ts';
import { runController } from './family-runtime-temporal-stage-run-controller-cases/fixture.ts';

const deckV1Hash = `sha256:${'1'.repeat(64)}`;
const deckV2Hash = `sha256:${'2'.repeat(64)}`;

test('immutable snapshot refs resolve by canonical hash rather than live path', () => {
  const refs = immutableArtifactRefsFromSnapshotManifest({
    surface_kind: 'opl_reviewer_input_snapshot_manifest',
    schema_version: 3,
    members: [{
      member_id: 'member:deck-v1',
      sha256: deckV1Hash,
      size_bytes: 11,
      immutable_ref: {
        kind: 'opl_reviewer_input_snapshot_member',
        ref: 'file:///tmp/immutable/deck-v1.bin',
        size_bytes: 11,
        sha256: deckV1Hash,
      },
    }, {
      member_id: 'member:deck-v2',
      sha256: deckV2Hash,
      size_bytes: 22,
      immutable_ref: {
        kind: 'opl_reviewer_input_snapshot_member',
        ref: 'file:///tmp/immutable/deck-v2.bin',
        size_bytes: 22,
        sha256: deckV2Hash,
      },
    }],
  }, [deckV2Hash.slice('sha256:'.length), `sha256:${'3'.repeat(64)}`]);
  assert.deepEqual(refs.map((entry) => entry.sha256), [deckV2Hash]);
  assert.equal(refs[0]?.immutable_ref.ref, 'file:///tmp/immutable/deck-v2.bin');
});

test('live drift requires complete, unique, self-consistent immutable hash coverage', () => {
  const members = [deckV1Hash, deckV2Hash].map((hash, index) => ({
    member_id: `member:${index}`,
    sha256: hash,
    size_bytes: index + 1,
    immutable_ref: {
      kind: 'opl_reviewer_input_snapshot_member',
      ref: `file:///tmp/immutable/${index}`,
      size_bytes: index + 1,
      sha256: hash,
    },
  }));
  const authorityFor = (manifest: unknown) => ({
    status: 'accepted_by_initial_review' as const,
    authoritative_attempt_ref: 'opl://stage_attempts/producer',
    review_attempt_ref: 'opl://stage_attempts/reviewer',
    quality_round_index: 0,
    immutable_artifact_refs: immutableArtifactRefsFromSnapshotManifest(
      manifest,
      [deckV1Hash, deckV2Hash],
    ),
    live_bytes_status: 'differs' as const,
    read_policy: 'use_immutable_ref_or_verify_sha256' as const,
    pending_repair: null,
  });
  assert.equal(hasCompleteImmutableArtifactCoverage(
    authorityFor({ members }),
    [deckV1Hash, deckV2Hash],
  ), true);
  assert.equal(hasCompleteImmutableArtifactCoverage(
    authorityFor({ members: [members[0]] }),
    [deckV1Hash, deckV2Hash],
  ), false, 'partial coverage must fail closed');
  assert.equal(hasCompleteImmutableArtifactCoverage(
    authorityFor({ members: [members[0], members[0]] }),
    [deckV1Hash],
  ), false, 'duplicate snapshot identities must fail closed');
  assert.equal(hasCompleteImmutableArtifactCoverage(
    authorityFor({ members: [{
      ...members[0],
      immutable_ref: { ...members[0]!.immutable_ref, sha256: deckV1Hash.slice('sha256:'.length) },
    }] }),
    [deckV1Hash],
  ), false, 'member and immutable ref hash notation must agree exactly');
  assert.equal(hasCompleteImmutableArtifactCoverage(
    authorityFor(null),
    [deckV1Hash],
  ), false, 'an empty or quality-debt manifest must fail closed');
});

test('recovery state carries the authoritative set and pending repair without selecting it', () => {
  const authority = {
    status: 'reviewed_with_open_findings' as const,
    authoritative_attempt_ref: 'opl://stage_attempts/sat_producer_0',
    review_attempt_ref: 'opl://stage_attempts/sat_reviewer_0',
    quality_round_index: 0,
    immutable_artifact_refs: [],
    live_bytes_status: 'unknown' as const,
    read_policy: 'use_immutable_ref_or_verify_sha256' as const,
    pending_repair: {
      attempt_ref: 'opl://stage_attempts/sat_repairer_1',
      quality_round_index: 1,
      artifact_refs: ['artifact:pending'],
      artifact_hashes: ['sha256:pending'],
      artifact_identity_receipt_refs: ['receipt:pending'],
      disposition: 'unreviewed_repair' as const,
    },
  };
  const state = buildRecoveryWorkflowState({
    attemptSummary: {
      attempt_role: 'repairer',
      quality_round_index: 1,
      stage_attempt_id: 'sat_repairer_1',
      workflow_id: 'wf_repairer_1',
      execution_session_ref: 'codex://threads/repairer-1',
      artifact_producer_attempt_ref: 'opl://stage_attempts/sat_producer_0',
      status: 'completed',
      artifact_refs: ['artifact:pending'],
      artifact_hashes: ['sha256:pending'],
      artifact_identity_receipt_refs: ['receipt:pending'],
      total_tokens_observed: null,
    },
    launch: {
      stage_run_id: 'stage-run:authority',
      workflow_id: 'workflow:authority',
      domain_id: 'redcube',
      stage_id: 'artifact_creation',
    },
    cycle: { quality_cycle_id: 'quality-cycle:authority', state: {} },
    priorAttemptSummaries: [],
    findings: [],
    artifactRefs: ['artifact:reviewed'],
    artifactHashes: ['sha256:reviewed'],
    artifactIdentityReceiptRefs: ['receipt:reviewed'],
    artifactIdentityAuthority: authority,
    routeRecommendation: null,
  });
  assert.deepEqual(state.artifact_refs, ['artifact:reviewed']);
  assert.deepEqual(state.artifact_identity_authority?.pending_repair?.artifact_refs, ['artifact:pending']);
  assert.notDeepEqual(state.artifact_refs, ['artifact:pending']);
});

test('accepted re-review switches terminal authority to the repaired artifact', async () => {
  const { state, routeInputs } = await runController({
    id: 'artifact-authority-accept',
    closeFindingAfterRound: 1,
  });
  assert.equal(state.status, 'completed');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.artifact_identity_authority?.status, 'accepted_by_re_review');
  assert.equal(state.artifact_identity_authority?.pending_repair, null);
  assert.equal(
    state.artifact_identity_authority?.authoritative_attempt_ref,
    `opl://stage_attempts/${state.attempts[2]?.stage_attempt_id}`,
  );
  assert.equal(
    state.artifact_identity_authority?.review_attempt_ref,
    `opl://stage_attempts/${state.attempts[3]?.stage_attempt_id}`,
  );
  assert.deepEqual(
    state.artifact_identity_authority?.immutable_artifact_refs.map((entry) => entry.sha256),
    ['sha256:deck-v2'],
  );
  assert.equal(state.artifact_identity_authority?.live_bytes_status, 'matches');
  assert.deepEqual(routeInputs[0]?.artifact_refs, ['artifact:deck-v2']);
  assert.deepEqual(routeInputs[0]?.artifact_hashes, ['sha256:deck-v2']);
});

test('accepted re-review quality debt keeps the repaired authority', async () => {
  const { state } = await runController({
    id: 'artifact-authority-quality-debt',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'quality_debt',
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.artifact_identity_authority?.status, 'reviewed_with_quality_debt');
  assert.equal(state.artifact_identity_authority?.pending_repair, null);
  assert.notEqual(state.selected_stage_route, null);
});

test('budget-exhausted re-review repair_required keeps reviewed repaired bytes', async () => {
  const { state } = await runController({
    id: 'artifact-authority-budget',
    closeFindingAfterRound: null,
    reReviewerOutcome: 'repair_required',
    maxRepairRounds: 1,
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.artifact_identity_authority?.status, 'reviewed_with_open_findings');
  assert.equal(state.artifact_identity_authority?.pending_repair, null);
  assert.notEqual(state.selected_stage_route, null);
});

test('re-review hard stop keeps the repaired set it reviewed but drops the route', async () => {
  const { state, routeInputs } = await runController({
    id: 'artifact-authority-blocked',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'blocked',
  });
  assert.equal(state.status, 'blocked');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.artifact_identity_authority?.status, 'hard_stopped');
  assert.equal(state.artifact_identity_authority?.pending_repair, null);
  assert.equal(state.selected_stage_route, null);
  assert.equal(routeInputs.length, 0);
});

test('re-review that never runs keeps the previous reviewed set and records pending repair', async () => {
  const { state, routeInputs } = await runController({
    id: 'artifact-authority-pending',
    closeFindingAfterRound: 1,
    failRole: 're_reviewer',
    liveBytesStatus: 'differs',
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.deepEqual(state.artifact_hashes, ['sha256:deck-v1']);
  assert.equal(state.artifact_identity_authority?.status, 'reviewed_with_open_findings');
  assert.equal(state.artifact_identity_authority?.live_bytes_status, 'differs');
  assert.deepEqual(
    state.artifact_identity_authority?.immutable_artifact_refs.map((entry) => entry.sha256),
    ['sha256:deck-v1'],
  );
  assert.equal(state.artifact_identity_authority?.pending_repair?.disposition, 're_review_did_not_run');
  assert.deepEqual(state.artifact_identity_authority?.pending_repair?.artifact_refs, ['artifact:deck-v2']);
  assert.equal(
    state.artifact_identity_authority?.pending_repair?.attempt_ref,
    `opl://stage_attempts/${state.attempts[2]?.stage_attempt_id}`,
  );
  assert.equal(state.selected_stage_route, null);
  assert.equal(routeInputs.length, 0);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('repair_artifact_unreviewed')));
});

test('max=0 initial repair_required keeps producer authority and the reviewer route', async () => {
  const { state, attempts } = await runController({
    id: 'artifact-authority-zero-budget',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'repair_required',
    maxRepairRounds: 0,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.artifact_identity_authority?.status, 'reviewed_with_open_findings');
  assert.equal(state.artifact_identity_authority?.pending_repair, null);
  assert.equal(
    state.artifact_identity_authority?.authoritative_attempt_ref,
    `opl://stage_attempts/${state.attempts[0]?.stage_attempt_id}`,
  );
  assert.notEqual(state.selected_stage_route, null);
});

test('live drift without immutable snapshot bytes fails closed as blocked', async () => {
  const { state, routeInputs } = await runController({
    id: 'artifact-authority-unreadable',
    closeFindingAfterRound: 1,
    liveBytesStatus: 'differs',
    reviewInputSnapshotStatus: 'quality_debt',
  });
  assert.equal(state.status, 'blocked');
  assert.equal(state.blocked_reason, 'accepted_artifact_immutable_snapshot_missing');
  assert.equal(state.hard_stop_class, 'stale_or_mismatched_stage_identity');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.artifact_identity_authority?.live_bytes_status, 'differs');
  assert.deepEqual(state.artifact_identity_authority?.immutable_artifact_refs, []);
  assert.equal(state.selected_stage_route, null);
  assert.equal(routeInputs.length, 0);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('accepted_artifact_immutable_snapshot_missing')));
});

for (const mode of ['duplicate', 'hash_notation_mismatch'] as const) {
  test(`live drift with ${mode} immutable snapshots fails closed`, async () => {
    const { state, routeInputs } = await runController({
      id: `artifact-authority-${mode}`,
      closeFindingAfterRound: 1,
      liveBytesStatus: 'differs',
      reviewInputSnapshotManifestMode: mode,
    });
    assert.equal(state.status, 'blocked');
    assert.equal(state.blocked_reason, 'accepted_artifact_immutable_snapshot_missing');
    assert.equal(state.selected_stage_route, null);
    assert.equal(routeInputs.length, 0);
  });
}

test('a uniquely reconstructable pre-B2 repairer resume starts with reviewed authority and repairer pending', async () => {
  const { state, attempts } = await runController({
    id: 'artifact-authority-legacy-repairer-resume',
    closeFindingAfterRound: 1,
    acceptedRepairerResume: true,
    legacyRepairerResume: true,
    failRole: 're_reviewer',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['re_reviewer']);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.deepEqual(state.artifact_identity_authority?.pending_repair?.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.artifact_identity_authority?.authoritative_attempt_ref,
    'opl://stage_attempts/sat_artifact-authority-legacy-repairer-resume_producer_0');
  assert.equal(state.selected_stage_route, null);
});

test('recovery after repairer treats repaired bytes as re-review input, not selected identity', async () => {
  const { state, attempts } = await runController({
    id: 'artifact-authority-recovery-pending',
    closeFindingAfterRound: 1,
    acceptedRepairerResume: true,
    failRole: 're_reviewer',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['re_reviewer']);
  assert.deepEqual(attempts[0]?.artifact_refs, ['artifact:deck-v2']);
  assert.equal(
    attempts[0]?.parent_attempt_ref,
    'opl://stage_attempts/sat_artifact-authority-recovery-pending_repairer_1',
  );
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.artifact_identity_authority?.status, 'reviewed_with_open_findings');
  assert.equal(state.artifact_identity_authority?.pending_repair?.disposition, 're_review_did_not_run');
  assert.deepEqual(state.artifact_identity_authority?.pending_repair?.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.selected_stage_route, null);
});
