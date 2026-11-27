import path from 'node:path';
import { canonicalJsonText, sha256Hex, stableId, type SqliteDb } from '@opl/core';
import type { StageRunRow, TaskRow } from '@opl/runway';
import type { ProjectedPackageSummary } from './app-state-cache.ts';
import type { DomainInventoryTask, DomainTaskInventory } from './domain-task-inventory.ts';
import { defaultTaskVisibility, listTaskVisibility, taskVisibilityKey } from './task-visibility.ts';

type Task = Pick<TaskRow, 'task_id' | 'workspace_id' | 'agent_id' | 'title' | 'status' | 'updated_at'> & {
  root_path: string;
};
type Stage = Pick<StageRunRow, 'stage_run_id' | 'stage_id' | 'task_id' | 'status' | 'started_at' | 'updated_at'>;
type Attempt = { stage_run_id: string; attempt_id: string; status: string; usage_json: string; started_at: string; finished_at: string | null };
type BusinessState = DomainInventoryTask['business_state'];

function groupBy<T>(rows: readonly T[], key: keyof T) {
  const groups = new Map<T[keyof T], T[]>();
  for (const row of rows) {
    const existing = groups.get(row[key]);
    if (existing) existing.push(row);
    else groups.set(row[key], [row]);
  }
  return groups;
}

function tokens(attempts: readonly Attempt[]) {
  const missing = { state: 'missing', missing_reason: 'attempt_usage_unavailable' };
  if (!attempts.length) return missing;
  let input = 0;
  let output = 0;
  for (const attempt of attempts) {
    let usage;
    try { usage = JSON.parse(attempt.usage_json); } catch { return missing; }
    if (!Number.isSafeInteger(usage?.input_tokens) || usage.input_tokens < 0 ||
        !Number.isSafeInteger(usage?.output_tokens) || usage.output_tokens < 0) return missing;
    input += usage.input_tokens;
    output += usage.output_tokens;
  }
  return { state: 'observed', input_tokens: input, output_tokens: output, total_tokens: input + output,
    source: 'runway.attempts', observed_at: attempts.at(-1)?.finished_at ?? null };
}

const businessStates = {
  active: ['automatically_advancing', 'Automatically advancing'],
  delivered_paused: ['delivered_auto_paused', 'Delivered and auto-paused'],
  paused: ['paused', 'Paused'],
  stopped: ['stopped', 'Stopped'],
  archived: ['stopped', 'Stopped'],
  unknown: ['sync_pending', 'Sync pending'],
} as const;

