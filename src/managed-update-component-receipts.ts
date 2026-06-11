import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';
import type { ManagedUpdateOperation, ManagedUpdateProviderAdapterId } from './managed-update-kernel.ts';

export type ManagedUpdateComponentReceipt = {
  surface_kind: 'opl_managed_update_component_receipt';
  schema_version: 'opl_managed_update_component_receipt.v1';
  receipt_ref: string;
  receipt_status: 'recorded';
  recorded_at: string;
  operation: ManagedUpdateOperation;
  component_id: string;
  provider_id: string;
  adapter_id: ManagedUpdateProviderAdapterId;
  source_manifest_ref: string | null;
  from_version: string | null;
  from_digest: string | null;
  to_version: string | null;
  to_digest: string | null;
  verify_result: 'passed' | 'failed' | 'unknown';
  activated_at: string;
  post_apply_hooks: string[];
  rollback_ref: string | null;
  repair_action: string | null;
  adapter_result_ref: string | null;
  authority_boundary: {
    can_write_domain_truth: false;
    can_write_domain_memory_body: false;
    can_mutate_domain_artifact_body: false;
    can_create_owner_receipt: false;
    can_claim_quality_or_export_verdict: false;
  };
};

export type ManagedUpdateComponentReceiptInput = {
  operation: ManagedUpdateOperation;
  component_id: string;
  provider_id: string;
  adapter_id: ManagedUpdateProviderAdapterId;
  source_manifest_ref: string | null;
  from_version: string | null;
  from_digest: string | null;
  to_version: string | null;
  to_digest: string | null;
  verify_result: 'passed' | 'failed' | 'unknown';
  activated_at?: string | null;
  post_apply_hooks: string[];
  rollback_ref?: string | null;
  repair_action?: string | null;
  adapter_result_ref?: string | null;
};

type ManagedUpdateComponentReceiptLedger = {
  surface_kind: 'opl_managed_update_component_receipt_ledger';
  version: 'opl-managed-update-component-receipts.v1';
  receipts: ManagedUpdateComponentReceipt[];
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

function optionalStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function receiptLedgerPath() {
  return resolveOplStatePaths().managed_update_component_receipt_ledger_file;
}

function emptyLedger(): ManagedUpdateComponentReceiptLedger {
  return {
    surface_kind: 'opl_managed_update_component_receipt_ledger',
    version: 'opl-managed-update-component-receipts.v1',
    receipts: [],
  };
}

function authorityBoundary(): ManagedUpdateComponentReceipt['authority_boundary'] {
  return {
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_mutate_domain_artifact_body: false,
    can_create_owner_receipt: false,
    can_claim_quality_or_export_verdict: false,
  };
}

function normalizeVerifyResult(value: unknown): ManagedUpdateComponentReceipt['verify_result'] {
  return value === 'passed' || value === 'failed' || value === 'unknown' ? value : 'unknown';
}

function normalizeOperation(value: unknown): ManagedUpdateOperation | null {
  return value === 'status'
    || value === 'check'
    || value === 'plan'
    || value === 'apply'
    || value === 'repair'
    || value === 'rollback'
    ? value
    : null;
}

function normalizeAdapterId(value: unknown): ManagedUpdateProviderAdapterId | null {
  return value === 'electron_standard_updater'
    || value === 'runtime_toolchain_adapter'
    || value === 'agent_package_channel_adapter'
    || value === 'codex_exposure_status_adapter'
    ? value
    : null;
}

function normalizeReceipt(value: unknown): ManagedUpdateComponentReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRef = optionalString(value.receipt_ref);
  const operation = normalizeOperation(value.operation);
  const componentId = optionalString(value.component_id);
  const providerId = optionalString(value.provider_id);
  const adapterId = normalizeAdapterId(value.adapter_id);
  const activatedAt = optionalString(value.activated_at);
  if (!receiptRef || !operation || !componentId || !providerId || !adapterId || !activatedAt) {
    return null;
  }

  return {
    surface_kind: 'opl_managed_update_component_receipt',
    schema_version: 'opl_managed_update_component_receipt.v1',
    receipt_ref: receiptRef,
    receipt_status: 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? activatedAt,
    operation,
    component_id: componentId,
    provider_id: providerId,
    adapter_id: adapterId,
    source_manifest_ref: optionalString(value.source_manifest_ref),
    from_version: optionalString(value.from_version),
    from_digest: optionalString(value.from_digest),
    to_version: optionalString(value.to_version),
    to_digest: optionalString(value.to_digest),
    verify_result: normalizeVerifyResult(value.verify_result),
    activated_at: activatedAt,
    post_apply_hooks: optionalStringArray(value.post_apply_hooks),
    rollback_ref: optionalString(value.rollback_ref),
    repair_action: optionalString(value.repair_action),
    adapter_result_ref: optionalString(value.adapter_result_ref),
    authority_boundary: authorityBoundary(),
  };
}

