import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, parseJsonText as parseJsonPayloadText, path, runCli, shellSingleQuote, test } from '../../helpers.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';
import {
  createFamilyRuntimeQueueTables,
  type FamilyRuntimeTaskRow,
} from '../../../../../src/modules/runway/family-runtime-store.ts';

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

export function parseJsonText(raw: string): any {
  return parseJsonPayloadText(raw) as any;
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

export function createQueueTables(db: DatabaseSync) {
  createFamilyRuntimeQueueTables(db);
}

export function insertSucceededTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    domainId: string;
    taskKind: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
  },
) {
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    input.domainId,
    input.taskKind,
    JSON.stringify(input.payload),
    input.dedupeKey,
    0,
    'succeeded',
    0,
    3,
    'test',
    0,
    null,
    null,
    null,
    null,
    null,
    createdAt,
    createdAt,
  );
}

export function insertQueuedTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    domainId: string;
    taskKind: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
    status?: 'queued' | 'waiting_approval';
    requiresApproval?: boolean;
    lastError?: string | null;
  },
) {
  const status = input.status ?? 'queued';
  const requiresApproval = input.requiresApproval ?? status === 'waiting_approval';
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    input.domainId,
    input.taskKind,
    JSON.stringify(input.payload),
    input.dedupeKey,
    0,
    status,
    0,
    3,
    'test',
    requiresApproval ? 1 : 0,
    null,
    null,
    null,
    input.lastError ?? null,
    null,
    createdAt,
    createdAt,
  );
}

function defaultExecutorPayload(sourceFingerprint: string) {
  return {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'run_quality_repair_batch',
    dispatch_authority: 'quality_repair_batch_writer_handoff',
    next_executable_owner: 'write',
    executor_kind: 'codex_cli_default',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    authority_boundary: 'default_executor_dispatch_request_only',
    workspace_root: '/tmp/explicit-workspace-root',
    source_fingerprint: sourceFingerprint,
  };
}

