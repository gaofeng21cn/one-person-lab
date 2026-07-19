import {
  assert,
  fs,
  os,
  path,
  test,
  assertRepoJsonSchemaPayload,
  InMemoryActivationRuntime,
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerVersionRegistry,
  FunctionFoundryDesignerAdapter,
  ManifestFoundryDesignerAdapter,
  readFoundryProviderManifest,
  FoundryKernel,
  FoundryTransientActivityError,
  foundryContentDigest,
  validateFoundryProtocolFixtureSet,
  createProductionFoundryKernel,
  compileStandardAgentStageManifest,
  ownerGate,
  authorizeRunMutation,
  authorizeRollback,
  request,
  blueprint,
  FixtureDesigner,
  evidence,
  FixtureEvaluator,
  activateCreateRun,
} from './shared.ts';
import type {
  CandidateCompiler,
  DesignerPort,
  EvaluationExecutor,
  FoundryEventStore,
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
  EvolutionProposal,
  resolveStandardAgentManagedCheckout,
} from './shared.ts';

test('file-backed Foundry truth survives restart and rebuilds its SQLite projection', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-persistent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const content = new FileFoundryContentStore(root);
  const promptV1 = content.put(Buffer.from('fixture prompt v1\n'));
  const promptV2 = content.put(Buffer.from('fixture prompt v2\n'));
  const skill = content.put(Buffer.from('fixture skill\n'));
  const knowledge = content.put(Buffer.from('fixture knowledge\n'));
  const model = content.put(Buffer.from('fixture model lock\n'));
  const inputSchema = content.put(Buffer.from('{"type":"object","title":"fixture input"}\n'));
  const outputSchema = content.put(Buffer.from('{"type":"object","title":"fixture output"}\n'));
  const bindResources = (value: AgentBlueprint, promptRef: string) => {
    value.stage_graph.stages[0]!.prompt_ref = promptRef;
    value.stage_graph.stages[0]!.skill_refs = [skill.ref];
    value.stage_graph.stages[0]!.knowledge_refs = [knowledge.ref];
    value.content_refs.prompt_refs = [promptRef];
    value.content_refs.skill_refs = [skill.ref];
    value.content_refs.knowledge_refs = [knowledge.ref];
    value.content_refs.model_refs = [model.ref];
    value.actions[0]!.input_schema_ref = inputSchema.ref;
    value.actions[0]!.output_schema_ref = outputSchema.ref;
    value.artifact_contracts[0]!.schema_ref = outputSchema.ref;
    value.content_refs.schema_refs = [inputSchema.ref, outputSchema.ref];
    return value;
  };
  const semanticDesigner = new FixtureDesigner();
  const persistentDesigner: DesignerPort = {
    producer_id: 'designer:persistent-fixture',
    async design(designRequest) {
      return bindResources(await semanticDesigner.design(designRequest), promptV1.ref);
    },
    async diagnose(input) {
      const proposal = await semanticDesigner.diagnose(input);
      proposal.next_blueprint = bindResources(proposal.next_blueprint, promptV2.ref);
      return proposal;
    },
  };
  const persistentEvaluator: EvaluationExecutor = {
    evaluator_id: 'evaluator:fixture',
    async evaluate(input) {
      return evidence({
        runId: input.run_id,
        designRequest: input.request,
        agentBlueprint: input.blueprint,
        candidate: input.candidate,
        baselineDigest: input.baseline_version?.version_digest ?? null,
        qualified: input.blueprint.generation > 0,
      });
    },
    async canary(input) {
      return evidence({
        runId: input.run_id,
        designRequest: input.request,
        agentBlueprint: input.blueprint,
        candidate: input.candidate,
        baselineDigest: input.baseline_version?.version_digest ?? null,
        qualified: true,
      });
    },
  };
  const buildKernel = (options: {
    events?: FoundryEventStore;
    now?: string;
    propagateTransientActivityFailures?: boolean;
  } = {}) => {
    const versions = new LedgerVersionRegistry(root);
    return new FoundryKernel({
      designer: persistentDesigner,
      evaluator: persistentEvaluator,
      compiler: new ContentAddressedCandidateCompiler(root),
      objects: new FileFoundryObjectStore(root),
      events: options.events ?? new LedgerFoundryEventStore(root),
      versions,
      activationRuntime: new InMemoryActivationRuntime(versions),
      ownerGate,
      clock: { now: () => options.now ?? '2026-07-16T00:00:00.000Z' },
      propagateTransientActivityFailures: options.propagateTransientActivityFailures,
    });
  };

  const firstKernel = buildKernel();
  const completed = await activateCreateRun(
    firstKernel,
    'run:persistent',
    request(),
    () => new LedgerFoundryEventStore(root).read('run:persistent'),
  );
  assert.equal(completed.run.state, 'completed_active');
  const [version] = await firstKernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(version);

  const compiler = new ContentAddressedCandidateCompiler(root);
  const candidateDirectory = compiler.candidateDirectory(version!.candidate_digest);
  const before = fs.readFileSync(path.join(candidateDirectory, 'agent-blueprint.json'));

  const restartedKernel = buildKernel();
  const restarted = await restartedKernel.inspectRun('run:persistent');
  assert.equal(restarted.run.last_event_hash, completed.run.last_event_hash);
  assert.equal(restarted.activation.active_version_digest, version!.version_digest);
  assert.deepEqual(
    await restartedKernel.listVersions('fixture-agent', 'fixture-domain'),
    [version],
  );

  const eventStore = new LedgerFoundryEventStore(root);
  fs.rmSync(path.join(root, 'state-index.sqlite'), { force: true });
  eventStore.rebuildStateIndex();
  assert.equal((await eventStore.list())[0]!.state, 'completed_active');

  const improveRequest = request({
    request_id: 'request:persistent-improve',
    mode: 'improve',
    target_version_ref: version!.version_digest,
  });
  await restartedKernel.startRun({ request: improveRequest, run_id: 'run:persistent-improve' });
  const activeAfterImprove = await restartedKernel.advanceUntilPause('run:persistent-improve');
  assert.equal(activeAfterImprove.run.state, 'completed_active');
  assert.notEqual(activeAfterImprove.activation.active_version_digest, version!.version_digest);

  const rollback = await restartedKernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: version!.version_digest,
    expected_revision: 2,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: version!.version_digest,
      expected_revision: 2,
    }),
  });
  assert.equal(rollback.to_version_digest, version!.version_digest);
  assert.deepEqual(fs.readFileSync(path.join(candidateDirectory, 'agent-blueprint.json')), before);

  const durableCrashEvents = new LedgerFoundryEventStore(root);
  let failActivationAppend = true;
  const crashEvents: FoundryEventStore = {
    create: (input) => durableCrashEvents.create(input),
    read: (runId) => durableCrashEvents.read(runId),
    list: () => durableCrashEvents.list(),
    append: async (input) => {
      if (failActivationAppend && input.event.event_type === 'activation_completed') {
        failActivationAppend = false;
        throw new FoundryTransientActivityError('injected activation event append outage');
      }
      return durableCrashEvents.append(input);
    },
  };
  const crashRequest = request({
    request_id: 'request:activation-event-recovery',
    target_agent_id: 'activation-event-recovery-agent',
    target_domain_id: 'activation_event_recovery',
  });
  ownerGate.registerAuthorityPolicy({
    policy_ref: 'opl://foundry/authority-policies/activation-event-recovery-agent',
    target_agent_id: crashRequest.target_agent_id,
    target_domain_id: crashRequest.target_domain_id,
    authority_refs: ['owner-gate:activation'],
  });
  const crashKernel = buildKernel({
    events: crashEvents,
    now: '2026-07-16T00:05:00.000Z',
    propagateTransientActivityFailures: true,
  });
  await crashKernel.startRun({ request: crashRequest, run_id: 'run:activation-event-recovery' });
  let crashGate = await crashKernel.advanceUntilPause('run:activation-event-recovery');
  crashGate = await crashKernel.submitOwnerDecision({
    run_id: crashGate.run.run_id,
    expected_revision: crashGate.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: crashGate,
      action: 'approve_canary',
      decision: 'approve',
    }),
  });
  const activating = await crashKernel.submitOwnerDecision({
    run_id: crashGate.run.run_id,
    expected_revision: crashGate.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: crashGate,
      action: 'approve_active',
      decision: 'approve',
    }),
  }, { advance: false });
  assert.equal(activating.run.state, 'activating');
  await assert.rejects(
    crashKernel.advanceRunStep(activating.run.run_id),
    /injected activation event append outage/,
  );
  assert.equal((await crashKernel.inspectRun(activating.run.run_id)).run.state, 'activating');
  assert.equal((await new LedgerVersionRegistry(root).activation(
    crashRequest.target_agent_id,
    crashRequest.target_domain_id,
  )).revision, 1);
  const [durableActivation] = await new LedgerVersionRegistry(root).activationHistory(
    crashRequest.target_agent_id,
    crashRequest.target_domain_id,
  );
  assert.equal(durableActivation?.runtime_binding_verification.verification_phase, 'pre_commit');
  assert.equal(
    durableActivation?.runtime_binding_verification.version_digest,
    durableActivation?.to_version_digest,
  );

  const recoveredKernel = buildKernel({ now: '2026-07-16T00:06:00.000Z' });
  const recovered = await recoveredKernel.advanceRunStep(activating.run.run_id);
  assert.equal(recovered.run.state, 'completed_active');
  assert.equal(recovered.activation.revision, 1);
  const recoveredEvent = (await durableCrashEvents.read(activating.run.run_id)).at(-1)!;
  assert.deepEqual(
    recoveredEvent.payload.activation_runtime_binding_verification,
    durableActivation?.runtime_binding_verification,
  );
});

