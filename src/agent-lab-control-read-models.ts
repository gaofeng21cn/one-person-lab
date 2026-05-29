import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from './family-runtime-ids.ts';

const AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function buildAgentLabLogDrivenMechanismCandidateReadModel(sourceRefs: string[] = []) {
  const logEvidence = {
    usage_log_refs: [
      'usage-log-ref:agent-lab/stage-attempt-ledger',
      'usage-log-ref:agent-lab/operator-workbench-actions',
    ],
    failure_mode_refs: [
      'failure-mode-ref:agent-lab/retry-loop-stall',
      'failure-mode-ref:agent-lab/owner-route-ambiguity',
    ],
    user_interrupt_refs: [
      'user-interrupt-ref:agent-lab/stop-loss-request',
      'user-interrupt-ref:agent-lab/manual-route-correction',
    ],
    convergence_iteration_refs: [
      'convergence-iteration-ref:agent-lab/mechanism-candidate-round-1',
      'convergence-iteration-ref:agent-lab/mechanism-candidate-round-2',
    ],
    tool_failure_refs: [
      'tool-failure-ref:agent-lab/provider-requery-timeout',
      'tool-failure-ref:agent-lab/connector-export-missing-ref',
    ],
    blocker_refs: [
      'blocker-ref:agent-lab/forbidden-authority-claim',
      'blocker-ref:agent-lab/missing-owner-route',
    ],
    source_refs: sourceRefs,
  };
  const candidateRefs = [
    {
      candidate_ref: 'mechanism-candidate-ref:agent-lab/prompt-log-driven-routing',
      candidate_kind: 'prompt',
      target_surface_ref: 'mechanism-surface:agent-lab/prompt',
      risk_tier: 'low_risk',
      evidence_refs: [
        logEvidence.usage_log_refs[1],
        logEvidence.user_interrupt_refs[1],
      ],
    },
    {
      candidate_ref: 'mechanism-candidate-ref:agent-lab/skill-activation-contract',
      candidate_kind: 'skill',
      target_surface_ref: 'mechanism-surface:agent-lab/stage-policy',
      risk_tier: 'medium_risk',
      evidence_refs: [
        logEvidence.failure_mode_refs[1],
        logEvidence.blocker_refs[1],
      ],
    },
    {
      candidate_ref: 'mechanism-candidate-ref:agent-lab/rubric-gap-direct-evidence',
      candidate_kind: 'rubric_gap',
      target_surface_ref: 'mechanism-surface:agent-lab/rubric-gap',
      risk_tier: 'low_risk',
      evidence_refs: [
        logEvidence.failure_mode_refs[0],
        logEvidence.convergence_iteration_refs[0],
      ],
    },
    {
      candidate_ref: 'mechanism-candidate-ref:agent-lab/workflow-default-retry-policy',
      candidate_kind: 'workflow_default',
      target_surface_ref: 'mechanism-surface:agent-lab/tool-policy',
      risk_tier: 'medium_risk',
      evidence_refs: [
        logEvidence.tool_failure_refs[0],
        logEvidence.convergence_iteration_refs[1],
      ],
    },
  ];

  return {
    surface_kind: 'opl_agent_lab_log_driven_mechanism_candidate_read_model',
    version: 'opl-agent-lab.v1.log-driven-candidates',
    read_model_id: stableId('oallmc', [logEvidence, candidateRefs]),
    status: 'ready_for_usage_log_driven_meta_optimize',
    refs_only: true,
    log_evidence: logEvidence,
    candidate_refs: candidateRefs,
    log_mined_candidate_refs: candidateRefs.map((candidate) => candidate.candidate_ref),
    promotion_policy_ref: 'mechanism-promotion-policy:agent-lab/risk-tiered-auto-promotion',
    summary: {
      candidate_count: candidateRefs.length,
      low_risk_count: candidateRefs.filter((candidate) => candidate.risk_tier === 'low_risk').length,
      medium_risk_count: candidateRefs.filter((candidate) => candidate.risk_tier === 'medium_risk').length,
      high_risk_count: candidateRefs.filter((candidate) => candidate.risk_tier === 'high_risk').length,
      evidence_ref_count: unique(Object.values(logEvidence).flat()).length,
    },
    authority_boundary: AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabArisMaturityControlsReadModel(sourceRefs: string[] = []) {
  const effortAssuranceAxes = {
    surface_kind: 'opl_agent_lab_effort_assurance_axis_policy',
    policy_ref: 'axis-policy:agent-lab/effort-assurance',
    refs_only: true,
    effort_axis: {
      axis_ref: 'axis-ref:agent-lab/effort',
      levels: ['quick_smoke', 'standard_regression', 'deep_soak', 'owner_chain_proof'],
      selected_default_level: 'standard_regression',
      source_refs: [
        'suite:opl-agent-lab-sample-suite',
        'suite:opl-agent-lab-longline-suite',
      ],
    },
    assurance_axis: {
      axis_ref: 'axis-ref:agent-lab/assurance',
      levels: ['syntactic_ref_check', 'contract_gate', 'independent_review', 'owner_receipt_or_long_soak'],
      selected_default_level: 'contract_gate',
      required_for_promotion: [
        'contract_gate',
        'independent_review',
        'no_forbidden_write_proof',
      ],
    },
    promotion_gate_ref: 'promotion-gate:agent-lab/effort-assurance-axis',
    authority_boundary: AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
  };
  const helperInventoryDriftReport = {
    surface_kind: 'opl_agent_lab_helper_inventory_drift_report',
    report_ref: 'helper-inventory-drift-report:agent-lab/aris-patterns',
    refs_only: true,
    inventory_refs: [
      'helper-inventory-ref:agent-lab/codex-skills',
      'helper-inventory-ref:agent-lab/mcp-tools',
      'helper-inventory-ref:agent-lab/local-binaries',
    ],
    drift_guard_refs: [
      'drift-guard-ref:agent-lab/no-silent-helper-source-drift',
      'drift-guard-ref:agent-lab/helper-version-pin-current',
      'drift-guard-ref:agent-lab/helper-command-contract-current',
    ],
    drift_report_status: 'inventory_current_no_silent_drift',
    fail_policy: 'fail_closed_on_missing_inventory_or_unverified_drift',
    can_execute_helper: false,
    source_refs: sourceRefs,
    authority_boundary: AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
  };
  const failClosedInvariants = {
    surface_kind: 'opl_agent_lab_fail_closed_invariant_policy',
    policy_ref: 'fail-closed-policy:agent-lab/permissions-current-date',
    refs_only: true,
    invariant_refs: [
      'invariant-ref:agent-lab/permission-scope-declared',
      'invariant-ref:agent-lab/current-date-declared',
      'invariant-ref:agent-lab/no-silent-runtime-permission-default',
    ],
    required_context_refs: [
      'context-ref:agent-lab/current-date',
      'context-ref:agent-lab/permission-scope',
      'context-ref:agent-lab/sandbox-policy',
    ],
    missing_context_policy: 'fail_closed_with_typed_blocker_ref',
    typed_blocker_ref: 'typed-blocker-ref:agent-lab/missing-permission-or-current-date',
    owner_route_ref: 'owner-route:opl/framework-agent-lab-context',
    authority_boundary: AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
  };
  const mcpStreamReliabilityPolicy = {
    surface_kind: 'opl_agent_lab_mcp_stream_reliability_policy',
    policy_ref: 'reliability-policy:agent-lab/mcp-stream',
    refs_only: true,
    reliability_refs: [
      'reliability-ref:agent-lab/mcp-tool-result-contract',
      'reliability-ref:agent-lab/stream-event-ordering',
      'reliability-ref:agent-lab/stream-closeout-receipt',
    ],
    required_failure_outputs: [
      'typed_blocker_ref',
      'retry_or_dead_letter_ref',
      'owner_route_ref',
      'stream_replay_ref',
    ],
    no_silent_drop: true,
    retry_policy_ref: 'retry-policy:agent-lab/mcp-stream-retry',
    dead_letter_ref: 'dead-letter-ref:agent-lab/mcp-stream-unrecoverable',
    authority_boundary: AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
  };

  return {
    surface_kind: 'opl_agent_lab_aris_maturity_controls_read_model',
    version: 'opl-agent-lab.v1.aris-maturity-controls',
    read_model_id: stableId('oalamc', [
      effortAssuranceAxes,
      helperInventoryDriftReport,
      failClosedInvariants,
      mcpStreamReliabilityPolicy,
      sourceRefs,
    ]),
    status: 'ready_for_agent_lab_control_plane_consumption',
    refs_only: true,
    source_pattern_refs: [
      'aris:v0.4.11/effort-assurance-axis',
      'aris:v0.4.11/helper-drift-inventory-report',
      'aris:v0.4.11/permission-current-date-fail-closed',
      'aris:v0.4.11/mcp-stream-reliability-policy',
    ],
    runtime_dependency_required: false,
    controls: {
      effort_assurance_axes: effortAssuranceAxes,
      helper_inventory_drift_report: helperInventoryDriftReport,
      fail_closed_invariants: failClosedInvariants,
      mcp_stream_reliability_policy: mcpStreamReliabilityPolicy,
    },
    summary: {
      control_count: 4,
      effort_level_count: effortAssuranceAxes.effort_axis.levels.length,
      assurance_level_count: effortAssuranceAxes.assurance_axis.levels.length,
      helper_inventory_ref_count: helperInventoryDriftReport.inventory_refs.length,
      drift_guard_ref_count: helperInventoryDriftReport.drift_guard_refs.length,
      fail_closed_invariant_count: failClosedInvariants.invariant_refs.length,
      mcp_stream_reliability_ref_count: mcpStreamReliabilityPolicy.reliability_refs.length,
    },
    forbidden_payloads: [
      'helper_body',
      'mcp_payload_body',
      'stream_payload_body',
      'domain_truth',
      'memory_body',
      'artifact_body',
      'owner_receipt_body',
      'runtime_dependency',
    ],
    authority_boundary: AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
  };
}
