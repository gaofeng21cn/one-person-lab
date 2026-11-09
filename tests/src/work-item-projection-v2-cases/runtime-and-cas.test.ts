import {
  assert,
  crypto,
  createHash,
  fs,
  path,
  DatabaseSync,
  pathToFileURL,
  test,
  parseJsonText,
  record,
  validateJsonSchemaPayload,
  buildAppRuntimeWorkItemProjection,
  readWorkItemStageAttempts,
  projectRuntimeActivityItems,
  buildWorkItemProjectionV2,
  buildStageAttemptRuntimeCurrentness,
  createStageAttemptTable,
  createStageRunLaunchTable,
  attempt,
  fixture,
  writeActionRequest,
  writeCasReadEpoch,
  writeCasJournal,
  persistStageAttempt,
} from './fixtures.ts';

test('legacy action request identity remains diagnostic-only even when its digest is valid', () => {
  const input = fixture();
  try {
    const workItemId = '001-dm-cvd-mortality-risk';
    const validRequest = writeActionRequest(input.diabetes, 'legacy-identity-valid', {
      workspace_root: input.diabetes,
      study_id: workItemId,
    });
    const valid = attempt({
      id: 'sat-legacy-identity-valid',
      root: input.diabetes,
      workItemId,
      status: 'queued',
      identityField: null,
      actionRequest: validRequest,
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    const validProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [valid],
      resolveDescriptor: input.resolveDescriptor,
    });
    const validItem = validProjection.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(validItem.execution.attempt_id, null);
    assert.equal(
      validItem.source_refs.some((source) =>
        source.role === 'stage_attempt_action_request_identity_evidence'
          && source.ref === `${validRequest.ref}#sha256=${validRequest.sha256}`
      ),
      false,
    );
    assert.equal(validProjection.diagnostics.items.some((diagnostic) =>
      diagnostic.reason === 'stage_attempt_identity_unresolved'
        && diagnostic.ref === 'sat-legacy-identity-valid'
    ), true);

    const tampered = attempt({
      id: 'sat-legacy-identity-tampered',
      root: input.diabetes,
      workItemId,
      status: 'queued',
      identityField: null,
      actionRequest: { ref: validRequest.ref, sha256: '0'.repeat(64) },
      updatedAt: '2026-07-15T00:02:00.000Z',
    });
    const tamperedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [tampered],
      resolveDescriptor: input.resolveDescriptor,
    });
    const tamperedItem = tamperedProjection.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(tamperedItem.execution.attempt_id, null);
    assert.equal(
      tamperedProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.reason === 'stage_attempt_identity_unresolved'
          && diagnostic.ref === 'sat-legacy-identity-tampered'
      ),
      true,
    );

    const escapedRequest = writeActionRequest(input.pitnet, 'legacy-identity-escaped', {
      workspace_root: input.diabetes,
      study_id: workItemId,
    });
    const escapedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-legacy-identity-escaped',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        identityField: null,
        actionRequest: escapedRequest,
        updatedAt: '2026-07-15T00:02:30.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      escapedProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.reason === 'stage_attempt_identity_unresolved'
          && diagnostic.ref === 'sat-legacy-identity-escaped'
      ),
      true,
    );
    assert.equal(
      escapedProjection.items.find((item) => item.identity.work_item_id === workItemId)?.execution.attempt_id,
      null,
    );

    const symlinkRun = path.join(input.diabetes, 'control', 'opl', 'action_runs', 'legacy-identity-symlink');
    fs.mkdirSync(symlinkRun, { recursive: true });
    const symlinkTarget = path.join(input.diabetes, 'legacy-identity-target.json');
    const symlinkBytes = Buffer.from(JSON.stringify({ study_id: workItemId }), 'utf8');
    fs.writeFileSync(symlinkTarget, symlinkBytes);
    const symlinkRequestPath = path.join(symlinkRun, 'request.json');
    fs.symlinkSync(symlinkTarget, symlinkRequestPath);
    const symlinkProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-legacy-identity-symlink',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        identityField: null,
        actionRequest: {
          ref: pathToFileURL(symlinkRequestPath).href,
          sha256: crypto.createHash('sha256').update(symlinkBytes).digest('hex'),
        },
        updatedAt: '2026-07-15T00:02:40.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      symlinkProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.reason === 'stage_attempt_identity_unresolved'
          && diagnostic.ref === 'sat-legacy-identity-symlink'
      ),
      true,
    );
    assert.equal(
      symlinkProjection.items.find((item) => item.identity.work_item_id === workItemId)?.execution.attempt_id,
      null,
    );

    const oversizedPath = path.join(
      input.diabetes,
      'control',
      'opl',
      'action_runs',
      'legacy-identity-oversized',
      'request.json',
    );
    fs.mkdirSync(path.dirname(oversizedPath), { recursive: true });
    const oversizedBytes = Buffer.alloc(1_048_577, 0x20);
    fs.writeFileSync(oversizedPath, oversizedBytes);
    const oversizedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-legacy-identity-oversized',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        identityField: null,
        actionRequest: {
          ref: pathToFileURL(oversizedPath).href,
          sha256: crypto.createHash('sha256').update(oversizedBytes).digest('hex'),
        },
        updatedAt: '2026-07-15T00:02:50.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      oversizedProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.reason === 'stage_attempt_identity_unresolved'
          && diagnostic.ref === 'sat-legacy-identity-oversized'
      ),
      true,
    );
    assert.equal(
      oversizedProjection.items.find((item) => item.identity.work_item_id === workItemId)?.execution.attempt_id,
      null,
    );

    const conflictingRequest = writeActionRequest(input.diabetes, 'legacy-identity-conflict', {
      workspace_root: input.diabetes,
      study_id: workItemId,
      work_item_id: '002-dm-china-us-mortality-attribution',
    });
    const conflicting = attempt({
      id: 'sat-legacy-identity-conflict',
      root: input.diabetes,
      workItemId,
      status: 'queued',
      identityField: null,
      actionRequest: conflictingRequest,
      updatedAt: '2026-07-15T00:03:00.000Z',
    });
    const conflictingProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [conflicting],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      conflictingProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.reason === 'stage_attempt_identity_unresolved'
          && diagnostic.ref === 'sat-legacy-identity-conflict'
      ),
      true,
    );
    assert.equal(
      conflictingProjection.items.find((item) => item.identity.work_item_id === workItemId)?.execution.attempt_id,
      null,
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('fresh Temporal runtime observation reconciles queued ledger in the fast producer', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const observedAt = new Date(Date.now() - 1_000);
    const expiresAt = new Date(observedAt.getTime() + 600_000);
    const runtimeObservation = {
      surface_kind: 'temporal_stage_attempt_runtime_observation',
      source: 'temporal_workflow_query',
      observed_at: observedAt.toISOString(),
      ttl_ms: 600_000,
      expires_at: expiresAt.toISOString(),
      workflow_status: 'RUNNING',
      query_status: 'running',
      effective_runtime_status: 'running',
      stage_attempt_id: 'sat-temporal-observation-running',
      workflow_id: 'workflow:sat-temporal-observation-running',
      run_id: 'temporal-run-002',
      provider_updated_at: observedAt.toISOString(),
      provider_completion_is_domain_ready: false,
    };
    const projection = buildAppRuntimeWorkItemProjection({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-temporal-observation-running',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'registered',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimeObservation,
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.execution.state, 'running');
    assert.equal(item.execution.stage_status, 'running');
    assert.equal(item.execution.running_proof_status, 'running_confirmed');
    assert.equal(item.execution.diagnostic_reason, null);
    assert.equal(item.lifecycle.primary_state, 'automatically_advancing');
    assert.equal(item.lifecycle.primary_state_reason, 'current_runtime_wake_running');
    assert.equal(projection.summary.running_count, 1);

    const mismatched = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-temporal-observation-copied',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'registered',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimeObservation,
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const mismatchedItem = mismatched.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(mismatchedItem.execution.state, 'queued');
    assert.equal(
      mismatchedItem.execution.diagnostic_reason,
      'temporal_runtime_observation_identity_mismatch',
    );
    assert.equal(mismatchedItem.lifecycle.primary_state, 'paused');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('CAS read epoch makes projection fail closed without changing fresh Temporal execution', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const stateRoot = path.join(input.root, 'opl-state-cas-read-guard');
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const observedAt = new Date(Date.now() - 1_000);
    const runtimeObservation = {
      surface_kind: 'temporal_stage_attempt_runtime_observation',
      source: 'temporal_workflow_query',
      observed_at: observedAt.toISOString(),
      ttl_ms: 600_000,
      expires_at: new Date(observedAt.getTime() + 600_000).toISOString(),
      workflow_status: 'RUNNING',
      query_status: 'running',
      effective_runtime_status: 'running',
      stage_attempt_id: 'sat-cas-read-guard-running',
      workflow_id: 'workflow:sat-cas-read-guard-running',
      run_id: 'temporal-run-cas-read-guard',
      provider_updated_at: observedAt.toISOString(),
      provider_completion_is_domain_ready: false,
    };
    const runningAttempt = attempt({
      id: 'sat-cas-read-guard-running',
      root: input.diabetes,
      workItemId,
      status: 'queued',
      providerStatus: 'registered',
      stageId: '01-study_intake',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtimeObservation,
    });
    const build = (resolveDescriptor = input.resolveDescriptor) => buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [runningAttempt],
      resolveDescriptor,
    });
    const baseline = build();
    const baselineItem = baseline.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(baselineItem.execution.state, 'running');
    assert.equal(baselineItem.execution.running_proof_status, 'running_confirmed');
    assert.equal(baselineItem.lifecycle.primary_state_reason, 'current_runtime_wake_running');

    writeCasReadEpoch({
      stateRoot,
      workspaceRoot: input.diabetes,
      transitionId: 'cas-read-guard-in-progress',
      phase: 'in_progress',
    });
    const paths = writeCasJournal(stateRoot, input.diabetes);
    const pending = build();
    const pendingItem = pending.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(pendingItem.lifecycle.business_state, 'unknown');
    assert.equal(pendingItem.lifecycle.domain_business_state, 'unknown');
    assert.equal(pendingItem.lifecycle.primary_state, 'sync_pending');
    assert.equal(pendingItem.action.kind, 'blocked_no_action');
    assert.equal(pendingItem.attention.kind, 'system');
    assert.deepEqual(pendingItem.execution, baselineItem.execution);
    assert.equal(pending.summary.running_count, baseline.summary.running_count);
    assert.equal(
      pendingItem.conditions.some((condition) =>
        condition.type === 'DomainArtifactMaterializationSettled'
          && condition.status === 'False'
      ),
      true,
    );
    assert.equal(
      pending.items
        .filter((item) => item.identity.workspace_path === input.diabetes)
        .every((item) => item.lifecycle.primary_state === 'sync_pending'),
      true,
    );
    assert.notEqual(
      pending.items.find((item) => item.identity.workspace_path === input.pitnet)?.lifecycle.primary_state,
      'sync_pending',
    );
    const schemaRef = 'contracts/opl-framework/work-item-projection-v2.schema.json';
    const schema = parseJsonText(fs.readFileSync(schemaRef, 'utf8')) as Record<string, unknown>;
    const pendingValidation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2.cas_sync_pending',
      schema,
      sourceRef: schemaRef,
    }, pending);
    assert.equal(
      pendingValidation.ok,
      true,
      pendingValidation.ok ? '' : JSON.stringify(pendingValidation.errors, null, 2),
    );

    fs.rmSync(paths.journal);
    writeCasReadEpoch({
      stateRoot,
      workspaceRoot: input.diabetes,
      transitionId: 'cas-read-guard-settled',
      phase: 'settled',
    });
    const recovered = build();
    const recoveredItem = recovered.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(recoveredItem.lifecycle.business_state, 'paused');
    assert.equal(recoveredItem.lifecycle.primary_state_reason, 'current_runtime_wake_running');
    assert.deepEqual(recoveredItem.execution, baselineItem.execution);

    writeCasReadEpoch({
      stateRoot,
      workspaceRoot: input.diabetes,
      transitionId: 'cas-read-window-before',
      phase: 'settled',
    });
    let completedInsideRead = false;
    const raced = build((agentId) => {
      if (!completedInsideRead) {
        completedInsideRead = true;
        writeCasReadEpoch({
          stateRoot,
          workspaceRoot: input.diabetes,
          transitionId: 'cas-read-window-after',
          phase: 'settled',
        });
      }
      return input.resolveDescriptor(agentId);
    });
    const racedItem = raced.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(racedItem.lifecycle.primary_state, 'sync_pending');
    assert.equal(
      raced.diagnostics.items.some((diagnostic) =>
        diagnostic.details?.observation_reason === 'workspace_cas_read_generation_changed'
      ),
      true,
    );
    assert.deepEqual(racedItem.execution, baselineItem.execution);
    assert.equal(build().items.find((item) => item.identity.work_item_id === workItemId)?.lifecycle.business_state, 'paused');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('expired Temporal runtime observation stays queued with a diagnostic and does not wake stopped work', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const observedAt = new Date(Date.now() - 1_200_000);
    const expiresAt = new Date(observedAt.getTime() + 600_000);
    const runtimeObservation = {
      surface_kind: 'temporal_stage_attempt_runtime_observation',
      source: 'temporal_workflow_query',
      observed_at: observedAt.toISOString(),
      ttl_ms: 600_000,
      expires_at: expiresAt.toISOString(),
      workflow_status: 'RUNNING',
      query_status: 'running',
      effective_runtime_status: 'running',
      stage_attempt_id: 'sat-temporal-observation-expired',
      workflow_id: 'workflow:sat-temporal-observation-expired',
      run_id: 'temporal-run-expired',
      provider_updated_at: observedAt.toISOString(),
      provider_completion_is_domain_ready: false,
    };
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-temporal-observation-expired',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'registered',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimeObservation,
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.execution.state, 'queued');
    assert.equal(item.execution.stage_status, 'queued');
    assert.equal(item.execution.diagnostic_reason, 'temporal_runtime_observation_expired');
    assert.equal(item.lifecycle.primary_state, 'paused');
    assert.equal(projection.summary.running_count, 0);

    const stoppedWorkItemId = '001-lineage-pfs';
    const stoppedSnapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.pitnet, 'workspace_index.json'), stoppedSnapshot, stoppedSnapshot);
    const stoppedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-stopped-post-snapshot-human-gate',
        root: input.pitnet,
        workItemId: stoppedWorkItemId,
        status: 'human_gate',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const stopped = stoppedProjection.items.find((item) => item.identity.work_item_id === stoppedWorkItemId)!;
    assert.equal(stopped.lifecycle.business_state, 'stopped');
    assert.equal(stopped.execution.attempt_id, null);
    assert.equal(stopped.lifecycle.primary_state, 'stopped');
    assert.equal(stopped.attention.kind, 'none');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('expired runtime observation disproves a persisted running provider snapshot', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z');
  const observedAt = new Date(now - 20 * 60_000);
  const currentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: 'running',
    providerKind: 'temporal',
    providerRun: {
      provider_status: 'running',
      last_heartbeat_at: observedAt.toISOString(),
      runtime_observation: {
        observed_at: observedAt.toISOString(),
        ttl_ms: 10 * 60_000,
        expires_at: new Date(observedAt.getTime() + 10 * 60_000).toISOString(),
        workflow_status: 'running',
      },
    },
    nowMs: now,
  });

  assert.equal(currentness.running_proof_status, 'not_running');
  assert.equal(currentness.effective_runtime_status, 'not_running');
  assert.equal(currentness.projection_status, 'stale_projection');
  assert.equal(currentness.reason, 'ledger_running_with_expired_runtime_observation');
  assert.equal(currentness.observed_runtime_observation_freshness, 'expired');
  assert.deepEqual(currentness.running_proof_sources, []);
});

