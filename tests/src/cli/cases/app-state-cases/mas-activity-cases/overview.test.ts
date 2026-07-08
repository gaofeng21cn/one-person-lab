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
import { buildOrdinaryCockpit } from '../../../../../../src/modules/console/app-state-parts/view-model-operator-profiles.ts';
import { buildCurrentOwnerDeltaReadModel } from '../../../../../../src/modules/ledger/current-owner-delta-projection.ts';
import { buildCurrentOwnerDeltaTopline } from '../../../../../../src/modules/ledger/index.ts';

test('ordinary cockpit does not mix current owner delta identity with stale runtime task fallback text', () => {
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const stageAttemptId = 'sat_app_state_dm003_completed_current';
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
        stage_attempt_id: stageAttemptId,
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
          lane: 'attention',
          domain_owner: 'med-autoscience',
          project_id: 'medautoscience',
          item_id: 'medautoscience:binding:mas-app-state-activity:study:001-dm-cvd-mortality-risk',
          study_id: '001-dm-cvd-mortality-risk',
          active_stage_id: 'runtime_blocked',
          stage_attempt_ids: ['sat_old_blocked_attempt'],
          title: '001-dm-cvd-mortality-risk / OPL runtime blocked',
          status_label: 'OPL runtime blocked',
        },
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
    fs.writeFileSync(
      path.join(studyRoot, 'STUDY_STATUS.md'),
      [
        '# 002-history-paper',
        '',
        '- Status: `ready`',
        '- Current stage: `01-study_intake`',
        '- Submission package: `not_ready`',
        '- Next action: `paper_clean_room_rebuild_required`',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(studyRoot, 'submission', 'STATUS.json'),
      `${JSON.stringify({
        surface_kind: 'study_current_package_status',
        schema_version: 1,
        status: 'not_ready',
        reason: 'submission_package_not_promoted_by_publication_gate',
        promotion_allowed: false,
        recorded_at: '2026-07-05T11:05:30+00:00',
      }, null, 2)}\n`,
      'utf8',
    );
    writeMasWorkspaceRegistryBindings({
      stateDir,
      bindings: [{
        bindingId: 'mas-history-binding',
        workspacePath: workspaceRoot,
        profilePath,
        status: 'active',
        label: '历史论文',
      }],
    });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as { app_state: { operator: { workbench: { task_drilldowns: Array<Record<string, any>>; runtime_scope: { scope_options: Array<Record<string, any>> } } } } };

    const task = output.app_state.operator.workbench.task_drilldowns.find((entry) => entry.study_id === studyId);
    assert.ok(task, 'study directory fallback should produce a visible MAS task');
    assert.equal(task.primary_state, 'paused_waiting_for_direction');
    assert.equal(task.automation_state, 'automation_idle');
    assert.equal(task.next_visible_step, 'paper_clean_room_rebuild_required');
    assert.equal(task.workspace_label, '历史论文');
    assert.equal(task.source_ref_count > 0, true);
    assert.equal(task.current_stage_usage.telemetry_status, 'missing');
    assert.equal(task.task_total_usage.telemetry_status, 'missing');
    assert.equal(
      output.app_state.operator.workbench.runtime_scope.scope_options.some((option) =>
        option.scope_kind === 'project' && option.label === '历史论文'
      ),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app state fast enumerates registered MAS project workspaces beyond Temporal attempts', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-project-universe-home-'));
  const workspaceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-project-universe-workspaces-'));
  const masCodeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-code-root-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const projects = [
    {
      bindingId: 'mas-dm-binding',
      dir: 'dm',
      label: '糖尿病',
      profile: 'dm.local.toml',
      studies: [
        '001-dm-cvd-mortality-risk',
        '002-dm-china-us-mortality-attribution',
        '003-dpcc-primary-care-phenotype-treatment-gap',
        '004-dpcc-longitudinal-care-inertia-intensification-gap',
      ],
      status: 'active' as const,
    },
    {
      bindingId: 'mas-obesity-binding',
      dir: 'obesity',
      label: '肥胖',
      profile: 'obesity.local.toml',
      studies: ['obesity_multicenter_phenotype_atlas'],
      status: 'inactive' as const,
    },
    {
      bindingId: 'mas-nfpitnet-binding',
      dir: 'nfpitnet',
      label: '无功能垂体瘤',
      profile: 'nfpitnet.workspace.toml',
      studies: [
        '001-lineage-pfs',
        '002-early-residual-risk',
        '003-endocrine-burden-followup',
        '004-invasive-architecture',
      ],
      status: 'inactive' as const,
    },
  ];

  try {
    const bindings = projects.map((project) => {
      const workspaceRoot = path.join(workspaceBase, project.dir);
      const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', project.profile);
      fs.mkdirSync(path.dirname(profilePath), { recursive: true });
      fs.writeFileSync(profilePath, `[workspace]\nname = "${project.dir}"\n`, 'utf8');
      for (const studyId of project.studies) {
        fs.mkdirSync(path.join(workspaceRoot, 'studies', studyId), { recursive: true });
      }
      return {
        bindingId: project.bindingId,
        workspacePath: workspaceRoot,
        workspaceRoot: masCodeRoot,
        profilePath,
        status: project.status,
        label: project.label,
      };
    });
    writeMasWorkspaceRegistryBindings({ stateDir, bindings });

    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as { app_state: { operator: { workbench: { task_drilldowns: Array<Record<string, any>>; runtime_scope: { scope_options: Array<Record<string, any>> } } } } };

    const studyTasks = output.app_state.operator.workbench.task_drilldowns.filter((entry) => entry.domain_id === 'medautoscience' && entry.study_id);
    assert.equal(studyTasks.length, 9);
    assert.deepEqual(
      new Set(studyTasks.map((entry) => entry.workspace_label)),
      new Set(['糖尿病', '肥胖', '无功能垂体瘤']),
    );
    assert.deepEqual(
      output.app_state.operator.workbench.runtime_scope.scope_options
        .filter((option) => option.scope_kind === 'project')
        .map((option) => option.label)
        .sort(),
      ['无功能垂体瘤', '糖尿病', '肥胖'].sort(),
    );
    assert.equal(
      output.app_state.operator.workbench.runtime_scope.scope_options.some((option) => option.scope_kind === 'task'),
      false,
    );
    assert.equal(studyTasks.every((entry) => entry.task_total_usage.telemetry_status === 'missing'), true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceBase, { recursive: true, force: true });
    fs.rmSync(masCodeRoot, { recursive: true, force: true });
  }
});

