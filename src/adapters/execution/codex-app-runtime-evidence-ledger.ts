import {
  readJsonReceiptLedger,
  upsertJsonReceipts,
  writeJsonReceiptLedger,
  verifyJsonReceipt,
} from '../../kernel/json-file.ts';
import { record, stringList, stringValue as optionalString } from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

type CodexAppRuntimeEvidenceReceipt = {
  surface_kind: 'opl_codex_app_runtime_evidence_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_surface: 'codex_app_runtime_role';
  temporal_hosted_long_soak_refs: string[];
  provider_state_linkage_refs: string[];
  operator_evidence_refs: string[];
  typed_blocker_refs: string[];
  source_surface: 'opl_codex_app_runtime_evidence';
  authority_boundary: {
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
    can_claim_production_ready: false;
    can_drive_long_running_task_loop: false;
  };
};

export type CodexAppRuntimeEvidenceReceiptInput = {
  temporal_hosted_long_soak_refs?: string[];
  provider_state_linkage_refs?: string[];
  operator_evidence_refs?: string[];
  typed_blocker_refs?: string[];
  receipt_ref?: string | null;
};

export type CodexAppRuntimeEvidenceReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type CodexAppRuntimeEvidenceLedger = {
  surface_kind: 'opl_codex_app_runtime_evidence_ledger';
  version: 'opl-codex-app-runtime-evidence-ledger.v1';
  receipts: CodexAppRuntimeEvidenceReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary(): CodexAppRuntimeEvidenceReceipt['authority_boundary'] {
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
    can_claim_production_ready: false,
    can_drive_long_running_task_loop: false,
  };
}

function emptyLedger(): CodexAppRuntimeEvidenceLedger {
  return {
    surface_kind: 'opl_codex_app_runtime_evidence_ledger',
    version: 'opl-codex-app-runtime-evidence-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().codex_app_runtime_evidence_ledger_file;
}

function allEvidenceRefs(input: CodexAppRuntimeEvidenceReceiptInput) {
  return uniqueStrings([
    ...(input.temporal_hosted_long_soak_refs ?? []),
    ...(input.provider_state_linkage_refs ?? []),
    ...(input.operator_evidence_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
  ]);
}

function receiptRef(input: CodexAppRuntimeEvidenceReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const primaryRef = allEvidenceRefs(input)[0] ?? 'codex-app-runtime-evidence';
  return `opl://codex-app-runtime-evidence/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): CodexAppRuntimeEvidenceReceipt | null {
  const source = record(value);
  const receipt_ref = optionalString(source.receipt_ref);
  if (!receipt_ref || source.target_surface !== 'codex_app_runtime_role') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_codex_app_runtime_evidence_receipt',
    receipt_ref,
    receipt_status: source.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(source.recorded_at) ?? nowIso(),
    target_surface: 'codex_app_runtime_role',
    temporal_hosted_long_soak_refs: uniqueStrings(
      stringList(source.temporal_hosted_long_soak_refs),
    ),
    provider_state_linkage_refs: uniqueStrings(stringList(source.provider_state_linkage_refs)),
    operator_evidence_refs: uniqueStrings(stringList(source.operator_evidence_refs)),
    typed_blocker_refs: uniqueStrings(stringList(source.typed_blocker_refs)),
    source_surface: 'opl_codex_app_runtime_evidence',
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies CodexAppRuntimeEvidenceReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function readCodexAppRuntimeEvidenceLedger(): CodexAppRuntimeEvidenceLedger {
  return readJsonReceiptLedger(ledgerPath(), emptyLedger, normalizeReceipt);
}

function writeCodexAppRuntimeEvidenceLedger(ledger: CodexAppRuntimeEvidenceLedger) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(paths.codex_app_runtime_evidence_ledger_file, ledger);
}

function normalizeInput(
  input: CodexAppRuntimeEvidenceReceiptInput,
): CodexAppRuntimeEvidenceReceipt {
  return {
    surface_kind: 'opl_codex_app_runtime_evidence_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_surface: 'codex_app_runtime_role',
    temporal_hosted_long_soak_refs: uniqueStrings(input.temporal_hosted_long_soak_refs ?? []),
    provider_state_linkage_refs: uniqueStrings(input.provider_state_linkage_refs ?? []),
    operator_evidence_refs: uniqueStrings(input.operator_evidence_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    source_surface: 'opl_codex_app_runtime_evidence',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordCodexAppRuntimeEvidenceReceipts(
  inputs: CodexAppRuntimeEvidenceReceiptInput[],
) {
  const receipts = inputs
    .filter((input) => allEvidenceRefs(input).length > 0)
    .map(normalizeInput);
  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_codex_app_runtime_evidence_ledger_record',
      status: 'no_eligible_codex_app_runtime_evidence_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readCodexAppRuntimeEvidenceLedger();
  upsertJsonReceipts(ledger.receipts, receipts, (entry, receipt) =>
    entry.receipt_ref === receipt.receipt_ref
  );
  writeCodexAppRuntimeEvidenceLedger(ledger);
  return {
    surface_kind: 'opl_codex_app_runtime_evidence_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyCodexAppRuntimeEvidenceReceipt(
  input: CodexAppRuntimeEvidenceReceiptVerifyInput = {},
) {
  return verifyJsonReceipt({
    read: readCodexAppRuntimeEvidenceLedger,
    write: writeCodexAppRuntimeEvidenceLedger,
    ledgerPath,
    verifySurfaceKind: 'opl_codex_app_runtime_evidence_ledger_verify',
    blocker: {
      blocker_kind: 'codex_app_runtime_evidence_receipt_gate',
      blocker_id: 'codex_app_runtime_evidence_receipt_not_found',
      required_owner: 'app_live_operator_or_opl_provider_owner',
    },
    authorityBoundary: refsOnlyAuthorityBoundary,
  }, input);
}

export function listCodexAppRuntimeEvidenceReceipts() {
  return readCodexAppRuntimeEvidenceLedger().receipts;
}