// The domain owns its work inventory and lifecycle. Runway owns task/stage execution.
// Only join execution to a Runway task via its persisted task_id and stage_run_id.
export function buildRunwayWorkbench(
  db: SqliteDb,
  packages: readonly Pick<ProjectedPackageSummary, 'package_id' | 'name' | 'intent' | 'enabled'>[],
  generatedAt: string,
  inventory: DomainTaskInventory,
) {
  const tasks = db.prepare(`
    SELECT t.task_id, t.workspace_id, t.agent_id, t.title, t.status, t.updated_at, w.root_path
    FROM tasks t JOIN workspaces w ON w.workspace_id = t.workspace_id
    ORDER BY t.created_at DESC, t.rowid DESC`).all() as unknown as Task[];
  const stages = db.prepare(`
    SELECT task_id, stage_run_id, stage_id, status, started_at, updated_at
    FROM stage_runs ORDER BY task_id, seq_no`).all() as unknown as Stage[];
  const attempts = db.prepare(`
    SELECT stage_run_id, attempt_id, status, usage_json, started_at, finished_at
    FROM attempts ORDER BY started_at, attempt_no`).all() as unknown as Attempt[];
  const taskStages = groupBy(stages, 'task_id');
  const stageAttempts = groupBy(attempts, 'stage_run_id');
  const controls = listTaskVisibility(db);

  const agents = new Map(packages.filter((pkg) => pkg.intent === 'agent' && pkg.enabled)
    .map((pkg) => [pkg.package_id, pkg.name]));
  const projects = new Map<string, { project_id: string; agent_id: string; workspace_path: string; display_name: string }>();
  function projectItem(agentId: string, root: string, workId: string, title: string, task?: Task, domain?: DomainInventoryTask) {
    const projectId = stableId('project', [agentId, root]);
    const projectName = path.basename(root) || root;
    const itemId = projectId + ':' + encodeURIComponent(workId);
    const domainScope = domain && sha256Hex(canonicalJsonText({
      namespace: 'opl_work_item_scope', project_scope_id: projectId, domain_id: domain.domain_id,
      domain_work_item_id: domain.work_item_id,
    })).slice('sha256:'.length);
    const agentName = agents.get(agentId) ?? agentId;
    agents.set(agentId, agentName);
    projects.set(projectId, { project_id: projectId, agent_id: agentId, workspace_path: root, display_name: projectName });
    const visibility = controls.get(taskVisibilityKey(agentId, projectId, workId)) ?? defaultTaskVisibility();
    const rows = task ? taskStages.get(task.task_id) ?? [] : [];
    const currentIndex = rows.findIndex((row) => row.status !== 'completed');
    const current = rows[currentIndex];
    const currentAttempts = current ? stageAttempts.get(current.stage_run_id) ?? [] : [];
    const currentAttempt = currentAttempts.at(-1);
    const stageMap = rows.map((row) => ({
      stage_id: row.stage_id, display_name: row.stage_id, state: row.status,
      usage: tokens(stageAttempts.get(row.stage_run_id) ?? []),
    }));
    const cumulative = tokens(rows.flatMap((row) => stageAttempts.get(row.stage_run_id) ?? []));
    const currentStage = tokens(currentAttempts);
    const decision = task?.status === 'awaiting_human';
    const stopped = task?.status === 'cancelled';
    const paused = task?.status === 'paused_by_human';
    const businessState: BusinessState = domain?.business_state ?? (paused ? 'paused' : stopped ? 'stopped' : 'unknown');
    const [state, label] = decision ? ['awaiting_user_decision', 'Waiting for your decision'] : businessStates[businessState];
    const execState = !task ? 'unknown' : task.status === 'failed' ? 'failed'
      : task.status !== 'active' ? 'idle'
      : current?.status === 'running' ? 'running' : current?.status === 'queued' ? 'queued' : 'idle';
    const updatedAt = domain?.observed_at ?? task?.updated_at ?? generatedAt;
    const stageId = domain?.current_stage_id ?? current?.stage_id ?? null;
    const nextStageId = current ? rows[currentIndex + 1]?.stage_id ?? null : null;
    const lifecycleKey = businessState === 'delivered_paused' ? 'deliveredPaused' : businessState === 'unknown' ? 'syncPending' : businessState;
    const reason = domain?.business_status ?? task?.status ?? 'unknown';
    return {
      item_id: itemId,
      identity: {
        agent_id: agentId, agent_display_name: agentName, project_id: projectId, workspace_path: root,
        project_display_name: projectName, work_item_id: workId, work_item_display_name: title,
        work_item_kind: domain ? 'domain_work_item' : 'runway_task',
        ...(domain && { identity_state: 'resolved', work_item_scope_id: 'work-item:' + domainScope,
          domain_id: domain.domain_id, domain_work_item_id: domain.work_item_id, work_item_root: domain.work_item_root }),
      },
      lifecycle: { business_state: businessState, primary_state: state, primary_state_label: label,
        reason, last_transition_at: updatedAt, current_stage_id: stageId, current_stage_display_name: stageId },
      execution: { state: execState, current_stage_id: current?.stage_id ?? null,
        current_stage_display_name: current?.stage_id ?? null,
        next_stage_id: nextStageId, next_stage_display_name: nextStageId,
        started_at: current?.started_at ?? null, last_heartbeat_at: null,
        attempt_id: currentAttempt?.attempt_id ?? null, updated_at: current?.updated_at ?? null },
      attention: { kind: decision ? 'user' : 'none', reason, owner: decision ? 'user' : null,
        summary: null, owner_display_name: null, responsibility: null },
      action: { kind: decision ? 'user_action' : 'blocked_no_action', title: null, summary: null,
        title_key: decision ? null : 'lifecycle.' + lifecycleKey + '.title',
        summary_key: decision ? null : 'lifecycle.' + lifecycleKey + '.summary',
        message_args: {}, owner: decision ? 'user' : agentId, owner_kind: decision ? 'user' : 'agent',
        action_ref: null, dry_run_required: false },
      telemetry: { state: cumulative.state, current_stage: currentStage, cumulative },
      conditions: [], freshness: { state: 'fresh', observed_at: generatedAt, last_progress_at: updatedAt, reason: domain ? 'registered_inventory' : 'runway_store' },
      visibility, stage_map: stageMap,
      ...(domain?.domain_detail_views && {
        domain_detail_views: domain.domain_detail_views.map((view) => ({ ...view, item_id: itemId })),
      }),
    };
  }
  const items = inventory.items.map((row) => projectItem(row.package_id, row.workspace_path, row.work_item_id, row.title, undefined, row));
  const domainIds = new Set(items.map((item) =>
    taskVisibilityKey(item.identity.agent_id, item.identity.workspace_path, item.identity.work_item_id)));
  for (const task of tasks) {
    if (task.agent_id && !domainIds.has(taskVisibilityKey(task.agent_id, task.root_path, task.task_id))) {
      items.push(projectItem(task.agent_id, task.root_path, task.task_id, task.title, task));
    }
  }

  return {
    task_drilldowns: tasks.map((task) => ({
      task_id: task.task_id, title: task.title, status: task.status, workspace_path: task.root_path,
      workspace_label: path.basename(task.root_path), domain_label: task.agent_id && agents.get(task.agent_id),
    })),
    work_item_projection_v2: {
      surface_kind: 'opl_work_item_projection', schema_version: 'work-item-projection.v2', generated_at: generatedAt,
      agent_catalog: Array.from(agents, ([agent_id, display_name]) => ({ agent_id, display_name })),
      project_catalog: [...projects.values()], items, diagnostics: inventory.diagnostics,
      summary: {
        agent_count: agents.size, project_count: projects.size, work_item_count: items.length,
        archived_work_item_count: items.filter((i) => i.visibility.state === 'archived').length,
        running_count: items.filter((i) => i.execution.state === 'running').length,
        user_attention_count: items.filter((i) => i.attention.kind === 'user').length,
        telemetry_observed_count: items.filter((i) => i.telemetry.state === 'observed').length,
        telemetry_missing_count: items.filter((i) => i.telemetry.state === 'missing').length,
      },
    },
  };
}
