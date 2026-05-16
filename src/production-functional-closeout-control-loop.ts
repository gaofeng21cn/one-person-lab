type JsonRecord = Record<string, unknown>;

type ControlLoopInput = {
  attempts: Array<{
    status: string;
  }>;
  domainBreakdown: JsonRecord[];
  operatorActionRouting: {
    summary: {
      action_count: number;
    };
    actions: Array<{
      command_or_surface_ref: string;
    }>;
  };
};

function recordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function controlLoopAuthorityBoundary() {
  return {
    opl: 'refs_only_control_loop_projection',
    domain: 'truth_quality_action_receipt_owner',
    provider: 'runtime_completion_owner_not_domain_ready_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

export function buildProductionCloseoutControlLoopSummary(input: ControlLoopInput) {
  const sourceRefs = input.domainBreakdown
    .filter((domain) =>
      Number(domain.attempt_count ?? 0) > 0
      || Number(domain.operator_action_route_count ?? 0) > 0
      || recordList(domain.typed_blockers).length > 0
      || Number(domain.transition_bridge_typed_blocker_count ?? 0) > 0
    )
    .map((domain) => `/stage_attempt_evidence/domain_breakdown/${domain.domain_id}`);
  const receiptRefs = uniqueStrings(input.domainBreakdown.flatMap((domain) => [
    ...stringList(domain.owner_receipt_refs),
    ...stringList(domain.no_regression_evidence_refs),
    ...stringList(domain.lifecycle_domain_receipt_refs),
    ...stringList(domain.writeback_receipt_refs),
    ...stringList(domain.transition_bridge_receipt_refs),
    ...stringList(domain.transition_bridge_owner_receipt_refs),
    ...stringList(domain.transition_bridge_no_regression_evidence_refs),
  ]));
  const blockerCount = input.domainBreakdown.reduce((count, domain) =>
    count + recordList(domain.typed_blockers).length + Number(domain.transition_bridge_typed_blocker_count ?? 0), 0
  );
  return {
    surface_kind: 'opl_stage_attempt_control_loop_summary',
    projection_scope: 'production_functional_closeout',
    projection_policy: 'refs_only_no_domain_action_no_domain_truth',
    summary: {
      attempt_count: input.attempts.length,
      action_route_count: input.operatorActionRouting.summary.action_count,
      receipt_ref_count: receiptRefs.length,
      blocker_count: blockerCount,
      human_gate_count: input.attempts.filter((attempt) => attempt.status === 'human_gate').length,
      dead_letter_count: input.attempts.filter((attempt) => attempt.status === 'dead_lettered').length,
      domain_with_action_route_count: input.domainBreakdown.filter((domain) =>
        Number(domain.operator_action_route_count ?? 0) > 0
      ).length,
      domain_with_blocker_count: input.domainBreakdown.filter((domain) =>
        recordList(domain.typed_blockers).length > 0 || Number(domain.transition_bridge_typed_blocker_count ?? 0) > 0
      ).length,
    },
    receipt_refs: receiptRefs,
    action_route_refs: uniqueStrings(input.operatorActionRouting.actions.map((action) => action.command_or_surface_ref)),
    source_refs: sourceRefs,
    authority_boundary: controlLoopAuthorityBoundary(),
  };
}
