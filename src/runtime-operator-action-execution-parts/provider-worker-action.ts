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
      supported_command: 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal',
    });
  }
  const providerIndex = args.indexOf('--provider');
  const actionIndex = args.indexOf('--action');
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
    stopArgs: ['worker', 'stop', '--provider', 'temporal'],
    startArgs: ['worker', 'start', '--provider', 'temporal'],
  };
}

export function providerWorkerCommand() {
  return 'opl family-runtime worker stop --provider temporal && opl family-runtime worker start --provider temporal';
}

export async function runProviderWorkerRepair(
  repair: ReturnType<typeof providerWorkerArgs>,
  runFamilyRuntime: (args: string[]) => Promise<unknown>,
) {
  return {
    stop: await runFamilyRuntime(repair.stopArgs),
    start: await runFamilyRuntime(repair.startArgs),
  };
}
