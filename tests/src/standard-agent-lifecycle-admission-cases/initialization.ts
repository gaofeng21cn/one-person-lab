import {
  assert,
  canonicalJsonBytes,
  fs,
  path,
  test,
  digest,
  initializationAuthorityHandler,
  inspectStandardAgentActionRunBinding,
  inspectStandardAgentActionRunPlan,
  nativeManagedCheckout,
  runStandardAgentAction,
  standardAgentLifecycleInitializationHandlerRunId,
  temporaryRoot,
  writeIdentityOnlyLifecycleWorkspace,
  writeJson,
  writeLifecycleContracts,
  writeLifecycleWorkspace,
  writeNativeCarrierDescriptor,
} from './shared.ts';

function stageDependencies(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  runHandler: ReturnType<typeof initializationAuthorityHandler>;
  onAttempt: () => void;
}) {
  return {
    resolveManagedCheckout: async () => ({
      ...nativeManagedCheckout(input.checkoutRoot, input.workspaceRoot),
    }) as never,
    compileStageManifest: (() => ({})) as never,
    recordLedger: ((value: Record<string, unknown>) => ({
      ledger_entry: { run_id: value.runId, status: value.status },
      recorded_event: { event_type: 'standard_agent_action_run_recorded' },
    })) as never,
    runHandler: input.runHandler as never,
    runStageRuntime: async (args: string[]) => {
      if (args[0] === 'attempt') {
        input.onAttempt();
        return {
          family_runtime_stage_run: {
            stage_run_input: { workflow_id: 'wf-initialized-stage' },
            blocked_reason: null,
            temporal_start: { start_status: 'started' },
          },
        };
      }
      return { family_runtime_stage_run_query: { status: 'running' } };
    },
  };
}

function writeWorkspaceRegistryBinding(stateRoot: string, workspaceRoot: string) {
  writeJson(path.join(stateRoot, 'workspace-registry.json'), {
    version: 'g2',
    bindings: [{
      binding_id: `binding-${path.basename(workspaceRoot)}`,
      project_scope_id: `project-scope-${path.basename(workspaceRoot)}`,
      project_id: 'medautoscience',
      project: 'mas',
      workspace_path: fs.realpathSync.native(workspaceRoot),
      label: null,
      status: 'active',
      direct_entry: { command: null, manifest_command: null, url: null, workspace_locator: null },
      created_at: '2026-08-26T00:00:00.000Z',
      updated_at: '2026-08-26T00:00:00.000Z',
      archived_at: null,
    }],
  });
}

