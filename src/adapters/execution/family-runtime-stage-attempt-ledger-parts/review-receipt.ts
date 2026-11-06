import type { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { record } from '../../../kernel/json-record.ts';
import {
  evaluateStageQualityFindingClosure,
  normalizeStageQualityAttemptRole,
  stageQualityAttemptOutcomeFromEnvelope,
  stageQualityOutcomeFromEnvelope,
  stageReviewVerdictForOutcome,
  validateIndependentStageReviewReceipt,
  validateInitialStageQualityReviewOutcome,
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  validateStageQualityReReviewOutcome,
  validateStageQualityReviewHardStopOutcome,
  type StageQualityFinding,
  type StageQualityRepairMapEntry,
  type StageQualityReReviewResult,
  type StageReviewReceipt,
} from '../../../authority/stages/index.ts';
import { validateStageQualityAttemptContextManifest } from '../family-runtime-stage-quality-context-manifest.ts';
import {
  readReviewEvidenceArtifactReceipt,
} from '../family-runtime-review-evidence-artifact.ts';
import {
  canonicalStageAttemptDeclaredStageIds,
  selectStageAttemptPackageIdentity,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  type StageRunImmutableSpec,
} from '../family-runtime-stage-run-identity.ts';
import {
  executionScopeColumnsFromRow,
  executionScopeFromRow,
  requireRuntimeExecutionScopeMutationAllowed,
} from '../family-runtime-execution-scope-persistence.ts';
import { requireWorkItemExecutionScopeSnapshot } from '../../../authority/workspace/index.ts';
import { getStageAttemptRow } from './persistence.ts';
import { parseJsonList, parseJsonObject } from './payload.ts';
import type { StageAttemptRow } from './types.ts';

type PersistedStageReviewReceiptInput = {
  producerAttemptId: string;
  reviewerAttemptId: string;
  rubricRefs: string[];
  verdict: 'pass' | 'repair_required' | 'quality_debt' | 'hard_stop';
};

function persistedStringList(value: string | null | undefined, field: string) {
  const parsed = value ? parseJsonList(value) : [];
  if (parsed.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain only non-empty strings.`, {
      field,
    });
  }
  return parsed.map((entry) => String(entry).trim());
}

function exactStringList(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactCanonicalValue(left: unknown, right: unknown) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function canonicalSha256(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value)).digest('hex')}`;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function currentExecutionBindingSha256(input: {
  reviewer: StageAttemptRow;
  reviewerQualityContext: Record<string, unknown>;
  reviewerRubricRefs: string[];
}) {
  const executionBinding = record(input.reviewerQualityContext.execution_content_binding);
  if (Object.keys(executionBinding).length === 0) return null;
  const executionSpec = record(executionBinding.spec);
  const parentSpecSha256 = optionalText(executionBinding.parent_stage_run_spec_sha256);
  const useBoundaryId = optionalText(executionBinding.use_boundary_id);
  const suppliedSpecSha256 = optionalText(executionBinding.spec_sha256);
  const suppliedBindingSha256 = optionalText(executionBinding.binding_sha256);
  if (!parentSpecSha256 || !useBoundaryId || !suppliedSpecSha256 || !suppliedBindingSha256) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted reviewer execution content binding is incomplete.',
      { failure_code: 'stage_review_receipt_execution_binding_incomplete' },
    );
  }
  const declaredStageIds = canonicalStageAttemptDeclaredStageIds(executionBinding.declared_stage_ids);
  const expectedSpecSha256 = stageRunSpecSha256(executionSpec as StageRunImmutableSpec);
  const expectedBindingSha256 = stageAttemptExecutionContentBindingSha256({
    parent_stage_run_spec_sha256: parentSpecSha256,
    use_boundary_id: useBoundaryId,
    spec_sha256: suppliedSpecSha256,
    spec: executionSpec as StageRunImmutableSpec,
    declared_stage_ids: declaredStageIds,
  });
  const specRubricRefs = Array.isArray(executionSpec.quality_rubric_refs)
    ? executionSpec.quality_rubric_refs.filter(
        (ref): ref is string => typeof ref === 'string' && Boolean(ref.trim()),
      ).map((ref) => ref.trim())
    : [];
  const rolePromptRefs = record(executionSpec.role_prompt_refs);
  const reviewerRole = normalizeStageQualityAttemptRole(input.reviewer.attempt_role);
  if (
    executionBinding.surface_kind !== 'opl_stage_attempt_execution_content_binding'
    || executionBinding.version !== 'opl-stage-attempt-execution-content-binding.v1'
    || suppliedSpecSha256 !== expectedSpecSha256
    || suppliedBindingSha256 !== expectedBindingSha256
    || !exactStringList(
      Array.isArray(executionBinding.declared_stage_ids)
        ? executionBinding.declared_stage_ids as string[]
        : [],
      declaredStageIds,
    )
    || executionSpec.domain_id !== input.reviewer.domain_id
    || executionSpec.stage_id !== input.reviewer.stage_id
    || !exactStringList(specRubricRefs, input.reviewerRubricRefs)
    || optionalText(rolePromptRefs[reviewerRole]) !== input.reviewer.quality_role_prompt_ref
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted reviewer execution content binding does not match the current Attempt.',
      {
        failure_code: 'stage_review_receipt_execution_binding_mismatch',
        supplied_spec_sha256: suppliedSpecSha256,
        expected_spec_sha256: expectedSpecSha256,
        supplied_binding_sha256: suppliedBindingSha256,
        expected_binding_sha256: expectedBindingSha256,
      },
    );
  }
  return expectedBindingSha256;
}

