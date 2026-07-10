import {
  optionalString,
  readJsonReceiptLedger,
  upsertJsonReceipts,
  writeJsonReceiptLedger,
} from '../../kernel/json-file.ts';
import { record, stringList } from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

export type ProviderLongSoakEvidenceReceipt = {
  surface_kind: 'opl_provider_long_soak_evidence_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_surface: 'provider_long_soak';
  provider_kind: 'temporal';
  long_soak_refs: string[];
  recovery_refs: string[];
  dead_letter_refs: string[];
  provider_blocker_refs: string[];
  typed_blocker_refs: string[];
  owner_acceptance_refs: string[];
  capability_requirement_ids: string[];
  source_surface: 'opl_provider_long_soak_evidence';
  authority_boundary: ProviderLongSoakEvidenceAuthorityBoundary;
};

export type ProviderLongSoakEvidenceReceiptInput = {
  long_soak_refs?: string[];
  recovery_refs?: string[];
  dead_letter_refs?: string[];
  provider_blocker_refs?: string[];
  typed_blocker_refs?: string[];
  owner_acceptance_refs?: string[];
  capability_requirement_ids?: string[];
  receipt_ref?: string | null;
};

export type ProviderLongSoakEvidenceReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type ProviderLongSoakEvidenceLedger = {
  surface_kind: 'opl_provider_long_soak_evidence_ledger';
  version: 'opl-provider-long-soak-evidence-ledger.v1';
  receipts: ProviderLongSoakEvidenceReceipt[];
};

