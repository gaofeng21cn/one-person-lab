import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  DIGEST_PATTERN,
  exactKeys,
  fail,
  schemaValidationRecord,
  text,
  validateRunId,
} from './fields.ts';
import { expectedExecutionBindingRef } from './plan.ts';
import type {
  StandardAgentActionRunBinding,
  StandardAgentActionRunPlan,
  StandardAgentActionRunCompletion,
  StandardAgentCompletedHandlerReplay,
} from './types.ts';

function completedHandlerReplayRecord(value: unknown): StandardAgentCompletedHandlerReplay | null {
  if (value === null) return null;
  if (!isRecord(value)) fail('Standard Agent completed Handler replay metadata must be an object or null.');
  exactKeys(value, [
    'accepted_domain_ids',
    'request_payload_sha256',
    'package_use_binding',
    'input_schema_ref',
    'input_schema_validation',
    'output_schema_validation',
  ], 'Standard Agent completed Handler replay metadata');
  const acceptedDomainIds = Array.isArray(value.accepted_domain_ids)
    ? value.accepted_domain_ids.map((entry) => text(entry, 'completed_handler_replay.accepted_domain_ids'))
    : fail('completed_handler_replay.accepted_domain_ids must be an array.');
  const canonicalDomainIds = [...new Set(acceptedDomainIds)].sort();
  if (
    canonicalDomainIds.length === 0
    || canonicalJsonText(acceptedDomainIds) !== canonicalJsonText(canonicalDomainIds)
    || typeof value.request_payload_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_payload_sha256)
    || (value.package_use_binding !== null && !isRecord(value.package_use_binding))
    || !isRecord(value.input_schema_validation)
    || !isRecord(value.output_schema_validation)
  ) {
    fail('Standard Agent completed Handler replay metadata is invalid.');
  }
  return {
    accepted_domain_ids: canonicalDomainIds,
    request_payload_sha256: value.request_payload_sha256,
    package_use_binding: value.package_use_binding as Record<string, unknown> | null,
    input_schema_ref: text(value.input_schema_ref, 'completed_handler_replay.input_schema_ref'),
    input_schema_validation: schemaValidationRecord(
      value.input_schema_validation,
      'completed_handler_replay.input_schema_validation',
    ),
    output_schema_validation: schemaValidationRecord(
      value.output_schema_validation,
      'completed_handler_replay.output_schema_validation',
    ),
  };
}

export function assertCompletionMatchesRunState(input: {
  binding: StandardAgentActionRunBinding;
  plan: StandardAgentActionRunPlan | null;
  completion: StandardAgentActionRunCompletion;
}) {
  const { binding, plan, completion } = input;
  if (
    binding.run_id !== completion.run_id
    || binding.canonical_domain_id !== completion.canonical_domain_id
    || binding.action_id !== completion.action_id
    || binding.hosted_runtime_binding_ref !== completion.hosted_runtime_binding_ref
  ) {
    fail('Action run completion conflicts with its frozen runtime binding.', { run_id: completion.run_id });
  }
  if (!plan) return;
  const replay = completion.completed_handler_replay;
  const selectedAction = plan.catalog.actions.find((entry) => entry.action_id === plan.action_id)
    ?? fail('Standard Agent action run plan is missing its selected action.');
  if (
    plan.execution_kind !== completion.execution_kind
    || plan.request_sha256 !== completion.request_sha256
    || plan.request_byte_size !== completion.request_byte_size
    || expectedExecutionBindingRef(plan) !== completion.binding_ref
    || (completion.execution_kind === 'handler_ref' && completion.status === 'completed' && (
      !replay
      || canonicalJsonText(replay.accepted_domain_ids) !== canonicalJsonText(plan.accepted_domain_ids)
      || replay.request_payload_sha256 !== plan.request_payload_sha256
      || canonicalJsonText(replay.package_use_binding) !== canonicalJsonText(plan.package_use_binding)
      || canonicalJsonText(replay.input_schema_validation) !== canonicalJsonText(plan.input_schema_validation)
      || replay.input_schema_ref !== selectedAction.input_schema_ref
      || replay.output_schema_validation.schema_ref !== selectedAction.output_schema_ref
    ))
  ) {
    fail('Action run completion conflicts with its frozen durable plan.', { run_id: completion.run_id });
  }
}

