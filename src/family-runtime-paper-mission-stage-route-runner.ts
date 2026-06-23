import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import {
  createStageAttempt,
  inspectStageAttempt,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  stableId,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;
type StageAttemptPayload = ReturnType<typeof inspectStageAttempt>;
type TemporalProviderModule = () => Promise<{
  startTemporalStageAttemptWorkflow: (
    attempt: StageAttemptPayload,
    options: { paths: FamilyRuntimePaths },
  ) => Promise<Record<string, unknown>>;
}>;

const PAPER_MISSION_STAGE_ROUTE_TASK_KIND = 'paper_mission/stage-route';
const PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND = 'mas_paper_mission_stage_route';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function authorityBoundary(payload: Record<string, unknown>) {
  return isRecord(payload.authority_boundary) ? payload.authority_boundary : {};
}

function booleanTrue(value: unknown) {
  return value === true;
}

function routeStageId(payload: Record<string, unknown>) {
  return optionalString(payload.route_target)
    ?? optionalString(payload.command_kind)
    ?? PAPER_MISSION_STAGE_ROUTE_TASK_KIND;
}

function sourceFingerprintFor(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  return stableId('mas_paper_mission_route_source', [
    row.domain_id,
    row.task_kind,
    optionalString(payload.study_id),
    optionalString(payload.mission_id),
    optionalString(payload.paper_mission_transaction_ref),
    optionalString(payload.opl_route_command_ref),
    optionalString(payload.command_kind),
    optionalString(payload.route_target),
    row.dedupe_key,
  ]);
}

function workspaceLocatorFor(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  const exportContext = isRecord(payload.opl_domain_export_context)
    ? payload.opl_domain_export_context
    : {};
  const workspaceRoot = optionalString(payload.workspace_root)
    ?? optionalString(payload.domain_workspace_root)
    ?? optionalString(payload.repo_root)
    ?? optionalString(exportContext.command_cwd)
    ?? optionalString(payload.command_cwd);
  const commandCwd = optionalString(payload.command_cwd)
    ?? optionalString(exportContext.command_cwd);
  const commandSource = optionalString(exportContext.command_source)
    ?? optionalString(payload.command_source);
  return {
    surface_kind: 'opl_mas_paper_mission_stage_route_workspace_locator',
    domain_id: row.domain_id,
    task_kind: row.task_kind,
    runtime_request_kind: optionalString(payload.runtime_request_kind)
      ?? PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND,
    study_id: optionalString(payload.study_id),
    mission_id: optionalString(payload.mission_id),
    candidate_ref: optionalString(payload.candidate_ref),
    paper_mission_transaction_ref: optionalString(payload.paper_mission_transaction_ref),
    opl_route_command_ref: optionalString(payload.opl_route_command_ref),
    command_kind: optionalString(payload.command_kind),
    route_target: optionalString(payload.route_target),
    ...(workspaceRoot ? { workspace_root: workspaceRoot } : {}),
    ...(commandCwd ? { command_cwd: commandCwd } : {}),
    ...(commandSource ? { command_source: commandSource } : {}),
    ...(isRecord(payload.opl_domain_export_context)
      ? { opl_domain_export_context: payload.opl_domain_export_context }
      : {}),
    domain_truth_owner: 'med-autoscience',
    runtime_owner: 'one-person-lab',
    opl_writes_domain_truth: false,
    opl_writes_publication_quality: false,
    opl_writes_artifact_gate: false,
    opl_writes_current_package: false,
    can_claim_provider_running: false,
    can_claim_paper_progress: false,
  };
}

function routeStageRunRequest(input: {
  status: 'running' | 'blocked';
  temporalStart: Record<string, unknown> | null;
  stageAttemptId: string;
}) {
  if (input.status === 'blocked') {
    return {
      request_status: 'provider_start_blocked',
      stage_attempt_id: input.stageAttemptId,
      stage_run_created: true,
      provider_attempt_requested: false,
      provider_running: false,
    };
  }
  return {
    request_status: input.temporalStart
      ? 'provider_started'
      : 'admitted_to_stage_attempt_ledger',
    stage_attempt_id: input.stageAttemptId,
    stage_run_created: true,
    provider_attempt_requested: Boolean(input.temporalStart),
    provider_running: Boolean(input.temporalStart),
  };
}

function forbiddenWriteReason(payload: Record<string, unknown>) {
  const authority = authorityBoundary(payload);
  const forbiddenFlags = [
    'writes_owner_receipt',
    'writes_typed_blocker',
    'writes_human_gate',
    'writes_current_package',
    'writes_paper_body',
    'can_write_owner_receipt',
    'can_write_typed_blocker',
    'can_write_human_gate',
    'can_write_current_package',
    'can_write_paper_body',
  ];
  for (const flag of forbiddenFlags) {
    if (booleanTrue(payload[flag]) || booleanTrue(authority[flag])) {
      return `paper_mission_route_forbidden_authority_flag:${flag}`;
    }
  }
  return null;
}

export function isPaperMissionStageRouteTask(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  return row.domain_id === 'medautoscience'
    && row.task_kind === PAPER_MISSION_STAGE_ROUTE_TASK_KIND
    && payload.surface_kind === 'opl_mas_paper_mission_route_runtime_request'
    && (
      payload.runtime_request_kind === PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND
      || payload.runtime_request_kind === undefined
    );
}

export async function dispatchPaperMissionStageRouteTask(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  options: {
    temporalProviderModule: TemporalProviderModule;
  },
) {
  const startedAt = nowIso();
  const blockedReason = forbiddenWriteReason(payload);
  if (blockedReason) {
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ?
    `).run(blockedReason, blockedReason, startedAt, row.task_id);
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'paper_mission_stage_route_blocked_forbidden_authority',
      source: 'opl-family-runtime',
      payload: {
        reason: blockedReason,
        authority_boundary: {
          opl: 'stage_route_runtime_request_validation_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          paper_body_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
        },
      },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'error',
      title: 'MAS PaperMission stage route blocked',
      body: blockedReason,
      payload: { reason: blockedReason },
    });
    return {
      task_id: row.task_id,
      status: 'blocked',
      reason: blockedReason,
      stage_attempts: [],
      authority_boundary: {
        can_claim_stage_run_created: false,
        can_claim_provider_running: false,
        can_claim_paper_progress: false,
      },
    };
  }

  const sourceFingerprint = sourceFingerprintFor(row, payload);
  const stageId = routeStageId(payload);
  const providerKind = resolveFamilyRuntimeProviderKind();
  const stageAttempt = createStageAttempt(db, {
    domainId: row.domain_id,
    stageId,
    providerKind,
    workspaceLocator: workspaceLocatorFor(row, payload),
    sourceFingerprint,
    executorKind: 'codex_cli',
    taskId: row.task_id,
    checkpointRefs: [
      optionalString(payload.paper_mission_transaction_ref),
      optionalString(payload.opl_route_command_ref),
      optionalString(payload.candidate_ref),
    ].filter((entry): entry is string => Boolean(entry)),
  });
  const admittedAttempt = stageAttempt.attempt;
  let projectedAttempt = admittedAttempt;
  let temporalStart: Record<string, unknown> | null = null;
  let status: 'running' | 'blocked' = 'running';
  let reason = providerKind === 'temporal'
    ? 'paper_mission_stage_route_temporal_start_pending'
    : 'paper_mission_stage_route_admitted_stage_run_start_pending';
  let blockerReason: string | null = providerKind === 'temporal'
    ? null
    : 'provider_start_pending';
  if (providerKind === 'temporal') {
    try {
      const { startTemporalStageAttemptWorkflow } = await options.temporalProviderModule();
      temporalStart = await startTemporalStageAttemptWorkflow(admittedAttempt, { paths });
      const started = updateStageAttemptsForTask(db, {
        taskId: row.task_id,
        stageAttemptIds: [admittedAttempt.stage_attempt_id],
        status: 'running',
        incrementAttempt: true,
        activityEvent: {
          activity_kind: 'temporal_stage_attempt_start',
          activity_status: 'started',
          temporal_start: temporalStart,
          authority_boundary: {
            opl: 'provider_transport_start_only',
            domain: 'truth_quality_artifact_gate_owner',
            provider_completion_is_domain_ready: false,
          },
        },
      });
      projectedAttempt = started[0] ?? inspectStageAttempt(db, admittedAttempt.stage_attempt_id);
      reason = 'paper_mission_stage_route_temporal_started';
    } catch (error) {
      const errorMessage = error instanceof FrameworkContractError || error instanceof Error
        ? error.message
        : 'Unexpected provider start failure.';
      const blocked = updateStageAttemptsForTask(db, {
        taskId: row.task_id,
        stageAttemptIds: [admittedAttempt.stage_attempt_id],
        status: 'blocked',
        blockedReason: errorMessage,
        activityEvent: {
          activity_kind: 'temporal_stage_attempt_start',
          activity_status: 'blocked',
          reason: 'temporal_stage_attempt_start_failed',
          error: errorMessage,
          authority_boundary: {
            opl: 'provider_transport_start_only',
            domain: 'truth_quality_artifact_gate_owner',
            provider_completion_is_domain_ready: false,
          },
        },
      });
      projectedAttempt = blocked[0] ?? inspectStageAttempt(db, admittedAttempt.stage_attempt_id);
      status = 'blocked';
      reason = 'paper_mission_stage_route_temporal_start_failed';
      blockerReason = errorMessage;
    }
  }
  const updatedAt = nowIso();
  const stageRunRequest = routeStageRunRequest({
    status,
    temporalStart,
    stageAttemptId: projectedAttempt.stage_attempt_id,
  });
  db.prepare(`
    UPDATE tasks
    SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(status, reason, status === 'blocked' ? reason : null, updatedAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: status === 'blocked'
      ? 'paper_mission_stage_route_temporal_start_blocked'
      : temporalStart
        ? 'paper_mission_stage_route_temporal_started'
        : stageAttempt.idempotent_noop
          ? 'paper_mission_stage_route_stage_attempt_idempotent_noop'
          : 'paper_mission_stage_route_stage_attempt_admitted',
    source: 'opl-family-runtime',
    payload: {
      reason,
      blocker_reason: blockerReason,
      stage_attempt_id: projectedAttempt.stage_attempt_id,
      stage_id: projectedAttempt.stage_id,
      provider_kind: projectedAttempt.provider_kind,
      source_fingerprint: sourceFingerprint,
      created: stageAttempt.created,
      idempotent_noop: stageAttempt.idempotent_noop,
      temporal_start: temporalStart,
      next_state: status === 'blocked'
        ? 'blocked_provider_start'
        : temporalStart
          ? 'running_provider_started'
          : 'running_provider_start_pending',
      stage_run_request: {
        ...stageRunRequest,
      },
      authority_boundary: {
        opl: 'stage_attempt_admission_and_start_request_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        paper_body_mutation: false,
        owner_receipt_mutation: false,
        typed_blocker_mutation: false,
        human_gate_mutation: false,
        provider_stage_attempt_started: Boolean(temporalStart),
        provider_completion_is_domain_ready: false,
        can_claim_provider_running: Boolean(temporalStart),
        can_claim_paper_progress: false,
      },
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: status === 'blocked' ? 'error' : temporalStart ? 'info' : 'warning',
    title: status === 'blocked'
      ? 'MAS PaperMission stage route provider start blocked'
      : temporalStart
        ? 'MAS PaperMission stage route started'
        : 'MAS PaperMission stage route admitted',
    body: `${row.domain_id}:${row.task_kind} ${projectedAttempt.stage_id}`,
    payload: {
      reason,
      blocker_reason: blockerReason,
      stage_attempt_id: projectedAttempt.stage_attempt_id,
      can_claim_provider_running: Boolean(temporalStart),
      can_claim_paper_progress: false,
    },
  });
  return {
    task_id: row.task_id,
    status,
    reason,
    blocker_reason: blockerReason,
    temporal_start: temporalStart,
    stage_run_request: stageRunRequest,
    stage_attempts: [projectedAttempt],
    authority_boundary: {
      writes_owner_receipt: false,
      writes_typed_blocker: false,
      writes_human_gate: false,
      writes_current_package: false,
      writes_paper_body: false,
      can_claim_provider_running: Boolean(temporalStart),
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
    },
  };
}
