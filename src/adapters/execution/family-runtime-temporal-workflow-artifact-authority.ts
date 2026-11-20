import type { StageReviewReceipt } from '../../authority/stages/public/stage-quality-cycle.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type {
  TemporalStageRunAttemptSummary,
  TemporalStageRunRecoveryResume,
  StageArtifactIdentityAuthority,
  StageArtifactImmutableRef,
  StageArtifactLiveBytesStatus,
  StageArtifactPendingRepair,
  StageArtifactIdentityAuthorityStatus,
} from './family-runtime-temporal-stage-run.ts';
import { asRecord, asRecordList } from './family-runtime-temporal-workflow-values.ts';

function canonicalArtifactHashIdentity(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const digest = /^(?:sha256:)?([a-fA-F0-9]{64})$/.exec(text);
  return digest ? `sha256:${digest[1]!.toLowerCase()}` : text;
}

function immutableRefForMember(member: Record<string, unknown>): StageArtifactImmutableRef | null {
  const memberHashText = typeof member.sha256 === 'string' ? member.sha256.trim() : null;
  const sha256 = canonicalArtifactHashIdentity(member.sha256);
  const memberId = typeof member.member_id === 'string' ? member.member_id : null;
  const sizeBytes = typeof member.size_bytes === 'number' && Number.isSafeInteger(member.size_bytes)
    && member.size_bytes >= 0
    ? member.size_bytes
    : null;
  const immutableRef = asRecord(member.immutable_ref);
  const immutableHashText = typeof immutableRef.sha256 === 'string' ? immutableRef.sha256.trim() : null;
  const refSha256 = canonicalArtifactHashIdentity(immutableRef.sha256);
  const ref = typeof immutableRef.ref === 'string' && immutableRef.ref.trim()
    ? immutableRef.ref.trim()
    : null;
  const kind = typeof immutableRef.kind === 'string' && immutableRef.kind.trim()
    ? immutableRef.kind.trim()
    : null;
  const refSizeBytes = typeof immutableRef.size_bytes === 'number'
    && Number.isSafeInteger(immutableRef.size_bytes) && immutableRef.size_bytes >= 0
    ? immutableRef.size_bytes
    : null;
  if (
    !sha256
    || !memberHashText
    || memberHashText !== immutableHashText
    || !memberId
    || sizeBytes === null
    || !refSha256
    || refSha256 !== sha256
    || !ref
    || !kind
    || refSizeBytes === null
    || refSizeBytes !== sizeBytes
  ) return null;
  return {
    sha256,
    member_id: memberId,
    size_bytes: sizeBytes,
    immutable_ref: {
      kind,
      ref,
      size_bytes: refSizeBytes,
      sha256: refSha256,
    },
  };
}

/**
 * Resolve authoritative artifact hashes to the exact immutable reviewer-input
 * snapshot members that carried those bytes. The manifest schema itself is
 * unchanged; the SHA-256 identity is the join key. A hash with no matching
 * member (or a malformed member) remains unresolved and therefore cannot be
 * claimed as readable immutable authority.
 */
export function immutableArtifactRefsFromSnapshotManifest(
  manifest: unknown,
  artifactHashes: string[],
): StageArtifactImmutableRef[] {
  const members = asRecordList(asRecord(manifest).members)
    .map(immutableRefForMember)
    .filter((member): member is StageArtifactImmutableRef => Boolean(member));
  if (members.length === 0) return [];
  const byHash = new Map<string, StageArtifactImmutableRef | null>();
  for (const member of members) {
    byHash.set(member.sha256, byHash.has(member.sha256) ? null : member);
  }
  return artifactHashes
    .map((hash) => canonicalArtifactHashIdentity(hash))
    .filter((hash): hash is string => Boolean(hash))
    .map((hash) => byHash.get(hash) ?? null)
    .filter((member): member is StageArtifactImmutableRef => Boolean(member));
}

