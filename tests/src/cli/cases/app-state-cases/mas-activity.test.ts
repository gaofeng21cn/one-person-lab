import { DatabaseSync } from 'node:sqlite';

import { createStageAttemptTable } from '../../../../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import {
  assertCurrentOwnerDeltaReadModel,
  assertCurrentOwnerDeltaProjection,
} from '../owner-payload-workorder-assertions.ts';
import {
  bindMasWorkspaceForAppState,
  writeCurrentOwnerDeltaProjectionCacheFixture,
  writeMasProgressPortalFixture,
} from './fixtures.ts';

function writeRunningStageAttemptFixture(input: {
  stateDir: string;
  workspaceRoot: string;
  studyId: string;
  taskId: string;
  stageAttemptId: string;
  workflowId: string;
  stageId: string;
  status?: string;
  providerStatus?: string;
  updatedAt?: string;
}) {
  const queueDb = path.join(input.stateDir, 'family-runtime', 'queue.sqlite');
  fs.mkdirSync(path.dirname(queueDb), { recursive: true });
  const db = new DatabaseSync(queueDb);
  const now = input.updatedAt ?? '2026-07-04T00:00:00.000Z';
  const status = input.status ?? 'running';
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
      stage_attempt_id: input.stageAttemptId,
      idempotency_key: `${input.studyId}:app-state-running-attempt`,
      provider_kind: 'temporal',
      workflow_id: input.workflowId,
      domain_id: 'medautoscience',
      stage_id: input.stageId,
      workspace_locator_json: JSON.stringify({
        surface_kind: 'opl_mas_paper_mission_stage_route_workspace_locator',
        domain_id: 'medautoscience',
        study_id: input.studyId,
        workspace_root: input.workspaceRoot,
        command_cwd: input.workspaceRoot,
        command_kind: 'resume_stage',
        route_target: input.stageId,
      }),
      source_fingerprint: 'sha256:app-state-running-attempt',
      executor_kind: 'codex_cli',
      stage_attempt_executor_policy_json: null,
      status,
      checkpoint_refs_json: '[]',
      closeout_refs_json: '[]',
      human_gate_refs_json: '[]',
      retry_budget_json: '{}',
      attempt_count: 1,
      task_id: input.taskId,
      blocked_reason: null,
      provider_receipt_json: '{}',
      provider_run_json: JSON.stringify({
        provider_status: input.providerStatus ?? status,
        last_heartbeat_at: now,
      }),
      activity_events_json: '[]',
      route_impact_json: JSON.stringify({
        decision: 'start_next_stage',
        can_claim_paper_progress: false,
      }),
      closeout_receipt_status: null,
      created_at: now,
      updated_at: now,
    });
  } finally {
    db.close();
  }
}

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
      'medautoscience:study:003-dpcc-primary-care-phenotype-treatment-gap',
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
      output.app_state.operator.workbench.summary_cards.find((entry) => entry.card_id === 'active_projects')?.value,
      1,
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
    );
    assert.ok(runningTask);
    assert.equal(runningTask.stage.stage_id, 'live');
    assert.equal(runningTask.stage.current_ref.includes('task_drilldowns'), true);
    assert.equal(runningTask.progress.status, 'running');
    assert.equal(runningTask.next_owner.owner, 'medautoscience');
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
      attention_task_count: 1,
      recent_task_count: 1,
    });
    assert.equal(taskRunProjection.authority_boundary.can_write_domain_truth, false);
    assert.equal(taskRunProjection.authority_boundary.can_read_artifact_body, false);
    assert.equal(taskRunProjection.authority_boundary.can_read_memory_body, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_owner_receipt, false);
    assert.equal(taskRunProjection.authority_boundary.can_create_typed_blocker, false);
    assert.equal(taskRunProjection.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal('provider_completion_is_domain_ready' in taskRunProjection.authority_boundary, false);

    const runningProjection = taskRunProjection.tasks.find(
      (entry) => entry.task_identity.study_id === '002-dm-china-us-mortality-attribution',
    );
    assert.ok(runningProjection);
    assert.equal(runningProjection.task_identity.task_id, 'medautoscience:study:002-dm-china-us-mortality-attribution');
    assert.equal(runningProjection.status.state, 'running');
    assert.equal(runningProjection.status.active_run_ref?.endsWith('.active_run_id'), true);
    assert.equal(runningProjection.progress.progress_ref.endsWith('.progress'), true);
    assert.equal(runningProjection.progress.stage_ref.endsWith('.stage'), true);
    assert.deepEqual(
      runningProjection.conditions.map((condition) => condition.type),
      ['task_status', 'owner_route', 'evidence_refs'],
    );
    for (const condition of runningProjection.conditions) {
      assert.deepEqual(
        Object.keys(condition),
        ['type', 'status', 'reason', 'message', 'severity', 'owner', 'last_transition_time', 'ref'],
      );
      assert.equal(typeof condition.ref, 'string');
    }
    const attentionProjection = taskRunProjection.tasks.find(
      (entry) => entry.task_identity.study_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.ok(attentionProjection);
    assert.equal(
      attentionProjection.conditions.find((condition) => condition.type === 'task_status')?.reason,
      'attention_lane_selected',
    );
    assert.equal(
      attentionProjection.conditions.find((condition) => condition.type === 'owner_route')?.reason,
      'attention_lane_selected',
    );
    assert.equal(
      runningProjection.evidence_cards.every((card) =>
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
      runningProjection.action_cards.every((card) =>
        typeof card.ref === 'string'
          && typeof card.summary === 'string'
          && card.risk?.mutation_policy === 'no_writes_preview_only'
          && Array.isArray(card.write_targets)
          && card.write_targets.length === 0
          && card.expected_output?.content_policy === 'refs_only_no_action_receipt_body'
          && typeof card.rollback_ref === 'string'
          && typeof card.verify_ref === 'string'
          && card.open_action?.required_mode === 'dry_run'
          && !('body' in card)
          && !('receipt_body' in card)
          && !('verdict' in card)
          && !('quality_verdict' in card)
      ),
      true,
    );
    assert.equal(
      runningProjection.resource_cards.every((card) =>
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
      runningProjection.evidence_cards.map((card) => card.kind),
      ['source_refs', 'artifact_or_blocker_refs', 'review_receipt_refs'],
    );
    assert.deepEqual(
      runningProjection.resource_cards.map((card) => card.resource_kind),
      ['workspace', 'workflow'],
    );
    assert.equal(runningProjection.diagnostics_ref, 'app_state.provider.temporal');
    const projectionWithoutDiagnostics = JSON.stringify({
      ...runningProjection,
      diagnostics_ref: undefined,
    });
    assert.equal(projectionWithoutDiagnostics.includes('provider'), false);
    assert.equal(projectionWithoutDiagnostics.includes('Temporal'), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRepoRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

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
    assert.equal(dm003Task.active_stage_id, 'submission_milestone_candidate::followthrough::followthrough-02');
    assert.equal(dm003Task.active_run_id, 'wf_app_state_dm003_failed');
    assert.deepEqual(dm003Task.stage_attempt_ids, [stageAttemptId]);

    const taskRunProjection = workbench.task_run_projection_v2;
    assert.deepEqual(taskRunProjection.summary, {
      task_count: 3,
      running_task_count: 1,
      attention_task_count: 1,
      recent_task_count: 1,
    });
    const dm003Projection = taskRunProjection.tasks.find((entry: any) => entry.task_identity.study_id === studyId);
    assert.ok(dm003Projection);
    assert.equal(dm003Projection.status.state, 'attention_needed');
    assert.equal(dm003Projection.status.status, 'failed');
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
    assert.equal(dm003Task.active_stage_id, 'submission_milestone_candidate');
    assert.equal(dm003Task.active_run_id, 'wf_app_state_dm003_completed_latest');
    assert.deepEqual(dm003Task.stage_attempt_ids.slice(0, 2), [completedAttemptId, failedAttemptId]);
    assert.equal(dm003Task.stage_attempt_ids.length, 8);
    assert.equal(dm003Task.next_visible_step.includes('MAS paper-mission/study-progress'), true);

    const taskRunProjection = workbench.task_run_projection_v2;
    assert.deepEqual(taskRunProjection.summary, {
      task_count: 3,
      running_task_count: 1,
      attention_task_count: 0,
      recent_task_count: 2,
    });
    const dm003Projection = taskRunProjection.tasks.find((entry: any) => entry.task_identity.study_id === studyId);
    assert.ok(dm003Projection);
    assert.equal(dm003Projection.status.state, 'completed');
    assert.equal(dm003Projection.status.priority_bucket, 'recent');
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
      workbench.summary_cards.find((entry: { card_id: string }) => entry.card_id === 'active_projects')?.value,
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
    assert.equal(dm003Task.active_stage_id, 'submission_milestone_candidate');
    assert.equal(dm003Task.active_run_id, 'wf_app_state_dm003');
    assert.deepEqual(dm003Task.stage_attempt_ids, [stageAttemptId]);
    assert.equal(dm003Task.source_ref_count > 1, true);

    const taskRunProjection = workbench.task_run_projection_v2;
    assert.deepEqual(taskRunProjection.summary, {
      task_count: 3,
      running_task_count: 2,
      attention_task_count: 0,
      recent_task_count: 1,
    });
    const dm003Projection = taskRunProjection.tasks.find((entry: any) => entry.task_identity.study_id === studyId);
    assert.ok(dm003Projection);
    assert.equal(dm003Projection.task_id, `medautoscience:study:${studyId}`);
    assert.equal(dm003Projection.status.state, 'running');
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
