import {
  agentLabRefSummary,
  assessIndependentAiReviewReceipt,
  buildSampleAgentLabResult,
  REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS,
  runAgentLabSuite,
  type AgentLabSuite,
} from './agent-lab.ts';
import { buildLonglineAgentLabResult } from './agent-lab-longline.ts';
import {
  optimizerCandidates,
  rlTransitionRefs,
} from './agent-lab-optimizer-read-models.ts';
import {
  buildDeveloperModeAgentLabRepairRouteReadModel,
} from './agent-lab-developer-mode.ts';
import {
  buildAgentLabArisMaturityControlsReadModel,
  buildAgentLabDomainFeedbackSelfEvolutionReadModel,
  buildAgentLabLogDrivenMechanismCandidateReadModel,
} from './agent-lab-control-read-models.ts';
import { buildAgentLabStageExecutorPolicyReadModel } from './agent-lab-stage-executor-policy.ts';
import { buildAgentLabEfficiencyNonRegressionReadModel } from './agent-lab-efficiency-nonregression.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY,
  buildIndependentAiReviewReceipt,
  buildMechanismPromotionDecision,
  buildMechanismPromotionPolicy,
  buildMechanismPromotionReceipt,
  buildMechanismRollback,
  buildMechanismVersionLedger,
  MECHANISM_REF,
  MECHANISM_VERSION,
  NEXT_MECHANISM_VERSION,
  reviewReceiptFromRun,
  reviewReceiptRef,
} from './agent-lab-promotion.ts';
import { buildAgentLabVariantComparisonReadModel } from './agent-lab-variant-comparison.ts';
import {
  AUTHORITY_BOUNDARY,
  DEFAULT_EFFICIENCY_NONREGRESSION_REFS,
  MECHANISM_EDITABLE_SURFACES,
  buildAgentLabIntegrationContractReadModel,
  buildAgentLabReviewTraceLedger,
} from './agent-lab-complete-parts/contracts-and-traces.ts';
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
  const domainFeedbackSelfEvolution = buildAgentLabDomainFeedbackSelfEvolutionReadModel({
    targetAgentId: 'sample-domain-agent',
    sourceRefs: [sampleResult.result_id, longlineResult.result_id],
    workOrderRefs: ['feedback-work-order:sample-domain-agent/developer-work-order-candidate'],
    externalSuiteRefs: ['domain-feedback-external-suite-ref:sample-domain-agent/sample-suite'],
    developerWorkOrderCandidateRefs: [
      'developer-work-order-candidate-ref:sample-domain-agent/sample-feedback-patch',
    ],
  });
  const aheEvidence = sampleResult.ahe_evidence;
  const executorCapabilityAperture = sampleResult.executor_capability_aperture;
  const codexAttemptTraceFlywheel = sampleResult.codex_attempt_trace_flywheel;
  const codexAttemptTraceBundle = codexAttemptTraceFlywheel.codex_attempt_trace_bundle;
  const replayForkVariantCockpit = codexAttemptTraceFlywheel.replay_fork_variant_cockpit;
  const variantComparison = buildAgentLabVariantComparisonReadModel({
    suiteResult: sampleResult,
    sourceRefs: [sampleResult.result_id, longlineResult.result_id],
  });
  const stageExecutorPolicy = buildAgentLabStageExecutorPolicyReadModel([
    sampleResult.result_id,
    longlineResult.result_id,
  ]);
  const efficiencyNonRegression = buildAgentLabEfficiencyNonRegressionReadModel({
    suiteResults: [sampleResult, longlineResult],
    explicitRefs: DEFAULT_EFFICIENCY_NONREGRESSION_REFS,
  });
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
      'collect_executor_capability_aperture_refs',
      'standardize_codex_attempt_trace_refs',
      'collect_ahe_failure_root_cause_fix_and_falsification_refs',
      'collect_usage_and_blocker_event_refs',
      'mine_real_logs_into_mechanism_candidate_refs',
      'optional_web_research_for_mechanism_context',
      'freeze_dataset_or_longline_suite',
      'score_with_domain_owned_scorecard_refs',
      'validate_cross_surface_integration_contracts',
      'select_mechanism_editable_surface_refs',
      'evaluate_stage_executor_policy_candidates',
      'emit_meta_edit_receipt_ref',
      'generate_next_mechanism_candidate_ref',
      'classify_mechanism_change_risk',
      'run_independent_ai_review_without_shared_context',
      'record_review_trace_refs',
      'run_regression_and_recovery_gates',
      'auto_promote_low_and_medium_risk_with_versioned_canary',
      'route_high_risk_to_owner_or_human_gate',
      'record_rollback_target_ref',
      'compare_best_of_n_variant_candidate_refs',
      'fork_blocked_evidence_into_variant_candidate_refs',
      'emit_replay_fork_eval_evidence_delta_refs',
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
    ahe_evidence_read_model: aheEvidence,
    executor_capability_aperture: executorCapabilityAperture,
    codex_attempt_trace_flywheel: codexAttemptTraceFlywheel,
    codex_attempt_trace_bundle: codexAttemptTraceBundle,
    replay_fork_variant_cockpit: replayForkVariantCockpit,
    integration_contract_read_model: integrationContracts,
    review_trace_ledger: reviewTraceLedger,
    aris_maturity_controls: arisMaturityControls,
    domain_feedback_self_evolution: domainFeedbackSelfEvolution,
    variant_comparison_read_model: variantComparison,
    stage_executor_policy_read_model: stageExecutorPolicy,
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
    ready_to_emit_domain_feedback_work_order_status: true,
    ready_to_emit_ahe_evidence_read_model: true,
    ready_to_emit_executor_capability_aperture: true,
    ready_to_emit_codex_attempt_trace_flywheel: true,
    ready_to_emit_variant_comparison_read_model: true,
    ready_to_emit_stage_executor_policy_read_model: true,
    ready_to_emit_token_cost_estimates: false,
    token_cost_estimate_profile_required: true,
    ready_to_emit_efficiency_nonregression_read_model: true,
    ai_review_approved_count: 0,
    automatic_mechanism_promotion_ready: false,
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
    domain_feedback_self_evolution: domainFeedbackSelfEvolution,
    ahe_evidence: aheEvidence,
    executor_capability_aperture: executorCapabilityAperture,
    codex_attempt_trace_flywheel: codexAttemptTraceFlywheel,
    codex_attempt_trace_bundle: codexAttemptTraceBundle,
    replay_fork_variant_cockpit: replayForkVariantCockpit,
    variant_comparison: variantComparison,
    stage_executor_policy: stageExecutorPolicy,
    efficiency_nonregression: efficiencyNonRegression,
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
      'second runner or queue for domain feedback work orders',
      'Codex attempt trace replay as domain quality verdict',
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
      failure_delta_refs: run.promotion_gate.failure_delta_refs ?? [],
      independent_ai_review_receipt_refs: run.promotion_gate.independent_ai_review_receipt_refs ?? [],
      promotion_receipt_refs: run.promotion_gate.promotion_receipt_refs ?? [],
      rollback_target_refs: run.promotion_gate.rollback_target_refs ?? [],
      canary_observation_refs: run.promotion_gate.canary_observation_refs ?? [],
      promotion_safety_assessment: run.promotion_safety_assessment,
      can_promote_default_agent: false,
      authority_boundary: AUTHORITY_BOUNDARY,
    })));
}


