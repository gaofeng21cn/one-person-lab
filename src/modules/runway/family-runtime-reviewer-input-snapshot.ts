import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

const REVIEW_LANES = [
  'medical',
  'statistical',
  'reference',
  'display',
  'publication',
  'exact_byte_package',
] as const;

const SNAPSHOT_AUTHORITY_BOUNDARY = {
  storage_role: 'immutable_reviewer_input_transport',
  mas_selects_review_lane_scope_and_members: true,
  framework_can_select_or_narrow_members: false,
  framework_can_interpret_member_roles: false,
  framework_can_write_domain_truth: false,
  framework_can_sign_reviewer_receipt: false,
  framework_can_sign_owner_receipt: false,
  framework_can_create_typed_blocker: false,
  framework_can_claim_quality_readiness: false,
  framework_can_claim_publication_readiness: false,
  framework_can_claim_artifact_authority: false,
} as const;

export type ReviewerInputSnapshotMember = {
  member_id: string;
  role: string;
  source_ref: string;
  sha256: string;
  size_bytes: number;
};

export type ReviewerInputSnapshotMaterializationRequest = {
  surface_kind: 'opl_reviewer_input_snapshot_materialization_request';
  schema_version: 1;
  generation_ref: string;
  review_lane: typeof REVIEW_LANES[number];
  review_scope_sha256: string;
  workspace_root: string;
  members: ReviewerInputSnapshotMember[];
};

function normalizeReviewLane(value: unknown) {
  const lane = requiredReviewTransportText(value, 'review_lane');
  if (!REVIEW_LANES.includes(lane as typeof REVIEW_LANES[number])) {
    throw reviewTransportError(
      'reviewer_input_snapshot_review_lane_invalid',
      'Reviewer input snapshot review_lane is not supported by the MAS binding ABI.',
      { review_lane: lane, allowed_review_lanes: REVIEW_LANES },
    );
  }
  return lane as typeof REVIEW_LANES[number];
}

function normalizeSnapshotMember(value: unknown, index: number): ReviewerInputSnapshotMember {
  const field = `members[${index}]`;
  const member = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(
    member,
    ['member_id', 'role', 'source_ref', 'sha256', 'size_bytes'],
    field,
  );
  return {
    member_id: requiredReviewTransportText(member.member_id, `${field}.member_id`),
    role: requiredReviewTransportText(member.role, `${field}.role`),
    source_ref: requiredReviewTransportText(member.source_ref, `${field}.source_ref`),
    sha256: canonicalReviewTransportSha256(member.sha256, `${field}.sha256`),
    size_bytes: reviewTransportSize(member.size_bytes, `${field}.size_bytes`),
  };
}

function canonicalMembers(members: ReviewerInputSnapshotMember[]) {
  return [...members].sort((left, right) => (
    left.role.localeCompare(right.role)
    || left.member_id.localeCompare(right.member_id)
    || left.sha256.localeCompare(right.sha256)
    || left.size_bytes - right.size_bytes
  ));
}

export function normalizeReviewerInputSnapshotRequest(
  value: unknown,
): ReviewerInputSnapshotMaterializationRequest {
  const request = requireReviewTransportRecord(value, 'reviewer_input_snapshot_request');
  requireExactReviewTransportKeys(request, [
    'surface_kind',
    'schema_version',
    'generation_ref',
    'review_lane',
    'review_scope_sha256',
    'workspace_root',
    'members',
  ], 'reviewer_input_snapshot_request');
  if (
    request.surface_kind !== 'opl_reviewer_input_snapshot_materialization_request'
    || request.schema_version !== 1
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_request_version_invalid',
      'Reviewer input snapshot request must use its Framework schema 1 surface.',
      {
        surface_kind: request.surface_kind ?? null,
        schema_version: request.schema_version ?? null,
      },
    );
  }
  if (!Array.isArray(request.members) || request.members.length === 0) {
    throw reviewTransportError(
      'reviewer_input_snapshot_members_missing',
      'Reviewer input snapshot request must contain the complete non-empty MAS member inventory.',
    );
  }
  const members = canonicalMembers(request.members.map(normalizeSnapshotMember));
  const memberIds = members.map((member) => member.member_id);
  if (new Set(memberIds).size !== memberIds.length) {
    throw reviewTransportError(
      'reviewer_input_snapshot_member_id_duplicate',
      'Reviewer input snapshot request contains duplicate MAS member_id values.',
      { member_ids: memberIds },
    );
  }
  return {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
    schema_version: 1,
    generation_ref: requiredReviewTransportText(request.generation_ref, 'generation_ref'),
    review_lane: normalizeReviewLane(request.review_lane),
    review_scope_sha256: canonicalReviewTransportSha256(
      request.review_scope_sha256,
      'review_scope_sha256',
    ),
    workspace_root: requiredReviewTransportText(request.workspace_root, 'workspace_root'),
    members,
  };
}

