import {
  optionalString,
  readJsonReceiptLedger,
  upsertJsonReceipts,
  writeJsonReceiptLedger,
} from '../../kernel/json-file.ts';
import { record, stringList } from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

export type MemoryArtifactLifecycleEvidenceReceipt = {
  surface_kind: 'opl_memory_artifact_lifecycle_evidence_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_surface: 'memory_artifact_lifecycle';
  memory_receipt_refs: string[];
  memory_writeback_receipt_refs: string[];
  artifact_mutation_receipt_refs: string[];
  package_lifecycle_receipt_refs: string[];
  export_lifecycle_receipt_refs: string[];
  cleanup_restore_retention_receipt_refs: string[];
  typed_blocker_refs: string[];
  owner_acceptance_refs: string[];
  source_surface: 'opl_memory_artifact_lifecycle_evidence';
  authority_boundary: MemoryArtifactLifecycleEvidenceAuthorityBoundary;
};

export type MemoryArtifactLifecycleEvidenceReceiptInput = {
  memory_receipt_refs?: string[];
  memory_writeback_receipt_refs?: string[];
  artifact_mutation_receipt_refs?: string[];
  package_lifecycle_receipt_refs?: string[];
  export_lifecycle_receipt_refs?: string[];
  cleanup_restore_retention_receipt_refs?: string[];
  typed_blocker_refs?: string[];
  owner_acceptance_refs?: string[];
  receipt_ref?: string | null;
};

export type MemoryArtifactLifecycleEvidenceReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type MemoryArtifactLifecycleEvidenceLedger = {
  surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger';
  version: 'opl-memory-artifact-lifecycle-evidence-ledger.v1';
  receipts: MemoryArtifactLifecycleEvidenceReceipt[];
};

type MemoryArtifactLifecycleEvidenceAuthorityBoundary = {
  refs_only: true;
  can_write_domain_truth: false;
  can_write_memory_body: false;
  can_read_memory_body: false;
  can_accept_or_reject_memory_writeback: false;
  can_read_artifact_body: false;
  can_mutate_artifact_body: false;
  can_authorize_package_readiness: false;
  can_authorize_export_readiness: false;
  can_execute_domain_physical_delete: false;
  can_create_owner_receipt: false;
  can_generate_typed_blocker: false;
  can_claim_memory_ready: false;
  can_claim_artifact_ready: false;
  can_claim_package_ready: false;
  can_claim_export_ready: false;
  can_claim_domain_ready: false;
  can_claim_production_ready: false;
};

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function memoryArtifactLifecycleEvidenceAuthorityBoundary():
  MemoryArtifactLifecycleEvidenceAuthorityBoundary {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_accept_or_reject_memory_writeback: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_package_readiness: false,
    can_authorize_export_readiness: false,
    can_execute_domain_physical_delete: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_claim_memory_ready: false,
    can_claim_artifact_ready: false,
    can_claim_package_ready: false,
    can_claim_export_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): MemoryArtifactLifecycleEvidenceLedger {
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger',
    version: 'opl-memory-artifact-lifecycle-evidence-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().memory_artifact_lifecycle_evidence_ledger_file;
}

function allEvidenceRefs(input: MemoryArtifactLifecycleEvidenceReceiptInput) {
  return uniqueStrings([
    ...(input.memory_receipt_refs ?? []),
    ...(input.memory_writeback_receipt_refs ?? []),
    ...(input.artifact_mutation_receipt_refs ?? []),
    ...(input.package_lifecycle_receipt_refs ?? []),
    ...(input.export_lifecycle_receipt_refs ?? []),
    ...(input.cleanup_restore_retention_receipt_refs ?? []),
    ...(input.typed_blocker_refs ?? []),
    ...(input.owner_acceptance_refs ?? []),
  ]);
}

function receiptRef(input: MemoryArtifactLifecycleEvidenceReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const primaryRef = allEvidenceRefs(input)[0] ?? 'memory-artifact-lifecycle-evidence';
  return `opl://memory-artifact-lifecycle-evidence/${encodeURIComponent(primaryRef)}`;
}

