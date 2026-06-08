import { FrameworkContractError } from '../contracts.ts';
import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type {
  FamilyRuntimeCommandInput,
  FamilyRuntimeDomainProfiles,
  FamilyRuntimeTaskScope,
} from '../family-runtime-command.ts';
import { assertProviderKind } from './shared.ts';
import { parseDomainProfileOption, parseTaskScopeOption } from './queue.ts';

export function parseSchedulerTickArgs(rest: string[]): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let force = false;
  let limit = 10;
  let hydrate = true;
  const taskScope: FamilyRuntimeTaskScope = {};
  const domainProfiles: FamilyRuntimeDomainProfiles = {};
  for (let index = 1; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      index += 1;
    } else if (token === '--force') {
      force = true;
    } else if (token === '--no-hydrate') {
      hydrate = false;
    } else if (parseTaskScopeOption(taskScope, token, value)) {
      index += 1;
    } else if (parseDomainProfileOption(domainProfiles, taskScope.domainId, token, value)) {
      index += 1;
    } else if (token === '--limit' && value) {
      limit = Number.parseInt(value, 10);
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime scheduler tick option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime scheduler tick --provider temporal [--force] [--limit <n>] [--no-hydrate] [--domain <domain>] [--profile <file>] [--study <study_id>] [--task-kind <kind>] [--payload-match <path=value>]',
      });
    }
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime scheduler tick --limit must be a positive integer.', {
      limit,
    });
  }
  return {
    mode: 'scheduler_tick',
    providerKind,
    force,
    limit,
    hydrate,
    taskScope: taskScope.domainId || taskScope.taskKind || (taskScope.payloadMatches?.length ?? 0) > 0 ? taskScope : undefined,
    domainProfiles,
  };
}

export function parseSchedulerLifecycleArgs(rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[0];
  let providerKind: FamilyRuntimeProviderKind | undefined;
  const domainProfiles: FamilyRuntimeDomainProfiles = {};
  for (let index = 1; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      index += 1;
    } else if (parseDomainProfileOption(domainProfiles, undefined, token, value)) {
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime scheduler ${action} option: ${token}.`, {
        option: token,
        usage: `opl family-runtime scheduler ${action} --provider temporal [--profile <file>]`,
      });
    }
  }
  return {
    mode: action === 'status'
      ? 'scheduler_status'
      : action === 'install'
        ? 'scheduler_install'
        : action === 'remove'
          ? 'scheduler_remove'
          : 'scheduler_trigger',
    providerKind,
    domainProfiles,
  };
}
