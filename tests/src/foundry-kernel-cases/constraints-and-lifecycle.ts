import {
  assert,
  test,
  DeterministicInMemoryCandidateCompiler,
  InMemoryFoundryEventStore,
  InMemoryFoundryObjectStore,
  InMemoryVersionRegistry,
  FoundryKernel,
  assertBlueprintSatisfiesDesignRequest,
  assertEvaluationEvidenceFacts,
  evaluateDesignRequestResourceConstraints,
  foundryContentDigest,
  verifyFoundryEventChain,
  ownerGate,
  authorizeRunMutation,
  authorizeRollback,
  request,
  blueprint,
  FixtureDesigner,
  evidence,
  FixtureEvaluator,
  BudgetEvaluator,
  StaleEvidenceEvaluator,
  MutatingEvidenceEvaluator,
  PassingDesigner,
  CountingCandidateCompiler,
  BaselineComparisonDesigner,
  HiddenBaselineRegressionEvaluator,
  ControlledActivationRuntime,
  harness,
  activateCreateRun,
  prepareActivatingCreateRun,
} from './shared.ts';
import type {
  DesignerPort,
  EvaluationExecutor,
  VersionRegistry,
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
} from './shared.ts';

test('DesignRequest capability, permission, and privacy constraints are mandatory blueprint coverage', async () => {
  const constrainedRequest = request({
    request_id: 'request:constraint-coverage',
    constraints: {
      capability_refs: ['capability:text', 'capability:search'],
      permission_refs: ['owner-gate:permission:publish'],
      privacy_requirements: ['privacy:no-sensitive-data', 'privacy:no-cross-owner-disclosure'],
      cost_limits: { usd: 1 },
      latency_limits: { milliseconds: 1000 },
    },
  });
  const covered = blueprint(constrainedRequest, 0, 'prompt:constraints');
  covered.capability_requirements.push('capability:search');
  covered.eval_spec.protected_requirements.push({
    category: 'privacy:no-cross-owner-disclosure',
    minimum_case_count: 1,
  });
  assert.doesNotThrow(() => assertBlueprintSatisfiesDesignRequest(constrainedRequest, covered));

  for (const [detailKey, mutate] of [
    ['missing_capability_refs', (candidate: AgentBlueprint) => candidate.capability_requirements.pop()],
    ['missing_permission_refs', (candidate: AgentBlueprint) => candidate.authority_policy.permission_refs.pop()],
    ['missing_privacy_protected_requirements', (candidate: AgentBlueprint) => candidate.eval_spec.protected_requirements.pop()],
  ] as const) {
    const invalid = structuredClone(covered);
    mutate(invalid);
    assert.throws(
      () => assertBlueprintSatisfiesDesignRequest(constrainedRequest, invalid),
      (error: unknown) => Array.isArray(
        (error as { details?: Record<string, unknown> }).details?.[detailKey],
      ),
    );
  }

  const designer: DesignerPort = {
    producer_id: 'designer:constraint-dropping',
    async design() {
      const invalid = structuredClone(covered);
      invalid.eval_spec.protected_requirements.pop();
      return invalid;
    },
    async diagnose(): Promise<never> {
      throw new Error('diagnose must not run');
    },
  };
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer,
    compiler: new DeterministicInMemoryCandidateCompiler(),
    evaluator: new FixtureEvaluator(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: new InMemoryVersionRegistry(),
  });
  await kernel.startRun({ request: constrainedRequest, run_id: 'run:constraint-dropping' });
  const inspection = await kernel.advanceUntilPause('run:constraint-dropping');
  assert.equal(inspection.run.state, 'quarantined');
  assert.equal(inspection.run.candidate_digest, null);
});