function validateCurrentReviewEvidenceArtifact(input: {
  reviewer: StageAttemptRow;
  reviewerQualityContext: Record<string, unknown>;
  reviewerEnvelope: Record<string, unknown>;
  reviewerRubricRefs: string[];
  receiptRef: unknown;
  receiptBody: unknown;
}) {
  const executionBindingSha256 = currentExecutionBindingSha256(input);
  const executionBinding = record(input.reviewerQualityContext.execution_content_binding);
  const reviewerAttemptRef = `opl://stage_attempts/${input.reviewer.stage_attempt_id}`;
  const readback = readReviewEvidenceArtifactReceipt(input.receiptRef, input.receiptBody);
  const packageId = optionalText(
    input.reviewerEnvelope.page_hash_evidence_candidate_package_id,
  );
  if (!packageId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review evidence artifact is missing its package declaration.',
      { failure_code: 'stage_review_receipt_artifact_package_missing' },
    );
  }
  const expectedPackage = selectStageAttemptPackageIdentity(executionBinding, packageId);
  const expectedCandidate = record(input.reviewerEnvelope.page_hash_evidence_candidate);
  const expectedOrigin = record(input.reviewerEnvelope.page_hash_evidence_origin_ref);
  if (
    readback.receipt.producer_attempt_ref !== reviewerAttemptRef
    || readback.receipt.execution_content_binding_sha256 !== `sha256:${executionBindingSha256}`
    || canonicalJsonText(readback.receipt.producer_package)
      !== canonicalJsonText(expectedPackage)
    || canonicalJsonText(readback.receipt.origin_evidence_ref)
      !== canonicalJsonText(expectedOrigin)
    || canonicalJsonText(readback.candidate) !== canonicalJsonText(expectedCandidate)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted review evidence artifact does not match the current Attempt binding.',
      { failure_code: 'stage_review_receipt_artifact_binding_mismatch' },
    );
  }
}

function persistedQualityEnvelope(row: StageAttemptRow) {
  return record(parseJsonObject(row.route_impact_json).stage_quality_cycle);
}

