import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  completeReviewerSnapshotTransportEnvelope,
  completeReviewerSnapshotTransportEnvelopeWithRepairs,
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
// (observed in a live run: a 66-char non-canonical digest). When the declared
// artifact identity already binds exactly one verified digest for the same
// source_ref, the envelope repairs the member from that authority and records
// the repair instead of killing the review before the reviewer starts.
test('a member whose digest contradicts its single authoritative binding is repaired with an audit trail', () => {
  const { source, finalized, authority, artifacts } = fixture();
  const malformed = `${'2'.repeat(64)}ff`;
  const request = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
    owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
    execution_content_binding_sha256: authority.execution_content_binding_sha256,
    review_lane: 'statistical', workspace_root: '/workspace',
    members: [
      { member_id: 'domain-source', source_ref: source.ref, sha256: source.sha256, size_bytes: source.size_bytes },
      { member_id: 'produced-02', source_ref: finalized.ref, sha256: `sha256:${malformed}`, size_bytes: 1 },
    ],
  };
  const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(request, authority, artifacts);
  const repaired = result.request.members.find((member) => member.member_id === 'produced-02');
  assert.equal(repaired?.sha256, finalized.sha256);
  assert.equal(repaired?.size_bytes, finalized.size_bytes);
  assert.equal(result.repairs.length, 1);
  assert.equal(result.repairs[0]?.member_id, 'produced-02');
  assert.equal(result.repairs[0]?.received_sha256, `sha256:${malformed}`);
  assert.equal(result.repairs[0]?.authoritative_sha256, finalized.sha256);
  assert.equal(result.repairs[0]?.received_size_bytes, 1);
  assert.equal(result.repairs[0]?.authoritative_size_bytes, finalized.size_bytes);
});

test('a canonical but wrong digest is repaired, while an unbound member stays fail-closed', () => {
  const { source, finalized, authority, artifacts } = fixture();
  const wrongButCanonical = `sha256:${'9'.repeat(64)}`;
  const request = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
    owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
    execution_content_binding_sha256: authority.execution_content_binding_sha256,
    review_lane: 'statistical', workspace_root: '/workspace',
    members: [
      { member_id: 'domain-source', source_ref: source.ref, sha256: source.sha256, size_bytes: source.size_bytes },
      { member_id: 'produced-02', source_ref: finalized.ref, sha256: wrongButCanonical, size_bytes: finalized.size_bytes },
    ],
  };
  const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(request, authority, artifacts);
  assert.equal(
    result.request.members.find((member) => member.member_id === 'produced-02')?.sha256,
    finalized.sha256,
  );
  assert.equal(result.repairs.length, 1);

  const unbound = {
    ...request,
    members: [
      { member_id: 'domain-source', source_ref: source.ref, sha256: source.sha256, size_bytes: source.size_bytes },
      { member_id: 'ghost', source_ref: 'file:///workspace/not-declared.json', sha256: 'not-a-digest', size_bytes: 1 },
    ],
  };
  assert.throws(
    () => completeReviewerSnapshotTransportEnvelopeWithRepairs(unbound, authority, artifacts),
    /canonical SHA-256 digest/,
  );
});