/**
 * Aggregate live drift does not identify which member changed. Fail closed
 * unless every authoritative hash has exactly one self-consistent snapshot.
 */
export function hasCompleteImmutableArtifactCoverage(
  authority: StageArtifactIdentityAuthority,
  artifactHashes: string[],
): boolean {
  const expectedHashes = artifactHashes.map(canonicalArtifactHashIdentity);
  if (expectedHashes.some((hash): hash is null => hash === null)) return false;
  const expected = new Set(expectedHashes as string[]);
  if (expected.size === 0 || authority.immutable_artifact_refs.length !== expected.size) return false;
  const actual = new Set<string>();
  for (const candidate of authority.immutable_artifact_refs) {
    const ref = immutableRefForMember(candidate as unknown as Record<string, unknown>);
    if (!ref || !expected.has(ref.sha256) || actual.has(ref.sha256)) return false;
    actual.add(ref.sha256);
  }
  return actual.size === expected.size;
}

export function immutableArtifactRefsFromReviewReceipt(
  receipt: StageReviewReceipt,
): StageArtifactImmutableRef[] {
  if (receipt.review_input_snapshot_status === 'quality_debt') return [];
  return immutableArtifactRefsFromSnapshotManifest(
    receipt.opl_reviewer_input_snapshot_manifest,
    receipt.reviewed_artifact_hashes,
  );
}

export function producerArtifactIdentityAuthority(input: {
  attemptRef: string;
  qualityRoundIndex?: number;
}): StageArtifactIdentityAuthority {
  return {
    status: 'producer_unreviewed',
    authoritative_attempt_ref: input.attemptRef,
    review_attempt_ref: null,
    quality_round_index: input.qualityRoundIndex ?? 0,
    immutable_artifact_refs: [],
    live_bytes_status: 'unknown',
    read_policy: 'use_immutable_ref_or_verify_sha256',
    pending_repair: null,
  };
}

export function reviewPendingArtifactIdentityAuthority(input: {
  authoritativeAttemptRef: string;
  qualityRoundIndex?: number;
}): StageArtifactIdentityAuthority {
  return {
    status: 'review_pending',
    authoritative_attempt_ref: input.authoritativeAttemptRef,
    review_attempt_ref: null,
    quality_round_index: input.qualityRoundIndex ?? 0,
    immutable_artifact_refs: [],
    live_bytes_status: 'unknown',
    read_policy: 'use_immutable_ref_or_verify_sha256',
    pending_repair: null,
  };
}

export function artifactIdentityAuthorityFromReviewReceipt(input: {
  receipt: StageReviewReceipt;
  status: StageArtifactIdentityAuthorityStatus;
  qualityRoundIndex: number;
  liveBytesStatus?: StageArtifactLiveBytesStatus;
  pendingRepair?: StageArtifactPendingRepair | null;
}): StageArtifactIdentityAuthority {
  return {
    status: input.status,
    authoritative_attempt_ref: input.receipt.producer_attempt_ref,
    review_attempt_ref: input.receipt.reviewer_attempt_ref,
    quality_round_index: input.qualityRoundIndex,
    immutable_artifact_refs: immutableArtifactRefsFromReviewReceipt(input.receipt),
    live_bytes_status: input.liveBytesStatus ?? 'unknown',
    read_policy: 'use_immutable_ref_or_verify_sha256',
    pending_repair: input.pendingRepair ?? null,
  };
}

export function artifactIdentityAuthorityWithPendingRepair(
  authority: StageArtifactIdentityAuthority | null | undefined,
  pendingRepair: StageArtifactPendingRepair,
  fallbackAuthoritativeAttemptRef: string | null,
): StageArtifactIdentityAuthority {
  const base = authority ?? reviewPendingArtifactIdentityAuthority({
    authoritativeAttemptRef: fallbackAuthoritativeAttemptRef ?? pendingRepair.attempt_ref,
  });
  return { ...base, pending_repair: pendingRepair };
}

