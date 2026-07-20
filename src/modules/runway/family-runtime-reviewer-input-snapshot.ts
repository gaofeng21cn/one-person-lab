import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  canonicalReviewTransportSha256,
  persistCanonicalReviewTransportJson,
  persistReviewerSnapshotObject,
  readReviewTransportFileExactRef,
  readReviewTransportJsonExactRef,
  requireExactReviewTransportKeys,
  requireReviewTransportRecord,
  requiredReviewTransportText,
  resolveContainedWorkspaceFile,
  reviewTransportError,
  reviewTransportRoots,
  reviewTransportSize,
  type ReviewTransportExactRef,
} from './family-runtime-review-transport-store.ts';

export type ReviewerInputSnapshotMember = {
  member_id: string;
  source_ref: string;
  sha256: string;
  size_bytes: number;
};

export type ReviewerInputSnapshotMaterializationRequest = {
  surface_kind: 'opl_reviewer_input_snapshot_materialization_request';
  schema_version: 2;
  owner_authority_ref: ReviewTransportExactRef;
  producer_attempt_ref: string;
  execution_content_binding_sha256: string;
  workspace_root: string;
  members: ReviewerInputSnapshotMember[];
};

export type ReviewerInputSnapshotAuthorityBinding = {
  producer_attempt_ref: string;
  execution_content_binding_sha256: string;
  owner_authority_refs: ReviewTransportExactRef[];
};

function normalizeExactRef(value: unknown, field: string): ReviewTransportExactRef {
  const exactRef = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(exactRef, ['kind', 'ref', 'size_bytes', 'sha256'], field);
  return {
    kind: requiredReviewTransportText(exactRef.kind, `${field}.kind`),
    ref: requiredReviewTransportText(exactRef.ref, `${field}.ref`),
    size_bytes: reviewTransportSize(exactRef.size_bytes, `${field}.size_bytes`),
    sha256: canonicalReviewTransportSha256(exactRef.sha256, `${field}.sha256`),
  };
}

function normalizeAttemptRef(value: unknown, field: string) {
  const attemptRef = requiredReviewTransportText(value, field);
  if (!attemptRef.startsWith('opl://stage_attempts/') || !attemptRef.slice('opl://stage_attempts/'.length)) {
    throw reviewTransportError(
      'reviewer_input_snapshot_producer_attempt_ref_invalid',
      'Reviewer input snapshot must bind one persisted OPL Stage Attempt.',
      { field, producer_attempt_ref: attemptRef },
    );
  }
  return attemptRef;
}

function normalizeMember(value: unknown, index: number): ReviewerInputSnapshotMember {
  const field = `members[${index}]`;
  const member = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(
    member,
    ['member_id', 'source_ref', 'sha256', 'size_bytes'],
    field,
  );
  return {
    member_id: requiredReviewTransportText(member.member_id, `${field}.member_id`),
    source_ref: requiredReviewTransportText(member.source_ref, `${field}.source_ref`),
    sha256: canonicalReviewTransportSha256(member.sha256, `${field}.sha256`),
    size_bytes: reviewTransportSize(member.size_bytes, `${field}.size_bytes`),
  };
}

function normalizeAuthorityBinding(
  value: ReviewerInputSnapshotAuthorityBinding,
): ReviewerInputSnapshotAuthorityBinding {
  if (!Array.isArray(value.owner_authority_refs)) {
    throw reviewTransportError(
      'reviewer_input_snapshot_owner_authority_metadata_missing',
      'Reviewer input snapshot authority must be present in producer closeout exact-ref metadata.',
    );
  }
  return {
    producer_attempt_ref: normalizeAttemptRef(
      value.producer_attempt_ref,
      'expected_authority.producer_attempt_ref',
    ),
    execution_content_binding_sha256: canonicalReviewTransportSha256(
      value.execution_content_binding_sha256,
      'expected_authority.execution_content_binding_sha256',
    ),
    owner_authority_refs: value.owner_authority_refs.map((ref, index) => (
      normalizeExactRef(ref, `expected_authority.owner_authority_refs[${index}]`)
    )),
  };
}