test('file-backed Foundry store keeps the one-writer target lock across process objects', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dependencies = () => ({
    designer: new FixtureDesigner(),
    evaluator: new FixtureEvaluator(),
    compiler: new ContentAddressedCandidateCompiler(root),
    objects: new FileFoundryObjectStore(root),
    events: new LedgerFoundryEventStore(root),
    versions: new LedgerVersionRegistry(root),
  });
  const first = new FoundryKernel(dependencies());
  const second = new FoundryKernel(dependencies());
  await first.startRun({ request: request(), run_id: 'run:file-lock-one' });
  await assert.rejects(
    second.startRun({
      request: request({ request_id: 'request:file-lock-two' }),
      run_id: 'run:file-lock-two',
    }),
    /active write FoundryRun/,
  );
});

test('CandidateCompiler hydrates content-addressed Agent Pack bytes deterministically and rejects forbidden writes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-agent-pack-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const content = new FileFoundryContentStore(root);
  const prompt = content.put(Buffer.from('Deliver the accepted result.\n', 'utf8'));
  const skill = content.put(Buffer.from('# Fixture Skill\n', 'utf8'));
  const knowledge = content.put(Buffer.from('# Fixture Knowledge\n', 'utf8'));
  const model = content.put(Buffer.from('fixture model lock\n', 'utf8'));
  const inputSchema = content.put(Buffer.from('{"type":"object","title":"fixture input"}\n', 'utf8'));
  const outputSchema = content.put(Buffer.from('{"type":"object","title":"fixture output"}\n', 'utf8'));
  const designRequest = request({ request_id: 'request:content-pack' });
  const agentBlueprint = blueprint(designRequest, 0, prompt.ref);
  agentBlueprint.stage_graph.stages[0]!.skill_refs = [skill.ref];
  agentBlueprint.stage_graph.stages[0]!.knowledge_refs = [knowledge.ref];
  agentBlueprint.content_refs.skill_refs = [skill.ref];
  agentBlueprint.content_refs.knowledge_refs = [knowledge.ref];
  agentBlueprint.content_refs.model_refs = [model.ref];
  agentBlueprint.actions[0]!.input_schema_ref = inputSchema.ref;
  agentBlueprint.actions[0]!.output_schema_ref = outputSchema.ref;
  agentBlueprint.artifact_contracts[0]!.schema_ref = outputSchema.ref;
  agentBlueprint.content_refs.schema_refs = [inputSchema.ref, outputSchema.ref];
  const blueprintDigest = foundryContentDigest(agentBlueprint);
  const compiler = new ContentAddressedCandidateCompiler(root);

  const first = await compiler.materialize({
    run_id: 'run:content-pack',
    blueprint: agentBlueprint,
    blueprint_digest: blueprintDigest,
  });
  const second = await compiler.materialize({
    run_id: 'run:content-pack-replay',
    blueprint: structuredClone(agentBlueprint),
    blueprint_digest: blueprintDigest,
  });
  assert.deepEqual(second, first);
  const directory = compiler.candidateDirectory(first.candidate_digest);
  const pack = JSON.parse(fs.readFileSync(path.join(directory, 'agent/agent-pack.json'), 'utf8'));
  assert.equal(pack.conformance.status, 'valid');
  assert.equal(pack.content_bindings.length, 6);
  assert.equal(pack.content_bindings.every((entry: { declared_ref: string; immutable_ref: string }) =>
    entry.declared_ref === entry.immutable_ref), true);
  assert.equal(fs.readFileSync(path.join(directory, `content/prompt/${prompt.digest.slice(7)}.blob`), 'utf8'), 'Deliver the accepted result.\n');

  fs.writeFileSync(path.join(directory, 'forbidden-owner-write.txt'), 'mutation');
  await assert.rejects(
    compiler.materialize({
      run_id: 'run:content-pack-forbidden-write',
      blueprint: agentBlueprint,
      blueprint_digest: blueprintDigest,
    }),
    /forbidden writes/,
  );
});

