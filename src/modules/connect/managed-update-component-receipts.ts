import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString, readJsonPayloadFile } from '../../kernel/json-file.ts';
import { stringArrayValue } from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import type {
  ManagedUpdateComponentReceipt,
  ManagedUpdateComponentReceiptInput,
  ManagedUpdateOwnerRoute,
  ManagedUpdateOwnerReceiptProjection,
  ManagedUpdatePostApplyActionReceipt,
  ManagedUpdateProviderAdapterId,
  ManagedUpdateReceiptApplyMode,
  ManagedUpdateReceiptStatusDetail,
  ManagedUpdateReloadGuidance,
} from './managed-update-owner-primitives.ts';
import {
  capabilityPackageOwnerRoute,
  MANAGED_UPDATE_OWNER_ACTIONS,
  MANAGED_UPDATE_OWNER_FIELDS,
  ownerBoundaryRef,
} from './managed-update-owner-primitives.ts';

type ManagedUpdateComponentReceiptLedger = {
  surface_kind: 'opl_managed_update_component_receipt_ledger';
  version: 'opl-managed-update-component-receipts.v1';
  receipts: ManagedUpdateComponentReceipt[];
};

function nowIso() {
  return new Date().toISOString();
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

function normalizeOwnerRouteKind(value: unknown): ManagedUpdateOwnerRoute['route_kind'] {
  return value === 'projection_only'
    || value === 'manual_owner_route'
    || value === 'controlled_framework_executor'
    || value === 'clean_managed_package_executor'
    ? value
    : 'projection_only';
}

function defaultOwnerProjection(
  componentId: string,
  providerId: string,
): ManagedUpdateOwnerReceiptProjection {
  if (componentId === 'capability_packages' || providerId === 'capability_packages') {
    return capabilityPackageOwnerRoute();
  }
  return {
    owner: providerId,
    authority_surface: 'legacy_managed_update_component_receipt_without_owner_projection',
    route_kind: 'projection_only',
    readback_ref: `legacy://managed-update/${componentId}`,
    apply_owner: 'none',
    package_manager_claim: false,
    forbidden_claims: ['managed_update_kernel_is_package_manager'],
  };
}

function normalizeOwnerProjection(
  value: unknown,
  componentId: string,
  providerId: string,
): ManagedUpdateOwnerReceiptProjection {
  if (!isRecord(value)) {
    return defaultOwnerProjection(componentId, providerId);
  }
  const forbiddenClaims = stringArrayValue(value.forbidden_claims);
  const projection: ManagedUpdateOwnerReceiptProjection = {
    owner: optionalString(value.owner) ?? providerId,
    authority_surface: optionalString(value.authority_surface)
      ?? 'legacy_managed_update_component_receipt_without_owner_projection',
    route_kind: normalizeOwnerRouteKind(value.route_kind),
    readback_ref: optionalString(value.readback_ref) ?? `legacy://managed-update/${componentId}`,
    apply_owner: optionalString(value.apply_owner) ?? 'none',
    package_manager_claim: false,
    forbidden_claims: forbiddenClaims.length > 0
      ? forbiddenClaims
      : ['managed_update_kernel_is_package_manager'],
  };
  if (componentId === 'capability_packages' || providerId === 'capability_packages') {
    return capabilityPackageOwnerRoute({
      owner: projection.owner,
      authority_surface: projection.authority_surface,
      route_kind: normalizeOwnerRouteKind(projection.route_kind),
      readback_ref: projection.readback_ref,
      apply_owner: projection.apply_owner,
      forbidden_claims: projection.forbidden_claims,
    });
  }
  return projection;
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
    reload_targets: stringArrayValue(value.reload_targets),
    command_ref: optionalString(value.command_ref),
    reason: optionalString(value.reason),
  };
}

function normalizeOperation(value: unknown): ManagedUpdateComponentReceipt['operation'] | null {
  if (value === 'status'
    || value === 'check'
    || value === 'plan'
    || value === 'apply'
    || value === 'repair'
    || value === MANAGED_UPDATE_OWNER_ACTIONS.revert) {
    return value as ManagedUpdateComponentReceipt['operation'];
  }
  return null;
}

function normalizeAdapterId(value: unknown): ManagedUpdateProviderAdapterId | null {
  return value === 'runtime_substrate_adapter'
    || value === 'installation_carrier_status_adapter'
    || value === 'capability_packages_adapter'
    ? value
    : null;
}

function normalizeComponentId(value: unknown) {
  const componentId = optionalString(value);
  return componentId === 'opl_base' || componentId === 'opl_app' || componentId === 'opl_packages'
    ? componentId
    : null;
}

function normalizeProviderId(value: unknown) {
  const providerId = optionalString(value);
  return providerId === 'runtime_substrate'
    || providerId === 'installation_carrier'
    || providerId === 'capability_packages'
    ? providerId
    : null;
}

function normalizeReceipt(value: unknown): ManagedUpdateComponentReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRef = optionalString(value.receipt_ref);
  const operation = normalizeOperation(value.operation);
  const componentId = normalizeComponentId(value.component_id);
  const providerId = normalizeProviderId(value.provider_id);
  const adapterId = normalizeAdapterId(value.adapter_id);
  const activatedAt = optionalString(value.activated_at);
  if (!receiptRef || !operation || !componentId || !providerId || !adapterId || !activatedAt) {
    return null;
  }

  const field = MANAGED_UPDATE_OWNER_FIELDS;
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
    [field.sourceRef]: optionalString(value[field.sourceRef]),
    from_version: optionalString(value.from_version),
    [field.fromDigest]: optionalString(value[field.fromDigest]),
    to_version: optionalString(value.to_version),
    [field.toDigest]: optionalString(value[field.toDigest]),
    verify_result: normalizeVerifyResult(value.verify_result),
    activated_at: activatedAt,
    [field.postApplyHooks]: stringArrayValue(value[field.postApplyHooks]),
    [field.revertRef]: optionalString(value[field.revertRef]),
    repair_action: optionalString(value.repair_action),
    adapter_result_ref: optionalString(value.adapter_result_ref),
    apply_mode: normalizeApplyMode(value.apply_mode),
    owner_projection: normalizeOwnerProjection(value.owner_projection, componentId, providerId),
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
  const field = MANAGED_UPDATE_OWNER_FIELDS;
  const identity =
    input[field.toDigest]
    ?? input.to_version
    ?? input.adapter_result_ref
    ?? activatedAt;
  return ownerBoundaryRef('opl://managed-update', input.component_id, input.operation, identity);
}

function normalizeInput(input: ManagedUpdateComponentReceiptInput): ManagedUpdateComponentReceipt {
  const activatedAt = input.activated_at ?? nowIso();
  const field = MANAGED_UPDATE_OWNER_FIELDS;
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
    [field.sourceRef]: input[field.sourceRef],
    from_version: input.from_version,
    [field.fromDigest]: input[field.fromDigest],
    to_version: input.to_version,
    [field.toDigest]: input[field.toDigest],
    verify_result: input.verify_result,
    activated_at: activatedAt,
    [field.postApplyHooks]: [...input[field.postApplyHooks]],
    [field.revertRef]: input[field.revertRef] ?? null,
    repair_action: input.repair_action ?? null,
    adapter_result_ref: input.adapter_result_ref ?? null,
    apply_mode: input.apply_mode,
    owner_projection: {
      ...input.owner_projection,
      forbidden_claims: [...input.owner_projection.forbidden_claims],
    },
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
    const parsed = readJsonPayloadFile(file);
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
