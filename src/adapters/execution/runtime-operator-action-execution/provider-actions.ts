import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringList, stringValue, type JsonRecord } from '../../../kernel/json-record.ts';

export function providerSchedulerArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL provider scheduler action route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command: 'opl family-runtime scheduler <status|install|trigger|remove> --provider temporal',
    });
  }
  if (args[0] !== 'scheduler') {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL provider scheduler route has invalid opl_cli_args.', {
      action_id: stringValue(route.action_id),
      opl_cli_args: args,
    });
  }
  return args;
}

export function providerSloArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL provider SLO action route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command: 'opl family-runtime residency proof --provider temporal --production',
    });
  }
  if (args[0] !== 'residency' || args[1] !== 'proof') {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL provider SLO route has invalid opl_cli_args.', {
      action_id: stringValue(route.action_id),
      opl_cli_args: args,
    });
  }
  return args;
}

export function providerWorkerArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL provider worker action route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_commands: [
        'opl family-runtime worker start --provider temporal',
        'opl family-runtime repair --provider temporal',
      ],
    });
  }
  const providerIndex = args.indexOf('--provider');
  if (
    args[0] === 'worker'
    && args[1] === 'start'
    && providerIndex >= 0
    && args[providerIndex + 1] === 'temporal'
  ) {
    return {
      mode: 'start',
      startArgs: ['worker', 'start', '--provider', 'temporal'],
    } as const;
  }
  if (
    args[0] !== 'repair'
    || providerIndex < 0
    || args[providerIndex + 1] !== 'temporal'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL provider worker route has invalid opl_cli_args.', {
      action_id: stringValue(route.action_id),
      opl_cli_args: args,
    });
  }
  return {
    mode: 'restart',
    repairArgs: ['repair', '--provider', 'temporal'],
  } as const;
}

export function providerWorkerCommand(repair: ReturnType<typeof providerWorkerArgs>) {
  return repair.mode === 'start'
    ? 'opl family-runtime worker start --provider temporal'
    : 'opl family-runtime repair --provider temporal';
}

export async function runProviderWorkerRepair(
  repair: ReturnType<typeof providerWorkerArgs>,
  runFamilyRuntime: (args: string[]) => Promise<unknown>,
) {
  if (repair.mode === 'start') {
    return {
      start: await runFamilyRuntime([...repair.startArgs]),
    };
  }
  return {
    repair: await runFamilyRuntime([...repair.repairArgs]),
  };
}
