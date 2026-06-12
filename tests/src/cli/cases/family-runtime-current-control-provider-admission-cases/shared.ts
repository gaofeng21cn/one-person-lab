import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../../helpers.ts';
import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import type { FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertQueuedTask,
  insertSucceededTask,
} from '../family-runtime-provider-hosted-attempts-cases/mas-default-executor-helpers.ts';

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function jsString(value: string) {
  return JSON.stringify(value);
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function writeJsonEmitterScript(scriptPath: string, payload: unknown) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${jsString(`${JSON.stringify(payload, null, 2)}\n`)});`)}`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

export function providerObservationBoundary() {
  return {
    producer_kind: 'runtime_provider',
    intent_kind: 'provider_observation',
    stage_transition_authority: 'one-person-lab',
    intent_can_write_stage_current_pointer: false,
    intent_can_write_stage_run_terminal_state: false,
    intent_can_publish_current_owner_delta: false,
    intent_can_write_domain_truth: false,
    intent_can_create_owner_receipt: false,
    intent_can_create_typed_blocker: false,
    provider_completion_counts_as_stage_transition: false,
    read_model_update_counts_as_stage_transition: false,
    worklist_update_counts_as_stage_transition: false,
    evidence_event_counts_as_stage_transition: false,
    agent_lab_output_counts_as_stage_transition: false,
  };
}

export function currentControlActionQueueItem(input: {
  studyId: string;
  actionType: string;
  workUnitId: string;
  workUnitFingerprint: string;
  sourceFingerprint: string;
  truthEpoch: string;
  runtimeHealthEpoch: string;
  nextOwner?: string;
  dispatchable?: boolean | null;
}) {
  const nextOwner = input.nextOwner ?? 'ai_reviewer';
  return {
    action_fingerprint: input.workUnitFingerprint,
    action_type: input.actionType,
    controller_work_unit_id: input.workUnitId,
    executable_work_unit: input.workUnitId,
    source_fingerprint: input.sourceFingerprint,
    study_id: input.studyId,
    work_unit_fingerprint: input.workUnitFingerprint,
    required_output_surface: 'artifacts/publication_eval/ai_reviewer_responses/*_publication_eval_record.json',
    owner: nextOwner,
    handoff_packet: {
      action_fingerprint: input.workUnitFingerprint,
      action_type: input.actionType,
      idempotency_key: [
        'owner-route',
        input.studyId,
        input.truthEpoch,
        nextOwner,
        input.workUnitId,
        input.workUnitFingerprint,
      ].join('::'),
      next_executable_owner: nextOwner,
      owner: nextOwner,
      quest_id: input.studyId,
      study_id: input.studyId,
      owner_route: {
        currentness_contract: {
          basis: {
            runtime_health_epoch: input.runtimeHealthEpoch,
            truth_epoch: input.truthEpoch,
            work_unit_fingerprint: input.workUnitFingerprint,
            work_unit_id: input.workUnitId,
          },
          fail_closed_when_missing: true,
          missing_required_fields: [],
          status: 'currentness_basis_required',
        },
        currentness_digest_basis: {
          runtime_digest: `runtime:${input.runtimeHealthEpoch}`,
          stable_truth_digest: `truth:${input.truthEpoch}`,
          work_unit_digest: `work-unit:${input.workUnitFingerprint}`,
        },
        idempotency_key: `owner-route::${input.studyId}::${input.truthEpoch}::${nextOwner}::${input.workUnitId}`,
        next_owner: nextOwner,
        owner_route_attempt_protocol: {
          authority_boundary: {
            mas_owns: [
              'domain_truth',
              'ai_reviewer',
              'publication_gate',
              'artifact_authority',
              'owner_receipt',
              'typed_blocker',
            ],
            opl_owns: [
              'queue',
              'attempt',
              'retry',
              'dead_letter',
              'provider_liveness',
            ],
          },
          completion_boundary: {
            domain_ready_verdict: 'read_from_mas_publication_or_gate_surface',
            provider_completion: 'typed_closeout_packet_observed',
            provider_completion_is_domain_ready: false,
          },
          ...(input.dispatchable === null ? {} : { dispatchable: input.dispatchable ?? true }),
          runtime_completion_guard: {
            domain_completion_owner: 'med-autoscience',
            domain_completion_requires: [
              'mas_owner_receipt_ref',
              'mas_typed_blocker_ref',
              'ai_reviewer_or_publication_gate_ref',
            ],
            provider_completion_is_domain_completion: false,
            provider_completion_is_stage_state: false,
            queue_succeeded_is_domain_completion: false,
            retry_budget_is_domain_completion: false,
            running_worker_is_stage_state: false,
            stage_state_owner: 'one-person-lab',
          },
        },
        quest_id: input.studyId,
        route_epoch: input.truthEpoch,
        runtime_health_epoch: input.runtimeHealthEpoch,
        source_fingerprint: input.sourceFingerprint,
        study_id: input.studyId,
        truth_epoch: input.truthEpoch,
        work_unit_fingerprint: input.workUnitFingerprint,
      },
    },
  };
}

