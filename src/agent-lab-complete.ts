import {
  agentLabRefSummary,
  buildLonglineAgentLabResult,
  buildSampleAgentLabResult,
  runAgentLabSuite,
  type AgentLabSuite,
} from './agent-lab.ts';
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
    app_workbench_consumption_ready: true,
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

type AgentLabSuiteResult = ReturnType<typeof runAgentLabSuite>;
export type AgentLabExportTarget = 'inspect-ai' | 'openinference' | 'langfuse' | 'phoenix' | 'json';

function suiteResults() {
  return {
    sample: buildSampleAgentLabResult(),
    longline: buildLonglineAgentLabResult(),
  };
}

function optimizerCandidates(results: AgentLabSuiteResult[]) {
  return results.flatMap((result) =>
    result.runs.map((run) => ({
      candidate_ref: run.improvement_candidate.candidate_ref,
      candidate_kind: run.improvement_candidate.candidate_kind,
      target_ref: run.improvement_candidate.target_ref,
      source_suite_id: result.suite_id,
      source_run_id: run.run_id,
      domain_id: run.domain_id,
      evidence_refs: run.improvement_candidate.evidence_refs,
      allowed_change_scope: run.improvement_candidate.allowed_change_scope,
      promotion_gate_ref: run.improvement_candidate.promotion_gate_ref,
      gate_status: run.promotion_gate.gate_status,
      candidate_status: run.status === 'passed' && run.promotion_gate.gate_status === 'passed'
        ? 'gated_candidate_ready'
        : 'blocked',
      authority_boundary: AUTHORITY_BOUNDARY,
    })));
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

export function buildAgentLabWorkbenchReadModel() {
  const complete = buildCompleteAgentLabControlPlane();
  const { sample, longline } = suiteResults();
  const results = [sample, longline];

  return {
    surface_kind: 'opl_agent_lab_workbench_read_model',
    version: 'opl-agent-lab.v1.workbench',
    read_model_id: stableId('oalwb', [complete.control_plane_id, sample.result_id, longline.result_id]),
    status: 'ready_for_app_workbench_consumption',
    app_workbench_consumption_ready: true,
    source_results: {
      complete_control_plane_ref: complete.control_plane_id,
      sample_suite_ref: sample.result_id,
      longline_suite_ref: longline.result_id,
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
    promotion_gates: promotionGates(results),
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
    },
    connector_payload: connectorPayload(target, results),
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}

export function buildAgentLabOptimizeResult(input: AgentLabSuite) {
  const suiteResult = runAgentLabSuite(input);
  const candidates = optimizerCandidates([suiteResult]);
  const transitions = rlTransitionRefs([suiteResult]);

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
      candidates,
    },
    rl_transition_refs: {
      transition_count: transitions.length,
      transitions,
    },
    automatic_model_training_ready: false,
    automatic_default_agent_promotion_ready: false,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
