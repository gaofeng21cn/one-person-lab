type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.map(text).filter((entry): entry is string => Boolean(entry))
    : [];
}

const ACCEPTED_CLOSEOUT_OWNER_ANSWER_KINDS = [
  'owner_receipt',
  'quality_gate_receipt',
  'typed_blocker',
  'human_gate',
  'route_back_evidence',
] as const;

export function closedStageRunOwnerAnswer(stageRunCockpit: JsonRecord) {
  const authorization = record(stageRunCockpit.execution_authorization);
  const closeoutBinding = record(authorization.closeout_binding);
  const ownerAnswerRef = text(closeoutBinding.owner_answer_ref);
  const ownerAnswerKind = text(closeoutBinding.owner_answer_kind);
  const closeoutBindingBlockers = strings(authorization.closeout_binding_blockers);
  if (
    authorization.execution_authorized !== true
    || text(authorization.status) !== 'authorized'
    || text(authorization.phase) !== 'closeout'
    || closeoutBindingBlockers.length > 0
    || !ownerAnswerRef
    || !ACCEPTED_CLOSEOUT_OWNER_ANSWER_KINDS.includes(
      ownerAnswerKind as typeof ACCEPTED_CLOSEOUT_OWNER_ANSWER_KINDS[number],
    )
  ) {
    return null;
  }
  return {
    ownerAnswerRef,
    ownerAnswerKind,
    stageRunCloseoutBindingRef: '/stage_run_cockpit/execution_authorization/closeout_binding',
    stageRunCloseoutBindingPolicy:
      'stage_run_closeout_binding_authorized_domain_owned_owner_answer_refs_only_no_quality_or_domain_ready_claim',
  };
}

export function currentOwnerDeltaWithClosedStageRunAnswer<T extends JsonRecord>(
  currentOwnerDelta: T,
  stageRunCockpit: JsonRecord,
): T {
  const closeout = closedStageRunOwnerAnswer(stageRunCockpit);
  if (!closeout) {
    return currentOwnerDelta;
  }
  return {
    ...currentOwnerDelta,
    latest_owner_answer_ref: closeout.ownerAnswerRef,
    latest_owner_answer_kind: closeout.ownerAnswerKind,
    stage_run_closeout_binding_ref: closeout.stageRunCloseoutBindingRef,
    stage_run_closeout_binding_policy: closeout.stageRunCloseoutBindingPolicy,
    hard_gate: {
      ...record(currentOwnerDelta.hard_gate),
      state: 'domain_owner_answer_recorded',
      human_or_domain_owner_required: false,
      owner_answer_ref: closeout.ownerAnswerRef,
      owner_answer_kind: closeout.ownerAnswerKind,
      domain_ready_authorized: false,
      quality_or_export_authorized: false,
    },
  };
}

export function readModelWithClosedStageRunAnswer<T extends JsonRecord>(
  readModel: T,
  currentOwnerDelta: JsonRecord,
  stageRunCockpit: JsonRecord,
): T {
  const closeout = closedStageRunOwnerAnswer(stageRunCockpit);
  if (!closeout) {
    return readModel;
  }
  return {
    ...readModel,
    current_owner_delta: currentOwnerDelta,
    next_safe_action_or_none: null,
    default_summary: {
      ...record(readModel.default_summary),
      hard_gate: record(currentOwnerDelta.hard_gate),
      next_action_kind: null,
      next_action_owner: text(currentOwnerDelta.current_owner),
      latest_owner_answer_ref: closeout.ownerAnswerRef,
    },
  };
}
