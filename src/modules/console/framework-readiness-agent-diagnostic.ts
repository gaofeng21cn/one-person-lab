import { buildAgentReadinessSummary } from './agent-readiness.ts';
import {
  frameworkReadinessAuthorityBoundary,
  frameworkReadinessDiagnosticFailure,
} from './framework-readiness-diagnostics.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from './framework-readiness-source-commands.ts';
import { record } from './framework-readiness-values.ts';

export function buildAgentReadinessDiagnostic() {
  try {
    return {
      readiness: record(buildAgentReadinessSummary(['--family-defaults']).agent_readiness),
      failure: null,
    };
  } catch (error) {
    const failure = frameworkReadinessDiagnosticFailure('agents_readiness', SOURCE_COMMANDS.agents_readiness, error);
    return {
      readiness: {
        surface_kind: 'opl_agent_readiness_summary',
        owner: 'one-person-lab',
        detail_level: 'summary',
        status: 'diagnostic_unavailable',
        summary: {
          structural_conformance_status: 'diagnostic_unavailable',
          conformance_passed_count: 0,
          conformance_blocked_count: 0,
          agent_readiness_production_evidence_tail_count: 0,
          agent_readiness_production_evidence_tail_policy:
            'diagnostic_unavailable_not_a_structural_or_domain_ready_claim',
          diagnostic_failure_count: 1,
        },
        attention_first_payload: {
          surface_kind: 'opl_agent_readiness_attention_first_payload',
          status: 'diagnostic_unavailable',
          summary: {
            structural_conformance_status: 'diagnostic_unavailable',
            blocker_count: 1,
            warning_count: 0,
            recommendation_count: 0,
            production_evidence_tail_count: 0,
          },
          blockers: [{
            blocker_id: 'agent_readiness_diagnostic_unavailable',
            count: 1,
            route_ref: 'opl agents readiness --family-defaults --json',
          }],
          warnings: [],
          recommendations: [],
          next_safe_actions: [{
            action_id: 'inspect_agent_readiness_diagnostic',
            command: 'opl agents readiness --family-defaults --json',
            authority: 'diagnostic_only',
          }],
          kernel_floor_ref: '/agent_readiness/kernel_floor',
          diagnostic_drilldown_refs: ['/agent_readiness/conformance_report'],
          claim_policy:
            'attention_payload_reports_operator_work_only_and_emits_no_domain_quality_artifact_or_production_ready_verdict',
        },
        diagnostic_failure: failure,
        authority_boundary: frameworkReadinessAuthorityBoundary(),
      },
      failure,
    };
  }
}
