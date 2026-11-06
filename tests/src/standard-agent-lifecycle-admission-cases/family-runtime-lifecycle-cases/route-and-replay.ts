import {
  assert,
  fs,
  path,
  test,
  fileURLToPath,
  FrameworkContractError,
  buildPackBoundTemporalStageRunInput,
  buildRouteStageRunInvocation,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  digest,
  materializeStageRunRoute,
  normalizeStageQualityCyclePolicy,
  nativeCarrierReadiness,
  packageUseBinding,
  temporaryRoot,
  writeJson,
  writeLifecycleCasReadState,
  writeLifecycleContracts,
  writeLifecycleWorkspace,
} from '../shared.ts';
import type {
  StandardAgentStageQualityRuntimeBinding,
} from '../shared.ts';

test('route launch requires fresh active lifecycle on first launch and persisted replay', async () => {
  const fixtureRoot = temporaryRoot('opl-family-lifecycle-route-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const readinessCheckoutRoot = path.join(fixtureRoot, 'readiness-checkout');
  const raceCheckoutRoot = path.join(fixtureRoot, 'race-checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  try {
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(readinessCheckoutRoot, { recursive: true });
    fs.mkdirSync(raceCheckoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    writeLifecycleContracts(checkoutRoot);
    writeLifecycleContracts(readinessCheckoutRoot);
    writeLifecycleContracts(raceCheckoutRoot);
    const refs = writeLifecycleWorkspace(workspaceRoot);
    const files: Record<string, string> = {
      'contracts/stage-quality.json': '{}',
      'agent/prompts/intake.md': '# Intake\n',
      'agent/prompts/draft.md': '# Draft\n',
      'agent/prompts/quality.md': [
        '# Quality',
        '## Producer', 'Produce.',
        '## Reviewer', 'Review.',
        '## Repairer', 'Repair.',
        '## Re-reviewer', 'Re-review.',
      ].join('\n'),
      'agent/quality_gates/stage.md': '# Rubric\n',
      'agent/goals/intake.md': '# Intake goal\n',
      'agent/goals/draft.md': '# Draft goal\n',
      'agent/sources/request.md': '# Request\n',
      'agent/lineage/intake.json': '{"stage_id":"intake"}\n',
      'agent/lineage/draft.json': '{"stage_id":"draft"}\n',
      'artifacts/request.json': '{"request":"revise"}\n',
    };
    for (const [relativePath, bytes] of Object.entries(files)) {
      const root = relativePath.startsWith('artifacts/') ? workspaceRoot : checkoutRoot;
      const file = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
    fs.cpSync(checkoutRoot, readinessCheckoutRoot, { recursive: true });
    fs.cpSync(checkoutRoot, raceCheckoutRoot, { recursive: true });
    const manifestSha256 = digest(fs.readFileSync(path.join(checkoutRoot, 'agent/stages/manifest.json')));
    const binding = (
      stageId: string,
      reviewLaneBinding?: StandardAgentStageQualityRuntimeBinding['review_lane_binding'],
    ): StandardAgentStageQualityRuntimeBinding => ({
      surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
      version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
      stage_id: stageId,
      declared_stage_ids: ['draft', 'intake'],
      enabled: true,
      stage_role: null,
      policy_ref: 'contracts/stage-quality.json',
      stage_prompt_ref: `agent/prompts/${stageId}.md`,
      quality_policy: normalizeStageQualityCyclePolicy({
        formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 1 },
      }),
      handoff_review_boundary: null,
      role_prompt_refs: {
        producer: 'agent/prompts/quality.md#producer',
        reviewer: 'agent/prompts/quality.md#reviewer',
        repairer: 'agent/prompts/quality.md#repairer',
        re_reviewer: 'agent/prompts/quality.md#re-reviewer',
      },
      quality_rubric_refs: ['agent/quality_gates/stage.md'],
      knowledge_refs: [],
      skill_refs: [],
      policy_refs: [],
      stage_goal_refs: [`agent/goals/${stageId}.md`],
      source_refs: ['agent/sources/request.md'],
      lineage_refs: [`agent/lineage/${stageId}.json`],
      ...(reviewLaneBinding === undefined ? {} : { review_lane_binding: reviewLaneBinding }),
      manifest_ref: 'agent/stages/manifest.json',
      manifest_sha256: manifestSha256,
    });
    const artifactBytes = fs.readFileSync(path.join(workspaceRoot, 'artifacts/request.json'));
    const artifactSha256 = `sha256:${digest(artifactBytes)}`;
    const parent = buildPackBoundTemporalStageRunInput({
      binding: binding('intake'),
      domainPackRoot: checkoutRoot,
      domainId: 'mas',
      stageId: 'intake',
      stageRunInvocationId: 'sri_lifecycle_route_parent',
      workspaceLocator: {
        workspace_root: workspaceRoot,
        study_id: 'study-001',
        domain_pack_root: checkoutRoot,
        package_use_binding: packageUseBinding(),
      },
      sourceFingerprint: artifactSha256,
      executorKind: 'codex_cli',
      actionId: 'launch_stage',
      artifactRefs: ['artifacts/request.json'],
      artifactHashes: [artifactSha256],
    });
    const decisivePayload = {
      parent_stage_run_spec_sha256: parent.stage_run_spec_sha256,
      use_boundary_id: 'package-use:lifecycle-route-decisive',
      spec_sha256: stageRunSpecSha256(parent.stage_run_spec),
      spec: parent.stage_run_spec,
      declared_stage_ids: parent.declared_stage_ids,
    };
    const routeInput = {
      parent_stage_run: parent,
      decisive_attempt_ref: 'opl://stage_attempts/lifecycle-route-reviewer',
      decisive_execution_content_binding: {
        surface_kind: 'opl_stage_attempt_execution_content_binding' as const,
        version: 'opl-stage-attempt-execution-content-binding.v1' as const,
        ...decisivePayload,
        binding_sha256: stageAttemptExecutionContentBindingSha256(decisivePayload),
      },
      decision: {
        decision_kind: 'advance' as const,
        target_stage_id: 'draft',
        evidence_refs: ['artifact:request'],
      },
      artifact_refs: ['artifacts/request.json'],
      artifact_hashes: [artifactSha256],
      artifact_identity_receipt_refs: [],
    };
    let persistedTarget: ReturnType<typeof buildPackBoundTemporalStageRunInput> | null = null;
    let providerStarts = 0;
    const dependencies = {
      findTargetStageRun: () => persistedTarget,
      ensurePackageLaunchReady: async () => ({
        runtime_source_readiness: { checkout_path: checkoutRoot },
        ...nativeCarrierReadiness(checkoutRoot),
        package_use_binding: packageUseBinding(),
      }) as never,
      resolveStageBinding: (_root: string, stageId: string) => binding(stageId),
      launchTargetStageRun: async (target: ReturnType<typeof buildPackBoundTemporalStageRunInput>) => {
        providerStarts += 1;
        const existing = persistedTarget !== null;
        persistedTarget ??= target;
        return { start_status: existing ? 'existing' : 'started' };
      },
    };

    await assert.rejects(
      materializeStageRunRoute(routeInput, dependencies),
      /lifecycle is inactive/i,
    );
    assert.equal(providerStarts, 0);
    assert.equal(persistedTarget, null);

    writeJson(fileURLToPath(refs.lifecycle.ref), {
      study_id: 'study-001', lifecycle_state: 'active', lifecycle_generation: 8,
    });
    writeLifecycleCasReadState({
      stateRoot,
      workspaceRoot,
      phase: 'in_progress',
      transitionId: 'route-pending',
      journal: true,
    });
    await assert.rejects(
      materializeStageRunRoute(routeInput, dependencies),
      /sync-pending/i,
    );
    assert.equal(providerStarts, 0);
    assert.equal(persistedTarget, null);
    writeLifecycleCasReadState({
      stateRoot,
      workspaceRoot,
      phase: 'settled',
      transitionId: 'route-settled',
      journal: false,
    });
    const launched = await materializeStageRunRoute(routeInput, dependencies);
    assert.equal(launched.materialization_status, 'launched');
    assert.equal(providerStarts, 1);

    const fixedLane = (reviewLane: string) => ({
      binding_kind: 'fixed' as const,
      review_lane: reviewLane,
      executor_may_select_lane: false as const,
      lane_fallback: false as const,
    });
    const controllerLane = (allowedReviewLanes: string[]) => ({
      binding_kind: 'controller_required' as const,
      allowed_review_lanes: allowedReviewLanes,
      executor_may_select_lane: false as const,
      lane_fallback: false as const,
    });
    const laneRoute = (
      parentReviewLane: string,
      targetReviewLaneBinding: StandardAgentStageQualityRuntimeBinding['review_lane_binding'],
      invocationSuffix: string,
    ) => {
      const laneParent = buildPackBoundTemporalStageRunInput({
        binding: binding('intake', fixedLane(parentReviewLane)),
        domainPackRoot: checkoutRoot,
        domainId: 'mas',
        stageId: 'intake',
        stageRunInvocationId: `sri_lifecycle_route_lane_parent_${invocationSuffix}`,
        workspaceLocator: {
          workspace_root: workspaceRoot,
          study_id: 'study-001',
          domain_pack_root: checkoutRoot,
          package_use_binding: packageUseBinding(),
        },
        sourceFingerprint: artifactSha256,
        executorKind: 'codex_cli',
        stageAttemptExecutorPolicy: { review_lane_binding: parentReviewLane },
        actionId: 'launch_stage',
        artifactRefs: ['artifacts/request.json'],
        artifactHashes: [artifactSha256],
      });
      const laneDecisivePayload = {
        parent_stage_run_spec_sha256: laneParent.stage_run_spec_sha256,
        use_boundary_id: `package-use:lifecycle-route-lane-${invocationSuffix}`,
        spec_sha256: stageRunSpecSha256(laneParent.stage_run_spec),
        spec: laneParent.stage_run_spec,
        declared_stage_ids: laneParent.declared_stage_ids,
      };
      return {
        routeInput: {
          parent_stage_run: laneParent,
          decisive_attempt_ref: `opl://stage_attempts/lifecycle-route-lane-${invocationSuffix}`,
          decisive_execution_content_binding: {
            surface_kind: 'opl_stage_attempt_execution_content_binding' as const,
            version: 'opl-stage-attempt-execution-content-binding.v1' as const,
            ...laneDecisivePayload,
            binding_sha256: stageAttemptExecutionContentBindingSha256(laneDecisivePayload),
          },
          decision: {
            decision_kind: 'advance' as const,
            target_stage_id: 'draft',
            evidence_refs: ['artifact:request'],
          },
          artifact_refs: ['artifacts/request.json'],
          artifact_hashes: [artifactSha256],
          artifact_identity_receipt_refs: [],
        },
        targetReviewLaneBinding,
      };
    };
    const launchLaneRoute = async (
      parentReviewLane: string,
      targetReviewLaneBinding: StandardAgentStageQualityRuntimeBinding['review_lane_binding'],
      invocationSuffix: string,
    ): Promise<{
      laneResult: Awaited<ReturnType<typeof materializeStageRunRoute>>;
      laneTarget: ReturnType<typeof buildPackBoundTemporalStageRunInput> | null;
      laneStarts: number;
    }> => {
      const lane = laneRoute(parentReviewLane, targetReviewLaneBinding, invocationSuffix);
      let laneTarget: ReturnType<typeof buildPackBoundTemporalStageRunInput> | null = null;
      let laneStarts = 0;
      const laneResult = await materializeStageRunRoute(lane.routeInput, {
        findTargetStageRun: () => laneTarget,
        ensurePackageLaunchReady: async () => ({
          runtime_source_readiness: { checkout_path: checkoutRoot },
          ...nativeCarrierReadiness(checkoutRoot),
          package_use_binding: packageUseBinding(),
        }) as never,
        resolveStageBinding: (_root: string, stageId: string) => (
          stageId === 'draft' ? binding(stageId, targetReviewLaneBinding) : binding(stageId)
        ),
        launchTargetStageRun: async (target) => {
          laneStarts += 1;
          const existing = laneTarget !== null;
          laneTarget ??= target;
          return { start_status: existing ? 'existing' : 'started' };
        },
      });
      return { laneResult, laneTarget, laneStarts };
    };

    const fixedOverride = await launchLaneRoute('medical', fixedLane('statistical'), 'fixed-override');
    assert.equal(fixedOverride.laneStarts, 1);
    assert.equal(
      fixedOverride.laneTarget?.stage_run_spec.stage_attempt_executor_policy?.review_lane_binding,
      'statistical',
    );

    const controllerAllowed = await launchLaneRoute('medical', controllerLane(['medical']), 'controller-allowed');
    assert.equal(controllerAllowed.laneStarts, 1);
    assert.equal(
      controllerAllowed.laneTarget?.stage_run_spec.stage_attempt_executor_policy?.review_lane_binding,
      'medical',
    );

    let controllerDisallowedStarts = 0;
    const disallowedLane = laneRoute('statistical', controllerLane(['medical']), 'controller-disallowed');
    await assert.rejects(
      materializeStageRunRoute(disallowedLane.routeInput, {
        ensurePackageLaunchReady: async () => {
          controllerDisallowedStarts += 1;
          return {
            runtime_source_readiness: { checkout_path: checkoutRoot },
            ...nativeCarrierReadiness(checkoutRoot),
            package_use_binding: packageUseBinding(),
          } as never;
        },
        resolveStageBinding: (_root: string, stageId: string) => (
          stageId === 'draft' ? binding(stageId, disallowedLane.targetReviewLaneBinding) : binding(stageId)
        ),
        launchTargetStageRun: async () => {
          controllerDisallowedStarts += 1;
          return { start_status: 'started' };
        },
      }),
      (error: unknown) => (
        error instanceof FrameworkContractError
        && error.details?.failure_code === 'route_target_review_lane_binding_mismatch'
      ),
    );
    assert.equal(controllerDisallowedStarts, 1);

    const undeclaredTarget = await launchLaneRoute('medical', null, 'undeclared-target');
    assert.equal(undeclaredTarget.laneStarts, 1);
    assert.equal(
      Object.hasOwn(undeclaredTarget.laneTarget?.stage_run_spec.stage_attempt_executor_policy ?? {}, 'review_lane_binding'),
      false,
    );

    // A controller-bound target whose parent Stage declares no review lane is ordinary
    // quality debt, not a route conflict: the consolidated review Stage owns no review
    // transport, so route_back into a controller-bound manuscript Stage must still
    // materialize (with the lane omitted) so the repair round can run.
    const laneLessParent = buildPackBoundTemporalStageRunInput({
      binding: binding('intake'),
      domainPackRoot: checkoutRoot,
      domainId: 'mas',
      stageId: 'intake',
      stageRunInvocationId: 'sri_lifecycle_route_lane_parent_no_lane',
      workspaceLocator: {
        workspace_root: workspaceRoot,
        study_id: 'study-001',
        domain_pack_root: checkoutRoot,
        package_use_binding: packageUseBinding(),
      },
      sourceFingerprint: artifactSha256,
      executorKind: 'codex_cli',
      stageAttemptExecutorPolicy: { invocation_mode: 'invocation' },
      actionId: 'launch_stage',
      artifactRefs: ['artifacts/request.json'],
      artifactHashes: [artifactSha256],
    });
    const laneLessDecisivePayload = {
      parent_stage_run_spec_sha256: laneLessParent.stage_run_spec_sha256,
      use_boundary_id: 'package-use:lifecycle-route-lane-no-lane',
      spec_sha256: stageRunSpecSha256(laneLessParent.stage_run_spec),
      spec: laneLessParent.stage_run_spec,
      declared_stage_ids: laneLessParent.declared_stage_ids,
    };
    let laneLessTarget: ReturnType<typeof buildPackBoundTemporalStageRunInput> | null = null;
    let laneLessStarts = 0;
    const laneLessResult = await materializeStageRunRoute({
      parent_stage_run: laneLessParent,
      decisive_attempt_ref: 'opl://stage_attempts/lifecycle-route-lane-no-lane',
      decisive_execution_content_binding: {
        surface_kind: 'opl_stage_attempt_execution_content_binding' as const,
        version: 'opl-stage-attempt-execution-content-binding.v1' as const,
        ...laneLessDecisivePayload,
        binding_sha256: stageAttemptExecutionContentBindingSha256(laneLessDecisivePayload),
      },
      decision: {
        decision_kind: 'route_back' as const,
        target_stage_id: 'draft',
        evidence_refs: ['artifact:request'],
      },
      artifact_refs: ['artifacts/request.json'],
      artifact_hashes: [artifactSha256],
      artifact_identity_receipt_refs: [],
    }, {
      findTargetStageRun: () => laneLessTarget,
      ensurePackageLaunchReady: async () => ({
        runtime_source_readiness: { checkout_path: checkoutRoot },
        ...nativeCarrierReadiness(checkoutRoot),
        package_use_binding: packageUseBinding(),
      }) as never,
      resolveStageBinding: (_root: string, stageId: string) => (
        stageId === 'draft' ? binding(stageId, controllerLane(['medical', 'display'])) : binding(stageId)
      ),
      launchTargetStageRun: async (target) => {
        laneLessStarts += 1;
        const existing = laneLessTarget !== null;
        laneLessTarget ??= target;
        return { start_status: existing ? 'existing' : 'started' };
      },
    });
    assert.equal(laneLessResult.materialization_status, 'launched');
    assert.equal(laneLessStarts, 1);
    const laneLessLaunchTarget = laneLessTarget as unknown as ReturnType<
      typeof buildPackBoundTemporalStageRunInput
    > | null;
    assert.equal(
      Object.hasOwn(
        laneLessLaunchTarget?.stage_run_spec.stage_attempt_executor_policy ?? {},
        'review_lane_binding',
      ),
      false,
    );

    const rootDrift = laneRoute('medical', controllerLane(['medical']), 'root-drift');
    const rootDriftRoots: string[] = [];
    let rootDriftTarget: ReturnType<typeof buildPackBoundTemporalStageRunInput> | null = null;
    let rootDriftReadinessCalls = 0;
    let rootDriftLaunches = 0;
    const rootDriftResolveStageBinding = (root: string, stageId: string) => {
      rootDriftRoots.push(root);
      if (root === readinessCheckoutRoot && stageId === 'draft') {
        return binding(stageId, rootDrift.targetReviewLaneBinding);
      }
      return binding(stageId, fixedLane('stale-parent-lane'));
    };
    const rootDriftFirst = await materializeStageRunRoute(rootDrift.routeInput, {
      findTargetStageRun: () => rootDriftTarget,
      ensurePackageLaunchReady: async () => {
        rootDriftReadinessCalls += 1;
        return {
          runtime_source_readiness: { checkout_path: readinessCheckoutRoot },
          ...nativeCarrierReadiness(readinessCheckoutRoot),
          package_use_binding: packageUseBinding(),
        } as never;
      },
      resolveStageBinding: rootDriftResolveStageBinding,
      launchTargetStageRun: async (target) => {
        rootDriftLaunches += 1;
        rootDriftTarget ??= target;
        return { start_status: rootDriftLaunches === 1 ? 'started' : 'existing' };
      },
    });
    assert.equal(rootDriftFirst.materialization_status, 'launched');
    const rootDriftLaunchTarget = rootDriftTarget as unknown as ReturnType<
      typeof buildPackBoundTemporalStageRunInput
    >;
    assert.equal(rootDriftLaunchTarget.domain_pack_root, readinessCheckoutRoot);
    assert.equal(
      rootDriftLaunchTarget.stage_run_spec.stage_attempt_executor_policy?.review_lane_binding,
      'medical',
    );
    assert.deepEqual(rootDriftRoots, [readinessCheckoutRoot]);

    const rootDriftReplay = await materializeStageRunRoute(rootDrift.routeInput, {
      findTargetStageRun: () => rootDriftTarget,
      ensurePackageLaunchReady: async () => {
        rootDriftReadinessCalls += 1;
        return {
          runtime_source_readiness: { checkout_path: checkoutRoot },
          ...nativeCarrierReadiness(checkoutRoot),
          package_use_binding: packageUseBinding(),
        } as never;
      },
      resolveStageBinding: rootDriftResolveStageBinding,
      launchTargetStageRun: async () => {
        rootDriftLaunches += 1;
        return { start_status: 'existing' };
      },
    });
    assert.equal(rootDriftReplay.materialization_status, 'existing');
    assert.equal(rootDriftReadinessCalls, 1);
    assert.equal(rootDriftRoots.at(-1), readinessCheckoutRoot);
    assert.equal(rootDriftLaunches, 2);

    const raceRootDrift = laneRoute('medical', controllerLane(['medical']), 'race-root-drift');
    const raceParent = raceRootDrift.routeInput.parent_stage_run;
    const raceInvocation = buildRouteStageRunInvocation({
      parentStageRunId: raceParent.stage_run_id,
      decisiveAttemptRef: raceRootDrift.routeInput.decisive_attempt_ref,
      decision: raceRootDrift.routeInput.decision,
      targetStageId: 'draft',
    });
    const raceTarget = buildPackBoundTemporalStageRunInput({
      binding: binding('draft', fixedLane('race-fixed-lane')),
      domainPackRoot: raceCheckoutRoot,
      domainId: raceParent.domain_id,
      stageId: 'draft',
      stageRunInvocationId: raceInvocation.stage_run_invocation_id,
      parentRouteDecisionRef: raceInvocation.parent_route_decision_ref,
      workspaceLocator: {
        ...raceParent.workspace_locator,
        domain_pack_root: raceCheckoutRoot,
        package_use_binding: packageUseBinding(),
      },
      sourceFingerprint: raceParent.source_fingerprint,
      executorKind: raceParent.executor_kind,
      stageAttemptExecutorPolicy: { review_lane_binding: 'race-fixed-lane' },
      artifactRefs: raceRootDrift.routeInput.artifact_refs,
      artifactHashes: raceRootDrift.routeInput.artifact_hashes,
      artifactIdentityReceiptRefs: raceRootDrift.routeInput.artifact_identity_receipt_refs,
      actionId: raceParent.action_id,
      taskId: raceParent.task_id,
      scopeKind: raceParent.scope_kind,
      executionScope: raceParent.execution_scope,
    });
    const raceRoots: string[] = [];
    let raceCandidateAvailable = false;
    let raceLaunches = 0;
    const raceResult = await materializeStageRunRoute(raceRootDrift.routeInput, {
      findTargetStageRun: () => raceCandidateAvailable ? raceTarget : null,
      ensurePackageLaunchReady: async () => ({
        runtime_source_readiness: { checkout_path: readinessCheckoutRoot },
        ...nativeCarrierReadiness(readinessCheckoutRoot),
        package_use_binding: packageUseBinding(),
      }) as never,
      resolveStageBinding: (root: string, stageId: string) => {
        raceRoots.push(root);
        if (root === readinessCheckoutRoot && stageId === 'draft') {
          return binding(stageId, controllerLane(['medical']));
        }
        if (root === raceCheckoutRoot && stageId === 'draft') {
          return binding(stageId, fixedLane('race-fixed-lane'));
        }
        return binding(stageId, fixedLane('stale-parent-lane'));
      },
      launchTargetStageRun: async (target) => {
        raceLaunches += 1;
        if (raceLaunches === 1) {
          raceCandidateAvailable = true;
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'test race conflict',
            { failure_code: 'stage_run_invocation_spec_conflict' },
          );
        }
        assert.equal(target.domain_pack_root, raceCheckoutRoot);
        return { start_status: 'existing' };
      },
    });
    assert.equal(raceResult.materialization_status, 'existing');
    assert.equal(raceLaunches, 2);
    assert.deepEqual(raceRoots, [readinessCheckoutRoot, raceCheckoutRoot]);

    writeJson(fileURLToPath(refs.lifecycle.ref), {
      study_id: 'study-001', lifecycle_state: 'paused', lifecycle_generation: 9,
    });
    await assert.rejects(
      materializeStageRunRoute(routeInput, dependencies),
      /lifecycle is inactive/i,
    );
    assert.equal(providerStarts, 1);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
