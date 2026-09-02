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
  claimStageRunRecoveryStart,
  findStageRunLaunch,
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunTemporalRecoveryStart,
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
import {
  stageQualityCycleProjectActivity,
} from '../../../src/adapters/execution/family-runtime-temporal-activities.ts';
import type {
  TemporalStageRunWorkflowState,
} from '../../../src/adapters/execution/family-runtime-temporal.ts';

function recoveryWorkflowInput(input: ReturnType<typeof stageRunInput>, recoveryId = 'recovery:closeout') {
  const artifactHash = `sha256:${'a'.repeat(64)}`;
  const producerAttemptRef = 'opl://stage_attempts/sat_recovered_producer';
  return {
    ...input,
    recovery_resume: {
      surface_kind: 'opl_stage_run_recovery_resume' as const,
      version: 'opl-stage-run-recovery-resume.v1' as const,
      recovery_id: recoveryId,
      quality_cycle_id: `quality-cycle:${input.stage_run_id}`,
      producer_attempt_ref: producerAttemptRef,
      producer_attempt_summary: {
        attempt_role: 'producer' as const,
        quality_round_index: 0,
        stage_attempt_id: 'sat_recovered_producer',
        workflow_id: 'wf_recovered_producer',
        execution_session_ref: 'codex://threads/recovered-producer',
        artifact_producer_attempt_ref: null,
        status: 'completed' as const,
        artifact_refs: ['artifact:recovered'],
        artifact_hashes: [artifactHash],
        artifact_identity_receipt_refs: ['artifact-identity:recovered'],
      },
      artifact_refs: ['artifact:recovered'],
      artifact_hashes: [artifactHash],
      artifact_identity_receipt_refs: ['artifact-identity:recovered'],
      review_input_snapshot_materialization_request: null,
    },
  };
}
test('launch registry recovers pre-start and post-start crash windows without duplicate starts', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const workflowInput = stageRunInput();
    const planned = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: false,
      startWorkflow: async () => assert.fail('planning must not start Temporal'),
    });
    assert.equal(planned.start_status, 'registered');
    assert.equal(planned.launch.launch_status, 'registered');

    const plannedReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: false,
      startWorkflow: async () => assert.fail('replayed planning must not start Temporal'),
    });
    assert.equal(plannedReplay.start_status, 'existing');
    assert.equal(plannedReplay.launch.launch_status, 'registered');

    let starts = 0;
    const recoveredPreStart = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: true,
      startWorkflow: async () => {
        starts += 1;
        return temporalStartReceipt(workflowInput);
      },
    });
    assert.equal(recoveredPreStart.start_status, 'recovered');
    assert.equal(recoveredPreStart.launch.launch_status, 'started');
    assert.equal(starts, 1);

    const runningReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: true,
      startWorkflow: async () => assert.fail('running replay must not issue another start'),
    });
    assert.equal(runningReplay.start_status, 'existing');
    assert.equal(starts, 1);

    recordStageRunClosed(db, { stageRunId: workflowInput.stage_run_id, terminalStatus: 'completed' });
    const closedReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: true,
      startWorkflow: async () => assert.fail('closed replay must not issue another start'),
    });
    assert.equal(closedReplay.start_status, 'existing');
    assert.equal(closedReplay.launch.launch_status, 'closed');

    const closedPlanReplay = await launchRegisteredStageRun({
      db,
      stageRunInput: workflowInput,
      start: false,
      startWorkflow: async () => assert.fail('closed planning replay must not start Temporal'),
    });
    assert.equal(closedPlanReplay.start_status, 'existing');
    assert.equal(closedPlanReplay.launch.launch_status, 'closed');

    const postStartCompletedInput = stageRunInput({ invocationId: 'sri_post_start_completed_crash' });
    registerStageRunLaunch(db, postStartCompletedInput);
    const recoveredPostStartCompleted = await launchRegisteredStageRun({
      db,
      stageRunInput: postStartCompletedInput,
      start: true,
      startWorkflow: async () => temporalStartReceipt(postStartCompletedInput, 'COMPLETED', {
        recovered_existing_execution: true,
      }),
    });
    assert.equal(recoveredPostStartCompleted.start_status, 'recovered');
    assert.equal(recoveredPostStartCompleted.launch.launch_status, 'closed');
    assert.equal(recoveredPostStartCompleted.launch.terminal_status, 'completed');

    const postStartFailedInput = stageRunInput({ invocationId: 'sri_post_start_failed_crash' });
    registerStageRunLaunch(db, postStartFailedInput);
    const recoveredPostStartFailed = await launchRegisteredStageRun({
      db,
      stageRunInput: postStartFailedInput,
      start: true,
      startWorkflow: async () => temporalStartReceipt(postStartFailedInput, 'FAILED', {
        recovered_existing_execution: true,
      }),
    });
    assert.equal(recoveredPostStartFailed.start_status, 'recovered');
    assert.equal(recoveredPostStartFailed.launch.launch_status, 'closed');
    assert.equal(recoveredPostStartFailed.launch.terminal_status, 'failed');
  } finally {
    db.close();
  }
});

