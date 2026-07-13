import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

export const WORK_ITEM_USER_LIFECYCLE_STATES = [
  'active',
  'delivered_paused',
  'paused',
  'stopped',
  'archived',
] as const;

export type WorkItemUserLifecycleState = typeof WORK_ITEM_USER_LIFECYCLE_STATES[number];

export type WorkItemControlIdentity = {
  agent_id: string;
  project_id: string;
  work_item_id: string;
};

export type WorkItemControlEntry = WorkItemControlIdentity & {
  control_key: string;
  lifecycle_state: WorkItemUserLifecycleState;
  reason: string | null;
  source: string;
  generation: number;
  updated_at: string;
};

export type WorkItemControlTransition = WorkItemControlEntry & {
  transition_id: string;
  previous_state: WorkItemUserLifecycleState | null;
};

export type WorkItemControlLedger = {
  surface_kind: 'opl_work_item_control_ledger.v1';
  version: 1;
  generation: number;
  updated_at: string | null;
  items: WorkItemControlEntry[];
  transitions: WorkItemControlTransition[];
};

export type WorkItemControlProjectionRecord = {
  state: WorkItemUserLifecycleState;
  updated_at: string;
  source_ref: string;
};

export type SetWorkItemControlStateInput = WorkItemControlIdentity & {
  lifecycle_state: WorkItemUserLifecycleState;
  reason?: string | null;
  source?: string;
  expected_generation?: number | null;
};

function emptyLedger(): WorkItemControlLedger {
  return {
    surface_kind: 'opl_work_item_control_ledger.v1',
    version: 1,
    generation: 0,
    updated_at: null,
    items: [],
    transitions: [],
  };
}

function requiredIdentityValue(value: unknown, field: keyof WorkItemControlIdentity) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FrameworkContractError('cli_usage_error', `work_item_lifecycle_set requires payload.${field}.`, {
      action_id: 'work_item_lifecycle_set',
      required_field: field,
    });
  }
  return value.trim();
}

export function workItemControlKey(identity: WorkItemControlIdentity) {
  return [identity.agent_id, identity.project_id, identity.work_item_id]
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function isLifecycleState(value: unknown): value is WorkItemUserLifecycleState {
  return typeof value === 'string'
    && (WORK_ITEM_USER_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function normalizeEntry(value: unknown): WorkItemControlEntry | null {
  if (!isRecord(value) || !isLifecycleState(value.lifecycle_state)) return null;
  if (
    typeof value.agent_id !== 'string'
    || typeof value.project_id !== 'string'
    || typeof value.work_item_id !== 'string'
    || typeof value.control_key !== 'string'
    || typeof value.source !== 'string'
    || typeof value.updated_at !== 'string'
    || typeof value.generation !== 'number'
    || (value.reason !== null && typeof value.reason !== 'string')
  ) return null;
  return value as WorkItemControlEntry;
}

function normalizeTransition(value: unknown): WorkItemControlTransition | null {
  const entry = normalizeEntry(value);
  if (!entry || !isRecord(value) || typeof value.transition_id !== 'string') return null;
  if (value.previous_state !== null && !isLifecycleState(value.previous_state)) return null;
  return value as WorkItemControlTransition;
}

export function workItemControlLedgerPath() {
  return resolveOplStatePaths().work_item_control_ledger_file;
}

export function readWorkItemControlLedger(): WorkItemControlLedger {
  const file = workItemControlLedgerPath();
  if (!fs.existsSync(file)) return emptyLedger();

  let payload: unknown;
  try {
    payload = readJsonPayloadFile(file);
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Work item control ledger is not valid JSON.', {
      file,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (
    !isRecord(payload)
    || payload.surface_kind !== 'opl_work_item_control_ledger.v1'
    || payload.version !== 1
    || typeof payload.generation !== 'number'
    || !Array.isArray(payload.items)
    || !Array.isArray(payload.transitions)
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Work item control ledger has an invalid shape.', {
      file,
    });
  }
  const items = payload.items.map(normalizeEntry);
  const transitions = payload.transitions.map(normalizeTransition);
  if (items.some((entry) => entry === null) || transitions.some((entry) => entry === null)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Work item control ledger contains an invalid entry.', {
      file,
    });
  }
  return {
    surface_kind: 'opl_work_item_control_ledger.v1',
    version: 1,
    generation: payload.generation,
    updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
    items: items as WorkItemControlEntry[],
    transitions: transitions as WorkItemControlTransition[],
  };
}

