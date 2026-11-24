import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  claimStageRunRecoveryStart,
  findStageRunLaunch,
  recordStageRunClosed,
  recordStageRunRecoveryStartFailure,
  recordStageRunTemporalRecoveryStart,
} from './family-runtime-stage-run-launch-registry.ts';
import {
  listStageAttemptCloseouts,
  reconcilePersistedStageReviewReceipt,
} from './family-runtime-stage-attempt-ledger.ts';
import { materializeOplRevisionTransport } from './family-runtime-revision-intake.ts';
import {
  ingestStageAttemptCloseout,
  inspectStageAttempt,
} from './family-runtime-stage-attempts.ts';
import {
  inspectStageQualityCycle,
  projectTemporalStageRunQualityCycle,
} from './family-runtime-stage-quality-cycle.ts';
import type {
  TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';
import {
  artifactIdentity,
  canonicalCloseoutMetadata,
  parseRawOutputForCloseoutRecovery,
} from './family-runtime-stage-run-closeout-recovery/raw-closeout.ts';
import {
  attemptSummaryFromPersisted,
  findingsFromPriorQualityLineage,
  priorAttemptSummaries,
} from './family-runtime-stage-run-closeout-recovery/lineage.ts';
import {
  buildRecoveryWorkflowState,
} from './family-runtime-stage-run-closeout-recovery/workflow-state.ts';
import {
  artifactIdentityAuthorityFromReviewReceipt,
  producerArtifactIdentityAuthority,
  reconstructRepairerRecoveryArtifactAuthority,
  resolveRecoveryArtifactAuthority,
} from './family-runtime-temporal-workflow-artifact-authority.ts';

export { parseRawOutputForCloseoutRecovery };
import {
  recoverFrameworkRawArtifactForAttempt,
} from './family-runtime-codex-stage-runner/raw-artifact-identity-verification.ts';
import {
  normalizeCodexTransportCloseoutCandidate,
} from './family-runtime-codex-stage-runner/session-closeout-recovery.ts';
import { normalizeTypedStageCloseoutPacket } from './family-runtime-codex-stage-runner/closeout-normalization.ts';
import {
  verifyStageQualityCloseoutArtifactIdentity,
} from './family-runtime-codex-stage-runner/artifact-identity-verification.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  type StageQualityFinding,
  type StageQualityRepairMapEntry,
  type StageReviewReceipt,
} from '../../authority/stages/index.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function readLatestCloseout(db: DatabaseSync, stageAttemptId: string) {
  const closeouts = listStageAttemptCloseouts(db, stageAttemptId);
  const latest = closeouts.at(-1);
  if (!latest || !latest.packet) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageAttempt has no persisted closeout to recover.', {
      failure_code: 'persisted_stage_attempt_closeout_not_found',
      stage_attempt_id: stageAttemptId,
    });
  }
  return latest;
}