test('DesignRequest cost and latency limits require matching observations and block qualification when exceeded', () => {
  const designRequest = request();
  assert.deepEqual(evaluateDesignRequestResourceConstraints({
    request: designRequest,
    candidate_cost_observations: { usd: 0.5 },
    candidate_latency_observations: { milliseconds: 1200 },
  }), {
    results: [
      { constraint_kind: 'cost', metric: 'usd', limit: 1, observed: 0.5, passed: true },
      { constraint_kind: 'latency', metric: 'milliseconds', limit: 1000, observed: 1200, passed: false },
    ],
    passed: false,
  });
  assert.throws(() => evaluateDesignRequestResourceConstraints({
    request: designRequest,
    candidate_cost_observations: { tokens: 10 },
    candidate_latency_observations: { milliseconds: 100 },
  }), /missing required cost observations/);
});

test('high and critical safety observations force unqualified evidence with exact failure classification', async () => {
  const designRequest = request({ request_id: 'request:safety-observation' });
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:safety-observation');
  const candidate = await new DeterministicInMemoryCandidateCompiler().materialize({
    run_id: 'run:safety-observation',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const unsafe = evidence({
    runId: 'run:safety-observation',
    designRequest,
    agentBlueprint,
    candidate,
    baselineDigest: null,
    qualified: true,
  });
  unsafe.safety_observations = [{
    observation_id: 'safety:unsafe-write',
    event_type: 'forbidden_write_attempt',
    severity: 'high',
    evidence_refs: ['evidence:safety:unsafe-write'],
  }];
  unsafe.failure_classification = [{
    failure_class: 'safety_event',
    gate_id: 'safety_observation:safety:unsafe-write',
    severity: 'high',
    evidence_refs: ['evidence:safety:unsafe-write'],
  }];
  unsafe.qualified = false;

  const facts = assertEvaluationEvidenceFacts({
    request: designRequest,
    spec: agentBlueprint.eval_spec,
    evidence: unsafe,
    baseline_present: false,
  });
  assert.equal(facts.safetyPassed, false);
  assert.throws(() => assertEvaluationEvidenceFacts({
    request: designRequest,
    spec: agentBlueprint.eval_spec,
    evidence: { ...unsafe, failure_classification: [] },
    baseline_present: false,
  }), /safety failure classifications do not match/);
});

test('FoundryKernel evolves a failed design, gates high risk, activates, and rolls back exact bytes', async () => {
  const { kernel, events, versions } = harness();
  const first = await activateCreateRun(kernel, 'run:create');
  assert.equal(first.run.state, 'completed_active');
  const [versionOne] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.equal(first.activation.active_version_digest, versionOne!.version_digest);
  const activationEvent = (await events.read('run:create')).at(-1)!;
  assert.equal(activationEvent.event_type, 'activation_completed');
  assert.equal(typeof activationEvent.payload.activation_runtime_preflight_ref, 'string');
  assert.equal(typeof activationEvent.payload.activation_runtime_binding_ref, 'string');
  assert.equal(
    activationEvent.payload.activation_runtime_binding_ref,
    activationEvent.payload.activation_runtime_preflight_ref,
  );
  assert.deepEqual(activationEvent.payload.activation_runtime_binding_verification, {
    surface_kind: 'opl_foundry_activation_runtime_binding_verification',
    version: 'opl-foundry-activation-runtime-binding-verification.v1',
    verification_phase: 'pre_commit',
    transaction_kind: 'activate',
    target_agent_id: versionOne!.target_agent_id,
    target_domain_id: versionOne!.target_domain_id,
    version_id: versionOne!.version_id,
    version_digest: versionOne!.version_digest,
    candidate_digest: versionOne!.candidate_digest,
    candidate_ref: versionOne!.candidate_ref,
    expected_activation_revision: 0,
    preflight_ref: activationEvent.payload.activation_runtime_preflight_ref,
    runtime_binding_ref: activationEvent.payload.activation_runtime_binding_ref,
  });
  const [activationTransaction] = await versions.activationHistory('fixture-agent', 'fixture-domain');
  assert.ok(activationTransaction);
  assert.deepEqual(
    activationTransaction.runtime_binding_verification,
    activationEvent.payload.activation_runtime_binding_verification,
  );
  assert.equal(Object.hasOwn(activationEvent.payload, 'activation_runtime_readback'), false);

  const improveRequest = request({
    request_id: 'request:improve:fixture',
    mode: 'improve',
    target_version_ref: versionOne!.version_digest,
  });
  await kernel.startRun({ request: improveRequest, run_id: 'run:improve' });
  const second = await kernel.advanceUntilPause('run:improve');
  assert.equal(second.run.risk_tier, 'low');
  assert.equal(second.run.state, 'completed_active');
  const allVersions = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.equal(allVersions.length, 2);
  assert.notEqual(allVersions[1]!.version_digest, versionOne!.version_digest);

  const rollback = await kernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: versionOne!.version_digest,
    expected_revision: 2,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: versionOne!.version_digest,
      expected_revision: 2,
    }),
  });
  assert.equal(rollback.transaction_kind, 'rollback');
  assert.equal(rollback.runtime_preflight.version_digest, versionOne!.version_digest);
  assert.equal(rollback.runtime_binding_verification.verification_phase, 'pre_commit');
  assert.equal(rollback.runtime_binding_verification.version_digest, versionOne!.version_digest);
  assert.equal(rollback.runtime_binding_verification.candidate_digest, versionOne!.candidate_digest);
  assert.equal(rollback.runtime_binding_verification.expected_activation_revision, 2);
  assert.deepEqual(
    (await versions.activationHistory('fixture-agent', 'fixture-domain')).at(-1)?.runtime_binding_verification,
    rollback.runtime_binding_verification,
  );
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, versionOne!.version_digest);
  assert.equal(verifyFoundryEventChain(await events.read('run:create')).status, 'valid');
});