test('closed StageRun claims and records one immutable recovery Run idempotently', () => {
  const db = new DatabaseSync(':memory:');
  const input = stageRunInput({ invocationId: 'sri_closeout_recovery' });
  try {
    registerStageRunLaunch(db, input);
    recordStageRunTemporalStart(db, {
      stageRunId: input.stage_run_id,
      temporalStartReceipt: temporalStartReceipt(input, 'COMPLETED'),
    });
    recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'completed' });
    const workflowInput = recoveryWorkflowInput(input);
    const claim = claimStageRunRecoveryStart(db, {
      workflowInput,
      claimToken: 'recovery-claim',
      now: new Date('2026-09-02T00:00:00.000Z'),
    });
    assert.equal(claim.claimed, true);
    assert.equal(claim.claim_status, 'claimed');

    const concurrent = claimStageRunRecoveryStart(db, {
      workflowInput,
      claimToken: 'concurrent-claim',
      now: new Date('2026-09-02T00:00:01.000Z'),
    });
    assert.equal(concurrent.claimed, false);
    assert.equal(concurrent.claim_status, 'active_starting');

    const recovery = workflowInput.recovery_resume;
    const recorded = recordStageRunTemporalRecoveryStart(db, {
      stageRunId: input.stage_run_id,
      recoveryId: recovery.recovery_id,
      claimToken: 'recovery-claim',
      temporalStartReceipt: {
        surface_kind: 'temporal_stage_run_recovery_start_receipt',
        version: 'opl-temporal-stage-run-recovery-start-receipt.v1',
        recovery_id: recovery.recovery_id,
        stage_run_id: input.stage_run_id,
        stage_run_invocation_id: input.stage_run_invocation_id,
        stage_run_spec_sha256: input.stage_run_spec_sha256,
        quality_cycle_id: recovery.quality_cycle_id,
        producer_attempt_ref: recovery.producer_attempt_ref,
        workflow_id: input.workflow_id,
        recovery_run_id: 'run-closeout-recovery',
        workflow_status: 'RUNNING',
      },
    });
    assert.equal(recorded.recovery_run.start_status, 'started');
    assert.equal(
      recorded.launch.temporal_start_receipt?.first_execution_run_id,
      `run-${input.stage_run_id}`,
    );

    const replay = claimStageRunRecoveryStart(db, { workflowInput });
    assert.equal(replay.claimed, false);
    assert.equal(replay.claim_status, 'started');
    assert.equal(replay.recovery_run.temporal_start_receipt?.recovery_run_id, 'run-closeout-recovery');
    assert.equal(
      (replay.launch.temporal_start_receipt?.recovery_runs as unknown[]).length,
      1,
    );

    assert.throws(() => claimStageRunRecoveryStart(db, {
      workflowInput,
      terminalRetry: {
        recoveryRunId: 'run-closeout-recovery',
        workflowStatus: 'CONTINUED_AS_NEW',
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_recovery_terminal_retry_identity_mismatch');
      return true;
    });

    const retryClaim = claimStageRunRecoveryStart(db, {
      workflowInput,
      claimToken: 'terminal-retry-claim',
      terminalRetry: {
        recoveryRunId: 'run-closeout-recovery',
        workflowStatus: 'COMPLETED',
      },
    });
    assert.equal(retryClaim.claimed, true);
    assert.equal(retryClaim.claim_status, 'retry_claimed');
    assert.equal(retryClaim.recovery_run.start_attempt_count, 2);
    assert.equal(retryClaim.recovery_run.temporal_start_receipt, null);
    assert.equal(retryClaim.recovery_run.temporal_start_receipt_history?.length, 1);

    const retried = recordStageRunTemporalRecoveryStart(db, {
      stageRunId: input.stage_run_id,
      recoveryId: recovery.recovery_id,
      claimToken: 'terminal-retry-claim',
      temporalStartReceipt: {
        surface_kind: 'temporal_stage_run_recovery_start_receipt',
        version: 'opl-temporal-stage-run-recovery-start-receipt.v1',
        recovery_id: recovery.recovery_id,
        stage_run_id: input.stage_run_id,
        stage_run_invocation_id: input.stage_run_invocation_id,
        stage_run_spec_sha256: input.stage_run_spec_sha256,
        quality_cycle_id: recovery.quality_cycle_id,
        producer_attempt_ref: recovery.producer_attempt_ref,
        workflow_id: input.workflow_id,
        recovery_run_id: 'run-closeout-recovery-retry',
        workflow_status: 'RUNNING',
      },
    });
    assert.equal(
      retried.recovery_run.temporal_start_receipt?.recovery_run_id,
      'run-closeout-recovery-retry',
    );
    assert.equal(retried.recovery_run.temporal_start_receipt_history?.length, 1);

    assert.throws(() => claimStageRunRecoveryStart(db, {
      workflowInput: recoveryWorkflowInput(input, 'recovery:different'),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_recovery_identity_conflict');
      return true;
    });
  } finally {
    db.close();
  }
});

test('closed StageRun recovery projects quality state without changing its terminal status', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-closed-projection-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const input = stageRunInput({ invocationId: 'sri_closed_quality_projection' });
  try {
    const { db } = openQueueDb();
    try {
      registerStageRunLaunch(db, input, {
        scopeKind: input.scope_kind,
        executionScope: input.execution_scope,
      });
      recordStageRunTemporalStart(db, {
        stageRunId: input.stage_run_id,
        temporalStartReceipt: temporalStartReceipt(input, 'COMPLETED'),
      });
      recordStageRunClosed(db, {
        stageRunId: input.stage_run_id,
        terminalStatus: 'completed_with_quality_debt',
      });
    } finally {
      db.close();
    }

    const now = '2026-09-02T00:00:00.000Z';
    const state: TemporalStageRunWorkflowState = {
      surface_kind: 'temporal_stage_run_query',
      provider_kind: 'temporal',
      stage_run_id: input.stage_run_id,
      workflow_id: input.workflow_id,
      scope_kind: input.scope_kind,
      execution_scope: input.execution_scope,
      quality_cycle_id: `quality-cycle:${input.stage_run_id}`,
      domain_id: input.domain_id,
      stage_id: input.stage_id,
      status: 'completed',
      current_role: null,
      repair_rounds_used: 0,
      max_repair_rounds: input.quality_policy.formal_review.max_repair_rounds,
      attempts: [],
      findings: [],
      repair_map: [],
      finding_closures: [],
      review_receipts: [],
      artifact_refs: [...(input.artifact_refs ?? [])],
      artifact_hashes: [...(input.artifact_hashes ?? [])],
      artifact_identity_receipt_refs: [...(input.artifact_identity_receipt_refs ?? [])],
      quality_debt_refs: [],
      route_quality_debt_refs: [],
      decisive_attempt_role: null,
      decisive_attempt_ref: null,
      selected_stage_route: null,
      route_evidence_refs: [],
      route_recommendations: [],
      next_stage_run_launch: null,
      blocked_reason: null,
      hard_stop_class: null,
      typed_blocker_refs: [],
      human_gate_refs: [],
      source_attempt_ref: null,
      sqlite_projection: { status: 'pending', error: null },
      started_at: now,
      updated_at: now,
      authority_boundary: {
        opl: 'durable_quality_loop_orchestration_and_refs_transport_only',
        domain: 'review_findings_repair_artifact_and_quality_verdict_owner',
        provider_completion_is_domain_ready: false,
      },
    };

    const projection = await stageQualityCycleProjectActivity({ stage_run: input, state });
    assert.equal((projection.state as any).controller_readback.controller_status, 'completed');

    const { db: readbackDb } = openQueueDb();
    try {
      const launch = inspectStageRunLaunch(readbackDb, input.stage_run_id);
      assert.equal(launch.launch_status, 'closed');
      assert.equal(launch.terminal_status, 'completed_with_quality_debt');
    } finally {
      readbackDb.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('two SQLite connections atomically claim one StageRun start without a lock error', async () => {
  const dbPath = path.join(fixtureRoot, `claim-race-${crypto.randomUUID()}.sqlite`);
  const input = stageRunInput({ invocationId: 'sri_real_sqlite_claim_race' });
  const setupDb = new DatabaseSync(dbPath);
  registerStageRunLaunch(setupDb, input);
  setupDb.close();

  const barrierBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const barrier = new Int32Array(barrierBuffer);
  const workers = ['claim-a', 'claim-b'].map((claimToken) => workerClaim({
    dbPath,
    stageRunId: input.stage_run_id,
    barrier: barrierBuffer,
    claimToken,
  }));
  await waitForBarrierCount(barrier, workers.length);
  Atomics.store(barrier, 1, 1);
  Atomics.notify(barrier, 1, workers.length);
  const results = await Promise.all(workers.map((entry) => entry.result));
  await Promise.all(workers.map((entry) => entry.exited));

  assert.equal(results.every((entry) => entry.ok), true, JSON.stringify(results));
  assert.deepEqual(
    results.map((entry) => entry.result.claimed).sort(),
    [false, true],
  );
  assert.deepEqual(
    results.map((entry) => entry.result.claim_status).sort(),
    ['active_starting', 'claimed'],
  );
  const readDb = new DatabaseSync(dbPath);
  try {
    const launch = inspectStageRunLaunch(readDb, input.stage_run_id);
    assert.equal(launch.launch_status, 'starting');
    assert.equal(launch.start_attempt_count, 1);
  } finally {
    readDb.close();
  }
});

test('two SQLite connections close one started StageRun atomically and idempotently', async () => {
  const dbPath = path.join(fixtureRoot, `close-race-${crypto.randomUUID()}.sqlite`);
  const input = stageRunInput({ invocationId: 'sri_real_sqlite_close_race' });
  const setupDb = new DatabaseSync(dbPath);
  registerStageRunLaunch(setupDb, input);
  recordStageRunTemporalStart(setupDb, {
    stageRunId: input.stage_run_id,
    temporalStartReceipt: temporalStartReceipt(input),
  });
  setupDb.close();

  const barrierBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const barrier = new Int32Array(barrierBuffer);
  const workers = Array.from({ length: 2 }, () => workerClose({
    dbPath,
    stageRunId: input.stage_run_id,
    barrier: barrierBuffer,
    terminalStatus: 'completed',
  }));
  await waitForBarrierCount(barrier, workers.length);
  Atomics.store(barrier, 1, 1);
  Atomics.notify(barrier, 1, workers.length);
  const results = await Promise.all(workers.map((entry) => entry.result));
  await Promise.all(workers.map((entry) => entry.exited));

  assert.equal(results.every((entry) => entry.ok), true, JSON.stringify(results));
  assert.equal(results.every((entry) => entry.result.launch_status === 'closed'), true);
  assert.equal(results.every((entry) => entry.result.terminal_status === 'completed'), true);
  const readDb = new DatabaseSync(dbPath);
  try {
    assert.throws(() => recordStageRunClosed(readDb, {
      stageRunId: input.stage_run_id,
      terminalStatus: 'failed',
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_terminal_status_conflict');
      return true;
    });
  } finally {
    readDb.close();
  }
});

test('concurrent launch callers expose one active starter and one idempotent existing result', async () => {
  const dbPath = path.join(fixtureRoot, `launch-race-${crypto.randomUUID()}.sqlite`);
  const firstDb = new DatabaseSync(dbPath);
  const secondDb = new DatabaseSync(dbPath);
  const input = stageRunInput({ invocationId: 'sri_launch_race' });
  let starts = 0;
  let releaseStart!: () => void;
  let markStarted!: () => void;
  const startReleased = new Promise<void>((resolve) => { releaseStart = resolve; });
  const startEntered = new Promise<void>((resolve) => { markStarted = resolve; });
  try {
    const first = launchRegisteredStageRun({
      db: firstDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        starts += 1;
        markStarted();
        await startReleased;
        return temporalStartReceipt(input);
      },
    });
    await startEntered;
    const second = await launchRegisteredStageRun({
      db: secondDb,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => assert.fail('active starting lease must suppress a duplicate start'),
    });
    assert.equal(second.start_status, 'starting');
    assert.equal(second.idempotent_replay, true);
    assert.equal(starts, 1);
    releaseStart();
    const started = await first;
    assert.equal(started.start_status, 'started');
    assert.equal(started.launch.launch_status, 'started');
    assert.equal(starts, 1);
  } finally {
    releaseStart?.();
    firstDb.close();
    secondDb.close();
  }
});

test('stale starting lease is recovered with the same deterministic workflow id', async () => {
  const db = new DatabaseSync(':memory:');
  const input = stageRunInput({ invocationId: 'sri_stale_starting_takeover' });
  try {
    registerStageRunLaunch(db, input);
    const firstClaim = claimStageRunStart(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'abandoned-claim',
      now: new Date('2026-07-14T00:00:00.000Z'),
      leaseMs: 10,
    });
    assert.equal(firstClaim.claimed, true);
    let starts = 0;
    const recovered = await launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      now: () => new Date('2026-07-14T00:00:00.020Z'),
      startLeaseMs: 10,
      describeWorkflow: async () => ({
        ...temporalStartReceipt(input, 'NOT_FOUND'),
        workflow_found: false,
        first_execution_run_id: null,
      }),
      startWorkflow: async () => {
        starts += 1;
        return temporalStartReceipt(input);
      },
    });
    assert.equal(recovered.start_status, 'recovered');
    assert.equal(recovered.launch.workflow_id, input.workflow_id);
    assert.equal(recovered.launch.start_attempt_count, 2);
    assert.equal(starts, 1);
  } finally {
    db.close();
  }
});

test('unknown-success start is retried idempotently without materializing a second workflow', async () => {
  const db = new DatabaseSync(':memory:');
  const input = stageRunInput({ invocationId: 'sri_unknown_start_success' });
  let materializedWorkflows = 0;
  try {
    await assert.rejects(launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => {
        materializedWorkflows += 1;
        throw new Error('transport lost after Temporal accepted the deterministic workflow id');
      },
    }), /transport lost/);
    assert.equal(inspectStageRunLaunch(db, input.stage_run_id).launch_status, 'start_failed');

    const recovered = await launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      startWorkflow: async () => temporalStartReceipt(input, 'RUNNING', {
        recovered_existing_execution: true,
      }),
    });
    assert.equal(recovered.start_status, 'recovered');
    assert.equal(recovered.launch.launch_status, 'started');
    assert.equal(materializedWorkflows, 1);
    assert.equal(recovered.temporal_start?.first_execution_run_id, `run-${input.stage_run_id}`);
  } finally {
    db.close();
  }
});

