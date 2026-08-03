import {
  assert,
  crypto,
  fs,
  os,
  path,
  DatabaseSync,
  test,
  pathToFileURL,
  Worker,
  createWorkItemExecutionScopeSnapshot,
  parseFamilyRuntimeCommand,
  runFamilyRuntime,
  buildPackBoundTemporalStageRunInput,
  resolveStageRunAttemptExecutorContent,
  buildCliStageRunInvocationId,
  buildHostedActionStageRunInvocationId,
  buildRouteStageRunInvocation,
  deriveStageRunId,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  revalidateStageRunImmutableSpecContent,
  launchRegisteredStageRun,
  materializeStageRunRoute,
  claimStageRunStart,
  findStageRunLaunch,
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
  requireTemporalStageRunWorkflowInputLaunchable,
  stageQualityAttemptMaterializeActivity,
  createStageAttempt,
  createFamilyRuntimeQueueTables,
  openQueueDb,
  normalizeStageQualityCyclePolicy,
  runWithWorkItemFileBoundaryInterlock,
  fixtureRoot,
  domainPackRoot,
  workspaceRoot,
  sha256,
  writeFixture,
  safeIdentityDirectory,
  manifestFixture,
  artifactFixtures,
  binding,
  packageUseBinding,
  workspaceLocator,
  stageRunInput,
  workItemExecutionScope,
  scopedStageRunInput,
  registerStageRunInConfiguredState,
  decisiveExecutionBinding,
  writeTrustedIdentityReceipt,
  temporalStartReceipt,
  workerClaim,
  workerClose,
  waitForBarrierCount,
} from './shared.ts';
test('StageRun identity ignores currentness observations but binds immutable package bytes', () => {
  const firstLocator = workspaceLocator();
  const refreshedLocator = {
    ...workspaceLocator(packageUseBinding({
      checkedAt: '2026-07-14T01:00:00.000Z',
      targetRoot: '/tmp/other-materialization-path',
    })),
    domain_pack_root: '/tmp/managed-checkout-two',
    checkout_currentness: { status: 'current', checked_at: '2026-07-14T01:00:00.000Z' },
    runtime_source_readiness: {
      checkout_path: '/tmp/managed-checkout-two',
      checked_at: '2026-07-14T01:00:00.000Z',
    },
    stage_run_currentness_admission: {
      status: 'admitted',
      checked_at: '2026-07-14T01:00:00.000Z',
      stage_run_id: 'sr:observation-only',
      checkout_currentness_is_provenance_only: true,
      child_attempts_refresh_package_use: true,
    },
  };
  const firstInvocation = buildCliStageRunInvocationId({
    domainId: 'medautoscience', stageId: 'intake', actionId: 'draft-paper',
    workspaceLocator: firstLocator, taskId: 'task:one',
  });
  const refreshedInvocation = buildCliStageRunInvocationId({
    domainId: 'medautoscience', stageId: 'intake', actionId: 'draft-paper',
    workspaceLocator: refreshedLocator, taskId: 'task:one',
  });
  assert.equal(refreshedInvocation, firstInvocation);

  const first = stageRunInput({ invocationId: firstInvocation, locator: firstLocator });
  const refreshed = stageRunInput({ invocationId: refreshedInvocation, locator: refreshedLocator });
  assert.equal(refreshed.stage_run_id, first.stage_run_id);
  assert.equal(refreshed.stage_run_spec_sha256, first.stage_run_spec_sha256);

  const packageDrift = stageRunInput({
    invocationId: firstInvocation,
    locator: workspaceLocator(packageUseBinding({ packageVersion: '0.2.2' })),
  });
  assert.equal(packageDrift.stage_run_id, first.stage_run_id);
  assert.notEqual(packageDrift.stage_run_spec_sha256, first.stage_run_spec_sha256);
});