function exactArtifactIdentityMatches(
  left: {
    artifact_refs: string[];
    artifact_hashes: string[];
  },
  right: {
    artifact_refs: string[];
    artifact_hashes: string[];
  },
) {
  return JSON.stringify({
    artifact_refs: left.artifact_refs,
    artifact_hashes: left.artifact_hashes,
  }) === JSON.stringify({
    artifact_refs: right.artifact_refs,
    artifact_hashes: right.artifact_hashes,
  });
}

function exactAttemptLineageMatches(
  left: TemporalStageRunAttemptSummary,
  right: TemporalStageRunAttemptSummary,
) {
  return left.attempt_role === right.attempt_role
    && left.quality_round_index === right.quality_round_index
    && left.stage_attempt_id === right.stage_attempt_id
    && left.workflow_id === right.workflow_id
    && left.execution_session_ref === right.execution_session_ref
    && left.artifact_producer_attempt_ref === right.artifact_producer_attempt_ref
    && left.status === right.status
    && exactRecoveryIdentity(left) === exactRecoveryIdentity(right);
}

function attemptRef(attempt: TemporalStageRunAttemptSummary) {
  return `opl://stage_attempts/${attempt.stage_attempt_id}`;
}

function hasUniqueAttemptIdentities(summaries: TemporalStageRunAttemptSummary[]) {
  const ids = new Set<string>();
  for (const summary of summaries) {
    if (
      !summary.stage_attempt_id?.trim()
      || !summary.workflow_id?.trim()
      || ids.has(summary.stage_attempt_id)
    ) return false;
    ids.add(summary.stage_attempt_id);
  }
  return true;
}

function matchesReviewedAttempt(
  reviewer: TemporalStageRunAttemptSummary,
  reviewed: TemporalStageRunAttemptSummary,
  expectedRole: 'reviewer' | 're_reviewer',
) {
  return reviewer.attempt_role === expectedRole
    && reviewer.status === 'completed'
    && reviewer.quality_round_index === reviewed.quality_round_index
    && reviewer.artifact_producer_attempt_ref === attemptRef(reviewed)
    && exactRecoveryIdentity(reviewer) === exactRecoveryIdentity(reviewed);
}

function matchesDecisiveRepairReceipt(
  receipt: StageReviewReceipt | undefined,
  reviewed: TemporalStageRunAttemptSummary,
  reviewer: TemporalStageRunAttemptSummary,
): receipt is StageReviewReceipt {
  return Boolean(receipt)
    && receipt!.verdict === 'repair_required'
    && receipt!.producer_attempt_ref === attemptRef(reviewed)
    && receipt!.reviewer_attempt_ref === attemptRef(reviewer)
    && exactArtifactIdentityMatches(reviewed, {
      artifact_refs: receipt!.reviewed_artifact_refs,
      artifact_hashes: receipt!.reviewed_artifact_hashes,
    });
}

type ValidatedRepairerLineage = {
  repairer: TemporalStageRunAttemptSummary;
  reviewed: TemporalStageRunAttemptSummary;
  reviewer: TemporalStageRunAttemptSummary;
  receipt: StageReviewReceipt;
};

/**
 * The complete legal repairer history is P0,V0,R1,V1,...,Rn. Every review is
 * completed and has exactly one positional repair-required receipt. The
 * terminal repairer is the only Attempt without its subsequent re-reviewer.
 */
