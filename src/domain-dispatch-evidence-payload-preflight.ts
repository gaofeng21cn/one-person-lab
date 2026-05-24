import { FrameworkContractError } from './contracts.ts';
import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function refsFromPayload(payload: JsonRecord, keys: string[]) {
  return keys.flatMap((key) => {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }
    return stringList(value);
  });
}

function looksLikePlaceholderRef(ref: string) {
  return ref.startsWith('<') && ref.endsWith('>');
}

function isSyntheticRequiredEvidenceRef(ref: string) {
  return ref.startsWith('domain_dispatch:') && ref.endsWith(':owner_receipt_or_typed_blocker');
}

function uniqueList(values: string[]) {
  return [...new Set(values)];
}

const SUCCESS_PAYLOAD_REF_FIELDS = [
  'domain_receipt_refs',
  'owner_chain_refs',
  'no_regression_refs',
] as const;

const SUPPLEMENTAL_PAYLOAD_REF_FIELDS = [
  'evidence_refs',
] as const;

const TYPED_BLOCKER_PAYLOAD_REF_FIELDS = [
  'typed_blocker_refs',
] as const;

function payloadSourceFingerprint(payload: JsonRecord) {
  return stringValue(payload.source_fingerprint)
    ?? stringValue(record(payload.repair_work_unit).source_fingerprint);
}

function identityBindingPreflight(route: JsonRecord, payload: JsonRecord) {
  const targetIdentity = record(route.target_identity);
  const targetDomainSourceFingerprint = stringValue(targetIdentity.domain_source_fingerprint)
    ?? stringValue(route.domain_source_fingerprint);
  const payloadDomainSourceFingerprint = stringValue(payload.domain_source_fingerprint)
    ?? payloadSourceFingerprint(payload);
  const payloadAttemptSourceFingerprint = stringValue(payload.stage_attempt_source_fingerprint)
    ?? stringValue(payload.provider_attempt_source_key)
    ?? (targetDomainSourceFingerprint ? null : payloadSourceFingerprint(payload));
  const targetEntries = [
    ['domain_id', stringValue(targetIdentity.domain_id) ?? stringValue(route.domain_id)],
    ['stage_id', stringValue(targetIdentity.stage_id) ?? stringValue(route.stage_id)],
    ['task_kind', stringValue(targetIdentity.task_kind)],
    ['study_id', stringValue(targetIdentity.study_id)],
    ['source_fingerprint', stringValue(targetIdentity.source_fingerprint)
      ?? stringValue(route.stage_attempt_source_fingerprint)],
    ['domain_source_fingerprint', targetDomainSourceFingerprint],
    ['profile', stringValue(targetIdentity.profile)],
    ['profile_name', stringValue(targetIdentity.profile_name)],
  ] as const;
  const payloadEntries = [
    ['domain_id', stringValue(payload.domain_id)],
    ['stage_id', stringValue(payload.stage_id)],
    ['task_kind', stringValue(payload.task_kind) ?? stringValue(payload.recommended_task_kind)],
    ['study_id', stringValue(payload.study_id)],
    ['source_fingerprint', payloadAttemptSourceFingerprint],
    ['domain_source_fingerprint', payloadDomainSourceFingerprint],
    ['profile', stringValue(payload.profile)],
    ['profile_name', stringValue(payload.profile_name)],
  ] as const;
  const payloadByField = new Map(payloadEntries);
  type IdentityBindingField = (typeof targetEntries)[number][0];
  const comparable = targetEntries
    .map(([field, targetValue]) => ({
      field,
      target_value: targetValue,
      payload_value: payloadByField.get(field) ?? null,
    }))
    .filter((entry): entry is {
      field: IdentityBindingField;
      target_value: string;
      payload_value: string;
    } => Boolean(entry.target_value) && Boolean(entry.payload_value));
  const identityConflicts = comparable.filter((entry) => entry.target_value !== entry.payload_value);
  const targetIdentityPresent = targetEntries.some(([, value]) => Boolean(value));
  return {
    surface_kind: 'opl_domain_dispatch_evidence_identity_binding_preflight',
    status: identityConflicts.length > 0
      ? 'conflict'
      : comparable.length > 0
        ? 'matched'
        : targetIdentityPresent
          ? 'payload_identity_not_provided'
          : 'target_identity_not_available',
    comparable_fields: comparable.map((entry) => entry.field),
    conflict_fields: identityConflicts.map((entry) => entry.field),
    identity_conflicts: identityConflicts,
    target_identity: Object.fromEntries(targetEntries.filter(([, value]) => Boolean(value))),
    payload_identity: Object.fromEntries(payloadEntries.filter(([, value]) => Boolean(value))),
    policy: 'record_fails_closed_when_payload_identity_conflicts_with_stage_attempt_identity',
  };
}

