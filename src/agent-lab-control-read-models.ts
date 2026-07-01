import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from './family-runtime-ids.ts';

const AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOrDefault(values: string[] | undefined, defaultValues: string[]) {
  const refs = unique(values ?? defaultValues);
  return refs.length > 0 ? refs : defaultValues;
}

type DomainFeedbackSelfEvolutionInput = {
  sourceRefs?: string[];
  externalSuiteRefs?: string[];
  developerWorkOrderCandidateRefs?: string[];
  completionRefs?: string[];
  blockerRefs?: string[];
};

type FeedbackWorkOrderStatus = 'queued' | 'runnable' | 'completed_or_blocker';

function feedbackWorkOrderItem(input: {
  workOrderRef: string;
  domainId: string;
  status: FeedbackWorkOrderStatus;
  triggerRef: string;
  externalSuiteRef?: string;
  developerWorkOrderCandidateRef?: string;
  completionRef?: string;
  blockerRef?: string;
}) {
  const refFields = [
    input.triggerRef,
    input.externalSuiteRef,
    input.developerWorkOrderCandidateRef,
    input.completionRef,
    input.blockerRef,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_agent_lab_feedback_work_order_status_item',
    work_order_ref: input.workOrderRef,
    domain_id: input.domainId,
    status: input.status,
    state: input.status,
    trigger_ref: input.triggerRef,
    external_suite_ref: input.externalSuiteRef ?? null,
    developer_work_order_candidate_ref: input.developerWorkOrderCandidateRef ?? null,
    completion_ref: input.completionRef ?? null,
    blocker_ref: input.blockerRef ?? null,
    ref_fields: refFields,
    refs_only: true,
    runnable: input.status === 'runnable',
    terminal: input.status === 'completed_or_blocker',
    action_route_ref: input.status === 'runnable'
      ? `work-order-execute-candidate:${input.domainId}/${input.workOrderRef.split(':').pop()}`
      : null,
    execution_surface: input.status === 'runnable' ? 'opl work-order execute' : null,
    execution_precondition: input.status === 'runnable'
      ? 'materialized_developer_work_order_file_required'
      : 'not_runnable_from_projection',
    terminal_outcome: input.status === 'completed_or_blocker'
      ? input.blockerRef
        ? 'blocked_with_domain_owned_typed_blocker_ref'
        : 'completed_refs_observed'
      : null,
    authority_boundary: AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabDomainFeedbackSelfEvolutionReadModel(
  input: DomainFeedbackSelfEvolutionInput = {},
) {
  const sourceRefs = unique(input.sourceRefs ?? []);
  const externalSuiteRefs = refsOrDefault(input.externalSuiteRefs, [
    'external-suite-ref:mas/paper-mission-feedback',
  ]);
  const developerWorkOrderCandidateRefs = refsOrDefault(input.developerWorkOrderCandidateRefs, [
    'developer-work-order-candidate-ref:mas/paper-mission-feedback-repair',
  ]);
  const completionRefs = refsOrDefault(input.completionRefs, [
    'work-order-completion-ref:agent-lab/feedback-loop/no-domain-write-proof',
  ]);
  const blockerRefs = refsOrDefault(input.blockerRefs, [
    'typed-blocker-ref:domain-owner/feedback-work-order-owner-required',
  ]);

  const queued = feedbackWorkOrderItem({
    workOrderRef: 'feedback-work-order:mas/external-suite-feedback-intake',
    domainId: 'med-autoscience',
    status: 'queued',
    triggerRef: externalSuiteRefs[0],
    externalSuiteRef: externalSuiteRefs[0],
  });
  const runnable = feedbackWorkOrderItem({
    workOrderRef: 'feedback-work-order:mas/developer-work-order-candidate',
    domainId: 'med-autoscience',
    status: 'runnable',
    triggerRef: developerWorkOrderCandidateRefs[0],
    externalSuiteRef: externalSuiteRefs[0],
    developerWorkOrderCandidateRef: developerWorkOrderCandidateRefs[0],
  });
  const completed = feedbackWorkOrderItem({
    workOrderRef: 'feedback-work-order:agent-lab/completed-or-blocker-readback',
    domainId: 'med-autoscience',
    status: 'completed_or_blocker',
    triggerRef: completionRefs[0] ?? blockerRefs[0],
    externalSuiteRef: externalSuiteRefs[0],
    developerWorkOrderCandidateRef: developerWorkOrderCandidateRefs[0],
    completionRef: completionRefs[0],
    blockerRef: blockerRefs[0],
  });
  const workOrderStatusItems = [queued, runnable, completed];

  return {
    surface_kind: 'opl_agent_lab_domain_feedback_self_evolution_read_model',
    version: 'opl-agent-lab.v1.domain-feedback-self-evolution',
    read_model_id: stableId('oaldf', [
      sourceRefs,
      externalSuiteRefs,
      developerWorkOrderCandidateRefs,
      completionRefs,
      blockerRefs,
      workOrderStatusItems.map((item) => item.work_order_ref),
    ]),
    status: 'work_order_status_projection_ready',
    refs_only: true,
    intake_role: 'refs_only_external_suite_and_developer_work_order_candidate_projection',
    accepted_input_ref_kinds: [
      'domain_feedback_external_suite_ref',
      'developer_work_order_candidate_ref',
      'work_order_completion_ref',
      'domain_owned_typed_blocker_ref',
    ],
    status_shape: ['queued', 'runnable', 'completed_or_blocker'],
    source_refs: sourceRefs,
    external_suite_refs: externalSuiteRefs,
    developer_work_order_candidate_refs: developerWorkOrderCandidateRefs,
    completion_refs: completionRefs,
    blocker_refs: blockerRefs,
    work_order_status_items: workOrderStatusItems,
    status_buckets: {
      queued: workOrderStatusItems
        .filter((item) => item.status === 'queued')
        .map((item) => item.work_order_ref),
      runnable: workOrderStatusItems
        .filter((item) => item.status === 'runnable')
        .map((item) => item.work_order_ref),
      completed_or_blocker: workOrderStatusItems
        .filter((item) => item.status === 'completed_or_blocker')
        .map((item) => item.work_order_ref),
    },
    summary: {
      work_order_count: workOrderStatusItems.length,
      queued_count: workOrderStatusItems.filter((item) => item.status === 'queued').length,
      runnable_count: workOrderStatusItems.filter((item) => item.status === 'runnable').length,
      completed_or_blocker_count: workOrderStatusItems
        .filter((item) => item.status === 'completed_or_blocker').length,
      external_suite_ref_count: externalSuiteRefs.length,
      developer_work_order_candidate_ref_count: developerWorkOrderCandidateRefs.length,
      completion_ref_count: completionRefs.length,
      blocker_ref_count: blockerRefs.length,
    },
    app_projection: {
      surface_kind: 'opl_agent_lab_feedback_work_order_app_projection',
      queue_source_ref: 'agent_lab.domain_feedback_self_evolution.work_order_status_items',
      app_state_ref: 'app_state.operator.workbench.agent_lab_feedback_self_evolution',
      action_surface: 'opl work-order execute',
      action_surface_is_existing_primitive: true,
      creates_runner_or_queue: false,
      writes_runtime_db: false,
      writes_provider_queue: false,
      writes_domain_truth: false,
    },
    non_goals: [
      'second_runner_or_queue',
      'domain_truth_write',
      'owner_receipt_creation',
      'typed_blocker_body_creation',
      'human_gate_body_creation',
      'provider_queue_mutation',
      'runtime_db_mutation',
    ],
    authority_boundary: {
      ...AGENT_LAB_CONTROL_AUTHORITY_BOUNDARY,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_create_human_gate: false,
      can_write_provider_queue: false,
      can_write_runtime_db: false,
    },
  };
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