function writeLedger(ledger: ManagedUpdateComponentReceiptLedger) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(
    paths.managed_update_component_receipt_ledger_file,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

function receiptRef(input: ManagedUpdateComponentReceiptInput, activatedAt: string) {
  const identity =
    input.to_digest
    ?? input.to_version
    ?? input.adapter_result_ref
    ?? activatedAt;
  return `opl://managed-update/${input.component_id}/${input.operation}/${encodeURIComponent(identity)}`;
}

function normalizeInput(input: ManagedUpdateComponentReceiptInput): ManagedUpdateComponentReceipt {
  const activatedAt = input.activated_at ?? nowIso();
  return {
    surface_kind: 'opl_managed_update_component_receipt',
    schema_version: 'opl_managed_update_component_receipt.v1',
    receipt_ref: receiptRef(input, activatedAt),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    operation: input.operation,
    component_id: input.component_id,
    provider_id: input.provider_id,
    adapter_id: input.adapter_id,
    source_manifest_ref: input.source_manifest_ref,
    from_version: input.from_version,
    from_digest: input.from_digest,
    to_version: input.to_version,
    to_digest: input.to_digest,
    verify_result: input.verify_result,
    activated_at: activatedAt,
    post_apply_hooks: [...input.post_apply_hooks],
    rollback_ref: input.rollback_ref ?? null,
    repair_action: input.repair_action ?? null,
    adapter_result_ref: input.adapter_result_ref ?? null,
    authority_boundary: authorityBoundary(),
  };
}

export function readManagedUpdateComponentReceiptLedger(): ManagedUpdateComponentReceiptLedger {
  const file = receiptLedgerPath();
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
        .filter((receipt): receipt is ManagedUpdateComponentReceipt => Boolean(receipt)),
    };
  } catch {
    return emptyLedger();
  }
}

export function recordManagedUpdateComponentReceipts(inputs: ManagedUpdateComponentReceiptInput[]) {
  if (inputs.length === 0) {
    return {
      surface_kind: 'opl_managed_update_component_receipt_ledger_record',
      status: 'no_eligible_component_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: receiptLedgerPath(),
      receipts: [],
    };
  }

  const ledger = readManagedUpdateComponentReceiptLedger();
  const receipts = inputs.map(normalizeInput);
  for (const receipt of receipts) {
    const existingIndex = ledger.receipts.findIndex((entry) => entry.receipt_ref === receipt.receipt_ref);
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.unshift(receipt);
    }
  }
  writeLedger(ledger);
  return {
    surface_kind: 'opl_managed_update_component_receipt_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: receiptLedgerPath(),
    receipts,
  };
}

export function findLatestManagedUpdateReceipt(componentId: string) {
  return readManagedUpdateComponentReceiptLedger().receipts.find((receipt) =>
    receipt.component_id === componentId
  ) ?? null;
}

export function managedUpdateComponentReceiptLedgerFilePath() {
  return path.resolve(receiptLedgerPath());
}
