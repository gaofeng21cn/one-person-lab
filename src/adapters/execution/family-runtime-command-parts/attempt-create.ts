import { randomUUID } from 'node:crypto';

import { loadFrameworkContracts } from '../../../authority/contracts/index.ts';
import { resolveStandardAgentStageReviewLane, stageAttemptExecutorPolicyWithReviewLane } from '../../../authority/packages/index.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { preflightDomainWorkspaceCheckoutCurrentness } from '../family-runtime-checkout-currentness.ts';
import { preflightFamilyRuntimeDomainLifecycleAdmission } from '../family-runtime-domain-lifecycle-admission.ts';
import {
  ensureFamilyRuntimePackageLaunchReady,
  packageRuntimeSourceCheckoutPath,
} from '../family-runtime-package-readiness.ts';
import { resolveFamilyRuntimeProviderKind } from '../family-runtime-providers.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import {
  createStageAttempt,
  findIdempotentStageAttempt,
  inspectStageAttempt,
} from '../family-runtime-stage-attempts.ts';
import { buildStageLaunchInvocationProjection } from '../family-runtime-launch-invocation.ts';
import { buildPackBoundTemporalStageRunInput } from '../family-runtime-pack-bound-stage-run.ts';
import {
  attachCheckoutCurrentnessToStageContext,
  persistStageAttemptLaunchBinding,
  recordTemporalStartOnAttempt,
} from '../family-runtime-parts/stage-attempt-launch.ts';
import {
  buildCliStageRunInvocationId,
  deriveStageRunId,
  explicitStageRunInvocationId,
} from '../family-runtime-stage-run-identity.ts';
import { launchRegisteredStageRun } from '../family-runtime-stage-run-launch.ts';
import { findStageRunLaunch } from '../family-runtime-stage-run-launch-registry.ts';
import {
  insertEvent,
  stableId,
} from '../family-runtime-store.ts';
import { requireFamilyRuntimeExecutionScope } from '../family-runtime-execution-scope.ts';
import type { FamilyRuntimeAttemptCommandContext } from './attempt-shared.ts';
import {
  rawStageAttemptMutationAuthority,
  normalizedReplayStringList,
  requireCurrentRuntimeRowsBeforeLaunchSideEffects,
  stageRunReplayBusinessIdentity,
  stageRunReplayRequestBusinessIdentity,
  temporalProviderModule,
} from './attempt-shared.ts';

export type AttemptCreateCommandContext = FamilyRuntimeAttemptCommandContext & {
  parsed: Extract<FamilyRuntimeCommandInput, { mode: 'attempt_create' }>;
};

function stageRunCheckpointRefs(
  input: AttemptCreateCommandContext['parsed']['input'],
  defaultStagePacketRef: string,
) {
  const checkpoints = normalizedReplayStringList(input.checkpointRefs);
  const decisions = normalizedReplayStringList(input.humanGateRefs);
  if (decisions.length === 0) return checkpoints;
  // StageRun transports human decisions as immutable owner input references.
  // Keep its stage packet first so child Attempt materialization does not
  // mistake a decision for the packet and remove it from execution checkpoints.
  const explicitPacket = checkpoints[0];
  const stagePacketRef = explicitPacket && !decisions.includes(explicitPacket)
    ? explicitPacket : defaultStagePacketRef;
  return [...new Set([stagePacketRef, ...checkpoints, ...decisions])];
}

