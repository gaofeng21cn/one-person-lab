import { FrameworkContractError } from '../contracts.ts';
import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertProviderKind } from './shared.ts';

type ProductionCloseoutCommandAlias = 'evidence-worklist' | 'production-closeout';

function closeoutUsage(commandAlias: ProductionCloseoutCommandAlias) {
  return `opl family-runtime ${commandAlias} --family-defaults --provider temporal --executor-kind codex_cli [--detail summary|full] [--full]`;
}

export function parseProductionCloseoutArgs(rest: string[]): FamilyRuntimeCommandInput {
  const commandAlias: ProductionCloseoutCommandAlias = rest[0] === 'evidence-worklist'
    ? 'evidence-worklist'
    : 'production-closeout';
  let familyDefaults = false;
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let executorKind: 'codex_cli' | undefined;
  let detailLevel: 'summary' | 'full' = 'summary';

  for (let index = 1; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--family-defaults') {
      familyDefaults = true;
    } else if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      if (providerKind !== 'temporal') {
        throw new FrameworkContractError('cli_usage_error', `family-runtime ${commandAlias} supports only --provider temporal.`, {
          provider_kind: providerKind,
          allowed_provider_kinds: ['temporal'],
        });
      }
      index += 1;
    } else if (token === '--executor-kind' && value) {
      if (value !== 'codex_cli') {
        throw new FrameworkContractError('cli_usage_error', `family-runtime ${commandAlias} supports only --executor-kind codex_cli.`, {
          executor_kind: value,
          allowed_executor_kinds: ['codex_cli'],
        });
      }
      executorKind = value;
      index += 1;
    } else if (token === '--full') {
      detailLevel = 'full';
    } else if (token === '--detail' && value) {
      if (value !== 'summary' && value !== 'full') {
        throw new FrameworkContractError('cli_usage_error', `family-runtime ${commandAlias} --detail must be summary or full.`, {
          detail: value,
          allowed_detail_levels: ['summary', 'full'],
        });
      }
      detailLevel = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime ${commandAlias} option: ${token}.`, {
        option: token,
        usage: closeoutUsage(commandAlias),
      });
    }
  }

  if (!familyDefaults) {
    throw new FrameworkContractError('cli_usage_error', `family-runtime ${commandAlias} requires --family-defaults.`, {
      required: ['--family-defaults'],
    });
  }
  return {
    mode: 'production_closeout',
    input: {
      familyDefaults,
      providerKind: providerKind ?? 'temporal',
      executorKind: executorKind ?? 'codex_cli',
      detailLevel,
      commandAlias,
    },
  };
}
