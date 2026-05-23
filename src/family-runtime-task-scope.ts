import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function payloadValueAtPath(value: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!segment || !isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, value);
}

export function payloadMatchesTaskScope(
  payload: Record<string, unknown>,
  taskScope?: FamilyRuntimeTaskScope,
) {
  return (taskScope?.payloadMatches ?? []).every((match) =>
    String(payloadValueAtPath(payload, match.path) ?? '') === match.value
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