function validateRepairerLineage(input: {
  repairerSummary: TemporalStageRunAttemptSummary;
  priorAttemptSummaries: TemporalStageRunAttemptSummary[];
  reviewReceipts: StageReviewReceipt[];
  qualityCycleId?: string;
}): ValidatedRepairerLineage | null {
  const prior = input.priorAttemptSummaries;
  const receipts = input.reviewReceipts;
  const repairer = input.repairerSummary;
  if (
    prior.length < 3
    || prior.length % 2 === 0
    || !hasUniqueAttemptIdentities(prior)
    || !exactAttemptLineageMatches(prior.at(-1)!, repairer)
    || repairer.attempt_role !== 'repairer'
    || repairer.status !== 'completed'
    || receipts.length !== (prior.length - 1) / 2
  ) return null;
  const producer = prior[0]!;
  if (
    producer.attempt_role !== 'producer'
    || producer.status !== 'completed'
    || producer.quality_round_index !== 0
    || producer.artifact_producer_attempt_ref !== null
  ) return null;
  let reviewed = producer;
  for (let reviewIndex = 0; reviewIndex < receipts.length; reviewIndex += 1) {
    const round = reviewIndex;
    const reviewer = prior[reviewIndex * 2 + 1]!;
    const receipt = receipts[reviewIndex]!;
    if (
      reviewed.quality_round_index !== round
      || !matchesReviewedAttempt(
        reviewer,
        reviewed,
        round === 0 ? 'reviewer' : 're_reviewer',
      )
      || !matchesDecisiveRepairReceipt(receipt, reviewed, reviewer)
      || (input.qualityCycleId !== undefined && receipt.quality_cycle_id !== input.qualityCycleId)
    ) return null;
    const nextRepairer = prior[reviewIndex * 2 + 2]!;
    if (
      nextRepairer.attempt_role !== 'repairer'
      || nextRepairer.status !== 'completed'
      || nextRepairer.quality_round_index !== round + 1
      || nextRepairer.artifact_producer_attempt_ref !== attemptRef(reviewed)
    ) return null;
    reviewed = nextRepairer;
  }
  return {
    repairer,
    reviewed: prior.at(-3)!,
    reviewer: prior.at(-2)!,
    receipt: receipts.at(-1)!,
  };
}

/**
 * Reconstruct the pre-B2 repairer resume boundary without promoting repairer
 * bytes. One receipt must uniquely join both sides of the reviewed Attempt
 * lineage and must describe the exact persisted artifact identity.
 */
export function reconstructRepairerRecoveryArtifactAuthority(input: {
  repairerSummary: TemporalStageRunAttemptSummary;
  priorAttemptSummaries: TemporalStageRunAttemptSummary[];
  reviewReceipts: StageReviewReceipt[];
  qualityCycleId?: string;
}): {
  artifact_refs: string[];
  artifact_hashes: string[];
  artifact_identity_receipt_refs: string[];
  artifact_identity_authority: StageArtifactIdentityAuthority;
} | null {
  const lineage = validateRepairerLineage(input);
  if (!lineage) return null;
  const { repairer, reviewed, receipt } = lineage;
  const authority = artifactIdentityAuthorityWithPendingRepair(
    artifactIdentityAuthorityFromReviewReceipt({
      receipt,
      status: 'reviewed_with_open_findings',
      qualityRoundIndex: reviewed.quality_round_index,
    }),
    {
      attempt_ref: `opl://stage_attempts/${repairer.stage_attempt_id}`,
      quality_round_index: repairer.quality_round_index,
      artifact_refs: repairer.artifact_refs,
      artifact_hashes: repairer.artifact_hashes,
      artifact_identity_receipt_refs: repairer.artifact_identity_receipt_refs,
      disposition: 'unreviewed_repair',
    },
    receipt.producer_attempt_ref,
  );
  return {
    artifact_refs: reviewed.artifact_refs,
    artifact_hashes: reviewed.artifact_hashes,
    artifact_identity_receipt_refs: reviewed.artifact_identity_receipt_refs,
    artifact_identity_authority: authority,
  };
}

function exactRecoveryIdentity(
  value: {
    artifact_refs: string[];
    artifact_hashes: string[];
    artifact_identity_receipt_refs: string[];
  },
) {
  return JSON.stringify({
    artifact_refs: value.artifact_refs,
    artifact_hashes: value.artifact_hashes,
    artifact_identity_receipt_refs: value.artifact_identity_receipt_refs,
  });
}

