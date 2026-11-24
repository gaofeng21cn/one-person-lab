import type { StageReviewContextManifest, StageReviewReceipt } from "./types.ts";
import { nonEmptyStringSequence, nonEmptyStrings, normalizeStageQualityArtifactIdentity, requiredRefs, requiredText, uniqueIds } from "./primitives.ts";
import { FrameworkContractError } from "../../../kernel/contract-validation.ts";

export function buildStageReviewContextManifest(input: {
  stageRunId: string;
  qualityCycleId: string;
  reviewerAttemptRole: StageReviewContextManifest['reviewer_attempt_role'];
  stageGoalRefs?: string[];
  artifactRefs: string[];
  artifactHashes: string[];
  sourceRefs?: string[];
  qualityRubricRefs: string[];
  knowledgeRefs?: string[];
  skillRefs?: string[];
  policyRefs?: string[];
  lineageRefs?: string[];
  priorFindingRefs?: string[];
  repairMapRefs?: string[];
}): StageReviewContextManifest {
  const artifactIdentity = normalizeStageQualityArtifactIdentity({
    artifactRefs: input.artifactRefs,
    artifactHashes: input.artifactHashes,
  });
  return {
    surface_kind: 'opl_stage_review_context_manifest',
    version: 'stage-review-context-manifest.v1',
    stage_run_id: requiredText(input.stageRunId, 'stage_run_id'),
    quality_cycle_id: requiredText(input.qualityCycleId, 'quality_cycle_id'),
    reviewer_attempt_role: input.reviewerAttemptRole,
    stage_goal_refs: nonEmptyStrings(input.stageGoalRefs ?? [], 'stage_goal_refs'),
    artifact_refs: artifactIdentity.artifact_refs,
    artifact_hashes: artifactIdentity.artifact_hashes,
    source_refs: nonEmptyStrings(input.sourceRefs ?? [], 'source_refs'),
    quality_rubric_refs: requiredRefs(input.qualityRubricRefs, 'quality_rubric_refs'),
    knowledge_refs: nonEmptyStrings(input.knowledgeRefs ?? [], 'knowledge_refs'),
    skill_refs: nonEmptyStrings(input.skillRefs ?? [], 'skill_refs'),
    policy_refs: nonEmptyStrings(input.policyRefs ?? [], 'policy_refs'),
    lineage_refs: nonEmptyStrings(input.lineageRefs ?? [], 'lineage_refs'),
    prior_finding_refs: nonEmptyStrings(input.priorFindingRefs ?? [], 'prior_finding_refs'),
    repair_map_refs: nonEmptyStrings(input.repairMapRefs ?? [], 'repair_map_refs'),
    no_context_inheritance: true,
    forbidden_context_kinds: [
      'producer_conversation_history',
      'producer_thread_resume',
      'reviewer_thread_resume',
      'chain_of_thought',
      'undeclared_ephemeral_context',
    ],
  };
}

