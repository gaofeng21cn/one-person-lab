import fs from 'node:fs';

import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { optionalString, readJsonPayloadFile } from '../../kernel/json-file.ts';
import { ensureOplStateDir } from '../../kernel/runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

export type StageReplayMissingReceiptReceipt = {
  surface_kind: 'opl_stage_replay_missing_receipt_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_identity: JsonRecord;
  payload_path: 'success_refs_path' | 'typed_blocker_path';
  receipt_refs: string[];
  typed_blocker_refs: string[];
  source_surface: 'opl_stage_replay_missing_receipt_workorder';
  source_ref: string | null;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

export type StageReplayMissingReceiptInput = {
  target_identity?: JsonRecord;
  source_ref?: string | null;
  receipt_refs?: string[];
  typed_blocker_refs?: string[];
  receipt_ref?: string | null;
};

export type StageReplayMissingReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type StageReplayMissingReceiptLedger = {
  surface_kind: 'opl_stage_replay_missing_receipt_ledger';
  version: 'opl-stage-replay-missing-receipt-ledger.v1';
  receipts: StageReplayMissingReceiptReceipt[];
};

const FORBIDDEN_BODY_FIELDS = new Set([
  'artifact_body',
  'body',
  'content',
  'document_body',
  'memory_body',
  'payload_body',
  'raw_body',
  'result_body',
]);

const FORBIDDEN_CLAIM_FIELDS = new Set([
  'artifact_authority',
  'can_claim_domain_ready',
  'can_claim_production_ready',
  'can_close_domain_ready',
  'can_close_production_ready',
  'claim_domain_ready',
  'claim_production_ready',
  'closes_domain_ready',
  'closes_production_ready',
  'domain_ready',
  'production_ready',
  'success_claimed',
]);

const ALLOWED_PAYLOAD_FIELDS = new Set([
  'receipt_ref',
  'receipt_refs',
  'source_ref',
  'typed_blocker_ref',
  'typed_blocker_refs',
]);

function nowIso() {
  return new Date().toISOString();
}

function stringList(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'stage_replay_missing_receipt_ledger_refs_only',
    domain: 'domain_or_human_gate_owner_receipt_or_typed_blocker_authority',
    refs_only: true,
    can_execute_domain_action: false,
    can_requery_human: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_write_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_authorize_quality_or_export: false,
    can_close_replay_receipt_ref: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    closes_domain_ready: false,
    closes_production_ready: false,
  };
}

function emptyLedger(): StageReplayMissingReceiptLedger {
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_ledger',
    version: 'opl-stage-replay-missing-receipt-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().stage_replay_missing_receipt_ledger_file;
}

export function stageReplayMissingReceiptTargetKey(value: unknown) {
  const target = isRecord(value) ? value : {};
  const explicit = optionalString(target.target_key);
  if (explicit) {
    return explicit;
  }
  return [
    optionalString(target.domain_id) ?? optionalString(target.target_domain_id),
    optionalString(target.stage_id),
    optionalString(target.missing_ref),
  ].filter(Boolean).join('/');
}

function normalizeTargetIdentity(value: unknown): JsonRecord {
  const target = isRecord(value) ? value : {};
  const targetKey = stageReplayMissingReceiptTargetKey(target);
  return {
    ...target,
    ...(targetKey ? { target_key: targetKey } : {}),
  };
}

function allRefs(input: StageReplayMissingReceiptInput) {
  return uniqueStrings([
    ...(input.receipt_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
  ]);
}

function receiptRef(input: StageReplayMissingReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const targetKey = stageReplayMissingReceiptTargetKey(input.target_identity);
  const primaryRef = targetKey || allRefs(input)[0] || 'stage-replay-missing-receipt';
  return `opl://stage-replay-missing-receipt/${encodeURIComponent(primaryRef)}`;
}

function looksLikePlaceholderRef(ref: string) {
  return ref.startsWith('<') && ref.endsWith('>');
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
}

function forbiddenPayloadFields(value: unknown, pathParts: string[] = []): Array<{
  path: string;
  forbidden_value: unknown;
  reason: string;
}> {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const normalized = normalizedKey(key);
    const path = [...pathParts, key].join('.');
    return [
      ...(FORBIDDEN_BODY_FIELDS.has(normalized)
        && child !== null
        && child !== undefined
        && !(typeof child === 'string' && child.trim().length === 0)
        && !(Array.isArray(child) && child.length === 0)
        ? [{
            path,
            forbidden_value: child,
            reason: 'stage_replay_missing_receipt_payload_must_be_body_free',
          }]
        : []),
      ...(FORBIDDEN_CLAIM_FIELDS.has(normalized) && child === true
        ? [{
            path,
            forbidden_value: child,
            reason: 'stage_replay_missing_receipt_payload_must_not_carry_ready_claims',
          }]
        : []),
      ...(isRecord(child) ? forbiddenPayloadFields(child, [...pathParts, key]) : []),
      ...(Array.isArray(child)
        ? child.flatMap((entry, index) =>
            forbiddenPayloadFields(entry, [...pathParts, `${key}[${index}]`])
          )
        : []),
    ];
  });
}