test('provider observation closes post-start crash and late failures cannot downgrade started or closed', async () => {
  const db = new DatabaseSync(':memory:');
  const input = stageRunInput({ invocationId: 'sri_post_start_observation' });
  try {
    registerStageRunLaunch(db, input);
    const claim = claimStageRunStart(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'crashed-after-provider-start',
    });
    assert.equal(claim.claimed, true);
    const reconciled = await launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      describeWorkflow: async () => ({
        ...temporalStartReceipt(input),
        workflow_found: true,
      }),
      startWorkflow: async () => assert.fail('provider observation must prevent a duplicate start'),
    });
    assert.equal(reconciled.start_status, 'existing');
    assert.equal(reconciled.launch.launch_status, 'started');

    await assert.rejects(launchRegisteredStageRun({
      db,
      stageRunInput: input,
      start: true,
      describeWorkflow: async () => ({
        ...temporalStartReceipt(input),
        first_execution_run_id: 'conflicting-first-execution',
        workflow_found: true,
      }),
      startWorkflow: async () => assert.fail('identity conflict must fail before another start'),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_temporal_execution_identity_conflict');
      return true;
    });

    const afterLateFailure = recordStageRunStartFailure(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'crashed-after-provider-start',
      error: new Error('late callback failure'),
    });
    assert.equal(afterLateFailure.launch_status, 'started');
    recordStageRunClosed(db, { stageRunId: input.stage_run_id, terminalStatus: 'completed' });
    const afterClosedLateFailure = recordStageRunStartFailure(db, {
      stageRunId: input.stage_run_id,
      claimToken: 'crashed-after-provider-start',
      error: new Error('even later callback failure'),
    });
    assert.equal(afterClosedLateFailure.launch_status, 'closed');
    assert.equal(afterClosedLateFailure.terminal_status, 'completed');
    assert.throws(() => recordStageRunTemporalStart(db, {
      stageRunId: input.stage_run_id,
      temporalStartReceipt: {
        ...temporalStartReceipt(input),
        first_execution_run_id: 'conflicting-closed-first-execution',
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_temporal_execution_identity_conflict');
      return true;
    });
  } finally {
    db.close();
  }
});