test('FoundryKernel preserves the activation pointer when hosted candidate preflight fails', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions, events } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { preflightFailure: 'hosted ABI preflight denied' });
    return controlled;
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-preflight-failure');

  const failed = await kernel.advanceRunStep('run:activation-preflight-failure');
  assert.equal(failed.run.state, 'failed');
  assert.match(String((await events.read('run:activation-preflight-failure')).at(-1)?.payload.failure_message),
    /hosted ABI preflight denied/);
  assert.equal(controlled?.preflightCalls, 1);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
  assert.equal((await kernel.inspectRun('run:activation-preflight-failure')).run.state, 'failed');
  assert.equal((await events.read('run:activation-preflight-failure'))
    .some((event) => event.event_type === 'activation_completed'), false);
});

test('FoundryKernel does not change the pointer or read back runtime when activation CAS is stale', async () => {
  const backing = new InMemoryVersionRegistry();
  const staleVersions: VersionRegistry = {
    register: (input) => backing.register(input),
    list: (targetAgentId, targetDomainId) => backing.list(targetAgentId, targetDomainId),
    resolveVersion: (ref, targetAgentId, targetDomainId) => backing.resolveVersion(ref, targetAgentId, targetDomainId),
    activation: (targetAgentId, targetDomainId) => backing.activation(targetAgentId, targetDomainId),
    activationHistory: (targetAgentId, targetDomainId) => backing.activationHistory(targetAgentId, targetDomainId),
    compareAndSwapActivation: async () => { throw new Error('ActivationPointer compare-and-swap failed: stale fixture'); },
    rollback: (input) => backing.rollback(input),
  };
  const activationRuntime = new ControlledActivationRuntime(staleVersions);
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer: new FixtureDesigner(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    evaluator: new FixtureEvaluator(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: staleVersions,
    activationRuntime,
    ownerGate,
    clock: { now: () => '2026-07-16T00:00:00.000Z' },
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-stale-cas');

  const failed = await kernel.advanceRunStep('run:activation-stale-cas');
  assert.equal(failed.run.state, 'failed');
  assert.match(String((await events.read('run:activation-stale-cas')).at(-1)?.payload.failure_message),
    /compare-and-swap failed: stale fixture/);
  assert.equal(activationRuntime.preflightCalls, 1);
  assert.equal(activationRuntime.readbackCalls, 0);
  assert.equal((await backing.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
  assert.equal((await events.read('run:activation-stale-cas'))
    .some((event) => event.event_type === 'activation_completed'), false);
});

test('FoundryKernel uses exact pre-commit binding verification instead of post-CAS readback', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions, events } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { mismatchReadback: true });
    return controlled;
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-readback-mismatch');
  const [version] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(version);

  const completed = await kernel.advanceRunStep('run:activation-readback-mismatch');
  assert.equal(completed.run.state, 'completed_active');
  assert.equal(controlled?.preflightCalls, 1);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, version.version_digest);
  const activationEvent = (await events.read('run:activation-readback-mismatch')).at(-1)!;
  assert.equal(activationEvent.event_type, 'activation_completed');
  assert.equal(
    (activationEvent.payload.activation_runtime_binding_verification as { verification_phase?: unknown })
      .verification_phase,
    'pre_commit',
  );
  assert.equal(Object.hasOwn(activationEvent.payload, 'activation_runtime_readback'), false);
});

