import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { executeChild, isCancellation, patched, setHandler, workflowInfo } from '@temporalio/workflow';
import type {
  StageAttemptExecutionContentBinding,
  StageArtifactIdentityAuthorityStatus,
  StageArtifactPendingRepair,
  StageArtifactLiveBytesStatus,
  TemporalStageRunRouteLaunchReceipt,
  TemporalStageRunWorkflowInput,
  TemporalStageRunWorkflowState,
} from './family-runtime-temporal.ts';
import type {
  StageReviewReceipt,
  StageQualityFinding,
  StageQualityRepairMapEntry,
} from '../../authority/stages/public/stage-quality-cycle.ts';
import { stageRunQuery } from './family-runtime-temporal-workflow-controls.ts';
import {
  stageQualityAttemptMaterializeActivity,
  stageQualityAttemptSyncActivity,
  stageQualityCycleProjectActivity,
  stageQualityReviewReceiptActivity,
  stageRunRouteLaunchActivity,
  retryStageRunRouteLaunchActivity,
} from './family-runtime-temporal-workflow-activities.ts';
import {
  activityFailureReason,
  asRecord,
  asRecordList,
  asStringList,
  assertWorkflowAttemptIdentity,
  assertWorkflowExecutionScopeIdentity,
  controllerHardStopFromError,
  executionPolicyForAttempt,
  executionSessionRefFromAttemptState,
  findingClosureList,
  findingList,
  findingPriorities,
  hasConsumableArtifact,
  hasProducedConsumableArtifact,
  nowIso,
  observedAttemptTotalTokens,
  providerRuntimeHardStop,
  qualityArtifactIdentity,
  qualityEnvelopeFromAttempt,
  qualityFailureRef,
  qualityScopeBudgetUsage,
  repairMapList,
  requiredRecordList,
  stageRunQualityCycleId,
  stageRunStopped,
  validateWorkflowStageRunInput,
} from './family-runtime-temporal-workflow-shared.ts';
import {
  artifactIdentityAuthorityFromReviewReceipt,
  artifactIdentityAuthorityWithPendingRepair,
  producerArtifactIdentityAuthority,
  resolveRecoveryArtifactAuthority,
  reviewPendingArtifactIdentityAuthority,
  hasCompleteImmutableArtifactCoverage,
  withLiveArtifactBytesStatus,
} from './family-runtime-temporal-workflow-artifact-authority.ts';
import {
  classifyStageQualityReReviewBudget,
  evaluateStageQualityFindingClosure,
  normalizeStageQualityArtifactIdentity,
  stageQualityAttemptOutcomeFromEnvelope,
  stageReviewVerdictForOutcome,
  validateInitialStageQualityReviewOutcome,
  validateStageQualityReReviewOutcome,
  validateStageQualityReviewHardStopOutcome,
  type StageQualityAttemptRole,
  type StageQualityReReviewResult,
} from '../../authority/stages/public/stage-quality-cycle.ts';
import {
  evaluateStageQualityAttemptRoute,
  isRepairRequiredCrossStageRouteBackDecision,
} from '../../authority/stages/public/stage-quality-route-selection.ts';
import {
  evaluateStageQualityScopeBudget,
  normalizeStageQualityScopeBudget,
} from '../../authority/stages/public/review-evidence-currentness.ts';
import { buildTemporalStageAttemptMemo, buildTemporalStageAttemptSearchAttributes } from './family-runtime-temporal-visibility-payload.ts';
import { StageAttemptWorkflow } from './family-runtime-temporal-stage-attempt-workflow.ts';

