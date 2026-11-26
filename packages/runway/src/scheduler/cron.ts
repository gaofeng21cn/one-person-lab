import { RunwayError } from '../errors.ts';

export interface ParsedCronExpr {
  readonly raw: string;
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly daysOfMonth: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly daysOfWeek: ReadonlySet<number>;
  readonly domRestricted: boolean;
  readonly dowRestricted: boolean;
}

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DOW_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseFieldAtom(
  token: string,
  min: number,
  max: number,
  names?: Record<string, number>,
): number {
  const lower = token.trim().toLowerCase();
  if (names && lower in names) {
    return names[lower]!;
  }
  if (!/^\d+$/.test(lower)) {
    throw new RunwayError('INVALID_INPUT', `Invalid cron field token '${token}'.`, {
      token,
    });
  }
  const num = Number.parseInt(lower, 10);
  if (num < min || num > max) {
    throw new RunwayError(
      'INVALID_INPUT',
      `Cron field value ${num} out of bounds [${min}, ${max}].`,
      { token, value: num, min, max },
    );
  }
  return num;
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  options: { readonly names?: Record<string, number>; readonly mapSevenToZero?: boolean } = {},
): { readonly values: Set<number>; readonly restricted: boolean } {
  const trimmed = field.trim();
  if (!trimmed) {
    throw new RunwayError('INVALID_INPUT', 'Empty cron field.');
  }
  const values = new Set<number>();
  const parts = trimmed.split(',');
  let isWildcardOnly = parts.length === 1 && parts[0] === '*';

  for (const part of parts) {
    const slashSplit = part.split('/');
    if (slashSplit.length > 2) {
      throw new RunwayError('INVALID_INPUT', `Invalid cron step syntax '${part}'.`, { part });
    }
    const rangeExpr = slashSplit[0]!;
    const stepStr = slashSplit[1];
    let step = 1;
    if (stepStr !== undefined) {
      if (!/^\d+$/.test(stepStr)) {
        throw new RunwayError('INVALID_INPUT', `Invalid cron step '${stepStr}'.`, { part });
      }
      step = Number.parseInt(stepStr, 10);
      if (step <= 0) {
        throw new RunwayError('INVALID_INPUT', `Cron step must be positive: '${part}'.`, { part });
      }
      isWildcardOnly = false;
    }

    let start: number;
    let end: number;
    if (rangeExpr === '*') {
      start = min;
      end = max;
    } else if (rangeExpr.includes('-')) {
      isWildcardOnly = false;
      const [rawStart, rawEnd, extra] = rangeExpr.split('-');
      if (extra !== undefined || !rawStart || !rawEnd) {
        throw new RunwayError('INVALID_INPUT', `Invalid cron range '${rangeExpr}'.`, { part });
      }
      start = parseFieldAtom(rawStart, min, max, options.names);
      end = parseFieldAtom(rawEnd, min, max, options.names);
      if (start > end) {
        throw new RunwayError('INVALID_INPUT', `Cron range start > end in '${rangeExpr}'.`, {
          part,
        });
      }
    } else {
      isWildcardOnly = false;
      const single = parseFieldAtom(rangeExpr, min, max, options.names);
      start = single;
      end = stepStr !== undefined ? max : single;
    }

    for (let v = start; v <= end; v += step) {
      values.add(options.mapSevenToZero && v === 7 ? 0 : v);
    }
  }

  if (values.size === 0) {
    throw new RunwayError('INVALID_INPUT', `Cron field '${field}' matched no values.`);
  }
  return { values, restricted: !isWildcardOnly };
}

export function parseCronExpr(cronExpr: string): ParsedCronExpr {
  const trimmed = cronExpr.trim();
  if (!trimmed) {
    throw new RunwayError('INVALID_INPUT', 'Cron expression must not be empty.');
  }
  const expanded = MACROS[trimmed.toLowerCase()] ?? trimmed;
  const fields = expanded.split(/\s+/);
  if (fields.length !== 5) {
    throw new RunwayError(
      'INVALID_INPUT',
      `Cron expression must have 5 fields (minute hour dom month dow), got ${fields.length}: '${cronExpr}'.`,
      { cron_expr: cronExpr },
    );
  }

  const minF = parseCronField(fields[0]!, 0, 59);
  const hourF = parseCronField(fields[1]!, 0, 23);
  const domF = parseCronField(fields[2]!, 1, 31);
  const monF = parseCronField(fields[3]!, 1, 12, { names: MONTH_NAMES });
  const dowF = parseCronField(fields[4]!, 0, 7, { names: DOW_NAMES, mapSevenToZero: true });

  return {
    raw: cronExpr,
    minutes: minF.values,
    hours: hourF.values,
    daysOfMonth: domF.values,
    months: monF.values,
    daysOfWeek: dowF.values,
    domRestricted: domF.restricted,
    dowRestricted: dowF.restricted,
  };
}

