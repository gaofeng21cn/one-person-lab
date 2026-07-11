import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { record, recordList, stringList, stringValue, uniqueStringList } from '../../kernel/json-record.ts';
import { stableId } from '../../kernel/stable-id.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY, FORBIDDEN_TRUE_AUTHORITY_FLAGS } from './agent-lab-authority.ts';

export const EVALUATION_REQUEST_SURFACE = 'opl_meta_agent_foundry_evaluation_request';
export const EVALUATION_REQUEST_VERSION = 'opl-meta-agent.foundry-evaluation-request.v1';
export const EVALUATION_SUITE_PLAN_SURFACE = 'opl_foundry_lab_evaluation_suite_plan';
export const EVALUATION_SUITE_PLAN_VERSION = 'opl.foundry-lab-evaluation-suite-plan.v1';
export const EVALUATION_OWNER = 'one-person-lab/OPL Foundry Lab';

const OMA_REQUEST_AUTHORITY_BOUNDARY = {
  refs_only: true,
  oma_can_execute_agent_lab_suite: false,
  oma_can_write_agent_lab_result: false,
  oma_can_write_owner_receipt_body: false,
  oma_can_write_promotion_gate: false,
  oma_can_claim_target_domain_ready: false,
  oma_can_claim_target_production_ready: false,
} as const;

const REQUEST_FIELDS = new Set([
  'surface_kind',
  'version',
  'request_id',
  'suite_id',
  'suite_kind',
  'task_intents',
  'production_evidence_gate_ids',
  'authority_boundary',
]);

const TASK_INTENT_FIELDS = new Set([
  'task_id',
  'domain_id',
  'task_family',
  'instructions_ref',
  'agent_entry_ref',
  'stage_refs',
  'oracle_refs',
  'scorer_refs',
  'metric_refs',
  'evidence_refs',
  'review_refs',
  'quality_gate_refs',
  'trajectory_ref',
  'requested_run_ref',
  'artifact_refs',
  'receipt_refs',
  'scorecard_ref',
  'improvement_candidate',
  'promotion_gate_ref',
  'promotion_gate_required_refs',
  'regression_suite_refs',
]);

const IMPROVEMENT_CANDIDATE_FIELDS = new Set([
  'candidate_ref',
  'candidate_kind',
  'target_ref',
  'allowed_change_scope',
]);

type TargetAgent = {
  domainId: string;
  targetAgentRef: string;
  descriptorRef: string;
  repoDir?: string;
};

function invalid(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredString(value: unknown, field: string) {
  const resolved = stringValue(value);
  if (!resolved) {
    return invalid(`Foundry Lab evaluation request requires ${field}.`, { field });
  }
  return resolved;
}

function requiredRefs(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return invalid(`Foundry Lab evaluation request requires string refs at ${field}.`, { field });
  }
  const refs = stringList(value);
  if (refs.length !== value.length || refs.length === 0) {
    return invalid(`Foundry Lab evaluation request requires non-empty string refs at ${field}.`, { field });
  }
  return uniqueStringList(refs).sort();
}

function optionalRefs(value: unknown, field: string) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return invalid(`Foundry Lab evaluation request requires string refs at ${field}.`, { field });
  }
  const refs = stringList(value);
  if (refs.length !== value.length) {
    return invalid(`Foundry Lab evaluation request requires string refs at ${field}.`, { field });
  }
  return uniqueStringList(refs).sort();
}

function allowedChangeScope(value: unknown) {
  if (value === 'candidate_config_only' || value === 'branch_only' || value === 'manual_review_required') {
    return value;
  }
  return invalid('Foundry Lab evaluation request has unsupported improvement_candidate.allowed_change_scope.', {
    field: 'evaluation_request.task_intents[].improvement_candidate.allowed_change_scope',
    value: value ?? null,
  });
}

function forbiddenAuthorityPaths(
  value: unknown,
  prefix = '$',
  insideAuthorityBoundary = false,
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      forbiddenAuthorityPaths(entry, `${prefix}[${index}]`, insideAuthorityBoundary));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const inAuthorityBoundary = insideAuthorityBoundary || key === 'authority_boundary';
    return [
      ...(entry === true
        && (FORBIDDEN_TRUE_AUTHORITY_FLAGS.includes(key) || (inAuthorityBoundary && key !== 'refs_only'))
        ? [`${prefix}.${key}`]
        : []),
      ...forbiddenAuthorityPaths(entry, `${prefix}.${key}`, inAuthorityBoundary),
    ];
  });
}

