import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  resolveExactBoundLocalFile,
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
  review_lane?: string;
  workspace_root: string;
  members: ReviewerInputSnapshotMember[];
};

export type ReviewerInputSnapshotContentSourceRef = {
  ref: string;
  source_ref: string;
  sha256: string;
  size_bytes: number;
};

export type ReviewerInputSnapshotAuthorityBinding = {
  producer_attempt_ref: string;
  execution_content_binding_sha256: string;
  review_lane_binding?: string | null;
  owner_authority_refs: ReviewTransportExactRef[];
  owner_content_source_refs?: ReviewerInputSnapshotContentSourceRef[];
  stage_run_input_authority_refs?: ReviewTransportExactRef[];
};

export function reviewerSnapshotStageRunInputAuthority(specInput: unknown): ReviewTransportExactRef[] {
  const spec = requireReviewTransportRecord(specInput, 'execution_spec');
  const artifacts = spec.input_artifacts ?? [];
  const bindings = spec.content_bindings ?? [];
  if (!Array.isArray(artifacts) || !Array.isArray(bindings)) {
    throw reviewTransportError('reviewer_input_snapshot_input_authority_invalid', 'StageRun input authority must contain artifact and content-binding arrays.');
  }
  return artifacts.map((value, index) => {
    const artifact = requireReviewTransportRecord(value, `input_artifacts[${index}]`);
    const ref = requiredReviewTransportText(artifact.ref, 'input_artifact.ref');
    const sha256 = canonicalReviewTransportSha256(artifact.sha256, 'input_artifact.sha256');
    const matches = bindings.filter((entry) => isRecord(entry)
      && entry.purpose === 'input_artifact' && entry.ref === ref
      && canonicalReviewTransportSha256(entry.sha256, 'input_binding.sha256') === sha256);
    if (matches.length !== 1) {
      throw reviewTransportError('reviewer_input_snapshot_input_authority_invalid', 'StageRun input requires one exact immutable content binding.', { ref });
    }
    const binding = requireReviewTransportRecord(matches[0], 'input_binding');
    if (binding.verification_kind !== 'workspace_file_bytes'
      && !(binding.verification_kind === 'trusted_artifact_identity_receipt'
        && typeof binding.identity_receipt_ref === 'string' && binding.identity_receipt_ref.length > 0)) {
      throw reviewTransportError('reviewer_input_snapshot_input_authority_invalid', 'StageRun input binding lacks verified bytes or identity receipt.', { ref });
    }
    return { kind: 'stage_run_input_artifact', ref, sha256, size_bytes: reviewTransportSize(binding.byte_size, 'input_binding.byte_size') };
  });
}

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
  if (value.stage_run_input_authority_refs !== undefined && !Array.isArray(value.stage_run_input_authority_refs)) {
    throw reviewTransportError('reviewer_input_snapshot_input_authority_invalid', 'StageRun input authority refs must be an array.');
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
    review_lane_binding: value.review_lane_binding == null
      ? null
      : requiredReviewTransportText(
          value.review_lane_binding,
          'expected_authority.review_lane_binding',
        ),
    owner_authority_refs: value.owner_authority_refs.map((ref, index) => (
      normalizeExactRef(ref, `expected_authority.owner_authority_refs[${index}]`)
    )),
    owner_content_source_refs: (value.owner_content_source_refs ?? []).map((source, index) => {
      const field = `expected_authority.owner_content_source_refs[${index}]`;
      const record = requireReviewTransportRecord(source, field);
      requireExactReviewTransportKeys(record, ['ref', 'source_ref', 'sha256', 'size_bytes'], field);
      const ref = requiredReviewTransportText(record.ref, `${field}.ref`);
      const sha256 = canonicalReviewTransportSha256(record.sha256, `${field}.sha256`);
      if (ref !== `opl-content://${sha256.replace('sha256:', 'sha256/')}`) {
        throw reviewTransportError(
          'reviewer_input_snapshot_content_source_binding_invalid',
          'Reviewer content source binding must match its logical content ref and digest.',
          { ref, sha256 },
        );
      }
      return {
        ref,
        source_ref: requiredReviewTransportText(record.source_ref, `${field}.source_ref`),
        sha256,
        size_bytes: reviewTransportSize(record.size_bytes, `${field}.size_bytes`),
      };
    }),
    stage_run_input_authority_refs: (value.stage_run_input_authority_refs ?? []).map((ref, index) => (
      normalizeExactRef(ref, `expected_authority.stage_run_input_authority_refs[${index}]`)
    )),
  };
}

