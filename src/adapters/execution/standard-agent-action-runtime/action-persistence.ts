import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord, type ErrorCode } from '../../../kernel/contract-validation.ts';
import {
  commitStandardAgentActionOutput,
  inspectStandardAgentActionRunOutput,
} from '../../../authority/workspace/public/standard-agent-action-runtime.ts';
import { openQueueDb } from '../family-runtime-store.ts';
import {
  commitStandardAgentActionRunCompletion,
  type StandardAgentCompletedHandlerReplay,
  type StandardAgentActionRunCompletion,
} from '../standard-agent-action-run-state.ts';
import { recordStandardAgentActionRunEvent } from '../standard-agent-action-run-recorder.ts';
import { fail } from './shared.ts';

export function storedBytesRef(value: { ref: string; sha256: string; byte_size: number }) {
  return { ref: value.ref, sha256: value.sha256, byte_size: value.byte_size };
}

export function actionLedger(input: {
  runId: string;
  domainId: string;
  actionId: string;
  bindingRef: string;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  startedAt: string;
  recordedAt: string;
  stored: ReturnType<typeof commitStandardAgentActionOutput>;
}) {
  const { db } = openQueueDb();
  try {
    return recordStandardAgentActionRunEvent({
      db,
      runId: input.runId,
      domainId: input.domainId,
      actionId: input.actionId,
      bindingRef: input.bindingRef,
      status: input.status,
      startedAt: input.startedAt,
      recordedAt: input.recordedAt,
      input: storedBytesRef(input.stored.request),
      output: storedBytesRef(input.stored.output),
    });
  } finally {
    db.close();
  }
}

export function failureBytes(error: unknown) {
  return canonicalJsonBytes({
    surface_kind: 'opl_standard_agent_action_failure',
    version: 'opl-standard-agent-action-failure.v1',
    error_code: error instanceof FrameworkContractError ? error.code : 'standard_agent_action_failed',
    message: error instanceof Error ? error.message : String(error),
    details: error instanceof FrameworkContractError ? error.details : {},
  });
}

