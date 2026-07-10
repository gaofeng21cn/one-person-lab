import fs from 'node:fs';
import path from 'node:path';

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

export type OwnerEvidenceSustainedConsumptionReceipt = {
  surface_kind: 'opl_owner_evidence_sustained_consumption_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_identity: Record<string, unknown>;
  payload_path: 'sustained_consumption_refs_path' | 'typed_blocker_path';
  app_operator_consumption_refs: string[];
  default_caller_consumption_refs: string[];
  owner_payload_response_refs: string[];
  workspace_receipt_scaleout_evidence_refs: string[];
  no_forbidden_write_refs: string[];
  long_soak_or_typed_blocker_refs: string[];
  typed_blocker_refs: string[];
  source_surface: 'opl_owner_evidence_sustained_consumption_refs';
  source_ref: string | null;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

export type OwnerEvidenceSustainedConsumptionReceiptInput = {
  target_identity?: Record<string, unknown>;
  source_ref?: string | null;
  app_operator_consumption_refs?: string[];
  default_caller_consumption_refs?: string[];
  owner_payload_response_refs?: string[];
  workspace_receipt_scaleout_evidence_refs?: string[];
  no_forbidden_write_refs?: string[];
  long_soak_or_typed_blocker_refs?: string[];
  typed_blocker_refs?: string[];
  receipt_ref?: string | null;
};

export type OwnerEvidenceSustainedConsumptionReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type OwnerEvidenceSustainedConsumptionLedger = {
  surface_kind: 'opl_owner_evidence_sustained_consumption_ledger';
  version: 'opl-owner-evidence-sustained-consumption-ledger.v1';
  receipts: OwnerEvidenceSustainedConsumptionReceipt[];
};

const SUCCESS_REF_FIELDS = [
  'app_operator_consumption_refs',
  'default_caller_consumption_refs',
  'owner_payload_response_refs',
  'workspace_receipt_scaleout_evidence_refs',
  'no_forbidden_write_refs',
  'long_soak_or_typed_blocker_refs',
] as const;

const FORBIDDEN_BODY_FIELDS = new Set([
  'artifact_body',
  'artifact_content',
  'body',
  'memory_body',
  'package_body',
  'payload_body',
  'proposal_text',
  'proposal_text_body',
  'raw_body',
]);

const FORBIDDEN_CLAIM_FIELDS = new Set([
  'claims_app_sustained_consumption_complete',
  'claims_export_ready',
  'claims_human_approval_obtained',
  'claims_provider_long_soak_complete',
  'claims_quality_ready',
  'claims_submission_ready',
  'claims_submission_ready_export',
  'closes_app_sustained_consumption',
  'closes_provider_long_soak',
  'closes_submission_ready',
  'export_ready',
  'provider_long_soak_complete',
  'quality_ready',
  'submission_ready',
  'success_claimed',
]);

const ALLOWED_OPERATOR_PAYLOAD_FIELDS = new Set([
  'app_operator_consumption_ref',
  'app_operator_consumption_refs',
  'default_caller_consumption_ref',
  'default_caller_consumption_refs',
  'long_soak_or_typed_blocker_ref',
  'long_soak_or_typed_blocker_refs',
  'no_forbidden_write_ref',
  'no_forbidden_write_refs',
  'owner_payload_response_ref',
  'owner_payload_response_refs',
  'receipt_ref',
  'source_ref',
  'typed_blocker_ref',
  'typed_blocker_refs',
  'workspace_receipt_scaleout_evidence_ref',
  'workspace_receipt_scaleout_evidence_refs',
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
    opl: 'owner_evidence_sustained_consumption_ledger_refs_only',
    domain: 'domain_owner_evidence_or_sustained_consumption_authority',
    refs_only: true,
    payload_owner: 'app_operator_or_release_default_caller',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_submit_operator_payload: false,
    can_claim_sustained_app_consumption_complete: false,
    can_claim_quality_ready: false,
    can_claim_export_ready: false,
    can_claim_submission_ready: false,
    can_claim_provider_long_soak_complete: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): OwnerEvidenceSustainedConsumptionLedger {
  return {
    surface_kind: 'opl_owner_evidence_sustained_consumption_ledger',
    version: 'opl-owner-evidence-sustained-consumption-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return path.join(resolveOplStatePaths().state_dir, 'owner-evidence-sustained-consumption-ledger.json');
}

function legacyLedgerPath() {
  return resolveOplStatePaths().owner_evidence_sustained_consumption_ledger_file;
}

function allEvidenceRefs(input: OwnerEvidenceSustainedConsumptionReceiptInput) {
  return uniqueStrings([
    ...(input.app_operator_consumption_refs ?? []),
    ...(input.default_caller_consumption_refs ?? []),
    ...(input.owner_payload_response_refs ?? []),
    ...(input.workspace_receipt_scaleout_evidence_refs ?? []),
    ...(input.no_forbidden_write_refs ?? []),
    ...(input.long_soak_or_typed_blocker_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
  ]);
}

function successRefs(input: OwnerEvidenceSustainedConsumptionReceiptInput) {
  return SUCCESS_REF_FIELDS.flatMap((field) => input[field] ?? []);
}

export function ownerEvidenceSustainedConsumptionTargetKey(value: unknown) {
  const target = record(value);
  const explicit = optionalString(target.target_key);
  if (explicit) {
    return explicit;
  }
  return [
    optionalString(target.domain_id),
    optionalString(target.source_surface),
    optionalString(target.workorder_kind) ?? 'owner_evidence_sustained_consumption',
  ].filter(Boolean).join('/');
}

function receiptRef(input: OwnerEvidenceSustainedConsumptionReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const targetKey = ownerEvidenceSustainedConsumptionTargetKey(input.target_identity);
  const primaryRef = targetKey || allEvidenceRefs(input)[0] || 'owner-evidence-sustained-consumption';
  return `opl://owner-evidence/sustained-consumption/${encodeURIComponent(primaryRef)}`;
}

function looksLikePlaceholderRef(ref: string) {
  return ref.startsWith('<') && ref.endsWith('>');
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
}

type ForbiddenPayloadField = {
  path: string;
  forbidden_value: unknown;
  reason: string;
};

function forbiddenPayloadFields(
  value: unknown,
  pathParts: string[] = [],
): ForbiddenPayloadField[] {
  return Object.entries(record(value)).flatMap(([key, child]) => {
    const pathValue = [...pathParts, key].join('.');
    const normalized = normalizedKey(key);
    return [
      ...(FORBIDDEN_BODY_FIELDS.has(normalized)
        && child !== null
        && child !== undefined
        && !(typeof child === 'string' && child.trim().length === 0)
        && !(Array.isArray(child) && child.length === 0)
        ? [{
            path: pathValue,
            forbidden_value: child,
            reason: 'owner_evidence_sustained_consumption_payload_must_be_body_free',
          }]
        : []),
      ...(FORBIDDEN_CLAIM_FIELDS.has(normalized) && child === true
        ? [{
            path: pathValue,
            forbidden_value: child,
            reason:
              'owner_evidence_sustained_consumption_payload_must_not_carry_ready_or_soak_claims',
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

function unknownTopLevelPayloadFields(value: unknown) {
  return Object.keys(record(value))
    .filter((key) => !ALLOWED_OPERATOR_PAYLOAD_FIELDS.has(key))
    .sort();
}

function normalizeTargetIdentity(value: unknown) {
  const target = record(value);
  const targetKey = ownerEvidenceSustainedConsumptionTargetKey(target);
  return {
    ...target,
    ...(targetKey ? { target_key: targetKey } : {}),
  };
}

function normalizeReceipt(value: unknown): OwnerEvidenceSustainedConsumptionReceipt | null {
  const source = record(value);
  const receipt_ref = optionalString(source.receipt_ref);
  if (
    !receipt_ref
    || source.source_surface !== 'opl_owner_evidence_sustained_consumption_refs'
  ) {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_owner_evidence_sustained_consumption_receipt',
    receipt_ref,
    receipt_status: source.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(source.recorded_at) ?? nowIso(),
    target_identity: normalizeTargetIdentity(source.target_identity),
    payload_path: source.payload_path === 'typed_blocker_path'
      ? 'typed_blocker_path'
      : 'sustained_consumption_refs_path',
    app_operator_consumption_refs: uniqueStrings(stringListValue(source.app_operator_consumption_refs)),
    default_caller_consumption_refs: uniqueStrings(
      stringListValue(source.default_caller_consumption_refs),
    ),
    owner_payload_response_refs: uniqueStrings(stringListValue(source.owner_payload_response_refs)),
    workspace_receipt_scaleout_evidence_refs: uniqueStrings(
      stringListValue(source.workspace_receipt_scaleout_evidence_refs),
    ),
    no_forbidden_write_refs: uniqueStrings(stringListValue(source.no_forbidden_write_refs)),
    long_soak_or_typed_blocker_refs: uniqueStrings(
      stringListValue(source.long_soak_or_typed_blocker_refs),
    ),
    typed_blocker_refs: uniqueStrings(stringListValue(source.typed_blocker_refs)),
    source_surface: 'opl_owner_evidence_sustained_consumption_refs',
    source_ref: optionalString(source.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies OwnerEvidenceSustainedConsumptionReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function dedupeCurrentReceipts(receipts: OwnerEvidenceSustainedConsumptionReceipt[]) {
  const seenReceiptRefs = new Set<string>();
  const seenTargetKeys = new Set<string>();
  return receipts.filter((receipt) => {
    const targetKey = ownerEvidenceSustainedConsumptionTargetKey(receipt.target_identity);
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

function readOwnerEvidenceSustainedConsumptionLedger(): OwnerEvidenceSustainedConsumptionLedger {
  const file = fs.existsSync(ledgerPath()) ? ledgerPath() : legacyLedgerPath();
  const ledger = readJsonReceiptLedger(file, emptyLedger, normalizeReceipt);
  ledger.receipts = dedupeCurrentReceipts(ledger.receipts);
  return ledger;
}

function writeOwnerEvidenceSustainedConsumptionLedger(
  ledger: OwnerEvidenceSustainedConsumptionLedger,
) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(
    path.join(paths.state_dir, 'owner-evidence-sustained-consumption-ledger.json'),
    ledger,
  );
}

export function preflightOwnerEvidenceSustainedConsumptionReceiptInput(
  input: OwnerEvidenceSustainedConsumptionReceiptInput,
  rawPayload: Record<string, unknown> = {},
) {
  const targetIdentity = normalizeTargetIdentity(input.target_identity);
  const typedBlockerRefs = uniqueStrings(input.typed_blocker_refs ?? []);
  const successRefGroups = SUCCESS_REF_FIELDS.map((field) => uniqueStrings(input[field] ?? []));
  const successRefsComplete = successRefGroups.every((refs) => refs.length > 0);
  const successRefsPartial = successRefGroups.some((refs) => refs.length > 0);
  const forbiddenFields = forbiddenPayloadFields(rawPayload);
  const unknownPayloadFields = unknownTopLevelPayloadFields(rawPayload);
  const forbiddenPlaceholderRefs = allEvidenceRefs(input).filter(looksLikePlaceholderRef);
  const mixedTypedBlockerAndSuccessRefs = typedBlockerRefs.length > 0 && successRefsPartial;
  const successPathReady = successRefsComplete
    && typedBlockerRefs.length === 0
    && forbiddenFields.length === 0
    && unknownPayloadFields.length === 0
    && forbiddenPlaceholderRefs.length === 0;
  const typedBlockerPathReady = typedBlockerRefs.length > 0
    && !successRefsPartial
    && forbiddenFields.length === 0
    && unknownPayloadFields.length === 0
    && forbiddenPlaceholderRefs.length === 0;
  const payloadPath = typedBlockerPathReady
    ? 'typed_blocker_path'
    : successPathReady
      ? 'sustained_consumption_refs_path'
      : typedBlockerRefs.length > 0
        ? 'typed_blocker_path'
        : successRefsPartial
          ? 'sustained_consumption_refs_path'
          : 'blocked';
  return {
    surface_kind: 'opl_owner_evidence_sustained_consumption_payload_preflight',
    status: successPathReady || typedBlockerPathReady ? 'ready_to_record' : 'blocked',
    target_identity: targetIdentity,
    payload_kind: 'owner_evidence_sustained_consumption_refs_or_typed_blocker',
    payload_path: payloadPath,
    route_requires_domain_or_app_payload: true,
    required_operator_payload_refs: [
      'app_operator_consumption_ref',
      'default_caller_consumption_ref',
      'owner_payload_response_ref',
      'workspace_receipt_scaleout_evidence_ref',
      'no_forbidden_write_ref',
      'long_soak_or_typed_blocker_ref',
      'typed_blocker_refs',
    ],
    accepted_payload_paths: {
      sustained_consumption_refs_path: {
        status: successPathReady ? 'ready' : 'not_ready',
        required_operator_payload_refs: [
          'app_operator_consumption_ref',
          'default_caller_consumption_ref',
          'owner_payload_response_ref',
          'workspace_receipt_scaleout_evidence_ref',
          'no_forbidden_write_ref',
          'long_soak_or_typed_blocker_ref',
        ],
        requires_long_soak_or_typed_blocker_ref: true,
        typed_blocker_refs_must_be_absent: true,
        closes_app_sustained_consumption: false,
        closes_submission_ready: false,
        closes_provider_long_soak: false,
      },
      typed_blocker_path: {
        status: typedBlockerPathReady ? 'ready' : 'not_ready',
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        closes_app_sustained_consumption: false,
        closes_submission_ready: false,
        closes_provider_long_soak: false,
      },
    },
    success_path_ready: successPathReady,
    typed_blocker_path_ready: typedBlockerPathReady,
    can_record_refs_only_receipt: successPathReady || typedBlockerPathReady,
    mixed_typed_blocker_and_success_refs: mixedTypedBlockerAndSuccessRefs,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    forbidden_payload_fields: forbiddenFields,
    unknown_payload_fields: unknownPayloadFields,
    missing_payload_fields: allEvidenceRefs(input).length === 0
      ? ['sustained_consumption_success_refs_or_typed_blocker_refs']
      : SUCCESS_REF_FIELDS
        .filter((field) => successRefsPartial && (input[field]?.length ?? 0) === 0)
        .map((field) => field.replace(/s$/, '')),
    accepted_ref_counts: {
      app_operator_consumption_refs: input.app_operator_consumption_refs?.length ?? 0,
      default_caller_consumption_refs: input.default_caller_consumption_refs?.length ?? 0,
      owner_payload_response_refs: input.owner_payload_response_refs?.length ?? 0,
      workspace_receipt_scaleout_evidence_refs:
        input.workspace_receipt_scaleout_evidence_refs?.length ?? 0,
      no_forbidden_write_refs: input.no_forbidden_write_refs?.length ?? 0,
      long_soak_or_typed_blocker_refs: input.long_soak_or_typed_blocker_refs?.length ?? 0,
      typed_blocker_refs: typedBlockerRefs.length,
    },
    empty_payload_template_is_success_evidence: false,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function assertOwnerEvidenceSustainedConsumptionReceiptInputReady(
  input: OwnerEvidenceSustainedConsumptionReceiptInput,
  rawPayload: Record<string, unknown> = {},
) {
  const preflight = preflightOwnerEvidenceSustainedConsumptionReceiptInput(input, rawPayload);
  if (preflight.can_record_refs_only_receipt) {
    return preflight;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Owner-evidence sustained consumption record action requires body-free refs-only evidence.',
    {
      error_kind: preflight.unknown_payload_fields.length > 0
        ? 'owner_evidence_sustained_consumption_payload_unknown_fields'
        : preflight.forbidden_payload_fields.length > 0
        ? 'owner_evidence_sustained_consumption_payload_authority_claims_or_body_forbidden'
        : 'owner_evidence_sustained_consumption_payload_preflight_blocked',
      receipt_recorded: false,
      empty_payload_template_is_success_evidence: false,
      preflight,
    },
  );
}

function normalizeInput(
  input: OwnerEvidenceSustainedConsumptionReceiptInput,
  rawPayload: Record<string, unknown> = {},
): OwnerEvidenceSustainedConsumptionReceipt {
  const preflight = assertOwnerEvidenceSustainedConsumptionReceiptInputReady(input, rawPayload);
  return {
    surface_kind: 'opl_owner_evidence_sustained_consumption_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_identity: normalizeTargetIdentity(input.target_identity),
    payload_path: preflight.payload_path as OwnerEvidenceSustainedConsumptionReceipt['payload_path'],
    app_operator_consumption_refs: uniqueStrings(input.app_operator_consumption_refs ?? []),
    default_caller_consumption_refs: uniqueStrings(input.default_caller_consumption_refs ?? []),
    owner_payload_response_refs: uniqueStrings(input.owner_payload_response_refs ?? []),
    workspace_receipt_scaleout_evidence_refs: uniqueStrings(
      input.workspace_receipt_scaleout_evidence_refs ?? [],
    ),
    no_forbidden_write_refs: uniqueStrings(input.no_forbidden_write_refs ?? []),
    long_soak_or_typed_blocker_refs: uniqueStrings(input.long_soak_or_typed_blocker_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    source_surface: 'opl_owner_evidence_sustained_consumption_refs',
    source_ref: optionalString(input.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordOwnerEvidenceSustainedConsumptionReceipts(
  inputs: OwnerEvidenceSustainedConsumptionReceiptInput[],
  options: { rawPayloads?: Record<string, unknown>[] } = {},
) {
  const receipts = inputs.map((input, index) =>
    normalizeInput(input, options.rawPayloads?.[index] ?? {})
  );
  const ledger = readOwnerEvidenceSustainedConsumptionLedger();
  upsertJsonReceipts(ledger.receipts, receipts, (entry, receipt) => {
    const receiptTargetKey = ownerEvidenceSustainedConsumptionTargetKey(receipt.target_identity);
    return entry.receipt_ref === receipt.receipt_ref
      || (
        Boolean(receiptTargetKey)
        && ownerEvidenceSustainedConsumptionTargetKey(entry.target_identity) === receiptTargetKey
      );
  });
  ledger.receipts = dedupeCurrentReceipts(ledger.receipts);
  writeOwnerEvidenceSustainedConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_owner_evidence_sustained_consumption_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyOwnerEvidenceSustainedConsumptionReceipt(
  input: OwnerEvidenceSustainedConsumptionReceiptVerifyInput = {},
) {
  const ledger = readOwnerEvidenceSustainedConsumptionLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_owner_evidence_sustained_consumption_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'owner_evidence_sustained_consumption_receipt_gate',
        blocker_id: 'owner_evidence_sustained_consumption_receipt_not_found',
        required_owner: 'app_operator_or_release_default_caller',
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
  writeOwnerEvidenceSustainedConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_owner_evidence_sustained_consumption_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listOwnerEvidenceSustainedConsumptionReceipts() {
  return readOwnerEvidenceSustainedConsumptionLedger().receipts;
}
