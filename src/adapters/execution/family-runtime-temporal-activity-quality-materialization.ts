import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { withFamilyRuntimeTransaction } from './family-runtime-sqlite.ts';
import {
  requireTemporalStageRunWorkflowInputLaunchable,
  type TemporalStageQualityAttemptMaterializationInput,
} from './family-runtime-temporal.ts';
import { openQueueDb, stableId } from './family-runtime-store.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  findStageAttemptByIdempotencyBoundary,
} from './family-runtime-stage-attempts.ts';
import { getStageAttemptRow, stageAttemptToPayload } from './family-runtime-stage-attempt-ledger.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';
import {
  createStageQualityCycle,
  markStageQualityCycleCurrentAttempt,
} from './family-runtime-stage-quality-cycle.ts';
import { verifyStageQualityArtifactIdentityAtAttemptBoundary } from './family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import {
  buildStageReviewContextManifest,
  normalizeStageQualityScopeBudget,
} from '../../authority/stages/index.ts';
import { buildStageReviewInputSnapshotContext } from './family-runtime-stage-quality-context-manifest.ts';
import { resolveReviewerInputSnapshotMaterialization } from './family-runtime-reviewer-input-snapshot.ts';
import {
  resolveStandardAgentStageReviewLane,
  stageAttemptExecutorPolicyWithReviewLane,
  type resolveStandardAgentStageQualityRuntimeBinding,
} from '../../authority/packages/index.ts';
import { taskRetryBudgetProjection } from './family-runtime-queue-projection-boundary.ts';
import {
  buildStageRunImmutableSpec,
  canonicalStageAttemptDeclaredStageIds,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
} from './family-runtime-stage-run-identity.ts';
import {
  ensureFamilyRuntimePackageLaunchReady,
  packageRuntimeSourceCheckoutPath,
} from './family-runtime-package-readiness.ts';
import {
  readString,
} from './family-runtime-temporal-activity-result-compaction.ts';
import {
  persistedStageQualityAttemptMaterializationReceipt,
  requirePersistedAttemptStageRunIdentity,
  requireRawStageRunMutationAuthority,
  reviewerSnapshotAuthorityBinding,
} from './family-runtime-temporal-activity-identity.ts';
import { requirePersistedStageRunActivityIdentity } from './family-runtime-persisted-identity-admission.ts';
import { revisionTransportContext } from './family-runtime-revision-intake.ts';
import type { StageRouteCompositionFactory } from './composition-factory-ports.ts';
import { resolveStageRunDefaultProgression } from './family-runtime-stage-run-default-progression.ts';
export async function stageQualityAttemptMaterializeActivity(
  input: TemporalStageQualityAttemptMaterializationInput,
  options: {
    ensurePackageLaunchReady?: typeof ensureFamilyRuntimePackageLaunchReady;
    resolveStageBinding?: typeof resolveStandardAgentStageQualityRuntimeBinding;
    createStageRouteComposition?: StageRouteCompositionFactory;
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
      stageRun.recovery_resume ? readString(input.stage_run_workflow_run_id) : null,
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
      return withFamilyRuntimeTransaction(db, () => {
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
        expectedProducingStageId: stageRun.stage_id,
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
    const executionDomainPackRoot = packageRuntimeSourceCheckoutPath(packageReadiness)
      ?? readString(stageRun.workspace_locator.domain_pack_root)
      ?? stageRun.domain_pack_root;
    const executionWorkspaceLocator: Record<string, unknown> = {
      ...stageRun.workspace_locator,
      domain_pack_root: executionDomainPackRoot,
      ...(packageReadiness?.package_use_binding
        ? { package_use_binding: packageReadiness.package_use_binding }
        : {}),
      ...(isRecord(packageReadiness?.native_package_closure)
        ? { native_package_closure: packageReadiness.native_package_closure }
        : {}),
    };
    const cordis = options.resolveStageBinding
      ? null
      : await options.createStageRouteComposition?.();
    if (!options.resolveStageBinding && !cordis) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage quality Attempt materialization requires a Host-provided Stage route composition.',
        { failure_code: 'host_stage_route_composition_factory_missing' },
      );
    }
    let executionStageBinding;
    try {
      executionStageBinding = (
        options.resolveStageBinding
        ?? cordis!.stageBinding.resolve.bind(cordis!.stageBinding)
      )(executionDomainPackRoot, stageRun.stage_id);
    } finally {
      await cordis?.dispose();
    }
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
          expectedProducingStageId: stageRun.stage_id,
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
    const executionReviewLane = resolveStandardAgentStageReviewLane(
      executionStageBinding.review_lane_binding,
      readString(stageRun.stage_attempt_executor_policy?.review_lane_binding),
    );
    const executionAttemptExecutorPolicy = stageAttemptExecutorPolicyWithReviewLane(
      stageRun.stage_attempt_executor_policy,
      executionReviewLane,
    );
    const executionContentSpec = buildStageRunImmutableSpec({
      knowledgeContext: stageRun.stage_run_spec.durable_knowledge_context,
      binding: executionStageBinding,
      domainPackRoot: executionDomainPackRoot,
      domainId: stageRun.domain_id,
      stageId: stageRun.stage_id,
      workspaceLocator: executionWorkspaceLocator,
      scopeKind: stageRun.scope_kind ?? (stageRun.execution_scope ? 'work_item' : 'domain'),
      executionScope: stageRun.execution_scope ?? null,
      sourceFingerprint: stageRun.source_fingerprint,
      executorKind: stageRun.executor_kind,
      stageAttemptExecutorPolicy: executionAttemptExecutorPolicy,
      stagePacketRef: executionStagePacketRef,
      actionId: stageRun.action_id,
      taskId: stageRun.task_id,
      checkpointRefs: executionCheckpointRefs,
      checkpointArtifacts: stageRun.stage_run_spec.input_artifacts.filter((artifact) => (
        executionCheckpointRefs.includes(artifact.ref)
      )),
      artifactRefs: input.artifact_refs,
      artifactHashes: input.artifact_hashes,
      artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
      parentRouteDecisionRef: stageRun.parent_route_decision_ref,
      routeBudget: stageRun.stage_run_spec.route_budget ?? stageRun.route_budget,
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
      ...(!executionStageBinding.quality_policy.formal_review.required && input.attempt_role === 'producer'
        ? { controller_default_progression: resolveStageRunDefaultProgression({
            domainPackRoot: executionDomainPackRoot,
            domainId: stageRun.domain_id,
            stageId: stageRun.stage_id,
            actionId: stageRun.action_id ?? null,
            manifestRef: executionStageBinding.manifest_ref,
            manifestSha256: executionStageBinding.manifest_sha256,
            declaredStageIds: executionDeclaredStageIds,
          }) }
        : {}),
    };
    const reviewAttemptRole = input.attempt_role === 'reviewer' || input.attempt_role === 're_reviewer'
      ? input.attempt_role
      : null;
    const snapshotAuthorityBinding = reviewAttemptRole
      ? reviewerSnapshotAuthorityBinding(
          db,
          artifactProducerAttemptRef!,
          stageRun,
          isRecord(input.review_input_snapshot_materialization_request)
            ? readString(input.review_input_snapshot_materialization_request.review_lane)
            : null,
        )
      : null;
    const reviewInputSnapshotContext = reviewAttemptRole
      ? buildStageReviewInputSnapshotContext({
          stageRunId: stageRun.stage_run_id,
          qualityCycleId: input.quality_cycle_id,
          reviewerAttemptRole: reviewAttemptRole,
          resolution: resolveReviewerInputSnapshotMaterialization(
            input.review_input_snapshot_materialization_request,
            snapshotAuthorityBinding!,
            { refs: inputArtifactIdentity.artifact_refs, hashes: inputArtifactIdentity.artifact_hashes },
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
          knowledgeRefs: executionStageBinding.knowledge_refs,
          skillRefs: executionStageBinding.skill_refs,
          policyRefs: executionStageBinding.policy_refs,
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
          knowledge_refs: executionStageBinding.knowledge_refs,
          skill_refs: executionStageBinding.skill_refs,
          policy_refs: executionStageBinding.policy_refs,
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
    return withFamilyRuntimeTransaction(db, () => {
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
        stageAttemptExecutorPolicy: executionAttemptExecutorPolicy,
        checkpointRefs: executionCheckpointRefs,
        taskId: stageRun.task_id ?? undefined,
        stageRunId: stageRun.stage_run_id,
        qualityCycleId: input.quality_cycle_id,
        attemptRole: input.attempt_role,
        qualityRoundIndex: input.quality_round_index,
        parentAttemptRef: input.parent_attempt_ref ?? undefined,
        inputArtifactRefs: inputArtifactIdentity.artifact_refs,
        reviewedArtifactHashes: inputArtifactIdentity.artifact_hashes,
        qualitySourceRefs: executionStageBinding.source_refs,
        qualityKnowledgeRefs: executionStageBinding.knowledge_refs,
        qualitySkillRefs: executionStageBinding.skill_refs,
        qualityPolicyRefs: executionStageBinding.policy_refs,
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
