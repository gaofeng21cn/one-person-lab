import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from '../runway/index.ts';

export type OmaAppLivePathReceipt = {
  surface_kind: 'opl_oma_app_live_path_receipt';
  receipt_ref: string;
  receipt_status: 'recorded';
  recorded_at: string;
  target_agent: 'opl-meta-agent';
  repo_name: 'opl-meta-agent';
  app_live_path_refs: string[];
  live_rendering_status: 'observed';
  app_surface_ref: string | null;
  operator_evidence_refs: string[];
  source_surface: 'opl_app_operator_live_path';
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

export type OmaAppLivePathReceiptInput = {
  app_live_path_refs: string[];
  app_surface_ref?: string | null;
  operator_evidence_refs?: string[];
};

type OmaAppLivePathLedger = {
  surface_kind: 'opl_oma_app_live_path_ledger';
  version: 'opl-oma-app-live-path-ledger.v1';
  receipts: OmaAppLivePathReceipt[];
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

function refsOnlyAuthorityBoundary(): OmaAppLivePathReceipt['authority_boundary'] {
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

function emptyLedger(): OmaAppLivePathLedger {
  return {
    surface_kind: 'opl_oma_app_live_path_ledger',
    version: 'opl-oma-app-live-path-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().oma_app_live_path_ledger_file;
}

function receiptRef(input: OmaAppLivePathReceiptInput) {
  const primaryRef = input.app_live_path_refs[0]?.trim() || 'app-live-path';
  return `opl://oma-app-live-path/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): OmaAppLivePathReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRef = optionalString(value.receipt_ref);
  const appLivePathRefs = stringList(value.app_live_path_refs);
  if (
    !receiptRef
    || value.target_agent !== 'opl-meta-agent'
    || value.repo_name !== 'opl-meta-agent'
    || value.live_rendering_status !== 'observed'
    || appLivePathRefs.length === 0
  ) {
    return null;
  }
  return {
    surface_kind: 'opl_oma_app_live_path_receipt',
    receipt_ref: receiptRef,
    receipt_status: 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    target_agent: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    app_live_path_refs: uniqueStrings(appLivePathRefs),
    live_rendering_status: 'observed',
    app_surface_ref: optionalString(value.app_surface_ref),
    operator_evidence_refs: uniqueStrings(stringList(value.operator_evidence_refs)),
    source_surface: 'opl_app_operator_live_path',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function readOmaAppLivePathLedger(): OmaAppLivePathLedger {
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
        .filter((receipt): receipt is OmaAppLivePathReceipt => Boolean(receipt)),
    };
  } catch {
    return emptyLedger();
  }
}

function writeOmaAppLivePathLedger(ledger: OmaAppLivePathLedger) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(paths.oma_app_live_path_ledger_file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function normalizeInput(input: OmaAppLivePathReceiptInput): OmaAppLivePathReceipt {
  const appLivePathRefs = uniqueStrings(input.app_live_path_refs);
  return {
    surface_kind: 'opl_oma_app_live_path_receipt',
    receipt_ref: receiptRef({ ...input, app_live_path_refs: appLivePathRefs }),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_agent: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    app_live_path_refs: appLivePathRefs,
    live_rendering_status: 'observed',
    app_surface_ref: input.app_surface_ref?.trim() || null,
    operator_evidence_refs: uniqueStrings(input.operator_evidence_refs ?? []),
    source_surface: 'opl_app_operator_live_path',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordOmaAppLivePathReceipts(inputs: OmaAppLivePathReceiptInput[]) {
  const eligibleInputs = inputs.filter((input) =>
    uniqueStrings(input.app_live_path_refs).length > 0
  );
  if (eligibleInputs.length === 0) {
    return {
      surface_kind: 'opl_oma_app_live_path_ledger_record',
      status: 'no_eligible_app_live_path_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readOmaAppLivePathLedger();
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
  writeOmaAppLivePathLedger(ledger);
  return {
    surface_kind: 'opl_oma_app_live_path_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function listOmaAppLivePathReceipts() {
  return readOmaAppLivePathLedger().receipts;
}

export function omaAppLivePathLedgerFilePath() {
  return path.resolve(ledgerPath());
}
