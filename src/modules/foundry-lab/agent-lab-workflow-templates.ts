import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../charter/index.ts';
import { stableId } from '../runway/index.ts';

const AGENT_LAB_WORKFLOW_TEMPLATE_ALLOWED_OUTPUTS = [
  'suite_topology_ref',
  'verifier_ref',
  'work_order_draft_ref',
] as const;

const AGENT_LAB_WORKFLOW_TEMPLATE_FORBIDDEN_CLAIMS = [
  'runtime_substrate',
  'ordinary_workflow_compiler',
  'domain_truth',
  'quality_verdict',
  'owner_receipt',
] as const;

const AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY = {
  can_define_runtime_substrate: false,
  can_compile_ordinary_user_workflow: false,
  can_replace_runway_or_temporal: false,
  can_write_domain_truth: false,
  can_authorize_quality_verdict: false,
  can_write_owner_receipt: false,
  can_mutate_domain_artifact: false,
  can_write_memory_body: false,
};

const WORKFLOW_TEMPLATE_PATTERNS = [
  {
    pattern_id: 'classify_and_act',
    pattern_role: 'route evidence or blocker refs into a bounded next action',
  },
  {
    pattern_id: 'fan_out_and_synthesize',
    pattern_role: 'run disjoint suite lanes and synthesize refs-only evidence',
  },
  {
    pattern_id: 'adversarial_verification',
    pattern_role: 'bind an independent verifier ref to a candidate output',
  },
  {
    pattern_id: 'generate_and_filter',
    pattern_role: 'generate candidate refs and filter them through explicit gates',
  },
  {
    pattern_id: 'tournament',
    pattern_role: 'compare variants while keeping loser refs learning-only',
  },
  {
    pattern_id: 'loop_until_done',
    pattern_role: 'repeat a suite topology until a typed done or blocker ref appears',
  },
  {
    pattern_id: 'model_routing',
    pattern_role: 'select executor or model trial refs without changing defaults',
  },
  {
    pattern_id: 'worktree_isolation',
    pattern_role: 'separate patch work orders by target checkout and write set',
  },
] as const;

export type AgentLabWorkflowTemplateId = (typeof WORKFLOW_TEMPLATE_PATTERNS)[number]['pattern_id'];

type WorkflowLaneKind =
  | 'classify_lane'
  | 'action_draft_lane'
  | 'blocker_review_lane'
  | 'analysis_lane'
  | 'implementation_lane'
  | 'verification_lane'
  | 'candidate_lane'
  | 'adversary_lane'
  | 'arbiter_lane'
  | 'generator_lane'
  | 'filter_lane'
  | 'promotion_gate_lane'
  | 'variant_a_lane'
  | 'variant_b_lane'
  | 'judge_lane'
  | 'iteration_lane'
  | 'evaluator_lane'
  | 'resume_lane'
  | 'routing_lane'
  | 'trial_lane'
  | 'default_guard_lane'
  | 'base_checkout_lane'
  | 'candidate_worktree_lane'
  | 'merge_review_lane';

type WorkflowVerifierKind =
  | 'route_decision_shape'
  | 'blocker_ref_completeness'
  | 'synthesis_ref_integrity'
  | 'lane_disjointness'
  | 'adversarial_independence'
  | 'candidate_ref_binding'
  | 'candidate_gate_binding'
  | 'loser_ref_learning_only'
  | 'tournament_pairing'
  | 'loop_stop_condition'
  | 'resume_token_consistency'
  | 'default_executor_guard'
  | 'route_ref_completeness'
  | 'write_set_disjointness'
  | 'worktree_cleanup_gate';

type WorkflowLanePlan = {
  lane_kind: WorkflowLaneKind;
  lane_role: string;
  write_set_ref: string;
};

type WorkflowRunPlan = {
  lane_plans: WorkflowLanePlan[];
  verifier_kinds: WorkflowVerifierKind[];
  stop_condition_refs: string[];
  synthesis_mode: string;
};

type AgentLabWorkflowTemplateRunInput = {
  templateId: string;
  projectDir: string;
  outputDir?: string | null;
};

