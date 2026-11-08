import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  requireTemporalStageRunWorkflowInputLaunchable,
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageQualityAttemptMaterializationInput,
} from './family-runtime-temporal.ts';
import { openQueueDb } from './family-runtime-store.ts';
import {
  getStageAttemptRow,
  latestStageAttemptCloseoutPacketsByAttempt,
  stageAttemptToPayload,
} from './family-runtime-stage-attempt-ledger.ts';
import { requireSameFamilyRuntimeExecutionIdentity } from './family-runtime-execution-scope.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';
import {
  requirePersistedStageAttemptActivityIdentity,
  requirePersistedStageRunActivityIdentity,
  requireResolvedPersistedStageAttemptIdentity,
  requireSamePersistedStageRunAttemptIdentity,
} from './family-runtime-persisted-identity-admission.ts';
import {
  resolveStageRunAttemptReviewLane,
  STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION,
} from './family-runtime-stage-run-attempt-content.ts';
import {
  canonicalStageAttemptDeclaredStageIds,
  selectStageAttemptPackageIdentity,
  stageAttemptExecutionContentBindingSha256,
} from './family-runtime-stage-run-identity.ts';
import {
  readNumber,
  readString,
} from './family-runtime-temporal-activity-result-compaction.ts';
import {
  reviewerSnapshotStageRunInputAuthority,
  type ReviewerInputSnapshotAuthorityBinding,
} from './family-runtime-reviewer-input-snapshot.ts';
import type { ReviewEvidenceArtifactContext } from './family-runtime-review-evidence-artifact.ts';

export function requireRawStageRunMutationAuthority(input: {
  db: ReturnType<typeof openQueueDb>['db'];
  stageRunId: string;
  operation: string;
}) {
  const row = input.db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?').get(
    input.stageRunId,
  ) as Record<string, unknown> | undefined;
  if (!row) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal activity StageRun identity is not registered in the durable launch registry.',
      {
        failure_code: 'persisted_runtime_stage_run_not_found',
        operation: input.operation,
        stage_run_id: input.stageRunId,
      },
    );
  }
  requireRuntimeExecutionScopeMutationAllowed(input.db, row, input.operation);
  return row;
}

export function requirePersistedAttemptActivityIdentity(
  input: TemporalStageAttemptWorkflowInput,
  operation: string,
) {
  const { db } = openQueueDb();
  try {
    const row = getStageAttemptRow(db, input.stage_attempt_id);
    if (!row) {
      throw new FrameworkContractError('contract_shape_invalid', 'StageAttempt is not persisted.', {
        failure_code: 'persisted_runtime_stage_attempt_not_found',
        stage_attempt_id: input.stage_attempt_id,
      });
    }
    requireRuntimeExecutionScopeMutationAllowed(
      db,
      row as unknown as Record<string, unknown>,
      `${operation}:raw_attempt`,
    );
    return requirePersistedStageAttemptActivityIdentity({
      db,
      candidateIdentity: input as unknown as Record<string, unknown>,
      operation,
    });
  } finally {
    db.close();
  }
}

export function requirePersistedAttemptStageRunIdentity(input: {
  db: ReturnType<typeof openQueueDb>['db'];
  attemptRef: string;
  stageRun: TemporalStageQualityAttemptMaterializationInput['stage_run'];
  operation: string;
}) {
  const attemptId = stageAttemptIdFromRef(input.attemptRef);
  const row = getStageAttemptRow(input.db, attemptId);
  if (!row) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality artifact producer Attempt is not persisted.',
      {
        failure_code: 'artifact_identity_producing_attempt_missing_authority_violation',
        blocked_reason: 'artifact_identity_producing_attempt_missing_authority_violation',
        stage_attempt_id: attemptId,
        stage_run_id: input.stageRun.stage_run_id,
      },
    );
  }
  requireRuntimeExecutionScopeMutationAllowed(
    input.db,
    row as unknown as Record<string, unknown>,
    input.operation,
  );
  const attempt = stageAttemptToPayload(row);
  requireSameFamilyRuntimeExecutionIdentity({
    authorityIdentity: input.stageRun as unknown as Record<string, unknown>,
    candidateIdentity: attempt as unknown as Record<string, unknown>,
    operation: input.operation,
    requireStageRunId: true,
  });
  return attempt;
}

export function exactRefsFromCloseoutMetadata(value: unknown) {
  const entries = Array.isArray(value) ? value.filter(isRecord) : [];
  return entries.flatMap((entry) => {
    const kind = readString(entry.kind);
    const ref = readString(entry.ref) ?? readString(entry.uri);
    const digest = readString(entry.sha256)?.match(/^(?:sha256:)?([a-f0-9]{64})$/i);
    const sizeBytes = readNumber(entry.size_bytes);
    if (
      !kind
      || !ref
      || !digest
      || sizeBytes === null
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes < 0
    ) return [];
    const exactRef = { kind, ref, sha256: `sha256:${digest[1]!.toLowerCase()}`, size_bytes: sizeBytes };
    // A closeout entry labels one artifact twice: `kind` is the framework artifact
    // kind and `ref_kind` is the domain role label the closeout author works with.
    // An entry whose ref, sha256 and size_bytes are exact denotes the same artifact
    // under either label, so a reviewer-snapshot authority that copies the other
    // label still binds this exact artifact rather than escaping it.
    const refKind = readString(entry.ref_kind);
    return refKind && refKind !== kind ? [exactRef, { ...exactRef, kind: refKind }] : [exactRef];
  });
}

