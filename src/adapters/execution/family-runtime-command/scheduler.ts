import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type {
  FamilyRuntimeCommandInput,
  FamilyRuntimeDomainProfiles,
} from '../family-runtime-command.ts';
import { assertProviderKind, assertSchedulerDomainId, parseCliOptions } from './shared.ts';

import { DatabaseSync } from 'node:sqlite';
import { familyRuntimePaths } from '../family-runtime-store.ts';
import { runTemporalSchedulerCadenceCommand } from '../family-runtime-scheduler.ts';

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
      domainId = assertSchedulerDomainId(value);
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


export async function runFamilyRuntimeSchedulerCommand(context: {
  db: DatabaseSync;
  paths: ReturnType<typeof familyRuntimePaths>;
  parsed: FamilyRuntimeCommandInput;
}): Promise<Record<string, unknown>> {
  const { db, paths, parsed } = context;
  if (
    parsed.mode === 'scheduler_status'
    || parsed.mode === 'scheduler_install'
    || parsed.mode === 'scheduler_remove'
    || parsed.mode === 'scheduler_trigger'
  ) {
    return {
      version: 'g2',
      family_runtime_scheduler_cadence: await runTemporalSchedulerCadenceCommand(db, paths, parsed),
    };
  }
  throw new Error(`Unhandled family runtime scheduler mode: ${(parsed as { mode: string }).mode}`);
}
