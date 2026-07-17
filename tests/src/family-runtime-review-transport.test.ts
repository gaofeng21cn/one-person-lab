import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes, canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import {
  materializeReviewerInputSnapshot,
  readReviewerInputSnapshotManifest,
  resolveReviewerInputSnapshotMaterialization,
  type ReviewerInputSnapshotMaterializationRequest,
  type ReviewerInputSnapshotMember,
} from '../../src/modules/runway/family-runtime-reviewer-input-snapshot.ts';
import {
  persistCanonicalReviewTransportJson,
  reviewTransportRoots,
} from '../../src/modules/runway/family-runtime-review-transport-store.ts';
import { runFamilyRuntime } from '../../src/modules/runway/family-runtime.ts';
import {
  materializeOplRevisionTransport,
  readOplRevisionIntake,
  revisionTransportContext,
} from '../../src/modules/runway/family-runtime-revision-intake.ts';
import type { StageReviewReceipt } from '../../src/modules/stagecraft/public/stage-quality-cycle.ts';
import {
  evaluateReviewEvidenceCacheReceipt,
  persistReviewEvidenceCacheCandidate,
  readReviewEvidenceCacheReceipt,
  reviewEvidenceCacheKey,
} from '../../src/modules/runway/family-runtime-review-evidence-cache.ts';

const rasterContract = {
  contract_id: 'scholarskills_pdf_page_pixel_raster',
  contract_version: 1,
  scale_x: 2,
  scale_y: 2,
  nominal_dpi: 144,
  colorspace: 'sRGB',
  pixel_format: 'RGB8',
  alpha: false,
  annotations: true,
  hash_algorithm: 'sha256',
  page_order: 'document_order',
} as const;

function sha256(bytes: Buffer | string) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function pythonCanonicalText(value: unknown) {
  return canonicalJsonText(value).replace(/[^\x00-\x7f]/gu, (character) => (
    [...character].flatMap((codePointCharacter) => {
      const codePoint = codePointCharacter.codePointAt(0)!;
      if (codePoint <= 0xffff) return [`\\u${codePoint.toString(16).padStart(4, '0')}`];
      const shifted = codePoint - 0x10000;
      return [
        `\\u${(0xd800 + (shifted >> 10)).toString(16).padStart(4, '0')}`,
        `\\u${(0xdc00 + (shifted & 0x3ff)).toString(16).padStart(4, '0')}`,
      ];
    }).join('')
  ));
}

function reviewScopeSha256(
  lane: ReviewerInputSnapshotMaterializationRequest['review_lane'],
  members: ReviewerInputSnapshotMember[],
) {
  const reviewedMembers = lane === 'exact_byte_package'
    ? members.map((member) => ({
      member_id: member.member_id,
      role: member.role,
      ref: member.owner_ref,
      size_bytes: member.size_bytes,
      sha256: member.sha256,
    })).sort((left, right) => (
      left.role < right.role ? -1
        : left.role > right.role ? 1
          : left.ref < right.ref ? -1
            : left.ref > right.ref ? 1
              : left.sha256 < right.sha256 ? -1
                : left.sha256 > right.sha256 ? 1 : 0
    ))
    : members.map((member) => ({
      member_id: member.member_id,
      role: member.role,
      sha256: member.sha256,
      size_bytes: member.size_bytes,
    })).sort((left, right) => (
      left.member_id < right.member_id ? -1
        : left.member_id > right.member_id ? 1
          : left.role < right.role ? -1
            : left.role > right.role ? 1
              : left.sha256 < right.sha256 ? -1
                : left.sha256 > right.sha256 ? 1
                  : left.size_bytes - right.size_bytes
    ));
  return sha256(pythonCanonicalText({
    scope_policy_id: 'mas_review_scope_dependency_map',
    scope_policy_version: 1,
    review_lane: lane,
    reviewed_members: reviewedMembers,
  }));
}

