import { stringValue } from '../../../../kernel/json-record.ts';
import type {
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
} from '../types.ts';
import { identityForItem, identityMismatches } from './identity-admission.ts';
import {
  ACTIVE_SESSION_MAX_TTL_MS,
  ACTIVE_SESSION_REF_LIMIT,
  MAX_FUTURE_SKEW_MS,
  STALE_SESSION_GRACE_MS,
  TERMINAL_ACTIVITY_STATES,
} from './policy.ts';
import type { WorkItemExecutionSessionBinding } from './types.ts';

function sessionRunningProofBlockReason(
  item: WorkItemProjectionItem,
  binding: WorkItemExecutionSessionBinding,
) {
  if (binding.activity_kind !== 'controlled_execution')
    return 'coordination_activity_is_not_execution_proof';
  if (binding.activity_state !== 'running') return 'controlled_execution_session_is_not_running';
  if (item.attention.kind === 'user' || item.execution.stage_status === 'human_gate') {
    return 'human_gate_has_precedence';
  }
  if (item.lifecycle.business_state !== 'active') {
    return `business_lifecycle_${item.lifecycle.business_state}_has_precedence`;
  }
  if (!item.execution.attempt_id || binding.stage_attempt_id !== item.execution.attempt_id) {
    return 'controlled_session_stage_attempt_is_not_current';
  }
  if (!item.execution.workflow_id || binding.workflow_id !== item.execution.workflow_id) {
    return 'controlled_session_workflow_is_not_current';
  }
  if (['succeeded', 'failed', 'idle'].includes(item.execution.state)) {
    return 'canonical_stage_attempt_is_terminal_or_idle';
  }
  return null;
}

function activityLabelKey(activeCount: number, controlledCount: number, stale: boolean) {
  if (activeCount > 0 && controlledCount > 0)
    return 'runtimeSessionActivity.activeControlledExecution';
  if (activeCount > 0) return 'runtimeSessionActivity.activeCoordination';
  return stale ? 'runtimeSessionActivity.stale' : 'runtimeSessionActivity.inactive';
}

function activitySource(bindings: WorkItemExecutionSessionBinding[]) {
  const hasControlled = bindings.some(
    (binding) => binding.activity_kind === 'controlled_execution',
  );
  const hasCoordination = bindings.some((binding) => binding.activity_kind === 'coordination');
  if (hasControlled && hasCoordination) return 'opl_combined_work_item_session_activity' as const;
  if (hasControlled) return 'opl_stage_attempt_execution_session_binding' as const;
  return 'opl_work_item_execution_session_binding_ledger' as const;
}

function bindingIsWithinRetentionWindow(binding: WorkItemExecutionSessionBinding, nowMs: number) {
  const observedMs = Date.parse(binding.observed_at);
  const expiresMs = Date.parse(binding.expires_at);
  if (!Number.isFinite(observedMs) || !Number.isFinite(expiresMs)) return false;
  if (TERMINAL_ACTIVITY_STATES.has(binding.activity_state)) {
    return observedMs >= nowMs - ACTIVE_SESSION_MAX_TTL_MS;
  }
  return expiresMs >= nowMs - STALE_SESSION_GRACE_MS;
}