function snapshotMemberExactRef(member: ReviewerInputSnapshotMember): ReviewTransportExactRef {
  const roots = reviewTransportRoots();
  return {
    kind: 'opl_reviewer_input_snapshot_member',
    ref: pathToFileURL(path.join(
      roots.reviewer_snapshot_object_root,
      `${member.sha256.replace(/^sha256:/, '')}.bin`,
    )).href,
    size_bytes: member.size_bytes,
    sha256: member.sha256,
  };
}

function manifestForRequest(request: ReviewerInputSnapshotMaterializationRequest) {
  return {
    surface_kind: 'opl_reviewer_input_snapshot_manifest',
    schema_version: 1,
    generation_ref: request.generation_ref,
    review_lane: request.review_lane,
    review_scope_sha256: request.review_scope_sha256,
    members: request.members.map((member) => ({
      member_id: member.member_id,
      role: member.role,
      sha256: member.sha256,
      size_bytes: member.size_bytes,
      immutable_ref: snapshotMemberExactRef(member),
    })),
    authority_boundary: SNAPSHOT_AUTHORITY_BOUNDARY,
  };
}

function bindingForManifest(
  manifest: ReturnType<typeof manifestForRequest>,
  manifestRef: ReviewTransportExactRef,
) {
  return {
    surface_kind: 'mas_review_input_snapshot_binding',
    schema_version: 1,
    snapshot_manifest_ref: manifestRef,
    review_lane: manifest.review_lane,
    review_scope_sha256: manifest.review_scope_sha256,
    members: manifest.members.map((member) => ({
      member_id: member.member_id,
      role: member.role,
      sha256: member.sha256,
      size_bytes: member.size_bytes,
    })),
  };
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
    'generation_ref',
    'review_lane',
    'review_scope_sha256',
    'members',
    'authority_boundary',
  ], 'reviewer_input_snapshot_manifest');
  if (
    manifest.surface_kind !== 'opl_reviewer_input_snapshot_manifest'
    || manifest.schema_version !== 1
    || !Array.isArray(manifest.members)
    || manifest.members.length === 0
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_manifest_invalid',
      'Reviewer input snapshot manifest does not match schema 1.',
    );
  }
  const normalizedMembers = manifest.members.map((value, index) => {
    const field = `reviewer_input_snapshot_manifest.members[${index}]`;
    const member = requireReviewTransportRecord(value, field);
    requireExactReviewTransportKeys(
      member,
      ['member_id', 'role', 'sha256', 'size_bytes', 'immutable_ref'],
      field,
    );
    const normalized = {
      member_id: requiredReviewTransportText(member.member_id, `${field}.member_id`),
      role: requiredReviewTransportText(member.role, `${field}.role`),
      sha256: canonicalReviewTransportSha256(member.sha256, `${field}.sha256`),
      size_bytes: reviewTransportSize(member.size_bytes, `${field}.size_bytes`),
      immutable_ref: member.immutable_ref,
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
  const canonical = canonicalMembers(normalizedMembers.map((member) => ({
    member_id: member.member_id,
    role: member.role,
    source_ref: '',
    sha256: member.sha256,
    size_bytes: member.size_bytes,
  })));
  if (
    JSON.stringify(canonical.map(({ source_ref: _sourceRef, ...member }) => member))
    !== JSON.stringify(normalizedMembers.map(({ immutable_ref: _immutableRef, ...member }) => member))
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_manifest_member_order_invalid',
      'Reviewer input snapshot manifest members are not in MAS canonical order.',
    );
  }
  const authority = requireReviewTransportRecord(
    manifest.authority_boundary,
    'reviewer_input_snapshot_manifest.authority_boundary',
  );
  if (
    authority.storage_role !== SNAPSHOT_AUTHORITY_BOUNDARY.storage_role
    || Object.entries(SNAPSHOT_AUTHORITY_BOUNDARY).some(([key, expected]) => authority[key] !== expected)
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_manifest_authority_invalid',
      'Reviewer input snapshot manifest grants or misstates authority.',
    );
  }
  const normalizedManifest = {
    surface_kind: 'opl_reviewer_input_snapshot_manifest' as const,
    schema_version: 1 as const,
    generation_ref: requiredReviewTransportText(manifest.generation_ref, 'generation_ref'),
    review_lane: normalizeReviewLane(manifest.review_lane),
    review_scope_sha256: canonicalReviewTransportSha256(
      manifest.review_scope_sha256,
      'review_scope_sha256',
    ),
    members: normalizedMembers,
    authority_boundary: SNAPSHOT_AUTHORITY_BOUNDARY,
  };
  return {
    manifest_ref: persisted.exact_ref,
    manifest: normalizedManifest,
    binding: bindingForManifest(normalizedManifest, persisted.exact_ref),
  };
}