/**
 * Receipt-derived authority fields. `live_bytes_status` is deliberately
 * excluded: it is a runtime observation, not part of the reviewed lineage.
 * The snapshot is canonicalised so persisted JSON key order cannot change the
 * equality decision.
 */
function derivedAuthoritySnapshot(authority: StageArtifactIdentityAuthority) {
  const pending = asRecord(authority.pending_repair);
  const immutableRefs = canonicalImmutableRefSet(authority.immutable_artifact_refs);
  return {
    status: authority.status ?? null,
    authoritative_attempt_ref: authority.authoritative_attempt_ref ?? null,
    review_attempt_ref: authority.review_attempt_ref ?? null,
    quality_round_index: authority.quality_round_index ?? null,
    immutable_artifact_refs: immutableRefs ?? {
      invalid: authority.immutable_artifact_refs ?? null,
    },
    read_policy: authority.read_policy ?? null,
    pending_repair: authority.pending_repair
      ? {
          attempt_ref: pending.attempt_ref ?? null,
          quality_round_index: pending.quality_round_index ?? null,
          artifact_refs: Array.isArray(pending.artifact_refs) ? pending.artifact_refs : null,
          artifact_hashes: Array.isArray(pending.artifact_hashes) ? pending.artifact_hashes : null,
          artifact_identity_receipt_refs: Array.isArray(pending.artifact_identity_receipt_refs)
            ? pending.artifact_identity_receipt_refs
            : null,
          disposition: pending.disposition ?? null,
        }
      : null,
  };
}

function rejectExplicitAuthorityDrift(
  authority: StageArtifactIdentityAuthority,
  reconstructed: StageArtifactIdentityAuthority,
  recovery: TemporalStageRunRecoveryResume,
) {
  const expected = derivedAuthoritySnapshot(reconstructed) as Record<string, unknown>;
  const actual = derivedAuthoritySnapshot(authority) as Record<string, unknown>;
  const mismatchedFields = Object.keys(expected).filter((field) => (
    canonicalJsonText(expected[field]) !== canonicalJsonText(actual[field])
  ));
  if (mismatchedFields.length === 0) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Recovery explicit artifact authority does not match the Attempt/receipt-derived authority.',
    {
      failure_code: 'stage_run_recovery_artifact_authority_mismatch',
      recovery_id: recovery.recovery_id,
      quality_cycle_id: recovery.quality_cycle_id,
      mismatched_fields: mismatchedFields,
    },
  );
}

function canonicalImmutableRefSet(value: unknown): StageArtifactImmutableRef[] | null {
  if (!Array.isArray(value)) return null;
  const byHash = new Map<string, StageArtifactImmutableRef>();
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return null;
    const ref = immutableRefForMember(candidate as Record<string, unknown>);
    if (!ref || byHash.has(ref.sha256)) return null;
    byHash.set(ref.sha256, ref);
  }
  return [...byHash.values()].sort((left, right) => left.sha256.localeCompare(right.sha256));
}

type ResolvedRecoveryArtifactAuthority = {
  artifact_refs: string[];
  artifact_hashes: string[];
  artifact_identity_receipt_refs: string[];
  artifact_identity_authority: StageArtifactIdentityAuthority;
};

function assertRecoveryRoundBudget(
  recovery: TemporalStageRunRecoveryResume,
  artifactProducer: TemporalStageRunAttemptSummary,
  maxRepairRounds: number,
) {
  const role = recovery.resume_after_role ?? 'producer';
  const roundsUsed = recovery.repair_rounds_used ?? 0;
  const valid = Number.isSafeInteger(roundsUsed)
    && Number.isSafeInteger(artifactProducer.quality_round_index)
    && roundsUsed === artifactProducer.quality_round_index
    && roundsUsed >= 0
    && roundsUsed <= maxRepairRounds
    && (role === 'repairer' ? roundsUsed >= 1 : role === 'producer' ? roundsUsed === 0 : true);
  if (!valid) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun recovery repair rounds do not match the recovered Attempt and repair budget.',
      {
        failure_code: 'stage_run_recovery_repair_lineage_invalid',
        recovery_id: recovery.recovery_id,
        resume_after_role: role,
        repair_rounds_used: recovery.repair_rounds_used ?? null,
        attempt_round: artifactProducer.quality_round_index,
        max_repair_rounds: maxRepairRounds,
      },
    );
  }
}