test('identity-only work item is owner-initialized before Stage launch and freezes the post-CAS scope', async () => {
  const fixtureRoot = temporaryRoot('opl-lifecycle-initialization-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let handlerCalls = 0;
  let attemptCalls = 0;
  try {
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    writeLifecycleContracts(checkoutRoot);
    writeNativeCarrierDescriptor(checkoutRoot);
    writeIdentityOnlyLifecycleWorkspace(workspaceRoot);
    writeWorkspaceRegistryBinding(stateRoot, workspaceRoot);
    const payload = { study_id: 'study-001', value: 1 };
    const runId = 'initialized-stage';
    const invocationSha256 = digest(canonicalJsonBytes({
      canonical_domain_id: 'mas',
      action_id: 'launch_stage',
      run_id: runId,
      workspace_root: fs.realpathSync.native(workspaceRoot),
      request_payload_sha256: digest(canonicalJsonBytes(payload)),
      timeout_ms: null,
    }));
    const childRunId = standardAgentLifecycleInitializationHandlerRunId({
      domainId: 'mas',
      actionId: 'launch_stage',
      runId,
      workItemId: 'study-001',
      originalInvocationSha256: invocationSha256,
    });
    const result = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot, payload, runId,
    }, stageDependencies({
      checkoutRoot,
      workspaceRoot,
      runHandler: initializationAuthorityHandler(workspaceRoot, () => { handlerCalls += 1; }),
      onAttempt: () => { attemptCalls += 1; },
    }));

    assert.equal(result.standard_agent_action_run.execution_kind, 'stage_binding');
    if (result.standard_agent_action_run.execution_kind !== 'stage_binding') {
      assert.fail('expected initialized Stage action result');
    }
    assert.equal(result.standard_agent_action_run.domain_lifecycle_admission.status,
      'admitted_by_current_initialization_receipt');
    assert.equal(handlerCalls, 1);
    assert.equal(attemptCalls, 1);
    const lifecycle = JSON.parse(fs.readFileSync(
      path.join(workspaceRoot, 'studies', 'study-001', 'control', 'lifecycle.json'),
      'utf8',
    ));
    assert.equal(lifecycle.lifecycle_state, 'active');
    assert.equal(lifecycle.lifecycle_generation, 1);
    const inventory = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'workspace_index.json'), 'utf8'));
    assert.equal(inventory.studies[0].lifecycle_ref, 'control/lifecycle.json');
    const childPlan = inspectStandardAgentActionRunPlan({ workspaceRoot, runId: childRunId });
    const parentPlan = inspectStandardAgentActionRunPlan({ workspaceRoot, runId });
    const frozenAdmission = parentPlan?.effective_payload?.lifecycle_admission as Record<string, unknown>;
    assert.equal(frozenAdmission.mode, 'initialization_receipt');
    assert.notEqual(parentPlan?.execution_scope?.inventory_digest, childPlan?.execution_scope?.inventory_digest);
    assert.equal(parentPlan?.execution_scope?.inventory_digest,
      result.standard_agent_action_run.execution_scope?.inventory_digest);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('existing lifecycle never enters initialization authority', async () => {
  const fixtureRoot = temporaryRoot('opl-lifecycle-existing-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let handlerCalls = 0;
  let attemptCalls = 0;
  try {
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    writeLifecycleContracts(checkoutRoot);
    writeNativeCarrierDescriptor(checkoutRoot);
    writeLifecycleWorkspace(workspaceRoot);
    writeWorkspaceRegistryBinding(stateRoot, workspaceRoot);
    writeJson(path.join(workspaceRoot, 'studies', '001', 'control', 'lifecycle.json'), {
      study_id: 'study-001', lifecycle_state: 'active', lifecycle_generation: 7,
    });
    const inventory = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'workspace_index.json'), 'utf8'));
    inventory.studies[0].status = 'active';
    writeJson(path.join(workspaceRoot, 'workspace_index.json'), inventory);
    const result = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
      payload: { study_id: 'study-001', value: 1 }, runId: 'existing-active-stage',
    }, stageDependencies({
      checkoutRoot,
      workspaceRoot,
      runHandler: initializationAuthorityHandler(workspaceRoot, () => { handlerCalls += 1; }),
      onAttempt: () => { attemptCalls += 1; },
    }));
    assert.equal(result.standard_agent_action_run.execution_kind, 'stage_binding');
    if (result.standard_agent_action_run.execution_kind !== 'stage_binding') {
      assert.fail('expected existing-lifecycle Stage action result');
    }
    assert.equal(result.standard_agent_action_run.domain_lifecycle_admission.status,
      'admitted_by_canonical_active_lifecycle');
    assert.equal(handlerCalls, 0);
    assert.equal(attemptCalls, 1);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('identity-only initialization fails closed when inventory CAS becomes stale', async () => {
  const fixtureRoot = temporaryRoot('opl-lifecycle-initialization-stale-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let attemptCalls = 0;
  try {
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    writeLifecycleContracts(checkoutRoot);
    writeNativeCarrierDescriptor(checkoutRoot);
    writeIdentityOnlyLifecycleWorkspace(workspaceRoot);
    writeWorkspaceRegistryBinding(stateRoot, workspaceRoot);
    const baseHandler = initializationAuthorityHandler(workspaceRoot, () => {});
    const staleHandler = (input: { request: unknown }) => {
      const receipt = baseHandler(input);
      writeJson(path.join(workspaceRoot, 'workspace_index.json'), {
        studies: [{ study_id: 'study-001', study_root: 'studies/study-001', concurrent_marker: true }],
      });
      return receipt;
    };
    const runId = 'stale-initialization-stage';
    await assert.rejects(runStandardAgentAction({
      domainId: 'mas', actionId: 'launch_stage', workspaceRoot,
      payload: { study_id: 'study-001', value: 1 }, runId,
    }, stageDependencies({
      checkoutRoot,
      workspaceRoot,
      runHandler: staleHandler as never,
      onAttempt: () => { attemptCalls += 1; },
    })), /precondition|current exact bytes|CAS/u);
    assert.equal(attemptCalls, 0);
    assert.equal(inspectStandardAgentActionRunBinding({ workspaceRoot, runId }), null);
    assert.equal(fs.existsSync(path.join(
      workspaceRoot, 'studies', 'study-001', 'control', 'lifecycle.json',
    )), false);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
