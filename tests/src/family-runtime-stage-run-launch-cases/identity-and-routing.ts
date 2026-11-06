import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
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
import { createCordisBaseHeadlessComposition } from '../../../src/host/composition-profiles.ts';
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
  const parent = stageRunInput({
    invocationId: 'sri_initial_a',
    stageId: 'intake',
    routeBudget: { max_route_back_rounds: 3, route_back_rounds_used: 2 },
  });
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
        runtime_source_readiness: {
          status: 'current',
          operational_ready: true,
          checkout_path: routeCurrentPackRoot,
        },
        configured_carrier: {
          status: 'installed',
          executor: { status: 'callable' },
          plugin_source_path: routeCurrentPackRoot,
        },
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
    const routeBackTarget = launchedInputs.at(-1)!;

    const exhausted = await materializeStageRunRoute({
      parent_stage_run: routeBackTarget,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-b-exhausted',
      decisive_execution_content_binding: decisiveExecutionBinding(routeBackTarget, currentDeclaredStageIds),
      decision: {
        decision_kind: 'route_back',
        target_stage_id: 'intake',
        evidence_refs: ['artifact:b', 'finding:route-back'],
      },
      artifact_refs: [artifactFixtures.b!.ref],
      artifact_hashes: [artifactFixtures.b!.sha256],
      artifact_identity_receipt_refs: [],
    }, {
      ...dependencies,
      launchTargetStageRun: async () => assert.fail('route-back budget must prevent a fourth launch'),
    });
    assert.equal(exhausted.materialization_status, 'route_budget_exhausted');
    assert.equal(exhausted.target_stage_run_id, null);

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