function resolveProducerRecoveryArtifactAuthority(
  recovery: TemporalStageRunRecoveryResume,
  artifactProducer: TemporalStageRunAttemptSummary,
  artifactProducerRef: string,
): ResolvedRecoveryArtifactAuthority | null {
  if (artifactProducer.attempt_role !== 'producer' || artifactProducer.status !== 'completed') return null;
  if (
    artifactProducer.quality_round_index !== 0
    || artifactProducer.artifact_producer_attempt_ref !== null
    || (recovery.review_receipts?.length ?? 0) !== 0
  ) return null;
  if (exactRecoveryIdentity(recovery) !== exactRecoveryIdentity(artifactProducer)) return null;
  const prior = recovery.prior_attempt_summaries ?? [];
  if (recovery.prior_attempt_summaries !== undefined) {
    if (
      prior.length === 0
      || !hasUniqueAttemptIdentities(prior)
      || !exactAttemptLineageMatches(prior[0]!, artifactProducer)
    ) return null;
    for (const blockedReviewer of prior.slice(1)) {
      if (
        blockedReviewer.attempt_role !== 'reviewer'
        || blockedReviewer.status !== 'blocked'
        || blockedReviewer.quality_round_index !== 0
        || blockedReviewer.artifact_producer_attempt_ref !== artifactProducerRef
        || exactRecoveryIdentity(blockedReviewer) !== exactRecoveryIdentity(artifactProducer)
      ) return null;
    }
  }
  return {
    artifact_refs: artifactProducer.artifact_refs,
    artifact_hashes: artifactProducer.artifact_hashes,
    artifact_identity_receipt_refs: artifactProducer.artifact_identity_receipt_refs,
    artifact_identity_authority: producerArtifactIdentityAuthority({
      attemptRef: artifactProducerRef,
      qualityRoundIndex: artifactProducer.quality_round_index,
    }),
  };
}

function resolveReviewerRecoveryArtifactAuthority(
  recovery: TemporalStageRunRecoveryResume,
  artifactProducer: TemporalStageRunAttemptSummary,
  artifactProducerRef: string,
): ResolvedRecoveryArtifactAuthority | null {
  if (
    artifactProducer.attempt_role !== 'producer'
    || artifactProducer.status !== 'completed'
    || !recovery.reviewer_attempt_ref
    || exactRecoveryIdentity(recovery) !== exactRecoveryIdentity(artifactProducer)
  ) return null;
  const prior = recovery.prior_attempt_summaries ?? [];
  const producer = prior[0];
  const reviewer = prior[1];
  const receipt = recovery.review_receipts?.[0];
  if (
    !producer
    || !reviewer
    || prior.length !== 2
    || !hasUniqueAttemptIdentities(prior)
    || prior.at(-1) !== reviewer
    || !exactAttemptLineageMatches(producer, artifactProducer)
    || producer.quality_round_index !== 0
    || producer.artifact_producer_attempt_ref !== null
    || !matchesReviewedAttempt(reviewer, producer, 'reviewer')
    || attemptRef(reviewer) !== recovery.reviewer_attempt_ref
    || recovery.review_receipts?.length !== 1
    || !matchesDecisiveRepairReceipt(receipt, producer, reviewer)
    || receipt.quality_cycle_id !== recovery.quality_cycle_id
  ) return null;
  const authority = artifactIdentityAuthorityFromReviewReceipt({
    receipt,
    status: 'reviewed_with_open_findings',
    qualityRoundIndex: artifactProducer.quality_round_index,
  });
  if (!canonicalImmutableRefSet(authority.immutable_artifact_refs)) return null;
  return {
    artifact_refs: artifactProducer.artifact_refs,
    artifact_hashes: artifactProducer.artifact_hashes,
    artifact_identity_receipt_refs: artifactProducer.artifact_identity_receipt_refs,
    artifact_identity_authority: authority,
  };
}

