import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString, readJsonPayloadFile } from '../../kernel/json-file.ts';
import { stringList } from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

export type OmaProductionConsumptionReceipt = {
  surface_kind: 'opl_oma_production_consumption_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_agent: 'opl-meta-agent';
  repo_name: 'opl-meta-agent';
  long_soak_refs: string[];
  typed_blocker_refs: string[];
  operator_evidence_refs: string[];
  source_surface: 'opl_oma_production_consumption_followthrough';
  authority_boundary: {
    refs_only: true;
    can_write_domain_truth: false;
    can_write_domain_memory_body: false;
    can_read_domain_memory_body: false;
    can_read_domain_artifact_body: false;
    can_mutate_domain_artifact_body: false;
    can_create_domain_owner_receipt: false;
    can_claim_domain_ready: false;
    can_claim_production_ready: false;
    can_authorize_quality_or_export: false;
    can_promote_default_agent_without_gate: false;
  };
};

export type OmaProductionConsumptionReceiptInput = {
  long_soak_refs?: string[];
  typed_blocker_refs?: string[];
  operator_evidence_refs?: string[];
};

export type OmaProductionConsumptionReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type OmaProductionConsumptionLedger = {
  surface_kind: 'opl_oma_production_consumption_ledger';
  version: 'opl-oma-production-consumption-ledger.v1';
  receipts: OmaProductionConsumptionReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary(): OmaProductionConsumptionReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_read_domain_memory_body: false,
    can_read_domain_artifact_body: false,
    can_mutate_domain_artifact_body: false,
    can_create_domain_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_promote_default_agent_without_gate: false,
  };
}

function emptyLedger(): OmaProductionConsumptionLedger {
  return {
    surface_kind: 'opl_oma_production_consumption_ledger',
    version: 'opl-oma-production-consumption-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().oma_production_consumption_ledger_file;
}

function allEvidenceRefs(input: OmaProductionConsumptionReceiptInput) {
  return uniqueStrings([
    ...(input.long_soak_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
    ...(input.operator_evidence_refs ?? []),
  ]);
}

function receiptRef(input: OmaProductionConsumptionReceiptInput) {
  const primaryRef = allEvidenceRefs(input)[0] ?? 'oma-production-consumption';
  return `opl://oma-production-consumption/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): OmaProductionConsumptionReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receipt_ref = optionalString(value.receipt_ref);
  if (!receipt_ref || value.target_agent !== 'opl-meta-agent' || value.repo_name !== 'opl-meta-agent') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_oma_production_consumption_receipt',
    receipt_ref,
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    target_agent: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    long_soak_refs: uniqueStrings(stringList(value.long_soak_refs)),
    typed_blocker_refs: uniqueStrings(stringList(value.typed_blocker_refs)),
    operator_evidence_refs: uniqueStrings(stringList(value.operator_evidence_refs)),
    source_surface: 'opl_oma_production_consumption_followthrough',
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies OmaProductionConsumptionReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

export function readOmaProductionConsumptionLedger(): OmaProductionConsumptionLedger {
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
      receipts: parsed.receipts
        .map(normalizeReceipt)
        .filter((receipt): receipt is OmaProductionConsumptionReceipt => Boolean(receipt)),
    };
  } catch {
    return emptyLedger();
  }
}

function writeOmaProductionConsumptionLedger(ledger: OmaProductionConsumptionLedger) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(
    paths.oma_production_consumption_ledger_file,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

function normalizeInput(input: OmaProductionConsumptionReceiptInput): OmaProductionConsumptionReceipt {
  return {
    surface_kind: 'opl_oma_production_consumption_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_agent: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    long_soak_refs: uniqueStrings(input.long_soak_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    operator_evidence_refs: uniqueStrings(input.operator_evidence_refs ?? []),
    source_surface: 'opl_oma_production_consumption_followthrough',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordOmaProductionConsumptionReceipts(
  inputs: OmaProductionConsumptionReceiptInput[],
) {
  const eligibleInputs = inputs.filter((input) => allEvidenceRefs(input).length > 0);
  if (eligibleInputs.length === 0) {
    return {
      surface_kind: 'opl_oma_production_consumption_ledger_record',
      status: 'no_eligible_oma_production_consumption_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readOmaProductionConsumptionLedger();
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
  writeOmaProductionConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_oma_production_consumption_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function listOmaProductionConsumptionReceipts() {
  return readOmaProductionConsumptionLedger().receipts;
}

export function verifyOmaProductionConsumptionReceipt(
  input: OmaProductionConsumptionReceiptVerifyInput = {},
) {
  const ledger = readOmaProductionConsumptionLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_oma_production_consumption_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'oma_production_consumption_receipt_gate',
        blocker_id: 'oma_production_consumption_receipt_not_found',
        required_owner: 'app_live_operator_or_release_owner',
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
  writeOmaProductionConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_oma_production_consumption_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function omaProductionConsumptionLedgerFilePath() {
  return path.resolve(ledgerPath());
}
