import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { CommandSpec } from './types.ts';

export function buildUsageError(
  message: string,
  spec?: Pick<CommandSpec, 'usage' | 'examples'>,
  details: Record<string, unknown> = {},
): FrameworkContractError {
  return new FrameworkContractError('cli_usage_error', message, {
    ...details,
    ...(spec ? { usage: spec.usage, examples: spec.examples } : {}),
  });
}
