import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  canonicalReviewTransportSha256,
  persistCanonicalReviewTransportJson,
  readReviewTransportJsonExactRef,
  requireExactReviewTransportKeys,
  requireReviewTransportRecord,
  requiredReviewTransportText,
  reviewTransportError,
  reviewTransportRoots,
  reviewTransportSize,
  type ReviewTransportExactRef,
} from './family-runtime-review-transport-store.ts';

export type ReviewEvidenceArtifactPackage = {
  package_id: string;
  package_content_digest: string;
};

export type ReviewEvidenceArtifactContext = {
  producer_attempt_ref: string;
  execution_content_binding_sha256: string;
  producer_package: ReviewEvidenceArtifactPackage;
  origin_evidence_ref: ReviewTransportExactRef;
};

type ReviewEvidenceArtifactReceipt = {
  surface_kind: 'opl_review_evidence_artifact_receipt';
  schema_version: 1;
  candidate_ref: ReviewTransportExactRef;
  producer_attempt_ref: string;
  execution_content_binding_sha256: string;
  producer_package: ReviewEvidenceArtifactPackage;
  origin_evidence_ref: ReviewTransportExactRef;
};

function normalizeExactRef(
  value: unknown,
  field: string,
  expectedKind?: string,
): ReviewTransportExactRef {
  const exactRef = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(exactRef, ['kind', 'ref', 'size_bytes', 'sha256'], field);
  const kind = requiredReviewTransportText(exactRef.kind, `${field}.kind`);
  if (expectedKind && kind !== expectedKind) {
    throw reviewTransportError(
      'review_evidence_artifact_ref_kind_mismatch',
      'Review evidence artifact exact-ref kind does not match its Framework surface.',
      { field, expected_kind: expectedKind, received_kind: kind },
    );
  }
  return {
    kind,
    ref: requiredReviewTransportText(exactRef.ref, `${field}.ref`),
    size_bytes: reviewTransportSize(exactRef.size_bytes, `${field}.size_bytes`),
    sha256: canonicalReviewTransportSha256(exactRef.sha256, `${field}.sha256`),
  };
}

function normalizeAttemptRef(value: unknown, field: string) {
  const attemptRef = requiredReviewTransportText(value, field);
  if (!attemptRef.startsWith('opl://stage_attempts/') || !attemptRef.slice('opl://stage_attempts/'.length)) {
    throw reviewTransportError(
      'review_evidence_artifact_attempt_ref_invalid',
      'Review evidence artifact receipt must bind one OPL reviewer Attempt.',
      { field, producer_attempt_ref: attemptRef },
    );
  }
  return attemptRef;
}

function normalizePackage(value: unknown, field: string): ReviewEvidenceArtifactPackage {
  const identity = requireReviewTransportRecord(value, field);
  requireExactReviewTransportKeys(
    identity,
    ['package_id', 'package_content_digest'],
    field,
  );
  return {
    package_id: requiredReviewTransportText(identity.package_id, `${field}.package_id`),
    package_content_digest: canonicalReviewTransportSha256(
      identity.package_content_digest,
      `${field}.package_content_digest`,
    ),
  };
}

function normalizeContext(value: unknown): ReviewEvidenceArtifactContext {
  const context = requireReviewTransportRecord(value, 'review_evidence_artifact_context');
  requireExactReviewTransportKeys(context, [
    'producer_attempt_ref',
    'execution_content_binding_sha256',
    'producer_package',
    'origin_evidence_ref',
  ], 'review_evidence_artifact_context');
  return {
    producer_attempt_ref: normalizeAttemptRef(
      context.producer_attempt_ref,
      'context.producer_attempt_ref',
    ),
    execution_content_binding_sha256: canonicalReviewTransportSha256(
      context.execution_content_binding_sha256,
      'context.execution_content_binding_sha256',
    ),
    producer_package: normalizePackage(context.producer_package, 'context.producer_package'),
    origin_evidence_ref: normalizeExactRef(
      context.origin_evidence_ref,
      'context.origin_evidence_ref',
    ),
  };
}

