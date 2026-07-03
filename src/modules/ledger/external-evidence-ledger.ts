import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { record, recordList } from '../../kernel/json-record.ts';
import {
  normalizeExternalEvidenceReceiptSemantics,
  type ExternalEvidenceReceiptSemantics,
} from './external-evidence-receipt-classification.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

export type ExternalEvidenceApplyMode = 'record' | 'verify';

export type ExternalEvidenceApplyInput = {
  mode: ExternalEvidenceApplyMode;
  domain_id: string;
  request_id: string;
  request_pack_id?: string | null;
  source_ref?: string | null;
  evidence_refs?: string[];
  receipt_refs?: string[];
  typed_blocker_refs?: string[];
  no_regression_refs?: string[];
  release_dist_refs?: string[];
  direct_hosted_parity_refs?: string[];
  owner_chain_refs?: string[];
  source_scope_refs?: string[];
  runtime_event_refs?: string[];
  memory_writeback_receipt_refs?: string[];
  artifact_mutation_receipt_refs?: string[];
  package_lifecycle_receipt_refs?: string[];
  lifecycle_receipt_refs?: string[];
  restore_proof_refs?: string[];
  receipt_semantics?: ExternalEvidenceReceiptSemantics | null;
  receipt_ref?: string | null;
};

export type ExternalEvidenceReceipt = {
  surface_kind: 'opl_external_evidence_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  domain_id: string;
  request_id: string;
  request_pack_id: string | null;
  source_ref: string;
  recorded_at: string;
  evidence_refs: string[];
  receipt_refs: string[];
  typed_blocker_refs: string[];
  no_regression_refs: string[];
  release_dist_refs: string[];
  direct_hosted_parity_refs: string[];
  owner_chain_refs: string[];
  source_scope_refs: string[];
  runtime_event_refs: string[];
  memory_writeback_receipt_refs: string[];
  artifact_mutation_receipt_refs: string[];
  package_lifecycle_receipt_refs: string[];
  lifecycle_receipt_refs: string[];
  restore_proof_refs: string[];
  receipt_semantics: ExternalEvidenceReceiptSemantics | null;
  authority_boundary: {
    opl_can_write_domain_truth: false;
    opl_can_read_memory_body: false;
    opl_can_read_artifact_body: false;
    opl_can_authorize_quality_or_export: false;
    opl_records_refs_only: true;
  };
};

type ExternalEvidenceLedger = {
  surface_kind: 'opl_external_evidence_ledger';
  version: 'opl-external-evidence-ledger.v1';
  receipts: ExternalEvidenceReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: string | null | undefined, field: string) {
  const text = value?.trim();
  if (!text) {
    throw new FrameworkContractError('cli_usage_error', `agents evidence apply requires ${field}.`, {
      required: [field],
    });
  }
  return text;
}

function optionalText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean))];
}

