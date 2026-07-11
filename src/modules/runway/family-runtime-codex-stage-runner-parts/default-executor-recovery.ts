import path from 'node:path';

import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { resolveStandardAgent } from '../../../kernel/standard-agent-registry.ts';
import {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './closeout-normalization.ts';
import {
  isRecord,
  readRecordList,
  readStringList,
  type JsonRecord,
} from './shared.ts';

function readJsonRecordFile(filePath: string): JsonRecord | null {
  const parsed = readJsonFileOrNull(filePath);
  return isRecord(parsed) ? parsed : null;
}

function defaultExecutorExecutionRefFromStagePacketRef(stagePacketRef: string) {
  const marker = '/artifacts/supervision/consumer/default_executor_dispatches/';
  const markerIndex = stagePacketRef.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  return `${stagePacketRef.slice(0, markerIndex)}`
    + '/artifacts/supervision/consumer/default_executor_execution/latest.json';
}

function findMatchingDefaultExecutorExecution(input: {
  executionIndex: JsonRecord;
  stagePacket: JsonRecord | null;
}) {
  const executions = [
    ...readRecordList(input.executionIndex.executions).map((execution) => ({
      execution,
      receiptRefSuffix: '',
    })),
    ...readRecordList(input.executionIndex.execution_ledger).map((execution) => ({
      execution,
      receiptRefSuffix: '#execution_ledger',
    })),
  ];
  if (executions.length === 0) {
    return null;
  }
  const studyId = optionalString(input.stagePacket?.study_id);
  const actionType = optionalString(input.stagePacket?.action_type);
  const actionFingerprint = optionalString(input.stagePacket?.action_fingerprint);
  const idempotencyKey = optionalString(input.stagePacket?.idempotency_key);
  if (!studyId || !actionType || (!actionFingerprint && !idempotencyKey)) {
    return null;
  }
  return executions.find(({ execution }) => {
    const matchesStudy = optionalString(execution.study_id) === studyId;
    const matchesAction = optionalString(execution.action_type) === actionType;
    const executionFingerprint = optionalString(execution.action_fingerprint);
    const matchesFingerprint = actionFingerprint && executionFingerprint
      ? executionFingerprint === actionFingerprint
      : false;
    const matchesIdempotency = idempotencyKey
      ? optionalString(execution.idempotency_key) === idempotencyKey
      : false;
    return matchesStudy && matchesAction && (matchesIdempotency || matchesFingerprint);
  }) ?? null;
}

function explicitOplExecutionAuthorizationFromAttempt(attempt: JsonRecord) {
  const candidates = [
    attempt.opl_execution_authorization,
    attempt.execution_authorization,
    attempt.execution_authorization_receipt,
    attempt.stage_run_execution_authorization,
  ];
  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }
  return null;
}

function oplAuthorizationCandidatesFromExecution(execution: JsonRecord) {
  const promptContract = isRecord(execution.prompt_contract) ? execution.prompt_contract : {};
  const ownerRoute = isRecord(execution.owner_route) ? execution.owner_route : {};
  const currentOwnerRoute = isRecord(execution.current_owner_route) ? execution.current_owner_route : {};
  const authorityRouteContext = isRecord(execution.authority_route_context) ? execution.authority_route_context : {};
  return [
    execution.opl_execution_authorization,
    execution.execution_authorization,
    execution.stage_run_execution_authorization,
    promptContract.opl_execution_authorization,
    promptContract.execution_authorization,
    ownerRoute.opl_execution_authorization,
    ownerRoute.execution_authorization,
    currentOwnerRoute.opl_execution_authorization,
    currentOwnerRoute.execution_authorization,
    authorityRouteContext.opl_execution_authorization,
  ].filter(isRecord);
}

function oplExecutionAuthorizationMatchesCurrentAttempt(input: {
  execution: JsonRecord;
  attempt: JsonRecord;
}) {
  const expected = explicitOplExecutionAuthorizationFromAttempt(input.attempt);
  if (!expected) {
    return true;
  }
  const expectedStageAttemptId = optionalString(expected.stage_attempt_id)
    ?? optionalString(input.attempt.stage_attempt_id);
  const requiredMatches = [
    ['stage_attempt_id', expectedStageAttemptId],
    ['provider_attempt_ref', optionalString(expected.provider_attempt_ref)],
    ['attempt_lease_ref', optionalString(expected.attempt_lease_ref)],
    ['attempt_lease_status', optionalString(expected.attempt_lease_status)],
    ['execution_authorization_decision_ref', optionalString(expected.execution_authorization_decision_ref)],
  ] as const;
  return oplAuthorizationCandidatesFromExecution(input.execution).some((candidate) => requiredMatches.every(
    ([key, expectedValue]) => !expectedValue || optionalString(candidate[key]) === expectedValue,
  ));
}

