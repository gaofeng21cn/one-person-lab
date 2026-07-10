import path from 'node:path';

import {
  optionalString,
  readJsonReceiptLedger,
  upsertJsonReceipts,
  writeJsonReceiptLedger,
} from '../../kernel/json-file.ts';
import { record, stringList, type JsonRecord } from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

export type StandardAgentTemplateConsumptionReceipt = {
  surface_kind: 'opl_standard_agent_template_consumption_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_surface: 'standard_agent_template_consumption';
  evidence_ref: string;
  evidence_fingerprint: string;
  cohort_evidence_ref: string;
  cohort_evidence_fingerprint: string;
  sample_evidence_refs: string[];
  sample_evidence_fingerprints: string[];
  consumed_surface_refs: string[];
  replay_command_ref: string;
  source_surface: 'opl_standard_agent_template_consumption_evidence';
  evidence_ref_policy:
    'deterministic_body_free_shape_refs_for_replayable_template_consumption_evidence_not_recorded_ledger_receipts';
  authority_boundary: {
    refs_only: true;
    can_write_domain_truth: false;
    can_write_memory_body: false;
    can_read_memory_body: false;
    can_read_artifact_body: false;
    can_mutate_artifact_body: false;
    can_authorize_quality_or_export: false;
    can_create_owner_receipt: false;
    can_claim_domain_ready: false;
    can_claim_artifact_authority: false;
    can_claim_production_ready: false;
  };
};

export type StandardAgentTemplateConsumptionReceiptInput = {
  evidence_ref?: string | null;
  evidence_fingerprint?: string | null;
  cohort_evidence_ref?: string | null;
  cohort_evidence_fingerprint?: string | null;
  sample_evidence_refs?: string[];
  sample_evidence_fingerprints?: string[];
  consumed_surface_refs?: string[];
  replay_command_ref?: string | null;
  receipt_ref?: string | null;
};

export type StandardAgentTemplateConsumptionReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type BlockedInput = StandardAgentTemplateConsumptionReceiptInput & JsonRecord;

type StandardAgentTemplateConsumptionBlockedReceipt = {
  surface_kind: 'opl_standard_agent_template_consumption_blocked_receipt';
  status: 'blocked';
  evidence_ref: string | null;
  cohort_evidence_ref: string | null;
  missing_consumption_refs: string[];
  blocker: {
    blocker_kind: 'standard_agent_template_consumption_receipt_gate';
    blocker_id:
      | 'standard_agent_template_consumption_payload_missing_replay_refs'
      | 'standard_agent_template_consumption_payload_contains_ready_claim';
    required_owner: 'one_person_lab_operator_or_agent_foundry_owner';
  };
  authority_boundary: StandardAgentTemplateConsumptionReceipt['authority_boundary'];
};

