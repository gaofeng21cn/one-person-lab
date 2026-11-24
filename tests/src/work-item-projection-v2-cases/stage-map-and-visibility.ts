import {
  assert,
  createHash,
  fs,
  os,
  path,
  test,
  buildAppRuntimeWorkItemProjection,
  readStageIndexPresentation,
  buildWorkItemProjectionV2,
  setWorkItemControlState,
  setWorkItemVisibilityState,
  attempt,
  fixture,
} from './fixtures.ts';

test('delivered Stage Map uses the canonical recorded boundary without inferring a missing one', () => {
  const workItemRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-terminal-stage-map-'));
  const stageIndexRef = 'control/stage_index.json';
  const stageIndexPath = path.join(workItemRoot, stageIndexRef);
  fs.mkdirSync(path.dirname(stageIndexPath), { recursive: true });
  const project = (
    businessState: 'active' | 'delivered_paused' | 'paused' | 'stopped',
    lastRecordedStageId: string | null = '08-publication_package_handoff',
  ) => {
    const payload: Record<string, unknown> = {
      current_stage_id: businessState === 'active' ? '08-publication_package_handoff' : null,
      stages: [
        { stage_id: '01-study_intake', status: 'receipt_recorded' },
        { stage_id: '08-publication_package_handoff', status: 'in_progress' },
        { stage_id: 'manual_foreground_paper_sprint', status: 'typed_blocked' },
        { stage_id: 'milestone_submission_package', status: 'pending' },
      ],
    };
    if (lastRecordedStageId !== null) payload.last_recorded_stage_id = lastRecordedStageId;
    fs.writeFileSync(stageIndexPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return readStageIndexPresentation({
      workItemRoot,
      stageIndexRef,
      businessState,
      currentStageId: businessState === 'active' ? '08-publication_package_handoff' : null,
      agentId: 'mas',
      agentDisplayName: 'Med Auto Science',
    });
  };

  try {
    const delivered = project('delivered_paused');
    assert.deepEqual(
      delivered.stage_map.map((stage) => [stage.stage_id, stage.state]),
      [
        ['01-study_intake', 'completed'],
        ['08-publication_package_handoff', 'completed'],
      ],
    );
    assert.deepEqual(project('active').stage_map.map((stage) => stage.state), [
      'completed',
      'current',
      'next',
      'pending',
    ]);
    assert.deepEqual(project('paused').stage_map.map((stage) => stage.state), [
      'completed',
      'pending',
      'stopped',
      'pending',
    ]);
    assert.deepEqual(project('stopped').stage_map.map((stage) => stage.state), [
      'completed',
      'stopped',
      'stopped',
      'stopped',
    ]);

    const missingBoundary = project('delivered_paused', null);
    assert.deepEqual(missingBoundary.stage_map.map((stage) => stage.state), [
      'completed',
      'pending',
      'stopped',
      'pending',
    ]);
    assert.equal(
      missingBoundary.diagnostics.some((diagnostic) =>
        diagnostic.reason === 'stage_index_last_recorded_stage_id_missing'
      ),
      true,
    );
    const unresolvedBoundary = project('delivered_paused', 'missing-stage');
    assert.deepEqual(unresolvedBoundary.stage_map.map((stage) => stage.state), [
      'completed',
      'pending',
      'stopped',
      'pending',
    ]);
    assert.equal(
      unresolvedBoundary.diagnostics.some((diagnostic) =>
        diagnostic.reason === 'stage_index_last_recorded_stage_id_unresolved'
      ),
      true,
    );
  } finally {
    fs.rmSync(workItemRoot, { recursive: true, force: true });
  }
});

test('Stage Map transports validated locale names and keeps an en-US compatibility fallback', () => {
  const workItemRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-localized-stage-map-'));
  const stageIndexRef = 'control/stage_index.json';
  const stageIndexPath = path.join(workItemRoot, stageIndexRef);
  fs.mkdirSync(path.dirname(stageIndexPath), { recursive: true });
  fs.writeFileSync(stageIndexPath, `${JSON.stringify({
    current_stage_id: '01-intake',
    stages: [
      {
        stage_id: '01-intake',
        display_name: 'Legacy intake',
        display_names: {
          'en-US': 'Intake',
          'zh-CN': '立项',
          'fr-FR': 'Accueil',
        },
        status: 'in_progress',
      },
      {
        stage_id: '02-analysis_plan',
        title: 'Analysis Plan',
        display_names: { 'zh-CN': '   ', 'fr-FR': 42 },
        status: 'pending',
      },
      { stage_id: '03-review', display_name: '复核', status: 'pending' },
      { stage_id: '04-closeout', status: 'pending' },
    ],
  }, null, 2)}\n`, 'utf8');

  try {
    const projection = readStageIndexPresentation({
      workItemRoot,
      stageIndexRef,
      businessState: 'active',
      currentStageId: '01-intake',
      agentId: 'example-agent',
      agentDisplayName: 'Example Agent',
    });

    assert.deepEqual(
      projection.stage_map.map((stage) => ({
        stage_id: stage.stage_id,
        display_name: stage.display_name,
        display_names: stage.display_names,
      })),
      [
        {
          stage_id: '01-intake',
          display_name: 'Legacy intake',
          display_names: { 'en-US': 'Intake', 'zh-CN': '立项', 'fr-FR': 'Accueil' },
        },
        {
          stage_id: '02-analysis_plan',
          display_name: 'Analysis Plan',
          display_names: { 'en-US': 'Analysis Plan' },
        },
        {
          stage_id: '03-review',
          display_name: '复核',
          display_names: { 'en-US': '复核' },
        },
        {
          stage_id: '04-closeout',
          display_name: 'Closeout',
          display_names: { 'en-US': 'Closeout' },
        },
      ],
    );
    assert.deepEqual(
      projection.diagnostics.find((diagnostic) =>
        diagnostic.reason === 'stage_index_stage_display_names_invalid'
      )?.details,
      { stage_id: '02-analysis_plan', invalid_entry_count: 2 },
    );
  } finally {
    fs.rmSync(workItemRoot, { recursive: true, force: true });
  }
});

test('control lifecycle wins over old execution failure and token usage remains observed', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(input.root, 'opl-state');
  try {
    const workItemId = '002-dm-china-us-mortality-attribution';
    const baseline = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [],
    });
    const identity = baseline.items.find((candidate) => candidate.identity.work_item_id === workItemId)!.identity;
    setWorkItemControlState({
      agent_id: identity.agent_id,
      project_id: identity.project_id,
      work_item_id: identity.work_item_id,
      lifecycle_state: 'delivered_paused',
    });
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [attempt({
        id: 'sat-old-failure',
        root: input.diabetes,
        workItemId,
        status: 'failed',
        updatedAt: '2026-07-11T00:00:00.000Z',
        tokenUsage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 },
      })],
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.lifecycle.business_state, 'delivered_paused');
    assert.equal(item.lifecycle.control_state, 'delivered_paused');
    assert.equal(item.lifecycle.source, 'work_item_control_ledger');
    assert.equal(item.lifecycle.primary_state, 'delivered_auto_paused');
    assert.equal(item.lifecycle.primary_state_label, '已交付自动暂停');
    assert.equal(item.lifecycle.last_transition_at, item.freshness.last_transition_time);
    assert.equal(item.lifecycle.current_stage_id, null);
    assert.equal(item.action.title_key, 'lifecycle.deliveredPaused.title');
    assert.equal(item.action.summary_key, 'lifecycle.deliveredPaused.summary');
    assert.deepEqual(item.action.message_args, {});
    assert.equal(item.action.owner_kind, 'user');
    assert.equal(item.execution.state, 'idle');
    assert.equal(item.execution.current_stage_id, null);
    assert.equal(item.execution.attempt_id, null);
    assert.equal(item.attention.kind, 'none');
    assert.equal(item.telemetry.state, 'partial');
    assert.deepEqual(
      [item.telemetry.current_stage.state, item.telemetry.current_stage.missing_reason, item.telemetry.cumulative.total_tokens],
      ['missing', 'current_stage_not_applicable', 1500],
    );
    assert.equal(projection.summary.telemetry_observed_count, 1);
    assert.equal(projection.summary.telemetry_missing_count, 8);
    assert.equal(item.stage_map.at(-1)?.state, 'completed');
    assert.equal(
      item.conditions.some((condition) =>
        condition.type === 'ExecutionFailed'
          && condition.reason === 'historical_failure_is_diagnostic_only'
      ),
      true,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('path-derived control ledger identity remains readable after project scope migration', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(input.root, 'opl-state');
  try {
    const workItemId = '001-dm-cvd-mortality-risk';
    const legacyProjectId = `mas:${createHash('sha256')
      .update(fs.realpathSync.native(input.diabetes))
      .digest('hex')
      .slice(0, 16)}`;
    setWorkItemControlState({
      agent_id: 'mas',
      project_id: legacyProjectId,
      work_item_id: workItemId,
      lifecycle_state: 'paused',
      source: 'legacy_path_identity_fixture',
    });

    const projection = buildWorkItemProjectionV2({
      bindings: input.bindings,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [],
    });
    const item = projection.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;

    assert.equal(item.identity.project_id, 'project:dm-active');
    assert.equal(item.lifecycle.business_state, 'paused');
    assert.equal(item.lifecycle.source, 'work_item_control_ledger');
    assert.match(item.lifecycle.control_ref!, new RegExp(encodeURIComponent(legacyProjectId)));
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('App Runtime fast visibility archive keeps lifecycle, Stage Map, action, telemetry, and execution intact', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(input.root, 'opl-state');
  try {
    const workItemId = 'obesity_multicenter_phenotype_atlas';
    const runningAttempt = attempt({
      id: 'sat-running-while-archived',
      root: input.obesity,
      workItemId,
      status: 'running',
      updatedAt: new Date().toISOString(),
      tokenUsage: { input_tokens: 800, output_tokens: 200, total_tokens: 1000 },
    });
    const build = () => buildAppRuntimeWorkItemProjection({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [runningAttempt],
    });
    const baseline = build();
    const baselineItem = baseline.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.equal(baselineItem.execution.state, 'running');
    assert.equal(baselineItem.visibility.generation, 0);

    setWorkItemVisibilityState({
      agent_id: baselineItem.identity.agent_id,
      project_id: baselineItem.identity.project_id,
      work_item_id: baselineItem.identity.work_item_id,
      visibility_state: 'archived',
      reason: 'hide completed review from the default list',
      expected_generation: baselineItem.visibility.generation,
    });
    const archived = build();
    const archivedItem = archived.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.equal(archived.items.length, 9);
    assert.equal(archived.summary.work_item_count, 8);
    assert.equal(archived.summary.visible_work_item_count, 8);
    assert.equal(archived.summary.archived_work_item_count, 1);
    assert.equal(archived.summary.total_work_item_count, 9);
    assert.equal(archived.summary.running_count, 0);
    assert.deepEqual(archivedItem.visibility, {
      state: 'archived',
      source: 'work_item_control_ledger',
      updated_at: archivedItem.visibility.updated_at,
      control_ref: `opl://work-item-control/${encodeURIComponent(archivedItem.identity.agent_id)}/${encodeURIComponent(archivedItem.identity.project_id)}/${encodeURIComponent(workItemId)}`,
      generation: 1,
    });
    assert.equal(typeof archivedItem.visibility.updated_at, 'string');
    assert.equal(archivedItem.lifecycle.business_state, baselineItem.lifecycle.business_state);
    assert.equal(archivedItem.lifecycle.control_state, null);
    assert.equal(archivedItem.lifecycle.source, 'domain_inventory_projection');
    assert.deepEqual(archivedItem.execution, baselineItem.execution);
    assert.deepEqual(archivedItem.stage_map, baselineItem.stage_map);
    assert.deepEqual(archivedItem.action, baselineItem.action);
    assert.deepEqual(archivedItem.telemetry, baselineItem.telemetry);
    const defaultVisibleItem = archived.items.find(
      (candidate) => candidate.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    assert.deepEqual(defaultVisibleItem.visibility, {
      state: 'visible',
      source: 'default',
      updated_at: null,
      control_ref: null,
      generation: 1,
    });

    setWorkItemVisibilityState({
      agent_id: archivedItem.identity.agent_id,
      project_id: archivedItem.identity.project_id,
      work_item_id: archivedItem.identity.work_item_id,
      visibility_state: 'visible',
      reason: 'restore to the default list',
      expected_generation: archivedItem.visibility.generation,
    });
    const restored = build();
    const restoredItem = restored.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.equal(restoredItem.visibility.state, 'visible');
    assert.equal(restoredItem.visibility.source, 'work_item_control_ledger');
    assert.equal(restoredItem.visibility.generation, 2);
    assert.equal(restoredItem.lifecycle.business_state, 'active');
    assert.equal(restoredItem.execution.state, 'running');
    assert.equal(restored.summary.work_item_count, 9);
    assert.equal(restored.summary.archived_work_item_count, 0);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('system attention requires a complete repair route bound to current item generation', () => {
  const input = fixture();
  try {
    const workItemId = 'obesity_multicenter_phenotype_atlas';
    const baseline = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = baseline.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    const completeRoute = {
      blocking_current_progress: true,
      workspace_path: input.obesity,
      work_item_id: workItemId,
      observed_generation: item.lifecycle.observed_generation,
      responsible_component: 'opl_framework',
      issue: 'Temporal worker source is stale.',
      impact: 'The current stage cannot start.',
      repair_action: 'Refresh the managed worker source and restart the worker.',
      expected_outcome: 'The current stage can start with a current worker.',
    };
    const complete = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [attempt({
        id: 'sat-current-repair',
        root: input.obesity,
        workItemId,
        status: 'failed',
        updatedAt: '2026-07-13T01:00:00.000Z',
        repairRoute: completeRoute,
      })],
    });
    const completeItem = complete.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(completeItem.attention.kind, 'system');
    assert.equal(completeItem.lifecycle.primary_state, 'system_attention');
    assert.equal(completeItem.lifecycle.primary_state_reason, 'current_repair_route_blocks_work_item');
    assert.equal(completeItem.action.kind, 'system_action');
    assert.deepEqual(
      [
        completeItem.attention.responsible_component,
        completeItem.attention.issue,
        completeItem.attention.impact,
        completeItem.attention.repair_action,
        completeItem.attention.expected_outcome,
      ],
      [
        completeRoute.responsible_component,
        completeRoute.issue,
        completeRoute.impact,
        completeRoute.repair_action,
        completeRoute.expected_outcome,
      ],
    );
    const incomplete = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [attempt({
        id: 'sat-incomplete-repair',
        root: input.obesity,
        workItemId,
        status: 'failed',
        updatedAt: '2026-07-13T02:00:00.000Z',
        repairRoute: { ...completeRoute, expected_outcome: undefined },
      })],
    });
    const incompleteItem = incomplete.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(incompleteItem.attention.kind, 'none');
    assert.equal(incompleteItem.lifecycle.primary_state, 'automatically_advancing');
    assert.equal(
      incompleteItem.conditions.some((condition) =>
        condition.type === 'NeedsSystemRepair'
          && condition.reason === 'repair_route_incomplete_or_not_current'
      ),
      true,
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
