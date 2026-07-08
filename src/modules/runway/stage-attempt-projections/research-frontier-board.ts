import {
  record,
  recordList,
  stringValue as optionalString,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

type ResearchFrontierBoardAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  research_frontier_board?: JsonRecord | null;
};

type ResearchFrontierBoardItem = {
  item_id: string;
  ref: string | null;
  status: string | null;
  stage_id: string | null;
  candidate_id: string | null;
  route_family: string | null;
  rollback_target_ref: string | null;
  advisory_reason_ref: string | null;
};

const BODY_FIELD_NAMES = new Set([
  'body',
  'content',
  'payload_body',
  'domain_body',
  'candidate_body',
  'hypothesis_body',
  'evidence_body',
  'memory_body',
  'artifact_body',
  'full_prose',
]);

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const found = optionalString(value);
    if (found) {
      return found;
    }
  }
  return null;
}

function countBy(values: Array<string | null>) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = value ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function forbiddenBodyFieldCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count, entry) => count + forbiddenBodyFieldCount(entry), 0);
  }
  if (!value || typeof value !== 'object') {
    return 0;
  }
  return Object.entries(value).reduce((count, [key, entry]) =>
    count + (BODY_FIELD_NAMES.has(key) ? 1 : forbiddenBodyFieldCount(entry)), 0);
}

function boardItems(board: JsonRecord) {
  return [
    ...recordList(board.items),
    ...recordList(board.frontier_items),
    ...recordList(board.frontier_refs),
    ...recordList(board.candidate_routes),
    ...recordList(board.stage_candidates).map((candidate) => ({
      ...candidate,
      ref: candidate.candidate_ref,
      advisory_reason_ref: candidate.rationale_ref,
    })),
  ];
}

function projectionItem(
  attempt: ResearchFrontierBoardAttempt,
  item: JsonRecord,
  index: number,
): ResearchFrontierBoardItem | null {
  const ref = firstString(
    item.ref,
    item.frontier_ref,
    item.candidate_ref,
    item.memory_ref,
    item.route_ref,
  );
  const status = firstString(item.status, item.candidate_status);
  const explicitStageId = firstString(item.stage_id, item.stage);
  const candidateId = firstString(item.candidate_id, item.candidateId, item.id);
  const routeFamily = firstString(item.route_family, item.route_kind, item.route);
  const rollbackTargetRef = firstString(item.rollback_target_ref, item.rollback_ref, item.rollback_target);
  const advisoryReasonRef = firstString(item.advisory_reason_ref, item.reason_ref, item.rationale_ref, item.advisory_ref);
  const hasProjectionSignal = Boolean(
    ref || status || explicitStageId || candidateId || routeFamily || rollbackTargetRef || advisoryReasonRef,
  );
  if (!hasProjectionSignal) {
    return null;
  }
  return {
    item_id: `frontier:${attempt.stage_attempt_id}:${index}`,
    ref,
    status,
    stage_id: explicitStageId ?? attempt.stage_id,
    candidate_id: candidateId,
    route_family: routeFamily,
    rollback_target_ref: rollbackTargetRef,
    advisory_reason_ref: advisoryReasonRef,
  };
}

function frontierAuthorityBoundary() {
  return {
    opl: 'frontier_board_projection_owner_only',
    domain: 'frontier_memory_route_decision_truth_owner',
    can_read_memory_body: false,
    can_write_domain_memory_body: false,
    can_accept_or_reject_memory_writeback: false,
    can_infer_route_decision: false,
    can_authorize_owner_receipt: false,
    can_authorize_typed_blocker: false,
    can_authorize_quality_verdict: false,
    can_authorize_domain_ready: false,
    can_mutate_artifact_body: false,
    can_write_domain_truth: false,
  };
}

function frontierSummary(input: {
  attempts: number;
  items: ResearchFrontierBoardItem[];
  omittedBodyFieldCount: number;
  boardRef?: string | null;
  summaryRef?: string | null;
}) {
  const rollbackTargetRefs = uniqueStrings(
    input.items.map((item) => item.rollback_target_ref).filter((ref): ref is string => Boolean(ref)),
  );
  const advisoryReasonRefs = uniqueStrings(
    input.items.map((item) => item.advisory_reason_ref).filter((ref): ref is string => Boolean(ref)),
  );
  return {
    attempt_count: input.attempts,
    item_count: input.items.length,
    status_counts: countBy(input.items.map((item) => item.status)),
    stage_counts: countBy(input.items.map((item) => item.stage_id)),
    route_family_counts: countBy(input.items.map((item) => item.route_family)),
    rollback_target_refs: rollbackTargetRefs,
    rollback_target_ref_count: rollbackTargetRefs.length,
    advisory_reason_refs: advisoryReasonRefs,
    advisory_reason_ref_count: advisoryReasonRefs.length,
    board_ref: input.boardRef ?? null,
    summary_ref: input.summaryRef ?? null,
    omitted_body_field_count: input.omittedBodyFieldCount,
    projection_policy: 'refs_status_summary_only_no_domain_body_no_route_decision_authority',
  };
}

export function buildAttemptResearchFrontierBoard(attempt: ResearchFrontierBoardAttempt) {
  const board = record(attempt.research_frontier_board);
  const boardSummary = record(board.summary);
  const rawItems = boardItems(board);
  const items = rawItems
    .map((item, index) => projectionItem(attempt, item, index))
    .filter((item): item is ResearchFrontierBoardItem => Boolean(item));
  const summaryRef = firstString(
    board.summary_ref,
    board.frontier_summary_ref,
    boardSummary.ref,
    boardSummary.summary_ref,
  );
  const boardRef = firstString(board.board_ref, board.frontier_board_ref, board.ref);
  const hasFrontierRefs = items.length > 0 || Boolean(summaryRef || boardRef);
  return {
    surface_kind: 'opl_research_frontier_board_projection',
    projection_scope: 'stage_attempt',
    renderer_role: 'generic_research_frontier_board_refs_shell',
    availability: hasFrontierRefs ? 'frontier_refs_observed' : 'no_frontier_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    summary: frontierSummary({
      attempts: 1,
      items,
      omittedBodyFieldCount: forbiddenBodyFieldCount(board),
      boardRef,
      summaryRef,
    }),
    items,
    authority_boundary: frontierAuthorityBoundary(),
  };
}

export function buildWorkbenchResearchFrontierBoard(attempts: ResearchFrontierBoardAttempt[]) {
  const perAttempt = attempts.map(buildAttemptResearchFrontierBoard);
  const items = perAttempt.flatMap((projection) => projection.items);
  return {
    surface_kind: 'opl_research_frontier_board_projection',
    projection_scope: 'stage_attempt_workbench',
    renderer_role: 'generic_research_frontier_board_refs_shell',
    availability: perAttempt.some((projection) => projection.availability === 'frontier_refs_observed')
      ? 'frontier_refs_observed'
      : 'no_frontier_refs',
    attempts: perAttempt,
    summary: frontierSummary({
      attempts: attempts.length,
      items,
      omittedBodyFieldCount: perAttempt.reduce(
        (count, projection) => count + projection.summary.omitted_body_field_count,
        0,
      ),
    }),
    items,
    authority_boundary: frontierAuthorityBoundary(),
  };
}
