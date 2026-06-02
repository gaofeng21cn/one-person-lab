import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadValueAtPath(value: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!segment || !isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, value);
}

function payloadMatchValuesByPath(taskScope?: FamilyRuntimeTaskScope) {
  const valuesByPath = new Map<string, Set<string>>();
  for (const match of taskScope?.payloadMatches ?? []) {
    const values = valuesByPath.get(match.path) ?? new Set<string>();
    values.add(match.value);
    valuesByPath.set(match.path, values);
  }
  return valuesByPath;
}

export function payloadMatchesTaskScope(
  payload: Record<string, unknown>,
  taskScope?: FamilyRuntimeTaskScope,
) {
  return [...payloadMatchValuesByPath(taskScope)].every(([path, values]) =>
    values.has(String(payloadValueAtPath(payload, path) ?? ''))
  );
}

export function taskRowMatchesScope(row: FamilyRuntimeTaskRow, taskScope?: FamilyRuntimeTaskScope) {
  if (!taskScope) {
    return true;
  }
  if (taskScope.domainId && row.domain_id !== taskScope.domainId) {
    return false;
  }
  if (taskScope.taskKind && row.task_kind !== taskScope.taskKind) {
    return false;
  }
  if (!taskScope.payloadMatches?.length) {
    return true;
  }
  return payloadMatchesTaskScope(JSON.parse(row.payload_json) as Record<string, unknown>, taskScope);
}

export function taskInputMatchesScope(input: {
  domainId: string;
  taskKind: string;
  payload: Record<string, unknown>;
}, taskScope?: FamilyRuntimeTaskScope) {
  if (!taskScope) {
    return true;
  }
  if (taskScope.domainId && input.domainId !== taskScope.domainId) {
    return false;
  }
  if (taskScope.taskKind && input.taskKind !== taskScope.taskKind) {
    return false;
  }
  return payloadMatchesTaskScope(input.payload, taskScope);
}

export function normalizeTaskScopeForStorage(taskScope: FamilyRuntimeTaskScope) {
  return {
    ...(taskScope.domainId ? { domainId: taskScope.domainId } : {}),
    ...(taskScope.taskKind ? { taskKind: taskScope.taskKind } : {}),
    ...((taskScope.payloadMatches?.length ?? 0) > 0
      ? { payloadMatches: taskScope.payloadMatches }
      : {}),
  };
}