export async function recoverStageRunCloseoutProjection(db: DatabaseSync, input: {
  stageRunId: string;
  stageAttemptId: string;
}, options: {
  startWorkflow: (input: TemporalStageRunWorkflowInput) => Promise<Record<string, unknown>>;
  describeWorkflow?: (input: TemporalStageRunWorkflowInput) => Promise<Record<string, unknown>>;
  retryTerminalRecovery?: boolean;
  retryReviewer?: boolean;
  now?: () => Date;
  startLeaseMs?: number;
}) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  if (attempt.stage_run_id !== input.stageRunId) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovery Attempt does not belong to the requested StageRun.', {
      failure_code: 'stage_quality_cycle_attempt_lineage_mismatch',
      stage_run_id: input.stageRunId,
      stage_attempt_id: input.stageAttemptId,
      attempt_stage_run_id: attempt.stage_run_id,
    });
  }
  const launch = findStageRunLaunch(db, input.stageRunId);
  if (!launch) {
    throw new FrameworkContractError('contract_shape_invalid', 'Requested StageRun is not registered in the launch authority.', {
      failure_code: 'stage_quality_cycle_stage_run_unregistered',
      stage_run_id: input.stageRunId,
    });
  }
  if (
    launch.domain_id !== attempt.domain_id
    || launch.stage_id !== attempt.stage_id
    || launch.execution_scope?.scope_digest !== attempt.execution_scope?.scope_digest
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovery StageRun and Attempt execution lineage does not match.', {
      failure_code: 'stage_quality_cycle_attempt_lineage_mismatch',
      stage_run_id: input.stageRunId,
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const cycle = inspectStageQualityCycle(db, attempt.quality_cycle_id ?? `quality-cycle:${input.stageRunId}`);
  let effectiveLaunch = launch;
  if (launch.launch_status === 'started') {
    if (!options.describeWorkflow) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery requires fresh Temporal observation before reconciling a missing terminal registry projection.',
        { failure_code: 'stage_run_recovery_terminal_observation_missing' },
      );
    }
    const observed = record(await options.describeWorkflow(
      launch.stage_run_input as TemporalStageRunWorkflowInput,
    ));
    const observedStatus = requireString(
      observed.workflow_status,
      'workflow_observation.workflow_status',
    ).toUpperCase();
    const observedRunId = requireString(
      observed.first_execution_run_id,
      'workflow_observation.first_execution_run_id',
    );
    const originalRunId = requireString(
      record(launch.temporal_start_receipt).first_execution_run_id,
      'launch.temporal_start_receipt.first_execution_run_id',
    );
    if (
      observed.workflow_found !== true
      || observed.workflow_id !== launch.workflow_id
      || observedRunId !== originalRunId
      || !['COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED', 'TERMINATED', 'TIMED_OUT'].includes(observedStatus)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery found no matching terminal Temporal execution to reconcile.',
        {
          failure_code: 'stage_run_recovery_terminal_observation_mismatch',
          stage_run_id: input.stageRunId,
          observed_workflow_status: observedStatus,
          observed_run_id: observedRunId,
          expected_run_id: originalRunId,
        },
      );
    }
    const projectedStatus = String(record(cycle.state).status ?? '').toLowerCase();
    const terminalStatus = ['completed', 'completed_with_quality_debt', 'failed', 'blocked', 'cancelled', 'canceled', 'human_gate']
      .includes(projectedStatus) ? projectedStatus : observedStatus.toLowerCase();
    effectiveLaunch = recordStageRunClosed(db, {
      stageRunId: input.stageRunId,
      terminalStatus,
    })!;
  }
  const beforeCount = Number((db.prepare('SELECT COUNT(*) AS count FROM stage_attempts WHERE stage_run_id = ?').get(input.stageRunId) as { count: number }).count);
  const recoveryAfterReviewer = attempt.attempt_role === 'reviewer';
  const acceptedReview = recoveryAfterReviewer
    && attempt.status === 'completed' && attempt.closeout_receipt_status === 'accepted_typed_closeout'
    ? reconcilePersistedStageReviewReceipt(db, input.stageAttemptId)
    : null;
  if (acceptedReview && (attempt.status !== 'completed'
    || attempt.closeout_receipt_status !== 'accepted_typed_closeout'
    || acceptedReview.verdict !== 'repair_required'
    || record(record(attempt.route_impact).stage_route_recommendation).decision_kind !== 'repeat')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Reviewer recovery requires an accepted same-stage repair-required verdict.', {
      failure_code: 'stage_run_recovery_review_lineage_invalid',
    });
  }
  const retryReviewer = options.retryReviewer === true;
  let retryProducer: ReturnType<typeof inspectStageAttempt> | null = null;
  if (retryReviewer) {
    const previousRecoveries = record(effectiveLaunch.temporal_start_receipt).recovery_runs;
    const previousRecovery = Array.isArray(previousRecoveries) ? record(previousRecoveries[0]) : {};
    const observationInput = {
      ...(effectiveLaunch.stage_run_input as TemporalStageRunWorkflowInput),
      ...(previousRecovery.recovery_resume ? { recovery_resume: previousRecovery.recovery_resume } : {}),
    } as TemporalStageRunWorkflowInput;
    const currentRun = record(options.describeWorkflow ? await options.describeWorkflow(observationInput) : null);
    const expectedRunId = previousRecovery.recovery_resume
      ? record(previousRecovery.temporal_start_receipt).recovery_run_id
      : record(effectiveLaunch.temporal_start_receipt).first_execution_run_id;
    if (!expectedRunId || currentRun.workflow_found !== true
      || currentRun.workflow_id !== effectiveLaunch.workflow_id
      || currentRun.first_execution_run_id !== expectedRunId
      || (previousRecovery.recovery_resume && currentRun.recovery_id !== previousRecovery.recovery_id)
      || !['COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED', 'TERMINATED', 'TIMED_OUT']
        .includes(String(currentRun.workflow_status).toUpperCase())) {
      throw new FrameworkContractError('contract_shape_invalid',
        'Reviewer retry requires a fresh matching terminal observation of the current StageRun execution.',
        { failure_code: 'stage_run_recovery_reviewer_retry_execution_not_terminal', stage_run_id: input.stageRunId });
    }
    const provider = record(attempt.provider_run);
    const observation = record(provider.terminal_observation);
    const prior = record(cycle.state);
    const summaries = record(prior.controller_readback).attempts;
    const lastAttempt = Array.isArray(summaries) ? record(summaries.at(-1)) : {};
    const producerRef = record(attempt.context_manifest).artifact_producer_attempt_ref;
    if (acceptedReview || attempt.attempt_role !== 'reviewer' || attempt.status !== 'blocked'
      || attempt.closeout_receipt_status !== null
      || attempt.blocked_reason !== 'codex_cli_provider_unavailable'
      || provider.provider_status !== 'blocked' || provider.workflow_id !== attempt.workflow_id
      || observation.source !== 'temporal_stage_attempt_query'
      || observation.reason !== 'codex_cli_provider_unavailable'
      || record(attempt.route_impact).hard_stop_class !== 'permission_or_credential_boundary'
      || lastAttempt.stage_attempt_id !== input.stageAttemptId
      || Number(prior.repair_rounds_used ?? 0) !== 0
      || typeof producerRef !== 'string' || !producerRef.startsWith('opl://stage_attempts/')
      || attempt.parent_attempt_ref !== producerRef) {
      throw new FrameworkContractError('contract_shape_invalid',
        'Reviewer retry requires the latest provider-blocked initial review and no accepted review verdict.',
        { failure_code: 'stage_run_recovery_reviewer_retry_not_admitted', stage_attempt_id: input.stageAttemptId });
    }
    retryProducer = inspectStageAttempt(db, producerRef.slice('opl://stage_attempts/'.length));
    if (retryProducer.attempt_role !== 'producer' || retryProducer.status !== 'completed'
      || retryProducer.closeout_receipt_status !== 'accepted_typed_closeout'
      || retryProducer.stage_run_id !== input.stageRunId
      || retryProducer.quality_cycle_id !== attempt.quality_cycle_id
      || retryProducer.stage_id !== attempt.stage_id || retryProducer.domain_id !== attempt.domain_id
      || retryProducer.execution_scope?.scope_digest !== attempt.execution_scope?.scope_digest) {
      throw new FrameworkContractError('contract_shape_invalid',
        'Reviewer retry must bind the original accepted producer in the same StageRun and scope.',
        { failure_code: 'stage_run_recovery_reviewer_retry_lineage_invalid', stage_attempt_id: input.stageAttemptId });
    }
  }
  if (!retryReviewer && !acceptedReview && attempt.attempt_role === 'reviewer'
    && attempt.status === 'blocked' && attempt.closeout_receipt_status === null
    && attempt.blocked_reason === 'codex_cli_provider_unavailable') {
    throw new FrameworkContractError('contract_shape_invalid',
      'The provider-blocked reviewer has no accepted semantic closeout. Resolve the provider boundary, then explicitly retry formal review on the original producer.',
      { failure_code: 'stage_run_recovery_reviewer_closeout_missing', stage_attempt_id: input.stageAttemptId,
        recovery_command: `opl family-runtime stage-run recover-closeout ${input.stageRunId} --attempt ${input.stageAttemptId} --retry-reviewer`,
        domain_artifact_verdict_inferred: false });
  }
  const artifactAttempt = retryProducer ?? (acceptedReview
    ? inspectStageAttempt(db, acceptedReview.producer_attempt_ref.replace(/^opl:\/\/stage_attempts\//, ''))
    : attempt);
  const useAcceptedArtifact = Boolean(acceptedReview || retryReviewer);
  const rawArtifact = useAcceptedArtifact ? null : recoverFrameworkRawArtifactForAttempt(attempt);
  if (!useAcceptedArtifact && !rawArtifact) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bound raw executor output is unavailable for recovery.', {
      failure_code: 'raw_executor_output_recovery_failed',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const latestCloseout = readLatestCloseout(db, artifactAttempt.stage_attempt_id);
  // Protocol-only resume can supersede a parseable but incomplete raw response.
  // Keep its immutable raw binding, then verify the accepted packet's bytes below.
  const acceptedArtifactCloseout = artifactAttempt.status === 'completed'
    && artifactAttempt.closeout_receipt_status === 'accepted_typed_closeout';
  const rawCandidate = useAcceptedArtifact || acceptedArtifactCloseout ? record(latestCloseout.packet) : normalizeCodexTransportCloseoutCandidate(parseRawOutputForCloseoutRecovery(rawArtifact!.output_ref, {
    attempt,
    latestCloseoutPacket: record(latestCloseout.packet),
  }));
  const rawArtifactAfterRead = useAcceptedArtifact ? null : recoverFrameworkRawArtifactForAttempt(attempt);
  if (!useAcceptedArtifact && (!rawArtifactAfterRead || canonicalJsonText(rawArtifactAfterRead) !== canonicalJsonText(rawArtifact))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Raw executor output changed during recovery.', {
      failure_code: 'raw_executor_output_recovery_failed',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  if (attempt.attempt_role === 'reviewer' && !acceptedReview && !retryReviewer
    && !record(record(rawCandidate.route_impact).stage_quality_cycle).outcome) {
    throw new FrameworkContractError('contract_shape_invalid',
      'Reviewer semantic closeout is missing. After resolving the provider boundary, retry the formal review on the original producer artifact.',
      { failure_code: 'stage_run_recovery_reviewer_closeout_missing', stage_attempt_id: input.stageAttemptId,
        recovery_command: `opl family-runtime stage-run recover-closeout ${input.stageRunId} --attempt ${input.stageAttemptId} --retry-reviewer`,
        domain_artifact_verdict_inferred: false });
  }
  const identity = artifactIdentity(rawCandidate, artifactAttempt);
  const persistedPacket = record(latestCloseout.packet);
  const rawRouteImpact = record(rawCandidate.route_impact);
  const mergedRouteImpact = {
    ...record(persistedPacket.route_impact),
    ...rawRouteImpact,
    stage_quality_cycle: {
      ...record(record(persistedPacket.route_impact).stage_quality_cycle),
      ...record(rawRouteImpact.stage_quality_cycle),
      artifact_refs: identity.artifact_refs,
      artifact_hashes: identity.artifact_hashes,
    },
  };
  const correctedInput = {
    ...persistedPacket,
    // A derived packet has one canonical identity across live ingest, replay and
    // recovery. Renaming it here would invalidate its original/derived lineage.
    closeout_id: record(persistedPacket.closeout_normalization).status === 'normalized'
      ? requireString(persistedPacket.closeout_id, 'persisted derived closeout_id')
      : stableId('closeout-recovery', [input.stageAttemptId, identity.artifact_refs, identity.artifact_hashes]),
    closeout_refs: [...new Set([
      ...(Array.isArray(persistedPacket.closeout_refs) ? persistedPacket.closeout_refs : []),
      ...identity.artifact_refs,
    ])],
    closeout_ref_metadata: canonicalCloseoutMetadata(persistedPacket, identity),
    route_impact: mergedRouteImpact,
  };
  const verified = verifyStageQualityCloseoutArtifactIdentity({
    closeoutPacket: normalizeTypedStageCloseoutPacket(correctedInput),
    attempt: artifactAttempt,
    workspaceRoot: requireString(attempt.execution_scope?.workspace_root, 'attempt.execution_scope.workspace_root'),
  });
  if (!verified) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovery closeout did not produce a typed producer packet.', {
      failure_code: 'stage_quality_attempt_without_consumable_artifact',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const verifiedRouteImpact = record(verified.route_impact);
  const verifiedQuality = record(verifiedRouteImpact.stage_quality_cycle);
  const receiptRefs = identity.artifact_refs.map((ref) => {
    const entry = (verified.closeout_ref_metadata ?? []).find((candidate) => candidate.ref === ref || candidate.uri === ref);
    return requireString(entry?.artifact_identity_receipt_ref, 'closeout_ref_metadata.artifact_identity_receipt_ref');
  });
  const correctedPacket = normalizeTypedStageCloseoutPacket({
    ...verified,
    route_impact: {
      ...verifiedRouteImpact,
      stage_quality_cycle: {
        ...verifiedQuality,
        artifact_identity_receipt_refs: receiptRefs,
      },
    },
  });
  const ingested = useAcceptedArtifact ? { closeout: { closeout_id: latestCloseout.closeout_id, idempotent_noop: true } } : ingestStageAttemptCloseout(db, {
    stageAttemptId: input.stageAttemptId,
    packet: correctedPacket,
  });
  const updatedAttempt = inspectStageAttempt(db, input.stageAttemptId);
  const recoveryAttempt = retryProducer ?? updatedAttempt;
  const recoveryIdentity = {
    artifact_refs: identity.artifact_refs,
    artifact_hashes: identity.artifact_hashes,
    artifact_identity_receipt_refs: receiptRefs,
  };
  const recoverySummary = attemptSummaryFromPersisted(recoveryAttempt, recoveryIdentity);
  const currentState = record(cycle.state);
  const recoveryPriorAttemptSummaries = priorAttemptSummaries(db, currentState, recoveryAttempt, recoveryIdentity);
  const recoveryFindings = findingsFromPriorQualityLineage(db, currentState, recoveryAttempt);
  const persistedReviewReceipts = Array.isArray(record(currentState.controller_readback).review_receipts)
    ? record(currentState.controller_readback).review_receipts as StageReviewReceipt[]
    : [];
  const recoveringRepairer = recoveryAttempt.attempt_role === 'repairer';
  const reconstructedRepairerRecovery = recoveringRepairer
    ? reconstructRepairerRecoveryArtifactAuthority({
        repairerSummary: recoverySummary,
        priorAttemptSummaries: recoveryPriorAttemptSummaries,
        reviewReceipts: persistedReviewReceipts,
      })
    : null;
  if (recoveringRepairer && !reconstructedRepairerRecovery) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Repairer recovery cannot uniquely reconstruct the previous reviewed artifact lineage.',
      {
        failure_code: 'stage_run_recovery_previous_reviewed_lineage_invalid',
        stage_run_id: input.stageRunId,
        stage_attempt_id: input.stageAttemptId,
      },
    );
  }
  const recoveryArtifactIdentity = reconstructedRepairerRecovery ?? recoveryIdentity;
  const recoveryArtifactIdentityAuthority = recoveringRepairer
    ? reconstructedRepairerRecovery!.artifact_identity_authority
    : acceptedReview
      ? artifactIdentityAuthorityFromReviewReceipt({
          receipt: acceptedReview,
          status: 'reviewed_with_open_findings',
          qualityRoundIndex: 0,
        })
      : producerArtifactIdentityAuthority({
          attemptRef: `opl://stage_attempts/${artifactAttempt.stage_attempt_id}`,
        });
  const recoveryState = buildRecoveryWorkflowState({
    attemptSummary: recoverySummary,
    launch: effectiveLaunch,
    cycle,
    priorAttemptSummaries: recoveryPriorAttemptSummaries,
    findings: recoveryFindings,
    artifactRefs: recoveryArtifactIdentity.artifact_refs,
    artifactHashes: recoveryArtifactIdentity.artifact_hashes,
    artifactIdentityReceiptRefs: recoveryArtifactIdentity.artifact_identity_receipt_refs,
    artifactIdentityAuthority: recoveryArtifactIdentityAuthority,
    routeRecommendation: acceptedReview ? record(record(attempt.route_impact).stage_route_recommendation)
      : record(verifiedRouteImpact.stage_route_recommendation).decision_kind
      ? record(verifiedRouteImpact.stage_route_recommendation)
      : null,
  });
  const recoveredSummary = recoveryState.attempts.find((entry) => entry.stage_attempt_id === (retryReviewer ? artifactAttempt.stage_attempt_id : input.stageAttemptId))!;
  if (retryReviewer) {
    // Keep the failed review as history. Only the controller creates a new
    // review identity; no verdict or semantic repair round is reconstructed.
    recoveryState.attempts = priorAttemptSummaries(db, record(cycle.state), attempt, {
      ...identity, artifact_identity_receipt_refs: receiptRefs,
    }).map((summary) => summary.stage_attempt_id === artifactAttempt.stage_attempt_id
      || summary.artifact_producer_attempt_ref === `opl://stage_attempts/${artifactAttempt.stage_attempt_id}`
      ? { ...summary, ...identity, artifact_identity_receipt_refs: receiptRefs }
      : summary);
    recoveryState.current_role = 'reviewer';
    recoveryState.source_attempt_ref = `opl://stage_attempts/${input.stageAttemptId}`;
  }
  const recoveryAfterRepairer = recoveredSummary.attempt_role === 'repairer';
  if (acceptedReview) {
    recoveryState.findings = validateStageQualityFindings(record(record(attempt.route_impact).stage_quality_cycle).findings as StageQualityFinding[]);
    recoveryState.review_receipts = [{ ...acceptedReview, revision_transport: materializeOplRevisionTransport(acceptedReview) }];
    recoveryState.repair_map = [];
    const used = db.prepare("SELECT MAX(quality_round_index) AS used FROM stage_attempts WHERE stage_run_id = ? AND attempt_role = 'repairer'")
      .get(input.stageRunId) as { used: number | null };
    recoveryState.repair_rounds_used = Math.max(recoveryState.repair_rounds_used, used.used ?? 0);
  }
  if (recoveryAfterRepairer) {
    if (!Array.isArray(verifiedQuality.repair_map)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Repairer recovery requires its owner-provided repair map.', {
        failure_code: 'stage_run_recovery_repair_map_missing',
      });
    }
    const strictRepairMap = validateStageQualityRepairMap({
      findings: recoveryState.findings,
      repairMap: verifiedQuality.repair_map as StageQualityRepairMapEntry[],
    });
    recoveryState.repair_map = record(verified.closeout_normalization).status === 'normalized'
      ? verifiedQuality.repair_map as StageQualityRepairMapEntry[]
      : strictRepairMap;
  }
  const projected = projectTemporalStageRunQualityCycle(db, recoveryState);
  const projectionAttemptCount = Number((db.prepare('SELECT COUNT(*) AS count FROM stage_attempts WHERE stage_run_id = ?').get(input.stageRunId) as { count: number }).count);
  const findings = validateStageQualityFindings(
    recoveryState.findings,
  );
  const repairMap = recoveryAfterRepairer
    ? recoveryState.repair_map
    : [];
  const priorReviewReceipts = Array.isArray(record(record(cycle.state).controller_readback).review_receipts)
    ? record(record(cycle.state).controller_readback).review_receipts as StageReviewReceipt[]
    : [];
  const recoveryId = stableId('stage-run-recovery', [
    input.stageRunId,
    recoveryState.quality_cycle_id,
    input.stageAttemptId,
    identity.artifact_refs,
    identity.artifact_hashes,
    receiptRefs,
  ]);
  const artifactProducerAttemptRef = `opl://stage_attempts/${artifactAttempt.stage_attempt_id}`;
  const reviewInputSnapshotMaterializationRequest = acceptedReview ? null :
    verifiedQuality.review_input_snapshot_materialization_request ?? null;
  const recoveryResumeCandidate = {
    surface_kind: 'opl_stage_run_recovery_resume' as const,
    version: 'opl-stage-run-recovery-resume.v1' as const,
    recovery_id: recoveryId,
    quality_cycle_id: recoveryState.quality_cycle_id,
    ...(acceptedReview
      ? {
          resume_after_role: 'reviewer' as const,
          reviewer_attempt_ref: `opl://stage_attempts/${input.stageAttemptId}`,
          artifact_producer_attempt_ref: artifactProducerAttemptRef,
          artifact_producer_attempt_summary: attemptSummaryFromPersisted(artifactAttempt, {
            ...identity, artifact_identity_receipt_refs: receiptRefs,
          }),
          prior_attempt_summaries: recoveryState.attempts,
          findings,
          review_receipts: recoveryState.review_receipts,
          repair_rounds_used: recoveryState.repair_rounds_used,
          quality_debt_refs: recoveryState.quality_debt_refs,
          route_quality_debt_refs: recoveryState.route_quality_debt_refs,
        }
      : recoveryAfterRepairer
      ? {
          resume_after_role: 'repairer' as const,
          artifact_producer_attempt_ref: artifactProducerAttemptRef,
          artifact_producer_attempt_summary: recoveredSummary,
          prior_attempt_summaries: recoveryState.attempts,
          findings,
          repair_map: repairMap,
          review_receipts: persistedReviewReceipts.length > 0 ? persistedReviewReceipts : priorReviewReceipts,
          repair_rounds_used: recoveredSummary.quality_round_index,
          quality_debt_refs: recoveryState.quality_debt_refs,
          route_quality_debt_refs: recoveryState.route_quality_debt_refs,
          artifact_identity_authority: recoveryArtifactIdentityAuthority,
        }
      : {
          producer_attempt_ref: artifactProducerAttemptRef,
          producer_attempt_summary: recoveredSummary,
          ...(retryReviewer ? {
            prior_attempt_summaries: recoveryState.attempts,
            repair_rounds_used: recoveryState.repair_rounds_used,
            quality_debt_refs: recoveryState.quality_debt_refs,
            route_quality_debt_refs: recoveryState.route_quality_debt_refs,
          } : {}),
        }),
    artifact_refs: recoveryArtifactIdentity.artifact_refs,
    artifact_hashes: recoveryArtifactIdentity.artifact_hashes,
    artifact_identity_receipt_refs: recoveryArtifactIdentity.artifact_identity_receipt_refs,
    artifact_identity_authority: recoveryArtifactIdentityAuthority,
    route_recommendations: recoveryState.route_recommendations,
    review_input_snapshot_materialization_request: reviewInputSnapshotMaterializationRequest,
  };
  const resolvedRecoveryArtifactAuthority = resolveRecoveryArtifactAuthority(recoveryResumeCandidate, {
    maxRepairRounds: (effectiveLaunch.stage_run_input as TemporalStageRunWorkflowInput)
      .quality_policy.formal_review.max_repair_rounds,
  });
  if (!resolvedRecoveryArtifactAuthority) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Closeout recovery cannot derive one canonical Attempt/review artifact authority.',
      {
        failure_code: 'stage_run_recovery_previous_reviewed_lineage_invalid',
        stage_run_id: input.stageRunId,
        stage_attempt_id: input.stageAttemptId,
      },
    );
  }
  const recoveryResume = {
    ...recoveryResumeCandidate,
    ...resolvedRecoveryArtifactAuthority,
  };
  const workflowInput: TemporalStageRunWorkflowInput = {
    ...(effectiveLaunch.stage_run_input as TemporalStageRunWorkflowInput),
    recovery_resume: recoveryResume,
  };
  let terminalRetry: {
    recoveryRunId: string;
    workflowStatus: string;
    observationReceipt?: Record<string, unknown>;
  } | undefined;
  const launchReceipt = record(effectiveLaunch.temporal_start_receipt);
  const persistedRecoveryRun = Array.isArray(launchReceipt.recovery_runs)
    && launchReceipt.recovery_runs.length > 0
    && launchReceipt.recovery_runs[0]
    && typeof launchReceipt.recovery_runs[0] === 'object'
    && !Array.isArray(launchReceipt.recovery_runs[0])
    ? record(launchReceipt.recovery_runs[0])
    : null;
  const persistedRecoveryResume = persistedRecoveryRun
    ? persistedRecoveryRun.recovery_resume as TemporalStageRunWorkflowInput['recovery_resume']
    : null;
  const recoveryResumeChanged = persistedRecoveryResume
    ? canonicalJsonText(persistedRecoveryResume) !== canonicalJsonText(recoveryResume)
    : false;
  if (
    options.retryTerminalRecovery === true
    && persistedRecoveryRun
    && recoveryResumeChanged
  ) {
    if (!options.describeWorkflow) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal recovery retry requires fresh Temporal workflow observation.',
        { failure_code: 'stage_run_recovery_terminal_retry_observation_missing' },
      );
    }
    if (!persistedRecoveryResume) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery resume update requires the prior recovery resume.',
        { failure_code: 'stage_run_recovery_prior_identity_missing' },
      );
    }
    const observed = record(await options.describeWorkflow({
      ...(effectiveLaunch.stage_run_input as TemporalStageRunWorkflowInput),
      recovery_resume: persistedRecoveryResume,
    }));
    const persistedReceipt = record(persistedRecoveryRun.temporal_start_receipt);
    const persistedRunId = typeof persistedReceipt.recovery_run_id === 'string'
      ? persistedReceipt.recovery_run_id.trim()
      : null;
    const observedRunId = requireString(observed.first_execution_run_id, 'workflow_observation.first_execution_run_id');
    const observedStatus = requireString(observed.workflow_status, 'workflow_observation.workflow_status');
    if (
      observed.workflow_found !== true
      || observed.workflow_id !== workflowInput.workflow_id
      || observed.recovery_id !== persistedRecoveryRun.recovery_id
      || (persistedRunId !== null && observedRunId !== persistedRunId)
      || ![
        'COMPLETED',
        'FAILED',
        'CANCELED',
        'CANCELLED',
        'TERMINATED',
        'TIMED_OUT',
      ].includes(observedStatus.toUpperCase())
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun recovery identity replacement requires the prior Temporal Run to be terminal.',
        {
          failure_code: 'stage_run_recovery_terminal_retry_identity_mismatch',
          stage_run_id: input.stageRunId,
          prior_recovery_id: persistedRecoveryRun.recovery_id,
          persisted_recovery_run_id: persistedRunId,
          observed_recovery_id: typeof observed.recovery_id === 'string' ? observed.recovery_id : null,
          observed_recovery_run_id: observedRunId,
          observed_workflow_status: observedStatus,
        },
      );
    }
    terminalRetry = {
      recoveryRunId: observedRunId,
      workflowStatus: observedStatus,
      observationReceipt: observed,
    };
  }
  let claim = claimStageRunRecoveryStart(db, {
    workflowInput,
    now: options.now?.(),
    leaseMs: options.startLeaseMs,
    terminalRetry,
  });
  const baseReceipt = {
    surface_kind: 'opl_stage_run_closeout_recovery',
    version: 'opl-stage-run-closeout-recovery.v2',
    recovery_id: recoveryId,
    stage_run_id: input.stageRunId,
    stage_attempt_id: input.stageAttemptId,
    previous_closeout_id: latestCloseout.closeout_id,
    corrected_closeout_id: ingested.closeout.closeout_id,
    corrected_closeout_idempotent_noop: ingested.closeout.idempotent_noop,
    artifact_refs: identity.artifact_refs,
    artifact_hashes: identity.artifact_hashes,
    artifact_identity_receipt_refs: receiptRefs,
    stage_run_launch_truth: {
      launch_status: effectiveLaunch.launch_status,
      terminal_status: effectiveLaunch.terminal_status,
    },
    quality_cycle_projection: projected,
    formal_review_required: true,
    reviewer_retry_requested: retryReviewer,
    original_reviewer_attempt_preserved: retryReviewer,
    attempt_count_before: beforeCount,
    attempt_count_after_projection: projectionAttemptCount,
    quality_budget_consumed_by_recovery: false,
    new_stage_run_created: false,
    authority_boundary: {
      opl: 'same_stage_run_durable_quality_loop_recovery_only',
      domain: 'formal_review_owner_and_quality_verdict_authority_unchanged',
    },
  };
  if (
    !claim.claimed
    && claim.claim_status === 'started'
    && options.retryTerminalRecovery === true
  ) {
    if (!options.describeWorkflow) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal recovery retry requires fresh Temporal workflow observation.',
        { failure_code: 'stage_run_recovery_terminal_retry_observation_missing' },
      );
    }
    const observed = record(await options.describeWorkflow(workflowInput));
    const persistedRunId = requireString(
      claim.recovery_run.temporal_start_receipt?.recovery_run_id,
      'recovery_run.temporal_start_receipt.recovery_run_id',
    );
    const observedRunId = requireString(observed.first_execution_run_id, 'workflow_observation.first_execution_run_id');
    const observedStatus = requireString(observed.workflow_status, 'workflow_observation.workflow_status');
    if (
      observed.workflow_found !== true
      || observed.workflow_id !== workflowInput.workflow_id
      || observed.recovery_id !== recoveryId
      || observedRunId !== persistedRunId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal recovery retry observation does not match the persisted recovery Run.',
        {
          failure_code: 'stage_run_recovery_terminal_retry_identity_mismatch',
          recovery_id: recoveryId,
          persisted_recovery_run_id: persistedRunId,
          observed_recovery_run_id: observedRunId,
          observed_workflow_status: observedStatus,
        },
      );
    }
    if (![
      'COMPLETED',
      'FAILED',
      'CANCELED',
      'CANCELLED',
      'TERMINATED',
      'TIMED_OUT',
    ].includes(observedStatus.toUpperCase())) {
      return {
        ...baseReceipt,
        recovery_status: 'durable_resume_already_started',
        idempotent_replay: true,
        durable_resume: claim.recovery_run,
        temporal_start: claim.recovery_run.temporal_start_receipt,
        durable_controller_running: observedStatus.toUpperCase().endsWith('RUNNING'),
        formal_review_dispatched: true,
      };
    }
    claim = claimStageRunRecoveryStart(db, {
      workflowInput,
      now: options.now?.(),
      leaseMs: options.startLeaseMs,
      terminalRetry: {
        recoveryRunId: observedRunId,
        workflowStatus: observedStatus,
      },
    });
  }
  if (!claim.claimed || !claim.claim_token) {
    const temporalStart = claim.recovery_run.temporal_start_receipt;
    return {
      ...baseReceipt,
      recovery_status: claim.claim_status === 'started'
        ? 'durable_resume_already_started'
        : 'durable_resume_starting',
      idempotent_replay: true,
      durable_resume: claim.recovery_run,
      temporal_start: temporalStart,
      durable_controller_running: temporalStart
        ? String(temporalStart.workflow_status).toUpperCase().endsWith('RUNNING')
        : false,
      formal_review_dispatched: claim.claim_status === 'started',
    };
  }
  try {
    const temporalStart = await options.startWorkflow(workflowInput);
    const recorded = recordStageRunTemporalRecoveryStart(db, {
      stageRunId: input.stageRunId,
      recoveryId,
      temporalStartReceipt: temporalStart,
      claimToken: claim.claim_token,
      now: options.now?.(),
    });
    const producerAttemptCount = Number((db.prepare(`
      SELECT COUNT(*) AS count FROM stage_attempts
      WHERE stage_run_id = ? AND attempt_role = 'producer'
    `).get(input.stageRunId) as { count: number }).count);
    return {
      ...baseReceipt,
      recovery_status: 'durable_resume_started',
      idempotent_replay: false,
      durable_resume: recorded.recovery_run,
      temporal_start: temporalStart,
      durable_controller_running: String(temporalStart.workflow_status).toUpperCase().endsWith('RUNNING'),
      formal_review_dispatched: true,
      producer_attempt_count: producerAttemptCount,
    };
  } catch (error) {
    recordStageRunRecoveryStartFailure(db, {
      stageRunId: input.stageRunId,
      recoveryId,
      claimToken: claim.claim_token,
      error,
      now: options.now?.(),
    });
    throw error;
  }
}
