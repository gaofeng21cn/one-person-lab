import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type {
  FamilyRuntimeCommandInput,
  FamilyRuntimeDomainProfiles,
} from '../family-runtime-command.ts';
import { assertDomainId, assertProviderKind, parseCliOptions } from './shared.ts';

export function parseSchedulerLifecycleArgs(rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[0];
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let domainId: FamilyRuntimeDomainId | undefined;
  const domainProfiles: FamilyRuntimeDomainProfiles = {};
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      return true;
    } else if (token === '--profile' && value) {
      if (!domainId) {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime scheduler --profile requires --domain first.', {
          option: '--profile',
          usage: `opl family-runtime scheduler ${action} --provider temporal --domain <domain> --profile <file>`,
        });
      }
      domainProfiles[domainId] = value;
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime scheduler ${action} option: ${token}.`, {
        option: token,
        usage: `opl family-runtime scheduler ${action} --provider temporal [--domain <domain> --profile <file>]`,
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