function persistedEnvelopeRecordList(
  envelope: Record<string, unknown>,
  field: string,
) {
  const value = envelope[field];
  if (
    !Array.isArray(value)
    || value.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
  ) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an array of objects.`, { field });
  }
  return value as Array<Record<string, unknown>>;
}

function requireResolvedReviewScope(row: Record<string, unknown>, identitySource: string) {
  const columns = executionScopeColumnsFromRow(row);
  if (columns.identity_state !== 'resolved') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires resolved execution identity.',
      {
        failure_code: 'stage_review_receipt_execution_identity_not_resolved',
        identity_source: identitySource,
        identity_state: columns.identity_state,
        scope_kind: columns.scope_kind,
      },
    );
  }
  if (columns.scope_kind !== 'work_item') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires work-item execution scope.',
      {
        failure_code: 'stage_review_receipt_execution_scope_not_work_item',
        identity_source: identitySource,
        scope_kind: columns.scope_kind,
      },
    );
  }
  if (!columns.work_item_scope_id || !columns.scope_digest) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt work-item execution identity is incomplete.',
      {
        failure_code: 'stage_review_receipt_execution_scope_incomplete',
        identity_source: identitySource,
        work_item_scope_id: columns.work_item_scope_id,
        scope_digest: columns.scope_digest,
      },
    );
  }
  const scope = executionScopeFromRow(row);
  if (!scope) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt work-item execution scope snapshot is missing.',
      {
        failure_code: 'stage_review_receipt_execution_scope_missing',
        identity_source: identitySource,
      },
    );
  }
  return requireWorkItemExecutionScopeSnapshot(scope);
}

function requireExactReviewScope(
  expected: ReturnType<typeof requireWorkItemExecutionScopeSnapshot>,
  actual: ReturnType<typeof requireWorkItemExecutionScopeSnapshot>,
  identitySource: string,
) {
  const fields = ['scope_kind', 'work_item_scope_id', 'scope_digest'] as const;
  const mismatches = fields.flatMap((field) => expected[field] === actual[field]
    ? []
    : [{ field, expected: expected[field], actual: actual[field] }]);
  if (mismatches.length > 0 || !exactCanonicalValue(expected, actual)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt execution scope does not exactly match the persisted StageRun.',
      {
        failure_code: 'stage_review_receipt_execution_scope_mismatch',
        identity_source: identitySource,
        mismatches,
      },
    );
  }
}

function requireSameReviewIdentity(
  db: DatabaseSync,
  producer: StageAttemptRow,
  reviewer: StageAttemptRow,
) {
  const identityFields = ['domain_id', 'stage_id', 'stage_run_id', 'quality_cycle_id'] as const;
  const mismatches = identityFields.filter((field) =>
    !producer[field]
    || !reviewer[field]
    || producer[field] !== reviewer[field]
  );
  if (mismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt Attempts must share exact domain, Stage, StageRun, and quality-cycle identity.',
      { mismatched_fields: mismatches },
    );
  }
  const producerScope = requireResolvedReviewScope(producer, 'producer_attempt');
  const reviewerScope = requireResolvedReviewScope(reviewer, 'reviewer_attempt');
  const hasStageRunRegistry = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stage_run_launches'",
  ).get();
  const stageRun = hasStageRunRegistry
    ? db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?')
      .get(reviewer.stage_run_id!) as Record<string, unknown> | undefined
    : undefined;
  if (!stageRun) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires the persisted authoritative StageRun launch identity.',
      {
        failure_code: 'stage_review_receipt_stage_run_unregistered',
        stage_run_id: reviewer.stage_run_id,
      },
    );
  }
  const stageRunIdentityFields = ['domain_id', 'stage_id'] as const;
  const stageRunIdentityMismatches = stageRunIdentityFields.flatMap((field) =>
    stageRun[field] === reviewer[field]
      ? []
      : [{ field, expected: stageRun[field], actual: reviewer[field] }]);
  if (stageRunIdentityMismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt Attempts do not match the persisted StageRun identity.',
      {
        failure_code: 'stage_review_receipt_stage_run_identity_mismatch',
        stage_run_id: reviewer.stage_run_id,
        mismatches: stageRunIdentityMismatches,
      },
    );
  }
  const stageRunScope = requireResolvedReviewScope(stageRun, 'stage_run');
  const registeredScope = db.prepare('SELECT * FROM execution_scopes WHERE scope_digest = ?')
    .get(stageRunScope.scope_digest) as Record<string, unknown> | undefined;
  if (!registeredScope) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt StageRun scope is absent from the persisted execution-scope registry.',
      {
        failure_code: 'stage_review_receipt_execution_scope_unregistered',
        scope_digest: stageRunScope.scope_digest,
      },
    );
  }
  const registryScope = requireResolvedReviewScope(registeredScope, 'execution_scope_registry');
  requireExactReviewScope(stageRunScope, registryScope, 'execution_scope_registry');
  requireExactReviewScope(stageRunScope, producerScope, 'producer_attempt');
  requireExactReviewScope(stageRunScope, reviewerScope, 'reviewer_attempt');
}

function requirePersistedQualityContextManifest(row: StageAttemptRow) {
  const attemptRole = normalizeStageQualityAttemptRole(row.attempt_role);
  if (!row.stage_run_id || !row.quality_cycle_id || !row.context_manifest_ref || !row.context_manifest_json) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires the exact persisted context manifest for both Attempts.',
      { stage_attempt_id: row.stage_attempt_id },
    );
  }
  return validateStageQualityAttemptContextManifest({
    attemptRole,
    stageRunId: row.stage_run_id,
    qualityCycleId: row.quality_cycle_id,
    artifactRefs: persistedStringList(row.input_artifact_refs_json, 'attempt.input_artifact_refs'),
    artifactHashes: persistedStringList(row.reviewed_artifact_hashes_json, 'attempt.reviewed_artifact_hashes'),
    stageGoalRefs: persistedStringList(row.quality_stage_goal_refs_json, 'attempt.quality_stage_goal_refs'),
    sourceRefs: persistedStringList(row.quality_source_refs_json, 'attempt.quality_source_refs'),
    knowledgeRefs: persistedStringList(row.quality_knowledge_refs_json, 'attempt.quality_knowledge_refs'),
    skillRefs: persistedStringList(row.quality_skill_refs_json, 'attempt.quality_skill_refs'),
    policyRefs: persistedStringList(row.quality_policy_refs_json, 'attempt.quality_policy_refs'),
    lineageRefs: persistedStringList(row.quality_lineage_refs_json, 'attempt.quality_lineage_refs'),
    priorFindingRefs: persistedStringList(row.prior_finding_refs_json, 'attempt.prior_finding_refs'),
    repairMapRefs: persistedStringList(row.repair_map_refs_json, 'attempt.repair_map_refs'),
    rubricRefs: persistedStringList(row.quality_rubric_refs_json, 'attempt.quality_rubric_refs'),
    contextManifestRef: row.context_manifest_ref,
    contextManifest: parseJsonObject(row.context_manifest_json),
  });
}

function requireReviewRolePair(producer: StageAttemptRow, reviewer: StageAttemptRow) {
  const producerRole = normalizeStageQualityAttemptRole(producer.attempt_role);
  const reviewerRole = normalizeStageQualityAttemptRole(reviewer.attempt_role);
  const producerRound = producer.quality_round_index;
  const reviewerRound = reviewer.quality_round_index;
  const initialPair = producerRole === 'producer'
    && reviewerRole === 'reviewer'
    && producerRound === 0
    && reviewerRound === 0;
  const reReviewPair = producerRole === 'repairer'
    && reviewerRole === 're_reviewer'
    && typeof producerRound === 'number'
    && producerRound >= 1
    && producerRound === reviewerRound;
  if (!initialPair && !reReviewPair) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt role pair must be producer(round 0) -> reviewer(round 0) or repairer(round n) -> re_reviewer(round n).',
      {
        producer_role: producerRole,
        producer_round: producerRound,
        reviewer_role: reviewerRole,
        reviewer_round: reviewerRound,
      },
    );
  }
  const expectedParentRef = `opl://stage_attempts/${producer.stage_attempt_id}`;
  if (reviewer.parent_attempt_ref !== expectedParentRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt reviewer must reference the exact producer or repairer Attempt as parent.',
      {
        expected_parent_attempt_ref: expectedParentRef,
        reviewer_parent_attempt_ref: reviewer.parent_attempt_ref,
      },
    );
  }
  return { reviewerRole: reviewerRole as 'reviewer' | 're_reviewer' };
}

