import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { StageReviewReceipt } from '../stagecraft/public/stage-quality-cycle.ts';
import {
  persistCanonicalReviewTransportJson,
  readReviewTransportJsonExactRef,
  reviewTransportRoots,
  type ReviewTransportExactRef,
} from './family-runtime-review-transport-store.ts';

const REVISION_TRANSPORT_AUTHORITY_BOUNDARY = {
  transport_owner: 'one-person-lab',
  records_revision_input_only: true,
  can_sign_review_verdict: false,
  can_sign_revision_consumption: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_claim_quality_readiness: false,
  can_claim_publication_readiness: false,
  can_claim_submission_readiness: false,
} as const;

export type OplRevisionIntake = {
  surface_kind: 'opl_revision_intake';
  schema_version: 1;
  stage_run_id: string;
  quality_cycle_id: string;
  producer_attempt_ref: string;
  reviewer_attempt_ref: string;
  opl_stage_review_receipt_ref: ReviewTransportExactRef;
  verdict: StageReviewReceipt['verdict'];
  finding_lineage: StageReviewReceipt['finding_lineage'];
  authority_boundary: typeof REVISION_TRANSPORT_AUTHORITY_BOUNDARY;
};

export type OplRevisionTransport = {
  surface_kind: 'opl_revision_transport';
  schema_version: 1;
  opl_stage_review_receipt_ref: ReviewTransportExactRef;
  opl_revision_intake_ref: ReviewTransportExactRef;
  opl_revision_intake: OplRevisionIntake;
  authority_boundary: typeof REVISION_TRANSPORT_AUTHORITY_BOUNDARY;
};

function assertReviewReceiptBody(value: unknown): asserts value is StageReviewReceipt {
  if (
    !isRecord(value)
    || value.surface_kind !== 'opl_stage_review_receipt'
    || value.version !== 'stage-review-receipt.v1'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Revision intake requires an OPL Stage Review receipt.',
      { failure_code: 'revision_intake_stage_review_receipt_invalid' },
    );
  }
}

export function materializeOplRevisionTransport(receipt: StageReviewReceipt): OplRevisionTransport {
  assertReviewReceiptBody(receipt);
  const roots = reviewTransportRoots();
  const persistedReceipt = persistCanonicalReviewTransportJson({
    root: roots.stage_review_receipt_root,
    kind: 'opl_stage_review_receipt',
    value: receipt as unknown as Record<string, unknown>,
  });
  const intake: OplRevisionIntake = {
    surface_kind: 'opl_revision_intake',
    schema_version: 1,
    stage_run_id: receipt.stage_run_id,
    quality_cycle_id: receipt.quality_cycle_id,
    producer_attempt_ref: receipt.producer_attempt_ref,
    reviewer_attempt_ref: receipt.reviewer_attempt_ref,
    opl_stage_review_receipt_ref: persistedReceipt.exact_ref,
    verdict: receipt.verdict,
    finding_lineage: receipt.finding_lineage,
    authority_boundary: REVISION_TRANSPORT_AUTHORITY_BOUNDARY,
  };
  const persistedIntake = persistCanonicalReviewTransportJson({
    root: roots.revision_intake_root,
    kind: 'opl_revision_intake',
    value: intake as unknown as Record<string, unknown>,
  });
  return {
    surface_kind: 'opl_revision_transport',
    schema_version: 1,
    opl_stage_review_receipt_ref: persistedReceipt.exact_ref,
    opl_revision_intake_ref: persistedIntake.exact_ref,
    opl_revision_intake: intake,
    authority_boundary: REVISION_TRANSPORT_AUTHORITY_BOUNDARY,
  };
}

export function readOplRevisionIntake(exactRef: unknown) {
  const persisted = readReviewTransportJsonExactRef({
    exactRef,
    expectedKind: 'opl_revision_intake',
    trustedRoot: reviewTransportRoots().revision_intake_root,
  });
  const intake = persisted.value;
  if (
    intake.surface_kind !== 'opl_revision_intake'
    || intake.schema_version !== 1
    || canonicalJsonText(intake.authority_boundary) !== canonicalJsonText(REVISION_TRANSPORT_AUTHORITY_BOUNDARY)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted OPL revision intake violates its transport-only authority boundary.',
      { failure_code: 'revision_intake_authority_boundary_invalid' },
    );
  }
  const reviewReceiptReadback = readReviewTransportJsonExactRef({
    exactRef: intake.opl_stage_review_receipt_ref,
    expectedKind: 'opl_stage_review_receipt',
    trustedRoot: reviewTransportRoots().stage_review_receipt_root,
  });
  assertReviewReceiptBody(reviewReceiptReadback.value);
  const receipt = reviewReceiptReadback.value;
  if (
    intake.stage_run_id !== receipt.stage_run_id
    || intake.quality_cycle_id !== receipt.quality_cycle_id
    || intake.producer_attempt_ref !== receipt.producer_attempt_ref
    || intake.reviewer_attempt_ref !== receipt.reviewer_attempt_ref
    || intake.verdict !== receipt.verdict
    || canonicalJsonText(intake.finding_lineage) !== canonicalJsonText(receipt.finding_lineage)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL revision intake does not exactly bind its Stage Review receipt.',
      { failure_code: 'revision_intake_stage_review_receipt_mismatch' },
    );
  }
  return {
    revision_intake_ref: persisted.exact_ref,
    revision_intake: intake as unknown as OplRevisionIntake,
    stage_review_receipt_ref: reviewReceiptReadback.exact_ref,
    stage_review_receipt: receipt,
  };
}

export function revisionTransportContext(input: {
  revisionIntakeRefs?: unknown[];
  oplStageReviewReceiptRef?: unknown | null;
}) {
  const revisionIntakeRefs = input.revisionIntakeRefs ?? [];
  const readbacks = revisionIntakeRefs.map((ref) => readOplRevisionIntake(ref));
  if (input.oplStageReviewReceiptRef) {
    const expected = readbacks.at(-1)?.stage_review_receipt_ref;
    if (!expected || canonicalJsonText(expected) !== canonicalJsonText(input.oplStageReviewReceiptRef)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Revision consumption context review receipt must be bound by its revision intake.',
        { failure_code: 'revision_consumption_context_review_receipt_mismatch' },
      );
    }
  }
  return {
    surface_kind: 'opl_revision_consumption_context',
    schema_version: 1,
    revision_intake_refs: readbacks.map((item) => item.revision_intake_ref),
    opl_stage_review_receipt_ref: input.oplStageReviewReceiptRef
      ? readbacks.at(-1)!.stage_review_receipt_ref
      : null,
    mas_revision_consumption_binding: null,
    progress_policy: {
      missing_mas_revision_consumption_binding_is_quality_debt: true,
      stage_transition_allowed: true,
      typed_blocker_ref: null,
    },
    authority_boundary: REVISION_TRANSPORT_AUTHORITY_BOUNDARY,
  } as const;
}
