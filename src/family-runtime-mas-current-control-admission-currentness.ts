import { defaultExecutorDomainSourceFingerprint } from './family-runtime-provider-hosted-attempts.ts';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function currentnessSourceFingerprint(payload: Record<string, unknown>) {
  return optionalString(payload.source_fingerprint)
    ?? optionalString(payload.domain_source_fingerprint)
    ?? defaultExecutorDomainSourceFingerprint(payload);
}

export function providerAdmissionCurrentnessIdentity(
  payload: Record<string, unknown>,
  options: { requirePendingStatus?: boolean } = {},
) {
  const requirePendingStatus = options.requirePendingStatus ?? true;
  const identity = recordValue(payload.provider_admission_identity);
  const basis = recordValue(payload.owner_route_currentness_basis);
  const digestBasis = recordValue(basis?.currentness_digest_basis);
  const fields = {
    status: optionalString(identity?.status),
    schema_source: optionalString(payload.provider_admission_schema_source)
      ?? optionalString(identity?.provider_admission_schema_source),
    generated_at: optionalString(basis?.generated_at),
    source_fingerprint: currentnessSourceFingerprint(payload),
    work_unit_id: optionalString(basis?.work_unit_id) ?? optionalString(payload.work_unit_id),
    work_unit_fingerprint:
      optionalString(basis?.work_unit_fingerprint) ?? optionalString(payload.work_unit_fingerprint),
    action_fingerprint: optionalString(payload.action_fingerprint) ?? optionalString(identity?.action_fingerprint),
    truth_epoch: optionalString(basis?.truth_epoch),
    runtime_health_epoch: optionalString(basis?.runtime_health_epoch),
    source_eval_id: optionalString(basis?.source_eval_id),
    runtime_digest: optionalString(digestBasis?.runtime_digest),
    stable_truth_digest: optionalString(digestBasis?.stable_truth_digest),
    volatile_projection_digest: optionalString(digestBasis?.volatile_projection_digest),
    work_unit_digest: optionalString(digestBasis?.work_unit_digest),
  };
  if (!fields.work_unit_id || !fields.work_unit_fingerprint) {
    return null;
  }
  if (requirePendingStatus && fields.status !== 'provider_admission_pending') {
    return null;
  }
  return fields;
}

function providerAdmissionCurrentnessComparisonFields(
  identity: NonNullable<ReturnType<typeof providerAdmissionCurrentnessIdentity>>,
) {
  return {
    generated_at: identity.generated_at,
    source_fingerprint: identity.source_fingerprint,
    work_unit_id: identity.work_unit_id,
    work_unit_fingerprint: identity.work_unit_fingerprint,
    action_fingerprint: identity.action_fingerprint,
    truth_epoch: identity.truth_epoch,
    runtime_health_epoch: identity.runtime_health_epoch,
    source_eval_id: identity.source_eval_id,
    runtime_digest: identity.runtime_digest,
    stable_truth_digest: identity.stable_truth_digest,
    volatile_projection_digest: identity.volatile_projection_digest,
    work_unit_digest: identity.work_unit_digest,
  };
}

export function sameProviderAdmissionCurrentnessIdentity(
  left: NonNullable<ReturnType<typeof providerAdmissionCurrentnessIdentity>>,
  right: NonNullable<ReturnType<typeof providerAdmissionCurrentnessIdentity>>,
) {
  return JSON.stringify(providerAdmissionCurrentnessComparisonFields(left))
    === JSON.stringify(providerAdmissionCurrentnessComparisonFields(right));
}
