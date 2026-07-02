import fs from 'node:fs';
import path from 'node:path';

import { ensureOplStateDir, resolveOplStatePaths } from '../runway/runtime-state-paths.ts';
import type { ManagedUpdateOperation, ManagedUpdateProviderAdapterId } from './managed-update-kernel.ts';

export type ManagedUpdateReceiptApplyMode =
  | 'projection_only'
  | 'auto_apply'
  | 'controlled_apply'
  | 'manual_required';

export type ManagedUpdatePostApplyActionReceipt = {
  action_id: string;
  status: 'completed' | 'skipped' | 'manual_required' | 'failed';
  result_ref: string | null;
};

export type ManagedUpdateReloadGuidance = {
  reload_required: boolean;
  reload_recommended: boolean;
  reload_targets: string[];
  command_ref: string | null;
  reason: string | null;
};

export type ManagedUpdateReceiptStatusDetail = {
  component_state: string | null;
  auto_apply_eligible: boolean | null;
  app_background_safe: boolean | null;
  clean_managed_targets_count: number | null;
  manual_required_targets_count: number | null;
  post_apply_status: 'not_run' | 'completed' | 'manual_required' | 'failed' | 'skipped' | 'unknown';
  reload_status: 'not_required' | 'recommended' | 'required' | 'manual_required' | 'unknown';
};

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
  apply_mode: ManagedUpdateReceiptApplyMode;
  status_detail: ManagedUpdateReceiptStatusDetail;
  post_apply_action_statuses: ManagedUpdatePostApplyActionReceipt[];
  reload_guidance: ManagedUpdateReloadGuidance;
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
  apply_mode: ManagedUpdateReceiptApplyMode;
  status_detail: ManagedUpdateReceiptStatusDetail;
  post_apply_action_statuses: ManagedUpdatePostApplyActionReceipt[];
  reload_guidance: ManagedUpdateReloadGuidance;
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

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function normalizeApplyMode(value: unknown): ManagedUpdateReceiptApplyMode {
  return value === 'auto_apply'
    || value === 'controlled_apply'
    || value === 'manual_required'
    || value === 'projection_only'
    ? value
    : 'projection_only';
}

function defaultStatusDetail(): ManagedUpdateReceiptStatusDetail {
  return {
    component_state: null,
    auto_apply_eligible: null,
    app_background_safe: null,
    clean_managed_targets_count: null,
    manual_required_targets_count: null,
    post_apply_status: 'unknown',
    reload_status: 'unknown',
  };
}

function normalizePostApplyStatus(value: unknown): ManagedUpdateReceiptStatusDetail['post_apply_status'] {
  return value === 'not_run'
    || value === 'completed'
    || value === 'manual_required'
    || value === 'failed'
    || value === 'skipped'
    || value === 'unknown'
    ? value
    : 'unknown';
}

function normalizeReloadStatus(value: unknown): ManagedUpdateReceiptStatusDetail['reload_status'] {
  return value === 'not_required'
    || value === 'recommended'
    || value === 'required'
    || value === 'manual_required'
    || value === 'unknown'
    ? value
    : 'unknown';
}

function normalizeStatusDetail(value: unknown): ManagedUpdateReceiptStatusDetail {
  if (!isRecord(value)) {
    return defaultStatusDetail();
  }
  return {
    component_state: optionalString(value.component_state),
    auto_apply_eligible: optionalBoolean(value.auto_apply_eligible),
    app_background_safe: optionalBoolean(value.app_background_safe),
    clean_managed_targets_count: optionalNumber(value.clean_managed_targets_count),
    manual_required_targets_count: optionalNumber(value.manual_required_targets_count),
    post_apply_status: normalizePostApplyStatus(value.post_apply_status),
    reload_status: normalizeReloadStatus(value.reload_status),
  };
}

function normalizePostApplyActionStatus(value: unknown): ManagedUpdatePostApplyActionReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const actionId = optionalString(value.action_id);
  if (!actionId) {
    return null;
  }
  return {
    action_id: actionId,
    status: value.status === 'completed'
      || value.status === 'skipped'
      || value.status === 'manual_required'
      || value.status === 'failed'
      ? value.status
      : 'manual_required',
    result_ref: optionalString(value.result_ref),
  };
}

function normalizePostApplyActionStatuses(value: unknown) {
  return Array.isArray(value)
    ? value
      .map(normalizePostApplyActionStatus)
      .filter((entry): entry is ManagedUpdatePostApplyActionReceipt => Boolean(entry))
    : [];
}

function defaultReloadGuidance(): ManagedUpdateReloadGuidance {
  return {
    reload_required: false,
    reload_recommended: false,
    reload_targets: [],
    command_ref: null,
    reason: null,
  };
}

function normalizeReloadGuidance(value: unknown): ManagedUpdateReloadGuidance {
  if (!isRecord(value)) {
    return defaultReloadGuidance();
  }
  return {
    reload_required: value.reload_required === true,
    reload_recommended: value.reload_recommended === true,
    reload_targets: optionalStringArray(value.reload_targets),
    command_ref: optionalString(value.command_ref),
    reason: optionalString(value.reason),
  };
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
  if (value === 'runtime_toolchain_adapter') {
    return 'runtime_substrate_adapter';
  }
  if (value === 'agent_package_channel_adapter') {
    return 'capability_packages_adapter';
  }
  if (value === 'codex_exposure_status_adapter') {
    return 'codex_surface_status_adapter';
  }
  return value === 'runtime_substrate_adapter'
    || value === 'installation_carrier_status_adapter'
    || value === 'capability_packages_adapter'
    || value === 'codex_surface_status_adapter'
    || value === 'companion_tools_status_adapter'
    || value === 'workflow_profile_adapter'
    ? value
    : null;
}

function normalizeComponentId(value: unknown) {
  const componentId = optionalString(value);
  if (componentId === 'runtime_toolchain' || componentId === 'codex_cli_fallback') {
    return 'runtime_substrate';
  }
  if (componentId === 'agent_packages' || componentId === 'agent_package_channel') {
    return 'capability_packages';
  }
  if (componentId === 'capability_exposure') {
    return 'codex_surface';
  }
  return componentId;
}

function normalizeReceipt(value: unknown): ManagedUpdateComponentReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRef = optionalString(value.receipt_ref);
  const operation = normalizeOperation(value.operation);
  const componentId = normalizeComponentId(value.component_id);
  const providerId = normalizeComponentId(value.provider_id);
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
    apply_mode: normalizeApplyMode(value.apply_mode),
    status_detail: normalizeStatusDetail(value.status_detail),
    post_apply_action_statuses: normalizePostApplyActionStatuses(value.post_apply_action_statuses),
    reload_guidance: normalizeReloadGuidance(value.reload_guidance),
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
    apply_mode: input.apply_mode,
    status_detail: input.status_detail,
    post_apply_action_statuses: input.post_apply_action_statuses.map((entry) => ({ ...entry })),
    reload_guidance: {
      reload_required: input.reload_guidance.reload_required,
      reload_recommended: input.reload_guidance.reload_recommended,
      reload_targets: [...input.reload_guidance.reload_targets],
      command_ref: input.reload_guidance.command_ref,
      reason: input.reload_guidance.reason,
    },
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
