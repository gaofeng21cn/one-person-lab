import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../../authority/packages/index.ts';
import type { resolveStandardAgentStageQualityRuntimeBinding } from '../../authority/packages/index.ts';
import {
  resolveStandardAgentStageReviewLane,
  stageAttemptExecutorPolicyWithReviewLane,
} from '../../authority/packages/index.ts';
import { buildPackBoundTemporalStageRunInput } from './family-runtime-pack-bound-stage-run.ts';
import { readHostedAgentRuntimeActionContracts } from './hosted-agent-runtime-binding.ts';
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
  stageRunWorkspaceIdentity,
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
import type { StageRouteCompositionFactory } from './composition-factory-ports.ts';

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
  createStageRouteComposition?: StageRouteCompositionFactory;
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
    workspace_identity: stageRunWorkspaceIdentity(spec.workspace_identity),
    source_fingerprint: spec.source_fingerprint,
    input_artifacts: spec.input_artifacts,
    executor_kind: spec.executor_kind,
    stage_attempt_executor_policy: spec.stage_attempt_executor_policy,
    parent_route_decision_ref: spec.parent_route_decision_ref,
    checkpoint_refs: spec.checkpoint_refs.filter((ref) => ref !== spec.stage_packet_ref),
    route_budget: spec.route_budget ?? null,
  };
}

