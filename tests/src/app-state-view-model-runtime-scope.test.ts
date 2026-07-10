import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOplAppOperatorViewModel } from '../../src/modules/console/app-state-view-model.ts';

function buildOperatorForRuntimeItems(runtimeActivityItems: Array<Record<string, unknown>>) {
  return buildOplAppOperatorViewModel({
    profile: 'fast',
    core: {},
    developerMode: {},
    modules: {},
    provider: { temporal: { ready: true, status: 'ready' } },
    release: {},
    paths: {},
    actions: [],
    settingsControlCenter: {},
    uiDefaults: {},
    brandSystemProfile: {},
    targetOperatingArchitecture: {},
    runtimeActivityItems,
  });
}

test('runtime scope dedupes workspace options by workspace path', () => {
  const workspacePath = '/Users/example/Yang/DM-CVD-Mortality-Risk';
  const operator = buildOperatorForRuntimeItems([
      {
        domain_id: 'medautoscience',
        agent_display_name: 'MAS',
        workspace_scope_id: 'workspace:real-project-binding',
        workspace_label: 'dm-cvd-mortality-risk',
        workspace_path: workspacePath,
        workspace_binding_id: 'real-project-binding',
        workspace_binding_active: true,
        task_id: 'task-a',
        task_scope_id: 'task:a',
        title: 'Task A',
        study_id: '001-dm-cvd-mortality-risk',
        project_scope_id: 'project:a',
        project_display_name: '001-dm-cvd-mortality-risk',
        state: 'running',
      },
      {
        domain_id: 'medautoscience',
        agent_display_name: 'MAS',
        workspace_scope_id: 'workspace:autopush-binding',
        workspace_label: 'dm-paper-mission-milestone-autopush-20260626',
        workspace_path: workspacePath,
        workspace_binding_id: 'autopush-binding',
        task_id: 'task-b',
        task_scope_id: 'task:b',
        title: 'Task B',
        study_id: '002-dm-china-us-mortality-attribution',
        project_scope_id: 'project:b',
        project_display_name: '002-dm-china-us-mortality-attribution',
        state: 'running',
      },
    ]);

  const workspaceOptions = operator.workbench.runtime_scope.scope_options.filter(
    (entry: Record<string, unknown>) => entry.scope_kind === 'workspace',
  );
  assert.equal(workspaceOptions.length, 1);
  assert.equal(workspaceOptions[0]?.label, 'DM-CVD-Mortality-Risk');
  const inferredScope = operator.workbench.runtime_scope.inferred_scope_hint;
  assert.ok(inferredScope);
  assert.equal(inferredScope.label, 'dm-cvd-mortality-risk');
  const task = operator.workbench.task_drilldowns.find((entry: any) => entry.task_id === 'task-a');
  assert.ok(task);
  assert.deepEqual(
    [task.task_identity.work_item.work_item_id, task.task_identity.work_item.kind, task.active_path[0].node_kind],
    ['task-a', 'runtime_activity', 'runtime_activity_projection'],
  );
});

test('runtime task drilldowns dedupe duplicate MAS bindings for the same workspace study', () => {
  const workspacePath = '/Users/example/Yang/DM-CVD-Mortality-Risk';
  const operator = buildOperatorForRuntimeItems([
    {
      domain_id: 'medautoscience',
      agent_display_name: 'MAS',
      workspace_scope_id: 'workspace:real-project-binding',
      workspace_label: 'dm-cvd-mortality-risk',
      workspace_path: workspacePath,
      workspace_binding_id: 'real-project-binding',
      workspace_binding_active: true,
      item_id: 'medautoscience:binding:real-project-binding:study:001-dm-cvd-mortality-risk',
      title: '001-dm-cvd-mortality-risk',
      study_id: '001-dm-cvd-mortality-risk',
      project_display_name: '001-dm-cvd-mortality-risk',
      lane: 'attention',
      status: 'blocked',
      active_stage_id: 'domain_route/reconcile-apply',
      typed_blocker_summary: 'mas_owner_answer_typed_blocker_observed',
    },
    {
      domain_id: 'medautoscience',
      agent_display_name: 'MAS',
      workspace_scope_id: 'workspace:autopush-binding',
      workspace_label: 'dm-paper-mission-milestone-autopush-20260626',
      workspace_path: workspacePath,
      workspace_binding_id: 'autopush-binding',
      item_id: 'medautoscience:binding:autopush-binding:study:001-dm-cvd-mortality-risk',
      title: '001-dm-cvd-mortality-risk',
      study_id: '001-dm-cvd-mortality-risk',
      project_display_name: '001-dm-cvd-mortality-risk',
      lane: 'attention',
      status: 'blocked',
      active_stage_id: 'domain_route/reconcile-apply',
      typed_blocker_summary: 'mas_owner_answer_typed_blocker_observed',
    },
  ]);

  const studyTasks = operator.workbench.task_drilldowns.filter(
    (entry: Record<string, unknown>) => entry.study_id === '001-dm-cvd-mortality-risk',
  );
  assert.equal(studyTasks.length, 1);
  assert.equal((studyTasks[0] as Record<string, unknown> | undefined)?.workspace_label, 'dm-cvd-mortality-risk');
  assert.equal(operator.workbench.user_task_status_summary.active_project_count, 1);
});

