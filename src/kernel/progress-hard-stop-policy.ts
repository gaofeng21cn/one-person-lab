export type RuntimeHardStopClass =
  | 'safety_or_compliance'
  | 'permission_or_credential_boundary'
  | 'human_decision_required'
  | 'authority_boundary_violation'
  | 'stale_or_mismatched_stage_identity';

const HARD_STOP_REASON_EXACT = new Map<string, RuntimeHardStopClass>([
  ['codex_cli_activity_cancelled', 'human_decision_required'],
  ['codex_cli_provider_unavailable', 'permission_or_credential_boundary'],
  ['codex_cli_workspace_root_missing', 'permission_or_credential_boundary'],
  ['checkout_ahead_of_target', 'stale_or_mismatched_stage_identity'],
  ['dirty_checkout', 'stale_or_mismatched_stage_identity'],
  ['diverged_checkout', 'stale_or_mismatched_stage_identity'],
  ['fast_forward_failed', 'stale_or_mismatched_stage_identity'],
  ['git_fetch_failed', 'stale_or_mismatched_stage_identity'],
  ['git_head_unreadable', 'stale_or_mismatched_stage_identity'],
  ['git_status_unreadable', 'stale_or_mismatched_stage_identity'],
  ['local_sandbox_workspace_transport_missing', 'permission_or_credential_boundary'],
  ['operator_cancel_requested', 'human_decision_required'],
  ['temporal_workflow_canceled', 'human_decision_required'],
  ['typed_closeout_stage_attempt_id_mismatch', 'stale_or_mismatched_stage_identity'],
  ['target_ref_unreadable', 'stale_or_mismatched_stage_identity'],
  ['artifact_byte_identity_mismatch', 'stale_or_mismatched_stage_identity'],
  ['artifact_ref_unreadable', 'stale_or_mismatched_stage_identity'],
]);

const HARD_STOP_REASON_PARTS: ReadonlyArray<readonly [string, RuntimeHardStopClass]> = [
  ['authority_violation', 'authority_boundary_violation'],
  ['closure_changed', 'stale_or_mismatched_stage_identity'],
  ['credential', 'permission_or_credential_boundary'],
  ['currentness_identity', 'stale_or_mismatched_stage_identity'],
  ['executor_unavailable', 'permission_or_credential_boundary'],
  ['forbidden_write', 'authority_boundary_violation'],
  ['human_decision', 'human_decision_required'],
  ['human_gate', 'human_decision_required'],
  ['identity_mismatch', 'stale_or_mismatched_stage_identity'],
  ['irreversible', 'human_decision_required'],
  ['permission', 'permission_or_credential_boundary'],
  ['pinned_closure', 'stale_or_mismatched_stage_identity'],
  ['security', 'safety_or_compliance'],
  ['unsafe', 'safety_or_compliance'],
  ['wrong_checkout', 'stale_or_mismatched_stage_identity'],
  ['wrong_target', 'stale_or_mismatched_stage_identity'],
];

export function runtimeHardStopClassForReason(
  reason: string | null | undefined,
): RuntimeHardStopClass | null {
  const normalized = reason?.trim().toLowerCase();
  if (!normalized) return null;
  return HARD_STOP_REASON_EXACT.get(normalized)
    ?? HARD_STOP_REASON_PARTS.find(([part]) => normalized.includes(part))?.[1]
    ?? null;
}

export function isRuntimeHardStopReason(reason: string | null | undefined) {
  return runtimeHardStopClassForReason(reason) !== null;
}
