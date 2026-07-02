import fs from 'node:fs';

import type { QualityDetailsFocus, QualityDetailsFormat, QualityDetailsOptions } from './types.ts';

type ParseQualityDetailsArgsResult =
  | { ok: true; options: QualityDetailsOptions }
  | { ok: false; message: string; details: Record<string, unknown> };

type MutableQualityDetailsOptions = {
  root: string;
  format: QualityDetailsFormat;
  limit: number;
  focus: QualityDetailsFocus;
  compareRef?: string;
};

type ParsedOption =
  | { ok: true; nextIndex: number }
  | { ok: false; result: ParseQualityDetailsArgsResult };

const FORMATS = new Set<QualityDetailsFormat>(['json', 'markdown']);
const FOCUS_VALUES = new Set<QualityDetailsFocus>([
  'auto',
  'depth',
  'equality',
  'modularity',
  'redundancy',
  'test_gaps',
  'rules',
]);

function parsePositiveInteger(raw: string) {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 ? parsed : null;
}

function missingValue(option: string): ParseQualityDetailsArgsResult {
  return {
    ok: false,
    message: `Option ${option} requires a value.`,
    details: { option },
  };
}

function invalidOption(message: string, details: Record<string, unknown>): ParseQualityDetailsArgsResult {
  return {
    ok: false,
    message,
    details,
  };
}

function requiredValue(args: string[], index: number) {
  return args[index + 1];
}

function parseRootOption(
  args: string[],
  index: number,
  options: MutableQualityDetailsOptions,
): ParsedOption {
  const option = args[index];
  const value = requiredValue(args, index);
  if (!value) {
    return { ok: false, result: missingValue(option) };
  }
  options.root = value;
  return { ok: true, nextIndex: index + 1 };
}

function parseFormatOption(
  args: string[],
  index: number,
  options: MutableQualityDetailsOptions,
): ParsedOption {
  const option = args[index];
  const value = requiredValue(args, index) as QualityDetailsFormat | undefined;
  if (!value) {
    return { ok: false, result: missingValue(option) };
  }
  if (!FORMATS.has(value)) {
    return {
      ok: false,
      result: invalidOption('Option --format requires json or markdown.', { option, value }),
    };
  }
  options.format = value;
  return { ok: true, nextIndex: index + 1 };
}

function parseLimitOption(
  args: string[],
  index: number,
  options: MutableQualityDetailsOptions,
): ParsedOption {
  const option = args[index];
  const value = requiredValue(args, index);
  if (!value) {
    return { ok: false, result: missingValue(option) };
  }
  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    return {
      ok: false,
      result: invalidOption('Option --limit requires a positive integer.', { option, value }),
    };
  }
  options.limit = Math.min(parsed, 200);
  return { ok: true, nextIndex: index + 1 };
}

function parseFocusOption(
  args: string[],
  index: number,
  options: MutableQualityDetailsOptions,
): ParsedOption {
  const option = args[index];
  const value = requiredValue(args, index) as QualityDetailsFocus | undefined;
  if (!value) {
    return { ok: false, result: missingValue(option) };
  }
  if (!FOCUS_VALUES.has(value)) {
    return {
      ok: false,
      result: invalidOption('Option --focus requires a supported focus value.', {
        option,
        value,
        supported: [...FOCUS_VALUES],
      }),
    };
  }
  options.focus = value;
  return { ok: true, nextIndex: index + 1 };
}

function parseCompareRefOption(
  args: string[],
  index: number,
  options: MutableQualityDetailsOptions,
): ParsedOption {
  const option = args[index];
  const value = requiredValue(args, index);
  if (!value) {
    return { ok: false, result: missingValue(option) };
  }
  options.compareRef = value;
  return { ok: true, nextIndex: index + 1 };
}

function parseKnownQualityDetailsOption(
  args: string[],
  index: number,
  options: MutableQualityDetailsOptions,
): ParsedOption {
  const arg = args[index];
  switch (arg) {
    case '--root':
      return parseRootOption(args, index, options);
    case '--format':
      return parseFormatOption(args, index, options);
    case '--limit':
      return parseLimitOption(args, index, options);
    case '--focus':
      return parseFocusOption(args, index, options);
    case '--compare-ref':
      return parseCompareRefOption(args, index, options);
    default:
      return {
        ok: false,
        result: invalidOption(`Unknown quality details argument: ${arg}.`, { argument: arg }),
      };
  }
}

function parseQualityDetailsArgs(args: string[]): ParseQualityDetailsArgsResult {
  const options: MutableQualityDetailsOptions = {
    root: process.cwd(),
    format: 'json',
    limit: 20,
    focus: 'auto',
  };

  for (let index = 0; index < args.length; index += 1) {
    const parsed = parseKnownQualityDetailsOption(args, index, options);
    if (!parsed.ok) {
      return parsed.result;
    }
    index = parsed.nextIndex;
  }

  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    return {
      ok: false,
      message: 'Option --root must point to an existing directory.',
      details: { root: options.root },
    };
  }

  return {
    ok: true,
    options: {
      ...options,
      root: fs.realpathSync.native(options.root),
    },
  };
}

export type { ParseQualityDetailsArgsResult };
export { parseQualityDetailsArgs };