test('CandidateCompiler rejects candidate-root and hydrated-content symlink escapes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-agent-pack-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-agent-pack-outside-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.symlinkSync(outside, path.join(root, 'candidates'));
  assert.throws(() => new ContentAddressedCandidateCompiler(root), /candidate root must be a physical directory/);
  fs.rmSync(path.join(root, 'candidates'));

  const content = new FileFoundryContentStore(root);
  const stored = content.put(Buffer.from('immutable prompt\n', 'utf8'));
  const blob = path.join(root, 'content', `${stored.digest.slice(7)}.blob`);
  const outsideFile = path.join(outside, 'prompt.txt');
  fs.writeFileSync(outsideFile, 'immutable prompt\n');
  fs.rmSync(blob);
  fs.symlinkSync(outsideFile, blob);
  const designRequest = request({ request_id: 'request:symlink-content' });
  const agentBlueprint = blueprint(designRequest, 0, stored.ref);
  const compiler = new ContentAddressedCandidateCompiler(root);
  await assert.rejects(
    compiler.materialize({
      run_id: 'run:symlink-content',
      blueprint: agentBlueprint,
      blueprint_digest: foundryContentDigest(agentBlueprint),
    }),
    /content ref resolves outside/,
  );
});

test('Foundry designer ports are producer-neutral across function and manifest adapters', async (t) => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-'));
  t.after(() => fs.rmSync(checkout, { recursive: true, force: true }));
  fs.mkdirSync(path.join(checkout, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(checkout, 'contracts', 'foundry_provider.json'), JSON.stringify({
    surface_kind: 'opl_foundry_provider',
    version: 'opl-foundry-provider.v1',
    provider_id: 'fixture-designer',
    agent_id: 'fixture-designer',
    package_id: 'fixture-designer',
    domain_id: 'agent_engineering',
    carrier_slug: 'fixture-designer',
    operations: {
      design: {
        input_schema_refs: ['opl://foundry-protocol/DesignRequest'],
        output_schema_ref: 'opl://foundry-protocol/AgentBlueprint',
        entry_stage_ref: 'mission-intake',
        required_stage_refs: ['mission-intake', 'evaluation-design'],
        optional_stage_refs: [],
        terminal_stage_ref: 'evaluation-design',
      },
      diagnose: {
        input_schema_refs: [
          'opl://foundry-protocol/DesignRequest',
          'opl://foundry-protocol/AgentBlueprint',
          'opl://foundry-protocol/EvidenceBundle',
        ],
        output_schema_ref: 'opl://foundry-protocol/EvolutionProposal',
        entry_stage_ref: 'evidence-diagnosis',
        required_stage_refs: ['evidence-diagnosis', 'evolution-proposal'],
        optional_stage_refs: [],
        terminal_stage_ref: 'evolution-proposal',
      },
    },
    projection_policy: {
      public_action_ids: ['engineer-agent'],
      internal_operations_are_public_actions: false,
      internal_operations_are_cli_commands: false,
      internal_operations_are_mcp_tools: false,
    },
    authority_boundary: {
      provider_owns_design_semantics: true,
      provider_owns_evaluation_semantics: true,
      provider_owns_evidence_diagnosis: true,
      provider_owns_evolution_proposals: true,
      provider_owns_foundry_run_state: false,
      provider_owns_candidate_materialization: false,
      provider_owns_evaluation_execution: false,
      provider_owns_versions_or_activation: false,
      provider_can_return_patch_or_work_order: false,
      provider_can_view_protected_test_bodies: false,
      opl_can_write_target_domain_truth: false,
    },
  }), 'utf8');
  const designRequest = request();
  const fixture = new FixtureDesigner();
  const designActivity = {
    run_id: 'run:adapter',
    iteration: 0,
    phase: 'design' as const,
    input_digest: foundryContentDigest(designRequest),
  };
  const functionAdapter = new FunctionFoundryDesignerAdapter({
    producer_id: 'function:fixture',
    design: (input) => fixture.design(input),
    diagnose: (input) => fixture.diagnose(input),
  });
  const manifestAdapter = new ManifestFoundryDesignerAdapter({
    checkout_root: checkout,
    invoker: {
      invoke: async (input) => input.operation === 'design'
        ? fixture.design(input.payload.request)
        : fixture.diagnose({
            request: input.payload.request,
            blueprint: input.payload.blueprint!,
            evidence: input.payload.evidence!,
            activity: input.activity,
          }),
    },
  });
  assert.deepEqual(
    await manifestAdapter.design(designRequest, designActivity),
    await functionAdapter.design(designRequest, designActivity),
  );
  assert.equal(manifestAdapter.producer_id, 'foundry-provider:fixture-designer');
});