export function preflightDomainDispatchEvidencePayload(payload: JsonRecord, route: JsonRecord = {}) {
  const domainReceiptRefs = refsFromPayload(payload, [
    'domain_receipt_refs',
    'domain_receipt_ref',
    'receipt_refs',
    'receipt_ref',
  ]);
  const typedBlockerRefs = refsFromPayload(payload, ['typed_blocker_refs', 'typed_blocker_ref']);
  const noRegressionRefs = refsFromPayload(payload, ['no_regression_refs', 'no_regression_ref']);
  const ownerChainRefs = refsFromPayload(payload, ['owner_chain_refs', 'owner_chain_ref']);
  const evidenceRefs = refsFromPayload(payload, ['evidence_refs', 'evidence_ref']);
  const allRefs = [
    ...domainReceiptRefs,
    ...typedBlockerRefs,
    ...noRegressionRefs,
    ...ownerChainRefs,
    ...evidenceRefs,
  ];
  const requiredEvidenceRefs = uniqueList(stringList(route.required_evidence_refs));
  const enforcedRequiredEvidenceRefs = requiredEvidenceRefs.filter(
    (ref) => !looksLikePlaceholderRef(ref) && !isSyntheticRequiredEvidenceRef(ref),
  );
  const providedRefs = new Set(allRefs);
  const missingRequiredEvidenceRefs = enforcedRequiredEvidenceRefs.filter((ref) => !providedRefs.has(ref));
  const requiredEvidenceRefsCovered = missingRequiredEvidenceRefs.length === 0;
  const forbiddenPlaceholderRefs = allRefs.filter(looksLikePlaceholderRef);
  const successCloseoutRefCount =
    domainReceiptRefs.length + ownerChainRefs.length + noRegressionRefs.length;
  const successPathReady = requiredEvidenceRefsCovered && (
    domainReceiptRefs.length > 0
    || ownerChainRefs.length > 0
    || noRegressionRefs.length > 0
  ) && typedBlockerRefs.length === 0;
  const typedBlockerPathReady = typedBlockerRefs.length > 0;
  const selectedPayloadPath = typedBlockerPathReady
    ? 'typed_blocker_path'
    : successPathReady
      ? 'success_refs_path'
      : 'blocked';
  const identityBinding = identityBindingPreflight(route, payload);
  const identityConflicts = identityBinding.identity_conflicts;
  const canRecordRefsOnlyReceipt = allRefs.length > 0
    && forbiddenPlaceholderRefs.length === 0
    && (successPathReady || typedBlockerPathReady)
    && identityConflicts.length === 0;
  return {
    surface_kind: 'opl_domain_dispatch_evidence_payload_preflight',
    status: canRecordRefsOnlyReceipt ? 'ready_to_record' : 'blocked',
    route_requires_domain_or_app_payload: true,
    identity_binding: identityBinding,
    identity_conflicts: identityConflicts,
    required_any_operator_payload_refs: [
      'domain_receipt_refs',
      'typed_blocker_refs',
      'owner_chain_refs',
      'no_regression_refs',
    ],
    supplemental_operator_payload_refs: [...SUPPLEMENTAL_PAYLOAD_REF_FIELDS],
    payload_path_policy:
      'choose_success_closeout_refs_path_or_domain_owned_typed_blocker_path_evidence_refs_are_supplemental',
    selected_payload_path: selectedPayloadPath,
    accepted_payload_paths: {
      success_refs_path: {
        status: successPathReady ? 'ready' : 'not_ready',
        required_any_operator_payload_refs: [...SUCCESS_PAYLOAD_REF_FIELDS],
        supplemental_operator_payload_refs: [...SUPPLEMENTAL_PAYLOAD_REF_FIELDS],
        required_evidence_refs_covered: requiredEvidenceRefsCovered,
        typed_blocker_refs_must_be_absent: true,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
      typed_blocker_path: {
        status: typedBlockerPathReady ? 'ready' : 'not_ready',
        required_operator_payload_refs: [...TYPED_BLOCKER_PAYLOAD_REF_FIELDS],
        success_claimed: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
    success_path_ready: successPathReady && forbiddenPlaceholderRefs.length === 0,
    typed_blocker_path_ready: typedBlockerPathReady && forbiddenPlaceholderRefs.length === 0,
    can_record_refs_only_receipt: canRecordRefsOnlyReceipt,
    required_evidence_refs: requiredEvidenceRefs,
    enforced_required_evidence_refs: enforcedRequiredEvidenceRefs,
    required_evidence_refs_covered: requiredEvidenceRefsCovered,
    missing_required_evidence_refs: missingRequiredEvidenceRefs,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    missing_payload_fields: allRefs.length === 0
      ? ['domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs']
      : successCloseoutRefCount === 0 && typedBlockerRefs.length === 0
        ? ['domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs']
      : [],
    accepted_ref_counts: {
      domain_receipt_refs: domainReceiptRefs.length,
      typed_blocker_refs: typedBlockerRefs.length,
      no_regression_refs: noRegressionRefs.length,
      owner_chain_refs: ownerChainRefs.length,
      evidence_refs: evidenceRefs.length,
    },
    policy:
      'record_requires_real_domain_app_or_live_owner_receipt_typed_blocker_owner_chain_or_no_regression_refs_evidence_refs_are_supplemental',
  };
}

export function assertDomainDispatchEvidencePayloadReady(route: JsonRecord, payload: JsonRecord) {
  const preflight = preflightDomainDispatchEvidencePayload(payload, route);
  if (Array.isArray(preflight.identity_conflicts) && preflight.identity_conflicts.length > 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Domain dispatch evidence payload identity conflicts with the target stage attempt.',
      {
        action_id: stringValue(route.action_id),
        error_kind: 'domain_dispatch_evidence_receipt_conflict',
        preflight,
        identity_conflicts: preflight.identity_conflicts,
        receipt_recorded: false,
      },
    );
  }
  if (preflight.can_record_refs_only_receipt) {
    return preflight;
  }
  if (
    Array.isArray(preflight.missing_required_evidence_refs)
    && preflight.missing_required_evidence_refs.length > 0
    && preflight.typed_blocker_path_ready !== true
  ) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Domain dispatch evidence payload does not cover every route-declared required evidence ref.',
      {
        action_id: stringValue(route.action_id),
        error_kind: 'domain_dispatch_evidence_required_refs_missing',
        required_evidence_refs: preflight.required_evidence_refs,
        missing_required_evidence_refs: preflight.missing_required_evidence_refs,
        empty_payload_template_is_success_evidence: false,
        preflight,
      },
    );
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Domain dispatch evidence record action requires real domain/App/live refs before OPL can record refs-only receipt.',
    {
      action_id: stringValue(route.action_id),
      error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
      required_any_operator_payload_refs: preflight.required_any_operator_payload_refs,
      empty_payload_template_is_success_evidence: false,
      preflight,
    },
  );
}