function normalizeReceipt(value: unknown): MemoryArtifactLifecycleEvidenceReceipt | null {
  const source = record(value);
  const receipt_ref = optionalString(source.receipt_ref);
  if (!receipt_ref || source.target_surface !== 'memory_artifact_lifecycle') {
    return null;
  }
  const receipt = {
    surface_kind: 'opl_memory_artifact_lifecycle_evidence_receipt',
    receipt_ref,
    receipt_status: source.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(source.recorded_at) ?? nowIso(),
    target_surface: 'memory_artifact_lifecycle',
    memory_receipt_refs: uniqueStrings(stringList(source.memory_receipt_refs)),
    memory_writeback_receipt_refs: uniqueStrings(
      stringList(source.memory_writeback_receipt_refs),
    ),
    artifact_mutation_receipt_refs: uniqueStrings(
      stringList(source.artifact_mutation_receipt_refs),
    ),
    package_lifecycle_receipt_refs: uniqueStrings(
      stringList(source.package_lifecycle_receipt_refs),
    ),
    export_lifecycle_receipt_refs: uniqueStrings(
      stringList(source.export_lifecycle_receipt_refs),
    ),
    cleanup_restore_retention_receipt_refs: uniqueStrings(
      stringList(source.cleanup_restore_retention_receipt_refs),
    ),
    typed_blocker_refs: uniqueStrings(stringList(source.typed_blocker_refs)),
    owner_acceptance_refs: uniqueStrings(stringList(source.owner_acceptance_refs)),
    source_surface: 'opl_memory_artifact_lifecycle_evidence',
    authority_boundary: memoryArtifactLifecycleEvidenceAuthorityBoundary(),
  } satisfies MemoryArtifactLifecycleEvidenceReceipt;
  return allEvidenceRefs(receipt).length > 0 ? receipt : null;
}

function readMemoryArtifactLifecycleEvidenceLedger(): MemoryArtifactLifecycleEvidenceLedger {
  return readJsonReceiptLedger(ledgerPath(), emptyLedger, normalizeReceipt);
}

function writeMemoryArtifactLifecycleEvidenceLedger(
  ledger: MemoryArtifactLifecycleEvidenceLedger,
) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(paths.memory_artifact_lifecycle_evidence_ledger_file, ledger);
}

function normalizeInput(
  input: MemoryArtifactLifecycleEvidenceReceiptInput,
): MemoryArtifactLifecycleEvidenceReceipt {
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_evidence_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_surface: 'memory_artifact_lifecycle',
    memory_receipt_refs: uniqueStrings(input.memory_receipt_refs ?? []),
    memory_writeback_receipt_refs: uniqueStrings(input.memory_writeback_receipt_refs ?? []),
    artifact_mutation_receipt_refs: uniqueStrings(input.artifact_mutation_receipt_refs ?? []),
    package_lifecycle_receipt_refs: uniqueStrings(input.package_lifecycle_receipt_refs ?? []),
    export_lifecycle_receipt_refs: uniqueStrings(input.export_lifecycle_receipt_refs ?? []),
    cleanup_restore_retention_receipt_refs: uniqueStrings(
      input.cleanup_restore_retention_receipt_refs ?? [],
    ),
    typed_blocker_refs: uniqueStrings(input.typed_blocker_refs ?? []),
    owner_acceptance_refs: uniqueStrings(input.owner_acceptance_refs ?? []),
    source_surface: 'opl_memory_artifact_lifecycle_evidence',
    authority_boundary: memoryArtifactLifecycleEvidenceAuthorityBoundary(),
  };
}

