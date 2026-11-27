import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createDaemonSandbox } from './helpers/sandbox.ts';
import { buildRunwayWorkbench } from '../src/state/task-projection.ts';
import { ensureTaskVisibilitySchema, setTaskVisibility } from '../src/state/task-visibility.ts';
import type { DomainTaskInventory } from '../src/state/domain-task-inventory.ts';

test('the workbench joins owner inventory and Runway work without turning execution success into delivery', async () => {
  const sandbox = createDaemonSandbox();
  try {
    const { runtime } = await sandbox.startInProcess();
    const { db, workspaceService, runwayStore } = runtime;
    ensureTaskVisibilitySchema(db);
    const workspace = workspaceService.initWorkspace({ root_path: sandbox.workspaceDir, name: 'Alternate label' });
    const created = runwayStore.createTask({
      workspace_id: workspace.workspace_id, agent_id: 'an-agent', title: 'Collect sources', goal_prompt: 'Test',
    });
    runwayStore.createTask({ workspace_id: workspace.workspace_id, title: 'Unassigned task', goal_prompt: 'Test' });
    const packages = [{ package_id: 'an-agent', intent: 'agent' as const, name: 'Research agent', enabled: true }];
    const inventory: DomainTaskInventory = {
      items: [{
        workspace_id: workspace.workspace_id, workspace_path: workspace.root_path, package_id: 'an-agent',
        domain_id: 'research', work_item_id: 'paper-1', title: 'Domain paper', business_status: 'delivered',
        business_state: 'delivered_paused', current_stage_id: 'review', work_item_root: null, observed_at: '2026-11-27T00:00:00Z',
        domain_detail_views: [{ view_id: 'roadmap', view_kind: 'roadmap', availability: 'unread' }],
      }],
      diagnostics: [],
    };
    const read = () => buildRunwayWorkbench(db, packages, new Date().toISOString(), inventory);
    const task = () => read().work_item_projection_v2.items.find((item) => item.identity.work_item_id === created.task_id)!;
    const row = task();
    assert.equal(row.identity.project_display_name, path.basename(workspace.root_path));
    assert.equal(row.identity.agent_display_name, 'Research agent');
    assert.equal(row.execution.state, 'queued');
    assert.equal(row.telemetry.cumulative.state, 'missing');
    assert.equal(read().task_drilldowns.length, 2);
    assert.equal(read().work_item_projection_v2.items.length, 2);
    assert.equal(read().work_item_projection_v2.summary.agent_count, 1);
    const domain = read().work_item_projection_v2.items.find((item) => item.identity.work_item_id === 'paper-1')!;
    assert.equal(domain.domain_detail_views?.[0].item_id, domain.item_id);
    assert.equal(domain.identity.identity_state, 'resolved');
    assert.match(domain.identity.work_item_scope_id!, /^work-item:[a-f0-9]{64}$/);
    assert.equal(domain.lifecycle.primary_state, 'delivered_auto_paused');
    assert.equal(domain.execution.state, 'unknown');
    runwayStore.updateTaskStatus({ task_id: created.task_id, status: 'awaiting_human' });
    assert.equal(task().attention.kind, 'user');
    runwayStore.updateTaskStatus({ task_id: created.task_id, status: 'completed' });
    assert.equal(task().execution.state, 'idle');
    assert.equal(task().lifecycle.business_state, 'unknown');
    setTaskVisibility(db, {
      confirmed: true, agent_id: row.identity.agent_id, project_id: row.identity.project_id,
      work_item_id: created.task_id, expected_generation: 0, visibility_state: 'archived',
    }, { dryRun: false, resolveTask: () => true });
    assert.equal(task().visibility.state, 'archived');
    assert.equal(read().work_item_projection_v2.summary.archived_work_item_count, 1);
  } finally {
    await sandbox.cleanup();
  }
});