test('route invocation makes A-B-A a new Run while replaying the same decision idempotently', () => {
  const initialInvocation = buildCliStageRunInvocationId({
    domainId: 'medautoscience', stageId: 'intake', actionId: 'draft-paper',
    workspaceLocator: workspaceLocator(), taskId: 'task:one',
  });
  const initialStageRunId = deriveStageRunId({
    domainId: 'medautoscience', stageId: 'intake', stageRunInvocationId: initialInvocation,
  });
  const aToBInput = {
    parentStageRunId: initialStageRunId,
    decisiveAttemptRef: 'opl://stage_attempts/reviewer-a',
    decision: {
      decision_kind: 'advance',
      target_stage_id: 'draft',
      evidence_refs: ['artifact:a'],
    },
    targetStageId: 'draft',
  } as const;
  const aToB = buildRouteStageRunInvocation(aToBInput);
  assert.deepEqual(buildRouteStageRunInvocation(aToBInput), aToB);
  const stageRunB = deriveStageRunId({
    domainId: 'medautoscience', stageId: 'draft', stageRunInvocationId: aToB.stage_run_invocation_id,
  });
  const bToA = buildRouteStageRunInvocation({
    parentStageRunId: stageRunB,
    decisiveAttemptRef: 'opl://stage_attempts/reviewer-b',
    decision: {
      decision_kind: 'route_back',
      target_stage_id: 'intake',
      evidence_refs: ['artifact:b', 'finding:route-back'],
    },
    targetStageId: 'intake',
  });
  assert.notEqual(bToA.stage_run_invocation_id, initialInvocation);
  assert.notEqual(bToA.stage_run_invocation_id, aToB.stage_run_invocation_id);

  const laterDecision = buildRouteStageRunInvocation({
    ...aToBInput,
    decisiveAttemptRef: 'opl://stage_attempts/reviewer-a-later',
  });
  assert.notEqual(laterDecision.stage_run_invocation_id, aToB.stage_run_invocation_id);
});

