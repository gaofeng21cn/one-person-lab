import crypto from 'node:crypto';
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
  owner_ref: string;
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
  mas_authority_record_ref: ReviewTransportExactRef;
  mas_authority_record: {
    surface_kind: 'mas_review_input_snapshot_authority';
    schema_version: 1;
    generation_ref: string;
    review_lane: typeof REVIEW_LANES[number];
    review_scope_sha256: string;
    members: Array<Omit<ReviewerInputSnapshotMember, 'source_ref'>>;
  };
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
    ['member_id', 'role', 'owner_ref', 'source_ref', 'sha256', 'size_bytes'],
    field,
  );
  return {
    member_id: requiredReviewTransportText(member.member_id, `${field}.member_id`),
    role: requiredReviewTransportText(member.role, `${field}.role`),
    owner_ref: requiredReviewTransportText(member.owner_ref, `${field}.owner_ref`),
    source_ref: requiredReviewTransportText(member.source_ref, `${field}.source_ref`),
    sha256: canonicalReviewTransportSha256(member.sha256, `${field}.sha256`),
    size_bytes: reviewTransportSize(member.size_bytes, `${field}.size_bytes`),
  };
}

function comparePythonText(left: string, right: string) {
  const leftPoints = [...left].map((character) => character.codePointAt(0)!);
  const rightPoints = [...right].map((character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index]! - rightPoints[index]!;
  }
  return leftPoints.length - rightPoints.length;
}

function canonicalMembers(members: ReviewerInputSnapshotMember[]) {
  return [...members].sort((left, right) => (
    comparePythonText(left.role, right.role)
    || comparePythonText(left.member_id, right.member_id)
    || comparePythonText(left.sha256, right.sha256)
    || left.size_bytes - right.size_bytes
  ));
}

function pythonCompatibleCanonicalJsonText(value: unknown) {
  return canonicalJsonText(value).replace(/[^\x00-\x7f]/gu, (character) => {
    let escaped = '';
    for (let index = 0; index < character.length; index += 1) {
      escaped += `\\u${character.charCodeAt(index).toString(16).padStart(4, '0')}`;
    }
    return escaped;
  });
}

function pythonCompatibleCanonicalJsonBytes(value: unknown) {
  return Buffer.from(pythonCompatibleCanonicalJsonText(value), 'utf8');
}

function normalizeMasAuthorityRecord(value: unknown) {
  const record = requireReviewTransportRecord(value, 'mas_authority_record');
  requireExactReviewTransportKeys(record, [
    'surface_kind',
    'schema_version',
    'generation_ref',
    'review_lane',
    'review_scope_sha256',
    'members',
  ], 'mas_authority_record');
  if (
    record.surface_kind !== 'mas_review_input_snapshot_authority'
    || record.schema_version !== 1
    || !Array.isArray(record.members)
    || record.members.length === 0
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_authority_record_invalid',
      'Reviewer input snapshot requires a MAS authority record using schema 1.',
    );
  }
  const members = canonicalMembers(record.members.map((value, index) => {
    const field = `mas_authority_record.members[${index}]`;
    const member = requireReviewTransportRecord(value, field);
    requireExactReviewTransportKeys(
      member,
      ['member_id', 'role', 'owner_ref', 'sha256', 'size_bytes'],
      field,
    );
    return {
      member_id: requiredReviewTransportText(member.member_id, `${field}.member_id`),
      role: requiredReviewTransportText(member.role, `${field}.role`),
      owner_ref: requiredReviewTransportText(member.owner_ref, `${field}.owner_ref`),
      source_ref: '',
      sha256: canonicalReviewTransportSha256(member.sha256, `${field}.sha256`),
      size_bytes: reviewTransportSize(member.size_bytes, `${field}.size_bytes`),
    };
  }));
  const memberIds = members.map((member) => member.member_id);
  if (new Set(memberIds).size !== memberIds.length) {
    throw reviewTransportError(
      'reviewer_input_snapshot_authority_member_id_duplicate',
      'MAS reviewer input snapshot authority contains duplicate member ids.',
      { member_ids: memberIds },
    );
  }
  const normalizedMembers = members.map(({ source_ref: _sourceRef, ...member }) => member);
  const normalized = {
    surface_kind: 'mas_review_input_snapshot_authority' as const,
    schema_version: 1 as const,
    generation_ref: requiredReviewTransportText(record.generation_ref, 'mas_authority_record.generation_ref'),
    review_lane: normalizeReviewLane(record.review_lane),
    review_scope_sha256: canonicalReviewTransportSha256(
      record.review_scope_sha256,
      'mas_authority_record.review_scope_sha256',
    ),
    members: normalizedMembers,
  };
  const expectedScope = reviewScopeSha256(
    normalized.review_lane,
    members,
  );
  if (normalized.review_scope_sha256 !== expectedScope) {
    throw reviewTransportError(
      'reviewer_input_snapshot_authority_scope_mismatch',
      'MAS reviewer input snapshot authority scope does not match its complete member inventory.',
    );
  }
  return normalized;
}