test('FoundryKernel rejects an empty prepared runtime binding before activation CAS', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions, events } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { emptyRuntimeBindingRef: true });
    return controlled;
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-binding-preflight-mismatch');

  const quarantined = await kernel.advanceRunStep('run:activation-binding-preflight-mismatch');
  assert.equal(quarantined.run.state, 'quarantined');
  assert.match(
    String((await events.read('run:activation-binding-preflight-mismatch')).at(-1)?.payload.failure_message),
    /preflight does not bind the exact target AgentVersion and revision/,
  );
  assert.equal(controlled?.preflightCalls, 1);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
  assert.equal((await versions.activationHistory('fixture-agent', 'fixture-domain')).length, 0);
});

test('FoundryKernel rollback commits from exact pre-commit binding verification without post-CAS readback', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { mismatchReadback: true });
    return controlled;
  });
  await activateCreateRun(kernel, 'run:rollback-precommit-baseline');
  const [baseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);
  await kernel.startRun({
    request: request({
      request_id: 'request:rollback-precommit-improve',
      mode: 'improve',
      target_version_ref: baseline.version_digest,
    }),
    run_id: 'run:rollback-precommit-improve',
  });
  const improved = await kernel.advanceUntilPause('run:rollback-precommit-improve');
  assert.equal(improved.run.state, 'completed_active');

  const rollback = await kernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: baseline.version_digest,
    expected_revision: 2,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: baseline.version_digest,
      expected_revision: 2,
    }),
  });

  assert.equal(rollback.runtime_binding_verification.verification_phase, 'pre_commit');
  assert.equal(rollback.runtime_binding_verification.transaction_kind, 'rollback');
  assert.equal(rollback.runtime_binding_verification.version_digest, baseline.version_digest);
  assert.equal(rollback.runtime_binding_verification.expected_activation_revision, 2);
  assert.equal(controlled?.preflightCalls, 3);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, baseline.version_digest);
  assert.equal((await versions.activationHistory('fixture-agent', 'fixture-domain')).length, 3);
});

test('FoundryKernel rollback preflight failure preserves the current pointer and activation history', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry);
    return controlled;
  });
  await activateCreateRun(kernel, 'run:rollback-preflight-baseline');
  const [baseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);
  await kernel.startRun({
    request: request({
      request_id: 'request:rollback-preflight-improve',
      mode: 'improve',
      target_version_ref: baseline.version_digest,
    }),
    run_id: 'run:rollback-preflight-improve',
  });
  const improved = await kernel.advanceUntilPause('run:rollback-preflight-improve');
  assert.equal(improved.run.state, 'completed_active');
  const before = await versions.activation('fixture-agent', 'fixture-domain');
  assert.equal(before.revision, 2);
  controlled!.denyPreflight('rollback prepared binding denied');

  await assert.rejects(kernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: baseline.version_digest,
    expected_revision: before.revision,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: baseline.version_digest,
      expected_revision: before.revision,
    }),
  }), /rollback prepared binding denied/);

  assert.deepEqual(await versions.activation('fixture-agent', 'fixture-domain'), before);
  assert.equal((await versions.activationHistory('fixture-agent', 'fixture-domain')).length, 2);
  assert.equal(controlled?.readbackCalls, 0);
});

