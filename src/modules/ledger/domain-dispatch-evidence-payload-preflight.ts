import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { domainDispatchEvidencePayloadRefs } from './domain-dispatch-evidence-payload-refs.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { readJsonPayloadFile } from '../../kernel/json-file.ts';
import fs from 'node:fs';
import path from 'node:path';

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

const PROGRESS_PAYLOAD_REF_FIELDS = [
  'artifact_refs',
  'output_refs',
  'progress_delta_refs',
  'diagnostic_refs',
  'negative_result_refs',
] as const;

function payloadSourceFingerprint(payload: JsonRecord) {
  return stringValue(payload.source_fingerprint)
    ?? stringValue(record(payload.repair_work_unit).source_fingerprint);
}

function splitLocalRefFragment(ref: string) {
  const hashIndex = ref.indexOf('#');
  if (hashIndex < 0) {
    return { refPath: ref, fragment: null };
  }
  return {
    refPath: ref.slice(0, hashIndex),
    fragment: ref.slice(hashIndex + 1) || null,
  };
}

function fragmentRecord(content: JsonRecord, fragment: string | null) {
  if (!fragment) {
    return content;
  }
  const normalized = fragment.startsWith('/') ? fragment.slice(1) : fragment;
  const value = normalized
    .split('/')
    .filter((part) => part.length > 0)
    .reduce<unknown>((current, part) => {
      if (current === null || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      return record(current)[decodeURIComponent(part)];
    }, content);
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? record(value)
    : null;
}

function localJsonRefPath(ref: string, route: JsonRecord) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return null;
  }
  const { refPath, fragment } = splitLocalRefFragment(ref);
  if (!refPath.toLowerCase().endsWith('.json')) {
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
  if (path.isAbsolute(refPath)) {
    return { ref_path: refPath, fragment };
  }
  for (const root of candidateRoots) {
    const resolvedRoot = path.resolve(root);
    const resolvedRef = path.resolve(resolvedRoot, refPath);
    const relative = path.relative(resolvedRoot, resolvedRef);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return { ref_path: resolvedRef, fragment };
    }
  }
  return null;
}

function localJsonRefContent(ref: string, route: JsonRecord) {
  const target = localJsonRefPath(ref, route);
  if (!target || !fs.existsSync(target.ref_path)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = readJsonPayloadFile(target.ref_path);
  } catch {
    return null;
  }
  const content =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? fragmentRecord(record(parsed), target.fragment)
      : null;
  return content ? { ref, ref_path: target.ref_path, fragment: target.fragment, content } : null;
}

function identityFromOwnerAnswerContent(content: JsonRecord) {
  const surfaceKind = stringValue(content.surface_kind);
  const hasOwnerAnswerShape = [
    'receipt_kind',
    'domain_blocker',
    'typed_blocker_ref',
    'owner_receipt_ref',
  ].some((field) => content[field] !== undefined);
  if (
    !hasOwnerAnswerShape
    && surfaceKind !== 'stage_attempt_closeout_packet'
    && surfaceKind !== 'mas_domain_typed_blocker'
    && surfaceKind !== 'mas_stage_owner_receipt'
    && surfaceKind !== 'mas_domain_owner_typed_blocker'
  ) {
    return {};
  }
  return {
    study_id: stringValue(content.study_id),
    stage_id: stringValue(content.stage_id),
    stage_attempt_id: stringValue(content.stage_attempt_id),
    stage_run_id: stringValue(content.stage_run_id),
    source_fingerprint: stringValue(content.source_fingerprint),
    idempotency_key: stringValue(content.idempotency_key),
    provider_attempt_ref: stringValue(content.provider_attempt_ref),
  };
}

