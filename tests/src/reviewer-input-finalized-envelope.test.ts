import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  completeReviewerSnapshotTransportEnvelope,
  resolveReviewerInputSnapshotMaterialization,
} from '../../src/adapters/execution/family-runtime-reviewer-input-snapshot.ts';

function fixture() {
  const source = { kind: 'artifact', ref: 'file:///workspace/source.json', sha256: `sha256:${'1'.repeat(64)}`, size_bytes: 12 };
  const finalized = { kind: 'artifact', ref: 'file:///workspace/generation.json', sha256: `sha256:${'2'.repeat(64)}`, size_bytes: 30 };
  const authority = {
    producer_attempt_ref: 'opl://stage_attempts/sat_test',
    execution_content_binding_sha256: `sha256:${'3'.repeat(64)}`,
    review_lane_binding: 'statistical',
    owner_authority_refs: [source, finalized],
  };
  const request = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
    owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
    execution_content_binding_sha256: authority.execution_content_binding_sha256,
    review_lane: 'statistical', workspace_root: '/workspace',
    members: [{ member_id: 'domain-source', source_ref: source.ref, sha256: source.sha256, size_bytes: source.size_bytes }],
  };
  return { source, finalized, authority, request, artifacts: { refs: [source.ref, finalized.ref], hashes: [source.sha256, finalized.sha256] } };
}

test('finalized records supplement an immutable domain request without changing its scope members', () => {
  const { request, authority, artifacts, finalized } = fixture();
  const original = structuredClone(request);
  const result = completeReviewerSnapshotTransportEnvelope(request, authority, artifacts);
  assert.deepEqual(request, original);
  assert.deepEqual(result.members[0], original.members[0]);
  assert.equal(result.members[1]?.source_ref, finalized.ref);
  assert.deepEqual(result.owner_authority_ref, original.owner_authority_ref);
  assert.deepEqual(completeReviewerSnapshotTransportEnvelope(result, authority, artifacts), result);
});

test('unbound refs, changed hashes and colliding member ids fail closed', () => {
  const { request, authority, artifacts, finalized } = fixture();
  assert.throws(() => completeReviewerSnapshotTransportEnvelope(request, authority, { refs: ['file:///workspace/unknown'], hashes: [finalized.sha256] }));
  assert.throws(() => completeReviewerSnapshotTransportEnvelope(request, authority, { ...artifacts, hashes: [finalized.sha256, finalized.sha256] }));
  request.members[0]!.member_id = `opl-finalized-artifact-${finalized.sha256.slice('sha256:'.length)}`;
  assert.throws(() => completeReviewerSnapshotTransportEnvelope(request, authority, artifacts));
});

// A Stage that declares no review lane binding has no authoritative lane: the resolver that
// builds this expectation already ignores a requested lane there and yields null. A producer that
// restates a lane anyway must not fail an otherwise exact request, or the reviewer never starts
// and the StageRun ends without the decisive route decision the StageRun handoff depends on.
test('an unauthorized review lane hint is dropped instead of failing an exact request', () => {
  const { request, authority, artifacts } = fixture();
  const laneLessAuthority = { ...authority, review_lane_binding: null };
  const withHint = { ...structuredClone(request), review_lane: 'formal_review' };
  const result = completeReviewerSnapshotTransportEnvelope(withHint, laneLessAuthority, artifacts);
  assert.equal(result.review_lane, undefined);
  assert.equal(result.producer_attempt_ref, authority.producer_attempt_ref);
  assert.equal(result.execution_content_binding_sha256, authority.execution_content_binding_sha256);
});

// Dropping is only safe once the lane is genuinely non-authoritative: a hint that contradicts a
// lane the Stage does declare stays fatal.
test('a review lane hint that contradicts a declared lane stays fatal', () => {
  const { request, authority, artifacts } = fixture();
  const withConflictingHint = { ...structuredClone(request), review_lane: 'formal_review' };
  assert.throws(
    () => completeReviewerSnapshotTransportEnvelope(withConflictingHint, authority, artifacts),
    /does not match its producer Attempt binding and closeout metadata/,
  );
});

// Run 22 (ibd-oma-create-22) regression: the blueprint producer authored a snapshot
// request with every fixed field correct but omitted the `members` key entirely. The
// strict gate then killed the StageRun before the supplement path — which exists
// precisely to assemble the mandated scope from the closeout's declared artifacts and
// the Stage's immutable input authority — could run. An absent members key must flow
// through supplementation instead of failing deterministically.
test('an absent members key is supplemented from declared artifacts and stage-run inputs', () => {
  const { source, finalized, authority, artifacts } = fixture();
  const stageRunInput = {
    kind: 'artifact',
    ref: 'file:///workspace/stage-input.json',
    sha256: `sha256:${'4'.repeat(64)}`,
    size_bytes: 21,
  };
  const laneLessAuthority = { ...authority, review_lane_binding: null, stage_run_input_authority_refs: [stageRunInput] };
  const membersLess = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
    owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
    execution_content_binding_sha256: authority.execution_content_binding_sha256,
    workspace_root: '/workspace',
  };
  const result = completeReviewerSnapshotTransportEnvelope(membersLess, laneLessAuthority, artifacts);
  assert.equal(result.members.length, 3);
  const refs = result.members.map((member) => member.source_ref);
  assert.ok(refs.includes(finalized.ref), 'declared artifacts must be supplemented');
  assert.ok(refs.includes(stageRunInput.ref), 'immutable stage-run inputs must be supplemented');
});

