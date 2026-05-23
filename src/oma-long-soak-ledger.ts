import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

export type OmaLongSoakReceipt = {
  surface_kind: 'opl_oma_long_soak_receipt';
  receipt_ref: string;
  receipt_status: 'recorded';
  recorded_at: string;
  target_agent: 'opl-meta-agent';
  repo_name: 'opl-meta-agent';
  long_soak_refs: string[];
  operator_evidence_refs: string[];
  source_surface: 'opl_app_operator_long_soak';
  authority_boundary: {
    refs_only: true;
    can_write_domain_truth: false;
    can_write_domain_memory_body: false;
    can_mutate_domain_artifact_body: false;
    can_authorize_quality_or_export: false;
    can_create_domain_owner_receipt: false;
    can_claim_domain_ready: false;
    can_claim_production_ready: false;
  };
};

export type OmaLongSoakReceiptInput = {
  long_soak_refs: string[];
  operator_evidence_refs?: string[];
};

type OmaLongSoakLedger = {
  surface_kind: 'opl_oma_long_soak_ledger';
  version: 'opl-oma-long-soak-ledger.v1';
  receipts: OmaLongSoakReceipt[];
};

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
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary(): OmaLongSoakReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_mutate_domain_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_domain_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): OmaLongSoakLedger {
  return {
    surface_kind: 'opl_oma_long_soak_ledger',
    version: 'opl-oma-long-soak-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().oma_long_soak_ledger_file;
}

function receiptRef(input: OmaLongSoakReceiptInput) {
  const primaryRef = input.long_soak_refs[0]?.trim() || 'long-soak';
  return `opl://oma-long-soak/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): OmaLongSoakReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRef = optionalString(value.receipt_ref);
  const longSoakRefs = stringList(value.long_soak_refs);
  if (
    !receiptRef
    || value.target_agent !== 'opl-meta-agent'
    || value.repo_name !== 'opl-meta-agent'
    || longSoakRefs.length === 0
  ) {
    return null;
  }
  return {
    surface_kind: 'opl_oma_long_soak_receipt',
    receipt_ref: receiptRef,
    receipt_status: 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    target_agent: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    long_soak_refs: uniqueStrings(longSoakRefs),
    operator_evidence_refs: uniqueStrings(stringList(value.operator_evidence_refs)),
    source_surface: 'opl_app_operator_long_soak',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function readOmaLongSoakLedger(): OmaLongSoakLedger {
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
      receipts: parsed.receipts
        .map(normalizeReceipt)
        .filter((receipt): receipt is OmaLongSoakReceipt => Boolean(receipt)),
    };
  } catch {
    return emptyLedger();
  }
}

function writeOmaLongSoakLedger(ledger: OmaLongSoakLedger) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(paths.oma_long_soak_ledger_file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function normalizeInput(input: OmaLongSoakReceiptInput): OmaLongSoakReceipt {
  const longSoakRefs = uniqueStrings(input.long_soak_refs);
  return {
    surface_kind: 'opl_oma_long_soak_receipt',
    receipt_ref: receiptRef({ ...input, long_soak_refs: longSoakRefs }),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_agent: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    long_soak_refs: longSoakRefs,
    operator_evidence_refs: uniqueStrings(input.operator_evidence_refs ?? []),
    source_surface: 'opl_app_operator_long_soak',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordOmaLongSoakReceipts(inputs: OmaLongSoakReceiptInput[]) {
  const eligibleInputs = inputs.filter((input) =>
    uniqueStrings(input.long_soak_refs).length > 0
  );
  if (eligibleInputs.length === 0) {
    return {
      surface_kind: 'opl_oma_long_soak_ledger_record',
      status: 'no_eligible_long_soak_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readOmaLongSoakLedger();
  const receipts = eligibleInputs.map(normalizeInput);
  for (const receipt of receipts) {
    const existingIndex = ledger.receipts.findIndex((entry) =>
      entry.receipt_ref === receipt.receipt_ref
    );
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.unshift(receipt);
    }
  }
  writeOmaLongSoakLedger(ledger);
  return {
    surface_kind: 'opl_oma_long_soak_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function listOmaLongSoakReceipts() {
  return readOmaLongSoakLedger().receipts;
}

export function omaLongSoakLedgerFilePath() {
  return path.resolve(ledgerPath());
}