function requestFor(input: {
  workspaceRoot: string;
  lane?: ReviewerInputSnapshotMaterializationRequest['review_lane'];
  members: ReviewerInputSnapshotMember[];
}): ReviewerInputSnapshotMaterializationRequest {
  const lane = input.lane ?? 'medical';
  const reviewScope = reviewScopeSha256(lane, input.members);
  const authorityRecord = {
    surface_kind: 'mas_review_input_snapshot_authority' as const,
    schema_version: 1 as const,
    generation_ref: 'mas-generation:test',
    review_lane: lane,
    review_scope_sha256: reviewScope,
    members: input.members.map(({ source_ref: _sourceRef, ...member }) => member),
  };
  const authorityBytes = Buffer.from(pythonCanonicalText(authorityRecord), 'utf8');
  const authoritySha256 = sha256(authorityBytes);
  return {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
    schema_version: 1,
    generation_ref: 'mas-generation:test',
    review_lane: lane,
    review_scope_sha256: reviewScope,
    workspace_root: input.workspaceRoot,
    members: input.members,
    mas_authority_record_ref: {
      kind: 'mas_review_input_snapshot_authority',
      ref: `mas-review-input-snapshot-authority:${authoritySha256.slice('sha256:'.length)}`,
      size_bytes: authorityBytes.length,
      sha256: authoritySha256,
    },
    mas_authority_record: authorityRecord,
  };
}

