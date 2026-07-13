import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { insertEvent } from '../runway/family-runtime-store.ts';

export type StandardAgentActionRunStatus = 'completed' | 'failed' | 'blocked';

export type StandardAgentActionRunBytesRef = {
  ref: string;
  sha256: string;
  byte_size: number;
};

export type StandardAgentActionRunLedgerInput = {
  runId: string;
  domainId: string;
  actionId: string;
  bindingRef: string;
  status: StandardAgentActionRunStatus;
  startedAt: string;
  completedAt: string;
  input: StandardAgentActionRunBytesRef;
  output: StandardAgentActionRunBytesRef;
};

export type StandardAgentActionRunEventInput = StandardAgentActionRunLedgerInput & {
  db: DatabaseSync;
};

export type StandardAgentActionRunLedgerEntry = {
  surface_kind: 'opl_standard_agent_action_run_ledger_entry';
  version: 'opl-standard-agent-action-run-ledger.v1';
  run_id: string;
  domain_id: string;
  action_id: string;
  binding_ref: string;
  status: StandardAgentActionRunStatus;
  started_at: string;
  completed_at: string;
  input: StandardAgentActionRunBytesRef;
  output: StandardAgentActionRunBytesRef;
  authority_boundary: {
    refs_only: true;
    contains_domain_body: false;
    can_write_domain_truth: false;
    can_create_owner_receipt: false;
    can_authorize_quality_or_export: false;
  };
};

export type StandardAgentActionRunLedgerEvent = {
  taskId: null;
  domainId: string;
  eventType: 'standard_agent_action_run_recorded';
  source: 'opl_hosted_standard_agent_action';
  payload: StandardAgentActionRunLedgerEntry;
};

const LEDGER_INPUT_KEYS = [
  'runId',
  'domainId',
  'actionId',
  'bindingRef',
  'status',
  'startedAt',
  'completedAt',
  'input',
  'output',
] as const;
const EVENT_INPUT_KEYS = ['db', ...LEDGER_INPUT_KEYS] as const;
const BYTES_REF_KEYS = ['ref', 'sha256', 'byte_size'] as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], field: string) {
  const forbidden = Object.keys(value).filter((key) => !allowed.includes(key));
  if (forbidden.length > 0) {
    fail(`Standard Agent action run ledger ${field} contains forbidden fields.`, {
      field,
      forbidden_fields: forbidden,
    });
  }
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`Standard Agent action run ledger ${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function timestamp(value: unknown, field: string) {
  const normalized = text(value, field);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) {
    fail(`Standard Agent action run ledger ${field} must be a canonical ISO timestamp.`, {
      field,
      value: normalized,
    });
  }
  return normalized;
}

function bytesRef(value: unknown, field: string): StandardAgentActionRunBytesRef {
  if (!isRecord(value)) {
    fail(`Standard Agent action run ledger ${field} must be an object.`, { field });
  }
  exactKeys(value, BYTES_REF_KEYS, field);
  const ref = text(value.ref, `${field}.ref`);
  let url: URL;
  try {
    url = new URL(ref);
  } catch {
    fail(`Standard Agent action run ledger ${field}.ref must be a file URL.`, { field, ref });
  }
  if (url.protocol !== 'file:') {
    fail(`Standard Agent action run ledger ${field}.ref must be a file URL.`, { field, ref });
  }
  const digest = text(value.sha256, `${field}.sha256`);
  if (!SHA256_PATTERN.test(digest)) {
    fail(`Standard Agent action run ledger ${field}.sha256 must be lowercase SHA-256.`, { field });
  }
  if (!Number.isSafeInteger(value.byte_size) || Number(value.byte_size) < 0) {
    fail(`Standard Agent action run ledger ${field}.byte_size must be a non-negative safe integer.`, {
      field,
    });
  }
  return { ref, sha256: digest, byte_size: Number(value.byte_size) };
}

function authorityBoundary(): StandardAgentActionRunLedgerEntry['authority_boundary'] {
  return {
    refs_only: true,
    contains_domain_body: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_authorize_quality_or_export: false,
  };
}

export function buildStandardAgentActionRunLedgerEntry(
  input: StandardAgentActionRunLedgerInput,
): StandardAgentActionRunLedgerEntry {
  if (!isRecord(input)) fail('Standard Agent action run ledger input must be an object.');
  exactKeys(input, LEDGER_INPUT_KEYS, 'input');
  if (!['completed', 'failed', 'blocked'].includes(String(input.status))) {
    fail('Standard Agent action run ledger status is unsupported.', { status: input.status });
  }
  const startedAt = timestamp(input.startedAt, 'startedAt');
  const completedAt = timestamp(input.completedAt, 'completedAt');
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    fail('Standard Agent action run ledger completedAt precedes startedAt.', {
      started_at: startedAt,
      completed_at: completedAt,
    });
  }
  return {
    surface_kind: 'opl_standard_agent_action_run_ledger_entry',
    version: 'opl-standard-agent-action-run-ledger.v1',
    run_id: text(input.runId, 'runId'),
    domain_id: text(input.domainId, 'domainId'),
    action_id: text(input.actionId, 'actionId'),
    binding_ref: text(input.bindingRef, 'bindingRef'),
    status: input.status,
    started_at: startedAt,
    completed_at: completedAt,
    input: bytesRef(input.input, 'input'),
    output: bytesRef(input.output, 'output'),
    authority_boundary: authorityBoundary(),
  };
}

export function buildStandardAgentActionRunLedgerEvent(
  input: StandardAgentActionRunLedgerInput,
): StandardAgentActionRunLedgerEvent {
  const entry = buildStandardAgentActionRunLedgerEntry(input);
  return {
    taskId: null,
    domainId: entry.domain_id,
    eventType: 'standard_agent_action_run_recorded',
    source: 'opl_hosted_standard_agent_action',
    payload: entry,
  };
}

export function recordStandardAgentActionRunEvent(input: StandardAgentActionRunEventInput) {
  if (!isRecord(input)) fail('Standard Agent action run event input must be an object.');
  exactKeys(input, EVENT_INPUT_KEYS, 'event input');
  const event = buildStandardAgentActionRunLedgerEvent({
    runId: input.runId,
    domainId: input.domainId,
    actionId: input.actionId,
    bindingRef: input.bindingRef,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    input: input.input,
    output: input.output,
  });
  return {
    ledger_entry: event.payload,
    recorded_event: insertEvent(input.db, event),
  };
}
