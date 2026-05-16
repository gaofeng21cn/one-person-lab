import { buildLonglineAgentLabResult, buildSampleAgentLabResult } from './agent-lab.ts';
import { stableId } from './family-runtime-ids.ts';

const AUTHORITY_BOUNDARY = {
  opl: 'agent_lab_eval_improvement_control_plane_refs_only',
  domain: 'truth_quality_artifact_memory_body_and_owner_receipt_authority',
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_accept_or_reject_memory_writeback: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_authorize_export_verdict: false,
  can_mutate_domain_artifact: false,
  can_promote_default_agent_without_gate: false,
  can_train_or_deploy_model_weights: false,
};

export function buildCompleteAgentLabControlPlane() {
  const sampleResult = buildSampleAgentLabResult();
  const longlineResult = buildLonglineAgentLabResult();
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
    surface_kind: 'opl_agent_lab_optimizer_loop',
    status: 'control_plane_ready_external_optimizer_optional',
    candidate_kinds: ['prompt', 'skill', 'stage_policy', 'tool_policy', 'few_shot_examples', 'rubric_gap'],
    loop_steps: [
      'collect_trajectory_refs',
      'freeze_dataset_or_longline_suite',
      'score_with_domain_owned_scorecard_refs',
      'generate_candidate_config_or_branch',
      'run_regression_and_recovery_gates',
      'promote_only_through_explicit_gate',
      'record_online_learning_refs',
    ],
    pattern_refs: [
      'dspy:mipro/bootstrap-few-shot',
      'textgrad:textual-feedback-optimization',
      'agent-lightning:training-agent-disaggregation',
    ],
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
    ready_to_emit_optimizer_candidate_refs: true,
    ready_to_emit_rl_transition_refs: true,
    automatic_model_training_ready: false,
    automatic_default_agent_promotion_ready: false,
    app_workbench_consumption_ready: false,
  };

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
    readiness,
    non_goals: [
      'domain truth mutation',
      'domain quality verdict',
      'artifact mutation',
      'memory body application',
      'ungated default agent promotion',
      'model training or weight deployment inside OPL core',
    ],
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentBuilderMetaAgentPlan() {
  const completeControlPlane = buildCompleteAgentLabControlPlane();
  const stages = [
    {
      stage_id: 'intent-intake',
      purpose: 'understand user goal, delivery bar, domain authority, and non-goals',
      outputs: ['intent_brief_ref', 'acceptance_criteria_ref', 'authority_boundary_ref'],
    },
    {
      stage_id: 'web-experience-research',
      purpose: 'research target-domain agent design patterns, task decomposition, tools, and quality gates',
      outputs: ['research_brief_ref', 'source_refs', 'pattern_disposition_refs'],
    },
    {
      stage_id: 'stage-decomposition',
      purpose: 'turn the target work into OPL stage descriptors, actions, memory refs, and artifact locators',
      outputs: ['stage_control_plane_ref', 'action_catalog_ref', 'memory_descriptor_ref'],
    },
    {
      stage_id: 'agent-skeleton-build',
      purpose: 'generate an OPL-compatible thin domain-agent repo or package surface',
      outputs: ['domain_descriptor_ref', 'skill_refs', 'prompt_refs', 'sidecar_contract_refs'],
    },
    {
      stage_id: 'eval-suite-build',
      purpose: 'create Agent Lab task manifests, recovery probes, scorecard refs, and promotion gates',
      outputs: ['agent_lab_task_manifest_refs', 'scorecard_refs', 'promotion_gate_refs'],
    },
    {
      stage_id: 'baseline-run',
      purpose: 'run the agent through OPL native Agent Lab and optional Inspect-compatible eval surfaces',
      outputs: ['trajectory_refs', 'receipt_refs', 'failure_taxonomy_refs'],
    },
    {
      stage_id: 'optimizer-iteration',
      purpose: 'generate prompt, skill, stage-policy, or tool-policy candidates and rerun gated suites',
      outputs: ['improvement_candidate_refs', 'candidate_branch_refs', 'regression_result_refs'],
    },
    {
      stage_id: 'baseline-delivery',
      purpose: 'deliver a versioned baseline agent with docs, contracts, tests, and authority boundary',
      outputs: ['baseline_agent_package_ref', 'delivery_receipt_ref', 'operator_runbook_ref'],
    },
    {
      stage_id: 'online-learning',
      purpose: 'convert real trajectories into reviewed datasets and gated future improvement candidates',
      outputs: ['online_learning_dataset_refs', 'human_review_refs', 'future_candidate_refs'],
    },
  ];

  return {
    surface_kind: 'opl_meta_agent_builder_plan',
    version: 'opl-meta-agent-builder.v1',
    agent_id: 'opl-foundry-agent-builder',
    status: 'plan_ready_on_agent_lab_complete_control_plane',
    purpose: 'build, test, optimize, and deliver OPL-compatible high-value knowledge-work agents',
    depends_on: {
      agent_lab_complete_control_plane_ref: completeControlPlane.control_plane_id,
      required_opl_surfaces: [
        'domain-agent descriptor',
        'stage control plane',
        'action catalog',
        'family runtime stage attempt ledger',
        'Agent Lab complete control plane',
        'standard domain-agent scaffold',
      ],
    },
    stages,
    baseline_acceptance_gates: [
      'descriptor_valid',
      'direct_and_hosted_path_declared',
      'agent_lab_suite_passed',
      'recovery_probes_passed',
      'no_forbidden_write_proof_passed',
      'domain_authority_boundary_explicit',
      'operator_runbook_present',
    ],
    online_learning_policy: {
      status: 'gated_continuous_learning_refs_only',
      loop: [
        'capture_trajectory_refs',
        'score_or_label_with_owner_refs',
        'add_failure_or_success_case_to_dataset_refs',
        'generate_candidate_change',
        'run_offline_agent_lab_suite',
        'promote_only_after_explicit_gate',
      ],
      can_write_domain_memory_body: false,
      can_promote_default_agent_without_gate: false,
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
