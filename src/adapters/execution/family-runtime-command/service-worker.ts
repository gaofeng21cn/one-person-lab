import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertProviderKind, parseCliOptions } from './shared.ts';

type RuntimeProcessKind = 'worker' | 'service';
type RuntimeProcessAction = 'start' | 'status' | 'restart' | 'stop';

export function parseRuntimeProcessArgs(kind: RuntimeProcessKind, rest: string[]): FamilyRuntimeCommandInput {
  if (kind === 'service' && rest[0] === 'supervisor') {
    const supervisorAction = rest[1];
    if (
      supervisorAction !== 'status'
      && supervisorAction !== 'install'
      && supervisorAction !== 'remove'
      && supervisorAction !== 'trigger'
    ) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'family-runtime service supervisor requires status, install, remove, or trigger.',
        {
          usage: 'opl family-runtime service supervisor status|install|remove|trigger [--provider temporal]',
        },
      );
    }
    let providerKind: FamilyRuntimeProviderKind | undefined;
    parseCliOptions(rest, 2, (token, value) => {
      if (token === '--provider' && value) {
        providerKind = assertProviderKind(value);
        return true;
      }
      throw new FrameworkContractError(
        'cli_usage_error',
        `Unknown family-runtime service supervisor ${supervisorAction} option: ${token}.`,
        {
          option: token,
          usage: 'opl family-runtime service supervisor status|install|remove|trigger [--provider temporal]',
        },
      );
    });
    return {
      mode: supervisorAction === 'status'
        ? 'service_status'
        : supervisorAction === 'remove'
          ? 'service_stop'
          : 'service_start',
      providerKind,
      supervisorAction,
    };
  }
  const action = rest[0];
  if (action !== 'start' && action !== 'status' && action !== 'restart' && action !== 'stop') {
    throw new FrameworkContractError('cli_usage_error', `family-runtime ${kind} requires start, status, restart, or stop.`, {
      usage: `opl family-runtime ${kind} start|status|restart|stop [--provider temporal] [--foreground]`,
    });
  }
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let detach = true;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--foreground') {
      detach = false;
      return false;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime ${kind} ${action} option: ${token}.`, {
        option: token,
        usage: `opl family-runtime ${kind} start|status|restart|stop [--provider temporal] [--foreground]`,
      });
    }
  });
  return {
    mode: runtimeProcessMode(kind, action),
    providerKind,
    detach,
  };
}

function runtimeProcessMode(kind: RuntimeProcessKind, action: RuntimeProcessAction) {
  if (kind === 'worker') {
    if (action === 'restart') {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime worker restart uses provider repair.', {
        usage: 'opl family-runtime repair --provider temporal',
      });
    }
    return action === 'start'
      ? 'worker_start'
      : action === 'status'
        ? 'worker_status'
        : 'worker_stop';
  }
  return action === 'start'
    ? 'service_start'
    : action === 'status'
      ? 'service_status'
      : action === 'restart'
        ? 'service_restart'
        : 'service_stop';
}