test('FoundryKernel takeover binds an exact active baseline and activates a separately qualified version', async () => {
  const { kernel, versions } = harness();
  await activateCreateRun(kernel, 'run:takeover-baseline');
  const [baseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);

  const takeoverRequest = request({
    request_id: 'request:takeover:fixture',
    mode: 'takeover',
    target_version_ref: baseline.version_digest,
  });
  await kernel.startRun({ request: takeoverRequest, run_id: 'run:takeover' });
  const completed = await kernel.advanceUntilPause('run:takeover');

  assert.equal(completed.run.state, 'completed_active');
  assert.equal(completed.run.risk_tier, 'low');
  assert.equal(completed.request.target_version_ref, baseline.version_digest);
  assert.equal((await kernel.listVersions('fixture-agent', 'fixture-domain')).length, 2);
  assert.notEqual((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, baseline.version_digest);
});

test('FoundryKernel Owner rejection is terminal and preserves the prior activation pointer', async () => {
  const { kernel, versions } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:owner-reject' });
  const waiting = await kernel.advanceUntilPause('run:owner-reject');
  assert.equal(waiting.run.state, 'awaiting_owner_canary');

  const rejected = await kernel.submitOwnerDecision({
    run_id: 'run:owner-reject',
    expected_revision: waiting.run.revision,
    decision: 'reject',
    authority_receipt_ref: authorizeRunMutation({
      inspection: waiting,
      action: 'reject_canary',
      decision: 'reject',
    }),
  });

  assert.equal(rejected.run.state, 'rejected');
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
});

test('FoundryKernel verifies exact OwnerGate coverage before appending an authority event', async () => {
  const { kernel, events } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:owner-gate-exact' });
  const waiting = await kernel.advanceUntilPause('run:owner-gate-exact');
  const revisionBefore = waiting.run.revision;
  const eventCountBefore = (await events.read(waiting.run.run_id)).length;
  const wrongTarget = ownerGate.register({
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: 'receipt:wrong-target',
    authority_ref: 'owner-gate:activation',
    action: 'approve_canary',
    decision: 'approve',
    target_agent_id: 'other-agent',
    target_domain_id: waiting.request.target_domain_id,
    run_id: waiting.run.run_id,
    version_digest: waiting.run.version_digest,
    expected_revision: waiting.run.revision,
    issued_at: '2026-07-16T00:00:00.000Z',
  });
  await assert.rejects(kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: wrongTarget.receipt_ref,
  }, { advance: false }), /exact requested authority mutation/);
  const unchanged = await kernel.inspectRun(waiting.run.run_id);
  assert.equal(unchanged.run.revision, revisionBefore);
  assert.equal((await events.read(waiting.run.run_id)).length, eventCountBefore);

  const authorityReceiptRef = authorizeRunMutation({
    inspection: waiting,
    action: 'approve_canary',
    decision: 'approve',
  });
  const approved = await kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorityReceiptRef,
  }, { advance: false });
  const authorityEvent = (await events.read(waiting.run.run_id)).at(-1)!;
  assert.equal(authorityEvent.event_type, 'owner_approved');
  assert.equal(authorityEvent.payload.owner_authority_receipt_ref, authorityReceiptRef);
  assert.equal(
    authorityEvent.payload.owner_authority_receipt_digest,
    authorityReceiptRef.slice(authorityReceiptRef.lastIndexOf('/') + 1),
  );
  const replay = await kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorityReceiptRef,
  }, { advance: false });
  assert.equal(replay.run.revision, approved.run.revision);
});

