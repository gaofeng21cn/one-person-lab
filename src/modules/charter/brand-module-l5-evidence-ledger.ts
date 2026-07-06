import { isRecord } from '../../kernel/contract-validation.ts';
import {
  optionalString,
  readJsonReceiptLedger,
  upsertJsonReceipts,
  writeJsonReceiptLedger,
} from '../../kernel/json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { stringList } from '../../kernel/json-record.ts';
import {
  FrameworkContractError } from './contracts.ts';
import type {
  BrandModuleId,
  BrandModuleL5EvidenceClassId,
  FrameworkContracts,
} from '../../kernel/types.ts';

type BrandModuleL5EvidenceReceipt = {
  surface_kind: 'opl_brand_module_l5_evidence_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  module_id: BrandModuleId;
  evidence_class_id: BrandModuleL5EvidenceClassId;
  evidence_refs: string[];
  typed_blocker_refs: string[];
  owner_acceptance_refs: string[];
  no_regression_refs: string[];
  source_surface: 'opl_brand_module_l5_evidence_ledger';
  authority_boundary: {
    refs_only: true;
    can_write_domain_truth: false;
    can_write_memory_body: false;
    can_read_memory_body: false;
    can_read_artifact_body: false;
    can_mutate_artifact_body: false;
    can_authorize_quality_or_export: false;
    can_create_owner_receipt: false;
    can_create_typed_blocker: false;
    can_claim_l5_complete: false;
    can_claim_production_ready: false;
  };
};

export type BrandModuleL5EvidenceReceiptInput = {
  module_id: BrandModuleId;
  evidence_class_id: BrandModuleL5EvidenceClassId;
  evidence_refs?: string[];
  typed_blocker_refs?: string[];
  owner_acceptance_refs?: string[];
  no_regression_refs?: string[];
  receipt_ref?: string | null;
};

export type BrandModuleL5EvidenceReceiptVerifyInput = {
  receipt_ref?: string | null;
};

export type BrandModuleL5EvidenceReceiptListInput = {
  module_id?: BrandModuleId | null;
  evidence_class_id?: BrandModuleL5EvidenceClassId | null;
};

