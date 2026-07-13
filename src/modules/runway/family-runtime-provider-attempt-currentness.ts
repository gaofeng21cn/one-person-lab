import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import { stringList, uniqueStringList } from '../../kernel/json-record.ts';
import { defaultExecutorDomainSourceFingerprint } from './family-runtime-provider-hosted-attempts.ts';

function recordValue(value: unknown) {
  return isRecord(value) ? value : null;
}

function uniqueSortedStrings(values: string[]) {
  return uniqueStringList(values).sort();
}

function currentnessSourceFingerprint(payload: Record<string, unknown>) {
  return optionalString(payload.source_fingerprint)
    ?? optionalString(payload.domain_source_fingerprint)
    ?? defaultExecutorDomainSourceFingerprint(payload);
}

export function providerAttemptCurrentnessIdentity(
  payload: Record<string, unknown>,
  options: { requirePendingStatus?: boolean } = {},
) {
  const requirePendingStatus = options.requirePendingStatus ?? true;
  const identity = recordValue(payload.provider_attempt_identity);
  const basis = recordValue(payload.owner_route_currentness_basis);
  const digestBasis = recordValue(basis?.currentness_digest_basis);
  const fields = {
    status: optionalString(identity?.status),
    schema_source: optionalString(payload.provider_attempt_schema_source)
      ?? optionalString(identity?.provider_attempt_schema_source),
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
    stage_packet_ref:
      optionalString(payload.stage_packet_ref)
      ?? optionalString(identity?.stage_packet_ref),
    stage_packet_refs: uniqueSortedStrings([
      ...stringList(payload.stage_packet_refs),
      ...stringList(identity?.stage_packet_refs),
      ...stringList(payload.checkpoint_refs),
      optionalString(payload.stage_packet_ref),
      optionalString(identity?.stage_packet_ref),
    ].filter((item): item is string => Boolean(item))),
    route_identity_key:
      optionalString(payload.route_identity_key)
      ?? optionalString(identity?.route_identity_key),
    attempt_idempotency_key:
      optionalString(payload.attempt_idempotency_key)
      ?? optionalString(payload.idempotency_key)
      ?? optionalString(identity?.attempt_idempotency_key)
      ?? optionalString(identity?.idempotency_key),
    recovery_obligation_id: optionalString(payload.recovery_obligation_id)
      ?? optionalString(identity?.recovery_obligation_id)
      ?? optionalString(identity?.paper_recovery_obligation_id),
  };
  if (!fields.work_unit_id || !fields.work_unit_fingerprint) {
    return null;
  }
  if (requirePendingStatus && fields.status !== 'provider_attempt_pending') {
    return null;
  }
  return fields;
}

function providerAttemptCurrentnessComparisonFields(
  identity: NonNullable<ReturnType<typeof providerAttemptCurrentnessIdentity>>,
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
    stage_packet_ref: identity.stage_packet_ref,
    stage_packet_refs: identity.stage_packet_refs,
    route_identity_key: identity.route_identity_key,
    attempt_idempotency_key: identity.attempt_idempotency_key,
    recovery_obligation_id: identity.recovery_obligation_id,
  };
}

export function sameProviderAttemptCurrentnessIdentity(
  left: NonNullable<ReturnType<typeof providerAttemptCurrentnessIdentity>>,
  right: NonNullable<ReturnType<typeof providerAttemptCurrentnessIdentity>>,
) {
  return JSON.stringify(providerAttemptCurrentnessComparisonFields(left))
    === JSON.stringify(providerAttemptCurrentnessComparisonFields(right));
}
