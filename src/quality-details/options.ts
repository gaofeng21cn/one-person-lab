import fs from 'node:fs';

import type { QualityDetailsFocus, QualityDetailsFormat, QualityDetailsOptions } from './types.ts';

type ParseQualityDetailsArgsResult =
  | { ok: true; options: QualityDetailsOptions }
  | { ok: false; message: string; details: Record<string, unknown> };

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

function parseQualityDetailsArgs(args: string[]): ParseQualityDetailsArgsResult {
  let root = process.cwd();
  let format: QualityDetailsFormat = 'json';
  let limit = 20;
  let focus: QualityDetailsFocus = 'auto';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--root') {
      const value = args[index + 1];
      if (!value) {
        return missingValue(arg);
      }
      root = value;
      index += 1;
      continue;
    }

    if (arg === '--format') {
      const value = args[index + 1] as QualityDetailsFormat | undefined;
      if (!value) {
        return missingValue(arg);
      }
      if (!FORMATS.has(value)) {
        return {
          ok: false,
          message: 'Option --format requires json or markdown.',
          details: { option: arg, value },
        };
      }
      format = value;
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      const value = args[index + 1];
      if (!value) {
        return missingValue(arg);
      }
      const parsed = parsePositiveInteger(value);
      if (!parsed) {
        return {
          ok: false,
          message: 'Option --limit requires a positive integer.',
          details: { option: arg, value },
        };
      }
      limit = Math.min(parsed, 200);
      index += 1;
      continue;
    }

    if (arg === '--focus') {
      const value = args[index + 1] as QualityDetailsFocus | undefined;
      if (!value) {
        return missingValue(arg);
      }
      if (!FOCUS_VALUES.has(value)) {
        return {
          ok: false,
          message: 'Option --focus requires a supported focus value.',
          details: { option: arg, value, supported: [...FOCUS_VALUES] },
        };
      }
      focus = value;
      index += 1;
      continue;
    }

    return {
      ok: false,
      message: `Unknown quality details argument: ${arg}.`,
      details: { argument: arg },
    };
  }

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return {
      ok: false,
      message: 'Option --root must point to an existing directory.',
      details: { root },
    };
  }

  return {
    ok: true,
    options: {
      root: fs.realpathSync.native(root),
      format,
      limit,
      focus,
    },
  };
}

export type { ParseQualityDetailsArgsResult };
export { parseQualityDetailsArgs };