function withFixture(run: (fixture: { workspaceRoot: string; outsideRoot: string }) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-transport-'));
  const workspaceRoot = path.join(root, 'workspace');
  const outsideRoot = path.join(root, 'outside');
  const stateRoot = path.join(root, 'state');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(outsideRoot);
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    run({ workspaceRoot, outsideRoot });
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function withAsyncFixture(
  run: (fixture: { workspaceRoot: string; outsideRoot: string }) => Promise<void>,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-review-transport-'));
  const workspaceRoot = path.join(root, 'workspace');
  const outsideRoot = path.join(root, 'outside');
  const stateRoot = path.join(root, 'state');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(outsideRoot);
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    await run({ workspaceRoot, outsideRoot });
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

function pageEvidenceCandidate(input: {
  reviewScopeSha256?: string;
  reviewerAttemptRef?: string;
  reviewerInvocationSha256?: string;
} = {}) {
  const pages = [{
    page_number: 1,
    width: 1200,
    height: 1600,
    pixel_format: 'RGB8' as const,
    pixel_sha256: sha256('page pixels'),
  }];
  const reviewScopeSha256 = input.reviewScopeSha256 ?? sha256('display scope');
  const rubricSha256 = sha256('display rubric');
  return {
    surface_kind: 'scholarskills_page_hash_evidence_candidate',
    schema_version: 1,
    review_lane: 'display',
    review_scope_sha256: reviewScopeSha256,
    rubric_sha256: rubricSha256,
    raster_contract: rasterContract,
    pages,
    cache_key_sha256: reviewEvidenceCacheKey({ pages, reviewScopeSha256, rubricSha256 }),
    origin_reviewer_invocation_ref: {
      kind: 'opl_stage_attempt',
      ref: input.reviewerAttemptRef ?? 'opl://stage_attempts/reviewer',
      sha256: input.reviewerInvocationSha256 ?? sha256('reviewer invocation'),
    },
    origin_reviewer_evidence_ref: {
      kind: 'scholarskills_display_evidence',
      ref: 'scholarskills://display/review-evidence',
      sha256: sha256('review evidence'),
    },
    cache_reuse_eligible: true,
    cache_authority: false,
    requires_fresh_reviewer_invocation: true,
    requires_fresh_reviewer_receipt: true,
    requires_mas_judgment: true,
    authority_boundary: {
      can_emit_verdict: false,
      can_sign_reviewer_receipt: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_quality_readiness: false,
      can_claim_publication_readiness: false,
      can_claim_current_package_authority: false,
    },
  };
}

function pageEvidenceFixture(
  workspaceRoot: string,
  lane: ReviewerInputSnapshotMaterializationRequest['review_lane'] = 'display',
) {
  const sourceRef = 'display.pdf';
  const sourceBytes = Buffer.from('display review bytes\n');
  fs.writeFileSync(path.join(workspaceRoot, sourceRef), sourceBytes);
  const snapshot = materializeReviewerInputSnapshot(requestFor({
    workspaceRoot,
    lane,
    members: [{
      member_id: 'display-pdf',
      role: 'review_pdf',
      owner_ref: 'workspace://submission/display.pdf',
      source_ref: sourceRef,
      sha256: sha256(sourceBytes),
      size_bytes: sourceBytes.length,
    }],
  }));
  const candidate = pageEvidenceCandidate({
    reviewScopeSha256: snapshot.manifest.review_scope_sha256,
  });
  const context = {
    reviewer_attempt_ref: candidate.origin_reviewer_invocation_ref.ref,
    execution_content_binding_sha256: candidate.origin_reviewer_invocation_ref.sha256,
    snapshot_manifest_ref: snapshot.manifest_ref,
    snapshot_manifest_sha256: snapshot.manifest_ref.sha256,
    review_scope_sha256: candidate.review_scope_sha256,
    rubric_sha256: candidate.rubric_sha256,
    origin_reviewer_invocation_ref: candidate.origin_reviewer_invocation_ref,
    origin_reviewer_evidence_ref: candidate.origin_reviewer_evidence_ref,
  };
  return { candidate, context, snapshot };
}

test('reviewer input snapshot freezes bytes and cache hits do not re-read changed live content', () => {
  withFixture(({ workspaceRoot }) => {
    const sourceRef = 'paper.txt';
    const sourcePath = path.join(workspaceRoot, sourceRef);
    const original = Buffer.from('reviewed bytes\n');
    fs.writeFileSync(sourcePath, original);
    const request = requestFor({
      workspaceRoot,
      members: [{
        member_id: 'manuscript',
        role: 'manuscript_file',
        owner_ref: 'workspace://submission/paper.txt',
        source_ref: sourceRef,
        sha256: sha256(original),
        size_bytes: original.length,
      }],
    });

    const first = materializeReviewerInputSnapshot(request);
    assert.equal(first.materialization_status, 'materialized');
    const immutableRef = first.manifest.members[0]!.immutable_ref.ref;
    assert.deepEqual(fs.readFileSync(fileURLToPath(immutableRef)), original);

    fs.writeFileSync(sourcePath, 'new live bytes that are not part of the frozen review input\n');
    const second = materializeReviewerInputSnapshot(request);
    assert.equal(second.materialization_status, 'already_materialized');
    assert.equal(second.manifest_ref.sha256, first.manifest_ref.sha256);
    assert.deepEqual(fs.readFileSync(fileURLToPath(immutableRef)), original);
  });
});

test('reviewer input snapshot validates absolute and symlink containment even on object cache hits', () => {
  withFixture(({ workspaceRoot, outsideRoot }) => {
    const sourcePath = path.join(workspaceRoot, 'paper.txt');
    const original = Buffer.from('reviewed bytes\n');
    fs.writeFileSync(sourcePath, original);
    const member = {
      member_id: 'manuscript',
      role: 'manuscript_file',
      owner_ref: 'workspace://submission/paper.txt',
      source_ref: 'paper.txt',
      sha256: sha256(original),
      size_bytes: original.length,
    };
    materializeReviewerInputSnapshot(requestFor({ workspaceRoot, members: [member] }));

    const outsidePath = path.join(outsideRoot, 'outside.txt');
    fs.writeFileSync(outsidePath, original);
    assertFailureCode(
      () => materializeReviewerInputSnapshot(requestFor({
        workspaceRoot,
        members: [{ ...member, source_ref: outsidePath }],
      })),
      'reviewer_input_snapshot_source_path_escape',
    );

    const symlinkRef = 'outside-link.txt';
    fs.symlinkSync(outsidePath, path.join(workspaceRoot, symlinkRef));
    assertFailureCode(
      () => materializeReviewerInputSnapshot(requestFor({
        workspaceRoot,
        members: [{ ...member, source_ref: symlinkRef }],
      })),
      'reviewer_input_snapshot_source_path_escape',
    );
  });
});

test('reviewer input snapshot rejects wrong member digest, size, and MAS scope identity', () => {
  withFixture(({ workspaceRoot }) => {
    const original = Buffer.from('reviewed bytes\n');
    fs.writeFileSync(path.join(workspaceRoot, 'paper.txt'), original);
    const baseMember = {
      member_id: 'manuscript',
      role: 'manuscript_file',
      owner_ref: 'workspace://submission/paper.txt',
      source_ref: 'paper.txt',
      sha256: sha256(original),
      size_bytes: original.length,
    };
    assertFailureCode(
      () => materializeReviewerInputSnapshot(requestFor({
        workspaceRoot,
        members: [{ ...baseMember, sha256: `sha256:${'0'.repeat(64)}` }],
      })),
      'reviewer_input_snapshot_member_identity_mismatch',
    );
    assertFailureCode(
      () => materializeReviewerInputSnapshot(requestFor({
        workspaceRoot,
        members: [{ ...baseMember, size_bytes: original.length + 1 }],
      })),
      'reviewer_input_snapshot_member_identity_mismatch',
    );
    assertFailureCode(
      () => materializeReviewerInputSnapshot({
        ...requestFor({ workspaceRoot, members: [baseMember] }),
        review_scope_sha256: `sha256:${'f'.repeat(64)}`,
      }),
      'reviewer_input_snapshot_review_scope_mismatch',
    );
  });
});

test('exact-byte review scope binds MAS owner_ref independently of materialization source_ref', () => {
  withFixture(({ workspaceRoot }) => {
    const original = Buffer.from('package bytes\n');
    fs.writeFileSync(path.join(workspaceRoot, 'package.zip'), original);
    const member = {
      member_id: 'package',
      role: 'final_zip_member',
      owner_ref: 'workspace://submission/submission.zip',
      source_ref: 'package.zip',
      sha256: sha256(original),
      size_bytes: original.length,
    };
    const request = requestFor({ workspaceRoot, lane: 'exact_byte_package', members: [member] });
    assert.equal(materializeReviewerInputSnapshot(request).materialization_status, 'materialized');
    assert.equal(materializeReviewerInputSnapshot({
      ...request,
      members: [{ ...member, source_ref: './package.zip' }],
    }).materialization_status, 'already_materialized');
    assertFailureCode(() => materializeReviewerInputSnapshot({
      ...request,
      members: [{ ...member, owner_ref: 'workspace://submission/renamed.zip' }],
    }), 'reviewer_input_snapshot_review_scope_mismatch');
  });
});

test('missing reviewer input snapshot request stays non-blocking quality debt', () => {
  const resolution = resolveReviewerInputSnapshotMaterialization(null);
  if (resolution.surface_kind !== 'opl_reviewer_input_snapshot_resolution') {
    assert.fail('missing request must return the typed quality-debt resolution');
  }
  assert.equal(resolution.status, 'quality_debt');
  assert.equal(resolution.hosted_action_launch_allowed, true);
  assert.equal(resolution.ordinary_progress_may_advance, true);
  assert.equal(resolution.stage_transition_allowed, true);
  assert.equal(resolution.quality_publication_export_or_submission_claim_allowed, false);
  assert.equal(resolution.typed_blocker_ref, null);
});

test('reviewer input snapshot binds the MAS authority record and exact ref', () => {
  withFixture(({ workspaceRoot }) => {
    const original = Buffer.from('reviewed bytes\n');
    fs.writeFileSync(path.join(workspaceRoot, 'paper.txt'), original);
    const request = requestFor({
      workspaceRoot,
      members: [{
        member_id: 'manuscript',
        role: 'manuscript_file',
        owner_ref: 'workspace://submission/paper.txt',
        source_ref: 'paper.txt',
        sha256: sha256(original),
        size_bytes: original.length,
      }],
    });
    const materialized = materializeReviewerInputSnapshot(request);
    assert.deepEqual(
      materialized.review_input_snapshot_binding.mas_authority_record_ref,
      request.mas_authority_record_ref,
    );
    assert.equal(materialized.review_input_snapshot_binding.generation_ref, request.generation_ref);
    assert.equal(materialized.review_input_snapshot_binding.materialization_owner, 'one-person-lab');
    assert.equal(materialized.review_input_snapshot_binding.authority_boundary.framework_can_sign_owner_receipt, false);

    assertFailureCode(() => materializeReviewerInputSnapshot({
      ...request,
      mas_authority_record_ref: {
        ...request.mas_authority_record_ref,
        sha256: `sha256:${'0'.repeat(64)}`,
      },
    }), 'reviewer_input_snapshot_authority_ref_mismatch');

    const mismatchedAuthority = {
      ...request.mas_authority_record,
      generation_ref: 'mas-generation:other',
    };
    const mismatchedAuthorityBytes = Buffer.from(pythonCanonicalText(mismatchedAuthority), 'utf8');
    const mismatchedAuthoritySha256 = sha256(mismatchedAuthorityBytes);
    assertFailureCode(() => materializeReviewerInputSnapshot({
      ...request,
      mas_authority_record: mismatchedAuthority,
      mas_authority_record_ref: {
        kind: 'mas_review_input_snapshot_authority',
        ref: `mas-review-input-snapshot-authority:${mismatchedAuthoritySha256.slice('sha256:'.length)}`,
        size_bytes: mismatchedAuthorityBytes.length,
        sha256: mismatchedAuthoritySha256,
      },
    }), 'reviewer_input_snapshot_request_authority_mismatch');
  });
});

test('review transport rejects noncanonical manifest JSON and symlink swaps', () => {
  withFixture(({ workspaceRoot, outsideRoot }) => {
    const original = Buffer.from('reviewed bytes\n');
    fs.writeFileSync(path.join(workspaceRoot, 'paper.txt'), original);
    const materialized = materializeReviewerInputSnapshot(requestFor({
      workspaceRoot,
      members: [{
        member_id: 'manuscript',
        role: 'manuscript_file',
        owner_ref: 'workspace://submission/paper.txt',
        source_ref: 'paper.txt',
        sha256: sha256(original),
        size_bytes: original.length,
      }],
    }));
    const roots = reviewTransportRoots();
    const noncanonicalBytes = Buffer.from(`${JSON.stringify(materialized.manifest, null, 2)}\n`, 'utf8');
    const noncanonicalSha256 = sha256(noncanonicalBytes);
    const noncanonicalPath = path.join(
      roots.reviewer_snapshot_manifest_root,
      `${noncanonicalSha256.slice('sha256:'.length)}.json`,
    );
    fs.writeFileSync(noncanonicalPath, noncanonicalBytes);
    assertFailureCode(() => readReviewerInputSnapshotManifest({
      kind: 'opl_reviewer_input_snapshot_manifest',
      ref: pathToFileURL(noncanonicalPath).href,
      size_bytes: noncanonicalBytes.length,
      sha256: noncanonicalSha256,
    }), 'review_transport_json_noncanonical');

    const manifestPath = fileURLToPath(materialized.manifest_ref.ref);
    const manifestBytes = fs.readFileSync(manifestPath);
    const outsideLeaf = path.join(outsideRoot, path.basename(manifestPath));
    fs.writeFileSync(outsideLeaf, manifestBytes);
    fs.rmSync(manifestPath);
    fs.symlinkSync(outsideLeaf, manifestPath);
    assertFailureCode(
      () => readReviewerInputSnapshotManifest(materialized.manifest_ref),
      'review_transport_exact_ref_not_canonical',
    );
    fs.rmSync(manifestPath);
    fs.writeFileSync(manifestPath, manifestBytes);

    const manifestRoot = roots.reviewer_snapshot_manifest_root;
    const savedRoot = `${manifestRoot}.saved`;
    fs.renameSync(manifestRoot, savedRoot);
    const outsideParent = path.join(outsideRoot, 'manifests');
    fs.mkdirSync(outsideParent);
    fs.copyFileSync(path.join(savedRoot, path.basename(manifestPath)), path.join(outsideParent, path.basename(manifestPath)));
    fs.symlinkSync(outsideParent, manifestRoot);
    assertFailureCode(
      () => readReviewerInputSnapshotManifest(materialized.manifest_ref),
      'review_transport_exact_ref_not_canonical',
    );
  });
});

test('revision transport binds an immutable OPL review receipt without claiming MAS authority', () => {
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
      mas_review_input_snapshot_binding: null,
      opl_reviewer_input_snapshot_manifest_ref: null,
      opl_reviewer_input_snapshot_manifest: null,
      review_input_snapshot_quality_debt_receipt_ref: 'opl://quality-debt/snapshot',
      review_input_snapshot_quality_debt_receipt: {
        surface_kind: 'opl_review_input_snapshot_quality_debt_receipt',
      },
      opl_review_evidence_cache_receipt_ref: null,
      opl_review_evidence_cache_receipt: null,
      opl_review_evidence_cache_receipt_evaluation: null,
      finding_lineage: {
        review_kind: 'finding_closure_review',
        finding_ids: ['finding:revision-1'],
        findings_sha256: sha256('findings'),
        repair_map_sha256: sha256('repair map'),
        re_review_result_sha256: sha256('re-review result'),
      },
    };
    const transport = materializeOplRevisionTransport(receipt);
    assert.equal(transport.opl_revision_intake_ref.kind, 'opl_revision_intake');
    assert.equal(transport.opl_stage_review_receipt_ref.kind, 'opl_stage_review_receipt');
    assert.equal(transport.authority_boundary.can_sign_revision_consumption, false);
    const readback = readOplRevisionIntake(transport.opl_revision_intake_ref);
    assert.deepEqual(readback.revision_intake, transport.opl_revision_intake);
    assert.deepEqual(readback.stage_review_receipt, receipt);
    const context = revisionTransportContext({
      revisionIntakeRefs: [transport.opl_revision_intake_ref],
      oplStageReviewReceiptRef: transport.opl_stage_review_receipt_ref,
    });
    assert.equal(context.progress_policy.stage_transition_allowed, true);
    assert.equal(context.progress_policy.typed_blocker_ref, null);
    assert.equal(context.mas_revision_consumption_binding, null);

    assertFailureCode(() => revisionTransportContext({
      revisionIntakeRefs: [transport.opl_revision_intake_ref],
      oplStageReviewReceiptRef: {
        ...transport.opl_stage_review_receipt_ref,
        sha256: `sha256:${'0'.repeat(64)}`,
      },
    }), 'revision_consumption_context_review_receipt_mismatch');

    const intakePath = fileURLToPath(transport.opl_revision_intake_ref.ref);
    fs.chmodSync(intakePath, 0o600);
    fs.writeFileSync(intakePath, `${fs.readFileSync(intakePath, 'utf8')}\n`);
    assertFailureCode(
      () => readOplRevisionIntake(transport.opl_revision_intake_ref),
      'review_transport_exact_ref_byte_mismatch',
    );
  });
});

