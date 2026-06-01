import type { DatabaseSync } from 'node:sqlite';

import {
  insertEvent,
  insertNotification,
  nowIso,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import {
  listStageAttempts,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';

type JsonRecord = Record<string, unknown>;

export const PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON = 'progress_first_owner_delta_required';
const DEFAULT_ANTI_SPIN_REPEAT_THRESHOLD = 2;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function taskPayload(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as JsonRecord;
}

function linkedTaskPayload(db: DatabaseSync, taskId: string | null) {
  if (!taskId) {
    return null;
  }
  const row = db.prepare('SELECT payload_json FROM tasks WHERE task_id = ?').get(taskId) as
    | { payload_json: string }
    | undefined;
  return row ? JSON.parse(row.payload_json) as JsonRecord : null;
}

function nestedRecord(recordValue: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = recordValue[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return {};
}

function refsFrom(recordValue: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => stringList(recordValue[key])));
}

function ownerFingerprint(payload: JsonRecord | null) {
  const exportContext = record(payload?.opl_domain_export_context);
  return stringValue(exportContext.owner_fingerprint);
}

function sourceFingerprint(payload: JsonRecord | null) {
  return stringValue(payload?.source_fingerprint)
    ?? stringValue(payload?.domain_source_fingerprint);
}

function deltaCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!isRecord(value)) {
    return 0;
  }
  const count = numberValue(value.delta_count) || numberValue(value.count);
  if (count > 0) {
    return count;
  }
  if (booleanValue(value.has_deliverable_delta) || booleanValue(value.has_delta)) {
    return 1;
  }
  return refsFrom(value, ['delta_refs', 'refs', 'evidence_refs']).length;
}

function progressDeltaClassification(value: JsonRecord) {
  return stringValue(value.progress_delta_classification)
    ?? stringValue(record(value.route_impact).progress_delta_classification);
}

function hasDeliverableDelta(value: JsonRecord) {
  const routeImpact = record(value.route_impact);
  const classification = progressDeltaClassification(value);
  return classification === 'deliverable_progress'
    || classification === 'mixed'
    || deltaCount(value.deliverable_progress_delta) > 0
    || deltaCount(routeImpact.deliverable_progress_delta) > 0
    || deltaCount(record(value.user_stage_log).deliverable_progress_delta) > 0;
}

function ownerReceiptRefs(value: JsonRecord) {
  const routeImpact = record(value.route_impact);
  const evidencePayload = record(value.domain_dispatch_evidence_record_payload);
  return uniqueStrings([
    ...refsFrom(value, [
      'owner_receipt_refs',
      'domain_owner_receipt_refs',
      'domain_receipt_refs',
      'deliverable_owner_receipt_refs',
    ]),
    stringValue(value.owner_receipt_ref),
    stringValue(value.domain_owner_receipt_ref),
    stringValue(value.domain_receipt_ref),
    stringValue(value.deliverable_owner_receipt_ref),
    ...refsFrom(routeImpact, [
      'owner_receipt_refs',
      'domain_owner_receipt_refs',
    ]),
    stringValue(routeImpact.owner_receipt_ref),
    stringValue(routeImpact.domain_owner_receipt_ref),
    ...refsFrom(evidencePayload, ['domain_receipt_refs', 'owner_receipt_refs']),
  ]);
}

function typedBlockerRefs(value: JsonRecord) {
  const routeImpact = record(value.route_impact);
  const evidencePayload = record(value.domain_dispatch_evidence_record_payload);
  return uniqueStrings([
    ...refsFrom(value, ['typed_blocker_refs']),
    stringValue(value.typed_blocker_ref),
    ...recordList(value.typed_blockers).flatMap((blocker) => refsFrom(blocker, ['refs', 'typed_blocker_refs'])),
    ...refsFrom(routeImpact, ['typed_blocker_refs']),
    stringValue(routeImpact.typed_blocker_ref),
    ...recordList(routeImpact.typed_blockers).flatMap((blocker) => refsFrom(blocker, ['refs', 'typed_blocker_refs'])),
    ...refsFrom(evidencePayload, ['typed_blocker_refs']),
  ]);
}

