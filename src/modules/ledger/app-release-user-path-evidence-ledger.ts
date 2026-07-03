import fs from 'node:fs';
import { readJsonPayloadFile, optionalString } from '../../kernel/json-file.ts';
import { record, stringList } from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

type AppReleaseUserPathEvidenceReceipt = {
  surface_kind: 'opl_app_release_user_path_evidence_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  receipt_path:
    | 'same_cohort_release_user_path_refs_path'
    | 'release_owner_verdict_path'
    | 'release_owner_typed_blocker_path'
    | 'release_owner_acceptance_path';
  recorded_at: string;
  target_surface: 'one_person_lab_app_release_user_path';
  release_package_refs: string[];
  screenshot_refs: string[];
  reload_prompt_user_path_refs: string[];
  provider_state_linkage_refs: string[];
  long_operator_evidence_refs: string[];
  release_owner_receipt_refs: string[];
  install_evidence_refs: string[];
  typed_blocker_refs: string[];
  owner_acceptance_refs: string[];
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
  release_owner_receipt_refs?: string[];
  install_evidence_refs?: string[];
  typed_blocker_refs?: string[];
  owner_acceptance_refs?: string[];
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
    ...(input.release_owner_receipt_refs ?? []),
    ...(input.install_evidence_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
    ...(input.owner_acceptance_refs ?? []),
  ]);
}

function successEvidenceRefs(input: AppReleaseUserPathEvidenceReceiptInput) {
  return uniqueStrings([
    ...(input.release_package_refs ?? []),
    ...(input.screenshot_refs ?? []),
    ...(input.reload_prompt_user_path_refs ?? []),
    ...(input.provider_state_linkage_refs ?? []),
    ...(input.long_operator_evidence_refs ?? []),
  ]);
}

function ownerVerdictRefs(input: AppReleaseUserPathEvidenceReceiptInput) {
  return uniqueStrings([
    ...(input.release_owner_receipt_refs ?? []),
    ...(input.install_evidence_refs ?? []),
  ]);
}

function typedBlockerRefs(input: AppReleaseUserPathEvidenceReceiptInput) {
  return uniqueStrings(input.typed_blocker_refs ?? []);
}

function ownerAcceptanceRefs(input: AppReleaseUserPathEvidenceReceiptInput) {
  return uniqueStrings(input.owner_acceptance_refs ?? []);
}

function payloadPath(input: AppReleaseUserPathEvidenceReceiptInput):
  AppReleaseUserPathEvidenceReceipt['receipt_path'] | null {
  const paths = [
    successEvidenceRefs(input).length > 0 ? 'same_cohort_release_user_path_refs_path' : null,
    ownerVerdictRefs(input).length > 0 ? 'release_owner_verdict_path' : null,
    typedBlockerRefs(input).length > 0 ? 'release_owner_typed_blocker_path' : null,
    ownerAcceptanceRefs(input).length > 0 ? 'release_owner_acceptance_path' : null,
  ].filter((entry): entry is AppReleaseUserPathEvidenceReceipt['receipt_path'] =>
    Boolean(entry)
  );
  return paths.length === 1 ? paths[0] : null;
}

