import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../kernel/json-record.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import { resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import { readLocalCodexDefaultsIfAvailable } from '../../kernel/local-codex-defaults.ts';
import {
  createStageAttempt,
  inspectStageAttempt,
  listStageAttemptsForTask,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  stableId,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import {
  isPaperMissionStageRouteTask,
  PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND,
  PAPER_MISSION_STAGE_ROUTE_TASK_KIND,
  paperMissionStageRouteIdentityValue,
} from './family-runtime-paper-mission-stage-route-terminal-sync.ts';

export { isPaperMissionStageRouteTask };

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;
type StageAttemptPayload = ReturnType<typeof inspectStageAttempt>;
type TemporalProviderModule = () => Promise<{
  startTemporalStageAttemptWorkflow: (
    attempt: StageAttemptPayload,
    options: { paths: FamilyRuntimePaths },
  ) => Promise<Record<string, unknown>>;
}>;

function authorityBoundary(payload: Record<string, unknown>) {
  return isRecord(payload.authority_boundary) ? payload.authority_boundary : {};
}

function booleanTrue(value: unknown) {
  return value === true;
}

function nestedRecord(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] : null;
}

function nestedExecutorPolicy(payload: Record<string, unknown>) {
  return isRecord(payload.stage_attempt_executor_policy)
    ? { policy: payload.stage_attempt_executor_policy, source: 'payload.stage_attempt_executor_policy' }
    : isRecord(payload.executor_policy)
      ? { policy: payload.executor_policy, source: 'payload.executor_policy' }
      : isRecord(nestedRecord(payload.opl_route_command, 'stage_attempt_executor_policy'))
        ? {
            policy: nestedRecord(payload.opl_route_command, 'stage_attempt_executor_policy')!,
            source: 'payload.opl_route_command.stage_attempt_executor_policy',
          }
        : isRecord(nestedRecord(payload.opl_runtime_carrier, 'stage_attempt_executor_policy'))
          ? {
              policy: nestedRecord(payload.opl_runtime_carrier, 'stage_attempt_executor_policy')!,
              source: 'payload.opl_runtime_carrier.stage_attempt_executor_policy',
            }
          : isRecord(nestedRecord(nestedRecord(payload.opl_route_handoff_record, 'opl_runtime_carrier'), 'stage_attempt_executor_policy'))
            ? {
                policy: nestedRecord(
                  nestedRecord(payload.opl_route_handoff_record, 'opl_runtime_carrier'),
                  'stage_attempt_executor_policy',
                )!,
                source: 'payload.opl_route_handoff_record.opl_runtime_carrier.stage_attempt_executor_policy',
              }
            : null;
}

function routeImpactForAttempt(payload: Record<string, unknown>) {
  const routeImpact = isRecord(payload.route_impact) ? { ...payload.route_impact } : {};
  if (!isRecord(routeImpact.user_stage_log) && isRecord(payload.user_stage_log)) {
    routeImpact.user_stage_log = payload.user_stage_log;
  }
  if (!isRecord(routeImpact.stage_log_summary) && isRecord(payload.stage_log_summary)) {
    routeImpact.stage_log_summary = payload.stage_log_summary;
  }
  if (!isRecord(routeImpact.human_stage_log) && isRecord(payload.human_stage_log)) {
    routeImpact.human_stage_log = payload.human_stage_log;
  }
  return routeImpact;
}

function normalizeCodexCliExecutorPolicy(
  policy: Record<string, unknown>,
  source: string,
) {
  const executorKind = optionalString(policy.executor_kind)?.replace(/-/g, '_') ?? 'codex_cli';
  if (executorKind !== 'codex_cli') {
    return {
      policy: null,
      blockedReason: 'codex_cli_executor_policy_unsupported',
      source,
    };
  }
  const model = optionalString(policy.model);
  const provider = optionalString(policy.provider) ?? optionalString(policy.model_provider);
  if (!model || !provider) {
    return {
      policy: null,
      blockedReason: 'codex_cli_executor_policy_incomplete',
      source,
    };
  }
  const reasoningEffort = optionalString(policy.reasoning_effort)
    ?? optionalString(policy.model_reasoning_effort);
  return {
    policy: {
      ...policy,
      executor_kind: 'codex_cli',
      model,
      provider,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      policy_source: optionalString(policy.policy_source) ?? source,
      inherited_local_codex_default: policy.inherited_local_codex_default === true,
    },
    blockedReason: null,
    source,
  };
}

function resolveCodexCliExecutorPolicy(payload: Record<string, unknown>) {
  const explicit = nestedExecutorPolicy(payload);
  if (explicit) {
    return normalizeCodexCliExecutorPolicy(explicit.policy, explicit.source);
  }
  const localDefaults = readLocalCodexDefaultsIfAvailable();
  if (!localDefaults?.model || !localDefaults.model_provider) {
    return {
      policy: null,
      blockedReason: 'codex_cli_executor_policy_missing',
      source: 'local_codex_default_unavailable',
    };
  }
  return {
    policy: {
      executor_kind: 'codex_cli',
      model: localDefaults.model,
      provider: localDefaults.model_provider,
      ...(localDefaults.reasoning_effort ? { reasoning_effort: localDefaults.reasoning_effort } : {}),
      policy_source: 'local_codex_default_materialized_at_stage_attempt_creation',
      local_codex_config_ref: localDefaults.config_path,
      inherited_local_codex_default: true,
      authority_boundary: {
        opl: 'executor_policy_materialization_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        provider_completion_is_domain_ready: false,
      },
    },
    blockedReason: null,
    source: 'local_codex_default_materialized_at_stage_attempt_creation',
  };
}

function routeStageId(payload: Record<string, unknown>) {
  return paperMissionStageRouteIdentityValue(payload, 'route_target')
    ?? paperMissionStageRouteIdentityValue(payload, 'command_kind')
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
    paperMissionStageRouteIdentityValue(payload, 'command_kind'),
    paperMissionStageRouteIdentityValue(payload, 'route_target'),
    paperMissionStageRouteIdentityValue(payload, 'work_unit_id'),
    paperMissionStageRouteIdentityValue(payload, 'work_unit_fingerprint'),
    paperMissionStageRouteIdentityValue(payload, 'route_identity_key'),
    paperMissionStageRouteIdentityValue(payload, 'attempt_idempotency_key'),
    row.dedupe_key,
  ]);
}