const WORKFLOW_TEMPLATE_RUN_PLANS: Record<AgentLabWorkflowTemplateId, WorkflowRunPlan> = {
  classify_and_act: {
    lane_plans: [
      {
        lane_kind: 'classify_lane',
        lane_role: 'Classify incoming evidence and blocker refs into a typed next-action route.',
        write_set_ref: 'write-set-ref:classification-read-model-only',
      },
      {
        lane_kind: 'action_draft_lane',
        lane_role: 'Draft a bounded work order from the selected route without dispatching it.',
        write_set_ref: 'write-set-ref:work-order-draft-only',
      },
      {
        lane_kind: 'blocker_review_lane',
        lane_role: 'Check route blockers and handoff refs before any executable follow-up.',
        write_set_ref: 'write-set-ref:blocker-ref-review-only',
      },
    ],
    verifier_kinds: ['route_decision_shape', 'blocker_ref_completeness'],
    stop_condition_refs: [
      'stop-condition-ref:typed-route-selected',
      'stop-condition-ref:blocker-or-work-order-draft-emitted',
    ],
    synthesis_mode: 'route_ref_summary',
  },
  fan_out_and_synthesize: {
    lane_plans: [
      {
        lane_kind: 'analysis_lane',
        lane_role: 'Analyze the target project and produce refs for candidate work scopes.',
        write_set_ref: 'write-set-ref:analysis-notes-only',
      },
      {
        lane_kind: 'implementation_lane',
        lane_role: 'Plan an implementation lane with explicit write-set boundaries.',
        write_set_ref: 'write-set-ref:implementation-draft-only',
      },
      {
        lane_kind: 'verification_lane',
        lane_role: 'Plan a verifier lane that consumes lane refs and emits proof refs.',
        write_set_ref: 'write-set-ref:verification-draft-only',
      },
    ],
    verifier_kinds: ['synthesis_ref_integrity', 'lane_disjointness'],
    stop_condition_refs: [
      'stop-condition-ref:all-lane-refs-collected',
      'stop-condition-ref:synthesis-ref-written',
    ],
    synthesis_mode: 'fan_out_lane_ref_synthesis',
  },
  adversarial_verification: {
    lane_plans: [
      {
        lane_kind: 'candidate_lane',
        lane_role: 'Draft the candidate answer or patch plan as refs-only evidence.',
        write_set_ref: 'write-set-ref:candidate-draft-only',
      },
      {
        lane_kind: 'adversary_lane',
        lane_role: 'Draft independent challenge refs against candidate assumptions.',
        write_set_ref: 'write-set-ref:adversarial-review-only',
      },
      {
        lane_kind: 'arbiter_lane',
        lane_role: 'Bind candidate and adversary refs into an adjudication work order.',
        write_set_ref: 'write-set-ref:arbiter-draft-only',
      },
    ],
    verifier_kinds: ['adversarial_independence', 'candidate_ref_binding'],
    stop_condition_refs: [
      'stop-condition-ref:challenge-refs-bound',
      'stop-condition-ref:arbiter-work-order-draft-emitted',
    ],
    synthesis_mode: 'adversarial_ref_adjudication',
  },
  generate_and_filter: {
    lane_plans: [
      {
        lane_kind: 'generator_lane',
        lane_role: 'Generate candidate refs for later review.',
        write_set_ref: 'write-set-ref:candidate-generation-only',
      },
      {
        lane_kind: 'filter_lane',
        lane_role: 'Filter generated refs through explicit acceptance gates.',
        write_set_ref: 'write-set-ref:filter-decision-only',
      },
      {
        lane_kind: 'promotion_gate_lane',
        lane_role: 'Draft gate refs for owner review without promotion.',
        write_set_ref: 'write-set-ref:promotion-gate-draft-only',
      },
    ],
    verifier_kinds: ['candidate_gate_binding', 'loser_ref_learning_only'],
    stop_condition_refs: [
      'stop-condition-ref:candidates-filtered',
      'stop-condition-ref:gate-draft-emitted',
    ],
    synthesis_mode: 'candidate_filter_ref_summary',
  },
  tournament: {
    lane_plans: [
      {
        lane_kind: 'variant_a_lane',
        lane_role: 'Draft the first variant ref under an isolated lane identity.',
        write_set_ref: 'write-set-ref:variant-a-draft-only',
      },
      {
        lane_kind: 'variant_b_lane',
        lane_role: 'Draft the second variant ref under an isolated lane identity.',
        write_set_ref: 'write-set-ref:variant-b-draft-only',
      },
      {
        lane_kind: 'judge_lane',
        lane_role: 'Compare variant refs and keep loser refs as learning inputs only.',
        write_set_ref: 'write-set-ref:tournament-judge-draft-only',
      },
    ],
    verifier_kinds: ['tournament_pairing', 'loser_ref_learning_only'],
    stop_condition_refs: [
      'stop-condition-ref:tournament-pair-compared',
      'stop-condition-ref:winner-ref-selected-for-review',
    ],
    synthesis_mode: 'tournament_ref_comparison',
  },
  loop_until_done: {
    lane_plans: [
      {
        lane_kind: 'iteration_lane',
        lane_role: 'Draft the next loop iteration work order with bounded inputs.',
        write_set_ref: 'write-set-ref:iteration-draft-only',
      },
      {
        lane_kind: 'evaluator_lane',
        lane_role: 'Evaluate iteration refs against typed done and blocker conditions.',
        write_set_ref: 'write-set-ref:evaluator-draft-only',
      },
      {
        lane_kind: 'resume_lane',
        lane_role: 'Record resumable state for the next loop turn.',
        write_set_ref: 'write-set-ref:resume-state-only',
      },
    ],
    verifier_kinds: ['loop_stop_condition', 'resume_token_consistency'],
    stop_condition_refs: [
      'stop-condition-ref:typed-done-ref-present',
      'stop-condition-ref:typed-blocker-ref-present',
      'stop-condition-ref:max-iteration-budget-ref-reached',
    ],
    synthesis_mode: 'loop_resume_ref_state',
  },
  model_routing: {
    lane_plans: [
      {
        lane_kind: 'routing_lane',
        lane_role: 'Route work to candidate executor or model trial refs.',
        write_set_ref: 'write-set-ref:model-route-draft-only',
      },
      {
        lane_kind: 'trial_lane',
        lane_role: 'Draft a trial lane without changing framework defaults.',
        write_set_ref: 'write-set-ref:trial-plan-only',
      },
      {
        lane_kind: 'default_guard_lane',
        lane_role: 'Check that defaults remain unchanged until explicit gates pass.',
        write_set_ref: 'write-set-ref:default-guard-proof-only',
      },
    ],
    verifier_kinds: ['default_executor_guard', 'route_ref_completeness'],
    stop_condition_refs: [
      'stop-condition-ref:route-ref-selected',
      'stop-condition-ref:default-guard-proof-emitted',
    ],
    synthesis_mode: 'model_route_ref_summary',
  },
  worktree_isolation: {
    lane_plans: [
      {
        lane_kind: 'base_checkout_lane',
        lane_role: 'Record base checkout refs and source-of-truth branch inputs.',
        write_set_ref: 'write-set-ref:base-checkout-read-only',
      },
      {
        lane_kind: 'candidate_worktree_lane',
        lane_role: 'Draft candidate worktree refs with a disjoint write set.',
        write_set_ref: 'write-set-ref:candidate-worktree-draft-only',
      },
      {
        lane_kind: 'merge_review_lane',
        lane_role: 'Draft merge review and cleanup gates before absorption.',
        write_set_ref: 'write-set-ref:merge-review-draft-only',
      },
    ],
    verifier_kinds: ['write_set_disjointness', 'worktree_cleanup_gate'],
    stop_condition_refs: [
      'stop-condition-ref:worktree-write-sets-disjoint',
      'stop-condition-ref:merge-review-gate-drafted',
      'stop-condition-ref:cleanup-gate-drafted',
    ],
    synthesis_mode: 'worktree_isolation_ref_plan',
  },
};

