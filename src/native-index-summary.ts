import fs from 'node:fs';
import path from 'node:path';

import { resolveOplStatePaths } from './runtime-state-paths.ts';

const SOURCE_OF_TRUTH_RULE =
  'OPL reads native helper indexes for fast lookup, then dereferences domain-owned durable truth before acting.';

export function buildNativeIndexSummary() {
  const stateDir = resolveOplStatePaths().state_dir;
  const paths = nativeIndexPaths(stateDir);
  const current = readJson(paths.index_file);
  const lastSuccess = readJson(paths.last_success_file);
  const selected = current ?? lastSuccess;
  const source = current ? 'current_index' : lastSuccess ? 'last_success' : 'none';
  const failures = readJsonl(paths.failure_file);
  const history = readJsonl(paths.history_file);
  const freshness = buildFreshness(current, lastSuccess, failures.length);

  return {
    version: 'g2',
    native_index: {
      surface_kind: 'opl_native_index_summary',
      version: 'v1',
      source_of_truth_rule: SOURCE_OF_TRUTH_RULE,
      state_dir: stateDir,
      files: paths,
      source,
      freshness,
      health: buildHealthSummary({
        current,
        lastSuccess,
        history,
        failures,
        source,
        freshness,
      }),
      indexes: summarizeIndexes(selected),
      history: {
        entry_count: history.length,
        last_entry: history.at(-1) ?? null,
      },
      failures: {
        failure_count: failures.length,
        last_failure: failures.at(-1) ?? null,
      },
    },
  };
}

function buildHealthSummary(input: {
  current: Record<string, unknown> | null;
  lastSuccess: Record<string, unknown> | null;
  history: Array<Record<string, unknown>>;
  failures: Array<Record<string, unknown>>;
  source: 'current_index' | 'last_success' | 'none';
  freshness: ReturnType<typeof buildFreshness>;
}) {
  const lastHistory = input.history.at(-1) ?? null;
  const lastFailure = input.failures.at(-1) ?? null;
  return {
    status: input.freshness.status,
    source: input.source,
    current: summarizeSnapshotHealth(input.current),
    last_success: summarizeSnapshotHealth(input.lastSuccess),
    history: {
      entry_count: input.history.length,
      latest_generated_at: stringField(lastHistory, 'generated_at'),
      latest_summary: objectField(lastHistory, 'summary'),
      latest_gc: objectField(lastHistory, 'gc'),
    },
    failure: {
      failure_count: input.failures.length,
      latest_generated_at: stringField(lastFailure, 'generated_at'),
      latest_status: stringField(lastFailure, 'status'),
      latest_category: stringField(lastFailure, 'category'),
      latest_error_codes: errorCodes(lastFailure),
    },
    latest_diff: compactLatestDiff(input.current, input.lastSuccess, lastHistory),
  };
}