function assertNoForbiddenAuthorityClaims(value: unknown, label: string) {
  const forbidden = forbiddenAuthorityPaths(value);
  if (forbidden.length > 0) {
    invalid(`${label} contains forbidden authority claims.`, {
      forbidden_authority_paths: forbidden,
    });
  }
}

function assertAllowedFields(value: Record<string, unknown>, allowed: Set<string>, field: string) {
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownFields.length > 0) {
    invalid(`Foundry Lab evaluation request has unsupported fields at ${field}.`, {
      field,
      unknown_fields: unknownFields.sort(),
    });
  }
}

function assertExactAuthorityBoundary(value: unknown) {
  if (!isRecord(value)) {
    invalid('Foundry Lab evaluation request requires an exact authority_boundary object.', {
      field: 'evaluation_request.authority_boundary',
    });
  }
  const expectedEntries = Object.entries(OMA_REQUEST_AUTHORITY_BOUNDARY);
  const unknownFields = Object.keys(value).filter((key) => !(key in OMA_REQUEST_AUTHORITY_BOUNDARY));
  const missingFields = expectedEntries
    .filter(([key]) => value[key] === undefined)
    .map(([key]) => key);
  const mismatchedFields = expectedEntries
    .filter(([key, expected]) => value[key] !== expected)
    .map(([key]) => key);
  if (unknownFields.length > 0 || missingFields.length > 0 || mismatchedFields.length > 0) {
    invalid('Foundry Lab evaluation request has an unsupported authority_boundary.', {
      unknown_fields: unknownFields.sort(),
      missing_fields: missingFields.sort(),
      mismatched_fields: mismatchedFields.sort(),
    });
  }
}

function assertNoProducerOwnedSuitePlanFields(request: Record<string, unknown>) {
  const topLevelFields = [
    'suite_seed',
    'suite_plan',
    'tasks',
    'target_agent_ref',
    'target_agent_descriptor_ref',
    'evaluation_target_agent',
    'execution_owner',
    'required_observations',
    'production_evidence_gate',
  ];
  const taskFields = [
    'target_agent_ref',
    'target_agent_descriptor_ref',
    'environment',
    'recovery_probe_specs',
    'trajectory_plan',
    'scorecard_spec',
    'promotion_gate_request',
    'stage_completion_policy',
  ];
  const forbidden = [
    ...topLevelFields
      .filter((field) => request[field] !== undefined)
      .map((field) => `evaluation_request.${field}`),
    ...recordList(request.task_intents).flatMap((task, index) => taskFields
      .filter((field) => task[field] !== undefined)
      .map((field) => `evaluation_request.task_intents[${index}].${field}`)),
  ];
  if (forbidden.length > 0) {
    invalid('Foundry Lab evaluation request must not supply producer-owned suite plan fields.', {
      forbidden_fields: forbidden,
    });
  }
}

function requestIdentity(workOrder: Record<string, unknown>) {
  const request = record(workOrder.evaluation_request);
  return {
    ref: requiredString(request.ref, 'work_order.evaluation_request.ref'),
    requestId: requiredString(request.request_id, 'work_order.evaluation_request.request_id'),
    suiteId: requiredString(request.suite_id, 'work_order.evaluation_request.suite_id'),
    suiteKind: requiredString(request.suite_kind, 'work_order.evaluation_request.suite_kind'),
  };
}