test('FoundryKernel rejects authority selected outside the Framework-owned target policy', async () => {
  const { kernel, events } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:untrusted-owner-authority' });
  const waiting = await kernel.advanceUntilPause('run:untrusted-owner-authority');
  const revision = waiting.run.revision;
  const eventCount = (await events.read(waiting.run.run_id)).length;
  const receiptRef = authorizeRunMutation({
    inspection: waiting,
    action: 'approve_canary',
    decision: 'approve',
    authority_ref: 'owner-gate:attacker',
  });
  await assert.rejects(kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: revision,
    decision: 'approve',
    authority_receipt_ref: receiptRef,
  }), /Framework-owned target authority policy/);
  assert.equal((await kernel.inspectRun(waiting.run.run_id)).run.revision, revision);
  assert.equal((await events.read(waiting.run.run_id)).length, eventCount);
});

test('FoundryKernel rejects missing or stale non-create baselines before design starts', async () => {
  const { kernel } = harness();
  await activateCreateRun(kernel, 'run:exact-baseline');
  const [historicalBaseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(historicalBaseline);

  await assert.rejects(kernel.startRun({
    request: request({
      request_id: 'request:takeover:missing-baseline',
      mode: 'takeover',
      target_version_ref: null,
    }),
    run_id: 'run:missing-baseline',
  }), /exact target version digest/);
  await assert.rejects(kernel.startRun({
    request: request({
      request_id: 'request:takeover:stale-baseline',
      mode: 'takeover',
      target_version_ref: `sha256:${'9'.repeat(64)}`,
    }),
    run_id: 'run:stale-baseline',
  }), /existing exact target version/);

  await kernel.startRun({
    request: request({
      request_id: 'request:takeover:advance-active',
      mode: 'takeover',
      target_version_ref: historicalBaseline.version_digest,
    }),
    run_id: 'run:advance-active',
  });
  assert.equal((await kernel.advanceUntilPause('run:advance-active')).run.state, 'completed_active');
  await assert.rejects(kernel.startRun({
    request: request({
      request_id: 'request:improve:historical-baseline',
      mode: 'improve',
      target_version_ref: historicalBaseline.version_digest,
    }),
    run_id: 'run:historical-baseline',
  }), /exact active AgentVersion/);

  await assert.rejects(kernel.startRun({
    request: request({ request_id: 'request:create:existing-active' }),
    run_id: 'run:create-existing-active',
  }), /no active AgentVersion/);
});

test('FoundryKernel exhausts the declared evolution generation budget even when scores improve', async () => {
  const { kernel, events } = harness(new BudgetEvaluator());
  await kernel.startRun({
    request: request({
      request_id: 'request:generation-budget',
      delivery_policy: { activation_mode: 'activate', max_generations: 1 },
    }),
    run_id: 'run:generation-budget',
  });
  const completed = await kernel.advanceUntilPause('run:generation-budget');

  assert.equal(completed.run.state, 'completed_unqualified');
  assert.equal(completed.run.generation, 1);
  assert.equal((await events.read('run:generation-budget')).at(-1)?.event_type, 'evolution_budget_exhausted');
});

test('FoundryKernel quarantines stale EvidenceBundle content binding', async () => {
  const { kernel, events } = harness(new StaleEvidenceEvaluator());
  await kernel.startRun({ request: request(), run_id: 'run:stale-evidence' });
  const inspection = await kernel.advanceUntilPause('run:stale-evidence');

  assert.equal(inspection.run.state, 'quarantined');
  assert.match(String((await events.read('run:stale-evidence')).at(-1)?.payload.failure_message), /stale/);
});

test('FoundryKernel recomputes evaluator facts and quarantines self-reported qualification', async (t) => {
  const mutations: Array<[string, (bundle: EvidenceBundle) => void, RegExp]> = [
    ['qualified boolean', (bundle) => { bundle.qualified = true; }, /qualification or gate score/],
    ['gate score', (bundle) => { bundle.gate_score = 1; }, /qualification or gate score/],
    ['public case identity', (bundle) => { bundle.public_results[0]!.case_id = 'case:invented'; }, /unknown or duplicate/],
    ['protected minimum count', (bundle) => {
      Object.assign(bundle.protected_aggregates[0]!, { total: 0, passed: 0, failed: 0, score: 0 });
    }, /frozen requirement/],
    ['protected aggregate score', (bundle) => { bundle.protected_aggregates[0]!.score = 1; }, /counts or score/],
    ['independent reviewer identity', (bundle) => {
      bundle.independent_review.evaluator_ref = 'evaluator:fixture';
    }, /provenance or content binding/],
  ];
  for (const [label, mutate, expectedMessage] of mutations) {
    await t.test(label, async () => {
      const { kernel, events } = harness(new MutatingEvidenceEvaluator(mutate));
      const runId = `run:tampered:${label.replaceAll(' ', '-')}`;
      await kernel.startRun({ request: request(), run_id: runId });
      const inspection = await kernel.advanceUntilPause(runId);
      assert.equal(inspection.run.state, 'quarantined');
      assert.match(String((await events.read(runId)).at(-1)?.payload.failure_message), expectedMessage);
    });
  }
});

test('FoundryKernel recomputes required baseline regression from complete public results', async () => {
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  const objects = new InMemoryFoundryObjectStore();
  const compiler = new DeterministicInMemoryCandidateCompiler();
  const baselineKernel = new FoundryKernel({
    designer: new FixtureDesigner(),
    evaluator: new FixtureEvaluator(),
    compiler,
    objects,
    events,
    versions,
    ownerGate,
  });
  await activateCreateRun(baselineKernel, 'run:baseline-regression-source');
  const [baseline] = await baselineKernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);
  const evaluator = new HiddenBaselineRegressionEvaluator();
  const kernel = new FoundryKernel({
    designer: new BaselineComparisonDesigner(),
    evaluator,
    compiler,
    objects,
    events,
    versions,
    ownerGate,
  });
  const takeover = request({
    request_id: 'request:hidden-baseline-regression',
    mode: 'takeover',
    target_version_ref: baseline.version_digest,
  });
  await kernel.startRun({ request: takeover, run_id: 'run:hidden-baseline-regression' });
  const inspection = await kernel.advanceUntilPause('run:hidden-baseline-regression');

  assert.equal(inspection.run.state, 'quarantined');
  assert.match(
    String((await events.read('run:hidden-baseline-regression')).at(-1)?.payload.failure_message),
    /qualification or gate score/,
  );
});