function normalizeMasAuthorityRecordRef(value: unknown, record: ReturnType<typeof normalizeMasAuthorityRecord>) {
  const exactRef = requireReviewTransportRecord(value, 'mas_authority_record_ref');
  requireExactReviewTransportKeys(exactRef, ['kind', 'ref', 'size_bytes', 'sha256'], 'mas_authority_record_ref');
  const bytes = pythonCompatibleCanonicalJsonBytes(record);
  const sha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  const ref = requiredReviewTransportText(exactRef.ref, 'mas_authority_record_ref.ref');
  if (
    exactRef.kind !== 'mas_review_input_snapshot_authority'
    || canonicalReviewTransportSha256(exactRef.sha256, 'mas_authority_record_ref.sha256') !== sha256
    || reviewTransportSize(exactRef.size_bytes, 'mas_authority_record_ref.size_bytes', 1) !== bytes.length
    || ref !== `mas-review-input-snapshot-authority:${sha256.slice('sha256:'.length)}`
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_authority_ref_mismatch',
      'MAS reviewer input snapshot authority ref does not bind its canonical exact bytes.',
      { expected_sha256: sha256, expected_size_bytes: bytes.length },
    );
  }
  return {
    kind: 'mas_review_input_snapshot_authority',
    ref,
    size_bytes: bytes.length,
    sha256,
  } satisfies ReviewTransportExactRef;
}