test('page evidence cache persists exact receipts while cache hits still require fresh review', () => {
  withFixture(({ workspaceRoot }) => {
    const { candidate, context } = pageEvidenceFixture(workspaceRoot);
    const first = persistReviewEvidenceCacheCandidate(candidate, context);
    assert.equal(first.receipt.status, 'cache_miss_stored');
    assert.equal(first.receipt.cache_hit, false);
    const second = persistReviewEvidenceCacheCandidate(candidate, context);
    assert.equal(second.receipt.status, 'cache_hit');
    assert.equal(second.receipt.cache_hit, true);
    for (const receipt of [first.receipt, second.receipt]) {
      assert.equal(receipt.cache_authority, false);
      assert.equal(receipt.requires_fresh_reviewer_invocation, true);
      assert.equal(receipt.requires_fresh_reviewer_receipt, true);
      assert.equal(receipt.requires_mas_judgment, true);
    }
    const readback = readReviewEvidenceCacheReceipt(second.receipt_ref, context);
    assert.deepEqual(readback.receipt_ref, second.receipt_ref);
    assert.deepEqual(readback.receipt, second.receipt);
    const evaluation = evaluateReviewEvidenceCacheReceipt(second.receipt_ref, context);
    assert.equal(evaluation.status, 'cache_reusable');
    assert.equal(evaluation.cache_reuse_eligible, true);
    assert.equal(evaluation.requires_fresh_reviewer_invocation, true);
    assert.equal(evaluation.requires_fresh_reviewer_receipt, true);
  });
});

