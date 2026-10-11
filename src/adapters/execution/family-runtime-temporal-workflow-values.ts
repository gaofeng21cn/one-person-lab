import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { TemporalStageRunWorkflowInput } from './family-runtime-temporal.ts';

export function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry)) : [];
}

export function asRecordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    : [];
}

export function requiredRecordList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be an array.`, { field });
  }
  return asRecordList(value);
}

export function asRecord(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function stageRunQualityCycleId(input: TemporalStageRunWorkflowInput) {
  return `quality-cycle:${input.stage_run_id}`;
}

