import {
  record,
  recordList,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import { FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS } from '../family-runtime-queue-projection-boundary.ts';

type ReviewRepairAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  next_owner: string | null;
  attention_flags: string[];
  human_gate_refs: string[];
  human_gate_ledger: JsonRecord[];
  resume_ledger: JsonRecord[];
  rejected_writes: unknown[];
  [FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter]: JsonRecord | null;
  controlled_apply_contract: JsonRecord;
  lifecycle_primitives: JsonRecord;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function controlledApplyBlockers(attempt: ReviewRepairAttempt) {
  return recordList(attempt.controlled_apply_contract.typed_blockers).map((blocker, index) => ({
    item_kind: 'controlled_apply_blocker',
    item_id: `repair:${attempt.stage_attempt_id}:controlled-apply:${index}`,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: attempt.next_owner,
    blocker,
    repair_target: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
  }));
}

function lifecycleBlockers(attempt: ReviewRepairAttempt) {
  const guardedApply = record(attempt.lifecycle_primitives.guarded_apply_proof);
  return recordList(guardedApply.actions)
    .map((action) => ({
      action,
      blocker: recordList([action.blocker])[0] ?? null,
    }))
    .filter((entry): entry is { action: JsonRecord; blocker: JsonRecord } => Boolean(entry.blocker))
    .map(({ action, blocker }, index) => ({
      item_kind: 'lifecycle_blocker',
      item_id: `repair:${attempt.stage_attempt_id}:lifecycle:${index}`,
      stage_attempt_id: attempt.stage_attempt_id,
      domain_id: attempt.domain_id,
      stage_id: attempt.stage_id,
      next_owner: attempt.next_owner,
      blocker,
      repair_target: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
    }));
}

function humanGateItems(attempt: ReviewRepairAttempt) {
  const refs = uniqueStrings([
    ...attempt.human_gate_refs,
    ...attempt.human_gate_ledger.map((entry) => {
      const payload = record(entry.payload);
      return firstString(payload.human_gate_ref, payload.gate_ref, payload.resume_token);
    }),
  ].filter((entry): entry is string => Boolean(entry)));
  if (!attempt.attention_flags.includes('human_gate') && refs.length === 0) {
    return [];
  }
  return [{
    item_kind: 'human_gate_review',
    item_id: `repair:${attempt.stage_attempt_id}:human-gate`,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: attempt.next_owner,
    human_gate_refs: refs,
    repair_target: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
  }];
}

function rejectedWriteItems(attempt: ReviewRepairAttempt) {
  return recordList(attempt.rejected_writes).map((rejection, index) => ({
    item_kind: 'rejected_write_review',
    item_id: `repair:${attempt.stage_attempt_id}:rejected-write:${index}`,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: attempt.next_owner,
    rejection,
    repair_target: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
  }));
}

function deadLetterItems(attempt: ReviewRepairAttempt) {
  const deadLetter = attempt[FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter];
  if (!attempt.attention_flags.includes('dead_lettered') && !deadLetter) {
    return [];
  }
  return [{
    item_kind: 'dead_letter_repair',
    item_id: `repair:${attempt.stage_attempt_id}:dead-letter`,
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: attempt.next_owner,
    [FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter]: deadLetter,
    repair_target: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
  }];
}

export function buildAttemptReviewRepairQueue(attempt: ReviewRepairAttempt) {
  const items = [
    ...humanGateItems(attempt),
    ...deadLetterItems(attempt),
    ...rejectedWriteItems(attempt),
    ...controlledApplyBlockers(attempt),
    ...lifecycleBlockers(attempt),
  ];
  return {
    surface_kind: 'opl_review_repair_queue_projection',
    queue_scope: 'stage_attempt',
    transport_role: 'generic_review_repair_transport',
    availability: items.length > 0 ? 'attention_items_observed' : 'no_review_repair_items',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: attempt.next_owner,
    summary: {
      item_count: items.length,
      human_gate_count: items.filter((item) => item.item_kind === 'human_gate_review').length,
      rejected_write_count: items.filter((item) => item.item_kind === 'rejected_write_review').length,
      dead_letter_count: items.filter((item) => item.item_kind === 'dead_letter_repair').length,
      blocker_count: items.filter((item) =>
        item.item_kind === 'controlled_apply_blocker' || item.item_kind === 'lifecycle_blocker'
      ).length,
    },
    items,
    authority_boundary: {
      opl: 'repair_target_transport_and_operator_queue_only',
      domain: 'review_repair_quality_and_apply_decision_owner',
      can_decide_repair: false,
      can_authorize_review_verdict: false,
      can_write_domain_truth: false,
    },
  };
}

export function buildWorkbenchReviewRepairQueue(attempts: ReviewRepairAttempt[]) {
  const perAttempt = attempts.map(buildAttemptReviewRepairQueue);
  const items = perAttempt.flatMap((queue) => queue.items);
  return {
    surface_kind: 'opl_review_repair_queue_projection',
    queue_scope: 'stage_attempt_workbench',
    transport_role: 'generic_review_repair_transport',
    availability: items.length > 0 ? 'attention_items_observed' : 'no_review_repair_items',
    summary: {
      attempt_count: attempts.length,
      attempt_with_queue_item_count: perAttempt.filter((queue) => queue.items.length > 0).length,
      item_count: items.length,
      human_gate_count: items.filter((item) => item.item_kind === 'human_gate_review').length,
      rejected_write_count: items.filter((item) => item.item_kind === 'rejected_write_review').length,
      dead_letter_count: items.filter((item) => item.item_kind === 'dead_letter_repair').length,
      blocker_count: items.filter((item) =>
        item.item_kind === 'controlled_apply_blocker' || item.item_kind === 'lifecycle_blocker'
      ).length,
    },
    items,
    attempts: perAttempt,
    authority_boundary: {
      opl: 'repair_target_transport_and_operator_queue_only',
      domain: 'review_repair_quality_and_apply_decision_owner',
      can_decide_repair: false,
      can_authorize_review_verdict: false,
      can_write_domain_truth: false,
    },
  };
}
