import {
  assert,
  assertCurrentOwnerDeltaProjection,
  assertCurrentOwnerDeltaReadModel,
  bindMasWorkspaceForAppState,
  fs,
  os,
  path,
  runCli,
  test,
  writeCurrentOwnerDeltaProjectionCacheFixture,
  writeMasProgressPortalFixture,
  writeMasReceiptOwnerConsumptionFixture,
  writeMasWorkspaceRegistryBindings,
  writeRunningStageAttemptFixture,
  writeStudyRuntimeStatusSummaryFixture,
  writeWorkspaceStageAttemptCloseoutFixture,
} from './helpers.ts';

test('app state fast treats workspace terminal closeout evidence as completed runtime activity', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-terminal-closeout-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-terminal-closeout-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-terminal-closeout-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const stageAttemptId = 'sat_app_state_dm003_closeout';

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_app_state_dm003_closeout',
      stageAttemptId,
      workflowId: 'wf_app_state_dm003_closeout',
      stageId: 'review',
      status: 'running',
      providerStatus: 'running',
      updatedAt: '2026-07-04T00:00:00.000Z',
    });
    writeWorkspaceStageAttemptCloseoutFixture({
      workspaceRoot,
      studyId,
      stageAttemptId,
      stageId: 'review',
      generatedAt: '2026-07-04T00:05:00.000Z',
    });
    writeMasReceiptOwnerConsumptionFixture({
      workspaceRoot,
      studyId,
      stageAttemptId,
      recordedAt: '2026-07-04T00:06:00.000Z',
    });
    writeStudyRuntimeStatusSummaryFixture({
      workspaceRoot,
      studyId,
      nextActionSummary: 'route_ref:dm003_bounded_prose_repair_after_post_sync_reviewer_record',
      statusSummary: 'route_back_fixture',
    });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as any;

    const workbench = output.app_state.operator.workbench;
    assert.deepEqual(
      workbench.activity_center.active_projects.map((entry: { study_id?: string }) => entry.study_id),
      ['002-dm-china-us-mortality-attribution'],
    );
    assert.equal(
      workbench.activity_center.recent_projects.some((entry: { study_id?: string }) => entry.study_id === studyId),
      true,
    );

    const dm003Task = workbench.task_drilldowns.find((entry: { study_id?: string }) => entry.study_id === studyId);
    assert.ok(dm003Task);
    assert.equal(dm003Task.state, 'completed');
    assert.equal(dm003Task.status, 'completed');
    assert.equal(dm003Task.status_label, 'OPL runtime completed');
    assert.equal(dm003Task.primary_state, 'delivered_auto_paused');
    assert.equal(dm003Task.automation_state, 'automation_idle');
    assert.equal(dm003Task.runtime_attempt_status, 'completed');
    assert.equal(dm003Task.active_stage_id, 'review');
    assert.equal(dm003Task.active_run_id, 'wf_app_state_dm003_closeout');
    assert.deepEqual(dm003Task.stage_attempt_ids, [stageAttemptId]);
    assert.equal(dm003Task.runtime_closeout_observed, true);
    assert.equal(dm003Task.mas_owner_consumption_status, 'owner_consumed_route_checkpoint');
    assert.equal(dm003Task.mas_owner_consumed_stage_attempt_id, stageAttemptId);
    assert.equal(dm003Task.mas_owner_consumption_matches_runtime_closeout, true);
    assert.equal(typeof dm003Task.next_visible_step, 'string');
    assert.equal(dm003Task.next_visible_step.includes('dm003_bounded_prose_repair_after_post_sync_reviewer_record'), true);

    const taskRunProjection = workbench.task_run_projection_v2;
    assert.deepEqual(taskRunProjection.summary, {
      task_count: 3,
      running_task_count: 1,
      active_project_count: 3,
      queued_project_count: 1,
      attention_count: 0,
      attention_task_count: 0,
      recent_task_count: 2,
      in_progress_count: 1,
      delivered_auto_paused_count: 1,
      paused_count: 1,
      owner_decision_count: 0,
      system_attention_count: 0,
      automation_running_count: 1,
    });
    const dm003Projection = taskRunProjection.tasks.find((entry: any) => entry.task_identity.study_id === studyId);
    assert.ok(dm003Projection);
    assert.equal(dm003Projection.status.state, 'completed');
    assert.equal(dm003Projection.status.status, 'completed');
    assert.equal(dm003Projection.primary_state, 'delivered_auto_paused');
    assert.equal(dm003Projection.automation_state, 'automation_idle');
    assert.equal(dm003Projection.runtime_attempt_status, 'completed');
    assert.deepEqual(dm003Projection.stage_attempt_ids, [stageAttemptId]);
    assert.equal(dm003Projection.runtime_closeout_observed, true);
    assert.equal(dm003Projection.runtime_closeout_ref.endsWith('stage_attempt_closeout_packet.json'), true);
    assert.equal(dm003Projection.mas_owner_consumption_status, 'owner_consumed_route_checkpoint');
    assert.equal(dm003Projection.mas_owner_consumed_stage_attempt_id, stageAttemptId);
    assert.equal(dm003Projection.mas_owner_consumption_matches_runtime_closeout, true);
    assert.equal(dm003Projection.next_visible_step.includes('dm003_bounded_prose_repair_after_post_sync_reviewer_record'), true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast aggregates runtime overview across MAS bindings and keeps task identity stable', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-multi-binding-home-'));
  const activeRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-active-repo-'));
  const activeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-active-workspace-'));
  const inactiveRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-inactive-repo-'));
  const inactiveWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-inactive-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const activeProfilePath = path.join(activeWorkspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const inactiveProfilePath = path.join(inactiveWorkspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');

  try {
    writeMasWorkspaceRegistryBindings({
      stateDir,
      bindings: [
        {
          bindingId: 'mas-active-binding',
          workspacePath: activeRepoRoot,
          profilePath: activeProfilePath,
          status: 'active',
        },
        {
          bindingId: 'mas-inactive-binding',
          workspacePath: inactiveRepoRoot,
          profilePath: inactiveProfilePath,
          status: 'inactive',
        },
      ],
    });
    writeMasProgressPortalFixture(activeWorkspaceRoot, activeProfilePath);
    writeMasProgressPortalFixture(inactiveWorkspaceRoot, inactiveProfilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as any;

    const workbench = output.app_state.operator.workbench;
    const runtimeTasks = workbench.task_drilldowns.filter((entry: { study_id?: string }) => Boolean(entry.study_id));
    assert.equal(runtimeTasks.length, 6);
    assert.equal(new Set(runtimeTasks.map((entry: { task_id: string }) => entry.task_id)).size, 6);
    assert.equal(
      workbench.runtime_scope.scope_options.filter((entry: { scope_kind: string }) => entry.scope_kind === 'workspace').length,
      2,
    );
    assert.deepEqual(
      workbench.runtime_scope.inferred_scope_hint,
      {
        scope_kind: 'workspace',
        scope_id: 'workspace:mas-active-binding',
        label: path.basename(activeWorkspaceRoot),
        workspace_binding_id: 'mas-active-binding',
        workspace_path: activeWorkspaceRoot,
        project_id: 'medautoscience',
        hint_source: 'workspace_registry_active_binding',
      },
    );
    assert.deepEqual(
      workbench.user_task_status_summary,
      {
        running_task_count: 2,
        active_project_count: 6,
        queued_project_count: 2,
        attention_count: 2,
        in_progress_count: 2,
        delivered_auto_paused_count: 0,
        paused_count: 2,
        owner_decision_count: 0,
        system_attention_count: 2,
        automation_running_count: 2,
      },
    );
    assert.deepEqual(
      workbench.activity_center.active_projects.map((entry: { study_id?: string; workspace_binding_id?: string }) => ({
        study_id: entry.study_id,
        workspace_binding_id: entry.workspace_binding_id,
      })),
      [
        {
          study_id: '002-dm-china-us-mortality-attribution',
          workspace_binding_id: 'mas-active-binding',
        },
        {
          study_id: '002-dm-china-us-mortality-attribution',
          workspace_binding_id: 'mas-inactive-binding',
        },
      ],
    );

    const duplicatedStudyTasks = runtimeTasks.filter(
      (entry: { study_id?: string }) => entry.study_id === '002-dm-china-us-mortality-attribution',
    );
    assert.deepEqual(
      duplicatedStudyTasks.map((entry: { workspace_binding_id: string; primary_state: string; automation_state: string }) => ({
        workspace_binding_id: entry.workspace_binding_id,
        primary_state: entry.primary_state,
        automation_state: entry.automation_state,
      })),
      [
        {
          workspace_binding_id: 'mas-active-binding',
          primary_state: 'in_progress',
          automation_state: 'automation_running',
        },
        {
          workspace_binding_id: 'mas-inactive-binding',
          primary_state: 'in_progress',
          automation_state: 'automation_running',
        },
      ],
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(activeRepoRoot, { recursive: true, force: true });
    fs.rmSync(activeWorkspaceRoot, { recursive: true, force: true });
    fs.rmSync(inactiveRepoRoot, { recursive: true, force: true });
    fs.rmSync(inactiveWorkspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast separates latest OPL closeout from MAS owner-consumed receipt identity', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-closeout-identity-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-closeout-identity-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-closeout-identity-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const latestAttemptId = 'sat_app_state_dm003_latest_closeout';
  const consumedAttemptId = 'sat_app_state_dm003_consumed_closeout';

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_app_state_dm003_latest_closeout',
      stageAttemptId: latestAttemptId,
      workflowId: 'wf_app_state_dm003_latest_closeout',
      stageId: 'write',
      status: 'running',
      providerStatus: 'running',
      updatedAt: '2026-07-04T00:10:00.000Z',
    });
    writeWorkspaceStageAttemptCloseoutFixture({
      workspaceRoot,
      studyId,
      stageAttemptId: latestAttemptId,
      stageId: 'write',
      generatedAt: '2026-07-04T00:12:00.000Z',
    });
    writeMasReceiptOwnerConsumptionFixture({
      workspaceRoot,
      studyId,
      stageAttemptId: consumedAttemptId,
      recordedAt: '2026-07-04T00:11:00.000Z',
    });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as any;

    const dm003Task = output.app_state.operator.workbench.task_drilldowns.find(
      (entry: { study_id?: string }) => entry.study_id === studyId,
    );
    assert.ok(dm003Task);
    assert.equal(dm003Task.state, 'attention_needed');
    assert.equal(dm003Task.status, 'completed');
    assert.equal(dm003Task.status_label, 'OPL/MAS readback attention');
    assert.equal(dm003Task.primary_state, 'system_attention_required');
    assert.equal(dm003Task.automation_state, 'result_pending_terminalization');
    assert.equal(dm003Task.runtime_closeout_observed, true);
    assert.equal(dm003Task.runtime_closeout_ref.includes(latestAttemptId), true);
    assert.equal(dm003Task.mas_owner_consumed_stage_attempt_id, consumedAttemptId);
    assert.equal(dm003Task.mas_owner_consumption_matches_runtime_closeout, false);
    assert.equal(typeof dm003Task.next_visible_step, 'string');
    assert.deepEqual(
      output.app_state.operator.workbench.activity_center.needs_attention.map(
        (entry: { study_id?: string }) => entry.study_id,
      ),
      [studyId],
    );

    const dm003Projection = output.app_state.operator.workbench.task_run_projection_v2.tasks.find(
      (entry: any) => entry.task_identity.study_id === studyId,
    );
    assert.ok(dm003Projection);
    assert.equal(dm003Projection.status.state, 'attention_needed');
    assert.equal(dm003Projection.status.priority_bucket, 'needs_attention');
    assert.equal(dm003Projection.primary_state, 'system_attention_required');
    assert.equal(dm003Projection.automation_state, 'result_pending_terminalization');
    assert.equal(dm003Projection.runtime_closeout_ref.includes(latestAttemptId), true);
    assert.equal(dm003Projection.mas_owner_consumed_stage_attempt_id, consumedAttemptId);
    assert.equal(dm003Projection.mas_owner_consumption_matches_runtime_closeout, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
