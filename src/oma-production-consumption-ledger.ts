import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

export type OmaProductionConsumptionReceipt = {
  surface_kind: 'opl_oma_production_consumption_receipt';
  receipt_ref: string;
  receipt_status: 'recorded';
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

type OmaProductionConsumptionLedger = {
  surface_kind: 'opl_oma_production_consumption_ledger';
  version: 'opl-oma-production-consumption-ledger.v1';
  receipts: OmaProductionConsumptionReceipt[];
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
    receipt_status: 'recorded',
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
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
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

export function omaProductionConsumptionLedgerFilePath() {
  return path.resolve(ledgerPath());
}