function closeoutPacketFromDefaultExecutorExecution(input: {
  execution: JsonRecord;
  receiptRef: string;
  nextOwner: string;
}): TypedStageCloseoutPacket | null {
  const executionStatus = optionalString(input.execution.execution_status);
  if (!executionStatus || !['blocked', 'completed', 'succeeded', 'executed'].includes(executionStatus)) {
    return null;
  }
  const ownerResult = isRecord(input.execution.owner_result) ? input.execution.owner_result : {};
  const stageNativeCloseout = isRecord(ownerResult.stage_native_closeout)
    ? ownerResult.stage_native_closeout
    : null;
  const stageNativeOwnerAnswerRef = optionalString(ownerResult.stage_native_owner_answer_ref);
  const stageNativeWrittenRef = optionalString(stageNativeCloseout?.written_ref);
  const closeoutRefs = [
    input.receiptRef,
    ...(stageNativeOwnerAnswerRef ? [stageNativeOwnerAnswerRef] : []),
    ...(stageNativeWrittenRef ? [stageNativeWrittenRef] : []),
  ];
  const blockedReason = optionalString(ownerResult.blocked_reason)
    ?? optionalString(input.execution.blocked_reason)
    ?? optionalString(input.execution.error);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: [...new Set(closeoutRefs)],
    consumed_refs: readStringList(input.execution.source_refs),
    consumed_memory_refs: readStringList(input.execution.consumed_memory_refs),
    writeback_receipt_refs: readStringList(input.execution.writeback_receipt_refs),
    rejected_writes: [
      ...readRecordList(input.execution.typed_blockers),
      ...(blockedReason
        ? [{
            blocker_id: blockedReason,
            reason: blockedReason,
            execution_status: executionStatus,
          }]
        : []),
    ],
    next_owner: input.nextOwner,
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: executionStatus,
      execution_id: optionalString(input.execution.execution_id),
      action_type: optionalString(input.execution.action_type),
      owner_callable_surface: optionalString(input.execution.owner_callable_surface),
      required_output_surface: optionalString(input.execution.required_output_surface),
      blocked_reason: blockedReason,
      owner_result_status: optionalString(ownerResult.status),
      stage_native_closeout: stageNativeCloseout ?? undefined,
      stage_native_owner_answer_ref: stageNativeOwnerAnswerRef,
      stage_native_terminal_outcome_kind: optionalString(ownerResult.stage_native_terminal_outcome_kind),
      quality_authorized: ownerResult.quality_authorized === true,
      submission_authorized: ownerResult.submission_authorized === true,
      current_package_write_authorized: ownerResult.current_package_write_authorized === true,
      writes_performed: false,
    },
    authority_boundary: {
      opl: 'default_executor_execution_receipt_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_authorize_submission: false,
    },
  });
}

function explicitOwnerCandidate(value: unknown) {
  const owner = optionalString(value);
  if (!owner) {
    return null;
  }
  return resolveStandardAgent(owner)?.plugin_name ?? owner;
}

function registeredDomainOwner(value: unknown) {
  const domainId = optionalString(value);
  return domainId ? resolveStandardAgent(domainId)?.plugin_name ?? null : null;
}

function resolveRecoveryOwner(input: {
  execution: JsonRecord;
  stagePacket: JsonRecord | null;
  attempt: JsonRecord;
}) {
  const ownerResult = isRecord(input.execution.owner_result) ? input.execution.owner_result : {};
  const currentOwnerRoute = isRecord(input.execution.current_owner_route)
    ? input.execution.current_owner_route
    : {};
  const explicitCandidates = [
    input.execution.next_owner,
    currentOwnerRoute.next_owner,
    ownerResult.next_owner,
    input.stagePacket?.next_owner,
    input.stagePacket?.owner,
    input.stagePacket?.domain_owner,
    input.attempt.next_owner,
    input.attempt.owner,
  ];
  for (const candidate of explicitCandidates) {
    const owner = explicitOwnerCandidate(candidate);
    if (owner) {
      return owner;
    }
  }

  const domainCandidates = [
    input.stagePacket?.target_domain_id,
    input.stagePacket?.domain_id,
    input.attempt.target_domain_id,
    input.attempt.domain_id,
  ];
  for (const candidate of domainCandidates) {
    const owner = registeredDomainOwner(candidate);
    if (owner) {
      return owner;
    }
  }
  return null;
}

export function recoverDefaultExecutorDomainReceiptCloseout(input: {
  workspaceRoot: string;
  stagePacketRef: string;
  attempt: JsonRecord;
}) {
  const receiptRef = defaultExecutorExecutionRefFromStagePacketRef(input.stagePacketRef);
  if (!receiptRef) {
    return { status: 'not_default_executor_dispatch' as const, closeoutPacket: null, receiptRef: null };
  }
  const receiptPath = path.join(input.workspaceRoot, receiptRef);
  const executionIndex = readJsonRecordFile(receiptPath);
  if (!executionIndex) {
    return { status: 'receipt_not_found' as const, closeoutPacket: null, receiptRef };
  }
  const stagePacket = readJsonRecordFile(path.join(input.workspaceRoot, input.stagePacketRef));
  const match = findMatchingDefaultExecutorExecution({ executionIndex, stagePacket });
  if (!match) {
    return { status: 'matching_execution_not_found' as const, closeoutPacket: null, receiptRef };
  }
  if (!oplExecutionAuthorizationMatchesCurrentAttempt({
    execution: match.execution,
    attempt: input.attempt,
  })) {
    return { status: 'authorization_binding_mismatch' as const, closeoutPacket: null, receiptRef };
  }
  const nextOwner = resolveRecoveryOwner({
    execution: match.execution,
    stagePacket,
    attempt: input.attempt,
  });
  if (!nextOwner) {
    return { status: 'owner_unresolved' as const, closeoutPacket: null, receiptRef };
  }
  const closeoutPacket = closeoutPacketFromDefaultExecutorExecution({
    execution: match.execution,
    receiptRef: `${receiptRef}${match.receiptRefSuffix}`,
    nextOwner,
  });
  return {
    status: closeoutPacket ? 'closeout_found' as const : 'execution_not_terminal' as const,
    closeoutPacket,
    receiptRef,
  };
}
