import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { CodexCommandResult } from '../codex.ts';
import { stageIdFromAttempt } from './input-prompt.ts';
import {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './closeout-normalization.ts';
import { isRecord, type JsonRecord } from './shared.ts';
import { requireFamilyRuntimeExecutionScope } from '../family-runtime-execution-scope.ts';

export function closeoutExecutionScopeFromAttempt(attempt: JsonRecord) {
  if (attempt.scope_kind === 'identity_unresolved' || attempt.identity_state === 'identity_unresolved') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Identity-unresolved StageAttempt cannot produce a typed closeout.',
      {
        failure_code: 'runtime_ingress_identity_unresolved',
        stage_attempt_id: optionalString(attempt.stage_attempt_id),
      },
    );
  }
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  const executionScope = requireFamilyRuntimeExecutionScope({
    scopeKind: attempt.scope_kind,
    executionScope: attempt.execution_scope,
    workspaceLocator,
    domainId: optionalString(attempt.domain_id) ?? optionalString(workspaceLocator.domain_id),
    operation: 'build_provider_runtime_closeout',
  }).executionScope;
  return executionScope
    ? { execution_scope: executionScope, scope_digest: executionScope.scope_digest }
    : {};
}

export function buildProviderRuntimeCloseoutPacket(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  blockedReason: string;
  routeImpact?: JsonRecord | null;
}): TypedStageCloseoutPacket {
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const stageId = stageIdFromAttempt(input.attempt);
  const domainId = optionalString(input.attempt.domain_id);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    ...(optionalString(input.attempt.stage_run_id)
      ? { stage_run_id: optionalString(input.attempt.stage_run_id) }
      : {}),
    ...closeoutExecutionScopeFromAttempt(input.attempt),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    closeout_refs: [
      `opl://stage-attempts/${encodeURIComponent(stageAttemptId)}/runtime-blockers/${encodeURIComponent(input.blockedReason)}`,
    ],
    consumed_refs: [input.stagePacketRef],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [{
      surface_kind: 'opl_provider_runtime_typed_blocker_ref',
      blocker_id: input.blockedReason,
      stage_attempt_id: stageAttemptId,
      stage_id: stageId,
      ...(domainId ? { domain_id: domainId } : {}),
      owner: 'one-person-lab',
      reason: input.blockedReason,
      provider_completion_is_domain_ready: false,
      authority_boundary: {
        opl: 'provider_runtime_blocker_ref_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_create_domain_owner_receipt: false,
        can_create_domain_typed_blocker: false,
        can_authorize_quality_verdict: false,
        can_claim_domain_ready: false,
      },
    }],
    next_owner: domainId ?? null,
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      provider_blocker_reason: input.blockedReason,
      provider_blocker_surface: 'codex_stage_activity.process_output_summary',
      runtime_blocker_owner: 'one-person-lab',
      runtime_blocker_is_domain_owner_answer: false,
      provider_completion_is_domain_ready: false,
      ...(input.routeImpact ?? {}),
    },
    authority_boundary: {
      opl: 'provider_runtime_closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  });
}

export function summarizeCodexProviderErrors(errors?: CodexCommandResult['providerErrors'] | null) {
  const normalized = (errors ?? [])
    .filter((error) => error.message.trim().length > 0)
    .map((error) => ({
      message: error.message.trim(),
      statusCode: error.statusCode,
    }));
  return {
    count: normalized.length,
    statusCodes: [
      ...new Set(normalized
        .map((error) => error.statusCode)
        .filter((statusCode): statusCode is number => typeof statusCode === 'number')),
    ],
    messages: [
      ...new Set(normalized.map((error) => error.message)),
    ].slice(-3),
  };
}

export function providerBlockedReasonFrom(errors?: CodexCommandResult['providerErrors'] | null) {
  const messages = (errors ?? []).map((error) => error.message.trim());
  return messages.find((message) => message.startsWith('local_sandbox_')) ?? null;
}
