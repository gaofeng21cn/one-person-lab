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
] as const;

export const WORK_ITEM_VISIBILITY_STATES = ['visible', 'archived'] as const;

const LEGACY_WORK_ITEM_LIFECYCLE_STATES = [
  ...WORK_ITEM_USER_LIFECYCLE_STATES,
  'archived',
] as const;

export type WorkItemUserLifecycleState = typeof WORK_ITEM_USER_LIFECYCLE_STATES[number];
export type WorkItemVisibilityState = typeof WORK_ITEM_VISIBILITY_STATES[number];
type LegacyWorkItemLifecycleState = typeof LEGACY_WORK_ITEM_LIFECYCLE_STATES[number];
type WorkItemControlAxis = 'lifecycle' | 'visibility';

export type WorkItemControlIdentity = {
  agent_id: string;
  project_id: string;
  work_item_id: string;
};

type WorkItemControlLookupIdentity = WorkItemControlIdentity & {
  legacy_project_ids?: string[];
};

export type WorkItemControlEntry = WorkItemControlIdentity & {
  control_key: string;
  lifecycle_state: WorkItemUserLifecycleState | null;
  visibility_state: WorkItemVisibilityState;
  lifecycle_reason: string | null;
  lifecycle_source: string | null;
  lifecycle_updated_at: string | null;
  visibility_reason: string | null;
  visibility_source: string | null;
  visibility_updated_at: string | null;
  generation: number;
  updated_at: string;
};

export type WorkItemControlTransition = WorkItemControlEntry & {
  transition_id: string;
  control_axis: WorkItemControlAxis;
  previous_lifecycle_state: WorkItemUserLifecycleState | null;
  previous_visibility_state: WorkItemVisibilityState;
  reason: string | null;
  source: string;
};

export type WorkItemControlLedger = {
  surface_kind: 'opl_work_item_control_ledger.v2';
  version: 2;
  generation: number;
  updated_at: string | null;
  items: WorkItemControlEntry[];
  transitions: WorkItemControlTransition[];
};

export type WorkItemControlProjectionRecord = {
  lifecycle_state: WorkItemUserLifecycleState | null;
  lifecycle_updated_at: string | null;
  visibility_state: WorkItemVisibilityState;
  visibility_source: 'default' | 'work_item_control_ledger';
  visibility_updated_at: string | null;
  source_ref: string | null;
  generation: number;
};

export type SetWorkItemControlStateInput = WorkItemControlIdentity & {
  lifecycle_state: WorkItemUserLifecycleState;
  reason?: string | null;
  source?: string;
  expected_generation?: number | null;
};

export type SetWorkItemVisibilityStateInput = WorkItemControlIdentity & {
  visibility_state: WorkItemVisibilityState;
  reason?: string | null;
  source?: string;
  expected_generation?: number | null;
};

type LegacyWorkItemControlEntry = WorkItemControlIdentity & {
  control_key: string;
  lifecycle_state: LegacyWorkItemLifecycleState;
  reason: string | null;
  source: string;
  generation: number;
  updated_at: string;
};

type LegacyWorkItemControlTransition = LegacyWorkItemControlEntry & {
  transition_id: string;
  previous_state: LegacyWorkItemLifecycleState | null;
};

function emptyLedger(): WorkItemControlLedger {
  return {
    surface_kind: 'opl_work_item_control_ledger.v2',
    version: 2,
    generation: 0,
    updated_at: null,
    items: [],
    transitions: [],
  };
}