function identityFromLocalRefContents(route: JsonRecord, refs: string[]) {
  const sources = refs
    .map((ref) => localJsonRefContent(ref, route))
    .filter((entry): entry is {
      ref: string;
      ref_path: string;
      fragment: string | null;
      content: JsonRecord;
    } => Boolean(entry))
    .map((entry) => ({
      ref: entry.ref,
      ref_path: entry.ref_path,
      fragment: entry.fragment,
      identity: identityFromOwnerAnswerContent(entry.content),
    }));
  const fields = [
    'study_id',
    'stage_id',
    'stage_attempt_id',
    'stage_run_id',
    'source_fingerprint',
    'idempotency_key',
    'provider_attempt_ref',
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

function routeTransportIdentity(route: JsonRecord) {
  const targetIdentity = record(route.target_identity);
  return {
    stage_run_id: stringValue(targetIdentity.stage_run_id) ?? stringValue(route.stage_run_id),
    stage_attempt_id: stringValue(targetIdentity.stage_attempt_id) ?? stringValue(route.stage_attempt_id),
    stage_id: stringValue(targetIdentity.stage_id) ?? stringValue(route.stage_id),
    source_fingerprint:
      stringValue(targetIdentity.source_fingerprint) ?? stringValue(route.source_fingerprint),
    idempotency_key: stringValue(targetIdentity.idempotency_key) ?? stringValue(route.idempotency_key),
    provider_attempt_ref:
      stringValue(targetIdentity.provider_attempt_ref) ?? stringValue(route.provider_attempt_ref),
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

function payloadTransportIdentity(payload: JsonRecord) {
  const transportIdentity = record(payload.transport_identity);
  const fields = [
    'stage_run_id',
    'source_fingerprint',
    'idempotency_key',
    'provider_attempt_ref',
  ] as const;
  return Object.fromEntries(fields.flatMap((field) => {
    const value = stringValue(transportIdentity[field]);
    return value ? [[field, value]] : [];
  })) as JsonRecord;
}

const TRANSPORT_CURRENTNESS_IDENTITY_FIELDS = [
  'stage_run_id',
  'source_fingerprint',
  'idempotency_key',
  'provider_attempt_ref',
] as const;

function identityBindingPreflight(route: JsonRecord, payload: JsonRecord, refIdentity: JsonRecord = {}) {
  const targetIdentity = record(route.target_identity);
  const authorizationReceiptIdentity = routeTransportIdentity(route);
  const transportIdentity = payloadTransportIdentity(payload);
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
      'provider_attempt_ref',
      stringValue(targetIdentity.provider_attempt_ref)
        ?? stringValue(route.provider_attempt_ref)
        ?? stringValue(authorizationReceiptIdentity.provider_attempt_ref),
    ],
    ['profile', stringValue(targetIdentity.profile)],
    ['profile_name', stringValue(targetIdentity.profile_name)],
  ] as const;
  const payloadEntries = [
    ['domain_id', stringValue(payload.domain_id)],
    ['stage_id', stringValue(payload.stage_id) ?? stringValue(refIdentity.stage_id)],
    ['stage_attempt_id', stringValue(payload.stage_attempt_id) ?? stringValue(refIdentity.stage_attempt_id)],
    ['stage_run_id', stringValue(payload.stage_run_id) ?? stringValue(transportIdentity.stage_run_id) ?? stringValue(refIdentity.stage_run_id)],
    ['task_kind', stringValue(payload.task_kind) ?? stringValue(payload.recommended_task_kind)],
    ['study_id', stringValue(payload.study_id) ?? stringValue(refIdentity.study_id)],
    ['source_fingerprint', payloadAttemptSourceFingerprint ?? stringValue(transportIdentity.source_fingerprint) ?? stringValue(refIdentity.source_fingerprint)],
    ['domain_source_fingerprint', payloadDomainSourceFingerprint],
    ['idempotency_key', stringValue(payload.idempotency_key) ?? stringValue(transportIdentity.idempotency_key) ?? stringValue(refIdentity.idempotency_key)],
    ['provider_attempt_ref', stringValue(payload.provider_attempt_ref) ?? stringValue(transportIdentity.provider_attempt_ref) ?? stringValue(refIdentity.provider_attempt_ref)],
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
  const payloadIdentity = Object.fromEntries(payloadEntries.filter(([, value]) => Boolean(value)));
  const targetIdentityPayload = Object.fromEntries(targetEntries.filter(([, value]) => Boolean(value)));
  const stageRunCloseoutIdentityRequired = TRANSPORT_CURRENTNESS_IDENTITY_FIELDS
    .some((field) => Boolean(targetIdentityPayload[field]));
  const missingRequiredCloseoutBindingFields = stageRunCloseoutIdentityRequired
    ? TRANSPORT_CURRENTNESS_IDENTITY_FIELDS.filter((field) =>
        Boolean(targetIdentityPayload[field]) && !Boolean(payloadIdentity[field])
      )
    : [];
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
    target_identity: targetIdentityPayload,
    payload_identity: payloadIdentity,
    transport_identity_observed: stageRunCloseoutIdentityRequired,
    missing_transport_identity_fields: missingRequiredCloseoutBindingFields,
    policy:
      'identity_conflict_blocks_wrong_target_mutation_missing_transport_identity_is_advisory_only',
  };
}

export function preflightDomainDispatchEvidencePayload(payload: JsonRecord, route: JsonRecord = {}) {
  const {
    progressArtifactRefs,
    domainReceiptRefs,
    typedBlockerRefs,
    noRegressionRefs,
    ownerChainRefs,
    evidenceRefs,
  } = domainDispatchEvidencePayloadRefs(payload);
  const allRefs = [
    ...progressArtifactRefs,
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
  const progressPathReady = progressArtifactRefs.length > 0;
  const selectedPayloadPath = typedBlockerPathReady
    ? 'typed_blocker_path'
    : successPathReady
      ? 'success_refs_path'
      : progressPathReady
        ? 'progress_refs_path'
      : 'blocked';
  const identityBinding = identityBindingPreflight(route, payload, localOwnerAnswerRefIdentity.identity);
  const identityConflicts = identityBinding.identity_conflicts;
  const canRecordRefsOnlyReceipt = allRefs.length > 0
    && forbiddenPlaceholderRefs.length === 0
    && forbiddenPayloadAuthorityClaims.length === 0
    && (successPathReady || typedBlockerPathReady || progressPathReady)
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
        fragment: source.fragment,
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
      ...PROGRESS_PAYLOAD_REF_FIELDS,
    ],
    supplemental_operator_payload_refs: [...SUPPLEMENTAL_PAYLOAD_REF_FIELDS],
    payload_path_policy:
      'choose_progress_refs_success_quality_refs_or_domain_owned_typed_blocker_path',
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
      progress_refs_path: {
        status: progressPathReady ? 'ready' : 'not_ready',
        required_any_operator_payload_refs: [...PROGRESS_PAYLOAD_REF_FIELDS],
        records_quality_debt: !successPathReady,
        next_declared_stage_may_start: true,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
    success_path_ready: successPathReady && forbiddenPlaceholderRefs.length === 0,
    typed_blocker_path_ready: typedBlockerPathReady && forbiddenPlaceholderRefs.length === 0,
    progress_path_ready: progressPathReady && forbiddenPlaceholderRefs.length === 0,
    can_record_refs_only_receipt: canRecordRefsOnlyReceipt,
    required_evidence_refs: requiredEvidenceRefs,
    enforced_required_evidence_refs: enforcedRequiredEvidenceRefs,
    required_evidence_refs_covered: requiredEvidenceRefsCovered,
    missing_required_evidence_refs: missingRequiredEvidenceRefs,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    forbidden_payload_authority_claims: forbiddenPayloadAuthorityClaims,
    missing_payload_fields: allRefs.length === 0
      ? ['progress_artifact_ref_or_quality_receipt_ref_or_typed_blocker_ref']
      : successCloseoutRefCount === 0 && typedBlockerRefs.length === 0 && progressArtifactRefs.length === 0
        ? ['progress_artifact_ref_or_quality_receipt_ref_or_typed_blocker_ref']
      : [],
    accepted_ref_counts: {
      progress_artifact_refs: progressArtifactRefs.length,
      domain_receipt_refs: domainReceiptRefs.length,
      typed_blocker_refs: typedBlockerRefs.length,
      no_regression_refs: noRegressionRefs.length,
      owner_chain_refs: ownerChainRefs.length,
      evidence_refs: evidenceRefs.length,
    },
    policy:
      'readable_progress_artifact_records_progress_quality_receipts_only_authorize_quality_claims',
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
