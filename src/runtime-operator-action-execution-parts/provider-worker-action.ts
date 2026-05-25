import { FrameworkContractError } from '../contracts.ts';

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function providerWorkerArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL provider worker action route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_commands: [
        'opl family-runtime worker start --provider temporal',
        'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
      ],
    });
  }
  const providerIndex = args.indexOf('--provider');
  const actionIndex = args.indexOf('--action');
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
    args[0] !== 'worker'
    || args[1] !== 'repair'
    || providerIndex < 0
    || args[providerIndex + 1] !== 'temporal'
    || actionIndex < 0
    || args[actionIndex + 1] !== 'restart'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL provider worker route has invalid opl_cli_args.', {
      action_id: stringValue(route.action_id),
      opl_cli_args: args,
    });
  }
  return {
    mode: 'restart',
    stopArgs: ['worker', 'stop', '--provider', 'temporal'],
    startArgs: ['worker', 'start', '--provider', 'temporal'],
  } as const;
}

export function providerWorkerCommand(repair: ReturnType<typeof providerWorkerArgs>) {
  return repair.mode === 'start'
    ? 'opl family-runtime worker start --provider temporal'
    : 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal';
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
    stop: await runFamilyRuntime([...repair.stopArgs]),
    start: await runFamilyRuntime([...repair.startArgs]),
  };
}