export function appReleaseUserPathEvidencePayloadPreflight(
  input: AppReleaseUserPathEvidenceReceiptInput,
) {
  const successRefCount = successEvidenceRefs(input).length;
  const releaseOwnerReceiptRefCount = ownerVerdictRefs(input).length;
  const typedBlockerRefCount = typedBlockerRefs(input).length;
  const ownerAcceptanceRefCount = ownerAcceptanceRefs(input).length;
  const selectedPath = payloadPath(input);
  const refCount = successRefCount + releaseOwnerReceiptRefCount + typedBlockerRefCount
    + ownerAcceptanceRefCount;
  const conflictingPayloadFields = [
    successRefCount > 0 ? 'app_release_user_path_refs' : null,
    releaseOwnerReceiptRefCount > 0 ? 'release_owner_receipt_refs' : null,
    typedBlockerRefCount > 0 ? 'typed_blocker_refs' : null,
    ownerAcceptanceRefCount > 0 ? 'owner_acceptance_refs' : null,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_app_release_user_path_evidence_payload_preflight',
    status: selectedPath
      ? 'payload_refs_observed'
      : refCount > 0
        ? 'blocked'
        : 'payload_required',
    selected_payload_path: selectedPath ?? 'blocked',
    can_record_refs_only_receipt: selectedPath !== null,
    accepted_ref_counts: {
      release_package_refs: input.release_package_refs?.length ?? 0,
      screenshot_refs: input.screenshot_refs?.length ?? 0,
      reload_prompt_user_path_refs: input.reload_prompt_user_path_refs?.length ?? 0,
      provider_state_linkage_refs: input.provider_state_linkage_refs?.length ?? 0,
      long_operator_evidence_refs: input.long_operator_evidence_refs?.length ?? 0,
      release_owner_receipt_refs: input.release_owner_receipt_refs?.length ?? 0,
      install_evidence_refs: input.install_evidence_refs?.length ?? 0,
      typed_blocker_refs: typedBlockerRefCount,
      owner_acceptance_refs: ownerAcceptanceRefCount,
    },
    conflicting_payload_fields: selectedPath || refCount === 0 ? [] : conflictingPayloadFields,
    payload_path_policy:
      'operator_must_choose_same_cohort_release_user_path_refs_release_owner_verdict_owner_acceptance_or_typed_blocker_path_empty_template_blocks',
    required_any: [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
      'release_owner_receipt_refs',
      'install_evidence_refs',
      'typed_blocker_refs',
      'owner_acceptance_refs',
    ],
    empty_payload_template_is_success_evidence: false,
    payload_owner: 'app_live_operator_or_release_owner',
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
      can_close_app_release_user_path: false,
    },
  };
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
  const source = record(value);
  if (source !== value) {
    return null;
  }
  const receipt_ref = optionalString(source.receipt_ref);
  if (!receipt_ref || source.target_surface !== 'one_person_lab_app_release_user_path') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_app_release_user_path_evidence_receipt',
    receipt_ref,
    receipt_status: source.receipt_status === 'verified' ? 'verified' : 'recorded',
    receipt_path: source.receipt_path === 'release_owner_verdict_path'
      ? 'release_owner_verdict_path'
      : source.receipt_path === 'release_owner_typed_blocker_path'
        ? 'release_owner_typed_blocker_path'
        : source.receipt_path === 'release_owner_acceptance_path'
          ? 'release_owner_acceptance_path'
        : stringList(source.release_owner_receipt_refs).length > 0
          ? 'release_owner_verdict_path'
          : stringList(source.owner_acceptance_refs).length > 0
            ? 'release_owner_acceptance_path'
          : stringList(source.typed_blocker_refs).length > 0
            ? 'release_owner_typed_blocker_path'
            : 'same_cohort_release_user_path_refs_path',
    recorded_at: optionalString(source.recorded_at) ?? nowIso(),
    target_surface: 'one_person_lab_app_release_user_path',
    release_package_refs: uniqueStrings(stringList(source.release_package_refs)),
    screenshot_refs: uniqueStrings(stringList(source.screenshot_refs)),
    reload_prompt_user_path_refs: uniqueStrings(
      stringList(source.reload_prompt_user_path_refs),
    ),
    provider_state_linkage_refs: uniqueStrings(stringList(source.provider_state_linkage_refs)),
    long_operator_evidence_refs: uniqueStrings(stringList(source.long_operator_evidence_refs)),
    release_owner_receipt_refs: uniqueStrings(stringList(source.release_owner_receipt_refs)),
    install_evidence_refs: uniqueStrings(stringList(source.install_evidence_refs)),
    typed_blocker_refs: uniqueStrings(stringList(source.typed_blocker_refs)),
    owner_acceptance_refs: uniqueStrings(stringList(source.owner_acceptance_refs)),
    source_surface: 'opl_app_release_user_path_evidence',
    authority_boundary: refsOnlyAuthorityBoundary(),
  } satisfies AppReleaseUserPathEvidenceReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function readAppReleaseUserPathEvidenceLedger(): AppReleaseUserPathEvidenceLedger {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedger();
  }
  try {
    const parsed = record(readJsonPayloadFile(file));
    if (!Array.isArray(parsed.receipts)) {
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
    receipt_path: payloadPath(input) ?? 'same_cohort_release_user_path_refs_path',
    recorded_at: nowIso(),
    target_surface: 'one_person_lab_app_release_user_path',
    release_package_refs: uniqueStrings(input.release_package_refs ?? []),
    screenshot_refs: uniqueStrings(input.screenshot_refs ?? []),
    reload_prompt_user_path_refs: uniqueStrings(input.reload_prompt_user_path_refs ?? []),
    provider_state_linkage_refs: uniqueStrings(input.provider_state_linkage_refs ?? []),
    long_operator_evidence_refs: uniqueStrings(input.long_operator_evidence_refs ?? []),
    release_owner_receipt_refs: uniqueStrings(input.release_owner_receipt_refs ?? []),
    install_evidence_refs: uniqueStrings(input.install_evidence_refs ?? []),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    owner_acceptance_refs: uniqueStrings(input.owner_acceptance_refs ?? []),
    source_surface: 'opl_app_release_user_path_evidence',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordAppReleaseUserPathEvidenceReceipts(
  inputs: AppReleaseUserPathEvidenceReceiptInput[],
) {
  const receipts = inputs
    .filter((input) => appReleaseUserPathEvidencePayloadPreflight(input).can_record_refs_only_receipt)
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
