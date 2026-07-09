import {
  assert,
  bindMasWorkspaceForAppState,
  fs,
  os,
  path,
  runCli,
  test,
  writeCurrentOwnerDeltaProjectionCacheFixture,
  writeMasProgressPortalFixture,
  writeMasWorkspaceRegistryBindings,
  writeRunningStageAttemptFixture,
} from './helpers.ts';
import { buildOrdinaryCockpit } from '../../../../../../src/modules/console/app-state-parts/view-model-operator-profiles.ts';
import { buildCurrentOwnerDeltaReadModel } from '../../../../../../src/modules/ledger/current-owner-delta-projection.ts';
import { buildCurrentOwnerDeltaTopline } from '../../../../../../src/modules/ledger/index.ts';

test('ordinary cockpit prefers current owner delta identity over stale runtime fallback text', () => {
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const readModel = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: 'med-autoscience',
      next_required_delta: 'Return an owner receipt or typed blocker for the completed DM003 stage.',
      required_return_shapes: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
      domain_id: 'medautoscience',
      primary_item: {
        domain_id: 'medautoscience',
        study_id: studyId,
        stage_id: 'submission_milestone_candidate',
        stage_attempt_id: 'sat_app_state_dm003_completed_current',
        work_unit_id: 'dm003-submission-milestone',
      },
    },
    countSummary: {
      openSafeActionCount: 1,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 0,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 0,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
  });

  const cockpit = buildOrdinaryCockpit(
    buildCurrentOwnerDeltaTopline({ currentOwnerDeltaReadModel: readModel }),
    {
      profile: 'fast',
      core: {},
      developerMode: {},
      modules: {},
      provider: {},
      release: {},
      paths: {},
      actions: [],
      settingsControlCenter: {},
      uiDefaults: {},
      runtimeActivityItems: [
        {
          lane: 'running',
          domain_owner: 'med-autoscience',
          project_id: 'medautoscience',
          item_id: `medautoscience:binding:mas-app-state-activity:study:${studyId}`,
          study_id: studyId,
          active_stage_id: 'review',
          stage_attempt_ids: ['sat_wrong_running_attempt'],
          title: 'DM003 stale running review attempt',
          status_label: 'OPL runtime running',
        },
      ],
      brandSystemProfile: {},
      targetOperatingArchitecture: {},
      currentOwnerDeltaReadModel: readModel,
    },
  );

  assert.equal(cockpit.display_payload.task.task_ref, studyId);
  assert.equal(cockpit.display_payload.task.stage_ref, 'submission_milestone_candidate');
  assert.equal(cockpit.display_payload.task.title, null);
  assert.equal(cockpit.display_payload.task.status_label, null);
});

test('app state fast keeps MAS study directories visible without runtime telemetry', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-study-directory-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-study-directory-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'history.workspace.toml');
  const studyId = '002-history-paper';
  const studyRoot = path.join(workspaceRoot, 'studies', studyId);

  try {
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, '[workspace]\nname = "history"\n', 'utf8');
    fs.mkdirSync(path.join(studyRoot, 'submission'), { recursive: true });
    fs.writeFileSync(path.join(studyRoot, 'STUDY_STATUS.md'), [
      '# 002-history-paper',
      '',
      '- Status: `ready`',
      '- Current stage: `01-study_intake`',
      '- Submission package: `not_ready`',
      '- Next action: `paper_clean_room_rebuild_required`',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(studyRoot, 'submission', 'STATUS.json'), `${JSON.stringify({
      surface_kind: 'study_current_package_status',
      status: 'not_ready',
      promotion_allowed: false,
    }, null, 2)}\n`, 'utf8');
    writeMasWorkspaceRegistryBindings({
      stateDir,
      bindings: [{
        bindingId: 'mas-history-binding',
        workspacePath: workspaceRoot,
        profilePath,
        status: 'active',
        label: 'history-paper',
      }],
    });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          workbench: {
            task_drilldowns: Array<Record<string, any>>;
            runtime_scope: { scope_options: Array<Record<string, any>> };
          };
        };
      };
    };

    const task = output.app_state.operator.workbench.task_drilldowns.find((entry) => entry.study_id === studyId);
    assert.ok(task, 'study directory fallback should produce a visible MAS task');
    assert.equal(task.primary_state, 'paused_waiting_for_direction');
    assert.equal(task.automation_state, 'automation_idle');
    assert.equal(task.next_visible_step, 'paper_clean_room_rebuild_required');
    assert.equal(task.current_stage_usage.telemetry_status, 'missing');
    assert.equal(
      output.app_state.operator.workbench.runtime_scope.scope_options.some((option) =>
        option.scope_kind === 'project' && option.label === 'history-paper'
      ),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast keeps current runtime attempts visible without turning them into authority', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-running-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-running-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-running-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'running.workspace.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    writeRunningStageAttemptFixture({
      stateDir,
      workspaceRoot,
      studyId,
      taskId: 'frt_running',
      stageAttemptId: 'sat_running',
      workflowId: 'wf_running',
      stageId: 'review',
      status: 'running',
      providerStatus: 'running',
      updatedAt: new Date().toISOString(),
    });
    writeMasWorkspaceRegistryBindings({
      stateDir,
      bindings: [{
        bindingId: 'mas-running-binding',
        workspacePath: workspaceRoot,
        profilePath,
        status: 'active',
        label: 'running-paper',
      }],
    });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          workbench: {
            task_drilldowns: Array<Record<string, any>>;
            task_run_projection_v2: {
              tasks: Array<Record<string, any>>;
              authority_boundary: Record<string, any>;
            };
          };
        };
      };
    };

    const task = output.app_state.operator.workbench.task_drilldowns.find((entry) => entry.study_id === studyId);
    const taskRunProjection = output.app_state.operator.workbench.task_run_projection_v2;
    const runningProjection = output.app_state.operator.workbench.task_run_projection_v2.tasks.find(
      (entry) => entry.task_identity?.study_id === studyId,
    );
    assert.ok(task);
    assert.ok(runningProjection);
    assert.equal(task.state, 'running');
    assert.deepEqual(task.stage_attempt_ids, ['sat_running']);
    assert.equal(taskRunProjection.authority_boundary.can_create_owner_receipt, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_typed_blocker, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