function persistedQualityContext(row: StageAttemptRow) {
  return row.quality_context_json ? parseJsonObject(row.quality_context_json) : {};
}

function persistedReviewerOutcome(
  producer: StageAttemptRow,
  row: StageAttemptRow,
  reviewerRole: 'reviewer' | 're_reviewer',
) {
  const envelope = persistedQualityEnvelope(row);
  const outcome = stageQualityOutcomeFromEnvelope({ attemptRole: reviewerRole, envelope });
  if (outcome === 'blocked' || outcome === 'human_gate') {
    validateStageQualityReviewHardStopOutcome({ outcome, envelope });
    if (reviewerRole === 'reviewer') {
      return {
        outcome,
        findings: [] as StageQualityFinding[],
        repairMap: [],
        reReview: null,
      };
    }
  }
  if (reviewerRole === 'reviewer') {
    const findings = validateInitialStageQualityReviewOutcome({
      outcome,
      findings: persistedEnvelopeRecordList(envelope, 'findings') as StageQualityFinding[],
    });
    return { outcome, findings, repairMap: [], reReview: null };
  }

  const qualityContext = persistedQualityContext(row);
  const findings = validateStageQualityFindings(
    persistedEnvelopeRecordList(qualityContext, 'findings') as StageQualityFinding[],
  );
  const repairMap = validateStageQualityRepairMap({
    findings,
    repairMap: persistedEnvelopeRecordList(qualityContext, 'repair_map') as StageQualityRepairMapEntry[],
  });
  const priorFindingIds = persistedStringList(row.prior_finding_refs_json, 're_reviewer.prior_finding_refs');
  const repairMapFindingIds = persistedStringList(row.repair_map_refs_json, 're_reviewer.repair_map_refs')
    .map((ref) => {
      const prefix = 'repair-map:';
      if (!ref.startsWith(prefix) || !ref.slice(prefix.length)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Re-review repair_map_refs must identify a stable finding id.',
          { repair_map_ref: ref },
        );
      }
      return ref.slice(prefix.length);
    });
  if (repairMapFindingIds.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review receipt requires persisted repair_map_refs for prior required findings.',
    );
  }
  const findingIds = findings.map((finding) => finding.finding_id);
  const repairMapIds = repairMap.map((entry) => entry.finding_id);
  if (!exactStringList(priorFindingIds, findingIds)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review prior_finding_refs must exactly identify the persisted finding bodies.',
      { prior_finding_refs: priorFindingIds, persisted_finding_ids: findingIds },
    );
  }
  if (!exactStringList(repairMapFindingIds, repairMapIds)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review repair_map_refs must exactly identify the persisted repair-map bodies.',
      { repair_map_refs: repairMapFindingIds, persisted_repair_map_ids: repairMapIds },
    );
  }
  const producerContext = persistedQualityContext(producer);
  const producerFindings = persistedEnvelopeRecordList(producerContext, 'findings');
  const producerRepairMap = persistedEnvelopeRecordList(persistedQualityEnvelope(producer), 'repair_map');
  if (!exactCanonicalValue(producerFindings, findings)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Repairer and Re-reviewer must share the exact persisted finding bodies.',
    );
  }
  if (!exactCanonicalValue(producerRepairMap, repairMap)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review repair_map must exactly match the persisted repairer output.',
    );
  }
  if (outcome === 'blocked' || outcome === 'human_gate') {
    return { outcome, findings, repairMap, reReview: null };
  }
  const reReview: StageQualityReReviewResult = {
    finding_closures: persistedEnvelopeRecordList(
      envelope,
      'finding_closures',
    ) as StageQualityReReviewResult['finding_closures'],
    repair_regressions: persistedEnvelopeRecordList(
      envelope,
      'repair_regressions',
    ) as StageQualityReReviewResult['repair_regressions'],
    critical_new_findings: persistedEnvelopeRecordList(
      envelope,
      'critical_new_findings',
    ) as StageQualityReReviewResult['critical_new_findings'],
    optional_observations: persistedEnvelopeRecordList(
      envelope,
      'optional_observations',
    ) as StageQualityReReviewResult['optional_observations'],
  };
  const closure = evaluateStageQualityFindingClosure({ findings, repairMap, reReview });
  validateStageQualityReReviewOutcome({ outcome, closure });
  return { outcome, findings, repairMap, reReview };
}

