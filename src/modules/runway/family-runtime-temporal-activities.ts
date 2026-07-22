import { Context, heartbeat } from '@temporalio/activity';

export {
  foundryAdvanceRunActivity,
  foundryCancelRunActivity,
  foundryFailRunActivity,
  foundryStartRunActivity,
  foundrySubmitOwnerDecisionActivity,
} from './foundry-temporal-activities.ts';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  requireTemporalStageRunWorkflowInputLaunchable,
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageQualityAttemptSyncInput,
  type TemporalStageQualityCycleProjectionInput,
  type TemporalStageQualityAttemptMaterializationInput,
  type TemporalStageQualityReviewReceiptInput,
  type TemporalStageRunRouteLaunchInput,
  type TemporalStageRunRouteLaunchReceipt,
} from './family-runtime-temporal.ts';
import {
  DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from './family-runtime-temporal-constants.ts';
import { runTemporalProviderCadenceReadback } from './family-runtime-scheduler.ts';
import { openQueueDb, stableId } from './family-runtime-store.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  findStageAttemptByIdempotencyBoundary,
  materializePersistedStageReviewReceipt,
  recordStageAttemptActivityHeartbeat,
  syncStageAttemptFromTemporalTerminalObservation,
} from './family-runtime-stage-attempts.ts';
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
  createStageQualityCycle,
  markStageQualityCycleCurrentAttempt,
  projectTemporalStageRunQualityCycle,
} from './family-runtime-stage-quality-cycle.ts';
import {
  normalizeTypedStageCloseoutPacket,
  runAgentStageRunner,
} from './family-runtime-codex-stage-runner.ts';
import { verifyStageQualityArtifactIdentityAtAttemptBoundary } from './family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import { codexActivityEventForTemporalHistory } from './family-runtime-temporal-history-summary.ts';
import {
  isRuntimeHardStopReason,
  runtimeHardStopClassForReason,
} from '../../kernel/progress-hard-stop-policy.ts';
import {
  buildStageReviewContextManifest,
  normalizeStageQualityScopeBudget,
} from '../stagecraft/index.ts';
import {
  buildStageReviewInputSnapshotContext,
} from './family-runtime-stage-quality-context-manifest.ts';
import {
  resolveReviewerInputSnapshotMaterialization,
  type ReviewerInputSnapshotAuthorityBinding,
} from './family-runtime-reviewer-input-snapshot.ts';
import {
  persistReviewEvidenceArtifactCandidate,
  type ReviewEvidenceArtifactContext,
} from './family-runtime-review-evidence-artifact.ts';
import {
  materializeOplRevisionTransport,
  revisionTransportContext,
} from './family-runtime-revision-intake.ts';
import { resolveStandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import { launchRegisteredStageRun } from './family-runtime-stage-run-launch.ts';
import {
  findStageRunLaunch,
  recordStageRunClosed,
} from './family-runtime-stage-run-launch-registry.ts';
import { materializeStageRunRoute } from './family-runtime-stage-run-route-launch.ts';
import {
  resolveStageRunAttemptExecutorContent,
  STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION,
} from './family-runtime-stage-run-attempt-content.ts';
import { taskRetryBudgetProjection } from './family-runtime-queue-projection-boundary.ts';
import {
  buildStageRunImmutableSpec,
  canonicalStageAttemptDeclaredStageIds,
  selectStageAttemptPackageIdentity,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
} from './family-runtime-stage-run-identity.ts';
import { ensureFamilyRuntimePackageLaunchReady } from './family-runtime-package-readiness.ts';

function closeoutPacketFromRunnerReceipt(receipt: Record<string, unknown>) {
  if (isRecord(receipt.closeout_packet)) {
    return receipt.closeout_packet;
  }
  const agentReceipt = isRecord(receipt.agent_execution_receipt)
    ? receipt.agent_execution_receipt
    : null;
  return isRecord(agentReceipt?.closeout_packet) ? agentReceipt.closeout_packet : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry));
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function withActivityMutationTransaction<T>(
  db: ReturnType<typeof openQueueDb>['db'],
  mutation: () => T,
) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const result = mutation();
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