test('controller route materialization starts targets, replays idempotently, and creates a new A-B-A Run', async () => {
  const db = new DatabaseSync(':memory:');
  const parent = stageRunInput({ invocationId: 'sri_initial_a', stageId: 'intake' });
  const routeCurrentPackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-route-current-pack-'));
  fs.cpSync(domainPackRoot, routeCurrentPackRoot, { recursive: true });
  writeFixture(routeCurrentPackRoot, 'agent/prompts/publication_followup.md', '# publication followup prompt\n');
  writeFixture(routeCurrentPackRoot, 'agent/goals/publication_followup.md', '# publication followup goal\n');
  writeFixture(
    routeCurrentPackRoot,
    'agent/lineage/publication_followup.json',
    `${JSON.stringify({ stage_id: 'publication_followup' })}\n`,
  );
  const currentDeclaredStageIds = ['intake', 'draft', 'review', 'publication_followup'];
  const launchedInputs: ReturnType<typeof stageRunInput>[] = [];
  let temporalStarts = 0;
  let packageReadinessCalls = 0;
  let hideNextPersistedLookup = false;
  const dependencies = {
    findTargetStageRun: (stageRunId: string) => {
      if (hideNextPersistedLookup) {
        hideNextPersistedLookup = false;
        return null;
      }
      return findStageRunLaunch(db, stageRunId)?.stage_run_input ?? null;
    },
    ensurePackageLaunchReady: async () => {
      packageReadinessCalls += 1;
      return {
        launch_allowed: true,
        runtime_source_readiness: { checkout_path: routeCurrentPackRoot },
        package_use_binding: packageUseBinding({
          packageVersion: packageReadinessCalls === 1 ? '0.2.1' : '0.2.2',
        }),
      } as any;
    },
    resolveStageBinding: (_root: string, stageId: string) => currentDeclaredStageIds.includes(stageId)
      ? binding(stageId, ['agent/sources/request.md'], currentDeclaredStageIds)
      : null,
    launchTargetStageRun: async (target: ReturnType<typeof stageRunInput>) => {
      launchedInputs.push(target);
      return await launchRegisteredStageRun({
        db,
        stageRunInput: target,
        start: true,
        startWorkflow: async () => {
          temporalStarts += 1;
          return temporalStartReceipt(target);
        },
      });
    },
  };
  try {
    const aToB = {
      parent_stage_run: parent,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-a',
      decisive_execution_content_binding: decisiveExecutionBinding(parent, currentDeclaredStageIds),
      decision: {
        decision_kind: 'advance' as const,
        target_stage_id: 'draft',
        evidence_refs: ['artifact:a'],
      },
      artifact_refs: [artifactFixtures.a!.ref],
      artifact_hashes: [artifactFixtures.a!.sha256],
      artifact_identity_receipt_refs: [],
    };
    const first = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(first.materialization_status, 'launched');
    assert.equal(first.decision.target_stage_id, 'draft');
    assert.equal(first.durable_launch?.start_status, 'started');
    assert.equal(temporalStarts, 1);
    assert.equal(packageReadinessCalls, 1);
    const stageRunB = launchedInputs.at(-1)!;
    assert.deepEqual(stageRunB.stage_run_spec.input_artifacts, [{
      ref: artifactFixtures.a!.ref,
      sha256: artifactFixtures.a!.sha256,
      identity_receipt_ref: null,
    }]);
    assert.equal(stageRunB.parent_route_decision_ref, first.parent_route_decision_ref);

    const replay = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(replay.materialization_status, 'existing');
    assert.equal(replay.target_stage_run_id, first.target_stage_run_id);
    assert.equal(temporalStarts, 1);
    assert.equal(packageReadinessCalls, 1);

    hideNextPersistedLookup = true;
    const concurrentReplay = await materializeStageRunRoute(aToB, dependencies);
    assert.equal(concurrentReplay.materialization_status, 'existing');
    assert.equal(concurrentReplay.target_stage_run_spec_sha256, first.target_stage_run_spec_sha256);
    assert.equal(temporalStarts, 1);
    assert.equal(packageReadinessCalls, 2);
    assert.equal(
      launchedInputs.at(-1)?.stage_run_spec_sha256,
      first.target_stage_run_spec_sha256,
    );

    const bToA = await materializeStageRunRoute({
      parent_stage_run: stageRunB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-b',
      decisive_execution_content_binding: decisiveExecutionBinding(stageRunB, currentDeclaredStageIds),
      decision: {
        decision_kind: 'route_back',
        target_stage_id: 'intake',
        evidence_refs: ['artifact:b', 'finding:route-back'],
      },
      artifact_refs: [artifactFixtures.b!.ref],
      artifact_hashes: [artifactFixtures.b!.sha256],
      artifact_identity_receipt_refs: [],
    }, dependencies);
    assert.equal(bToA.materialization_status, 'launched');
    assert.notEqual(bToA.target_stage_run_id, parent.stage_run_id);
    assert.equal(temporalStarts, 2);

    const laterDecision = await materializeStageRunRoute({
      ...aToB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-a-later',
      decision: { ...aToB.decision, evidence_refs: ['artifact:a-v2'] },
    }, dependencies);
    assert.notEqual(laterDecision.target_stage_run_id, first.target_stage_run_id);
    assert.equal(temporalStarts, 3);

    const complete = await materializeStageRunRoute({
      ...aToB,
      decision: { decision_kind: 'complete', evidence_refs: ['artifact:final'] },
    }, {
      launchTargetStageRun: async () => assert.fail('complete must not start another StageRun'),
      ensurePackageLaunchReady: async () => assert.fail('complete must not refresh a package binding'),
      resolveStageBinding: () => assert.fail('complete must not resolve a target binding'),
    });
    assert.equal(complete.materialization_status, 'workflow_complete');
    assert.equal(complete.target_stage_run_id, null);
    assert.equal(temporalStarts, 3);

    await assert.rejects(materializeStageRunRoute({
      ...aToB,
      decision: {
        decision_kind: 'advance',
        target_stage_id: 'undeclared-stage',
        evidence_refs: ['artifact:a'],
      },
    }, dependencies), (error: any) => {
      assert.equal(error.details?.failure_code, 'route_target_stage_not_declared_by_decisive_attempt');
      return true;
    });
    assert.equal(temporalStarts, 3);

    const newlyDeclared = await materializeStageRunRoute({
      ...aToB,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-current-package',
      decision: {
        decision_kind: 'advance',
        target_stage_id: 'publication_followup',
        evidence_refs: ['artifact:a'],
      },
    }, dependencies);
    assert.equal(newlyDeclared.materialization_status, 'launched');
    assert.equal(newlyDeclared.target_stage_run_id, launchedInputs.at(-1)?.stage_run_id);
    assert.deepEqual(launchedInputs.at(-1)?.declared_stage_ids, currentDeclaredStageIds);
    assert.equal(temporalStarts, 4);
  } finally {
    db.close();
    fs.rmSync(routeCurrentPackRoot, { recursive: true, force: true });
  }
});