function sandboxRecord(value: unknown) {
  if (!isRecord(value)) fail('completion.sandbox must be an object.');
  exactKeys(value, ['runtime_kind', 'sandbox_kind', 'exit_code', 'timed_out'], 'completion.sandbox');
  if (
    !['node_permission_model', 'python_audit_hook'].includes(String(value.runtime_kind))
    || !['macos_sandbox_exec', 'linux_runtime_guard_only'].includes(String(value.sandbox_kind))
    || !Number.isSafeInteger(value.exit_code)
    || typeof value.timed_out !== 'boolean'
  ) {
    fail('Standard Agent action run completion sandbox is invalid.');
  }
  return {
    runtime_kind: value.runtime_kind as 'node_permission_model' | 'python_audit_hook',
    sandbox_kind: value.sandbox_kind as 'macos_sandbox_exec' | 'linux_runtime_guard_only',
    exit_code: Number(value.exit_code),
    timed_out: value.timed_out,
  };
}

function errorRecord(value: unknown) {
  if (!isRecord(value)) fail('completion.error must be an object.');
  exactKeys(value, ['error_code', 'message', 'details'], 'completion.error');
  if (!isRecord(value.details)) fail('completion.error.details must be an object.');
  return {
    error_code: text(value.error_code, 'completion.error.error_code'),
    message: text(value.message, 'completion.error.message'),
    details: value.details,
  };
}

export function completionRecord(value: Record<string, unknown>): StandardAgentActionRunCompletion {
  exactKeys(value, [
    'surface_kind',
    'version',
    'run_id',
    'canonical_domain_id',
    'action_id',
    'execution_kind',
    'status',
    'failure_disposition',
    'binding_ref',
    'hosted_runtime_binding_ref',
    'request_sha256',
    'request_byte_size',
    'output_sha256',
    'output_byte_size',
    'sandbox',
    'error',
    'completed_handler_replay',
  ], 'Standard Agent action run completion');
  const completedHandlerReplay = completedHandlerReplayRecord(value.completed_handler_replay);
  const executionKind = value.execution_kind;
  const status = value.status;
  const validStatus = executionKind === 'handler_ref'
    ? status === 'completed' || status === 'failed'
    : executionKind === 'stage_binding'
      ? status === 'started' || status === 'blocked' || status === 'failed'
      : executionKind === 'foundry_binding'
        ? status === 'started' || status === 'failed'
        : false;
  const sandbox = value.sandbox === null ? null : sandboxRecord(value.sandbox);
  const error = value.error === null ? null : errorRecord(value.error);
  if (
    value.surface_kind !== 'opl_standard_agent_action_run_completion'
    || value.version !== 'opl-standard-agent-action-run-completion.v1'
    || !validStatus
    || (value.failure_disposition !== null && value.failure_disposition !== 'permanent')
    || typeof value.request_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.request_sha256)
    || !Number.isSafeInteger(value.request_byte_size)
    || Number(value.request_byte_size) < 1
    || typeof value.output_sha256 !== 'string'
    || !DIGEST_PATTERN.test(value.output_sha256)
    || !Number.isSafeInteger(value.output_byte_size)
    || Number(value.output_byte_size) < 1
    || (status === 'failed' && (value.failure_disposition !== 'permanent' || error === null))
    || (status !== 'failed' && (value.failure_disposition !== null || error !== null))
    || (executionKind !== 'handler_ref' && sandbox !== null)
    || (
      executionKind === 'handler_ref'
      && status === 'completed'
      && (
        completedHandlerReplay === null
        || sandbox === null
        || sandbox.exit_code !== 0
        || sandbox.timed_out
      )
    )
    || (
      (executionKind !== 'handler_ref' || status !== 'completed')
      && completedHandlerReplay !== null
    )
  ) {
    fail('Standard Agent action run completion is invalid.');
  }
  const runId = text(value.run_id, 'completion.run_id');
  validateRunId(runId);
  return {
    surface_kind: 'opl_standard_agent_action_run_completion',
    version: 'opl-standard-agent-action-run-completion.v1',
    run_id: runId,
    canonical_domain_id: text(value.canonical_domain_id, 'completion.canonical_domain_id'),
    action_id: text(value.action_id, 'completion.action_id'),
    execution_kind: executionKind as StandardAgentActionRunCompletion['execution_kind'],
    status: status as StandardAgentActionRunCompletion['status'],
    failure_disposition: value.failure_disposition as 'permanent' | null,
    binding_ref: text(value.binding_ref, 'completion.binding_ref'),
    hosted_runtime_binding_ref: text(
      value.hosted_runtime_binding_ref,
      'completion.hosted_runtime_binding_ref',
    ),
    request_sha256: value.request_sha256,
    request_byte_size: Number(value.request_byte_size),
    output_sha256: value.output_sha256,
    output_byte_size: Number(value.output_byte_size),
    sandbox,
    error,
    completed_handler_replay: completedHandlerReplay,
  };
}
