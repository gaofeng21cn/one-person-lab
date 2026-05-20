import type { runAgentLabSuite } from './agent-lab.ts';

export function agentLabRefSummary(result: ReturnType<typeof runAgentLabSuite>) {
  return {
    surface_kind: 'opl_agent_lab_ref_summary',
    suite_id: result.suite_id,
    status: result.status,
    task_refs: result.refs.task_refs,
    scorecard_refs: result.refs.domain_quality_scorecard_refs,
    recovery_probe_refs: result.refs.recovery_probe_refs,
    improvement_candidate_refs: result.refs.improvement_candidate_refs,
    promotion_gate_refs: result.refs.promotion_gate_refs,
    production_evidence_gate_result_refs: result.refs.production_evidence_gate_result_refs,
    production_evidence_gate_refs: result.refs.production_evidence_gate_refs,
    production_evidence_owner_route_refs: result.refs.production_evidence_owner_route_refs,
    production_evidence_typed_blocker_refs: result.refs.production_evidence_typed_blocker_refs,
    production_evidence_required_receipt_refs: result.refs.production_evidence_required_receipt_refs,
    blocked_run_count: result.summary.blocked_run_count,
    authority_boundary: result.authority_boundary,
  };
}
