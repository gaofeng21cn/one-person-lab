import fs from 'node:fs';

import { FrameworkContractError } from './contracts.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

export type MagManifestSustainedConsumptionReceipt = {
  surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_receipt';
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
  source_surface: 'opl_mag_manifest_sustained_consumption_followthrough_refs';
  source_ref: string | null;
  authority_boundary: ReturnType<typeof refsOnlyAuthorityBoundary>;
};

export type MagManifestSustainedConsumptionReceiptInput = {
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

export type MagManifestSustainedConsumptionReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type MagManifestSustainedConsumptionLedger = {
  surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_ledger';
  version: 'opl-mag-manifest-sustained-consumption-followthrough-ledger.v1';
  receipts: MagManifestSustainedConsumptionReceipt[];
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
  'grant_artifact_body',
  'grant_artifact_content',
  'grant_truth_body',
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
  'claims_grant_ready',
  'claims_human_approval_obtained',
  'claims_provider_long_soak_complete',
  'claims_quality_ready',
  'claims_submission_ready',
  'claims_submission_ready_export',
  'closes_app_sustained_consumption',
  'closes_grant_ready',
  'closes_provider_long_soak',
  'closes_submission_ready',
  'export_ready',
  'grant_ready',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
    opl: 'mag_manifest_sustained_consumption_followthrough_ledger_refs_only',
    domain: 'med_autogrant_manifest_consumption_payload_authority',
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
    can_claim_grant_ready: false,
    can_claim_quality_ready: false,
    can_claim_export_ready: false,
    can_claim_submission_ready: false,
    can_claim_provider_long_soak_complete: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): MagManifestSustainedConsumptionLedger {
  return {
    surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_ledger',
    version: 'opl-mag-manifest-sustained-consumption-followthrough-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().mag_manifest_sustained_consumption_ledger_file;
}

function allEvidenceRefs(input: MagManifestSustainedConsumptionReceiptInput) {
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

function successRefs(input: MagManifestSustainedConsumptionReceiptInput) {
  return SUCCESS_REF_FIELDS.flatMap((field) => input[field] ?? []);
}

export function magManifestSustainedConsumptionTargetKey(value: unknown) {
  const target = isRecord(value) ? value : {};
  const explicit = optionalString(target.target_key);
  if (explicit) {
    return explicit;
  }
  return [
    optionalString(target.domain_id),
    optionalString(target.source_surface),
    optionalString(target.workorder_kind) ?? 'manifest_sustained_consumption_followthrough',
  ].filter(Boolean).join('/');
}

function receiptRef(input: MagManifestSustainedConsumptionReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const targetKey = magManifestSustainedConsumptionTargetKey(input.target_identity);
  const primaryRef = targetKey || allEvidenceRefs(input)[0] || 'mag-manifest-sustained-consumption';
  return `opl://mag-manifest-sustained-consumption/${encodeURIComponent(primaryRef)}`;
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
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
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
            reason: 'mag_manifest_sustained_consumption_payload_must_be_body_free',
          }]
        : []),
      ...(FORBIDDEN_CLAIM_FIELDS.has(normalized) && child === true
        ? [{
            path: pathValue,
            forbidden_value: child,
            reason:
              'mag_manifest_sustained_consumption_payload_must_not_carry_ready_or_soak_claims',
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
    .filter((key) => !ALLOWED_OPERATOR_PAYLOAD_FIELDS.has(key))
    .sort();
}

function normalizeTargetIdentity(value: unknown) {
  const target = isRecord(value) ? value : {};
  const targetKey = magManifestSustainedConsumptionTargetKey(target);
  return {
    ...target,
    ...(targetKey ? { target_key: targetKey } : {}),
  };
}

function normalizeReceipt(value: unknown): MagManifestSustainedConsumptionReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receipt_ref = optionalString(value.receipt_ref);
  if (
    !receipt_ref
    || value.source_surface !== 'opl_mag_manifest_sustained_consumption_followthrough_refs'
  ) {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_receipt',
    receipt_ref,
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    target_identity: normalizeTargetIdentity(value.target_identity),
    payload_path: value.payload_path === 'typed_blocker_path'
      ? 'typed_blocker_path'
      : 'sustained_consumption_refs_path',
    app_operator_consumption_refs: uniqueStrings(stringList(value.app_operator_consumption_refs)),
    default_caller_consumption_refs: uniqueStrings(
      stringList(value.default_caller_consumption_refs),
    ),
    owner_payload_response_refs: uniqueStrings(stringList(value.owner_payload_response_refs)),
    workspace_receipt_scaleout_evidence_refs: uniqueStrings(
      stringList(value.workspace_receipt_scaleout_evidence_refs),
    ),
    no_forbidden_write_refs: uniqueStrings(stringList(value.no_forbidden_write_refs)),
    long_soak_or_typed_blocker_refs: uniqueStrings(
      stringList(value.long_soak_or_typed_blocker_refs),
    ),
    typed_blocker_refs: uniqueStrings(stringList(value.typed_blocker_refs)),
    source_surface: 'opl_mag_manifest_sustained_consumption_followthrough_refs',
    source_ref: optionalString(value.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies MagManifestSustainedConsumptionReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function dedupeCurrentReceipts(receipts: MagManifestSustainedConsumptionReceipt[]) {
  const seenReceiptRefs = new Set<string>();
  const seenTargetKeys = new Set<string>();
  return receipts.filter((receipt) => {
    const targetKey = magManifestSustainedConsumptionTargetKey(receipt.target_identity);
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

function readMagManifestSustainedConsumptionLedger(): MagManifestSustainedConsumptionLedger {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedger();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
      return emptyLedger();
    }
    return {
      ...emptyLedger(),
      receipts: dedupeCurrentReceipts(
        parsed.receipts
          .map(normalizeReceipt)
          .filter((receipt): receipt is MagManifestSustainedConsumptionReceipt =>
            Boolean(receipt)
          ),
      ),
    };
  } catch {
    return emptyLedger();
  }
}

function writeMagManifestSustainedConsumptionLedger(
  ledger: MagManifestSustainedConsumptionLedger,
) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(
    paths.mag_manifest_sustained_consumption_ledger_file,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

export function preflightMagManifestSustainedConsumptionReceiptInput(
  input: MagManifestSustainedConsumptionReceiptInput,
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
    surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_payload_preflight',
    status: successPathReady || typedBlockerPathReady ? 'ready_to_record' : 'blocked',
    target_identity: targetIdentity,
    payload_kind: 'manifest_sustained_consumption_refs_or_typed_blocker',
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
        closes_grant_ready: false,
        closes_submission_ready: false,
        closes_provider_long_soak: false,
      },
      typed_blocker_path: {
        status: typedBlockerPathReady ? 'ready' : 'not_ready',
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        closes_app_sustained_consumption: false,
        closes_grant_ready: false,
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

export function assertMagManifestSustainedConsumptionReceiptInputReady(
  input: MagManifestSustainedConsumptionReceiptInput,
  rawPayload: Record<string, unknown> = {},
) {
  const preflight = preflightMagManifestSustainedConsumptionReceiptInput(input, rawPayload);
  if (preflight.can_record_refs_only_receipt) {
    return preflight;
  }
  throw new FrameworkContractError(
    'cli_usage_error',
    'MAG manifest sustained consumption followthrough record action requires body-free refs-only evidence.',
    {
      error_kind: preflight.unknown_payload_fields.length > 0
        ? 'mag_manifest_sustained_consumption_followthrough_payload_unknown_fields'
        : preflight.forbidden_payload_fields.length > 0
        ? 'mag_manifest_sustained_consumption_followthrough_payload_authority_claims_or_body_forbidden'
        : 'mag_manifest_sustained_consumption_followthrough_payload_preflight_blocked',
      receipt_recorded: false,
      empty_payload_template_is_success_evidence: false,
      preflight,
    },
  );
}

function normalizeInput(
  input: MagManifestSustainedConsumptionReceiptInput,
  rawPayload: Record<string, unknown> = {},
): MagManifestSustainedConsumptionReceipt {
  const preflight = assertMagManifestSustainedConsumptionReceiptInputReady(input, rawPayload);
  return {
    surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_identity: normalizeTargetIdentity(input.target_identity),
    payload_path: preflight.payload_path as MagManifestSustainedConsumptionReceipt['payload_path'],
    app_operator_consumption_refs: uniqueStrings(input.app_operator_consumption_refs ?? []),
    default_caller_consumption_refs: uniqueStrings(input.default_caller_consumption_refs ?? []),
    owner_payload_response_refs: uniqueStrings(input.owner_payload_response_refs ?? []),
    workspace_receipt_scaleout_evidence_refs: uniqueStrings(
      input.workspace_receipt_scaleout_evidence_refs ?? [],
    ),
    no_forbidden_write_refs: uniqueStrings(input.no_forbidden_write_refs ?? []),
    long_soak_or_typed_blocker_refs: uniqueStrings(input.long_soak_or_typed_blocker_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    source_surface: 'opl_mag_manifest_sustained_consumption_followthrough_refs',
    source_ref: optionalString(input.source_ref),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordMagManifestSustainedConsumptionReceipts(
  inputs: MagManifestSustainedConsumptionReceiptInput[],
  options: { rawPayloads?: Record<string, unknown>[] } = {},
) {
  const receipts = inputs.map((input, index) =>
    normalizeInput(input, options.rawPayloads?.[index] ?? {})
  );
  const ledger = readMagManifestSustainedConsumptionLedger();
  for (const receipt of receipts) {
    const receiptTargetKey = magManifestSustainedConsumptionTargetKey(receipt.target_identity);
    const existingIndex = ledger.receipts.findIndex((entry) =>
      entry.receipt_ref === receipt.receipt_ref
      || (
        Boolean(receiptTargetKey)
        && magManifestSustainedConsumptionTargetKey(entry.target_identity) === receiptTargetKey
      )
    );
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.unshift(receipt);
    }
  }
  ledger.receipts = dedupeCurrentReceipts(ledger.receipts);
  writeMagManifestSustainedConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyMagManifestSustainedConsumptionReceipt(
  input: MagManifestSustainedConsumptionReceiptVerifyInput = {},
) {
  const ledger = readMagManifestSustainedConsumptionLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'mag_manifest_sustained_consumption_followthrough_receipt_gate',
        blocker_id: 'mag_manifest_sustained_consumption_followthrough_receipt_not_found',
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
  writeMagManifestSustainedConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listMagManifestSustainedConsumptionReceipts() {
  return readMagManifestSustainedConsumptionLedger().receipts;
}