export function materializeReviewerInputSnapshot(value: unknown) {
  const request = normalizeReviewerInputSnapshotRequest(value);
  let createdObjectCount = 0;
  for (const member of request.members) {
    try {
      const existing = persistReviewerSnapshotObject({
        expectedSha256: member.sha256,
        expectedSizeBytes: member.size_bytes,
      });
      if (existing.created) createdObjectCount += 1;
      continue;
    } catch (error) {
      if (
        !isRecord(error)
        && !(error instanceof Error)
      ) throw error;
      const errorDetails = error instanceof Error
        ? (error as unknown as { details?: unknown }).details
        : null;
      const failureCode = isRecord(error)
        ? error.failure_code
        : isRecord(errorDetails)
          ? errorDetails.failure_code
          : null;
      if (failureCode !== 'reviewer_input_snapshot_source_required') throw error;
    }
    const source = resolveContainedWorkspaceFile(request.workspace_root, member.source_ref);
    const persisted = persistReviewerSnapshotObject({
      sourcePath: source.source_path,
      sourceRef: source.source_ref,
      expectedSha256: member.sha256,
      expectedSizeBytes: member.size_bytes,
    });
    if (persisted.created) createdObjectCount += 1;
  }
  const manifest = manifestForRequest(request);
  const persistedManifest = persistCanonicalReviewTransportJson({
    root: reviewTransportRoots().reviewer_snapshot_manifest_root,
    kind: 'opl_reviewer_input_snapshot_manifest',
    value: manifest,
  });
  const readback = readReviewerInputSnapshotManifest(persistedManifest.exact_ref);
  const materializationStatus = createdObjectCount > 0 || persistedManifest.created
    ? 'materialized'
    : 'already_materialized';
  return {
    surface_kind: 'opl_reviewer_input_snapshot_materialization',
    schema_version: 1,
    materialization_status: materializationStatus,
    manifest_ref: readback.manifest_ref,
    manifest: readback.manifest,
    review_input_snapshot_binding: readback.binding,
    reviewer_context: {
      review_input_snapshot_binding: readback.binding,
      immutable_snapshot_manifest_ref: readback.manifest_ref,
      read_member_locators_from_manifest_only: true,
      live_workspace_locator_read_after_materialization_allowed: false,
    },
    hosted_action_launch_allowed: true,
    typed_blocker_ref: null,
    authority_boundary: SNAPSHOT_AUTHORITY_BOUNDARY,
  } as const;
}

export function resolveReviewerInputSnapshotMaterialization(value: unknown) {
  if (value === null || value === undefined) {
    return {
      surface_kind: 'opl_reviewer_input_snapshot_resolution',
      schema_version: 1,
      status: 'quality_debt',
      reason_code: 'review_input_snapshot_binding_required',
      resume_condition: 'materialize the complete MAS-provided review scope as an immutable OPL snapshot',
      review_input_snapshot_binding: null,
      hosted_action_launch_allowed: true,
      ordinary_progress_may_advance: true,
      quality_publication_export_or_submission_claim_allowed: false,
      typed_blocker_ref: null,
      authority_boundary: SNAPSHOT_AUTHORITY_BOUNDARY,
    } as const;
  }
  return materializeReviewerInputSnapshot(value);
}
