import { FrameworkContractError } from '../charter/contracts.ts';
import type {
  FamilyStagePackLibraryLifecycleStatus,
  FamilyStagePackMigrationPolicy,
} from './family-stage-pack-registry.ts';

export function parseOptionArgs(args: string[], required: string[], flags: string[] = []) {
  const parsed: Record<string, string> = {};
  const parsedFlags = new Set<string>();
  const flagSet = new Set(flags);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const key = token.slice(2);
    if (flagSet.has(key)) {
      parsedFlags.add(key);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    parsed[key] = value;
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new FrameworkContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return { parsed, flags: parsedFlags };
}

export function parseRepeatedOptionArgs(args: string[], required: string[], repeated: string[] = []) {
  const parsed: Record<string, string> = {};
  const repeatedValues: Record<string, string[]> = Object.fromEntries(repeated.map((key) => [key, []]));
  const repeatable = new Set(repeated);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    const key = token.slice(2);
    if (repeatable.has(key)) {
      repeatedValues[key].push(value);
    } else {
      parsed[key] = value;
    }
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new FrameworkContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return { parsed, repeated: repeatedValues };
}

export function normalizeMigrationPolicy(value: string | undefined): FamilyStagePackMigrationPolicy | null {
  if (!value) {
    return null;
  }
  if (value === 'continue_old_hash' || value === 'migrate_to_new_hash' || value === 'blocked_human_gate') {
    return value;
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported stage pack migration policy: ${value}.`, {
    allowed_policies: ['continue_old_hash', 'migrate_to_new_hash', 'blocked_human_gate'],
  });
}

export function normalizeLibraryLifecycleStatus(value: string | undefined): FamilyStagePackLibraryLifecycleStatus | null {
  if (!value) {
    return null;
  }
  if (
    value === 'candidate'
    || value === 'admitted'
    || value === 'reused'
    || value === 'deprecated'
    || value === 'superseded'
  ) {
    return value;
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported stage pack library lifecycle status: ${value}.`, {
    allowed_statuses: ['candidate', 'admitted', 'reused', 'deprecated', 'superseded'],
  });
}