export function buildAgentLabWorkbenchReadModel() {
  const complete = buildCompleteAgentLabControlPlane();
  const { sample, longline } = suiteResults();
  const results = [sample, longline];
  const developerModeRepairRoutes = buildDeveloperModeAgentLabRepairRouteReadModel();
  const variantComparison = buildAgentLabVariantComparisonReadModel({
    suiteResult: sample,
    sourceRefs: [sample.result_id, longline.result_id],
  });

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
      complete.domain_feedback_self_evolution.read_model_id,
      complete.ahe_evidence.read_model_id,
      complete.executor_capability_aperture.read_model_id,
      complete.codex_attempt_trace_flywheel.read_model_id,
      complete.variant_comparison.read_model_id,
      complete.stage_executor_policy.read_model_id,
      complete.efficiency_nonregression.read_model_id,
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
      domain_feedback_self_evolution_ref: complete.domain_feedback_self_evolution.read_model_id,
      ahe_evidence_read_model_ref: complete.ahe_evidence.read_model_id,
      executor_capability_aperture_ref: complete.executor_capability_aperture.read_model_id,
      codex_attempt_trace_flywheel_ref: complete.codex_attempt_trace_flywheel.read_model_id,
      codex_attempt_trace_bundle_ref: complete.codex_attempt_trace_bundle.bundle_id,
      replay_fork_variant_cockpit_ref: complete.replay_fork_variant_cockpit.cockpit_id,
      variant_comparison_read_model_ref: complete.variant_comparison.read_model_id,
      stage_executor_policy_read_model_ref: complete.stage_executor_policy.read_model_id,
      efficiency_nonregression_read_model_ref: complete.efficiency_nonregression.read_model_id,
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
    domain_feedback_self_evolution: complete.domain_feedback_self_evolution,
    ahe_evidence: complete.ahe_evidence,
    executor_capability_aperture: complete.executor_capability_aperture,
    codex_attempt_trace_flywheel: complete.codex_attempt_trace_flywheel,
    codex_attempt_trace_bundle: complete.codex_attempt_trace_bundle,
    replay_fork_variant_cockpit: complete.replay_fork_variant_cockpit,
    variant_comparison: variantComparison,
    stage_executor_policy: complete.stage_executor_policy,
    efficiency_nonregression: complete.efficiency_nonregression,
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
  const independentAiReviewAssessment = assessIndependentAiReviewReceipt(independentReview);
  const mechanismPromotionPolicy = buildMechanismPromotionPolicy(
    independentReview.receipt_ref,
    independentAiReviewAssessment,
  );
  const mechanismVersionLedger = buildMechanismVersionLedger();
  const recovery = buildMechanismRollback();
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
    independentAiReviewAssessment,
    sourceRefs: ['suite:opl-agent-lab-sample-suite', 'suite:opl-agent-lab-longline-suite'],
  });

  return {
    surface_kind: 'opl_agent_lab_mechanism_read_model',
    version: mechanismVersion,
    mechanism_ref: mechanismRef,
    mechanism_version: mechanismVersion,
    status: independentAiReviewAssessment.ai_review_approved
      ? 'mechanism_auto_promotion_ready_with_independent_ai_review'
      : 'review_pending',
    editable_surfaces: MECHANISM_EDITABLE_SURFACES,
    mechanism_promotion_policy: mechanismPromotionPolicy,
    mechanism_version_ledger: mechanismVersionLedger,
    independent_ai_review_receipt: independentReview,
    independent_ai_review_assessment: independentAiReviewAssessment,
    integration_contracts: integrationContracts,
    review_trace_ledger: reviewTraceLedger,
    log_driven_mechanism_candidates: logDrivenCandidates,
    aris_maturity_controls: arisMaturityControls,
    rollback: recovery, // reuse-first: allow Agent Lab recovery readback field, not updater/package manager.
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
      candidate_status: independentAiReviewAssessment.ai_review_approved
        ? 'auto_promotable_canary_ready'
        : independentAiReviewAssessment.review_status,
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
      default_promotion: promotionDecision.automatic_mechanism_promotion_ready,
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
  const aheEvidence = suiteResult.ahe_evidence;
  const codexAttemptTraceFlywheel = suiteResult.codex_attempt_trace_flywheel;
  const variantComparison = buildAgentLabVariantComparisonReadModel({ suiteResult });
  const trajectoryRefs = suiteResult.refs.trajectory_refs;
  const scorecardRefs = suiteResult.refs.domain_quality_scorecard_refs;
  const candidateRefs = candidates.map((candidate) => candidate.candidate_ref);
  const transitionRefs = transitions.map((transition) => transition.transition_ref);
  const independentReview = buildIndependentAiReviewReceipt({
    candidateRef: mechanism.next_mechanism_candidate.candidate_ref,
    riskTier: 'medium_risk',
    sourceRefs: [suiteResult.result_id, ...suiteResult.refs.promotion_gate_refs],
  });
  const independentAiReviewAssessment = assessIndependentAiReviewReceipt(independentReview);
  const mechanismPromotionDecision = buildMechanismPromotionDecision({
    suiteStatus: suiteResult.status,
    riskTier: 'medium_risk',
    independentReview,
    independentAiReviewAssessment,
    promotionSafetyReady: candidates.some((candidate) => candidate.automatic_mechanism_promotion_ready),
    sourceRefs: [suiteResult.result_id, ...candidateRefs, ...transitionRefs],
  });
  const promotionReceipt = buildMechanismPromotionReceipt(mechanismPromotionDecision);
  const evolutionStatus = suiteResult.status !== 'passed'
    ? 'blocked'
    : mechanismPromotionDecision.automatic_mechanism_promotion_ready
      ? 'mechanism_auto_promoted_to_canary'
      : mechanismPromotionDecision.promotion_decision;

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
    status: evolutionStatus,
    suite_result: suiteResult,
    mechanism_ref: mechanism.mechanism_ref,
    mechanism_version: mechanism.mechanism_version,
    editable_surfaces: mechanism.editable_surfaces,
    integration_contracts: integrationContracts,
    review_trace_ledger: reviewTraceLedger,
    log_driven_mechanism_candidates: logDrivenCandidates,
    aris_maturity_controls: arisMaturityControls,
    ahe_evidence: aheEvidence,
    codex_attempt_trace_flywheel: codexAttemptTraceFlywheel,
    variant_comparison: variantComparison,
    log_mined_candidate_refs: logDrivenCandidates.log_mined_candidate_refs,
    mechanism_promotion_decision: mechanismPromotionDecision,
    independent_ai_review_receipt: independentReview,
    independent_ai_review_assessment: independentAiReviewAssessment,
    promotion_receipt: promotionReceipt,
    rollback: buildMechanismRollback([suiteResult.result_id, ...candidateRefs]), // reuse-first: allow Agent Lab recovery readback field, not updater/package manager.
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
        ...codexAttemptTraceFlywheel.refs.evidence_delta_refs,
      ],
      blocked_evidence_refs: suiteResult.status === 'passed'
        ? codexAttemptTraceFlywheel.refs.blocked_evidence_refs
        : [
          ...suiteResult.missing_observations,
          ...suiteResult.refs.forbidden_authority_flags,
          ...codexAttemptTraceFlywheel.refs.blocked_evidence_refs,
        ],
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
      source_variant_candidate_refs: variantComparison.variant_candidate_refs,
      source_replay_fork_eval_variant_candidate_refs: codexAttemptTraceFlywheel.refs.variant_candidate_refs,
      selected_variant_candidate_ref: variantComparison.selected_candidate_ref,
      codex_attempt_trace_flywheel_ref: codexAttemptTraceFlywheel.read_model_id,
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
      default_promotion: mechanismPromotionDecision.automatic_mechanism_promotion_ready,
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
  const codexAttemptTraceFlywheel = complete.codex_attempt_trace_flywheel;

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
      codex_attempt_trace_refs: codexAttemptTraceFlywheel.refs.attempt_trace_refs,
      codex_command_refs: codexAttemptTraceFlywheel.refs.command_refs,
      codex_file_refs: codexAttemptTraceFlywheel.refs.file_refs,
      codex_subagent_refs: codexAttemptTraceFlywheel.refs.subagent_refs,
      codex_worktree_refs: codexAttemptTraceFlywheel.refs.worktree_refs,
      codex_test_refs: codexAttemptTraceFlywheel.refs.test_refs,
      codex_web_source_refs: codexAttemptTraceFlywheel.refs.web_source_refs,
      codex_review_receipt_refs: codexAttemptTraceFlywheel.refs.review_receipt_refs,
      codex_variant_candidate_refs: codexAttemptTraceFlywheel.refs.variant_candidate_refs,
    },
    connector_payload: connectorPayload(target, results),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
