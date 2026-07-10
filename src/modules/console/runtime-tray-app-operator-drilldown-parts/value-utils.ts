import type { DomainManifestCatalogEntry } from '../../atlas/index.ts';
import {
  countValue as numberValue,
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

export {
  numberValue,
  record,
  recordList,
  stringList,
  stringValue,
};

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function uniqueRefsByValue<T extends { ref: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.ref)) {
      return false;
    }
    seen.add(value.ref);
    return true;
  });
}

export function commandRef(args: string[]) {
  return `opl ${args.map((arg) => (
    arg.includes(' ') || arg.includes('"') ? JSON.stringify(arg) : arg
  )).join(' ')}`;
}

export function runtimeActionExecuteCommand(actionId: string, payloadFile = true) {
  return [
    'runtime',
    'action',
    'execute',
    '--action',
    actionId,
    ...(payloadFile ? ['--payload-file', '<payload.json>'] : []),
  ];
}

export function buildOperatorActionRoute<const Details extends JsonRecord & {
  action_id: string;
  action_kind: string;
  authority_boundary: JsonRecord;
}>(
  oplCliArgs: string[],
  details: Details,
  ref = commandRef(oplCliArgs),
) {
  return {
    ref,
    opl_cli_args: oplCliArgs,
    role: 'operator_action_route' as const,
    owner: 'opl' as const,
    route_target_kind: 'opl_cli' as const,
    execution_policy: 'opl_safe_action_shell' as const,
    execution_surface: 'opl runtime action execute' as const,
    stage_attempt_id: null,
    domain_id: null,
    stage_id: null,
    can_execute: false as const,
    ...details,
  };
}

export function cleanupCommandDomainId(project: DomainManifestCatalogEntry, fallbackDomainId: string) {
  return stringValue(project.project_id)
    ?? stringValue(project.project)
    ?? fallbackDomainId;
}

function typedBlockerId(value: JsonRecord) {
  return stringValue(value.blocker_id)
    ?? stringValue(value.blocker_kind)
    ?? stringValue(value.reason)
    ?? JSON.stringify(value);
}

export function uniqueBlockers(values: JsonRecord[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = typedBlockerId(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function refsFromRecord(value: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    if (typeof entry === 'string') {
      return [entry];
    }
    return stringList(entry);
  }));
}