// A producer can declare a workspace_root narrower than its own member list
// (observed in live candidate runs: a WorkItem-root request whose members named
// sibling WorkItem state files and workspace-level knowledge entries). When the
// Framework's durable execution scope proves every member still lives inside the
// real workspace, the envelope widens the declared root to the narrowest root
// containing every member and records the widening instead of killing the review.
test('a member set that escapes the declared root but not the workspace is kept by widening the root with an audit trail', () => {
  const { source, finalized, authority, artifacts } = fixture();
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08c-widen-')));
  try {
    const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
    fs.mkdirSync(workItemRoot, { recursive: true });
    const siblingRoot = path.join(workspace, 'work-items', 'wi-beta');
    fs.mkdirSync(siblingRoot, { recursive: true });
    const registryRoot = path.join(workspace, 'knowledge-registry');
    fs.mkdirSync(registryRoot, { recursive: true });
    const producedRef = `${workItemRoot}/produced.json`;
    const siblingRef = `${siblingRoot}/state.json`;
    const registryRef = `${registryRoot}/evaluation-project-state.md`;
    fs.writeFileSync(producedRef, '{}');
    fs.writeFileSync(siblingRef, '{}');
    fs.writeFileSync(registryRef, '# state');
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: workItemRoot,
      members: [
        { member_id: 'produced', source_ref: producedRef, sha256: `sha256:${'4'.repeat(64)}`, size_bytes: 2 },
        { member_id: 'sibling-state', source_ref: siblingRef, sha256: `sha256:${'5'.repeat(64)}`, size_bytes: 2 },
        { member_id: 'registry-entry', source_ref: registryRef, sha256: `sha256:${'6'.repeat(64)}`, size_bytes: 7 },
      ],
    };
    const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      request,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(result.request.workspace_root, workspace);
    assert.equal(result.request.members.length, 3, 'member set is preserved exactly');
    assert.equal(result.workspace_root_widenings.length, 1);
    const widening = result.workspace_root_widenings[0]!;
    assert.equal(widening.declared_workspace_root, workItemRoot);
    assert.equal(widening.widened_workspace_root, workspace);
    assert.equal(widening.trusted_workspace_root, workspace);
    assert.deepEqual(
      [...widening.escaped_member_source_refs].sort(),
      [registryRef, siblingRef].sort(),
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// Widening never reaches outside the trusted workspace: a member that escapes the
// Framework-recorded root is a genuine escape and the request is left untouched,
// so the transport's fail-closed containment check still fires downstream.
test('a member outside the trusted workspace root is not widened into acceptance', () => {
  const { source, authority, artifacts } = fixture();
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08c-escape-')));
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08c-outside-')));
  try {
    const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
    fs.mkdirSync(workItemRoot, { recursive: true });
    const producedRef = `${workItemRoot}/produced.json`;
    const outsideRef = `${outside}/secret.txt`;
    fs.writeFileSync(producedRef, '{}');
    fs.writeFileSync(outsideRef, 'secret');
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: workItemRoot,
      members: [
        { member_id: 'produced', source_ref: producedRef, sha256: `sha256:${'4'.repeat(64)}`, size_bytes: 2 },
        { member_id: 'outside-file', source_ref: outsideRef, sha256: `sha256:${'7'.repeat(64)}`, size_bytes: 6 },
      ],
    };
    const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      request,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(result.request.workspace_root, workItemRoot);
    assert.equal(result.workspace_root_widenings.length, 0);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// No escape, no repair: a consistent request keeps its declared root and records
// nothing, even when a trusted workspace root is available.
test('a consistent request is not widened', () => {
  const { source, authority, artifacts } = fixture();
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08c-clean-')));
  try {
    const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
    fs.mkdirSync(workItemRoot, { recursive: true });
    const insideRef = `${workItemRoot}/produced.json`;
    fs.writeFileSync(insideRef, '{}');
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: workItemRoot,
      members: [
        { member_id: 'produced', source_ref: insideRef, sha256: `sha256:${'8'.repeat(64)}`, size_bytes: 2 },
      ],
    };
    const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      request,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(result.request.workspace_root, workItemRoot);
    assert.equal(result.workspace_root_widenings.length, 0);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// A producer can write a member ref in the wrong encoding: workspace-relative
// refs copied from the action payload into a WorkItem-root request resolve to a
// doubled, nonexistent path (observed live). When the ref resolves to exactly
// one existing file inside the trusted workspace root, the envelope rebases the
// ref to that verified absolute path with an audit trail; the member is still
// hash-pinned at materialization, so a wrong rebase cannot bind wrong bytes.
test('a workspace-relative ref that misses the declared root is rebased to its verified trusted-root resolution', () => {
  const { source, authority } = fixture();
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08d-rebase-')));
  try {
    const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
    fs.mkdirSync(workItemRoot, { recursive: true });
    const siblingRoot = path.join(workspace, 'work-items', 'wi-beta');
    fs.mkdirSync(siblingRoot, { recursive: true });
    const producedRef = `${workItemRoot}/produced.json`;
    fs.writeFileSync(producedRef, '{}');
    fs.writeFileSync(`${siblingRoot}/state.json`, '{}');
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: workItemRoot,
      members: [
        { member_id: 'produced', source_ref: 'produced.json', sha256: `sha256:${'4'.repeat(64)}`, size_bytes: 2 },
        // Workspace-relative as copied from the payload: misses under the
        // declared WorkItem root, exists under the trusted workspace root.
        { member_id: 'sibling-state', source_ref: 'work-items/wi-beta/state.json', sha256: `sha256:${'5'.repeat(64)}`, size_bytes: 2 },
      ],
    };
    const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      request,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    const rebased = result.request.members.find((member) => member.member_id === 'sibling-state');
    assert.equal(rebased?.source_ref, `${siblingRoot}/state.json`);
    assert.equal(result.member_ref_rebases.length, 1);
    assert.equal(result.member_ref_rebases[0]?.member_id, 'sibling-state');
    assert.equal(result.member_ref_rebases[0]?.declared_source_ref, 'work-items/wi-beta/state.json');
    assert.equal(result.member_ref_rebases[0]?.resolved_source_ref, `${siblingRoot}/state.json`);
    assert.equal(result.member_ref_rebases[0]?.resolved_under, 'trusted_workspace_root');
    // The rebased absolute ref escapes the declared root, so the root widens to
    // the narrowest common ancestor inside the trusted workspace.
    assert.equal(result.workspace_root_widenings.length, 1);
    assert.equal(result.request.workspace_root, path.join(workspace, 'work-items'));
    assert.deepEqual(
      result.workspace_root_widenings[0]?.rebased_member_source_refs,
      ['work-items/wi-beta/state.json'],
    );
    // The member whose declared-root interpretation exists is untouched.
    assert.equal(
      result.request.members.find((member) => member.member_id === 'produced')?.source_ref,
      'produced.json',
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// A ref that resolves under the declared root keeps that deterministic
// interpretation even when the same string also resolves under the trusted root.
test('a ref that exists under the declared root is not rebased', () => {
  const { source, authority } = fixture();
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08d-stable-')));
  try {
    const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
    fs.mkdirSync(workItemRoot, { recursive: true });
    fs.writeFileSync(`${workItemRoot}/state.json`, '{"declared":true}');
    fs.writeFileSync(`${workspace}/state.json`, '{"trusted":true}');
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: workItemRoot,
      members: [
        { member_id: 'state', source_ref: 'state.json', sha256: `sha256:${'4'.repeat(64)}`, size_bytes: 2 },
      ],
    };
    const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      request,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(result.request.members[0]?.source_ref, 'state.json');
    assert.equal(result.member_ref_rebases.length, 0);
    assert.equal(result.workspace_root_widenings.length, 0);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// A ref that resolves nowhere is left exactly as authored: the transport's
// fail-closed unreadable-source error reports the original bytes downstream.
test('a ref that resolves nowhere stays fail-closed', () => {
  const { source, authority } = fixture();
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08d-missing-')));
  try {
    const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
    fs.mkdirSync(workItemRoot, { recursive: true });
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: workItemRoot,
      members: [
        { member_id: 'ghost', source_ref: 'work-items/nowhere/state.json', sha256: `sha256:${'4'.repeat(64)}`, size_bytes: 2 },
      ],
    };
    const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      request,
      authority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(result.request.members[0]?.source_ref, 'work-items/nowhere/state.json');
    assert.equal(result.member_ref_rebases.length, 0);
    assert.equal(result.workspace_root_widenings.length, 0);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// A framework-bound immutable StageRun input legitimately lives outside the
// workspace (e.g. under the shared OPL state root). Observed in a live run:
// including it in the common-ancestor computation pushed the widened root to
// the home directory, outside the trusted workspace, so widening was refused
// and an in-workspace member was killed as an escape. Bound inputs are
// byte-pinned by the authority, not containment subjects: they must not
// constrain the widened root.
test('an external framework-bound input does not poison the widening common ancestor', () => {
  const { source, authority, artifacts } = fixture();
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08c2-widen-')));
  const oplState = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-f08c2-state-')));
  try {
    const workItemRoot = path.join(workspace, 'work-items', 'wi-alpha');
    fs.mkdirSync(workItemRoot, { recursive: true });
    const registryRoot = path.join(workspace, 'knowledge-registry');
    fs.mkdirSync(registryRoot, { recursive: true });
    const producedRef = `${workItemRoot}/produced.json`;
    const registryRef = `${registryRoot}/evaluation-project-state.md`;
    const externalInputRef = `${oplState}/raw-executor-output.txt`;
    fs.writeFileSync(producedRef, '{}');
    fs.writeFileSync(registryRef, '# state');
    fs.writeFileSync(externalInputRef, 'raw');
    const externalInput = {
      kind: 'artifact',
      ref: externalInputRef,
      sha256: `sha256:${'7'.repeat(64)}`,
      size_bytes: 3,
    };
    const boundAuthority = { ...authority, stage_run_input_authority_refs: [externalInput] };
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      owner_authority_ref: source, producer_attempt_ref: authority.producer_attempt_ref,
      execution_content_binding_sha256: authority.execution_content_binding_sha256,
      review_lane: 'statistical', workspace_root: workItemRoot,
      members: [
        { member_id: 'produced', source_ref: producedRef, sha256: `sha256:${'4'.repeat(64)}`, size_bytes: 2 },
        { member_id: 'registry-entry', source_ref: registryRef, sha256: `sha256:${'6'.repeat(64)}`, size_bytes: 7 },
        { member_id: 'opl-stage-run-input', source_ref: externalInputRef, sha256: externalInput.sha256, size_bytes: 3 },
      ],
    };
    const result = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      request,
      boundAuthority,
      { refs: [], hashes: [] },
      { trusted_workspace_root: workspace },
    );
    assert.equal(result.request.workspace_root, workspace);
    assert.equal(result.workspace_root_widenings.length, 1);
    const widening = result.workspace_root_widenings[0]!;
    assert.equal(widening.widened_workspace_root, workspace);
    assert.deepEqual(widening.escaped_member_source_refs, [registryRef]);
    assert.deepEqual(widening.external_bound_member_source_refs, [externalInputRef]);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(oplState, { recursive: true, force: true });
  }
});
