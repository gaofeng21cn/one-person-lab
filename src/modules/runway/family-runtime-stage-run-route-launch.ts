import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import { resolveStandardAgentStageQualityRuntimeBinding } from '../pack/index.ts';
import { buildPackBoundTemporalStageRunInput } from './family-runtime-pack-bound-stage-run.ts';
import { ensureFamilyRuntimePackageLaunchReady } from './family-runtime-package-readiness.ts';
import {
  buildRouteStageRunInvocation,
  buildStageRouteDecisionIdentity,
} from './family-runtime-stage-run-identity.ts';
import type {
  TemporalStageRunRouteLaunchInput,
  TemporalStageRunRouteLaunchReceipt,
  TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';
import { requireTemporalStageRunWorkflowInputLaunchable } from './family-runtime-temporal.ts';
import { stableId } from './family-runtime-store.ts';

type PackageReadinessResult = Awaited<ReturnType<typeof ensureFamilyRuntimePackageLaunchReady>>;

export type StageRunRouteLaunchDependencies = {
  launchTargetStageRun(input: TemporalStageRunWorkflowInput): Promise<Record<string, unknown>>;
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

export async function materializeStageRunRoute(
  input: TemporalStageRunRouteLaunchInput,
  dependencies: StageRunRouteLaunchDependencies,
): Promise<TemporalStageRunRouteLaunchReceipt> {
  const parentStageRun = requireTemporalStageRunWorkflowInputLaunchable(input.parent_stage_run);
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
  if (!parentStageRun.declared_stage_ids.includes(targetStageId)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A Stage route target must be declared by the parent StageRun pack binding.',
      {
        failure_code: 'route_target_stage_not_declared',
        target_stage_id: targetStageId,
        declared_stage_ids: parentStageRun.declared_stage_ids,
      },
    );
  }
  const invocation = buildRouteStageRunInvocation({
    parentStageRunId: parentStageRun.stage_run_id,
    decisiveAttemptRef: input.decisive_attempt_ref,
    decision: input.decision,
    targetStageId,
  });
  const pinnedUseBinding = isRecord(parentStageRun.workspace_locator.package_use_binding)
    ? parentStageRun.workspace_locator.package_use_binding
    : undefined;
  const ensurePackageLaunchReady = dependencies.ensurePackageLaunchReady
    ?? ensureFamilyRuntimePackageLaunchReady;
  const packageReadiness = await ensurePackageLaunchReady({
    domainId: parentStageRun.domain_id,
    workspaceLocator: parentStageRun.workspace_locator,
    useBoundaryId: stableId('package-use', [invocation.stage_run_invocation_id]),
    pinnedUseBinding,
  });
  const domainPackRoot = typeof packageReadiness?.runtime_source_readiness?.checkout_path === 'string'
    && packageReadiness.runtime_source_readiness.checkout_path.trim()
    ? packageReadiness.runtime_source_readiness.checkout_path.trim()
    : parentStageRun.domain_pack_root;
  const resolveStageBinding = dependencies.resolveStageBinding
    ?? resolveStandardAgentStageQualityRuntimeBinding;
  const binding = resolveStageBinding(domainPackRoot, targetStageId);
  if (!binding?.enabled) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A decisive Stage route target must expose an enabled pack-bound Stage quality runtime.',
      {
        failure_code: 'route_target_stage_run_binding_unavailable',
        domain_id: parentStageRun.domain_id,
        target_stage_id: targetStageId,
        domain_pack_root: domainPackRoot,
      },
    );
  }
  const packageUseBinding = packageReadiness?.package_use_binding ?? pinnedUseBinding;
  const workspaceLocator = {
    ...parentStageRun.workspace_locator,
    domain_pack_root: domainPackRoot,
    ...(packageUseBinding ? { package_use_binding: packageUseBinding } : {}),
  };
  const targetStageRun = buildPackBoundTemporalStageRunInput({
    binding,
    domainPackRoot,
    domainId: parentStageRun.domain_id,
    stageId: targetStageId,
    stageRunInvocationId: invocation.stage_run_invocation_id,
    parentRouteDecisionRef: invocation.parent_route_decision_ref,
    workspaceLocator,
    sourceFingerprint: parentStageRun.source_fingerprint,
    executorKind: parentStageRun.executor_kind,
    stageAttemptExecutorPolicy: parentStageRun.stage_attempt_executor_policy,
    artifactRefs: input.artifact_refs,
    artifactHashes: input.artifact_hashes,
    actionId: parentStageRun.action_id,
    taskId: parentStageRun.task_id,
  });
  const durableLaunch = await dependencies.launchTargetStageRun(targetStageRun);
  return {
    surface_kind: 'opl_stage_run_route_launch_receipt',
    version: 'opl-stage-run-route-launch-receipt.v1',
    materialization_status: durableLaunch.start_status === 'existing' ? 'existing' : 'launched',
    parent_stage_run_id: routeDecision.parent_stage_run_id,
    decisive_attempt_ref: routeDecision.decisive_attempt_ref,
    parent_route_decision_ref: invocation.parent_route_decision_ref,
    route_decision_sha256: invocation.route_decision_sha256,
    decision: input.decision,
    target_stage_run_id: targetStageRun.stage_run_id,
    target_stage_run_invocation_id: targetStageRun.stage_run_invocation_id,
    target_stage_run_spec_sha256: targetStageRun.stage_run_spec_sha256,
    target_workflow_id: targetStageRun.workflow_id,
    durable_launch: durableLaunch,
    authority_boundary: authorityBoundary,
  };
}