export function validateCronTimezone(timezone: string): string {
  const tz = timezone.trim() || 'local';
  if (tz === 'local' || tz === 'UTC' || tz === 'Etc/UTC') {
    return tz;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date(0));
    return tz;
  } catch {
    throw new RunwayError('INVALID_INPUT', `Invalid cron timezone '${timezone}'.`, {
      timezone,
    });
  }
}

interface CalendarParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly dayOfWeek: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getTzFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formatterCache.set(timezone, fmt);
  }
  return fmt;
}

const WEEKDAY_SHORT_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getCalendarParts(date: Date, timezone: string): CalendarParts {
  if (timezone === 'local') {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      dayOfWeek: date.getDay(),
    };
  }
  if (timezone === 'UTC' || timezone === 'Etc/UTC') {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      dayOfWeek: date.getUTCDay(),
    };
  }

  const parts = getTzFormatter(timezone).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let dayOfWeek = 0;
  for (const part of parts) {
    if (part.type === 'year') year = Number.parseInt(part.value, 10);
    else if (part.type === 'month') month = Number.parseInt(part.value, 10);
    else if (part.type === 'day') day = Number.parseInt(part.value, 10);
    else if (part.type === 'hour') hour = Number.parseInt(part.value, 10) % 24;
    else if (part.type === 'minute') minute = Number.parseInt(part.value, 10);
    else if (part.type === 'weekday') dayOfWeek = WEEKDAY_SHORT_MAP[part.value] ?? 0;
  }
  return { year, month, day, hour, minute, dayOfWeek };
}

function matchesCronParts(parsed: ParsedCronExpr, parts: CalendarParts): boolean {
  if (!parsed.months.has(parts.month)) return false;
  if (!parsed.hours.has(parts.hour)) return false;
  if (!parsed.minutes.has(parts.minute)) return false;

  const domMatch = parsed.daysOfMonth.has(parts.day);
  const dowMatch = parsed.daysOfWeek.has(parts.dayOfWeek);
  if (parsed.domRestricted && parsed.dowRestricted) {
    return domMatch || dowMatch;
  }
  return domMatch && dowMatch;
}

/**
 * Computes the next firing timestamp strictly after `afterDate`.
 * Searches up to 4 years ahead (supports leap-day schedules).
 */
export function computeNextCronTime(
  cronExpr: string,
  timezone = 'local',
  afterDate: Date = new Date(),
): string {
  const parsed = parseCronExpr(cronExpr);
  const tz = validateCronTimezone(timezone);

  // Advance to the next whole minute strictly after `afterDate`
  const startMs = Math.floor(afterDate.getTime() / 60_000) * 60_000 + 60_000;
  const maxMinutes = 4 * 366 * 24 * 60;
  let cursorMs = startMs;

  for (let i = 0; i < maxMinutes; ) {
    const candidate = new Date(cursorMs);
    const parts = getCalendarParts(candidate, tz);

    if (!parsed.months.has(parts.month) || (
      parsed.domRestricted && parsed.dowRestricted
        ? !parsed.daysOfMonth.has(parts.day) && !parsed.daysOfWeek.has(parts.dayOfWeek)
        : !parsed.daysOfMonth.has(parts.day) || !parsed.daysOfWeek.has(parts.dayOfWeek)
    )) {
      // Skip ahead by 1 day minus 60m safety margin when >60m remain so 23-hour DST spring-forward days never skip 00:00–00:59
      const rawMinsLeft = (23 - parts.hour) * 60 + (60 - parts.minute);
      const minsLeftInDay = rawMinsLeft > 60 ? rawMinsLeft - 60 : Math.max(1, rawMinsLeft);
      cursorMs += minsLeftInDay * 60_000;
      i += minsLeftInDay;
      continue;
    }

    if (!parsed.hours.has(parts.hour)) {
      const minsLeftInHour = Math.max(1, 60 - parts.minute);
      cursorMs += minsLeftInHour * 60_000;
      i += minsLeftInHour;
      continue;
    }

    if (matchesCronParts(parsed, parts)) {
      return candidate.toISOString();
    }

    cursorMs += 60_000;
    i += 1;
  }

  throw new RunwayError(
    'INVALID_INPUT',
    `Cron expression '${cronExpr}' did not match any date within 4 years.`,
    { cron_expr: cronExpr, timezone: tz },
  );
}