function summarizeSnapshotHealth(payload: Record<string, unknown> | null) {
  const indexes = summarizeIndexes(payload);
  const expiresAt = lifecycleExpiresAt(payload);
  return {
    present: Boolean(payload),
    generated_at: stringField(payload, 'generated_at'),
    expires_at: expiresAt,
    expired: payload ? expiresAt ? Date.parse(expiresAt) <= Date.now() : true : null,
    index_count: indexes.length,
    status_counts: indexes.reduce<Record<string, number>>((counts, index) => {
      counts[index.status] = (counts[index.status] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

function compactLatestDiff(
  current: Record<string, unknown> | null,
  lastSuccess: Record<string, unknown> | null,
  lastHistory: Record<string, unknown> | null,
) {
  const diff = objectField(current, 'diff') ?? objectField(lastSuccess, 'diff') ?? objectField(lastHistory, 'diff');
  if (!diff) {
    return null;
  }
  return {
    changed: booleanField(diff, 'changed') ?? false,
    previous_generated_at: stringField(diff, 'previous_generated_at'),
    summary: objectField(diff, 'summary') ?? {},
    details: compactDiffDetails(diff),
  };
}

function compactDiffDetails(diff: Record<string, unknown>) {
  const details = diff.details;
  if (!Array.isArray(details)) {
    return [];
  }
  return details
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      index_key: stringField(entry, 'index_key') ?? 'unknown',
      change: stringField(entry, 'change') ?? 'changed',
      changed_fields: stringArrayField(entry, 'changed_fields').map(compactChangedField),
    }));
}

function nativeIndexPaths(stateDir: string) {
  const root = path.join(stateDir, 'runtime-manager');
  return {
    index_file: path.join(root, 'native-state-index.json'),
    history_file: path.join(root, 'native-state-index-history.jsonl'),
    failure_file: path.join(root, 'native-state-index-failures.jsonl'),
    last_success_file: path.join(root, 'native-state-index-last-success.json'),
  };
}

function buildFreshness(
  current: Record<string, unknown> | null,
  lastSuccess: Record<string, unknown> | null,
  failureCount: number,
) {
  if (current) {
    const expiresAt = lifecycleExpiresAt(current);
    const expired = expiresAt ? Date.parse(expiresAt) <= Date.now() : true;
    return {
      status: expired ? 'expired_current_index' : 'fresh',
      current_generated_at: stringField(current, 'generated_at'),
      current_expires_at: expiresAt,
      current_expired: expired,
      last_success_generated_at: stringField(lastSuccess, 'generated_at'),
      last_success_expires_at: lifecycleExpiresAt(lastSuccess),
      failure_count: failureCount,
    };
  }

  const lastExpiresAt = lifecycleExpiresAt(lastSuccess);
  const lastExpired = lastExpiresAt ? Date.parse(lastExpiresAt) <= Date.now() : null;
  return {
    status: !lastSuccess
      ? 'unavailable_no_success'
      : lastExpired
        ? 'expired_last_success'
        : 'stale_last_success_available',
    current_generated_at: null,
    current_expires_at: null,
    current_expired: false,
    last_success_generated_at: stringField(lastSuccess, 'generated_at'),
    last_success_expires_at: lastExpiresAt,
    last_success_expired: lastExpired,
    failure_count: failureCount,
  };
}

function summarizeIndexes(payload: Record<string, unknown> | null) {
  const nativeIndexes = payload?.native_indexes;
  if (!nativeIndexes || typeof nativeIndexes !== 'object' || Array.isArray(nativeIndexes)) {
    return [];
  }

  return Object.entries(nativeIndexes as Record<string, unknown>).map(([indexKey, value]) => {
    const entry = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    const result = typeof entry.result === 'object' && entry.result !== null
      ? entry.result as Record<string, unknown>
      : {};
    return {
      index_key: indexKey,
      helper_id: stringField(entry, 'helper_id'),
      request_id: stringField(entry, 'request_id'),
      status: stringField(entry, 'status') ?? 'unknown',
      result_surface_kind: stringField(result, 'surface_kind'),
      errors: Array.isArray(entry.errors) ? entry.errors : [],
    };
  });
}

function lifecycleExpiresAt(payload: Record<string, unknown> | null) {
  const lifecycle = payload?.lifecycle;
  if (!lifecycle || typeof lifecycle !== 'object' || Array.isArray(lifecycle)) {
    return null;
  }
  return stringField(lifecycle as Record<string, unknown>, 'expires_at');
}

function stringField(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

function booleanField(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return typeof value === 'boolean' ? value : null;
}

function objectField(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArrayField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function errorCodes(payload: Record<string, unknown> | null) {
  const errors = payload?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => stringField(entry, 'code'))
    .filter((entry): entry is string => Boolean(entry));
}

function compactChangedField(field: string) {
  if (field === 'helper_id') {
    return 'helper_changed';
  }
  if (field === 'result_surface_kind') {
    return 'result_surface_changed';
  }
  if (field === 'status') {
    return 'status_changed';
  }
  return `${field}_changed`;
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
}