test('fresh runtime observation still confirms a running provider snapshot', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z');
  const observedAt = new Date(now - 60_000);
  const currentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: 'running',
    providerKind: 'temporal',
    providerRun: {
      provider_status: 'running',
      last_heartbeat_at: observedAt.toISOString(),
      runtime_observation: {
        observed_at: observedAt.toISOString(),
        ttl_ms: 10 * 60_000,
        expires_at: new Date(observedAt.getTime() + 10 * 60_000).toISOString(),
        workflow_status: 'running',
      },
    },
    nowMs: now,
  });

  assert.equal(currentness.running_proof_status, 'running_confirmed');
  assert.equal(currentness.effective_runtime_status, 'running');
  assert.equal(currentness.observed_runtime_observation_freshness, 'fresh');
  assert.deepEqual(currentness.running_proof_sources, ['provider_run']);
});

test('a live Temporal query still confirms running despite an expired observation', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z');
  const observedAt = new Date(now - 20 * 60_000);
  const currentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: 'running',
    providerKind: 'temporal',
    providerRun: {
      provider_status: 'running',
      runtime_observation: {
        observed_at: observedAt.toISOString(),
        ttl_ms: 10 * 60_000,
        expires_at: new Date(observedAt.getTime() + 10 * 60_000).toISOString(),
        workflow_status: 'running',
      },
    },
    temporalQuery: { workflow_status: 'RUNNING', query: { status: 'running' } },
    nowMs: now,
  });

  assert.equal(currentness.running_proof_status, 'running_confirmed');
  assert.equal(currentness.effective_runtime_status, 'running');
  assert.deepEqual(currentness.running_proof_sources, [
    'temporal_workflow_visibility',
    'temporal_workflow_query',
  ]);
});

