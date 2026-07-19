import {
  assert,
  crypto,
  fs,
  os,
  path,
  test,
  canonicalJsonBytes,
  assertRepoJsonSchemaPayload,
  DeterministicInMemoryCandidateCompiler,
  InMemoryActivationRuntime,
  InMemoryFoundryEventStore,
  InMemoryFoundryObjectStore,
  InMemoryOwnerGate,
  InMemoryVersionRegistry,
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
  assertBlueprintSatisfiesDesignRequest,
  assertEvaluationEvidenceFacts,
  evaluateDesignRequestResourceConstraints,
  FrozenPlanEvaluationRuntime,
  foundryFrozenEvaluationPlanDigest,
  isQualificationGradeEvaluationRuntime,
  recomputeEvaluationQualification,
  FOUNDRY_PROTOCOL_VERSION,
  assertFoundryProtocolPurity,
  foundryContentDigest,
  validateAgentBlueprint,
  validateDesignRequest,
  validateEvidenceBundle,
  validateEvolutionProposal,
  verifyFoundryEventChain,
  ProcessFoundryEvaluationExecutor,
  createProductionFoundryKernel,
  compileStandardAgentStageManifest,
  ownerGate,
  authorizeRunMutation,
  authorizeRollback,
  request,
  blueprint,
  FixtureDesigner,
  NoChangeDesigner,
  evidence,
  FixtureEvaluator,
  HighRiskDesigner,
  AddedEvaluationCaseDesigner,
  AddedEvaluationCaseEvaluator,
  BudgetEvaluator,
  StaleEvidenceEvaluator,
  MutatingEvidenceEvaluator,
  PassingDesigner,
  CountingCandidateCompiler,
  BaselineComparisonDesigner,
  HiddenBaselineRegressionEvaluator,
  CanaryRegressionEvaluator,
  ControlledActivationRuntime,
  harness,
  activateCreateRun,
  prepareActivatingCreateRun,
} from './shared.ts';
import type {
  EvaluationCaseExecutor,
  IndependentEvaluationReviewer,
  ActivationRuntime,
  CandidateCompiler,
  DesignerPort,
  EvaluationExecutor,
  FoundryEventStore,
  MaterializedCandidate,
  OwnerGateAction,
  OwnerGateDecision,
  VersionRegistry,
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
  EvolutionProposal,
  resolveStandardAgentManagedCheckout,
} from './shared.ts';