export function findWorkItemControl(identity: WorkItemControlIdentity) {
  const key = workItemControlKey(identity);
  return readWorkItemControlLedger().items.find((entry) => entry.control_key === key) ?? null;
}

export function buildWorkItemControlResolver(ledger = readWorkItemControlLedger()) {
  const entries = new Map(ledger.items.map((entry) => [entry.control_key, entry]));
  return (identity: WorkItemControlIdentity): WorkItemControlProjectionRecord | null => {
    const entry = entries.get(workItemControlKey(identity));
    return entry
      ? {
          state: entry.lifecycle_state,
          updated_at: entry.updated_at,
          source_ref: `opl://work-item-control/${entry.control_key}`,
        }
      : null;
  };
}

export function setWorkItemControlState(
  rawInput: SetWorkItemControlStateInput,
  options: { dryRun?: boolean } = {},
) {
  const identity: WorkItemControlIdentity = {
    agent_id: requiredIdentityValue(rawInput.agent_id, 'agent_id'),
    project_id: requiredIdentityValue(rawInput.project_id, 'project_id'),
    work_item_id: requiredIdentityValue(rawInput.work_item_id, 'work_item_id'),
  };
  if (!isLifecycleState(rawInput.lifecycle_state)) {
    throw new FrameworkContractError('cli_usage_error', 'work_item_lifecycle_set requires a supported lifecycle_state.', {
      action_id: 'work_item_lifecycle_set',
      allowed_states: WORK_ITEM_USER_LIFECYCLE_STATES,
    });
  }
  const ledger = readWorkItemControlLedger();
  if (
    rawInput.expected_generation !== undefined
    && rawInput.expected_generation !== null
    && rawInput.expected_generation !== ledger.generation
  ) {
    throw new FrameworkContractError('cli_usage_error', 'Work item lifecycle changed after it was read; refresh before retrying.', {
      reason_code: 'work_item_control_generation_conflict',
      expected_generation: rawInput.expected_generation,
      current_generation: ledger.generation,
    });
  }

  const controlKey = workItemControlKey(identity);
  const previous = ledger.items.find((entry) => entry.control_key === controlKey) ?? null;
  const nextGeneration = ledger.generation + 1;
  const updatedAt = new Date().toISOString();
  const entry: WorkItemControlEntry = {
    ...identity,
    control_key: controlKey,
    lifecycle_state: rawInput.lifecycle_state,
    reason: typeof rawInput.reason === 'string' && rawInput.reason.trim() ? rawInput.reason.trim() : null,
    source: typeof rawInput.source === 'string' && rawInput.source.trim() ? rawInput.source.trim() : 'opl_app',
    generation: nextGeneration,
    updated_at: updatedAt,
  };
  const preview = {
    surface_kind: 'opl_work_item_control_transition_receipt.v1',
    status: options.dryRun ? 'dry_run' : 'applied',
    ledger_generation: nextGeneration,
    previous_state: previous?.lifecycle_state ?? null,
    current: entry,
    authority_boundary: {
      owns_user_collaboration_lifecycle: true,
      can_write_domain_truth: false,
      can_claim_scientific_quality: false,
      can_claim_submission_ready: false,
    },
  } as const;
  if (options.dryRun) return preview;

  const transition: WorkItemControlTransition = {
    ...entry,
    transition_id: `opl://work-item-control/${controlKey}/${randomUUID()}`,
    previous_state: previous?.lifecycle_state ?? null,
  };
  const nextLedger: WorkItemControlLedger = {
    ...ledger,
    generation: nextGeneration,
    updated_at: updatedAt,
    items: [entry, ...ledger.items.filter((candidate) => candidate.control_key !== controlKey)],
    transitions: [transition, ...ledger.transitions],
  };
  const paths = ensureOplStateDir(resolveOplStatePaths());
  writeJsonPayloadFile(paths.work_item_control_ledger_file, nextLedger);
  return preview;
}
