import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

export type AppReleaseUserPathEvidenceReceipt = {
  surface_kind: 'opl_app_release_user_path_evidence_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_surface: 'one_person_lab_app_release_user_path';
  release_package_refs: string[];
  screenshot_refs: string[];
  reload_prompt_user_path_refs: string[];
  provider_state_linkage_refs: string[];
  long_operator_evidence_refs: string[];
  typed_blocker_refs: string[];
  source_surface: 'opl_app_release_user_path_evidence';
  authority_boundary: {
    refs_only: true;
    can_write_domain_truth: false;
    can_write_memory_body: false;
    can_read_memory_body: false;
    can_read_artifact_body: false;
    can_mutate_artifact_body: false;
    can_authorize_quality_or_export: false;
    can_create_owner_receipt: false;
    can_close_domain_ready: false;
    can_claim_release_ready: false;
    can_claim_production_ready: false;
    can_close_app_release_user_path: false;
  };
};

export type AppReleaseUserPathEvidenceReceiptInput = {
  release_package_refs?: string[];
  screenshot_refs?: string[];
  reload_prompt_user_path_refs?: string[];
  provider_state_linkage_refs?: string[];
  long_operator_evidence_refs?: string[];
  typed_blocker_refs?: string[];
  receipt_ref?: string | null;
};

export type AppReleaseUserPathEvidenceReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type AppReleaseUserPathEvidenceLedger = {
  surface_kind: 'opl_app_release_user_path_evidence_ledger';
  version: 'opl-app-release-user-path-evidence-ledger.v1';
  receipts: AppReleaseUserPathEvidenceReceipt[];
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

function refsOnlyAuthorityBoundary(): AppReleaseUserPathEvidenceReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_app_release_user_path: false,
  };
}

function emptyLedger(): AppReleaseUserPathEvidenceLedger {
  return {
    surface_kind: 'opl_app_release_user_path_evidence_ledger',
    version: 'opl-app-release-user-path-evidence-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().app_release_user_path_evidence_ledger_file;
}

function allEvidenceRefs(input: AppReleaseUserPathEvidenceReceiptInput) {
  return uniqueStrings([
    ...(input.release_package_refs ?? []),
    ...(input.screenshot_refs ?? []),
    ...(input.reload_prompt_user_path_refs ?? []),
    ...(input.provider_state_linkage_refs ?? []),
    ...(input.long_operator_evidence_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
  ]);
}

function receiptRef(input: AppReleaseUserPathEvidenceReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const primaryRef = allEvidenceRefs(input)[0] ?? 'app-release-user-path';
  return `opl://app-release-user-path-evidence/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): AppReleaseUserPathEvidenceReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receipt_ref = optionalString(value.receipt_ref);
  if (!receipt_ref || value.target_surface !== 'one_person_lab_app_release_user_path') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_app_release_user_path_evidence_receipt',
    receipt_ref,
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    target_surface: 'one_person_lab_app_release_user_path',
    release_package_refs: uniqueStrings(stringList(value.release_package_refs)),
    screenshot_refs: uniqueStrings(stringList(value.screenshot_refs)),
    reload_prompt_user_path_refs: uniqueStrings(
      stringList(value.reload_prompt_user_path_refs),
    ),
    provider_state_linkage_refs: uniqueStrings(stringList(value.provider_state_linkage_refs)),
    long_operator_evidence_refs: uniqueStrings(stringList(value.long_operator_evidence_refs)),
    typed_blocker_refs: uniqueStrings(stringList(value.typed_blocker_refs)),
    source_surface: 'opl_app_release_user_path_evidence',
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies AppReleaseUserPathEvidenceReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

export function readAppReleaseUserPathEvidenceLedger(): AppReleaseUserPathEvidenceLedger {
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
        .filter(
          (receipt): receipt is AppReleaseUserPathEvidenceReceipt => Boolean(receipt),
        ),
    };
  } catch {
    return emptyLedger();
  }
}

function writeAppReleaseUserPathEvidenceLedger(
  ledger: AppReleaseUserPathEvidenceLedger,
) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(
    paths.app_release_user_path_evidence_ledger_file,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

function normalizeInput(
  input: AppReleaseUserPathEvidenceReceiptInput,
): AppReleaseUserPathEvidenceReceipt {
  return {
    surface_kind: 'opl_app_release_user_path_evidence_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_surface: 'one_person_lab_app_release_user_path',
    release_package_refs: uniqueStrings(input.release_package_refs ?? []),
    screenshot_refs: uniqueStrings(input.screenshot_refs ?? []),
    reload_prompt_user_path_refs: uniqueStrings(input.reload_prompt_user_path_refs ?? []),
    provider_state_linkage_refs: uniqueStrings(input.provider_state_linkage_refs ?? []),
    long_operator_evidence_refs: uniqueStrings(input.long_operator_evidence_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    source_surface: 'opl_app_release_user_path_evidence',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordAppReleaseUserPathEvidenceReceipts(
  inputs: AppReleaseUserPathEvidenceReceiptInput[],
) {
  const receipts = inputs
    .filter((input) => allEvidenceRefs(input).length > 0)
    .map(normalizeInput);
  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_app_release_user_path_evidence_ledger_record',
      status: 'no_eligible_app_release_user_path_evidence_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readAppReleaseUserPathEvidenceLedger();
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
  writeAppReleaseUserPathEvidenceLedger(ledger);
  return {
    surface_kind: 'opl_app_release_user_path_evidence_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyAppReleaseUserPathEvidenceReceipt(
  input: AppReleaseUserPathEvidenceReceiptVerifyInput = {},
) {
  const ledger = readAppReleaseUserPathEvidenceLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_app_release_user_path_evidence_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'app_release_user_path_evidence_receipt_gate',
        blocker_id: 'app_release_user_path_evidence_receipt_not_found',
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
  writeAppReleaseUserPathEvidenceLedger(ledger);
  return {
    surface_kind: 'opl_app_release_user_path_evidence_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listAppReleaseUserPathEvidenceReceipts() {
  return readAppReleaseUserPathEvidenceLedger().receipts;
}

export function appReleaseUserPathEvidenceLedgerFilePath() {
  return path.resolve(ledgerPath());
}
