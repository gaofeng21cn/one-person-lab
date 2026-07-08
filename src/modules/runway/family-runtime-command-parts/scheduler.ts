import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type {
  FamilyRuntimeCommandInput,
  FamilyRuntimeDomainProfiles,
} from '../family-runtime-command.ts';
import { assertProviderKind, parseCliOptions } from './shared.ts';

function parseDomainProfileOption(
  profiles: FamilyRuntimeDomainProfiles,
  domainId: FamilyRuntimeDomainId | undefined,
  token: string,
  value: string | undefined,
) {
  if (token !== '--profile' || !value) {
    return false;
  }
  const targetDomain = domainId ?? 'medautoscience';
  if (targetDomain !== 'medautoscience') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime --profile is currently supported only for medautoscience.', {
      domain: targetDomain,
    });
  }
  profiles[targetDomain] = value;
  return true;
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