function typedBlockerFamilies(value: JsonRecord) {
  const routeImpact = record(value.route_impact);
  return uniqueStrings([
    ...recordList(value.typed_blockers).map((blocker) =>
      stringValue(blocker.blocker_family) ?? stringValue(blocker.blocker_kind) ?? stringValue(blocker.blocker_id)
    ),
    ...recordList(routeImpact.typed_blockers).map((blocker) =>
      stringValue(blocker.blocker_family) ?? stringValue(blocker.blocker_kind) ?? stringValue(blocker.blocker_id)
    ),
    ...typedBlockerRefs(value),
    stringValue(value.blocked_reason),
  ]);
}

function humanOverrideRefs(value: JsonRecord) {
  return uniqueStrings([
    ...refsFrom(value, [
      'progress_first_human_override_refs',
      'human_override_refs',
      'human_stop_refs',
      'human_gate_refs',
      'stop_decision_refs',
    ]),
    stringValue(value.progress_first_human_override_ref),
    stringValue(value.human_override_ref),
    stringValue(value.human_stop_ref),
    stringValue(value.stop_decision_ref),
  ]);
}

function ownerPayloadRefs(value: JsonRecord) {
  const exportContext = record(value.opl_domain_export_context);
  return uniqueStrings([
    ...refsFrom(value, [
      'owner_payload_refs',
      'domain_owner_payload_refs',
      'new_owner_payload_refs',
      'source_payload_refs',
      'new_source_payload_refs',
    ]),
    stringValue(value.owner_payload_ref),
    stringValue(value.domain_owner_payload_ref),
    stringValue(value.new_owner_payload_ref),
    stringValue(value.source_payload_ref),
    stringValue(value.new_source_payload_ref),
    stringValue(exportContext.owner_payload_ref),
    ...refsFrom(exportContext, ['owner_payload_refs']),
  ]);
}

function lineageFieldsFromPayload(row: FamilyRuntimeTaskRow, payload: JsonRecord) {
  const workspace = record(payload.workspace_locator);
  return {
    domain_id: row.domain_id,
    task_kind: row.task_kind,
    study_id: stringValue(payload.study_id) ?? stringValue(payload.quest_id) ?? stringValue(workspace.study_id),
    action_type:
      stringValue(payload.action_type)
      ?? stringValue(payload.action_ref)
      ?? stringValue(payload.dispatch_authority)
      ?? stringValue(payload.next_executable_owner)
      ?? row.task_kind,
    source_fingerprint: sourceFingerprint(payload),
    owner_fingerprint: ownerFingerprint(payload),
  };
}

function lineageFieldsFromAttempt(attempt: ReturnType<typeof listStageAttempts>[number], linkedPayload: JsonRecord | null) {
  const workspace = record(attempt.workspace_locator);
  return {
    domain_id: stringValue(attempt.domain_id),
    task_kind: stringValue(workspace.task_kind) ?? stringValue(attempt.stage_id),
    study_id: stringValue(workspace.study_id) ?? stringValue(workspace.quest_id) ?? stringValue(linkedPayload?.study_id),
    action_type:
      stringValue(workspace.action_type)
      ?? stringValue(workspace.action_ref)
      ?? stringValue(workspace.dispatch_authority)
      ?? stringValue(workspace.next_executable_owner)
      ?? stringValue(attempt.stage_id),
    source_fingerprint:
      stringValue(workspace.domain_source_fingerprint)
      ?? sourceFingerprint(linkedPayload)
      ?? stringValue(attempt.source_fingerprint),
    owner_fingerprint: ownerFingerprint(linkedPayload),
  };
}

function sameLineage(left: ReturnType<typeof lineageFieldsFromPayload>, right: ReturnType<typeof lineageFieldsFromAttempt>) {
  return left.domain_id === right.domain_id
    && left.task_kind === right.task_kind
    && left.study_id !== null
    && right.study_id !== null
    && left.study_id === right.study_id
    && left.action_type !== null
    && right.action_type !== null
    && left.action_type === right.action_type;
}

function sameSource(left: ReturnType<typeof lineageFieldsFromPayload>, right: ReturnType<typeof lineageFieldsFromAttempt>) {
  return Boolean(left.source_fingerprint && right.source_fingerprint && left.source_fingerprint === right.source_fingerprint);
}

function isAntiSpinCandidate(row: FamilyRuntimeTaskRow, payload: JsonRecord) {
  return row.task_kind.startsWith('domain_owner/')
    || payload.domain_owner_dispatch === true
    || stringValue(payload.domain_owner_dispatch) === 'true'
    || stringValue(payload.dispatch_authority)?.startsWith('domain_owner/') === true;
}

