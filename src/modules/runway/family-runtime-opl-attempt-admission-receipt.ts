import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import { stringList } from '../../kernel/json-record.ts';

export const OPL_ATTEMPT_ADMISSION_REQUESTED_REASON = 'opl_attempt_admission_requested';
export const OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON = 'provider_attempt_start_pending';
export const MAS_DOMAIN_OWNER_ANSWER_OBSERVED_REASON = 'mas_domain_owner_answer_observed';
export const MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON = 'mas_owner_answer_typed_blocker_observed';
export { optionalString };

export type MasDomainOwnerAnswerObservation = {
  reason: typeof MAS_DOMAIN_OWNER_ANSWER_OBSERVED_REASON | typeof MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON;
  answer_kind: string;
  refs: string[];
  evidence_paths: string[];
};

const ACCEPTED_OWNER_ANSWER_KIND_BY_FIELD = new Map([
  ['domain_owner_receipt_ref', 'domain_owner_receipt_ref'],
  ['domain_owner_receipt_refs', 'domain_owner_receipt_ref'],
  ['owner_receipt_ref', 'domain_owner_receipt_ref'],
  ['owner_receipt_refs', 'domain_owner_receipt_ref'],
  ['quality_gate_receipt_ref', 'quality_gate_receipt_ref'],
  ['quality_gate_receipt_refs', 'quality_gate_receipt_ref'],
  ['typed_blocker_ref', 'typed_blocker_ref'],
  ['typed_blocker_refs', 'typed_blocker_ref'],
  ['latest_typed_blocker_ref', 'typed_blocker_ref'],
  ['stable_typed_blocker_refs', 'typed_blocker_ref'],
  ['domain_owned_typed_blocker_refs', 'typed_blocker_ref'],
  ['human_gate_ref', 'human_gate_ref'],
  ['human_gate_refs', 'human_gate_ref'],
  ['route_back_evidence_ref', 'route_back_evidence_ref'],
  ['route_back_evidence_refs', 'route_back_evidence_ref'],
  ['owner_answer_ref', 'domain_owner_receipt_ref'],
  ['owner_answer_refs', 'domain_owner_receipt_ref'],
  ['latest_owner_answer_ref', 'domain_owner_receipt_ref'],
]);

const ACCEPTED_OWNER_ANSWER_KINDS = new Set([
  'domain_owner_receipt_ref',
  'domain_owner_receipt',
  'quality_gate_receipt_ref',
  'quality_gate_receipt',
  'typed_blocker_ref',
  'typed_blocker',
  'human_gate_ref',
  'human_gate',
  'route_back_evidence_ref',
  'route_back_evidence',
]);

const OWNER_ANSWER_CONTAINER_KEYS = [
  'current_work_unit',
  'current_owner_delta',
  'current_execution_envelope',
  'required_output_contract',
  'state',
  'owner_answer_binding',
  'hard_gate',
  'dispatch',
  'result',
  'route_impact',
  'closeout_packet',
  'output',
  'domain_dispatch_evidence_record_payload',
  'record_payload',
  'opl_runtime_action_execute_payload',
];

export function recordValue(value: unknown) {
  return isRecord(value) ? value : null;
}

function normalizeOwnerAnswerKind(value: unknown) {
  const text = optionalString(value);
  if (!text || !ACCEPTED_OWNER_ANSWER_KINDS.has(text)) {
    return null;
  }
  if (text === 'typed_blocker') {
    return 'typed_blocker_ref';
  }
  if (text === 'domain_owner_receipt') {
    return 'domain_owner_receipt_ref';
  }
  if (text === 'quality_gate_receipt') {
    return 'quality_gate_receipt_ref';
  }
  if (text === 'human_gate') {
    return 'human_gate_ref';
  }
  if (text === 'route_back_evidence') {
    return 'route_back_evidence_ref';
  }
  return text;
}