export function writeDefaultExecutorDispatchPacket(workspaceRoot: string, studyId: string, actionType: string) {
  const ref = [
    'studies',
    studyId,
    'artifacts',
    'supervision',
    'consumer',
    'default_executor_dispatches',
    `${actionType}.json`,
  ].join('/');
  const packetPath = path.join(workspaceRoot, ref);
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.writeFileSync(packetPath, JSON.stringify({
    surface_kind: 'mas_default_executor_dispatch_request',
    study_id: studyId,
    quest_id: studyId,
    action_type: actionType,
    profile: 'dm-cvd',
  }), 'utf8');
  return ref;
}

export function currentControlAdmissionPayload(
  sourceFingerprint: string,
  generation: string,
  workUnitFingerprint = `sha256:current-control-${generation}`,
) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'opl_current_control_state_handoff',
    next_executable_owner: 'ai_reviewer',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: workUnitFingerprint,
    action_fingerprint: workUnitFingerprint,
    provider_admission_schema_source: 'action_queue',
    provider_admission_identity: {
      status: 'provider_admission_pending',
      provider_admission_schema_source: 'action_queue',
      action_fingerprint: workUnitFingerprint,
    },
    owner_route_currentness_basis: {
      schema_version: 1,
      surface: 'opl_current_control_state_handoff',
      generated_at: `2026-06-08T15:${generation}:00+00:00`,
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      work_unit_fingerprint: workUnitFingerprint,
      truth_epoch: `truth-event-${generation}`,
      runtime_health_epoch: `runtime-health-event-${generation}`,
      currentness_digest_basis: {
        runtime_digest: `runtime-${generation}`,
        stable_truth_digest: `truth-${generation}`,
        work_unit_digest: `work-unit-${generation}`,
      },
    },
  };
}

export function insertCompletedCurrentControlStageAttempt(
  db: DatabaseSync,
  input: {
    taskId: string;
    stageAttemptId: string;
    payload: Record<string, unknown>;
  },
) {
  const createdAt = new Date().toISOString();
  const sourceFingerprint = typeof input.payload.source_fingerprint === 'string'
    ? input.payload.source_fingerprint
    : null;
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
      workspace_locator_json, source_fingerprint, executor_kind, status, checkpoint_refs_json,
      closeout_refs_json, human_gate_refs_json, retry_budget_json, attempt_count, task_id,
      blocked_reason, provider_receipt_json, provider_run_json, activity_events_json,
      route_impact_json, closeout_receipt_status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.stageAttemptId,
    `${input.stageAttemptId}:idempotency`,
    'temporal',
    `${input.stageAttemptId}:workflow`,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify({
      surface_kind: 'opl_provider_hosted_task_workspace_locator',
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      profile: input.payload.profile,
      study_id: input.payload.study_id,
      quest_id: input.payload.quest_id,
      action_type: input.payload.action_type,
      dispatch_authority: input.payload.dispatch_authority,
      dispatch_ref: input.payload.dispatch_ref,
      next_executable_owner: input.payload.next_executable_owner,
      workspace_root: input.payload.workspace_root,
      authority_boundary: input.payload.authority_boundary,
      owner_route_currentness_basis: input.payload.owner_route_currentness_basis,
      domain_source_fingerprint: input.payload.source_fingerprint,
      domain_truth_owner: 'med-autoscience',
      opl_writes_domain_truth: false,
      opl_writes_publication_quality: false,
      opl_writes_artifact_gate: false,
      opl_writes_current_package: false,
    }),
    sourceFingerprint,
    'codex_cli',
    'completed',
    '[]',
    '[]',
    '[]',
    '{"max_attempts":3}',
    1,
    input.taskId,
    null,
    '{}',
    '{"provider_status":"completed"}',
    '[]',
    '{}',
    'accepted_typed_closeout',
    createdAt,
    createdAt,
  );
}

export {
  assert,
  DatabaseSync,
  enqueueTask,
  ensureProviderHostedStageAttempt,
  fs,
  os,
  path,
  runCli,
  test,
};
export type { FamilyRuntimeTaskRow };
export { createQueueTables, insertQueuedTask, insertSucceededTask };
