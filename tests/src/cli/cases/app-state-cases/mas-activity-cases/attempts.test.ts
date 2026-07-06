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

test('app state fast does not present checkpointed MAS stage attempts as running', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-checkpoint-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-checkpoint-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-checkpoint-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_app_state_dm003_checkpointed',
      stageAttemptId: 'sat_app_state_dm003_checkpointed',
      workflowId: 'wf_app_state_dm003_checkpointed',
      stageId: 'publication_aftercare/reviewer-refresh',
      status: 'checkpointed',
      providerStatus: 'checkpointed',
      updatedAt: '2026-07-04T00:00:00.000Z',
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
    assert.deepEqual(
      workbench.activity_center.needs_attention.map((entry: { study_id?: string }) => entry.study_id),
      [studyId],
    );
    const dm003Task = workbench.task_drilldowns.find((entry: { study_id?: string }) => entry.study_id === studyId);
    assert.ok(dm003Task);
    assert.notEqual(dm003Task.state, 'running');
    assert.notEqual(dm003Task.status_label, 'OPL runtime running');
    assert.deepEqual(dm003Task.stage_attempt_ids ?? [], []);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast presents failed MAS stage attempts as attention with attempt refs', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-failed-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-failed-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-failed-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const stageAttemptId = 'sat_app_state_dm003_failed';

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_app_state_dm003_failed',
      stageAttemptId,
      workflowId: 'wf_app_state_dm003_failed',
      stageId: 'submission_milestone_candidate::followthrough::followthrough-02',
      status: 'failed',
      providerStatus: 'failed',
      updatedAt: '2026-07-04T00:00:00.000Z',
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
    assert.deepEqual(
      workbench.activity_center.needs_attention.map((entry: { study_id?: string }) => entry.study_id),
      [studyId],
    );

    const dm003Task = workbench.task_drilldowns.find((entry: { study_id?: string }) => entry.study_id === studyId);
    assert.ok(dm003Task);
    assert.equal(dm003Task.state, 'attention_needed');
    assert.equal(dm003Task.status, 'failed');
    assert.equal(dm003Task.status_label, 'OPL runtime failed');
    assert.equal(dm003Task.primary_state, 'system_attention_required');
    assert.equal(dm003Task.automation_state, 'automation_failed');
    assert.equal(dm003Task.active_stage_id, 'submission_milestone_candidate::followthrough::followthrough-02');
    assert.equal(dm003Task.active_run_id, 'wf_app_state_dm003_failed');
    assert.deepEqual(dm003Task.stage_attempt_ids, [stageAttemptId]);

    const taskRunProjection = workbench.task_run_projection_v2;
    assert.deepEqual(taskRunProjection.summary, {
      task_count: 3,
      running_task_count: 1,
      active_project_count: 3,
      queued_project_count: 1,
      attention_count: 1,
      attention_task_count: 1,
      recent_task_count: 1,
      in_progress_count: 1,
      delivered_auto_paused_count: 0,
      paused_count: 1,
      owner_decision_count: 0,
      system_attention_count: 1,
      automation_running_count: 1,
    });
    const dm003Projection = taskRunProjection.tasks.find((entry: any) => entry.task_identity.study_id === studyId);
    assert.ok(dm003Projection);
    assert.equal(dm003Projection.status.state, 'attention_needed');
    assert.equal(dm003Projection.status.status, 'failed');
    assert.equal(dm003Projection.primary_state, 'system_attention_required');
    assert.equal(dm003Projection.automation_state, 'automation_failed');
    assert.deepEqual(dm003Projection.stage_attempt_ids, [stageAttemptId]);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast surfaces newer completed MAS stage attempts instead of stale failed attention', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-completed-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-completed-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-completed-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const failedAttemptId = 'sat_app_state_dm003_failed_stale';
  const completedAttemptId = 'sat_app_state_dm003_completed_latest';

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_app_state_dm003_failed_stale',
      stageAttemptId: failedAttemptId,
      workflowId: 'wf_app_state_dm003_failed_stale',
      stageId: 'submission_milestone_candidate::followthrough::followthrough-02',
      status: 'failed',
      providerStatus: 'failed',
      updatedAt: '2026-07-04T00:00:00.000Z',
    });
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_app_state_dm003_completed_latest',
      stageAttemptId: completedAttemptId,
      workflowId: 'wf_app_state_dm003_completed_latest',
      stageId: 'submission_milestone_candidate',
      status: 'completed',
      providerStatus: 'completed',
      updatedAt: '2026-07-04T01:00:00.000Z',
    });
    for (let index = 0; index < 10; index += 1) {
      writeRunningStageAttemptFixture({
        stateDir,
        workspaceRoot,
        studyId,
        taskId: `frt_app_state_dm003_completed_old_${index}`,
        stageAttemptId: `sat_app_state_dm003_completed_old_${index}`,
        workflowId: `wf_app_state_dm003_completed_old_${index}`,
        stageId: 'submission_milestone_candidate',
        status: 'completed',
        providerStatus: 'completed',
        updatedAt: `2026-07-03T${String(index).padStart(2, '0')}:00:00.000Z`,
      });
    }

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
    assert.deepEqual(
      workbench.activity_center.needs_attention.map((entry: { study_id?: string }) => entry.study_id),
      [],
    );
    assert.equal(
      workbench.activity_center.recent_projects.some((entry: { study_id?: string }) => entry.study_id === studyId),
      true,
    );

    const dm003Task = workbench.task_drilldowns.find((entry: { study_id?: string }) => entry.study_id === studyId);
    assert.ok(dm003Task);
    assert.equal(dm003Task.state, 'completed');
    assert.equal(dm003Task.priority_bucket, 'recent');
    assert.equal(dm003Task.status, 'completed');
    assert.equal(dm003Task.status_label, 'OPL runtime completed');
    assert.equal(dm003Task.primary_state, 'delivered_auto_paused');
    assert.equal(dm003Task.automation_state, 'automation_idle');
    assert.equal(dm003Task.active_stage_id, 'submission_milestone_candidate');
    assert.equal(dm003Task.active_run_id, 'wf_app_state_dm003_completed_latest');
    assert.deepEqual(dm003Task.stage_attempt_ids.slice(0, 2), [completedAttemptId, failedAttemptId]);
    assert.equal(dm003Task.stage_attempt_ids.length, 8);
    assert.equal(typeof dm003Task.next_visible_step, 'string');

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
    assert.equal(dm003Projection.status.priority_bucket, 'recent');
    assert.equal(dm003Projection.primary_state, 'delivered_auto_paused');
    assert.equal(dm003Projection.automation_state, 'automation_idle');
    assert.deepEqual(dm003Projection.stage_attempt_ids.slice(0, 2), [completedAttemptId, failedAttemptId]);
    assert.equal(dm003Projection.stage_attempt_ids.length, 8);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast promotes MAS study activity from OPL family-runtime running stage attempts', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-stage-attempt-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-stage-attempt-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-stage-attempt-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const stageAttemptId = 'sat_app_state_dm003_running';

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_app_state_dm003',
      stageAttemptId,
      workflowId: 'wf_app_state_dm003',
      stageId: 'submission_milestone_candidate',
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
      [
        '002-dm-china-us-mortality-attribution',
        studyId,
      ],
    );
    assert.deepEqual(
      workbench.activity_center.needs_attention.map((entry: { study_id?: string }) => entry.study_id),
      [],
    );
    assert.equal(
      workbench.summary_cards.find((entry: { card_id: string }) => entry.card_id === 'in_progress_count')?.value,
      2,
    );
    assert.equal(
      workbench.domain_lane_map.lanes.find((entry: { domain_id: string }) => entry.domain_id === 'medautoscience')?.active_task_count,
      2,
    );

    const dm003Task = workbench.task_drilldowns.find((entry: { study_id?: string }) => entry.study_id === studyId);
    assert.ok(dm003Task);
    assert.equal(dm003Task.state, 'running');
    assert.equal(dm003Task.status, 'running');
    assert.equal(dm003Task.primary_state, 'in_progress');
    assert.equal(dm003Task.automation_state, 'automation_running');
    assert.equal(dm003Task.active_stage_id, 'submission_milestone_candidate');
    assert.equal(dm003Task.active_run_id, 'wf_app_state_dm003');
    assert.deepEqual(dm003Task.stage_attempt_ids, [stageAttemptId]);
    assert.equal(typeof dm003Task.next_visible_step, 'string');
    assert.equal(dm003Task.source_ref_count > 1, true);

    const taskRunProjection = workbench.task_run_projection_v2;
    assert.deepEqual(taskRunProjection.summary, {
      task_count: 3,
      running_task_count: 2,
      active_project_count: 3,
      queued_project_count: 1,
      attention_count: 0,
      attention_task_count: 0,
      recent_task_count: 1,
      in_progress_count: 2,
      delivered_auto_paused_count: 0,
      paused_count: 1,
      owner_decision_count: 0,
      system_attention_count: 0,
      automation_running_count: 2,
    });
    const dm003Projection = taskRunProjection.tasks.find((entry: any) => entry.task_identity.study_id === studyId);
    assert.ok(dm003Projection);
    assert.equal(dm003Projection.task_id, `medautoscience:binding:mas-app-state-activity:study:${studyId}`);
    assert.equal(dm003Projection.status.state, 'running');
    assert.equal(dm003Projection.primary_state, 'in_progress');
    assert.equal(dm003Projection.automation_state, 'automation_running');
    assert.equal(dm003Projection.status.active_stage_id, 'submission_milestone_candidate');
    assert.equal(dm003Projection.status.active_run_ref.endsWith('.active_run_id'), true);
    assert.deepEqual(dm003Projection.stage_attempt_ids, [stageAttemptId]);
    assert.equal(taskRunProjection.authority_boundary.can_create_owner_receipt, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_typed_blocker, false);
    assert.equal('provider_completion_is_domain_ready' in taskRunProjection.authority_boundary, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