test('registry revalidates prompt, rubric, source, checkpoint, and artifact bytes before write', () => {
  const input = stageRunInput({ invocationId: 'sri_content_revalidation' });
  const cases = [
    path.join(domainPackRoot, 'agent/prompts/intake.md'),
    path.join(domainPackRoot, 'agent/quality_gates/stage.md'),
    path.join(domainPackRoot, 'agent/sources/request.md'),
    manifestFixture.filePath,
    artifactFixtures.request!.filePath,
  ];
  for (const filePath of cases) {
    const original = fs.readFileSync(filePath);
    const db = new DatabaseSync(':memory:');
    try {
      fs.appendFileSync(filePath, 'tampered-after-spec\n');
      assert.throws(() => registerStageRunLaunch(db, input), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_content_binding_stale');
        return true;
      });
    } finally {
      fs.writeFileSync(filePath, original);
      db.close();
    }
  }
});

test('immutable spec binds both role prompt backing file and effective Markdown section bytes', () => {
  const input = stageRunInput({ invocationId: 'sri_role_prompt_effective_section' });
  const producer = input.stage_run_spec.content_bindings.find((entry) => (
    entry.purpose === 'role_prompt' && entry.ref.endsWith('#producer')
  ));
  const reviewer = input.stage_run_spec.content_bindings.find((entry) => (
    entry.purpose === 'role_prompt' && entry.ref.endsWith('#reviewer')
  ));
  const rolePromptBytes = fs.readFileSync(path.join(domainPackRoot, 'agent/prompts/stage-quality.md'));
  assert.equal(producer?.sha256, sha256(rolePromptBytes));
  assert.equal(reviewer?.sha256, producer?.sha256);
  assert.equal(producer?.effective_content_sha256, sha256('## Producer\nProduce the artifact.'));
  assert.equal(reviewer?.effective_content_sha256, sha256('## Reviewer\nReview the artifact.'));
  assert.notEqual(producer?.effective_content_sha256, reviewer?.effective_content_sha256);
  assert.equal(producer?.effective_content_byte_size, Buffer.byteLength('## Producer\nProduce the artifact.'));

  const tamperedSpec = structuredClone(input.stage_run_spec);
  const tamperedProducer = tamperedSpec.content_bindings.find((entry) => (
    entry.purpose === 'role_prompt' && entry.ref.endsWith('#producer')
  ))!;
  tamperedProducer.effective_content_sha256 = sha256('different extracted section');
  const tamperedInput = {
    ...input,
    stage_run_spec: tamperedSpec,
    stage_run_spec_sha256: stageRunSpecSha256(tamperedSpec),
  };
  const db = new DatabaseSync(':memory:');
  try {
    assert.throws(() => registerStageRunLaunch(db, tamperedInput), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_role_prompt_content_binding_stale');
      return true;
    });
  } finally {
    db.close();
  }
});