function hasCandidateBypass(payload: JsonRecord) {
  if (hasDeliverableDelta(payload)) {
    return 'deliverable_progress_delta';
  }
  if (typedBlockerRefs(payload).length > 0 || recordList(payload.typed_blockers).length > 0) {
    return 'domain_typed_blocker';
  }
  if (ownerReceiptRefs(payload).length > 0) {
    return 'deliverable_owner_receipt';
  }
  if (humanOverrideRefs(payload).length > 0) {
    return 'human_stop_or_override';
  }
  if (ownerPayloadRefs(payload).length > 0) {
    return 'new_owner_payload';
  }
  return null;
}

function attemptEvidence(attempt: ReturnType<typeof listStageAttempts>[number]) {
  const attemptRecord = attempt as unknown as JsonRecord;
  const routeImpact = record(attempt.route_impact);
  const stageProgressLog = record(attemptRecord.stage_progress_log);
  const userStageLog = record(stageProgressLog.user_stage_log);
  return {
    ...routeImpact,
    route_impact: routeImpact,
    user_stage_log: userStageLog,
    blocked_reason: attempt.blocked_reason,
  };
}

function isNoDeliverableSpinAttempt(attempt: ReturnType<typeof listStageAttempts>[number]) {
  const evidence = attemptEvidence(attempt);
  return !hasDeliverableDelta(evidence) && ownerReceiptRefs(evidence).length === 0;
}

function compareAttemptUpdatedAtDesc(
  left: ReturnType<typeof listStageAttempts>[number],
  right: ReturnType<typeof listStageAttempts>[number],
) {
  const leftTime = Date.parse(stringValue(left.updated_at) ?? '') || 0;
  const rightTime = Date.parse(stringValue(right.updated_at) ?? '') || 0;
  return rightTime - leftTime;
}

function buildLineagePacket(input: {
  candidate: FamilyRuntimeTaskRow;
  candidatePayload: JsonRecord;
  lineage: ReturnType<typeof lineageFieldsFromPayload>;
  attempts: ReturnType<typeof listStageAttempts>;
  threshold: number;
}) {
  const noDeltaAttempts = input.attempts.filter(isNoDeliverableSpinAttempt).sort(compareAttemptUpdatedAtDesc);
  const latest = noDeltaAttempts[0] ?? null;
  const blockerFamilies = uniqueStrings(noDeltaAttempts.flatMap((attempt) => typedBlockerFamilies(attemptEvidence(attempt))));
  return {
    surface_kind: 'opl_progress_first_anti_spin_lineage',
    packet_version: 'progress-first-anti-spin.v1',
    reason: PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
    threshold: input.threshold,
    repeat_count: noDeltaAttempts.length,
    lineage_key: {
      domain_id: input.lineage.domain_id,
      task_kind: input.lineage.task_kind,
      study_id: input.lineage.study_id,
      action_type: input.lineage.action_type,
      source_fingerprint: input.lineage.source_fingerprint,
    },
    candidate_task_id: input.candidate.task_id,
    recent_attempt_refs: noDeltaAttempts.map((attempt) => `/stage_attempt_workbench/attempts/${attempt.stage_attempt_id}`),
    typed_blocker_refs: uniqueStrings(noDeltaAttempts.flatMap((attempt) => typedBlockerRefs(attemptEvidence(attempt)))),
    blocker_families: blockerFamilies,
    last_progress_delta_classification: latest ? progressDeltaClassification(attemptEvidence(latest)) : null,
    last_deliverable_delta: 'none',
    next_forced_delta: 'domain_deliverable_or_owner_receipt_delta_required',
    required_owner:
      stringValue(input.candidatePayload.next_owner)
      ?? stringValue(input.candidatePayload.domain_owner)
      ?? stringValue(input.candidatePayload.next_executable_owner)
      ?? input.lineage.domain_id,
    allowed_next_evidence: [
      'deliverable_owner_receipt_ref',
      'domain_typed_blocker_ref',
      'human_stop_or_override_ref',
      'new_source_fingerprint',
      'new_owner_payload_ref',
      'true_deliverable_progress_delta',
    ],
  };
}