function workspaceLocatorFor(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  const exportContext = isRecord(payload.opl_domain_export_context)
    ? payload.opl_domain_export_context
    : {};
  const workspaceRoot = optionalString(payload.workspace_root)
    ?? optionalString(payload.domain_workspace_root)
    ?? optionalString(payload.repo_root);
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
    profile_ref: optionalString(payload.profile_ref) ?? optionalString(payload.profile),
    source_ref: optionalString(payload.source_ref)
      ?? optionalString(payload.paper_mission_default_handoff_ref),
    paper_mission_transaction_ref: optionalString(payload.paper_mission_transaction_ref),
    opl_route_command_ref: optionalString(payload.opl_route_command_ref),
    command_kind: paperMissionStageRouteIdentityValue(payload, 'command_kind'),
    route_target: paperMissionStageRouteIdentityValue(payload, 'route_target'),
    work_unit_id: paperMissionStageRouteIdentityValue(payload, 'work_unit_id'),
    work_unit_fingerprint: paperMissionStageRouteIdentityValue(payload, 'work_unit_fingerprint'),
    route_identity_key: paperMissionStageRouteIdentityValue(payload, 'route_identity_key'),
    attempt_idempotency_key: paperMissionStageRouteIdentityValue(payload, 'attempt_idempotency_key'),
    request_idempotency_key: paperMissionStageRouteIdentityValue(payload, 'request_idempotency_key'),
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

function missingIdentityReason(payload: Record<string, unknown>) {
  if (!optionalString(payload.study_id)) {
    return 'paper_mission_route_missing_identity_field:study_id';
  }
  if (!optionalString(payload.paper_mission_transaction_ref)) {
    return 'paper_mission_route_missing_identity_field:paper_mission_transaction_ref';
  }
  if (!optionalString(payload.opl_route_command_ref)) {
    return 'paper_mission_route_missing_identity_field:opl_route_command_ref';
  }
  if (!paperMissionStageRouteIdentityValue(payload, 'command_kind')) {
    return 'paper_mission_route_missing_identity_field:command_kind';
  }
  if (!paperMissionStageRouteIdentityValue(payload, 'route_target')) {
    return 'paper_mission_route_missing_identity_field:route_target';
  }
  if (!paperMissionStageRouteIdentityValue(payload, 'route_identity_key')) {
    return 'paper_mission_route_missing_identity_field:route_identity_key';
  }
  if (!paperMissionStageRouteIdentityValue(payload, 'attempt_idempotency_key')) {
    return 'paper_mission_route_missing_identity_field:attempt_idempotency_key';
  }
  return null;
}

const PROVIDER_RUNTIME_BLOCKER_REDRIVE_REASONS = new Set([
  'typed_closeout_packet_required',
  'temporal_stage_attempt_completed_missing_typed_closeout',
  'codex_cli_typed_closeout_not_materialized',
  'codex_cli_provider_unavailable',
]);
const PROVIDER_RUNTIME_BLOCKER_REF_PATTERN = /^opl:\/\/stage-attempts\/[^/]+\/runtime-blockers\/[^/]+$/;

function closeoutRefsAllowFreshAttemptAfterProviderRuntimeBlocker(closeoutRefs: string[]) {
  return closeoutRefs.length === 0
    || closeoutRefs.every((ref) => PROVIDER_RUNTIME_BLOCKER_REF_PATTERN.test(ref));
}

function pendingAttemptForProviderRedrive(
  db: DatabaseSync,
  input: {
    taskId: string;
    providerKind: string;
    stageId: string;
    sourceFingerprint: string;
  },
) {
  return listStageAttemptsForTask(db, input.taskId)
    .filter((attempt) => (
      attempt.provider_kind === input.providerKind
      && attempt.stage_id === input.stageId
      && attempt.executor_kind === 'codex_cli'
      && attempt.source_fingerprint === input.sourceFingerprint
      && attempt.status === 'queued'
      && attempt.blocked_reason === null
      && attempt.closeout_receipt_status === null
    ))
    .sort((left, right) => Date.parse(left.updated_at) - Date.parse(right.updated_at))
    .at(-1) ?? null;
}

function needsFreshAttemptAfterProviderRuntimeBlocker(
  db: DatabaseSync,
  input: {
    taskId: string;
    providerKind: string;
    stageId: string;
    sourceFingerprint: string;
  },
) {
  return listStageAttemptsForTask(db, input.taskId).some((attempt) => {
    const closeoutRefs = Array.isArray(attempt.closeout_refs) ? attempt.closeout_refs : [];
    return attempt.provider_kind === input.providerKind
      && attempt.stage_id === input.stageId
      && attempt.executor_kind === 'codex_cli'
      && attempt.source_fingerprint === input.sourceFingerprint
      && ['blocked', 'failed', 'dead_lettered'].includes(attempt.status)
      && PROVIDER_RUNTIME_BLOCKER_REDRIVE_REASONS.has(attempt.blocked_reason ?? '')
      && closeoutRefsAllowFreshAttemptAfterProviderRuntimeBlocker(closeoutRefs)
      && attempt.closeout_receipt_status === null;
  });
}

function createPaperMissionStageRouteAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  input: {
    newAttempt: boolean;
    reusePendingRedriveAttempt?: boolean;
  },
) {
  const blockedReason = forbiddenWriteReason(payload) ?? missingIdentityReason(payload);
  if (blockedReason) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'PaperMission stage-route redrive requires a valid non-authority runtime request.',
      {
        task_id: row.task_id,
        reason: blockedReason,
      },
    );
  }
  const sourceFingerprint = sourceFingerprintFor(row, payload);
  const stageId = routeStageId(payload);
  const providerKind = resolveFamilyRuntimeProviderKind();
  const executorPolicy = resolveCodexCliExecutorPolicy(payload);
  const pendingAttempt = input.reusePendingRedriveAttempt
    ? pendingAttemptForProviderRedrive(db, {
        taskId: row.task_id,
        providerKind,
        stageId,
        sourceFingerprint,
      })
    : null;
  const stageAttempt = pendingAttempt
    ? {
        created: false,
        idempotent_noop: true,
        attempt: pendingAttempt,
      }
    : createStageAttempt(db, {
        domainId: row.domain_id,
        stageId,
        providerKind,
        workspaceLocator: workspaceLocatorFor(row, payload),
        sourceFingerprint,
        executorKind: 'codex_cli',
        stageAttemptExecutorPolicy: executorPolicy.policy,
        taskId: row.task_id,
        newAttempt: input.newAttempt,
        blockedReason: executorPolicy.blockedReason ?? undefined,
        checkpointRefs: [
          optionalString(payload.paper_mission_transaction_ref),
          optionalString(payload.opl_route_command_ref),
          optionalString(payload.candidate_ref),
        ].filter((entry): entry is string => Boolean(entry)),
        routeImpact: routeImpactForAttempt(payload),
      });
  const admittedAttempt = stageAttempt.attempt;
  if (executorPolicy.blockedReason) {
    const closeoutRef = `opl://stage-attempts/${
      encodeURIComponent(admittedAttempt.stage_attempt_id)
    }/runtime-blockers/${encodeURIComponent(executorPolicy.blockedReason)}`;
    const blockedAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      stageAttemptIds: [admittedAttempt.stage_attempt_id],
      status: 'blocked',
      blockedReason: executorPolicy.blockedReason,
      closeoutRefs: [closeoutRef],
      routeImpact: {
        provider_blocker_reason: executorPolicy.blockedReason,
        provider_blocker_surface: executorPolicy.source,
        runtime_blocker_ref: closeoutRef,
        runtime_blocker_owner: 'one-person-lab',
        runtime_blocker_is_domain_owner_answer: false,
        provider_completion_is_domain_ready: false,
      },
      activityEvent: {
        activity_kind: 'stage_attempt_executor_policy_admission',
        activity_status: 'blocked',
        blocked_reason: executorPolicy.blockedReason,
        policy_source: executorPolicy.source,
        closeout_refs: [closeoutRef],
        authority_boundary: {
          opl: 'executor_policy_admission_gate_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
        },
      },
    });
    return {
      ...stageAttempt,
      attempt: blockedAttempts[0] ?? admittedAttempt,
      sourceFingerprint,
      stageId,
      providerKind,
      executorPolicy,
      closeoutRefs: [closeoutRef],
    };
  }
  return {
    ...stageAttempt,
    sourceFingerprint,
    stageId,
    providerKind,
    executorPolicy,
    closeoutRefs: [],
  };
}

