function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exportOwnerFingerprint(payload: Record<string, unknown>) {
  const context = isRecord(payload.opl_domain_export_context) ? payload.opl_domain_export_context : null;
  return typeof context?.owner_fingerprint === 'string' && context.owner_fingerprint.trim()
    ? context.owner_fingerprint.trim()
    : null;
}

function trimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sourceFingerprint(payload: Record<string, unknown>) {
  const topLevelSourceFingerprint = trimmedString(payload.source_fingerprint);
  if (topLevelSourceFingerprint) {
    return topLevelSourceFingerprint;
  }
  const repairWorkUnit = isRecord(payload.repair_work_unit) ? payload.repair_work_unit : null;
  return trimmedString(repairWorkUnit?.source_fingerprint);
}

export function deadLetterRedriveDecision(
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  const nextOwnerFingerprint = exportOwnerFingerprint(nextPayload);
  if (!nextOwnerFingerprint) {
    return null;
  }
  const existingOwnerFingerprint = exportOwnerFingerprint(existingPayload);
  if (!existingOwnerFingerprint) {
    return {
      reason: 'domain_export_context_added_after_dead_letter',
      previous_export_owner_fingerprint: null,
      next_export_owner_fingerprint: nextOwnerFingerprint,
    };
  }
  if (existingOwnerFingerprint !== nextOwnerFingerprint) {
    return {
      reason: 'domain_export_owner_changed_after_dead_letter',
      previous_export_owner_fingerprint: existingOwnerFingerprint,
      next_export_owner_fingerprint: nextOwnerFingerprint,
    };
  }
  const existingSourceFingerprint = sourceFingerprint(existingPayload);
  const nextSourceFingerprint = sourceFingerprint(nextPayload);
  if (existingSourceFingerprint && nextSourceFingerprint && existingSourceFingerprint !== nextSourceFingerprint) {
    return {
      reason: 'domain_export_source_fingerprint_changed_after_dead_letter',
      previous_export_owner_fingerprint: existingOwnerFingerprint,
      next_export_owner_fingerprint: nextOwnerFingerprint,
      previous_source_fingerprint: existingSourceFingerprint,
      next_source_fingerprint: nextSourceFingerprint,
    };
  }
  return null;
}