export async function StageRunWorkflow(
  input: TemporalStageRunWorkflowInput,
): Promise<TemporalStageRunWorkflowState> {
  const recoveryArtifactAuthorityEnabled = patched(
    'opl-stage-run-recovery-artifact-authority-v1',
  );
  const terminalArtifactObservationEnabled = patched(
    'opl-stage-run-terminal-artifact-observation-v1',
  );
  validateWorkflowStageRunInput(input, {
    recoveryArtifactIdentityAuthorityRequired: recoveryArtifactAuthorityEnabled,
  });
  const runtimeHumanGateClassificationEnabled = patched(
    'opl-stage-run-runtime-human-gate-classification-v1',
  );
  const earlyRepairRouteBackEnabled = patched(
    'opl-stage-run-repair-required-cross-stage-route-back-v1',
  );
  const formalReviewDeclaredArtifactIdentityEnabled = patched(
    'opl-stage-run-formal-review-declared-artifact-identity-v1',
  );
  const recoveryAttemptRunIdentityEnabled = patched(
    'opl-stage-run-recovery-attempt-run-identity-v1',
  );
  const progressFirstHandoffEnabled = patched('opl-stage-run-progress-first-handoff-v1');
  const controllerMissingRouteFallbackEnabled = patched('opl-stage-run-controller-declared-default-progression-v1');
  const reviewProtocolFailureEnabled = patched('opl-stage-run-review-protocol-failure-v1');
  const identityFailureSyncEnabled = patched('opl-stage-run-identity-failure-sync-v1');
  const reviewerIdentityHardStopEnabled = patched('opl-stage-run-reviewer-identity-hard-stop-v1');
  const canonicalArtifactSha256Enabled = patched('opl-stage-run-artifact-sha256-notation-v1');
  const cancellationPropagationEnabled = patched('opl-stage-run-child-cancellation-propagation-v1');
  const qualityScopeBudget = normalizeStageQualityScopeBudget(
    input.quality_policy.formal_review.scope_budget,
    { legacyMaxRepairRounds: input.quality_policy.formal_review.max_repair_rounds },
  );
  const qualityCycleId = stageRunQualityCycleId(input);
  const recoveryResume = input.recovery_resume ?? null;
  const recoveryResumeAfterRole = recoveryResume?.resume_after_role ?? 'producer';
  const recoveryArtifactProducerAttemptRef = recoveryResume?.artifact_producer_attempt_ref
    ?? recoveryResume?.producer_attempt_ref
    ?? null;
  const recoveryArtifactProducerAttemptSummary = recoveryResume?.artifact_producer_attempt_summary
    ?? recoveryResume?.producer_attempt_summary
    ?? null;
  const resolvedRecoveryArtifactAuthority = recoveryArtifactAuthorityEnabled
    && recoveryResume
    ? resolveRecoveryArtifactAuthority(recoveryResume, {
        maxRepairRounds: input.quality_policy.formal_review.max_repair_rounds,
      })
    : null;
  if (
    recoveryArtifactAuthorityEnabled
    && recoveryResume
    && !resolvedRecoveryArtifactAuthority
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovery cannot uniquely reconstruct its canonical Attempt/review artifact lineage.',
      { failure_code: 'stage_run_recovery_previous_reviewed_lineage_invalid' },
    );
  }
  const initialArtifactIdentity = normalizeStageQualityArtifactIdentity({
    artifactRefs: resolvedRecoveryArtifactAuthority?.artifact_refs
      ?? recoveryResume?.artifact_refs ?? input.artifact_refs ?? [],
    artifactHashes: resolvedRecoveryArtifactAuthority?.artifact_hashes
      ?? recoveryResume?.artifact_hashes ?? input.artifact_hashes ?? [],
    allowEmpty: true,
  });
  // New executions always take the resolver's canonical authority. The raw
  // input authority remains only as the pre-B2 (patched=false) replay fallback.
  const initialArtifactIdentityAuthority = recoveryResume
    ? resolvedRecoveryArtifactAuthority?.artifact_identity_authority
      ?? recoveryResume.artifact_identity_authority
      ?? (recoveryArtifactProducerAttemptRef
        ? reviewPendingArtifactIdentityAuthority({
            authoritativeAttemptRef: recoveryArtifactProducerAttemptRef,
            qualityRoundIndex: recoveryResume.repair_rounds_used ?? 0,
          })
        : null)
    : null;
  let state = {
    surface_kind: 'temporal_stage_run_query',
    provider_kind: 'temporal',
    stage_run_id: input.stage_run_id,
    workflow_id: input.workflow_id,
    scope_kind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
    execution_scope: input.execution_scope ?? null,
    quality_cycle_id: qualityCycleId,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    status: 'registered',
    current_role: null,
    repair_rounds_used: recoveryResume?.repair_rounds_used ?? 0,
    max_repair_rounds: input.quality_policy.formal_review.max_repair_rounds,
    route_budget: input.route_budget
      ?? input.stage_run_spec?.route_budget
      ?? { max_route_back_rounds: 3, route_back_rounds_used: 0 },
    quality_scope_budget: qualityScopeBudget,
    quality_scope_budget_usage: {
      attempts_used: 0,
      ...(formalReviewDeclaredArtifactIdentityEnabled ? { managed_attempts_used: 0 } : {}),
      elapsed_ms: 0,
      tokens_used: null,
      token_observation_status: 'missing',
    },
    quality_scope_budget_stop_reason: null,
    attempts: recoveryResume
      ? recoveryResume.prior_attempt_summaries ?? [recoveryArtifactProducerAttemptSummary!]
      : [],
    findings: recoveryResume?.findings ?? [],
    repair_map: recoveryResume?.repair_map ?? [],
    finding_closures: [],
    review_receipts: recoveryResume?.review_receipts ?? [],
    artifact_refs: initialArtifactIdentity.artifact_refs,
    artifact_hashes: initialArtifactIdentity.artifact_hashes,
    artifact_identity_receipt_refs: resolvedRecoveryArtifactAuthority?.artifact_identity_receipt_refs
      ?? recoveryResume?.artifact_identity_receipt_refs
      ?? asStringList(input.artifact_identity_receipt_refs),
    artifact_identity_authority: initialArtifactIdentityAuthority,
    quality_debt_refs: recoveryResume?.quality_debt_refs ?? [],
    route_quality_debt_refs: recoveryResume?.route_quality_debt_refs ?? [],
    decisive_attempt_role: null,
    decisive_attempt_ref: null,
    selected_stage_route: null,
    route_evidence_refs: [],
    route_recommendations: recoveryResume?.route_recommendations ?? [],
    next_stage_run_launch: null,
    blocked_reason: null,
    hard_stop_class: null,
    typed_blocker_refs: [],
    human_gate_refs: [],
    source_attempt_ref: recoveryArtifactProducerAttemptRef,
    sqlite_projection: { status: 'pending', error: null },
    started_at: nowIso(),
    updated_at: nowIso(),
    authority_boundary: {
      opl: 'durable_quality_loop_orchestration_and_refs_transport_only',
      domain: 'review_findings_repair_artifact_and_quality_verdict_owner',
      provider_completion_is_domain_ready: false,
    },
  } as TemporalStageRunWorkflowState;
  if (recoveryResume) {
    state = {
      ...state,
      quality_scope_budget_usage: qualityScopeBudgetUsage(
        state,
        formalReviewDeclaredArtifactIdentityEnabled,
      ),
    };
  }
  let handoffPending = false;
  setHandler(stageRunQuery, () => handoffPending
    ? { ...state, status: 'running' }
    : state);
  const observedSessions = new Set<string>();
  for (const attempt of state.attempts) {
    if (attempt.execution_session_ref) observedSessions.add(attempt.execution_session_ref);
  }
  let decisiveExecutionContentBinding: StageAttemptExecutionContentBinding | null = null;

  const observeAuthoritativeArtifactBytes = async (
    candidate: TemporalStageRunWorkflowState,
  ): Promise<StageArtifactLiveBytesStatus> => {
    if (!candidate.artifact_identity_authority || candidate.artifact_refs.length === 0) {
      return 'unknown';
    }
    try {
      const observation = await stageQualityCycleProjectActivity({
        stage_run: input,
        state: candidate,
        artifact_identity_observation_only: true,
      });
      const liveBytesStatus = asRecord(observation.artifact_identity_observation).live_bytes_status;
      return liveBytesStatus === 'matches' || liveBytesStatus === 'differs'
        ? liveBytesStatus
        : 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const terminalize = async (nextState: TemporalStageRunWorkflowState) => {
    let candidate = nextState;
    if (candidate.artifact_identity_authority) {
      const liveBytesStatus = terminalArtifactObservationEnabled
        ? await observeAuthoritativeArtifactBytes(candidate)
        : 'unknown';
      candidate = {
        ...candidate,
        artifact_identity_authority: withLiveArtifactBytesStatus(
          candidate.artifact_identity_authority,
          liveBytesStatus,
        ),
      };
      if (
        liveBytesStatus === 'differs'
        && !hasCompleteImmutableArtifactCoverage(
          candidate.artifact_identity_authority!,
          candidate.artifact_hashes,
        )
        && (candidate.status === 'completed' || candidate.status === 'completed_with_quality_debt')
      ) {
        candidate = {
          ...candidate,
          status: 'blocked',
          current_role: null,
          blocked_reason: 'accepted_artifact_immutable_snapshot_missing',
          hard_stop_class: 'stale_or_mismatched_stage_identity',
          selected_stage_route: null,
          next_stage_run_launch: null,
          quality_debt_refs: [...new Set([
            ...candidate.quality_debt_refs,
            qualityFailureRef(input, 'stale_or_mismatched_stage_identity'),
            qualityFailureRef(input, 'accepted_artifact_immutable_snapshot_missing'),
          ])],
          updated_at: nowIso(),
        };
      }
    }
    if (
      candidate.artifact_identity_authority?.pending_repair
      && !candidate.quality_debt_refs.some((ref) => ref.includes('/repair_artifact_unreviewed'))
    ) {
      candidate = {
        ...candidate,
        quality_debt_refs: [...new Set([
          ...candidate.quality_debt_refs,
          qualityFailureRef(input, 'repair_artifact_unreviewed'),
        ])],
      };
    }
    const routeDecisionRequired = candidate.status === 'completed'
      || candidate.status === 'completed_with_quality_debt';
    state = routeDecisionRequired && !candidate.selected_stage_route
      ? {
          ...candidate,
          route_quality_debt_refs: [...new Set([
            ...candidate.route_quality_debt_refs,
            qualityFailureRef(input, 'decisive_attempt_route_decision_missing'),
          ])],
        }
      : candidate;
    if (
      routeDecisionRequired
      && state.selected_stage_route
      && state.decisive_attempt_ref
      && decisiveExecutionContentBinding
      && !state.artifact_identity_authority?.pending_repair
      && (!progressFirstHandoffEnabled || !state.next_stage_run_launch)
    ) {
      // A consumer must not see a terminal StageRun before its handoff is available.
      handoffPending = progressFirstHandoffEnabled;
      let nextStageRunLaunch: TemporalStageRunRouteLaunchReceipt | null = null;
      try {
        const launchRoute = progressFirstHandoffEnabled
          ? retryStageRunRouteLaunchActivity : stageRunRouteLaunchActivity;
        nextStageRunLaunch = await launchRoute({
          parent_stage_run: input,
          decisive_attempt_ref: state.decisive_attempt_ref,
          decisive_execution_content_binding: decisiveExecutionContentBinding,
          decision: state.selected_stage_route,
          artifact_refs: state.artifact_refs,
          artifact_hashes: state.artifact_hashes,
          artifact_identity_receipt_refs: state.artifact_identity_receipt_refs,
        });
      } catch (error) {
        if (!progressFirstHandoffEnabled) throw error;
        state = {
          ...state,
          status: 'failed',
          blocked_reason: `stage_route_handoff_failed:${activityFailureReason(error)}`,
          route_quality_debt_refs: [...new Set([
            ...state.route_quality_debt_refs,
            qualityFailureRef(input, `stage-route-handoff:${activityFailureReason(error)}`),
          ])],
        };
      } finally {
        handoffPending = false;
      }
      if (nextStageRunLaunch) state = {
        ...state,
        next_stage_run_launch: nextStageRunLaunch,
        route_quality_debt_refs: nextStageRunLaunch.materialization_status === 'route_budget_exhausted'
          ? [...new Set([
              ...state.route_quality_debt_refs,
              qualityFailureRef(input, 'cross-stage-route-back-budget-exhausted'),
            ])]
          : state.route_quality_debt_refs,
        updated_at: nowIso(),
      };
    }
    try {
      await stageQualityCycleProjectActivity({ stage_run: input, state });
      state = { ...state, sqlite_projection: { status: 'synced', error: null } };
    } catch (error) {
      state = {
        ...state,
        sqlite_projection: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
    return state;
  };

  const applyReviewStop = (
    hardStop: ReturnType<typeof validateStageQualityReviewHardStopOutcome>,
    sourceAttemptRef: string,
  ) => {
    state = {
      ...state,
      status: hardStop.outcome,
      current_role: null,
      blocked_reason: hardStop.blocked_reason,
      hard_stop_class: hardStop.hard_stop_class,
      typed_blocker_refs: hardStop.typed_blocker_refs,
      human_gate_refs: hardStop.human_gate_refs,
      source_attempt_ref: sourceAttemptRef,
      updated_at: nowIso(),
    };
  };

  const runAttempt = async (attemptInput: {
    role: StageQualityAttemptRole;
    round: number;
    parentAttemptRef?: string | null;
    artifactProducerAttemptRef?: string | null;
    artifactRefs: string[];
    artifactHashes: string[];
    artifactIdentityReceiptRefs: string[];
    findings?: StageQualityFinding[];
    repairMap?: StageQualityRepairMapEntry[];
    reviewInputSnapshotMaterializationRequest?: unknown;
    revisionIntakeRefs?: Array<Record<string, unknown>>;
    oplStageReviewReceiptRef?: Record<string, unknown> | null;
  }) => {
    state = { ...state, status: 'running', current_role: attemptInput.role, updated_at: nowIso() };
    const materialized = await stageQualityAttemptMaterializeActivity({
      stage_run: input,
      stage_run_workflow_run_id: recoveryResume && recoveryAttemptRunIdentityEnabled
        ? workflowInfo().runId
        : null,
      quality_cycle_id: qualityCycleId,
      attempt_role: attemptInput.role,
      quality_round_index: attemptInput.round,
      parent_attempt_ref: attemptInput.parentAttemptRef,
      artifact_producer_attempt_ref: attemptInput.artifactProducerAttemptRef,
      artifact_refs: attemptInput.artifactRefs,
      artifact_hashes: attemptInput.artifactHashes,
      artifact_identity_receipt_refs: attemptInput.artifactIdentityReceiptRefs,
      findings: attemptInput.findings,
      repair_map: attemptInput.repairMap,
      route_recommendations: state.route_recommendations,
      review_input_snapshot_materialization_request:
        attemptInput.reviewInputSnapshotMaterializationRequest,
      revision_intake_refs: attemptInput.revisionIntakeRefs,
      opl_stage_review_receipt_ref: attemptInput.oplStageReviewReceiptRef,
    });
    const childInput = materialized.workflow_input;
    assertWorkflowExecutionScopeIdentity({
      expected: input,
      actual: childInput,
      operation: 'stage_run_materialized_child_attempt',
    });
    const childContextManifest = asRecord(asRecord(childInput.quality_context).context_manifest);
    const reviewInputSnapshotQualityDebtRef = typeof childContextManifest
      .review_input_snapshot_quality_debt_receipt_ref === 'string'
      ? childContextManifest.review_input_snapshot_quality_debt_receipt_ref
      : null;
    const allowLegacyUnboundExecutionPolicy = !childInput.execution_content_binding
      && !patched('opl-stage-run-controller-attempt-content-binding-v1');
    const executionPolicy = allowLegacyUnboundExecutionPolicy
      ? {
          binding: null,
          formalReviewRequired: input.quality_policy.formal_review.required,
          maxRepairRounds: input.quality_policy.formal_review.max_repair_rounds,
          rubricRefs: input.quality_rubric_refs,
          declaredStageIds: input.declared_stage_ids,
        }
      : executionPolicyForAttempt(childInput);
    state = {
      ...state,
      max_repair_rounds: executionPolicy.maxRepairRounds,
      updated_at: nowIso(),
    };
    const result = await executeChild(StageAttemptWorkflow, {
      args: [childInput],
      workflowId: childInput.workflow_id,
      staticSummary: childInput.execution_scope?.domain_work_item_id
        ? `${childInput.execution_scope.domain_work_item_id} / ${childInput.stage_id} / ${childInput.stage_attempt_id}`
        : `OPL ${childInput.stage_id} / ${childInput.stage_attempt_id}`,
      staticDetails: [
        ...(childInput.execution_scope?.domain_work_item_id
          ? [`Work item: ${childInput.execution_scope.domain_work_item_id}`]
          : []),
        `Stage: ${childInput.stage_id}`,
        `Attempt: ${childInput.stage_attempt_id}`,
        `StageRun: ${childInput.stage_run_id ?? 'none'}`,
        `Domain: ${childInput.domain_id}`,
      ].join('\n'),
      memo: buildTemporalStageAttemptMemo(childInput),
      ...(childInput.visibility_search_attributes_upsert_enabled === true
        ? { searchAttributes: buildTemporalStageAttemptSearchAttributes(childInput) }
        : {}),
    });
    assertWorkflowAttemptIdentity({ expected: childInput, actual: result });
    if (!progressFirstHandoffEnabled) {
      await stageQualityAttemptSyncActivity({
        attempt_ref: materialized.attempt_ref,
        workflow_state: result,
      });
    }
    const reviewRole = attemptInput.role === 'reviewer' || attemptInput.role === 're_reviewer';
    const executionSessionRef = executionSessionRefFromAttemptState(result);
    if (result.status === 'completed') {
      if (!executionSessionRef) {
        throw new Error(`Completed Stage quality ${attemptInput.role} Attempt did not expose an execution session identity.`);
      }
      if (observedSessions.has(executionSessionRef)) {
        throw new Error(`Completed Stage quality Attempt reused provider session ${executionSessionRef}.`);
      }
      observedSessions.add(executionSessionRef);
    }
    const envelope = qualityEnvelopeFromAttempt(result);
    const missingReviewOutcome = reviewProtocolFailureEnabled && reviewRole
      && result.status === 'completed' && !Object.hasOwn(envelope, 'verdict')
      && typeof envelope.outcome !== 'string';
    const outcome = result.status === 'completed' && !missingReviewOutcome
      ? stageQualityAttemptOutcomeFromEnvelope({ attemptRole: attemptInput.role, envelope })
      : null;
    const rawProgress = progressFirstHandoffEnabled
      && asRecord(asRecord(result.closeout_packet).authority_boundary).opl
        === 'raw_executor_output_progress_envelope_only';
    const attemptReturnedArtifactIdentity = asStringList(envelope.artifact_refs).length > 0
      || (rawProgress && asRecordList(asRecord(result.closeout_packet).closeout_ref_metadata)
        .some((entry) => entry.ref_kind === 'raw_executor_output'));
    let artifactIdentity: {
      artifactRefs: string[];
      artifactHashes: string[];
      artifactIdentityReceiptRefs: string[];
    };
    try {
      artifactIdentity = (result.status === 'completed' && !missingReviewOutcome) || (!reviewRole && attemptReturnedArtifactIdentity)
        ? qualityArtifactIdentity(
          result,
          envelope,
          formalReviewDeclaredArtifactIdentityEnabled && !progressFirstHandoffEnabled,
          reviewRole
              ? {
                  artifactRefs: attemptInput.artifactRefs,
                  artifactHashes: attemptInput.artifactHashes,
                  artifactIdentityReceiptRefs: attemptInput.artifactIdentityReceiptRefs,
                }
              : undefined,
          reviewerIdentityHardStopEnabled,
          canonicalArtifactSha256Enabled,
          )
        : {
            artifactRefs: attemptInput.artifactRefs,
            artifactHashes: attemptInput.artifactHashes,
            artifactIdentityReceiptRefs: attemptInput.artifactIdentityReceiptRefs,
          };
    } catch (error) {
      if (!formalReviewDeclaredArtifactIdentityEnabled) throw error;
      if (progressFirstHandoffEnabled && identityFailureSyncEnabled) {
        try {
          await stageQualityAttemptSyncActivity({
            attempt_ref: materialized.attempt_ref,
            workflow_state: result,
          });
        } catch (syncError) {
          if (!reviewerIdentityHardStopEnabled || !controllerHardStopFromError(error)) throw syncError;
          state = {
            ...state,
            quality_debt_refs: [...new Set([
              ...state.quality_debt_refs,
              qualityFailureRef(input, `attempt-sync:${activityFailureReason(syncError)}`),
            ])],
          };
        }
      }
      state = {
        ...state,
        attempts: [...state.attempts, {
          attempt_role: attemptInput.role,
          quality_round_index: attemptInput.round,
          stage_attempt_id: childInput.stage_attempt_id,
          workflow_id: childInput.workflow_id,
          execution_session_ref: executionSessionRef,
          artifact_producer_attempt_ref: attemptInput.artifactProducerAttemptRef ?? null,
          status: result.status,
          artifact_refs: [],
          artifact_hashes: [],
          artifact_identity_receipt_refs: [],
          total_tokens_observed: observedAttemptTotalTokens(result),
        }],
        updated_at: nowIso(),
      };
      state = {
        ...state,
        quality_scope_budget_usage: qualityScopeBudgetUsage(
          state,
          formalReviewDeclaredArtifactIdentityEnabled,
        ),
      };
      throw error;
    }
    const routeImpact = asRecord(asRecord(result.closeout_packet).route_impact);
    const routeEvaluation = evaluateStageQualityAttemptRoute({
      attempt: childInput as unknown as Record<string, unknown>,
      routeImpact,
    });
    const routeRejectionReasons = [
      ...routeEvaluation.decision_rejection_reasons,
      ...routeEvaluation.recommendation_rejection_reasons,
    ];
    state = {
      ...state,
      attempts: [...state.attempts, {
        attempt_role: attemptInput.role,
        quality_round_index: attemptInput.round,
        stage_attempt_id: childInput.stage_attempt_id,
        workflow_id: childInput.workflow_id,
        execution_session_ref: executionSessionRef,
        artifact_producer_attempt_ref: attemptInput.artifactProducerAttemptRef ?? null,
        status: result.status,
        artifact_refs: artifactIdentity.artifactRefs,
        artifact_hashes: artifactIdentity.artifactHashes,
        artifact_identity_receipt_refs: artifactIdentity.artifactIdentityReceiptRefs,
        total_tokens_observed: observedAttemptTotalTokens(result),
      }],
      // A producer establishes the first candidate set. Repairer and review
      // Attempts never switch StageRun authority by writing bytes: a repairer
      // set stays pending until a fresh re-review accepts it.
      artifact_refs: attemptInput.role === 'producer' ? artifactIdentity.artifactRefs : state.artifact_refs,
      artifact_hashes: attemptInput.role === 'producer' ? artifactIdentity.artifactHashes : state.artifact_hashes,
      artifact_identity_receipt_refs: attemptInput.role === 'producer'
        ? artifactIdentity.artifactIdentityReceiptRefs
        : state.artifact_identity_receipt_refs,
      route_quality_debt_refs: [
        ...new Set([
          ...state.route_quality_debt_refs,
          ...routeRejectionReasons.map((reason) => qualityFailureRef(input, `route-output:${reason}`)),
        ]),
      ],
      quality_debt_refs: rawProgress
        ? [...new Set([...state.quality_debt_refs, qualityFailureRef(input, 'raw-artifact-requires-domain-review')])]
        : state.quality_debt_refs,
      route_recommendations: routeEvaluation.recommendation
        ? [...state.route_recommendations, {
            attempt_ref: materialized.attempt_ref,
            attempt_role: attemptInput.role,
            quality_round_index: attemptInput.round,
            recommendation: routeEvaluation.recommendation,
          }]
        : state.route_recommendations,
      updated_at: nowIso(),
    };
    state = {
      ...state,
      quality_scope_budget_usage: qualityScopeBudgetUsage(
        state,
        formalReviewDeclaredArtifactIdentityEnabled,
      ),
    };
    if (progressFirstHandoffEnabled) {
      try {
        await stageQualityAttemptSyncActivity({
          attempt_ref: materialized.attempt_ref,
          workflow_state: result,
        });
      } catch (error) {
        if (controllerHardStopFromError(error)) throw error;
        state = {
          ...state,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            qualityFailureRef(input, `attempt-sync:${activityFailureReason(error)}`),
          ])],
        };
      }
    }
    if (missingReviewOutcome) {
      state = {
        ...state, status: 'blocked', current_role: null,
        blocked_reason: 'stage_quality_review_outcome_missing',
        source_attempt_ref: materialized.attempt_ref,
      };
    } else if (result.status === 'human_gate') {
      state = {
        ...state,
        status: 'human_gate',
        current_role: null,
        blocked_reason: 'human_gate',
        hard_stop_class: 'human_decision_required',
        human_gate_refs: asStringList(result.human_gate_refs),
        source_attempt_ref: materialized.attempt_ref,
      };
    } else if (result.status === 'blocked' || result.status === 'failed') {
      const closeout = asRecord(result.closeout_packet);
      const reason = typeof envelope.blocked_reason === 'string'
        ? envelope.blocked_reason
        : typeof closeout.blocked_reason === 'string'
          ? closeout.blocked_reason
        : `stage_quality_${attemptInput.role}_not_completed`;
      const runtimeHardStop = providerRuntimeHardStop(result);
      const recoverableAttemptCanContinue = hasConsumableArtifact(state)
        && !runtimeHardStop
        && (
          (attemptInput.role === 'producer' && executionPolicy.formalReviewRequired)
          || attemptInput.role === 'repairer'
          || (attemptInput.role === 're_reviewer'
            && Boolean(state.artifact_identity_authority?.pending_repair))
        );
      state = recoverableAttemptCanContinue
        ? {
            ...state,
            status: 'running',
            current_role: null,
            blocked_reason: null,
          }
        : hasConsumableArtifact(state) && !runtimeHardStop && !(reviewProtocolFailureEnabled && reviewRole)
          ? {
            ...state,
            status: 'completed_with_quality_debt',
            current_role: null,
            quality_debt_refs: [...new Set([...state.quality_debt_refs, qualityFailureRef(input, reason)])],
            blocked_reason: null,
          }
          : {
            ...state,
            status: runtimeHumanGateClassificationEnabled
              && runtimeHardStop?.hard_stop_class === 'human_decision_required'
              ? 'human_gate'
              : 'blocked',
            current_role: null,
            blocked_reason: reason,
            hard_stop_class: runtimeHardStop?.hard_stop_class ?? (
              hasConsumableArtifact(state) ? null : 'zero_consumable_artifact'
            ),
            typed_blocker_refs: runtimeHardStop?.typed_blocker_refs ?? [],
            human_gate_refs: runtimeHardStop?.human_gate_refs ?? [],
            source_attempt_ref: materialized.attempt_ref,
          };
    }
    return {
      result,
      envelope,
      outcome,
      artifactProducedByAttempt: !reviewRole && attemptReturnedArtifactIdentity,
      attemptRole: attemptInput.role,
      attemptRef: materialized.attempt_ref,
      executionSessionRef,
      routeEvaluation,
      executionPolicy,
      defaultProgression: asRecord(asRecord(childContextManifest.cross_stage_route_selection).controller_default_progression),
      reviewInputSnapshotQualityDebtRef,
      reviewedArtifactRefs: attemptInput.artifactRefs,
      reviewedArtifactHashes: attemptInput.artifactHashes,
      artifactIdentity,
    };
  };

  const setProducerArtifactAuthority = (attemptRef: string, qualityRoundIndex = 0) => {
    state = {
      ...state,
      artifact_identity_authority: producerArtifactIdentityAuthority({
        attemptRef,
        qualityRoundIndex,
      }),
    };
  };

  const setReviewPendingArtifactAuthority = (attemptRef: string, qualityRoundIndex = 0) => {
    state = {
      ...state,
      artifact_identity_authority: reviewPendingArtifactIdentityAuthority({
        authoritativeAttemptRef: attemptRef,
        qualityRoundIndex,
      }),
    };
  };

  const commitReviewedArtifactAuthority = (
    attempt: Awaited<ReturnType<typeof runAttempt>>,
    receipt: StageReviewReceipt,
    status: StageArtifactIdentityAuthorityStatus,
    qualityRoundIndex: number,
  ) => {
    state = {
      ...state,
      artifact_refs: attempt.reviewedArtifactRefs,
      artifact_hashes: attempt.reviewedArtifactHashes,
      artifact_identity_receipt_refs: attempt.artifactIdentity.artifactIdentityReceiptRefs,
      artifact_identity_authority: artifactIdentityAuthorityFromReviewReceipt({
        receipt,
        status,
        qualityRoundIndex,
      }),
    };
  };

  const setPendingRepairArtifactAuthority = (
    attempt: Awaited<ReturnType<typeof runAttempt>>,
    qualityRoundIndex: number,
    disposition: StageArtifactPendingRepair['disposition'],
  ) => {
    const pendingRepair: StageArtifactPendingRepair = {
      attempt_ref: attempt.attemptRef,
      quality_round_index: qualityRoundIndex,
      artifact_refs: attempt.artifactIdentity.artifactRefs,
      artifact_hashes: attempt.artifactIdentity.artifactHashes,
      artifact_identity_receipt_refs: attempt.artifactIdentity.artifactIdentityReceiptRefs,
      disposition,
    };
    state = {
      ...state,
      artifact_identity_authority: artifactIdentityAuthorityWithPendingRepair(
        state.artifact_identity_authority,
        pendingRepair,
        state.source_attempt_ref,
      ),
    };
  };

  const updatePendingRepairDisposition = (
    disposition: StageArtifactPendingRepair['disposition'],
  ) => {
    const authority = state.artifact_identity_authority;
    if (!authority?.pending_repair) return;
    state = {
      ...state,
      artifact_identity_authority: {
        ...authority,
        pending_repair: { ...authority.pending_repair, disposition },
      },
    };
  };

  const revisionTransportFromReceipt = (receipt: StageReviewReceipt) => {
    const transport = asRecord(receipt.revision_transport);
    const revisionIntakeRef = asRecord(transport.opl_revision_intake_ref);
    const stageReviewReceiptRef = asRecord(transport.opl_stage_review_receipt_ref);
    if (
      transport.surface_kind !== 'opl_revision_transport'
      || revisionIntakeRef.kind !== 'opl_revision_intake'
      || stageReviewReceiptRef.kind !== 'opl_stage_review_receipt'
    ) {
      state = {
        ...state,
        quality_debt_refs: [...new Set([
          ...state.quality_debt_refs,
          qualityFailureRef(input, 'revision-intake-binding-required'),
        ])],
      };
      return null;
    }
    return {
      revisionIntakeRefs: [revisionIntakeRef],
      oplStageReviewReceiptRef: stageReviewReceiptRef,
    };
  };

  const commitTerminalRouteDecision = (attempt: Awaited<ReturnType<typeof runAttempt>>) => {
    if (state.artifact_identity_authority?.pending_repair) {
      // A repairer output, or a re-review that did not complete, cannot submit
      // a route. The pending set is not selected/next-launch input.
      state = {
        ...state,
        route_quality_debt_refs: [...new Set([
          ...state.route_quality_debt_refs,
          qualityFailureRef(input, 'route_decision_requires_reviewed_artifact_identity'),
        ])],
      };
      return false;
    }
    let decision = attempt.routeEvaluation.decision;
    let fallbackApplied = false;
    if (!decision && controllerMissingRouteFallbackEnabled) {
      const closeout = asRecord(attempt.result.closeout_packet);
      const routeImpact = asRecord(closeout.route_impact);
      const progression = attempt.defaultProgression;
      const declaredStageIds = attempt.executionPolicy.binding?.declared_stage_ids ?? [];
      const targetStageId = typeof progression.target_stage_id === 'string'
        ? progression.target_stage_id : null;
      if (
        attempt.attemptRole === 'producer'
        && !attempt.executionPolicy.formalReviewRequired
        && attempt.result.status === 'completed'
        && !providerRuntimeHardStop(attempt.result)
        && attempt.artifactProducedByAttempt
        && hasConsumableArtifact(state)
        && asRecord(closeout.authority_boundary).opl === 'raw_executor_output_progress_envelope_only'
        && routeImpact.framework_generated_envelope === true
        && asStringList(routeImpact.normalization_findings)
          .includes('typed_closeout_not_required_raw_artifact_advanced')
        && !Object.hasOwn(routeImpact, 'stage_route_decision')
        && !Object.hasOwn(routeImpact, 'stage_route_recommendation')
        && !Object.hasOwn(routeImpact, 'stage_route_contract')
        && attempt.routeEvaluation.decision_rejection_reasons.length === 0
        && attempt.routeEvaluation.recommendation_rejection_reasons.length === 0
        && typeof progression.source_ref === 'string'
        && /^sha256:[a-f0-9]{64}$/.test(String(progression.source_sha256))
        && (
          (progression.decision_kind === 'advance' && targetStageId && declaredStageIds.includes(targetStageId))
          || (progression.decision_kind === 'complete' && !targetStageId)
        )
      ) {
        decision = {
          decision_kind: progression.decision_kind as 'advance' | 'complete',
          ...(targetStageId ? { target_stage_id: targetStageId } : {}),
          evidence_refs: [...new Set([...state.artifact_refs, progression.source_ref])],
        };
        fallbackApplied = true;
      }
    }
    if (!decision) return false;
    decisiveExecutionContentBinding = attempt.executionPolicy.binding;
    state = {
      ...state,
      decisive_attempt_role: attempt.attemptRole,
      decisive_attempt_ref: attempt.attemptRef,
      selected_stage_route: decision,
      route_evidence_refs: decision.evidence_refs,
      route_quality_debt_refs: fallbackApplied
        ? [...new Set([...state.route_quality_debt_refs,
            qualityFailureRef(input, 'controller_missing_route_fallback_applied')])]
        : state.route_quality_debt_refs,
      updated_at: nowIso(),
    };
    return fallbackApplied;
  };

  const isEarlyRepairRouteBack = (attempt: Awaited<ReturnType<typeof runAttempt>>) => (
    earlyRepairRouteBackEnabled
    && isRepairRequiredCrossStageRouteBackDecision({
      attemptRole: attempt.attemptRole,
      outcome: attempt.outcome,
      currentStageId: input.stage_id,
      decision: attempt.routeEvaluation.decision,
    })
  );

  const terminalizeEarlyRepairRouteBack = (
    attempt: Awaited<ReturnType<typeof runAttempt>>,
    openFindings: StageQualityFinding[],
  ) => {
    if (!hasConsumableArtifact(state)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage quality cross-Stage repair route-back requires a consumable artifact.',
        {
          hard_stop_class: 'zero_consumable_artifact',
          blocked_reason: 'stage_quality_route_back_without_consumable_artifact',
          source_attempt_ref: attempt.attemptRef,
        },
      );
    }
    commitTerminalRouteDecision(attempt);
    return terminalize({
      ...state,
      status: 'completed_with_quality_debt',
      current_role: null,
      quality_debt_refs: [...new Set([
        ...state.quality_debt_refs,
        ...openFindings.map((finding) => `quality-debt:${finding.finding_id}`),
      ])],
      updated_at: nowIso(),
    });
  };

  const terminalizeScopeBudgetIfNeeded = async (inputBudget: {
    sourceAttemptRef: string;
    findings: StageQualityFinding[];
    includeAttemptLimit: boolean;
  }) => {
    const usage = state.quality_scope_budget_usage ?? {
      attempts_used: state.repair_rounds_used,
      ...(formalReviewDeclaredArtifactIdentityEnabled
        ? { managed_attempts_used: state.attempts.length }
        : {}),
      elapsed_ms: 0,
      tokens_used: null,
      token_observation_status: 'missing' as const,
    };
    const evaluation = evaluateStageQualityScopeBudget({
      budget: state.quality_scope_budget ?? qualityScopeBudget,
      usage,
      openFindingPriorities: findingPriorities(inputBudget.findings),
      hasConsumableArtifact: hasConsumableArtifact(state),
    });
    const exhaustedReasons = inputBudget.includeAttemptLimit
      ? evaluation.exhausted_reasons
      : evaluation.exhausted_reasons.filter((reason) => reason !== 'max_attempts_exhausted');
    if (exhaustedReasons.length === 0) return null;
    const stopReason = exhaustedReasons[0]!;
    const budgetRef = qualityFailureRef(input, `scope-budget-${stopReason}`);
    state = {
      ...state,
      quality_scope_budget_stop_reason: stopReason,
      quality_debt_refs: [...new Set([
        ...state.quality_debt_refs,
        ...inputBudget.findings.map((finding) => `quality-debt:${finding.finding_id}`),
        ...(evaluation.disposition === 'complete_with_quality_debt' ? [budgetRef] : []),
      ])],
      updated_at: nowIso(),
    };
    if (evaluation.disposition === 'hard_stop_no_consumable_artifact') {
      return terminalize({
        ...state,
        status: 'blocked',
        current_role: null,
        blocked_reason: 'stage_quality_scope_budget_exhausted_without_consumable_artifact',
        hard_stop_class: 'zero_consumable_artifact',
        typed_blocker_refs: [budgetRef],
        source_attempt_ref: inputBudget.sourceAttemptRef,
      });
    }
    return terminalize({
      ...state,
      status: 'completed_with_quality_debt',
      current_role: null,
      quality_debt_refs: [...new Set([...state.quality_debt_refs, budgetRef])],
      source_attempt_ref: inputBudget.sourceAttemptRef,
      updated_at: nowIso(),
    });
  };

  try {
    let parentAttemptRef: string | null = null;
    let currentArtifactProducerAttemptRef: string | null = null;
    let reviewInputSnapshotMaterializationRequest: unknown = null;
    let findings: StageQualityFinding[] = [];
    let currentRevisionTransport: ReturnType<typeof revisionTransportFromReceipt> = null;
    let firstRepairRound = 1;
    if (recoveryResume) {
      parentAttemptRef = recoveryArtifactProducerAttemptRef;
      currentArtifactProducerAttemptRef = recoveryArtifactProducerAttemptRef;
      reviewInputSnapshotMaterializationRequest =
        recoveryResume.review_input_snapshot_materialization_request ?? null;
    } else {
      const producer = await runAttempt({
        role: 'producer',
        round: 0,
        artifactRefs: state.artifact_refs,
        artifactHashes: state.artifact_hashes,
        artifactIdentityReceiptRefs: state.artifact_identity_receipt_refs,
      });
      setProducerArtifactAuthority(producer.attemptRef);
      parentAttemptRef = producer.attemptRef;
      currentArtifactProducerAttemptRef = producer.attemptRef;
      reviewInputSnapshotMaterializationRequest =
        producer.envelope.review_input_snapshot_materialization_request;
      if (stageRunStopped(state)) {
        if (!producer.executionPolicy.formalReviewRequired && state.status === 'completed_with_quality_debt') {
          commitTerminalRouteDecision(producer);
        }
        return terminalize(state);
      }
      if (!producer.executionPolicy.formalReviewRequired) {
        const fallbackApplied = commitTerminalRouteDecision(producer);
        return terminalize({
          ...state,
          status: fallbackApplied ? 'completed_with_quality_debt' : 'completed',
          current_role: null,
          updated_at: nowIso(),
        });
      }
    }

    const producerAttemptRef = currentArtifactProducerAttemptRef!;
    if (recoveryResume && recoveryResumeAfterRole === 'repairer') {
      const recoveredRepairAttemptRef = currentArtifactProducerAttemptRef!;
      const repairMap = repairMapList(recoveryResume.repair_map, state.findings);
      const pendingRepairIdentity = state.artifact_identity_authority?.pending_repair;
      const reReview = await runAttempt({
        role: 're_reviewer',
        round: recoveryResume.repair_rounds_used!,
        parentAttemptRef,
        artifactProducerAttemptRef: recoveredRepairAttemptRef,
        artifactRefs: pendingRepairIdentity?.artifact_refs ?? state.artifact_refs,
        artifactHashes: pendingRepairIdentity?.artifact_hashes ?? state.artifact_hashes,
        artifactIdentityReceiptRefs:
          pendingRepairIdentity?.artifact_identity_receipt_refs ?? state.artifact_identity_receipt_refs,
        findings: state.findings,
        repairMap,
        reviewInputSnapshotMaterializationRequest,
        ...revisionTransportFromReceipt(state.review_receipts.at(-1)!) ?? {},
      });
      state = { ...state, repair_map: repairMap };
      if (stageRunStopped(state)) return terminalize(state);
      const reReviewOutcome = reReview.outcome;
      if (!reReviewOutcome) {
        throw new Error('Completed recovered Re-review Attempt did not expose a canonical quality outcome.');
      }
      if (reReviewOutcome === 'blocked' || reReviewOutcome === 'human_gate') {
        const hardStop = validateStageQualityReviewHardStopOutcome({
          outcome: reReviewOutcome,
          envelope: reReview.envelope,
        });
        applyReviewStop(hardStop, reReview.attemptRef);
        const hardStopReceipt = await stageQualityReviewReceiptActivity({
          producer_attempt_ref: recoveredRepairAttemptRef,
          reviewer_attempt_ref: reReview.attemptRef,
          rubric_refs: reReview.executionPolicy.rubricRefs,
          verdict: stageReviewVerdictForOutcome(reReviewOutcome),
        });
        state = {
          ...state,
          review_receipts: [...state.review_receipts, hardStopReceipt],
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            ...(reReview.reviewInputSnapshotQualityDebtRef
              ? [reReview.reviewInputSnapshotQualityDebtRef]
              : []),
          ])],
        };
        commitReviewedArtifactAuthority(
          reReview,
          hardStopReceipt,
          'hard_stopped',
          recoveryResume.repair_rounds_used!,
        );
        return terminalize(state);
      }
      const reReviewResult: StageQualityReReviewResult = {
        finding_closures: findingClosureList(reReview.envelope.finding_closures),
        repair_regressions: findingList(reReview.envelope.repair_regressions, 'repair_regressions'),
        critical_new_findings: findingList(reReview.envelope.critical_new_findings, 'critical_new_findings'),
        optional_observations: requiredRecordList(
          reReview.envelope.optional_observations,
          'optional_observations',
        ) as StageQualityReReviewResult['optional_observations'],
      };
      const closure = evaluateStageQualityFindingClosure({
        findings: state.findings,
        repairMap,
        reReview: reReviewResult,
      });
      validateStageQualityReReviewOutcome({ outcome: reReviewOutcome, closure });
      const reReviewReceipt = await stageQualityReviewReceiptActivity({
        producer_attempt_ref: recoveredRepairAttemptRef,
        reviewer_attempt_ref: reReview.attemptRef,
        rubric_refs: reReview.executionPolicy.rubricRefs,
        verdict: stageReviewVerdictForOutcome(reReviewOutcome),
      });
      state = {
        ...state,
        finding_closures: reReviewResult.finding_closures,
        review_receipts: [...state.review_receipts, reReviewReceipt],
        quality_debt_refs: [...new Set([
          ...state.quality_debt_refs,
          ...(reReview.reviewInputSnapshotQualityDebtRef
            ? [reReview.reviewInputSnapshotQualityDebtRef]
            : []),
        ])],
      };
      commitReviewedArtifactAuthority(
        reReview,
        reReviewReceipt,
        reReviewOutcome === 'pass'
          ? 'accepted_by_re_review'
          : reReviewOutcome === 'quality_debt'
            ? 'reviewed_with_quality_debt'
            : 'reviewed_with_open_findings',
        recoveryResume.repair_rounds_used!,
      );
      if (reReviewOutcome === 'pass') {
        commitTerminalRouteDecision(reReview);
        return terminalize({
          ...state,
          status: reReview.reviewInputSnapshotQualityDebtRef
            ? 'completed_with_quality_debt'
            : 'completed',
          current_role: null,
          updated_at: nowIso(),
        });
      }
      if (reReviewOutcome === 'quality_debt') {
        commitTerminalRouteDecision(reReview);
        return terminalize({
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            ...asStringList(reReview.envelope.quality_debt_refs),
            qualityFailureRef(input, 'recovered-re-review-quality-debt'),
          ])],
          updated_at: nowIso(),
        });
      }
      const openIds = new Set(closure.open_required_finding_ids);
      findings = [
        ...state.findings.filter((finding) => openIds.has(finding.finding_id)),
        ...reReviewResult.repair_regressions,
        ...reReviewResult.critical_new_findings,
      ];
      state = {
        ...state,
        findings,
        repair_rounds_used: recoveryResume.repair_rounds_used!,
      };
      currentRevisionTransport = revisionTransportFromReceipt(reReviewReceipt);
      if (progressFirstHandoffEnabled) commitTerminalRouteDecision(reReview);
      const reReviewBudgetTerminal = await terminalizeScopeBudgetIfNeeded({
        sourceAttemptRef: reReview.attemptRef,
        findings,
        includeAttemptLimit: true,
      });
      if (reReviewBudgetTerminal) return reReviewBudgetTerminal;
      if (isEarlyRepairRouteBack(reReview)) {
        return terminalizeEarlyRepairRouteBack(reReview, findings);
      }
      const budgetDisposition = classifyStageQualityReReviewBudget({
        closure,
        qualityRoundIndex: recoveryResume.repair_rounds_used!,
        maxRepairRounds: reReview.executionPolicy.maxRepairRounds,
      });
      if (budgetDisposition === 'terminal_quality_debt') {
        if (!hasConsumableArtifact(state)) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Stage quality repair budget exhausted without a consumable artifact.',
            {
              hard_stop_class: 'zero_consumable_artifact',
              blocked_reason: 'stage_quality_budget_exhausted_without_consumable_artifact',
            },
          );
        }
        commitTerminalRouteDecision(reReview);
        return terminalize({
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            ...findings.map((finding) => `quality-debt:${finding.finding_id}`),
            qualityFailureRef(input, 'recovered-re-review-repair-budget-exhausted'),
          ])],
          updated_at: nowIso(),
        });
      }
      parentAttemptRef = reReview.attemptRef;
      currentArtifactProducerAttemptRef = recoveredRepairAttemptRef;
      firstRepairRound = recoveryResume.repair_rounds_used! + 1;
    }
    if (recoveryResume && recoveryResumeAfterRole === 'reviewer') {
      const receipt = state.review_receipts.at(-1);
      if (receipt?.verdict !== 'repair_required'
        || receipt.reviewer_attempt_ref !== recoveryResume.reviewer_attempt_ref
        || receipt.producer_attempt_ref !== producerAttemptRef) {
        throw new Error('Reviewer recovery requires its original accepted repair-required review.');
      }
      findings = validateInitialStageQualityReviewOutcome({ outcome: 'repair_required', findings: state.findings });
      parentAttemptRef = recoveryResume.reviewer_attempt_ref!;
      currentRevisionTransport = revisionTransportFromReceipt(receipt);
      if (!currentRevisionTransport) throw new Error('Reviewer recovery requires its formal revision intake.');
      firstRepairRound = state.repair_rounds_used + 1;
      const budgetTerminal = await terminalizeScopeBudgetIfNeeded({ sourceAttemptRef: parentAttemptRef, findings, includeAttemptLimit: true });
      if (budgetTerminal) return budgetTerminal;
    }
    if (!(recoveryResume && ['repairer', 'reviewer'].includes(recoveryResumeAfterRole))) {
      setReviewPendingArtifactAuthority(producerAttemptRef, 0);
      const review = await runAttempt({
      role: 'reviewer',
      round: 0,
      parentAttemptRef,
      artifactProducerAttemptRef: producerAttemptRef,
      artifactRefs: state.artifact_refs,
      artifactHashes: state.artifact_hashes,
      artifactIdentityReceiptRefs: state.artifact_identity_receipt_refs,
      reviewInputSnapshotMaterializationRequest,
    });
    parentAttemptRef = review.attemptRef;
    if (stageRunStopped(state)) return terminalize(state);
    if (progressFirstHandoffEnabled) commitTerminalRouteDecision(review);
    const initialOutcome = review.outcome;
    if (!initialOutcome) {
      throw new Error('Completed initial Review Attempt did not expose a canonical quality outcome.');
    }
    if (initialOutcome === 'blocked' || initialOutcome === 'human_gate') {
      const hardStop = validateStageQualityReviewHardStopOutcome({
        outcome: initialOutcome,
        envelope: review.envelope,
      });
      applyReviewStop(hardStop, review.attemptRef);
      const hardStopReceipt = await stageQualityReviewReceiptActivity({
        producer_attempt_ref: producerAttemptRef,
        reviewer_attempt_ref: review.attemptRef,
        rubric_refs: review.executionPolicy.rubricRefs,
        verdict: stageReviewVerdictForOutcome(initialOutcome),
      });
      state = {
        ...state,
        review_receipts: [...state.review_receipts, hardStopReceipt],
        quality_debt_refs: [...new Set([
          ...state.quality_debt_refs,
          ...(review.reviewInputSnapshotQualityDebtRef
            ? [review.reviewInputSnapshotQualityDebtRef]
            : []),
        ])],
      };
      commitReviewedArtifactAuthority(review, hardStopReceipt, 'hard_stopped', 0);
      return terminalize(state);
    }
    findings = validateInitialStageQualityReviewOutcome({
      outcome: initialOutcome,
      findings: findingList(review.envelope.findings),
    });
    const initialReviewReceipt = await stageQualityReviewReceiptActivity({
      producer_attempt_ref: producerAttemptRef,
      reviewer_attempt_ref: review.attemptRef,
      rubric_refs: review.executionPolicy.rubricRefs,
      verdict: stageReviewVerdictForOutcome(initialOutcome),
    });
    commitReviewedArtifactAuthority(
      review,
      initialReviewReceipt,
      initialOutcome === 'pass'
        ? 'accepted_by_initial_review'
        : initialOutcome === 'quality_debt'
          ? 'reviewed_with_quality_debt'
          : 'reviewed_with_open_findings',
      0,
    );
    currentRevisionTransport = revisionTransportFromReceipt(initialReviewReceipt);
    state = {
      ...state,
      findings,
      review_receipts: [...state.review_receipts, initialReviewReceipt],
      quality_debt_refs: [...new Set([
        ...state.quality_debt_refs,
        ...(review.reviewInputSnapshotQualityDebtRef
          ? [review.reviewInputSnapshotQualityDebtRef]
          : []),
      ])],
    };
    if (isEarlyRepairRouteBack(review)) {
      return terminalizeEarlyRepairRouteBack(review, findings);
    }
    if (initialOutcome === 'pass') {
      commitTerminalRouteDecision(review);
      return terminalize({
        ...state,
        status: review.reviewInputSnapshotQualityDebtRef
          ? 'completed_with_quality_debt'
          : 'completed',
        current_role: null,
        updated_at: nowIso(),
      });
    }
    if (initialOutcome === 'quality_debt') {
      commitTerminalRouteDecision(review);
      return terminalize({
        ...state,
        status: 'completed_with_quality_debt',
        current_role: null,
        quality_debt_refs: [...new Set([
          ...state.quality_debt_refs,
          ...asStringList(review.envelope.quality_debt_refs),
          qualityFailureRef(input, 'initial-review-quality-debt'),
        ])],
        updated_at: nowIso(),
      });
    }
    const initialBudgetTerminal = await terminalizeScopeBudgetIfNeeded({
      sourceAttemptRef: review.attemptRef,
      findings,
      includeAttemptLimit: true,
    });
    if (initialBudgetTerminal) return initialBudgetTerminal;
      if (state.max_repair_rounds === 0) {
        commitTerminalRouteDecision(review);
        return terminalize({
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            ...findings.map((finding) => `quality-debt:${finding.finding_id}`),
            qualityFailureRef(input, 'initial-review-repair-budget-exhausted'),
          ])],
          updated_at: nowIso(),
        });
      }
    }

    for (let round = firstRepairRound; round <= state.max_repair_rounds; round += 1) {
      const repair = await runAttempt({
        role: 'repairer',
        round,
        parentAttemptRef,
        artifactProducerAttemptRef: currentArtifactProducerAttemptRef,
        artifactRefs: state.artifact_refs,
        artifactHashes: state.artifact_hashes,
        artifactIdentityReceiptRefs: state.artifact_identity_receipt_refs,
        findings,
        ...(currentRevisionTransport ?? {}),
      });
      parentAttemptRef = repair.attemptRef;
      if (stageRunStopped(state)) return terminalize(state);
      if (!repair.artifactProducedByAttempt) {
        return terminalize({
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            qualityFailureRef(input, `repair-round-${round}-did-not-produce-new-artifact`),
          ])],
          updated_at: nowIso(),
        });
      }
      currentArtifactProducerAttemptRef = repair.attemptRef;
      setPendingRepairArtifactAuthority(repair, round, 'unreviewed_repair');
      let repairMap: StageQualityRepairMapEntry[];
      try {
        const strictRepairMap = repairMapList(repair.envelope.repair_map, findings);
        const normalization = asRecord(asRecord(repair.result.closeout_packet).closeout_normalization);
        repairMap = normalization.status === 'normalized'
          ? repair.envelope.repair_map as StageQualityRepairMapEntry[]
          : strictRepairMap;
      } catch (error) {
        updatePendingRepairDisposition('repair_map_invalid');
        state = {
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            qualityFailureRef(input, 'repair_map_invalid'),
            qualityFailureRef(input, 'repair_artifact_unreviewed'),
            ...(error instanceof FrameworkContractError
              ? [qualityFailureRef(input, `repair-map:${error.message}`)]
              : []),
          ])],
          updated_at: nowIso(),
        };
        return terminalize(state);
      }
      state = {
        ...state,
        repair_map: repairMap,
      };
      const repairBudgetTerminal = await terminalizeScopeBudgetIfNeeded({
        sourceAttemptRef: repair.attemptRef,
        findings,
        includeAttemptLimit: false,
      });
      if (repairBudgetTerminal) return repairBudgetTerminal;
      const pendingRepairIdentity = state.artifact_identity_authority?.pending_repair;
      const reReview = await runAttempt({
        role: 're_reviewer',
        round,
        parentAttemptRef,
        artifactProducerAttemptRef: currentArtifactProducerAttemptRef,
        artifactRefs: pendingRepairIdentity?.artifact_refs ?? state.artifact_refs,
        artifactHashes: pendingRepairIdentity?.artifact_hashes ?? state.artifact_hashes,
        artifactIdentityReceiptRefs:
          pendingRepairIdentity?.artifact_identity_receipt_refs ?? state.artifact_identity_receipt_refs,
        findings,
        repairMap,
        reviewInputSnapshotMaterializationRequest:
          repair.envelope.review_input_snapshot_materialization_request,
        ...(currentRevisionTransport ?? {}),
      });
      parentAttemptRef = reReview.attemptRef;
      state = { ...state, repair_rounds_used: round };
      state = {
        ...state,
        quality_scope_budget_usage: qualityScopeBudgetUsage(
          state,
          formalReviewDeclaredArtifactIdentityEnabled,
        ),
      };
      if (stageRunStopped(state)) return terminalize(state);
      const reReviewOutcome = reReview.outcome;
      if (!reReviewOutcome) {
        throw new Error('Completed Re-review Attempt did not expose a canonical quality outcome.');
      }
      if (reReviewOutcome === 'blocked' || reReviewOutcome === 'human_gate') {
        const hardStop = validateStageQualityReviewHardStopOutcome({
          outcome: reReviewOutcome,
          envelope: reReview.envelope,
        });
        applyReviewStop(hardStop, reReview.attemptRef);
        const hardStopReceipt = await stageQualityReviewReceiptActivity({
          producer_attempt_ref: repair.attemptRef,
          reviewer_attempt_ref: reReview.attemptRef,
          rubric_refs: reReview.executionPolicy.rubricRefs,
          verdict: stageReviewVerdictForOutcome(reReviewOutcome),
        });
        state = {
          ...state,
          review_receipts: [...state.review_receipts, hardStopReceipt],
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            ...(reReview.reviewInputSnapshotQualityDebtRef
              ? [reReview.reviewInputSnapshotQualityDebtRef]
              : []),
          ])],
        };
        commitReviewedArtifactAuthority(reReview, hardStopReceipt, 'hard_stopped', round);
        return terminalize(state);
      }
      const reReviewResult: StageQualityReReviewResult = {
        finding_closures: findingClosureList(reReview.envelope.finding_closures),
        repair_regressions: findingList(reReview.envelope.repair_regressions, 'repair_regressions'),
        critical_new_findings: findingList(reReview.envelope.critical_new_findings, 'critical_new_findings'),
        optional_observations: requiredRecordList(
          reReview.envelope.optional_observations,
          'optional_observations',
        ) as StageQualityReReviewResult['optional_observations'],
      };
      const closure = evaluateStageQualityFindingClosure({ findings, repairMap, reReview: reReviewResult });
      validateStageQualityReReviewOutcome({ outcome: reReviewOutcome, closure });
      const budgetDisposition = classifyStageQualityReReviewBudget({
        closure,
        qualityRoundIndex: round,
        maxRepairRounds: reReview.executionPolicy.maxRepairRounds,
      });
      const reReviewReceipt = await stageQualityReviewReceiptActivity({
        producer_attempt_ref: repair.attemptRef,
        reviewer_attempt_ref: reReview.attemptRef,
        rubric_refs: reReview.executionPolicy.rubricRefs,
        verdict: stageReviewVerdictForOutcome(reReviewOutcome),
      });
      currentRevisionTransport = revisionTransportFromReceipt(reReviewReceipt);
      state = {
        ...state,
        finding_closures: reReviewResult.finding_closures,
        review_receipts: [...state.review_receipts, reReviewReceipt],
        quality_debt_refs: [...new Set([
          ...state.quality_debt_refs,
          ...(reReview.reviewInputSnapshotQualityDebtRef
            ? [reReview.reviewInputSnapshotQualityDebtRef]
            : []),
        ])],
      };
      commitReviewedArtifactAuthority(
        reReview,
        reReviewReceipt,
        reReviewOutcome === 'pass'
          ? 'accepted_by_re_review'
          : reReviewOutcome === 'quality_debt'
            ? 'reviewed_with_quality_debt'
            : 'reviewed_with_open_findings',
        round,
      );
      if (reReviewOutcome === 'pass') {
        commitTerminalRouteDecision(reReview);
        return terminalize({
          ...state,
          status: reReview.reviewInputSnapshotQualityDebtRef
            ? 'completed_with_quality_debt'
            : 'completed',
          current_role: null,
          updated_at: nowIso(),
        });
      }
      if (reReviewOutcome === 'quality_debt') {
        commitTerminalRouteDecision(reReview);
        return terminalize({
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            ...asStringList(reReview.envelope.quality_debt_refs),
            qualityFailureRef(input, 're-review-quality-debt'),
          ])],
          updated_at: nowIso(),
        });
      }
      const openIds = new Set(closure.open_required_finding_ids);
      findings = [
        ...findings.filter((finding) => openIds.has(finding.finding_id)),
        ...reReviewResult.repair_regressions,
        ...reReviewResult.critical_new_findings,
      ];
      state = { ...state, findings };
      if (progressFirstHandoffEnabled) commitTerminalRouteDecision(reReview);
      const reReviewBudgetTerminal = await terminalizeScopeBudgetIfNeeded({
        sourceAttemptRef: reReview.attemptRef,
        findings,
        includeAttemptLimit: true,
      });
      if (reReviewBudgetTerminal) return reReviewBudgetTerminal;
      if (isEarlyRepairRouteBack(reReview)) {
        return terminalizeEarlyRepairRouteBack(reReview, findings);
      }
      if (budgetDisposition === 'terminal_quality_debt') {
        if (!hasConsumableArtifact(state)) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Stage quality repair budget exhausted without a consumable artifact.',
            {
              hard_stop_class: 'zero_consumable_artifact',
              blocked_reason: 'stage_quality_budget_exhausted_without_consumable_artifact',
            },
          );
        }
        commitTerminalRouteDecision(reReview);
        return terminalize({
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([
            ...state.quality_debt_refs,
            ...findings.map((finding) => `quality-debt:${finding.finding_id}`),
            qualityFailureRef(input, 're-review-repair-budget-exhausted'),
          ])],
          updated_at: nowIso(),
        });
      }
    }

    if (state.artifact_refs.length === 0 || state.artifact_hashes.length === 0) {
      return terminalize({
        ...state,
        status: 'blocked',
        current_role: null,
        blocked_reason: 'stage_quality_budget_exhausted_without_consumable_artifact',
        hard_stop_class: 'zero_consumable_artifact',
        source_attempt_ref: state.attempts.at(-1)?.stage_attempt_id
          ? `opl://stage_attempts/${state.attempts.at(-1)!.stage_attempt_id}`
          : null,
        updated_at: nowIso(),
      });
    }
    return terminalize({
      ...state,
      status: 'completed_with_quality_debt',
      current_role: null,
      quality_debt_refs: [
        ...new Set([
          ...state.quality_debt_refs,
          ...state.findings.map((finding) => `quality-debt:${finding.finding_id}`),
        ]),
      ],
      updated_at: nowIso(),
    });
  } catch (error) {
    if (cancellationPropagationEnabled && isCancellation(error)) throw error;
    if (stageRunStopped(state)) return terminalize(state);
    if (state.artifact_identity_authority?.pending_repair) {
      updatePendingRepairDisposition('re_review_did_not_run');
      state = {
        ...state,
        quality_debt_refs: [...new Set([
          ...state.quality_debt_refs,
          qualityFailureRef(input, 're_review_not_run'),
        ])],
      };
    }
    const hardStop = controllerHardStopFromError(error);
    const hardStopTerminates = hardStop
      && (
        hardStop.hardStopClass !== 'zero_consumable_artifact'
        || !(formalReviewDeclaredArtifactIdentityEnabled
          ? hasProducedConsumableArtifact(state)
          : hasConsumableArtifact(state))
      );
    if (hardStop && hardStopTerminates) {
      return terminalize({
        ...state,
        status: runtimeHumanGateClassificationEnabled && hardStop.hardStopClass === 'human_decision_required'
          ? 'human_gate'
          : 'blocked',
        current_role: null,
        blocked_reason: hardStop.blockedReason,
        hard_stop_class: hardStop.hardStopClass,
        typed_blocker_refs: hardStop.typedBlockerRefs,
        human_gate_refs: hardStop.humanGateRefs,
        source_attempt_ref: hardStop.sourceAttemptRef ?? (
          state.attempts.at(-1)?.stage_attempt_id
            ? `opl://stage_attempts/${state.attempts.at(-1)!.stage_attempt_id}`
            : null
        ),
        updated_at: nowIso(),
      });
    }
    const reason = hardStop && !hardStopTerminates
      ? hardStop.blockedReason
      : progressFirstHandoffEnabled ? activityFailureReason(error)
      : error instanceof Error ? error.message : String(error);
    return terminalize(hasConsumableArtifact(state)
      ? {
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([...state.quality_debt_refs, qualityFailureRef(input, reason)])],
          blocked_reason: null,
          updated_at: nowIso(),
        }
      : {
          ...state,
          status: 'blocked',
          current_role: null,
          blocked_reason: 'stage_quality_failed_without_consumable_artifact',
          hard_stop_class: 'zero_consumable_artifact',
          source_attempt_ref: state.attempts.at(-1)?.stage_attempt_id
            ? `opl://stage_attempts/${state.attempts.at(-1)!.stage_attempt_id}`
            : null,
          updated_at: nowIso(),
        });
  }
}
