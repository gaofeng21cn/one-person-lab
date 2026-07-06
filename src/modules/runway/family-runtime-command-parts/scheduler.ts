import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type {
  FamilyRuntimeCommandInput,
  FamilyRuntimeDomainProfiles,
  FamilyRuntimeTaskScope,
} from '../family-runtime-command.ts';
import { assertProviderKind, parseCliOptions } from './shared.ts';
import { parseDomainProfileOption, parseTaskScopeOption } from './queue.ts';

export function parseSchedulerTickArgs(rest: string[]): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let force = false;
  let limit = 10;
  let hydrate = true;
  const taskScope: FamilyRuntimeTaskScope = {};
  const domainProfiles: FamilyRuntimeDomainProfiles = {};
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--force') {
      force = true;
      return false;
    } else if (token === '--no-hydrate') {
      hydrate = false;
      return false;
    } else if (parseTaskScopeOption(taskScope, token, value)) {
      return true;
    } else if (parseDomainProfileOption(domainProfiles, taskScope.domainId, token, value)) {
      return true;
    } else if (token === '--limit' && value) {
      limit = Number.parseInt(value, 10);
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime scheduler tick option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime scheduler tick --provider temporal [--force] [--limit <n>] [--no-hydrate] [--domain <domain>] [--profile <file>] [--study <study_id>] [--task-kind <kind>] [--payload-match <path=value>]',
      });
    }
  });
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
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (parseDomainProfileOption(domainProfiles, undefined, token, value)) {
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime scheduler ${action} option: ${token}.`, {
        option: token,
        usage: `opl family-runtime scheduler ${action} --provider temporal [--profile <file>]`,
      });
    }
  });
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