test('Hosted action invocation replays one action run and separates later runs', () => {
  const input = {
    domainId: 'mas',
    stageId: 'intake',
    actionId: 'draft-paper',
    runId: 'hosted-run-one',
    actionRunRef: 'file:///tmp/workspace/.opl/action-runs/hosted-run-one',
  };
  const first = buildHostedActionStageRunInvocationId(input);
  assert.equal(buildHostedActionStageRunInvocationId(input), first);
  assert.notEqual(buildHostedActionStageRunInvocationId({
    ...input,
    runId: 'hosted-run-two',
    actionRunRef: 'file:///tmp/workspace/.opl/action-runs/hosted-run-two',
  }), first);
});

test('registered StageRun replay does not refresh package readiness or resolve a new binding', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-readiness-replay-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let readinessCalls = 0;
  let bindingCalls = 0;
  const args = [
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'intake',
    '--provider',
    'temporal',
    '--workspace-locator',
    JSON.stringify({ workspace_root: workspaceRoot, domain_pack_root: domainPackRoot }),
    '--source-fingerprint',
    manifestFixture.sha256,
    '--stage-run-invocation-id',
    'sri_registered_readiness_replay',
    '--start',
  ];
  const runtime = {
    stageRunRuntime: {
      ensurePackageLaunchReady: (async () => {
        readinessCalls += 1;
        return {
          runtime_source_readiness: {
            checkout_path: domainPackRoot,
            operational_ready: true,
          },
          package_use_binding: packageUseBinding(),
        };
      }) as any,
      resolveStageBinding: () => {
        bindingCalls += 1;
        return binding();
      },
      startWorkflow: async (input: ReturnType<typeof stageRunInput>) => temporalStartReceipt(input),
      describeWorkflow: async (input: ReturnType<typeof stageRunInput>) => temporalStartReceipt(input),
    },
  };
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const first = await runFamilyRuntime(args, runtime) as any;
    assert.equal(first.family_runtime_stage_run.durable_launch.start_status, 'started');
    assert.equal(readinessCalls, 1);
    assert.equal(bindingCalls, 1);

    readinessCalls = 0;
    bindingCalls = 0;
    const replay = await runFamilyRuntime(args, runtime) as any;
    assert.equal(replay.family_runtime_stage_run.durable_launch.start_status, 'existing');
    assert.equal(readinessCalls, 0);
    assert.equal(bindingCalls, 0);
    assert.deepEqual(
      replay.family_runtime_stage_run.stage_run_input,
      first.family_runtime_stage_run.stage_run_input,
    );
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('attempt create freezes one CLI-selected Codex executor policy into the StageRun immutable spec', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-executor-policy-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const result = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'intake',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({ workspace_root: workspaceRoot, domain_pack_root: domainPackRoot }),
      '--source-fingerprint',
      manifestFixture.sha256,
      '--stage-run-invocation-id',
      'sri_luna_stage_policy',
      '--executor-provider',
      'gflab',
      '--executor-model',
      'gpt-5.6-luna',
      '--executor-reasoning-effort',
      'high',
    ], {
      stageRunRuntime: {
        ensurePackageLaunchReady: async () => ({
          runtime_source_readiness: {
            checkout_path: domainPackRoot,
            operational_ready: true,
          },
          package_use_binding: packageUseBinding(),
        }) as any,
        resolveStageBinding: () => binding(),
      },
    }) as any;

    const stageRunInput = result.family_runtime_stage_run.stage_run_input;
    assert.deepEqual(stageRunInput.stage_attempt_executor_policy, {
      executor_kind: 'codex_cli',
      provider: 'gflab',
      model: 'gpt-5.6-luna',
      reasoning_effort: 'high',
    });
    assert.deepEqual(
      stageRunInput.stage_run_spec.stage_attempt_executor_policy,
      stageRunInput.stage_attempt_executor_policy,
    );
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('attempt create ignores an active identity-unresolved row owned by another workspace', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-cross-workspace-unresolved-'));
  const otherWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-other-workspace-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const seeded = openQueueDb();
    const unrelated = createStageAttempt(seeded.db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: otherWorkspaceRoot },
      sourceFingerprint: 'sha256:unrelated-unresolved-runtime-row',
      scopeKind: 'domain',
    }).attempt;
    seeded.db.prepare(`
      UPDATE stage_attempts
      SET status = 'running', scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved'
      WHERE stage_attempt_id = ?
    `).run(unrelated.stage_attempt_id);
    seeded.db.close();

    const result = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'intake',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({ workspace_root: workspaceRoot, domain_pack_root: domainPackRoot }),
      '--source-fingerprint',
      manifestFixture.sha256,
      '--stage-run-invocation-id',
      'sri_cross_workspace_unresolved',
    ], {
      stageRunRuntime: {
        ensurePackageLaunchReady: async () => ({
          runtime_source_readiness: {
            checkout_path: domainPackRoot,
            operational_ready: true,
          },
          package_use_binding: packageUseBinding(),
        }) as any,
        resolveStageBinding: () => binding(),
      },
    }) as any;

    assert.equal(result.family_runtime_stage_run.stage_run_input.workspace_locator.workspace_root, workspaceRoot);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(otherWorkspaceRoot, { recursive: true, force: true });
  }
});