test('app state fast exposes MAS study-level running activity refs for the GUI', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-activity-home-'));
  const masRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-repo-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-mas-activity-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');

  try {
    bindMasWorkspaceForAppState({ stateDir, workspaceRoot: masRepoRoot, profilePath });
    writeMasProgressPortalFixture(workspaceRoot, profilePath);
    writeCurrentOwnerDeltaProjectionCacheFixture(stateDir);
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        operator: {
          ordinary_cockpit: {
            display_payload: Record<string, any>;
          };
          operator_next_action_owner: string | null;
          current_owner_delta: Record<string, any>;
          current_owner_delta_next_action: Record<string, any> | null;
          current_owner_delta_read_model: Record<string, any>;
          workbench: {
            ordinary_cockpit: {
              display_payload: Record<string, any>;
            };
            current_owner_delta: Record<string, any>;
            current_owner_delta_read_model: Record<string, any>;
            runtime_scope: {
              scope_options: Array<Record<string, any>>;
              current_scope: Record<string, any>;
              scope_source: string;
              inferred_scope_hint: Record<string, any> | null;
            };
            user_task_status_summary: Record<string, number>;
            summary_cards: Array<{ card_id: string; value: number | string }>;
            activity_center: {
              active_projects: Array<{ study_id?: string; state: string; active_run_id?: string | null }>;
              needs_attention: Array<{ study_id?: string; state: string }>;
              recent_projects: Array<{ study_id?: string; state: string }>;
            };
            domain_lane_map: { lanes: Array<{ domain_id: string; active_task_count: number; tasks: Array<{ study_id?: string; state: string }> }> };
            task_drilldowns: Array<{
              study_id?: string;
              state: string;
              source_ref_count: number;
              stage: Record<string, any>;
              progress: Record<string, any>;
              next_owner: Record<string, any>;
              artifact_or_blocker: Record<string, any>;
              review_receipt: Record<string, any>;
              action_receipt: Record<string, any>;
              workflow_refs: Record<string, any>;
            }>;
            task_run_projection_v2: {
              surface_kind: string;
              schema_version: string;
              refs_only: boolean;
              source_ref: string;
              summary: Record<string, number>;
              work_item_projection_v1: Record<string, any>;
              tasks: Array<{
                task_identity: Record<string, any>;
                status: Record<string, any>;
                progress: Record<string, any>;
                conditions: Array<Record<string, any>>;
                evidence_cards: Array<Record<string, any>>;
                action_cards: Array<Record<string, any>>;
                resource_cards: Array<Record<string, any>>;
                diagnostics_ref: string;
                authority_boundary?: Record<string, any>;
              }>;
              authority_boundary: Record<string, any>;
            };
            work_item_projection_v1: Record<string, any>;
          };
          visual_ref_groups: {
            active_project_refs: Array<{ study_id?: string; state: string }>;
            recent_project_refs: Array<{ study_id?: string; state: string }>;
          };
        };
      };
    };

    const activeStudyIds = output.app_state.operator.workbench.activity_center.active_projects.map((entry) => entry.study_id);
    assert.deepEqual(activeStudyIds, [
      '002-dm-china-us-mortality-attribution',
    ]);
    assert.deepEqual(
        output.app_state.operator.workbench.activity_center.needs_attention.map((entry) => entry.study_id),
      ['003-dpcc-primary-care-phenotype-treatment-gap'],
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta_read_model,
      output.app_state.operator.workbench.current_owner_delta_read_model,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.workbench.current_owner_delta,
    );
    assert.deepEqual(
      output.app_state.operator.ordinary_cockpit,
      output.app_state.operator.workbench.ordinary_cockpit,
    );
    assert.deepEqual(
      Object.keys(output.app_state.operator.ordinary_cockpit.display_payload),
      [
        'purpose',
        'task',
        'current_owner',
        'next_action',
        'artifact_or_blocker',
      ],
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.display_payload.task.task_ref,
      'medautoscience:binding:mas-app-state-activity:study:003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.display_payload.current_owner,
      'med-autoscience',
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.display_payload.next_action.owner,
      output.app_state.operator.current_owner_delta_next_action?.owner
        ?? output.app_state.operator.current_owner_delta.current_owner,
    );
    assert.equal(
      JSON.stringify(output.app_state.operator.ordinary_cockpit.display_payload).includes('worklist'),
      false,
    );
    assert.deepEqual(
      output.app_state.operator.current_owner_delta,
      output.app_state.operator.current_owner_delta_read_model.current_owner_delta,
    );
    assertCurrentOwnerDeltaProjection(output.app_state.operator.current_owner_delta, {
      currentOwner: 'med-autoscience',
      requiredDelta: '提交 MAS owner receipt 或 typed blocker。',
    });
    assertCurrentOwnerDeltaReadModel(output.app_state.operator.current_owner_delta_read_model, {
      currentOwner: 'med-autoscience',
      requiredDelta: '提交 MAS owner receipt 或 typed blocker。',
      acceptedReturnShapes: [
        'domain_owner_receipt_ref',
        'domain_typed_blocker_ref',
        'typed_blocker_ref',
      ],
      openSafeActionCount: 1,
      payloadRequiredCount: 0,
      fullDetailRefKeys: [
        'owner_delta_first_ref',
        'evidence_worklist_ref',
        'app_operator_drilldown_ref',
      ],
    });
    assert.notEqual(
      output.app_state.operator.current_owner_delta.stage_id,
      'domain_owner/default-executor-dispatch',
    );
    assert.equal(
      output.app_state.operator.workbench.summary_cards.find((entry) => entry.card_id === 'in_progress_count')?.value,
      1,
    );
    assert.deepEqual(
      output.app_state.operator.workbench.runtime_scope.current_scope,
      {
        scope_kind: 'all_projects',
        scope_id: 'all_projects',
        label: '全部项目',
      },
    );
    assert.deepEqual(
      output.app_state.operator.workbench.runtime_scope.inferred_scope_hint,
      {
        scope_kind: 'project',
        scope_id: 'project:medautoscience:mas-app-state-activity',
        label: path.basename(workspaceRoot),
        workspace_binding_id: 'mas-app-state-activity',
        workspace_path: workspaceRoot,
        workspace_label: path.basename(workspaceRoot),
        project_id: 'medautoscience',
        hint_source: 'workspace_registry_active_binding',
      },
    );
    assert.deepEqual(
      new Set(output.app_state.operator.workbench.runtime_scope.scope_options.map((entry: Record<string, any>) => entry.scope_kind)),
      new Set(['all_projects', 'agent', 'project']),
    );
    assert.deepEqual(
      output.app_state.operator.workbench.user_task_status_summary,
      {
        running_task_count: 1,
        active_project_count: 3,
        queued_project_count: 1,
        attention_count: 1,
        in_progress_count: 1,
        delivered_auto_paused_count: 0,
        paused_count: 1,
        owner_decision_count: 0,
        system_attention_count: 1,
        automation_running_count: 1,
      },
    );
    assert.deepEqual(
      output.app_state.operator.visual_ref_groups.active_project_refs.map((entry) => entry.study_id),
      activeStudyIds,
    );
    assert.equal(
      output.app_state.operator.workbench.activity_center.recent_projects.length,
      1,
    );
    assert.equal(
      output.app_state.operator.workbench.domain_lane_map.lanes.find((entry) => entry.domain_id === 'medautoscience')?.active_task_count,
      1,
    );
    assert.equal(
      output.app_state.operator.workbench.task_drilldowns.filter((entry) => entry.study_id).length,
      3,
    );
    assert.equal(
      output.app_state.operator.workbench.task_drilldowns.every((entry) => !entry.study_id || entry.source_ref_count > 0),
      true,
    );
    const runningTask = output.app_state.operator.workbench.task_drilldowns.find(
      (entry) => entry.study_id === '002-dm-china-us-mortality-attribution',
    ) as any;
    assert.ok(runningTask);
    assert.equal(runningTask.stage.stage_id, 'live');
    assert.equal(runningTask.stage.current_ref.includes('task_drilldowns'), true);
    assert.equal(runningTask.progress.status, 'running');
    assert.equal(runningTask.next_owner.owner, 'medautoscience');
    assert.equal(runningTask.primary_state, 'in_progress');
    assert.equal(runningTask.primary_state_label, '进行中');
    assert.equal(runningTask.automation_state, 'automation_running');
    assert.equal(runningTask.automation_state_label, '自动运行中');
    assert.equal(runningTask.task_identity.agent.label, 'MAS');
    assert.equal(runningTask.task_identity.project.workspace_binding_id, 'mas-app-state-activity');
    assert.equal(runningTask.task_identity.work_item.kind, 'study');
    assert.equal(runningTask.task_identity.execution_run.stage_id, 'live');
    assert.equal(runningTask.artifact_or_blocker.content_policy, 'refs_only_no_artifact_body');
    assert.equal(runningTask.artifact_or_blocker.canonical_ref.includes('/tasks/'), true);
    assert.equal(Array.isArray(runningTask.artifact_or_blocker.export_bundle_refs), true);
    assert.equal(runningTask.artifact_or_blocker.export_bundle_refs[0].includes('/export-bundles/latest'), true);
    assert.equal(runningTask.artifact_or_blocker.export_bundle_action_ref, 'app_state.actions#task_export_bundle_preview');
    assert.equal(runningTask.review_receipt.authority_policy, 'receipt_summary_refs_only_no_quality_verdict_authority');
    assert.equal(runningTask.review_receipt.receipt_ref.includes('/reviewer-receipt'), true);
    assert.equal(runningTask.action_receipt.action_id, 'task_action_receipt_preview');
    assert.equal(runningTask.action_receipt.dry_run_required, true);
    assert.equal(runningTask.action_receipt.export_bundle_action_id, 'task_export_bundle_preview');
    assert.equal(runningTask.action_receipt.export_bundle_route, 'opl app action execute --action task_export_bundle_preview --dry-run');
    assert.equal(runningTask.workflow_refs.content_policy, 'refs_only_no_workflow_body');
    assert.equal(runningTask.workflow_refs.current_workflow_ref.includes('/workflows/current'), true);
    assert.equal('artifact_body' in runningTask.artifact_or_blocker, false);
    assert.equal('body' in runningTask.artifact_or_blocker, false);
    assert.equal('body' in runningTask.review_receipt, false);
    assert.equal('body' in runningTask.workflow_refs, false);

    const taskRunProjection = output.app_state.operator.workbench.task_run_projection_v2;
    assert.equal(taskRunProjection.surface_kind, 'task_run_projection_v2');
    assert.equal(taskRunProjection.schema_version, 'task-run-projection.v2');
    assert.equal(taskRunProjection.refs_only, true);
    assert.equal(taskRunProjection.source_ref, 'app_state.operator.workbench.task_drilldowns');
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
    assert.equal(taskRunProjection.authority_boundary.can_write_domain_truth, false);
    assert.equal(taskRunProjection.authority_boundary.can_read_artifact_body, false);
    assert.equal(taskRunProjection.authority_boundary.can_read_memory_body, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_owner_receipt, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_typed_blocker, false);
    assert.equal(taskRunProjection.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal('provider_completion_is_domain_ready' in taskRunProjection.authority_boundary, false);
    assert.deepEqual(
      output.app_state.operator.workbench.work_item_projection_v1,
      taskRunProjection.work_item_projection_v1,
    );
    const workItemProjection = output.app_state.operator.workbench.work_item_projection_v1;
    assert.equal(workItemProjection.surface_kind, 'opl_work_item_projection');
    assert.equal(workItemProjection.schema_version, 'work-item-projection.v1');
    assert.equal(workItemProjection.refs_only, true);
    assert.equal(workItemProjection.derived_from, 'task_run_projection_v2');
    assert.deepEqual(workItemProjection.summary, {
      item_count: 3,
      agent_action_count: 1,
      user_action_count: 1,
      system_action_count: 1,
      safe_action_count: 0,
      blocked_no_action_count: 0,
    });
    assert.equal(
      workItemProjection.stage_catalog_summary.source_catalog_ref,
      'contracts/family-orchestration/family-stage-control-plane.schema.json',
    );
    assert.equal(
      workItemProjection.stage_catalog_summary.action_catalog_ref,
      'contracts/family-orchestration/family-action-catalog.schema.json',
    );
    assert.equal(workItemProjection.authority_boundary.can_write_domain_truth, false);
    assert.equal(workItemProjection.authority_boundary.can_create_owner_receipt, false);

    const runningProjection = taskRunProjection.tasks.find(
      (entry) => entry.task_identity.study_id === '002-dm-china-us-mortality-attribution',
    ) as any;
    assert.ok(runningProjection);
    assert.equal(runningProjection.task_identity.task_id, 'medautoscience:binding:mas-app-state-activity:study:002-dm-china-us-mortality-attribution');
    assert.equal(runningProjection.status.state, 'running');
    assert.equal(runningProjection.status.primary_state, 'in_progress');
    assert.equal(runningProjection.status.automation_state, 'automation_running');
    assert.equal(runningProjection.task_identity.project.workspace_binding_id, 'mas-app-state-activity');
    assert.equal(runningProjection.status.active_run_ref?.endsWith('.active_run_id'), true);
    assert.equal(runningProjection.progress.progress_ref.endsWith('.progress'), true);
    assert.equal(runningProjection.progress.stage_ref.endsWith('.stage'), true);
    assert.deepEqual(
      runningProjection.conditions.map((condition: any) => condition.type),
      ['task_status', 'owner_route', 'evidence_refs'],
    );
    for (const condition of runningProjection.conditions) {
      assert.deepEqual(
        Object.keys(condition),
        ['type', 'status', 'reason', 'message', 'severity', 'owner', 'last_transition_time', 'observed_generation', 'ref'],
      );
      assert.equal(typeof condition.ref, 'string');
      assert.equal(condition.observed_generation, null);
    }
    const attentionProjection = taskRunProjection.tasks.find(
      (entry) => entry.task_identity.study_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    ) as any;
    assert.ok(attentionProjection);
    assert.equal(attentionProjection.primary_state, 'system_attention_required');
    assert.equal(attentionProjection.automation_state, 'automation_idle');
    assert.equal(
      attentionProjection.conditions.find((condition: any) => condition.type === 'task_status')?.reason,
      'attention_lane_selected',
    );
    assert.equal(
      attentionProjection.conditions.find((condition: any) => condition.type === 'owner_route')?.reason,
      'attention_lane_selected',
    );
    assert.equal(
      runningProjection.evidence_cards.every((card: any) =>
        typeof card.kind === 'string'
          && typeof card.owner === 'string'
          && 'updated_at' in card
          && typeof card.title === 'string'
          && typeof card.ref === 'string'
          && typeof card.summary === 'string'
          && typeof card.why_it_matters === 'string'
          && card.open_action?.required_mode === 'dry_run'
          && typeof card.content_policy === 'string'
          && !('body' in card)
          && !('artifact_body' in card)
          && !('receipt_body' in card)
          && !('verdict' in card)
          && !('quality_verdict' in card)
          && !('domain_verdict' in card)
      ),
      true,
    );
    assert.equal(
      runningProjection.action_cards.every((card: any) =>
        ['user_action', 'system_action', 'agent_action', 'safe_action', 'blocked_no_action'].includes(card.action_kind)
          && card.action_kind === 'safe_action'
          && typeof card.ref === 'string'
          && typeof card.summary === 'string'
          && card.risk?.mutation_policy === 'no_writes_preview_only'
          && Array.isArray(card.write_targets)
          && card.write_targets.length === 0
          && card.expected_output?.content_policy === 'refs_only_no_action_receipt_body'
          && typeof card.rollback_ref === 'string'
          && typeof card.verify_ref === 'string'
          && card.open_action?.required_mode === 'dry_run'
          && card.open_action?.action_kind === 'safe_action'
          && !('body' in card)
          && !('receipt_body' in card)
          && !('verdict' in card)
          && !('quality_verdict' in card)
      ),
      true,
    );
    assert.equal(
      runningProjection.resource_cards.every((card: any) =>
        typeof card.resource_kind === 'string'
          && typeof card.owner === 'string'
          && typeof card.ref === 'string'
          && typeof card.summary === 'string'
          && typeof card.status_ref === 'string'
          && typeof card.usage_ref === 'string'
          && typeof card.quota_ref === 'string'
          && typeof card.permission_ref === 'string'
          && typeof card.cost_estimate_ref === 'string'
          && card.open_action?.required_mode === 'dry_run'
          && !('body' in card)
          && !('resource_body' in card)
          && !('verdict' in card)
      ),
      true,
    );
    assert.deepEqual(
      runningProjection.evidence_cards.map((card: any) => card.kind),
      ['source_refs', 'artifact_or_blocker_refs', 'review_receipt_refs'],
    );
    assert.deepEqual(
      runningProjection.resource_cards.map((card: any) => card.resource_kind),
      ['workspace', 'workflow'],
    );
    assert.equal(runningProjection.diagnostics_ref, 'app_state.provider.temporal');
    assert.equal(Array.isArray(runningProjection.connector_readiness_refs), true);
    assert.equal(Array.isArray(runningProjection.diagnostic_substrate_refs), true);
    assert.equal(runningProjection.stage_run_cockpit.refs_only, true);
    assert.equal(runningProjection.stage_run_cockpit_summary.current_stage, 'live');
    const runningWorkItem = workItemProjection.items.find(
      (entry: any) => entry.work_item.study_id === '002-dm-china-us-mortality-attribution',
    ) as any;
    assert.ok(runningWorkItem);
    assert.equal(runningWorkItem.scope.scope_kind, 'work_item');
    assert.equal(runningWorkItem.work_item.kind, 'study');
    assert.equal(runningWorkItem.agent.label, 'MAS');
    assert.equal(runningWorkItem.stage.stage_id, 'live');
    assert.equal(
      runningWorkItem.stage.catalog_ref,
      'contracts/family-orchestration/family-stage-control-plane.schema.json',
    );
    assert.equal(runningWorkItem.attempt.refs_only, true);
    assert.equal(runningWorkItem.attempt.attempt_count, runningProjection.stage_attempt_ids.length);
    assert.equal(runningWorkItem.attempt.attempt_ids_ref.endsWith('.stage_attempt_ids'), true);
    assert.equal(runningWorkItem.attempt.active_run_ref.endsWith('.active_run_id'), true);
    assert.equal('elapsed_seconds' in runningWorkItem.attempt, true);
    assert.deepEqual(runningWorkItem.attempt.stage_usage, runningProjection.current_stage_usage);
    assert.deepEqual(runningWorkItem.attempt.task_total_usage, runningProjection.task_total_usage);
    assert.equal(runningWorkItem.action.action_kind, 'agent_action');
    assert.equal(
      runningWorkItem.action.catalog_ref,
      'contracts/family-orchestration/family-action-catalog.schema.json',
    );
    assert.equal(runningWorkItem.evidence.refs_only, true);
    assert.equal(runningWorkItem.evidence.card_count, 3);
    assert.deepEqual(
      runningWorkItem.conditions.map((condition: any) => condition.type),
      ['Running', 'Succeeded', 'NeedsUserDecision', 'NeedsSystemRepair', 'Paused', 'TelemetryFresh'],
    );
    assert.equal(runningWorkItem.conditions.find((condition: any) => condition.type === 'Running')?.status, 'True');
    assert.equal(
      runningWorkItem.conditions.find((condition: any) => condition.type === 'NeedsSystemRepair')?.status,
      'False',
    );
    assert.equal(runningWorkItem.diagnostic_conditions[0].type, 'task_status');
    assert.equal(
      runningWorkItem.conditions.every((condition: any) =>
        ['type', 'status', 'reason', 'message', 'owner', 'last_transition_time', 'observed_generation', 'ref']
          .every((key) => key in condition)
      ),
      true,
    );
    assert.equal(
      [null, 'not_applicable', 'running_confirmed'].includes(runningProjection.status.running_proof_status ?? null),
      true,
    );
    const projectionWithoutDiagnostics = JSON.stringify({
      ...runningProjection,
      diagnostics_ref: undefined,
    });
    assert.equal(projectionWithoutDiagnostics.includes('current_control_state'), false);
    assert.equal(projectionWithoutDiagnostics.includes('"artifact_body":'), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
