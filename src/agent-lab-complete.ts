import {
  agentLabRefSummary,
  buildSampleAgentLabResult,
  runAgentLabSuite,
  type AgentLabSuite,
} from './agent-lab.ts';
import { buildLonglineAgentLabResult } from './agent-lab-longline.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
export {
  buildAgentLabArisMaturityControlsReadModel,
  buildAgentLabLogDrivenMechanismCandidateReadModel,
} from './agent-lab-control-read-models.ts';
import {
  buildAgentLabArisMaturityControlsReadModel,
  buildAgentLabLogDrivenMechanismCandidateReadModel,
} from './agent-lab-control-read-models.ts';
import { stableId } from './family-runtime-ids.ts';

const AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

const DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY = {
  ...AUTHORITY_BOUNDARY,
  opl: 'agent_lab_developer_mode_patrol_repair_route_projection_refs_only',
  can_emit_issue_or_blocker_refs: true,
  can_emit_candidate_fix_refs: true,
  can_emit_repo_worktree_branch_refs: true,
  can_emit_pr_refs: true,
  can_emit_acceptance_evidence_refs: true,
  can_emit_follow_up_queue_item_refs: true,
  writes_domain_truth: false,
  writes_domain_artifact: false,
  writes_memory_body: false,
  writes_quality_verdict: false,
  writes_owner_receipt: false,
  modifies_managed_runtime: false,
  writes_follow_up_queue_body: false,
};

const MECHANISM_EDITABLE_SURFACES = [
  {
    surface_ref: 'mechanism-surface:agent-lab/stage-policy',
    surface_kind: 'stage_policy_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:opl/framework-stage-policy',
  },
  {
    surface_ref: 'mechanism-surface:agent-lab/tool-policy',
    surface_kind: 'tool_policy_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:opl/framework-tool-policy',
  },
  {
    surface_ref: 'mechanism-surface:agent-lab/prompt',
    surface_kind: 'prompt_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:domain-owner/prompt-review',
  },
  {
    surface_ref: 'mechanism-surface:agent-lab/rubric-gap',
    surface_kind: 'rubric_gap_ref',
    edit_scope: 'candidate_ref_only',
    owner_route_ref: 'owner-route:domain-owner/quality-rubric',
  },
];

const AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY = 'risk_tiered_after_independent_ai_review';
const MECHANISM_REF = 'mechanism:agent-lab/default-stage-led-agent-mechanism';
const MECHANISM_VERSION = 'opl-agent-lab-mechanism.v1';
const NEXT_MECHANISM_VERSION = 'opl-agent-lab-mechanism.v1.canary.1';
const ROLLBACK_TARGET_REF = `mechanism-version-ref:${MECHANISM_VERSION}`;

const MECHANISM_RISK_TIERS = {
  low_risk: {
    examples: ['prompt wording', 'rubric clarification', 'workbench display metadata', 'suite metadata'],
    auto_promotion: 'auto_promote_to_stable',
    required_gates: [
      'independent_ai_review',
      'regression_suite_passed',
      'no_forbidden_write_proof',
      'rollback_target_ref',
    ],
  },
  medium_risk: {
    examples: ['stage policy', 'tool policy', 'retry policy', 'dead-letter policy', 'memory retrieval policy'],
    auto_promotion: 'auto_promote_to_canary',
    required_gates: [
      'independent_ai_review',
      'regression_suite_passed',
      'canary_observation',
      'no_forbidden_write_proof',
      'rollback_target_ref',
    ],
  },
  high_risk: {
    examples: [
      'domain truth',
      'publication verdict',
      'fundability verdict',
      'visual quality verdict',
      'artifact mutation',
      'memory accept/reject',
      'credential policy',
      'network policy',
      'write policy',
    ],
    auto_promotion: 'blocked_route_owner_or_human_gate',
    required_gates: ['domain_owner_or_human_gate'],
  },
};

function buildIndependentAiReviewReceipt(input: {
  mechanismRef?: string;
  mechanismVersion?: string;
  candidateRef?: string;
  riskTier?: 'low_risk' | 'medium_risk' | 'high_risk';
  sourceRefs?: string[];
} = {}) {
  const mechanismRef = input.mechanismRef ?? MECHANISM_REF;
  const mechanismVersion = input.mechanismVersion ?? MECHANISM_VERSION;
  const candidateRef = input.candidateRef ?? 'mechanism-candidate:agent-lab/default-stage-led-agent-mechanism/next';
  const riskTier = input.riskTier ?? 'medium_risk';
  const verdict = riskTier === 'high_risk'
    ? 'blocked_route_owner_or_human_gate'
    : 'approved_for_risk_tiered_auto_promotion';

  return {
    receipt_ref: stableId('oaliar', [mechanismRef, mechanismVersion, candidateRef, riskTier, input.sourceRefs ?? []]),
    receipt_kind: 'independent_ai_review_receipt_ref',
    reviewer_agent_ref: 'agent-ref:opl-agent-lab/independent-ai-reviewer',
    review_context_inherits_executor_context: false,
    verdict,
    risk_tier: riskTier,
    source_refs: input.sourceRefs ?? [
      'contract:opl-framework/agent-lab-contract',
      'suite:opl-agent-lab-sample-suite',
      'suite:opl-agent-lab-longline-suite',
    ],
    reviewed_refs: [
      mechanismRef,
      mechanismVersion,
      candidateRef,
      'contract:opl-framework/agent-lab-contract',
      'no-forbidden-write:agent-lab/mechanism-policy',
    ],
    blocks_domain_truth_write: true,
    blocks_memory_body_write: true,
    blocks_artifact_mutation: true,
    blocks_owner_receipt_write: true,
  };
}