function observationReason(answerKind: string) {
  return answerKind === 'typed_blocker_ref'
    ? MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON
    : MAS_DOMAIN_OWNER_ANSWER_OBSERVED_REASON;
}

function observationFromRecord(
  record: Record<string, unknown>,
  path: string,
): MasDomainOwnerAnswerObservation | null {
  const currentWorkUnitStatus = optionalString(record.status);
  if (currentWorkUnitStatus === 'typed_blocker') {
    const refs = [
      optionalString(record.typed_blocker_ref),
      optionalString(record.latest_typed_blocker_ref),
      ...stringList(record.typed_blocker_refs),
    ].filter((entry): entry is string => Boolean(entry));
    if (refs.length === 0) {
      return null;
    }
    return {
      reason: MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON,
      answer_kind: 'typed_blocker_ref',
      refs,
      evidence_paths: [`${path}.status`],
    };
  }

  const explicitKind = normalizeOwnerAnswerKind(record.answer_kind)
    ?? normalizeOwnerAnswerKind(record.owner_answer_kind)
    ?? normalizeOwnerAnswerKind(record.accepted_answer_kind);
  if (explicitKind) {
    const refs = [
      optionalString(record.owner_answer_ref),
      optionalString(record.latest_owner_answer_ref),
      optionalString(record.typed_blocker_ref),
      optionalString(record.latest_typed_blocker_ref),
      ...stringList(record.owner_answer_refs),
      ...stringList(record.typed_blocker_refs),
    ].filter((entry): entry is string => Boolean(entry));
    if (refs.length === 0) {
      return null;
    }
    return {
      reason: observationReason(explicitKind),
      answer_kind: explicitKind,
      refs,
      evidence_paths: [`${path}.answer_kind`],
    };
  }

  for (const [field, answerKind] of ACCEPTED_OWNER_ANSWER_KIND_BY_FIELD.entries()) {
    const refs = [
      optionalString(record[field]),
      ...stringList(record[field]),
    ].filter((entry): entry is string => Boolean(entry));
    if (refs.length === 0) {
      continue;
    }
    return {
      reason: observationReason(answerKind),
      answer_kind: answerKind,
      refs,
      evidence_paths: [`${path}.${field}`],
    };
  }

  return null;
}

function mergeObservation(
  left: MasDomainOwnerAnswerObservation | null,
  right: MasDomainOwnerAnswerObservation | null,
): MasDomainOwnerAnswerObservation | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  const answerKind = left.answer_kind === 'typed_blocker_ref' || right.answer_kind === 'typed_blocker_ref'
    ? 'typed_blocker_ref'
    : left.answer_kind;
  return {
    reason: observationReason(answerKind),
    answer_kind: answerKind,
    refs: [...new Set([...left.refs, ...right.refs])],
    evidence_paths: [...new Set([...left.evidence_paths, ...right.evidence_paths])],
  };
}

function ownerAnswerObservationInValue(
  value: unknown,
  path: string,
  depth: number,
): MasDomainOwnerAnswerObservation | null {
  if (depth > 6) {
    return null;
  }
  const record = recordValue(value);
  if (!record) {
    return null;
  }
  let observed = observationFromRecord(record, path);
  for (const key of OWNER_ANSWER_CONTAINER_KEYS) {
    const nested = recordValue(record[key]);
    if (!nested) {
      continue;
    }
    observed = mergeObservation(
      observed,
      ownerAnswerObservationInValue(nested, `${path}.${key}`, depth + 1),
    );
  }
  return observed;
}

export function masDomainOwnerAnswerObservationFromRecords(
  records: Array<{ source: string; value: Record<string, unknown> | null | undefined }>,
): MasDomainOwnerAnswerObservation | null {
  return records.reduce<MasDomainOwnerAnswerObservation | null>((observed, record) => (
    mergeObservation(observed, ownerAnswerObservationInValue(record.value, record.source, 0))
  ), null);
}