type StandardAgentTemplateConsumptionLedger = {
  surface_kind: 'opl_standard_agent_template_consumption_ledger';
  version: 'opl-standard-agent-template-consumption-ledger.v1';
  receipts: StandardAgentTemplateConsumptionReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function stringListValue(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return stringList(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary(): StandardAgentTemplateConsumptionReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_artifact_authority: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): StandardAgentTemplateConsumptionLedger {
  return {
    surface_kind: 'opl_standard_agent_template_consumption_ledger',
    version: 'opl-standard-agent-template-consumption-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().standard_agent_template_consumption_ledger_file;
}

function evidenceRefs(input: StandardAgentTemplateConsumptionReceiptInput) {
  return uniqueStrings([
    optionalString(input.evidence_ref) ?? '',
    optionalString(input.cohort_evidence_ref) ?? '',
    ...(input.sample_evidence_refs ?? []),
    ...(input.consumed_surface_refs ?? []),
  ]);
}

function receiptRef(input: StandardAgentTemplateConsumptionReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const primaryRef = optionalString(input.cohort_evidence_ref)
    ?? optionalString(input.evidence_ref)
    ?? 'standard-agent-template-consumption';
  return `opl://standard-agent-template-consumption-ledger/${encodeURIComponent(primaryRef)}`;
}

function missingConsumptionRefs(input: StandardAgentTemplateConsumptionReceiptInput) {
  const requiredRefs: Array<[string, string | null]> = [
    ['evidence_ref', optionalString(input.evidence_ref)],
    ['evidence_fingerprint', optionalString(input.evidence_fingerprint)],
    ['cohort_evidence_ref', optionalString(input.cohort_evidence_ref)],
    ['cohort_evidence_fingerprint', optionalString(input.cohort_evidence_fingerprint)],
  ];
  return requiredRefs.filter(([, value]) => !value).map(([field]) => field);
}

function containsReadyClaim(input: BlockedInput) {
  return [
    'domain_ready',
    'artifact_authority',
    'production_ready',
    'quality_or_export_authorized',
    'release_ready',
    'ready',
  ].some((field) => field in input);
}

function blockedReceipt(
  input: BlockedInput,
  blockerId: StandardAgentTemplateConsumptionBlockedReceipt['blocker']['blocker_id'],
): StandardAgentTemplateConsumptionBlockedReceipt {
  return {
    surface_kind: 'opl_standard_agent_template_consumption_blocked_receipt',
    status: 'blocked',
    evidence_ref: optionalString(input.evidence_ref),
    cohort_evidence_ref: optionalString(input.cohort_evidence_ref),
    missing_consumption_refs: missingConsumptionRefs(input),
    blocker: {
      blocker_kind: 'standard_agent_template_consumption_receipt_gate',
      blocker_id: blockerId,
      required_owner: 'one_person_lab_operator_or_agent_foundry_owner',
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function normalizeReceipt(value: unknown): StandardAgentTemplateConsumptionReceipt | null {
  const source = record(value);
  const receipt_ref = optionalString(source.receipt_ref);
  const evidence_ref = optionalString(source.evidence_ref);
  const evidence_fingerprint = optionalString(source.evidence_fingerprint);
  const cohort_evidence_ref = optionalString(source.cohort_evidence_ref);
  const cohort_evidence_fingerprint = optionalString(source.cohort_evidence_fingerprint);
  if (
    !receipt_ref
    || !evidence_ref
    || !evidence_fingerprint
    || !cohort_evidence_ref
    || !cohort_evidence_fingerprint
    || source.target_surface !== 'standard_agent_template_consumption'
  ) {
    return null;
  }
  return {
    surface_kind: 'opl_standard_agent_template_consumption_receipt',
    receipt_ref,
    receipt_status: source.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(source.recorded_at) ?? nowIso(),
    target_surface: 'standard_agent_template_consumption',
    evidence_ref,
    evidence_fingerprint,
    cohort_evidence_ref,
    cohort_evidence_fingerprint,
    sample_evidence_refs: uniqueStrings(stringListValue(source.sample_evidence_refs)),
    sample_evidence_fingerprints: uniqueStrings(stringListValue(source.sample_evidence_fingerprints)),
    consumed_surface_refs: uniqueStrings(stringListValue(source.consumed_surface_refs)),
    replay_command_ref: optionalString(source.replay_command_ref)
      ?? 'opl agents scaffold --consumption-evidence',
    source_surface: 'opl_standard_agent_template_consumption_evidence',
    evidence_ref_policy:
      'deterministic_body_free_shape_refs_for_replayable_template_consumption_evidence_not_recorded_ledger_receipts',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function readStandardAgentTemplateConsumptionLedger(): StandardAgentTemplateConsumptionLedger {
  return readJsonReceiptLedger(ledgerPath(), emptyLedger, normalizeReceipt);
}

function writeStandardAgentTemplateConsumptionLedger(
  ledger: StandardAgentTemplateConsumptionLedger,
) {
  const paths = ensureOplStateDir();
  writeJsonReceiptLedger(paths.standard_agent_template_consumption_ledger_file, ledger);
}

function normalizeInput(
  input: StandardAgentTemplateConsumptionReceiptInput,
): StandardAgentTemplateConsumptionReceipt {
  return {
    surface_kind: 'opl_standard_agent_template_consumption_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_surface: 'standard_agent_template_consumption',
    evidence_ref: optionalString(input.evidence_ref) ?? '',
    evidence_fingerprint: optionalString(input.evidence_fingerprint) ?? '',
    cohort_evidence_ref: optionalString(input.cohort_evidence_ref) ?? '',
    cohort_evidence_fingerprint: optionalString(input.cohort_evidence_fingerprint) ?? '',
    sample_evidence_refs: uniqueStrings(input.sample_evidence_refs ?? []),
    sample_evidence_fingerprints: uniqueStrings(input.sample_evidence_fingerprints ?? []),
    consumed_surface_refs: uniqueStrings(input.consumed_surface_refs ?? []),
    replay_command_ref: optionalString(input.replay_command_ref)
      ?? 'opl agents scaffold --consumption-evidence',
    source_surface: 'opl_standard_agent_template_consumption_evidence',
    evidence_ref_policy:
      'deterministic_body_free_shape_refs_for_replayable_template_consumption_evidence_not_recorded_ledger_receipts',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function recordStandardAgentTemplateConsumptionReceipts(
  inputs: BlockedInput[],
) {
  const blockedReceipts: StandardAgentTemplateConsumptionBlockedReceipt[] = [];
  const receipts: StandardAgentTemplateConsumptionReceipt[] = [];

  for (const input of inputs) {
    const missingRefs = missingConsumptionRefs(input);
    if (containsReadyClaim(input)) {
      blockedReceipts.push(blockedReceipt(
        input,
        'standard_agent_template_consumption_payload_contains_ready_claim',
      ));
      continue;
    }
    if (missingRefs.length > 0 || evidenceRefs(input).length === 0) {
      blockedReceipts.push(blockedReceipt(
        input,
        'standard_agent_template_consumption_payload_missing_replay_refs',
      ));
      continue;
    }
    receipts.push(normalizeInput(input));
  }

  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_standard_agent_template_consumption_ledger_record',
      status: 'no_eligible_standard_agent_template_consumption_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
      blocked_receipts: blockedReceipts,
    };
  }

  const ledger = readStandardAgentTemplateConsumptionLedger();
  upsertJsonReceipts(ledger.receipts, receipts, (entry, next) =>
    entry.receipt_ref === next.receipt_ref
  );
  writeStandardAgentTemplateConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_standard_agent_template_consumption_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
    blocked_receipts: blockedReceipts,
  };
}

export function verifyStandardAgentTemplateConsumptionReceipt(
  input: StandardAgentTemplateConsumptionReceiptVerifyInput = {},
) {
  const ledger = readStandardAgentTemplateConsumptionLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_standard_agent_template_consumption_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'standard_agent_template_consumption_receipt_gate',
        blocker_id: 'standard_agent_template_consumption_receipt_not_found',
        required_owner: 'one_person_lab_operator_or_agent_foundry_owner',
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
  writeStandardAgentTemplateConsumptionLedger(ledger);
  return {
    surface_kind: 'opl_standard_agent_template_consumption_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listStandardAgentTemplateConsumptionReceipts() {
  return readStandardAgentTemplateConsumptionLedger().receipts;
}

export function standardAgentTemplateConsumptionLedgerFilePath() {
  return path.resolve(ledgerPath());
}