export function recordMemoryArtifactLifecycleEvidenceReceipts(
  inputs: MemoryArtifactLifecycleEvidenceReceiptInput[],
) {
  const receipts = inputs
    .filter((input) => allEvidenceRefs(input).length > 0)
    .map(normalizeInput);
  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger_record',
      status: 'no_eligible_memory_artifact_lifecycle_evidence_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
    };
  }

  const ledger = readMemoryArtifactLifecycleEvidenceLedger();
  upsertJsonReceipts(ledger.receipts, receipts, (entry, next) =>
    entry.receipt_ref === next.receipt_ref
  );
  writeMemoryArtifactLifecycleEvidenceLedger(ledger);
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
  };
}

export function verifyMemoryArtifactLifecycleEvidenceReceipt(
  input: MemoryArtifactLifecycleEvidenceReceiptVerifyInput = {},
) {
  const ledger = readMemoryArtifactLifecycleEvidenceLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'memory_artifact_lifecycle_evidence_receipt_gate',
        blocker_id: 'memory_artifact_lifecycle_evidence_receipt_not_found',
        required_owner: 'domain_repository_or_app_live_operator',
      },
      authority_boundary: memoryArtifactLifecycleEvidenceAuthorityBoundary(),
    };
  }

  const current = ledger.receipts[selectedIndex];
  const verified = {
    ...current,
    receipt_status: 'verified' as const,
  };
  ledger.receipts[selectedIndex] = verified;
  writeMemoryArtifactLifecycleEvidenceLedger(ledger);
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_evidence_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: memoryArtifactLifecycleEvidenceAuthorityBoundary(),
  };
}

export function listMemoryArtifactLifecycleEvidenceReceipts() {
  return readMemoryArtifactLifecycleEvidenceLedger().receipts;
}

function refShapes(input: {
  memoryReceiptRefs: string[];
  memoryWritebackReceiptRefs: string[];
  artifactMutationReceiptRefs: string[];
  packageLifecycleReceiptRefs: string[];
  exportLifecycleReceiptRefs: string[];
  cleanupRestoreRetentionReceiptRefs: string[];
  typedBlockerRefs: string[];
  ownerAcceptanceRefs: string[];
}) {
  return [
    input.memoryReceiptRefs.length > 0 ? 'memory_receipt_ref' : null,
    input.memoryWritebackReceiptRefs.length > 0 ? 'memory_writeback_receipt_ref' : null,
    input.artifactMutationReceiptRefs.length > 0 ? 'artifact_mutation_receipt_ref' : null,
    input.packageLifecycleReceiptRefs.length > 0 ? 'package_lifecycle_receipt_ref' : null,
    input.exportLifecycleReceiptRefs.length > 0 ? 'export_lifecycle_receipt_ref' : null,
    input.cleanupRestoreRetentionReceiptRefs.length > 0
      ? 'cleanup_restore_retention_receipt_ref'
      : null,
    input.typedBlockerRefs.length > 0 ? 'typed_blocker_ref' : null,
    input.ownerAcceptanceRefs.length > 0 ? 'owner_acceptance_ref' : null,
  ].filter((entry): entry is string => Boolean(entry));
}