test('Temporal running query overrides a lagging queued attempt ledger', () => {
  const currentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: 'queued',
    providerKind: 'temporal',
    providerRun: { provider_status: 'registered' },
    temporalQuery: {
      workflow_status: 'RUNNING',
      query: { status: 'running' },
    },
  });

  assert.equal(currentness.effective_runtime_status, 'running');
  assert.equal(currentness.running_proof_status, 'running_confirmed');
  assert.equal(currentness.projection_status, 'ledger_lagging_projection');
  assert.deepEqual(currentness.running_proof_sources, [
    'temporal_workflow_visibility',
    'temporal_workflow_query',
  ]);
});

test('human gate action omits empty optional message args and remains schema-valid', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const createdAt = new Date().toISOString();
    const project = (humanGateRefs: string[]) => buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-human-gate-action-args',
        root: input.diabetes,
        workItemId,
        status: 'human_gate',
        createdAt,
        updatedAt: createdAt,
        humanGateRefs,
      })],
      resolveDescriptor: input.resolveDescriptor,
    });

    const withoutOptionalArgs = project([]);
    const item = withoutOptionalArgs.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.deepEqual(item.action.message_args, {
      item_id: item.item_id,
      stage_attempt_id: 'sat-human-gate-action-args',
      stage_id: '01-study_intake',
    });
    assert.equal(JSON.stringify(item.action.message_args).includes('null'), false);

    const schemaRef = 'contracts/opl-framework/work-item-projection-v2.schema.json';
    const schema = parseJsonText(fs.readFileSync(schemaRef, 'utf8')) as Record<string, unknown>;
    const validation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2',
      schema,
      sourceRef: schemaRef,
    }, withoutOptionalArgs);
    assert.equal(validation.ok, true, validation.ok ? '' : JSON.stringify(validation.errors, null, 2));

    const withOptionalArgs = project(['human-gate:owner-review']);
    const itemWithOptionalArgs = withOptionalArgs.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.deepEqual(itemWithOptionalArgs.action.message_args, {
      item_id: itemWithOptionalArgs.item_id,
      stage_attempt_id: 'sat-human-gate-action-args',
      stage_id: '01-study_intake',
      human_gate_ref: 'human-gate:owner-review',
    });
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('post-snapshot human_gate from an exact-scoped StageRun projects the owner decision', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const createdAt = new Date().toISOString();
    const stageRunId = 'sr_scoped_human_gate';
    const qualityCycleId = `quality-cycle:${stageRunId}`;
    const historicalScopeBudget = {
      surface_kind: 'opl_stage_quality_scope_budget',
      version: 'opl-stage-quality-scope-budget.v1',
      max_attempts: 3,
      max_elapsed_ms: 21_600_000,
      max_tokens: 1_000_000,
      token_budget_requires_observed_usage: true,
      foreground_execution_must_use_managed_attempt: true,
    };
    const stageRunLaunch = {
      surface_kind: 'opl_stage_run_launch_registry_entry',
      version: 'opl-stage-run-launch-registry-entry.v2',
      stage_run_id: stageRunId,
      stage_run_invocation_id: 'stage-run-invocation:scoped-human-gate',
      stage_run_spec_sha256: 'a'.repeat(64),
      domain_id: 'medautoscience',
      stage_id: '01-study_intake',
      workflow_id: 'stage-run-workflow:scoped-human-gate',
      stage_run_input: {
        workspace_locator: {
          workspace_root: input.diabetes,
          work_item_id: workItemId,
        },
      },
      launch_status: 'closed',
      terminal_status: 'human_gate',
      created_at: createdAt,
      updated_at: createdAt,
    };
    const gateAttempt = attempt({
      id: 'sat-scoped-human-gate',
      root: input.diabetes,
      workItemId,
      status: 'completed',
      stageId: '01-study_intake',
      createdAt,
      updatedAt: createdAt,
      stageRunId,
      qualityCycleId,
      qualityRoundIndex: 0,
      qualityScopeBudget: historicalScopeBudget,
    });
    assert.ok(gateAttempt.execution_scope);
    const gateScope = gateAttempt.execution_scope;
    process.env.OPL_STATE_DIR = path.join(input.root, 'opl-state');
    const queueDb = path.join(process.env.OPL_STATE_DIR, 'family-runtime', 'queue.sqlite');
    fs.mkdirSync(path.dirname(queueDb), { recursive: true });
    const db = new DatabaseSync(queueDb);
    try {
      createStageAttemptTable(db);
      createStageRunLaunchTable(db);
      persistStageAttempt(db, gateAttempt);
      db.prepare(`
        INSERT INTO stage_run_launches (
          stage_run_id, stage_run_invocation_id, stage_run_spec_sha256,
          domain_id, stage_id, workflow_id, parent_route_decision_ref,
          scope_kind, project_scope_id, work_item_scope_id, workspace_binding_id,
          binding_version_id, scope_digest, execution_scope_json, identity_state,
          stage_run_input_json, launch_status, temporal_start_receipt_json,
          terminal_status, last_start_error, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, NULL,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, 'closed', NULL, 'human_gate', NULL, ?, ?
        )
      `).run(
        stageRunId,
        stageRunLaunch.stage_run_invocation_id,
        stageRunLaunch.stage_run_spec_sha256,
        stageRunLaunch.domain_id,
        stageRunLaunch.stage_id,
        stageRunLaunch.workflow_id,
        'work_item',
        gateScope.project_scope_id,
        gateScope.work_item_scope_id,
        gateScope.workspace_binding_id,
        gateScope.binding_version_id,
        gateScope.scope_digest,
        JSON.stringify(gateScope),
        'resolved',
        JSON.stringify(stageRunLaunch.stage_run_input),
        createdAt,
        createdAt,
      );
    } finally {
      db.close();
    }
    const ledger = readWorkItemStageAttempts();
    assert.equal(ledger.attempts[0]?.status, 'completed');
    assert.equal(record(record(ledger.attempts[0]).stage_run_launch).terminal_status, 'human_gate');
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: ledger.attempts,
      qualityCycles: [{
        quality_cycle_id: qualityCycleId,
        policy: { formal_review: { scope_budget: historicalScopeBudget } },
        state: {
          status: 'hard_stopped',
          quality_scope_budget_usage: {
            attempts_used: 0,
            elapsed_ms: 2_583_213,
            tokens_used: 8_579_482,
            token_observation_status: 'observed',
          },
          quality_scope_budget_stop_reason: 'max_tokens_exhausted',
        },
      }],
      queueDb: ledger.queue_db,
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.lifecycle.business_state, 'paused');
    assert.equal(item.execution.attempt_id, 'sat-scoped-human-gate');
    assert.equal(item.execution.state, 'idle');
    assert.equal(item.execution.stage_status, 'human_gate');
    assert.deepEqual(item.execution.quality_budget, {
      state: 'not_managed',
      scope_id: null,
      max_attempts: null,
      attempts_used: 0,
      attempts_remaining: null,
      max_elapsed_ms: null,
      elapsed_ms: null,
      max_tokens: null,
      tokens_used: null,
      token_observation_status: 'not_applicable',
      stop_reason: null,
    });
    assert.equal(item.execution.attempt_ids.includes('sat-scoped-human-gate'), true);
    assert.equal(item.attention.kind, 'user');
    assert.equal(item.attention.reason, 'runtime_human_gate_requires_owner_decision');
    assert.equal(item.action.owner_kind, 'user');
    assert.equal(item.action.action_ref, 'runtime-human-gate:sat-scoped-human-gate');
    assert.equal(item.lifecycle.primary_state, 'awaiting_user_decision');
    assert.equal(item.lifecycle.primary_state_label, '等待你决定');
    assert.equal(item.stage_map.find((stage) => stage.stage_id === '01-study_intake')?.state, 'waiting_user');
    assert.equal(projection.summary.user_attention_count, 1);
    assert.equal(
      item.source_refs.some((source) =>
        source.role === 'stage_run_terminal_execution_evidence'
          && source.ref.endsWith(`#stage_run_launches/${stageRunId}`)
      ),
      true,
    );
    const runtimeActivity = projectRuntimeActivityItems(projection).find((entry) => entry.work_item_id === workItemId)!;
    assert.equal(runtimeActivity.business_primary_state, 'owner_decision_required');
    assert.equal(runtimeActivity.lane, 'attention');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
