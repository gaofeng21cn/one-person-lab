import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../../kernel/contract-validation.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../../../kernel/runtime-state-paths.ts';
import { ACTIVE_SESSION_TTL_MS, MAX_FUTURE_SKEW_MS, TERMINAL_ACTIVITY_STATES } from './policy.ts';
import {
  activityKind,
  activityState,
  identityForItem,
  identityMismatches,
  normalizedIdentity,
  optionalString,
  requiredString,
} from './identity-admission.ts';
import {
  bindingId,
  buildReceipt,
  createBindingTable,
  ledgerPath,
  persistBinding,
  persistBindingEvent,
  readBinding,
  readWorkItemExecutionSessionBindings,
} from './activity-store.ts';
import type {
  ObserveWorkItemExecutionSessionInput,
  WorkItemExecutionSessionBinding,
} from './types.ts';
import type { WorkItemProjectionItem } from '../types.ts';

export function observeWorkItemExecutionSessionBinding(
  input: ObserveWorkItemExecutionSessionInput,
  options: {
    currentItem: WorkItemProjectionItem;
    dryRun?: boolean;
    now?: () => number;
  },
) {
  const now = options.now ?? Date.now;
  const nowMs = now();
  const identity = normalizedIdentity(input);
  const mismatches = identityMismatches(identityForItem(options.currentItem), identity);
  const requestedState = activityState(input.activity_state);
  const requestedKind = activityKind(input.activity_kind);
  const closesSession = TERMINAL_ACTIVITY_STATES.has(requestedState);
  const blockingIdentityMismatches = closesSession
    ? mismatches.filter((mismatch) => mismatch.field !== 'observed_generation')
    : mismatches;
  if (blockingIdentityMismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Execution session observation does not match the current canonical WorkItem identity.',
      {
        failure_code: 'work_item_execution_session_identity_mismatch',
        mismatches: blockingIdentityMismatches,
      },
    );
  }
  const executionSessionRef = requiredString(input.execution_session_ref, 'execution_session_ref');
  if (!/^codex:\/\/threads\/[0-9a-z-]+$/iu.test(executionSessionRef)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'execution_session_ref must use codex://threads/<thread-id>.',
      {
        action_id: 'work_item_execution_session_observe',
        execution_session_ref: executionSessionRef,
      },
    );
  }
  const kind = requestedKind;
  const state = requestedState;
  const observedAt = requiredString(input.observed_at, 'observed_at');
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs) || observedMs > nowMs + MAX_FUTURE_SKEW_MS) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'work_item_execution_session_observe received an invalid or future observed_at.',
      { action_id: 'work_item_execution_session_observe', observed_at: observedAt },
    );
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'work_item_execution_session_observe requires a non-negative integer sequence.',
      { action_id: 'work_item_execution_session_observe', sequence: input.sequence },
    );
  }
  const terminal = TERMINAL_ACTIVITY_STATES.has(state);
  const expiresAt = new Date(
    terminal ? observedMs : observedMs + ACTIVE_SESSION_TTL_MS,
  ).toISOString();
  if (!terminal && Date.parse(expiresAt) <= nowMs) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Active execution session observation is already expired.',
      { failure_code: 'work_item_execution_session_observation_expired', observed_at: observedAt },
    );
  }
  const recordedAt = new Date(nowMs).toISOString();
  const next: WorkItemExecutionSessionBinding = {
    binding_id: bindingId(executionSessionRef),
    execution_session_ref: executionSessionRef,
    identity,
    activity_kind: kind,
    activity_state: state,
    stage_attempt_id: null,
    workflow_id: null,
    observed_at: new Date(observedMs).toISOString(),
    ttl_ms: ACTIVE_SESSION_TTL_MS,
    expires_at: expiresAt,
    sequence: input.sequence,
    source_ref: optionalString(input.source_ref),
    recorded_at: recordedAt,
  };
  const validatePrevious = (previous: WorkItemExecutionSessionBinding | null) => {
    if (!previous) {
      if (closesSession) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'A terminal coordination observation must close an existing binding.',
          {
            failure_code: 'work_item_execution_session_terminal_without_binding',
            execution_session_ref: executionSessionRef,
          },
        );
      }
      return null;
    }
    const drift = identityMismatches(previous.identity, next.identity);
    const blockingDrift = closesSession
      ? drift.filter((mismatch) => mismatch.field !== 'observed_generation')
      : drift;
    if (
      blockingDrift.length > 0
      || previous.activity_kind !== next.activity_kind
      || previous.stage_attempt_id !== next.stage_attempt_id
      || previous.workflow_id !== next.workflow_id
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Execution session is already bound to a different WorkItem or activity role.',
        {
          failure_code: 'work_item_execution_session_binding_conflict',
          execution_session_ref: executionSessionRef,
        },
      );
    }
    if (
      next.sequence < previous.sequence
      || Date.parse(next.observed_at) < Date.parse(previous.observed_at)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Execution session observation regressed sequence or observed_at.',
        {
          failure_code: 'work_item_execution_session_observation_regressed',
          execution_session_ref: executionSessionRef,
        },
      );
    }
    if (next.sequence === previous.sequence) {
      const comparable = (binding: WorkItemExecutionSessionBinding) => ({
        ...binding,
        recorded_at: null,
      });
      if (canonicalJsonText(comparable(previous)) !== canonicalJsonText(comparable(next))) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Execution session sequence is already bound to a different observation.',
          {
            failure_code: 'work_item_execution_session_sequence_conflict',
            execution_session_ref: executionSessionRef,
          },
        );
      }
      return buildReceipt(previous, 'unchanged');
    }
    if (TERMINAL_ACTIVITY_STATES.has(previous.activity_state)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'A terminal execution session binding cannot become active again.',
        {
          failure_code: 'work_item_execution_session_terminal_reactivation',
          execution_session_ref: executionSessionRef,
        },
      );
    }
    return null;
  };
  if (options.dryRun) {
    const previous =
      readWorkItemExecutionSessionBindings({ executionSessionRef }).bindings[0] ?? null;
    return validatePrevious(previous) ?? buildReceipt(next, 'dry_run');
  }
  const paths = ensureOplStateDir(resolveOplStatePaths());
  fs.mkdirSync(paths.state_dir, { recursive: true });
  const db = new DatabaseSync(ledgerPath());
  try {
    createBindingTable(db);
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = readBinding(db, executionSessionRef);
      const unchanged = validatePrevious(previous);
      if (unchanged) {
        db.exec('COMMIT');
        return unchanged;
      }
      persistBindingEvent(db, next);
      persistBinding(db, next);
      db.exec('COMMIT');
      return buildReceipt(next, 'applied');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}
