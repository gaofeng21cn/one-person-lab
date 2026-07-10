import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  readJsonRecordFile,
  writeJsonPayloadFile,
  type JsonRecord,
} from '../../kernel/json-file.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  uniqueStringList,
} from '../../kernel/json-record.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  AGENT_LAB_AUTHORITY_BOUNDARY,
  FORBIDDEN_TRUE_AUTHORITY_FLAGS,
} from './agent-lab-authority.ts';
import type {
  AgentLabImprovementCandidate,
  AgentLabPromotionGate,
  AgentLabRecoveryProbe,
  AgentLabScorecard,
  AgentLabStageCompletionPolicy,
  AgentLabSuite,
  AgentLabTaskManifest,
  AgentLabTrajectory,
} from './agent-lab-parts/model.ts';
import { runAgentLabSuite } from './agent-lab.ts';

const WORK_ORDER_SURFACE = 'opl_meta_agent_foundry_lab_work_order_candidate';
const WORK_ORDER_VERSION = 'opl-meta-agent.foundry-lab-work-order-candidate.v1';
const WORK_ORDER_STATUS = 'ready_for_opl_foundry_lab_evaluation';
const SUITE_SEED_SURFACE = 'opl_meta_agent_agent_lab_suite_seed';
const SUITE_SEED_VERSION = 'opl-meta-agent.agent-lab-suite-seed.v1';
const OBSERVATION_PACKET_SURFACE = 'opl_foundry_lab_evaluation_observation_packet';
const OBSERVATION_PACKET_VERSION = 'opl.foundry-lab-evaluation-observation-packet.v1';
const CONSUMER_ROLE = 'compile_evaluation_work_order_to_agent_lab_suite_and_execute';
const ACTION_REF = 'opl agent-lab evaluation-work-order execute --work-order <work-order.json> --output <dir>';

const EVALUATION_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_create_platform_typed_blocker: true,
  can_create_target_typed_blocker: false,
};

export type AgentLabEvaluationWorkOrderOptions = {
  workOrderPath: string;
  outputDir: string;
  observationPacketPath?: string | null;
};

function invalid(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function readRecord(filePath: string, label: string) {
  return readJsonRecordFile(filePath, {
    missingMessage: (resolvedPath) => `${label} is missing: ${resolvedPath}.`,
    missingDetails: (resolvedPath) => ({ file: resolvedPath }),
    invalidJsonMessage: (resolvedPath) => `${label} contains invalid JSON: ${resolvedPath}.`,
    invalidJsonDetails: (resolvedPath, cause) => ({ file: resolvedPath, cause }),
    invalidRootMessage: (resolvedPath) => `${label} must contain a JSON object: ${resolvedPath}.`,
    invalidRootDetails: (resolvedPath) => ({ file: resolvedPath }),
  });
}

function requiredString(value: unknown, field: string) {
  const resolved = stringValue(value);
  if (!resolved) {
    return invalid(`Foundry Lab evaluation work order requires ${field}.`, { field });
  }
  return resolved;
}

function assertValue(actual: unknown, expected: string, field: string) {
  if (actual !== expected) {
    invalid(`Foundry Lab evaluation work order has unsupported ${field}.`, {
      field,
      expected,
      actual: actual ?? null,
    });
  }
}

function validateWorkOrder(workOrder: JsonRecord) {
  assertValue(workOrder.surface_kind, WORK_ORDER_SURFACE, 'surface_kind');
  assertValue(workOrder.version, WORK_ORDER_VERSION, 'version');
  assertValue(workOrder.status, WORK_ORDER_STATUS, 'status');
  assertValue(record(workOrder.consumer_dependency).status, 'available', 'consumer_dependency.status');
  assertValue(
    record(workOrder.consumer_dependency).required_consumer_role,
    CONSUMER_ROLE,
    'consumer_dependency.required_consumer_role',
  );
  assertValue(record(workOrder.execution_aperture).action_ref, ACTION_REF, 'execution_aperture.action_ref');
}

function validateSuiteSeed(workOrder: JsonRecord, suiteSeed: JsonRecord) {
  assertValue(suiteSeed.surface_kind, SUITE_SEED_SURFACE, 'suite_seed.surface_kind');
  assertValue(suiteSeed.version, SUITE_SEED_VERSION, 'suite_seed.version');
  const suiteRef = record(workOrder.suite_seed);
  assertValue(suiteSeed.suite_id, requiredString(suiteRef.suite_id, 'work_order.suite_seed.suite_id'), 'suite_seed.suite_id');
  assertValue(
    suiteSeed.suite_kind,
    requiredString(suiteRef.suite_kind, 'work_order.suite_seed.suite_kind'),
    'suite_seed.suite_kind',
  );
  const tasks = recordList(suiteSeed.tasks);
  if (tasks.length === 0) {
    invalid('Foundry Lab evaluation suite seed requires at least one task.');
  }
  const targetDomainId = requiredString(record(workOrder.target_agent).domain_id, 'work_order.target_agent.domain_id');
  const mismatchedTaskIds = tasks
    .filter((task) => task.domain_id !== targetDomainId)
    .map((task) => stringValue(task.task_id) ?? 'unknown-task');
  if (mismatchedTaskIds.length > 0) {
    invalid('Foundry Lab evaluation suite seed task domain does not match the target agent.', {
      target_domain_id: targetDomainId,
      mismatched_task_ids: mismatchedTaskIds,
    });
  }
}

function promotionGateRequestRefs(suiteSeed: JsonRecord) {
  return uniqueStringList(recordList(suiteSeed.tasks).map((task) =>
    stringValue(record(task.promotion_gate_request).gate_ref)));
}

function requiredBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    return invalid(`Foundry Lab evaluation observation packet requires boolean ${field}.`, { field });
  }
  return value;
}