function taskIntent(task: Record<string, unknown>, index: number) {
  const prefix = `evaluation_request.task_intents[${index}]`;
  assertAllowedFields(task, TASK_INTENT_FIELDS, prefix);
  const improvement = record(task.improvement_candidate);
  assertAllowedFields(improvement, IMPROVEMENT_CANDIDATE_FIELDS, `${prefix}.improvement_candidate`);
  return {
    taskId: requiredString(task.task_id, `${prefix}.task_id`),
    domainId: requiredString(task.domain_id, `${prefix}.domain_id`),
    taskFamily: requiredString(task.task_family, `${prefix}.task_family`),
    instructionsRef: requiredString(task.instructions_ref, `${prefix}.instructions_ref`),
    agentEntryRef: requiredString(task.agent_entry_ref, `${prefix}.agent_entry_ref`),
    stageRefs: requiredRefs(task.stage_refs, `${prefix}.stage_refs`),
    oracleRefs: requiredRefs(task.oracle_refs, `${prefix}.oracle_refs`),
    scorerRefs: requiredRefs(task.scorer_refs, `${prefix}.scorer_refs`),
    metricRefs: requiredRefs(task.metric_refs, `${prefix}.metric_refs`),
    evidenceRefs: requiredRefs(task.evidence_refs, `${prefix}.evidence_refs`),
    reviewRefs: optionalRefs(task.review_refs, `${prefix}.review_refs`),
    qualityGateRefs: requiredRefs(task.quality_gate_refs, `${prefix}.quality_gate_refs`),
    trajectoryRef: requiredString(task.trajectory_ref, `${prefix}.trajectory_ref`),
    requestedRunRef: requiredString(task.requested_run_ref, `${prefix}.requested_run_ref`),
    artifactRefs: requiredRefs(task.artifact_refs, `${prefix}.artifact_refs`),
    receiptRefs: requiredRefs(task.receipt_refs, `${prefix}.receipt_refs`),
    scorecardRef: requiredString(task.scorecard_ref, `${prefix}.scorecard_ref`),
    improvementCandidate: {
      candidateRef: requiredString(improvement.candidate_ref, `${prefix}.improvement_candidate.candidate_ref`),
      candidateKind: requiredString(improvement.candidate_kind, `${prefix}.improvement_candidate.candidate_kind`),
      targetRef: requiredString(improvement.target_ref, `${prefix}.improvement_candidate.target_ref`),
      allowedChangeScope: allowedChangeScope(improvement.allowed_change_scope),
    },
    promotionGateRef: requiredString(task.promotion_gate_ref, `${prefix}.promotion_gate_ref`),
    promotionRequiredRefs: optionalRefs(task.promotion_gate_required_refs, `${prefix}.promotion_gate_required_refs`),
    regressionSuiteRefs: optionalRefs(task.regression_suite_refs, `${prefix}.regression_suite_refs`),
  };
}

export function validateEvaluationRequest(workOrder: Record<string, unknown>, request: Record<string, unknown>) {
  const identity = requestIdentity(workOrder);
  if (request.surface_kind !== EVALUATION_REQUEST_SURFACE) {
    invalid('Foundry Lab evaluation request has unsupported surface_kind.', {
      expected: EVALUATION_REQUEST_SURFACE,
      actual: request.surface_kind ?? null,
    });
  }
  if (request.version !== EVALUATION_REQUEST_VERSION) {
    invalid('Foundry Lab evaluation request has unsupported version.', {
      expected: EVALUATION_REQUEST_VERSION,
      actual: request.version ?? null,
    });
  }
  assertAllowedFields(request, REQUEST_FIELDS, 'evaluation_request');
  assertExactAuthorityBoundary(request.authority_boundary);
  if (request.request_id !== identity.requestId) {
    invalid('Foundry Lab evaluation request identity does not match the work order.', {
      field: 'request_id',
      expected: identity.requestId,
      actual: request.request_id ?? null,
    });
  }
  if (request.suite_id !== identity.suiteId || request.suite_kind !== identity.suiteKind) {
    invalid('Foundry Lab evaluation request suite intent does not match the work order.', {
      expected_suite_id: identity.suiteId,
      actual_suite_id: request.suite_id ?? null,
      expected_suite_kind: identity.suiteKind,
      actual_suite_kind: request.suite_kind ?? null,
    });
  }
  assertNoProducerOwnedSuitePlanFields(request);
  const intents = recordList(request.task_intents).map(taskIntent);
  if (intents.length === 0 || intents.length !== (Array.isArray(request.task_intents) ? request.task_intents.length : 0)) {
    invalid('Foundry Lab evaluation request requires at least one object task intent.');
  }
  const taskIds = intents.map((intent) => intent.taskId);
  if (new Set(taskIds).size !== taskIds.length) {
    invalid('Foundry Lab evaluation request task ids must be unique.', { task_ids: taskIds });
  }
  if (identity.suiteKind === 'agent_production_evidence_suite') {
    requiredRefs(request.production_evidence_gate_ids, 'evaluation_request.production_evidence_gate_ids');
  } else if (request.production_evidence_gate_ids !== undefined) {
    invalid('Foundry Lab evaluation request only allows production_evidence_gate_ids for production evidence suites.');
  }
  assertNoForbiddenAuthorityClaims(request, 'Foundry Lab evaluation request');
  return { identity, intents };
}