test('production Foundry resolves a configurable semantic provider and keeps OMA as the default', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-production-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, 'provider-checkout');
  fs.mkdirSync(path.join(checkout, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(checkout, 'contracts', 'foundry_provider.json'), JSON.stringify({
    surface_kind: 'opl_foundry_provider',
    version: 'opl-foundry-provider.v1',
    provider_id: 'provider-fixture',
    agent_id: 'provider-fixture',
    package_id: 'provider-fixture',
    domain_id: 'agent_engineering',
    carrier_slug: 'provider-fixture',
    operations: {
      design: {
        input_schema_refs: ['opl://foundry-protocol/DesignRequest'],
        output_schema_ref: 'opl://foundry-protocol/AgentBlueprint',
        entry_stage_ref: 'mission-intake',
        required_stage_refs: ['mission-intake', 'evaluation-design'],
        optional_stage_refs: [],
        terminal_stage_ref: 'evaluation-design',
      },
      diagnose: {
        input_schema_refs: [
          'opl://foundry-protocol/DesignRequest',
          'opl://foundry-protocol/AgentBlueprint',
          'opl://foundry-protocol/EvidenceBundle',
        ],
        output_schema_ref: 'opl://foundry-protocol/EvolutionProposal',
        entry_stage_ref: 'evidence-diagnosis',
        required_stage_refs: ['evidence-diagnosis', 'evolution-proposal'],
        optional_stage_refs: [],
        terminal_stage_ref: 'evolution-proposal',
      },
    },
    projection_policy: {
      public_action_ids: ['engineer-agent'],
      internal_operations_are_public_actions: false,
      internal_operations_are_cli_commands: false,
      internal_operations_are_mcp_tools: false,
    },
    authority_boundary: {
      provider_owns_design_semantics: true,
      provider_owns_evaluation_semantics: true,
      provider_owns_evidence_diagnosis: true,
      provider_owns_evolution_proposals: true,
      provider_owns_foundry_run_state: false,
      provider_owns_candidate_materialization: false,
      provider_owns_evaluation_execution: false,
      provider_owns_versions_or_activation: false,
      provider_can_return_patch_or_work_order: false,
      provider_can_view_protected_test_bodies: false,
      opl_can_write_target_domain_truth: false,
    },
  }));
  const observedProviderIds: string[] = [];
  const resolveManagedCheckout: typeof resolveStandardAgentManagedCheckout = async (input) => {
    observedProviderIds.push(input.domainId);
    return {
      checkout_root: checkout,
    } as Awaited<ReturnType<typeof resolveStandardAgentManagedCheckout>>;
  };

  await createProductionFoundryKernel({
    root_override: path.join(root, 'custom-provider-state'),
    semantic_provider_agent_id: 'provider-fixture',
    resolve_managed_checkout: resolveManagedCheckout,
  });
  await createProductionFoundryKernel({
    root_override: path.join(root, 'default-provider-state'),
    resolve_managed_checkout: resolveManagedCheckout,
  });

  assert.deepEqual(observedProviderIds, ['provider-fixture', 'oma']);
});

