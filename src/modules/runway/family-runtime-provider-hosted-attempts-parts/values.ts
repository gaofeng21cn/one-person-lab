import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  recordList as sharedRecordList,
  stringList as sharedStringList,
  stringValue as optionalString,
  uniqueStringList,
} from '../../../kernel/json-record.ts';

export { isRecord, optionalString };

export function exportOwnerFingerprint(payload: Record<string, unknown>) {
  const context = isRecord(payload.opl_domain_export_context) ? payload.opl_domain_export_context : null;
  return optionalString(context?.owner_fingerprint);
}

function nestedRecord(value: Record<string, unknown> | null, keys: string[]) {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

export function defaultExecutorCurrentnessBasis(payload: Record<string, unknown>) {
  return (isRecord(payload.owner_route_currentness_basis) ? payload.owner_route_currentness_basis : null)
    ?? nestedRecord(payload, ['owner_route', 'currentness_contract', 'basis']);
}

export function recordList(value: unknown) {
  return sharedRecordList(value);
}

export function stringList(value: unknown) {
  return sharedStringList(value);
}

export function uniqueStrings(values: Array<string | null>) {
  return uniqueStringList(values);
}

export function sameStringField(left: Record<string, unknown>, right: Record<string, unknown>, key: string) {
  const leftValue = optionalString(left[key]);
  const rightValue = optionalString(right[key]);
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

export function sameOptionalStringField(left: Record<string, unknown>, right: Record<string, unknown>, key: string) {
  const leftValue = optionalString(left[key]);
  const rightValue = optionalString(right[key]);
  if (!leftValue || !rightValue) {
    return !leftValue && !rightValue;
  }
  return leftValue === rightValue;
}

export function workspaceRelativeRef(value: string | null, workspaceRoot: string | null) {
  if (!value || !workspaceRoot || !path.isAbsolute(value)) {
    return value;
  }
  const relative = path.relative(workspaceRoot, value);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return value;
  }
  return relative.split(path.sep).join('/');
}

export function relativeDispatchRefFromPath(payload: Record<string, unknown>) {
  const dispatchPath = optionalString(payload.dispatch_path);
  if (!dispatchPath) {
    return null;
  }
  const workspaceRoot = optionalString(payload.workspace_root);
  if (!workspaceRoot) {
    return null;
  }
  return workspaceRelativeRef(dispatchPath, workspaceRoot);
}

export function recordStringRefs(
  value: Record<string, unknown> | null,
  singularKeys: string[],
  listKeys: string[],
) {
  if (!value) {
    return [];
  }
  return uniqueStrings([
    ...singularKeys.map((key) => optionalString(value[key])),
    ...listKeys.flatMap((key) => stringList(value[key])),
  ]);
}
