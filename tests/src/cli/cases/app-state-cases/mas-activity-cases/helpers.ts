import { DatabaseSync } from 'node:sqlite';

import { createStageAttemptTable } from '../../../../../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import { assert, fs, os, path, runCli, test } from '../../../helpers.ts';
import {
  assertCurrentOwnerDeltaReadModel,
  assertCurrentOwnerDeltaProjection,
} from '../../owner-payload-workorder-assertions.ts';
import {
  bindMasWorkspaceForAppState,
  writeCurrentOwnerDeltaProjectionCacheFixture,
  writeMasProgressPortalFixture,
} from '../fixtures.ts';

export function writeRunningStageAttemptFixture(input: {
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

export function writeWorkspaceStageAttemptCloseoutFixture(input: {
  workspaceRoot: string;
  studyId: string;
  stageAttemptId: string;
  stageId: string;
  generatedAt?: string;
}) {
  const closeoutPath = path.join(
    input.workspaceRoot,
    'ops',
    'medautoscience',
    'paper_mission_stage_attempts',
    input.stageAttemptId,
    'stage_attempt_closeout_packet.json',
  );
  fs.mkdirSync(path.dirname(closeoutPath), { recursive: true });
  fs.writeFileSync(
    closeoutPath,
    JSON.stringify(
      {
        surface_kind: 'stage_attempt_closeout_packet',
        schema_version: 1,
        status: 'route_back_evidence_candidate',
        stage_attempt_id: input.stageAttemptId,
        study_id: input.studyId,
        stage_id: input.stageId,
        generated_at: input.generatedAt ?? '2026-07-04T00:05:00.000Z',
        closeout_refs: [
          `ops/medautoscience/paper_mission_stage_attempts/${input.stageAttemptId}/stage_attempt_closeout_packet.json`,
        ],
        route_impact: {
          can_claim_paper_progress: false,
          can_claim_submission_ready: false,
          can_claim_publication_ready: false,
        },
      },
      null,
      2,
    ),
  );
}

export function writeMasReceiptOwnerConsumptionFixture(input: {
  workspaceRoot: string;
  studyId: string;
  stageAttemptId: string;
  status?: string;
  recordedAt?: string;
}) {
  const receiptPath = path.join(
    input.workspaceRoot,
    'ops',
    'medautoscience',
    'paper_mission_receipt_owner_consumption',
    input.studyId,
    'receipt_owner_consumption.json',
  );
  const closeoutRef = `ops/medautoscience/paper_mission_stage_attempts/${input.stageAttemptId}/stage_attempt_closeout_packet.json`;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        surface_kind: 'paper_mission_receipt_owner_consumption',
        schema_version: 1,
        status: 'owner_consumption_applied',
        study_id: input.studyId,
        receipt_evidence: {
          surface_kind: 'mas_receipt_evidence',
          receipt_ref: `opl://stage-attempts/${input.stageAttemptId}`,
          stage_attempt_ref: `opl://stage-attempts/${input.stageAttemptId}`,
          runtime_closeout_ref: closeoutRef,
        },
        mas_receipt_consumption: {
          surface_kind: 'mas_receipt_consumption_projection',
          status: input.status ?? 'owner_consumed_route_checkpoint',
          owner_result_kind: 'route_checkpoint',
          route_checkpoint_evidence_ref: closeoutRef,
        },
        stage_closure_decision: {
          surface_kind: 'mas_stage_closure_decision',
          recorded_at: input.recordedAt ?? '2026-07-04T00:06:00.000Z',
          opl_closeout: {
            status: 'opl_runtime_terminal_readback_observed',
            stage_attempt_id: input.stageAttemptId,
          },
        },
      },
      null,
      2,
    ),
  );
}

export function writeStudyRuntimeStatusSummaryFixture(input: {
  workspaceRoot: string;
  studyId: string;
  nextActionSummary: string;
  statusSummary?: string;
  generatedAt?: string;
}) {
  const summaryPath = path.join(
    input.workspaceRoot,
    'studies',
    input.studyId,
    'artifacts',
    'runtime',
    'runtime_status_summary.json',
  );
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        study_id: input.studyId,
        status_summary: input.statusSummary ?? 'runtime status summary fixture',
        next_action_summary: input.nextActionSummary,
        generated_at: input.generatedAt ?? '2026-07-04T00:07:00.000Z',
      },
      null,
      2,
    ),
  );
}

export function writeMasWorkspaceRegistryBindings(input: {
  stateDir: string;
  bindings: Array<{
    bindingId: string;
    workspacePath: string;
    workspaceRoot?: string;
    profilePath: string;
    status: 'active' | 'inactive';
    label?: string | null;
  }>;
}) {
  const now = new Date().toISOString();
  fs.mkdirSync(input.stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(input.stateDir, 'workspace-registry.json'),
    `${JSON.stringify({
      version: 'g2',
      bindings: input.bindings.map((binding) => ({
        binding_id: binding.bindingId,
        project_id: 'medautoscience',
        project: 'med-autoscience',
        workspace_path: binding.workspacePath,
        label: binding.label ?? null,
        status: binding.status,
        direct_entry: {
          command: null,
          manifest_command: null,
          url: null,
          workspace_locator: {
            surface_kind: 'med_autoscience_workspace_profile',
            workspace_root: binding.workspaceRoot ?? binding.workspacePath,
            profile_ref: binding.profilePath,
            input_path: null,
          },
        },
        created_at: now,
        updated_at: now,
        archived_at: null,
      })),
    }, null, 2)}\n`,
    'utf8',
  );
}


export { assert, fs, os, path, runCli, test, assertCurrentOwnerDeltaProjection, assertCurrentOwnerDeltaReadModel, bindMasWorkspaceForAppState, writeCurrentOwnerDeltaProjectionCacheFixture, writeMasProgressPortalFixture };
