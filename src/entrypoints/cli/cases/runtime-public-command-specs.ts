import type { CommandSpec } from '../modules/support.ts';

export function buildPublicRuntimeCommandSpecs(
  commandSpecs: Record<string, CommandSpec>,
): Record<string, CommandSpec> {
  return Object.fromEntries(Object.entries(commandSpecs).filter(([command, spec]) =>
    spec.group === 'env' || (spec.group === 'runtime' && command.startsWith('runtime ')),
  ));
}
