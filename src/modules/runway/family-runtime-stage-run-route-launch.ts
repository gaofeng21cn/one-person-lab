import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import { resolveStandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import {
  resolveStandardAgentStageReviewLane,
  stageAttemptExecutorPolicyWithReviewLane,
} from '../pack/index.ts';
import { buildPackBoundTemporalStageRunInput } from './family-runtime-pack-bound-stage-run.ts';
import {
  ensureFamilyRuntimePackageLaunchReady,
  packageRuntimeSourceCheckoutPath,
} from './family-runtime-package-readiness.ts';
import {
  buildRouteStageRunInvocation,
  buildStageRouteDecisionIdentity,
  canonicalStageRunInputArtifacts,
  canonicalStageAttemptDeclaredStageIds,
  deriveStageRunId,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
} from './family-runtime-stage-run-identity.ts';
import type {
  TemporalStageRunRouteLaunchInput,
  TemporalStageRunRouteLaunchReceipt,
  TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';
import { requireTemporalStageRunWorkflowInputLaunchable } from './family-runtime-temporal.ts';
import { stableId } from './family-runtime-store.ts';
import { preflightDomainWorkspaceCheckoutCurrentness } from './family-runtime-checkout-currentness.ts';
import { preflightFamilyRuntimeDomainLifecycleAdmission } from './family-runtime-domain-lifecycle-admission.ts';

type PackageReadinessResult = Awaited<ReturnType<typeof ensureFamilyRuntimePackageLaunchReady>>;

export type StageRunRouteLaunchDependencies = {
  launchTargetStageRun(input: TemporalStageRunWorkflowInput): Promise<Record<string, unknown>>;
  findTargetStageRun?: (
    stageRunId: string,
  ) => TemporalStageRunWorkflowInput | null | Promise<TemporalStageRunWorkflowInput | null>;
  ensurePackageLaunchReady?: (input: {
    domainId: string;
    workspaceLocator: Record<string, unknown>;
    useBoundaryId: string;
    pinnedUseBinding?: Record<string, unknown>;
  }) => Promise<PackageReadinessResult>;
  resolveStageBinding?: (
    domainPackRoot: string,
    stageId: string,
  ) => StandardAgentStageQualityRuntimeBinding | null;
};

const authorityBoundary = {
  semantic_route_decision_owner: 'decisive_codex_attempt' as const,
  stage_transition_materialization_owner: 'opl_stage_run_controller' as const,
  opl_can_select_semantic_stage_route: false as const,
};

function routeReplayBusinessIdentity(input: TemporalStageRunWorkflowInput) {
  const spec = input.stage_run_spec;
  return {
    scope_kind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
    execution_scope: input.execution_scope ?? null,
    domain_id: spec.domain_id,
    stage_id: spec.stage_id,
    action_id: spec.action_id,
    task_id: spec.task_id,
    workspace_identity: spec.workspace_identity,
    source_fingerprint: spec.source_fingerprint,
    input_artifacts: spec.input_artifacts,
    executor_kind: spec.executor_kind,
    stage_attempt_executor_policy: spec.stage_attempt_executor_policy,
    parent_route_decision_ref: spec.parent_route_decision_ref,
    checkpoint_refs: spec.checkpoint_refs.filter((ref) => ref !== spec.stage_packet_ref),
  };
}

function expectedRouteReplayBusinessIdentity(input: {
  parentStageRun: TemporalStageRunWorkflowInput;
  targetStageId: string;
  parentRouteDecisionRef: string;
  stageAttemptExecutorPolicy: Record<string, unknown> | null;
  artifactRefs: string[];
  artifactHashes: string[];
  artifactIdentityReceiptRefs: string[];
}) {
  const parentSpec = input.parentStageRun.stage_run_spec;
  return {
    scope_kind: input.parentStageRun.scope_kind
      ?? (input.parentStageRun.execution_scope ? 'work_item' : 'domain'),
    execution_scope: input.parentStageRun.execution_scope ?? null,
    domain_id: parentSpec.domain_id,
    stage_id: input.targetStageId,
    action_id: parentSpec.action_id,
    task_id: parentSpec.task_id,
    workspace_identity: parentSpec.workspace_identity,
    source_fingerprint: parentSpec.source_fingerprint,
    input_artifacts: canonicalStageRunInputArtifacts(
      input.artifactRefs,
      input.artifactHashes,
      input.artifactIdentityReceiptRefs,
    ),
    executor_kind: parentSpec.executor_kind,
    stage_attempt_executor_policy: input.stageAttemptExecutorPolicy,
    parent_route_decision_ref: input.parentRouteDecisionRef,
    checkpoint_refs: [],
  };
}

function requireMatchingRouteReplay(input: {
  persisted: TemporalStageRunWorkflowInput;
  expectedStageRunId: string;
  expectedStageRunInvocationId: string;
  expectedBusinessIdentity: ReturnType<typeof expectedRouteReplayBusinessIdentity>;
}) {
  const persisted = requireTemporalStageRunWorkflowInputLaunchable(input.persisted, {
    revalidateContent: 'historical_evidence',
  });
  if (
    persisted.stage_run_id !== input.expectedStageRunId
    || persisted.stage_run_invocation_id !== input.expectedStageRunInvocationId
    || canonicalJsonText(routeReplayBusinessIdentity(persisted))
      !== canonicalJsonText(input.expectedBusinessIdentity)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun invocation is already bound to a different immutable spec.',
      {
        failure_code: 'stage_run_invocation_spec_conflict',
        stage_run_invocation_id: input.expectedStageRunInvocationId,
        existing_stage_run_id: persisted.stage_run_id,
        received_stage_run_id: input.expectedStageRunId,
        existing_stage_run_spec_sha256: persisted.stage_run_spec_sha256,
      },
    );
  }
  return persisted;
}

function isStageRunInvocationSpecConflict(error: unknown) {
  return error instanceof FrameworkContractError
    && error.details?.failure_code === 'stage_run_invocation_spec_conflict';
}

function parentStageRunReviewLane(input: TemporalStageRunWorkflowInput) {
  const value = input.stage_run_spec.stage_attempt_executor_policy?.review_lane_binding;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveRouteTargetReviewLane(input: {
  parentReviewLane: string | null;
  targetBinding: StandardAgentStageQualityRuntimeBinding | null;
  targetStageId: string;
}) {
  const binding = input.targetBinding?.review_lane_binding ?? null;
  if (!binding) return null;
  if (binding.binding_kind === 'fixed') {
    return resolveStandardAgentStageReviewLane(binding, null);
  }
  if (!input.parentReviewLane || !binding.allowed_review_lanes.includes(input.parentReviewLane)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A controller-bound Stage route target can inherit only an allowed parent review lane.',
      {
        failure_code: 'route_target_review_lane_binding_mismatch',
        target_stage_id: input.targetStageId,
        parent_review_lane: input.parentReviewLane,
        allowed_review_lanes: binding.allowed_review_lanes,
      },
    );
  }
  return input.parentReviewLane;
}

function resolveRouteTargetLaunchPlan(input: {
  domainId: string;
  domainPackRoot: string;
  targetStageId: string;
  parentReviewLane: string | null;
  parentStageAttemptExecutorPolicy: Record<string, unknown> | null | undefined;
  targetBinding: StandardAgentStageQualityRuntimeBinding | null;
}) {
  if (!input.targetBinding?.enabled) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A decisive Stage route target must expose an enabled pack-bound Stage quality runtime.',
      {
        failure_code: 'route_target_stage_run_binding_unavailable',
        domain_id: input.domainId,
        target_stage_id: input.targetStageId,
        domain_pack_root: input.domainPackRoot,
      },
    );
  }
  const targetReviewLane = resolveRouteTargetReviewLane({
    parentReviewLane: input.parentReviewLane,
    targetBinding: input.targetBinding,
    targetStageId: input.targetStageId,
  });
  return {
    targetBinding: input.targetBinding,
    targetReviewLane,
    targetStageAttemptExecutorPolicy: stageAttemptExecutorPolicyWithReviewLane(
      input.parentStageAttemptExecutorPolicy,
      targetReviewLane,
    ),
  };
}