type ProviderLongSoakEvidenceAuthorityBoundary = {
  refs_only: true;
  can_write_domain_truth: false;
  can_write_memory_body: false;
  can_read_memory_body: false;
  can_read_artifact_body: false;
  can_mutate_artifact_body: false;
  can_authorize_quality_or_export: false;
  can_create_owner_receipt: false;
  can_generate_typed_blocker: false;
  can_close_domain_ready: false;
  can_close_long_soak: false;
  can_claim_provider_production_ready: false;
  can_claim_production_ready: false;
};

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function providerLongSoakEvidenceAuthorityBoundary():
  ProviderLongSoakEvidenceAuthorityBoundary {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_domain_ready: false,
    can_close_long_soak: false,
    can_claim_provider_production_ready: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): ProviderLongSoakEvidenceLedger {
  return {
    surface_kind: 'opl_provider_long_soak_evidence_ledger',
    version: 'opl-provider-long-soak-evidence-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().provider_long_soak_evidence_ledger_file;
}

function allEvidenceRefs(input: ProviderLongSoakEvidenceReceiptInput) {
  return uniqueStrings([
    ...(input.long_soak_refs ?? []),
    ...(input.recovery_refs ?? []),
    ...(input.dead_letter_refs ?? []),
    ...(input.provider_blocker_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
    ...(input.owner_acceptance_refs ?? []),
  ]);
}

function receiptRef(input: ProviderLongSoakEvidenceReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const primaryRef = allEvidenceRefs(input)[0] ?? 'provider-long-soak-evidence';
  return `opl://provider-long-soak-evidence/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): ProviderLongSoakEvidenceReceipt | null {
  const source = record(value);
  const receipt_ref = optionalString(source.receipt_ref);
  if (!receipt_ref || source.target_surface !== 'provider_long_soak') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_provider_long_soak_evidence_receipt',
    receipt_ref,
    receipt_status: source.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(source.recorded_at) ?? nowIso(),
    target_surface: 'provider_long_soak',
    provider_kind: 'temporal',
    long_soak_refs: uniqueStrings(stringList(source.long_soak_refs)),
    recovery_refs: uniqueStrings(stringList(source.recovery_refs)),
    dead_letter_refs: uniqueStrings(stringList(source.dead_letter_refs)),
    provider_blocker_refs: uniqueStrings(stringList(source.provider_blocker_refs)),
    typed_blocker_refs: uniqueStrings(stringList(source.typed_blocker_refs)),
    owner_acceptance_refs: uniqueStrings(stringList(source.owner_acceptance_refs)),
    capability_requirement_ids: uniqueStrings(stringList(source.capability_requirement_ids)),
    source_surface: 'opl_provider_long_soak_evidence',
    authority_boundary: providerLongSoakEvidenceAuthorityBoundary(),
  } satisfies ProviderLongSoakEvidenceReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function readProviderLongSoakEvidenceLedger(): ProviderLongSoakEvidenceLedger {
  return readJsonReceiptLedger(ledgerPath(), emptyLedger, normalizeReceipt);
}

function writeProviderLongSoakEvidenceLedger(ledger: ProviderLongSoakEvidenceLedger) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(paths.provider_long_soak_evidence_ledger_file, ledger);
}

function normalizeInput(
  input: ProviderLongSoakEvidenceReceiptInput,
): ProviderLongSoakEvidenceReceipt {
  return {
    surface_kind: 'opl_provider_long_soak_evidence_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_surface: 'provider_long_soak',
    provider_kind: 'temporal',
    long_soak_refs: uniqueStrings(input.long_soak_refs ?? []),
    recovery_refs: uniqueStrings(input.recovery_refs ?? []),
    dead_letter_refs: uniqueStrings(input.dead_letter_refs ?? []),
    provider_blocker_refs: uniqueStrings(input.provider_blocker_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    owner_acceptance_refs: uniqueStrings(input.owner_acceptance_refs ?? []),
    capability_requirement_ids: uniqueStrings(input.capability_requirement_ids ?? []),
    source_surface: 'opl_provider_long_soak_evidence',
    authority_boundary: providerLongSoakEvidenceAuthorityBoundary(),
  };
}

export function recordProviderLongSoakEvidenceReceipts(
  inputs: ProviderLongSoakEvidenceReceiptInput[],
) {
  const receipts = inputs
    .filter((input) => allEvidenceRefs(input).length > 0)
    .map(normalizeInput);
  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_provider_long_soak_evidence_ledger_record',
      status: 'no_eligible_provider_long_soak_evidence_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readProviderLongSoakEvidenceLedger();
  upsertJsonReceipts(ledger.receipts, receipts, (entry, next) =>
    entry.receipt_ref === next.receipt_ref
  );
  writeProviderLongSoakEvidenceLedger(ledger);
  return {
    surface_kind: 'opl_provider_long_soak_evidence_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyProviderLongSoakEvidenceReceipt(
  input: ProviderLongSoakEvidenceReceiptVerifyInput = {},
) {
  const ledger = readProviderLongSoakEvidenceLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_provider_long_soak_evidence_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'provider_long_soak_evidence_receipt_gate',
        blocker_id: 'provider_long_soak_evidence_receipt_not_found',
        required_owner: 'one-person-lab_runtime_owner',
      },
      authority_boundary: providerLongSoakEvidenceAuthorityBoundary(),
    };
  }

  const current = ledger.receipts[selectedIndex];
  const verified = {
    ...current,
    receipt_status: 'verified' as const,
  };
  ledger.receipts[selectedIndex] = verified;
  writeProviderLongSoakEvidenceLedger(ledger);
  return {
    surface_kind: 'opl_provider_long_soak_evidence_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: providerLongSoakEvidenceAuthorityBoundary(),
  };
}

export function listProviderLongSoakEvidenceReceipts() {
  return readProviderLongSoakEvidenceLedger().receipts;
}

function refShapes(input: {
  longSoakRefs: string[];
  recoveryRefs: string[];
  deadLetterRefs: string[];
  providerBlockerRefs: string[];
  typedBlockerRefs: string[];
  ownerAcceptanceRefs: string[];
}) {
  return [
    input.longSoakRefs.length > 0 ? 'long_soak_ref' : null,
    input.recoveryRefs.length > 0 ? 'recovery_ref' : null,
    input.deadLetterRefs.length > 0 ? 'dead_letter_ref' : null,
    input.providerBlockerRefs.length > 0 ? 'provider_blocker_ref' : null,
    input.typedBlockerRefs.length > 0 ? 'typed_blocker_ref' : null,
    input.ownerAcceptanceRefs.length > 0 ? 'owner_acceptance_ref' : null,
  ].filter((entry): entry is string => Boolean(entry));
}

export function buildProviderLongSoakEvidenceProjection() {
  const receipts = listProviderLongSoakEvidenceReceipts();
  const recordedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'recorded');
  const verifiedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'verified');
  const longSoakRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) => receipt.long_soak_refs));
  const recoveryRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) => receipt.recovery_refs));
  const deadLetterRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) => receipt.dead_letter_refs));
  const providerBlockerRefs = uniqueStrings([
    ...receipts.flatMap((receipt) => receipt.provider_blocker_refs),
  ]);
  const typedBlockerRefs = uniqueStrings(receipts.flatMap((receipt) => receipt.typed_blocker_refs));
  const ownerAcceptanceRefs = uniqueStrings(
    verifiedReceipts.flatMap((receipt) => receipt.owner_acceptance_refs),
  );
  const capabilityRequirementIds = uniqueStrings(
    receipts.flatMap((receipt) => receipt.capability_requirement_ids),
  );
  const observedRefShapes = refShapes({
    longSoakRefs,
    recoveryRefs,
    deadLetterRefs,
    providerBlockerRefs,
    typedBlockerRefs,
    ownerAcceptanceRefs,
  });
  const observed = receipts.length > 0 || observedRefShapes.length > 0;
  return {
    surface_kind: 'opl_provider_long_soak_evidence_projection',
    target_surface: 'provider_long_soak',
    provider_kind: 'temporal',
    status: observed
      ? 'provider_evidence_observed_not_ready_claim'
      : 'provider_evidence_required',
    evidence_ledger_status: recordedReceipts.length > 0
      ? 'ledger_refs_recorded_verify_pending'
      : verifiedReceipts.length > 0
        ? 'ledger_refs_verified'
        : 'ledger_refs_missing',
    receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    recorded_receipt_ref_count: recordedReceipts.length,
    recorded_receipt_refs: recordedReceipts.map((receipt) => receipt.receipt_ref),
    verified_receipt_ref_count: verifiedReceipts.length,
    verified_receipt_refs: verifiedReceipts.map((receipt) => receipt.receipt_ref),
    pending_verify_receipt_ref_count: recordedReceipts.length,
    pending_verify_receipt_refs: recordedReceipts.map((receipt) => receipt.receipt_ref),
    long_soak_refs: longSoakRefs,
    recovery_refs: recoveryRefs,
    dead_letter_refs: deadLetterRefs,
    provider_blocker_refs: providerBlockerRefs,
    typed_blocker_refs: typedBlockerRefs,
    owner_acceptance_refs: ownerAcceptanceRefs,
    capability_requirement_ids: capabilityRequirementIds,
    observed_ref_shapes: observedRefShapes,
    observed_ref_counts: {
      long_soak_ref_count: longSoakRefs.length,
      recovery_ref_count: recoveryRefs.length,
      dead_letter_ref_count: deadLetterRefs.length,
      provider_blocker_ref_count: providerBlockerRefs.length,
      typed_blocker_ref_count: typedBlockerRefs.length,
      owner_acceptance_ref_count: ownerAcceptanceRefs.length,
    },
    accepted_refs_only_result_shapes: [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
      'owner_acceptance_ref',
    ],
    ready_claim_authorized: false,
    production_ready_claim_status:
      'provider_long_soak_evidence_observed_not_production_ready_claim',
    non_closing_inputs: [
      'provider_completion',
      'verified_refs_only_ledger',
      'long_evidence_ready',
      'capability_slo_satisfied',
    ],
    provider_completion_counts_as_production_ready: false,
    verified_refs_only_ledger_counts_as_production_ready: false,
    long_evidence_ready_counts_as_production_ready: false,
    capability_slo_satisfied_counts_as_production_ready: false,
    authority_boundary: providerLongSoakEvidenceAuthorityBoundary(),
  };
}