function normalizeReceipt(value: unknown): ReviewEvidenceArtifactReceipt {
  const receipt = requireReviewTransportRecord(value, 'review_evidence_artifact_receipt');
  requireExactReviewTransportKeys(receipt, [
    'surface_kind',
    'schema_version',
    'candidate_ref',
    'producer_attempt_ref',
    'execution_content_binding_sha256',
    'producer_package',
    'origin_evidence_ref',
  ], 'review_evidence_artifact_receipt');
  if (
    receipt.surface_kind !== 'opl_review_evidence_artifact_receipt'
    || receipt.schema_version !== 1
  ) {
    throw reviewTransportError(
      'review_evidence_artifact_receipt_invalid',
      'Review evidence artifact receipt must use Framework schema 1.',
    );
  }
  return {
    surface_kind: 'opl_review_evidence_artifact_receipt',
    schema_version: 1,
    candidate_ref: normalizeExactRef(
      receipt.candidate_ref,
      'receipt.candidate_ref',
      'opl_review_evidence_candidate',
    ),
    producer_attempt_ref: normalizeAttemptRef(
      receipt.producer_attempt_ref,
      'receipt.producer_attempt_ref',
    ),
    execution_content_binding_sha256: canonicalReviewTransportSha256(
      receipt.execution_content_binding_sha256,
      'receipt.execution_content_binding_sha256',
    ),
    producer_package: normalizePackage(receipt.producer_package, 'receipt.producer_package'),
    origin_evidence_ref: normalizeExactRef(
      receipt.origin_evidence_ref,
      'receipt.origin_evidence_ref',
    ),
  };
}

function readCandidate(exactRef: unknown) {
  return readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'opl_review_evidence_candidate',
    trustedRoot: reviewTransportRoots().review_evidence_candidate_root,
  });
}

export function persistReviewEvidenceArtifactCandidate(
  value: unknown,
  contextInput?: unknown,
) {
  const candidate = requireReviewTransportRecord(value, 'review_evidence_candidate');
  const context = normalizeContext(contextInput);
  const persistedCandidate = persistCanonicalReviewTransportJson({
    root: reviewTransportRoots().review_evidence_candidate_root,
    kind: 'opl_review_evidence_candidate',
    value: candidate,
  });
  const receipt: ReviewEvidenceArtifactReceipt = {
    surface_kind: 'opl_review_evidence_artifact_receipt',
    schema_version: 1,
    candidate_ref: persistedCandidate.exact_ref,
    producer_attempt_ref: context.producer_attempt_ref,
    execution_content_binding_sha256: context.execution_content_binding_sha256,
    producer_package: context.producer_package,
    origin_evidence_ref: context.origin_evidence_ref,
  };
  const persistedReceipt = persistCanonicalReviewTransportJson({
    root: reviewTransportRoots().review_evidence_receipt_root,
    kind: 'opl_review_evidence_artifact_receipt',
    value: receipt,
  });
  return readReviewEvidenceArtifactReceipt(persistedReceipt.exact_ref, receipt);
}

export function readReviewEvidenceArtifactReceipt(
  exactRef: unknown,
  expectedReceiptBody?: unknown,
) {
  const persisted = readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'opl_review_evidence_artifact_receipt',
    trustedRoot: reviewTransportRoots().review_evidence_receipt_root,
  });
  const receipt = normalizeReceipt(persisted.value);
  if (
    expectedReceiptBody !== undefined
    && canonicalJsonText(receipt) !== canonicalJsonText(expectedReceiptBody)
  ) {
    throw reviewTransportError(
      'review_evidence_artifact_receipt_body_mismatch',
      'Persisted review evidence artifact receipt body does not match its exact bytes.',
    );
  }
  const candidate = readCandidate(receipt.candidate_ref);
  return {
    receipt_ref: persisted.exact_ref,
    receipt,
    candidate_ref: candidate.exact_ref,
    candidate: candidate.value,
  };
}