export function compileEvaluationSuitePlan(input: {
  workOrder: Record<string, unknown>;
  request: Record<string, unknown>;
  targetAgent: TargetAgent;
}) {
  const { identity, intents } = validateEvaluationRequest(input.workOrder, input.request);
  const workspaceLocator = input.targetAgent.repoDir
    ? `workspace-locator:${input.targetAgent.repoDir}`
    : `workspace-locator:${input.targetAgent.targetAgentRef}`;
  const tasks = intents.map((intent) => ({
    task_id: intent.taskId,
    domain_id: intent.domainId,
    task_family: intent.taskFamily,
    target_agent_ref: input.targetAgent.targetAgentRef,
    target_agent_descriptor_ref: input.targetAgent.descriptorRef,
    environment: {
      environment_kind: 'local_workspace',
      workspace_locator_ref: workspaceLocator,
      sandbox_policy: 'opl_foundry_lab_evaluation_no_target_mutation',
      network_policy: 'owner_controlled',
    },
    instructions_ref: intent.instructionsRef,
    agent_entry_ref: intent.agentEntryRef,
    stage_refs: intent.stageRefs,
    oracle_refs: intent.oracleRefs,
    scorer_refs: intent.scorerRefs,
    recovery_probe_specs: [
      {
        probe_ref: `recovery-probe:opl-foundry-lab/${intent.domainId}/${intent.taskId}/resume-after-interruption`,
        probe_kind: 'resume_after_interruption',
        expected_status: 'passed',
        source_refs: [`receipt-ref:opl-foundry-lab/${intent.domainId}/${intent.taskId}/resume`],
      },
      {
        probe_ref: `recovery-probe:opl-foundry-lab/${intent.domainId}/${intent.taskId}/retry-after-tool-failure`,
        probe_kind: 'retry_after_tool_failure',
        expected_status: 'passed',
        source_refs: [`receipt-ref:opl-foundry-lab/${intent.domainId}/${intent.taskId}/retry`],
      },
    ],
    trajectory_plan: {
      trajectory_ref: intent.trajectoryRef,
      requested_run_ref: intent.requestedRunRef,
      agent_executor: 'codex_cli',
      expected_stage_attempt_refs: [
        `stage-attempt:opl-foundry-lab/${input.targetAgent.domainId}/${stableId('evaluation_task', [identity.requestId, intent.taskId])}`,
      ],
      tool_affordance_refs: ['opl-action:agent-lab/evaluation-work-order'],
      expected_artifact_refs: intent.artifactRefs,
      expected_receipt_refs: intent.receiptRefs,
      trace_refs: [`trace-ref:opl-foundry-lab/${input.targetAgent.domainId}/${intent.taskId}`],
    },
    scorecard_spec: {
      scorecard_ref: intent.scorecardRef,
      domain_owned: true,
      opl_scorecard_role: 'scorecard_ref_projection_only',
      metric_refs: intent.metricRefs,
      evidence_refs: intent.evidenceRefs,
      review_refs: intent.reviewRefs,
      quality_gate_refs: intent.qualityGateRefs,
    },
    improvement_candidate_seed: {
      candidate_ref: intent.improvementCandidate.candidateRef,
      candidate_kind: intent.improvementCandidate.candidateKind,
      target_ref: intent.improvementCandidate.targetRef,
      evidence_refs: [
        `failure-taxonomy:opl-foundry-lab/${input.targetAgent.domainId}/${intent.taskId}/evaluation-pending`,
      ],
      allowed_change_scope: intent.improvementCandidate.allowedChangeScope,
    },
    promotion_gate_request: {
      gate_ref: intent.promotionGateRef,
      evaluation_owner: EVALUATION_OWNER,
      required_refs: uniqueStringList([intent.scorecardRef, ...intent.promotionRequiredRefs]),
      regression_suite_refs: intent.regressionSuiteRefs,
      no_forbidden_write_proof_refs: [
        `no-forbidden-write:opl-foundry-lab/${input.targetAgent.domainId}/${intent.taskId}`,
      ],
    },
  }));
  return {
    surface_kind: EVALUATION_SUITE_PLAN_SURFACE,
    version: EVALUATION_SUITE_PLAN_VERSION,
    producer: EVALUATION_OWNER,
    request_id: identity.requestId,
    suite_id: identity.suiteId,
    suite_kind: identity.suiteKind,
    target_agent_ref: input.targetAgent.targetAgentRef,
    target_agent_descriptor_ref: input.targetAgent.descriptorRef,
    tasks,
    ...(identity.suiteKind === 'agent_production_evidence_suite' ? {
      production_evidence_gate: {
        gate_ids: requiredRefs(input.request.production_evidence_gate_ids, 'evaluation_request.production_evidence_gate_ids'),
      },
    } : {}),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}
