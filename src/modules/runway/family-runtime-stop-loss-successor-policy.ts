import type { DatabaseSync } from 'node:sqlite';

import { parseJsonText } from '../../kernel/json-file.ts';
import {
  record,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import {
  isMasDomainProgressRef,
  masDomainProgressRefsFromRecord,
} from './family-runtime-mas-domain-progress-refs.ts';

const ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE = 'anti_loop_budget_exhausted';
const PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON = 'progress_first_owner_delta_required';
const STOP_LOSS_SUCCESSOR_ACTION_TYPE = 'publishability_repair_sprint';
const STOP_LOSS_SUCCESSOR_WORK_UNIT_ID =
  'publishability_repair_sprint_after_anti_loop_budget_exhausted';

type StopLossTask = {
  task_id: string;
  domain_id?: string;
  task_kind?: string;
  payload_json?: string;
  status: string;
  last_error: string | null;
  dead_letter_reason: string | null;
};

function stringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function providerAdmissionIdentity(payload: JsonRecord) {
  return record(payload.provider_admission_identity);
}

function currentnessBasis(payload: JsonRecord) {
  return record(payload.owner_route_currentness_basis);
}

function stopLossCurrentnessIdentity(payload: JsonRecord) {
  const providerIdentity = providerAdmissionIdentity(payload);
  const basis = currentnessBasis(payload);
  return {
    study_id_or_quest_id:
      stringValue(payload.study_id)
      ?? stringValue(payload.quest_id)
      ?? stringValue(providerIdentity.study_id)
      ?? stringValue(providerIdentity.quest_id),
    action_type:
      stringValue(payload.action_type)
      ?? stringValue(providerIdentity.action_type),
    work_unit_id:
      stringValue(basis.work_unit_id)
      ?? stringValue(payload.work_unit_id)
      ?? stringValue(providerIdentity.work_unit_id),
    work_unit_fingerprint:
      stringValue(basis.work_unit_fingerprint)
      ?? stringValue(payload.work_unit_fingerprint)
      ?? stringValue(providerIdentity.work_unit_fingerprint)
      ?? stringValue(payload.action_fingerprint)
      ?? stringValue(providerIdentity.action_fingerprint),
    source_fingerprint:
      stringValue(payload.source_fingerprint)
      ?? stringValue(payload.domain_source_fingerprint)
      ?? stringValue(providerIdentity.source_fingerprint)
      ?? stringValue(payload.action_fingerprint)
      ?? stringValue(providerIdentity.action_fingerprint),
    truth_epoch:
      stringValue(basis.truth_epoch)
      ?? stringValue(payload.truth_epoch)
      ?? stringValue(providerIdentity.truth_epoch),
    runtime_health_epoch:
      stringValue(basis.runtime_health_epoch)
      ?? stringValue(payload.runtime_health_epoch)
      ?? stringValue(providerIdentity.runtime_health_epoch),
    source_eval_id:
      stringValue(basis.source_eval_id)
      ?? stringValue(payload.source_eval_id)
      ?? stringValue(providerIdentity.source_eval_id),
    idempotency_key:
      stringValue(payload.attempt_idempotency_key)
      ?? stringValue(payload.idempotency_key)
      ?? stringValue(providerIdentity.attempt_idempotency_key)
      ?? stringValue(providerIdentity.idempotency_key),
    route_identity_key:
      stringValue(payload.route_identity_key)
      ?? stringValue(providerIdentity.route_identity_key),
  };
}

function stopLossIdentityDifference(
  previous: ReturnType<typeof stopLossCurrentnessIdentity>,
  next: ReturnType<typeof stopLossCurrentnessIdentity>,
) {
  return {
    action_type: Boolean(previous.action_type && next.action_type && previous.action_type !== next.action_type),
    work_unit_id:
      Boolean(previous.work_unit_id && next.work_unit_id && previous.work_unit_id !== next.work_unit_id),
    work_unit_fingerprint: Boolean(
      previous.work_unit_fingerprint
      && next.work_unit_fingerprint
      && previous.work_unit_fingerprint !== next.work_unit_fingerprint
    ),
    source_fingerprint: Boolean(
      previous.source_fingerprint
      && next.source_fingerprint
      && previous.source_fingerprint !== next.source_fingerprint
    ),
    idempotency_key:
      Boolean(previous.idempotency_key && next.idempotency_key && previous.idempotency_key !== next.idempotency_key),
    route_identity_key: Boolean(
      previous.route_identity_key
      && next.route_identity_key
      && previous.route_identity_key !== next.route_identity_key
    ),
  };
}

function sameStopLossLineage(
  previous: ReturnType<typeof stopLossCurrentnessIdentity>,
  next: ReturnType<typeof stopLossCurrentnessIdentity>,
) {
  return Boolean(
    previous.study_id_or_quest_id
    && next.study_id_or_quest_id
    && previous.study_id_or_quest_id === next.study_id_or_quest_id
    && previous.action_type
    && next.action_type
    && previous.action_type === next.action_type
    && previous.work_unit_id
    && next.work_unit_id
    && previous.work_unit_id === next.work_unit_id
    && previous.work_unit_fingerprint
    && next.work_unit_fingerprint
    && previous.work_unit_fingerprint === next.work_unit_fingerprint
  );
}

function sameStudyScope(
  previous: ReturnType<typeof stopLossCurrentnessIdentity>,
  next: ReturnType<typeof stopLossCurrentnessIdentity>,
) {
  return Boolean(
    previous.study_id_or_quest_id
    && next.study_id_or_quest_id
    && previous.study_id_or_quest_id === next.study_id_or_quest_id
  );
}

function isAntiLoopStopLossBlockedTask(task: StopLossTask) {
  if (task.status !== 'blocked') {
    return false;
  }
  return [
    task.dead_letter_reason,
    task.last_error,
  ].includes(ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE)
    || [
      task.dead_letter_reason,
      task.last_error,
    ].includes(PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON);
}

function stopLossPolicyAllowsSuccessor(value: unknown) {
  const payload = record(value);
  const stopLossState = record(payload.stop_loss_state);
  const successorAdmission = record(stopLossState.successor_admission);
  const stopLossPolicy = record(payload.stop_loss_policy);
  const successorPolicy = record(stopLossPolicy.successor_policy);
  return stringValue(stopLossState.terminal_blocker_code) === ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE
    && successorAdmission.same_work_unit_redrive_allowed === false
    && stringValue(successorAdmission.status) === 'identity_different_successor_or_gate_required'
    && stringValue(stopLossPolicy.terminal_blocker_code) === ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE
    && successorPolicy.same_work_unit_redrive_allowed === false
    && successorPolicy.identity_different_successor_allowed === true
    && stringValue(successorPolicy.default_successor_action_type) === STOP_LOSS_SUCCESSOR_ACTION_TYPE
    && stringValue(successorPolicy.default_successor_work_unit_id) === STOP_LOSS_SUCCESSOR_WORK_UNIT_ID;
}

function typedBlockerRefs(payload: JsonRecord) {
  const routeImpact = record(payload.route_impact);
  const providerIdentity = providerAdmissionIdentity(payload);
  return uniqueStrings([
    ...stringList(payload.typed_blocker_refs),
    stringValue(payload.typed_blocker_ref),
    ...stringList(providerIdentity.typed_blocker_refs),
    stringValue(providerIdentity.typed_blocker_ref),
    ...stringList(routeImpact.typed_blocker_refs),
    stringValue(routeImpact.typed_blocker_ref),
  ]);
}

function humanGateRef(payload: JsonRecord) {
  const providerIdentity = providerAdmissionIdentity(payload);
  return stringValue(payload.human_gate_ref)
    ?? stringValue(payload.operator_gate_ref)
    ?? stringValue(payload.progress_first_human_override_ref)
    ?? stringValue(providerIdentity.human_gate_ref)
    ?? stringValue(providerIdentity.operator_gate_ref)
    ?? stringValue(providerIdentity.progress_first_human_override_ref);
}

function stopLossSuccessorRouteReason(payload: JsonRecord) {
  const providerIdentity = providerAdmissionIdentity(payload);
  return stringValue(payload.stop_loss_successor_reason)
    ?? stringValue(providerIdentity.stop_loss_successor_reason)
    ?? stringValue(payload.successor_route_reason)
    ?? stringValue(providerIdentity.successor_route_reason);
}

function legalTerminalPath(payload: JsonRecord) {
  const routeReason = stopLossSuccessorRouteReason(payload);
  if (humanGateRef(payload) || routeReason === 'human_or_operator_gate') {
    return 'human_or_operator_gate';
  }
  if (typedBlockerRefs(payload).length > 0 || routeReason === 'single_typed_blocker') {
    return 'single_typed_blocker';
  }
  if (
    stringValue(payload.action_type) === STOP_LOSS_SUCCESSOR_ACTION_TYPE
    || stringValue(providerAdmissionIdentity(payload).action_type) === STOP_LOSS_SUCCESSOR_ACTION_TYPE
    || routeReason === 'anti_loop_budget_exhausted_successor'
  ) {
    return 'publishability_repair_sprint';
  }
  if (routeReason === 'provider_hard_gate_clearance') {
    return 'provider_hard_gate_clearance';
  }
  return null;
}

function domainProgressRefs(payload: JsonRecord) {
  return masDomainProgressRefsFromRecord(payload);
}

function safeJsonRecord(value: string) {
  try {
    return record(parseJsonText(value));
  } catch {
    return {};
  }
}

function stopLossAttemptDomainProgress(
  db: DatabaseSync,
  input: {
    task: StopLossTask;
    previousIdentity: ReturnType<typeof stopLossCurrentnessIdentity>;
  },
) {
  if (!input.task.domain_id || !input.task.task_kind) {
    return { stage_attempt_ids: [], domain_progress_refs: [] };
  }
  const rows = db.prepare(`
    SELECT stage_attempt_id, status, workspace_locator_json, closeout_refs_json, route_impact_json
    FROM stage_attempts
    WHERE domain_id = ? AND stage_id = ?
      AND status IN ('completed', 'blocked', 'failed', 'dead_lettered', 'checkpointed')
    ORDER BY updated_at DESC, created_at DESC
  `).all(input.task.domain_id, input.task.task_kind) as Array<{
    stage_attempt_id: string;
    status: string;
    workspace_locator_json: string;
    closeout_refs_json: string;
    route_impact_json: string;
  }>;
  const stageAttemptIds: string[] = [];
  const progressRefs: string[] = [];
  for (const row of rows) {
    const workspaceLocator = safeJsonRecord(row.workspace_locator_json);
    const attemptIdentity = stopLossCurrentnessIdentity(workspaceLocator);
    if (!sameStopLossLineage(input.previousIdentity, attemptIdentity)) {
      continue;
    }
    const closeoutRefs = stringList(parseJsonText(row.closeout_refs_json));
    const routeImpact = safeJsonRecord(row.route_impact_json);
    const attemptProgressRefs = uniqueStrings([
      ...closeoutRefs,
      ...domainProgressRefs(routeImpact),
    ]).filter(isMasDomainProgressRef);
    if (attemptProgressRefs.length === 0) {
      continue;
    }
    stageAttemptIds.push(row.stage_attempt_id);
    progressRefs.push(...attemptProgressRefs);
  }
  return {
    stage_attempt_ids: uniqueStrings(stageAttemptIds),
    domain_progress_refs: uniqueStrings(progressRefs),
  };
}

function stopLossAuthorityBoundary() {
  return {
    opl: 'stop_loss_successor_admission_and_read_model_only',
    domain: 'truth_quality_artifact_gate_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    can_claim_publication_ready: false,
    can_claim_production_ready: false,
  };
}

export function antiLoopStopLossSameLineageDecision(input: {
  db: DatabaseSync;
  existing: StopLossTask;
  existingPayload: JsonRecord;
  nextPayload: JsonRecord;
}) {
  if (!isAntiLoopStopLossBlockedTask(input.existing)) {
    return null;
  }
  const previousIdentity = stopLossCurrentnessIdentity(input.existingPayload);
  const nextIdentity = stopLossCurrentnessIdentity(input.nextPayload);
  if (!sameStopLossLineage(previousIdentity, nextIdentity)) {
    return null;
  }
  const terminalPath = legalTerminalPath(input.nextPayload);
  if (
    terminalPath
    && terminalPath !== 'publishability_repair_sprint'
  ) {
    return {
      event_type: 'task_stop_loss_terminal_path_observed',
      reason: 'anti_loop_stop_loss_terminal_path_observed',
      terminal_blocker_code: ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE,
      same_work_unit_redrive_allowed: false,
      legal_terminal_path: terminalPath,
      successor_route_reason: stopLossSuccessorRouteReason(input.nextPayload) ?? terminalPath,
      human_gate_ref: humanGateRef(input.nextPayload),
      typed_blocker_refs: typedBlockerRefs(input.nextPayload),
      previous_currentness_identity: previousIdentity,
      next_currentness_identity: nextIdentity,
      identity_difference: stopLossIdentityDifference(previousIdentity, nextIdentity),
      next_required_route: 'terminal_path_observed_no_default_redrive',
      authority_boundary: stopLossAuthorityBoundary(),
    };
  }
  const payloadProgressRefs = domainProgressRefs(input.nextPayload);
  const attemptProgress = stopLossAttemptDomainProgress(input.db, {
    task: input.existing,
    previousIdentity,
  });
  const progressRefs = uniqueStrings([
    ...payloadProgressRefs,
    ...attemptProgress.domain_progress_refs,
  ]);
  if (progressRefs.length > 0) {
    return {
      event_type: 'task_stop_loss_same_lineage_domain_progress_released',
      reason: 'anti_loop_stop_loss_same_lineage_domain_progress_observed',
      terminal_blocker_code: ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE,
      same_work_unit_redrive_allowed: true,
      domain_progress_refs: progressRefs,
      domain_progress_stage_attempt_ids: attemptProgress.stage_attempt_ids,
      previous_currentness_identity: previousIdentity,
      next_currentness_identity: nextIdentity,
      identity_difference: stopLossIdentityDifference(previousIdentity, nextIdentity),
      next_required_route: 'same_lineage_provider_attempt_allowed_after_domain_progress_evidence',
      authority_boundary: stopLossAuthorityBoundary(),
    };
  }
  return {
    event_type: 'task_stop_loss_successor_admission_blocked',
    reason: 'anti_loop_stop_loss_same_work_unit_redrive_blocked',
    terminal_blocker_code: ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE,
    same_work_unit_redrive_allowed: false,
    previous_currentness_identity: previousIdentity,
    next_currentness_identity: nextIdentity,
    identity_difference: stopLossIdentityDifference(previousIdentity, nextIdentity),
    next_required_route:
      'identity_different_publishability_repair_sprint_or_typed_blocker_or_human_gate',
    authority_boundary: stopLossAuthorityBoundary(),
  };
}

export function findAntiLoopStopLossSuccessorAdmission(
  db: DatabaseSync,
  input: {
    domainId: string;
    taskKind: string;
    payload: JsonRecord;
  },
) {
  const rows = db.prepare(`
    SELECT *
    FROM tasks
    WHERE domain_id = ? AND task_kind = ? AND status = 'blocked'
    ORDER BY updated_at DESC, created_at DESC
  `).all(input.domainId, input.taskKind) as StopLossTask[];
  for (const row of rows) {
    if (!isAntiLoopStopLossBlockedTask(row) || !row.payload_json) {
      continue;
    }
    const payload = record(parseJsonText(row.payload_json));
    const policyRows = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_progress_first_anti_spin_blocked'
      ORDER BY created_at DESC
    `).all(row.task_id) as Array<{ payload_json: string }>;
    const successorAllowed = policyRows.some((event) => {
      try {
        return stopLossPolicyAllowsSuccessor(parseJsonText(event.payload_json));
      } catch {
        return false;
      }
    });
    if (!successorAllowed) {
      continue;
    }
    const admission = antiLoopStopLossSuccessorAdmission({
      previousTaskId: row.task_id,
      previousPayload: payload,
      nextPayload: input.payload,
    });
    if (admission) {
      return {
        task: row,
        payload,
        admission,
      };
    }
  }
  return null;
}

function antiLoopStopLossSuccessorAdmission(input: {
  previousTaskId: string;
  previousPayload: JsonRecord;
  nextPayload: JsonRecord;
}) {
  const previousIdentity = stopLossCurrentnessIdentity(input.previousPayload);
  const nextIdentity = stopLossCurrentnessIdentity(input.nextPayload);
  const identityDifference = stopLossIdentityDifference(previousIdentity, nextIdentity);
  const routeReason = stopLossSuccessorRouteReason(input.nextPayload);
  const terminalPath = legalTerminalPath(input.nextPayload);
  const routeIdentityAllowed = Boolean(
    identityDifference.action_type
    || identityDifference.work_unit_id
    || identityDifference.work_unit_fingerprint
    || identityDifference.source_fingerprint
  );
  if (
    !sameStudyScope(previousIdentity, nextIdentity)
    || !routeIdentityAllowed
    || !terminalPath
    || !nextIdentity.work_unit_id
    || !nextIdentity.work_unit_fingerprint
    || !nextIdentity.idempotency_key
    || !nextIdentity.route_identity_key
  ) {
    return null;
  }
  const successorRouteReason = routeReason
    ?? (terminalPath === 'publishability_repair_sprint'
      ? 'anti_loop_budget_exhausted_successor'
      : terminalPath);
  const admission = {
    surface_kind: 'opl_stop_loss_successor_admission_read_model',
    schema_version: 'stop-loss-successor-admission.v1',
    status: 'admitted',
    reason: 'anti_loop_stop_loss_identity_different_successor_admitted',
    terminal_blocker_code: ANTI_LOOP_BUDGET_EXHAUSTED_BLOCKER_CODE,
    previous_stop_loss_task_id: input.previousTaskId,
    successor_route_reason: successorRouteReason,
    legal_terminal_path: terminalPath,
    human_gate_ref: humanGateRef(input.nextPayload),
    typed_blocker_refs: typedBlockerRefs(input.nextPayload),
    same_work_unit_redrive_allowed: false,
    previous_currentness_identity: previousIdentity,
    next_currentness_identity: nextIdentity,
    identity_difference: identityDifference,
    accepted_terminal_paths: [
      'publishability_repair_sprint',
      'single_typed_blocker',
      'human_or_operator_gate',
      'provider_hard_gate_clearance',
    ],
    authority_boundary: stopLossAuthorityBoundary(),
  };
  return {
    payload: admission,
    nextPayload: {
      ...input.nextPayload,
      stop_loss_successor_admission: admission,
      stop_loss_successor_reason: successorRouteReason,
    },
  };
}