// The finalized transport envelope supplements the member inventory from the
// producer closeout's declared artifacts and the Stage's immutable input
// authority before the strict gate applies. The pre-supplement pass therefore
// accepts an absent or empty member inventory and defers the enumeration
// checks to the strict re-normalization after supplementation.
export type ReviewerInputSnapshotNormalizeOptions = {
  allowIncompleteMembers?: boolean;
  rebindAuthorityIdentity?: boolean;
};

// The snapshot authoring prompt publishes the immutable fields under a
// `fixed_request_fields` heading. A closeout author may return that heading as a
// literal key instead of spreading its entries across the request, which names the
// same request under a shape the exact-field gate cannot see. The heading is folded
// back into the request so the strict gate judges the request the author meant;
// every field is still validated exactly afterwards.
function foldSnapshotRequestHeading(value: unknown) {
  const request = requireReviewTransportRecord(value, 'reviewer_input_snapshot_request');
  const heading = isRecord(request.fixed_request_fields) ? request.fixed_request_fields : null;
  if (heading === null) return request;
  const { fixed_request_fields: _heading, ...rest } = request;
  return { ...heading, ...rest };
}

export function normalizeReviewerInputSnapshotRequest(
  value: unknown,
  expectedAuthority?: ReviewerInputSnapshotAuthorityBinding,
  options?: ReviewerInputSnapshotNormalizeOptions,
): ReviewerInputSnapshotMaterializationRequest {
  const allowIncompleteMembers = options?.allowIncompleteMembers === true;
  const rebindIdentity = options?.rebindAuthorityIdentity === true;
  const request = foldSnapshotRequestHeading(value);
  requireExactReviewTransportKeys(request, [
    'surface_kind',
    'schema_version',
    'owner_authority_ref',
    'producer_attempt_ref',
    'execution_content_binding_sha256',
    ...(request.review_lane === undefined ? [] : ['review_lane']),
    ...(request.members === undefined ? [] : ['members']),
    'workspace_root',
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
  if (request.members !== undefined && !Array.isArray(request.members)) {
    throw reviewTransportError(
      'reviewer_input_snapshot_members_missing',
      'Reviewer input snapshot request must contain a non-empty member inventory.',
    );
  }
  const membersProvidedAndPopulated = Array.isArray(request.members) && request.members.length > 0;
  if (!membersProvidedAndPopulated && !allowIncompleteMembers) {
    throw reviewTransportError(
      'reviewer_input_snapshot_members_missing',
      'Reviewer input snapshot request must contain a non-empty member inventory.',
    );
  }
  const members = (Array.isArray(request.members) ? request.members : []).map(normalizeMember);
  const memberIds = members.map((member) => member.member_id);
  if (new Set(memberIds).size !== memberIds.length) {
    throw reviewTransportError(
      'reviewer_input_snapshot_member_id_duplicate',
      'Reviewer input snapshot request contains duplicate member ids.',
      { member_ids: memberIds },
    );
  }
  // A review lane is authoritative only when the Stage declares a review lane binding. When it
  // declares none, the resolver that produces this expectation already ignores a requested lane
  // and yields null, so a lane hint carries no authority there and must not be able to fail an
  // otherwise exact request. Only a hint that contradicts a *declared* lane stays fatal.
  const authoritativeLane = expectedAuthority === undefined
    ? null
    : normalizeAuthorityBinding(expectedAuthority).review_lane_binding ?? null;
  const laneIsAuthoritative = expectedAuthority !== undefined && authoritativeLane !== null;
  const suppressLaneHint = expectedAuthority !== undefined && authoritativeLane === null;
  let normalized = {
    surface_kind: 'opl_reviewer_input_snapshot_materialization_request' as const,
    schema_version: 2 as const,
    owner_authority_ref: normalizeExactRef(request.owner_authority_ref, 'owner_authority_ref'),
    producer_attempt_ref: normalizeAttemptRef(request.producer_attempt_ref, 'producer_attempt_ref'),
    execution_content_binding_sha256: canonicalReviewTransportSha256(
      request.execution_content_binding_sha256,
      'execution_content_binding_sha256',
    ),
    ...(request.review_lane === undefined || suppressLaneHint
      ? {}
      : { review_lane: requiredReviewTransportText(request.review_lane, 'review_lane') }),
    workspace_root: requiredReviewTransportText(request.workspace_root, 'workspace_root'),
    members,
  };
  if (expectedAuthority) {
    const expected = normalizeAuthorityBinding(expectedAuthority);
    const missingInputs = expected.stage_run_input_authority_refs!.filter((ref) => !members.some((member) => (
      member.source_ref === ref.ref && member.sha256 === ref.sha256 && member.size_bytes === ref.size_bytes
    )));
    if (missingInputs.length > 0 && !allowIncompleteMembers) {
      throw reviewTransportError(
        'reviewer_input_snapshot_stage_run_input_missing',
        'Reviewer input snapshot must enumerate every immutable StageRun input artifact.',
        { missing_stage_run_input_refs: missingInputs.map((ref) => ref.ref) },
      );
    }
    const identityMismatch = normalized.producer_attempt_ref !== expected.producer_attempt_ref
      || normalized.execution_content_binding_sha256 !== expected.execution_content_binding_sha256
      || (laneIsAuthoritative && (normalized.review_lane ?? null) !== expected.review_lane_binding)
      || !expected.owner_authority_refs.some((ref) => (
        canonicalJsonText(ref) === canonicalJsonText(normalized.owner_authority_ref)
      ));
    if (identityMismatch && !rebindIdentity) {
      throw reviewTransportError(
        'reviewer_input_snapshot_authority_binding_mismatch',
        'Reviewer input snapshot request does not match its producer Attempt binding and closeout metadata.',
        { producer_attempt_ref: normalized.producer_attempt_ref },
      );
    }
    if (identityMismatch) {
      // First-contact completion of a model-authored closeout: producer_attempt_ref, the
      // execution content binding, and the owner authority ref are Framework identity, not
      // model knowledge, and the 2026-11-09 design-basis-admission producer echoed the
      // previous Stage's values. The members still decide the review scope and are
      // validated against owner closeout metadata and the frozen StageRun inputs, and the
      // lane stays strict because it selects which review scope the members belong to.
      if (laneIsAuthoritative && (normalized.review_lane ?? null) !== expected.review_lane_binding) {
        throw reviewTransportError(
          'reviewer_input_snapshot_authority_binding_mismatch',
          'Reviewer input snapshot request does not match its producer Attempt binding and closeout metadata.',
          { review_lane: normalized.review_lane ?? null },
        );
      }
      normalized = {
        ...normalized,
        owner_authority_ref: expected.owner_authority_refs[0]!,
        producer_attempt_ref: expected.producer_attempt_ref,
        execution_content_binding_sha256: expected.execution_content_binding_sha256,
      };
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
    ...(request.review_lane ? { review_lane: request.review_lane } : {}),
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
    ...('review_lane' in manifest ? { review_lane: manifest.review_lane } : {}),
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
    ...(manifest.review_lane === undefined ? [] : ['review_lane']),
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
    ...(manifest.review_lane === undefined
      ? {}
      : {
          review_lane: requiredReviewTransportText(
            manifest.review_lane,
            'reviewer_input_snapshot_manifest.review_lane',
          ),
        }),
    members,
  };
  return {
    manifest_ref: persisted.exact_ref,
    manifest: normalizedManifest,
    binding: bindingForManifest(normalizedManifest, persisted.exact_ref),
  };
}

// The persisted object's bytes are hash-verified at materialization, so the
// observed object size is the authoritative metadata; a stale declared
// size_bytes (model-provided) is corrected before it reaches the manifest.
function memberWithObservedObjectSize(
  member: ReviewerInputSnapshotMember,
  snapshotObjectRoot: string,
): ReviewerInputSnapshotMember {
  const objectPath = path.join(snapshotObjectRoot, `${member.sha256.slice('sha256:'.length)}.bin`);
  const observedSize = fs.statSync(objectPath).size;
  return observedSize === member.size_bytes ? member : { ...member, size_bytes: observedSize };
}

// A producer hand-writes digests when it authors its snapshot request, and a
// hallucinated or malformed digest previously killed the review before the
// supplement path could run — even when the Framework already holds the
// verified digest for the same source_ref inside the producer's declared
// artifact identity. Repairing from that authoritative identity preserves
// byte binding (the snapshot still binds exactly the verified hash) while
// keeping genuinely unbound or ambiguous members fail-closed.
export type SnapshotMemberDigestRepair = {
  member_id: string;
  source_ref: string;
  received_sha256: string | null;
  authoritative_sha256: string;
  received_size_bytes: number | null;
  authoritative_size_bytes: number;
};

function repairSnapshotRequestMembersAgainstAuthority(
  value: unknown,
  expectedAuthority: ReviewerInputSnapshotAuthorityBinding,
): { value: unknown; repairs: SnapshotMemberDigestRepair[] } {
  if (!isRecord(value) || !Array.isArray(value.members) || value.members.length === 0) {
    return { value, repairs: [] };
  }
  const authority = normalizeAuthorityBinding(expectedAuthority);
  const authoritativeByRef = new Map<string, { sha256: string; size_bytes: number }[]>();
  for (const entry of [...authority.owner_authority_refs, ...(authority.stage_run_input_authority_refs ?? [])]) {
    const bucket = authoritativeByRef.get(entry.ref) ?? [];
    if (!bucket.some((item) => item.sha256 === entry.sha256 && item.size_bytes === entry.size_bytes)) {
      bucket.push({ sha256: entry.sha256, size_bytes: entry.size_bytes });
    }
    authoritativeByRef.set(entry.ref, bucket);
  }
  const repairs: SnapshotMemberDigestRepair[] = [];
  let changed = false;
  const members = value.members.map((member) => {
    if (!isRecord(member) || typeof member.source_ref !== 'string') return member;
    const candidates = authoritativeByRef.get(member.source_ref) ?? [];
    const distinctDigests = [...new Set(candidates.map((entry) => entry.sha256))];
    if (distinctDigests.length !== 1) return member;
    const authoritative = candidates.find((entry) => entry.sha256 === distinctDigests[0])!;
    const receivedSha = typeof member.sha256 === 'string' ? member.sha256.trim() : null;
    const canonicalReceived = receivedSha ? canonicalReviewTransportSha256OrNull(receivedSha) : null;
    const receivedSize = Number.isSafeInteger(member.size_bytes) ? Number(member.size_bytes) : null;
    const digestRepair = canonicalReceived !== authoritative.sha256;
    const sizeRepair = receivedSize !== authoritative.size_bytes;
    if (!digestRepair && !sizeRepair) return member;
    changed = true;
    repairs.push({
      member_id: typeof member.member_id === 'string' ? member.member_id : '',
      source_ref: member.source_ref,
      received_sha256: receivedSha,
      authoritative_sha256: authoritative.sha256,
      received_size_bytes: receivedSize,
      authoritative_size_bytes: authoritative.size_bytes,
    });
    return {
      ...member,
      sha256: authoritative.sha256,
      size_bytes: authoritative.size_bytes,
    };
  });
  return { value: changed ? { ...value, members } : value, repairs };
}

function canonicalReviewTransportSha256OrNull(value: string) {
  try {
    return canonicalReviewTransportSha256(value, 'member.sha256');
  } catch {
    return null;
  }
}

// A producer also hand-writes the request's workspace_root, and it can declare a
// root narrower than its own member list (observed in live runs: a WorkItem-root
// request whose members named sibling WorkItem state files and workspace-level
// knowledge registry entries). The transport then deterministically kills the
// review before the reviewer starts. When the Framework's own durable execution
// scope proves every member still lives inside the real workspace, widening the
// declared root to the narrowest root that contains it and every member preserves
// the exact member set and byte bindings — each member is still revalidated and
// hash-pinned at materialization. A member outside the trusted workspace root is
// a genuine escape and stays fail-closed.
export type SnapshotWorkspaceRootWidening = {
  declared_workspace_root: string;
  widened_workspace_root: string;
  trusted_workspace_root: string;
  escaped_member_source_refs: string[];
  rebased_member_source_refs?: string[];
  // Framework-bound members (immutable StageRun input bindings, owner content
  // sources) are exempt from workspace containment: their authority is their
  // exact ref+hash+size binding, not their location. They never constrain the
  // widened root.
  external_bound_member_source_refs?: string[];
};

// A producer can also hand-write a member ref in the wrong *encoding* rather than
// the wrong place (observed in a live run: workspace-relative refs copied from the
// action payload into a request whose declared root is the WorkItem root, so the
// transport resolves them to a doubled, nonexistent path and kills the review).
// When the ref resolves to nothing under the declared root but resolves to exactly
// one existing file inside the Framework's trusted workspace root, rebasing the ref
// to that verified absolute path preserves the declared member and its byte
// binding — the member is still hash-pinned at materialization, so a wrong rebase
// cannot bind wrong bytes. A ref that resolves under the declared root keeps that
// deterministic interpretation; a ref that resolves nowhere stays fail-closed.
export type SnapshotMemberRefRebase = {
   member_id: string;
   declared_source_ref: string;
   resolved_source_ref: string;
   resolved_under: 'trusted_workspace_root';
 };

function realpathOrResolved(candidate: string) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function resolvedInside(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function commonAncestorOf(paths: string[]) {
  let ancestor = paths[0]!;
  for (const candidate of paths.slice(1)) {
    while (!resolvedInside(candidate, ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return ancestor;
      ancestor = parent;
    }
  }
  return ancestor;
}

function repairSnapshotRequestWorkspaceRootAgainstTrustedRoot(
  value: unknown,
  trustedWorkspaceRoot?: string,
  externalBoundRefs?: ReadonlySet<string>,
): { value: unknown; widenings: SnapshotWorkspaceRootWidening[]; rebases: SnapshotMemberRefRebase[] } {
  if (!isRecord(value)
    || typeof value.workspace_root !== 'string'
    || !Array.isArray(value.members)
    || value.members.length === 0
    || typeof trustedWorkspaceRoot !== 'string'
    || !trustedWorkspaceRoot.trim()) {
    return { value, widenings: [], rebases: [] };
  }
  let declaredRoot: string;
  let trustedRoot: string;
  try {
    declaredRoot = fs.realpathSync.native(path.resolve(value.workspace_root));
    trustedRoot = fs.realpathSync.native(path.resolve(trustedWorkspaceRoot));
  } catch {
    // An unreadable declared or trusted root is the materializer's existing
    // fail-closed path, not a widening decision.
    return { value, widenings: [], rebases: [] };
  }
  if (!resolvedInside(declaredRoot, trustedRoot)) {
    // The declared root itself escapes the Framework-recorded workspace: this is
    // framework setup evidence, not a repairable model slip.
    return { value, widenings: [], rebases: [] };
  }
  const rebases: SnapshotMemberRefRebase[] = [];
  let anyRebase = false;
  let undecidable = false;
  const memberPaths: { source_ref: string; resolved: string; member_id: string; external_bound: boolean }[] = [];
  const repairedMembers = value.members.map((member) => {
    if (!isRecord(member) || typeof member.source_ref !== 'string') {
      undecidable = true;
      return member;
    }
    const ref = member.source_ref;
    const memberId = typeof member.member_id === 'string' ? member.member_id : '';
    // Immutable StageRun input bindings (and owner content sources) are
    // framework-owned bindings, not containment subjects: they legitimately
    // live outside the workspace (e.g. under the shared OPL state root) and
    // are byte-pinned by the authority at materialization. Excluding them
    // from the widening computation keeps a bound external input from
    // poisoning the common ancestor of the members that do need containment.
    const externalBound = externalBoundRefs?.has(ref) === true;
    let candidate: string;
    if (ref.startsWith('file://')) {
      try {
        candidate = fileURLToPath(ref);
      } catch {
        undecidable = true;
        return member;
      }
    } else if (path.isAbsolute(ref)) {
      candidate = ref;
    } else if (!/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
      // Relative ref: the declared-root interpretation wins whenever it exists.
      // Only when it resolves to nothing do we try the trusted workspace root —
      // a unique, existing rebase target there is the ref the producer plainly
      // meant (observed: payload-encoded workspace-relative refs).
      const declaredCandidate = path.resolve(declaredRoot, ref);
      let declaredReal: string | null = null;
      try {
        declaredReal = fs.realpathSync.native(declaredCandidate);
      } catch {
        declaredReal = null;
      }
      if (declaredReal !== null) {
        memberPaths.push({ source_ref: ref, resolved: declaredReal, member_id: memberId, external_bound: externalBound });
        return member;
      }
      const trustedCandidate = path.resolve(trustedRoot, ref);
      let trustedReal: string | null = null;
      try {
        trustedReal = fs.realpathSync.native(trustedCandidate);
      } catch {
        trustedReal = null;
      }
      if (trustedReal !== null && resolvedInside(trustedReal, trustedRoot)) {
        anyRebase = true;
        rebases.push({
          member_id: memberId,
          declared_source_ref: ref,
          resolved_source_ref: trustedReal,
          resolved_under: 'trusted_workspace_root',
        });
        memberPaths.push({ source_ref: trustedReal, resolved: trustedReal, member_id: memberId, external_bound: externalBound });
        return { ...member, source_ref: trustedReal };
      }
      memberPaths.push({ source_ref: ref, resolved: declaredCandidate, member_id: memberId, external_bound: externalBound });
      return member;
    } else {
      // Non-file URIs are resolved by later stages; containment is not decidable here.
      undecidable = true;
      return member;
    }
    memberPaths.push({ source_ref: ref, resolved: realpathOrResolved(candidate), member_id: memberId, external_bound: externalBound });
    return member;
  });
  if (undecidable) {
    // Any member whose resolution we cannot decide keeps the whole request on the
    // transport's fail-closed path, unmodified.
    return { value, widenings: [], rebases: [] };
  }
  const externalBoundMembers = memberPaths.filter((member) => member.external_bound);
  const containedMembers = memberPaths.filter((member) => !member.external_bound);
  const escaped = containedMembers.filter((member) => !resolvedInside(member.resolved, declaredRoot));
  const repairedValue = anyRebase ? { ...value, members: repairedMembers } : value;
  if (escaped.length === 0) {
    return { value: repairedValue, widenings: [], rebases };
  }
  const widenedRoot = commonAncestorOf([declaredRoot, ...containedMembers.map((member) => member.resolved)]);
  if (!resolvedInside(widenedRoot, trustedRoot) || widenedRoot === declaredRoot) {
    // The narrowest consistent root would leave the trusted workspace: genuine escape.
    // Rebases already computed are not applied either: the request is left exactly
    // as authored so the transport's fail-closed path reports the original bytes.
    return { value, widenings: [], rebases: [] };
  }
  return {
    value: { ...repairedValue, workspace_root: widenedRoot },
    widenings: [{
      declared_workspace_root: declaredRoot,
      widened_workspace_root: widenedRoot,
      trusted_workspace_root: trustedRoot,
      escaped_member_source_refs: escaped.map((member) => member.source_ref),
      ...(externalBoundMembers.length > 0
        ? { external_bound_member_source_refs: externalBoundMembers.map((member) => member.source_ref) }
        : {}),
      ...(rebases.length > 0
        ? { rebased_member_source_refs: rebases.map((rebase) => rebase.declared_source_ref) }
        : {}),
    }],
    rebases,
  };
}

export function materializeReviewerInputSnapshot(
  value: unknown,
  expectedAuthority?: ReviewerInputSnapshotAuthorityBinding,
) {
  const request = normalizeReviewerInputSnapshotRequest(value, expectedAuthority);
  const authority = expectedAuthority ? normalizeAuthorityBinding(expectedAuthority) : null;
  const inputAuthority = authority?.stage_run_input_authority_refs ?? [];
  const contentSources = authority?.owner_content_source_refs ?? [];
  let createdObjectCount = 0;
  const effectiveMembers: typeof request.members = [];
  const snapshotObjectRoot = reviewTransportRoots().reviewer_snapshot_object_root;
  for (const member of request.members) {
    const boundInput = inputAuthority.some((ref) => (
      ref.ref === member.source_ref && ref.sha256 === member.sha256 && ref.size_bytes === member.size_bytes
    ));
    const boundContent = contentSources.find((source) => (
      source.ref === member.source_ref && source.sha256 === member.sha256 && source.size_bytes === member.size_bytes
    ));
    const source = boundInput && (member.source_ref.startsWith('file://') || path.isAbsolute(member.source_ref))
      ? resolveExactBoundLocalFile(member.source_ref)
      : boundContent
        ? resolveContainedWorkspaceFile(request.workspace_root, boundContent.source_ref)
        : resolveContainedWorkspaceFile(request.workspace_root, member.source_ref);
    try {
      const existing = persistReviewerSnapshotObject({
        expectedSha256: member.sha256,
        expectedSizeBytes: member.size_bytes,
      });
      if (existing.created) createdObjectCount += 1;
      effectiveMembers.push(memberWithObservedObjectSize(member, snapshotObjectRoot));
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
    effectiveMembers.push(memberWithObservedObjectSize(member, snapshotObjectRoot));
  }
  const persistedManifest = persistCanonicalReviewTransportJson({
    root: reviewTransportRoots().reviewer_snapshot_manifest_root,
    kind: 'opl_reviewer_input_snapshot_manifest',
    value: manifestForRequest({ ...request, members: effectiveMembers }),
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

export function completeReviewerSnapshotTransportEnvelope(
  value: unknown,
  expectedAuthority: ReviewerInputSnapshotAuthorityBinding,
  declaredArtifacts: { refs: string[]; hashes: string[] },
) {
  return completeReviewerSnapshotTransportEnvelopeWithRepairs(value, expectedAuthority, declaredArtifacts).request;
}

export function completeReviewerSnapshotTransportEnvelopeWithRepairs(
  value: unknown,
  expectedAuthority: ReviewerInputSnapshotAuthorityBinding,
  declaredArtifacts: { refs: string[]; hashes: string[] },
  options?: { trusted_workspace_root?: string },
) {
  const sanitized = repairSnapshotRequestMembersAgainstAuthority(value, expectedAuthority);
  const request = normalizeReviewerInputSnapshotRequest(sanitized.value, expectedAuthority, {
    allowIncompleteMembers: true,
    rebindAuthorityIdentity: true,
  });
  const authority = normalizeAuthorityBinding(expectedAuthority);
  if (declaredArtifacts.refs.length !== declaredArtifacts.hashes.length) {
    throw reviewTransportError('reviewer_input_snapshot_artifact_identity_mismatch', 'Declared artifact refs and hashes must align.');
  }
  const members = [...request.members];
  for (const [index, ref] of declaredArtifacts.refs.entries()) {
    const sha256 = canonicalReviewTransportSha256(declaredArtifacts.hashes[index], 'declared_artifact.sha256');
    const matches = authority.owner_authority_refs.filter((item) => item.ref === ref && item.sha256 === sha256);
    if (matches.length === 0) {
      throw reviewTransportError('reviewer_input_snapshot_owner_authority_metadata_missing', 'Declared artifact requires exact producer closeout metadata.', { artifact_ref: ref });
    }
    // A closeout entry can label one artifact under both `kind` and `ref_kind`, and
    // the authority expands that into alias exact refs binding the same bytes. Those
    // aliases are the same artifact, not an ambiguity: they must agree on the byte
    // size, and any one of them supplies it. A genuinely unknown artifact still has
    // zero matches and is rejected above.
    const memberSizes = new Set(matches.map((item) => item.size_bytes));
    if (memberSizes.size !== 1) {
      throw reviewTransportError('reviewer_input_snapshot_owner_authority_metadata_ambiguous', 'Declared artifact matches producer closeout metadata entries with conflicting byte sizes.', { artifact_ref: ref });
    }
    const member = matches[0]!;
    if (members.some((item) => item.sha256 === sha256 && item.size_bytes === member.size_bytes)) continue;
    // Finalized transport records supplement, but do not redefine, the domain review scope.
    members.push({
      member_id: `opl-finalized-artifact-${sha256.slice('sha256:'.length)}`,
      source_ref: ref,
      sha256,
      size_bytes: member.size_bytes,
    });
  }
  // Immutable StageRun input artifacts are framework-owned bindings, not model-inferred
  // scope: supplementing them here cannot widen the review scope beyond what the Stage
  // already froze as its inputs. A producer that omits or under-enumerates its member
  // inventory therefore still yields the exact mandated scope instead of deterministically
  // failing the StageRun before the reviewer starts.
  for (const inputRef of authority.stage_run_input_authority_refs!) {
    // The validator below matches on the exact (source_ref, sha256, size_bytes) triple. Deduplicating
    // on bytes alone would leave a producer member that carries the same bytes under an equivalent
    // but differently encoded locator (for example a percent-decoded file:// URL) unsupplemented, and
    // the exact-ref coverage check would then hard-stop the StageRun before any reviewer starts.
    if (members.some((item) => item.source_ref === inputRef.ref
      && item.sha256 === inputRef.sha256
      && item.size_bytes === inputRef.size_bytes)) continue;
    members.push({
      member_id: `opl-stage-run-input-${inputRef.sha256.slice('sha256:'.length)}`,
      source_ref: inputRef.ref,
      sha256: inputRef.sha256,
      size_bytes: inputRef.size_bytes,
    });
  }
  const externalBoundRefs = new Set([
    ...(authority.stage_run_input_authority_refs ?? []).map((ref) => ref.ref),
    ...(authority.owner_content_source_refs ?? []).map((ref) => ref.ref),
  ]);
  const widened = repairSnapshotRequestWorkspaceRootAgainstTrustedRoot(
    { ...request, members },
    options?.trusted_workspace_root,
    externalBoundRefs,
  );
  return {
    request: normalizeReviewerInputSnapshotRequest(widened.value, expectedAuthority),
    repairs: sanitized.repairs,
    workspace_root_widenings: widened.widenings,
    member_ref_rebases: widened.rebases,
  };
}

export function resolveReviewerInputSnapshotMaterialization(
  value: unknown,
  expectedAuthority?: ReviewerInputSnapshotAuthorityBinding,
  declaredArtifacts?: { refs: string[]; hashes: string[] },
  options?: { trusted_workspace_root?: string },
) {
  if (value === null || value === undefined) {
    return snapshotQualityDebt(
      'review_input_snapshot_binding_required',
      'materialize the complete owner-provided review scope as an immutable OPL snapshot',
    );
  }
  const repairs: SnapshotMemberDigestRepair[] = [];
  const widenings: SnapshotWorkspaceRootWidening[] = [];
  const rebases: SnapshotMemberRefRebase[] = [];
  let envelope = value;
  if (declaredArtifacts && expectedAuthority) {
    const completed = completeReviewerSnapshotTransportEnvelopeWithRepairs(
      value,
      expectedAuthority,
      declaredArtifacts,
      options,
    );
    repairs.push(...completed.repairs);
    widenings.push(...completed.workspace_root_widenings);
    rebases.push(...completed.member_ref_rebases);
    envelope = completed.request;
  }
  const materialization = materializeReviewerInputSnapshot(envelope, expectedAuthority);
  return {
    ...materialization,
    ...(repairs.length > 0 ? { member_digest_repairs: repairs } : {}),
    ...(widenings.length > 0 ? { workspace_root_widenings: widenings } : {}),
    ...(rebases.length > 0 ? { member_ref_rebases: rebases } : {}),
  };
}
