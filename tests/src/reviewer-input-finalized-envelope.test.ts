import assert from 'node:assert/strict';
import test from 'node:test';
import { completeReviewerSnapshotTransportEnvelope } from '../../src/adapters/execution/family-runtime-reviewer-input-snapshot.ts';

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
