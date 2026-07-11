import crypto from 'node:crypto';
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
import {
  compileEvaluationSuitePlan,
  EVALUATION_OWNER,
  EVALUATION_SUITE_PLAN_SURFACE,
  EVALUATION_SUITE_PLAN_VERSION,
  validateEvaluationRequest,
} from './agent-lab-evaluation-request.ts';
import type {
  AgentLabImprovementCandidate,
  AgentLabEvaluationProvenanceBinding,
  AgentLabEvaluationTargetAgent,
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
const OBSERVATION_PACKET_SURFACE = 'opl_foundry_lab_evaluation_observation_packet';
const OBSERVATION_PACKET_VERSION = 'opl.foundry-lab-evaluation-observation-packet.v1';
const CONSUMER_ROLE = 'compile_evaluation_work_order_to_agent_lab_suite_and_execute';
const ACTION_REF = 'opl agent-lab evaluation-work-order execute --work-order <work-order.json> --output <dir>';
const TARGET_OWNER_CLOSEOUT_ROLE = 'target-domain';
const WORK_ORDER_FIELDS = new Set([
  'surface_kind',
  'version',
  'work_order_id',
  'work_order_kind',
  'status',
  'product_id',
  'execution_owner',
  'target_agent',
  'evaluation_request',
  'source_refs',
  'reviewer_refs',
  'candidate_refs',
  'requested_operations',
  'expected_return_shapes',
  'consumer_dependency',
  'execution_aperture',
  'authority_boundary',
]);
const TARGET_AGENT_FIELDS = new Set([
  'domain_id',
  'domain_label',
  'repo_dir',
  'target_agent_ref',
  'descriptor_ref',
]);
const EVALUATION_REQUEST_REF_FIELDS = new Set([
  'ref',
  'sha256',
  'request_id',
  'suite_id',
  'suite_kind',
]);
const OMA_WORK_ORDER_AUTHORITY_BOUNDARY = {
  oma_can_execute_agent_lab_suite: false,
  oma_can_write_agent_lab_result: false,
  oma_can_write_owner_receipt_body: false,
  oma_can_write_learning_candidate_ledger: false,
  oma_can_write_promotion_gate: false,
  oma_can_write_mechanism_or_scaleout_ledger: false,
  oma_can_manage_work_order_lifecycle: false,
  oma_can_write_target_domain_truth: false,
  oma_can_write_target_domain_memory_body: false,
  oma_can_mutate_target_domain_artifact_body: false,
  oma_can_authorize_target_domain_quality_or_export: false,
  oma_can_claim_target_domain_ready: false,
  oma_can_claim_target_production_ready: false,
  oma_can_promote_default_agent_without_gate: false,
} as const;
const OUTPUT_ARTIFACT_NAMES = [
  'foundry-lab-evaluation-suite-plan.json',
  'agent-lab-suite.json',
  'agent-lab-suite-result.json',
  'foundry-lab-execution-receipt.json',
  'foundry-lab-evaluation-typed-blocker.json',
] as const;
const SAFE_TRUE_AUTHORITY_FLAGS = new Set(['refs_only']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

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

function assertOutputArtifactsAbsent(outputDir: string) {
  const existing = OUTPUT_ARTIFACT_NAMES.filter((name) => fs.existsSync(path.join(outputDir, name)));
  if (existing.length > 0) {
    invalid('Output directory already contains Foundry Lab evaluation artifacts.', {
      output_dir: outputDir,
      existing_artifacts: existing,
    });
  }
}

function requiredString(value: unknown, field: string) {
  const resolved = stringValue(value);
  if (!resolved) {
    return invalid(`Foundry Lab evaluation work order requires ${field}.`, { field });
  }
  return resolved;
}

function requiredSha256(value: unknown, field: string) {
  const resolved = requiredString(value, field);
  if (!SHA256_PATTERN.test(resolved)) {
    invalid(`Foundry Lab evaluation work order requires lowercase raw-byte SHA-256 at ${field}.`, {
      field,
      actual: resolved,
    });
  }
  return resolved;
}

function readDigestBoundEvaluationRequest(filePath: string, expectedSha256: string) {
  let rawBytes: Buffer;
  try {
    rawBytes = fs.readFileSync(filePath);
  } catch (error) {
    invalid(`Foundry Lab evaluation request is missing: ${filePath}.`, {
      file: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const actualSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  if (actualSha256 !== expectedSha256) {
    invalid('Foundry Lab evaluation request sha256 mismatch.', {
      file: filePath,
      expected_sha256: expectedSha256,
      actual_sha256: actualSha256,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBytes.toString('utf8'));
  } catch (error) {
    invalid(`Foundry Lab evaluation request contains invalid JSON: ${filePath}.`, {
      file: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    invalid(`Foundry Lab evaluation request must contain a JSON object: ${filePath}.`, {
      file: filePath,
    });
  }
  return parsed;
}

function canonicalIdentityRefs(value: unknown, field: string) {
  if (!Array.isArray(value)
    || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    invalid(`Foundry Lab evaluation work order requires a string ref list at ${field}.`, { field });
  }
  return uniqueStringList(value.map((entry) => entry.trim())).sort();
}

function assertCanonicalWorkOrderIdentity(workOrder: JsonRecord, evaluationRequest: JsonRecord) {
  const targetAgent = record(workOrder.target_agent);
  const requestRef = record(workOrder.evaluation_request);
  const taskIds = recordList(evaluationRequest.task_intents)
    .map((task) => requiredString(task.task_id, 'evaluation_request.task_intents[].task_id'))
    .sort();
  const identityPayload = {
    work_order_kind: requiredString(workOrder.work_order_kind, 'work_order.work_order_kind'),
    target_identity: {
      domain_id: requiredString(targetAgent.domain_id, 'work_order.target_agent.domain_id'),
      target_agent_ref: requiredString(targetAgent.target_agent_ref, 'work_order.target_agent.target_agent_ref'),
      descriptor_ref: requiredString(targetAgent.descriptor_ref, 'work_order.target_agent.descriptor_ref'),
    },
    evaluation_request: {
      request_id: requiredString(requestRef.request_id, 'work_order.evaluation_request.request_id'),
      suite_id: requiredString(requestRef.suite_id, 'work_order.evaluation_request.suite_id'),
      suite_kind: requiredString(requestRef.suite_kind, 'work_order.evaluation_request.suite_kind'),
      ref: requiredString(requestRef.ref, 'work_order.evaluation_request.ref'),
      sha256: requiredSha256(requestRef.sha256, 'work_order.evaluation_request.sha256'),
      task_ids: taskIds,
    },
    source_refs: canonicalIdentityRefs(workOrder.source_refs, 'work_order.source_refs'),
    reviewer_refs: canonicalIdentityRefs(workOrder.reviewer_refs, 'work_order.reviewer_refs'),
    candidate_refs: canonicalIdentityRefs(workOrder.candidate_refs, 'work_order.candidate_refs'),
  };
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(identityPayload))
    .digest('hex')
    .slice(0, 12);
  const expected = `oma_foundry_lab_work_order_${digest}`;
  const actual = requiredString(workOrder.work_order_id, 'work_order.work_order_id');
  if (actual !== expected) {
    invalid(
      'Foundry Lab evaluation work order canonical work_order_id must bind target_agent domain_id/target_agent_ref/descriptor_ref, evaluation_request ref/sha256/request_id/suite_id/suite_kind/task_ids, and provenance refs.',
      { expected_work_order_id: expected, actual_work_order_id: actual },
    );
  }
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

function assertEvaluationOwner(actual: unknown, field: string) {
  if (actual !== EVALUATION_OWNER) {
    invalid(`Foundry Lab evaluation work order requires canonical evaluation owner at ${field}.`, {
      field,
      expected: EVALUATION_OWNER,
      actual: actual ?? null,
    });
  }
}

function assertAllowedFields(value: JsonRecord, allowed: Set<string>, field: string) {
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownFields.length > 0) {
    invalid(`Foundry Lab evaluation work order has unsupported fields at ${field}.`, {
      field,
      unknown_fields: unknownFields.sort(),
    });
  }
}

function assertExactWorkOrderAuthorityBoundary(value: unknown) {
  if (!isRecord(value)) {
    invalid('Foundry Lab evaluation work order requires an exact authority_boundary object.', {
      field: 'work_order.authority_boundary',
    });
  }
  const expectedEntries = Object.entries(OMA_WORK_ORDER_AUTHORITY_BOUNDARY);
  const unknownFields = Object.keys(value)
    .filter((key) => !(key in OMA_WORK_ORDER_AUTHORITY_BOUNDARY));
  const missingFields = expectedEntries
    .filter(([key]) => value[key] === undefined)
    .map(([key]) => key);
  const mismatchedFields = expectedEntries
    .filter(([key, expected]) => value[key] !== expected)
    .map(([key]) => key);
  if (unknownFields.length > 0 || missingFields.length > 0 || mismatchedFields.length > 0) {
    invalid('Foundry Lab evaluation work order has an unsupported authority_boundary.', {
      field: 'work_order.authority_boundary',
      unknown_fields: unknownFields.sort(),
      missing_fields: missingFields.sort(),
      mismatched_fields: mismatchedFields.sort(),
    });
  }
}

function canonicalTargetAgent(workOrder: JsonRecord) {
  const targetAgent = record(workOrder.target_agent);
  assertAllowedFields(targetAgent, TARGET_AGENT_FIELDS, 'work_order.target_agent');
  const descriptorRef = requiredString(targetAgent.descriptor_ref, 'work_order.target_agent.descriptor_ref');
  if (!path.isAbsolute(descriptorRef)) {
    invalid('Foundry Lab evaluation work order requires an absolute target descriptor_ref.', {
      field: 'work_order.target_agent.descriptor_ref',
      actual: descriptorRef,
    });
  }
  const canonicalDescriptorRef = path.resolve(descriptorRef);
  if (path.basename(canonicalDescriptorRef) !== 'domain_descriptor.json'
    || path.basename(path.dirname(canonicalDescriptorRef)) !== 'contracts') {
    invalid('Foundry Lab evaluation work order requires contracts/domain_descriptor.json as target descriptor_ref.', {
      field: 'work_order.target_agent.descriptor_ref',
      actual: descriptorRef,
    });
  }
  const repoDir = path.dirname(path.dirname(canonicalDescriptorRef));
  if (targetAgent.repo_dir !== undefined) {
    const declaredRepoDir = requiredString(targetAgent.repo_dir, 'work_order.target_agent.repo_dir');
    if (!path.isAbsolute(declaredRepoDir) || path.resolve(declaredRepoDir) !== repoDir) {
      invalid('Foundry Lab evaluation work order target_agent.repo_dir must match the canonical descriptor parent.', {
        field: 'work_order.target_agent.repo_dir',
        expected: repoDir,
        actual: declaredRepoDir,
      });
    }
  }
  return {
    domainId: requiredString(targetAgent.domain_id, 'work_order.target_agent.domain_id'),
    targetAgentRef: requiredString(targetAgent.target_agent_ref, 'work_order.target_agent.target_agent_ref'),
    descriptorRef: canonicalDescriptorRef,
    repoDir,
  };
}

function evaluationTargetAgent(workOrder: JsonRecord): AgentLabEvaluationTargetAgent {
  const target = canonicalTargetAgent(workOrder);
  return {
    domain_id: target.domainId,
    target_agent_ref: target.targetAgentRef,
    descriptor_ref: target.descriptorRef,
  };
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
  assertEvaluationOwner(workOrder.execution_owner, 'work_order.execution_owner');
  assertEvaluationOwner(record(workOrder.consumer_dependency).owner, 'consumer_dependency.owner');
  assertEvaluationOwner(
    record(workOrder.execution_aperture).work_order_lifecycle_owner,
    'execution_aperture.work_order_lifecycle_owner',
  );
  assertEvaluationOwner(
    record(workOrder.execution_aperture).result_ledger_owner,
    'execution_aperture.result_ledger_owner',
  );
  assertValue(
    record(workOrder.execution_aperture).target_owner_closeout_owner,
    TARGET_OWNER_CLOSEOUT_ROLE,
    'execution_aperture.target_owner_closeout_owner',
  );
  if (workOrder.suite_seed !== undefined || workOrder.suite_plan !== undefined) {
    invalid('Foundry Lab evaluation work orders must not carry producer-owned suite seeds or suite plans.', {
      legacy_fields: [
        ...(workOrder.suite_seed !== undefined ? ['suite_seed'] : []),
        ...(workOrder.suite_plan !== undefined ? ['suite_plan'] : []),
      ],
    });
  }
  assertAllowedFields(workOrder, WORK_ORDER_FIELDS, 'work_order');
  const evaluationRequest = record(workOrder.evaluation_request);
  assertAllowedFields(
    evaluationRequest,
    EVALUATION_REQUEST_REF_FIELDS,
    'work_order.evaluation_request',
  );
  requiredString(evaluationRequest.ref, 'work_order.evaluation_request.ref');
  requiredSha256(evaluationRequest.sha256, 'work_order.evaluation_request.sha256');
  requiredString(evaluationRequest.request_id, 'work_order.evaluation_request.request_id');
  requiredString(evaluationRequest.suite_id, 'work_order.evaluation_request.suite_id');
  requiredString(evaluationRequest.suite_kind, 'work_order.evaluation_request.suite_kind');
  canonicalTargetAgent(workOrder);
  assertExactWorkOrderAuthorityBoundary(workOrder.authority_boundary);
  assertNoForbiddenAuthorityClaims(workOrder, 'Foundry Lab evaluation work order');
}

function validateSuitePlan(workOrder: JsonRecord, suitePlan: JsonRecord) {
  assertValue(suitePlan.surface_kind, EVALUATION_SUITE_PLAN_SURFACE, 'suite_plan.surface_kind');
  assertValue(suitePlan.version, EVALUATION_SUITE_PLAN_VERSION, 'suite_plan.version');
  const requestRef = record(workOrder.evaluation_request);
  assertValue(suitePlan.suite_id, requiredString(requestRef.suite_id, 'work_order.evaluation_request.suite_id'), 'suite_plan.suite_id');
  assertValue(
    suitePlan.suite_kind,
    requiredString(requestRef.suite_kind, 'work_order.evaluation_request.suite_kind'),
    'suite_plan.suite_kind',
  );
  assertEvaluationOwner(suitePlan.producer, 'suite_plan.producer');
  const targetAgent = canonicalTargetAgent(workOrder);
  if (suitePlan.target_agent_ref !== undefined) {
    assertValue(suitePlan.target_agent_ref, targetAgent.targetAgentRef, 'suite_plan.target_agent_ref');
  }
  if (suitePlan.target_agent_descriptor_ref !== undefined) {
    assertValue(
      suitePlan.target_agent_descriptor_ref,
      targetAgent.descriptorRef,
      'suite_plan.target_agent_descriptor_ref',
    );
  }
  const tasks = recordList(suitePlan.tasks);
  if (tasks.length === 0) {
    invalid('Foundry Lab evaluation suite plan requires at least one task.');
  }
  const taskIds = tasks.map((task) => requiredString(task.task_id, 'suite_plan.tasks[].task_id'));
  tasks.forEach((task) => {
    requiredString(task.domain_id, 'suite_plan.tasks[].domain_id');
    assertValue(task.target_agent_ref, targetAgent.targetAgentRef, 'suite_plan.tasks[].target_agent_ref');
    assertValue(
      task.target_agent_descriptor_ref,
      targetAgent.descriptorRef,
      'suite_plan.tasks[].target_agent_descriptor_ref',
    );
    assertEvaluationOwner(
      record(task.promotion_gate_request).evaluation_owner,
      'suite_plan.tasks[].promotion_gate_request.evaluation_owner',
    );
    allowedChangeScope(record(task.improvement_candidate_seed).allowed_change_scope);
  });
  if (new Set(taskIds).size !== taskIds.length) {
    invalid('Foundry Lab evaluation suite plan task ids must be unique.', { task_ids: taskIds });
  }
  assertNoForbiddenAuthorityClaims(suitePlan, 'Foundry Lab evaluation suite plan');
}

function promotionGateRequestRefs(suitePlan: JsonRecord) {
  return uniqueStringList(recordList(suitePlan.tasks).map((task) =>
    stringValue(record(task.promotion_gate_request).gate_ref)));
}

function candidateRefProjection(workOrder: JsonRecord, suitePlan: JsonRecord) {
  const improvementCandidateRefs = uniqueStringList(recordList(suitePlan.tasks).map((task) =>
    stringValue(record(task.improvement_candidate_seed).candidate_ref)));
  const inputCandidateRefs = stringList(workOrder.candidate_refs);
  const downstreamCandidateRefs = inputCandidateRefs.filter((ref) => !improvementCandidateRefs.includes(ref));
  return {
    improvementCandidateRefs,
    inputCandidateRefs,
    mechanismCandidateRefs: downstreamCandidateRefs.filter((ref) => ref.startsWith('mechanism-candidate:')),
    otherCandidateRefs: downstreamCandidateRefs.filter((ref) => !ref.startsWith('mechanism-candidate:')),
  };
}

function requiredBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    return invalid(`Foundry Lab evaluation observation packet requires boolean ${field}.`, { field });
  }
  return value;
}

function requiredRefList(value: unknown, field: string) {
  if (!Array.isArray(value)
    || value.length === 0
    || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    return invalid(`Foundry Lab evaluation observation packet requires non-empty ref list ${field}.`, {
      field,
    });
  }
  return uniqueStringList(value as string[]);
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
        && (FORBIDDEN_TRUE_AUTHORITY_FLAGS.includes(key)
          || (inAuthorityBoundary && !SAFE_TRUE_AUTHORITY_FLAGS.has(key)))
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

function validateObservationPacket(
  workOrder: JsonRecord,
  suitePlan: JsonRecord,
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
    requiredString(suitePlan.suite_id, 'suite_plan.suite_id'),
    'observations.suite_id',
  );
  const targetAgent = canonicalTargetAgent(workOrder);
  assertValue(observationPacket.target_agent_ref, targetAgent.targetAgentRef, 'observations.target_agent_ref');
  assertValue(
    observationPacket.target_agent_descriptor_ref,
    targetAgent.descriptorRef,
    'observations.target_agent_descriptor_ref',
  );
  assertEvaluationOwner(observationPacket.evaluation_owner, 'observations.evaluation_owner');
  requiredString(observationPacket.evaluation_receipt_ref, 'observations.evaluation_receipt_ref');
  assertNoForbiddenAuthorityClaims(observationPacket, 'Foundry Lab evaluation observation packet');
  const seedTasks = recordList(suitePlan.tasks);
  for (const seedTask of seedTasks) {
    const taskId = requiredString(seedTask.task_id, 'suite_plan.tasks[].task_id');
    const observationTask = observationTaskById(observationPacket, taskId);
    assertValue(
      observationTask.domain_id,
      requiredString(seedTask.domain_id, 'suite_plan.tasks[].domain_id'),
      'observations.tasks[].domain_id',
    );
    assertValue(
      observationTask.target_agent_ref,
      targetAgent.targetAgentRef,
      'observations.tasks[].target_agent_ref',
    );
    assertValue(
      observationTask.target_agent_descriptor_ref,
      targetAgent.descriptorRef,
      'observations.tasks[].target_agent_descriptor_ref',
    );
  }
  if (recordList(observationPacket.tasks).length !== seedTasks.length) {
    invalid('Foundry Lab evaluation observation packet contains undeclared task observations.', {
      suite_task_count: seedTasks.length,
      observation_task_count: recordList(observationPacket.tasks).length,
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

function targetAgentProjection(workOrder: JsonRecord) {
  const targetAgent = record(workOrder.target_agent);
  const canonicalTarget = canonicalTargetAgent(workOrder);
  const canonical = evaluationTargetAgent(workOrder);
  const optional = (field: string) => {
    const value = stringValue(targetAgent[field]);
    return value ? { [field]: value } : {};
  };
  return {
    ...canonical,
    ...optional('domain_label'),
    repo_dir: canonicalTarget.repoDir,
  };
}

function compileRecoveryProbes(
  seedTask: JsonRecord,
  observationTask: JsonRecord,
  evaluationOwner: string,
): AgentLabRecoveryProbe[] {
  const observations = recordList(observationTask.recovery_probe_observations);
  const specs = recordList(seedTask.recovery_probe_specs);
  const declaredProbeRefs = specs.map((spec) =>
    requiredString(spec.probe_ref, 'suite_plan.tasks[].recovery_probe_specs[].probe_ref'));
  const undeclaredProbeRefs = observations
    .map((observation) => stringValue(observation.probe_ref))
    .filter((probeRef): probeRef is string =>
      typeof probeRef === 'string' && !declaredProbeRefs.includes(probeRef));
  if (undeclaredProbeRefs.length > 0 || observations.length !== specs.length) {
    invalid('Foundry Lab evaluation observation packet contains an undeclared recovery probe observation.', {
      declared_probe_refs: declaredProbeRefs,
      undeclared_probe_refs: undeclaredProbeRefs,
      observation_count: observations.length,
    });
  }
  return specs.map((spec) => {
    const probeRef = requiredString(spec.probe_ref, 'suite_plan.tasks[].recovery_probe_specs[].probe_ref');
    const matched = observations.filter((observation) => observation.probe_ref === probeRef);
    if (matched.length !== 1) {
      return invalid('Foundry Lab evaluation observation packet must observe every declared recovery probe.', {
        probe_ref: probeRef,
        matched_observation_count: matched.length,
      });
    }
    const observation = matched[0];
    assertValue(
      observation.observation_owner,
      evaluationOwner,
      'observations.tasks[].recovery_probe_observations[].observation_owner',
    );
    const observationReceiptRef = requiredString(
      observation.observation_receipt_ref,
      'observations.tasks[].recovery_probe_observations[].observation_receipt_ref',
    );
    return {
      probe_ref: probeRef,
      probe_kind: requiredString(spec.probe_kind, 'suite_plan.tasks[].recovery_probe_specs[].probe_kind'),
      expected_status: passBlockStatus(
        spec.expected_status,
        'suite_plan.tasks[].recovery_probe_specs[].expected_status',
      ),
      observed_status: passBlockStatus(
        observation.observed_status,
        'observations.tasks[].recovery_probe_observations[].observed_status',
      ),
      source_refs: uniqueStringList([
        ...stringList(spec.source_refs),
        ...stringList(observation.source_refs),
        observationReceiptRef,
      ]),
    };
  });
}

function compileTrajectory(
  seedTask: JsonRecord,
  observationTask: JsonRecord,
  evaluationOwner: string,
): AgentLabTrajectory {
  const plan = record(seedTask.trajectory_plan);
  const observation = record(observationTask.trajectory_observation);
  const trajectoryRef = requiredString(plan.trajectory_ref, 'suite_plan.tasks[].trajectory_plan.trajectory_ref');
  assertMatchingRef(observation.trajectory_ref, trajectoryRef, 'observations.tasks[].trajectory_observation.trajectory_ref');
  assertValue(
    observation.observation_owner,
    evaluationOwner,
    'observations.tasks[].trajectory_observation.observation_owner',
  );
  const observationReceiptRef = requiredString(
    observation.observation_receipt_ref,
    'observations.tasks[].trajectory_observation.observation_receipt_ref',
  );
  return {
    trajectory_ref: trajectoryRef,
    run_ref: requiredString(observation.run_ref, 'observations.tasks[].trajectory_observation.run_ref'),
    agent_executor: requiredString(plan.agent_executor, 'suite_plan.tasks[].trajectory_plan.agent_executor'),
    stage_attempt_refs: stringList(observation.stage_attempt_refs),
    tool_call_refs: stringList(observation.tool_call_refs),
    artifact_refs: stringList(observation.artifact_refs),
    receipt_refs: uniqueStringList([...stringList(observation.receipt_refs), observationReceiptRef]),
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
  const scorecardRef = requiredString(spec.scorecard_ref, 'suite_plan.tasks[].scorecard_spec.scorecard_ref');
  assertMatchingRef(observation.scorecard_ref, scorecardRef, 'observations.tasks[].scorecard_observation.scorecard_ref');
  const taskDomainId = requiredString(seedTask.domain_id, 'suite_plan.tasks[].domain_id');
  assertValue(
    observation.scorecard_owner,
    taskDomainId,
    'observations.tasks[].scorecard_observation.scorecard_owner',
  );
  const scorecardReceiptRef = requiredString(
    observation.scorecard_receipt_ref,
    'observations.tasks[].scorecard_observation.scorecard_receipt_ref',
  );
  if (spec.target_agent_owned !== true && spec.domain_owned !== true) {
    invalid('Foundry Lab evaluation suite plan scorecard must remain domain owned.', {
      scorecard_ref: scorecardRef,
    });
  }
  return {
    scorecard_ref: scorecardRef,
    domain_owned: true,
    opl_scorecard_role: 'scorecard_ref_projection_only',
    passed: requiredBoolean(observation.passed, 'observations.tasks[].scorecard_observation.passed'),
    metric_refs: stringList(spec.metric_refs),
    evidence_refs: uniqueStringList([
      ...stringList(spec.evidence_refs),
      ...stringList(observation.evidence_refs),
      scorecardReceiptRef,
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
  return invalid('Foundry Lab evaluation suite plan has unsupported allowed_change_scope.', {
    field: 'suite_plan.tasks[].improvement_candidate_seed.allowed_change_scope',
    value: value ?? null,
  });
}

function compileImprovementCandidate(
  seedTask: JsonRecord,
  promotionGateRef: string,
  scorecard: AgentLabScorecard,
): AgentLabImprovementCandidate {
  const seed = record(seedTask.improvement_candidate_seed);
  return {
    candidate_ref: requiredString(seed.candidate_ref, 'suite_plan.tasks[].improvement_candidate_seed.candidate_ref'),
    candidate_kind: requiredString(seed.candidate_kind, 'suite_plan.tasks[].improvement_candidate_seed.candidate_kind'),
    target_ref: requiredString(seed.target_ref, 'suite_plan.tasks[].improvement_candidate_seed.target_ref'),
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
  const gateRef = requiredString(request.gate_ref, 'suite_plan.tasks[].promotion_gate_request.gate_ref');
  assertMatchingRef(observation.gate_ref, gateRef, 'observations.tasks[].promotion_gate_observation.gate_ref');
  assertEvaluationOwner(request.evaluation_owner, 'suite_plan.tasks[].promotion_gate_request.evaluation_owner');
  assertEvaluationOwner(
    observation.evaluation_owner,
    'observations.tasks[].promotion_gate_observation.evaluation_owner',
  );
  requiredString(
    observation.evaluation_receipt_ref,
    'observations.tasks[].promotion_gate_observation.evaluation_receipt_ref',
  );
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

function compileStageCompletionPolicy(
  seedTask: JsonRecord,
  observationTask: JsonRecord,
): AgentLabStageCompletionPolicy {
  const policy = record(observationTask.stage_completion_policy);
  assertValue(
    policy.policy_owner,
    requiredString(seedTask.domain_id, 'suite_plan.tasks[].domain_id'),
    'observations.tasks[].stage_completion_policy.policy_owner',
  );
  requiredString(
    policy.policy_receipt_ref,
    'observations.tasks[].stage_completion_policy.policy_receipt_ref',
  );
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
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function compileObservedTask(
  seedTask: JsonRecord,
  observationTask: JsonRecord,
  evaluationOwner: string,
): AgentLabTaskManifest {
  const promotionGate = compilePromotionGate(seedTask, observationTask);
  const scorecard = compileScorecard(seedTask, observationTask);
  const environment = record(seedTask.environment);
  return {
    task_id: requiredString(seedTask.task_id, 'suite_plan.tasks[].task_id'),
    domain_id: requiredString(seedTask.domain_id, 'suite_plan.tasks[].domain_id'),
    task_family: requiredString(seedTask.task_family, 'suite_plan.tasks[].task_family'),
    environment: {
      environment_kind: requiredString(environment.environment_kind, 'suite_plan.tasks[].environment.environment_kind'),
      workspace_locator_ref: requiredString(
        environment.workspace_locator_ref,
        'suite_plan.tasks[].environment.workspace_locator_ref',
      ),
      sandbox_policy: requiredString(environment.sandbox_policy, 'suite_plan.tasks[].environment.sandbox_policy'),
      network_policy: requiredString(environment.network_policy, 'suite_plan.tasks[].environment.network_policy'),
    },
    instructions_ref: requiredString(seedTask.instructions_ref, 'suite_plan.tasks[].instructions_ref'),
    agent_entry_ref: requiredString(seedTask.agent_entry_ref, 'suite_plan.tasks[].agent_entry_ref'),
    stage_refs: stringList(seedTask.stage_refs),
    oracle_refs: stringList(seedTask.oracle_refs),
    scorer_refs: stringList(seedTask.scorer_refs),
    recovery_probes: compileRecoveryProbes(seedTask, observationTask, evaluationOwner),
    trajectory: compileTrajectory(seedTask, observationTask, evaluationOwner),
    scorecard,
    improvement_candidate: compileImprovementCandidate(seedTask, promotionGate.gate_ref, scorecard),
    promotion_gate: promotionGate,
    stage_completion_policy: compileStageCompletionPolicy(seedTask, observationTask),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function compileProductionEvidenceGate(
  suitePlan: JsonRecord,
  observationPacket: JsonRecord,
) {
  if (suitePlan.suite_kind !== 'agent_production_evidence_suite') {
    return undefined;
  }
  const seedGate = record(suitePlan.production_evidence_gate);
  const observation = record(observationPacket.production_evidence_gate_observation);
  const expectedGateIds = requiredRefList(
    seedGate.gate_ids,
    'suite_plan.production_evidence_gate.gate_ids',
  );
  const observedGateIds = requiredRefList(
    observation.gate_ids,
    'observations.production_evidence_gate_observation.gate_ids',
  );
  if (expectedGateIds.length !== observedGateIds.length
    || expectedGateIds.some((gateId) => !observedGateIds.includes(gateId))) {
    invalid('Foundry Lab production evidence gate observation does not match the suite plan gate identity.', {
      expected_gate_ids: expectedGateIds,
      observed_gate_ids: observedGateIds,
    });
  }
  assertValue(
    observation.evaluation_owner,
    EVALUATION_OWNER,
    'observations.production_evidence_gate_observation.evaluation_owner',
  );
  requiredString(
    observation.evaluation_receipt_ref,
    'observations.production_evidence_gate_observation.evaluation_receipt_ref',
  );
  if (observation.domain_verdict_claimed === true) {
    invalid('Foundry Lab production evidence gate observation cannot claim a domain verdict.');
  }
  return {
    surface_kind: 'production_evidence_gate_refs',
    gate_ids: observedGateIds,
    owner_route_refs: requiredRefList(
      observation.owner_route_refs,
      'observations.production_evidence_gate_observation.owner_route_refs',
    ),
    no_forbidden_write_proof_refs: requiredRefList(
      observation.no_forbidden_write_proof_refs,
      'observations.production_evidence_gate_observation.no_forbidden_write_proof_refs',
    ),
    typed_blocker_refs: stringList(observation.typed_blocker_refs),
    required_owner_receipt_refs: requiredRefList(
      observation.required_owner_receipt_refs,
      'observations.production_evidence_gate_observation.required_owner_receipt_refs',
    ),
    gate_result_refs: requiredRefList(
      observation.gate_result_refs,
      'observations.production_evidence_gate_observation.gate_result_refs',
    ),
    domain_verdict_claimed: false,
  };
}

function evaluationProvenance(suitePlan: JsonRecord, observationPacket: JsonRecord) {
  const bindings: AgentLabEvaluationProvenanceBinding[] = [{
    receipt_role: 'evaluation_packet',
    receipt_ref: requiredString(observationPacket.evaluation_receipt_ref, 'observations.evaluation_receipt_ref'),
  }];
  for (const seedTask of recordList(suitePlan.tasks)) {
    const taskId = requiredString(seedTask.task_id, 'suite_plan.tasks[].task_id');
    const observationTask = observationTaskById(
      observationPacket,
      taskId,
    );
    bindings.push(...recordList(observationTask.recovery_probe_observations).map((observation) => ({
      receipt_role: 'recovery_probe_observation' as const,
      receipt_ref: requiredString(
        observation.observation_receipt_ref,
        'observations.tasks[].recovery_probe_observations[].observation_receipt_ref',
      ),
      task_id: taskId,
      probe_ref: requiredString(
        observation.probe_ref,
        'observations.tasks[].recovery_probe_observations[].probe_ref',
      ),
    })));
    bindings.push(
      {
        receipt_role: 'trajectory_observation',
        receipt_ref: requiredString(
          record(observationTask.trajectory_observation).observation_receipt_ref,
          'observations.tasks[].trajectory_observation.observation_receipt_ref',
        ),
        task_id: taskId,
      },
      {
        receipt_role: 'scorecard_observation',
        receipt_ref: requiredString(
          record(observationTask.scorecard_observation).scorecard_receipt_ref,
          'observations.tasks[].scorecard_observation.scorecard_receipt_ref',
        ),
        task_id: taskId,
      },
      {
        receipt_role: 'promotion_gate_observation',
        receipt_ref: requiredString(
          record(observationTask.promotion_gate_observation).evaluation_receipt_ref,
          'observations.tasks[].promotion_gate_observation.evaluation_receipt_ref',
        ),
        task_id: taskId,
      },
      {
        receipt_role: 'stage_completion_policy',
        receipt_ref: requiredString(
          record(observationTask.stage_completion_policy).policy_receipt_ref,
          'observations.tasks[].stage_completion_policy.policy_receipt_ref',
        ),
        task_id: taskId,
      },
    );
  }
  if (suitePlan.suite_kind === 'agent_production_evidence_suite') {
    bindings.push({
      receipt_role: 'production_evidence_gate_observation',
      receipt_ref: requiredString(
        record(observationPacket.production_evidence_gate_observation).evaluation_receipt_ref,
        'observations.production_evidence_gate_observation.evaluation_receipt_ref',
      ),
    });
  }
  bindings.sort((left, right) =>
    left.receipt_role.localeCompare(right.receipt_role)
    || (left.task_id ?? '').localeCompare(right.task_id ?? '')
    || (left.probe_ref ?? '').localeCompare(right.probe_ref ?? '')
    || left.receipt_ref.localeCompare(right.receipt_ref));
  return {
    refs: uniqueStringList(bindings.map((binding) => binding.receipt_ref)).sort(),
    bindings,
  };
}

function compileObservedSuite(
  workOrder: JsonRecord,
  suitePlan: JsonRecord,
  observationPacket: JsonRecord,
): AgentLabSuite {
  assertEvaluationOwner(observationPacket.evaluation_owner, 'observations.evaluation_owner');
  const evaluationOwner = EVALUATION_OWNER;
  const tasks = recordList(suitePlan.tasks).map((seedTask) => {
    const taskId = requiredString(seedTask.task_id, 'suite_plan.tasks[].task_id');
    return compileObservedTask(seedTask, observationTaskById(observationPacket, taskId), evaluationOwner);
  });
  if (recordList(observationPacket.tasks).length !== tasks.length) {
    invalid('Foundry Lab evaluation observation packet contains undeclared task observations.', {
      suite_task_count: tasks.length,
      observation_task_count: recordList(observationPacket.tasks).length,
    });
  }
  const productionEvidenceGate = compileProductionEvidenceGate(
    suitePlan,
    observationPacket,
  );
  const provenance = evaluationProvenance(suitePlan, observationPacket);
  return {
    suite_id: requiredString(suitePlan.suite_id, 'suite_plan.suite_id'),
    suite_kind: requiredString(suitePlan.suite_kind, 'suite_plan.suite_kind'),
    tasks,
    evaluation_target_agent: evaluationTargetAgent(workOrder),
    evaluation_provenance_refs: provenance.refs,
    evaluation_provenance_bindings: provenance.bindings,
    ...(productionEvidenceGate ? { production_evidence_gate: productionEvidenceGate } : {}),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function buildBlockedEvaluation(input: {
  workOrder: JsonRecord;
  workOrderPath: string;
  evaluationRequestPath: string;
  suitePlan: JsonRecord;
  suitePlanPath: string;
  outputDir: string;
}) {
  const workOrderId = requiredString(input.workOrder.work_order_id, 'work_order.work_order_id');
  const targetAgent = evaluationTargetAgent(input.workOrder);
  const candidateRefs = candidateRefProjection(input.workOrder, input.suitePlan);
  const executionReceiptPath = path.join(input.outputDir, 'foundry-lab-execution-receipt.json');
  const typedBlockerPath = path.join(input.outputDir, 'foundry-lab-evaluation-typed-blocker.json');
  const evaluationResult = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_result',
    version: 'opl.foundry-lab-evaluation-work-order-result.v1',
    status: 'blocked_missing_evaluation_observations',
    work_order_id: workOrderId,
    evaluation_target_agent: targetAgent,
    suite_id: requiredString(input.suitePlan.suite_id, 'suite_plan.suite_id'),
    missing_observations: ['evaluation_observation_packet'],
    suite_result_ref: null,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  const typedBlocker = {
    surface_kind: 'opl_foundry_lab_evaluation_platform_typed_blocker',
    version: 'opl.foundry-lab-evaluation-blocker.v1',
    blocker_id: stableId('ofleb', [workOrderId, targetAgent, evaluationResult.missing_observations]),
    blocker_kind: 'foundry_lab_evaluation_observations_missing',
    status: 'blocked',
    work_order_id: workOrderId,
    evaluation_target_agent: targetAgent,
    suite_id: evaluationResult.suite_id,
    missing_observations: evaluationResult.missing_observations,
    required_owner: EVALUATION_OWNER,
    target_owner_closeout_still_required: true,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  const receipt = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_execution_receipt',
    version: 'opl.foundry-lab-evaluation-work-order-execution.v1',
    receipt_id: stableId('oflewr', [workOrderId, targetAgent, typedBlocker.blocker_id]),
    status: evaluationResult.status,
    work_order_id: workOrderId,
    work_order_kind: requiredString(input.workOrder.work_order_kind, 'work_order.work_order_kind'),
    target_agent: targetAgentProjection(input.workOrder),
    evaluation_target_agent: targetAgent,
    consumer_dependency: {
      status: 'satisfied',
      consumer_role: CONSUMER_ROLE,
      action_ref: ACTION_REF,
    },
    source_refs: uniqueStringList([
      input.workOrderPath,
      input.evaluationRequestPath,
      ...stringList(input.workOrder.source_refs),
      ...stringList(input.workOrder.reviewer_refs),
    ]),
    agent_lab_suite_result_ref: null,
    foundry_lab_execution_receipt_ref: executionReceiptPath,
    improvement_candidate_refs: candidateRefs.improvementCandidateRefs,
    input_candidate_refs: candidateRefs.inputCandidateRefs,
    mechanism_proposal_refs: [],
    promotion_gate_refs: [],
    scaleout_ledger_refs: [],
    target_owner_receipt_or_typed_blocker_ref: null,
    platform_blocker_ref: typedBlockerPath,
    downstream_pending_outputs: {
      promotion_gate_request_refs: promotionGateRequestRefs(input.suitePlan),
      mechanism_candidate_refs: candidateRefs.mechanismCandidateRefs,
      other_candidate_refs: candidateRefs.otherCandidateRefs,
      mechanism_proposal_refs: [],
      scaleout_ledger_refs: [],
      target_owner_receipt_or_typed_blocker_ref: null,
      reason: 'evaluation_observation_packet_missing',
    },
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  writeJsonPayloadFile(input.suitePlanPath, input.suitePlan);
  writeJsonPayloadFile(typedBlockerPath, typedBlocker);
  writeJsonPayloadFile(executionReceiptPath, receipt);

  return {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_execution',
    version: 'opl.foundry-lab-evaluation-work-order-execution.v1',
    status: evaluationResult.status,
    work_order_path: input.workOrderPath,
    evaluation_request_path: input.evaluationRequestPath,
    suite_plan_path: input.suitePlanPath,
    observation_packet_path: null,
    artifacts: {
      evaluation_suite_plan_path: input.suitePlanPath,
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

function platformMissingObservations(suiteResult: ReturnType<typeof runAgentLabSuite>) {
  return suiteResult.missing_observations.filter((observation) => {
    if (observation === 'domain_stage_completion_policies_observed') {
      return false;
    }
    if (observation === 'promotion_gates_observed') {
      return suiteResult.runs.some((run) =>
        run.promotion_safety_assessment.missing_required_refs.some((ref) => ref !== 'promotion_gate_blocked'));
    }
    return true;
  });
}

function buildObservedEvaluation(input: {
  workOrder: JsonRecord;
  workOrderPath: string;
  evaluationRequestPath: string;
  suitePlan: JsonRecord;
  suitePlanPath: string;
  observationPacket: JsonRecord;
  observationPacketPath: string;
  outputDir: string;
}) {
  const workOrderId = requiredString(input.workOrder.work_order_id, 'work_order.work_order_id');
  const candidateRefs = candidateRefProjection(input.workOrder, input.suitePlan);
  const compiledSuitePath = path.join(input.outputDir, 'agent-lab-suite.json');
  const suiteResultPath = path.join(input.outputDir, 'agent-lab-suite-result.json');
  const executionReceiptPath = path.join(input.outputDir, 'foundry-lab-execution-receipt.json');
  const typedBlockerPath = path.join(input.outputDir, 'foundry-lab-evaluation-typed-blocker.json');
  const compiledSuite = compileObservedSuite(input.workOrder, input.suitePlan, input.observationPacket);
  const suiteResult = runAgentLabSuite(compiledSuite);
  const platformMissing = platformMissingObservations(suiteResult);
  const productionPlatformMissing = suiteResult.production_evidence_gate_result?.missing_required_refs ?? [];
  const platformBlocked = platformMissing.length > 0 || productionPlatformMissing.length > 0;
  const evaluationProvenance = compiledSuite.evaluation_provenance_refs ?? [];
  const evaluationProvenanceBindings = compiledSuite.evaluation_provenance_bindings ?? [];
  const targetAgent = compiledSuite.evaluation_target_agent
    ?? invalid('Foundry Lab compiled evaluation suite requires evaluation_target_agent.');
  const typedBlocker = platformBlocked
    ? {
        surface_kind: 'opl_foundry_lab_evaluation_platform_typed_blocker',
        version: 'opl.foundry-lab-evaluation-blocker.v1',
        blocker_id: stableId('ofleb', [workOrderId, suiteResult.result_id, platformMissing, productionPlatformMissing]),
        blocker_kind: 'foundry_lab_evaluation_suite_blocked',
        status: 'blocked',
        work_order_id: workOrderId,
        evaluation_target_agent: targetAgent,
        suite_id: compiledSuite.suite_id,
        missing_observations: platformMissing,
        missing_required_refs: productionPlatformMissing,
        blocked_runs: suiteResult.runs
          .filter((run) => run.status === 'blocked')
          .map((run) => ({ run_id: run.run_id, failure_taxonomy: run.failure_taxonomy })),
        required_owner: EVALUATION_OWNER,
        target_owner_closeout_still_required: true,
        authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
      }
    : null;
  const receipt = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_execution_receipt',
    version: 'opl.foundry-lab-evaluation-work-order-execution.v1',
    receipt_id: stableId('oflewr', [
      workOrderId,
      suiteResult.result_id,
      targetAgent,
      evaluationProvenanceBindings,
    ]),
    status: suiteResult.status,
    work_order_id: workOrderId,
    work_order_kind: requiredString(input.workOrder.work_order_kind, 'work_order.work_order_kind'),
    target_agent: targetAgentProjection(input.workOrder),
    evaluation_target_agent: targetAgent,
    consumer_dependency: {
      status: 'satisfied',
      consumer_role: CONSUMER_ROLE,
      action_ref: ACTION_REF,
    },
    source_refs: uniqueStringList([
      input.workOrderPath,
      input.evaluationRequestPath,
      input.observationPacketPath,
      ...evaluationProvenance,
      ...stringList(input.workOrder.source_refs),
      ...stringList(input.workOrder.reviewer_refs),
    ]),
    agent_lab_suite_result_ref: suiteResultPath,
    foundry_lab_execution_receipt_ref: executionReceiptPath,
    evaluation_provenance_refs: evaluationProvenance,
    evaluation_provenance_bindings: evaluationProvenanceBindings,
    improvement_candidate_refs: suiteResult.refs.improvement_candidate_refs,
    input_candidate_refs: candidateRefs.inputCandidateRefs,
    mechanism_proposal_refs: [],
    promotion_gate_refs: suiteResult.refs.promotion_gate_refs,
    scaleout_ledger_refs: [],
    target_owner_receipt_or_typed_blocker_ref: null,
    platform_blocker_ref: typedBlocker ? typedBlockerPath : null,
    downstream_pending_outputs: {
      promotion_gate_request_refs: promotionGateRequestRefs(input.suitePlan),
      mechanism_candidate_refs: candidateRefs.mechanismCandidateRefs,
      other_candidate_refs: candidateRefs.otherCandidateRefs,
      mechanism_proposal_refs: [],
      scaleout_ledger_refs: [],
      target_owner_receipt_or_typed_blocker_ref: null,
      reason: typedBlocker
        ? 'agent_lab_suite_blocked'
        : suiteResult.status === 'blocked'
          ? 'target_owner_closeout_required_for_blocked_domain_evaluation'
          : 'target_owner_closeout_required',
    },
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };
  const evaluationResult = {
    surface_kind: 'opl_foundry_lab_evaluation_work_order_result',
    version: 'opl.foundry-lab-evaluation-work-order-result.v1',
    status: suiteResult.status,
    work_order_id: workOrderId,
    evaluation_target_agent: targetAgent,
    suite_id: compiledSuite.suite_id,
    missing_observations: suiteResult.missing_observations,
    suite_result_ref: suiteResultPath,
    authority_boundary: EVALUATION_AUTHORITY_BOUNDARY,
  };

  writeJsonPayloadFile(input.suitePlanPath, input.suitePlan);
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
    evaluation_request_path: input.evaluationRequestPath,
    suite_plan_path: input.suitePlanPath,
    observation_packet_path: input.observationPacketPath,
    artifacts: {
      evaluation_suite_plan_path: input.suitePlanPath,
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
  const evaluationRequestRef = requiredString(
    record(workOrder.evaluation_request).ref,
    'work_order.evaluation_request.ref',
  );
  const evaluationRequestPath = path.resolve(path.dirname(workOrderPath), evaluationRequestRef);
  const evaluationRequestSha256 = requiredSha256(
    record(workOrder.evaluation_request).sha256,
    'work_order.evaluation_request.sha256',
  );
  const evaluationRequest = readDigestBoundEvaluationRequest(
    evaluationRequestPath,
    evaluationRequestSha256,
  );
  validateEvaluationRequest(workOrder, evaluationRequest);
  assertCanonicalWorkOrderIdentity(workOrder, evaluationRequest);
  const suitePlan = compileEvaluationSuitePlan({
    workOrder,
    request: evaluationRequest,
    targetAgent: canonicalTargetAgent(workOrder),
  });
  validateSuitePlan(workOrder, suitePlan);
  assertOutputArtifactsAbsent(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const suitePlanPath = path.join(outputDir, 'foundry-lab-evaluation-suite-plan.json');

  if (!options.observationPacketPath) {
    return buildBlockedEvaluation({
      workOrder,
      workOrderPath,
      evaluationRequestPath,
      suitePlan,
      suitePlanPath,
      outputDir,
    });
  }
  const observationPacketPath = path.resolve(options.observationPacketPath);
  const observationPacket = readRecord(
    observationPacketPath,
    'Foundry Lab evaluation observation packet',
  );
  validateObservationPacket(workOrder, suitePlan, observationPacket);
  return buildObservedEvaluation({
    workOrder,
    workOrderPath,
    evaluationRequestPath,
    suitePlan,
    suitePlanPath,
    observationPacket,
    observationPacketPath,
    outputDir,
  });
}
