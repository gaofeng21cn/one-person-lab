import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { runnerPromptFor } from '../../src/adapters/execution/family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { materializeReviewerInputSnapshot, reviewerSnapshotStageRunInputAuthority } from '../../src/adapters/execution/family-runtime-reviewer-input-snapshot.ts';
import { exactRefsFromCloseoutMetadata } from '../../src/adapters/execution/family-runtime-temporal-activities.ts';

const sha = (bytes: string) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const bindingHash = sha('execution');
const attemptRef = 'opl://stage_attempts/producer-snapshot';
test('snapshot authority accepts the exact digest representation persisted by artifact identity transport', () => {
  const entry = { kind: 'design_scope', ref: 'file:///workspace/scope.json', sha256: sha('scope'), size_bytes: 5 };
  assert.deepEqual(exactRefsFromCloseoutMetadata([entry]), [entry]);
  assert.deepEqual(exactRefsFromCloseoutMetadata([{ ...entry, sha256: entry.sha256.slice(7) }]), [entry]);
  assert.deepEqual(exactRefsFromCloseoutMetadata([{ ...entry, sha256: 'invalid' }]), []);
});
const promptFor = (role: string, formal: boolean) => runnerPromptFor({
  attempt: {
    stage_attempt_id: 'producer-snapshot', stage_id: 'design', attempt_role: role,
    workspace_locator: { workspace_root: '/tmp/snapshot-authoring' },
    execution_content_binding: {
      binding_sha256: bindingHash,
      spec: { stage_attempt_executor_policy: { review_lane_binding: 'design' } },
    },
    stage_run_spec: {
      input_artifacts: [{ ref: 'original-request.json', sha256: sha('request') }],
      content_bindings: [{ purpose: 'input_artifact', ref: 'original-request.json', sha256: sha('request'), byte_size: 7, verification_kind: 'workspace_file_bytes' }],
    },
    quality_context: { context_manifest: { cross_stage_route_selection: {
      configured_decisive_attempt_roles: formal ? ['reviewer', 're_reviewer'] : ['producer'],
    } } },
  },
  effectiveStagePrompt: null, effectiveQualityRolePrompt: null,
});

test('formal producers and repairers receive the canonical snapshot request and fixed binding', () => {
  for (const role of ['producer', 'repairer']) {
    const prompt = promptFor(role, true);
    assert.match(prompt, /<opl_reviewer_snapshot_authoring>/);
    const supplied = JSON.parse(prompt.split('<opl_reviewer_snapshot_authoring>')[1]!.split('</opl_reviewer_snapshot_authoring>')[0]!);
    assert.equal(supplied.fixed_request_fields.producer_attempt_ref, attemptRef);
    assert.equal(supplied.fixed_request_fields.execution_content_binding_sha256, bindingHash);
    assert.equal(supplied.fixed_request_fields.review_lane, 'design');
    assert.equal(supplied.fixed_request_fields.workspace_root, '/tmp/snapshot-authoring');
    assert.ok(supplied.request_schema.required.includes('members'));
    assert.equal(supplied.request_schema.additionalProperties, false);
    assert.deepEqual(supplied.immutable_stage_run_inputs, [{ kind: 'stage_run_input_artifact', ref: 'original-request.json', sha256: sha('request'), size_bytes: 7 }]);
    assert.match(prompt, /owner_authority_ref/);
    assert.match(prompt, /Do not infer snapshot members/);
  }
  assert.doesNotMatch(promptFor('producer', false), /<opl_reviewer_snapshot_authoring>/);
  assert.doesNotMatch(promptFor('reviewer', true), /<opl_reviewer_snapshot_authoring>/);
});

test('snapshot can freeze an exact bound external input but never an unbound external file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-snapshot-authoring-'));
  const priorState = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = path.join(root, 'state');
    const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
    const bytes = 'immutable design request';
    const source = path.join(root, 'request.json'); fs.writeFileSync(source, bytes);
    const exact = { kind: 'stage_run_input_artifact', ref: pathToFileURL(source).href, sha256: sha(bytes), size_bytes: Buffer.byteLength(bytes) };
    const owner = { kind: 'design_scope', ref: pathToFileURL(path.join(workspace, 'scope.json')).href, sha256: sha('scope'), size_bytes: 5 };
    fs.writeFileSync(path.join(workspace, 'scope.json'), 'scope');
    const request = {
      surface_kind: 'opl_reviewer_input_snapshot_materialization_request', schema_version: 2,
      producer_attempt_ref: attemptRef, execution_content_binding_sha256: bindingHash,
      workspace_root: workspace, owner_authority_ref: owner,
      members: [{ member_id: 'request', source_ref: exact.ref, sha256: exact.sha256, size_bytes: exact.size_bytes }],
    };
    const spec = { input_artifacts: [{ ref: exact.ref, sha256: exact.sha256 }], content_bindings: [{ purpose: 'input_artifact', ref: exact.ref, sha256: exact.sha256, byte_size: exact.size_bytes, verification_kind: 'trusted_artifact_identity_receipt', identity_receipt_ref: 'opl://input/receipt' }] };
    const inputs = reviewerSnapshotStageRunInputAuthority(spec);
    assert.deepEqual(inputs, [exact]);
    assert.throws(() => reviewerSnapshotStageRunInputAuthority({ ...spec, content_bindings: [] }), /one exact immutable content binding/);
    assert.throws(() => reviewerSnapshotStageRunInputAuthority({ ...spec, content_bindings: [...spec.content_bindings, ...spec.content_bindings] }), /one exact immutable content binding/);
    assert.throws(() => reviewerSnapshotStageRunInputAuthority({ ...spec, content_bindings: [{ ...spec.content_bindings[0], identity_receipt_ref: null }] }), /lacks verified bytes/);
    const authority = { producer_attempt_ref: attemptRef, execution_content_binding_sha256: bindingHash, owner_authority_refs: [owner], stage_run_input_authority_refs: inputs };
    const result = materializeReviewerInputSnapshot(request, authority);
    assert.equal(result.manifest.members[0]!.sha256, exact.sha256);
    assert.equal(fs.readFileSync(new URL(result.manifest.members[0]!.immutable_ref.ref), 'utf8'), bytes);
    assert.throws(() => materializeReviewerInputSnapshot(request, { ...authority, stage_run_input_authority_refs: [] }), /escapes/);
    assert.throws(() => materializeReviewerInputSnapshot({ ...request, members: [{ member_id: 'scope', source_ref: owner.ref, sha256: owner.sha256, size_bytes: owner.size_bytes }] }, authority), /enumerate every immutable StageRun input/);
    fs.writeFileSync(source, 'changed');
    const changed = { ...request, members: [{ ...request.members[0]!, sha256: sha('changed'), size_bytes: 7 }] };
    assert.throws(() => materializeReviewerInputSnapshot(changed, authority), /enumerate every immutable StageRun input/);
    const relative = { ...owner, ref: 'scope.json' };
    const relativeRequest = { ...request, members: [{ member_id: 'relative', source_ref: relative.ref, sha256: relative.sha256, size_bytes: relative.size_bytes }] };
    assert.equal(materializeReviewerInputSnapshot(relativeRequest, { ...authority, stage_run_input_authority_refs: [relative] }).manifest.members[0]!.sha256, relative.sha256);
  } finally {
    if (priorState === undefined) delete process.env.OPL_STATE_DIR; else process.env.OPL_STATE_DIR = priorState;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