export function createPaperMissionStageRouteAttemptForProviderRedrive(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  return createPaperMissionStageRouteAttempt(db, row, payload, {
    newAttempt: true,
  }).attempt;
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
  const blockedReason = forbiddenWriteReason(payload) ?? missingIdentityReason(payload);
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
  const newAttemptAfterProviderRuntimeBlocker = needsFreshAttemptAfterProviderRuntimeBlocker(db, {
    taskId: row.task_id,
    providerKind,
    stageId,
    sourceFingerprint,
  });
  const stageAttempt = createPaperMissionStageRouteAttempt(db, row, payload, {
    newAttempt: newAttemptAfterProviderRuntimeBlocker,
    reusePendingRedriveAttempt: true,
  });
  const admittedAttempt = stageAttempt.attempt;
  const executorPolicy = stageAttempt.executorPolicy;
  if (executorPolicy.blockedReason) {
    const closeoutRef = stageAttempt.closeoutRefs[0]
      ?? `opl://stage-attempts/${encodeURIComponent(admittedAttempt.stage_attempt_id)}/runtime-blockers/${
        encodeURIComponent(executorPolicy.blockedReason)
      }`;
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ?
    `).run(executorPolicy.blockedReason, executorPolicy.blockedReason, startedAt, row.task_id);
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'paper_mission_stage_route_blocked_executor_policy',
      source: 'opl-family-runtime',
      payload: {
        reason: executorPolicy.blockedReason,
        policy_source: executorPolicy.source,
        stage_attempt_id: admittedAttempt.stage_attempt_id,
        closeout_refs: [closeoutRef],
        authority_boundary: {
          opl: 'executor_policy_admission_gate_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
          can_claim_paper_progress: false,
        },
      },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'error',
      title: 'MAS PaperMission stage route blocked',
      body: executorPolicy.blockedReason,
      payload: {
        reason: executorPolicy.blockedReason,
        policy_source: executorPolicy.source,
        closeout_refs: [closeoutRef],
      },
    });
    return {
      task_id: row.task_id,
      status: 'blocked',
      reason: executorPolicy.blockedReason,
      stage_attempts: [admittedAttempt],
      closeout_refs: [closeoutRef],
      authority_boundary: {
        can_claim_stage_run_created: true,
        can_claim_provider_running: false,
        can_claim_paper_progress: false,
      },
    };
  }
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