test('FoundryKernel qualification and canary reuse one admitted materialized candidate', async () => {
  const compiler = new CountingCandidateCompiler();
  const observedCandidateDigests: string[] = [];
  const fixture = new FixtureEvaluator();
  const evaluator: EvaluationExecutor = {
    evaluator_id: fixture.evaluator_id,
    evaluate: async (input) => {
      observedCandidateDigests.push(input.candidate.candidate_digest);
      return fixture.evaluate(input);
    },
    canary: async (input) => {
      observedCandidateDigests.push(input.candidate.candidate_digest);
      return fixture.canary(input);
    },
  };
  const kernel = new FoundryKernel({
    designer: new PassingDesigner(),
    evaluator,
    compiler,
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
    ownerGate,
  });
  await kernel.startRun({ request: request(), run_id: 'run:single-materialization' });
  const waiting = await kernel.advanceUntilPause('run:single-materialization');
  assert.equal(waiting.run.state, 'awaiting_owner_canary');
  assert.equal(compiler.calls, 1);
  const canary = await kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: waiting,
      action: 'approve_canary',
      decision: 'approve',
    }),
  }, { advance: false });
  assert.equal(canary.run.state, 'canary');
  await kernel.advanceRunStep(canary.run.run_id);

  assert.equal(compiler.calls, 1);
  assert.deepEqual(observedCandidateDigests, [waiting.run.candidate_digest, waiting.run.candidate_digest]);
});