type BrandModuleL5EvidenceLedger = {
  surface_kind: 'opl_brand_module_l5_evidence_ledger';
  version: 'brand-module-l5-evidence-ledger.v1';
  receipts: BrandModuleL5EvidenceReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary(): BrandModuleL5EvidenceReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_l5_complete: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): BrandModuleL5EvidenceLedger {
  return {
    surface_kind: 'opl_brand_module_l5_evidence_ledger',
    version: 'brand-module-l5-evidence-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().brand_module_l5_evidence_ledger_file;
}

function allEvidenceRefs(input: Pick<
  BrandModuleL5EvidenceReceiptInput,
  'evidence_refs' | 'typed_blocker_refs' | 'owner_acceptance_refs' | 'no_regression_refs'
>) {
  return uniqueStrings([
    ...(input.evidence_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
    ...(input.owner_acceptance_refs ?? []),
    ...(input.no_regression_refs ?? []),
  ]);
}

function validateInputAgainstContract(
  contracts: FrameworkContracts,
  input: BrandModuleL5EvidenceReceiptInput,
) {
  const module = contracts.brandModuleL5OperatingEvidence.modules.find((entry) =>
    entry.module_id === input.module_id
  );
  if (!module) {
    throw new FrameworkContractError('cli_usage_error', `Unknown brand module: ${input.module_id}.`, {
      module_id: input.module_id,
      allowed_module_ids: contracts.brandModuleL5OperatingEvidence.modules.map((entry) => entry.module_id),
    });
  }

  const evidenceClass = contracts.brandModuleL5OperatingEvidence.evidence_classes.find((entry) =>
    entry.class_id === input.evidence_class_id
  );
  if (!evidenceClass) {
    throw new FrameworkContractError('cli_usage_error', `Unknown L5 evidence class: ${input.evidence_class_id}.`, {
      evidence_class_id: input.evidence_class_id,
      allowed_evidence_class_ids: contracts.brandModuleL5OperatingEvidence.evidence_classes
        .map((entry) => entry.class_id),
    });
  }

  if (!module.evidence_requirements.some((entry) => entry.class_id === input.evidence_class_id)) {
    throw new FrameworkContractError('cli_usage_error', 'L5 evidence class is not declared for this module.', {
      module_id: input.module_id,
      evidence_class_id: input.evidence_class_id,
    });
  }

  const refs = allEvidenceRefs(input);
  if (refs.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'brand-modules l5-evidence record requires at least one refs-only evidence value.', {
      required_any: ['--evidence-ref', '--typed-blocker-ref', '--owner-acceptance-ref', '--no-regression-ref'],
    });
  }

  const successRefs = [
    ...(input.evidence_refs ?? []),
    ...(input.owner_acceptance_refs ?? []),
    ...(input.no_regression_refs ?? []),
  ];
  if ((input.typed_blocker_refs ?? []).length > 0 && successRefs.length > 0) {
    throw new FrameworkContractError('cli_usage_error', 'L5 evidence record cannot mix typed blockers with success evidence refs.', {
      module_id: input.module_id,
      evidence_class_id: input.evidence_class_id,
      typed_blocker_refs: input.typed_blocker_refs,
      success_refs: successRefs,
    });
  }
}

function validateListInputAgainstContract(
  contracts: FrameworkContracts,
  input: BrandModuleL5EvidenceReceiptListInput,
) {
  if (input.module_id) {
    const module = contracts.brandModuleL5OperatingEvidence.modules.find((entry) =>
      entry.module_id === input.module_id
    );
    if (!module) {
      throw new FrameworkContractError('cli_usage_error', `Unknown brand module: ${input.module_id}.`, {
        module_id: input.module_id,
        allowed_module_ids: contracts.brandModuleL5OperatingEvidence.modules.map((entry) => entry.module_id),
      });
    }
  }

  if (input.evidence_class_id) {
    const evidenceClass = contracts.brandModuleL5OperatingEvidence.evidence_classes.find((entry) =>
      entry.class_id === input.evidence_class_id
    );
    if (!evidenceClass) {
      throw new FrameworkContractError('cli_usage_error', `Unknown L5 evidence class: ${input.evidence_class_id}.`, {
        evidence_class_id: input.evidence_class_id,
        allowed_evidence_class_ids: contracts.brandModuleL5OperatingEvidence.evidence_classes
          .map((entry) => entry.class_id),
      });
    }
  }
}

function receiptRef(input: BrandModuleL5EvidenceReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const primaryRef = allEvidenceRefs(input)[0] ?? `${input.module_id}:${input.evidence_class_id}`;
  return `opl://brand-module-l5-evidence/${input.module_id}/${input.evidence_class_id}/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): BrandModuleL5EvidenceReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receipt_ref = optionalString(value.receipt_ref);
  const module_id = optionalString(value.module_id) as BrandModuleId | null;
  const evidence_class_id = optionalString(value.evidence_class_id) as BrandModuleL5EvidenceClassId | null;
  if (!receipt_ref || !module_id || !evidence_class_id) {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_brand_module_l5_evidence_receipt',
    receipt_ref,
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
    module_id,
    evidence_class_id,
    evidence_refs: uniqueStrings(stringList(value.evidence_refs)),
    typed_blocker_refs: uniqueStrings(stringList(value.typed_blocker_refs)),
    owner_acceptance_refs: uniqueStrings(stringList(value.owner_acceptance_refs)),
    no_regression_refs: uniqueStrings(stringList(value.no_regression_refs)),
    source_surface: 'opl_brand_module_l5_evidence_ledger',
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies BrandModuleL5EvidenceReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function readBrandModuleL5EvidenceLedger(): BrandModuleL5EvidenceLedger {
  return readJsonReceiptLedger(ledgerPath(), emptyLedger, normalizeReceipt);
}

function writeBrandModuleL5EvidenceLedger(ledger: BrandModuleL5EvidenceLedger) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(paths.brand_module_l5_evidence_ledger_file, ledger);
}

function normalizeInput(
  input: BrandModuleL5EvidenceReceiptInput,
): BrandModuleL5EvidenceReceipt {
  return {
    surface_kind: 'opl_brand_module_l5_evidence_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    module_id: input.module_id,
    evidence_class_id: input.evidence_class_id,
    evidence_refs: uniqueStrings(input.evidence_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    owner_acceptance_refs: uniqueStrings(input.owner_acceptance_refs ?? []),
    no_regression_refs: uniqueStrings(input.no_regression_refs ?? []),
    source_surface: 'opl_brand_module_l5_evidence_ledger',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordBrandModuleL5EvidenceReceipt(
  contracts: FrameworkContracts,
  input: BrandModuleL5EvidenceReceiptInput,
) {
  validateInputAgainstContract(contracts, input);
  const receipt = normalizeInput(input);
  const ledger = readBrandModuleL5EvidenceLedger();
  upsertJsonReceipts(ledger.receipts, [receipt], (entry, next) =>
    entry.receipt_ref === next.receipt_ref
  );
  writeBrandModuleL5EvidenceLedger(ledger);

  return {
    surface_kind: 'opl_brand_module_l5_evidence_ledger_record',
    status: 'recorded',
    recorded_receipt_count: 1,
    receipt_ref: receipt.receipt_ref,
    ledger_file: ledgerPath(),
    receipt,
    l5_claim_status_after_record: 'evidence_recorded_not_l5_claimed',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function verifyBrandModuleL5EvidenceReceipt(
  input: BrandModuleL5EvidenceReceiptVerifyInput = {},
) {
  const ledger = readBrandModuleL5EvidenceLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_brand_module_l5_evidence_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'brand_module_l5_evidence_receipt_gate',
        blocker_id: 'brand_module_l5_evidence_receipt_not_found',
        required_owner: 'module_or_release_owner',
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
  writeBrandModuleL5EvidenceLedger(ledger);

  return {
    surface_kind: 'opl_brand_module_l5_evidence_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    l5_claim_status_after_verify: 'receipt_verified_not_l5_claimed',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listBrandModuleL5EvidenceReceipts(
  contracts: FrameworkContracts,
  input: BrandModuleL5EvidenceReceiptListInput = {},
) {
  validateListInputAgainstContract(contracts, input);
  const receipts = readBrandModuleL5EvidenceLedger().receipts
    .filter((receipt) => !input.module_id || receipt.module_id === input.module_id)
    .filter((receipt) =>
      !input.evidence_class_id || receipt.evidence_class_id === input.evidence_class_id
    );
  return {
    surface_kind: 'opl_brand_module_l5_evidence_ledger_list',
    status: 'ok',
    receipt_count: receipts.length,
    verified_receipt_count: receipts.filter((receipt) => receipt.receipt_status === 'verified').length,
    ledger_file: ledgerPath(),
    filters: {
      module_id: input.module_id ?? null,
      evidence_class_id: input.evidence_class_id ?? null,
    },
    receipts,
    l5_claim_status: 'ledger_refs_only_not_l5_claimed',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
