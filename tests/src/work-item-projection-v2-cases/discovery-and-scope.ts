import {
  assert,
  fs,
  path,
  DatabaseSync,
  test,
  joinAttemptsToWorkItems,
  readWorkItemStageAttemptsFromDb,
  buildWorkItemProjectionV2,
  createStageAttemptTable,
  createStageRunLaunchTable,
  attempt,
  persistStageRunFixture,
  persistStageAttemptFixture,
  fixture,
} from './fixtures.ts';

test('WorkItemProjection V2 discovers MAS 3 projects and 9 studies independently of Temporal', () => {
  const input = fixture();
  try {
    assert.equal(input.resolveDescriptor('mas')?.interface.stage_catalog, null);
    const projection = buildWorkItemProjectionV2({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    assert.equal(projection.schema_version, 'work-item-projection.v2');
    assert.equal(projection.project_catalog.length, 3);
    assert.equal(projection.items.length, 9);
    assert.deepEqual(
      projection.project_catalog.map((project) => project.display_name).sort(),
      ['DM-CVD-Mortality-Risk', 'NF-PitNET', 'Obesity'],
    );
    assert.equal(projection.summary.work_item_count, 9);
    assert.equal(projection.summary.visible_work_item_count, 9);
    assert.equal(projection.summary.archived_work_item_count, 0);
    assert.equal(projection.summary.total_work_item_count, 9);
    assert.equal(projection.detail_policy.all_work_item_summaries_included, true);
    assert.equal(projection.project_catalog.find((project) => project.display_name === 'Obesity')?.binding_status, 'inactive');
    assert.equal(projection.project_catalog.some((project) => project.display_name === 'Diabetes stale duplicate'), false);
    const obesityItem = projection.items.find(
      (item) => item.identity.work_item_id === 'obesity_multicenter_phenotype_atlas',
    );
    assert.equal(obesityItem?.identity.project_display_name, 'Obesity');
    assert.equal(obesityItem?.identity.work_item_display_name, 'Multicenter obesity phenotype atlas');
    assert.equal(obesityItem?.identity.agent_display_name, 'Med Auto Science');
    assert.equal(obesityItem?.identity.work_item_kind, 'study');
    assert.equal(obesityItem?.telemetry.state, 'missing');
    assert.equal(obesityItem?.telemetry.cumulative.total_tokens, null);
    assert.equal(obesityItem?.lifecycle.primary_state, 'automatically_advancing');
    assert.equal(obesityItem?.lifecycle.primary_state_label, '自动推进中');
    assert.equal(obesityItem?.lifecycle.primary_state_reason, 'user_visible_progress_advancing');
    assert.equal(obesityItem?.lifecycle.last_transition_at, obesityItem?.freshness.last_transition_time);
    assert.equal(obesityItem?.execution.current_stage_display_name, 'Study Intake');
    assert.equal(obesityItem?.execution.next_stage_display_name, 'Protocol And Analysis Plan');
    assert.deepEqual(obesityItem?.stage_map.map((stage) => stage.state), ['current', 'next']);
    assert.equal(obesityItem?.action.kind, 'agent_action');
    assert.equal(obesityItem?.action.title, '继续推进');
    assert.equal(obesityItem?.action.title_key, 'lifecycle.active.title');
    assert.equal(obesityItem?.action.summary_key, 'inventory.nextAction.summary');
    assert.equal(obesityItem?.action.owner_kind, 'agent');
    assert.equal(obesityItem?.action.message_args.action_ref, 'continue_current_stage');
    assert.equal(obesityItem?.action.summary, 'Continue the current study stage.');
    assert.deepEqual(obesityItem?.visibility, {
      state: 'visible',
      source: 'default',
      updated_at: null,
      control_ref: null,
      generation: obesityItem?.visibility.generation,
    });
    const deliveredItem = projection.items.find(
      (item) => item.identity.work_item_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.equal(deliveredItem?.lifecycle.current_stage_id, null);
    assert.equal(deliveredItem?.telemetry.current_stage.state, 'missing');
    assert.equal(deliveredItem?.telemetry.current_stage.missing_reason, 'current_stage_not_applicable');
    assert.deepEqual(
      deliveredItem?.stage_map.map((stage) => [stage.stage_id, stage.state]),
      [
        ['01-study_intake', 'completed'],
        ['08-publication_package_handoff', 'completed'],
      ],
    );
    assert.equal(
      deliveredItem?.stage_map.some((stage) =>
        ['pending', 'next', 'current', 'stopped', 'failed'].includes(stage.state)
      ),
      false,
    );
    assert.equal(deliveredItem?.action.kind, 'user_action');
    assert.equal(deliveredItem?.action.title, '补齐投稿信息或发起修订');
    assert.equal(deliveredItem?.action.title_key, 'lifecycle.deliveredPaused.title');
    assert.equal(deliveredItem?.action.summary_key, 'inventory.nextAction.summary');
    assert.equal(deliveredItem?.action.owner_kind, 'user');
    assert.equal(
      deliveredItem?.action.summary,
      'Provide missing submission metadata, or explicitly wake the study for revision.',
    );
    assert.equal(projection.agent_catalog.length, 6);
    assert.equal(projection.agent_availability.length, 6);
    assert.equal(projection.agent_catalog.some((entry) => entry.agent_id === 'synthetic-agent'), true);
    const masAvailability = projection.agent_availability.find((entry) => entry.agent_id === 'mas');
    assert.equal(masAvailability?.inventory_descriptor.status, 'readable');
    assert.equal(masAvailability?.package_launch_readiness.status, 'unknown');
    assert.equal(masAvailability?.availability, 'available');
    assert.equal(masAvailability?.source, 'package_directory');
    assert.equal(masAvailability?.last_checked_at, '2026-07-13T00:00:00.000Z');
    assert.equal(projection.agent_availability.every((entry) => entry.availability === 'available'), true);
    assert.equal(projection.items.some((item) => item.identity.source_kind === 'runtime_only'), false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('same-workspace same-stage Study attempts join only by exact work_item_scope_id', () => {
  const input = fixture();
  try {
    const snapshotAt = new Date('2026-07-13T00:00:00.000Z');
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshotAt, snapshotAt);
    const stageId = '01-study_intake';
    const first = attempt({
      id: 'sat-study-001-same-stage',
      root: input.diabetes,
      workItemId: '001-dm-cvd-mortality-risk',
      stageId,
      status: 'running',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
      tokenUsage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 },
    });
    const second = attempt({
      id: 'sat-study-004-same-stage',
      root: input.diabetes,
      workItemId: '004-dpcc-longitudinal-care-inertia-intensification-gap',
      stageId,
      status: 'queued',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:01:00.000Z',
      tokenUsage: { input_tokens: 150, output_tokens: 50, total_tokens: 200 },
    });
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts: [first, second],
      resolveDescriptor: input.resolveDescriptor,
    });
    const study001 = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    const study004 = projection.items.find(
      (item) => item.identity.work_item_id === '004-dpcc-longitudinal-care-inertia-intensification-gap',
    )!;

    assert.notEqual(study001.identity.work_item_scope_id, study004.identity.work_item_scope_id);
    assert.equal(study001.execution.stage_id, stageId);
    assert.equal(study004.execution.stage_id, stageId);
    assert.deepEqual(study001.execution.attempt_ids, ['sat-study-001-same-stage']);
    assert.deepEqual(study004.execution.attempt_ids, ['sat-study-004-same-stage']);
    assert.equal(study001.telemetry.cumulative.total_tokens, 100);
    assert.equal(study004.telemetry.cumulative.total_tokens, 200);
    assert.equal(projection.identity_health.status, 'clear');
    assert.equal(projection.identity_health.resolved_execution_count, 2);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('persisted work-item readback LEFT JOINs the authoritative StageRun execution scope', () => {
  const input = fixture();
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createStageRunLaunchTable(db);
    const scoped = attempt({
      id: 'sat-persisted-study-001',
      root: input.diabetes,
      workItemId: '001-dm-cvd-mortality-risk',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:01:00.000Z',
    });
    assert.ok(scoped.execution_scope);
    const scope = scoped.execution_scope;
    const stageRunId = 'sr-persisted-study-001';
    persistStageRunFixture(db, {
      id: stageRunId,
      stageId: '01-study_intake',
      scope,
    });
    persistStageAttemptFixture(db, {
      id: 'sat-persisted-study-001',
      stageRunId,
      stageId: '01-study_intake',
      scope,
      updatedAt: '2026-07-20T00:01:00.000Z',
      tokens: 100,
    });

    const attempts = readWorkItemStageAttemptsFromDb(db);
    assert.equal(attempts[0]?.stage_run_join_state, 'joined');
    assert.equal(attempts[0]?.stage_run_registered_id, stageRunId);
    assert.deepEqual(attempts[0]?.stage_run_execution_scope, scope);
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts,
      resolveDescriptor: input.resolveDescriptor,
    });
    const study001 = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    assert.equal(study001.execution.attempt_id, 'sat-persisted-study-001');
    assert.equal(study001.telemetry.cumulative.total_tokens, 100);
    assert.equal(projection.identity_health.status, 'clear');
  } finally {
    db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('StageRun-only records are bounded diagnostics and cannot project idle, current, wake, or tokens', () => {
  const input = fixture();
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createStageRunLaunchTable(db);
    const study001Carrier = attempt({
      id: 'sat-scope-carrier-stage-run-only-001',
      root: input.diabetes,
      workItemId: '001-dm-cvd-mortality-risk',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    const study002Carrier = attempt({
      id: 'sat-scope-carrier-stage-run-only-002',
      root: input.diabetes,
      workItemId: '002-dm-china-us-mortality-attribution',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    assert.ok(study001Carrier.execution_scope);
    assert.ok(study002Carrier.execution_scope);
    persistStageRunFixture(db, {
      id: 'sr-stage-run-only-resolved',
      stageId: '01-study_intake',
      scope: study001Carrier.execution_scope,
    });
    persistStageRunFixture(db, {
      id: 'sr-stage-run-only-unresolved',
      stageId: '01-study_intake',
      identityState: 'identity_unresolved',
    });
    persistStageRunFixture(db, {
      id: 'sr-stage-run-only-quarantined',
      stageId: '01-study_intake',
      scope: study002Carrier.execution_scope,
      identityState: 'quarantined',
    });
    persistStageRunFixture(db, {
      id: 'sr-stage-run-with-archived-attempt',
      stageId: '01-study_intake',
      scope: study001Carrier.execution_scope,
    });
    persistStageAttemptFixture(db, {
      id: 'sat-archived-stage-run-attempt',
      stageRunId: 'sr-stage-run-with-archived-attempt',
      stageId: '01-study_intake',
      scope: study001Carrier.execution_scope,
      updatedAt: '2026-07-20T00:01:00.000Z',
    });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed', archived_at = '2026-07-20T00:02:00.000Z'
      WHERE stage_attempt_id = 'sat-archived-stage-run-attempt'
    `).run();

    const attempts = readWorkItemStageAttemptsFromDb(db);
    assert.equal(attempts.length, 3);
    assert.equal(
      attempts.every((entry) =>
        entry.projection_record_kind === 'stage_run_without_stage_attempt'
          && entry.stage_attempt_id === undefined
      ),
      true,
    );
    assert.equal(
      attempts.some((entry) => entry.stage_run_id === 'sr-stage-run-with-archived-attempt'),
      false,
    );
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts,
      queueDb: 'in-memory-stage-run-only-fixture',
      resolveDescriptor: input.resolveDescriptor,
    });
    const study001 = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    const study002 = projection.items.find(
      (item) => item.identity.work_item_id === '002-dm-china-us-mortality-attribution',
    )!;

    assert.equal(study001.execution.state, 'unknown');
    assert.equal(study001.execution.diagnostic_reason, 'stage_run_without_stage_attempt');
    assert.equal(study001.execution.attempt_id, null);
    assert.deepEqual(study001.execution.attempt_ids, []);
    assert.equal(study001.execution.workflow_id, null);
    assert.equal(study001.execution.started_at, null);
    assert.equal(study001.telemetry.cumulative.total_tokens, null);
    assert.equal(study001.freshness.state, 'unknown');
    assert.equal(
      study001.conditions.some((entry) =>
        entry.type === 'StageRunAttemptBindingObserved'
          && entry.status === 'Unknown'
          && entry.reason === 'stage_run_without_stage_attempt'
      ),
      true,
    );
    assert.equal(
      study001.source_refs.some((entry) =>
        entry.role === 'stage_run_diagnostic_only'
          && entry.ref.endsWith('#stage_run_launches/sr-stage-run-only-resolved')
      ),
      true,
    );
    assert.equal(
      study002.source_refs.some((entry) => entry.role === 'stage_run_diagnostic_only'),
      false,
    );
    assert.equal(projection.summary.running_count, 0);
    assert.equal(projection.identity_health.status, 'attention_required');
    assert.equal(projection.identity_health.execution_count, 3);
    assert.equal(projection.identity_health.resolved_execution_count, 0);
    assert.equal(projection.identity_health.unresolved_execution_count, 2);
    assert.equal(projection.identity_health.conflict_execution_count, 1);
    assert.deepEqual(projection.identity_health.reason_counts, [
      { reason: 'stage_run_without_attempt_identity_quarantined', count: 1 },
      { reason: 'stage_run_without_attempt_identity_unresolved', count: 1 },
      { reason: 'stage_run_without_stage_attempt', count: 1 },
    ]);
    assert.equal(projection.unresolved_executions.length, 3);
    const unresolvedStageRun = projection.unresolved_executions.find(
      (entry) => entry.attempt_ref === 'stage-run:sr-stage-run-only-unresolved',
    )!;
    const quarantinedStageRun = projection.unresolved_executions.find(
      (entry) => entry.attempt_ref === 'stage-run:sr-stage-run-only-quarantined',
    )!;
    assert.equal(unresolvedStageRun.project_scope_id, null);
    assert.equal(unresolvedStageRun.work_item_scope_id, null);
    assert.equal(unresolvedStageRun.domain_id, null);
    assert.equal(quarantinedStageRun.project_scope_id, null);
    assert.equal(quarantinedStageRun.work_item_scope_id, null);
    assert.equal(quarantinedStageRun.domain_id, null);
    assert.equal(
      (quarantinedStageRun.details.claimed_scope as Record<string, unknown>).work_item_scope_id,
      study002Carrier.execution_scope.work_item_scope_id,
    );
    assert.equal(
      projection.unresolved_executions.every((entry) =>
        entry.attempt_ref.startsWith('stage-run:')
          && entry.details.stage_run_launch_status === 'started'
      ),
      true,
    );
  } finally {
    db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('StageRun-only item diagnostics use stable newest-first ordering for injected records', () => {
  const input = fixture();
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createStageRunLaunchTable(db);
    const scopeCarrier = attempt({
      id: 'sat-scope-carrier-stage-run-order',
      root: input.diabetes,
      workItemId: '001-dm-cvd-mortality-risk',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    assert.ok(scopeCarrier.execution_scope);
    persistStageRunFixture(db, {
      id: 'sr-stage-run-only-older',
      stageId: '01-study_intake',
      scope: scopeCarrier.execution_scope,
    });
    persistStageRunFixture(db, {
      id: 'sr-stage-run-only-newer',
      stageId: '01-study_intake',
      scope: scopeCarrier.execution_scope,
    });
    db.prepare(`
      UPDATE stage_run_launches
      SET updated_at = ?
      WHERE stage_run_id = ?
    `).run('2026-07-20T00:01:00.000Z', 'sr-stage-run-only-newer');

    const attempts = readWorkItemStageAttemptsFromDb(db).reverse();
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts,
      queueDb: 'in-memory-stage-run-order-fixture',
      resolveDescriptor: input.resolveDescriptor,
    });
    const study001 = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    const condition = study001.conditions.find(
      (entry) => entry.type === 'StageRunAttemptBindingObserved',
    )!;
    const diagnosticRefs = study001.source_refs
      .filter((entry) => entry.role === 'stage_run_diagnostic_only')
      .map((entry) => entry.ref);

    assert.equal(condition.last_transition_time, '2026-07-20T00:01:00.000Z');
    assert.equal(condition.ref?.endsWith('#stage_run_launches/sr-stage-run-only-newer'), true);
    assert.deepEqual(diagnosticRefs, [
      'in-memory-stage-run-order-fixture#stage_run_launches/sr-stage-run-only-newer',
      'in-memory-stage-run-order-fixture#stage_run_launches/sr-stage-run-only-older',
    ]);
  } finally {
    db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('StageRun-only inventory conflicts keep claimed scope diagnostic-only', () => {
  const input = fixture();
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createStageRunLaunchTable(db);
    const scopeCarrier = attempt({
      id: 'sat-scope-carrier-stage-run-inventory-conflict',
      root: input.diabetes,
      workItemId: '001-dm-cvd-mortality-risk',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    assert.ok(scopeCarrier.execution_scope);
    persistStageRunFixture(db, {
      id: 'sr-stage-run-only-inventory-conflict',
      stageId: '01-study_intake',
      scope: scopeCarrier.execution_scope,
    });
    const [stageRun] = readWorkItemStageAttemptsFromDb(db);
    assert.ok(stageRun);
    const inventory = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
    });
    const items = inventory.items.map((item) =>
      item.identity.work_item_id === '001-dm-cvd-mortality-risk'
        ? {
            ...item,
            identity: { ...item.identity, domain_id: 'conflicting-domain' },
          }
        : item
    );

    const joined = joinAttemptsToWorkItems({
      items,
      attempts: [stageRun],
      queueDb: 'in-memory-stage-run-inventory-conflict-fixture',
      attemptRefLimit: 8,
    });
    const [diagnostic] = joined.unresolved_executions;

    assert.equal(joined.identity_health.conflict_execution_count, 1);
    assert.equal(diagnostic?.reason, 'stage_run_without_attempt_execution_scope_inventory_conflict');
    assert.equal(diagnostic?.project_scope_id, null);
    assert.equal(diagnostic?.work_item_scope_id, null);
    assert.equal(diagnostic?.domain_id, null);
    assert.equal(
      (diagnostic?.details.claimed_scope as Record<string, unknown>).work_item_scope_id,
      scopeCarrier.execution_scope.work_item_scope_id,
    );
    assert.equal(
      joined.items.find((item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk')
        ?.source_refs.some((entry) => entry.role === 'stage_run_diagnostic_only'),
      false,
    );
  } finally {
    db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('StageRun-only health counts stay complete while diagnostic details remain bounded', () => {
  const input = fixture();
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createStageRunLaunchTable(db);
    for (let index = 0; index < 101; index += 1) {
      persistStageRunFixture(db, {
        id: `sr-stage-run-only-unresolved-${String(index).padStart(3, '0')}`,
        stageId: '01-study_intake',
        identityState: 'identity_unresolved',
      });
    }

    const attempts = readWorkItemStageAttemptsFromDb(db);
    assert.equal(attempts.length, 101);
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      attempts,
      resolveDescriptor: input.resolveDescriptor,
    });

    assert.equal(projection.identity_health.status, 'attention_required');
    assert.equal(projection.identity_health.execution_count, 101);
    assert.equal(projection.identity_health.unresolved_execution_count, 101);
    assert.deepEqual(projection.identity_health.reason_counts, [{
      reason: 'stage_run_without_attempt_identity_unresolved',
      count: 101,
    }]);
    assert.equal(projection.unresolved_executions.length, 100);
    assert.equal(
      projection.diagnostics.items.filter((entry) =>
        entry.reason === 'stage_run_without_attempt_identity_unresolved'
      ).length,
      100,
    );
  } finally {
    db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('legacy ledgers without StageRun scope schema stay identity_unresolved diagnostics', () => {
  const input = fixture();
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const scoped = attempt({
      id: 'sat-legacy-stage-run-schema',
      root: input.diabetes,
      workItemId: '002-dm-china-us-mortality-attribution',
      stageId: '01-study_intake',
      status: 'running',
      updatedAt: '2026-07-20T00:01:00.000Z',
    });
    assert.ok(scoped.execution_scope);
    const scope = scoped.execution_scope;
    persistStageAttemptFixture(db, {
      id: 'sat-legacy-stage-run-schema',
      stageRunId: 'sr-legacy-stage-run-schema',
      stageId: '01-study_intake',
      scope,
      updatedAt: '2026-07-20T00:01:00.000Z',
      tokens: 10_000,
    });

    const attempts = readWorkItemStageAttemptsFromDb(db);
    assert.equal(attempts[0]?.stage_run_join_state, 'identity_schema_unavailable');
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
    assert.equal(study002.telemetry.cumulative.total_tokens, null);
    assert.equal(projection.identity_health.unresolved_execution_count, 1);
    assert.deepEqual(projection.identity_health.reason_counts, [{
      reason: 'stage_attempt_stage_run_identity_unresolved',
      count: 1,
    }]);
    assert.equal(
      projection.unresolved_executions[0]?.details.stage_run_join_state,
      'identity_schema_unavailable',
    );
  } finally {
    db.close();
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
