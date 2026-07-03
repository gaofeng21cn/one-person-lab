import { isRecord } from '../../../kernel/contract-validation.ts';
import { buildUsageError } from './runtime-helpers.ts';
import type { CommandSpec } from './types.ts';

type CommandSpecContext = Pick<CommandSpec, 'usage' | 'examples'>;

export function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readStringList(value: unknown) {
  const scalar = readOptionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(readOptionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function readJsonObject(
  value: string,
  spec: CommandSpecContext,
  messages: {
    parseErrorMessage: string;
    objectErrorMessage: string;
  },
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value); // reuse-first: allow central CLI JSON boundary helper over per-command parsers.
  } catch (error) {
    throw buildUsageError(messages.parseErrorMessage, spec, {
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) {
    throw buildUsageError(messages.objectErrorMessage, spec);
  }
  return parsed;
}