export function currentControlCommandOutboxRecord(input: {
  studyId: string;
  actionType: string;
  workUnitId: string;
  workUnitFingerprint: string;
  sourceGeneration?: string;
  expectedVersion?: string;
  idempotencyKey?: string;
  commandId?: string;
}) {
  const sourceGeneration = input.sourceGeneration ?? `generation:${input.workUnitFingerprint}`;
  const idempotencyKey = input.idempotencyKey ?? [
    'mas-current-control-command',
    input.studyId,
    input.actionType,
    input.workUnitId,
    input.workUnitFingerprint,
  ].join('::');
  return {
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'stage_run_transport',
    command_kind: 'provider_attempt_requested',
    command_id: input.commandId ?? [
      'stage-run-transport',
      input.studyId,
      input.actionType,
      input.workUnitId,
      input.workUnitFingerprint,
      idempotencyKey,
      sourceGeneration,
    ].join(':'),
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: `${input.studyId}::${input.workUnitId}`,
      study_id: input.studyId,
      work_unit_id: input.workUnitId,
    },
    action_type: input.actionType,
    work_unit_fingerprint: input.workUnitFingerprint,
    idempotency_key: idempotencyKey,
    source_generation: sourceGeneration,
    expected_version: input.expectedVersion ?? sourceGeneration,
    postcondition: {
      kind: 'provider_attempt_projected_or_blocked',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    outcome: {
      kind: 'provider_attempt_requested',
      non_advancing_apply: false,
      provider_completion_is_domain_completion: false,
    },
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
  recoveryObligationId?: string;
  dispatchRef?: string;
  dispatchPath?: string;
  stagePacketRef?: string;
  stagePacketRefs?: string[];
  checkpointRefs?: string[];
  routeIdentityKey?: string;
  attemptIdempotencyKey?: string;
}) {
  const nextOwner = input.nextOwner ?? 'ai_reviewer';
  const routeIdentityKey = input.routeIdentityKey ?? [
    'owner-route',
    input.studyId,
    input.actionType,
    input.workUnitId,
    input.workUnitFingerprint,
  ].join('::');
  const attemptIdempotencyKey = input.attemptIdempotencyKey ?? [
    'owner-route-attempt',
    input.studyId,
    input.truthEpoch,
    nextOwner,
    input.workUnitId,
    input.workUnitFingerprint,
  ].join('::');
  return {
    action_fingerprint: input.workUnitFingerprint,
    action_type: input.actionType,
    controller_work_unit_id: input.workUnitId,
    executable_work_unit: input.workUnitId,
    source_fingerprint: input.sourceFingerprint,
    study_id: input.studyId,
    work_unit_fingerprint: input.workUnitFingerprint,
    ...(input.recoveryObligationId ? { recovery_obligation_id: input.recoveryObligationId } : {}),
    required_output_surface: 'artifacts/publication_eval/ai_reviewer_responses/*_publication_eval_record.json',
    owner: nextOwner,
    ...(input.dispatchRef ? { dispatch_ref: input.dispatchRef } : {}),
    ...(input.dispatchPath ? { dispatch_path: input.dispatchPath } : {}),
    ...(input.stagePacketRef ? { stage_packet_ref: input.stagePacketRef } : {}),
    ...(input.stagePacketRefs ? { stage_packet_refs: input.stagePacketRefs } : {}),
    ...(input.checkpointRefs ? { checkpoint_refs: input.checkpointRefs } : {}),
    route_identity_key: routeIdentityKey,
    attempt_idempotency_key: attemptIdempotencyKey,
    handoff_packet: {
      action_fingerprint: input.workUnitFingerprint,
      action_type: input.actionType,
      idempotency_key: attemptIdempotencyKey,
      route_identity_key: routeIdentityKey,
      attempt_idempotency_key: attemptIdempotencyKey,
      next_executable_owner: nextOwner,
      owner: nextOwner,
      quest_id: input.studyId,
      study_id: input.studyId,
      ...(input.dispatchRef ? { dispatch_ref: input.dispatchRef } : {}),
      ...(input.dispatchPath ? { dispatch_path: input.dispatchPath } : {}),
      ...(input.stagePacketRef ? { stage_packet_ref: input.stagePacketRef } : {}),
      ...(input.stagePacketRefs ? { stage_packet_refs: input.stagePacketRefs } : {}),
      ...(input.checkpointRefs ? { checkpoint_refs: input.checkpointRefs } : {}),
      ...(input.recoveryObligationId ? { recovery_obligation_id: input.recoveryObligationId } : {}),
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
        idempotency_key: attemptIdempotencyKey,
        route_identity_key: routeIdentityKey,
        attempt_idempotency_key: attemptIdempotencyKey,
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
        ...(input.recoveryObligationId ? { recovery_obligation_id: input.recoveryObligationId } : {}),
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
    surface_kind: 'default_executor_dispatch_request',
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
  const routeIdentityKey = `mas-route::${generation}::return_to_ai_reviewer_workflow::${workUnitFingerprint}`;
  const attemptIdempotencyKey = `mas-attempt::${generation}::return_to_ai_reviewer_workflow::${workUnitFingerprint}`;
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'opl_current_control_state_handoff',
    next_executable_owner: 'ai_reviewer',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: workUnitFingerprint,
    action_fingerprint: workUnitFingerprint,
    route_identity_key: routeIdentityKey,
    attempt_idempotency_key: attemptIdempotencyKey,
    stage_packet_ref: `studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-${generation}.json`,
    stage_packet_refs: [
      `studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-${generation}.json`,
    ],
    provider_attempt_schema_source: 'action_queue',
    provider_attempt_identity: {
      status: 'provider_attempt_pending',
      provider_attempt_schema_source: 'action_queue',
      action_fingerprint: workUnitFingerprint,
      route_identity_key: routeIdentityKey,
      attempt_idempotency_key: attemptIdempotencyKey,
    },
    current_control_command_outbox_record: currentControlCommandOutboxRecord({
      studyId: '002-dm-china-us-mortality-attribution',
      actionType: 'return_to_ai_reviewer_workflow',
      workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      workUnitFingerprint,
      sourceGeneration: `truth-event-${generation}`,
      idempotencyKey: attemptIdempotencyKey,
    }),
    owner_route_currentness_basis: {
      schema_version: 1,
      surface: 'opl_current_control_state_handoff',
      generated_at: `2026-06-08T15:${generation}:00+00:00`,
      observed_generation: generation,
      derived_generation: `truth-event-${generation}`,
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
    closeoutRefs?: string[];
  },
) {
  const createdAt = new Date().toISOString();
  const sourceFingerprint = typeof input.payload.source_fingerprint === 'string'
    ? input.payload.source_fingerprint
    : null;
  const closeoutRefs = input.closeoutRefs ?? [];
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
      recovery_obligation_id: input.payload.recovery_obligation_id,
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
    JSON.stringify(closeoutRefs),
    '[]',
    '{"max_attempts":3}',
    1,
    input.taskId,
    null,
    JSON.stringify({ closeout_refs: closeoutRefs }),
    JSON.stringify({ provider_status: 'completed' }),
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
  ensureProviderHostedStageAttempt,
  fs,
  os,
  path,
  runCli,
  test,
};
export type { FamilyRuntimeTaskRow };