test('Process evaluator transport excludes protected bodies and cannot self-report qualification', async (t) => {
  const designRequest = request({ request_id: 'request:external-process-evaluator' });
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:v1');
  const expectedPlanDigest = foundryFrozenEvaluationPlanDigest(agentBlueprint.eval_spec);
  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-process-pack-'));
  t.after(() => fs.rmSync(packRoot, { recursive: true, force: true }));
  const candidateDirectories = new Map<string, string>();
  const exactPackCompiler: CandidateCompiler = {
    async materialize(input) {
      const manifestBytes = canonicalJsonBytes({
        surface_kind: 'opl_foundry_test_candidate_manifest',
        blueprint_digest: input.blueprint_digest,
      });
      const manifestSha = crypto.createHash('sha256').update(manifestBytes).digest('hex');
      const files = [{
        path: 'agent/agent-pack.json',
        sha256: manifestSha,
        byte_size: manifestBytes.byteLength,
      }];
      const candidateDigest = foundryContentDigest({
        surface_kind: 'opl_foundry_candidate_file_index',
        version: 'opl-foundry-candidate-index.v2',
        blueprint_digest: input.blueprint_digest,
        files,
      });
      const directory = path.join(packRoot, candidateDigest.slice('sha256:'.length));
      fs.mkdirSync(path.join(directory, 'agent'), { recursive: true });
      fs.writeFileSync(path.join(directory, files[0]!.path), manifestBytes);
      fs.writeFileSync(path.join(directory, 'candidate-index.json'), canonicalJsonBytes({
        surface_kind: 'opl_foundry_candidate_file_index',
        version: 'opl-foundry-candidate-index.v2',
        blueprint_digest: input.blueprint_digest,
        candidate_digest: candidateDigest,
        files,
      }));
      candidateDirectories.set(candidateDigest, directory);
      return {
        surface_kind: 'opl_foundry_materialized_candidate',
        target_agent_id: input.blueprint.target_agent_id,
        target_domain_id: input.blueprint.target_domain_id,
        blueprint_digest: input.blueprint_digest,
        candidate_digest: candidateDigest,
        candidate_ref: `opl://foundry/candidate/${candidateDigest}`,
        manifest_digest: `sha256:${manifestSha}`,
      };
    },
  };
  const evaluatorScript = `
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const transport = JSON.stringify(input);
    if (/hidden_test_bod|protected_test_bod/.test(transport)) process.exit(91);
    if (input.protected_test_transport?.bodies_in_request !== false) process.exit(92);
    process.stdout.write(JSON.stringify({
      surface_kind: 'opl_foundry_evidence_bundle',
      version: 'opl-foundry-protocol.v1',
      evidence_id: 'evidence:external-process',
      target_agent_id: input.request.target_agent_id,
      target_domain_id: input.request.target_domain_id,
      target_version_ref: input.request.target_version_ref,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: input.candidate.candidate_digest,
      baseline_version_digest: null,
      frozen_test_plan_digest: '${expectedPlanDigest}',
      public_results: [{ case_id: 'case:required', status: 'fail', score: 0, evidence_refs: ['evidence:public'] }],
      baseline_public_results: null,
      baseline_protected_aggregates: null,
      protected_aggregates: [{ category: 'privacy:no-sensitive-data', total: 1, passed: 0, failed: 1, score: 0 }],
      independent_review: {
        evaluator_ref: 'reviewer:external-process',
        evaluation_execution_ref: 'evaluation:external-process',
        review_execution_ref: 'review:external-process',
        verdict: 'fail',
        findings: ['candidate failed'],
        evidence_refs: ['evidence:review']
      },
      safety_delta: { incidents: 0 },
      cost_delta: { usd: 0 },
      latency_delta: { milliseconds: 0 },
      failure_classification: [],
      qualified: true,
      gate_score: 1,
      provenance: {
        foundry_run_id: input.run_id,
        generation: input.blueprint.generation,
        producer_id: input.evaluator_id,
        evaluated_at: '2026-07-16T00:00:00.000Z',
        source_refs: ['evidence:external-process']
      }
    }));
  `;
  const evaluator = new ProcessFoundryEvaluationExecutor({
    execution_mode: 'offline_projected_pack_observation.v1',
    executable: process.execPath,
    args: ['--input-type=module', '--eval', evaluatorScript],
    reviewer_executable: process.execPath,
    reviewer_args: ['--input-type=module', '--eval', `
      process.stdout.write(JSON.stringify({
        surface_kind: 'opl_foundry_independent_review_result',
        version: 'opl-foundry-independent-review-result.v1',
        verdict: 'fail',
        findings: ['candidate failed'],
        evidence_refs: ['evidence:review']
      }));
    `],
    candidate_pack_resolver: {
      resolveDirectory: (candidate) => candidateDirectories.get(candidate.candidate_digest) ?? '',
    },
    timeout_ms: 10_000,
  });
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer: new FixtureDesigner(),
    evaluator,
    compiler: exactPackCompiler,
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: new InMemoryVersionRegistry(),
  });
  await kernel.startRun({ request: designRequest, run_id: 'run:external-process-evaluator' });
  const inspection = await kernel.advanceUntilPause('run:external-process-evaluator');

  assert.equal(inspection.run.state, 'quarantined');
  assert.match(
    String((await events.read(inspection.run.run_id)).at(-1)?.payload.failure_message),
    /evaluation observation/i,
  );
});

