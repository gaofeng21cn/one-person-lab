import { nowIso, runMigrations, txImmediate, type SqliteDb } from '@opl/core';
import { DaemonRpcError } from '../errors.ts';

type VisibilityState = 'visible' | 'archived';
export interface TaskVisibility {
  state: VisibilityState;
  source: 'default' | 'work_item_control_ledger';
  generation: number;
  updated_at: string | null;
  control_ref: string | null;
}

interface VisibilityRow {
  agent_id: string;
  project_id: string;
  work_item_id: string;
  state: VisibilityState;
  generation: number;
  updated_at: string;
}

export function ensureTaskVisibilitySchema(db: SqliteDb): void {
  runMigrations(db, [{
    version: 5001,
    name: 'task_visibility_transitions',
    sql: `
      CREATE TABLE task_visibility_transitions (
        agent_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('visible', 'archived')),
        generation INTEGER NOT NULL CHECK (generation > 0),
        updated_at TEXT NOT NULL,
        reason TEXT,
        PRIMARY KEY (agent_id, project_id, work_item_id, generation)
      ) WITHOUT ROWID
    `,
  }]);
}

export function taskVisibilityKey(agentId: string, projectId: string, workItemId: string): string {
  return JSON.stringify([agentId, projectId, workItemId]);
}

export function defaultTaskVisibility(): TaskVisibility {
  return { state: 'visible', source: 'default', generation: 0, updated_at: null, control_ref: null };
}

function toVisibility(row: VisibilityRow): TaskVisibility {
  const scope = [row.agent_id, row.project_id, row.work_item_id].map(encodeURIComponent).join('/');
  return {
    state: row.state,
    source: 'work_item_control_ledger',
    generation: row.generation,
    updated_at: row.updated_at,
    control_ref: `opl://work-item-control/${scope}`,
  };
}

export function listTaskVisibility(db: SqliteDb): Map<string, TaskVisibility> {
  const rows = db.prepare(`
    SELECT v.* FROM task_visibility_transitions AS v
    JOIN (
      SELECT agent_id, project_id, work_item_id, MAX(generation) AS generation
      FROM task_visibility_transitions GROUP BY agent_id, project_id, work_item_id
    ) AS latest USING (agent_id, project_id, work_item_id, generation)
  `).all() as unknown as VisibilityRow[];
  return new Map(rows.map((row) => [
    taskVisibilityKey(row.agent_id, row.project_id, row.work_item_id),
    toVisibility(row),
  ]));
}

export function setTaskVisibility(
  db: SqliteDb,
  payload: Record<string, unknown>,
  options: {
    dryRun: boolean;
    resolveTask: (agentId: string, projectId: string, workItemId: string) => boolean;
  },
) {
  const { agent_id, project_id, work_item_id, visibility_state, expected_generation, reason } = payload;
  if (typeof agent_id !== 'string' || !agent_id || typeof project_id !== 'string' || !project_id
    || typeof work_item_id !== 'string' || !work_item_id
    || (visibility_state !== 'archived' && visibility_state !== 'visible')
    || (reason !== undefined && typeof reason !== 'string')) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A task identity and a valid visibility state are required.');
  }
  if (!options.dryRun && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm the change to task visibility.');
  }

  return txImmediate(db, () => {
    if (!options.resolveTask(agent_id, project_id, work_item_id)) {
      throw new DaemonRpcError(-32004, 'TASK_NOT_FOUND', 'The requested task is absent from this Agent and project.');
    }
    const row = db.prepare(`
      SELECT * FROM task_visibility_transitions WHERE agent_id = ? AND project_id = ? AND work_item_id = ?
      ORDER BY generation DESC LIMIT 1
    `).get(agent_id, project_id, work_item_id) as unknown as VisibilityRow | undefined;
    const previous = row ? toVisibility(row) : defaultTaskVisibility();
    if ((!options.dryRun || expected_generation !== undefined) && expected_generation !== previous.generation) {
      throw new DaemonRpcError(-32009, 'work_item_control_generation_conflict', 'Refresh the task before changing its visibility.', {
        current_generation: previous.generation,
      });
    }

    const receipt = {
      ok: true, action_id: 'work_item_visibility_set', dry_run: options.dryRun,
      agent_id, project_id, work_item_id, requested_state: visibility_state,
    };
    if (options.dryRun || previous.state === visibility_state) {
      return { ...receipt, status: options.dryRun ? 'preview' : 'no_op', visibility: previous };
    }
    const generation = previous.generation + 1;
    const updated_at = nowIso();
    db.prepare(`
      INSERT INTO task_visibility_transitions (agent_id, project_id, work_item_id, state, generation, updated_at, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(agent_id, project_id, work_item_id, visibility_state, generation, updated_at, reason ?? null);
    return {
      ...receipt, status: 'executed',
      visibility: toVisibility({ agent_id, project_id, work_item_id, state: visibility_state, generation, updated_at }),
    };
  });
}