function buildMechanismPromotionPolicy(independentReviewRef: string) {
  return {
    policy_ref: 'mechanism-promotion-policy:agent-lab/risk-tiered-auto-promotion',
    automatic_mechanism_promotion_ready: true,
    default_mode: 'risk_tiered_auto_promotion_with_independent_ai_review',
    human_gate_default_required: false,
    risk_tiers: MECHANISM_RISK_TIERS,
    required_gate_refs: [
      independentReviewRef,
      'regression-suite:agent-lab/mechanism-promotion',
      'no-forbidden-write:agent-lab/mechanism-policy',
      ROLLBACK_TARGET_REF,
    ],
    high_risk_owner_or_human_gate_required: true,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

function buildMechanismVersionLedger(sourceRefs: string[] = []) {
  return {
    ledger_ref: stableId('oalmvl', [MECHANISM_REF, MECHANISM_VERSION, NEXT_MECHANISM_VERSION, sourceRefs]),
    current_version: MECHANISM_VERSION,
    candidate_version: NEXT_MECHANISM_VERSION,
    versions: [
      {
        version_ref: ROLLBACK_TARGET_REF,
        mechanism_version: MECHANISM_VERSION,
        status: 'stable',
        rollback_eligible: true,
      },
      {
        version_ref: `mechanism-version-ref:${NEXT_MECHANISM_VERSION}`,
        mechanism_version: NEXT_MECHANISM_VERSION,
        status: 'canary',
        rollback_eligible: true,
      },
    ],
  };
}

function buildMechanismRollback(sourceRefs: string[] = []) {
  return {
    rollback_ref: stableId('oalmrb', [MECHANISM_REF, MECHANISM_VERSION, NEXT_MECHANISM_VERSION, sourceRefs]),
    rollback_target_ref: ROLLBACK_TARGET_REF,
    rollback_command_ref: 'command-ref:opl-agent-lab/mechanism-rollback',
    rollback_available: true,
    restores_version: MECHANISM_VERSION,
  };
}

function buildMechanismPromotionDecision(input: {
  suiteStatus?: 'passed' | 'blocked';
  riskTier?: 'low_risk' | 'medium_risk' | 'high_risk';
  independentReview?: ReturnType<typeof buildIndependentAiReviewReceipt>;
  sourceRefs?: string[];
} = {}) {
  const suiteStatus = input.suiteStatus ?? 'passed';
  const riskTier = input.riskTier ?? 'medium_risk';
  const independentReview = input.independentReview ?? buildIndependentAiReviewReceipt({ riskTier });
  const gatesPassed = suiteStatus === 'passed' && independentReview.verdict === 'approved_for_risk_tiered_auto_promotion';
  const promotionDecision = !gatesPassed
    ? 'blocked'
    : MECHANISM_RISK_TIERS[riskTier].auto_promotion;
  const promotedToStatus = promotionDecision === 'auto_promote_to_stable'
    ? 'stable'
    : promotionDecision === 'auto_promote_to_canary'
      ? 'canary'
      : 'blocked';

  return {
    automatic_mechanism_promotion_ready: gatesPassed && riskTier !== 'high_risk',
    risk_tier: riskTier,
    promotion_decision: promotionDecision,
    independent_ai_review_ref: independentReview.receipt_ref,
    promotion_receipt_ref: `mechanism-promotion-receipt:${stableId('oalmpr', [
      MECHANISM_REF,
      NEXT_MECHANISM_VERSION,
      promotionDecision,
      input.sourceRefs ?? [],
    ])}`,
    rollback_target_ref: ROLLBACK_TARGET_REF,
    canary: {
      required: riskTier === 'medium_risk',
      status: promotedToStatus === 'canary' ? 'active' : 'not_required',
      observation_ref: 'canary-observation-ref:agent-lab/mechanism-auto-promotion',
    },
    high_risk_owner_or_human_gate_required: riskTier === 'high_risk',
    promoted_to_status: promotedToStatus,
    source_refs: input.sourceRefs ?? [],
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

function buildMechanismPromotionReceipt(decision: ReturnType<typeof buildMechanismPromotionDecision>) {
  return {
    receipt_ref: decision.promotion_receipt_ref,
    receipt_kind: 'mechanism_promotion_receipt_ref',
    mechanism_ref: MECHANISM_REF,
    from_version: MECHANISM_VERSION,
    to_version: NEXT_MECHANISM_VERSION,
    risk_tier: decision.risk_tier,
    promotion_decision: decision.promotion_decision,
    promoted_to_status: decision.promoted_to_status,
    independent_ai_review_ref: decision.independent_ai_review_ref,
    rollback_target_ref: decision.rollback_target_ref,
    writes_domain_truth: false,
    writes_memory_body: false,
    mutates_artifact: false,
    writes_owner_receipt: false,
    trains_or_deploys_model_weights: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabIntegrationContractReadModel() {
  const integrationContracts = [
    {
      contract_ref: 'integration-contract:agent-lab/stage-skill-helper',
      integration_kind: 'cross_skill_stage_helper',
      activation_predicate: 'stage_attempt_refs_present && domain_agent_entry_ref_present',
      canonical_entry_ref: 'canonical-entry:opl-agent-lab/run-suite',
      artifact_verifier_ref: 'artifact-verifier:opl-agent-lab/refs-only-suite-result',
      failure_policy: 'typed_blocker_then_owner_route_retry_or_dead_letter',
      failure_outputs: {
        typed_blocker_ref: 'typed-blocker-ref:agent-lab/integration-contract-failed',
        owner_route_ref: 'owner-route:opl/framework-agent-lab',
        retry_or_dead_letter_ref: 'retry-or-dead-letter-ref:agent-lab/integration-contract-failed',
        rollback_ref: 'rollback-ref:agent-lab/integration-contract-last-known-good',
      },
    },
    {
      contract_ref: 'integration-contract:agent-lab/mechanism-promotion',
      integration_kind: 'mechanism_candidate_promotion',
      activation_predicate: 'mechanism_candidate_ref_present && independent_ai_review_ref_present',
      canonical_entry_ref: 'canonical-entry:opl-agent-lab/evolve',
      artifact_verifier_ref: 'artifact-verifier:opl-agent-lab/mechanism-evolution-result',
      failure_policy: 'block_promotion_emit_evidence_delta_and_rollback_ref',
      failure_outputs: {
        typed_blocker_ref: 'typed-blocker-ref:agent-lab/mechanism-promotion-blocked',
        owner_route_ref: 'owner-route:opl/mechanism-policy-owner',
        retry_or_dead_letter_ref: 'retry-or-dead-letter-ref:agent-lab/mechanism-promotion-blocked',
        rollback_ref: ROLLBACK_TARGET_REF,
      },
    },
    {
      contract_ref: 'integration-contract:agent-lab/domain-owner-route',
      integration_kind: 'domain_owner_route_projection',
      activation_predicate: 'high_risk_surface_ref_present || forbidden_authority_flag_present',
      canonical_entry_ref: 'canonical-entry:opl-agent-lab/owner-route-projection',
      artifact_verifier_ref: 'artifact-verifier:opl-agent-lab/no-domain-authority-write',
      failure_policy: 'fail_closed_with_owner_visible_blocker_ref',
      failure_outputs: {
        typed_blocker_ref: 'typed-blocker-ref:agent-lab/domain-owner-route-required',
        owner_route_ref: 'owner-route:domain-owner/high-risk-surface',
        retry_or_dead_letter_ref: 'retry-or-dead-letter-ref:agent-lab/domain-owner-route-required',
        rollback_ref: 'rollback-ref:agent-lab/no-op-domain-authority',
      },
    },
  ];

  return {
    surface_kind: 'opl_agent_lab_integration_contract_read_model',
    version: 'opl-agent-lab.v1.integration-contracts',
    read_model_id: stableId('oalic', [integrationContracts]),
    status: 'ready_for_cross_surface_integration_gates',
    refs_only: true,
    integration_contracts: integrationContracts,
    required_contract_fields: [
      'activation_predicate',
      'canonical_entry_ref',
      'artifact_verifier_ref',
      'failure_policy',
      'failure_outputs',
    ],
    summary: {
      contract_count: integrationContracts.length,
      fail_closed_contract_count: integrationContracts.filter((contract) =>
        contract.failure_policy.includes('fail_closed') || contract.failure_policy.includes('block')).length,
      rollback_ref_count: unique(integrationContracts.map((contract) => contract.failure_outputs.rollback_ref)).length,
      owner_route_ref_count: unique(integrationContracts.map((contract) =>
        contract.failure_outputs.owner_route_ref)).length,
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabReviewTraceLedger(sourceRefs: string[] = []) {
  const traceEntries = [
    {
      trace_ref: stableId('oalrtl', ['independent-ai-review', MECHANISM_REF, sourceRefs]),
      trace_kind: 'independent_ai_reviewer_trace_ref',
      request_ref: 'review-request-ref:agent-lab/mechanism-candidate',
      response_ref: 'review-response-ref:agent-lab/mechanism-candidate',
      evidence_refs: [
        'evidence-ref:agent-lab/no-forbidden-write-proof',
        'evidence-ref:agent-lab/regression-suite-result',
        ...sourceRefs,
      ],
      reviewed_diff_ref: 'diff-ref:agent-lab/mechanism-candidate',
      contract_ref: 'contract:opl-framework/agent-lab-contract',
      test_result_ref: 'test-result-ref:agent-lab/mechanism-promotion',
      reviewer_agent_ref: 'agent-ref:opl-agent-lab/independent-ai-reviewer',
      review_context_inherits_executor_context: false,
      no_shared_context: true,
      writes_domain_truth: false,
      writes_memory_body: false,
      mutates_artifact: false,
      writes_owner_receipt: false,
    },
    {
      trace_ref: stableId('oalrtl', ['web-research', MECHANISM_REF, sourceRefs]),
      trace_kind: 'web_research_trace_ref',
      request_ref: 'web-research-request-ref:agent-lab/mechanism-context',
      response_ref: 'web-research-response-ref:agent-lab/mechanism-context',
      evidence_refs: [
        'evidence-ref:agent-lab/external-pattern-research',
        'source-ref:github/wanshuiyin/Auto-claude-code-research-in-sleep',
        ...sourceRefs,
      ],
      reviewed_diff_ref: 'diff-ref:agent-lab/mechanism-candidate',
      contract_ref: 'contract:opl-framework/agent-lab-contract',
      test_result_ref: 'test-result-ref:agent-lab/external-pattern-intake',
      reviewer_agent_ref: 'agent-ref:opl-agent-lab/research-reviewer',
      review_context_inherits_executor_context: false,
      no_shared_context: true,
      writes_domain_truth: false,
      writes_memory_body: false,
      mutates_artifact: false,
      writes_owner_receipt: false,
    },
    {
      trace_ref: stableId('oalrtl', ['mechanism-patch', MECHANISM_REF, sourceRefs]),
      trace_kind: 'mechanism_patch_trace_ref',
      request_ref: 'mechanism-patch-request-ref:agent-lab/default-stage-led-agent-mechanism',
      response_ref: 'mechanism-patch-response-ref:agent-lab/default-stage-led-agent-mechanism',
      evidence_refs: [
        'evidence-ref:agent-lab/log-mined-candidate',
        'evidence-ref:agent-lab/integration-contract-check',
        ...sourceRefs,
      ],
      reviewed_diff_ref: 'diff-ref:agent-lab/mechanism-candidate',
      contract_ref: 'contract:opl-framework/agent-lab-contract',
      test_result_ref: 'test-result-ref:agent-lab/evolution-suite',
      reviewer_agent_ref: 'agent-ref:opl-agent-lab/mechanism-patch-generator',
      review_context_inherits_executor_context: true,
      no_shared_context: false,
      writes_domain_truth: false,
      writes_memory_body: false,
      mutates_artifact: false,
      writes_owner_receipt: false,
    },
  ];

  return {
    surface_kind: 'opl_agent_lab_review_trace_ledger',
    version: 'opl-agent-lab.v1.review-trace-ledger',
    ledger_ref: stableId('oalrtl', [traceEntries, sourceRefs]),
    status: 'ready_for_mechanism_patch_replay_and_audit',
    refs_only: true,
    trace_entries: traceEntries,
    summary: {
      trace_count: traceEntries.length,
      independent_no_shared_context_count: traceEntries.filter((entry) =>
        entry.no_shared_context && entry.review_context_inherits_executor_context === false).length,
      evidence_ref_count: unique(traceEntries.flatMap((entry) => entry.evidence_refs)).length,
      request_ref_count: unique(traceEntries.map((entry) => entry.request_ref)).length,
      response_ref_count: unique(traceEntries.map((entry) => entry.response_ref)).length,
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildCompleteAgentLabControlPlane() {
  const sampleResult = buildSampleAgentLabResult();
  const longlineResult = buildLonglineAgentLabResult();
  const integrationContracts = buildAgentLabIntegrationContractReadModel();
  const reviewTraceLedger = buildAgentLabReviewTraceLedger([
    sampleResult.result_id,
    longlineResult.result_id,
  ]);
  const logDrivenCandidates = buildAgentLabLogDrivenMechanismCandidateReadModel([
    sampleResult.result_id,
    longlineResult.result_id,
  ]);
  const arisMaturityControls = buildAgentLabArisMaturityControlsReadModel([
    sampleResult.result_id,
    longlineResult.result_id,
  ]);
  const evalAdapters = [
    {
      adapter_id: 'opl-native-agent-lab',
      status: 'landed',
      role: 'native_refs_only_suite_runner',
      input_refs: ['agent_lab_task_manifest', 'domain_quality_scorecard_refs', 'recovery_probe_refs'],
      output_refs: ['agent_lab_suite_result', 'improvement_candidate_refs', 'promotion_gate_refs'],
    },
    {
      adapter_id: 'inspect-ai',
      status: 'adapter_contract_ready_optional_runtime',
      role: 'optional_eval_runner_bridge',
      maps_to_opl: {
        task: 'agent_lab_task_manifest',
        solver: 'agent_executor_ref',
        scorer: 'domain_quality_scorecard_ref',
        eval_log: 'agent_trajectory_ref',
      },
      runtime_dependency_required_for_core: false,
    },
    {
      adapter_id: 'metr-task-standard',
      status: 'task_standard_reference_ready',
      role: 'portable_task_environment_pattern',
      maps_to_opl: {
        task_family: 'agent_lab_task_family',
        task_environment: 'agent_lab_environment',
        score: 'domain_owned_scorecard_ref',
      },
      runtime_dependency_required_for_core: false,
    },
  ];
  const observabilityExports = [
    {
      export_id: 'opl-runtime-observability-export',
      status: 'landed',
      formats: ['json', 'openmetrics'],
      source_refs: ['stage_attempt_ledger', 'provider_receipt_refs', 'domain_owned_projection_refs'],
    },
    {
      export_id: 'openinference-opentelemetry',
      status: 'trace_ref_contract_ready',
      source_refs: ['agent_trajectory_refs', 'tool_call_refs', 'span_refs'],
      connector_required_for_core: false,
    },
    {
      export_id: 'langfuse',
      status: 'optional_connector_pending_export_contract_ready',
      source_refs: ['trace_refs', 'dataset_refs', 'run_refs', 'scorecard_refs'],
      connector_required_for_core: false,
    },
    {
      export_id: 'phoenix',
      status: 'optional_connector_pending_export_contract_ready',
      source_refs: ['openinference_trace_refs', 'dataset_refs', 'experiment_refs', 'evaluator_refs'],
      connector_required_for_core: false,
    },
  ];
  const optimizerLoop = {
    surface_kind: 'opl_agent_lab_evolution_harness',
    status: 'mechanism_auto_promotion_control_plane_ready',
    candidate_kinds: ['prompt', 'skill', 'stage_policy', 'tool_policy', 'few_shot_examples', 'rubric_gap'],
    mechanism_object: {
      mechanism_ref: MECHANISM_REF,
      mechanism_version: MECHANISM_VERSION,
      editable_surfaces: MECHANISM_EDITABLE_SURFACES,
      promotion_mode: 'risk_tiered_auto_promotion_with_independent_ai_review',
      promotion_policy_ref: 'mechanism-promotion-policy:agent-lab/risk-tiered-auto-promotion',
      refs_only: true,
    },
    loop_steps: [
      'collect_trajectory_refs',
      'collect_usage_and_blocker_event_refs',
      'mine_real_logs_into_mechanism_candidate_refs',
      'optional_web_research_for_mechanism_context',
      'freeze_dataset_or_longline_suite',
      'score_with_domain_owned_scorecard_refs',
      'validate_cross_surface_integration_contracts',
      'select_mechanism_editable_surface_refs',
      'emit_meta_edit_receipt_ref',
      'generate_next_mechanism_candidate_ref',
      'classify_mechanism_change_risk',
      'run_independent_ai_review_without_shared_context',
      'record_review_trace_refs',
      'run_regression_and_recovery_gates',
      'auto_promote_low_and_medium_risk_with_versioned_canary',
      'route_high_risk_to_owner_or_human_gate',
      'record_rollback_target_ref',
      'record_evolution_segment_refs',
    ],
    pattern_refs: [
      'dspy:mipro/bootstrap-few-shot',
      'textgrad:textual-feedback-optimization',
      'agent-lightning:training-agent-disaggregation',
      'aris:log-driven-meta-optimize',
      'aris:integration-contract',
      'aris:review-trace',
    ],
    log_driven_candidate_read_model: logDrivenCandidates,
    integration_contract_read_model: integrationContracts,
    review_trace_ledger: reviewTraceLedger,
    aris_maturity_controls: arisMaturityControls,
    rl_boundary: {
      status: 'downstream_ready_after_stable_trajectory_and_reward_surfaces',
      can_emit_transition_refs: true,
      can_train_or_deploy_model_weights: false,
      can_promote_default_agent_without_gate: false,
      reward_authority: 'domain_owned_scorecard_or_human_owner_label',
    },
  };
  const readiness = {
    complete_control_plane_ready: true,
    core_requires_external_eval_runtime: false,
    core_requires_langfuse_or_phoenix: false,
    ready_to_connect_inspect_ai_adapter: true,
    ready_to_export_observability_refs: true,
    ready_to_emit_mechanism_read_model: true,
    ready_to_emit_evolution_segments: true,
    ready_to_emit_optimizer_candidate_refs: true,
    ready_to_emit_rl_transition_refs: true,
    ready_to_emit_developer_mode_repair_routes: true,
    ready_to_emit_integration_contracts: true,
    ready_to_emit_review_trace_ledger: true,
    ready_to_emit_log_driven_mechanism_candidates: true,
    ready_to_emit_aris_maturity_controls: true,
    automatic_mechanism_promotion_ready: true,
    automatic_model_training_ready: false,
    automatic_default_agent_promotion_ready: AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY,
    app_workbench_consumption_ready: true,
  };
  const developerModeRepairRoutes = buildDeveloperModeAgentLabRepairRouteReadModel();

  return {
    surface_kind: 'opl_agent_lab_complete_control_plane',
    version: 'opl-agent-lab.v1.complete',
    control_plane_id: stableId('oalcp', [sampleResult.result_id, longlineResult.result_id, readiness]),
    status: 'ready_for_opl_native_use',
    sample_suite_ref: sampleResult.result_id,
    longline_suite_ref: longlineResult.result_id,
    eval_adapters: evalAdapters,
    observability_exports: observabilityExports,
    optimizer_loop: optimizerLoop,
    mechanism_control_plane: buildAgentLabMechanismReadModel(),
    integration_contracts: integrationContracts,
    review_trace_ledger: reviewTraceLedger,
    log_driven_mechanism_candidates: logDrivenCandidates,
    aris_maturity_controls: arisMaturityControls,
    developer_mode_repair_routes: developerModeRepairRoutes,
    readiness,
    non_goals: [
      'domain truth mutation',
      'domain quality verdict',
      'artifact mutation',
      'memory body application',
      'ungated default agent promotion',
      'model training or weight deployment inside OPL core',
      'domain truth, artifact, memory body, quality verdict, owner receipt, or managed runtime mutation from developer-mode patrol routes',
      'ARIS runtime dependency',
    ],
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

type AgentLabSuiteResult = ReturnType<typeof runAgentLabSuite>;
export type AgentLabExportTarget = 'inspect-ai' | 'openinference' | 'langfuse' | 'phoenix' | 'json';

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function suiteResults() {
  return {
    sample: buildSampleAgentLabResult(),
    longline: buildLonglineAgentLabResult(),
  };
}

function optimizerCandidates(results: AgentLabSuiteResult[]) {
  return results.flatMap((result) =>
    result.runs.map((run) => {
      const riskTier = run.improvement_candidate.candidate_kind === 'prompt' ? 'low_risk' : 'medium_risk';
      const independentReview = buildIndependentAiReviewReceipt({
        candidateRef: run.improvement_candidate.candidate_ref,
        riskTier,
        sourceRefs: [result.result_id, run.run_id, ...run.improvement_candidate.evidence_refs],
      });
      const promotionDecision = buildMechanismPromotionDecision({
        suiteStatus: run.status,
        riskTier,
        independentReview,
        sourceRefs: [result.result_id, run.run_id, run.promotion_gate.gate_ref],
      });
      return {
        candidate_ref: run.improvement_candidate.candidate_ref,
        candidate_kind: run.improvement_candidate.candidate_kind,
        target_ref: run.improvement_candidate.target_ref,
        source_suite_id: result.suite_id,
        source_run_id: run.run_id,
        domain_id: run.domain_id,
        risk_tier: riskTier,
        evidence_refs: run.improvement_candidate.evidence_refs,
        source_refs: unique([
          result.result_id,
          run.run_id,
          ...run.improvement_candidate.evidence_refs,
          ...run.mechanism_evolution_input_refs,
        ]),
        mechanism_evolution_input_refs: run.mechanism_evolution_input_refs,
        allowed_change_scope: run.improvement_candidate.allowed_change_scope,
        promotion_gate_ref: run.improvement_candidate.promotion_gate_ref,
        gate_status: run.promotion_gate.gate_status,
        independent_ai_review_ref: independentReview.receipt_ref,
        promotion_decision: promotionDecision.promotion_decision,
        promotion_receipt_ref: promotionDecision.promotion_receipt_ref,
        rollback_target_ref: promotionDecision.rollback_target_ref,
        candidate_status: run.status === 'passed' && run.promotion_gate.gate_status === 'passed'
          ? 'gated_candidate_ready'
          : 'blocked',
        automatic_mechanism_promotion_ready: promotionDecision.automatic_mechanism_promotion_ready,
        authority_boundary: AUTHORITY_BOUNDARY,
      };
    }));
}

function promotionGates(results: AgentLabSuiteResult[]) {
  return results.flatMap((result) =>
    result.runs.map((run) => ({
      gate_ref: run.promotion_gate.gate_ref,
      source_suite_id: result.suite_id,
      source_run_id: run.run_id,
      domain_id: run.domain_id,
      gate_status: run.promotion_gate.gate_status,
      required_refs: run.promotion_gate.required_refs,
      regression_suite_refs: run.promotion_gate.regression_suite_refs,
      no_forbidden_write_proof_refs: run.promotion_gate.no_forbidden_write_proof_refs,
      can_promote_default_agent: false,
      authority_boundary: AUTHORITY_BOUNDARY,
    })));
}

function rlTransitionRefs(results: AgentLabSuiteResult[]) {
  return results.flatMap((result) =>
    result.runs.map((run) => ({
      transition_ref: stableId('oalrt', [
        result.suite_id,
        run.task_id,
        run.trajectory.trajectory_ref,
        run.scorecard.scorecard_ref,
        run.promotion_gate.gate_ref,
      ]),
      source_suite_id: result.suite_id,
      source_run_id: run.run_id,
      trajectory_ref: run.trajectory.trajectory_ref,
      run_ref: run.trajectory.run_ref,
      scorecard_ref: run.scorecard.scorecard_ref,
      reward_authority_ref: run.scorecard.scorecard_ref,
      promotion_gate_ref: run.promotion_gate.gate_ref,
      status: run.status === 'passed' ? 'transition_ref_ready' : 'blocked',
      can_train_or_deploy_model_weights: false,
      can_promote_default_agent_without_gate: false,
      authority_boundary: AUTHORITY_BOUNDARY,
    })));
}

export function buildDeveloperModeAgentLabRepairRouteReadModel() {
  const routes = [
    {
      route_ref: 'developer-mode-repair-route:mas/repo-developer-direct-fix',
      route_mode: 'repo_developer_direct_fix',
      route_status: 'candidate_fix_ref_ready',
      domain_id: 'med-autoscience',
      repo_ref: 'github-repo:gaofeng21cn/med-autoscience',
      issue_ref: 'issue-ref:mas/agent-call-interface-blocker',
      blocker_ref: 'blocker-ref:mas/agent-call-interface-regression',
      owner_route_ref: 'owner-route:med-autoscience/repo-developer',
      github_actor_ref: 'github-user:gaofeng21cn',
      repo_developer_match_required: true,
      candidate_fix_ref: 'candidate-fix-ref:mas/agent-call-interface-blocker',
      repo_worktree_ref: 'repo-worktree-ref:med-autoscience/codex/developer-mode-repair',
      branch_ref: 'git-branch-ref:med-autoscience/codex/developer-mode-repair',
      pr_ref: 'github-pr-ref:med-autoscience/developer-mode-repair-review',
      acceptance_evidence_ref: 'acceptance-evidence-ref:mas/agent-call-interface-tests',
      follow_up_queue_item_ref: 'queue-item-ref:agent-lab/developer-mode/mas-agent-call-interface-blocker',
      authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
    },
    {
      route_ref: 'developer-mode-repair-route:rca/fork-pr',
      route_mode: 'fork_pull_request',
      route_status: 'pull_request_ref_ready',
      domain_id: 'redcube-ai',
      repo_ref: 'github-repo:redcube-ai/redcube-ai',
      issue_ref: 'issue-ref:rca/patrol-render-blocker',
      blocker_ref: 'blocker-ref:rca/render-review-regression',
      owner_route_ref: 'owner-route:redcube-ai/fork-pr',
      github_actor_ref: 'github-user:developer-mode-operator',
      repo_developer_match_required: false,
      candidate_fix_ref: 'candidate-fix-ref:rca/patrol-render-blocker',
      repo_worktree_ref: 'repo-worktree-ref:redcube-ai/fork/codex/developer-mode-patrol',
      branch_ref: 'git-branch-ref:fork/redcube-ai/codex/developer-mode-patrol',
      pr_ref: 'github-pr-ref:redcube-ai/patrol-render-blocker',
      acceptance_evidence_ref: 'acceptance-evidence-ref:rca/render-review-regression-tests',
      follow_up_queue_item_ref: 'queue-item-ref:agent-lab/developer-mode/rca-render-review-regression',
      authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
    },
  ];

  return {
    surface_kind: 'opl_agent_lab_developer_mode_repair_route_read_model',
    version: 'opl-agent-lab.v1.developer-mode-repair-route',
    read_model_id: stableId('oaldmr', [routes]),
    status: 'ready_for_developer_mode_patrol_consumption',
    developer_mode_required: true,
    refs_only: true,
    inputs: {
      issue_or_blocker_ref: 'issue-ref | blocker-ref',
      github_identity_ref: 'github-user-ref',
      repo_authority_ref: 'repo-authority-ref',
      patrol_observation_ref: 'agent-lab-patrol-observation-ref',
    },
    route_policy: {
      repo_developer_match: 'route_to_repo_developer_direct_fix_branch',
      no_repo_developer_match: 'route_to_fork_pull_request',
      developer_mode_disabled: 'projection_visible_but_execution_not_eligible',
      acceptance_required_before_apply: true,
    },
    patrol_projection: {
      patrol_ref: 'agent-lab-patrol-ref:developer-mode/default',
      patrol_scope: 'peripheral_ai_inspection_for_agent_call_failures',
      route_outputs: [
        'issue_ref',
        'blocker_ref',
        'owner_route_ref',
        'candidate_fix_ref',
        'repo_worktree_ref',
        'branch_ref',
        'pr_ref',
        'acceptance_evidence_ref',
        'follow_up_queue_item_ref',
      ],
    },
    routes,
    summary: {
      route_count: routes.length,
      direct_owner_route_count: routes.filter((route) => route.route_mode === 'repo_developer_direct_fix').length,
      fork_pr_route_count: routes.filter((route) => route.route_mode === 'fork_pull_request').length,
      issue_ref_count: unique(routes.map((route) => route.issue_ref)).length,
      blocker_ref_count: unique(routes.map((route) => route.blocker_ref)).length,
      follow_up_queue_item_ref_count: unique(routes.map((route) => route.follow_up_queue_item_ref)).length,
    },
    non_authority_outputs: {
      writes_domain_truth: false,
      writes_domain_artifact: false,
      writes_memory_body: false,
      writes_quality_verdict: false,
      writes_owner_receipt: false,
      modifies_managed_runtime: false,
      writes_follow_up_queue_body: false,
    },
    authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabWorkbenchReadModel() {
  const complete = buildCompleteAgentLabControlPlane();
  const { sample, longline } = suiteResults();
  const results = [sample, longline];
  const developerModeRepairRoutes = buildDeveloperModeAgentLabRepairRouteReadModel();

  return {
    surface_kind: 'opl_agent_lab_workbench_read_model',
    version: 'opl-agent-lab.v1.workbench',
    read_model_id: stableId('oalwb', [
      complete.control_plane_id,
      sample.result_id,
      longline.result_id,
      complete.integration_contracts.read_model_id,
      complete.review_trace_ledger.ledger_ref,
      complete.log_driven_mechanism_candidates.read_model_id,
      complete.aris_maturity_controls.read_model_id,
      developerModeRepairRoutes.read_model_id,
    ]),
    status: 'ready_for_app_workbench_consumption',
    app_workbench_consumption_ready: true,
    source_results: {
      complete_control_plane_ref: complete.control_plane_id,
      sample_suite_ref: sample.result_id,
      longline_suite_ref: longline.result_id,
      integration_contract_read_model_ref: complete.integration_contracts.read_model_id,
      review_trace_ledger_ref: complete.review_trace_ledger.ledger_ref,
      log_driven_mechanism_candidate_read_model_ref: complete.log_driven_mechanism_candidates.read_model_id,
      aris_maturity_controls_ref: complete.aris_maturity_controls.read_model_id,
      sample_ref_summary: agentLabRefSummary(sample),
      longline_ref_summary: agentLabRefSummary(longline),
    },
    eval_adapters: complete.eval_adapters,
    observability_export_readiness: {
      ready_to_export_observability_refs: complete.readiness.ready_to_export_observability_refs,
      exports: complete.observability_exports,
      upload_external_service: false,
      reads_domain_body: false,
    },
    optimizer_candidates: optimizerCandidates(results),
    mechanism: buildAgentLabMechanismReadModel(),
    integration_contracts: complete.integration_contracts,
    review_trace_ledger: complete.review_trace_ledger,
    log_driven_mechanism_candidates: complete.log_driven_mechanism_candidates,
    aris_maturity_controls: complete.aris_maturity_controls,
    promotion_gates: promotionGates(results),
    developer_mode_repair_routes: developerModeRepairRoutes,
    online_learning_refs: {
      transition_refs_ready: true,
      transitions: rlTransitionRefs(results),
      reward_authority: complete.optimizer_loop.rl_boundary.reward_authority,
      can_train_or_deploy_model_weights: false,
      can_promote_default_agent_without_gate: false,
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabMechanismReadModel() {
  const mechanismRef = MECHANISM_REF;
  const mechanismVersion = MECHANISM_VERSION;
  const candidateRef = 'mechanism-candidate:agent-lab/default-stage-led-agent-mechanism/next';
  const independentReview = buildIndependentAiReviewReceipt({ candidateRef, riskTier: 'medium_risk' });
  const mechanismPromotionPolicy = buildMechanismPromotionPolicy(independentReview.receipt_ref);
  const mechanismVersionLedger = buildMechanismVersionLedger();
  const rollback = buildMechanismRollback();
  const integrationContracts = buildAgentLabIntegrationContractReadModel();
  const reviewTraceLedger = buildAgentLabReviewTraceLedger([
    'suite:opl-agent-lab-sample-suite',
    'suite:opl-agent-lab-longline-suite',
  ]);
  const logDrivenCandidates = buildAgentLabLogDrivenMechanismCandidateReadModel([
    'suite:opl-agent-lab-sample-suite',
    'suite:opl-agent-lab-longline-suite',
  ]);
  const arisMaturityControls = buildAgentLabArisMaturityControlsReadModel([
    'suite:opl-agent-lab-sample-suite',
    'suite:opl-agent-lab-longline-suite',
  ]);
  const promotionDecision = buildMechanismPromotionDecision({
    riskTier: 'medium_risk',
    independentReview,
    sourceRefs: ['suite:opl-agent-lab-sample-suite', 'suite:opl-agent-lab-longline-suite'],
  });

  return {
    surface_kind: 'opl_agent_lab_mechanism_read_model',
    version: mechanismVersion,
    mechanism_ref: mechanismRef,
    mechanism_version: mechanismVersion,
    status: 'mechanism_auto_promotion_ready_with_independent_ai_review',
    editable_surfaces: MECHANISM_EDITABLE_SURFACES,
    mechanism_promotion_policy: mechanismPromotionPolicy,
    mechanism_version_ledger: mechanismVersionLedger,
    independent_ai_review_receipt: independentReview,
    integration_contracts: integrationContracts,
    review_trace_ledger: reviewTraceLedger,
    log_driven_mechanism_candidates: logDrivenCandidates,
    aris_maturity_controls: arisMaturityControls,
    rollback,
    meta_edit_receipt: {
      receipt_ref: stableId('oalmr', [mechanismRef, mechanismVersion, MECHANISM_EDITABLE_SURFACES]),
      receipt_kind: 'mechanism_meta_edit_receipt_ref',
      source_refs: [
        'contract:opl-framework/agent-lab-contract',
        'human_doc:docs/runtime/opl-agent-lab-control-plane',
      ],
      writes_domain_truth: false,
      writes_memory_body: false,
      mutates_artifact: false,
      trains_or_deploys_model_weights: false,
      promotes_default_agent: false,
    },
    evolution_segment: {
      segment_ref: stableId('oalms', [mechanismRef, mechanismVersion, 'baseline']),
      segment_kind: 'mechanism_baseline_segment_ref',
      source_suite_refs: ['suite:opl-agent-lab-sample-suite', 'suite:opl-agent-lab-longline-suite'],
      trajectory_refs: [
        'trajectory:mas/paper-repair-smoke',
        'trajectory:mag/grant-section-smoke',
        'trajectory:rca/visual-deliverable-smoke',
      ],
      scorecard_refs: [
        'quality-scorecard:mas/paper-repair-smoke',
        'quality-scorecard:mag/grant-section-smoke',
        'quality-scorecard:rca/visual-deliverable-smoke',
      ],
    },
    evidence_delta: {
      delta_ref: stableId('oalmd', [mechanismRef, mechanismVersion, 'baseline']),
      added_evidence_refs: [],
      blocked_evidence_refs: [],
      unchanged_evidence_refs: [
        'no-forbidden-write:mas/agent-lab-fixture',
        'no-forbidden-write:mag/agent-lab-fixture',
        'no-forbidden-write:rca/agent-lab-fixture',
      ],
      domain_truth_delta_written: false,
      memory_body_delta_written: false,
      artifact_delta_written: false,
    },
    next_mechanism_candidate: {
      candidate_ref: candidateRef,
      candidate_version: NEXT_MECHANISM_VERSION,
      candidate_status: 'auto_promotable_canary_ready',
      mechanism_ref: mechanismRef,
      risk_tier: promotionDecision.risk_tier,
      editable_surface_refs: MECHANISM_EDITABLE_SURFACES.map((surface) => surface.surface_ref),
      proposed_edit_refs: [
        'mechanism-edit-ref:agent-lab/stage-policy-tightening',
        'mechanism-edit-ref:agent-lab/tool-policy-tightening',
        'mechanism-edit-ref:agent-lab/rubric-gap-routing',
      ],
      required_gate_refs: mechanismPromotionPolicy.required_gate_refs,
      independent_ai_review_ref: independentReview.receipt_ref,
      integration_contract_ref: integrationContracts.integration_contracts[1].contract_ref,
      review_trace_ledger_ref: reviewTraceLedger.ledger_ref,
      log_mined_candidate_refs: logDrivenCandidates.log_mined_candidate_refs,
      maturity_control_refs: [
        arisMaturityControls.controls.effort_assurance_axes.policy_ref,
        arisMaturityControls.controls.helper_inventory_drift_report.report_ref,
        arisMaturityControls.controls.fail_closed_invariants.policy_ref,
        arisMaturityControls.controls.mcp_stream_reliability_policy.policy_ref,
      ],
      promotion_decision: promotionDecision.promotion_decision,
      promotion_receipt_ref: promotionDecision.promotion_receipt_ref,
      rollback_target_ref: promotionDecision.rollback_target_ref,
      default_promotion: true,
    },
    refs_only: true,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabEvolutionResult(input: AgentLabSuite) {
  const suiteResult = runAgentLabSuite(input);
  const mechanism = buildAgentLabMechanismReadModel();
  const candidates = optimizerCandidates([suiteResult]);
  const transitions = rlTransitionRefs([suiteResult]);
  const integrationContracts = buildAgentLabIntegrationContractReadModel();
  const reviewTraceLedger = buildAgentLabReviewTraceLedger([
    suiteResult.result_id,
    ...suiteResult.refs.promotion_gate_refs,
  ]);
  const logDrivenCandidates = buildAgentLabLogDrivenMechanismCandidateReadModel([
    suiteResult.result_id,
    ...suiteResult.refs.mechanism_evolution_input_refs,
    ...suiteResult.refs.promotion_gate_refs,
  ]);
  const arisMaturityControls = buildAgentLabArisMaturityControlsReadModel([
    suiteResult.result_id,
    ...suiteResult.refs.mechanism_evolution_input_refs,
  ]);
  const trajectoryRefs = suiteResult.refs.trajectory_refs;
  const scorecardRefs = suiteResult.refs.domain_quality_scorecard_refs;
  const candidateRefs = candidates.map((candidate) => candidate.candidate_ref);
  const transitionRefs = transitions.map((transition) => transition.transition_ref);
  const independentReview = buildIndependentAiReviewReceipt({
    candidateRef: mechanism.next_mechanism_candidate.candidate_ref,
    riskTier: 'medium_risk',
    sourceRefs: [suiteResult.result_id, ...suiteResult.refs.promotion_gate_refs],
  });
  const mechanismPromotionDecision = buildMechanismPromotionDecision({
    suiteStatus: suiteResult.status,
    riskTier: 'medium_risk',
    independentReview,
    sourceRefs: [suiteResult.result_id, ...candidateRefs, ...transitionRefs],
  });
  const promotionReceipt = buildMechanismPromotionReceipt(mechanismPromotionDecision);

  return {
    surface_kind: 'opl_agent_lab_evolution_result',
    version: 'opl-agent-lab.v1.evolution',
    evolution_id: stableId('oale', [
      suiteResult.result_id,
      mechanism.mechanism_ref,
      mechanism.mechanism_version,
      candidateRefs,
      transitionRefs,
    ]),
    status: suiteResult.status === 'passed' ? 'mechanism_auto_promoted_to_canary' : 'blocked',
    suite_result: suiteResult,
    mechanism_ref: mechanism.mechanism_ref,
    mechanism_version: mechanism.mechanism_version,
    editable_surfaces: mechanism.editable_surfaces,
    integration_contracts: integrationContracts,
    review_trace_ledger: reviewTraceLedger,
    log_driven_mechanism_candidates: logDrivenCandidates,
    aris_maturity_controls: arisMaturityControls,
    log_mined_candidate_refs: logDrivenCandidates.log_mined_candidate_refs,
    mechanism_promotion_decision: mechanismPromotionDecision,
    independent_ai_review_receipt: independentReview,
    promotion_receipt: promotionReceipt,
    rollback: buildMechanismRollback([suiteResult.result_id, ...candidateRefs]),
    meta_edit_receipt: {
      ...mechanism.meta_edit_receipt,
      source_refs: [
        ...mechanism.meta_edit_receipt.source_refs,
        suiteResult.result_id,
        ...suiteResult.refs.promotion_gate_refs,
      ],
    },
    evolution_segment: {
      segment_ref: stableId('oales', [suiteResult.result_id, trajectoryRefs, scorecardRefs, candidateRefs]),
      segment_kind: 'mechanism_suite_evolution_segment_ref',
      source_suite_ref: suiteResult.result_id,
      mechanism_ref: mechanism.mechanism_ref,
      trajectory_refs: trajectoryRefs,
      scorecard_refs: scorecardRefs,
      improvement_candidate_refs: candidateRefs,
      rl_transition_refs: transitionRefs,
    },
    evidence_delta: {
      delta_ref: stableId('oaled', [
        suiteResult.result_id,
        suiteResult.refs.receipt_refs,
        suiteResult.refs.promotion_gate_refs,
        suiteResult.refs.forbidden_authority_flags,
      ]),
      suite_status: suiteResult.status,
      added_evidence_refs: [
        suiteResult.result_id,
        ...suiteResult.refs.mechanism_evolution_input_refs,
        ...suiteResult.refs.receipt_refs,
        ...suiteResult.refs.promotion_gate_refs,
      ],
      blocked_evidence_refs: suiteResult.status === 'passed'
        ? []
        : [...suiteResult.missing_observations, ...suiteResult.refs.forbidden_authority_flags],
      domain_truth_delta_written: false,
      memory_body_delta_written: false,
      artifact_delta_written: false,
    },
    next_mechanism_candidate: {
      ...mechanism.next_mechanism_candidate,
      candidate_ref: stableId('oalmc', [suiteResult.result_id, candidateRefs, transitionRefs]),
      source_candidate_refs: candidateRefs,
      source_transition_refs: transitionRefs,
      source_log_mined_candidate_refs: logDrivenCandidates.log_mined_candidate_refs,
      source_mechanism_evolution_input_refs: suiteResult.refs.mechanism_evolution_input_refs,
      source_maturity_control_refs: arisMaturityControls.source_pattern_refs,
      integration_contract_ref: integrationContracts.integration_contracts[1].contract_ref,
      review_trace_ledger_ref: reviewTraceLedger.ledger_ref,
      required_gate_refs: unique([
        ...mechanism.next_mechanism_candidate.required_gate_refs,
        ...suiteResult.refs.promotion_gate_refs,
      ]),
      risk_tier: mechanismPromotionDecision.risk_tier,
      promotion_decision: mechanismPromotionDecision.promotion_decision,
      promotion_receipt_ref: mechanismPromotionDecision.promotion_receipt_ref,
      rollback_target_ref: mechanismPromotionDecision.rollback_target_ref,
      default_promotion: true,
    },
    automatic_model_training_ready: false,
    automatic_mechanism_promotion_ready: mechanismPromotionDecision.automatic_mechanism_promotion_ready,
    automatic_default_agent_promotion_ready: AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY,
    refs_only: true,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

function connectorPayload(target: AgentLabExportTarget, results: AgentLabSuiteResult[]) {
  const runs = results.flatMap((result) =>
    result.runs.map((run) => ({ result, run })));

  if (target === 'inspect-ai') {
    return {
      tasks: runs.map(({ run }) => ({
        task_ref: run.task_id,
        solver_ref: run.agent_entry_ref,
        scorer_refs: run.scorer_refs,
        eval_log_ref: run.trajectory.trajectory_ref,
      })),
    };
  }

  if (target === 'openinference') {
    return {
      traces: runs.flatMap(({ run }) =>
        (run.trajectory.trace_refs ?? []).map((traceRef) => ({
          trace_ref: traceRef,
          trajectory_ref: run.trajectory.trajectory_ref,
          tool_call_refs: run.trajectory.tool_call_refs,
          stage_attempt_refs: run.trajectory.stage_attempt_refs,
        }))),
    };
  }

  if (target === 'langfuse') {
    return {
      datasets: results.map((result) => ({
        dataset_ref: `dataset-ref:agent-lab/${result.suite_id}`,
        run_refs: result.runs.map((run) => run.trajectory.run_ref),
        scorecard_refs: result.refs.domain_quality_scorecard_refs,
      })),
    };
  }

  if (target === 'phoenix') {
    return {
      experiments: results.map((result) => ({
        experiment_ref: `experiment-ref:agent-lab/${result.suite_id}`,
        openinference_trace_refs: result.runs.flatMap((run) => run.trajectory.trace_refs ?? []),
        evaluator_refs: result.refs.scorer_refs,
      })),
    };
  }

  return {
    suite_results: results.map((result) => ({
      suite_id: result.suite_id,
      result_id: result.result_id,
      status: result.status,
      ref_summary: agentLabRefSummary(result),
    })),
  };
}

export function buildAgentLabExportEnvelope(target: AgentLabExportTarget) {
  const complete = buildCompleteAgentLabControlPlane();
  const { sample, longline } = suiteResults();
  const results = [sample, longline];
  const integrationContracts = complete.integration_contracts.integration_contracts;
  const reviewTraceEntries = complete.review_trace_ledger.trace_entries;
  const logDrivenCandidates = complete.log_driven_mechanism_candidates;
  const arisMaturityControls = complete.aris_maturity_controls;

  return {
    surface_kind: 'opl_agent_lab_export_envelope',
    version: 'opl-agent-lab.v1.export',
    export_id: stableId('oalx', [target, sample.result_id, longline.result_id]),
    target,
    status: 'ready_for_connector_consumption_refs_only',
    upload_external_service: false,
    reads_domain_body: false,
    source_refs: {
      complete_control_plane_ref: complete.control_plane_id,
      suite_result_refs: results.map((result) => result.result_id),
      trajectory_refs: results.flatMap((result) => result.refs.trajectory_refs),
      scorecard_refs: results.flatMap((result) => result.refs.domain_quality_scorecard_refs),
      promotion_gate_refs: results.flatMap((result) => result.refs.promotion_gate_refs),
      integration_contract_refs: integrationContracts.map((contract) => contract.contract_ref),
      review_trace_refs: reviewTraceEntries.map((entry) => entry.trace_ref),
      review_evidence_refs: unique(reviewTraceEntries.flatMap((entry) => entry.evidence_refs)),
      log_mined_candidate_refs: logDrivenCandidates.log_mined_candidate_refs,
      aris_maturity_control_refs: [
        arisMaturityControls.controls.effort_assurance_axes.policy_ref,
        arisMaturityControls.controls.helper_inventory_drift_report.report_ref,
        arisMaturityControls.controls.fail_closed_invariants.policy_ref,
        arisMaturityControls.controls.mcp_stream_reliability_policy.policy_ref,
      ],
    },
    connector_payload: connectorPayload(target, results),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabOptimizeResult(input: AgentLabSuite) {
  const suiteResult = runAgentLabSuite(input);
  const candidates = optimizerCandidates([suiteResult]);
  const transitions = rlTransitionRefs([suiteResult]);
  const logDrivenCandidates = buildAgentLabLogDrivenMechanismCandidateReadModel([
    suiteResult.result_id,
    ...suiteResult.refs.mechanism_evolution_input_refs,
  ]);
  const autoPromotableCandidates = candidates.filter((candidate) =>
    candidate.automatic_mechanism_promotion_ready);

  return {
    surface_kind: 'opl_agent_lab_optimize_result',
    version: 'opl-agent-lab.v1.optimize',
    optimize_id: stableId('oalo', [suiteResult.result_id, candidates, transitions]),
    status: suiteResult.status === 'passed' ? 'gated_candidate_set_ready' : 'blocked',
    suite_result: suiteResult,
    gated_optimizer_candidate_set: {
      candidate_count: candidates.length,
      promotable_candidate_count: candidates.filter((candidate) =>
        candidate.candidate_status === 'gated_candidate_ready').length,
      auto_promotable_candidate_count: autoPromotableCandidates.length,
      candidates,
    },
    log_driven_mechanism_candidates: logDrivenCandidates,
    log_mined_candidate_refs: logDrivenCandidates.log_mined_candidate_refs,
    rl_transition_refs: {
      transition_count: transitions.length,
      transitions,
    },
    automatic_mechanism_promotion_ready: suiteResult.status === 'passed' && autoPromotableCandidates.length > 0,
    automatic_model_training_ready: false,
    automatic_default_agent_promotion_ready: AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