function requiredIdentityValue(
  value: unknown,
  field: keyof WorkItemControlIdentity,
  actionId: string,
) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} requires payload.${field}.`, {
      action_id: actionId,
      required_field: field,
    });
  }
  return value.trim();
}

function normalizedIdentity(raw: WorkItemControlIdentity, actionId: string): WorkItemControlIdentity {
  return {
    agent_id: requiredIdentityValue(raw.agent_id, 'agent_id', actionId),
    project_id: requiredIdentityValue(raw.project_id, 'project_id', actionId),
    work_item_id: requiredIdentityValue(raw.work_item_id, 'work_item_id', actionId),
  };
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

function isLegacyLifecycleState(value: unknown): value is LegacyWorkItemLifecycleState {
  return typeof value === 'string'
    && (LEGACY_WORK_ITEM_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function isVisibilityState(value: unknown): value is WorkItemVisibilityState {
  return typeof value === 'string'
    && (WORK_ITEM_VISIBILITY_STATES as readonly string[]).includes(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function normalizeEntry(value: unknown): WorkItemControlEntry | null {
  if (!isRecord(value)) return null;
  if (value.lifecycle_state !== null && !isLifecycleState(value.lifecycle_state)) return null;
  if (!isVisibilityState(value.visibility_state)) return null;
  if (
    typeof value.agent_id !== 'string'
    || typeof value.project_id !== 'string'
    || typeof value.work_item_id !== 'string'
    || typeof value.control_key !== 'string'
    || !isNullableString(value.lifecycle_reason)
    || !isNullableString(value.lifecycle_source)
    || !isNullableString(value.lifecycle_updated_at)
    || !isNullableString(value.visibility_reason)
    || !isNullableString(value.visibility_source)
    || !isNullableString(value.visibility_updated_at)
    || !Number.isInteger(value.generation)
    || (value.generation as number) < 0
    || typeof value.updated_at !== 'string'
  ) return null;
  if (
    (value.lifecycle_state === null && (value.lifecycle_source !== null || value.lifecycle_updated_at !== null))
    || (value.lifecycle_state !== null && (value.lifecycle_source === null || value.lifecycle_updated_at === null))
    || ((value.visibility_source === null) !== (value.visibility_updated_at === null))
  ) return null;
  return value as WorkItemControlEntry;
}

function normalizeTransition(value: unknown): WorkItemControlTransition | null {
  const entry = normalizeEntry(value);
  if (!entry || !isRecord(value)) return null;
  if (
    typeof value.transition_id !== 'string'
    || !['lifecycle', 'visibility'].includes(String(value.control_axis))
    || (value.previous_lifecycle_state !== null && !isLifecycleState(value.previous_lifecycle_state))
    || !isVisibilityState(value.previous_visibility_state)
    || !isNullableString(value.reason)
    || typeof value.source !== 'string'
  ) return null;
  return value as WorkItemControlTransition;
}

function normalizeLegacyEntry(value: unknown): LegacyWorkItemControlEntry | null {
  if (!isRecord(value) || !isLegacyLifecycleState(value.lifecycle_state)) return null;
  if (
    typeof value.agent_id !== 'string'
    || typeof value.project_id !== 'string'
    || typeof value.work_item_id !== 'string'
    || typeof value.control_key !== 'string'
    || typeof value.source !== 'string'
    || typeof value.updated_at !== 'string'
    || !Number.isInteger(value.generation)
    || (value.generation as number) < 0
    || !isNullableString(value.reason)
  ) return null;
  return value as LegacyWorkItemControlEntry;
}

function normalizeLegacyTransition(value: unknown): LegacyWorkItemControlTransition | null {
  const entry = normalizeLegacyEntry(value);
  if (!entry || !isRecord(value) || typeof value.transition_id !== 'string') return null;
  if (value.previous_state !== null && !isLegacyLifecycleState(value.previous_state)) return null;
  return value as LegacyWorkItemControlTransition;
}

function migrateLegacyEntry(entry: LegacyWorkItemControlEntry): WorkItemControlEntry {
  const archived = entry.lifecycle_state === 'archived';
  return {
    agent_id: entry.agent_id,
    project_id: entry.project_id,
    work_item_id: entry.work_item_id,
    control_key: entry.control_key,
    lifecycle_state: entry.lifecycle_state === 'archived' ? null : entry.lifecycle_state,
    visibility_state: archived ? 'archived' : 'visible',
    lifecycle_reason: archived ? null : entry.reason,
    lifecycle_source: archived ? null : entry.source,
    lifecycle_updated_at: archived ? null : entry.updated_at,
    visibility_reason: archived ? entry.reason : null,
    visibility_source: archived ? entry.source : null,
    visibility_updated_at: archived ? entry.updated_at : null,
    generation: entry.generation,
    updated_at: entry.updated_at,
  };
}

function migrateLegacyTransition(
  transition: LegacyWorkItemControlTransition,
): WorkItemControlTransition {
  const entry = migrateLegacyEntry(transition);
  return {
    ...entry,
    transition_id: transition.transition_id,
    control_axis: transition.lifecycle_state === 'archived' ? 'visibility' : 'lifecycle',
    previous_lifecycle_state: transition.previous_state === 'archived'
      ? null
      : transition.previous_state,
    previous_visibility_state: transition.previous_state === 'archived' ? 'archived' : 'visible',
    reason: transition.reason,
    source: transition.source,
  };
}

function invalidLedger(file: string, message: string): never {
  throw new FrameworkContractError('contract_shape_invalid', message, { file });
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
    || typeof payload.generation !== 'number'
    || !Array.isArray(payload.items)
    || !Array.isArray(payload.transitions)
  ) {
    invalidLedger(file, 'Work item control ledger has an invalid shape.');
  }

  if (payload.surface_kind === 'opl_work_item_control_ledger.v2' && payload.version === 2) {
    const items = payload.items.map(normalizeEntry);
    const transitions = payload.transitions.map(normalizeTransition);
    if (items.some((entry) => entry === null) || transitions.some((entry) => entry === null)) {
      invalidLedger(file, 'Work item control ledger contains an invalid v2 entry.');
    }
    return {
      surface_kind: 'opl_work_item_control_ledger.v2',
      version: 2,
      generation: payload.generation,
      updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
      items: items as WorkItemControlEntry[],
      transitions: transitions as WorkItemControlTransition[],
    };
  }

  if (payload.surface_kind === 'opl_work_item_control_ledger.v1' && payload.version === 1) {
    const legacyItems = payload.items.map(normalizeLegacyEntry);
    const legacyTransitions = payload.transitions.map(normalizeLegacyTransition);
    if (legacyItems.some((entry) => entry === null) || legacyTransitions.some((entry) => entry === null)) {
      invalidLedger(file, 'Work item control ledger contains an invalid v1 entry.');
    }
    return {
      surface_kind: 'opl_work_item_control_ledger.v2',
      version: 2,
      generation: payload.generation,
      updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
      items: (legacyItems as LegacyWorkItemControlEntry[]).map(migrateLegacyEntry),
      transitions: (legacyTransitions as LegacyWorkItemControlTransition[]).map(migrateLegacyTransition),
    };
  }

  invalidLedger(file, 'Work item control ledger has an unsupported version.');
}

export function findWorkItemControl(identity: WorkItemControlIdentity) {
  const key = workItemControlKey(identity);
  return readWorkItemControlLedger().items.find((entry) => entry.control_key === key) ?? null;
}

export function buildWorkItemControlResolver(ledger = readWorkItemControlLedger()) {
  const entries = new Map(ledger.items.map((entry) => [entry.control_key, entry]));
  return (identity: WorkItemControlLookupIdentity): WorkItemControlProjectionRecord => {
    const candidateProjectIds = [
      identity.project_id,
      ...(identity.legacy_project_ids ?? []),
    ];
    const entry = candidateProjectIds
      .map((projectId) => entries.get(workItemControlKey({
        agent_id: identity.agent_id,
        project_id: projectId,
        work_item_id: identity.work_item_id,
      })))
      .find((candidate) => candidate !== undefined);
    const sourceRef = entry ? `opl://work-item-control/${entry.control_key}` : null;
    const visibilityControlled = entry?.visibility_updated_at !== null
      && entry?.visibility_updated_at !== undefined;
    return {
      lifecycle_state: entry?.lifecycle_state ?? null,
      lifecycle_updated_at: entry?.lifecycle_updated_at ?? null,
      visibility_state: entry?.visibility_state ?? 'visible',
      visibility_source: visibilityControlled ? 'work_item_control_ledger' : 'default',
      visibility_updated_at: visibilityControlled ? entry.visibility_updated_at : null,
      source_ref: sourceRef,
      generation: ledger.generation,
    };
  };
}

