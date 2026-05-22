import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

type ManagedInstallUpdateAction = 'install' | 'update' | 'reinstall';

export type ManagedInstallUpdateReceipt = {
  surface_kind: 'opl_managed_module_install_update_receipt';
  receipt_ref: string;
  receipt_status: 'recorded';
  recorded_at: string;
  module_id: string;
  repo_name: string;
  action: ManagedInstallUpdateAction;
  module_action_status: 'completed';
  reason: string;
  install_origin_before: string;
  install_origin_after: 'managed_root';
  checkout_path: string;
  managed_checkout_path: string;
  git_head_sha: string | null;
  git_sync_status: string | null;
  git_dirty: boolean | null;
  skill_sync_status: 'completed';
  skill_sync_domain: string | null;
  health_check_status: 'completed';
  source_surface: 'opl_app_startup_maintenance';
  authority_boundary: {
    refs_only: true;
    can_write_domain_truth: false;
    can_write_domain_memory_body: false;
    can_mutate_domain_artifact_body: false;
    can_authorize_quality_or_export: false;
    can_install_domain_daemon: false;
    can_claim_domain_ready: false;
    can_claim_production_ready: false;
  };
};

export type ManagedInstallUpdateReceiptInput = {
  module_id: string;
  repo_name: string;
  action: ManagedInstallUpdateAction;
  reason: string;
  install_origin_before: string;
  install_origin_after: 'managed_root';
  checkout_path: string;
  managed_checkout_path: string;
  git_head_sha?: string | null;
  git_sync_status?: string | null;
  git_dirty?: boolean | null;
  skill_sync_domain?: string | null;
};

type ManagedInstallUpdateLedger = {
  surface_kind: 'opl_managed_module_install_update_ledger';
  version: 'opl-managed-install-update-ledger.v1';
  receipts: ManagedInstallUpdateReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function refsOnlyAuthorityBoundary(): ManagedInstallUpdateReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_mutate_domain_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_install_domain_daemon: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): ManagedInstallUpdateLedger {
  return {
    surface_kind: 'opl_managed_module_install_update_ledger',
    version: 'opl-managed-install-update-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().managed_install_update_ledger_file;
}

function normalizeReceipt(value: unknown): ManagedInstallUpdateReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRef = optionalString(value.receipt_ref);
  const moduleId = optionalString(value.module_id);
  const repoName = optionalString(value.repo_name);
  const action = optionalString(value.action);
  const reason = optionalString(value.reason);
  const checkoutPath = optionalString(value.checkout_path);
  const managedCheckoutPath = optionalString(value.managed_checkout_path);
  if (
    !receiptRef
    || !moduleId
    || !repoName
    || !reason
    || !checkoutPath
    || !managedCheckoutPath
    || (action !== 'install' && action !== 'update' && action !== 'reinstall')
    || value.module_action_status !== 'completed'
    || value.install_origin_after !== 'managed_root'
    || value.skill_sync_status !== 'completed'
    || value.health_check_status !== 'completed'
  ) {
    return null;
  }

  return {
    surface_kind: 'opl_managed_module_install_update_receipt',
    receipt_ref: receiptRef,
    receipt_status: 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    module_id: moduleId,
    repo_name: repoName,
    action,
    module_action_status: 'completed',
    reason,
    install_origin_before: optionalString(value.install_origin_before) ?? 'unknown',
    install_origin_after: 'managed_root',
    checkout_path: checkoutPath,
    managed_checkout_path: managedCheckoutPath,
    git_head_sha: optionalString(value.git_head_sha),
    git_sync_status: optionalString(value.git_sync_status),
    git_dirty: typeof value.git_dirty === 'boolean' ? value.git_dirty : null,
    skill_sync_status: 'completed',
    skill_sync_domain: optionalString(value.skill_sync_domain),
    health_check_status: 'completed',
    source_surface: 'opl_app_startup_maintenance',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function readManagedInstallUpdateLedger(): ManagedInstallUpdateLedger {
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
        .filter((receipt): receipt is ManagedInstallUpdateReceipt => Boolean(receipt)),
    };
  } catch {
    return emptyLedger();
  }
}

function writeManagedInstallUpdateLedger(ledger: ManagedInstallUpdateLedger) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(paths.managed_install_update_ledger_file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function receiptRef(input: ManagedInstallUpdateReceiptInput) {
  const headOrCurrent = input.git_head_sha?.trim() || 'current';
  return `opl://managed-install-update/${input.module_id}/${input.action}/${headOrCurrent}`;
}

function normalizeInput(input: ManagedInstallUpdateReceiptInput): ManagedInstallUpdateReceipt {
  return {
    surface_kind: 'opl_managed_module_install_update_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    module_id: input.module_id,
    repo_name: input.repo_name,
    action: input.action,
    module_action_status: 'completed',
    reason: input.reason,
    install_origin_before: input.install_origin_before,
    install_origin_after: 'managed_root',
    checkout_path: input.checkout_path,
    managed_checkout_path: input.managed_checkout_path,
    git_head_sha: input.git_head_sha ?? null,
    git_sync_status: input.git_sync_status ?? null,
    git_dirty: input.git_dirty ?? null,
    skill_sync_status: 'completed',
    skill_sync_domain: input.skill_sync_domain ?? null,
    health_check_status: 'completed',
    source_surface: 'opl_app_startup_maintenance',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordManagedInstallUpdateReceipts(inputs: ManagedInstallUpdateReceiptInput[]) {
  if (inputs.length === 0) {
    return {
      surface_kind: 'opl_managed_module_install_update_ledger_record',
      status: 'no_eligible_managed_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readManagedInstallUpdateLedger();
  const receipts = inputs.map(normalizeInput);
  for (const receipt of receipts) {
    const existingIndex = ledger.receipts.findIndex((entry) =>
      entry.receipt_ref === receipt.receipt_ref
      && entry.module_id === receipt.module_id
    );
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.unshift(receipt);
    }
  }
  writeManagedInstallUpdateLedger(ledger);
  return {
    surface_kind: 'opl_managed_module_install_update_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function listManagedInstallUpdateReceipts(filters: {
  module_id?: string | null;
  repo_name?: string | null;
} = {}) {
  const moduleId = optionalString(filters.module_id);
  const repoName = optionalString(filters.repo_name);
  return readManagedInstallUpdateLedger().receipts.filter((receipt) =>
    (!moduleId || receipt.module_id === moduleId)
    && (!repoName || receipt.repo_name === repoName)
  );
}

export function managedInstallUpdateLedgerFilePath() {
  return path.resolve(ledgerPath());
}
