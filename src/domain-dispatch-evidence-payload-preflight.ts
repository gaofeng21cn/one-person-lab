import { FrameworkContractError } from './contracts.ts';
import { domainDispatchEvidencePayloadRefs } from './domain-dispatch-evidence-payload-refs.ts';
import { listStageRunExecutionAuthorizationReceipts } from './stage-run-execution-authorization-ledger.ts';
import type { JsonRecord } from './runtime-tray-snapshot-types.ts';
import fs from 'node:fs';
import path from 'node:path';

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

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
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

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
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

function localJsonRefPath(ref: string, route: JsonRecord) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return null;
  }
  const candidateRoots = uniqueList([
    ...[
      route.workspace_root,
      route.workspace_path,
      route.repo_root,
      route.domain_workspace_root,
      route.domain_repo_root,
      record(route.workspace_locator).workspace_root,
      record(route.workspace_locator).workspace_path,
      record(route.target_identity).workspace_root,
      record(route.target_identity).workspace_path,
      record(route.target_identity).repo_root,
    ].map((value) => stringValue(value)).filter((value): value is string => Boolean(value)),
  ]);
  if (path.isAbsolute(ref)) {
    return ref;
  }
  for (const root of candidateRoots) {
    const resolvedRoot = path.resolve(root);
    const resolvedRef = path.resolve(resolvedRoot, ref);
    const relative = path.relative(resolvedRoot, resolvedRef);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return resolvedRef;
    }
  }
  return null;
}