function buildWorkflowTemplatePattern(pattern: (typeof WORKFLOW_TEMPLATE_PATTERNS)[number]) {
  return {
    ...pattern,
    template_ref: `workflow-template:agent-lab/foundry-lab/${pattern.pattern_id}`,
    suite_topology_ref: `suite-topology-ref:agent-lab/foundry-lab/${pattern.pattern_id}`,
    verifier_ref: `verifier-ref:agent-lab/foundry-lab/${pattern.pattern_id}`,
    work_order_draft_ref: `work-order-draft-ref:agent-lab/foundry-lab/${pattern.pattern_id}`,
    allowed_outputs: AGENT_LAB_WORKFLOW_TEMPLATE_ALLOWED_OUTPUTS,
    forbidden_claims: AGENT_LAB_WORKFLOW_TEMPLATE_FORBIDDEN_CLAIMS,
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };
}

function findWorkflowTemplatePattern(templateId: string) {
  return WORKFLOW_TEMPLATE_PATTERNS.find((pattern) => pattern.pattern_id === templateId) ?? null;
}

function slugify(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'workflow';
}

function assertDirectory(value: string, field: string) {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `Agent Lab workflow ${field} is missing: ${value}.`, {
        [field]: value,
      });
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new FrameworkContractError('contract_shape_invalid', `Agent Lab workflow ${field} must be a directory.`, {
      [field]: value,
    });
  }
}