test('page evidence cache treats missing or different Attempt context as non-blocking quality debt', () => {
  withFixture(({ workspaceRoot }) => {
    const { candidate, context } = pageEvidenceFixture(workspaceRoot);
    const missing = persistReviewEvidenceCacheCandidate(candidate);
    assert.equal(missing.receipt.status, 'stored_not_reusable');
    assert.equal(missing.receipt.cache_reuse_eligible, false);
    assert.equal(missing.receipt.quality_debt?.reason_code,
      'review_evidence_cache_context_binding_missing');
    assert.equal(missing.receipt.stage_transition_allowed, true);
    assert.equal(missing.receipt.typed_blocker_ref, null);

    const current = persistReviewEvidenceCacheCandidate(candidate, context);
    const substitutedAttempt = evaluateReviewEvidenceCacheReceipt(current.receipt_ref, {
      ...context,
      reviewer_attempt_ref: 'opl://stage_attempts/different-reviewer',
    });
    assert.equal(substitutedAttempt.status, 'quality_debt');
    assert.equal(substitutedAttempt.cache_reuse_eligible, false);
    assert.equal(substitutedAttempt.quality_debt?.reason_code,
      'review_evidence_cache_receipt_context_mismatch');
    assert.equal(substitutedAttempt.stage_transition_allowed, true);
    assert.equal(substitutedAttempt.typed_blocker_ref, null);

    const contradictory = persistReviewEvidenceCacheCandidate(candidate, {
      ...context,
      reviewer_attempt_ref: 'opl://stage_attempts/contradictory-reviewer',
    });
    assert.equal(contradictory.receipt.status, 'stored_not_reusable');
    assert.equal(contradictory.receipt.quality_debt?.reason_code,
      'review_evidence_cache_context_binding_invalid');
    assert.equal(contradictory.receipt.stage_transition_allowed, true);
    assert.equal(contradictory.receipt.typed_blocker_ref, null);
  });
});