test('a controller route target StageRun binds the target Stage own declared action', async () => {
  const db = new DatabaseSync(':memory:');
  const parent = stageRunInput({
    invocationId: 'sri_action_binding_parent',
    stageId: 'intake',
    routeBudget: { max_route_back_rounds: 3, route_back_rounds_used: 0 },
  });
  // A pack that registers one single-Stage action per Stage (the MAS shape). The
  // parent action `draft-paper` declares only `intake`; the target Stage `draft`
  // is declared by its own action `draft-artifact`.
  const routePackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-route-action-pack-'));
  fs.cpSync(domainPackRoot, routePackRoot, { recursive: true });
  writeFixture(routePackRoot, 'contracts/input.schema.json', '{}\n');
  writeFixture(routePackRoot, 'contracts/output.schema.json', '{}\n');
  const action = (actionId: string, stageId: string) => ({
    action_id: actionId,
    title: actionId,
    summary: actionId,
    owner: 'medautoscience',
    effect: 'mutating',
    execution_binding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
    input_schema_ref: 'contracts/input.schema.json',
    output_schema_ref: 'contracts/output.schema.json',
    required_fields: ['workspace_root'],
    optional_fields: [],
    workspace_locator_fields: ['workspace_root'],
    human_gate_ids: [],
    stage_route: {
      entry_stage_ref: stageId,
      required_stage_refs: [stageId],
      optional_stage_refs: [],
      terminal_stage_refs: [stageId],
      route_policy: 'ai_selected_progress_route',
    },
    supported_surfaces: {
      cli: { surface_kind: 'domain_cli' },
      mcp: { tool_name: `mas_${actionId}`, surface_kind: 'domain_mcp' },
      skill: { command_contract_id: `mas.${actionId}`, surface_kind: 'domain_skill' },
      product_entry: { action_key: actionId, surface_kind: 'domain_product_entry' },
      openai: { tool_name: `mas_${actionId}` },
      ai_sdk: { tool_name: `mas_${actionId}` },
    },
    authority_boundary: {},
  });
  writeFixture(routePackRoot, 'contracts/action_catalog.json', `${JSON.stringify({
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'mas_actions',
    target_domain_id: 'medautoscience',
    owner: 'medautoscience',
    authority_boundary: {
      domain_truth_owner: 'medautoscience',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [action('draft-paper', 'intake'), action('draft-artifact', 'draft')],
    notes: [],
  })}\n`);
  const launchedInputs: ReturnType<typeof stageRunInput>[] = [];
  const dependencies = {
    findTargetStageRun: (stageRunId: string) => findStageRunLaunch(db, stageRunId)?.stage_run_input ?? null,
    ensurePackageLaunchReady: async () => ({
      launch_allowed: true,
      runtime_source_readiness: {
        status: 'current',
        operational_ready: true,
        checkout_path: routePackRoot,
      },
      configured_carrier: {
        status: 'installed',
        executor: { status: 'callable' },
        plugin_source_path: routePackRoot,
      },
      package_use_binding: packageUseBinding({ targetRoot: routePackRoot }),
    }) as any,
    resolveStageBinding: (_root: string, stageId: string) => binding(stageId, ['agent/sources/request.md']),
    launchTargetStageRun: async (target: ReturnType<typeof stageRunInput>) => {
      launchedInputs.push(target);
      return await launchRegisteredStageRun({
        db,
        stageRunInput: target,
        start: true,
        startWorkflow: async () => temporalStartReceipt(target),
      });
    },
  };
  try {
    const routeInput = {
      parent_stage_run: parent,
      decisive_attempt_ref: 'opl://stage_attempts/reviewer-action-binding',
      decisive_execution_content_binding: decisiveExecutionBinding(parent),
      decision: {
        decision_kind: 'advance',
        target_stage_id: 'draft',
        evidence_refs: ['artifact:a'],
      },
      artifact_refs: [artifactFixtures.a!.ref],
      artifact_hashes: [artifactFixtures.a!.sha256],
      artifact_identity_receipt_refs: [],
    } as Parameters<typeof materializeStageRunRoute>[0];
    const receipt = await materializeStageRunRoute(routeInput, dependencies);
    assert.equal(receipt.materialization_status, 'launched');
    const target = launchedInputs.at(-1)!;
    assert.equal(target.stage_id, 'draft');
    // The target StageRun must carry the target Stage own action, not the parent's.
    assert.equal(target.action_id, 'draft-artifact');
    assert.notEqual(target.action_id, parent.action_id);
    const replay = await materializeStageRunRoute(routeInput, dependencies);
    assert.equal(replay.materialization_status, 'existing');
    assert.equal(replay.target_stage_run_id, receipt.target_stage_run_id);

    const catalogPath = path.join(routePackRoot, 'contracts/action_catalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    catalog.actions[0].stage_route.required_stage_refs.push('draft');
    fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    await materializeStageRunRoute({ ...routeInput, decisive_attempt_ref: 'artifact:multi-stage-action' }, dependencies);
    assert.equal(launchedInputs.at(-1)!.action_id, parent.action_id);

    catalog.actions[0].stage_route.required_stage_refs = ['intake'];
    catalog.actions.push(action('another-draft', 'draft'));
    fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    await assert.rejects(
      materializeStageRunRoute({ ...routeInput, decisive_attempt_ref: 'artifact:ambiguous-action' }, dependencies),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'route_target_action_binding_ambiguous',
    );
  } finally {
    db.close();
    fs.rmSync(routePackRoot, { recursive: true, force: true });
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
  const host = await createCordisBaseHeadlessComposition();
  const runtime = {
    createStageRouteComposition: host.services.childFactories.createStageRouteComposition,
    stageRunRuntime: {
      ensurePackageLaunchReady: (async () => {
        readinessCalls += 1;
        return {
          runtime_source_readiness: {
            status: 'current',
            checkout_path: domainPackRoot,
            operational_ready: true,
          },
          package_use_binding: packageUseBinding(),
          native_package_closure: packageUseBinding(),
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
    assert.equal(
      first.family_runtime_stage_run.stage_run_input.stage_run_spec.package_closure
        .root_package.package_id,
      'mas',
    );
    assert.equal(first.family_runtime_stage_run.stage_run_input.stage_run_spec
      .workspace_identity.native_package_closure, undefined);
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
    await host.dispose();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('workspace-bound launch ignores an unresolved legacy row with no workspace identity', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-orphan-legacy-row-'));
  const candidateWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-current-workspace-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const host = await createCordisBaseHeadlessComposition();
  try {
    const { db } = openQueueDb();
    const legacyAttempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'intake',
      providerKind: 'temporal',
      workspaceLocator: {},
      sourceFingerprint: 'sha256:legacy-row-without-workspace-identity',
      scopeKind: 'domain',
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET scope_kind = 'identity_unresolved', identity_state = 'identity_unresolved'
      WHERE stage_attempt_id = ?
    `).run(legacyAttempt.stage_attempt_id);
    db.close();

    const created = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'intake',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({ workspace_root: candidateWorkspace }),
      '--source-fingerprint',
      sha256('current-workspace-launch'),
    ], {
      createStageRouteComposition: host.services.childFactories.createStageRouteComposition,
      stageRunRuntime: {
        ensurePackageLaunchReady: (async () => ({
          launch_allowed: true,
          effective_runtime_checkout_path: domainPackRoot,
          installed_carrier_readback: {
            kind: 'local',
            lifecycle_authority: 'carrier_owned',
            source_ref: domainPackRoot,
          },
          installed_readiness: {
            installed: true,
            physical_status: 'available',
            callability: 'callable',
          },
          package_use_binding: packageUseBinding(),
          native_package_closure: packageUseBinding(),
        })) as any,
        resolveStageBinding: () => binding(),
      },
    }) as any;
    assert.equal(created.family_runtime_stage_run.durable_launch.start_status, 'registered');
    assert.match(created.family_runtime_stage_run.stage_run_input.stage_run_id, /^sr_/);

    const { db: readbackDb } = openQueueDb();
    const legacyReadback = readbackDb.prepare(`
      SELECT status, scope_kind, identity_state, workspace_locator_json
      FROM stage_attempts
      WHERE stage_attempt_id = ?
    `).get(legacyAttempt.stage_attempt_id) as Record<string, unknown>;
    readbackDb.close();
    assert.equal(legacyReadback.status, 'queued');
    assert.equal(legacyReadback.scope_kind, 'identity_unresolved');
    assert.equal(legacyReadback.identity_state, 'identity_unresolved');
    assert.deepEqual(JSON.parse(String(legacyReadback.workspace_locator_json)), {});
  } finally {
    await host.dispose();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(candidateWorkspace, { recursive: true, force: true });
  }
});