export function normalizeReviewerInputSnapshotRequest(
  value: unknown,
  expectedAuthority?: ReviewerInputSnapshotAuthorityBinding,
): ReviewerInputSnapshotMaterializationRequest {
  const request = requireReviewTransportRecord(value, 'reviewer_input_snapshot_request');
  requireExactReviewTransportKeys(request, [
    'surface_kind',
    'schema_version',
    'owner_authority_ref',
    'producer_attempt_ref',
    'execution_content_binding_sha256',
    'workspace_root',
    'members',
  ], 'reviewer_input_snapshot_request');
  if (
    request.surface_kind !== 'opl_reviewer_input_snapshot_materialization_request'
    || request.schema_version !== 2
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_request_version_invalid',
      'Reviewer input snapshot request must use Framework schema 2.',
    );
  }
  if (!Array.isArray(request.members) || request.members.length === 0) {
    throw reviewTransportError(
      'reviewer_input_snapshot_members_missing',
      'Reviewer input snapshot request must contain a non-empty member inventory.',
    );
  }
  const members = request.members.map(normalizeMember);
  const memberIds = members.map((member) => member.member_id);
  if (new Set(memberIds).size !== memberIds.length) {
    throw reviewTransportError(
      'reviewer_input_snapshot_member_id_duplicate',
      'Reviewer input snapshot request contains duplicate member ids.',
      { member_ids: memberIds },
    );
  }
  const normalized = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request' as const,
    schema_version: 2 as const,
    owner_authority_ref: normalizeExactRef(request.owner_authority_ref, 'owner_authority_ref'),
    producer_attempt_ref: normalizeAttemptRef(request.producer_attempt_ref, 'producer_attempt_ref'),
    execution_content_binding_sha256: canonicalReviewTransportSha256(
      request.execution_content_binding_sha256,
      'execution_content_binding_sha256',
    ),
    workspace_root: requiredReviewTransportText(request.workspace_root, 'workspace_root'),
    members,
  };
  if (expectedAuthority) {
    const expected = normalizeAuthorityBinding(expectedAuthority);
    const authorityMetadataMatch = expected.owner_authority_refs.some((ref) => (
      canonicalJsonText(ref) === canonicalJsonText(normalized.owner_authority_ref)
    ));
    if (
      normalized.producer_attempt_ref !== expected.producer_attempt_ref
      || normalized.execution_content_binding_sha256
        !== expected.execution_content_binding_sha256
      || !authorityMetadataMatch
    ) {
      throw reviewTransportError(
        'reviewer_input_snapshot_authority_binding_mismatch',
        'Reviewer input snapshot request does not match its producer Attempt binding and closeout metadata.',
        { producer_attempt_ref: normalized.producer_attempt_ref },
      );
    }
  }
  return normalized;
}

function memberExactRef(member: ReviewerInputSnapshotMember): ReviewTransportExactRef {
  return {
    kind: 'opl_reviewer_input_snapshot_member',
    ref: pathToFileURL(path.join(
      reviewTransportRoots().reviewer_snapshot_object_root,
      `${member.sha256.slice('sha256:'.length)}.bin`,
    )).href,
    size_bytes: member.size_bytes,
    sha256: member.sha256,
  };
}

function manifestForRequest(request: ReviewerInputSnapshotMaterializationRequest) {
  return {
    surface_kind: 'opl_reviewer_input_snapshot_manifest',
    schema_version: 3,
    owner_authority_ref: request.owner_authority_ref,
    producer_attempt_ref: request.producer_attempt_ref,
    execution_content_binding_sha256: request.execution_content_binding_sha256,
    members: request.members.map((member) => ({
      member_id: member.member_id,
      sha256: member.sha256,
      size_bytes: member.size_bytes,
      immutable_ref: memberExactRef(member),
    })),
  } as const;
}

function bindingForManifest(
  manifest: ReturnType<typeof manifestForRequest>,
  manifestRef: ReviewTransportExactRef,
) {
  return {
    surface_kind: 'opl_reviewer_input_snapshot_binding',
    schema_version: 3,
    snapshot_manifest_ref: manifestRef,
    owner_authority_ref: manifest.owner_authority_ref,
    producer_attempt_ref: manifest.producer_attempt_ref,
    execution_content_binding_sha256: manifest.execution_content_binding_sha256,
  } as const;
}