test('OMA self-improvement remains high risk and rolls canary regression back to the exact active version', async () => {
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  const objects = new InMemoryFoundryObjectStore();
  const compiler = new DeterministicInMemoryCandidateCompiler();
  const dependencies = (designer: DesignerPort, evaluator: EvaluationExecutor) => ({
    designer,
    evaluator,
    compiler,
    objects,
    events,
    versions,
    ownerGate,
    clock: { now: () => '2026-07-16T00:00:00.000Z' },
  });
  const baselineKernel = new FoundryKernel(dependencies(new FixtureDesigner(), new FixtureEvaluator()));
  const omaCreateRequest = request({
    request_id: 'request:oma:create',
    target_agent_id: 'oma',
    target_domain_id: 'agent_engineering',
  });
  await activateCreateRun(baselineKernel, 'run:oma:create', omaCreateRequest);
  const [baseline] = await baselineKernel.listVersions('oma', 'agent_engineering');
  assert.ok(baseline);

  const kernel = new FoundryKernel(dependencies(new HighRiskDesigner(), new CanaryRegressionEvaluator()));
  const improveRequest = request({
    request_id: 'request:oma:high-risk-improve',
    mode: 'improve',
    target_agent_id: 'oma',
    target_domain_id: 'agent_engineering',
    target_version_ref: baseline.version_digest,
  });
  await kernel.startRun({ request: improveRequest, run_id: 'run:oma:high-risk-improve' });
  const waiting = await kernel.advanceUntilPause('run:oma:high-risk-improve');
  assert.equal(waiting.run.risk_tier, 'high');
  assert.equal(waiting.run.state, 'awaiting_owner_canary');
  const before = await versions.activation('oma', 'agent_engineering');

  const canary = await kernel.submitOwnerDecision({
    run_id: 'run:oma:high-risk-improve',
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: waiting,
      action: 'approve_canary',
      decision: 'approve',
    }),
  }, { advance: false });
  assert.equal(canary.run.state, 'canary');
  const rolledBack = await kernel.advanceRunStep('run:oma:high-risk-improve');
  const after = await versions.activation('oma', 'agent_engineering');

  assert.equal(rolledBack.run.state, 'evidence_ready');
  assert.deepEqual(after, before);
  const rollbackEvent = (await events.read('run:oma:high-risk-improve')).at(-1);
  assert.equal(rollbackEvent?.event_type, 'canary_regression_rolled_back');
  assert.equal(rollbackEvent?.payload.rollback_to_version_digest, baseline.version_digest);
});

test('FoundryKernel rejects stale Owner decisions and locks one writer per target', async () => {
  const { kernel } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:locked' });
  await assert.rejects(
    kernel.startRun({ request: request({ request_id: 'request:concurrent' }), run_id: 'run:concurrent' }),
    /active write FoundryRun/,
  );
  const waiting = await kernel.advanceUntilPause('run:locked');
  await assert.rejects(kernel.submitOwnerDecision({
    run_id: 'run:locked',
    expected_revision: waiting.run.revision - 1,
    decision: 'approve',
    authority_receipt_ref: 'owner-receipt:stale',
  }), /revision compare-and-swap failed/);
  const cancelledHarness = harness();
  await cancelledHarness.kernel.startRun({ request: request(), run_id: 'run:cancelled' });
  const cancelGate = await cancelledHarness.kernel.advanceUntilPause('run:cancelled');
  const cancelled = await cancelledHarness.kernel.cancelRun({
    run_id: 'run:cancelled',
    expected_revision: cancelGate.run.revision,
    authority_receipt_ref: authorizeRunMutation({
      inspection: cancelGate,
      action: 'cancel',
      decision: 'cancel',
    }),
  });
  assert.equal(cancelled.run.state, 'cancelled');
});

test('FoundryKernel cancels accepted and designing runs from Framework-owned authority without a Blueprint', async () => {
  for (const phase of ['accepted', 'designing'] as const) {
    const { kernel, events } = harness();
    const runId = `run:cancel-before-blueprint:${phase}`;
    await kernel.startRun({
      request: request({ request_id: `request:cancel-before-blueprint:${phase}` }),
      run_id: runId,
    });
    if (phase === 'designing') await kernel.advanceRunStep(runId);
    const before = await kernel.inspectRun(runId);
    assert.equal(before.run.state, phase);
    assert.equal(before.run.blueprint_digest, null);

    const authorityReceiptRef = authorizeRunMutation({
      inspection: before,
      action: 'cancel',
      decision: 'cancel',
    });
    const cancelled = await kernel.cancelRun({
      run_id: runId,
      expected_revision: before.run.revision,
      authority_receipt_ref: authorityReceiptRef,
    });
    assert.equal(cancelled.run.state, 'cancelled');
    assert.equal(cancelled.run.blueprint_digest, null);
    assert.equal((await events.read(runId)).at(-1)?.event_type, 'foundry_run_cancelled');
    assert.deepEqual(await kernel.cancelRun({
      run_id: runId,
      expected_revision: before.run.revision,
      authority_receipt_ref: authorityReceiptRef,
    }), cancelled);
  }
});

