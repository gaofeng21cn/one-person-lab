import fs from 'node:fs';
import path from 'node:path';

export const OMA_EVALUATION_FIXTURE = {
  targetDomainId: 'target-agent',
  taskDomainId: 'opl-meta-agent',
  targetAgentRef: 'domain-agent:target-agent',
  targetDescriptorRef: '/tmp/target-agent/contracts/domain_descriptor.json',
  workOrderId: 'oma-foundry-lab-work-order:target-agent/takeover',
  suiteId: 'opl-meta-agent-takeover-suite:target-agent',
  taskId: 'agent-lab-task:opl-meta-agent/target-agent/takeover',
  probeRef: 'recovery-probe:opl-meta-agent/target-agent/resume-after-interruption',
  trajectoryRef: 'trajectory:opl-meta-agent/target-agent/testing-takeover',
  scorecardRef: 'quality-scorecard:opl-meta-agent/target-agent/takeover-acceptance',
  improvementCandidateRef: 'improvement-candidate:opl-meta-agent/target-agent/gated-self-evolution',
  mechanismCandidateRef: 'mechanism-candidate:opl-meta-agent/target-agent/testing-takeover-loop',
  otherCandidateRef: 'candidate-agent-package:target-agent',
  gateRef: 'promotion-gate:opl-meta-agent/target-agent/takeover',
  evaluationOwner: 'one-person-lab/OPL Foundry Lab',
  packetReceiptRef: 'evaluation-receipt:opl-foundry-lab/target-agent/takeover',
  probeReceiptRef: 'probe-observation-receipt:opl-foundry-lab/target-agent/resume',
  trajectoryReceiptRef: 'trajectory-observation-receipt:opl-foundry-lab/target-agent/takeover',
  scorecardReceiptRef: 'scorecard-receipt:opl-meta-agent/target-agent/takeover',
  promotionReceiptRef: 'promotion-gate-evaluation-receipt:opl-foundry-lab/target-agent/takeover',
  policyReceiptRef: 'stage-policy-receipt:opl-meta-agent/target-agent/takeover',
} as const;

