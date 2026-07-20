import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  materializeReviewerInputSnapshot,
  readReviewerInputSnapshotManifest,
  resolveReviewerInputSnapshotMaterialization,
  type ReviewerInputSnapshotMaterializationRequest,
} from '../../src/modules/runway/family-runtime-reviewer-input-snapshot.ts';
import {
  persistReviewEvidenceArtifactCandidate,
  readReviewEvidenceArtifactReceipt,
} from '../../src/modules/runway/family-runtime-review-evidence-artifact.ts';
import {
  materializeOplRevisionTransport,
  readOplRevisionIntake,
  revisionTransportContext,
} from '../../src/modules/runway/family-runtime-revision-intake.ts';
import type { StageReviewReceipt } from '../../src/modules/stagecraft/public/stage-quality-cycle.ts';

function sha256(value: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function exactRef(kind: string, ref: string, bytes: string | Buffer) {
  const sizeBytes = Buffer.byteLength(bytes);
  return { kind, ref, size_bytes: sizeBytes, sha256: sha256(bytes) };
}

const ownerAuthorityRef = exactRef(
  'mas_review_input_snapshot_authority',
  'mas-authority://snapshot/1',
  'owner authority bytes',
);
const producerAttemptRef = 'opl://stage_attempts/producer';
const executionBindingSha256 = sha256('producer execution binding');

function requestFor(workspaceRoot: string, sourceRef: string, bytes: Buffer) {
  return {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
    schema_version: 2,
    owner_authority_ref: ownerAuthorityRef,
    producer_attempt_ref: producerAttemptRef,
    execution_content_binding_sha256: executionBindingSha256,
    workspace_root: workspaceRoot,
    members: [{
      member_id: 'review-input',
      source_ref: sourceRef,
      sha256: sha256(bytes),
      size_bytes: bytes.length,
    }],
  } satisfies ReviewerInputSnapshotMaterializationRequest;
}

function expectedAuthority(overrides: Record<string, unknown> = {}) {
  return {
    producer_attempt_ref: producerAttemptRef,
    execution_content_binding_sha256: executionBindingSha256,
    owner_authority_refs: [ownerAuthorityRef],
    ...overrides,
  } as any;
}

function withFixture(
  run: (input: { workspaceRoot: string; outsideRoot: string }) => void,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-transport-'));
  const workspaceRoot = path.join(root, 'workspace');
  const outsideRoot = path.join(root, 'outside');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(outsideRoot);
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    run({ workspaceRoot, outsideRoot });
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertFailureCode(run: () => unknown, expected: string) {
  assert.throws(run, (error: unknown) => (
    error instanceof FrameworkContractError
    && error.details?.failure_code === expected
  ));
}

test('reviewer snapshot persists generic immutable members and opaque owner authority', () => {
  withFixture(({ workspaceRoot }) => {
    const bytes = Buffer.from('review bytes\n');
    fs.writeFileSync(path.join(workspaceRoot, 'review.bin'), bytes);
    const request = requestFor(workspaceRoot, 'review.bin', bytes);
    const first = materializeReviewerInputSnapshot(request, expectedAuthority());
    assert.equal(first.materialization_status, 'materialized');
    assert.deepEqual(Object.keys(first.manifest), [
      'surface_kind',
      'schema_version',
      'owner_authority_ref',
      'producer_attempt_ref',
      'execution_content_binding_sha256',
      'members',
    ]);
    assert.equal(first.manifest.schema_version, 3);
    assert.deepEqual(first.manifest.owner_authority_ref, ownerAuthorityRef);
    assert.deepEqual(Object.keys(first.manifest.members[0]!), [
      'member_id',
      'sha256',
      'size_bytes',
      'immutable_ref',
    ]);
    assert.deepEqual(
      fs.readFileSync(fileURLToPath(first.manifest.members[0]!.immutable_ref.ref)),
      bytes,
    );
    assert.deepEqual(first.review_input_snapshot_binding, {
      surface_kind: 'opl_reviewer_input_snapshot_binding',
      schema_version: 3,
      snapshot_manifest_ref: first.manifest_ref,
      owner_authority_ref: ownerAuthorityRef,
      producer_attempt_ref: producerAttemptRef,
      execution_content_binding_sha256: executionBindingSha256,
    });

    fs.writeFileSync(path.join(workspaceRoot, 'review.bin'), 'changed live bytes\n');
    const second = materializeReviewerInputSnapshot(request, expectedAuthority());
    assert.equal(second.materialization_status, 'already_materialized');
    assert.deepEqual(second.manifest_ref, first.manifest_ref);
  });
});

test('reviewer snapshot fails closed on authority, containment, and byte mismatches', () => {
  withFixture(({ workspaceRoot, outsideRoot }) => {
    const bytes = Buffer.from('review bytes\n');
    fs.writeFileSync(path.join(workspaceRoot, 'review.bin'), bytes);
    const request = requestFor(workspaceRoot, 'review.bin', bytes);
    assertFailureCode(
      () => materializeReviewerInputSnapshot(request, expectedAuthority({
        execution_content_binding_sha256: sha256('other binding'),
      })),
      'reviewer_input_snapshot_authority_binding_mismatch',
    );
    assertFailureCode(
      () => materializeReviewerInputSnapshot({
        ...request,
        members: [{ ...request.members[0]!, sha256: sha256('wrong bytes') }],
      }, expectedAuthority()),
      'reviewer_input_snapshot_member_identity_mismatch',
    );

    fs.writeFileSync(path.join(outsideRoot, 'outside.bin'), bytes);
    fs.symlinkSync(path.join(outsideRoot, 'outside.bin'), path.join(workspaceRoot, 'escape.bin'));
    assertFailureCode(
      () => materializeReviewerInputSnapshot(
        requestFor(workspaceRoot, 'escape.bin', bytes),
        expectedAuthority(),
      ),
      'reviewer_input_snapshot_source_path_escape',
    );
  });
});

test('snapshot readback verifies exact immutable bytes and missing input remains quality debt', () => {
  withFixture(({ workspaceRoot }) => {
    const missing = resolveReviewerInputSnapshotMaterialization(null, expectedAuthority());
    if (!('status' in missing)) assert.fail('expected snapshot quality debt');
    assert.equal(missing.status, 'quality_debt');
    assert.equal(missing.reason_code, 'review_input_snapshot_binding_required');

    const bytes = Buffer.from('review bytes\n');
    fs.writeFileSync(path.join(workspaceRoot, 'review.bin'), bytes);
    const materialized = materializeReviewerInputSnapshot(
      requestFor(workspaceRoot, 'review.bin', bytes),
      expectedAuthority(),
    );
    assert.deepEqual(
      readReviewerInputSnapshotManifest(materialized.manifest_ref).manifest,
      materialized.manifest,
    );
    const objectPath = fileURLToPath(materialized.manifest.members[0]!.immutable_ref.ref);
    fs.chmodSync(objectPath, 0o600);
    fs.writeFileSync(objectPath, 'tampered\n');
    assertFailureCode(
      () => readReviewerInputSnapshotManifest(materialized.manifest_ref),
      'review_transport_exact_ref_byte_mismatch',
    );
  });
});

function artifactCandidate() {
  return {
    surface_kind: 'scholarskills_page_hash_evidence_candidate',
    schema_version: 3,
    review_scope_sha256: sha256('display scope'),
    rubric_sha256: sha256('display rubric'),
    evidence_payload: {
      owner_defined: true,
      pages: [{ page_number: 1, pixel_sha256: sha256('page pixels') }],
    },
    cache_key_sha256: sha256('owner cache key'),
    origin_reviewer_evidence_ref: exactRef(
      'scholarskills_display_evidence',
      'scholarskills://display/evidence/1',
      'origin evidence',
    ),
  };
}

function artifactContext() {
  return {
    producer_attempt_ref: 'opl://stage_attempts/reviewer',
    execution_content_binding_sha256: sha256('reviewer execution binding'),
    producer_package: {
      package_id: 'mas-scholar-skills',
      package_content_digest: sha256('scholarskills package'),
    },
    origin_evidence_ref: exactRef(
      'scholarskills_display_evidence',
      'scholarskills://display/evidence/1',
      'origin evidence',
    ),
  };
}

test('review evidence receipt persists an opaque candidate without cache semantics', () => {
  withFixture(() => {
    const candidate = artifactCandidate();
    const context = artifactContext();
    const first = persistReviewEvidenceArtifactCandidate(candidate, context);
    const second = persistReviewEvidenceArtifactCandidate(candidate, context);
    assert.deepEqual(second.receipt_ref, first.receipt_ref);
    assert.deepEqual(second.candidate_ref, first.candidate_ref);
    assert.deepEqual(second.candidate, candidate);
    assert.deepEqual(Object.keys(first.receipt), [
      'surface_kind',
      'schema_version',
      'candidate_ref',
      'producer_attempt_ref',
      'execution_content_binding_sha256',
      'producer_package',
      'origin_evidence_ref',
    ]);
    assert.equal(first.receipt.surface_kind, 'opl_review_evidence_artifact_receipt');
    assert.equal(first.receipt.schema_version, 1);
    assert.deepEqual(first.receipt.producer_package, context.producer_package);
    assert.deepEqual(first.receipt.origin_evidence_ref, context.origin_evidence_ref);
    assert.equal(Object.hasOwn(first.receipt, 'cache_hit'), false);
    assert.equal(Object.hasOwn(first.receipt, 'cache_reuse_eligible'), false);
    assert.deepEqual(
      readReviewEvidenceArtifactReceipt(first.receipt_ref, first.receipt).candidate,
      candidate,
    );
  });
});

test('review evidence receipt requires complete Attempt and package binding and detects tampering', () => {
  withFixture(() => {
    assertFailureCode(
      () => persistReviewEvidenceArtifactCandidate(artifactCandidate()),
      'review_transport_shape_invalid',
    );
    assertFailureCode(
      () => persistReviewEvidenceArtifactCandidate(artifactCandidate(), {
        ...artifactContext(),
        producer_package: {
          ...artifactContext().producer_package,
          package_content_digest: 'not-a-digest',
        },
      }),
      'review_transport_digest_invalid',
    );
    const persisted = persistReviewEvidenceArtifactCandidate(artifactCandidate(), artifactContext());
    const receiptPath = fileURLToPath(persisted.receipt_ref.ref);
    fs.chmodSync(receiptPath, 0o600);
    fs.writeFileSync(receiptPath, `${fs.readFileSync(receiptPath, 'utf8')}\n`);
    assertFailureCode(
      () => readReviewEvidenceArtifactReceipt(persisted.receipt_ref),
      'review_transport_exact_ref_byte_mismatch',
    );
  });
});

test('revision transport remains independent from owner authority', () => {
  withFixture(() => {
    const receipt: StageReviewReceipt = {
      surface_kind: 'opl_stage_review_receipt',
      version: 'stage-review-receipt.v1',
      stage_run_id: 'stage-run:revision',
      quality_cycle_id: 'quality-cycle:revision',
      producer_attempt_ref: 'opl://stage_attempts/repairer',
      reviewer_attempt_ref: 'opl://stage_attempts/re-reviewer',
      producer_session_ref: 'codex://threads/repairer',
      reviewer_session_ref: 'codex://threads/re-reviewer',
      no_context_inheritance: true,
      reviewed_artifact_refs: ['workspace://submission/paper.docx'],
      reviewed_artifact_hashes: [sha256('paper revision')],
      rubric_refs: ['mas://rubrics/manuscript'],
      verdict: 'pass',
      review_input_snapshot_status: 'quality_debt',
      review_input_snapshot_binding: null,
      opl_reviewer_input_snapshot_manifest_ref: null,
      opl_reviewer_input_snapshot_manifest: null,
      review_input_snapshot_quality_debt_receipt_ref: 'opl://quality-debt/snapshot',
      review_input_snapshot_quality_debt_receipt: {
        surface_kind: 'opl_review_input_snapshot_quality_debt_receipt',
      },
      opl_review_evidence_artifact_receipt_ref: null,
      opl_review_evidence_artifact_receipt: null,
      finding_lineage: {
        review_kind: 'finding_closure_review',
        finding_ids: ['finding:revision-1'],
        findings_sha256: sha256('findings'),
        repair_map_sha256: sha256('repair map'),
        re_review_result_sha256: sha256('re-review result'),
      },
    };
    const transport = materializeOplRevisionTransport(receipt);
    const readback = readOplRevisionIntake(transport.opl_revision_intake_ref);
    assert.deepEqual(readback.stage_review_receipt, receipt);
    const context = revisionTransportContext({
      revisionIntakeRefs: [transport.opl_revision_intake_ref],
      oplStageReviewReceiptRef: transport.opl_stage_review_receipt_ref,
    });
    assert.equal(context.progress_policy.stage_transition_allowed, true);
    assert.equal(context.mas_revision_consumption_binding, null);
  });
});