export function reviewerSnapshotAuthorityBinding(
  db: ReturnType<typeof openQueueDb>['db'],
  artifactProducerAttemptRef: string,
  stageRun: ReturnType<typeof requireTemporalStageRunWorkflowInputLaunchable>,
  requestedReviewLane?: string | null,
): ReviewerInputSnapshotAuthorityBinding {
  const producer = getStageAttemptRow(
    db,
    stageAttemptIdFromRef(artifactProducerAttemptRef),
  );
  if (!producer) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Reviewer snapshot authority producer Attempt is not persisted.',
      {
        failure_code: 'reviewer_input_snapshot_authority_issuer_attempt_missing',
        stage_attempt_ref: artifactProducerAttemptRef,
      },
    );
  }
  const qualityContext = persistedJsonRecord(
    producer.quality_context_json,
    'reviewer_input_snapshot_authority_issuer_context_invalid',
  );
  const executionBinding = isRecord(qualityContext.execution_content_binding)
    ? qualityContext.execution_content_binding
    : {};
  const spec = isRecord(executionBinding.spec) ? executionBinding.spec : {};
  const declaredStageIds = canonicalStageAttemptDeclaredStageIds(
    executionBinding.declared_stage_ids,
  );
  const bindingSha256 = stageAttemptExecutionContentBindingSha256({
    parent_stage_run_spec_sha256: readString(
      executionBinding.parent_stage_run_spec_sha256,
    ) ?? '',
    use_boundary_id: readString(executionBinding.use_boundary_id) ?? '',
    spec_sha256: readString(executionBinding.spec_sha256) ?? '',
    spec: spec as NonNullable<
      TemporalStageAttemptWorkflowInput['execution_content_binding']
    >['spec'],
    declared_stage_ids: declaredStageIds,
  });
  if (executionBinding.binding_sha256 !== bindingSha256
    || producer.stage_run_id !== stageRun.stage_run_id
    || executionBinding.parent_stage_run_spec_sha256 !== stageRun.stage_run_spec_sha256) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Reviewer snapshot authority does not match the persisted producer Attempt binding.',
      {
        failure_code: 'reviewer_input_snapshot_authority_issuer_binding_invalid',
        stage_attempt_ref: artifactProducerAttemptRef,
      },
    );
  }
  const producerCloseout = latestStageAttemptCloseoutPacketsByAttempt(
    db,
    [producer.stage_attempt_id],
  ).get(producer.stage_attempt_id) ?? {};
  const producerLocator = persistedJsonRecord(
    producer.workspace_locator_json,
    'reviewer_input_snapshot_authority_issuer_locator_invalid',
  );
  return {
    producer_attempt_ref: artifactProducerAttemptRef,
    execution_content_binding_sha256: bindingSha256,
    review_lane_binding: resolveStageRunAttemptReviewLane(
      spec as NonNullable<TemporalStageAttemptWorkflowInput['stage_run_spec']>,
      readString(producerLocator.domain_pack_root) ?? '',
      requestedReviewLane,
    ),
    owner_authority_refs: exactRefsFromCloseoutMetadata(
      producerCloseout.closeout_ref_metadata,
    ),
    stage_run_input_authority_refs: reviewerSnapshotStageRunInputAuthority(stageRun.stage_run_spec),
  };
}