function normalizedReason(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedSource(value: string | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'opl_app';
}

function assertExpectedGeneration(
  expectedGeneration: number | null | undefined,
  ledger: WorkItemControlLedger,
) {
  if (
    expectedGeneration !== undefined
    && expectedGeneration !== null
    && expectedGeneration !== ledger.generation
  ) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Work item control changed after it was read; refresh before retrying.',
      {
        reason_code: 'work_item_control_generation_conflict',
        expected_generation: expectedGeneration,
        current_generation: ledger.generation,
      },
    );
  }
}

function newControlEntry(
  identity: WorkItemControlIdentity,
  controlKey: string,
  generation: number,
  updatedAt: string,
): WorkItemControlEntry {
  return {
    ...identity,
    control_key: controlKey,
    lifecycle_state: null,
    visibility_state: 'visible',
    lifecycle_reason: null,
    lifecycle_source: null,
    lifecycle_updated_at: null,
    visibility_reason: null,
    visibility_source: null,
    visibility_updated_at: null,
    generation,
    updated_at: updatedAt,
  };
}

function setWorkItemControlAxis(input: {
  identity: WorkItemControlIdentity;
  action_id: 'work_item_lifecycle_set' | 'work_item_visibility_set';
  control_axis: WorkItemControlAxis;
  lifecycle_state?: WorkItemUserLifecycleState;
  visibility_state?: WorkItemVisibilityState;
  reason?: string | null;
  source?: string;
  expected_generation?: number | null;
}, options: { dryRun?: boolean }) {
  const ledger = readWorkItemControlLedger();
  assertExpectedGeneration(input.expected_generation, ledger);

  const controlKey = workItemControlKey(input.identity);
  const previous = ledger.items.find((entry) => entry.control_key === controlKey) ?? null;
  const previousLifecycleState = previous?.lifecycle_state ?? null;
  const previousVisibilityState = previous?.visibility_state ?? 'visible';
  const nextGeneration = ledger.generation + 1;
  const updatedAt = new Date().toISOString();
  const reason = normalizedReason(input.reason);
  const source = normalizedSource(input.source);
  const base = previous ?? newControlEntry(input.identity, controlKey, nextGeneration, updatedAt);
  const entry: WorkItemControlEntry = input.control_axis === 'lifecycle'
    ? {
        ...base,
        lifecycle_state: input.lifecycle_state!,
        lifecycle_reason: reason,
        lifecycle_source: source,
        lifecycle_updated_at: updatedAt,
        generation: nextGeneration,
        updated_at: updatedAt,
      }
    : {
        ...base,
        visibility_state: input.visibility_state!,
        visibility_reason: reason,
        visibility_source: source,
        visibility_updated_at: updatedAt,
        generation: nextGeneration,
        updated_at: updatedAt,
      };
  const previousState = input.control_axis === 'lifecycle'
    ? previousLifecycleState
    : previousVisibilityState;
  const currentState = input.control_axis === 'lifecycle'
    ? entry.lifecycle_state
    : entry.visibility_state;
  const preview = {
    surface_kind: 'opl_work_item_control_transition_receipt.v2',
    status: options.dryRun ? 'dry_run' : 'applied',
    action_id: input.action_id,
    control_axis: input.control_axis,
    ledger_generation: nextGeneration,
    previous_state: previousState,
    current_state: currentState,
    current: entry,
    authority_boundary: {
      owns_user_collaboration_lifecycle: input.control_axis === 'lifecycle',
      owns_user_visibility: input.control_axis === 'visibility',
      visibility_mutation_stops_runtime: false,
      can_write_domain_truth: false,
      can_claim_scientific_quality: false,
      can_claim_submission_ready: false,
    },
  } as const;
  if (options.dryRun) return preview;

  const transition: WorkItemControlTransition = {
    ...entry,
    transition_id: `opl://work-item-control/${controlKey}/${randomUUID()}`,
    control_axis: input.control_axis,
    previous_lifecycle_state: previousLifecycleState,
    previous_visibility_state: previousVisibilityState,
    reason,
    source,
  };
  const nextLedger: WorkItemControlLedger = {
    surface_kind: 'opl_work_item_control_ledger.v2',
    version: 2,
    generation: nextGeneration,
    updated_at: updatedAt,
    items: [entry, ...ledger.items.filter((candidate) => candidate.control_key !== controlKey)],
    transitions: [transition, ...ledger.transitions],
  };
  const paths = ensureOplStateDir(resolveOplStatePaths());
  writeJsonPayloadFile(paths.work_item_control_ledger_file, nextLedger);
  return preview;
}

