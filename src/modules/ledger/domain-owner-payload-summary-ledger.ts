import {
  optionalString,
  readJsonReceiptLedger,
  upsertJsonReceipts,
  writeJsonReceiptLedger,
} from '../../kernel/json-file.ts';
import { record, stringList } from '../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';

export type DomainOwnerPayloadSummaryReceipt = {
  surface_kind: 'opl_domain_owner_payload_summary_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_identity: Record<string, unknown>;
  payload_path: 'success_refs_path' | 'typed_blocker_path';
  domain_owner_receipt_refs: string[];
  domain_receipt_refs: string[];
  no_regression_evidence_refs: string[];
  owner_chain_refs: string[];
  human_gate_refs: string[];
  quality_or_export_receipt_refs: string[];
  reviewer_receipt_refs: string[];
  long_soak_refs: string[];
  monitor_freshness_refs: string[];
  runtime_event_refs: string[];
  typed_blocker_refs: string[];
  source_surface: 'opl_domain_owner_payload_summary_refs';
  source_ref: string | null;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

export type DomainOwnerPayloadSummaryReceiptInput = {
  target_identity?: Record<string, unknown>;
  source_ref?: string | null;
  domain_owner_receipt_refs?: string[];
  domain_receipt_refs?: string[];
  no_regression_evidence_refs?: string[];
  owner_chain_refs?: string[];
  human_gate_refs?: string[];
  quality_or_export_receipt_refs?: string[];
  reviewer_receipt_refs?: string[];
  long_soak_refs?: string[];
  monitor_freshness_refs?: string[];
  runtime_event_refs?: string[];
  typed_blocker_refs?: string[];
  receipt_ref?: string | null;
};

export type DomainOwnerPayloadSummaryReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type DomainOwnerPayloadSummaryLedger = {
  surface_kind: 'opl_domain_owner_payload_summary_ledger';
  version: 'opl-domain-owner-payload-summary-ledger.v1';
  receipts: DomainOwnerPayloadSummaryReceipt[];
};

type PayloadPath = DomainOwnerPayloadSummaryReceipt['payload_path'];

const OWNER_SUCCESS_REF_FIELDS = [
  'domain_owner_receipt_refs',
  'no_regression_evidence_refs',
  'owner_chain_refs',
  'human_gate_refs',
  'quality_or_export_receipt_refs',
  'reviewer_receipt_refs',
  'long_soak_refs',
] as const;

const STAGE_SUCCESS_REF_FIELDS = [
  'domain_receipt_refs',
  'monitor_freshness_refs',
  'runtime_event_refs',
] as const;

const FORBIDDEN_CLAIM_FIELDS = new Set([
  'artifact_mutation_authorized',
  'body_included',
  'can_authorize_quality_or_export',
  'can_claim_domain_ready',
  'can_claim_export_ready',
  'can_claim_production_ready',
  'can_claim_visual_ready',
  'can_close_domain_ready',
  'can_close_owner_chain',
  'claim_domain_ready',
  'claim_export_ready',
  'claim_production_ready',
  'claim_visual_ready',
  'claims_artifact_mutation_authorized',
  'claims_current_package_updated',
  'claims_paper_closure',
  'claims_publication_ready',
  'closes_domain_ready',
  'closes_export_ready',
  'closes_owner_chain',
  'closes_production_ready',
  'closes_visual_ready',
  'current_package_mutation_authorized',
  'domain_ready',
  'domain_readiness_claimed',
  'export_ready',
  'export_readiness_claimed',
  'grant_ready',
  'grant_ready_claimed',
  'owner_chain_closed',
  'production_ready',
  'production_readiness_claimed',
  'production_soak_complete_claimed',
  'publication_ready_claimed',
  'quality_ready',
  'quality_ready_claimed',
  'submission_ready',
  'submission_ready_claimed',
  'success_claimed',
  'visual_ready',
  'visual_readiness_claimed',
]);

const FORBIDDEN_BODY_FIELDS = new Set([
  'artifact_body',
  'artifact_delta_body',
  'body',
  'content',
  'document_body',
  'image_body',
  'manuscript_body',
  'memory_body',
  'package_body',
  'payload_body',
  'raw_body',
  'result_body',
  'source_body',
  'study_truth',
  'table_body',
]);

function nowIso() {
  return new Date().toISOString();
}

function stringListValue(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return stringList(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'domain_owner_payload_summary_ledger_refs_only',
    domain: 'domain_repository_owner_receipt_typed_blocker_truth_quality_and_artifact_authority',
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_visual_ready: false,
    can_claim_export_ready: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): DomainOwnerPayloadSummaryLedger {
  return {
    surface_kind: 'opl_domain_owner_payload_summary_ledger',
    version: 'opl-domain-owner-payload-summary-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().domain_owner_payload_summary_ledger_file;
}

function allEvidenceRefs(input: DomainOwnerPayloadSummaryReceiptInput) {
  return uniqueStrings([
    ...(input.domain_owner_receipt_refs ?? []),
    ...(input.domain_receipt_refs ?? []),
    ...(input.no_regression_evidence_refs ?? []),
    ...(input.owner_chain_refs ?? []),
    ...(input.human_gate_refs ?? []),
    ...(input.quality_or_export_receipt_refs ?? []),
    ...(input.reviewer_receipt_refs ?? []),
    ...(input.long_soak_refs ?? []),
    ...(input.monitor_freshness_refs ?? []),
    ...(input.runtime_event_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
  ]);
}

export function domainOwnerPayloadSummaryTargetKey(value: unknown) {
  const target = record(value);
  const explicit = optionalString(target.target_key);
  if (explicit) {
    return explicit;
  }
  return [
    optionalString(target.domain_id),
    optionalString(target.source_surface),
    optionalString(target.summary_kind),
    optionalString(target.item_id) ?? optionalString(target.stage_id),
  ].filter(Boolean).join('/');
}

function receiptRef(input: DomainOwnerPayloadSummaryReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const targetKey = domainOwnerPayloadSummaryTargetKey(input.target_identity);
  const primaryRef = targetKey || allEvidenceRefs(input)[0] || 'domain-owner-payload-summary';
  return `opl://domain-owner-payload-summary/${encodeURIComponent(primaryRef)}`;
}

function successRefs(input: DomainOwnerPayloadSummaryReceiptInput, targetIdentity: Record<string, unknown>) {
  const payloadKind = optionalString(targetIdentity.payload_kind);
  if (payloadKind === 'stage_expected_receipt_or_monitor_freshness_refs') {
    return [
      ...(input.domain_receipt_refs ?? []),
      ...(input.monitor_freshness_refs ?? []),
      ...(input.runtime_event_refs ?? []),
    ];
  }
  return [
    ...(input.domain_owner_receipt_refs ?? []),
    ...(input.no_regression_evidence_refs ?? []),
    ...(input.owner_chain_refs ?? []),
    ...(input.human_gate_refs ?? []),
    ...(input.quality_or_export_receipt_refs ?? []),
    ...(input.reviewer_receipt_refs ?? []),
    ...(input.long_soak_refs ?? []),
  ];
}

function selectedPayloadPath(input: DomainOwnerPayloadSummaryReceiptInput): PayloadPath | null {
  const targetIdentity = record(input.target_identity);
  const typedBlockerRefs = input.typed_blocker_refs ?? [];
  if (typedBlockerRefs.length > 0) {
    return 'typed_blocker_path';
  }
  if (successRefs(input, targetIdentity).length > 0) {
    return 'success_refs_path';
  }
  return null;
}

function looksLikePlaceholderRef(ref: string) {
  return ref.startsWith('<') && ref.endsWith('>');
}

function forbiddenPayloadFields(value: unknown, pathParts: string[] = []): {
  path: string;
  forbidden_value: unknown;
  reason: string;
}[] {
  return Object.entries(record(value)).flatMap(([key, child]) => {
    const path = [...pathParts, key].join('.');
    const bodyFieldPresent = FORBIDDEN_BODY_FIELDS.has(key)
      && child !== null
      && child !== undefined
      && !(typeof child === 'string' && child.trim().length === 0)
      && !(Array.isArray(child) && child.length === 0);
    const readinessClaimPresent = FORBIDDEN_CLAIM_FIELDS.has(key) && child === true;
    return [
      ...(bodyFieldPresent
        ? [{
            path,
            forbidden_value: child,
            reason: 'domain_owner_payload_summary_payload_must_be_body_free',
          }]
        : []),
      ...(readinessClaimPresent
        ? [{
            path,
            forbidden_value: child,
            reason:
              'domain_owner_payload_summary_payload_must_not_carry_readiness_or_artifact_authority_claims',
          }]
        : []),
      ...forbiddenPayloadFields(child, [...pathParts, key]),
      ...(Array.isArray(child)
        ? child.flatMap((entry, index) =>
            forbiddenPayloadFields(entry, [...pathParts, `${key}[${index}]`])
          )
        : []),
    ];
  });
}

function normalizeTargetIdentity(value: unknown): Record<string, unknown> {
  const target = record(value);
  const targetKey = domainOwnerPayloadSummaryTargetKey(target);
  return {
    ...target,
    ...(targetKey ? { target_key: targetKey } : {}),
  };
}

function normalizeReceipt(value: unknown): DomainOwnerPayloadSummaryReceipt | null {
  const source = record(value);
  const receipt_ref = optionalString(source.receipt_ref);
  if (!receipt_ref || source.source_surface !== 'opl_domain_owner_payload_summary_refs') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_domain_owner_payload_summary_receipt',
    receipt_ref,
    receipt_status: source.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(source.recorded_at) ?? nowIso(),
    target_identity: normalizeTargetIdentity(source.target_identity),
    payload_path: source.payload_path === 'typed_blocker_path'
      ? 'typed_blocker_path'
      : 'success_refs_path',
    domain_owner_receipt_refs: uniqueStrings(stringListValue(source.domain_owner_receipt_refs)),
    domain_receipt_refs: uniqueStrings(stringListValue(source.domain_receipt_refs)),
    no_regression_evidence_refs: uniqueStrings(stringListValue(source.no_regression_evidence_refs)),
    owner_chain_refs: uniqueStrings(stringListValue(source.owner_chain_refs)),
    human_gate_refs: uniqueStrings(stringListValue(source.human_gate_refs)),
    quality_or_export_receipt_refs: uniqueStrings(stringListValue(source.quality_or_export_receipt_refs)),
    reviewer_receipt_refs: uniqueStrings(stringListValue(source.reviewer_receipt_refs)),
    long_soak_refs: uniqueStrings(stringListValue(source.long_soak_refs)),
    monitor_freshness_refs: uniqueStrings(stringListValue(source.monitor_freshness_refs)),
    runtime_event_refs: uniqueStrings(stringListValue(source.runtime_event_refs)),
    typed_blocker_refs: uniqueStrings(stringListValue(source.typed_blocker_refs)),
    source_surface: 'opl_domain_owner_payload_summary_refs',
    source_ref: optionalString(source.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies DomainOwnerPayloadSummaryReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function dedupeCurrentReceipts(receipts: DomainOwnerPayloadSummaryReceipt[]) {
  const seenReceiptRefs = new Set<string>();
  const seenTargetKeys = new Set<string>();
  return receipts.filter((receipt) => {
    const targetKey = domainOwnerPayloadSummaryTargetKey(receipt.target_identity);
    if (seenReceiptRefs.has(receipt.receipt_ref) || (targetKey && seenTargetKeys.has(targetKey))) {
      return false;
    }
    seenReceiptRefs.add(receipt.receipt_ref);
    if (targetKey) {
      seenTargetKeys.add(targetKey);
    }
    return true;
  });
}

function readDomainOwnerPayloadSummaryLedger(): DomainOwnerPayloadSummaryLedger {
  const ledger = readJsonReceiptLedger(ledgerPath(), emptyLedger, normalizeReceipt);
  ledger.receipts = dedupeCurrentReceipts(ledger.receipts);
  return ledger;
}

function writeDomainOwnerPayloadSummaryLedger(ledger: DomainOwnerPayloadSummaryLedger) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(paths.domain_owner_payload_summary_ledger_file, ledger);
}

export function preflightDomainOwnerPayloadSummaryReceiptInput(
  input: DomainOwnerPayloadSummaryReceiptInput,
  rawPayload: Record<string, unknown> = {},
) {
  const targetIdentity = normalizeTargetIdentity(input.target_identity);
  const payloadKind = optionalString(targetIdentity.payload_kind);
  const typedBlockerRefs = uniqueStrings(input.typed_blocker_refs ?? []);
  const successRefList = uniqueStrings(successRefs(input, targetIdentity));
  const allRefs = allEvidenceRefs(input);
  const forbiddenPlaceholderRefs = allRefs.filter(looksLikePlaceholderRef);
  const forbiddenFields = forbiddenPayloadFields(rawPayload);
  const mixedTypedBlockerAndSuccessRefs = typedBlockerRefs.length > 0 && successRefList.length > 0;
  const successPathReady = successRefList.length > 0
    && typedBlockerRefs.length === 0
    && forbiddenFields.length === 0
    && forbiddenPlaceholderRefs.length === 0;
  const typedBlockerPathReady = typedBlockerRefs.length > 0
    && successRefList.length === 0
    && forbiddenFields.length === 0
    && forbiddenPlaceholderRefs.length === 0;
  const payloadPath = typedBlockerPathReady
    ? 'typed_blocker_path'
    : successPathReady
      ? 'success_refs_path'
      : selectedPayloadPath(input) ?? 'blocked';
  return {
    surface_kind: 'opl_domain_owner_payload_summary_payload_preflight',
    status: successPathReady || typedBlockerPathReady ? 'ready_to_record' : 'blocked',
    target_identity: targetIdentity,
    payload_kind: payloadKind,
    payload_path: payloadPath,
    route_requires_domain_or_app_payload: true,
    required_any_operator_payload_refs:
      payloadKind === 'stage_expected_receipt_or_monitor_freshness_refs'
        ? [...STAGE_SUCCESS_REF_FIELDS, 'typed_blocker_refs']
        : [...OWNER_SUCCESS_REF_FIELDS, 'typed_blocker_refs'],
    payload_path_policy:
      'choose_domain_owned_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
    accepted_payload_paths: {
      success_refs_path: {
        status: successPathReady ? 'ready' : 'not_ready',
        required_any_operator_payload_refs:
          payloadKind === 'stage_expected_receipt_or_monitor_freshness_refs'
            ? [...STAGE_SUCCESS_REF_FIELDS]
            : [...OWNER_SUCCESS_REF_FIELDS],
        typed_blocker_refs_must_be_absent: true,
        closes_owner_chain: false,
        closes_expected_receipt_refs: false,
        closes_monitor_freshness: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
      typed_blocker_path: {
        status: typedBlockerPathReady ? 'ready' : 'not_ready',
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        can_generate_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
    success_path_ready: successPathReady,
    typed_blocker_path_ready: typedBlockerPathReady,
    can_record_refs_only_receipt: successPathReady || typedBlockerPathReady,
    mixed_typed_blocker_and_success_refs: mixedTypedBlockerAndSuccessRefs,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    forbidden_payload_fields: forbiddenFields,
    missing_payload_fields: allRefs.length === 0
      ? ['domain_owner_or_stage_success_refs_or_typed_blocker_refs']
      : [],
    accepted_ref_counts: {
      domain_owner_receipt_refs: input.domain_owner_receipt_refs?.length ?? 0,
      domain_receipt_refs: input.domain_receipt_refs?.length ?? 0,
      no_regression_evidence_refs: input.no_regression_evidence_refs?.length ?? 0,
      owner_chain_refs: input.owner_chain_refs?.length ?? 0,
      human_gate_refs: input.human_gate_refs?.length ?? 0,
      quality_or_export_receipt_refs: input.quality_or_export_receipt_refs?.length ?? 0,
      reviewer_receipt_refs: input.reviewer_receipt_refs?.length ?? 0,
      long_soak_refs: input.long_soak_refs?.length ?? 0,
      monitor_freshness_refs: input.monitor_freshness_refs?.length ?? 0,
      runtime_event_refs: input.runtime_event_refs?.length ?? 0,
      typed_blocker_refs: typedBlockerRefs.length,
    },
    empty_payload_template_is_success_evidence: false,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function assertDomainOwnerPayloadSummaryReceiptInputReady(
  input: DomainOwnerPayloadSummaryReceiptInput,
  rawPayload: Record<string, unknown> = {},
) {
  const preflight = preflightDomainOwnerPayloadSummaryReceiptInput(input, rawPayload);
  if (preflight.can_record_refs_only_receipt) {
    return preflight;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Domain owner payload summary record action requires body-free refs-only owner payload evidence.',
    {
      error_kind: preflight.forbidden_payload_fields.length > 0
        ? 'domain_owner_payload_summary_payload_authority_claims_or_body_forbidden'
        : 'domain_owner_payload_summary_payload_preflight_blocked',
      receipt_recorded: false,
      empty_payload_template_is_success_evidence: false,
      preflight,
    },
  );
}

function normalizeInput(
  input: DomainOwnerPayloadSummaryReceiptInput,
  rawPayload: Record<string, unknown> = {},
): DomainOwnerPayloadSummaryReceipt {
  const preflight = assertDomainOwnerPayloadSummaryReceiptInputReady(input, rawPayload);
  return {
    surface_kind: 'opl_domain_owner_payload_summary_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_identity: normalizeTargetIdentity(input.target_identity),
    payload_path: preflight.payload_path as PayloadPath,
    domain_owner_receipt_refs: uniqueStrings(input.domain_owner_receipt_refs ?? []),
    domain_receipt_refs: uniqueStrings(input.domain_receipt_refs ?? []),
    no_regression_evidence_refs: uniqueStrings(input.no_regression_evidence_refs ?? []),
    owner_chain_refs: uniqueStrings(input.owner_chain_refs ?? []),
    human_gate_refs: uniqueStrings(input.human_gate_refs ?? []),
    quality_or_export_receipt_refs: uniqueStrings(input.quality_or_export_receipt_refs ?? []),
    reviewer_receipt_refs: uniqueStrings(input.reviewer_receipt_refs ?? []),
    long_soak_refs: uniqueStrings(input.long_soak_refs ?? []),
    monitor_freshness_refs: uniqueStrings(input.monitor_freshness_refs ?? []),
    runtime_event_refs: uniqueStrings(input.runtime_event_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    source_surface: 'opl_domain_owner_payload_summary_refs',
    source_ref: optionalString(input.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordDomainOwnerPayloadSummaryReceipts(
  inputs: DomainOwnerPayloadSummaryReceiptInput[],
  options: { rawPayloads?: Record<string, unknown>[] } = {},
) {
  const receipts = inputs.map((input, index) =>
    normalizeInput(input, options.rawPayloads?.[index] ?? {})
  );
  const ledger = readDomainOwnerPayloadSummaryLedger();
  upsertJsonReceipts(ledger.receipts, receipts, (entry, receipt) => {
    const receiptTargetKey = domainOwnerPayloadSummaryTargetKey(receipt.target_identity);
    return entry.receipt_ref === receipt.receipt_ref
      || (
        Boolean(receiptTargetKey)
        && domainOwnerPayloadSummaryTargetKey(entry.target_identity) === receiptTargetKey
      );
  });
  ledger.receipts = dedupeCurrentReceipts(ledger.receipts);
  writeDomainOwnerPayloadSummaryLedger(ledger);
  return {
    surface_kind: 'opl_domain_owner_payload_summary_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyDomainOwnerPayloadSummaryReceipt(
  input: DomainOwnerPayloadSummaryReceiptVerifyInput = {},
) {
  const ledger = readDomainOwnerPayloadSummaryLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_domain_owner_payload_summary_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'domain_owner_payload_summary_receipt_gate',
        blocker_id: 'domain_owner_payload_summary_receipt_not_found',
        required_owner: 'domain_repository_or_app_live_operator',
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  const current = ledger.receipts[selectedIndex];
  const verified = {
    ...current,
    receipt_status: 'verified' as const,
  };
  ledger.receipts[selectedIndex] = verified;
  writeDomainOwnerPayloadSummaryLedger(ledger);
  return {
    surface_kind: 'opl_domain_owner_payload_summary_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listDomainOwnerPayloadSummaryReceipts() {
  return readDomainOwnerPayloadSummaryLedger().receipts;
}