export function joinSessionActivityToWorkItems(input: {
  items: WorkItemProjectionItem[];
  bindings: WorkItemExecutionSessionBinding[];
  sourceRef: string;
  now?: () => number;
}) {
  const nowMs = (input.now ?? Date.now)();
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const bindingsByItem = new Map<string, WorkItemExecutionSessionBinding[]>();
  for (const binding of input.bindings) {
    const candidates = input.items.filter(
      (item) => identityMismatches(identityForItem(item), binding.identity).length === 0,
    );
    const item = candidates.length === 1 ? candidates[0]! : null;
    if (!item) {
      const sameLocalIdentity = input.items.filter(
        (candidate) =>
          candidate.identity.agent_id === binding.identity.agent_id
          && candidate.identity.project_id === binding.identity.project_id
          && candidate.identity.work_item_id === binding.identity.work_item_id,
      );
      if (candidates.length === 0 && sameLocalIdentity.length > 0) {
        diagnostics.push({
          reason: 'work_item_execution_session_binding_not_current',
          agent_id: binding.identity.agent_id,
          project_id: binding.identity.project_id,
          work_item_id: binding.identity.work_item_id,
          ref: binding.execution_session_ref,
          details: {
            mismatches: sameLocalIdentity.flatMap((candidate) =>
              identityMismatches(identityForItem(candidate), binding.identity),
            ),
          },
        });
        continue;
      }
      diagnostics.push({
        reason: 'work_item_execution_session_identity_not_in_current_inventory',
        agent_id: binding.identity.agent_id,
        project_id: binding.identity.project_id,
        work_item_id: binding.identity.work_item_id,
        ref: binding.execution_session_ref,
      });
      continue;
    }
    bindingsByItem.set(item.item_id, [...(bindingsByItem.get(item.item_id) ?? []), binding]);
  }

  const items = input.items.map((item) => {
    const ordered = [...(bindingsByItem.get(item.item_id) ?? [])].sort(
      (left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at),
    );
    const bindingByRef = new Map<string, WorkItemExecutionSessionBinding>();
    for (const binding of ordered) {
      const existing = bindingByRef.get(binding.execution_session_ref);
      if (
        !existing
        || (binding.activity_kind === 'controlled_execution'
          && existing.activity_kind !== 'controlled_execution')
      ) {
        bindingByRef.set(binding.execution_session_ref, binding);
      }
    }
    const matched = [...bindingByRef.values()].sort(
      (left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at),
    );
    const withinWindow = matched.filter((binding) =>
      bindingIsWithinRetentionWindow(binding, nowMs),
    );
    const latest = withinWindow[0] ?? null;
    const boundedNonterminal = withinWindow
      .filter((binding) => !TERMINAL_ACTIVITY_STATES.has(binding.activity_state))
      .sort(
        (left, right) =>
          Number(right.activity_kind === 'controlled_execution')
            - Number(left.activity_kind === 'controlled_execution')
          || Date.parse(right.observed_at) - Date.parse(left.observed_at),
      )
      .slice(0, ACTIVE_SESSION_REF_LIMIT)
      .sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at));
    const retained =
      latest && TERMINAL_ACTIVITY_STATES.has(latest.activity_state)
        ? [...boundedNonterminal, latest]
        : boundedNonterminal;
    const active = retained.filter(
      (binding) =>
        !TERMINAL_ACTIVITY_STATES.has(binding.activity_state)
        && Date.parse(binding.observed_at) <= nowMs + MAX_FUTURE_SKEW_MS
        && Date.parse(binding.expires_at) > nowMs,
    );
    const stale =
      active.length === 0
      && boundedNonterminal.some(
        (binding) =>
          !TERMINAL_ACTIVITY_STATES.has(binding.activity_state)
          && Date.parse(binding.expires_at) <= nowMs
          && nowMs - Date.parse(binding.expires_at) <= STALE_SESSION_GRACE_MS,
      );
    const activeControlled = active.filter(
      (binding) => binding.activity_kind === 'controlled_execution',
    );
    const eligible =
      activeControlled.find((binding) => sessionRunningProofBlockReason(item, binding) === null)
      ?? null;
    const blockedReason = eligible
      ? null
      : active[0]
        ? sessionRunningProofBlockReason(item, active[0])
        : null;
    const execution =
      eligible && ['queued', 'unknown'].includes(item.execution.state)
        ? {
            ...item.execution,
            state: 'running' as const,
            stage_status: 'running',
            last_heartbeat_at: eligible.observed_at,
            updated_at: eligible.observed_at,
            running_proof_status: 'running_confirmed',
            diagnostic_reason: null,
          }
        : item.execution;
    const activeRefs = active
      .map((binding) => binding.execution_session_ref)
      .slice(0, ACTIVE_SESSION_REF_LIMIT);
    const nonterminalRefs = boundedNonterminal
      .map((binding) => binding.execution_session_ref)
      .slice(0, ACTIVE_SESSION_REF_LIMIT);
    const sequenceByRef = new Map(
      boundedNonterminal.map((binding) => [binding.execution_session_ref, binding.sequence]),
    );
    return {
      ...item,
      execution,
      session_activity: {
        state: active.length > 0 ? 'active' : stale ? 'stale' : 'inactive',
        active_session_count: active.length,
        coordination_session_count: active.filter(
          (binding) => binding.activity_kind === 'coordination',
        ).length,
        controlled_execution_session_count: activeControlled.length,
        active_session_refs: activeRefs,
        nonterminal_session_refs: nonterminalRefs,
        session_sequences: Object.fromEntries(
          nonterminalRefs.map((ref) => [ref, sequenceByRef.get(ref)!]),
        ),
        latest_session_ref: latest?.execution_session_ref ?? null,
        latest_activity_kind: latest?.activity_kind ?? null,
        latest_activity_state: latest?.activity_state ?? null,
        latest_activity_at: latest?.observed_at ?? null,
        fresh_until: latest?.expires_at ?? null,
        label_key: activityLabelKey(active.length, activeControlled.length, stale),
        label_args: { active_session_count: active.length },
        source: activitySource(retained),
        can_affect_execution: Boolean(eligible),
        execution_effect_reason: eligible
          ? 'fresh_controlled_execution_matches_current_attempt'
          : blockedReason,
      },
      source_refs:
        retained.length > 0
          ? [
              ...item.source_refs,
              ...[...new Set(retained.map((binding) => binding.source_ref ?? input.sourceRef))].map(
                (ref) => ({
                  ref_kind: 'sqlite' as const,
                  ref,
                  role: 'work_item_execution_session_activity',
                }),
              ),
            ]
          : item.source_refs,
    };
  });
  return { items, diagnostics };
}