export function setWorkItemControlState(
  rawInput: SetWorkItemControlStateInput,
  options: { dryRun?: boolean } = {},
) {
  const actionId = 'work_item_lifecycle_set';
  const identity = normalizedIdentity(rawInput, actionId);
  if (!isLifecycleState(rawInput.lifecycle_state)) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} requires a supported lifecycle_state.`, {
      action_id: actionId,
      allowed_states: WORK_ITEM_USER_LIFECYCLE_STATES,
      archive_action_id: 'work_item_visibility_set',
    });
  }
  return setWorkItemControlAxis({
    identity,
    action_id: actionId,
    control_axis: 'lifecycle',
    lifecycle_state: rawInput.lifecycle_state,
    reason: rawInput.reason,
    source: rawInput.source,
    expected_generation: rawInput.expected_generation,
  }, options);
}

export function setWorkItemVisibilityState(
  rawInput: SetWorkItemVisibilityStateInput,
  options: { dryRun?: boolean } = {},
) {
  const actionId = 'work_item_visibility_set';
  const identity = normalizedIdentity(rawInput, actionId);
  if (!isVisibilityState(rawInput.visibility_state)) {
    throw new FrameworkContractError('cli_usage_error', `${actionId} requires a supported visibility_state.`, {
      action_id: actionId,
      allowed_states: WORK_ITEM_VISIBILITY_STATES,
    });
  }
  return setWorkItemControlAxis({
    identity,
    action_id: actionId,
    control_axis: 'visibility',
    visibility_state: rawInput.visibility_state,
    reason: rawInput.reason,
    source: rawInput.source,
    expected_generation: rawInput.expected_generation,
  }, options);
}