test('page evidence cache rejects a non-display snapshot as non-blocking context debt', () => {
  withFixture(({ workspaceRoot }) => {
    const { candidate, context } = pageEvidenceFixture(workspaceRoot, 'medical');
    const persisted = persistReviewEvidenceCacheCandidate(candidate, context);
    assert.equal(persisted.receipt.status, 'stored_not_reusable');
    assert.equal(persisted.receipt.quality_debt?.reason_code,
      'review_evidence_cache_context_binding_invalid');
    assert.equal(persisted.receipt.stage_transition_allowed, true);
    assert.equal(persisted.receipt.typed_blocker_ref, null);
  });
});

test('page evidence cache fails closed when persisted receipt bytes are modified', () => {
  withFixture(({ workspaceRoot }) => {
    const { candidate, context } = pageEvidenceFixture(workspaceRoot);
    const persisted = persistReviewEvidenceCacheCandidate(candidate, context);
    const receiptPath = fileURLToPath(persisted.receipt_ref.ref);
    fs.chmodSync(receiptPath, 0o600);
    fs.writeFileSync(receiptPath, `${fs.readFileSync(receiptPath, 'utf8')}\n`);
    assertFailureCode(
      () => evaluateReviewEvidenceCacheReceipt(persisted.receipt_ref, context),
      'review_transport_exact_ref_byte_mismatch',
    );
  });
});

