import {
  assert,
  fs,
  path,
  DatabaseSync,
  test,
  parseJsonText,
  validateJsonSchemaPayload,
  readWorkItemStageAttemptsFromDb,
  buildAppRuntimeWorkItemProjection,
  buildWorkItemProjectionV2,
  createStageAttemptTable,
  createStageRunLaunchTable,
  binding,
  attempt,
  legacyLocatorAttempt,
  persistStageRunFixture,
  persistStageAttemptFixture,
  fixture,
} from './fixtures.ts';

test('StageRun unresolved, quarantined, dangling, and cross-Study bindings cannot drive wake or tokens', () => {
  const input = fixture();
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createStageRunLaunchTable(db);
    const study001Attempt = attempt({
      id: 'sat-scope-source-001',
      root: input.diabetes,
      workItemId: '001-dm-cvd-mortality-risk',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    const study002Attempt = attempt({
      id: 'sat-scope-source-002',
      root: input.diabetes,
      workItemId: '002-dm-china-us-mortality-attribution',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    assert.ok(study001Attempt.execution_scope);
    assert.ok(study002Attempt.execution_scope);
    const study001Scope = study001Attempt.execution_scope;
    const study002Scope = study002Attempt.execution_scope;
    persistStageRunFixture(db, {
      id: 'sr-study-001-authority',
      stageId: '01-study_intake',
      scope: study001Scope,
    });
    persistStageRunFixture(db, {
      id: 'sr-unresolved-legacy',
      stageId: '01-study_intake',
      identityState: 'identity_unresolved',
    });
    persistStageRunFixture(db, {
      id: 'sr-quarantined-study-002',
      stageId: '01-study_intake',
      scope: study002Scope,
      identityState: 'quarantined',
    });
    [
      ['sat-cross-study-forged', 'sr-study-001-authority', '2026-07-20T00:05:00.000Z'],
      ['sat-stage-run-unresolved', 'sr-unresolved-legacy', '2026-07-20T00:04:00.000Z'],
      ['sat-stage-run-quarantined', 'sr-quarantined-study-002', '2026-07-20T00:03:00.000Z'],
      ['sat-stage-run-dangling', 'sr-does-not-exist', '2026-07-20T00:02:00.000Z'],
      ['sat-stage-run-unbound-legacy', null, '2026-07-20T00:01:00.000Z'],
    ].forEach(([id, stageRunId, updatedAt], index) => persistStageAttemptFixture(db, {
      id: id!,
      stageRunId,
      stageId: '01-study_intake',
      scope: study002Scope,
      updatedAt: updatedAt!,
      tokens: (index + 1) * 1000,
    }));

    const attempts = readWorkItemStageAttemptsFromDb(db);
    const forged = attempts.find(
      (entry) => entry.stage_attempt_id === 'sat-cross-study-forged',
    );
    assert.equal(forged?.stage_run_work_item_scope_id, study001Scope.work_item_scope_id);
    assert.notEqual(forged?.stage_run_work_item_scope_id, forged?.work_item_scope_id);
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts,
      resolveDescriptor: input.resolveDescriptor,
    });
    const study002 = projection.items.find(
      (item) => item.identity.work_item_id === '002-dm-china-us-mortality-attribution',
    )!;
    assert.equal(study002.execution.attempt_id, null);
    assert.deepEqual(study002.execution.attempt_ids, []);
    assert.equal(study002.execution.current_stage_id, null);
    assert.equal(study002.telemetry.cumulative.total_tokens, null);
    assert.equal(projection.identity_health.resolved_execution_count, 0);
    assert.equal(projection.identity_health.unresolved_execution_count, 2);
    assert.equal(projection.identity_health.conflict_execution_count, 3);
    assert.deepEqual(projection.identity_health.reason_counts, [
      { reason: 'stage_attempt_stage_run_binding_not_found', count: 1 },
      { reason: 'stage_attempt_stage_run_identity_unresolved', count: 1 },
      { reason: 'stage_attempt_stage_run_scope_mismatch', count: 1 },
      { reason: 'stage_run_execution_scope_identity_quarantined', count: 1 },
      { reason: 'stage_run_execution_scope_identity_unresolved', count: 1 },
    ]);
  } finally {
    db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('legacy locator aliases remain identity_unresolved and cannot enter fast current or token summaries', () => {
  const input = fixture();
  try {
    const valid = attempt({
      id: 'sat-study-001-scoped',
      root: input.diabetes,
      workItemId: '001-dm-cvd-mortality-risk',
      stageId: '01-study_intake',
      status: 'completed',
      updatedAt: '2026-07-20T00:01:00.000Z',
      tokenUsage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 },
    });
    const legacyScopeCarrier = attempt({
      id: 'sat-study-002-legacy-scope-carrier',
      root: input.diabetes,
      workItemId: '002-dm-china-us-mortality-attribution',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:01:00.000Z',
    });
    const legacyBase = legacyLocatorAttempt({
      id: 'sat-study-002-legacy-alias',
      root: input.diabetes,
      workItemId: '002-dm-china-us-mortality-attribution',
      stageId: '01-study_intake',
    });
    const legacy = {
      ...legacyBase,
      workspace_locator: {
        ...legacyBase.workspace_locator,
        execution_scope: legacyScopeCarrier.execution_scope,
      },
    };
    const build = (profile: 'fast' | 'full') => buildWorkItemProjectionV2({
      profile,
      bindings: input.bindings,
      attempts: [valid, legacy],
      resolveDescriptor: input.resolveDescriptor,
    });
    const fast = build('fast');
    const study002 = fast.items.find(
      (item) => item.identity.work_item_id === '002-dm-china-us-mortality-attribution',
    )!;

    assert.equal(study002.execution.attempt_id, null);
    assert.equal(study002.telemetry.cumulative.total_tokens, null);
    assert.deepEqual(fast.identity_health, {
      status: 'attention_required',
      execution_count: 2,
      resolved_execution_count: 1,
      unresolved_execution_count: 1,
      conflict_execution_count: 0,
      not_in_inventory_execution_count: 0,
      non_work_item_execution_count: 0,
      reason_counts: [{ reason: 'stage_attempt_legacy_execution_scope_not_admitted', count: 1 }],
      sample_attempt_refs: ['sat-study-002-legacy-alias'],
    });
    assert.deepEqual(fast.unresolved_executions, []);
    assert.deepEqual(fast.diagnostics.items, []);

    const full = build('full');
    assert.equal(full.unresolved_executions.length, 1);
    assert.equal(full.unresolved_executions[0]?.attempt_ref, 'sat-study-002-legacy-alias');
    assert.deepEqual(full.unresolved_executions[0]?.details.legacy_scope_sources, [
      'attempt.workspace_locator.execution_scope',
    ]);
    assert.deepEqual(full.unresolved_executions[0]?.details.legacy_locator_identity_hints, {
      study_id: '002-dm-china-us-mortality-attribution',
    });
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('scope conflicts and work-item scopes absent from inventory are quarantined', () => {
  const input = fixture();
  try {
    const conflict = {
      ...attempt({
        id: 'sat-study-001-scope-conflict',
        root: input.diabetes,
        workItemId: '001-dm-cvd-mortality-risk',
        status: 'running',
        updatedAt: new Date().toISOString(),
      }),
      scope_digest: `sha256:${'0'.repeat(64)}`,
    };
    const orphan = attempt({
      id: 'sat-study-999-not-in-inventory',
      root: input.diabetes,
      workItemId: '999-not-in-inventory',
      status: 'running',
      updatedAt: new Date().toISOString(),
    });
    const domainExecution = {
      stage_attempt_id: 'sat-domain-maintenance',
      domain_id: 'medautoscience',
      scope_kind: 'domain',
      identity_state: 'resolved',
      status: 'completed',
    };
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts: [conflict, orphan, domainExecution],
      resolveDescriptor: input.resolveDescriptor,
    });
    const study001 = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;

    assert.equal(study001.execution.attempt_id, null);
    assert.equal(projection.identity_health.status, 'attention_required');
    assert.equal(projection.identity_health.conflict_execution_count, 1);
    assert.equal(projection.identity_health.not_in_inventory_execution_count, 1);
    assert.equal(projection.identity_health.non_work_item_execution_count, 1);
    assert.equal(projection.unresolved_executions.length, 2);
    assert.deepEqual(
      projection.identity_health.reason_counts,
      [
        { reason: 'stage_attempt_execution_scope_column_conflict', count: 1 },
        { reason: 'stage_attempt_work_item_scope_not_in_domain_inventory', count: 1 },
      ],
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('workspace move changes the selected binding without changing Project or WorkItem scope', () => {
  const input = fixture();
  try {
    const projectScopeId = 'project:stable-diabetes';
    const firstBinding = binding({
      id: 'dm-binding-v1',
      root: input.diabetes,
      label: 'Diabetes v1',
      status: 'active',
      projectScopeId,
    });
    const before = buildWorkItemProjectionV2({
      bindings: [firstBinding],
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
    });
    const beforeItem = before.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    const movedRoot = path.join(input.root, 'DM-CVD-Mortality-Risk-Moved');
    fs.renameSync(input.diabetes, movedRoot);
    const secondBinding = binding({
      id: 'dm-binding-v2',
      root: movedRoot,
      label: 'Diabetes v2',
      status: 'active',
      updatedAt: '2026-07-20T00:00:00.000Z',
      projectScopeId,
    });
    const after = buildWorkItemProjectionV2({
      bindings: [{ ...firstBinding, status: 'inactive' }, secondBinding],
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
    });
    const afterItem = after.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;

    assert.equal(after.project_catalog.length, 1);
    assert.equal(after.project_catalog[0]?.selected_binding_id, 'dm-binding-v2');
    assert.deepEqual(after.project_catalog[0]?.binding_ids, ['dm-binding-v1', 'dm-binding-v2']);
    assert.equal(beforeItem.identity.project_scope_id, projectScopeId);
    assert.equal(afterItem.identity.project_scope_id, projectScopeId);
    assert.equal(beforeItem.identity.work_item_scope_id, afterItem.identity.work_item_scope_id);
    assert.equal(afterItem.identity.workspace_path, fs.realpathSync.native(movedRoot));
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('App Runtime fast producer projects an effective running quality-cycle budget with bounded summaries', () => {
  const input = fixture();
  try {
    const qualityScopeBudget = {
      surface_kind: 'opl_stage_quality_scope_budget',
      version: 'opl-stage-quality-scope-budget.v1',
      max_attempts: 3,
      max_elapsed_ms: 21_600_000,
      max_tokens: 1_000_000,
      token_budget_requires_observed_usage: true,
      foreground_execution_must_use_managed_attempt: true,
    };
    const projection = buildAppRuntimeWorkItemProjection({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [
        attempt({
          id: 'sat-dm003-token-readback',
          root: input.diabetes,
          workItemId: '003-dpcc-primary-care-phenotype-treatment-gap',
          status: 'completed',
          stageId: '08-publication_package_handoff',
          updatedAt: '2026-07-15T00:00:00.000Z',
          tokenUsage: { input_tokens: 20_000, output_tokens: 5_490, total_tokens: 25_490 },
        }),
        attempt({
          id: 'sat-dm001-quality-budget',
          root: input.diabetes,
          workItemId: '001-dm-cvd-mortality-risk',
          status: 'running',
          updatedAt: new Date().toISOString(),
          qualityCycleId: 'quality-cycle:dm001',
          qualityRoundIndex: 1,
          qualityScopeBudget,
        }),
      ],
      qualityCycles: [{
        quality_cycle_id: 'quality-cycle:dm001',
        policy: { formal_review: { scope_budget: qualityScopeBudget } },
        state: {
          status: 'awaiting_review',
          quality_scope_budget_usage: {
            attempts_used: 1,
            elapsed_ms: 60_000,
            tokens_used: 50_000,
            token_observation_status: 'observed',
          },
          quality_scope_budget_stop_reason: null,
        },
      }],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-15T00:01:00.000Z',
    });
    const dm003 = projection.items.find(
      (item) => item.identity.work_item_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    const dm001 = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    );

    assert.equal(projection.items.length, 9);
    assert.equal(Buffer.byteLength(JSON.stringify(projection), 'utf8') <= 131_072, true);
    assert.equal(
      projection.items.every((item) => Buffer.byteLength(JSON.stringify(item), 'utf8') <= 16_384),
      true,
    );
    assert.equal(projection.summary.visible_work_item_count, 9);
    assert.equal(projection.detail_policy.all_work_item_summaries_included, true);
    assert.equal(projection.detail_policy.inventory_detail, 'included');
    assert.equal(projection.detail_policy.attempt_ref_limit_per_item, 1);
    assert.equal(projection.detail_policy.diagnostic_details, 'lazy');
    assert.deepEqual(projection.diagnostics.items, []);
    assert.equal(dm003?.execution.attempt_ids.length, 1);
    assert.equal(dm003?.telemetry.cumulative.total_tokens, 25_490);
    assert.deepEqual(dm003?.telemetry.cumulative.source_refs, []);
    assert.equal((dm003?.stage_map.length ?? 0) > 0, true);
    assert.deepEqual(dm003?.conditions, []);
    assert.deepEqual(dm003?.source_refs, []);
    assert.equal(dm003?.visibility.state, 'visible');
    assert.equal(dm001?.execution.state, 'running');
    assert.deepEqual(dm001?.execution.quality_budget, {
      state: 'available',
      scope_id: 'quality-cycle:dm001',
      max_attempts: 3,
      attempts_used: 1,
      attempts_remaining: 2,
      max_elapsed_ms: 21_600_000,
      elapsed_ms: 60_000,
      max_tokens: 1_000_000,
      tokens_used: 50_000,
      token_observation_status: 'observed',
      stop_reason: null,
    });
    const schemaRef = 'contracts/opl-framework/work-item-projection-v2.schema.json';
    const schema = parseJsonText(fs.readFileSync(schemaRef, 'utf8')) as Record<string, unknown>;
    const validation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2',
      schema,
      sourceRef: schemaRef,
    }, projection);
    assert.equal(validation.ok, true, validation.ok ? '' : JSON.stringify(validation.errors, null, 2));
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('TelemetryObserved accepts non-applicable current-stage usage without weakening partial or missing states', () => {
  const input = fixture();
  try {
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [
        attempt({
          id: 'sat-dm003-token-readback',
          root: input.diabetes,
          workItemId: '003-dpcc-primary-care-phenotype-treatment-gap',
          status: 'completed',
          stageId: '08-publication_package_handoff',
          updatedAt: '2026-07-15T00:00:00.000Z',
          tokenUsage: { input_tokens: 20_000, output_tokens: 5_490, total_tokens: 25_490 },
        }),
        attempt({
          id: 'sat-dm001-current-stage-missing-token-readback',
          root: input.diabetes,
          workItemId: '001-dm-cvd-mortality-risk',
          status: 'completed',
          stageId: '01-study_intake',
          updatedAt: '2026-07-16T00:00:00.000Z',
        }),
        attempt({
          id: 'sat-dm001-historical-token-readback',
          root: input.diabetes,
          workItemId: '001-dm-cvd-mortality-risk',
          status: 'completed',
          stageId: '00-historical_intake',
          updatedAt: '2026-07-14T00:00:00.000Z',
          tokenUsage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 },
        }),
        attempt({
          id: 'sat-obesity-missing-token-readback',
          root: input.obesity,
          workItemId: 'obesity_multicenter_phenotype_atlas',
          status: 'completed',
          stageId: '01-study_intake',
          updatedAt: '2026-07-16T00:00:00.000Z',
        }),
      ],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-16T00:01:00.000Z',
    });
    const delivered = projection.items.find(
      (item) => item.identity.work_item_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    )!;
    const partial = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    const missing = projection.items.find(
      (item) => item.identity.work_item_id === 'obesity_multicenter_phenotype_atlas',
    )!;
    const deliveredCondition = delivered.conditions.find((entry) => entry.type === 'TelemetryObserved')!;
    const partialCondition = partial.conditions.find((entry) => entry.type === 'TelemetryObserved')!;
    const missingCondition = missing.conditions.find((entry) => entry.type === 'TelemetryObserved')!;

    assert.equal(delivered.lifecycle.business_state, 'delivered_paused');
    assert.equal(delivered.execution.state, 'idle');
    assert.deepEqual(
      [
        delivered.telemetry.state,
        delivered.telemetry.current_stage.state,
        delivered.telemetry.current_stage.missing_reason,
        delivered.telemetry.cumulative.state,
        delivered.telemetry.cumulative.total_tokens,
      ],
      ['partial', 'missing', 'current_stage_not_applicable', 'observed', 25_490],
    );
    assert.deepEqual(
      [deliveredCondition.status, deliveredCondition.reason, deliveredCondition.severity],
      ['True', 'cumulative_token_usage_observed_current_stage_not_applicable', 'none'],
    );

    assert.deepEqual(
      [
        partial.telemetry.state,
        partial.telemetry.current_stage.state,
        partial.telemetry.current_stage.missing_reason,
        partial.telemetry.cumulative.state,
        partial.telemetry.cumulative.total_tokens,
      ],
      ['partial', 'missing', 'no_stage_attempt_usage_telemetry_observed', 'observed', 1500],
    );
    assert.deepEqual(
      [partialCondition.status, partialCondition.reason, partialCondition.severity],
      ['False', 'token_usage_partial', 'none'],
    );

    assert.equal(missing.execution.attempt_id, 'sat-obesity-missing-token-readback');
    assert.deepEqual(
      [
        missing.telemetry.state,
        missing.telemetry.current_stage.state,
        missing.telemetry.cumulative.state,
        missing.telemetry.cumulative.total_tokens,
      ],
      ['missing', 'missing', 'missing', null],
    );
    assert.deepEqual(
      [missingCondition.status, missingCondition.reason, missingCondition.severity],
      ['Unknown', 'token_usage_missing', 'none'],
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('paused lifecycle projects only a post-snapshot live wake attempt as current execution', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const lifecycleSnapshotAt = new Date('2026-07-13T00:00:00.000Z');
    fs.utimesSync(
      path.join(input.diabetes, 'workspace_index.json'),
      lifecycleSnapshotAt,
      lifecycleSnapshotAt,
    );
    const wakeAttempt = attempt({
      id: 'sat-paused-explicit-wake',
      root: input.diabetes,
      workItemId,
      identityField: 'quest_id',
      status: 'queued',
      stageId: 'baseline_and_evidence_setup',
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:01:00.000Z',
    });
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [
        attempt({
          id: 'sat-paused-terminal-after-snapshot',
          root: input.diabetes,
          workItemId,
          status: 'completed',
          stageId: 'baseline_and_evidence_setup',
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:01:00.000Z',
        }),
        attempt({
          id: 'sat-paused-old-live-history',
          root: input.diabetes,
          workItemId,
          status: 'running',
          stageId: 'baseline_and_evidence_setup',
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-16T00:01:00.000Z',
        }),
        wakeAttempt,
      ],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;

    assert.equal(item.lifecycle.business_state, 'paused');
    assert.equal(item.lifecycle.current_stage_id, null);
    assert.equal(item.execution.current_stage_id, 'baseline_and_evidence_setup');
    assert.equal(item.execution.stage_id, 'baseline_and_evidence_setup');
    assert.equal(item.execution.attempt_id, 'sat-paused-explicit-wake');
    assert.equal(item.execution.state, 'queued');
    assert.equal(item.execution.diagnostic_reason, 'temporal_runtime_observation_missing');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('WorkItem execution projects provider-confirmed running state across a lagging queued ledger', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const lifecycleSnapshotAt = new Date('2026-07-13T00:00:00.000Z');
    fs.utimesSync(
      path.join(input.diabetes, 'workspace_index.json'),
      lifecycleSnapshotAt,
      lifecycleSnapshotAt,
    );
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-provider-running-ledger-queued',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'running',
        lastHeartbeatAt: '2026-07-14T00:01:00.000Z',
        stageId: 'bounded_analysis_campaign',
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:01:00.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-14T00:01:00.000Z',
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    const executionRunning = item.conditions.find((condition) => condition.type === 'ExecutionRunning');

    assert.equal(item.execution.state, 'running');
    assert.equal(item.execution.stage_status, 'running');
    assert.equal(item.execution.running_proof_status, 'running_confirmed');
    assert.equal(item.execution.diagnostic_reason, 'ledger_pending_while_provider_or_temporal_running');
    assert.equal(executionRunning?.status, 'True');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
