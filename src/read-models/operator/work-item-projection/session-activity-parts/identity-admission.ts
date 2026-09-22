import { FrameworkContractError } from '../../../../kernel/contract-validation.ts';
import { stringValue } from '../../../../kernel/json-record.ts';
import type { WorkItemProjectionItem } from '../types.ts';
import { TERMINAL_ACTIVITY_STATES } from './policy.ts';
import type {
  ObserveWorkItemExecutionSessionInput,
  WorkItemExecutionSessionIdentity,
  WorkItemSessionActivityKind,
  WorkItemSessionActivityState,
} from './types.ts';

export function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `work_item_execution_session_observe requires payload.${field}.`,
      { action_id: 'work_item_execution_session_observe', required_field: field },
    );
  }
  const normalized = value.trim();
  if (normalized.length > 2048 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `work_item_execution_session_observe received an invalid ${field}.`,
      { action_id: 'work_item_execution_session_observe', field },
    );
  }
  return normalized;
}

export function optionalString(value: unknown) {
  return value === undefined || value === null
    ? null
    : requiredString(value, 'optional_identity_field');
}

export function activityKind(value: unknown): WorkItemSessionActivityKind {
  if (value === undefined || value === null || value === '') return 'coordination';
  if (value === 'coordination') return value;
  throw new FrameworkContractError(
    'cli_usage_error',
    'work_item_execution_session_observe records coordination only; controlled execution is derived from StageAttempt runtime evidence.',
    { action_id: 'work_item_execution_session_observe', allowed_activity_kinds: ['coordination'] },
  );
}

export function activityState(value: unknown): WorkItemSessionActivityState {
  if (
    value === 'running'
    || value === 'waiting'
    || value === 'completed'
    || value === 'failed'
    || value === 'cancelled'
  ) {
    return value;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'work_item_execution_session_observe received an unsupported activity_state.',
    {
      action_id: 'work_item_execution_session_observe',
      allowed_activity_states: ['running', 'waiting', 'completed', 'failed', 'cancelled'],
    },
  );
}

export function normalizedIdentity(
  input: ObserveWorkItemExecutionSessionInput,
): WorkItemExecutionSessionIdentity {
  return {
    agent_id: requiredString(input.agent_id, 'agent_id'),
    project_id: requiredString(input.project_id, 'project_id'),
    project_scope_id: requiredString(input.project_scope_id, 'project_scope_id'),
    work_item_id: requiredString(input.work_item_id, 'work_item_id'),
    work_item_scope_id: requiredString(input.work_item_scope_id, 'work_item_scope_id'),
    workspace_binding_id: requiredString(input.workspace_binding_id, 'workspace_binding_id'),
    observed_generation: requiredString(input.observed_generation, 'observed_generation'),
  };
}

export function identityForItem(item: WorkItemProjectionItem): WorkItemExecutionSessionIdentity {
  return {
    agent_id: item.identity.agent_id,
    project_id: item.identity.project_id,
    project_scope_id: item.identity.project_scope_id,
    work_item_id: item.identity.work_item_id,
    work_item_scope_id: item.identity.work_item_scope_id,
    workspace_binding_id: item.identity.workspace_binding_id,
    observed_generation: item.lifecycle.observed_generation,
  };
}

export function identityMismatches(
  expected: WorkItemExecutionSessionIdentity,
  actual: WorkItemExecutionSessionIdentity,
) {
  type IdentityMismatch = {
    field: keyof WorkItemExecutionSessionIdentity;
    expected: string | null;
    actual: string | null;
  };
  const fields = [
    'agent_id',
    'project_id',
    'project_scope_id',
    'work_item_id',
    'work_item_scope_id',
    'workspace_binding_id',
    'observed_generation',
  ] as const;
  const mismatches: IdentityMismatch[] = fields.flatMap((field) =>
    expected[field] === actual[field]
      ? []
      : [{ field, expected: expected[field], actual: actual[field] }],
  );
  return mismatches;
}

export function resolveWorkItemExecutionSessionObservationTarget(
  items: WorkItemProjectionItem[],
  input: ObserveWorkItemExecutionSessionInput,
) {
  const requestedIdentity = normalizedIdentity(input);
  const closesSession = TERMINAL_ACTIVITY_STATES.has(activityState(input.activity_state));
  const matches = items.filter((item) => {
    const mismatches = identityMismatches(identityForItem(item), requestedIdentity);
    return mismatches.every(
      (mismatch) => closesSession && mismatch.field === 'observed_generation',
    );
  });
  if (matches.length !== 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Execution session observation must resolve exactly one current WorkItem by its full identity.',
      {
        failure_code:
          matches.length === 0
            ? 'work_item_execution_session_target_missing'
            : 'work_item_execution_session_target_ambiguous',
        identity: requestedIdentity,
        terminal_generation_drift_allowed: closesSession,
        match_count: matches.length,
      },
    );
  }
  return matches[0]!;
}