test('trusted content-addressed receipt binds an external source through the immutable spec', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-external-source-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const sourceRef = 'https://evidence.example.invalid/source/request.json';
    const sourceBytes = Buffer.from('{"question":"external evidence"}\n', 'utf8');
    const sourceSha256 = sha256(sourceBytes);
    const receipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-external-source-owner',
      stageRunId: 'sr-external-source-owner',
      artifactRef: sourceRef,
      artifactSha256: sourceSha256,
      sizeBytes: sourceBytes.length,
    });
    const input = stageRunInput({
      invocationId: 'sri_external_source_receipt',
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: {
        ref: sourceRef,
        sha256: sourceSha256,
        identityReceiptRef: receipt.ref,
      },
    });
    const sourceBinding = input.stage_run_spec.content_bindings.find((entry) => (
      entry.purpose === 'source' && entry.ref === sourceRef
    ));
    assert.equal(sourceBinding?.verification_kind, 'trusted_artifact_identity_receipt');
    assert.equal(sourceBinding?.identity_receipt_ref, receipt.ref);
    assert.equal(sourceBinding?.producing_stage_run_ref, 'opl://stage-runs/sr-external-source-owner');
    assert.equal(sourceBinding?.producing_attempt_ref, 'opl://stage-attempts/sat-external-source-owner');
    assert.equal(sourceBinding?.byte_size, sourceBytes.length);

    for (const [field, value] of [
      ['producing_stage_run_ref', 'opl://stage-runs/sr-other-owner'],
      ['producing_attempt_ref', 'opl://stage-attempts/sat-other-owner'],
      ['byte_size', sourceBytes.length + 1],
    ] as const) {
      const tamperedSpec = structuredClone(input.stage_run_spec);
      const tamperedBinding = tamperedSpec.content_bindings.find((entry) => (
        entry.purpose === 'source' && entry.ref === sourceRef
      ));
      assert.ok(tamperedBinding);
      (tamperedBinding as any)[field] = value;
      assert.throws(() => revalidateStageRunImmutableSpecContent({
        spec: tamperedSpec,
        domainPackRoot,
        workspaceLocator: input.workspace_locator,
        scopeKind: 'domain',
        executionScope: null,
      }), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_binding_mismatch');
        return true;
      }, field);
    }

    const missingStageRunReceipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-external-source-owner',
      stageRunId: null,
      artifactRef: sourceRef,
      artifactSha256: sourceSha256,
      sizeBytes: sourceBytes.length,
    });
    assert.throws(() => stageRunInput({
      invocationId: 'sri_external_source_receipt_without_stage_run',
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: {
        ref: sourceRef,
        sha256: sourceSha256,
        identityReceiptRef: missingStageRunReceipt.ref,
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_mismatch');
      return true;
    });

    const db = new DatabaseSync(':memory:');
    try {
      registerStageRunLaunch(db, input);
      fs.appendFileSync(receipt.filePath, 'tampered-after-spec\n');
      assert.throws(() => registerStageRunLaunch(db, input), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_digest_mismatch');
        return true;
      });
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