test('production Foundry rejects structurally spoofed qualification evaluators before provider resolution', async () => {
  let providerResolutionAttempted = false;
  const spoofedRuntime: EvaluationExecutor = {
    evaluator_id: 'evaluator:spoofed-runtime',
    qualification_capability: {
      status: 'qualification_grade',
      execution_mode: 'frozen_plan_evaluation_runtime.v1',
      protected_fact_authority: 'framework_owned_case_executor',
    },
    evaluate: async () => { throw new Error('unreachable'); },
    canary: async () => { throw new Error('unreachable'); },
  };

  await assert.rejects(() => createProductionFoundryKernel({
    trusted_evaluation_runtime: spoofedRuntime,
    resolve_managed_checkout: async () => {
      providerResolutionAttempted = true;
      throw new Error('unreachable');
    },
  }), /Framework-owned FrozenPlan Evaluation Runtime/);
  assert.equal(providerResolutionAttempted, false);
});

test('the exact OMA checkout exposes the canonical producer manifest', {
  skip: process.env.OPL_OMA_CHECKOUT ? false : 'set OPL_OMA_CHECKOUT for the cross-repo lane',
}, () => {
  const manifest = readFoundryProviderManifest(process.env.OPL_OMA_CHECKOUT!);
  const actionCatalog = JSON.parse(fs.readFileSync(
    path.join(process.env.OPL_OMA_CHECKOUT!, 'contracts/action_catalog.json'),
    'utf8',
  ));
  assert.equal(assertRepoJsonSchemaPayload({
    repoRoot: process.cwd(),
    schemaRef: 'contracts/family-orchestration/family-action-catalog.schema.json',
    payload: actionCatalog,
    label: 'OMA Foundry action catalog',
  }).status, 'valid');
  assert.equal(manifest.provider_id, 'oma');
  assert.equal(manifest.domain_id, 'agent_engineering');
  assert.deepEqual(Object.keys(manifest.operations).sort(), ['design', 'diagnose']);
  const compiled = compileStandardAgentStageManifest(process.env.OPL_OMA_CHECKOUT!);
  assert.equal(compiled.source_binding.canonical_agent_id, 'oma');
  assert.equal(compiled.source_binding.domain_id, 'agent_engineering');
  assert.deepEqual(actionCatalog.actions.map((action: { action_id: string }) => action.action_id), ['engineer-agent']);
  assert.equal(
    compiled.stage_control_plane.stages.every((stage) => stage.trust_boundary?.owner_receipt_required === false),
    true,
  );
});