function writeJsonArtifact(file: string, value: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function laneRef(runRefPrefix: string, laneKind: string) {
  return `${runRefPrefix}/lane/${laneKind}`;
}

function verifierRef(runRefPrefix: string, verifierKind: string) {
  return `${runRefPrefix}/verifier/${verifierKind}`;
}

function workOrderDraftRef(runRefPrefix: string, laneKind: string) {
  return `${runRefPrefix}/work-order-draft/${laneKind}`;
}

function progressEventRef(runRefPrefix: string, eventKind: string) {
  return `${runRefPrefix}/progress/${eventKind}`;
}

export function buildAgentLabWorkflowTemplateCatalog() {
  const patterns = WORKFLOW_TEMPLATE_PATTERNS.map(buildWorkflowTemplatePattern);
  return {
    surface_kind: 'opl_agent_lab_workflow_template_catalog',
    catalog_id: 'workflow-template-catalog:opl-agent-lab/foundry-lab-dynamic-suite-topology',
    status: 'ready',
    refs_only: true,
    read_model_role: 'foundry_lab_suite_topology_workflow_template_layer',
    template_scope: 'dynamic_suite_topology_and_work_order_draft_refs_only',
    template_catalog: {
      catalog_ref: 'workflow-template-catalog-ref:opl-agent-lab/foundry-lab-dynamic-suite-topology',
      template_count: patterns.length,
      patterns,
    },
    allowed_outputs: AGENT_LAB_WORKFLOW_TEMPLATE_ALLOWED_OUTPUTS,
    forbidden_claims: AGENT_LAB_WORKFLOW_TEMPLATE_FORBIDDEN_CLAIMS,
    source_refs: [
      'human_doc:docs/runtime/opl-agent-lab-control-plane#dynamic-workflow-template',
      'human_doc:docs/references/brand-modules/foundry-lab#dynamic-workflow-template',
    ],
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };
}

export function isAgentLabWorkflowTemplateId(value: string): value is AgentLabWorkflowTemplateId {
  return findWorkflowTemplatePattern(value) !== null;
}

export function listAgentLabWorkflowTemplateIds() {
  return WORKFLOW_TEMPLATE_PATTERNS.map((pattern) => pattern.pattern_id);
}

export function buildAgentLabWorkflowTemplateRun(input: AgentLabWorkflowTemplateRunInput) {
  const pattern = findWorkflowTemplatePattern(input.templateId);
  if (!pattern) {
    throw new FrameworkContractError('contract_shape_invalid', `Unsupported Agent Lab workflow template: ${input.templateId}.`, {
      template_id: input.templateId,
      supported_template_ids: listAgentLabWorkflowTemplateIds(),
    });
  }

  const projectDir = path.resolve(input.projectDir);
  assertDirectory(projectDir, 'project_dir');

  const templateId = pattern.pattern_id;
  const runPlan = WORKFLOW_TEMPLATE_RUN_PLANS[templateId];
  const outputDir = path.resolve(
    input.outputDir ?? path.join(projectDir, '.opl-agent-lab-workflow-runs', templateId),
  );
  fs.mkdirSync(outputDir, { recursive: true });
  assertDirectory(outputDir, 'output_dir');

  const projectRef = `project-ref:${projectDir}`;
  const projectSlug = slugify(path.basename(projectDir));
  const runId = stableId('oalwfrun', [templateId, projectDir, outputDir]);
  const runRefPrefix = `workflow-template-run-ref:agent-lab/${templateId}/${runId}`;
  const resumeToken = `workflow-resume-token:agent-lab/${templateId}/${runId}`;
  const suiteTopologyRef = `${runRefPrefix}/suite-topology`;
  const workOrderSequenceRef = `${runRefPrefix}/work-order-sequence`;
  const runnerExecutionReceiptRef = `${runRefPrefix}/runner-execution-receipt`;
  const typedBlockerOrAcceptanceRef = `${runRefPrefix}/typed-acceptance`;
  const synthesisRef = `${runRefPrefix}/final-synthesis`;
  const noOpProofRef = `${runRefPrefix}/noop-proof`;

  const lanes = runPlan.lane_plans.map((lane, index) => {
    const ref = laneRef(runRefPrefix, lane.lane_kind);
    return {
      lane_ref: ref,
      lane_index: index,
      lane_kind: lane.lane_kind,
      lane_role: lane.lane_role,
      execution_mode: 'planned_no_subagent_invocation',
      project_ref: projectRef,
      write_set_ref: `${lane.write_set_ref}:${projectSlug}`,
      work_order_draft_ref: workOrderDraftRef(runRefPrefix, lane.lane_kind),
      expected_output_refs: [
        `${ref}/output/suite-topology`,
        `${ref}/output/progress-event`,
      ],
    };
  });

  const verifierRefs = runPlan.verifier_kinds.map((verifierKind, index) => ({
    verifier_ref: verifierRef(runRefPrefix, verifierKind),
    verifier_index: index,
    verifier_kind: verifierKind,
    execution_mode: 'planned_no_external_executor',
    verifies_lane_refs: lanes.map((lane) => lane.lane_ref),
    proof_ref: `${runRefPrefix}/proof/${verifierKind}`,
  }));

  const workOrderDraftRefs = lanes.map((lane) => ({
    work_order_draft_ref: lane.work_order_draft_ref,
    lane_ref: lane.lane_ref,
    project_ref: projectRef,
    target_dir_ref: `target-dir-ref:${projectSlug}`,
    write_set_ref: lane.write_set_ref,
    dispatch_status: 'draft_not_dispatched',
    stop_condition_refs: runPlan.stop_condition_refs,
    resume_token_ref: resumeToken,
  }));

  const suiteTopology = {
    surface_kind: 'opl_agent_lab_workflow_suite_topology',
    version: 'opl-agent-lab.workflow-template-run.v1',
    suite_topology_ref: suiteTopologyRef,
    run_id: runId,
    run_ref: runRefPrefix,
    template_id: templateId,
    project_ref: projectRef,
    lane_refs: lanes.map((lane) => lane.lane_ref),
    verifier_refs: verifierRefs.map((verifier) => verifier.verifier_ref),
    work_order_draft_refs: workOrderDraftRefs.map((workOrder) => workOrder.work_order_draft_ref),
    stop_condition_refs: runPlan.stop_condition_refs,
    synthesis_mode: runPlan.synthesis_mode,
    refs_only: true,
  };

  const workOrderSequence = {
    surface_kind: 'opl_agent_lab_work_order_sequence',
    version: 'opl-agent-lab.workflow-template-run.v1',
    work_order_sequence_ref: workOrderSequenceRef,
    run_id: runId,
    run_ref: runRefPrefix,
    template_id: templateId,
    dispatch_status: 'draft_not_dispatched',
    ordered_work_order_draft_refs: workOrderDraftRefs.map((workOrder, index) => ({
      sequence_index: index,
      work_order_draft_ref: workOrder.work_order_draft_ref,
      lane_ref: workOrder.lane_ref,
      write_set_ref: workOrder.write_set_ref,
    })),
    resume_token_ref: resumeToken,
    accepted_downstream_route: 'work_order_draft_ref_to_opl_work_order_execute_or_typed_blocker',
  };

  const progressEvents = [
    'workflow_spec_written',
    'suite_topology_written',
    'lane_refs_written',
    'verifier_refs_written',
    'work_order_draft_refs_written',
    'work_order_sequence_written',
    'resume_token_written',
    'final_synthesis_written',
    'typed_acceptance_written',
    'runner_execution_receipt_written',
  ].map((eventKind, index) => ({
    event_ref: progressEventRef(runRefPrefix, eventKind),
    event_index: index,
    event_kind: eventKind,
    status: 'recorded',
    run_ref: runRefPrefix,
    resume_token_ref: resumeToken,
  }));

  const finalProof = {
    proof_kind: 'workflow_template_run_noop_proof',
    proof_ref: noOpProofRef,
    synthesis_ref: synthesisRef,
    synthesis_mode: runPlan.synthesis_mode,
    run_id: runId,
    template_id: templateId,
    no_subagents_executed: true,
    no_external_executor_invoked: true,
    no_project_files_mutated: true,
    no_domain_truth_written: true,
    no_quality_verdict_issued: true,
    no_owner_receipt_written: true,
    blocked_claim_refs: [
      `${runRefPrefix}/blocked-claim/runtime-substrate`,
      `${runRefPrefix}/blocked-claim/ordinary-workflow-compiler`,
      `${runRefPrefix}/blocked-claim/domain-truth`,
      `${runRefPrefix}/blocked-claim/quality-verdict`,
      `${runRefPrefix}/blocked-claim/owner-receipt`,
    ],
  };

  const typedBlockerOrAcceptance = {
    surface_kind: 'opl_agent_lab_workflow_typed_blocker_or_acceptance',
    version: 'opl-agent-lab.workflow-template-run.v1',
    typed_blocker_ref_or_acceptance_ref: typedBlockerOrAcceptanceRef,
    run_id: runId,
    run_ref: runRefPrefix,
    template_id: templateId,
    status: 'accepted_no_blocker_for_draft_runner',
    accepted: true,
    acceptance_ref: typedBlockerOrAcceptanceRef,
    typed_blocker_refs: [],
    required_artifact_status: {
      suite_topology_ref: true,
      verifier_ref: verifierRefs.length > 0,
      work_order_draft_ref: workOrderDraftRefs.length > 0,
      work_order_sequence_ref: true,
      runner_execution_receipt_ref: true,
      typed_blocker_ref_or_acceptance_ref: true,
    },
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };

  const workflowSpec = {
    surface_kind: 'opl_agent_lab_workflow_template_spec',
    version: 'opl-agent-lab.workflow-template-run.v1',
    run_id: runId,
    run_ref: runRefPrefix,
    template_id: templateId,
    template_ref: `workflow-template:agent-lab/foundry-lab/${templateId}`,
    pattern_role: pattern.pattern_role,
    status: 'planned_no_subagents_executed',
    refs_only: true,
    executable_plan: true,
    execution_mode: 'deterministic_artifact_plan_only',
    project_ref: projectRef,
    output_ref: `workflow-output-ref:${outputDir}`,
    suite_topology_ref: suiteTopologyRef,
    lanes,
    verifier_refs: verifierRefs,
    work_order_draft_refs: workOrderDraftRefs,
    work_order_sequence_ref: workOrderSequenceRef,
    progress_event_refs: progressEvents.map((event) => event.event_ref),
    resume_state: {
      resume_token: resumeToken,
      next_event_index: progressEvents.length,
      stop_condition_refs: runPlan.stop_condition_refs,
      resume_command_ref:
        `opl agent-lab workflow-template run --template ${templateId} --project ${projectDir} --output ${outputDir} --json`,
    },
    final_synthesis_ref: synthesisRef,
    no_op_proof_ref: noOpProofRef,
    runner_execution_receipt_ref: runnerExecutionReceiptRef,
    typed_blocker_ref_or_acceptance_ref: typedBlockerOrAcceptanceRef,
    source_refs: [
      'human_doc:anthropic/building-effective-agents#orchestrator-workers',
      'human_doc:anthropic/building-effective-agents#evaluator-optimizer',
      'human_doc:claude-code/common-workflows#resume-worktrees-subagents',
      'human_doc:claude-code/hooks#worktree-create-remove',
    ],
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };

  const artifactFiles = {
    workflow_spec: path.join(outputDir, 'workflow-spec.json'),
    suite_topology: path.join(outputDir, 'suite-topology.json'),
    lane_refs: path.join(outputDir, 'lane-refs.json'),
    verifier_refs: path.join(outputDir, 'verifier-refs.json'),
    work_order_draft_refs: path.join(outputDir, 'work-order-draft-refs.json'),
    work_order_sequence: path.join(outputDir, 'work-order-sequence.json'),
    progress_events: path.join(outputDir, 'progress-events.json'),
    resume_token: path.join(outputDir, 'resume-token.txt'),
    final_proof: path.join(outputDir, 'final-synthesis-noop-proof.json'),
    typed_blocker_or_acceptance: path.join(outputDir, 'typed-blocker-or-acceptance.json'),
    runner_execution_receipt: path.join(outputDir, 'runner-execution-receipt.json'),
  };

  const runnerExecutionReceipt = {
    surface_kind: 'opl_agent_lab_workflow_runner_execution_receipt',
    version: 'opl-agent-lab.workflow-template-run.v1',
    runner_execution_receipt_ref: runnerExecutionReceiptRef,
    run_id: runId,
    run_ref: runRefPrefix,
    template_id: templateId,
    status: 'runner_receipt_emitted',
    execution_mode: 'deterministic_artifact_plan_only',
    refs_only: true,
    suite_topology_ref: suiteTopologyRef,
    verifier_refs: verifierRefs.map((verifier) => verifier.verifier_ref),
    work_order_draft_refs: workOrderDraftRefs.map((workOrder) => workOrder.work_order_draft_ref),
    work_order_sequence_ref: workOrderSequenceRef,
    typed_blocker_ref_or_acceptance_ref: typedBlockerOrAcceptanceRef,
    progress_event_refs: progressEvents.map((event) => event.event_ref),
    artifact_files: artifactFiles,
    required_artifact_status: {
      suite_topology_ref: true,
      verifier_ref: verifierRefs.length > 0,
      work_order_draft_ref: workOrderDraftRefs.length > 0,
      work_order_sequence_ref: true,
      runner_execution_receipt_ref: true,
      typed_blocker_ref_or_acceptance_ref: true,
    },
    no_op_proof: finalProof,
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };

  writeJsonArtifact(artifactFiles.workflow_spec, workflowSpec);
  writeJsonArtifact(artifactFiles.suite_topology, suiteTopology);
  writeJsonArtifact(artifactFiles.lane_refs, lanes);
  writeJsonArtifact(artifactFiles.verifier_refs, verifierRefs);
  writeJsonArtifact(artifactFiles.work_order_draft_refs, workOrderDraftRefs);
  writeJsonArtifact(artifactFiles.work_order_sequence, workOrderSequence);
  writeJsonArtifact(artifactFiles.progress_events, progressEvents);
  fs.writeFileSync(artifactFiles.resume_token, `${resumeToken}\n`, 'utf8');
  writeJsonArtifact(artifactFiles.final_proof, finalProof);
  writeJsonArtifact(artifactFiles.typed_blocker_or_acceptance, typedBlockerOrAcceptance);
  writeJsonArtifact(artifactFiles.runner_execution_receipt, runnerExecutionReceipt);

  return {
    surface_kind: 'opl_agent_lab_workflow_template_run',
    version: 'opl-agent-lab.workflow-template-run.v1',
    run_id: runId,
    run_ref: runRefPrefix,
    template_id: templateId,
    status: 'planned_no_subagents_executed',
    project_dir: projectDir,
    output_dir: outputDir,
    refs_only: true,
    workflow_spec: workflowSpec,
    suite_topology: suiteTopology,
    suite_topology_ref: suiteTopologyRef,
    lane_refs: lanes.map((lane) => lane.lane_ref),
    verifier_refs: verifierRefs.map((verifier) => verifier.verifier_ref),
    work_order_draft_refs: workOrderDraftRefs.map((workOrder) => workOrder.work_order_draft_ref),
    work_order_sequence: workOrderSequence,
    work_order_sequence_ref: workOrderSequenceRef,
    progress_event_refs: progressEvents.map((event) => event.event_ref),
    resume_token: resumeToken,
    final_proof: finalProof,
    runner_execution_receipt: runnerExecutionReceipt,
    runner_execution_receipt_ref: runnerExecutionReceiptRef,
    typed_blocker_or_acceptance: typedBlockerOrAcceptance,
    typed_blocker_ref_or_acceptance_ref: typedBlockerOrAcceptanceRef,
    required_artifact_status: runnerExecutionReceipt.required_artifact_status,
    artifact_files: artifactFiles,
    authority_boundary: AGENT_LAB_WORKFLOW_TEMPLATE_AUTHORITY_BOUNDARY,
  };
}