export function validateIndependentStageReviewReceipt(receipt: StageReviewReceipt) {
  if (receipt.surface_kind !== 'opl_stage_review_receipt' || receipt.version !== 'stage-review-receipt.v1') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review receipt surface kind and version are invalid.',
      { surface_kind: receipt.surface_kind, version: receipt.version },
    );
  }
  const snapshotMaterialized = receipt.review_input_snapshot_status === 'materialized'
    || receipt.review_input_snapshot_status === 'already_materialized';
  const snapshotBindingValid = receipt.review_input_snapshot_binding !== null
    && typeof receipt.review_input_snapshot_binding === 'object'
    && !Array.isArray(receipt.review_input_snapshot_binding)
    && receipt.review_input_snapshot_binding.surface_kind === 'opl_reviewer_input_snapshot_binding';
  const snapshotManifestRefValid = receipt.opl_reviewer_input_snapshot_manifest_ref !== null
    && typeof receipt.opl_reviewer_input_snapshot_manifest_ref === 'object'
    && !Array.isArray(receipt.opl_reviewer_input_snapshot_manifest_ref);
  const snapshotManifestValid = receipt.opl_reviewer_input_snapshot_manifest !== null
    && typeof receipt.opl_reviewer_input_snapshot_manifest === 'object'
    && !Array.isArray(receipt.opl_reviewer_input_snapshot_manifest)
    && receipt.opl_reviewer_input_snapshot_manifest.surface_kind
      === 'opl_reviewer_input_snapshot_manifest';
  const snapshotDebtValid = typeof receipt.review_input_snapshot_quality_debt_receipt_ref === 'string'
    && receipt.review_input_snapshot_quality_debt_receipt_ref.length > 0
    && receipt.review_input_snapshot_quality_debt_receipt !== null
    && typeof receipt.review_input_snapshot_quality_debt_receipt === 'object'
    && !Array.isArray(receipt.review_input_snapshot_quality_debt_receipt)
    && receipt.review_input_snapshot_quality_debt_receipt.surface_kind
      === 'opl_review_input_snapshot_quality_debt_receipt';
  if (
    snapshotMaterialized
      ? !snapshotBindingValid
        || !snapshotManifestRefValid
        || !snapshotManifestValid
        || receipt.review_input_snapshot_quality_debt_receipt_ref !== null
        || receipt.review_input_snapshot_quality_debt_receipt !== null
      : receipt.review_input_snapshot_status !== 'quality_debt'
        || receipt.review_input_snapshot_binding !== null
        || receipt.opl_reviewer_input_snapshot_manifest_ref !== null
        || receipt.opl_reviewer_input_snapshot_manifest !== null
        || !snapshotDebtValid
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review receipt must bind either the exact immutable reviewer snapshot or its non-blocking quality debt receipt.',
      { review_input_snapshot_status: receipt.review_input_snapshot_status ?? null },
    );
  }
  if (
    (receipt.opl_review_evidence_artifact_receipt_ref === null)
      !== (receipt.opl_review_evidence_artifact_receipt === null)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review receipt evidence artifact ref and body must be present or absent together.',
    );
  }
  if (receipt.opl_review_evidence_artifact_receipt) {
    if (
      receipt.opl_review_evidence_artifact_receipt.surface_kind
        !== 'opl_review_evidence_artifact_receipt'
      || receipt.opl_review_evidence_artifact_receipt.schema_version !== 1
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage Review receipt evidence artifact binding is invalid.',
      );
    }
  }
  requiredText(receipt.stage_run_id, 'stage_run_id');
  requiredText(receipt.quality_cycle_id, 'quality_cycle_id');
  const producerAttemptRef = requiredText(receipt.producer_attempt_ref, 'producer_attempt_ref');
  const reviewerAttemptRef = requiredText(receipt.reviewer_attempt_ref, 'reviewer_attempt_ref');
  if (producerAttemptRef === reviewerAttemptRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Formal Stage Review receipt must bind distinct producer and reviewer Attempts.',
      { producer_attempt_ref: producerAttemptRef, reviewer_attempt_ref: reviewerAttemptRef },
    );
  }
  const producerSessionRef = requiredText(receipt.producer_session_ref, 'producer_session_ref');
  const reviewerSessionRef = requiredText(receipt.reviewer_session_ref, 'reviewer_session_ref');
  if (receipt.no_context_inheritance !== true) {
    throw new FrameworkContractError('contract_shape_invalid', 'Formal Stage Review must declare no_context_inheritance=true.');
  }
  if (producerSessionRef === reviewerSessionRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'Formal Stage Review must use a new provider session.', {
      producer_session_ref: producerSessionRef,
      reviewer_session_ref: reviewerSessionRef,
    });
  }
  normalizeStageQualityArtifactIdentity({
    artifactRefs: receipt.reviewed_artifact_refs,
    artifactHashes: receipt.reviewed_artifact_hashes,
  });
  requiredRefs(receipt.rubric_refs, 'rubric_refs');
  if (!['pass', 'repair_required', 'quality_debt', 'hard_stop'].includes(receipt.verdict)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage Review receipt verdict is invalid.', {
      verdict: receipt.verdict,
    });
  }
  if (!receipt.finding_lineage || typeof receipt.finding_lineage !== 'object') {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt finding_lineage must be an object.');
  }
  if (!['initial_review', 'finding_closure_review'].includes(receipt.finding_lineage.review_kind)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt finding_lineage review_kind is invalid.');
  }
  uniqueIds(nonEmptyStringSequence(receipt.finding_lineage.finding_ids, 'finding_lineage.finding_ids'), 'finding_lineage.finding_ids');
  if (!/^sha256:[a-f0-9]{64}$/.test(receipt.finding_lineage.findings_sha256)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt findings_sha256 must be a canonical SHA-256 digest.',
      { value: receipt.finding_lineage.findings_sha256 },
    );
  }
  for (const [field, value] of Object.entries({
    repair_map_sha256: receipt.finding_lineage.repair_map_sha256,
    re_review_result_sha256: receipt.finding_lineage.re_review_result_sha256,
  })) {
    if (value !== null && !/^sha256:[a-f0-9]{64}$/.test(value)) {
      throw new FrameworkContractError('contract_shape_invalid', `Review receipt ${field} must be a canonical SHA-256 digest.`, {
        field,
        value,
      });
    }
  }
  if (receipt.finding_lineage.review_kind === 'initial_review') {
    if (receipt.finding_lineage.repair_map_sha256 !== null || receipt.finding_lineage.re_review_result_sha256 !== null) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Initial Review receipt cannot bind repair-map or Re-review result digests.',
      );
    }
  } else {
    if (!receipt.finding_lineage.repair_map_sha256) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Finding-closure Review receipt requires an exact repair-map digest.',
      );
    }
    if (receipt.verdict === 'hard_stop' && receipt.finding_lineage.re_review_result_sha256 !== null) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Hard-stop Re-review receipt cannot bind a finding-closure result digest.',
      );
    }
    if (receipt.verdict !== 'hard_stop' && !receipt.finding_lineage.re_review_result_sha256) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Non-hard-stop finding-closure Review receipt requires an exact Re-review result digest.',
      );
    }
  }
  return {
    valid: true,
    context_isolation_verified: true,
    reviewer_session_diff_verified: true,
  } as const;
}