function expectedRouteReplayBusinessIdentity(input: {
  parentStageRun: TemporalStageRunWorkflowInput;
  targetStageId: string;
  domainPackRoot: string;
  parentRouteDecisionRef: string;
  stageAttemptExecutorPolicy: Record<string, unknown> | null;
  artifactRefs: string[];
  artifactHashes: string[];
  artifactIdentityReceiptRefs: string[];
  routeBudget: { max_route_back_rounds: number; route_back_rounds_used: number } | null;
}) {
  const parentSpec = input.parentStageRun.stage_run_spec;
  return {
    scope_kind: input.parentStageRun.scope_kind
      ?? (input.parentStageRun.execution_scope ? 'work_item' : 'domain'),
    execution_scope: input.parentStageRun.execution_scope ?? null,
    domain_id: parentSpec.domain_id,
    stage_id: input.targetStageId,
    action_id: resolveRouteTargetActionId({
      domainPackRoot: input.domainPackRoot,
      targetStageId: input.targetStageId,
      parentActionId: parentSpec.action_id,
    }),
    task_id: parentSpec.task_id,
    workspace_identity: stageRunWorkspaceIdentity(parentSpec.workspace_identity),
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
    route_budget: input.routeBudget,
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
  // A controller-bound Stage declares which parent lane it may inherit. The parent
  // Stage may itself declare no review lane (for example a consolidated
  // review-and-quality Stage that owns no review transport). The target pack declares
  // `missing_binding_effect=quality_debt_without_quality_or_readiness_claim` for that
  // case, and this resolver's own fixed/pack binding accepts a null request, so an
  // absent parent lane is ordinary quality debt: the route target proceeds without a
  // lane binding instead of hard-failing the whole route materialization. Only a
  // present parent lane outside the declared set is a genuine conflict and stays
  // fail-closed.
  if (!input.parentReviewLane) return null;
  if (!binding.allowed_review_lanes.includes(input.parentReviewLane)) {
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

// A controller-materialized route target StageRun must carry the action identity that
// declares the target Stage, not the parent Stage's action. A pack registers one
// stage-bound action per Stage; a cross-stage route target therefore belongs to the
// target Stage's own action. The parent action identity is a valid fallback only when
// the target pack does not declare a stage-bound action for the target Stage (for
// example a controller- or host-owned Stage), in which case lifecycle admission is
// not applicable and any retained action id is inert.
function actionContainsStage(
  action: Awaited<ReturnType<typeof readHostedAgentRuntimeActionContracts>>['catalog']['actions'][number],
  stageId: string,
) {
  if (action.execution_binding.kind !== 'stage_binding' || !action.stage_route) return false;
  return new Set([
    action.stage_route.entry_stage_ref,
    ...action.stage_route.required_stage_refs,
    ...action.stage_route.optional_stage_refs,
    ...action.stage_route.terminal_stage_refs,
  ]).has(stageId);
}

function resolveRouteTargetActionId(input: {
  domainPackRoot: string;
  targetStageId: string;
  parentActionId: string | null | undefined;
}) {
  const actionCatalogPath = path.join(input.domainPackRoot, 'contracts', 'action_catalog.json');
  // A domain pack that declares no action catalog is not an authoritative Standard
  // Agent pack: the target StageRun keeps the parent action identity, exactly as
  // before this resolver existed, and lifecycle admission is not applicable.
  if (!fs.existsSync(actionCatalogPath)) return input.parentActionId ?? null;
  // Once the pack DOES declare a catalog, a read/validation failure must fail loud
  // rather than silently fall back to the parent Stage action. A silent fallback
  // would bind the target StageRun to the parent Stage action and later surface as
  // a misleading domain_lifecycle_stage_launch_blocked at admission time.
  const actions = readHostedAgentRuntimeActionContracts(input.domainPackRoot).catalog.actions;
  const candidates = actions.filter((action) => actionContainsStage(action, input.targetStageId));
  // Preserve an already valid multi-Stage action instead of changing its business identity.
  const parent = candidates.find((action) => action.action_id === input.parentActionId);
  if (parent) return parent.action_id;
  const entryActions = candidates.filter((action) => action.stage_route?.entry_stage_ref === input.targetStageId);
  const targets = entryActions.length > 0 ? entryActions : candidates;
  if (targets.length > 1) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage route target action is ambiguous.', {
      failure_code: 'route_target_action_binding_ambiguous',
      target_stage_id: input.targetStageId,
      action_ids: targets.map((action) => action.action_id),
    });
  }
  return targets[0]?.action_id ?? input.parentActionId ?? null;
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
  const invocation = buildRouteStageRunInvocation({
    parentStageRunId: parentStageRun.stage_run_id,
    decisiveAttemptRef: input.decisive_attempt_ref,
    decision: input.decision,
    targetStageId,
  });
  const parentRouteBudget = parentStageRun.stage_run_spec.route_budget
    ?? parentStageRun.route_budget
    ?? null;
  const isRouteBack = input.decision.decision_kind === 'route_back';
  if (
    isRouteBack
    && parentRouteBudget
    && parentRouteBudget.route_back_rounds_used >= parentRouteBudget.max_route_back_rounds
  ) {
    return {
      surface_kind: 'opl_stage_run_route_launch_receipt',
      version: 'opl-stage-run-route-launch-receipt.v1',
      materialization_status: 'route_budget_exhausted',
      parent_stage_run_id: routeDecision.parent_stage_run_id,
      decisive_attempt_ref: routeDecision.decisive_attempt_ref,
      decisive_execution_content_binding_sha256: decisiveBindingSha256,
      parent_route_decision_ref: invocation.parent_route_decision_ref,
      route_decision_sha256: invocation.route_decision_sha256,
      decision: input.decision,
      target_stage_run_id: null,
      target_stage_run_invocation_id: null,
      target_stage_run_spec_sha256: null,
      target_workflow_id: null,
      durable_launch: { route_budget: parentRouteBudget },
      authority_boundary: authorityBoundary,
    };
  }
  const targetRouteBudget = parentRouteBudget
    ? {
        ...parentRouteBudget,
        route_back_rounds_used: parentRouteBudget.route_back_rounds_used + (isRouteBack ? 1 : 0),
      }
    : null;
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
  const targetStageRunId = deriveStageRunId({
    domainId: parentStageRun.domain_id,
    stageId: targetStageId,
    stageRunInvocationId: invocation.stage_run_invocation_id,
  });
  const cordis = dependencies.resolveStageBinding
    ? null
    : await dependencies.createStageRouteComposition?.();
  if (!dependencies.resolveStageBinding && !cordis) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage route materialization requires a Host-provided Stage route composition.',
      { failure_code: 'host_stage_route_composition_factory_missing' },
    );
  }
  const resolveStageBinding = dependencies.resolveStageBinding
    ?? cordis!.stageBinding.resolve.bind(cordis!.stageBinding);
  try {
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
      domainPackRoot: persisted.domain_pack_root,
      parentRouteDecisionRef: invocation.parent_route_decision_ref,
      stageAttemptExecutorPolicy: targetPlan.targetStageAttemptExecutorPolicy,
      artifactRefs: input.artifact_refs,
      artifactHashes: input.artifact_hashes,
      artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
      routeBudget: targetRouteBudget,
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
  const nativePackageClosure = isRecord(packageReadiness?.native_package_closure)
    ? packageReadiness.native_package_closure
    : null;
  const workspaceLocator = {
    ...parentStageRun.workspace_locator,
    domain_pack_root: domainPackRoot,
    ...(packageUseBinding ? { package_use_binding: packageUseBinding } : {}),
    ...(nativePackageClosure ? { native_package_closure: nativePackageClosure } : {}),
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
    routeBudget: targetRouteBudget,
    actionId: resolveRouteTargetActionId({
      domainPackRoot,
      targetStageId,
      parentActionId: parentStageRun.action_id,
    }),
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
  } finally {
    await cordis?.dispose();
  }
}
