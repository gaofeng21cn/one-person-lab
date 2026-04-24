import type {
  NormalizedCheckpointSummary,
  NormalizedSurfaceRef,
  NormalizedTaskSurfaceDescriptor,
} from './types.ts';
import {
  isRecord,
  optionalString,
  readStringList,
  requireString,
  requireSurfaceKind,
} from './shared-utils.ts';

export function normalizeSurfaceRef(value: unknown, field: string): NormalizedSurfaceRef | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    ref_kind: requireString(value.ref_kind, `${field}.ref_kind`),
    ref: requireString(value.ref, `${field}.ref`),
    ...(optionalString(value.role) ? { role: optionalString(value.role)! } : {}),
    ...(optionalString(value.label) ? { label: optionalString(value.label)! } : {}),
  };
}

export function normalizeTaskSurfaceDescriptor(
  value: unknown,
  field: string,
): NormalizedTaskSurfaceDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    summary: requireString(value.summary, `${field}.summary`),
    command: optionalString(value.command),
    ref: normalizeSurfaceRef(value.ref, `${field}.ref`),
    step_id: optionalString(value.step_id),
    locator_fields: readStringList(value.locator_fields, `${field}.locator_fields`),
  };
}

export function normalizeCheckpointSummary(
  value: unknown,
  field: string,
): NormalizedCheckpointSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  requireSurfaceKind(value.surface_kind, field, 'checkpoint_summary');

  return {
    surface_kind: 'checkpoint_summary',
    status: requireString(value.status, `${field}.status`),
    summary: requireString(value.summary, `${field}.summary`),
    checkpoint_id: optionalString(value.checkpoint_id),
    recorded_at: optionalString(value.recorded_at),
    lineage_ref: normalizeSurfaceRef(value.lineage_ref, `${field}.lineage_ref`),
    verification_ref: normalizeSurfaceRef(value.verification_ref, `${field}.verification_ref`),
  };
}
