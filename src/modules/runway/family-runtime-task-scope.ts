import { parseJsonText } from '../../kernel/json-file.ts';
import { record } from '../../kernel/json-record.ts';
import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';

function payloadValueAtPath(value: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    const currentRecord = record(current);
    if (!segment || currentRecord !== current) {
      return undefined;
    }
    return currentRecord[segment];
  }, value);
}

function payloadValuesAtPath(value: Record<string, unknown>, path: string) {
  const direct = payloadValueAtPath(value, path);
  const aliases: string[] = [];
  if (path === 'idempotency_key') {
    aliases.push(
      'attempt_idempotency_key',
      'route_identity_key',
      'provider_attempt_identity.idempotency_key',
      'provider_attempt_identity.attempt_idempotency_key',
      'provider_attempt_identity.route_identity_key',
    );
  } else if (path === 'attempt_idempotency_key') {
    aliases.push(
      'idempotency_key',
      'route_identity_key',
      'provider_attempt_identity.attempt_idempotency_key',
      'provider_attempt_identity.idempotency_key',
      'provider_attempt_identity.route_identity_key',
    );
  } else if (path === 'route_identity_key') {
    aliases.push(
      'idempotency_key',
      'attempt_idempotency_key',
      'provider_attempt_identity.route_identity_key',
      'provider_attempt_identity.idempotency_key',
      'provider_attempt_identity.attempt_idempotency_key',
    );
  }
  return [
    direct,
    ...aliases.map((alias) => payloadValueAtPath(value, alias)),
  ];
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

function payloadMatchesTaskScope(
  payload: Record<string, unknown>,
  taskScope?: FamilyRuntimeTaskScope,
) {
  return [...payloadMatchValuesByPath(taskScope)].every(([path, values]) =>
    payloadValuesAtPath(payload, path).some((value) => values.has(String(value ?? '')))
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
    const payload = parseJsonText(row.payload_json) as Record<string, unknown>;
    if (payload.provider_attempt_source_task_kind !== taskScope.taskKind) {
      return false;
    }
    if (!taskScope.payloadMatches?.length) {
      return true;
    }
    return payloadMatchesTaskScope(payload, taskScope);
  }
  if (!taskScope.payloadMatches?.length) {
    return true;
  }
  return payloadMatchesTaskScope(parseJsonText(row.payload_json) as Record<string, unknown>, taskScope);
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
    if (input.payload.provider_attempt_source_task_kind !== taskScope.taskKind) {
      return false;
    }
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