function progressFirstAuthorityBoundary() {
  return {
    opl: 'queue_admission_gate_and_refs_only_lineage_projection',
    domain: 'truth_quality_artifact_gate_owner',
    executor: 'provider_attempt_starts_only_after_progress_first_admission',
    domain_truth_mutation: false,
    publication_quality_mutation: false,
    artifact_gate_mutation: false,
    current_package_mutation: false,
    provider_stage_attempt_started: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function evaluateProgressFirstAntiSpinGate(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  threshold: number,
) {
  const payload = taskPayload(row);
  if (!isAntiSpinCandidate(row, payload)) {
    return { status: 'not_applicable' as const, blocked_reason: null, lineage: null };
  }
  const bypassReason = hasCandidateBypass(payload);
  if (bypassReason) {
    return { status: 'allowed' as const, blocked_reason: null, lineage: null, bypass_reason: bypassReason };
  }
  const lineage = lineageFieldsFromPayload(row, payload);
  if (!lineage.source_fingerprint) {
    return { status: 'allowed' as const, blocked_reason: null, lineage: null, bypass_reason: 'missing_source_fingerprint' };
  }
  const attempts = listStageAttempts(db).filter((attempt) => {
    if (attempt.task_id === row.task_id) {
      return false;
    }
    const linkedPayload = linkedTaskPayload(db, attempt.task_id);
    const attemptLineage = lineageFieldsFromAttempt(attempt, linkedPayload);
    if (!sameLineage(lineage, attemptLineage) || !sameSource(lineage, attemptLineage)) {
      return false;
    }
    if (
      lineage.owner_fingerprint
      && attemptLineage.owner_fingerprint
      && lineage.owner_fingerprint !== attemptLineage.owner_fingerprint
    ) {
      return false;
    }
    return ['completed', 'blocked', 'failed', 'dead_lettered', 'checkpointed'].includes(attempt.status);
  });
  const noDeltaAttempts = attempts.filter(isNoDeliverableSpinAttempt);
  if (noDeltaAttempts.length < threshold) {
    return { status: 'allowed' as const, blocked_reason: null, lineage: null };
  }
  return {
    status: 'blocked' as const,
    blocked_reason: PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
    lineage: buildLineagePacket({ candidate: row, candidatePayload: payload, lineage, attempts, threshold }),
  };
}

function blockTaskForProgressFirstAntiSpin(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  input: {
    source: string;
    lineage: JsonRecord;
  },
) {
  const blockedAt = nowIso();
  const result = db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(
    PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
    PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
    blockedAt,
    row.task_id,
  );
  if (result.changes === 0) {
    return false;
  }
  const blockedAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    status: 'blocked',
    blockedReason: PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
    activityEvent: {
      activity_kind: 'progress_first_anti_spin_admission_gate',
      activity_status: 'blocked',
      blocked_reason: PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
      lineage: input.lineage,
      authority_boundary: progressFirstAuthorityBoundary(),
    },
  });
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_progress_first_anti_spin_blocked',
    source: input.source,
    payload: {
      reason: PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
      lineage: input.lineage,
      blocked_stage_attempt_ids: blockedAttempts.map((attempt) => attempt.stage_attempt_id),
      authority_boundary: progressFirstAuthorityBoundary(),
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'warning',
    title: 'Progress-first owner delta required',
    body: `${row.domain_id}:${row.task_kind} needs a deliverable owner receipt, domain typed blocker, human override, or new source payload before another provider attempt.`,
    payload: {
      reason: PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON,
    },
  });
  return true;
}

export function applyProgressFirstAntiSpinGate(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  input: {
    source: string;
    threshold?: number;
  },
) {
  const threshold = input.threshold ?? DEFAULT_ANTI_SPIN_REPEAT_THRESHOLD;
  const rows: FamilyRuntimeTaskRow[] = [];
  let blockedCount = 0;
  for (const row of candidateRows) {
    const decision = evaluateProgressFirstAntiSpinGate(db, row, threshold);
    if (decision.status === 'blocked' && decision.lineage) {
      const blocked = blockTaskForProgressFirstAntiSpin(db, row, {
        source: input.source,
        lineage: decision.lineage,
      });
      if (blocked) {
        blockedCount += 1;
        continue;
      }
    }
    rows.push(row);
  }
  return {
    rows,
    blocked_count: blockedCount,
    threshold,
  };
}