function unknownTopLevelPayloadFields(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => !ALLOWED_PAYLOAD_FIELDS.has(key))
    .sort();
}

function targetRequiredMissingRef(targetIdentity: JsonRecord) {
  return optionalString(targetIdentity.missing_ref);
}

export function preflightStageReplayMissingReceiptInput(
  input: StageReplayMissingReceiptInput,
  rawPayload: JsonRecord = {},
) {
  const targetIdentity = normalizeTargetIdentity(input.target_identity);
  const requiredMissingRef = targetRequiredMissingRef(targetIdentity);
  const receiptRefs = uniqueStrings(input.receipt_refs ?? []);
  const typedBlockerRefs = uniqueStrings(input.typed_blocker_refs ?? []);
  const receiptRefCoversMissingRef = requiredMissingRef
    ? receiptRefs.includes(requiredMissingRef)
    : false;
  const forbiddenFields = forbiddenPayloadFields(rawPayload);
  const unknownPayloadFields = unknownTopLevelPayloadFields(rawPayload);
  const forbiddenPlaceholderRefs = allRefs(input).filter(looksLikePlaceholderRef);
  const mixedTypedBlockerAndSuccessRefs = typedBlockerRefs.length > 0 && receiptRefs.length > 0;
  const successPathReady = receiptRefCoversMissingRef
    && typedBlockerRefs.length === 0
    && forbiddenFields.length === 0
    && unknownPayloadFields.length === 0
    && forbiddenPlaceholderRefs.length === 0;
  const typedBlockerPathReady = typedBlockerRefs.length > 0
    && receiptRefs.length === 0
    && forbiddenFields.length === 0
    && unknownPayloadFields.length === 0
    && forbiddenPlaceholderRefs.length === 0;
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_payload_preflight',
    status: successPathReady || typedBlockerPathReady ? 'ready_to_record' : 'blocked',
    target_identity: targetIdentity,
    payload_kind: 'stage_replay_missing_receipt_success_ref_or_typed_blocker',
    payload_path: typedBlockerPathReady
      ? 'typed_blocker_path'
      : successPathReady
        ? 'success_refs_path'
        : receiptRefs.length > 0
          ? 'success_refs_path'
          : typedBlockerRefs.length > 0
            ? 'typed_blocker_path'
            : 'blocked',
    required_success_ref: requiredMissingRef,
    route_requires_domain_or_app_payload: true,
    required_operator_payload_refs: ['receipt_refs', 'typed_blocker_refs'],
    accepted_payload_paths: {
      success_refs_path: {
        status: successPathReady ? 'ready' : 'not_ready',
        required_receipt_ref: requiredMissingRef,
        typed_blocker_refs_must_be_absent: true,
        closes_replay_receipt_ref: true,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
      typed_blocker_path: {
        status: typedBlockerPathReady ? 'ready' : 'not_ready',
        required_typed_blocker_refs: ['typed_blocker_refs'],
        success_claimed: false,
        closes_replay_receipt_ref: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
    },
    success_path_ready: successPathReady,
    typed_blocker_path_ready: typedBlockerPathReady,
    can_record_refs_only_receipt: successPathReady || typedBlockerPathReady,
    mixed_typed_blocker_and_success_refs: mixedTypedBlockerAndSuccessRefs,
    receipt_ref_covers_missing_ref: receiptRefCoversMissingRef,
    forbidden_placeholder_refs: forbiddenPlaceholderRefs,
    forbidden_payload_fields: forbiddenFields,
    unknown_payload_fields: unknownPayloadFields,
    missing_payload_fields: allRefs(input).length === 0
      ? ['receipt_refs_or_typed_blocker_refs']
      : [],
    accepted_ref_counts: {
      receipt_refs: receiptRefs.length,
      typed_blocker_refs: typedBlockerRefs.length,
    },
    empty_payload_template_is_success_evidence: false,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function assertStageReplayMissingReceiptInputReady(
  input: StageReplayMissingReceiptInput,
  rawPayload: JsonRecord = {},
) {
  const preflight = preflightStageReplayMissingReceiptInput(input, rawPayload);
  if (preflight.can_record_refs_only_receipt) {
    return preflight;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'Stage replay missing receipt record action requires body-free refs-only receipt or typed blocker evidence.',
    {
      error_kind: preflight.unknown_payload_fields.length > 0
        ? 'stage_replay_missing_receipt_payload_unknown_fields'
        : preflight.forbidden_payload_fields.length > 0
        ? 'stage_replay_missing_receipt_payload_authority_claims_or_body_forbidden'
        : 'stage_replay_missing_receipt_payload_preflight_blocked',
      receipt_recorded: false,
      empty_payload_template_is_success_evidence: false,
      preflight,
    },
  );
}

function normalizeInput(
  input: StageReplayMissingReceiptInput,
  rawPayload: JsonRecord = {},
): StageReplayMissingReceiptReceipt {
  const preflight = assertStageReplayMissingReceiptInputReady(input, rawPayload);
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_identity: normalizeTargetIdentity(input.target_identity),
    payload_path: preflight.payload_path as StageReplayMissingReceiptReceipt['payload_path'],
    receipt_refs: uniqueStrings(input.receipt_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    source_surface: 'opl_stage_replay_missing_receipt_workorder',
    source_ref: optionalString(input.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function normalizeReceipt(value: unknown): StageReplayMissingReceiptReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receipt_ref = optionalString(value.receipt_ref);
  if (!receipt_ref || value.source_surface !== 'opl_stage_replay_missing_receipt_workorder') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_stage_replay_missing_receipt_receipt',
    receipt_ref,
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    target_identity: normalizeTargetIdentity(value.target_identity),
    payload_path: value.payload_path === 'typed_blocker_path'
      ? 'typed_blocker_path'
      : 'success_refs_path',
    receipt_refs: uniqueStrings(stringList(value.receipt_refs)),
    typed_blocker_refs: uniqueStrings(stringList(value.typed_blocker_refs)),
    source_surface: 'opl_stage_replay_missing_receipt_workorder',
    source_ref: optionalString(value.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies StageReplayMissingReceiptReceipt;
  return receipt.receipt_refs.length + receipt.typed_blocker_refs.length > 0 ? receipt : null;
}

function dedupeCurrentReceipts(receipts: StageReplayMissingReceiptReceipt[]) {
  const seenReceiptRefs = new Set<string>();
  const seenTargetKeys = new Set<string>();
  return receipts.filter((receipt) => {
    const targetKey = stageReplayMissingReceiptTargetKey(receipt.target_identity);
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

function readStageReplayMissingReceiptLedger(): StageReplayMissingReceiptLedger {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedger();
  }
  try {
    const parsed = readJsonPayloadFile(file);
    if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
      return emptyLedger();
    }
    return {
      ...emptyLedger(),
      receipts: dedupeCurrentReceipts(
        parsed.receipts
          .map(normalizeReceipt)
          .filter((receipt): receipt is StageReplayMissingReceiptReceipt => Boolean(receipt)),
      ),
    };
  } catch {
    return emptyLedger();
  }
}

function writeStageReplayMissingReceiptLedger(ledger: StageReplayMissingReceiptLedger) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(
    paths.stage_replay_missing_receipt_ledger_file,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

export function recordStageReplayMissingReceiptReceipts(
  inputs: StageReplayMissingReceiptInput[],
  options: { rawPayloads?: JsonRecord[] } = {},
) {
  const receipts = inputs.map((input, index) =>
    normalizeInput(input, options.rawPayloads?.[index] ?? {})
  );
  const ledger = readStageReplayMissingReceiptLedger();
  for (const receipt of receipts) {
    const receiptTargetKey = stageReplayMissingReceiptTargetKey(receipt.target_identity);
    const existingIndex = ledger.receipts.findIndex((entry) =>
      entry.receipt_ref === receipt.receipt_ref
      || (
        Boolean(receiptTargetKey)
        && stageReplayMissingReceiptTargetKey(entry.target_identity) === receiptTargetKey
      )
    );
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.unshift(receipt);
    }
  }
  ledger.receipts = dedupeCurrentReceipts(ledger.receipts);
  writeStageReplayMissingReceiptLedger(ledger);
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyStageReplayMissingReceiptReceipt(
  input: StageReplayMissingReceiptVerifyInput = {},
) {
  const ledger = readStageReplayMissingReceiptLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_stage_replay_missing_receipt_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'stage_replay_missing_receipt_gate',
        blocker_id: 'stage_replay_missing_receipt_not_found',
        required_owner: 'domain_or_human_gate_owner',
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
  writeStageReplayMissingReceiptLedger(ledger);
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listStageReplayMissingReceiptReceipts() {
  return readStageReplayMissingReceiptLedger().receipts;
}

export function verifiedStageReplaySuccessReceiptForTarget(value: unknown) {
  const targetKey = stageReplayMissingReceiptTargetKey(value);
  if (!targetKey) {
    return null;
  }
  return listStageReplayMissingReceiptReceipts().find((receipt) =>
    receipt.receipt_status === 'verified'
    && receipt.payload_path === 'success_refs_path'
    && stageReplayMissingReceiptTargetKey(receipt.target_identity) === targetKey
  ) ?? null;
}