function requireRawStageRunMutationAuthority(input: {
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

function requirePersistedAttemptActivityIdentity(
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

function requirePersistedAttemptStageRunIdentity(input: {
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

function exactRefsFromCloseoutMetadata(value: unknown) {
  const entries = Array.isArray(value) ? value.filter(isRecord) : [];
  return entries.flatMap((entry) => {
    const kind = readString(entry.kind);
    const ref = readString(entry.ref) ?? readString(entry.uri);
    const sha256 = readString(entry.sha256);
    const sizeBytes = readNumber(entry.size_bytes);
    if (
      !kind
      || !ref
      || !sha256
      || !/^sha256:[a-f0-9]{64}$/.test(sha256)
      || sizeBytes === null
      || !Number.isSafeInteger(sizeBytes)
      || sizeBytes < 0
    ) return [];
    return [{ kind, ref, sha256, size_bytes: sizeBytes }];
  });
}

function reviewerSnapshotAuthorityBinding(
  db: ReturnType<typeof openQueueDb>['db'],
  artifactProducerAttemptRef: string,
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
  if (executionBinding.binding_sha256 !== bindingSha256) {
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
  return {
    producer_attempt_ref: artifactProducerAttemptRef,
    execution_content_binding_sha256: bindingSha256,
    owner_authority_refs: exactRefsFromCloseoutMetadata(
      producerCloseout.closeout_ref_metadata,
    ),
  };
}

function persistedStageQualityAttemptMaterializationReceipt(
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

function compactStringList(value: unknown, maxEntries = 12, maxChars = 240) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, maxEntries)
    .map((entry) => (entry.length > maxChars ? `${entry.slice(0, maxChars)}...[omitted:${entry.length} chars]` : entry));
}

function compactDomainStageLogForRouteImpact(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ...(readString(value.surface_kind) ? { surface_kind: readString(value.surface_kind) } : {}),
    ...(readString(value.semantic_status) ? { semantic_status: readString(value.semantic_status) } : {}),
    ...(readString(value.semantic_source) ? { semantic_source: readString(value.semantic_source) } : {}),
    ...(readString(value.stage_name) ? { stage_name: readString(value.stage_name) } : {}),
    ...(readString(value.problem_summary) ? { problem_summary: readString(value.problem_summary) } : {}),
    ...(readString(value.stage_goal) ? { stage_goal: readString(value.stage_goal) } : {}),
    ...(readString(value.progress_delta_classification)
      ? { progress_delta_classification: readString(value.progress_delta_classification) }
      : {}),
    ...(isRecord(value.deliverable_progress_delta)
      ? { deliverable_progress_delta: value.deliverable_progress_delta }
      : {}),
    ...(isRecord(value.platform_repair_delta)
      ? { platform_repair_delta: value.platform_repair_delta }
      : {}),
    ...(readString(value.next_forced_delta) ? { next_forced_delta: readString(value.next_forced_delta) } : {}),
    ...(readString(value.outcome) ? { outcome: readString(value.outcome) } : {}),
    ...(compactStringList(value.stage_work_done).length > 0
      ? { stage_work_done: compactStringList(value.stage_work_done) }
      : {}),
    ...(compactStringList(value.changed_stage_surfaces).length > 0
      ? { changed_stage_surfaces: compactStringList(value.changed_stage_surfaces) }
      : {}),
    ...(compactStringList(value.remaining_blockers).length > 0
      ? { remaining_blockers: compactStringList(value.remaining_blockers) }
      : {}),
    ...(compactStringList(value.evidence_refs).length > 0 ? { evidence_refs: compactStringList(value.evidence_refs) } : {}),
  };
}

function closeoutRouteImpactForTemporalResult(
  closeout: ReturnType<typeof normalizeTypedStageCloseoutPacket>,
) {
  const routeImpact = closeout.route_impact ? { ...closeout.route_impact } : {};
  if (!isRecord(routeImpact.user_stage_log) && isRecord(closeout.user_stage_log)) {
    routeImpact.user_stage_log = compactDomainStageLogForRouteImpact(closeout.user_stage_log) ?? closeout.user_stage_log;
  }
  if (!isRecord(routeImpact.stage_log_summary) && isRecord(closeout.stage_log_summary)) {
    routeImpact.stage_log_summary = compactDomainStageLogForRouteImpact(closeout.stage_log_summary)
      ?? closeout.stage_log_summary;
  }
  if (!isRecord(routeImpact.human_stage_log) && isRecord(closeout.human_stage_log)) {
    routeImpact.human_stage_log = compactDomainStageLogForRouteImpact(closeout.human_stage_log)
      ?? closeout.human_stage_log;
  }
  return routeImpact;
}

function compactAuthorityBoundaryForTemporalResult(value: unknown) {
  const authority = isRecord(value) ? value : {};
  return {
    opl: readString(authority.opl),
    domain: readString(authority.domain),
    can_install_domain_daemon: readBoolean(authority.can_install_domain_daemon),
    can_write_domain_truth: readBoolean(authority.can_write_domain_truth),
    can_write_domain_memory_body: readBoolean(authority.can_write_domain_memory_body),
    can_create_domain_owner_receipt: readBoolean(authority.can_create_domain_owner_receipt),
    can_create_domain_typed_blocker: readBoolean(authority.can_create_domain_typed_blocker),
    can_execute_domain_action_without_queue_claim:
      readBoolean(authority.can_execute_domain_action_without_queue_claim),
    can_authorize_lifecycle_progress: readBoolean(authority.can_authorize_lifecycle_progress),
    can_authorize_domain_ready: readBoolean(authority.can_authorize_domain_ready),
    can_authorize_quality_verdict: readBoolean(authority.can_authorize_quality_verdict),
    can_authorize_export_verdict: readBoolean(authority.can_authorize_export_verdict),
    can_authorize_artifact_export: readBoolean(authority.can_authorize_artifact_export),
    can_execute_domain_repair: readBoolean(authority.can_execute_domain_repair),
    provider_completion_is_domain_ready: readBoolean(authority.provider_completion_is_domain_ready),
  };
}

export function compactCloseoutPacketForTemporalResult(value: unknown) {
  let closeout: ReturnType<typeof normalizeTypedStageCloseoutPacket>;
  try {
    closeout = normalizeTypedStageCloseoutPacket(value);
  } catch {
    return null;
  }

  const routeImpact = closeoutRouteImpactForTemporalResult(closeout);
  return {
    surface_kind: closeout.surface_kind,
    ...(closeout.stage_attempt_id ? { stage_attempt_id: closeout.stage_attempt_id } : {}),
    ...(closeout.idempotency_key ? { idempotency_key: closeout.idempotency_key } : {}),
    ...(closeout.closeout_id ? { closeout_id: closeout.closeout_id } : {}),
    closeout_refs: closeout.closeout_refs,
    ...(closeout.closeout_ref_metadata ? { closeout_ref_metadata: closeout.closeout_ref_metadata } : {}),
    consumed_refs: closeout.consumed_refs,
    consumed_memory_refs: closeout.consumed_memory_refs,
    writeback_receipt_refs: closeout.writeback_receipt_refs,
    rejected_writes: closeout.rejected_writes,
    ...(closeout.domain_output ? { domain_output: closeout.domain_output } : {}),
    ...(closeout.next_owner ? { next_owner: closeout.next_owner } : {}),
    ...(closeout.domain_ready_verdict ? { domain_ready_verdict: closeout.domain_ready_verdict } : {}),
    ...(Object.keys(routeImpact).length > 0 ? { route_impact: routeImpact } : {}),
    authority_boundary: closeout.authority_boundary,
    temporal_payload_policy: {
      surface_kind: 'temporal_activity_compacted_closeout_packet',
      full_closeout_body_omitted: true,
      retained_fields: [
        'surface_kind',
        'stage_attempt_id',
        'idempotency_key',
        'closeout_id',
        'closeout_refs',
        'closeout_ref_metadata',
        'consumed_refs',
        'consumed_memory_refs',
        'writeback_receipt_refs',
        'rejected_writes',
        'domain_output',
        'next_owner',
        'domain_ready_verdict',
        'route_impact',
        'authority_boundary',
      ],
      omitted_body_fields: [
        'user_stage_log',
        'stage_log_summary',
        'human_stage_log',
      ],
    },
  };
}

function providerRuntimeCloseoutReason(closeout: ReturnType<typeof normalizeTypedStageCloseoutPacket>) {
  const authorityBoundary = closeout.authority_boundary;
  if (readString(authorityBoundary.opl) !== 'provider_runtime_closeout_transport_only') {
    return null;
  }
  return readString(closeout.route_impact?.provider_blocker_reason)
    ?? readString(closeout.rejected_writes[0]?.reason)
    ?? 'codex_cli_typed_closeout_not_materialized';
}

function compactTaskScopeForTemporalResult(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const payloadMatches = Array.isArray(value.payloadMatches) ? value.payloadMatches : [];
  const compactScope = {
    domainId: readString(value.domainId) ?? readString(value.domain_id),
    taskKind: readString(value.taskKind) ?? readString(value.task_kind),
    payload_match_count: payloadMatches.length,
    payload_matches_omitted: payloadMatches.length > 0,
  };
  return compactScope.domainId || compactScope.taskKind || compactScope.payload_match_count > 0
    ? compactScope
    : null;
}

function compactSchedulerQueueTickForTemporalResult(value: unknown) {
  const queueTick = isRecord(value) ? value : {};
  const hydration = isRecord(queueTick.hydration) ? queueTick.hydration : null;
  const dispatches = Array.isArray(queueTick.dispatches) ? queueTick.dispatches : [];
  return {
    source: readString(queueTick.source),
    limit: readNumber(queueTick.limit),
    hydrate: readBoolean(queueTick.hydrate),
    status: readString(queueTick.status),
    dispatch_blocked_reason: readString(queueTick.dispatch_blocked_reason),
    selected_count: readNumber(queueTick.selected_count) ?? 0,
    filtered_count: readNumber(queueTick.filtered_count) ?? 0,
    dispatches_count: dispatches.length,
    dispatches_omitted: true,
    hydration: hydration
      ? {
          source: readString(hydration.source),
          enqueued_count: readNumber(hydration.enqueued_count) ?? 0,
          requeued_count: readNumber(hydration.requeued_count) ?? 0,
          idempotent_noop_count: readNumber(hydration.idempotent_noop_count) ?? 0,
          filtered_count: readNumber(hydration.filtered_count) ?? 0,
        }
      : null,
  };
}

function compactRepairActionForTemporalResult(value: unknown) {
  const repairAction = isRecord(value) ? value : {};
  return {
    action_id: readString(repairAction.action_id),
    repair_action_id: readString(repairAction.repair_action_id),
    next_command: readString(repairAction.next_command),
    command: readString(repairAction.command),
  };
}

function compactProviderReadinessAfterSloForTemporalResult(value: unknown) {
  const readiness = isRecord(value) ? value : {};
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
  return {
    surface_kind: readString(readiness.surface_kind),
    provider_kind: readString(readiness.provider_kind),
    ready: readBoolean(readiness.ready),
    status: readString(readiness.status),
    degraded_reason: readString(readiness.degraded_reason),
    worker_lifecycle_status: readString(readiness.worker_lifecycle_status),
    worker_readiness_status: readString(readiness.worker_readiness_status),
    worker_ready: readBoolean(readiness.worker_ready),
    blocker_count: blockers.length,
    blocker_ids: blockers
      .filter(isRecord)
      .map((blocker) => readString(blocker.blocker_id))
      .filter((entry): entry is string => Boolean(entry)),
    blockers_omitted: blockers.length > 0,
    repair_action: compactRepairActionForTemporalResult(readiness.repair_action),
    authority_boundary: compactAuthorityBoundaryForTemporalResult(readiness.authority_boundary),
  };
}

function compactProviderBlockerForTemporalResult(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    blocker_kind: readString(value.blocker_kind),
    blocker_id: readString(value.blocker_id),
    next_repair_command: readString(value.next_repair_command),
    next_repair_action: compactRepairActionForTemporalResult(value.next_repair_action),
    worker_lifecycle_status: readString(value.worker_lifecycle_status),
    temporal_service_status: readString(value.temporal_service_status),
    temporal_server_reachable: readBoolean(value.temporal_server_reachable),
    liveness_blocker_first: readBoolean(value.liveness_blocker_first),
  };
}

function compactProviderSloForTemporalResult(value: unknown) {
  const providerSlo = isRecord(value) ? value : {};
  const receipt = isRecord(providerSlo.provider_slo_execution_receipt)
    ? providerSlo.provider_slo_execution_receipt
    : {};
  const workerRepair = isRecord(providerSlo.provider_worker_repair_receipt)
    ? providerSlo.provider_worker_repair_receipt
    : {};
  return {
    surface_id: readString(providerSlo.surface_id),
    provider_kind: readString(providerSlo.provider_kind),
    execution_status: readString(providerSlo.execution_status),
    skipped: readBoolean(providerSlo.skipped),
    event_id: readString(providerSlo.event_id),
    provider_slo_execution_receipt: {
      receipt_status: readString(receipt.receipt_status),
      execution_status: readString(receipt.execution_status),
      skip_reason: readString(receipt.skip_reason),
      receipt_kind: readString(receipt.receipt_kind),
    },
    provider_worker_repair_receipt: {
      repair_status: readString(workerRepair.repair_status),
      repair_action_id: readString(workerRepair.repair_action_id),
      command: readString(workerRepair.command),
      can_execute_domain_repair: readBoolean(workerRepair.can_execute_domain_repair),
    },
  };
}

function compactQueueProjectionBridgeForTemporalResult(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    surface_kind: readString(value.surface_kind),
    bridge_id: readString(value.bridge_id),
    provider_ready_after_slo: readBoolean(value.provider_ready_after_slo),
    bridge_status: readString(value.bridge_status),
    blocked_reason: readString(value.blocked_reason),
    trigger: readString(value.trigger),
    hydrated_pending_family_task_projection_count:
      readNumber(value.hydrated_pending_family_task_projection_count) ?? 0,
    hydration_idempotent_noop_projection_count:
      readNumber(value.hydration_idempotent_noop_projection_count) ?? 0,
    hydration_filtered_projection_count: readNumber(value.hydration_filtered_projection_count) ?? 0,
    selected_task_projection_count: readNumber(value.selected_task_projection_count) ?? 0,
    dispatch_projection_count: readNumber(value.dispatch_projection_count) ?? 0,
    scheduler_limit: readNumber(value.scheduler_limit),
    operator_audit_counts_only: readBoolean(value.operator_audit_counts_only),
    durable_lifecycle_truth: readBoolean(value.durable_lifecycle_truth),
    can_authorize_lifecycle_progress: readBoolean(value.can_authorize_lifecycle_progress),
    authority_boundary: compactAuthorityBoundaryForTemporalResult(value.authority_boundary),
  };
}

export function compactSchedulerTickForTemporalResult(value: unknown) {
  const tick = isRecord(value) ? value : {};
  const authorityBoundary = isRecord(tick.authority_boundary)
    ? tick.authority_boundary
    : {
        opl: 'temporal_provider_cadence_readback_only',
        domain: 'truth_quality_artifact_gate_owner',
      };
  return {
    surface_kind: 'temporal_scheduler_tick_activity_receipt',
    activity_kind: 'scheduler_tick_activity',
    activity_status: 'completed',
    provider_cadence_surface_kind: readString(tick.surface_kind),
    scheduler_owner: readString(tick.scheduler_owner),
    cadence_owner: readString(tick.cadence_owner),
    provider_kind: readString(tick.provider_kind),
    cadence_source: readString(tick.cadence_source),
    cadence_status: readString(tick.status),
    task_scope: compactTaskScopeForTemporalResult(tick.task_scope),
    provider_readiness_after_slo: compactProviderReadinessAfterSloForTemporalResult(
      tick.provider_readiness_after_slo,
    ),
    provider_liveness_blocker: compactProviderBlockerForTemporalResult(tick.provider_liveness_blocker),
    provider_blocker: compactProviderBlockerForTemporalResult(tick.provider_blocker),
    provider_slo_summary: compactProviderSloForTemporalResult(tick.provider_slo),
    queue_projection_bridge: compactQueueProjectionBridgeForTemporalResult(
      tick.queue_projection_bridge,
    ),
    retired_queue_tick: compactSchedulerQueueTickForTemporalResult(tick.retired_queue_tick),
    full_scheduler_tick_omitted: true,
    provider_runtime_after_slo_omitted: true,
    provider_slo_omitted: true,
    omitted_body_fields: [
      'provider_runtime',
      'provider_runtime_after_slo',
      'provider_slo',
      'task_scope.payloadMatches',
      'provider_readiness_after_slo.blockers',
      'provider_readiness_after_slo.repair_action.body',
      'provider_liveness_blocker.next_repair_action.body',
      'provider_blocker.next_repair_action.body',
      'queue_projection_bridge.body',
      'retired_queue_tick.dispatches',
    ],
    authority_boundary: {
      ...compactAuthorityBoundaryForTemporalResult(authorityBoundary),
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
    temporal_payload_policy: {
      surface_kind: 'temporal_activity_compacted_scheduler_tick',
      full_scheduler_tick_body_omitted: true,
      retained_fields: [
        'provider_cadence_surface_kind',
        'scheduler_owner',
        'cadence_owner',
        'provider_kind',
        'cadence_source',
        'cadence_status',
        'task_scope',
        'provider_readiness_after_slo',
        'provider_liveness_blocker',
        'provider_blocker',
        'provider_slo_summary',
        'queue_projection_bridge',
        'retired_queue_tick',
        'authority_boundary',
      ],
    },
  };
}

function recordActivityHeartbeat(input: {
  stageAttemptId: string;
  heartbeatKind: string;
  runnerEventKind?: string | null;
  executionSessionRef?: string | null;
  checkpointRefs?: string[];
}) {
  try {
    const { db } = openQueueDb();
    try {
      recordStageAttemptActivityHeartbeat(db, input);
    } finally {
      db.close();
    }
  } catch {
    // Temporal heartbeat remains authoritative for activity timeout; the SQLite
    // projection is operator liveness metadata and must not fail the activity.
  }
}

function providerRuntimeBlockerCloseout(input: {
  stageAttemptId: string;
  stageId: string;
  domainId: string;
  providerBlockerReason: string | null;
  routeImpact: Record<string, unknown>;
}) {
  if (!input.providerBlockerReason) {
    return null;
  }
  const hardStopClass = runtimeHardStopClassForReason(input.providerBlockerReason);
  const blockerRef = `opl://stage-attempts/${
    encodeURIComponent(input.stageAttemptId)
  }/runtime-blockers/${encodeURIComponent(input.providerBlockerReason)}`;
  return {
    closeout_refs: [blockerRef],
    rejected_writes: [{
      surface_kind: 'opl_provider_runtime_typed_blocker_ref',
      blocker_id: input.providerBlockerReason,
      blocker_ref: blockerRef,
      stage_attempt_id: input.stageAttemptId,
      stage_id: input.stageId,
      domain_id: input.domainId,
      owner: 'one-person-lab',
      reason: input.providerBlockerReason,
      provider_completion_is_domain_ready: false,
      authority_boundary: {
        opl: 'provider_runtime_blocker_ref_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_create_domain_owner_receipt: false,
        can_create_domain_typed_blocker: false,
        can_authorize_quality_verdict: false,
        can_claim_domain_ready: false,
      },
    }],
    route_impact: {
      ...input.routeImpact,
      provider_blocker_reason: input.providerBlockerReason,
      ...(hardStopClass ? { hard_stop_class: hardStopClass } : {}),
      provider_blocker_surface: 'codex_stage_activity.process_output_summary',
      runtime_blocker_ref: blockerRef,
      runtime_blocker_owner: 'one-person-lab',
      runtime_blocker_is_domain_owner_answer: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function providerRuntimeQualityDebtCloseout(input: {
  stageAttemptId: string;
  domainId: string;
  providerReason: string;
  routeImpact: Record<string, unknown>;
}) {
  const diagnosticRef = `opl://stage-attempts/${
    encodeURIComponent(input.stageAttemptId)
  }/quality-debt-diagnostics/${encodeURIComponent(input.providerReason)}`;
  return {
    surface_kind: 'temporal_domain_handler_dispatch_receipt',
    activity_kind: 'domain_handler_dispatch_activity',
    activity_status: 'completed_with_quality_debt',
    stage_attempt_id: input.stageAttemptId,
    domain_id: input.domainId,
    closeout_refs: [diagnosticRef],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: input.domainId,
    domain_ready_verdict: null,
    route_impact: {
      ...input.routeImpact,
      progression_effect: 'next_stage_may_start',
      quality_debt_refs: [diagnosticRef],
      provider_quality_debt_reason: input.providerReason,
      provider_quality_debt_diagnostic_ref: diagnosticRef,
    },
    closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
    authority_boundary: {
      opl: 'provider_quality_debt_diagnostic_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
      diagnostic_blocks_next_stage: false,
    },
  };
}

export async function codexStageActivity(input: TemporalStageAttemptWorkflowInput) {
  requirePersistedAttemptActivityIdentity(input, 'temporal_codex_stage_activity');
  const observedAt = new Date().toISOString();
  heartbeat({
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
    checkpoint_refs: input.checkpoint_refs ?? [],
  });
  recordActivityHeartbeat({
    stageAttemptId: input.stage_attempt_id,
    heartbeatKind: 'codex_stage_activity_started',
    checkpointRefs: input.checkpoint_refs ?? [],
  });
  const heartbeatInterval = setInterval(() => {
    heartbeat({
      stage_attempt_id: input.stage_attempt_id,
      stage_id: input.stage_id,
      checkpoint_refs: input.checkpoint_refs ?? [],
      heartbeat_kind: 'codex_stage_activity_supervision',
    });
    recordActivityHeartbeat({
      stageAttemptId: input.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_supervision',
      checkpointRefs: input.checkpoint_refs ?? [],
    });
  }, DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS);
  try {
    const executorContent = resolveStageRunAttemptExecutorContent(input);
    const runnerReceipt = await runAgentStageRunner({
      attempt: input as unknown as Record<string, unknown>,
      ...executorContent,
      stagePacketRef: input.stage_packet_ref,
      runnerMode: input.codex_stage_runner?.runner_mode,
      observedAt,
      timeoutMs: input.codex_stage_runner?.timeout_ms ?? DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
      noOutputTimeoutMs: input.codex_stage_runner?.no_output_timeout_ms
        ?? DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
      signal: Context.current().cancellationSignal,
      onRunnerProgress(event) {
        const executionSessionRef = event.event_kind === 'thread.started' && event.value
          ? `codex://threads/${event.value}`
          : null;
        heartbeat({
          stage_attempt_id: input.stage_attempt_id,
          stage_id: input.stage_id,
          checkpoint_refs: input.checkpoint_refs ?? [],
          heartbeat_kind: 'codex_stage_activity_runner_progress',
          runner_event_kind: event.event_kind,
        });
        recordActivityHeartbeat({
          stageAttemptId: input.stage_attempt_id,
          heartbeatKind: 'codex_stage_activity_runner_progress',
          runnerEventKind: event.event_kind,
          executionSessionRef,
          checkpointRefs: input.checkpoint_refs ?? [],
        });
      },
    });
    const activityReceipt = {
      surface_kind: 'temporal_codex_stage_activity_receipt',
      activity_kind: 'codex_stage_activity',
      activity_status: 'completed',
      stage_attempt_id: input.stage_attempt_id,
      stage_id: input.stage_id,
      executor_kind: input.executor_kind,
      checkpoint_refs: input.checkpoint_refs ?? [],
      stage_packet_ref: input.stage_packet_ref ?? null,
      ...runnerReceipt,
      authority_boundary: {
        opl: 'activity_packet_and_receipt_transport_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
    return {
      ...codexActivityEventForTemporalHistory(activityReceipt),
      closeout_packet: compactCloseoutPacketForTemporalResult(closeoutPacketFromRunnerReceipt(runnerReceipt)),
    };
  } catch (error) {
    const blockedReason = error instanceof FrameworkContractError
      && typeof error.details?.blocked_reason === 'string'
      && error.details.blocked_reason.trim()
      ? error.details.blocked_reason.trim()
      : null;
    if (!blockedReason) throw error;
    return {
      ...codexActivityEventForTemporalHistory({
        surface_kind: 'temporal_codex_stage_activity_receipt',
        activity_kind: 'codex_stage_activity',
        activity_status: 'blocked',
        stage_attempt_id: input.stage_attempt_id,
        stage_id: input.stage_id,
        executor_kind: input.executor_kind,
        checkpoint_refs: input.checkpoint_refs ?? [],
        stage_packet_ref: input.stage_packet_ref ?? null,
        runner_status: {
          runner_kind: 'codex_cli',
          runner_mode: input.codex_stage_runner?.runner_mode ?? 'codex_cli',
          live_process_started: false,
        },
        progress_summary: {
          progress_status: 'blocked_before_executor_session',
          execution_session_ref: null,
        },
        process_output_summary: {
          blocked_reason: blockedReason,
          pre_codex_typed_preflight_blocker: true,
        },
      }),
      closeout_packet: null,
    };
  } finally {
    clearInterval(heartbeatInterval);
  }
}

export async function domainHandlerDispatchActivity(input: TemporalStageAttemptWorkflowInput) {
  requirePersistedAttemptActivityIdentity(input, 'temporal_domain_handler_dispatch_activity');
  heartbeat({
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
  });
  if (!input.closeout_packet) {
    const providerBlockerReason = input.provider_blocker?.blocked_reason?.trim() || null;
    const routeImpact = input.provider_blocker?.route_impact ?? {};
    if (!providerBlockerReason) {
      const diagnosticRef = `opl://stage-attempts/${input.stage_attempt_id}/no-output-diagnostic`;
      return {
        surface_kind: 'temporal_domain_handler_dispatch_receipt',
        activity_kind: 'domain_handler_dispatch_activity',
        activity_status: 'completed_with_quality_debt',
        stage_attempt_id: input.stage_attempt_id,
        domain_id: input.domain_id,
        closeout_refs: [diagnosticRef],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: input.domain_id,
        domain_ready_verdict: null,
        route_impact: {
          ...routeImpact,
          progression_effect: 'next_stage_may_start',
          quality_debt_refs: [diagnosticRef],
          no_output_diagnostic_ref: diagnosticRef,
        },
        closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
        authority_boundary: {
          opl: 'no_output_diagnostic_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_completion_is_domain_ready: false,
          diagnostic_blocks_next_stage: false,
        },
      };
    }
    if (!isRuntimeHardStopReason(providerBlockerReason)) {
      return providerRuntimeQualityDebtCloseout({
        stageAttemptId: input.stage_attempt_id,
        domainId: input.domain_id,
        providerReason: providerBlockerReason,
        routeImpact,
      });
    }
    const runtimeBlocker = providerRuntimeBlockerCloseout({
      stageAttemptId: input.stage_attempt_id,
      stageId: input.stage_id,
      domainId: input.domain_id,
      providerBlockerReason,
      routeImpact,
    });
    return {
      surface_kind: 'temporal_domain_handler_dispatch_receipt',
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'blocked',
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      closeout_refs: runtimeBlocker?.closeout_refs ?? [],
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: runtimeBlocker?.rejected_writes ?? [],
      next_owner: input.domain_id,
      domain_ready_verdict: null,
      route_impact: runtimeBlocker?.route_impact ?? routeImpact,
      blocked_reason: providerBlockerReason,
      closeout_packet_surface_kind: null,
      authority_boundary: {
        opl: 'domain_handler_transport_only',
        domain: 'domain_handler_dispatch_and_receipt_owner',
        provider_runtime_blocker_ref_only: Boolean(runtimeBlocker),
        provider_runtime_blocker_is_domain_owner_answer: false,
        provider_completion_is_domain_ready: false,
      },
    };
  }
  const closeout = normalizeTypedStageCloseoutPacket(input.closeout_packet);
  const providerRuntimeReason = providerRuntimeCloseoutReason(closeout);
  if (providerRuntimeReason) {
    if (!isRuntimeHardStopReason(providerRuntimeReason)) {
      return providerRuntimeQualityDebtCloseout({
        stageAttemptId: input.stage_attempt_id,
        domainId: input.domain_id,
        providerReason: providerRuntimeReason,
        routeImpact: closeout.route_impact ?? {},
      });
    }
    const runtimeBlocker = providerRuntimeBlockerCloseout({
      stageAttemptId: input.stage_attempt_id,
      stageId: input.stage_id,
      domainId: input.domain_id,
      providerBlockerReason: providerRuntimeReason,
      routeImpact: closeout.route_impact ?? {},
    });
    return {
      surface_kind: 'temporal_domain_handler_dispatch_receipt',
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'blocked',
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      closeout_refs: runtimeBlocker?.closeout_refs ?? closeout.closeout_refs,
      consumed_refs: closeout.consumed_refs,
      consumed_memory_refs: closeout.consumed_memory_refs,
      writeback_receipt_refs: closeout.writeback_receipt_refs,
      rejected_writes: runtimeBlocker?.rejected_writes ?? closeout.rejected_writes,
      next_owner: closeout.next_owner ?? input.domain_id,
      domain_ready_verdict: null,
      route_impact: runtimeBlocker?.route_impact ?? closeout.route_impact ?? {},
      blocked_reason: providerRuntimeReason,
      closeout_packet_surface_kind: closeout.surface_kind,
      authority_boundary: {
        opl: 'domain_handler_transport_only',
        domain: 'domain_handler_dispatch_and_receipt_owner',
        provider_runtime_blocker_ref_only: true,
        provider_runtime_blocker_is_domain_owner_answer: false,
        provider_completion_is_domain_ready: false,
      },
    };
  }
  return {
    surface_kind: 'temporal_domain_handler_dispatch_receipt',
    activity_kind: 'domain_handler_dispatch_activity',
    activity_status: 'completed',
    stage_attempt_id: input.stage_attempt_id,
    domain_id: input.domain_id,
    closeout_refs: closeout.closeout_refs,
    consumed_refs: closeout.consumed_refs,
    consumed_memory_refs: closeout.consumed_memory_refs,
    writeback_receipt_refs: closeout.writeback_receipt_refs,
    rejected_writes: closeout.rejected_writes,
    next_owner: closeout.next_owner ?? input.domain_id,
    domain_ready_verdict: closeout.domain_ready_verdict ?? 'domain_gate_pending',
    route_impact: closeout.route_impact ?? {},
    closeout_packet_surface_kind: closeout.surface_kind,
    ...(closeout.closeout_ref_metadata
      ? { closeout_ref_metadata: closeout.closeout_ref_metadata }
      : {}),
    ...(closeout.domain_output ? { domain_output: closeout.domain_output } : {}),
    authority_boundary: {
      opl: 'domain_handler_transport_only',
      domain: 'domain_handler_dispatch_and_receipt_owner',
    },
  };
}

export async function schedulerTickActivity(input: {
  provider_kind: 'temporal';
  tick_source?: string;
  force?: boolean;
  limit?: number;
  hydrate?: boolean;
  domain_profiles?: import('./family-runtime-command.ts').FamilyRuntimeDomainProfiles;
}) {
  heartbeat({
    provider_kind: input.provider_kind,
    tick_source: input.tick_source ?? 'temporal-schedule',
    limit: input.limit ?? 10,
  });
  const { db, paths } = openQueueDb();
  const tick = await runTemporalProviderCadenceReadback(
    db,
    paths,
    {
      providerKind: input.provider_kind,
      force: input.force,
      limit: input.limit,
      hydrate: input.hydrate,
      domainProfiles: input.domain_profiles,
    },
  );
  return {
    version: 'g2',
    temporal_provider_cadence_readback: compactSchedulerTickForTemporalResult(tick),
  };
}

export async function stageQualityAttemptMaterializeActivity(
  input: TemporalStageQualityAttemptMaterializationInput,
  options: {
    ensurePackageLaunchReady?: typeof ensureFamilyRuntimePackageLaunchReady;
    resolveStageBinding?: typeof resolveStandardAgentStageQualityRuntimeBinding;
  } = {},
) {
  const stageRun = requireTemporalStageRunWorkflowInputLaunchable(input.stage_run, {
    revalidateContent: 'historical_evidence',
  });
  const { db } = openQueueDb();
  try {
    requireRawStageRunMutationAuthority({
      db,
      stageRunId: stageRun.stage_run_id,
      operation: 'temporal_stage_quality_attempt_materialize_activity:raw_stage_run',
    });
    requirePersistedStageRunActivityIdentity({
      db,
      candidateIdentity: stageRun as unknown as Record<string, unknown>,
      operation: 'temporal_stage_quality_attempt_materialize_activity',
    });
    createStageAttemptTable(db);
    const requestedUseBoundaryId = stableId('package-use', [
      'stage_quality_attempt',
      stageRun.stage_run_id,
      input.quality_cycle_id,
      input.attempt_role,
      input.quality_round_index,
      input.parent_attempt_ref ?? null,
      input.artifact_producer_attempt_ref ?? null,
      input.artifact_refs,
      input.artifact_hashes,
      input.artifact_identity_receipt_refs,
      input.findings ?? [],
      input.repair_map ?? [],
      input.route_recommendations ?? [],
      input.review_input_snapshot_materialization_request ?? null,
    ]);
    const existingAttempt = findStageAttemptByIdempotencyBoundary(db, {
      domainId: stageRun.domain_id,
      stageId: stageRun.stage_id,
      providerKind: 'temporal',
      idempotencyBoundaryId: requestedUseBoundaryId,
    });
    if (existingAttempt) {
      const existingRow = getStageAttemptRow(db, existingAttempt.stage_attempt_id);
      if (!existingRow) {
        throw new FrameworkContractError('contract_shape_invalid', 'Persisted StageAttempt disappeared.', {
          failure_code: 'persisted_runtime_stage_attempt_not_found',
          stage_attempt_id: existingAttempt.stage_attempt_id,
        });
      }
      requireRuntimeExecutionScopeMutationAllowed(
        db,
        existingRow as unknown as Record<string, unknown>,
        'temporal_stage_quality_attempt_materialize_activity:existing_attempt',
      );
      return withActivityMutationTransaction(db, () => {
        requireRawStageRunMutationAuthority({
          db,
          stageRunId: stageRun.stage_run_id,
          operation: 'temporal_stage_quality_attempt_materialize_activity:existing_stage_run_recheck',
        });
        const freshExistingRow = getStageAttemptRow(db, existingAttempt.stage_attempt_id);
        if (!freshExistingRow) {
          throw new FrameworkContractError('contract_shape_invalid', 'Persisted StageAttempt disappeared.', {
            failure_code: 'persisted_runtime_stage_attempt_not_found',
            stage_attempt_id: existingAttempt.stage_attempt_id,
          });
        }
        requireRuntimeExecutionScopeMutationAllowed(
          db,
          freshExistingRow as unknown as Record<string, unknown>,
          'temporal_stage_quality_attempt_materialize_activity:existing_attempt_recheck',
        );
        createStageQualityCycle(db, {
          qualityCycleId: input.quality_cycle_id,
          stageRunId: stageRun.stage_run_id,
          domainId: stageRun.domain_id,
          stageId: stageRun.stage_id,
          policy: stageRun.quality_policy,
        });
        const currentExistingAttempt = stageAttemptToPayload(freshExistingRow);
        const receipt = persistedStageQualityAttemptMaterializationReceipt(stageRun, currentExistingAttempt);
        markStageQualityCycleCurrentAttempt(db, {
          qualityCycleId: input.quality_cycle_id,
          attemptRef: receipt.attempt_ref,
        });
        return receipt;
      });
    }
    const artifactProducerAttemptRef = input.attempt_role === 'producer'
      ? null
      : input.artifact_producer_attempt_ref?.trim() || null;
    if (input.attempt_role !== 'producer' && !artifactProducerAttemptRef) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Every non-producer Stage quality Attempt must identify the Attempt that produced its input artifact.',
        {
          stage_run_id: stageRun.stage_run_id,
          attempt_role: input.attempt_role,
          blocked_reason: 'artifact_identity_producing_attempt_missing_authority_violation',
        },
      );
    }
    const artifactProducerAttempt = artifactProducerAttemptRef
      ? requirePersistedAttemptStageRunIdentity({
          db,
          attemptRef: artifactProducerAttemptRef,
          stageRun,
          operation: 'stage_quality_artifact_producer_admission',
        })
      : null;
    const parentAttempt = input.parent_attempt_ref
      ? requirePersistedAttemptStageRunIdentity({
          db,
          attemptRef: input.parent_attempt_ref,
          stageRun,
          operation: 'stage_quality_parent_attempt_admission',
        })
      : null;
    if (artifactProducerAttemptRef) {
      // Reject stale artifact bytes before package reconciliation can write a new generation.
      verifyStageQualityArtifactIdentityAtAttemptBoundary({
        artifactRefs: input.artifact_refs,
        artifactHashes: input.artifact_hashes,
        artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
        domainId: stageRun.domain_id,
        workspaceRoot: readString(stageRun.workspace_locator.workspace_root)
          ?? readString(stageRun.workspace_locator.repo_root)
          ?? stageRun.domain_pack_root,
        expectedProducingAttemptId: artifactProducerAttempt!.stage_attempt_id,
        expectedStageRunId: stageRun.stage_run_id,
        expectedScopeKind: stageRun.scope_kind,
        expectedExecutionScope: stageRun.execution_scope,
      });
    }
    const packageReadiness = await (
      options.ensurePackageLaunchReady
      ?? ensureFamilyRuntimePackageLaunchReady
    )({
      domainId: stageRun.domain_id,
      workspaceLocator: stageRun.workspace_locator,
      useBoundaryId: requestedUseBoundaryId,
    });
    const executionDomainPackRoot = readString(packageReadiness?.runtime_source_readiness?.checkout_path)
      ?? readString(stageRun.workspace_locator.domain_pack_root)
      ?? stageRun.domain_pack_root;
    const executionWorkspaceLocator: Record<string, unknown> = {
      ...stageRun.workspace_locator,
      domain_pack_root: executionDomainPackRoot,
      ...(packageReadiness?.package_use_binding
        ? { package_use_binding: packageReadiness.package_use_binding }
        : {}),
    };
    const executionStageBinding = (
      options.resolveStageBinding
      ?? resolveStandardAgentStageQualityRuntimeBinding
    )(executionDomainPackRoot, stageRun.stage_id);
    if (!executionStageBinding?.enabled) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'The current package runtime does not expose the Stage quality binding required by this Attempt.',
        {
          failure_code: 'stage_attempt_execution_binding_missing',
          stage_run_id: stageRun.stage_run_id,
          stage_id: stageRun.stage_id,
          attempt_role: input.attempt_role,
          domain_pack_root: executionDomainPackRoot,
        },
      );
    }
    const rolePromptRef = executionStageBinding.role_prompt_refs[
      input.attempt_role as keyof typeof executionStageBinding.role_prompt_refs
    ];
    if (!rolePromptRef) {
      throw new Error(`Stage quality role prompt ref missing for ${input.attempt_role}`);
    }
    const workspaceRoot = readString(executionWorkspaceLocator.workspace_root)
      ?? readString(executionWorkspaceLocator.repo_root)
      ?? stageRun.domain_pack_root;
    const inputArtifactIdentity = input.attempt_role === 'producer'
      ? {
          artifact_refs: input.artifact_refs,
          artifact_hashes: input.artifact_hashes,
          artifact_identity_receipt_refs: input.artifact_identity_receipt_refs,
        }
      : verifyStageQualityArtifactIdentityAtAttemptBoundary({
          artifactRefs: input.artifact_refs,
          artifactHashes: input.artifact_hashes,
          artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
          domainId: stageRun.domain_id,
          workspaceRoot,
          expectedProducingAttemptId: artifactProducerAttempt!.stage_attempt_id,
          expectedStageRunId: stageRun.stage_run_id,
          expectedScopeKind: stageRun.scope_kind,
          expectedExecutionScope: stageRun.execution_scope,
        });
    const executionStagePacketRef = `${executionStageBinding.manifest_ref}`
      + `@sha256:${executionStageBinding.manifest_sha256}`
      + `#stage=${encodeURIComponent(stageRun.stage_id)}`;
    const qualityScopeBudget = normalizeStageQualityScopeBudget(
      executionStageBinding.quality_policy.formal_review.scope_budget,
      {
        legacyMaxRepairRounds:
          executionStageBinding.quality_policy.formal_review.max_repair_rounds,
      },
    );
    const executionCheckpointRefs = [
      executionStagePacketRef,
      ...(stageRun.checkpoint_refs ?? []).filter((ref) => (
        ref !== stageRun.stage_packet_ref && ref !== stageRun.stage_run_spec.stage_packet_ref
      )),
    ];
    const executionContentSpec = buildStageRunImmutableSpec({
      binding: executionStageBinding,
      domainPackRoot: executionDomainPackRoot,
      domainId: stageRun.domain_id,
      stageId: stageRun.stage_id,
      workspaceLocator: executionWorkspaceLocator,
      scopeKind: stageRun.scope_kind ?? (stageRun.execution_scope ? 'work_item' : 'domain'),
      executionScope: stageRun.execution_scope ?? null,
      sourceFingerprint: stageRun.source_fingerprint,
      executorKind: stageRun.executor_kind,
      stageAttemptExecutorPolicy: stageRun.stage_attempt_executor_policy,
      stagePacketRef: executionStagePacketRef,
      actionId: stageRun.action_id,
      taskId: stageRun.task_id,
      checkpointRefs: executionCheckpointRefs,
      artifactRefs: input.artifact_refs,
      artifactHashes: input.artifact_hashes,
      artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
      parentRouteDecisionRef: stageRun.parent_route_decision_ref,
    });
    const executionContentSpecSha256 = stageRunSpecSha256(executionContentSpec);
    const useBoundaryId = readString(packageReadiness?.package_use_binding?.use_boundary_id)
      ?? requestedUseBoundaryId;
    const executionDeclaredStageIds = canonicalStageAttemptDeclaredStageIds(
      executionStageBinding.declared_stage_ids,
    );
    if (!executionDeclaredStageIds.includes(stageRun.stage_id)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'The current package runtime Stage catalog does not contain the executing Stage.',
        {
          failure_code: 'stage_attempt_execution_stage_not_declared',
          stage_run_id: stageRun.stage_run_id,
          stage_id: stageRun.stage_id,
          declared_stage_ids: executionDeclaredStageIds,
        },
      );
    }
    const executionContentBindingPayload = {
      surface_kind: 'opl_stage_attempt_execution_content_binding' as const,
      version: 'opl-stage-attempt-execution-content-binding.v1' as const,
      parent_stage_run_spec_sha256: stageRun.stage_run_spec_sha256,
      use_boundary_id: useBoundaryId,
      spec_sha256: executionContentSpecSha256,
      spec: executionContentSpec,
      declared_stage_ids: executionDeclaredStageIds,
    };
    const executionContentBinding = {
      ...executionContentBindingPayload,
      binding_sha256: stageAttemptExecutionContentBindingSha256(executionContentBindingPayload),
    };
    const qualityLineageRefs = [...new Set([
      ...(stageRun.lineage_refs ?? []),
      ...(artifactProducerAttemptRef ? [artifactProducerAttemptRef] : []),
      ...inputArtifactIdentity.artifact_identity_receipt_refs,
      `opl://stage-runs/${stageRun.stage_run_id}/spec@sha256:${stageRun.stage_run_spec_sha256}`,
      `opl://stage-attempt-execution-content/${executionContentSpecSha256}`,
    ])];
    const crossStageRouteSelection = {
      surface_kind: 'opl_stage_run_route_selection_context',
      version: 'stage-run-route-selection-context.v1',
      configured_decisive_attempt_roles: executionStageBinding.quality_policy.formal_review.required
        ? ['reviewer', 're_reviewer']
        : ['producer'],
      current_attempt_role: input.attempt_role,
      declared_stage_ids: executionDeclaredStageIds,
      max_repair_rounds: executionStageBinding.quality_policy.formal_review.max_repair_rounds,
      quality_scope_budget: qualityScopeBudget,
      terminal_route_selection_requires_stage_run_terminal: true,
      prior_required_finding_ids: (input.findings ?? [])
        .filter((finding) => finding.required)
        .map((finding) => finding.finding_id),
      non_decisive_output: 'route_impact.stage_route_recommendation',
      prior_route_recommendations: input.route_recommendations ?? [],
    };
    const reviewAttemptRole = input.attempt_role === 'reviewer' || input.attempt_role === 're_reviewer'
      ? input.attempt_role
      : null;
    const snapshotAuthorityBinding = reviewAttemptRole
      ? reviewerSnapshotAuthorityBinding(db, artifactProducerAttemptRef!)
      : null;
    const reviewInputSnapshotContext = reviewAttemptRole
      ? buildStageReviewInputSnapshotContext({
          stageRunId: stageRun.stage_run_id,
          qualityCycleId: input.quality_cycle_id,
          reviewerAttemptRole: reviewAttemptRole,
          resolution: resolveReviewerInputSnapshotMaterialization(
            input.review_input_snapshot_materialization_request,
            snapshotAuthorityBinding!,
          ),
        })
      : null;
    const revisionConsumptionContext = (input.revision_intake_refs?.length ?? 0) > 0
      ? revisionTransportContext({
          revisionIntakeRefs: input.revision_intake_refs,
          oplStageReviewReceiptRef: input.opl_stage_review_receipt_ref,
        })
      : null;
    const contextManifest = reviewAttemptRole
      ? {
          ...buildStageReviewContextManifest({
          stageRunId: stageRun.stage_run_id,
          qualityCycleId: input.quality_cycle_id,
          reviewerAttemptRole: reviewAttemptRole,
          stageGoalRefs: executionStageBinding.stage_goal_refs,
          artifactRefs: inputArtifactIdentity.artifact_refs,
          artifactHashes: inputArtifactIdentity.artifact_hashes,
          sourceRefs: executionStageBinding.source_refs,
          qualityRubricRefs: executionStageBinding.quality_rubric_refs,
          lineageRefs: qualityLineageRefs,
          priorFindingRefs: (input.findings ?? []).map((finding) => finding.finding_id),
          repairMapRefs: (input.repair_map ?? []).map((entry) => `repair-map:${entry.finding_id}`),
          }),
          ...reviewInputSnapshotContext,
          ...(revisionConsumptionContext ? { revision_consumption_context: revisionConsumptionContext } : {}),
          artifact_producer_attempt_ref: artifactProducerAttemptRef,
          cross_stage_route_selection: crossStageRouteSelection,
          quality_scope_budget: qualityScopeBudget,
        }
      : {
          surface_kind: 'opl_stage_quality_attempt_context_manifest',
          version: 'stage-quality-attempt-context-manifest.v1',
          stage_run_id: stageRun.stage_run_id,
          quality_cycle_id: input.quality_cycle_id,
          attempt_role: input.attempt_role,
          stage_goal_refs: executionStageBinding.stage_goal_refs,
          source_refs: executionStageBinding.source_refs,
          quality_rubric_refs: executionStageBinding.quality_rubric_refs,
          lineage_refs: qualityLineageRefs,
          artifact_producer_attempt_ref: artifactProducerAttemptRef,
          artifact_refs: inputArtifactIdentity.artifact_refs,
          artifact_hashes: inputArtifactIdentity.artifact_hashes,
          prior_finding_refs: (input.findings ?? []).map((finding) => finding.finding_id),
          repair_map_refs: (input.repair_map ?? []).map((entry) => `repair-map:${entry.finding_id}`),
          ...(revisionConsumptionContext ? { revision_consumption_context: revisionConsumptionContext } : {}),
          no_context_inheritance: true,
          cross_stage_route_selection: crossStageRouteSelection,
          quality_scope_budget: qualityScopeBudget,
        };
    const contextManifestRef = `opl://stage-quality-context/${stableId('ctx', [contextManifest])}`;
    return withActivityMutationTransaction(db, () => {
      requireRawStageRunMutationAuthority({
        db,
        stageRunId: stageRun.stage_run_id,
        operation: 'temporal_stage_quality_attempt_materialize_activity:stage_run_recheck',
      });
      if (artifactProducerAttemptRef) {
        requirePersistedAttemptStageRunIdentity({
          db,
          attemptRef: artifactProducerAttemptRef,
          stageRun,
          operation: 'stage_quality_artifact_producer_admission_recheck',
        });
      }
      if (parentAttempt) {
        requirePersistedAttemptStageRunIdentity({
          db,
          attemptRef: input.parent_attempt_ref!,
          stageRun,
          operation: 'stage_quality_parent_attempt_admission_recheck',
        });
      }
      createStageQualityCycle(db, {
        qualityCycleId: input.quality_cycle_id,
        stageRunId: stageRun.stage_run_id,
        domainId: stageRun.domain_id,
        stageId: stageRun.stage_id,
        policy: stageRun.quality_policy,
      });
      const attempt = createStageAttempt(db, {
        domainId: stageRun.domain_id,
        stageId: stageRun.stage_id,
        scopeKind: stageRun.scope_kind,
        executionScope: stageRun.execution_scope,
        providerKind: 'temporal',
        workspaceLocator: executionWorkspaceLocator,
        idempotencyBoundaryId: requestedUseBoundaryId,
        sourceFingerprint: stageRun.source_fingerprint ?? undefined,
        executorKind: stageRun.executor_kind,
        stageAttemptExecutorPolicy: stageRun.stage_attempt_executor_policy,
        checkpointRefs: executionCheckpointRefs,
        stageRunId: stageRun.stage_run_id,
        qualityCycleId: input.quality_cycle_id,
        attemptRole: input.attempt_role,
        qualityRoundIndex: input.quality_round_index,
        parentAttemptRef: input.parent_attempt_ref ?? undefined,
        inputArtifactRefs: inputArtifactIdentity.artifact_refs,
        reviewedArtifactHashes: inputArtifactIdentity.artifact_hashes,
        qualitySourceRefs: executionStageBinding.source_refs,
        qualityStageGoalRefs: executionStageBinding.stage_goal_refs,
        qualityLineageRefs,
        qualityRubricRefs: executionStageBinding.quality_rubric_refs,
        priorFindingRefs: (input.findings ?? []).map((finding) => finding.finding_id),
        repairMapRefs: (input.repair_map ?? []).map((entry) => `repair-map:${entry.finding_id}`),
        qualityContext: {
          findings: input.findings ?? [],
          repair_map: input.repair_map ?? [],
          route_recommendations: input.route_recommendations ?? [],
          ...(revisionConsumptionContext ? { revision_consumption_context: revisionConsumptionContext } : {}),
          execution_content_binding: executionContentBinding,
        },
        qualityRolePromptRef: rolePromptRef,
        contextManifestRef,
        contextManifest,
        noContextInheritance: true,
        retryBudget: {
          ...taskRetryBudgetProjection(3),
          quality_scope_budget: qualityScopeBudget,
        },
        newAttempt: false,
      }).attempt;
      const attemptRef = `opl://stage_attempts/${attempt.stage_attempt_id}`;
      markStageQualityCycleCurrentAttempt(db, {
        qualityCycleId: input.quality_cycle_id,
        attemptRef,
      });
      return persistedStageQualityAttemptMaterializationReceipt(stageRun, attempt);
    });
  } finally {
    db.close();
  }
}

function stageAttemptIdFromRef(ref: string) {
  const prefix = 'opl://stage_attempts/';
  if (!ref.startsWith(prefix) || !ref.slice(prefix.length)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Invalid StageAttempt ref.', {
      stage_attempt_ref: ref,
    });
  }
  return ref.slice(prefix.length);
}

function persistedJsonRecord(value: string | null | undefined, failureCode: string) {
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

function reviewerEvidenceArtifactContext(input: {
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

export async function stageQualityAttemptSyncActivity(input: TemporalStageQualityAttemptSyncInput) {
  const { db } = openQueueDb();
  try {
    createStageAttemptTable(db);
    const stageAttemptId = stageAttemptIdFromRef(input.attempt_ref);
    const rawAttempt = getStageAttemptRow(db, stageAttemptId);
    if (!rawAttempt) {
      throw new FrameworkContractError('contract_shape_invalid', 'StageAttempt is not persisted.', {
        failure_code: 'persisted_runtime_stage_attempt_not_found',
        stage_attempt_id: stageAttemptId,
      });
    }
    requireRuntimeExecutionScopeMutationAllowed(
      db,
      rawAttempt as unknown as Record<string, unknown>,
      'temporal_stage_quality_attempt_sync_activity:raw_attempt',
    );
    requirePersistedStageAttemptActivityIdentity({
      db,
      candidateIdentity: input.workflow_state as unknown as Record<string, unknown>,
      stageAttemptId,
      operation: 'temporal_stage_quality_attempt_sync_activity',
    });
    const syncReceipt = syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: stageAttemptId,
      workflow_id: input.workflow_state.workflow_id,
      workflow_status: 'COMPLETED',
      query: input.workflow_state,
    });
    const closeout = isRecord(input.workflow_state.closeout_packet)
      ? input.workflow_state.closeout_packet
      : {};
    const routeImpact = isRecord(closeout.route_impact) ? closeout.route_impact : {};
    const envelope = isRecord(routeImpact.stage_quality_cycle)
      ? routeImpact.stage_quality_cycle
      : {};
    if (!Object.hasOwn(envelope, 'page_hash_evidence_candidate')) {
      return {
        ...(isRecord(syncReceipt) ? syncReceipt : {}),
        opl_review_evidence_artifact_receipt_ref: null,
        opl_review_evidence_artifact_receipt: null,
      };
    }
    const row = db.prepare(`
      SELECT attempt_role, quality_context_json
      FROM stage_attempts
      WHERE stage_attempt_id = ?
      LIMIT 1
    `).get(stageAttemptId) as {
      attempt_role?: string | null;
      quality_context_json?: string | null;
    } | undefined;
    if (!row || (row.attempt_role !== 'reviewer' && row.attempt_role !== 're_reviewer')) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Review evidence artifact may only be persisted from a reviewer Attempt.',
        {
          failure_code: 'review_evidence_artifact_candidate_non_reviewer',
          stage_attempt_id: stageAttemptId,
          attempt_role: row?.attempt_role ?? null,
        },
      );
    }
    const qualityContext = persistedJsonRecord(
      row.quality_context_json,
      'review_evidence_artifact_quality_context_invalid',
    );
    const attemptRef = `opl://stage_attempts/${stageAttemptId}`;
    const artifactContext = reviewerEvidenceArtifactContext({
      attemptRef,
      qualityContext,
      closeout,
      producerPackageId: envelope.page_hash_evidence_candidate_package_id,
      originEvidenceRef: envelope.page_hash_evidence_origin_ref,
    });
    const persisted = persistReviewEvidenceArtifactCandidate(
      envelope.page_hash_evidence_candidate,
      artifactContext,
    );
    db.prepare(`
      UPDATE stage_attempts
      SET quality_context_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify({
      ...qualityContext,
      opl_review_evidence_artifact_receipt_ref: persisted.receipt_ref,
      opl_review_evidence_artifact_receipt: persisted.receipt,
    }), new Date().toISOString(), stageAttemptId);
    return {
      ...(isRecord(syncReceipt) ? syncReceipt : {}),
      opl_review_evidence_artifact_receipt_ref: persisted.receipt_ref,
      opl_review_evidence_artifact_receipt: persisted.receipt,
    };
  } finally {
    db.close();
  }
}

export async function stageQualityReviewReceiptActivity(input: TemporalStageQualityReviewReceiptInput) {
  const { db } = openQueueDb();
  try {
    createStageAttemptTable(db);
    const producerAttemptId = stageAttemptIdFromRef(input.producer_attempt_ref);
    const reviewerAttemptId = stageAttemptIdFromRef(input.reviewer_attempt_ref);
    for (const [stageAttemptId, operation] of [
      [producerAttemptId, 'temporal_stage_quality_review_receipt_activity:raw_producer'],
      [reviewerAttemptId, 'temporal_stage_quality_review_receipt_activity:raw_reviewer'],
    ] as const) {
      const row = getStageAttemptRow(db, stageAttemptId);
      if (!row) {
        throw new FrameworkContractError('contract_shape_invalid', 'StageAttempt is not persisted.', {
          failure_code: 'persisted_runtime_stage_attempt_not_found',
          stage_attempt_id: stageAttemptId,
        });
      }
      requireRuntimeExecutionScopeMutationAllowed(
        db,
        row as unknown as Record<string, unknown>,
        operation,
      );
    }
    const producer = requireResolvedPersistedStageAttemptIdentity({
      db,
      stageAttemptId: producerAttemptId,
      operation: 'temporal_stage_quality_review_receipt_activity:producer',
    });
    const reviewer = requireResolvedPersistedStageAttemptIdentity({
      db,
      stageAttemptId: reviewerAttemptId,
      operation: 'temporal_stage_quality_review_receipt_activity:reviewer',
    });
    requireSamePersistedStageRunAttemptIdentity({
      stageRunIdentity: producer as unknown as Record<string, unknown>,
      stageAttemptIdentity: reviewer as unknown as Record<string, unknown>,
      operation: 'temporal_stage_quality_review_receipt_activity:pair',
    });
    const receipt = materializePersistedStageReviewReceipt(db, {
      producerAttemptId,
      reviewerAttemptId,
      rubricRefs: input.rubric_refs,
      verdict: input.verdict,
    });
    return {
      ...receipt,
      revision_transport: materializeOplRevisionTransport(receipt),
    };
  } finally {
    db.close();
  }
}

export async function stageRunRouteLaunchActivity(
  input: TemporalStageRunRouteLaunchInput,
): Promise<TemporalStageRunRouteLaunchReceipt> {
  const { db } = openQueueDb();
  try {
    requireRawStageRunMutationAuthority({
      db,
      stageRunId: input.parent_stage_run.stage_run_id,
      operation: 'temporal_stage_run_route_launch_activity:raw_parent',
    });
    const decisiveAttemptId = stageAttemptIdFromRef(input.decisive_attempt_ref);
    const decisiveAttemptRow = getStageAttemptRow(db, decisiveAttemptId);
    if (!decisiveAttemptRow) {
      throw new FrameworkContractError('contract_shape_invalid', 'StageAttempt is not persisted.', {
        failure_code: 'persisted_runtime_stage_attempt_not_found',
        stage_attempt_id: decisiveAttemptId,
      });
    }
    requireRuntimeExecutionScopeMutationAllowed(
      db,
      decisiveAttemptRow as unknown as Record<string, unknown>,
      'temporal_stage_run_route_launch_activity:raw_decisive_attempt',
    );
    const parentStageRun = requirePersistedStageRunActivityIdentity({
      db,
      candidateIdentity: input.parent_stage_run as unknown as Record<string, unknown>,
      operation: 'temporal_stage_run_route_launch_activity:parent',
    });
    const decisiveAttempt = requireResolvedPersistedStageAttemptIdentity({
      db,
      stageAttemptId: decisiveAttemptId,
      operation: 'temporal_stage_run_route_launch_activity:decisive_attempt',
    });
    requireSamePersistedStageRunAttemptIdentity({
      stageRunIdentity: parentStageRun as unknown as Record<string, unknown>,
      stageAttemptIdentity: decisiveAttempt as unknown as Record<string, unknown>,
      operation: 'temporal_stage_run_route_launch_activity:lineage',
    });
  } finally {
    db.close();
  }
  return materializeStageRunRoute(input, {
    findTargetStageRun: (stageRunId) => {
      const { db } = openQueueDb();
      try {
        return findStageRunLaunch(db, stageRunId)?.stage_run_input ?? null;
      } finally {
        db.close();
      }
    },
    launchTargetStageRun: async (stageRunInput) => {
      const { db, paths } = openQueueDb();
      try {
        return await launchRegisteredStageRun({
          db,
          stageRunInput,
          start: true,
          startWorkflow: async (workflowInput) => await (
            await import('./family-runtime-temporal-provider-parts/attempt-control.ts')
          ).startTemporalStageRunWorkflow(workflowInput, { paths }),
          describeWorkflow: async (workflowInput) => await (
            await import('./family-runtime-temporal-provider-parts/attempt-control.ts')
          ).describeTemporalStageRunWorkflow(workflowInput, { paths }),
        });
      } finally {
        db.close();
      }
    },
  });
}

export async function stageQualityCycleProjectActivity(
  input: TemporalStageQualityCycleProjectionInput,
) {
  const { db } = openQueueDb();
  try {
    requireRawStageRunMutationAuthority({
      db,
      stageRunId: input.stage_run.stage_run_id,
      operation: 'temporal_stage_quality_cycle_project_activity:raw_stage_run',
    });
    requirePersistedStageRunActivityIdentity({
      db,
      candidateIdentity: input.stage_run as unknown as Record<string, unknown>,
      operation: 'temporal_stage_quality_cycle_project_activity',
    });
    requireSameFamilyRuntimeExecutionIdentity({
      authorityIdentity: input.stage_run as unknown as Record<string, unknown>,
      candidateIdentity: input.state as unknown as Record<string, unknown>,
      operation: 'temporal_stage_quality_cycle_project_activity:workflow_state',
      compareWorkflowId: true,
      requireStageRunId: true,
    });
    createStageAttemptTable(db);
    const projected = withActivityMutationTransaction(db, () => {
      requireRawStageRunMutationAuthority({
        db,
        stageRunId: input.stage_run.stage_run_id,
        operation: 'temporal_stage_quality_cycle_project_activity:stage_run_recheck',
      });
      createStageQualityCycle(db, {
        qualityCycleId: input.state.quality_cycle_id,
        stageRunId: input.stage_run.stage_run_id,
        domainId: input.stage_run.domain_id,
        stageId: input.stage_run.stage_id,
        policy: input.stage_run.quality_policy,
      });
      return projectTemporalStageRunQualityCycle(db, input.state);
    });
    recordStageRunClosed(db, {
      stageRunId: input.stage_run.stage_run_id,
      terminalStatus: input.state.status,
    });
    return projected;
  } finally {
    db.close();
  }
}

export const StageAttemptActivity = codexStageActivity;
