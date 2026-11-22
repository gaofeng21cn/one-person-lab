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

// A producer can copy a workspace-relative ref from its action payload into a
// request whose declared root is the WorkItem root; the ref then resolves to a
// doubled, nonexistent path (production: fixture revalidation of
// same-revision-resume-and-unrelated-progress). When the ref exists uniquely
// inside the Framework's trusted workspace root, rebasing it preserves the
// member and its byte binding; the materialized snapshot still hash-pins the
// verified bytes.
function rebaseFixture() {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08d-rebase-')));
  const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
  fs.mkdirSync(workItemRoot, { recursive: true });
  fs.mkdirSync(path.join(workspace, 'work-items', 'wi-beta'), { recursive: true });
  const sourceBytes = Buffer.from(JSON.stringify({ kind: 'source' }));
  fs.writeFileSync(path.join(workItemRoot, 'source.json'), sourceBytes);
  const digestOf = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const source = {
    kind: 'artifact',
    ref: `file://${workItemRoot}/source.json`,
    sha256: digestOf(sourceBytes),
    size_bytes: sourceBytes.length,
  };
  const authority = {
    producer_attempt_ref: 'opl://stage_attempts/sat_f08d',
    execution_content_binding_sha256: `sha256:${'3'.repeat(64)}`,
    review_lane_binding: 'statistical',
    owner_authority_refs: [source],
  };
  const request = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
    owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
    execution_content_binding_sha256: authority.execution_content_binding_sha256,
    review_lane: 'statistical', workspace_root: workItemRoot,
    members: [
      { member_id: 'domain-source', source_ref: source.ref, sha256: source.sha256, size_bytes: source.size_bytes },
    ],
  };
  return { workspace, workItemRoot, source, authority, request, digestOf };
}

test('a workspace-relative ref that misses the declared root is rebased to its trusted-root resolution', () => {
  const { workspace, workItemRoot, source, authority, request, digestOf } = rebaseFixture();
  try {
    const siblingBytes = Buffer.from('{"state":1}');
    const siblingPath = path.join(workspace, 'work-items', 'wi-beta', 'state.json');
    fs.writeFileSync(siblingPath, siblingBytes);
    const sibling = { sha256: digestOf(siblingBytes), size_bytes: siblingBytes.length };
    const authorityWithSibling = { ...authority, owner_authority_refs: [source, { kind: 'artifact', ref: `file://${siblingPath}`, ...sibling }] };
    const requestWithSibling = {
      ...request,
      members: [
        ...request.members,
        // Workspace-relative as copied from the payload: misses under the
        // declared WorkItem root, exists under the trusted workspace root.
        { member_id: 'sibling-state', source_ref: 'work-items/wi-beta/state.json', ...sibling },
      ],
    };
    const resolution = resolveReviewerInputSnapshotMaterialization(
      requestWithSibling,
      authorityWithSibling,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(resolution.surface_kind, 'opl_reviewer_input_snapshot_materialization');
    const rebases = (resolution as { member_ref_rebases?: { member_id: string; declared_source_ref: string; resolved_source_ref: string; resolved_under: string }[] }).member_ref_rebases ?? [];
    assert.deepEqual(rebases, [{
      member_id: 'sibling-state',
      declared_source_ref: 'work-items/wi-beta/state.json',
      resolved_source_ref: siblingPath,
      resolved_under: 'trusted_workspace_root',
    }]);
    // The materialized manifest binds the rebased member's verified bytes.
    const manifest = (resolution as { manifest: { members: { member_id: string; sha256: string }[] } }).manifest;
    assert.equal(manifest.members.find((entry) => entry.member_id === 'sibling-state')?.sha256, sibling.sha256);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// A ref that resolves under the declared root keeps that deterministic
// interpretation even when the same string also resolves under the trusted root.
test('a ref that exists under the declared root is not rebased', () => {
  const { workspace, workItemRoot, source, authority, request, digestOf } = rebaseFixture();
  try {
    const declaredBytes = Buffer.from('{"declared":true}');
    fs.writeFileSync(path.join(workItemRoot, 'state.json'), declaredBytes);
    fs.writeFileSync(path.join(workspace, 'state.json'), '{"trusted":true}');
    const declared = { sha256: digestOf(declaredBytes), size_bytes: declaredBytes.length };
    const requestWithDeclared = {
      ...request,
      members: [...request.members, { member_id: 'local-state', source_ref: 'state.json', ...declared }],
    };
    const resolution = resolveReviewerInputSnapshotMaterialization(
      requestWithDeclared,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(resolution.surface_kind, 'opl_reviewer_input_snapshot_materialization');
    assert.equal((resolution as { member_ref_rebases?: unknown[] }).member_ref_rebases, undefined);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// A ref that resolves nowhere stays fail-closed.
test('a ref that resolves under neither root is not rebased and fails at materialization', () => {
  const { workspace, source, authority, request } = rebaseFixture();
  try {
    const requestWithGhost = {
      ...request,
      members: [...request.members, { member_id: 'ghost', source_ref: 'work-items/wi-ghost/state.json', sha256: `sha256:${'5'.repeat(64)}`, size_bytes: 2 }],
    };
    assert.throws(() => resolveReviewerInputSnapshotMaterialization(
      requestWithGhost,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    ));
    // And without a trusted root no rebase is ever attempted.
    assert.throws(() => resolveReviewerInputSnapshotMaterialization(
      { ...requestWithGhost, members: [...request.members, { member_id: 'ghost', source_ref: 'state.json', sha256: `sha256:${'5'.repeat(64)}`, size_bytes: 2 }] },
      authority,
      { refs: [], hashes: [] },
    ));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