export async function runAttemptCreateCommand(
  context: AttemptCreateCommandContext,
): Promise<Record<string, unknown>> {
  const {
    db,
    paths,
    parsed,
    stageRunRuntime,
    getCordisPackStagecraft,
  } = context;
  const runtimeExecutionScope = requireFamilyRuntimeExecutionScope({
    scopeKind: parsed.input.scopeKind,
    executionScope: parsed.input.executionScope,
    workspaceLocator: parsed.input.workspaceLocator,
    domainId: parsed.input.domainId,
    operation: 'family_runtime_attempt_create',
  });
  const scopedAttemptInput = {
    ...parsed.input,
    scopeKind: runtimeExecutionScope.scopeKind,
    executionScope: runtimeExecutionScope.executionScope,
  };
  requireCurrentRuntimeRowsBeforeLaunchSideEffects({
    db,
    domainId: parsed.input.domainId,
    stageId: parsed.input.stageId,
    workspaceRoot: runtimeExecutionScope.executionScope?.workspace_root
      ?? (typeof parsed.input.workspaceLocator.workspace_root === 'string'
        ? parsed.input.workspaceLocator.workspace_root.trim()
        : typeof parsed.input.workspaceLocator.repo_root === 'string'
          ? parsed.input.workspaceLocator.repo_root.trim()
          : null),
    operation: 'family_runtime_attempt_create_preflight',
  });
  const usesExplicitStageRunIdentity = Boolean(
    parsed.input.newStageRun
    || parsed.input.stageRunInvocationId
    || parsed.input.parentRouteDecisionRef
    || (parsed.input.inputArtifactRefs?.length ?? 0) > 0
    || (parsed.input.inputArtifactHashes?.length ?? 0) > 0
    || Boolean(parsed.input.reviewLane?.trim()),
  );
  const existingAttempt = usesExplicitStageRunIdentity
    ? null
    : findIdempotentStageAttempt(db, scopedAttemptInput);
  if (existingAttempt && !parsed.input.start) {
    rawStageAttemptMutationAuthority(
      db,
      existingAttempt.stage_attempt_id,
      'family_runtime_attempt_create_idempotent_replay',
    );
    return {
      version: 'g2',
      family_runtime_stage_attempt: {
        surface_id: 'opl_family_runtime_stage_attempt',
        created: false,
        idempotent_noop: true,
        attempt: existingAttempt,
        stage_context_observation: null,
        launch_invocation: null,
      },
    };
  }
  const baseStageRunInvocationId = buildCliStageRunInvocationId({
    domainId: parsed.input.domainId,
    stageId: parsed.input.stageId,
    actionId: parsed.input.actionId,
    workspaceLocator: parsed.input.workspaceLocator,
    taskId: parsed.input.taskId,
  });
  const stageRunInvocationId = parsed.input.stageRunInvocationId
    ? explicitStageRunInvocationId(parsed.input.stageRunInvocationId)
    : parsed.input.newStageRun
      ? stableId('sri', [baseStageRunInvocationId, 'explicit_new_stage_run', randomUUID()])
      : baseStageRunInvocationId;
  const stageRunId = deriveStageRunId({
    domainId: parsed.input.domainId,
    stageId: parsed.input.stageId,
    stageRunInvocationId,
  });
  const existingStageRunLaunch = findStageRunLaunch(db, stageRunId);
  const requestedReviewLane = parsed.input.reviewLane?.trim() || null;
  const explicitDomainPackRoot = typeof parsed.input.workspaceLocator.domain_pack_root === 'string'
    ? parsed.input.workspaceLocator.domain_pack_root.trim()
    : '';
  const persistedDomainPackRoot = existingStageRunLaunch?.stage_run_input.domain_pack_root?.trim() ?? '';
  const persistedStageAttemptExecutorPolicy = isRecord(
    existingStageRunLaunch?.stage_run_input.stage_run_spec.stage_attempt_executor_policy,
  )
    ? existingStageRunLaunch.stage_run_input.stage_run_spec.stage_attempt_executor_policy
    : null;
  const persistedReviewLane = typeof persistedStageAttemptExecutorPolicy?.review_lane_binding === 'string'
    ? persistedStageAttemptExecutorPolicy.review_lane_binding.trim() || null
    : null;
  if (existingStageRunLaunch && persistedReviewLane && requestedReviewLane) {
    // Persisted lane identity is the replay authority; an explicit different
    // lane must fail before immutable-spec comparison, without re-reading the
    // current package manifest.
    resolveStandardAgentStageReviewLane(
      {
        binding_kind: 'fixed',
        review_lane: persistedReviewLane,
        executor_may_select_lane: false,
        lane_fallback: false,
      },
      requestedReviewLane,
    );
  }
  const replayReviewLane = existingStageRunLaunch
    ? requestedReviewLane ?? persistedReviewLane
    : requestedReviewLane;
  if (existingStageRunLaunch && (
    // The persisted packet is omitted from child execution checkpoints. A
    // replay cannot reclassify it as a decision and silently lose that input.
    normalizedReplayStringList(parsed.input.humanGateRefs)
      .includes(existingStageRunLaunch.stage_run_input.stage_packet_ref)
    || canonicalJsonText(
      stageRunReplayBusinessIdentity(existingStageRunLaunch.stage_run_input),
    ) !== canonicalJsonText(stageRunReplayRequestBusinessIdentity({
      ...scopedAttemptInput,
      checkpointRefs: stageRunCheckpointRefs(
        parsed.input, existingStageRunLaunch.stage_run_input.stage_packet_ref,
      ),
      reviewLane: replayReviewLane ?? undefined,
    }))
  )) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun invocation is already bound to a different immutable spec.',
      {
        failure_code: 'stage_run_invocation_spec_conflict',
        domain_id: parsed.input.domainId,
        stage_id: parsed.input.stageId,
        stage_run_invocation_id: stageRunInvocationId,
        existing_stage_run_id: existingStageRunLaunch.stage_run_id,
        existing_stage_run_spec_sha256: existingStageRunLaunch.stage_run_spec_sha256,
      },
    );
  }
  const useBoundaryId = stableId('package-use', [stageRunInvocationId]);
  const pinnedUseBinding = isRecord(parsed.input.workspaceLocator.package_use_binding)
    ? parsed.input.workspaceLocator.package_use_binding
    : null;
  const packageReadiness = existingStageRunLaunch
    ? null
    : await (
        stageRunRuntime?.ensurePackageLaunchReady
        ?? ensureFamilyRuntimePackageLaunchReady
      )({
        domainId: parsed.input.domainId,
        workspaceLocator: parsed.input.workspaceLocator,
        ...(parsed.input.start ? { useBoundaryId } : {}),
        ...(pinnedUseBinding ? { pinnedUseBinding } : {}),
      });
  const managedDomainPackRoot = packageRuntimeSourceCheckoutPath(packageReadiness) ?? '';
  const domainPackRoot = persistedDomainPackRoot
    || (pinnedUseBinding
      ? explicitDomainPackRoot || managedDomainPackRoot
      : managedDomainPackRoot || explicitDomainPackRoot)
    || null;
  const cordis = await getCordisPackStagecraft();
  const stageQualityBinding = !existingStageRunLaunch && domainPackRoot
    ? (stageRunRuntime?.resolveStageBinding
      ?? cordis.stageBinding.resolve.bind(cordis.stageBinding))(domainPackRoot, parsed.input.stageId)
    : null;
  if (!existingStageRunLaunch && requestedReviewLane) {
    resolveStandardAgentStageReviewLane(stageQualityBinding?.review_lane_binding, requestedReviewLane);
  }
  const effectiveReviewLane = existingStageRunLaunch
    ? replayReviewLane
    : resolveStandardAgentStageReviewLane(stageQualityBinding?.review_lane_binding, requestedReviewLane);
  const selectedPackageUseBinding = parsed.input.start || stageQualityBinding?.enabled
    ? pinnedUseBinding ?? packageReadiness?.package_use_binding
    : null;
  const nativePackageClosure = isRecord(packageReadiness?.native_package_closure)
    ? packageReadiness.native_package_closure
    : null;
  const useBoundWorkspaceLocator = selectedPackageUseBinding
    ? {
        ...parsed.input.workspaceLocator,
        ...(domainPackRoot ? { domain_pack_root: domainPackRoot } : {}),
        ...(nativePackageClosure ? { native_package_closure: nativePackageClosure } : {}),
        package_use_binding: selectedPackageUseBinding,
      }
    : {
        ...parsed.input.workspaceLocator,
        ...(domainPackRoot ? { domain_pack_root: domainPackRoot } : {}),
        ...(nativePackageClosure ? { native_package_closure: nativePackageClosure } : {}),
      };
  const providerKind = resolveFamilyRuntimeProviderKind(parsed.input.providerKind);
  const sourceFingerprint = parsed.input.sourceFingerprint?.trim() || null;
  const taskId = parsed.input.taskId?.trim() || null;
  const baseIdempotencyKey = stableId('idem', [
    parsed.input.domainId,
    parsed.input.stageId,
    parsed.input.actionId?.trim() || null,
    providerKind,
    parsed.input.workspaceLocator,
    sourceFingerprint,
    taskId,
  ]);
  const projectedIdempotencyKey = baseIdempotencyKey;
  const defaultStageContextObservation = cordis.stageContext.observe(loadFrameworkContracts(), {
    domainId: parsed.input.domainId,
    stageId: parsed.input.stageId,
    actionId: parsed.input.actionId,
  });
  const checkoutCurrentnessPreflight = preflightDomainWorkspaceCheckoutCurrentness({
    domainId: parsed.input.domainId,
    workspaceLocator: parsed.input.workspaceLocator,
  });
  const checkoutBoundStageContextObservation = attachCheckoutCurrentnessToStageContext(
    defaultStageContextObservation,
    checkoutCurrentnessPreflight,
  );
  const lifecycleWorkspaceLocator = existingStageRunLaunch?.stage_run_input.workspace_locator
    ?? useBoundWorkspaceLocator;
  const canonicalLifecycleLaunch = Boolean(
    existingStageRunLaunch
    || domainPackRoot
    || parsed.input.actionId?.trim()
    || parsed.input.start
    || stageQualityBinding?.enabled,
  );
  const domainLifecycleAdmission = canonicalLifecycleLaunch
    ? preflightFamilyRuntimeDomainLifecycleAdmission({
        domainId: parsed.input.domainId,
        stageId: parsed.input.stageId,
        actionId: existingStageRunLaunch?.stage_run_input.action_id ?? parsed.input.actionId,
        domainPackRoot: existingStageRunLaunch?.stage_run_input.domain_pack_root ?? domainPackRoot,
        workspaceLocator: lifecycleWorkspaceLocator,
      })
    : { status: 'not_declared' as const };
  const stageLaunchContextObservation = {
    ...checkoutBoundStageContextObservation,
    domain_lifecycle_admission: domainLifecycleAdmission,
  };
  const launchInvocation = buildStageLaunchInvocationProjection({
    domainId: parsed.input.domainId,
    stageId: parsed.input.stageId,
    providerKind,
    workspaceLocator: parsed.input.workspaceLocator,
    sourceFingerprint,
    executorKind: parsed.input.executorKind,
    executorBindingRef: parsed.input.executorBindingRef,
    invocationMode: parsed.input.invocationMode,
    boundedEditRef: parsed.input.boundedEditRef,
    taskId,
    idempotencyKey: projectedIdempotencyKey,
    planeId: stageLaunchContextObservation.plane_id,
    contextPlaneId: stageLaunchContextObservation.plane_id,
  });
  const blockedReason = launchInvocation.blocker_reason
    ?? parsed.input.blockedReason
    ?? undefined;
  if (!existingAttempt && (existingStageRunLaunch || stageQualityBinding?.enabled)) {
    if (
      parsed.input.stageRunInvocationId
      && parsed.input.newStageRun
    ) {
      throw new FrameworkContractError(
        'cli_usage_error',
        '--stage-run-invocation-id cannot be combined with --new-stage-run.',
        {
          mutually_exclusive: [
            '--stage-run-invocation-id',
            '--new-stage-run',
          ],
        },
      );
    }
    const stageRunInput = existingStageRunLaunch?.stage_run_input
      ?? buildPackBoundTemporalStageRunInput({
        binding: stageQualityBinding!,
        domainPackRoot: domainPackRoot!,
        domainId: parsed.input.domainId,
        stageId: parsed.input.stageId,
        stageRunInvocationId,
        parentRouteDecisionRef: parsed.input.parentRouteDecisionRef,
        workspaceLocator: useBoundWorkspaceLocator,
        sourceFingerprint,
        executorKind: parsed.input.executorKind,
        stageAttemptExecutorPolicy: stageAttemptExecutorPolicyWithReviewLane({
          ...(parsed.input.executorBindingRef ? { executor_binding_ref: parsed.input.executorBindingRef } : {}),
          ...(parsed.input.invocationMode ? { invocation_mode: parsed.input.invocationMode } : {}),
          ...(parsed.input.boundedEditRef ? { bounded_edit_ref: parsed.input.boundedEditRef } : {}),
        }, effectiveReviewLane) ?? {},
        checkpointRefs: stageRunCheckpointRefs(parsed.input,
          `${stageQualityBinding!.manifest_ref}@sha256:${stageQualityBinding!.manifest_sha256}`
          + `#stage=${encodeURIComponent(parsed.input.stageId)}`),
        artifactRefs: parsed.input.inputArtifactRefs,
        artifactHashes: parsed.input.inputArtifactHashes,
        actionId: parsed.input.actionId,
        taskId,
        scopeKind: runtimeExecutionScope.scopeKind,
        executionScope: runtimeExecutionScope.executionScope,
        checkoutCurrentnessAdmission: checkoutCurrentnessPreflight,
      });
    const durableLaunch = await launchRegisteredStageRun({
      db,
      stageRunInput,
      start: Boolean(parsed.input.start && !blockedReason),
      startWorkflow: async (workflowInput) =>
        stageRunRuntime?.startWorkflow
          ? await stageRunRuntime.startWorkflow(workflowInput, { paths })
          : await (await temporalProviderModule()).startTemporalStageRunWorkflow(workflowInput, { paths }),
      describeWorkflow: async (workflowInput) =>
        stageRunRuntime?.describeWorkflow
          ? await stageRunRuntime.describeWorkflow(workflowInput, { paths })
          : await (await temporalProviderModule()).describeTemporalStageRunWorkflow(workflowInput, { paths }),
    });
    const temporal_start = parsed.input.start && !blockedReason
      ? durableLaunch.temporal_start
      : null;
    insertEvent(db, {
      taskId,
      domainId: parsed.input.domainId,
      eventType: blockedReason
        ? 'stage_run_launch_hard_stopped'
        : temporal_start
          ? 'stage_run_temporal_started'
          : 'stage_run_launch_planned',
      source: 'opl-cli',
      payload: {
        stage_run_id: stageRunInput.stage_run_id,
        stage_run_invocation_id: stageRunInput.stage_run_invocation_id,
        stage_run_spec_sha256: stageRunInput.stage_run_spec_sha256,
        workflow_id: stageRunInput.workflow_id,
        stage_id: stageRunInput.stage_id,
        quality_policy_ref: stageRunInput.quality_policy_ref,
        blocked_reason: blockedReason ?? null,
        temporal_start,
        durable_launch: durableLaunch,
      },
    });
    return {
      version: 'g2',
      family_runtime_stage_run: {
        surface_id: 'opl_family_runtime_stage_run',
        stage_run_input: stageRunInput,
        stage_context_observation: stageLaunchContextObservation,
        launch_invocation: launchInvocation,
        durable_launch: durableLaunch,
        blocked_reason: blockedReason ?? null,
        temporal_start,
      },
    };
  }
  if (
    parsed.input.newStageRun
    || parsed.input.stageRunInvocationId
    || parsed.input.parentRouteDecisionRef
    || (parsed.input.inputArtifactRefs?.length ?? 0) > 0
    || (parsed.input.inputArtifactHashes?.length ?? 0) > 0
    || Boolean(parsed.input.reviewLane?.trim())
  ) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'StageRun identity and input artifact options require an enabled pack-bound Stage quality runtime.',
      {
        stage_id: parsed.input.stageId,
        stage_quality_runtime_enabled: false,
      },
    );
  }
  const result = existingAttempt
    ? {
        created: false,
        idempotent_noop: true,
        attempt: existingAttempt,
      }
    : createStageAttempt(db, {
        ...scopedAttemptInput,
        workspaceLocator: useBoundWorkspaceLocator,
        idempotencyWorkspaceLocator: parsed.input.workspaceLocator,
        blockedReason,
        routeImpact: defaultStageContextObservation.selected_action_id
          ? {
              selected_action_id: defaultStageContextObservation.selected_action_id,
              selected_stage_route: defaultStageContextObservation.selected_stage_route,
            }
          : undefined,
        launchContextObservation: stageLaunchContextObservation,
        launchInvocation,
      });
  const { attempt } = result;
  const stageLaunchHardStopped = Boolean(launchInvocation.blocker_reason);
  const launchAttempt = parsed.input.start && attempt.status !== 'blocked'
    ? persistStageAttemptLaunchBinding(db, attempt, {
        workspaceLocator: useBoundWorkspaceLocator,
        packageUseBinding: isRecord(selectedPackageUseBinding)
          ? selectedPackageUseBinding
          : null,
        domainPackRoot,
      })
    : attempt;
  const temporal_start = parsed.input.start
    && launchAttempt.status !== 'blocked'
      ? await (await temporalProviderModule()).startTemporalStageAttemptWorkflow(launchAttempt, { paths })
    : null;
  recordTemporalStartOnAttempt(db, launchAttempt, temporal_start);
  const projectedAttempt = inspectStageAttempt(db, attempt.stage_attempt_id);
  insertEvent(db, {
    taskId: projectedAttempt.task_id,
    domainId: parsed.input.domainId,
    eventType: stageLaunchHardStopped
      ? 'stage_attempt_launch_hard_stopped'
      : parsed.input.start
      ? 'stage_attempt_temporal_started'
      : result.idempotent_noop
        ? 'stage_attempt_idempotent_noop'
        : 'stage_attempt_created',
    source: 'opl-cli',
    payload: {
      stage_attempt_id: attempt.stage_attempt_id,
      idempotency_key: attempt.idempotency_key,
      provider_kind: attempt.provider_kind,
      stage_id: attempt.stage_id,
      task_id: attempt.task_id,
      stage_context_observation: stageLaunchContextObservation,
      launch_invocation: launchInvocation,
      temporal_start,
    },
  });
  return {
    version: 'g2',
    family_runtime_stage_attempt: {
      surface_id: 'opl_family_runtime_stage_attempt',
      created: result.created,
      idempotent_noop: result.idempotent_noop,
      attempt: projectedAttempt,
      stage_context_observation: stageLaunchContextObservation,
      launch_invocation: launchInvocation,
      conflict_or_blocker_envelopes: 'conflict_or_blocker_envelopes' in result
        ? result.conflict_or_blocker_envelopes
        : [
            ...launchInvocation.conflict_or_blocker_envelopes,
          ],
      temporal_start,
    },
  };
}
