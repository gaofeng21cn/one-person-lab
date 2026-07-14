import { DatabaseSync } from 'node:sqlite';

import { createStageAttemptTable } from '../../../../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import { assert, fs, os, path, runCli, test } from '../../helpers.ts';

function writeStageAttemptFixture(input: {
  stateDir: string;
  workspaceRoot: string;
  status: string;
}) {
  const queueDb = path.join(input.stateDir, 'family-runtime', 'queue.sqlite');
  fs.mkdirSync(path.dirname(queueDb), { recursive: true });
  const db = new DatabaseSync(queueDb);
  const now = '2026-07-10T00:00:00.000Z';
  try {
    createStageAttemptTable(db);
    db.prepare(`
      INSERT INTO stage_attempts(
        stage_attempt_id,
        idempotency_key,
        provider_kind,
        workflow_id,
        domain_id,
        stage_id,
        workspace_locator_json,
        source_fingerprint,
        executor_kind,
        stage_attempt_executor_policy_json,
        status,
        checkpoint_refs_json,
        closeout_refs_json,
        human_gate_refs_json,
        retry_budget_json,
        attempt_count,
        task_id,
        blocked_reason,
        provider_receipt_json,
        provider_run_json,
        activity_events_json,
        route_impact_json,
        closeout_receipt_status,
        created_at,
        updated_at
      ) VALUES (
        @stage_attempt_id,
        @idempotency_key,
        @provider_kind,
        @workflow_id,
        @domain_id,
        @stage_id,
        @workspace_locator_json,
        @source_fingerprint,
        @executor_kind,
        @stage_attempt_executor_policy_json,
        @status,
        @checkpoint_refs_json,
        @closeout_refs_json,
        @human_gate_refs_json,
        @retry_budget_json,
        @attempt_count,
        @task_id,
        @blocked_reason,
        @provider_receipt_json,
        @provider_run_json,
        @activity_events_json,
        @route_impact_json,
        @closeout_receipt_status,
        @created_at,
        @updated_at
      )
    `).run({
      stage_attempt_id: 'sat_redcube_deck_42',
      idempotency_key: 'redcube:deck-42:render',
      provider_kind: 'temporal',
      workflow_id: 'wf_redcube_deck_42',
      domain_id: 'redcube',
      stage_id: 'render',
      workspace_locator_json: JSON.stringify({
        surface_kind: 'opl_domain_route_workspace_locator',
        domain_id: 'redcube',
        work_unit_id: 'deck-42',
        workspace_root: input.workspaceRoot,
        command_cwd: input.workspaceRoot,
      }),
      source_fingerprint: 'sha256:redcube-deck-42',
      executor_kind: 'codex_cli',
      stage_attempt_executor_policy_json: null,
      status: input.status,
      checkpoint_refs_json: '[]',
      closeout_refs_json: '[]',
      human_gate_refs_json: '[]',
      retry_budget_json: '{}',
      attempt_count: 1,
      task_id: 'redcube-render-deck-42',
      blocked_reason: input.status === 'failed' ? 'renderer_dependency_missing' : null,
      provider_receipt_json: '{}',
      provider_run_json: JSON.stringify({
        provider_status: input.status,
        last_heartbeat_at: now,
      }),
      activity_events_json: '[]',
      route_impact_json: JSON.stringify({ decision: 'stop_with_typed_blocker' }),
      closeout_receipt_status: null,
      created_at: now,
      updated_at: now,
    });
  } finally {
    db.close();
  }
}

test('app state does not turn an unregistered failed attempt into a phantom work item', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-runtime-activity-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = path.join(homeRoot, 'redcube-workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });

  try {
    writeStageAttemptFixture({ stateDir, workspaceRoot, status: 'failed' });
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as any;

    const workbench = output.app_state.operator.workbench;
    const task = workbench.task_drilldowns.find((entry: any) =>
      entry.task_id === 'redcube:work-unit:deck-42'
    );
    assert.equal(task, undefined);
    assert.equal(workbench.work_item_projection_v2.items.length, 0);
    assert.equal(workbench.work_item_projection_v2.summary.system_attention_count, 0);
    assert.equal(workbench.work_item_projection_v2.diagnostics.count, 0);
    assert.equal(workbench.work_item_projection_v2.diagnostics.detail_policy, 'summary_only');
    assert.equal(workbench.work_item_projection_v2.detail_policy.inventory_detail, 'deferred');
    assert.equal(workbench.work_item_projection_v2.detail_policy.all_work_item_summaries_included, false);
    assert.equal(
      workbench.activity_center.needs_attention.some(
        (entry: any) => entry.task_id === 'redcube:work-unit:deck-42',
      ),
      false,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