test('FoundryKernel quarantines evidence that changes the frozen test plan', async () => {
  const { kernel } = harness(new FixtureEvaluator(1));
  await kernel.startRun({ request: request(), run_id: 'run:mutated-plan' });
  const inspection = await kernel.advanceUntilPause('run:mutated-plan');
  assert.equal(inspection.run.state, 'quarantined');
});

test('FoundryKernel requires independent designer and evaluator identities', () => {
  const evaluator = new FixtureEvaluator();
  Object.defineProperty(evaluator, 'evaluator_id', { value: 'designer:fixture' });
  assert.throws(() => new FoundryKernel({
    designer: new FixtureDesigner(),
    evaluator,
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
  }), /independent producer identities/);
});

test('FoundryKernel retries only explicitly transient activities without consuming a generation', async () => {
  const fixture = new FixtureDesigner();
  let transientAttempts = 0;
  const designer = new FunctionFoundryDesignerAdapter({
    producer_id: 'designer:transient-fixture',
    design: async (input) => {
      transientAttempts += 1;
      if (transientAttempts < 3) {
        throw new FoundryTransientActivityError('temporary designer transport failure');
      }
      return fixture.design(input);
    },
    diagnose: (input) => fixture.diagnose(input),
  });
  const kernel = new FoundryKernel({
    designer,
    evaluator: new FixtureEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
    activityMaxAttempts: 3,
  });

  await kernel.startRun({ request: request(), run_id: 'run:transient-retry' });
  const inspection = await kernel.advanceUntilPause('run:transient-retry');
  assert.equal(transientAttempts, 3);
  assert.equal(inspection.run.generation, 1);
  assert.equal(inspection.run.state, 'awaiting_owner_canary');
});

test('FoundryKernel does not retry permanent activity failures', async () => {
  let attempts = 0;
  const designer = new FunctionFoundryDesignerAdapter({
    producer_id: 'designer:permanent-fixture',
    design: async () => {
      attempts += 1;
      throw new Error('permanent provider failure');
    },
    diagnose: (input) => new FixtureDesigner().diagnose(input),
  });
  const kernel = new FoundryKernel({
    designer,
    evaluator: new FixtureEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
    activityMaxAttempts: 3,
  });

  await kernel.startRun({ request: request(), run_id: 'run:permanent-failure' });
  const inspection = await kernel.advanceUntilPause('run:permanent-failure');
  assert.equal(attempts, 1);
  assert.equal(inspection.run.generation, 0);
  assert.equal(inspection.run.state, 'failed');
});

test('FoundryKernel terminates an exact no-change diagnosis without creating a duplicate generation', async () => {
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  const kernel = new FoundryKernel({
    designer: new NoChangeDesigner(),
    evaluator: new FixtureEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions,
  });

  await kernel.startRun({ request: request(), run_id: 'run:no-change' });
  const inspection = await kernel.advanceUntilPause('run:no-change');
  assert.equal(inspection.run.state, 'completed_unqualified');
  assert.equal(inspection.run.generation, 0);
  assert.equal((await kernel.listVersions('fixture-agent', 'fixture-domain')).length, 0);
  assert.equal((await events.read('run:no-change')).at(-1)?.event_type, 'evolution_no_change');
});