function localJsonRefContent(ref: string, route: JsonRecord) {
  const refPath = localJsonRefPath(ref, route);
  if (!refPath || !fs.existsSync(refPath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  return isRecord(parsed) ? { ref, ref_path: refPath, content: parsed } : null;
}

function identityFromOwnerAnswerContent(content: JsonRecord) {
  const closeoutBinding = record(content.closeout_binding);
  return {
    study_id: firstString(content.study_id, closeoutBinding.study_id),
    stage_id: firstString(content.stage_id, closeoutBinding.stage_id),
    stage_attempt_id: firstString(content.stage_attempt_id, closeoutBinding.stage_attempt_id),
    stage_run_id: firstString(content.stage_run_id, closeoutBinding.stage_run_id),
    stage_manifest_ref: firstString(content.stage_manifest_ref, closeoutBinding.stage_manifest_ref),
    current_pointer_ref: firstString(content.current_pointer_ref, closeoutBinding.current_pointer_ref),
    source_fingerprint: firstString(closeoutBinding.source_fingerprint, content.source_fingerprint),
    idempotency_key: firstString(closeoutBinding.idempotency_key, content.idempotency_key),
    provider_attempt_ref: firstString(closeoutBinding.provider_attempt_ref, content.provider_attempt_ref),
    attempt_lease_ref: firstString(closeoutBinding.attempt_lease_ref, content.attempt_lease_ref),
    execution_authorization_decision_ref: firstString(
      closeoutBinding.execution_authorization_decision_ref,
      content.execution_authorization_decision_ref,
    ),
  };
}

function identityFromLocalRefContents(route: JsonRecord, refs: string[]) {
  const sources = refs
    .map((ref) => localJsonRefContent(ref, route))
    .filter((entry): entry is { ref: string; ref_path: string; content: JsonRecord } => Boolean(entry))
    .map((entry) => ({
      ref: entry.ref,
      ref_path: entry.ref_path,
      identity: identityFromOwnerAnswerContent(entry.content),
    }));
  const fields = [
    'study_id',
    'stage_id',
    'stage_attempt_id',
    'stage_run_id',
    'stage_manifest_ref',
    'current_pointer_ref',
    'source_fingerprint',
    'idempotency_key',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
  ] as const;
  return {
    sources,
    identity: Object.fromEntries(fields.flatMap((field) => {
      const values = uniqueList(sources
        .map((source) => stringValue(source.identity[field]))
        .filter((value): value is string => Boolean(value)));
      return values.length === 1 ? [[field, values[0]]] : [];
    })) as JsonRecord,
  };
}

function routeAuthorizationReceiptIdentity(route: JsonRecord) {
  const targetIdentity = record(route.target_identity);
  const targetStageAttemptId = stringValue(targetIdentity.stage_attempt_id)
    ?? stringValue(route.stage_attempt_id);
  if (!targetStageAttemptId) {
    return {};
  }
  const receipt = listStageRunExecutionAuthorizationReceipts().find((candidate) =>
    candidate.phase === 'launch' && candidate.stage_attempt_id === targetStageAttemptId
  );
  if (!receipt) {
    return {};
  }
  return {
    stage_run_id: receipt.stage_run_id,
    stage_attempt_id: receipt.stage_attempt_id,
    stage_id: receipt.stage_id,
    source_fingerprint: receipt.source_fingerprint,
    idempotency_key: receipt.idempotency_key,
    stage_manifest_ref: receipt.stage_manifest_ref,
    current_pointer_ref: receipt.current_pointer_ref,
    provider_attempt_ref: receipt.provider_attempt_ref,
    attempt_lease_ref: receipt.attempt_lease_ref,
    execution_authorization_decision_ref: receipt.execution_authorization_decision_ref,
  };
}

function forbiddenPaperLineOwnerChainPayloadClaims(payload: JsonRecord) {
  return recordList(payload.paper_line_owner_chain_results).flatMap((result, index) => {
    const paperLineId = stringValue(result.paper_line_id);
    const readinessClaims = record(result.readiness_claims);
    return [
      ...(result.body_included === true
        ? [{
            path: `paper_line_owner_chain_results[${index}].body_included`,
            paper_line_id: paperLineId,
            forbidden_value: true,
            reason: 'opl_domain_dispatch_payload_must_be_body_free',
          }]
        : []),
      ...[
        'claims_paper_closure',
        'claims_publication_ready',
        'claims_artifact_mutation_authorized',
        'claims_current_package_updated',
      ].flatMap((field) => readinessClaims[field] === true
        ? [{
            path: `paper_line_owner_chain_results[${index}].readiness_claims.${field}`,
            paper_line_id: paperLineId,
            forbidden_value: true,
            reason: 'opl_domain_dispatch_payload_must_not_carry_readiness_or_artifact_authority_claims',
          }]
        : []),
    ];
  });
}

function ownerDeltaResultCloseoutBindingIdentity(payload: JsonRecord) {
  const ownerDeltaResult = payload.owner_delta_result;
  const results = isRecord(ownerDeltaResult)
    ? [ownerDeltaResult]
    : Array.isArray(ownerDeltaResult)
      ? ownerDeltaResult.filter(isRecord)
      : [];
  const fields = [
    'stage_run_id',
    'stage_manifest_ref',
    'current_pointer_ref',
    'source_fingerprint',
    'idempotency_key',
    'provider_attempt_ref',
    'attempt_lease_ref',
    'execution_authorization_decision_ref',
  ] as const;
  return Object.fromEntries(fields.flatMap((field) => {
    const values = uniqueList(results
      .map((result) => {
        const closeoutBinding = record(result.closeout_binding);
        return stringValue(result[field]) ?? stringValue(closeoutBinding[field]);
      })
      .filter((value): value is string => Boolean(value)));
    return values.length === 1 ? [[field, values[0]]] : [];
  })) as JsonRecord;
}

function identityBindingPreflight(route: JsonRecord, payload: JsonRecord, refIdentity: JsonRecord = {}) {
  const targetIdentity = record(route.target_identity);
  const authorizationReceiptIdentity = routeAuthorizationReceiptIdentity(route);
  const ownerDeltaBindingIdentity = ownerDeltaResultCloseoutBindingIdentity(payload);
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
    ['stage_attempt_id', stringValue(targetIdentity.stage_attempt_id) ?? stringValue(route.stage_attempt_id)],
    [
      'stage_run_id',
      stringValue(targetIdentity.stage_run_id)
        ?? stringValue(route.stage_run_id)
        ?? stringValue(authorizationReceiptIdentity.stage_run_id),
    ],
    ['task_kind', stringValue(targetIdentity.task_kind)],
    ['study_id', stringValue(targetIdentity.study_id)],
    ['source_fingerprint', stringValue(targetIdentity.source_fingerprint)
      ?? stringValue(route.stage_attempt_source_fingerprint)
      ?? stringValue(authorizationReceiptIdentity.source_fingerprint)],
    ['domain_source_fingerprint', targetDomainSourceFingerprint],
    [
      'idempotency_key',
      stringValue(targetIdentity.idempotency_key)
        ?? stringValue(route.idempotency_key)
        ?? stringValue(authorizationReceiptIdentity.idempotency_key),
    ],
    [
      'stage_manifest_ref',
      stringValue(targetIdentity.stage_manifest_ref)
        ?? stringValue(route.stage_manifest_ref)
        ?? stringValue(authorizationReceiptIdentity.stage_manifest_ref),
    ],
    [
      'current_pointer_ref',
      stringValue(targetIdentity.current_pointer_ref)
        ?? stringValue(route.current_pointer_ref)
        ?? stringValue(authorizationReceiptIdentity.current_pointer_ref),
    ],
    [
      'provider_attempt_ref',
      stringValue(targetIdentity.provider_attempt_ref)
        ?? stringValue(route.provider_attempt_ref)
        ?? stringValue(authorizationReceiptIdentity.provider_attempt_ref),
    ],
    [
      'attempt_lease_ref',
      stringValue(targetIdentity.attempt_lease_ref)
        ?? stringValue(route.attempt_lease_ref)
        ?? stringValue(authorizationReceiptIdentity.attempt_lease_ref),
    ],
    [
      'execution_authorization_decision_ref',
      stringValue(targetIdentity.execution_authorization_decision_ref)
        ?? stringValue(route.execution_authorization_decision_ref)
        ?? stringValue(authorizationReceiptIdentity.execution_authorization_decision_ref),
    ],
    ['profile', stringValue(targetIdentity.profile)],
    ['profile_name', stringValue(targetIdentity.profile_name)],
  ] as const;
  const payloadEntries = [
    ['domain_id', stringValue(payload.domain_id)],
    ['stage_id', stringValue(payload.stage_id) ?? stringValue(refIdentity.stage_id)],
    ['stage_attempt_id', stringValue(payload.stage_attempt_id) ?? stringValue(refIdentity.stage_attempt_id)],
    ['stage_run_id', stringValue(payload.stage_run_id) ?? stringValue(ownerDeltaBindingIdentity.stage_run_id) ?? stringValue(refIdentity.stage_run_id)],
    ['task_kind', stringValue(payload.task_kind) ?? stringValue(payload.recommended_task_kind)],
    ['study_id', stringValue(payload.study_id) ?? stringValue(refIdentity.study_id)],
    ['source_fingerprint', payloadAttemptSourceFingerprint ?? stringValue(ownerDeltaBindingIdentity.source_fingerprint) ?? stringValue(refIdentity.source_fingerprint)],
    ['domain_source_fingerprint', payloadDomainSourceFingerprint],
    ['idempotency_key', stringValue(payload.idempotency_key) ?? stringValue(ownerDeltaBindingIdentity.idempotency_key) ?? stringValue(refIdentity.idempotency_key)],
    [
      'stage_manifest_ref',
      stringValue(payload.stage_manifest_ref) ?? stringValue(ownerDeltaBindingIdentity.stage_manifest_ref) ?? stringValue(refIdentity.stage_manifest_ref),
    ],
    [
      'current_pointer_ref',
      stringValue(payload.current_pointer_ref) ?? stringValue(ownerDeltaBindingIdentity.current_pointer_ref) ?? stringValue(refIdentity.current_pointer_ref),
    ],
    ['provider_attempt_ref', stringValue(payload.provider_attempt_ref) ?? stringValue(ownerDeltaBindingIdentity.provider_attempt_ref) ?? stringValue(refIdentity.provider_attempt_ref)],
    ['attempt_lease_ref', stringValue(payload.attempt_lease_ref) ?? stringValue(ownerDeltaBindingIdentity.attempt_lease_ref) ?? stringValue(refIdentity.attempt_lease_ref)],
    [
      'execution_authorization_decision_ref',
      stringValue(payload.execution_authorization_decision_ref)
        ?? stringValue(ownerDeltaBindingIdentity.execution_authorization_decision_ref)
        ?? stringValue(refIdentity.execution_authorization_decision_ref),
    ],
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
    policy:
      'record_fails_closed_when_payload_or_local_owner_answer_ref_identity_conflicts_with_stage_attempt_identity',
  };
}

export function preflightDomainDispatchEvidencePayload(payload: JsonRecord, route: JsonRecord = {}) {
  const {
    domainReceiptRefs,
    typedBlockerRefs,
    noRegressionRefs,
    ownerChainRefs,
    evidenceRefs,
  } = domainDispatchEvidencePayloadRefs(payload);
  const allRefs = [
    ...domainReceiptRefs,
    ...typedBlockerRefs,
    ...noRegressionRefs,
    ...ownerChainRefs,
    ...evidenceRefs,
  ];
  const localOwnerAnswerRefIdentity = identityFromLocalRefContents(route, [
    ...domainReceiptRefs,
    ...typedBlockerRefs,
    ...ownerChainRefs,
  ]);
  const requiredEvidenceRefs = uniqueList(stringList(route.required_evidence_refs));
  const enforcedRequiredEvidenceRefs = requiredEvidenceRefs.filter(
    (ref) => !looksLikePlaceholderRef(ref) && !isSyntheticRequiredEvidenceRef(ref),
  );
  const providedRefs = new Set(allRefs);
  const missingRequiredEvidenceRefs = enforcedRequiredEvidenceRefs.filter((ref) => !providedRefs.has(ref));
  const requiredEvidenceRefsCovered = missingRequiredEvidenceRefs.length === 0;
  const forbiddenPlaceholderRefs = allRefs.filter(looksLikePlaceholderRef);
  const forbiddenPayloadAuthorityClaims = forbiddenPaperLineOwnerChainPayloadClaims(payload);
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
  const identityBinding = identityBindingPreflight(route, payload, localOwnerAnswerRefIdentity.identity);
  const identityConflicts = identityBinding.identity_conflicts;
  const canRecordRefsOnlyReceipt = allRefs.length > 0
    && forbiddenPlaceholderRefs.length === 0
    && forbiddenPayloadAuthorityClaims.length === 0
    && (successPathReady || typedBlockerPathReady)
    && identityConflicts.length === 0;
  return {
    surface_kind: 'opl_domain_dispatch_evidence_payload_preflight',
    status: canRecordRefsOnlyReceipt ? 'ready_to_record' : 'blocked',
    route_requires_domain_or_app_payload: true,
    identity_binding: identityBinding,
    identity_conflicts: identityConflicts,
    local_owner_answer_ref_identity: {
      surface_kind: 'opl_domain_dispatch_local_owner_answer_ref_identity_preflight',
      inspected_ref_count: localOwnerAnswerRefIdentity.sources.length,
      inspected_refs: localOwnerAnswerRefIdentity.sources.map((source) => ({
        ref: source.ref,
        ref_path: source.ref_path,
        identity: source.identity,
      })),
      payload_identity: localOwnerAnswerRefIdentity.identity,
      policy:
        'relative_or_absolute_local_json_owner_answer_refs_are_inspected_for_comparable_stage_attempt_identity_fields',
    },
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
    forbidden_payload_authority_claims: forbiddenPayloadAuthorityClaims,
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
    Array.isArray(preflight.forbidden_payload_authority_claims)
    && preflight.forbidden_payload_authority_claims.length > 0
  ) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Domain dispatch evidence payload must stay body-free and cannot carry readiness or artifact authority claims.',
      {
        action_id: stringValue(route.action_id),
        error_kind: 'domain_dispatch_evidence_payload_authority_claims_forbidden',
        forbidden_payload_authority_claims: preflight.forbidden_payload_authority_claims,
        receipt_recorded: false,
        empty_payload_template_is_success_evidence: false,
        preflight,
      },
    );
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