test('attempt create remains blocked by an active identity-unresolved row in the same workspace', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-same-workspace-unresolved-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const seeded = openQueueDb();
    const conflicting = createStageAttempt(seeded.db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: workspaceRoot },
      sourceFingerprint: 'sha256:same-workspace-unresolved-runtime-row',
      scopeKind: 'domain',
    }).attempt;
    seeded.db.prepare(`
      UPDATE stage_attempts
      SET status = 'running', scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved'
      WHERE stage_attempt_id = ?
    `).run(conflicting.stage_attempt_id);
    seeded.db.close();

    await assert.rejects(
      runFamilyRuntime([
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        'intake',
        '--provider',
        'temporal',
        '--workspace-locator',
        JSON.stringify({ workspace_root: workspaceRoot, domain_pack_root: domainPackRoot }),
        '--source-fingerprint',
        manifestFixture.sha256,
        '--stage-run-invocation-id',
        'sri_same_workspace_unresolved',
      ], {
        stageRunRuntime: {
          ensurePackageLaunchReady: async () => assert.fail('identity admission must precede package readiness'),
          resolveStageBinding: () => assert.fail('identity admission must precede binding resolution'),
        },
      }),
      (error: any) => {
        assert.equal(error.details?.failure_code, 'runtime_execution_identity_unresolved');
        return true;
      },
    );
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