function reviewScopeSha256(
  reviewLane: typeof REVIEW_LANES[number],
  members: ReviewerInputSnapshotMember[],
) {
  const reviewedMembers = reviewLane === 'exact_byte_package'
    ? members
      .map((member) => ({
        member_id: member.member_id,
        role: member.role,
        ref: member.owner_ref,
        size_bytes: member.size_bytes,
        sha256: member.sha256,
      }))
      .sort((left, right) => (
        comparePythonText(left.role, right.role)
        || comparePythonText(left.ref, right.ref)
        || comparePythonText(left.sha256, right.sha256)
      ))
    : members
      .map((member) => ({
        member_id: member.member_id,
        role: member.role,
        sha256: member.sha256,
        size_bytes: member.size_bytes,
      }))
      .sort((left, right) => (
        comparePythonText(left.member_id, right.member_id)
        || comparePythonText(left.role, right.role)
        || comparePythonText(left.sha256, right.sha256)
        || left.size_bytes - right.size_bytes
      ));
  const payload = {
    scope_policy_id: 'mas_review_scope_dependency_map',
    scope_policy_version: 1,
    review_lane: reviewLane,
    reviewed_members: reviewedMembers,
  };
  return `sha256:${crypto.createHash('sha256')
    .update(pythonCompatibleCanonicalJsonText(payload))
    .digest('hex')}`;
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
    'mas_authority_record_ref',
    'mas_authority_record',
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
  const reviewLane = normalizeReviewLane(request.review_lane);
  const suppliedReviewScopeSha256 = canonicalReviewTransportSha256(
    request.review_scope_sha256,
    'review_scope_sha256',
  );
  const expectedReviewScopeSha256 = reviewScopeSha256(reviewLane, members);
  if (suppliedReviewScopeSha256 !== expectedReviewScopeSha256) {
    throw reviewTransportError(
      'reviewer_input_snapshot_review_scope_mismatch',
      'Reviewer input snapshot review_scope_sha256 does not match the MAS v1 lane projection.',
      {
        supplied_review_scope_sha256: suppliedReviewScopeSha256,
        expected_review_scope_sha256: expectedReviewScopeSha256,
        review_lane: reviewLane,
      },
    );
  }
  const masAuthorityRecord = normalizeMasAuthorityRecord(request.mas_authority_record);
  const masAuthorityRecordRef = normalizeMasAuthorityRecordRef(
    request.mas_authority_record_ref,
    masAuthorityRecord,
  );
  const generationRef = requiredReviewTransportText(request.generation_ref, 'generation_ref');
  const requestedAuthorityMembers = members.map(({ source_ref: _sourceRef, ...member }) => member);
  if (
    masAuthorityRecord.generation_ref !== generationRef
    || masAuthorityRecord.review_lane !== reviewLane
    || masAuthorityRecord.review_scope_sha256 !== expectedReviewScopeSha256
    || canonicalJsonText(masAuthorityRecord.members) !== canonicalJsonText(requestedAuthorityMembers)
  ) {
    throw reviewTransportError(
      'reviewer_input_snapshot_request_authority_mismatch',
      'Reviewer input snapshot request does not exactly match the MAS authority record.',
      { generation_ref: generationRef, review_lane: reviewLane },
    );
  }
  return {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request',
    schema_version: 1,
    generation_ref: generationRef,
    review_lane: reviewLane,
    review_scope_sha256: expectedReviewScopeSha256,
    workspace_root: requiredReviewTransportText(request.workspace_root, 'workspace_root'),
    members,
    mas_authority_record_ref: masAuthorityRecordRef,
    mas_authority_record: masAuthorityRecord,
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
    mas_authority_record_ref: request.mas_authority_record_ref,
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
    generation_ref: manifest.generation_ref,
    review_lane: manifest.review_lane,
    review_scope_sha256: manifest.review_scope_sha256,
    mas_authority_record_ref: manifest.mas_authority_record_ref,
    members: manifest.members.map((member) => ({
      member_id: member.member_id,
      role: member.role,
      sha256: member.sha256,
      size_bytes: member.size_bytes,
    })),
    materialization_owner: 'one-person-lab',
    authority_boundary: SNAPSHOT_AUTHORITY_BOUNDARY,
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
    'mas_authority_record_ref',
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
    owner_ref: '',
    sha256: member.sha256,
    size_bytes: member.size_bytes,
  })));
  if (
    JSON.stringify(canonical.map(({
      source_ref: _sourceRef,
      owner_ref: _ownerRef,
      ...member
    }) => member))
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
  const masAuthorityRecordRef = requireReviewTransportRecord(
    manifest.mas_authority_record_ref,
    'reviewer_input_snapshot_manifest.mas_authority_record_ref',
  );
  requireExactReviewTransportKeys(
    masAuthorityRecordRef,
    ['kind', 'ref', 'size_bytes', 'sha256'],
    'reviewer_input_snapshot_manifest.mas_authority_record_ref',
  );
  if (masAuthorityRecordRef.kind !== 'mas_review_input_snapshot_authority') {
    throw reviewTransportError(
      'reviewer_input_snapshot_authority_ref_kind_mismatch',
      'Reviewer input snapshot manifest must preserve its MAS authority record ref.',
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
    mas_authority_record_ref: {
      kind: 'mas_review_input_snapshot_authority',
      ref: requiredReviewTransportText(
        masAuthorityRecordRef.ref,
        'reviewer_input_snapshot_manifest.mas_authority_record_ref.ref',
      ),
      size_bytes: reviewTransportSize(
        masAuthorityRecordRef.size_bytes,
        'reviewer_input_snapshot_manifest.mas_authority_record_ref.size_bytes',
        1,
      ),
      sha256: canonicalReviewTransportSha256(
        masAuthorityRecordRef.sha256,
        'reviewer_input_snapshot_manifest.mas_authority_record_ref.sha256',
      ),
    },
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
    const source = resolveContainedWorkspaceFile(request.workspace_root, member.source_ref);
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
      const failureCode = isRecord(errorDetails)
        ? errorDetails.failure_code
        : isRecord(error)
          ? error.failure_code
          : null;
      if (failureCode !== 'reviewer_input_snapshot_source_required') throw error;
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
      stage_transition_allowed: true,
      quality_publication_export_or_submission_claim_allowed: false,
      typed_blocker_ref: null,
      authority_boundary: SNAPSHOT_AUTHORITY_BOUNDARY,
    } as const;
  }
  return materializeReviewerInputSnapshot(value);
}
