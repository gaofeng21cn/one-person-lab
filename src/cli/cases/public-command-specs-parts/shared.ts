import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildNoArgSpec(
  base: Omit<CommandSpec, 'handler'>,
  handler: () => unknown | Promise<unknown>,
): CommandSpec {
  const spec: CommandSpec = {
    ...base,
    handler: (args) => {
      assertNoArgs(args, spec);
      return handler();
    },
  };
  return spec;
}

export function commandActionSummary(action: string, noun: string): string {
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} ${noun}.`;
}