test('page evidence cache verifies snapshot members and persisted entry origins before reuse', () => {
  withFixture(({ workspaceRoot }) => {
    const firstFixture = pageEvidenceFixture(workspaceRoot);
    const immutableRef = firstFixture.snapshot.manifest.members[0]!.immutable_ref;
    const immutablePath = fileURLToPath(immutableRef.ref);
    fs.chmodSync(immutablePath, 0o600);
    fs.writeFileSync(immutablePath, 'tampered display review bytes\n');
    assertFailureCode(
      () => persistReviewEvidenceCacheCandidate(firstFixture.candidate, firstFixture.context),
      'review_transport_exact_ref_byte_mismatch',
    );
  });

  withFixture(({ workspaceRoot }) => {
    const { candidate, context } = pageEvidenceFixture(workspaceRoot);
    const first = persistReviewEvidenceCacheCandidate(candidate, context);
    assert.ok(first.receipt.stored_entry_ref);
    const entryPath = fileURLToPath(first.receipt.stored_entry_ref!.ref);
    const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8')) as Record<string, unknown>;
    const replacement = {
      ...entry,
      origin_reviewer_invocation_ref: {
        kind: 'opl_stage_attempt',
        ref: 'opl://stage_attempts/replacement',
        sha256: sha256('replacement invocation'),
      },
      origin_reviewer_evidence_ref: {
        kind: 'scholarskills_display_evidence',
        ref: 'scholarskills://display-evidence/replacement',
        sha256: sha256('replacement evidence'),
      },
    };
    const replacementBytes = canonicalJsonBytes(replacement);
    const replacementPath = path.join(
      path.dirname(entryPath),
      `${sha256(replacementBytes).slice('sha256:'.length)}.json`,
    );
    fs.rmSync(entryPath);
    fs.writeFileSync(replacementPath, replacementBytes, { mode: 0o444 });
    assertFailureCode(
      () => persistReviewEvidenceCacheCandidate(candidate, context),
      'review_evidence_cache_entry_context_mismatch',
    );
  });
});

test('page evidence cache refuses symlink persistence roots before creating outside bytes', () => {
  withFixture(({ outsideRoot }) => {
    const roots = reviewTransportRoots();
    fs.mkdirSync(path.dirname(roots.evidence_cache_candidate_root), { recursive: true });
    fs.symlinkSync(outsideRoot, roots.evidence_cache_candidate_root, 'dir');
    const before = fs.readdirSync(outsideRoot);
    assertFailureCode(
      () => persistReviewEvidenceCacheCandidate(pageEvidenceCandidate()),
      'review_transport_persist_root_untrusted',
    );
    assert.deepEqual(fs.readdirSync(outsideRoot), before);
  });
});

