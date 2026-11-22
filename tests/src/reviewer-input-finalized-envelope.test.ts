import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  completeReviewerSnapshotTransportEnvelope,
  resolveReviewerInputSnapshotMaterialization,
} from '../../src/adapters/execution/family-runtime-reviewer-input-snapshot.ts';
import { buildStageReviewInputSnapshotContext } from '../../src/adapters/execution/family-runtime-stage-quality-context-manifest.ts';

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


function localSnapshotFixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-finalized-reviewer-snapshot-'));
  const previousState = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  t.after(() => {
    if (previousState === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousState;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const workspace = path.join(root, 'workspace');
  const producer = path.join(workspace, 'work-items', '审阅 本轮');
  const sibling = path.join(workspace, 'work-items', 'sibling');
  fs.mkdirSync(producer, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  const file = (filename: string, bytes: string) => {
    fs.writeFileSync(filename, bytes);
    return {
      kind: 'artifact',
      ref: pathToFileURL(filename).href,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      size_bytes: Buffer.byteLength(bytes),
    };
  };
  const artifact = file(path.join(producer, 'state.json'), 'current bytes');
  const request = {
    ...fixture().request,
    workspace_root: producer,
    owner_authority_ref: artifact,
    members: [{ member_id: 'artifact', source_ref: artifact.ref, sha256: artifact.sha256, size_bytes: artifact.size_bytes }],
  };
  const authority = {
    ...fixture().authority,
    owner_authority_refs: [artifact],
    producer_workspace_root: producer,
    stage_run_input_workspace_root: workspace,
  };
  return { artifact, authority, file, producer, request, sibling, workspace };
}

function materializedSnapshot(
  ...args: Parameters<typeof resolveReviewerInputSnapshotMaterialization>
) {
  const result = resolveReviewerInputSnapshotMaterialization(...args);
  assert.equal(result.surface_kind, 'opl_reviewer_input_snapshot_materialization');
  return result;
}

function memberContents(result: ReturnType<typeof materializedSnapshot>, memberId: string) {
  const member = result.manifest.members.find((item) => item.member_id === memberId);
  assert.ok(member);
  return fs.readFileSync(new URL(member.immutable_ref.ref), 'utf8');
}

test('finalized authoring restores a copied identity from one exact verified ref and records the observed binding', (t) => {
  const { artifact, authority, file, producer, request } = localSnapshotFixture(t);
  const originalMember = request.members[0]!;
  const badMember = { ...originalMember, sha256: `sha256:${'2'.repeat(66)}`, size_bytes: 77 };
  const authored = { ...request, members: [badMember] };
  const declared = { refs: [artifact.ref], hashes: [artifact.sha256] };
  const materialized = materializedSnapshot(authored, authority, declared);
  assert.equal(memberContents(materialized, 'artifact'), 'current bytes');
  assert.deepEqual(authored.members, [badMember]);
  const normalizations = [{
    finding: 'authority_member_identity_restored',
    member_id: 'artifact',
    sha256: artifact.sha256,
    size_bytes: artifact.size_bytes,
  }];
  assert.deepEqual(materialized.authoring_normalizations, normalizations);
  const context = buildStageReviewInputSnapshotContext({
    stageRunId: 'stage-run', qualityCycleId: 'cycle', reviewerAttemptRole: 'reviewer',
    resolution: materialized,
  });
  assert.ok('review_input_snapshot_authoring_normalizations' in context);
  assert.deepEqual(context.review_input_snapshot_authoring_normalizations, normalizations);
  assert.equal(materializedSnapshot(request, authority, declared).authoring_normalizations, undefined);
  assert.throws(() => materializedSnapshot(authored, authority, { refs: [], hashes: [] }), /canonical SHA-256/);
  const wrongSized = { ...artifact, size_bytes: 77 };
  assert.throws(() => materializedSnapshot(
    { ...authored, owner_authority_ref: wrongSized },
    { ...authority, owner_authority_refs: [wrongSized] },
    declared,
  ), /bytes do not match the bound member identity/);
  assert.throws(() => materializedSnapshot(
    authored, { ...authority, stage_run_input_authority_refs: [{ ...artifact, size_bytes: 77 }] }, declared,
  ), /one authoritative digest and byte size/);
  const duplicate = file(path.join(producer, 'duplicate.json'), 'current bytes');
  assert.throws(() => materializedSnapshot(
    { ...authored, members: [{ ...badMember, source_ref: duplicate.ref }] }, authority, declared,
  ), /canonical SHA-256/);
});

test('relative members retain the original root and only frozen siblings can resolve from the StageRun workspace', (t) => {
  const { artifact, authority, file, producer, request, sibling, workspace } = localSnapshotFixture(t);
  file(path.join(workspace, 'state.json'), 'wrong root bytes');
  const siblingInput = file(path.join(sibling, 'state.json'), 'sibling input bytes');
  const relative = {
    member_id: 'sibling',
    source_ref: 'work-items/sibling/state.json',
    sha256: siblingInput.sha256,
    size_bytes: siblingInput.size_bytes,
  };
  const authored = { ...request, members: [{ ...request.members[0]!, source_ref: 'state.json' }, relative] };
  const frozen = { ...authority, stage_run_input_authority_refs: [siblingInput] };
  const declared = { refs: [artifact.ref], hashes: [artifact.sha256] };
  const materialized = materializedSnapshot(authored, frozen, declared);
  assert.equal(memberContents(materialized, 'artifact'), 'current bytes');
  assert.equal(memberContents(materialized, 'sibling'), 'sibling input bytes');
  assert.deepEqual(materialized.authoring_normalizations, [{
    finding: 'frozen_input_resolved_from_workspace',
    member_id: 'sibling',
    sha256: siblingInput.sha256,
    size_bytes: siblingInput.size_bytes,
  }]);
  assert.throws(() => materializedSnapshot(authored, authority, declared), /source ref is not a readable local file/);
  assert.throws(() => materializedSnapshot({
    ...authored, members: [authored.members[0]!, { ...relative, size_bytes: 77 }],
  }, frozen, declared), /source ref is not a readable local file/);
  fs.mkdirSync(path.dirname(path.join(producer, relative.source_ref)), { recursive: true });
  fs.writeFileSync(path.join(producer, relative.source_ref), 'existing producer-relative file');
  process.env.OPL_STATE_DIR = path.join(workspace, 'fresh-state');
  assert.throws(() => materializedSnapshot(authored, frozen, declared), /source bytes do not match/);
});

test('a local file URL is accepted only for the persisted producer root', (t) => {
  const { artifact, authority, producer, request, sibling, workspace } = localSnapshotFixture(t);
  const authored = {
    ...request,
    workspace_root: pathToFileURL(producer).href,
    members: [{ ...request.members[0]!, source_ref: 'state.json' }],
  };
  const declared = { refs: [artifact.ref], hashes: [artifact.sha256] };
  const materialized = materializedSnapshot(authored, authority, declared);
  assert.equal(memberContents(materialized, 'artifact'), 'current bytes');
  assert.deepEqual(materialized.authoring_normalizations, [{ finding: 'workspace_root_file_url_decoded' }]);
  for (const otherRoot of [workspace, sibling]) {
    assert.throws(() => materializedSnapshot(
      { ...authored, workspace_root: pathToFileURL(otherRoot).href }, authority, declared,
    ), /file URL must name the persisted producer workspace root/);
  }
  assert.throws(() => materializedSnapshot(
    authored, { ...authority, producer_workspace_root: undefined }, declared,
  ), /workspace root is not readable/);
});
