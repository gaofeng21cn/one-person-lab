import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function buildDomainDispatchEvidenceIdentityGuidance(input: {
  routeDomainId: string | null;
  stageId: string | null;
  targetIdentity: JsonRecord;
  stageAttemptSourceFingerprint: string | null;
  routeDomainSourceFingerprint?: string | null;
}) {
  const targetDomainSourceFingerprint =
    stringValue(input.targetIdentity.domain_source_fingerprint)
    ?? stringValue(input.routeDomainSourceFingerprint);
  const targetAttemptSourceFingerprint =
    stringValue(input.targetIdentity.source_fingerprint)
    ?? input.stageAttemptSourceFingerprint;
  const targetFields = [
    ['domain_id', stringValue(input.targetIdentity.domain_id) ?? input.routeDomainId],
    ['stage_id', stringValue(input.targetIdentity.stage_id) ?? input.stageId],
    ['task_kind', stringValue(input.targetIdentity.task_kind)],
    ['study_id', stringValue(input.targetIdentity.study_id)],
    ['source_fingerprint', targetAttemptSourceFingerprint],
    ['domain_source_fingerprint', targetDomainSourceFingerprint],
    ['profile', stringValue(input.targetIdentity.profile)],
    ['profile_name', stringValue(input.targetIdentity.profile_name)],
  ] as const;
  return {
    surface_kind: 'opl_domain_dispatch_evidence_identity_binding_guidance',
    policy: 'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
    preflight_command_required_before_record: true,
    conflict_error_kind: 'domain_dispatch_evidence_receipt_conflict',
    target_identity_fields_present: targetFields
      .filter(([, value]) => Boolean(value))
      .map(([field]) => field),
    payload_identity_fields_checked_when_present: [
      'domain_id',
      'stage_id',
      'task_kind',
      'study_id',
      'source_fingerprint',
      'domain_source_fingerprint',
      'stage_attempt_source_fingerprint',
      'provider_attempt_source_key',
      'profile',
      'profile_name',
    ],
    payload_source_fingerprint_binding: targetDomainSourceFingerprint
      ? {
          source_fingerprint_binds_to: 'domain_source_fingerprint',
          provider_attempt_source_key_fields: [
            'stage_attempt_source_fingerprint',
            'provider_attempt_source_key',
          ],
          stale_or_wrong_domain_source_policy: 'fail_closed_identity_conflict',
        }
      : {
          source_fingerprint_binds_to: 'stage_attempt_source_fingerprint',
          provider_attempt_source_key_fields: ['source_fingerprint'],
          stale_or_wrong_stage_attempt_source_policy: 'fail_closed_identity_conflict',
        },
    matching_policy:
      'study_task_profile_match_is_not_sufficient_payload_identity_must_match_all_comparable_target_fields',
    stale_payload_policy:
      'do_not_record_stale_or_drifted_domain_payload_generate_new_owner_payload_or_typed_blocker_ref',
    authority_boundary: {
      can_write_domain_truth: false,
      can_generate_domain_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}

export function domainDispatchEvidenceIdentityGuidanceFromRoute(route: JsonRecord) {
  const targetIdentity = record(route.target_identity);
  return buildDomainDispatchEvidenceIdentityGuidance({
    routeDomainId: stringValue(route.domain_id),
    stageId: stringValue(route.stage_id),
    targetIdentity,
    stageAttemptSourceFingerprint: stringValue(route.stage_attempt_source_fingerprint),
    routeDomainSourceFingerprint: stringValue(route.domain_source_fingerprint),
  });
}