export function writeEvaluationJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function buildOmaTakeoverEvaluationFixture(tmpDir: string) {
  const ids = OMA_EVALUATION_FIXTURE;
  const suiteSeedPath = path.join(tmpDir, 'agent-lab-takeover-suite-seed.json');
  const workOrderPath = path.join(tmpDir, 'foundry-lab-work-order.json');
  const observationsPath = path.join(tmpDir, 'foundry-lab-evaluation-observations.json');
  const outputDir = path.join(tmpDir, 'foundry-lab-output');
  const suiteSeed = {
    surface_kind: 'opl_meta_agent_agent_lab_suite_seed',
    version: 'opl-meta-agent.agent-lab-suite-seed.v1',
    suite_id: ids.suiteId,
    suite_kind: 'agent_lab_external_suite',
    seed_status: 'declarative_seed_candidate_waiting_for_foundry_lab_consumer',
    execution_owner: ids.evaluationOwner,
    target_agent_ref: ids.targetAgentRef,
    target_agent_descriptor_ref: ids.targetDescriptorRef,
    authority_boundary: {
      refs_only: true,
      oma_can_execute_suite: false,
      oma_can_write_suite_result: false,
      oma_can_write_owner_receipt_body: false,
      oma_can_write_promotion_gate: false,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_authorize_quality_verdict: false,
      can_promote_default_agent_without_gate: false,
    },
    tasks: [{
      task_id: ids.taskId,
      domain_id: ids.taskDomainId,
      task_family: 'agent_testing_takeover',
      target_agent_ref: ids.targetAgentRef,
      target_agent_descriptor_ref: ids.targetDescriptorRef,
      environment: {
        environment_kind: 'fixture',
        workspace_locator_ref: 'workspace-locator:/tmp/target-agent',
        sandbox_policy: 'fixture_only_no_artifact_mutation',
        network_policy: 'offline',
      },
      instructions_ref: 'instructions:opl-meta-agent/target-agent/takeover',
      agent_entry_ref: 'domain-agent-entry:target-agent',
      stage_refs: ['stage:target-agent/external-agent-lab-evaluation-request'],
      oracle_refs: ['oracle:opl-meta-agent/target-agent/authority-boundary-preserved'],
      scorer_refs: ['scorer:opl-meta-agent/target-agent/takeover-acceptance'],
      recovery_probe_specs: [{
        probe_ref: ids.probeRef,
        probe_kind: 'resume_after_interruption',
        expected_status: 'passed',
        source_refs: ['receipt-ref:opl-meta-agent/target-agent/resume-fixture'],
      }],
      trajectory_plan: {
        trajectory_ref: ids.trajectoryRef,
        requested_run_ref: 'run:opl-meta-agent/target-agent/testing-takeover',
        agent_executor: 'codex_cli',
        tool_affordance_refs: ['opl-action:agent-lab/run'],
        expected_receipt_refs: ['owner-receipt:opl-meta-agent/target-agent/testing-takeover'],
      },
      scorecard_spec: {
        scorecard_ref: ids.scorecardRef,
        domain_owned: true,
        opl_scorecard_role: 'scorecard_ref_projection_only',
        metric_refs: ['metric-ref:descriptor-valid'],
        evidence_refs: ['evidence-ref:target-agent/descriptor-contract-read'],
      },
      improvement_candidate_seed: {
        candidate_ref: ids.improvementCandidateRef,
        candidate_kind: 'gated_self_evolution',
        target_ref: 'quality-gate:opl-meta-agent/target-agent/domain-owner-boundary',
        allowed_change_scope: 'branch_only',
      },
      promotion_gate_request: {
        gate_ref: ids.gateRef,
        evaluation_owner: ids.evaluationOwner,
        required_refs: [ids.scorecardRef],
      },
    }],
  };
  const workOrder = {
    surface_kind: 'opl_meta_agent_foundry_lab_work_order_candidate',
    version: 'opl-meta-agent.foundry-lab-work-order-candidate.v1',
    work_order_id: ids.workOrderId,
    work_order_kind: 'target_agent_takeover_evaluation',
    status: 'ready_for_opl_foundry_lab_evaluation',
    execution_owner: ids.evaluationOwner,
    target_agent: {
      domain_id: ids.targetDomainId,
      domain_label: 'Target Agent',
      repo_dir: '/tmp/target-agent',
      target_agent_ref: ids.targetAgentRef,
      descriptor_ref: ids.targetDescriptorRef,
    },
    suite_seed: {
      ref: path.basename(suiteSeedPath),
      suite_id: ids.suiteId,
      suite_kind: 'agent_lab_external_suite',
    },
    source_refs: ['contracts/domain_descriptor.json'],
    reviewer_refs: ['review:target-agent/takeover'],
    candidate_refs: [
      ids.improvementCandidateRef,
      ids.mechanismCandidateRef,
      ids.otherCandidateRef,
    ],
    consumer_dependency: {
      status: 'available',
      owner: ids.evaluationOwner,
      required_consumer_role: 'compile_evaluation_work_order_to_agent_lab_suite_and_execute',
    },
    execution_aperture: {
      action_ref: 'opl agent-lab evaluation-work-order execute --work-order <work-order.json> --output <dir>',
      work_order_lifecycle_owner: ids.evaluationOwner,
      result_ledger_owner: ids.evaluationOwner,
      target_owner_closeout_owner: 'target-domain',
    },
  };
  const observations = {
    surface_kind: 'opl_foundry_lab_evaluation_observation_packet',
    version: 'opl.foundry-lab-evaluation-observation-packet.v1',
    work_order_id: ids.workOrderId,
    suite_id: ids.suiteId,
    target_agent_ref: ids.targetAgentRef,
    target_agent_descriptor_ref: ids.targetDescriptorRef,
    evaluation_owner: ids.evaluationOwner,
    evaluation_receipt_ref: ids.packetReceiptRef,
    authority_boundary: {
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_write_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
    },
    tasks: [{
      task_id: ids.taskId,
      domain_id: ids.taskDomainId,
      target_agent_ref: ids.targetAgentRef,
      target_agent_descriptor_ref: ids.targetDescriptorRef,
      recovery_probe_observations: [{
        probe_ref: ids.probeRef,
        observed_status: 'passed',
        observation_owner: ids.evaluationOwner,
        observation_receipt_ref: ids.probeReceiptRef,
        source_refs: ['no-forbidden-write-proof:target-agent/observed'],
      }],
      trajectory_observation: {
        trajectory_ref: ids.trajectoryRef,
        run_ref: 'run:opl-foundry-lab/target-agent/takeover/actual',
        observation_owner: ids.evaluationOwner,
        observation_receipt_ref: ids.trajectoryReceiptRef,
        stage_attempt_refs: ['stage-attempt:target-agent/takeover'],
        tool_call_refs: ['tool-call:target-agent/takeover'],
        artifact_refs: ['artifact-ref:target-agent/takeover'],
        receipt_refs: ['evaluation-receipt-ref:target-agent/takeover'],
        repair_refs: [],
      },
      scorecard_observation: {
        scorecard_ref: ids.scorecardRef,
        scorecard_owner: ids.taskDomainId,
        scorecard_receipt_ref: ids.scorecardReceiptRef,
        passed: true,
        evidence_refs: ['scorecard-evidence-ref:target-agent/takeover'],
        review_refs: ['review-ref:target-agent/takeover'],
        quality_gate_refs: ['quality-gate-ref:target-agent/takeover'],
      },
      promotion_gate_observation: {
        gate_ref: ids.gateRef,
        gate_status: 'passed',
        evaluation_owner: ids.evaluationOwner,
        evaluation_receipt_ref: ids.promotionReceiptRef,
        regression_suite_refs: ['regression-suite-ref:target-agent/takeover'],
        no_forbidden_write_proof_refs: ['no-forbidden-write-proof:target-agent/takeover'],
      },
      stage_completion_policy: {
        surface_kind: 'domain_stage_completion_policy',
        policy_ref: 'stage-completion-policy:opl-meta-agent/target-agent/takeover',
        policy_owner: ids.taskDomainId,
        policy_receipt_ref: ids.policyReceiptRef,
        completion_judgment_owner: 'domain_stage',
        closeout_packet_required: true,
        provider_completion_is_domain_completion: false,
        opl_content_judgment_allowed: false,
        next_stage_transition_owner: 'opl_runtime',
        required_closeout_outcomes: ['completed_and_continue', 'completed_and_wait_owner', 'route_back', 'blocked', 'rejected'],
        accepted_closeout_ref_fields: ['owner_receipt_ref', 'typed_blocker_ref', 'human_gate_ref', 'route_back_ref'],
        authority_boundary: {
          opl_can_decide_domain_completion: false,
          provider_completion_counts_as_stage_complete: false,
          unknown_authority_capability: false,
        },
      },
    }],
  };

  writeEvaluationJson(suiteSeedPath, suiteSeed);
  writeEvaluationJson(workOrderPath, workOrder);
  writeEvaluationJson(observationsPath, observations);
  return {
    ids,
    suiteSeed,
    workOrder,
    observations,
    evaluationProvenanceRefs: [
      ids.packetReceiptRef,
      ids.probeReceiptRef,
      ids.trajectoryReceiptRef,
      ids.scorecardReceiptRef,
      ids.promotionReceiptRef,
      ids.policyReceiptRef,
    ].sort(),
    evaluationProvenanceBindings: [
      { receipt_role: 'evaluation_packet', receipt_ref: ids.packetReceiptRef },
      { receipt_role: 'promotion_gate_observation', receipt_ref: ids.promotionReceiptRef, task_id: ids.taskId },
      {
        receipt_role: 'recovery_probe_observation',
        receipt_ref: ids.probeReceiptRef,
        task_id: ids.taskId,
        probe_ref: ids.probeRef,
      },
      { receipt_role: 'scorecard_observation', receipt_ref: ids.scorecardReceiptRef, task_id: ids.taskId },
      { receipt_role: 'stage_completion_policy', receipt_ref: ids.policyReceiptRef, task_id: ids.taskId },
      { receipt_role: 'trajectory_observation', receipt_ref: ids.trajectoryReceiptRef, task_id: ids.taskId },
    ],
    suiteSeedPath,
    workOrderPath,
    observationsPath,
    outputDir,
  };
}

export function retargetOmaTakeoverEvaluationFixture(
  fixture: ReturnType<typeof buildOmaTakeoverEvaluationFixture>,
  domainId: string,
) {
  const target = {
    domain_id: domainId,
    target_agent_ref: `domain-agent:${domainId}`,
    descriptor_ref: `/tmp/${domainId}/contracts/domain_descriptor.json`,
  };
  const workOrder = fixture.workOrder as Record<string, any>;
  Object.assign(workOrder.target_agent, target);
  const suiteSeed = fixture.suiteSeed as Record<string, any>;
  suiteSeed.target_agent_ref = target.target_agent_ref;
  suiteSeed.target_agent_descriptor_ref = target.descriptor_ref;
  for (const task of suiteSeed.tasks) {
    task.target_agent_ref = target.target_agent_ref;
    task.target_agent_descriptor_ref = target.descriptor_ref;
  }
  const observations = fixture.observations as Record<string, any>;
  observations.target_agent_ref = target.target_agent_ref;
  observations.target_agent_descriptor_ref = target.descriptor_ref;
  for (const task of observations.tasks) {
    task.target_agent_ref = target.target_agent_ref;
    task.target_agent_descriptor_ref = target.descriptor_ref;
  }
  return target;
}