export function persistedStageQualityAttemptMaterializationReceipt(
  stageRun: ReturnType<typeof requireTemporalStageRunWorkflowInputLaunchable>,
  attempt: any,
) {
  const qualityContext = isRecord(attempt.quality_context) ? attempt.quality_context : {};
  const executionContentBinding = qualityContext.execution_content_binding;
  if (!isRecord(executionContentBinding)
    || executionContentBinding.surface_kind !== 'opl_stage_attempt_execution_content_binding'
    || executionContentBinding.version !== 'opl-stage-attempt-execution-content-binding.v1') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt is missing its execution content binding.',
      {
        stage_attempt_id: attempt.stage_attempt_id,
        failure_code: 'stage_attempt_execution_content_binding_missing',
      },
    );
  }
  const declaredStageIds = canonicalStageAttemptDeclaredStageIds(
    executionContentBinding.declared_stage_ids,
  );
  const expectedBindingSha256 = stageAttemptExecutionContentBindingSha256({
    parent_stage_run_spec_sha256: readString(
      executionContentBinding.parent_stage_run_spec_sha256,
    ) ?? '',
    use_boundary_id: readString(executionContentBinding.use_boundary_id) ?? '',
    spec_sha256: readString(executionContentBinding.spec_sha256) ?? '',
    spec: executionContentBinding.spec as NonNullable<
      TemporalStageAttemptWorkflowInput['execution_content_binding']
    >['spec'],
    declared_stage_ids: declaredStageIds,
  });
  if (
    JSON.stringify(executionContentBinding.declared_stage_ids) !== JSON.stringify(declaredStageIds)
    || !declaredStageIds.includes(stageRun.stage_id)
    || executionContentBinding.binding_sha256 !== expectedBindingSha256
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt execution content binding identity is invalid.',
      {
        stage_attempt_id: attempt.stage_attempt_id,
        failure_code: 'stage_attempt_execution_content_binding_identity_invalid',
      },
    );
  }
  const {
    execution_content_binding: _executionContentBinding,
    ...persistedQualityContext
  } = qualityContext;
  const attemptRef = `opl://stage_attempts/${attempt.stage_attempt_id}`;
  return {
    surface_kind: 'temporal_stage_quality_attempt_materialization_receipt' as const,
    stage_run_id: stageRun.stage_run_id,
    quality_cycle_id: attempt.quality_cycle_id,
    attempt_role: attempt.attempt_role,
    quality_round_index: attempt.quality_round_index,
    attempt_ref: attemptRef,
    workflow_input: {
      ...buildTemporalStageAttemptWorkflowInput(attempt),
      stage_run_content_binding_version: STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION,
      stage_run_spec_sha256: stageRun.stage_run_spec_sha256,
      stage_run_spec: stageRun.stage_run_spec,
      execution_content_binding: (
        executionContentBinding as TemporalStageAttemptWorkflowInput['execution_content_binding']
      ),
      domain_pack_root: readString(attempt.workspace_locator?.domain_pack_root)
        ?? stageRun.domain_pack_root,
      quality_context: {
        ...persistedQualityContext,
        ...(isRecord(attempt.context_manifest)
          ? { context_manifest: attempt.context_manifest }
          : {}),
      },
      visibility_search_attributes_upsert_enabled:
        stageRun.visibility_search_attributes_upsert_enabled === true,
    },
    authority_boundary: {
      opl: 'stage_attempt_identity_and_refs_projection_only',
      domain: 'review_findings_repair_artifact_and_quality_verdict_owner',
    },
  };
}
export function stageAttemptIdFromRef(ref: string) {
  const prefix = 'opl://stage_attempts/';
  if (!ref.startsWith(prefix) || !ref.slice(prefix.length)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Invalid StageAttempt ref.', {
      stage_attempt_ref: ref,
    });
  }
  return ref.slice(prefix.length);
}

export function persistedJsonRecord(value: string | null | undefined, failureCode: string) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed)) return parsed;
  } catch {
    // Use the typed persisted-context error below.
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Persisted reviewer context is not valid JSON.',
    { failure_code: failureCode },
  );
}

export function reviewerEvidenceArtifactContext(input: {
  attemptRef: string;
  qualityContext: Record<string, unknown>;
  closeout: Record<string, unknown>;
  producerPackageId: unknown;
  originEvidenceRef: unknown;
}): ReviewEvidenceArtifactContext {
  const executionContentBinding = input.qualityContext.execution_content_binding;
  if (!isRecord(executionContentBinding) || !isRecord(executionContentBinding.spec)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review evidence artifact is missing its durable execution content binding.',
      { failure_code: 'review_evidence_artifact_execution_binding_missing' },
    );
  }
  const declaredStageIds = canonicalStageAttemptDeclaredStageIds(
    executionContentBinding.declared_stage_ids,
  );
  const expectedBindingSha256 = stageAttemptExecutionContentBindingSha256({
    parent_stage_run_spec_sha256: readString(
      executionContentBinding.parent_stage_run_spec_sha256,
    ) ?? '',
    use_boundary_id: readString(executionContentBinding.use_boundary_id) ?? '',
    spec_sha256: readString(executionContentBinding.spec_sha256) ?? '',
    spec: executionContentBinding.spec as NonNullable<
      TemporalStageAttemptWorkflowInput['execution_content_binding']
    >['spec'],
    declared_stage_ids: declaredStageIds,
  });
  if (executionContentBinding.binding_sha256 !== expectedBindingSha256) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review evidence artifact execution content binding was modified after reservation.',
      { failure_code: 'review_evidence_artifact_execution_binding_mismatch' },
    );
  }
  const declaredOrigin = isRecord(input.originEvidenceRef) ? input.originEvidenceRef : {};
  const originEvidenceRef = exactRefsFromCloseoutMetadata(
    input.closeout.closeout_ref_metadata,
  ).find((entry) => (
    entry.kind === declaredOrigin.kind
    && entry.ref === declaredOrigin.ref
    && entry.sha256 === declaredOrigin.sha256
    && entry.size_bytes === declaredOrigin.size_bytes
  ));
  if (!originEvidenceRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review evidence origin ref is not bound by reviewer closeout exact-ref metadata.',
      { failure_code: 'review_evidence_artifact_origin_metadata_mismatch' },
    );
  }
  return {
    producer_attempt_ref: input.attemptRef,
    execution_content_binding_sha256: `sha256:${expectedBindingSha256}`,
    producer_package: selectStageAttemptPackageIdentity(
      executionContentBinding,
      input.producerPackageId,
    ),
    origin_evidence_ref: originEvidenceRef,
  };
}