function persistedStageReviewReceiptInputs(db: DatabaseSync, input: PersistedStageReviewReceiptInput) {
  const producer = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.producerAttemptId,
  ) as StageAttemptRow | undefined;
  const reviewer = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.reviewerAttemptId,
  ) as StageAttemptRow | undefined;
  if (!producer || !reviewer) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt requires both persisted Attempts.');
  }
  requireSameReviewIdentity(db, producer, reviewer);
  const { reviewerRole } = requireReviewRolePair(producer, reviewer);
  requirePersistedQualityContextManifest(producer);
  const reviewerContextManifest = requirePersistedQualityContextManifest(reviewer);
  if (producer.status !== 'completed' || reviewer.status !== 'completed') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires both persisted Attempts to be completed.',
      { producer_status: producer.status, reviewer_status: reviewer.status },
    );
  }
  if (!producer.execution_session_ref || !reviewer.execution_session_ref) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt requires observed execution sessions.');
  }
  if (producer.no_context_inheritance !== 1 || reviewer.no_context_inheritance !== 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires both persisted Attempts to prove no context inheritance.',
      {
        producer_no_context_inheritance: producer.no_context_inheritance,
        reviewer_no_context_inheritance: reviewer.no_context_inheritance,
      },
    );
  }
  if (producer.execution_session_ref === reviewer.execution_session_ref) {
    throw new FrameworkContractError('contract_shape_invalid', 'Formal Stage Review must use a new provider session.', {
      producer_session_ref: producer.execution_session_ref,
      reviewer_session_ref: reviewer.execution_session_ref,
    });
  }
  const producerEnvelope = persistedQualityEnvelope(producer);
  const reviewerEnvelope = persistedQualityEnvelope(reviewer);
  stageQualityAttemptOutcomeFromEnvelope({
    attemptRole: normalizeStageQualityAttemptRole(producer.attempt_role),
    envelope: producerEnvelope,
  });
  const reviewerEvidence = persistedReviewerOutcome(producer, reviewer, reviewerRole);
  const expectedVerdict = stageReviewVerdictForOutcome(reviewerEvidence.outcome);
  if (input.verdict !== expectedVerdict) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Requested review receipt verdict does not match the persisted reviewer outcome.',
      { reviewer_outcome: reviewerEvidence.outcome, expected_verdict: expectedVerdict, requested_verdict: input.verdict },
    );
  }
  const producerArtifactRefs = persistedStringList(
    JSON.stringify(producerEnvelope.artifact_refs ?? []),
    'producer.route_impact.stage_quality_cycle.artifact_refs',
  );
  const producerArtifactHashes = persistedStringList(
    JSON.stringify(producerEnvelope.artifact_hashes ?? []),
    'producer.route_impact.stage_quality_cycle.artifact_hashes',
  );
  const reviewedArtifactRefs = persistedStringList(
    reviewer.input_artifact_refs_json,
    'reviewer.input_artifact_refs',
  );
  const reviewedArtifactHashes = persistedStringList(
    reviewer.reviewed_artifact_hashes_json,
    'reviewer.reviewed_artifact_hashes',
  );
  if (
    producerArtifactRefs.length === 0
    || producerArtifactRefs.length !== producerArtifactHashes.length
    || !exactStringList(producerArtifactRefs, reviewedArtifactRefs)
    || !exactStringList(producerArtifactHashes, reviewedArtifactHashes)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt artifact refs and hashes must exactly match the persisted producer output and reviewer input.',
      {
        producer_artifact_refs: producerArtifactRefs,
        producer_artifact_hashes: producerArtifactHashes,
        reviewer_artifact_refs: reviewedArtifactRefs,
        reviewer_artifact_hashes: reviewedArtifactHashes,
      },
    );
  }
  const reviewerRubricRefs = persistedStringList(reviewer.quality_rubric_refs_json, 'reviewer.quality_rubric_refs');
  const requestedRubricRefs = input.rubricRefs.map((ref) => ref.trim());
  if (
    reviewerRubricRefs.length === 0
    || !exactStringList(reviewerRubricRefs, requestedRubricRefs)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt rubric refs must exactly match the reviewer Attempt and controller request.',
      {
        reviewer_rubric_refs: reviewerRubricRefs,
        requested_rubric_refs: requestedRubricRefs,
      },
    );
  }
  const snapshotStatus = reviewerContextManifest.review_input_snapshot_status;
  if (
    snapshotStatus !== 'materialized'
    && snapshotStatus !== 'already_materialized'
    && snapshotStatus !== 'quality_debt'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt requires a typed reviewer input snapshot status.',
      { failure_code: 'stage_review_receipt_snapshot_status_invalid' },
    );
  }
  const reviewerQualityContext = persistedQualityContext(reviewer);
  const artifactReceiptRef = record(reviewerQualityContext.opl_review_evidence_artifact_receipt_ref);
  const artifactReceiptBody = record(reviewerQualityContext.opl_review_evidence_artifact_receipt);
  const hasArtifactReceiptRef = Object.keys(artifactReceiptRef).length > 0;
  const hasArtifactReceiptBody = Object.keys(artifactReceiptBody).length > 0;
  if (hasArtifactReceiptRef !== hasArtifactReceiptBody) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted reviewer evidence artifact receipt ref and body must be present together.',
      { failure_code: 'stage_review_receipt_artifact_binding_incomplete' },
    );
  }
  if (hasArtifactReceiptRef) {
    validateCurrentReviewEvidenceArtifact({
      reviewer,
      reviewerQualityContext,
      reviewerEnvelope,
      reviewerRubricRefs,
      receiptRef: artifactReceiptRef,
      receiptBody: artifactReceiptBody,
    });
  }
  return {
    producer,
    reviewer,
    reviewedArtifactRefs,
    reviewedArtifactHashes,
    requestedRubricRefs,
    reviewerRole,
    reviewerEvidence,
    snapshotStatus: snapshotStatus as StageReviewReceipt['review_input_snapshot_status'],
    reviewInputSnapshotBinding: snapshotStatus === 'quality_debt'
      ? null
      : record(reviewerContextManifest.review_input_snapshot_binding),
    reviewerInputSnapshotManifestRef: snapshotStatus === 'quality_debt'
      ? null
      : record(reviewerContextManifest.opl_reviewer_input_snapshot_manifest_ref),
    reviewerInputSnapshotManifest: snapshotStatus === 'quality_debt'
      ? null
      : record(reviewerContextManifest.opl_reviewer_input_snapshot_manifest),
    reviewInputSnapshotQualityDebtReceiptRef: snapshotStatus === 'quality_debt'
      ? String(reviewerContextManifest.review_input_snapshot_quality_debt_receipt_ref)
      : null,
    reviewInputSnapshotQualityDebtReceipt: snapshotStatus === 'quality_debt'
      ? record(reviewerContextManifest.review_input_snapshot_quality_debt_receipt)
      : null,
    reviewEvidenceArtifactReceiptRef: hasArtifactReceiptRef ? artifactReceiptRef : null,
    reviewEvidenceArtifactReceipt: hasArtifactReceiptBody ? artifactReceiptBody : null,
  };
}