// Supplementation must not widen scope on its own: with nothing declared and no
// immutable stage-run inputs, an empty inventory still fails closed — an empty
// reviewer snapshot would silently review nothing.
test('an empty or absent inventory with nothing declared still fails closed', () => {
  const { source, authority } = fixture();
  const laneLessAuthority = { ...authority, review_lane_binding: null };
  const emptyMembers = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
    owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
    execution_content_binding_sha256: authority.execution_content_binding_sha256,
    workspace_root: '/workspace',
    members: [],
  };
  assert.throws(
    () => completeReviewerSnapshotTransportEnvelope(emptyMembers, laneLessAuthority, { refs: [], hashes: [] }),
    /non-empty member inventory/,
  );
  const membersLess: Record<string, unknown> = { ...emptyMembers };
  delete membersLess.members;
  assert.throws(
    () => completeReviewerSnapshotTransportEnvelope(membersLess, laneLessAuthority, { refs: [], hashes: [] }),
    /non-empty member inventory/,
  );
});

// Extraneous keys remain fatal: relaxation covers only the missing members key.
test('an unknown extra key still fails closed', () => {
  const { request, authority, artifacts } = fixture();
  const withExtra = { ...structuredClone(request), extra_field: 'nope' };
  assert.throws(
    () => completeReviewerSnapshotTransportEnvelope(withExtra, authority, artifacts),
    /must use the exact declared fields/,
  );
});

// A producer hand-writes its snapshot request digests and can hallucinate one
// (production: run dev-orchestrator-create-20261121-r15 carried a 66-char
// non-canonical member digest). When the declared artifact identity already
// binds exactly one verified digest for the same source_ref, the repair rebinds
// the member to that authority and the repaired bytes survive ordinary
// materialization. Unbound or ambiguous members stay fail-closed.
test('a hand-written member digest is repaired from the authoritative identity and survives materialization', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08a-repair-'));
  try {
    const sourceBytes = Buffer.from(JSON.stringify({ kind: 'source' }));
    const producedBytes = Buffer.from(JSON.stringify({ kind: 'produced', n: 2 }));
    fs.writeFileSync(path.join(root, 'source.json'), sourceBytes);
    fs.writeFileSync(path.join(root, 'generation.json'), producedBytes);
    const digestOf = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const source = { kind: 'artifact', ref: 'file:///source.json'.replace('file:///', `file://${root}/`), sha256: digestOf(sourceBytes), size_bytes: sourceBytes.length };
    const finalized = { kind: 'artifact', ref: `file://${root}/generation.json`, sha256: digestOf(producedBytes), size_bytes: producedBytes.length };
    const authority = {
      producer_attempt_ref: 'opl://stage_attempts/sat_f08a',
      execution_content_binding_sha256: `sha256:${'3'.repeat(64)}`,
      review_lane_binding: 'statistical',
      owner_authority_refs: [source, finalized],
    };
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: root,
      members: [
        { member_id: 'domain-source', source_ref: source.ref, sha256: source.sha256, size_bytes: source.size_bytes },
        // The hand-written wrong digest (66 chars, as produced in the live run) and wrong size.
        { member_id: 'produced-02', source_ref: finalized.ref, sha256: `sha256:${'2'.repeat(64)}ff`, size_bytes: 1 },
      ],
    };
    const artifacts = { refs: [source.ref, finalized.ref], hashes: [source.sha256, finalized.sha256] };
    const resolution = resolveReviewerInputSnapshotMaterialization(request, authority, artifacts);
    assert.equal(resolution.surface_kind, 'opl_reviewer_input_snapshot_materialization');
    const repairs = (resolution as { member_digest_repairs?: unknown[] }).member_digest_repairs ?? [];
    assert.equal(repairs.length, 1);
    assert.deepEqual(repairs[0], {
      member_id: 'produced-02',
      source_ref: finalized.ref,
      received_sha256: `sha256:${'2'.repeat(64)}ff`,
      authoritative_sha256: finalized.sha256,
      received_size_bytes: 1,
      authoritative_size_bytes: finalized.size_bytes,
    });
    // The materialized manifest binds the authoritative digest, not the fabricated one.
    const manifest = (resolution as { manifest: { members: { member_id: string; sha256: string }[] } }).manifest;
    const member = manifest.members.find((entry) => entry.member_id === 'produced-02');
    assert.equal(member?.sha256, finalized.sha256);

    // A member with no authoritative binding stays fail-closed.
    const unbound = {
      ...request,
      members: [
        { member_id: 'domain-source', source_ref: source.ref, sha256: source.sha256, size_bytes: source.size_bytes },
        { member_id: 'ghost', source_ref: `file://${root}/not-declared.json`, sha256: 'not-a-digest', size_bytes: 1 },
      ],
    };
    assert.throws(
      () => resolveReviewerInputSnapshotMaterialization(unbound, authority, artifacts),
      /canonical SHA-256 digest|not.*declared|fail/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