function splitList(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  const trimmed = value.trim();
  if (looksStructuredOpaqueRef(trimmed)) {
    return [trimmed];
  }
  return [...new Set(value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function looksStructuredOpaqueRef(value: string) {
  if (!value.includes(',')) {
    return false;
  }
  const first = value[0];
  const last = value[value.length - 1];
  return (
    (first === '{' && last === '}')
    || (first === '[' && last === ']')
    || (first === '(' && last === ')')
  );
}

function emptyLedger(): ExternalEvidenceLedger {
  return {
    surface_kind: 'opl_external_evidence_ledger',
    version: 'opl-external-evidence-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().external_evidence_ledger_file;
}

function waitForLock() {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, 25);
}

function withLedgerLock<T>(operation: () => T): T {
  const file = ledgerPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lockFile = `${file}.lock`;
  const startedAt = Date.now();
  let lockFd: number | null = null;
  while (lockFd === null) {
    try {
      lockFd = fs.openSync(lockFile, 'wx');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - startedAt > 10_000) {
        throw new FrameworkContractError('runtime_state_lock_timeout', 'Timed out waiting for external evidence ledger lock.', {
          lock_file: lockFile,
        });
      }
      waitForLock();
    }
  }
  try {
    fs.writeFileSync(lockFd, `${process.pid}\n`);
    return operation();
  } finally {
    fs.closeSync(lockFd);
    try {
      fs.unlinkSync(lockFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

function readLedger(): ExternalEvidenceLedger {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedger();
  }
  const parsed = record(readJsonPayloadFile(file));
  if (!Array.isArray(parsed.receipts)) {
    return emptyLedger();
  }
  return {
    ...emptyLedger(),
    receipts: recordList(parsed.receipts).map((receipt) => ({
      surface_kind: 'opl_external_evidence_receipt',
      receipt_ref: normalizeText(String(receipt.receipt_ref ?? ''), 'receipt_ref'),
      receipt_status: receipt.receipt_status === 'verified' ? 'verified' : 'recorded',
      domain_id: normalizeText(String(receipt.domain_id ?? ''), 'domain_id'),
      request_id: normalizeText(String(receipt.request_id ?? ''), 'request_id'),
      request_pack_id: optionalText(typeof receipt.request_pack_id === 'string' ? receipt.request_pack_id : null),
      source_ref: normalizeText(String(receipt.source_ref ?? ''), 'source_ref'),
      recorded_at: optionalText(typeof receipt.recorded_at === 'string' ? receipt.recorded_at : null) ?? nowIso(),
      evidence_refs: uniqueStrings(receipt.evidence_refs),
      receipt_refs: uniqueStrings(receipt.receipt_refs),
      typed_blocker_refs: uniqueStrings(receipt.typed_blocker_refs),
      no_regression_refs: uniqueStrings(receipt.no_regression_refs),
      release_dist_refs: uniqueStrings(receipt.release_dist_refs),
      direct_hosted_parity_refs: uniqueStrings(receipt.direct_hosted_parity_refs),
      owner_chain_refs: uniqueStrings(receipt.owner_chain_refs),
      source_scope_refs: uniqueStrings(receipt.source_scope_refs),
      runtime_event_refs: uniqueStrings(receipt.runtime_event_refs),
      memory_writeback_receipt_refs: uniqueStrings(receipt.memory_writeback_receipt_refs),
      artifact_mutation_receipt_refs: uniqueStrings(receipt.artifact_mutation_receipt_refs),
      package_lifecycle_receipt_refs: uniqueStrings(receipt.package_lifecycle_receipt_refs),
      lifecycle_receipt_refs: uniqueStrings(receipt.lifecycle_receipt_refs),
      restore_proof_refs: uniqueStrings(receipt.restore_proof_refs),
      receipt_semantics: normalizeExternalEvidenceReceiptSemantics(receipt.receipt_semantics),
      authority_boundary: refsOnlyAuthorityBoundary(),
    })),
  };
}

function writeLedger(ledger: ExternalEvidenceLedger) {
  const file = ledgerPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeJsonPayloadFile(tempFile, ledger);
  fs.renameSync(tempFile, file);
}

function receiptRef(input: ExternalEvidenceApplyInput) {
  return optionalText(input.receipt_ref)
    ?? `opl://external-evidence/${normalizeText(input.domain_id, 'domain_id')}/${normalizeText(input.request_id, 'request_id')}`;
}

function refsOnlyAuthorityBoundary(): ExternalEvidenceReceipt['authority_boundary'] {
  return {
    opl_can_write_domain_truth: false,
    opl_can_read_memory_body: false,
    opl_can_read_artifact_body: false,
    opl_can_authorize_quality_or_export: false,
    opl_records_refs_only: true,
  };
}

function normalizedReceipt(input: ExternalEvidenceApplyInput): ExternalEvidenceReceipt {
  const evidence_refs = uniqueStrings(input.evidence_refs);
  const receipt_refs = uniqueStrings(input.receipt_refs);
  const typed_blocker_refs = uniqueStrings(input.typed_blocker_refs);
  const no_regression_refs = uniqueStrings(input.no_regression_refs);
  const release_dist_refs = uniqueStrings(input.release_dist_refs);
  const direct_hosted_parity_refs = uniqueStrings(input.direct_hosted_parity_refs);
  const owner_chain_refs = uniqueStrings(input.owner_chain_refs);
  const source_scope_refs = uniqueStrings(input.source_scope_refs);
  const runtime_event_refs = uniqueStrings(input.runtime_event_refs);
  const memory_writeback_receipt_refs = uniqueStrings(input.memory_writeback_receipt_refs);
  const artifact_mutation_receipt_refs = uniqueStrings(input.artifact_mutation_receipt_refs);
  const package_lifecycle_receipt_refs = uniqueStrings(input.package_lifecycle_receipt_refs);
  const lifecycle_receipt_refs = uniqueStrings(input.lifecycle_receipt_refs);
  const restore_proof_refs = uniqueStrings(input.restore_proof_refs);
  const receipt_semantics = normalizeExternalEvidenceReceiptSemantics(input.receipt_semantics);
  const evidenceRefs = [
    ...evidence_refs,
    ...receipt_refs,
    ...typed_blocker_refs,
    ...no_regression_refs,
    ...release_dist_refs,
    ...direct_hosted_parity_refs,
    ...owner_chain_refs,
    ...source_scope_refs,
    ...runtime_event_refs,
    ...memory_writeback_receipt_refs,
    ...artifact_mutation_receipt_refs,
    ...package_lifecycle_receipt_refs,
    ...lifecycle_receipt_refs,
    ...restore_proof_refs,
  ];
  if (input.mode === 'record' && evidenceRefs.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'agents evidence apply --mode record requires at least one refs-only evidence input.', {
      required_any: [
        '--evidence-ref',
        '--receipt-ref',
        '--typed-blocker-ref',
        '--no-regression-ref',
        '--release-dist-ref',
        '--direct-hosted-parity-ref',
        '--owner-chain-ref',
        '--source-scope-ref',
        '--runtime-event-ref',
        '--memory-writeback-receipt-ref',
        '--artifact-mutation-receipt-ref',
        '--package-lifecycle-receipt-ref',
        '--lifecycle-receipt-ref',
        '--restore-proof-ref',
      ],
    });
  }
  return {
    surface_kind: 'opl_external_evidence_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: input.mode === 'verify' ? 'verified' : 'recorded',
    domain_id: normalizeText(input.domain_id, 'domain_id'),
    request_id: normalizeText(input.request_id, 'request_id'),
    request_pack_id: optionalText(input.request_pack_id),
    source_ref: optionalText(input.source_ref) ?? `opl://external-evidence/${normalizeText(input.domain_id, 'domain_id')}/${normalizeText(input.request_id, 'request_id')}`,
    recorded_at: nowIso(),
    evidence_refs,
    receipt_refs,
    typed_blocker_refs,
    no_regression_refs,
    release_dist_refs,
    direct_hosted_parity_refs,
    owner_chain_refs,
    source_scope_refs,
    runtime_event_refs,
    memory_writeback_receipt_refs,
    artifact_mutation_receipt_refs,
    package_lifecycle_receipt_refs,
    lifecycle_receipt_refs,
    restore_proof_refs,
    receipt_semantics,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listExternalEvidenceReceipts(filters: {
  domain_id?: string | null;
  request_id?: string | null;
} = {}) {
  const domainId = optionalText(filters.domain_id);
  const requestId = optionalText(filters.request_id);
  return readLedger().receipts.filter((receipt) =>
    (!domainId || receipt.domain_id === domainId)
    && (!requestId || receipt.request_id === requestId)
  );
}

export function runExternalEvidenceApply(input: ExternalEvidenceApplyInput) {
  return withLedgerLock(() => {
    const ledger = readLedger();
    const receipt = normalizedReceipt(input);
    const existingIndex = ledger.receipts.findIndex((entry) =>
      entry.receipt_ref === receipt.receipt_ref
      && entry.domain_id === receipt.domain_id
      && entry.request_id === receipt.request_id
    );
    if (input.mode === 'verify') {
      if (existingIndex < 0) {
        return {
          version: 'g2',
          external_evidence_apply: {
            surface_kind: 'opl_external_evidence_apply',
            mode: input.mode,
            status: 'blocked',
            writes_performed: false,
            receipt_ref: receipt.receipt_ref,
            verified_receipt_count: 0,
            blocker: {
              blocker_kind: 'external_evidence_receipt_gate',
              blocker_id: 'external_evidence_receipt_not_found',
              required_owner: 'opl_framework_or_operator',
            },
            authority_boundary: refsOnlyAuthorityBoundary(),
          },
        };
      }
      const verified = {
        ...ledger.receipts[existingIndex],
        receipt_status: 'verified' as const,
      };
      ledger.receipts[existingIndex] = verified;
      writeLedger(ledger);
      return {
        version: 'g2',
        external_evidence_apply: {
          surface_kind: 'opl_external_evidence_apply',
          mode: input.mode,
          status: 'verified',
          writes_performed: true,
          receipt_ref: verified.receipt_ref,
          verified_receipt_count: 1,
          receipt: verified,
          authority_boundary: refsOnlyAuthorityBoundary(),
        },
      };
    }
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.push(receipt);
    }
    writeLedger(ledger);
    return {
      version: 'g2',
      external_evidence_apply: {
        surface_kind: 'opl_external_evidence_apply',
        mode: input.mode,
        status: 'recorded',
        writes_performed: true,
        receipt_ref: receipt.receipt_ref,
        recorded_receipt_count: 1,
        receipt,
        authority_boundary: refsOnlyAuthorityBoundary(),
      },
    };
  });
}

export function parseExternalEvidenceApplyArgs(args: string[]): ExternalEvidenceApplyInput {
  const input: ExternalEvidenceApplyInput = {
    mode: 'record',
    domain_id: '',
    request_id: '',
    evidence_refs: [],
    receipt_refs: [],
    typed_blocker_refs: [],
    no_regression_refs: [],
    release_dist_refs: [],
    direct_hosted_parity_refs: [],
    owner_chain_refs: [],
    source_scope_refs: [],
    runtime_event_refs: [],
    memory_writeback_receipt_refs: [],
    artifact_mutation_receipt_refs: [],
    package_lifecycle_receipt_refs: [],
    lifecycle_receipt_refs: [],
    restore_proof_refs: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    const takeValue = () => {
      if (!value || value.startsWith('--')) {
        throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, {
          option: token,
        });
      }
      index += 1;
      return value;
    };
    switch (token) {
      case '--mode': {
        const mode = takeValue();
        if (mode !== 'record' && mode !== 'verify') {
          throw new FrameworkContractError('cli_usage_error', 'agents evidence apply --mode requires record or verify.', {
            option: token,
          });
        }
        input.mode = mode;
        break;
      }
      case '--domain':
        input.domain_id = takeValue();
        break;
      case '--request-id':
        input.request_id = takeValue();
        break;
      case '--request-pack-id':
        input.request_pack_id = takeValue();
        break;
      case '--source-ref':
        input.source_ref = takeValue();
        break;
      case '--receipt-ref':
        input.receipt_ref = takeValue();
        break;
      case '--evidence-ref':
        input.evidence_refs!.push(...splitList(takeValue()));
        break;
      case '--domain-receipt-ref':
        input.receipt_refs!.push(...splitList(takeValue()));
        break;
      case '--typed-blocker-ref':
        input.typed_blocker_refs!.push(...splitList(takeValue()));
        break;
      case '--no-regression-ref':
        input.no_regression_refs!.push(...splitList(takeValue()));
        break;
      case '--release-dist-ref':
        input.release_dist_refs!.push(...splitList(takeValue()));
        break;
      case '--direct-hosted-parity-ref':
        input.direct_hosted_parity_refs!.push(...splitList(takeValue()));
        break;
      case '--owner-chain-ref':
        input.owner_chain_refs!.push(...splitList(takeValue()));
        break;
      case '--source-scope-ref':
        input.source_scope_refs!.push(...splitList(takeValue()));
        break;
      case '--runtime-event-ref':
        input.runtime_event_refs!.push(...splitList(takeValue()));
        break;
      case '--memory-writeback-receipt-ref':
        input.memory_writeback_receipt_refs!.push(...splitList(takeValue()));
        break;
      case '--artifact-mutation-receipt-ref':
        input.artifact_mutation_receipt_refs!.push(...splitList(takeValue()));
        break;
      case '--package-lifecycle-receipt-ref':
        input.package_lifecycle_receipt_refs!.push(...splitList(takeValue()));
        break;
      case '--lifecycle-receipt-ref':
        input.lifecycle_receipt_refs!.push(...splitList(takeValue()));
        break;
      case '--restore-proof-ref':
        input.restore_proof_refs!.push(...splitList(takeValue()));
        break;
      case '--receipt-semantics': {
        const semantics = normalizeExternalEvidenceReceiptSemantics(takeValue());
        if (!semantics) {
          throw new FrameworkContractError('cli_usage_error', 'agents evidence apply --receipt-semantics requires receipt or typed-blocker semantics.', {
            option: token,
            allowed: [
              'domain_owned_receipt_ref',
              'domain_owned_typed_blocker_ref',
            ],
          });
        }
        input.receipt_semantics = semantics;
        break;
      }
      default:
        throw new FrameworkContractError('cli_usage_error', `Unknown agents evidence apply option: ${token}.`, {
          usage: 'opl agents evidence apply --domain <domain> --request-id <id> [--mode record|verify] [--evidence-ref <ref>] [--domain-receipt-ref <ref>] [--typed-blocker-ref <ref>] [--source-scope-ref <ref>] [--runtime-event-ref <ref>] [--memory-writeback-receipt-ref <ref>] [--artifact-mutation-receipt-ref <ref>] [--package-lifecycle-receipt-ref <ref>] [--lifecycle-receipt-ref <ref>] [--restore-proof-ref <ref>] [--receipt-semantics <domain_owned_receipt_ref|domain_owned_typed_blocker_ref>]',
        });
    }
  }
  normalizeText(input.domain_id, 'domain_id');
  normalizeText(input.request_id, 'request_id');
  return input;
}