export function observationFailure(error: unknown) {
  return {
    error_code: error instanceof FrameworkContractError ? error.code : 'standard_agent_action_observation_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function persistedError(error: unknown) {
  return {
    error_code: error instanceof FrameworkContractError ? error.code : 'standard_agent_action_failed',
    message: error instanceof Error ? error.message : String(error),
    details: error instanceof FrameworkContractError ? error.details ?? {} : {},
  };
}

export function persistedFrameworkErrorCode(value: string): ErrorCode {
  const supported: ErrorCode[] = [
    'contract_file_missing',
    'contract_json_invalid',
    'contract_shape_invalid',
    'build_command_failed',
    'launcher_failed',
    'workstream_not_found',
    'domain_not_found',
    'surface_not_found',
    'missing_family_action_catalog',
    'missing_family_stage_control_plane',
    'framework_locator_invalid_root',
    'framework_locator_not_found',
    'runtime_state_lock_timeout',
    'managed_update_lock_contention',
    'cli_usage_error',
    'unknown_command',
    'codex_command_failed',
  ];
  return supported.includes(value as ErrorCode) ? value as ErrorCode : 'contract_shape_invalid';
}

export function completionBase(input: {
  runId: string;
  domainId: string;
  actionId: string;
  executionKind: StandardAgentActionRunCompletion['execution_kind'];
  status: StandardAgentActionRunCompletion['status'];
  bindingRef: string;
  runtimeBindingRef: string;
  stored: ReturnType<typeof commitStandardAgentActionOutput>;
}): Omit<
  StandardAgentActionRunCompletion,
  'failure_disposition' | 'sandbox' | 'error' | 'completed_handler_replay'
> {
  return {
    surface_kind: 'opl_standard_agent_action_run_completion',
    version: 'opl-standard-agent-action-run-completion.v1',
    run_id: input.runId,
    canonical_domain_id: input.domainId,
    action_id: input.actionId,
    execution_kind: input.executionKind,
    status: input.status,
    binding_ref: input.bindingRef,
    hosted_runtime_binding_ref: input.runtimeBindingRef,
    request_sha256: input.stored.request.sha256,
    request_byte_size: input.stored.request.byte_size,
    output_sha256: input.stored.output.sha256,
    output_byte_size: input.stored.output.byte_size,
  };
}

export function persistCompletion(
  workspaceRoot: string,
  completion: StandardAgentActionRunCompletion,
) {
  return commitStandardAgentActionRunCompletion({ workspaceRoot, completion }).completion;
}

export function assertCompletionMatchesStored(
  completion: StandardAgentActionRunCompletion,
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>,
) {
  if (
    completion.request_sha256 !== stored.request.sha256
    || completion.request_byte_size !== stored.request.byte_size
    || completion.output_sha256 !== stored.output.sha256
    || completion.output_byte_size !== stored.output.byte_size
  ) {
    fail('Standard Agent action completion does not match the persisted request or output bytes.', {
      run_id: completion.run_id,
    });
  }
}

export function completedHandlerReplay(input: {
  acceptedDomainIds: readonly string[];
  requestPayloadSha256: string;
  packageUseBinding: unknown;
  inputSchemaRef: string;
  inputSchemaValidation: Record<string, unknown>;
  outputSchemaValidation: Record<string, unknown>;
}): StandardAgentCompletedHandlerReplay {
  if (input.packageUseBinding !== null && !isRecord(input.packageUseBinding)) {
    fail('Completed Handler replay package-use binding must be an object or null.');
  }
  return {
    accepted_domain_ids: [...new Set(input.acceptedDomainIds.map((value) => value.trim()).filter(Boolean))].sort(),
    request_payload_sha256: input.requestPayloadSha256,
    package_use_binding: input.packageUseBinding as Record<string, unknown> | null,
    input_schema_ref: input.inputSchemaRef,
    input_schema_validation: input.inputSchemaValidation,
    output_schema_validation: input.outputSchemaValidation,
  };
}

export function throwPersistedFailure(
  completion: StandardAgentActionRunCompletion,
  stored: NonNullable<ReturnType<typeof inspectStandardAgentActionRunOutput>>,
): never {
  const error = completion.error ?? {
    error_code: 'contract_shape_invalid',
    message: 'Standard Agent action failed permanently.',
    details: {},
  };
  throw new FrameworkContractError(persistedFrameworkErrorCode(error.error_code), error.message, {
    ...error.details,
    persisted_error_code: error.error_code,
    action_run_ref: stored.action_run_ref,
    request_ref: stored.request.ref,
    output_ref: stored.output.ref,
    failure_disposition: 'permanent',
  });
}

export function assertCompletionIdentity(input: {
  completion: StandardAgentActionRunCompletion;
  runId: string;
  domainId: string;
  actionId: string;
  executionKind: StandardAgentActionRunCompletion['execution_kind'];
  bindingRef: string;
  runtimeBindingRef: string;
}) {
  const completion = input.completion;
  if (
    completion.run_id !== input.runId
    || completion.canonical_domain_id !== input.domainId
    || completion.action_id !== input.actionId
    || completion.execution_kind !== input.executionKind
    || completion.binding_ref !== input.bindingRef
    || completion.hosted_runtime_binding_ref !== input.runtimeBindingRef
  ) {
    fail('Standard Agent action completion conflicts with its frozen run identity.', {
      run_id: input.runId,
    });
  }
}

export function unknownSuccess(error: unknown, input: {
  runId: string;
  actionRunRef: string;
  requestRef: string;
  runtimeBindingRef: string;
}): never {
  throw new FrameworkContractError(
    error instanceof FrameworkContractError ? error.code : 'contract_shape_invalid',
    error instanceof Error ? error.message : String(error),
    {
      ...(error instanceof FrameworkContractError ? error.details : {}),
      run_id: input.runId,
      action_run_ref: input.actionRunRef,
      request_ref: input.requestRef,
      hosted_runtime_binding_ref: input.runtimeBindingRef,
      failure_disposition: 'unknown_success',
      same_run_retry_required: true,
    },
  );
}

export function wrapFailure(error: unknown, stored: ReturnType<typeof commitStandardAgentActionOutput>): never {
  throw new FrameworkContractError(
    error instanceof FrameworkContractError ? error.code : 'contract_shape_invalid',
    error instanceof Error ? error.message : String(error),
    {
      ...(error instanceof FrameworkContractError ? error.details : {}),
      action_run_ref: stored.action_run_ref,
      request_ref: stored.request.ref,
      output_ref: stored.output.ref,
    },
  );
}