function passBlockStatus(value: unknown, field: string): 'passed' | 'blocked' {
  if (value !== 'passed' && value !== 'blocked') {
    return invalid(`Foundry Lab evaluation observation packet requires passed or blocked ${field}.`, {
      field,
      value: value ?? null,
    });
  }
  return value;
}

function assertMatchingRef(actual: unknown, expected: string, field: string) {
  assertValue(actual, expected, field);
  return expected;
}

function forbiddenAuthorityPaths(value: unknown, prefix = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => forbiddenAuthorityPaths(entry, `${prefix}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(entry === true && FORBIDDEN_TRUE_AUTHORITY_FLAGS.includes(key) ? [`${prefix}.${key}`] : []),
    ...forbiddenAuthorityPaths(entry, `${prefix}.${key}`),
  ]);
}

function validateObservationPacket(
  workOrder: JsonRecord,
  suiteSeed: JsonRecord,
  observationPacket: JsonRecord,
) {
  assertValue(observationPacket.surface_kind, OBSERVATION_PACKET_SURFACE, 'observations.surface_kind');
  assertValue(observationPacket.version, OBSERVATION_PACKET_VERSION, 'observations.version');
  assertValue(
    observationPacket.work_order_id,
    requiredString(workOrder.work_order_id, 'work_order.work_order_id'),
    'observations.work_order_id',
  );
  assertValue(
    observationPacket.suite_id,
    requiredString(suiteSeed.suite_id, 'suite_seed.suite_id'),
    'observations.suite_id',
  );
  const forbidden = forbiddenAuthorityPaths(observationPacket);
  if (forbidden.length > 0) {
    invalid('Foundry Lab evaluation observation packet contains forbidden authority claims.', {
      forbidden_authority_paths: forbidden,
    });
  }
}

function observationTaskById(observationPacket: JsonRecord, taskId: string) {
  const matched = recordList(observationPacket.tasks).filter((task) => task.task_id === taskId);
  if (matched.length !== 1) {
    return invalid('Foundry Lab evaluation observation packet must contain exactly one observation per task.', {
      task_id: taskId,
      matched_observation_count: matched.length,
    });
  }
  return matched[0];
}

function compileRecoveryProbes(seedTask: JsonRecord, observationTask: JsonRecord): AgentLabRecoveryProbe[] {
  const observations = recordList(observationTask.recovery_probe_observations);
  return recordList(seedTask.recovery_probe_specs).map((spec) => {
    const probeRef = requiredString(spec.probe_ref, 'suite_seed.tasks[].recovery_probe_specs[].probe_ref');
    const matched = observations.filter((observation) => observation.probe_ref === probeRef);
    if (matched.length !== 1) {
      return invalid('Foundry Lab evaluation observation packet must observe every declared recovery probe.', {
        probe_ref: probeRef,
        matched_observation_count: matched.length,
      });
    }
    const observation = matched[0];
    return {
      probe_ref: probeRef,
      probe_kind: requiredString(spec.probe_kind, 'suite_seed.tasks[].recovery_probe_specs[].probe_kind'),
      expected_status: passBlockStatus(
        spec.expected_status,
        'suite_seed.tasks[].recovery_probe_specs[].expected_status',
      ),
      observed_status: passBlockStatus(
        observation.observed_status,
        'observations.tasks[].recovery_probe_observations[].observed_status',
      ),
      source_refs: uniqueStringList([
        ...stringList(spec.source_refs),
        ...stringList(observation.source_refs),
      ]),
    };
  });
}

function compileTrajectory(seedTask: JsonRecord, observationTask: JsonRecord): AgentLabTrajectory {
  const plan = record(seedTask.trajectory_plan);
  const observation = record(observationTask.trajectory_observation);
  const trajectoryRef = requiredString(plan.trajectory_ref, 'suite_seed.tasks[].trajectory_plan.trajectory_ref');
  assertMatchingRef(observation.trajectory_ref, trajectoryRef, 'observations.tasks[].trajectory_observation.trajectory_ref');
  return {
    trajectory_ref: trajectoryRef,
    run_ref: requiredString(observation.run_ref, 'observations.tasks[].trajectory_observation.run_ref'),
    agent_executor: requiredString(plan.agent_executor, 'suite_seed.tasks[].trajectory_plan.agent_executor'),
    stage_attempt_refs: stringList(observation.stage_attempt_refs),
    tool_call_refs: stringList(observation.tool_call_refs),
    artifact_refs: stringList(observation.artifact_refs),
    receipt_refs: stringList(observation.receipt_refs),
    repair_refs: stringList(observation.repair_refs),
    trace_refs: stringList(observation.trace_refs),
    planned_run_ref: stringValue(plan.requested_run_ref),
    planned_tool_affordance_refs: stringList(plan.tool_affordance_refs),
    expected_receipt_refs: stringList(plan.expected_receipt_refs),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function compileScorecard(seedTask: JsonRecord, observationTask: JsonRecord): AgentLabScorecard {
  const spec = record(seedTask.scorecard_spec);
  const observation = record(observationTask.scorecard_observation);
  const scorecardRef = requiredString(spec.scorecard_ref, 'suite_seed.tasks[].scorecard_spec.scorecard_ref');
  assertMatchingRef(observation.scorecard_ref, scorecardRef, 'observations.tasks[].scorecard_observation.scorecard_ref');
  return {
    scorecard_ref: scorecardRef,
    domain_owned: spec.target_agent_owned === true || spec.domain_owned === true,
    opl_scorecard_role: 'scorecard_ref_projection_only',
    passed: requiredBoolean(observation.passed, 'observations.tasks[].scorecard_observation.passed'),
    metric_refs: stringList(spec.metric_refs),
    evidence_refs: uniqueStringList([
      ...stringList(spec.evidence_refs),
      ...stringList(observation.evidence_refs),
    ]),
    review_refs: stringList(observation.review_refs),
    quality_gate_refs: stringList(observation.quality_gate_refs),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function allowedChangeScope(value: unknown): AgentLabImprovementCandidate['allowed_change_scope'] {
  if (value === 'candidate_config_only' || value === 'branch_only' || value === 'manual_review_required') {
    return value;
  }
  return 'manual_review_required';
}

function compileImprovementCandidate(
  seedTask: JsonRecord,
  promotionGateRef: string,
  scorecard: AgentLabScorecard,
): AgentLabImprovementCandidate {
  const seed = record(seedTask.improvement_candidate_seed);
  return {
    candidate_ref: requiredString(seed.candidate_ref, 'suite_seed.tasks[].improvement_candidate_seed.candidate_ref'),
    candidate_kind: requiredString(seed.candidate_kind, 'suite_seed.tasks[].improvement_candidate_seed.candidate_kind'),
    target_ref: requiredString(seed.target_ref, 'suite_seed.tasks[].improvement_candidate_seed.target_ref'),
    evidence_refs: uniqueStringList([
      ...stringList(seed.evidence_refs),
      ...scorecard.evidence_refs,
      ...scorecard.review_refs,
    ]),
    allowed_change_scope: allowedChangeScope(seed.allowed_change_scope),
    promotion_gate_ref: promotionGateRef,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function compilePromotionGate(seedTask: JsonRecord, observationTask: JsonRecord): AgentLabPromotionGate {
  const request = record(seedTask.promotion_gate_request);
  const observation = record(observationTask.promotion_gate_observation);
  const gateRef = requiredString(request.gate_ref, 'suite_seed.tasks[].promotion_gate_request.gate_ref');
  assertMatchingRef(observation.gate_ref, gateRef, 'observations.tasks[].promotion_gate_observation.gate_ref');
  return {
    gate_ref: gateRef,
    gate_status: passBlockStatus(
      observation.gate_status,
      'observations.tasks[].promotion_gate_observation.gate_status',
    ),
    required_refs: stringList(request.required_refs),
    regression_suite_refs: stringList(observation.regression_suite_refs),
    no_forbidden_write_proof_refs: stringList(observation.no_forbidden_write_proof_refs),
    advisory_only_refs: stringList(observation.advisory_only_refs),
    failure_delta_refs: stringList(observation.failure_delta_refs),
    independent_ai_review_receipt_refs: stringList(observation.independent_ai_review_receipt_refs),
    promotion_receipt_refs: stringList(observation.promotion_receipt_refs),
    rollback_target_refs: stringList(observation.rollback_target_refs),
    canary_observation_refs: stringList(observation.canary_observation_refs),
    owner_or_human_gate_refs: stringList(observation.owner_or_human_gate_refs),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function compileStageCompletionPolicy(observationTask: JsonRecord): AgentLabStageCompletionPolicy {
  const policy = record(observationTask.stage_completion_policy);
  return {
    surface_kind: requiredString(policy.surface_kind, 'observations.tasks[].stage_completion_policy.surface_kind'),
    policy_ref: requiredString(policy.policy_ref, 'observations.tasks[].stage_completion_policy.policy_ref'),
    completion_judgment_owner: requiredString(
      policy.completion_judgment_owner,
      'observations.tasks[].stage_completion_policy.completion_judgment_owner',
    ),
    closeout_packet_required: requiredBoolean(
      policy.closeout_packet_required,
      'observations.tasks[].stage_completion_policy.closeout_packet_required',
    ),
    provider_completion_is_domain_completion: requiredBoolean(
      policy.provider_completion_is_domain_completion,
      'observations.tasks[].stage_completion_policy.provider_completion_is_domain_completion',
    ),
    opl_content_judgment_allowed: requiredBoolean(
      policy.opl_content_judgment_allowed,
      'observations.tasks[].stage_completion_policy.opl_content_judgment_allowed',
    ),
    next_stage_transition_owner: requiredString(
      policy.next_stage_transition_owner,
      'observations.tasks[].stage_completion_policy.next_stage_transition_owner',
    ),
    required_closeout_outcomes: stringList(policy.required_closeout_outcomes),
    accepted_closeout_ref_fields: stringList(policy.accepted_closeout_ref_fields),
    authority_boundary: isRecord(policy.authority_boundary)
      ? policy.authority_boundary
      : AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function compileObservedTask(seedTask: JsonRecord, observationTask: JsonRecord): AgentLabTaskManifest {
  const promotionGate = compilePromotionGate(seedTask, observationTask);
  const scorecard = compileScorecard(seedTask, observationTask);
  const environment = record(seedTask.environment);
  return {
    task_id: requiredString(seedTask.task_id, 'suite_seed.tasks[].task_id'),
    domain_id: requiredString(seedTask.domain_id, 'suite_seed.tasks[].domain_id'),
    task_family: requiredString(seedTask.task_family, 'suite_seed.tasks[].task_family'),
    environment: {
      environment_kind: requiredString(environment.environment_kind, 'suite_seed.tasks[].environment.environment_kind'),
      workspace_locator_ref: requiredString(
        environment.workspace_locator_ref,
        'suite_seed.tasks[].environment.workspace_locator_ref',
      ),
      sandbox_policy: requiredString(environment.sandbox_policy, 'suite_seed.tasks[].environment.sandbox_policy'),
      network_policy: requiredString(environment.network_policy, 'suite_seed.tasks[].environment.network_policy'),
    },
    instructions_ref: requiredString(seedTask.instructions_ref, 'suite_seed.tasks[].instructions_ref'),
    agent_entry_ref: requiredString(seedTask.agent_entry_ref, 'suite_seed.tasks[].agent_entry_ref'),
    stage_refs: stringList(seedTask.stage_refs),
    oracle_refs: stringList(seedTask.oracle_refs),
    scorer_refs: stringList(seedTask.scorer_refs),
    recovery_probes: compileRecoveryProbes(seedTask, observationTask),
    trajectory: compileTrajectory(seedTask, observationTask),
    scorecard,
    improvement_candidate: compileImprovementCandidate(seedTask, promotionGate.gate_ref, scorecard),
    promotion_gate: promotionGate,
    stage_completion_policy: compileStageCompletionPolicy(observationTask),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function compileObservedSuite(suiteSeed: JsonRecord, observationPacket: JsonRecord): AgentLabSuite {
  const tasks = recordList(suiteSeed.tasks).map((seedTask) => {
    const taskId = requiredString(seedTask.task_id, 'suite_seed.tasks[].task_id');
    return compileObservedTask(seedTask, observationTaskById(observationPacket, taskId));
  });
  if (recordList(observationPacket.tasks).length !== tasks.length) {
    invalid('Foundry Lab evaluation observation packet contains undeclared task observations.', {
      suite_task_count: tasks.length,
      observation_task_count: recordList(observationPacket.tasks).length,
    });
  }
  const requiredObservations = stringList(suiteSeed.required_observations);
  return {
    suite_id: requiredString(suiteSeed.suite_id, 'suite_seed.suite_id'),
    suite_kind: requiredString(suiteSeed.suite_kind, 'suite_seed.suite_kind'),
    tasks,
    ...(requiredObservations.length > 0 ? {
      required_observations: requiredObservations as AgentLabSuite['required_observations'],
    } : {}),
    production_evidence_gate: isRecord(suiteSeed.production_evidence_gate)
      ? suiteSeed.production_evidence_gate
      : undefined,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function buildBlockedEvaluation(input: {
  workOrder: JsonRecord;
  workOrderPath: string;
  suiteSeed: JsonRecord;
  suiteSeedPath: string;
  outputDir: string;
}) {
  const workOrderId = requiredString(input.workOrder.work_order_id, 'work_order.work_order_id');
  const executionReceiptPath = path.join(input.outputDir, 'foundry-lab-execution-receipt.json');
  const typedBlockerPath = path.join(input.outputDir, 'foundry-lab-evaluation-typed-blocker.json');
  const evaluationResult = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_result',
    version: 'opl.foundry-lab-evaluation-work-order-result.v1',
    status: 'blocked_missing_evaluation_observations',
    work_order_id: workOrderId,
    suite_id: requiredString(input.suiteSeed.suite_id, 'suite_seed.suite_id'),
    missing_observations: ['evaluation_observation_packet'],
    suite_result_ref: null,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  const typedBlocker = {
    surface_kind: 'opl_foundry_lab_evaluation_platform_typed_blocker',
    version: 'opl.foundry-lab-evaluation-blocker.v1',
    blocker_id: stableId('ofleb', [workOrderId, evaluationResult.missing_observations]),
    blocker_kind: 'foundry_lab_evaluation_observations_missing',
    status: 'blocked',
    work_order_id: workOrderId,
    suite_id: evaluationResult.suite_id,
    missing_observations: evaluationResult.missing_observations,
    required_owner: 'one-person-lab/OPL Foundry Lab',
    target_owner_closeout_still_required: true,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  const receipt = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_execution_receipt',
    version: 'opl.foundry-lab-evaluation-work-order-execution.v1',
    receipt_id: stableId('oflewr', [workOrderId, typedBlocker.blocker_id]),
    status: evaluationResult.status,
    work_order_id: workOrderId,
    work_order_kind: requiredString(input.workOrder.work_order_kind, 'work_order.work_order_kind'),
    target_agent: record(input.workOrder.target_agent),
    consumer_dependency: {
      status: 'satisfied',
      consumer_role: CONSUMER_ROLE,
      action_ref: ACTION_REF,
    },
    source_refs: uniqueStringList([
      input.workOrderPath,
      input.suiteSeedPath,
      ...stringList(input.workOrder.source_refs),
      ...stringList(input.workOrder.reviewer_refs),
    ]),
    agent_lab_suite_result_ref: null,
    foundry_lab_execution_receipt_ref: executionReceiptPath,
    improvement_candidate_refs: stringList(input.workOrder.candidate_refs),
    mechanism_proposal_refs: [],
    promotion_gate_refs: [],
    scaleout_ledger_refs: [],
    target_owner_receipt_or_typed_blocker_ref: null,
    platform_blocker_ref: typedBlockerPath,
    downstream_pending_outputs: {
      promotion_gate_request_refs: promotionGateRequestRefs(input.suiteSeed),
      mechanism_proposal_refs: [],
      scaleout_ledger_refs: [],
      target_owner_receipt_or_typed_blocker_ref: null,
      reason: 'evaluation_observation_packet_missing',
    },
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  writeJsonPayloadFile(typedBlockerPath, typedBlocker);
  writeJsonPayloadFile(executionReceiptPath, receipt);

  return {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_execution',
    version: 'opl.foundry-lab-evaluation-work-order-execution.v1',
    status: evaluationResult.status,
    work_order_path: input.workOrderPath,
    suite_seed_path: input.suiteSeedPath,
    observation_packet_path: null,
    artifacts: {
      compiled_suite_path: null,
      suite_result_path: null,
      execution_receipt_path: executionReceiptPath,
      typed_blocker_path: typedBlockerPath,
    },
    evaluation_result: evaluationResult,
    suite_result: null,
    receipt,
    typed_blocker: typedBlocker,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
}

function buildObservedEvaluation(input: {
  workOrder: JsonRecord;
  workOrderPath: string;
  suiteSeed: JsonRecord;
  suiteSeedPath: string;
  observationPacket: JsonRecord;
  observationPacketPath: string;
  outputDir: string;
}) {
  const workOrderId = requiredString(input.workOrder.work_order_id, 'work_order.work_order_id');
  const compiledSuitePath = path.join(input.outputDir, 'agent-lab-suite.json');
  const suiteResultPath = path.join(input.outputDir, 'agent-lab-suite-result.json');
  const executionReceiptPath = path.join(input.outputDir, 'foundry-lab-execution-receipt.json');
  const typedBlockerPath = path.join(input.outputDir, 'foundry-lab-evaluation-typed-blocker.json');
  const compiledSuite = compileObservedSuite(input.suiteSeed, input.observationPacket);
  const suiteResult = runAgentLabSuite(compiledSuite);
  const typedBlocker = suiteResult.status === 'blocked'
    ? {
        surface_kind: 'opl_foundry_lab_evaluation_platform_typed_blocker',
        version: 'opl.foundry-lab-evaluation-blocker.v1',
        blocker_id: stableId('ofleb', [workOrderId, suiteResult.result_id, suiteResult.missing_observations]),
        blocker_kind: 'foundry_lab_evaluation_suite_blocked',
        status: 'blocked',
        work_order_id: workOrderId,
        suite_id: compiledSuite.suite_id,
        missing_observations: suiteResult.missing_observations,
        blocked_runs: suiteResult.runs
          .filter((run) => run.status === 'blocked')
          .map((run) => ({ run_id: run.run_id, failure_taxonomy: run.failure_taxonomy })),
        required_owner: 'one-person-lab/OPL Foundry Lab',
        target_owner_closeout_still_required: true,
        authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
      }
    : null;
  const receipt = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_execution_receipt',
    version: 'opl.foundry-lab-evaluation-work-order-execution.v1',
    receipt_id: stableId('oflewr', [workOrderId, suiteResult.result_id]),
    status: suiteResult.status,
    work_order_id: workOrderId,
    work_order_kind: requiredString(input.workOrder.work_order_kind, 'work_order.work_order_kind'),
    target_agent: record(input.workOrder.target_agent),
    consumer_dependency: {
      status: 'satisfied',
      consumer_role: CONSUMER_ROLE,
      action_ref: ACTION_REF,
    },
    source_refs: uniqueStringList([
      input.workOrderPath,
      input.suiteSeedPath,
      input.observationPacketPath,
      ...stringList(input.workOrder.source_refs),
      ...stringList(input.workOrder.reviewer_refs),
    ]),
    agent_lab_suite_result_ref: suiteResultPath,
    foundry_lab_execution_receipt_ref: executionReceiptPath,
    improvement_candidate_refs: uniqueStringList([
      ...suiteResult.refs.improvement_candidate_refs,
      ...stringList(input.workOrder.candidate_refs),
    ]),
    mechanism_proposal_refs: [],
    promotion_gate_refs: suiteResult.refs.promotion_gate_refs,
    scaleout_ledger_refs: [],
    target_owner_receipt_or_typed_blocker_ref: null,
    platform_blocker_ref: typedBlocker ? typedBlockerPath : null,
    downstream_pending_outputs: {
      promotion_gate_request_refs: promotionGateRequestRefs(input.suiteSeed),
      mechanism_proposal_refs: [],
      scaleout_ledger_refs: [],
      target_owner_receipt_or_typed_blocker_ref: null,
      reason: typedBlocker ? 'agent_lab_suite_blocked' : 'target_owner_closeout_required',
    },
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  const evaluationResult = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_result',
    version: 'opl.foundry-lab-evaluation-work-order-result.v1',
    status: suiteResult.status,
    work_order_id: workOrderId,
    suite_id: compiledSuite.suite_id,
    missing_observations: suiteResult.missing_observations,
    suite_result_ref: suiteResultPath,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };

  writeJsonPayloadFile(compiledSuitePath, compiledSuite);
  writeJsonPayloadFile(suiteResultPath, suiteResult);
  if (typedBlocker) {
    writeJsonPayloadFile(typedBlockerPath, typedBlocker);
  }
  writeJsonPayloadFile(executionReceiptPath, receipt);

  return {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_execution',
    version: 'opl.foundry-lab-evaluation-work-order-execution.v1',
    status: suiteResult.status,
    work_order_path: input.workOrderPath,
    suite_seed_path: input.suiteSeedPath,
    observation_packet_path: input.observationPacketPath,
    artifacts: {
      compiled_suite_path: compiledSuitePath,
      suite_result_path: suiteResultPath,
      execution_receipt_path: executionReceiptPath,
      typed_blocker_path: typedBlocker ? typedBlockerPath : null,
    },
    evaluation_result: evaluationResult,
    suite_result: suiteResult,
    receipt,
    typed_blocker: typedBlocker,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
}

export function executeAgentLabEvaluationWorkOrder(options: AgentLabEvaluationWorkOrderOptions) {
  const workOrderPath = path.resolve(options.workOrderPath);
  const outputDir = path.resolve(options.outputDir);
  const workOrder = readRecord(workOrderPath, 'Foundry Lab evaluation work order');
  validateWorkOrder(workOrder);
  const suiteSeedRef = requiredString(record(workOrder.suite_seed).ref, 'work_order.suite_seed.ref');
  const suiteSeedPath = path.resolve(path.dirname(workOrderPath), suiteSeedRef);
  const suiteSeed = readRecord(suiteSeedPath, 'Foundry Lab evaluation suite seed');
  validateSuiteSeed(workOrder, suiteSeed);
  fs.mkdirSync(outputDir, { recursive: true });

  if (!options.observationPacketPath) {
    return buildBlockedEvaluation({ workOrder, workOrderPath, suiteSeed, suiteSeedPath, outputDir });
  }
  const observationPacketPath = path.resolve(options.observationPacketPath);
  const observationPacket = readRecord(
    observationPacketPath,
    'Foundry Lab evaluation observation packet',
  );
  validateObservationPacket(workOrder, suiteSeed, observationPacket);
  return buildObservedEvaluation({
    workOrder,
    workOrderPath,
    suiteSeed,
    suiteSeedPath,
    observationPacket,
    observationPacketPath,
    outputDir,
  });
}