test('page evidence cache binds unsupported receipt bodies and canonical top-level refs', () => {
  withFixture(({ workspaceRoot }) => {
    const { candidate, context } = pageEvidenceFixture(workspaceRoot);
    const current = persistReviewEvidenceCacheCandidate(candidate, context);
    const aliasRef = {
      ...current.receipt_ref,
      ref: current.receipt_ref.ref.replace('/receipts/', '/receipts/../receipts/'),
    };
    assertFailureCode(
      () => evaluateReviewEvidenceCacheReceipt(aliasRef, context),
      'review_transport_exact_ref_not_canonical',
    );

    const legacyBody = {
      surface_kind: 'opl_review_evidence_cache_receipt',
      schema_version: 1,
      status: 'legacy',
    };
    const legacy = persistCanonicalReviewTransportJson({
      root: reviewTransportRoots().evidence_cache_receipt_root,
      kind: 'opl_review_evidence_cache_receipt',
      value: legacyBody,
    });
    const evaluation = evaluateReviewEvidenceCacheReceipt(
      legacy.exact_ref,
      context,
      legacyBody,
    );
    assert.equal(evaluation.status, 'quality_debt');
    assert.equal(evaluation.quality_debt?.reason_code,
      'review_evidence_cache_receipt_unsupported');
    assertFailureCode(
      () => evaluateReviewEvidenceCacheReceipt(
        legacy.exact_ref,
        context,
        { ...legacyBody, status: 'substituted' },
      ),
      'review_evidence_cache_receipt_persisted_body_mismatch',
    );
  });
});

test('family-runtime review evidence-cache accepts current context and keeps legacy candidate intake', async () => {
  await withAsyncFixture(async ({ workspaceRoot }) => {
    const { candidate, context } = pageEvidenceFixture(workspaceRoot);
    const wrapped = await runFamilyRuntime([
      'review',
      'evidence-cache',
      '--payload',
      JSON.stringify({ candidate, context_binding: context }),
    ]);
    const wrappedReceipt = (wrapped.family_runtime_review_evidence_cache as {
      receipt: Record<string, unknown>;
    }).receipt;
    assert.equal(wrappedReceipt.status, 'cache_miss_stored');
    assert.equal(wrappedReceipt.cache_reuse_eligible, true);

    const legacy = await runFamilyRuntime([
      'review',
      'evidence-cache',
      '--payload',
      JSON.stringify(candidate),
    ]);
    const legacyReceipt = (legacy.family_runtime_review_evidence_cache as {
      receipt: Record<string, unknown>;
    }).receipt;
    assert.equal(legacyReceipt.status, 'stored_not_reusable');
    assert.equal((legacyReceipt.quality_debt as Record<string, unknown>).reason_code,
      'review_evidence_cache_context_binding_missing');
    assert.equal(legacyReceipt.stage_transition_allowed, true);
    assert.equal(legacyReceipt.typed_blocker_ref, null);
  });
});

test('page evidence cache fails closed for key, page hash, scope, raster, and order drift', () => {
  withFixture(() => {
    const candidate = pageEvidenceCandidate();
    const cases: Array<{ value: unknown; failureCode: string }> = [
      {
        value: { ...candidate, cache_key_sha256: `sha256:${'0'.repeat(64)}` },
        failureCode: 'review_evidence_cache_key_mismatch',
      },
      {
        value: {
          ...candidate,
          pages: [{ ...candidate.pages[0]!, pixel_sha256: 'not-a-digest' }],
        },
        failureCode: 'review_transport_digest_invalid',
      },
      {
        value: { ...candidate, review_scope_sha256: 'not-a-digest' },
        failureCode: 'review_transport_digest_invalid',
      },
      {
        value: {
          ...candidate,
          raster_contract: { ...candidate.raster_contract, nominal_dpi: 72 },
        },
        failureCode: 'review_evidence_cache_raster_contract_mismatch',
      },
      {
        value: {
          ...candidate,
          pages: [{ ...candidate.pages[0]!, page_number: 2 }],
        },
        failureCode: 'review_evidence_cache_page_order_invalid',
      },
    ];
    for (const item of cases) {
      assertFailureCode(() => persistReviewEvidenceCacheCandidate(item.value), item.failureCode);
    }
  });
});