test('the four Foundry protocol fixtures from the exact OMA checkout pass OPL authority validation', {
  skip: process.env.OPL_OMA_CHECKOUT ? false : 'set OPL_OMA_CHECKOUT for the cross-repo lane',
}, () => {
  const fixtureManifest = JSON.parse(fs.readFileSync(
    path.join(process.env.OPL_OMA_CHECKOUT!, 'contracts/foundry_protocol_fixture_manifest.json'),
    'utf8',
  ));
  assert.equal(
    fixtureManifest.validation_surface_ref,
    'opl-framework/foundry-protocol-fixture-conformance',
  );
  assert.equal(
    fixtureManifest.validation_surface_version,
    'opl-foundry-protocol-fixture-conformance.v1',
  );
  const fixtureRoot = path.join(process.env.OPL_OMA_CHECKOUT!, 'contracts/fixtures/foundry-protocol');
  const fixtures = {
    request: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'design-request.json'), 'utf8')),
    blueprint: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'agent-blueprint.json'), 'utf8')),
    evidence: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'evidence-bundle.json'), 'utf8')),
    proposal: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'evolution-proposal.json'), 'utf8')),
  };
  for (const [schemaRef, payload] of [
    ['contracts/opl-framework/foundry-design-request.schema.json', fixtures.request],
    ['contracts/opl-framework/foundry-agent-blueprint.schema.json', fixtures.blueprint],
    ['contracts/opl-framework/foundry-evidence-bundle.schema.json', fixtures.evidence],
    ['contracts/opl-framework/foundry-evolution-proposal.schema.json', fixtures.proposal],
  ] as const) {
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot: process.cwd(),
      schemaRef,
      payload,
      label: `OMA fixture ${schemaRef}`,
    }).status, 'valid');
  }
  const conformance = validateFoundryProtocolFixtureSet({
    design_request: fixtures.request,
    agent_blueprint: fixtures.blueprint,
    evidence_bundle: fixtures.evidence,
    evolution_proposal: fixtures.proposal,
  });
  assert.equal(conformance.version, 'opl-foundry-protocol-fixture-conformance.v1');
});
