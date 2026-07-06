import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertProviderKind, parseCliOptions } from './shared.ts';

export function parseProviderOnlyArgs(
  mode: 'status' | 'doctor' | 'install' | 'repair',
  args: string[],
): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  parseCliOptions(args, 0, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `family-runtime ${mode} accepts only --provider.`, {
        extra_args: args,
        usage: `opl family-runtime ${mode} [--provider local_sqlite|temporal]`,
      });
    }
  });
  return { mode, providerKind };
}

export function parseResidencyProofArgs(rest: string[]): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let live = false;
  let production = false;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--live') {
      live = true;
      return false;
    } else if (token === '--production') {
      production = true;
      return false;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime residency proof option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime residency proof --provider temporal [--live|--production]',
      });
    }
  });
  if (live && production) {
    throw new FrameworkContractError('cli_usage_error', 'Use only one Temporal residency proof mode.', {
      mutually_exclusive: ['--live', '--production'],
    });
  }
  return { mode: 'residency_proof', providerKind, live, production };
}

export function parseProviderSloTickArgs(rest: string[]): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let force = false;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--force') {
      force = true;
      return false;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime provider-slo tick option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime provider-slo tick --provider temporal [--force]',
      });
    }
  });
  return { mode: 'provider_slo_tick', providerKind, force };
}

export function parseControlLoopStatusArgs(rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[0];
  if (action !== 'status') {
    throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime control-loop action: ${action}.`, {
      action,
      usage: 'opl family-runtime control-loop status --provider temporal',
    });
  }
  let providerKind: FamilyRuntimeProviderKind | undefined;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime control-loop option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime control-loop status --provider temporal',
      });
    }
  });
  return { mode: 'control_loop_status', providerKind };
}

export function parseProviderWorkerSupervisorArgs(rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[1];
  if (action !== 'status' && action !== 'install' && action !== 'remove' && action !== 'trigger') {
    throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime provider-worker supervisor action: ${action}.`, {
      action,
      usage: 'opl family-runtime provider-worker supervisor status|install|remove|trigger --provider temporal',
    });
  }
  let providerKind: FamilyRuntimeProviderKind | undefined;
  parseCliOptions(rest, 2, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime provider-worker supervisor option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime provider-worker supervisor status|install|remove|trigger --provider temporal',
      });
    }
  });
  return { mode: 'provider_worker_supervisor', action, providerKind };
}
