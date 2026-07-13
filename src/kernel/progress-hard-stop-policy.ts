const HARD_STOP_REASON_EXACT = new Set([
  'codex_cli_activity_cancelled',
  'codex_cli_provider_unavailable',
  'codex_cli_workspace_root_missing',
  'checkout_ahead_of_target',
  'dirty_checkout',
  'diverged_checkout',
  'fast_forward_failed',
  'git_fetch_failed',
  'git_head_unreadable',
  'git_status_unreadable',
  'local_sandbox_workspace_transport_missing',
  'operator_cancel_requested',
  'temporal_workflow_canceled',
  'typed_closeout_stage_attempt_id_mismatch',
  'target_ref_unreadable',
]);

const HARD_STOP_REASON_PARTS = [
  'authority_violation',
  'closure_changed',
  'credential',
  'currentness_identity',
  'executor_unavailable',
  'forbidden_write',
  'human_decision',
  'human_gate',
  'identity_mismatch',
  'irreversible',
  'permission',
  'pinned_closure',
  'security',
  'unsafe',
  'wrong_checkout',
  'wrong_target',
];

export function isRuntimeHardStopReason(reason: string | null | undefined) {
  const normalized = reason?.trim().toLowerCase();
  if (!normalized) return false;
  return HARD_STOP_REASON_EXACT.has(normalized)
    || HARD_STOP_REASON_PARTS.some((part) => normalized.includes(part));
}