export async function materializeStageRunRoute(
  input: TemporalStageRunRouteLaunchInput,
  dependencies: StageRunRouteLaunchDependencies,
): Promise<TemporalStageRunRouteLaunchReceipt> {
  const parentStageRun = requireTemporalStageRunWorkflowInputLaunchable(input.parent_stage_run, {
    revalidateContent: 'historical_evidence',
  });
  const decisiveBinding = input.decisive_execution_content_binding;
  const decisiveDeclaredStageIds = canonicalStageAttemptDeclaredStageIds(
    decisiveBinding.declared_stage_ids,
  );
  const decisiveSpecSha256 = stageRunSpecSha256(decisiveBinding.spec);
  const decisiveBindingSha256 = stageAttemptExecutionContentBindingSha256({
    parent_stage_run_spec_sha256: decisiveBinding.parent_stage_run_spec_sha256,
    use_boundary_id: decisiveBinding.use_boundary_id,
    spec_sha256: decisiveBinding.spec_sha256,
    spec: decisiveBinding.spec,
    declared_stage_ids: decisiveDeclaredStageIds,
  });
  if (
    decisiveBinding.parent_stage_run_spec_sha256 !== parentStageRun.stage_run_spec_sha256
    || decisiveBinding.spec.domain_id !== parentStageRun.domain_id
    || decisiveBinding.spec.stage_id !== parentStageRun.stage_id
    || decisiveBinding.spec_sha256 !== decisiveSpecSha256
    || decisiveBinding.binding_sha256 !== decisiveBindingSha256
    || JSON.stringify(decisiveBinding.declared_stage_ids) !== JSON.stringify(decisiveDeclaredStageIds)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage route launch requires the exact execution content binding of the decisive Attempt.',
      {
        failure_code: 'route_decisive_attempt_execution_binding_mismatch',
        parent_stage_run_id: parentStageRun.stage_run_id,
        decisive_attempt_ref: input.decisive_attempt_ref,
      },
    );
  }
  const routeDecision = buildStageRouteDecisionIdentity({
    parentStageRunId: parentStageRun.stage_run_id,
    decisiveAttemptRef: input.decisive_attempt_ref,
    decision: input.decision,
  });
  if (input.decision.decision_kind === 'complete') {
    return {
      surface_kind: 'opl_stage_run_route_launch_receipt',
      version: 'opl-stage-run-route-launch-receipt.v1',
      materialization_status: 'workflow_complete',
      parent_stage_run_id: routeDecision.parent_stage_run_id,
      decisive_attempt_ref: routeDecision.decisive_attempt_ref,
      decisive_execution_content_binding_sha256: decisiveBindingSha256,
      parent_route_decision_ref: routeDecision.parent_route_decision_ref,
      route_decision_sha256: routeDecision.route_decision_sha256,
      decision: input.decision,
      target_stage_run_id: null,
      target_stage_run_invocation_id: null,
      target_stage_run_spec_sha256: null,
      target_workflow_id: null,
      durable_launch: null,
      authority_boundary: authorityBoundary,
    };
  }

  const targetStageId = input.decision.target_stage_id;
  if (!targetStageId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A non-complete Stage route requires a declared target Stage.',
      { decision_kind: input.decision.decision_kind },
    );
  }
  if (!decisiveDeclaredStageIds.includes(targetStageId)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A Stage route target must be declared by the decisive Attempt execution binding.',
      {
        failure_code: 'route_target_stage_not_declared_by_decisive_attempt',
        target_stage_id: targetStageId,
        declared_stage_ids: decisiveDeclaredStageIds,
        decisive_attempt_ref: input.decisive_attempt_ref,
      },
    );
  }
  const invocation = buildRouteStageRunInvocation({
    parentStageRunId: parentStageRun.stage_run_id,
    decisiveAttemptRef: input.decisive_attempt_ref,
    decision: input.decision,
    targetStageId,
  });
  const targetStageRunId = deriveStageRunId({
    domainId: parentStageRun.domain_id,
    stageId: targetStageId,
    stageRunInvocationId: invocation.stage_run_invocation_id,
  });
  const resolveStageBinding = dependencies.resolveStageBinding
    ?? resolveStandardAgentStageQualityRuntimeBinding;
  const parentReviewLane = parentStageRunReviewLane(parentStageRun);
  const findPersistedTarget = async () => {
    const candidate = await dependencies.findTargetStageRun?.(targetStageRunId) ?? null;
    if (!candidate) return null;
    const persisted = requireTemporalStageRunWorkflowInputLaunchable(candidate, {
      revalidateContent: 'historical_evidence',
    });
    const targetPlan = resolveRouteTargetLaunchPlan({
      domainId: persisted.domain_id,
      domainPackRoot: persisted.domain_pack_root,
      targetStageId,
      parentReviewLane,
      parentStageAttemptExecutorPolicy: parentStageRun.stage_run_spec.stage_attempt_executor_policy,
      targetBinding: resolveStageBinding(persisted.domain_pack_root, targetStageId),
    });
    const expectedReplayIdentity = expectedRouteReplayBusinessIdentity({
      parentStageRun,
      targetStageId,
      parentRouteDecisionRef: invocation.parent_route_decision_ref,
      stageAttemptExecutorPolicy: targetPlan.targetStageAttemptExecutorPolicy,
      artifactRefs: input.artifact_refs,
      artifactHashes: input.artifact_hashes,
      artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
    });
    return {
      target: requireMatchingRouteReplay({
        persisted,
        expectedStageRunId: targetStageRunId,
        expectedStageRunInvocationId: invocation.stage_run_invocation_id,
        expectedBusinessIdentity: expectedReplayIdentity,
      }),
      targetPlan,
    };
  };
  const persistedTarget = await findPersistedTarget();
  const launchReceipt = (
    targetStageRun: TemporalStageRunWorkflowInput,
    durableLaunch: Record<string, unknown>,
  ): TemporalStageRunRouteLaunchReceipt => ({
    surface_kind: 'opl_stage_run_route_launch_receipt',
    version: 'opl-stage-run-route-launch-receipt.v1',
    materialization_status: durableLaunch.start_status === 'existing' ? 'existing' : 'launched',
    parent_stage_run_id: routeDecision.parent_stage_run_id,
    decisive_attempt_ref: routeDecision.decisive_attempt_ref,
    decisive_execution_content_binding_sha256: decisiveBindingSha256,
    parent_route_decision_ref: invocation.parent_route_decision_ref,
    route_decision_sha256: invocation.route_decision_sha256,
    decision: input.decision,
    target_stage_run_id: targetStageRun.stage_run_id,
    target_stage_run_invocation_id: targetStageRun.stage_run_invocation_id,
    target_stage_run_spec_sha256: targetStageRun.stage_run_spec_sha256,
    target_workflow_id: targetStageRun.workflow_id,
    durable_launch: durableLaunch,
    authority_boundary: authorityBoundary,
  });
  const preflightPersistedTarget = (target: TemporalStageRunWorkflowInput) => {
    preflightDomainWorkspaceCheckoutCurrentness({
      domainId: target.domain_id,
      workspaceLocator: target.workspace_locator,
    });
    preflightFamilyRuntimeDomainLifecycleAdmission({
      domainId: target.domain_id,
      stageId: target.stage_id,
      actionId: null,
      domainPackRoot: target.domain_pack_root,
      workspaceLocator: target.workspace_locator,
    });
  };
  if (persistedTarget) {
    preflightPersistedTarget(persistedTarget.target);
    return launchReceipt(
      persistedTarget.target,
      await dependencies.launchTargetStageRun(persistedTarget.target),
    );
  }
  const pinnedUseBinding = isRecord(parentStageRun.workspace_locator.package_use_binding)
    ? parentStageRun.workspace_locator.package_use_binding
    : undefined;
  const ensurePackageLaunchReady = dependencies.ensurePackageLaunchReady
    ?? ensureFamilyRuntimePackageLaunchReady;
  const packageReadiness = await ensurePackageLaunchReady({
    domainId: parentStageRun.domain_id,
    workspaceLocator: parentStageRun.workspace_locator,
    useBoundaryId: stableId('package-use', [invocation.stage_run_invocation_id]),
  });
  const domainPackRoot = packageRuntimeSourceCheckoutPath(packageReadiness)
    ?? parentStageRun.domain_pack_root;
  const targetPlan = resolveRouteTargetLaunchPlan({
    domainId: parentStageRun.domain_id,
    domainPackRoot,
    targetStageId,
    parentReviewLane,
    parentStageAttemptExecutorPolicy: parentStageRun.stage_run_spec.stage_attempt_executor_policy,
    targetBinding: resolveStageBinding(domainPackRoot, targetStageId),
  });
  const packageUseBinding = packageReadiness?.package_use_binding ?? pinnedUseBinding;
  const workspaceLocator = {
    ...parentStageRun.workspace_locator,
    domain_pack_root: domainPackRoot,
    ...(packageUseBinding ? { package_use_binding: packageUseBinding } : {}),
  };
  preflightDomainWorkspaceCheckoutCurrentness({
    domainId: parentStageRun.domain_id,
    workspaceLocator,
  });
  preflightFamilyRuntimeDomainLifecycleAdmission({
    domainId: parentStageRun.domain_id,
    stageId: targetStageId,
    actionId: null,
    domainPackRoot,
    workspaceLocator,
  });
  let targetStageRun = buildPackBoundTemporalStageRunInput({
    binding: targetPlan.targetBinding,
    domainPackRoot,
    domainId: parentStageRun.domain_id,
    stageId: targetStageId,
    stageRunInvocationId: invocation.stage_run_invocation_id,
    parentRouteDecisionRef: invocation.parent_route_decision_ref,
    workspaceLocator,
    sourceFingerprint: parentStageRun.source_fingerprint,
    executorKind: parentStageRun.executor_kind,
    stageAttemptExecutorPolicy: targetPlan.targetStageAttemptExecutorPolicy,
    artifactRefs: input.artifact_refs,
    artifactHashes: input.artifact_hashes,
    artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
    actionId: parentStageRun.action_id,
    taskId: parentStageRun.task_id,
    scopeKind: parentStageRun.scope_kind,
    executionScope: parentStageRun.execution_scope,
  });
  let durableLaunch: Record<string, unknown>;
  try {
    durableLaunch = await dependencies.launchTargetStageRun(targetStageRun);
  } catch (error) {
    if (!isStageRunInvocationSpecConflict(error)) throw error;
    const concurrentTarget = await findPersistedTarget();
    if (!concurrentTarget) throw error;
    targetStageRun = concurrentTarget.target;
    preflightPersistedTarget(concurrentTarget.target);
    durableLaunch = await dependencies.launchTargetStageRun(concurrentTarget.target);
  }
  return launchReceipt(targetStageRun, durableLaunch);
}