export function readReviewerInputSnapshotManifest(exactRef: unknown) {
  const roots = reviewTransportRoots();
  const persisted = readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'opl_reviewer_input_snapshot_manifest',
    trustedRoot: roots.reviewer_snapshot_manifest_root,
  });
  const manifest = persisted.value;
  requireExactReviewTransportKeys(manifest, [
    'surface_kind',
    'schema_version',
    'owner_authority_ref',
    'producer_attempt_ref',
    'execution_content_binding_sha256',
    'members',
  ], 'reviewer_input_snapshot_manifest');
  if (
    manifest.surface_kind !== 'opl_reviewer_input_snapshot_manifest'
    || manifest.schema_version !== 3
    || !Array.isArray(manifest.members)
    || manifest.members.length === 0
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_manifest_invalid',
      'Reviewer input snapshot manifest must use Framework schema 3.',
    );
  }
  const members = manifest.members.map((value, index) => {
    const field = `reviewer_input_snapshot_manifest.members[${index}]`;
    const member = requireReviewTransportRecord(value, field);
    requireExactReviewTransportKeys(
      member,
      ['member_id', 'sha256', 'size_bytes', 'immutable_ref'],
      field,
    );
    const normalized = {
      member_id: requiredReviewTransportText(member.member_id, `${field}.member_id`),
      sha256: canonicalReviewTransportSha256(member.sha256, `${field}.sha256`),
      size_bytes: reviewTransportSize(member.size_bytes, `${field}.size_bytes`),
      immutable_ref: normalizeExactRef(member.immutable_ref, `${field}.immutable_ref`),
    };
    const immutable = readReviewTransportFileExactRef({
      exactRef: normalized.immutable_ref,
      expectedKind: 'opl_reviewer_input_snapshot_member',
      trustedRoot: roots.reviewer_snapshot_object_root,
    });
    if (
      immutable.exact_ref.sha256 !== normalized.sha256
      || immutable.exact_ref.size_bytes !== normalized.size_bytes
    ) {
      throw reviewTransportError(
        'reviewer_input_snapshot_manifest_member_mismatch',
        'Reviewer input snapshot manifest member does not bind its immutable bytes.',
        { member_id: normalized.member_id },
      );
    }
    return { ...normalized, immutable_ref: immutable.exact_ref };
  });
  const memberIds = members.map((member) => member.member_id);
  if (new Set(memberIds).size !== memberIds.length) {
    throw reviewTransportError(
      'reviewer_input_snapshot_manifest_member_id_duplicate',
      'Reviewer input snapshot manifest contains duplicate member ids.',
    );
  }
  const normalizedManifest = {
    surface_kind: 'opl_reviewer_input_snapshot_manifest' as const,
    schema_version: 3 as const,
    owner_authority_ref: normalizeExactRef(
      manifest.owner_authority_ref,
      'reviewer_input_snapshot_manifest.owner_authority_ref',
    ),
    producer_attempt_ref: normalizeAttemptRef(
      manifest.producer_attempt_ref,
      'reviewer_input_snapshot_manifest.producer_attempt_ref',
    ),
    execution_content_binding_sha256: canonicalReviewTransportSha256(
      manifest.execution_content_binding_sha256,
      'reviewer_input_snapshot_manifest.execution_content_binding_sha256',
    ),
    members,
  };
  return {
    manifest_ref: persisted.exact_ref,
    manifest: normalizedManifest,
    binding: bindingForManifest(normalizedManifest, persisted.exact_ref),
  };
}

export function materializeReviewerInputSnapshot(
  value: unknown,
  expectedAuthority?: ReviewerInputSnapshotAuthorityBinding,
) {
  const request = normalizeReviewerInputSnapshotRequest(value, expectedAuthority);
  let createdObjectCount = 0;
  for (const member of request.members) {
    const source = resolveContainedWorkspaceFile(request.workspace_root, member.source_ref);
    try {
      const existing = persistReviewerSnapshotObject({
        expectedSha256: member.sha256,
        expectedSizeBytes: member.size_bytes,
      });
      if (existing.created) createdObjectCount += 1;
      continue;
    } catch (error) {
      const details = error instanceof Error
        ? (error as unknown as { details?: unknown }).details
        : null;
      if (!isRecord(details) || details.failure_code !== 'reviewer_input_snapshot_source_required') {
        throw error;
      }
    }
    const persisted = persistReviewerSnapshotObject({
      sourcePath: source.source_path,
      sourceRef: source.source_ref,
      trustedWorkspaceRoot: source.workspace_root,
      expectedSha256: member.sha256,
      expectedSizeBytes: member.size_bytes,
    });
    if (persisted.created) createdObjectCount += 1;
  }
  const persistedManifest = persistCanonicalReviewTransportJson({
    root: reviewTransportRoots().reviewer_snapshot_manifest_root,
    kind: 'opl_reviewer_input_snapshot_manifest',
    value: manifestForRequest(request),
  });
  const readback = readReviewerInputSnapshotManifest(persistedManifest.exact_ref);
  return {
    surface_kind: 'opl_reviewer_input_snapshot_materialization',
    schema_version: 2,
    materialization_status: createdObjectCount > 0 || persistedManifest.created
      ? 'materialized'
      : 'already_materialized',
    manifest_ref: readback.manifest_ref,
    manifest: readback.manifest,
    review_input_snapshot_binding: readback.binding,
  } as const;
}

function snapshotQualityDebt(reasonCode: string, resumeCondition: string) {
  return {
    surface_kind: 'opl_reviewer_input_snapshot_resolution',
    schema_version: 2,
    status: 'quality_debt',
    reason_code: reasonCode,
    resume_condition: resumeCondition,
  } as const;
}

export function resolveReviewerInputSnapshotMaterialization(
  value: unknown,
  expectedAuthority?: ReviewerInputSnapshotAuthorityBinding,
) {
  if (value === null || value === undefined) {
    return snapshotQualityDebt(
      'review_input_snapshot_binding_required',
      'materialize the complete owner-provided review scope as an immutable OPL snapshot',
    );
  }
  return materializeReviewerInputSnapshot(value, expectedAuthority);
}