test('FoundryKernel freezes an admitted evaluation plan per generation while allowing stronger next-generation tests', async () => {
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer: new AddedEvaluationCaseDesigner(),
    evaluator: new AddedEvaluationCaseEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: new InMemoryVersionRegistry(),
  });
  const designRequest = request({
    request_id: 'request:stronger-next-generation-plan',
    delivery_policy: { activation_mode: 'qualify_only', max_generations: 5 },
  });

  await kernel.startRun({ request: designRequest, run_id: 'run:stronger-next-generation-plan' });
  const completed = await kernel.advanceUntilPause('run:stronger-next-generation-plan');

  assert.equal(completed.run.state, 'completed_qualified');
  assert.equal(completed.run.generation, 1);
  const evaluationEvents = (await events.read(completed.run.run_id)).filter((event) =>
    event.event_type === 'evaluation_failed' || event.event_type === 'candidate_qualified');
  assert.equal(evaluationEvents.length, 2);
  assert.notEqual(
    evaluationEvents[0]?.payload.frozen_test_plan_digest,
    evaluationEvents[1]?.payload.frozen_test_plan_digest,
  );
});

test('Evaluation Runtime isolates protected execution and evaluates baseline and candidate on one plan', async () => {
  const designRequest = request({
    request_id: 'request:evaluation-runtime',
    mode: 'takeover',
    target_version_ref: `sha256:${'1'.repeat(64)}`,
  });
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:evaluation-runtime');
  const candidate = await new DeterministicInMemoryCandidateCompiler().materialize({
    run_id: 'run:evaluation-runtime',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const baseline: Awaited<ReturnType<InMemoryVersionRegistry['resolveVersion']>> & {} = {
    surface_kind: 'opl_foundry_agent_version',
    version_id: 'version:baseline',
    version_digest: designRequest.target_version_ref!,
    target_agent_id: designRequest.target_agent_id,
    target_domain_id: designRequest.target_domain_id,
    blueprint_digest: `sha256:${'2'.repeat(64)}`,
    candidate_digest: `sha256:${'3'.repeat(64)}`,
    candidate_ref: 'opl://foundry/candidate/baseline',
    qualification_digest: `sha256:${'4'.repeat(64)}`,
    created_at: '2026-07-16T00:00:00.000Z',
  };
  const publicSubjects: string[] = [];
  const protectedSubjects: string[] = [];
  let reviewedProtectedAggregate: unknown = null;
  const executor: EvaluationCaseExecutor = {
    executor_id: 'executor:evaluation-runtime',
    executionRef: ({ run_id, generation, phase }) => `evaluation:${run_id}:${generation}:${phase}`,
    async runPublicCase(input) {
      publicSubjects.push(`${input.subject.kind}:${input.test_case.case_id}`);
      return {
        case_id: input.test_case.case_id,
        status: 'pass',
        score: input.subject.kind === 'candidate' ? 1 : 0.8,
        evidence_refs: [`evidence:public:${input.subject.kind}`],
      };
    },
    async runProtectedRequirement(input) {
      protectedSubjects.push(`${input.subject.kind}:${input.requirement.category}`);
      const aggregate = {
        category: input.requirement.category,
        total: input.requirement.minimum_case_count,
        passed: input.requirement.minimum_case_count,
        failed: 0,
        score: 1,
      };
      return {
        aggregate,
        receipt_ref: `opl://foundry/protected-requirement-receipts/${input.subject.kind}/${encodeURIComponent(input.requirement.category)}`,
        aggregate_digest: foundryContentDigest(aggregate),
      };
    },
    async observeResourceObservations() {
      return {
        candidate_cost_observations: { usd: 0 },
        candidate_latency_observations: { milliseconds: 0 },
        safety_observations: [],
        safety_delta: { incidents: 0 },
        cost_delta: { usd: 0 },
        latency_delta: { milliseconds: 0 },
      };
    },
  };
  const reviewer: IndependentEvaluationReviewer = {
    reviewer_id: 'reviewer:evaluation-runtime',
    async review(input) {
      reviewedProtectedAggregate = input.protected_aggregates;
      return {
        execution_ref: 'review-execution:independent-review',
        verdict: 'pass',
        findings: [],
        evidence_refs: ['evidence:independent-review'],
      };
    },
  };
  const runtime = new FrozenPlanEvaluationRuntime({
    evaluator_id: 'evaluator:evaluation-runtime',
    executor,
    reviewer,
    now: () => '2026-07-16T00:00:00.000Z',
  });

  assert.deepEqual(runtime.qualification_capability, {
    status: 'qualification_grade',
    execution_mode: 'frozen_plan_evaluation_runtime.v1',
    protected_fact_authority: 'framework_owned_case_executor',
  });
  assert.equal(isQualificationGradeEvaluationRuntime(runtime), true);
  assert.equal(isQualificationGradeEvaluationRuntime({
    evaluator_id: runtime.evaluator_id,
    qualification_capability: runtime.qualification_capability,
    evaluate: (input) => runtime.evaluate(input),
    canary: (input) => runtime.canary(input),
  }), false);

  const result = await runtime.evaluate({
    run_id: 'run:evaluation-runtime',
    request: designRequest,
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
    candidate,
    baseline_version: baseline,
  });

  assert.deepEqual(publicSubjects, ['candidate:case:required', 'baseline:case:required']);
  assert.deepEqual(protectedSubjects, [
    'candidate:privacy:no-sensitive-data',
    'baseline:privacy:no-sensitive-data',
  ]);
  assert.deepEqual(reviewedProtectedAggregate, result.protected_aggregates);
  assert.equal(result.independent_review.evaluator_ref, reviewer.reviewer_id);
  assert.equal(result.provenance.producer_id, runtime.evaluator_id);
  assert.equal(result.baseline_version_digest, baseline.version_digest);
  assert.equal(result.baseline_public_results?.[0]?.score, 0.8);
  assert.equal(result.baseline_protected_aggregates?.[0]?.score, 1);
  assert.equal(result.frozen_test_plan_digest, foundryFrozenEvaluationPlanDigest(agentBlueprint.eval_spec));
  assert.equal(result.qualified, true);
  assert.ok(result.provenance.source_refs.includes(
    'opl://foundry/protected-requirement-receipts/candidate/privacy%3Ano-sensitive-data',
  ));
  assert.ok(result.provenance.source_refs.includes(
    'opl://foundry/protected-requirement-receipts/baseline/privacy%3Ano-sensitive-data',
  ));

  const tamperedRuntime = new FrozenPlanEvaluationRuntime({
    evaluator_id: 'evaluator:tampered-protected-receipt',
    executor: {
      ...executor,
      runProtectedRequirement: async (input) => ({
        ...await executor.runProtectedRequirement(input),
        aggregate_digest: `sha256:${'f'.repeat(64)}`,
      }),
    },
    reviewer,
  });
  await assert.rejects(() => tamperedRuntime.evaluate({
    run_id: 'run:tampered-protected-receipt',
    request: designRequest,
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
    candidate,
    baseline_version: baseline,
  }), /direct receipt ref and exact digest/);
});

test('baseline comparison rejects per-category protected regressions and incomplete baseline aggregates', () => {
  const designRequest = request({
    request_id: 'request:protected-baseline-regression',
    mode: 'takeover',
    target_version_ref: `sha256:${'1'.repeat(64)}`,
  });
  const spec = blueprint(designRequest, 0, 'prompt:protected-baseline-regression').eval_spec;
  const common = {
    request: designRequest,
    spec,
    public_results: [{
      case_id: 'case:required',
      status: 'pass' as const,
      score: 1,
      evidence_refs: ['evidence:candidate-public'],
    }],
    baseline_public_results: [{
      case_id: 'case:required',
      status: 'pass' as const,
      score: 1,
      evidence_refs: ['evidence:baseline-public'],
    }],
    independent_review_verdict: 'pass' as const,
    baseline_present: true,
    candidate_cost_observations: { usd: 0 },
    candidate_latency_observations: { milliseconds: 0 },
    safety_observations: [],
  };
  const regressed = recomputeEvaluationQualification({
    ...common,
    protected_aggregates: [{
      category: 'privacy:no-sensitive-data',
      total: 2,
      passed: 1,
      failed: 1,
      score: 0.5,
    }],
    baseline_protected_aggregates: [{
      category: 'privacy:no-sensitive-data',
      total: 2,
      passed: 2,
      failed: 0,
      score: 1,
    }],
  });
  assert.equal(regressed.baselinePublicPassed, true);
  assert.equal(regressed.baselineProtectedPassed, false);
  assert.equal(regressed.baselinePassed, false);
  assert.equal(regressed.qualified, false);

  assert.throws(() => recomputeEvaluationQualification({
    ...common,
    protected_aggregates: [{
      category: 'privacy:no-sensitive-data', total: 1, passed: 1, failed: 0, score: 1,
    }],
    baseline_protected_aggregates: null,
  }), /must exist exactly when an exact baseline version is bound/);
  assert.throws(() => recomputeEvaluationQualification({
    ...common,
    protected_aggregates: [{
      category: 'privacy:no-sensitive-data', total: 1, passed: 1, failed: 0, score: 1,
    }],
    baseline_protected_aggregates: [],
  }), /exactly one aggregate for every frozen requirement/);
});

test('frozen evaluation plan digest binds public cases and all qualification policy', () => {
  const spec = blueprint(request(), 0, 'prompt:frozen-plan').eval_spec;
  const changedPublicCase = structuredClone(spec);
  changedPublicCase.public_cases[0]!.test_ref = 'test:changed-public-case';
  const changedProtectedRequirement = structuredClone(spec);
  changedProtectedRequirement.protected_requirements[0]!.minimum_case_count += 1;

  assert.notEqual(
    foundryFrozenEvaluationPlanDigest(spec),
    foundryFrozenEvaluationPlanDigest(changedPublicCase),
  );
  assert.notEqual(
    foundryFrozenEvaluationPlanDigest(spec),
    foundryFrozenEvaluationPlanDigest(changedProtectedRequirement),
  );
});

test('Evaluation Runtime requires pairwise-independent evaluator, executor, and reviewer identities', () => {
  const executor: EvaluationCaseExecutor = {
    executor_id: 'identity:shared',
    executionRef: () => 'execution:shared',
    runPublicCase: async () => ({ case_id: 'case', status: 'pass', score: 1, evidence_refs: ['evidence:case'] }),
    runProtectedRequirement: async () => {
      const aggregate = { category: 'protected', total: 1, passed: 1, failed: 0, score: 1 };
      return {
        aggregate,
        receipt_ref: 'opl://foundry/protected-requirement-receipts/identity',
        aggregate_digest: foundryContentDigest(aggregate),
      };
    },
    observeResourceObservations: async () => ({
      candidate_cost_observations: {},
      candidate_latency_observations: {},
      safety_observations: [],
      safety_delta: {},
      cost_delta: {},
      latency_delta: {},
    }),
  };
  const reviewer: IndependentEvaluationReviewer = {
    reviewer_id: 'identity:shared',
    review: async () => ({
      execution_ref: 'review:shared',
      verdict: 'pass',
      findings: [],
      evidence_refs: ['evidence:review'],
    }),
  };
  assert.throws(() => new FrozenPlanEvaluationRuntime({
    evaluator_id: 'identity:evaluator',
    executor,
    reviewer,
  }), /distinct identities/);
});

test('the four Foundry protocol objects match canonical closed JSON Schemas', async () => {
  const designRequest = request();
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:v1');
  const compiler = new DeterministicInMemoryCandidateCompiler();
  const candidate = await compiler.materialize({
    run_id: 'run:schema',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const evidenceBundle = evidence({
    runId: 'run:schema',
    designRequest,
    agentBlueprint,
    candidate,
    baselineDigest: null,
    qualified: false,
  });
  const evolutionProposal = await new FixtureDesigner().diagnose({
    request: designRequest,
    blueprint: agentBlueprint,
    evidence: evidenceBundle,
    activity: {
      run_id: 'run:schema',
      iteration: 0,
      phase: 'diagnose',
      input_digest: foundryContentDigest({
        blueprint_digest: foundryContentDigest(agentBlueprint),
        evidence_digest: foundryContentDigest(evidenceBundle),
      }),
    },
  });
  for (const [schemaRef, payload] of [
    ['contracts/opl-framework/foundry-design-request.schema.json', designRequest],
    ['contracts/opl-framework/foundry-agent-blueprint.schema.json', agentBlueprint],
    ['contracts/opl-framework/foundry-evidence-bundle.schema.json', evidenceBundle],
    ['contracts/opl-framework/foundry-evolution-proposal.schema.json', evolutionProposal],
  ] as const) {
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot: process.cwd(),
      schemaRef,
      payload,
      label: schemaRef,
    }).status, 'valid');
  }
  assert.throws(
    () => assertFoundryProtocolPurity({ ...designRequest, work_order: 'work-order:forbidden' }, 'DesignRequest'),
    /semantic protocol boundary/,
  );
  assert.throws(
    () => assertFoundryProtocolPurity({ reviewAttemptRef: 'review:forbidden' }, 'EvidenceBundle'),
    /semantic protocol boundary/,
  );
  assert.throws(
    () => assertFoundryProtocolPurity({ review_execution_ref: 'attempt:forbidden' }, 'EvidenceBundle'),
    /semantic protocol boundary/,
  );
  assert.throws(
    () => assertFoundryProtocolPurity({ protected_test_body: 'secret case body' }, 'EvidenceBundle'),
    /semantic protocol boundary/,
  );
});

test('the runtime Foundry validators enforce the same closed nested protocol boundary', async () => {
  const designRequest = request();
  assert.throws(
    () => validateDesignRequest({ ...designRequest, undeclared_field: true }),
    /closed protocol shape/,
  );
  assert.throws(
    () => validateDesignRequest({
      ...designRequest,
      constraints: { ...designRequest.constraints, cost_limits: { usd: Number.NaN } },
    }),
    /finite number/,
  );

  const agentBlueprint = blueprint(designRequest, 0, 'prompt:v1');
  const missingGoal = { ...agentBlueprint.stage_graph.stages[0] } as Record<string, unknown>;
  delete missingGoal.goal;
  assert.throws(
    () => validateAgentBlueprint({
      ...agentBlueprint,
      stage_graph: { ...agentBlueprint.stage_graph, stages: [missingGoal] },
    }),
    /closed protocol shape/,
  );
  assert.throws(
    () => validateAgentBlueprint({
      ...agentBlueprint,
      stage_graph: {
        ...agentBlueprint.stage_graph,
        stages: [{ ...agentBlueprint.stage_graph.stages[0], next_stage_ids: ['unknown-stage'] }],
      },
    }),
    /unknown next Stage/,
  );
  const symbolicActionSchema = structuredClone(agentBlueprint);
  symbolicActionSchema.actions[0]!.input_schema_ref = 'opl://schema/symbolic-input';
  assert.throws(
    () => validateAgentBlueprint(symbolicActionSchema),
    /not declared in content_refs.schema_refs/,
  );
  const undeclaredArtifactSchema = structuredClone(agentBlueprint);
  undeclaredArtifactSchema.artifact_contracts[0]!.schema_ref = `opl-content://sha256/${'c'.repeat(64)}`;
  assert.throws(
    () => validateAgentBlueprint(undeclaredArtifactSchema),
    /artifact_contracts\[0\].schema_ref is not declared/,
  );

  const candidate = await new DeterministicInMemoryCandidateCompiler().materialize({
    run_id: 'run:runtime-validator',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const evidenceBundle = evidence({
    runId: 'run:runtime-validator',
    designRequest,
    agentBlueprint,
    candidate,
    baselineDigest: null,
    qualified: false,
  });
  assert.throws(
    () => validateEvidenceBundle({ ...evidenceBundle, safety_delta: { score: 'not-a-number' } }),
    /finite number/,
  );
  assert.throws(
    () => validateEvidenceBundle({ ...evidenceBundle, baseline_protected_aggregates: [] }),
    /must be present or null together/,
  );

  const proposal = await new FixtureDesigner().diagnose({
    request: designRequest,
    blueprint: agentBlueprint,
    evidence: evidenceBundle,
    activity: {
      run_id: 'run:runtime-validator',
      iteration: 0,
      phase: 'diagnose',
      input_digest: foundryContentDigest({
        blueprint_digest: foundryContentDigest(agentBlueprint),
        evidence_digest: foundryContentDigest(evidenceBundle),
      }),
    },
  });
  const missingRationale = { ...proposal.semantic_diff[0] } as Record<string, unknown>;
  delete missingRationale.rationale;
  assert.throws(
    () => validateEvolutionProposal({ ...proposal, semantic_diff: [missingRationale] }),
    /closed protocol shape/,
  );
});