export function reconcilePersistedStageReviewReceipt(db: DatabaseSync, reviewerAttemptId: string) {
  const reviewer = getStageAttemptRow(db, reviewerAttemptId);
  if (!reviewer || !['reviewer', 're_reviewer'].includes(reviewer.attempt_role ?? '')
    || !reviewer.parent_attempt_ref?.startsWith('opl://stage_attempts/')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review reconcile requires an existing reviewer and its original producer.');
  }
  requireRuntimeExecutionScopeMutationAllowed(db, reviewer, 'reconcile_stage_review_receipt');
  const outcome = stageQualityOutcomeFromEnvelope({
    attemptRole: reviewer.attempt_role as 'reviewer' | 're_reviewer',
    envelope: persistedQualityEnvelope(reviewer),
  });
  return materializePersistedStageReviewReceipt(db, {
    producerAttemptId: reviewer.parent_attempt_ref.slice('opl://stage_attempts/'.length),
    reviewerAttemptId,
    rubricRefs: persistedStringList(reviewer.quality_rubric_refs_json, 'reviewer.quality_rubric_refs'),
    verdict: stageReviewVerdictForOutcome(outcome),
  });
}

export function materializePersistedStageReviewReceipt(
  db: DatabaseSync,
  input: PersistedStageReviewReceiptInput,
): StageReviewReceipt {
  const persisted = persistedStageReviewReceiptInputs(db, input);
  const receipt: StageReviewReceipt = {
    surface_kind: 'opl_stage_review_receipt',
    version: 'stage-review-receipt.v1',
    stage_run_id: persisted.reviewer.stage_run_id!,
    quality_cycle_id: persisted.reviewer.quality_cycle_id!,
    producer_attempt_ref: `opl://stage_attempts/${persisted.producer.stage_attempt_id}`,
    reviewer_attempt_ref: `opl://stage_attempts/${persisted.reviewer.stage_attempt_id}`,
    producer_session_ref: persisted.producer.execution_session_ref!,
    reviewer_session_ref: persisted.reviewer.execution_session_ref!,
    no_context_inheritance: true,
    reviewed_artifact_refs: persisted.reviewedArtifactRefs,
    reviewed_artifact_hashes: persisted.reviewedArtifactHashes,
    rubric_refs: persisted.requestedRubricRefs,
    verdict: input.verdict,
    review_input_snapshot_status: persisted.snapshotStatus,
    review_input_snapshot_binding: persisted.reviewInputSnapshotBinding,
    opl_reviewer_input_snapshot_manifest_ref: persisted.reviewerInputSnapshotManifestRef,
    opl_reviewer_input_snapshot_manifest: persisted.reviewerInputSnapshotManifest,
    review_input_snapshot_quality_debt_receipt_ref:
      persisted.reviewInputSnapshotQualityDebtReceiptRef,
    review_input_snapshot_quality_debt_receipt:
      persisted.reviewInputSnapshotQualityDebtReceipt,
    opl_review_evidence_artifact_receipt_ref: persisted.reviewEvidenceArtifactReceiptRef,
    opl_review_evidence_artifact_receipt: persisted.reviewEvidenceArtifactReceipt,
    finding_lineage: {
      review_kind: persisted.reviewerRole === 'reviewer' ? 'initial_review' : 'finding_closure_review',
      finding_ids: persisted.reviewerEvidence.findings.map((finding) => finding.finding_id),
      findings_sha256: canonicalSha256(persisted.reviewerEvidence.findings),
      repair_map_sha256: persisted.reviewerRole === 're_reviewer'
        ? canonicalSha256(persisted.reviewerEvidence.repairMap)
        : null,
      re_review_result_sha256: persisted.reviewerEvidence.reReview
        ? canonicalSha256(persisted.reviewerEvidence.reReview)
        : null,
    },
  };
  validateIndependentStageReviewReceipt(receipt);
  return receipt;
}

export function validatePersistedStageReviewIsolation(db: DatabaseSync, input: PersistedStageReviewReceiptInput) {
  return validateIndependentStageReviewReceipt(materializePersistedStageReviewReceipt(db, input));
}
