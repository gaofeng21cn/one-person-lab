import type {
  FamilyOrchestrationReferenceRef,
  JsonRecord,
  OperatorLoopActionSurface,
  ProductEntryProgressSurfaceInput,
  ProductEntryResumeContract,
  ProductEntryShellSurface,
  ProductEntryStartModeInput,
  ProductEntryStartResumeSurface,
  ProductEntryStepInput,
} from './types.ts';
import {
  validateFamilyDomainEntryContract as validateSharedFamilyDomainEntryContract,
  validateGatewayInteractionContract as validateSharedGatewayInteractionContract,
} from '../family-entry-contracts.ts';

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`product entry companion 缺少字符串字段: ${field}`);
  }
  return text;
}

export function requireBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`product entry companion 缺少布尔字段: ${field}`);
  }
  return value;
}

export function requireInteger(value: unknown, field: string) {
  if (!Number.isInteger(value)) {
    throw new Error(`product entry companion 缺少整数字段: ${field}`);
  }
  return Number(value);
}

export function requireRecord(value: unknown, field: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`product entry companion 缺少对象字段: ${field}`);
  }
  return value;
}

export function readOptionalStringProperty(value: JsonRecord, key: string, field: string) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return undefined;
  }
  return requireString(value[key], field);
}

export function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`product entry companion 缺少数组字段: ${field}`);
  }
  const normalized = value
    .map((entry, index) => requireString(entry, `${field}[${index}]`));
  return normalized;
}

export function optionalStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

export function normalizeResumeContract(value: unknown, field: string): ProductEntryResumeContract {
  const payload = requireRecord(value, field);
  return {
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    session_locator_field: requireString(payload.session_locator_field, `${field}.session_locator_field`),
    checkpoint_locator_field: optionalString(payload.checkpoint_locator_field),
  };
}

export function normalizeStep(value: unknown, field: string): ProductEntryStepInput {
  const payload = requireRecord(value, field);
  return {
    step_id: requireString(payload.step_id, `${field}.step_id`),
    title: requireString(payload.title, `${field}.title`),
    command: requireString(payload.command, `${field}.command`),
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    summary: requireString(payload.summary, `${field}.summary`),
    requires: readStringList(payload.requires, `${field}.requires`),
  };
}

export function normalizeProgressSurface(value: unknown, field: string): ProductEntryProgressSurfaceInput {
  const payload = requireRecord(value, field);
  return {
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    command: requireString(payload.command, `${field}.command`),
    step_id: optionalString(payload.step_id),
  };
}

export function normalizeStartMode(value: unknown, field: string): ProductEntryStartModeInput {
  const payload = requireRecord(value, field);
  return {
    mode_id: requireString(payload.mode_id, `${field}.mode_id`),
    title: requireString(payload.title, `${field}.title`),
    command: requireString(payload.command, `${field}.command`),
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    summary: requireString(payload.summary, `${field}.summary`),
    requires: readStringList(payload.requires, `${field}.requires`),
  };
}

export function normalizeStartResumeSurface(value: unknown, field: string): ProductEntryStartResumeSurface {
  const payload = requireRecord(value, field);
  const normalized: ProductEntryStartResumeSurface = {
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
  };
  const command = readOptionalStringProperty(payload, 'command', `${field}.command`);
  if (command !== undefined) {
    normalized.command = command;
  }
  const sessionLocatorField = readOptionalStringProperty(
    payload,
    'session_locator_field',
    `${field}.session_locator_field`,
  );
  if (sessionLocatorField !== undefined) {
    normalized.session_locator_field = sessionLocatorField;
  }
  const checkpointLocatorField = readOptionalStringProperty(
    payload,
    'checkpoint_locator_field',
    `${field}.checkpoint_locator_field`,
  );
  if (checkpointLocatorField !== undefined) {
    normalized.checkpoint_locator_field = checkpointLocatorField;
  }
  return normalized;
}

export function normalizeProductEntryShellSurface(value: unknown, field: string): ProductEntryShellSurface {
  const payload = requireRecord(value, field);
  const normalized: ProductEntryShellSurface = {
    command: requireString(payload.command, `${field}.command`),
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
  };
  const summary = readOptionalStringProperty(payload, 'summary', `${field}.summary`);
  if (summary !== undefined) {
    normalized.summary = summary;
  }
  const purpose = readOptionalStringProperty(payload, 'purpose', `${field}.purpose`);
  if (purpose !== undefined) {
    normalized.purpose = purpose;
  }
  const commandTemplate = readOptionalStringProperty(
    payload,
    'command_template',
    `${field}.command_template`,
  );
  if (commandTemplate !== undefined) {
    normalized.command_template = commandTemplate;
  }
  const requires = optionalStringList(payload.requires, `${field}.requires`);
  if (requires !== null) {
    normalized.requires = requires;
  }
  return {
    ...payload,
    ...normalized,
  };
}

export function normalizeOperatorLoopAction(value: unknown, field: string): OperatorLoopActionSurface {
  const payload = requireRecord(value, field);
  return {
    ...payload,
    command: requireString(payload.command, `${field}.command`),
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    summary: requireString(payload.summary, `${field}.summary`),
    requires: readStringList(payload.requires, `${field}.requires`),
  };
}

export function cloneRecord(value: unknown, field: string): JsonRecord {
  return { ...requireRecord(value, field) };
}

export const FRONTDESK_SHARED_HANDOFF_KEYS = [
  'direct_entry_builder',
  'opl_handoff_builder',
] as const;

export function normalizeFrontdeskSummary(value: unknown, field: string) {
  const payload = requireRecord(value, field);
  return {
    frontdesk_command: requireString(payload.frontdesk_command, `${field}.frontdesk_command`),
    recommended_command: requireString(payload.recommended_command, `${field}.recommended_command`),
    operator_loop_command: requireString(payload.operator_loop_command, `${field}.operator_loop_command`),
  };
}

export function mergeExtraPayload<T extends JsonRecord>(base: T, extraPayload: unknown, surfaceKind: string): T {
  if (extraPayload === undefined) {
    return base;
  }
  const normalizedExtraPayload = cloneRecord(extraPayload, 'extra_payload');
  for (const key of Object.keys(normalizedExtraPayload)) {
    if (Object.prototype.hasOwnProperty.call(base, key)) {
      throw new Error(`${surfaceKind} extra_payload 不允许覆盖核心字段: ${key}`);
    }
  }
  return {
    ...base,
    ...normalizedExtraPayload,
  } as T;
}

export function validateFamilyReferenceRef(value: unknown, field: string): FamilyOrchestrationReferenceRef {
  const payload = requireRecord(value, field);
  const normalized: FamilyOrchestrationReferenceRef = {
    ...payload,
    ref_kind: requireString(payload.ref_kind, `${field}.ref_kind`),
    ref: requireString(payload.ref, `${field}.ref`),
  };
  const label = readOptionalStringProperty(payload, 'label', `${field}.label`);
  if (label !== undefined) {
    normalized.label = label;
  }
  return normalized;
}

export function validateOptionalFamilyReferenceRef(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  return validateFamilyReferenceRef(value, field);
}

export function validateDomainEntryContractShape(value: unknown, field: string) {
  return validateSharedFamilyDomainEntryContract(value, field);
}

export function validateGatewayInteractionContractShape(value: unknown, field: string) {
  return validateSharedGatewayInteractionContract(value, field);
}