export function buildMemoryArtifactLifecycleEvidenceProjection() {
  const receipts = listMemoryArtifactLifecycleEvidenceReceipts();
  const recordedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'recorded');
  const verifiedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'verified');
  const memoryReceiptRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) =>
    receipt.memory_receipt_refs
  ));
  const memoryWritebackReceiptRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) =>
    receipt.memory_writeback_receipt_refs
  ));
  const artifactMutationReceiptRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) =>
    receipt.artifact_mutation_receipt_refs
  ));
  const packageLifecycleReceiptRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) =>
    receipt.package_lifecycle_receipt_refs
  ));
  const exportLifecycleReceiptRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) =>
    receipt.export_lifecycle_receipt_refs
  ));
  const cleanupRestoreRetentionReceiptRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) =>
    receipt.cleanup_restore_retention_receipt_refs
  ));
  const typedBlockerRefs = uniqueStrings(receipts.flatMap((receipt) =>
    receipt.typed_blocker_refs
  ));
  const ownerAcceptanceRefs = uniqueStrings(verifiedReceipts.flatMap((receipt) =>
    receipt.owner_acceptance_refs
  ));
  const observedRefShapes = refShapes({
    memoryReceiptRefs,
    memoryWritebackReceiptRefs,
    artifactMutationReceiptRefs,
    packageLifecycleReceiptRefs,
    exportLifecycleReceiptRefs,
    cleanupRestoreRetentionReceiptRefs,
    typedBlockerRefs,
    ownerAcceptanceRefs,
  });
  const observed = receipts.length > 0 || observedRefShapes.length > 0;
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_evidence_projection',
    target_surface: 'memory_artifact_lifecycle',
    status: observed
      ? 'lifecycle_evidence_observed_not_ready_claim'
      : 'lifecycle_evidence_required',
    evidence_ledger_status: recordedReceipts.length > 0
      ? 'ledger_refs_recorded_verify_pending'
      : verifiedReceipts.length > 0
        ? 'ledger_refs_verified'
        : 'ledger_refs_missing',
    receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    recorded_receipt_ref_count: recordedReceipts.length,
    recorded_receipt_refs: recordedReceipts.map((receipt) => receipt.receipt_ref),
    verified_receipt_ref_count: verifiedReceipts.length,
    verified_receipt_refs: verifiedReceipts.map((receipt) => receipt.receipt_ref),
    pending_verify_receipt_ref_count: recordedReceipts.length,
    pending_verify_receipt_refs: recordedReceipts.map((receipt) => receipt.receipt_ref),
    memory_receipt_refs: memoryReceiptRefs,
    memory_writeback_receipt_refs: memoryWritebackReceiptRefs,
    artifact_mutation_receipt_refs: artifactMutationReceiptRefs,
    package_lifecycle_receipt_refs: packageLifecycleReceiptRefs,
    export_lifecycle_receipt_refs: exportLifecycleReceiptRefs,
    cleanup_restore_retention_receipt_refs: cleanupRestoreRetentionReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    owner_acceptance_refs: ownerAcceptanceRefs,
    observed_ref_shapes: observedRefShapes,
    observed_ref_counts: {
      memory_receipt_ref_count: memoryReceiptRefs.length,
      memory_writeback_receipt_ref_count: memoryWritebackReceiptRefs.length,
      artifact_mutation_receipt_ref_count: artifactMutationReceiptRefs.length,
      package_lifecycle_receipt_ref_count: packageLifecycleReceiptRefs.length,
      export_lifecycle_receipt_ref_count: exportLifecycleReceiptRefs.length,
      cleanup_restore_retention_receipt_ref_count:
        cleanupRestoreRetentionReceiptRefs.length,
      typed_blocker_ref_count: typedBlockerRefs.length,
      owner_acceptance_ref_count: ownerAcceptanceRefs.length,
    },
    accepted_refs_only_result_shapes: [
      'memory_receipt_ref',
      'memory_writeback_receipt_ref',
      'artifact_mutation_receipt_ref',
      'package_lifecycle_receipt_ref',
      'export_lifecycle_receipt_ref',
      'cleanup_restore_retention_receipt_ref',
      'typed_blocker_ref',
      'owner_acceptance_ref',
    ],
    ready_claim_authorized: false,
    memory_or_artifact_ready_claim_status:
      'lifecycle_evidence_observed_not_memory_or_artifact_ready_claim',
    non_closing_inputs: [
      'app_projection',
      'verified_refs_only_ledger',
      'lifecycle_reconcile_zero_issue_count',
      'open_count_zero',
      'opl_cleanup_apply_available',
      'typed_blocker_ref_without_owner_followthrough',
    ],
    verified_refs_only_ledger_counts_as_memory_ready: false,
    verified_refs_only_ledger_counts_as_artifact_ready: false,
    verified_refs_only_ledger_counts_as_package_ready: false,
    verified_refs_only_ledger_counts_as_export_ready: false,
    authority_boundary: memoryArtifactLifecycleEvidenceAuthorityBoundary(),
  };
}
