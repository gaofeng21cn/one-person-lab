type JsonRecord = Record<string, unknown>;

type MasGuardedApplyAttempt = {
  domain_id: string;
  stage_id: string;
  stage_attempt_id: string;
  route_impact: JsonRecord;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

export function masGuardedApplyOwnerReceiptRefs(attempts: MasGuardedApplyAttempt[]) {
  return uniqueStrings(attempts
    .filter((attempt) =>
      attempt.domain_id === 'medautoscience'
      && attempt.stage_id === 'paper_autonomy/guarded-apply'
      && optionalString(attempt.route_impact.guarded_apply_status) === 'mas_owner_apply_receipt_observed'
    )
    .map((attempt) => optionalString(attempt.route_impact.receipt_ref))
    .filter((ref): ref is string => Boolean(ref)));
}

export function masGuardedApplyTypedBlockers(attempts: MasGuardedApplyAttempt[]) {
  return attempts
    .filter((attempt) =>
      attempt.domain_id === 'medautoscience'
      && attempt.stage_id === 'paper_autonomy/guarded-apply'
      && optionalString(attempt.route_impact.guarded_apply_status) === 'blocked_no_mas_owner_apply_receipt'
      && Number(attempt.route_impact.typed_blocker_count ?? 0) > 0
    )
    .map((attempt) => ({
      blocker_kind: 'mas_guarded_apply_owner_chain',
      blocker_id: `mas_guarded_apply_typed_blocker:${attempt.stage_attempt_id}`,
      owner: 'med-autoscience',
      source_surface: 'paper_autonomy/guarded-apply',
      receipt_ref: optionalString(attempt.route_impact.receipt_ref),
      provider_attempt_state: optionalString(attempt.route_impact.provider_attempt_state),
      write_permitted: false,
    }));
}
