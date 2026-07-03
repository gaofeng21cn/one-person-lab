import { FrameworkContractError } from '../../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function providerSchedulerArgs(route: JsonRecord, commandOrSurfaceRef: string) {
  const args = stringList(route.opl_cli_args);
  if (args.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL provider scheduler action route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command: 'opl family-runtime scheduler <status|install|trigger|tick> --provider temporal',
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
