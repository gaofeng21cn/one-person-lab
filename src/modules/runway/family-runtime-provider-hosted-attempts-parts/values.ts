import path from 'node:path';

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

export function masDefaultExecutorCurrentnessBasis(payload: Record<string, unknown>) {
  return (isRecord(payload.owner_route_currentness_basis) ? payload.owner_route_currentness_basis : null)
    ?? nestedRecord(payload, ['owner_route', 'currentness_contract', 'basis']);
}

export function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
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

export function workspaceRootFromProfile(profile: string | null) {
  if (!profile) {
    return null;
  }
  const marker = '/ops/medautoscience/profiles/';
  const index = profile.indexOf(marker);
  return index >= 0 ? profile.slice(0, index) : null;
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
  const workspaceRoot = optionalString(payload.workspace_root)
    ?? workspaceRootFromProfile(optionalString(payload.profile));
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