test('MAS owner typed blocker without active automation is shown as paused waiting for direction', () => {
  const operator = buildOperatorForRuntimeItems([
    {
      domain_id: 'medautoscience',
      project_id: 'medautoscience',
      domain_owner: 'med-autoscience',
      agent_display_name: 'MAS',
      item_id: 'medautoscience:study:001-dm-cvd-mortality-risk',
      study_id: '001-dm-cvd-mortality-risk',
      title: '001-dm-cvd-mortality-risk',
      lane: 'attention',
      status: 'blocked',
      active_stage_id: 'domain_route/reconcile-apply',
      typed_blocker_summary: 'mas_owner_answer_typed_blocker_observed',
      typed_blocker_owner: 'med-autoscience',
      workspace_path: '/Users/example/Yang/DM-CVD-Mortality-Risk',
      workspace_label: 'dm-cvd-mortality-risk',
      workspace_scope_id: 'workspace:dm',
      workspace_binding_id: 'dm',
      blockers: ['MAS owner typed blocker observed'],
    },
  ]);

  const workbench = operator.workbench;
  const task = workbench.task_drilldowns.find(
    (entry: Record<string, unknown>) => entry.study_id === '001-dm-cvd-mortality-risk',
  ) as Record<string, unknown>;
  assert.ok(task);
  assert.equal(task.primary_state, 'paused_waiting_for_direction');
  assert.equal(task.primary_state_label, '已暂停，等待后续决定');
  assert.equal(task.automation_state, 'automation_idle');
  assert.equal(task.state, 'waiting_for_direction');
  assert.equal(task.priority_bucket, 'recent');
  assert.deepEqual(workbench.activity_center.needs_attention, []);
  assert.equal(workbench.user_task_status_summary.system_attention_count, 0);
  assert.equal(workbench.user_task_status_summary.paused_count, 1);
});

test('domain runtime closeout is delivered even when a stale attempt failed', () => {
  const operator = buildOperatorForRuntimeItems([
    {
      domain_id: 'medautoscience',
      project_id: 'medautoscience',
      domain_owner: 'med-autoscience',
      agent_display_name: 'MAS',
      item_id: 'medautoscience:study:002-dm-china-us-mortality-attribution',
      study_id: '002-dm-china-us-mortality-attribution',
      title: '002-dm-china-us-mortality-attribution',
      lane: 'attention',
      status: 'failed',
      active_stage_id: 'submission_milestone_candidate::followthrough::followthrough-01',
      typed_blocker_summary: 'temporal_workflow_not_started_or_not_found',
      typed_blocker_owner: 'med-autoscience',
      runtime_closeout_observed: true,
      workspace_path: '/Users/example/Yang/DM-CVD-Mortality-Risk',
      workspace_label: 'dm-cvd-mortality-risk',
      workspace_scope_id: 'workspace:dm',
      workspace_binding_id: 'dm',
      blockers: ['stale autopush attempt failed'],
    },
  ]);

  const workbench = operator.workbench;
  const task = workbench.task_drilldowns.find(
    (entry: Record<string, unknown>) => entry.study_id === '002-dm-china-us-mortality-attribution',
  ) as Record<string, unknown>;
  assert.ok(task);
  assert.equal(task.primary_state, 'delivered_auto_paused');
  assert.equal(task.primary_state_label, '已交付，自动暂停');
  assert.equal(task.automation_state, 'automation_idle');
  assert.equal(task.state, 'completed');
  assert.equal(task.priority_bucket, 'recent');
  assert.deepEqual(workbench.activity_center.needs_attention, []);
  assert.equal(workbench.user_task_status_summary.delivered_auto_paused_count, 1);
  assert.equal(workbench.user_task_status_summary.system_attention_count, 0);
});

test('real runtime failures still require system handling', () => {
  const operator = buildOperatorForRuntimeItems([
    {
      domain_id: 'medautoscience',
      project_id: 'medautoscience',
      domain_owner: 'med-autoscience',
      agent_display_name: 'MAS',
      item_id: 'medautoscience:study:006-runtime-sync-repair',
      study_id: '006-runtime-sync-repair',
      title: '006-runtime-sync-repair',
      lane: 'attention',
      status: 'failed',
      active_stage_id: 'domain_route/reconcile-apply',
      typed_blocker_summary: 'provider_failure',
      typed_blocker_owner: 'opl_framework',
      workspace_path: '/Users/example/Yang/DM-CVD-Mortality-Risk',
      workspace_label: 'dm-cvd-mortality-risk',
      workspace_scope_id: 'workspace:dm',
      workspace_binding_id: 'dm',
      blockers: ['provider failed'],
    },
  ]);

  const workbench = operator.workbench;
  const task = workbench.task_drilldowns.find(
    (entry: Record<string, unknown>) => entry.study_id === '006-runtime-sync-repair',
  ) as Record<string, unknown>;
  assert.ok(task);
  assert.equal(task.primary_state, 'system_attention_required');
  assert.equal(task.automation_state, 'automation_failed');
  assert.equal(task.state, 'attention_needed');
  assert.equal(task.priority_bucket, 'needs_attention');
  assert.equal(workbench.activity_center.needs_attention.length, 1);
  assert.equal(workbench.user_task_status_summary.system_attention_count, 1);
});
