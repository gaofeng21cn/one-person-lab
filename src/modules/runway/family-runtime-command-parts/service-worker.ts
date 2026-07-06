import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertProviderKind, parseCliOptions } from './shared.ts';

type RuntimeProcessKind = 'worker' | 'service';
type RuntimeProcessAction = 'start' | 'status' | 'stop';

export function parseRuntimeProcessArgs(kind: RuntimeProcessKind, rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[0];
  if (action !== 'start' && action !== 'status' && action !== 'stop') {
    throw new FrameworkContractError('cli_usage_error', `family-runtime ${kind} requires start, status, or stop.`, {
      usage: `opl family-runtime ${kind} start|status|stop [--provider temporal] [--foreground]`,
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
        usage: `opl family-runtime ${kind} start|status|stop [--provider temporal] [--foreground]`,
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
      : 'service_stop';
}