/**
 * Canonical recovery authority for every resume role. Persisted authority is
 * only an assertion to compare, never an authority source. The returned live
 * byte status is always `unknown` and must be observed again by the workflow.
 */
export function resolveRecoveryArtifactAuthority(
  recovery: TemporalStageRunRecoveryResume,
  options: { maxRepairRounds: number },
): ResolvedRecoveryArtifactAuthority | null {
  const role = recovery.resume_after_role ?? 'producer';
  const artifactProducer = recovery.artifact_producer_attempt_summary ?? recovery.producer_attempt_summary;
  const artifactProducerRef = recovery.artifact_producer_attempt_ref ?? recovery.producer_attempt_ref;
  if (
    !artifactProducer
    || !artifactProducerRef
    || artifactProducerRef !== `opl://stage_attempts/${artifactProducer.stage_attempt_id}`
  ) return null;
  let reconstructed: ResolvedRecoveryArtifactAuthority | null;
  if (role === 'producer') {
    reconstructed = resolveProducerRecoveryArtifactAuthority(
      recovery,
      artifactProducer,
      artifactProducerRef,
    );
  } else if (role === 'reviewer') {
    reconstructed = resolveReviewerRecoveryArtifactAuthority(
      recovery,
      artifactProducer,
      artifactProducerRef,
    );
  } else if (role === 'repairer') {
    reconstructed = reconstructRepairerRecoveryArtifactAuthority({
      repairerSummary: artifactProducer,
      priorAttemptSummaries: recovery.prior_attempt_summaries ?? [],
      reviewReceipts: recovery.review_receipts ?? [],
      qualityCycleId: recovery.quality_cycle_id,
    });
  } else {
    return null;
  }
  if (!reconstructed || !canonicalImmutableRefSet(
    reconstructed.artifact_identity_authority.immutable_artifact_refs,
  )) return null;
  assertRecoveryRoundBudget(recovery, artifactProducer, options.maxRepairRounds);

  const authority = recovery.artifact_identity_authority;
  if (!authority) {
    if (role !== 'repairer') return reconstructed;
    return exactRecoveryIdentity(recovery) === exactRecoveryIdentity(artifactProducer)
      ? reconstructed
      : null;
  }
  rejectExplicitAuthorityDrift(
    authority,
    reconstructed.artifact_identity_authority,
    recovery,
  );
  if (
    exactRecoveryIdentity(recovery) !== exactRecoveryIdentity(reconstructed)
    || (role === 'repairer' && (
      !authority.pending_repair
      || authority.pending_repair.attempt_ref !== artifactProducerRef
      || authority.pending_repair.quality_round_index !== artifactProducer.quality_round_index
      || exactRecoveryIdentity(authority.pending_repair) !== exactRecoveryIdentity(artifactProducer)
    ))
  ) return null;
  return reconstructed;
}

/** @deprecated Use resolveRecoveryArtifactAuthority for every recovery role. */
export function resolveRepairerRecoveryArtifactAuthority(
  recovery: TemporalStageRunRecoveryResume,
) {
  if (recovery.resume_after_role !== 'repairer') return null;
  const repairer = recovery.artifact_producer_attempt_summary ?? recovery.producer_attempt_summary;
  return resolveRecoveryArtifactAuthority(recovery, {
    maxRepairRounds: repairer?.quality_round_index ?? 0,
  });
}

export function withLiveArtifactBytesStatus(
  authority: StageArtifactIdentityAuthority | null | undefined,
  liveBytesStatus: StageArtifactLiveBytesStatus,
): StageArtifactIdentityAuthority | null {
  return authority ? { ...authority, live_bytes_status: liveBytesStatus } : null;
}
