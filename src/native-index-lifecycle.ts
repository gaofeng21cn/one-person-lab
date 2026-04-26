import fs from 'node:fs';
import path from 'node:path';

export const NATIVE_INDEX_TTL_MS = 86_400_000;
export const NATIVE_INDEX_MAX_HISTORY_ENTRIES = 50;

export type NativeIndexError = {
  code: string;
  message: string;
};

export type NativeIndexInvocation = {
  helper_id: string;
  request_id: string;
  status: string;
  resolution?: {
    status?: string;
    source?: string;
    repair_hint?: string;
  };
  helper_version?: string;
  binary_version?: string;
  crate_name?: string;
  crate_version?: string;
  result?: unknown;
  errors: NativeIndexError[];
};

export type NativeIndexSpec = {
  helper_id: string;
  index_key: string;
};

export type NativeIndexSnapshot = {
  helper_id: string | null;
  status: string | null;
  result_surface_kind: string | null;
};

export type NativeIndexDiffSummary = {
  changed: boolean;
  previous_index_file: string | null;
  previous_generated_at: string | null;
  summary: {
    previous_index_count: number;
    current_index_count: number;
    added_count: number;
    removed_count: number;
    changed_count: number;
    unchanged_count: number;
    helper_changed_count: number;
    result_surface_changed_count: number;
    status_changed_count: number;
  };
  details: Array<{
    index_key: string;
    change: 'added' | 'removed' | 'changed';
    previous: NativeIndexSnapshot | null;
    current: NativeIndexSnapshot | null;
    changed_fields: Array<'helper_id' | 'result_surface_kind' | 'status'>;
  }>;
};

export type NativeIndexGcReport = {
  retained_history_count: number;
  max_history_entries: number;
  preserved_count: number;
  removed_count: number;
  history_count_before_gc: number;
  history_count_after_gc: number;
};

export type NativeIndexFailureCategory = 'helper_unavailable' | 'helper_error' | 'write_failed';

export type NativeStateIndexPersistence = {
  status: 'written' | 'skipped_helper_unavailable' | 'skipped_helper_error' | 'write_failed';
  state_dir: string;
  index_file: string;
  history_file: string;
  failure_file: string;
  last_success_file: string;
  ttl_ms: typeof NATIVE_INDEX_TTL_MS;
  expires_at: string;
  diff: NativeIndexDiffSummary;
  gc: NativeIndexGcReport;
  freshness: {
    status: 'fresh' | 'stale_last_success_available' | 'expired_last_success' | 'unavailable_no_success';
    current_generated_at: string | null;
    current_expires_at: string | null;
    current_expired: boolean;
    last_success_generated_at: string | null;
    last_success_expires_at: string | null;
    last_success_expired: boolean | null;
    failure_count: number;
  };
  source_of_truth_rule: string;
  errors: NativeIndexError[];
};

export function persistNativeStateIndex(input: {
  stateDir: string;
  invocations: readonly NativeIndexInvocation[];
  indexSpecs: readonly NativeIndexSpec[];
  protocolVersion: string;
  sourceOfTruthRule: string;
}): NativeStateIndexPersistence {
  const paths = nativeStateIndexPaths(input.stateDir);
  const indexInvocations = input.indexSpecs
    .map((spec) => ({
      spec,
      invocation: input.invocations.find((candidate) => candidate.helper_id === spec.helper_id)
        ?? missingIndexInvocation(spec),
    }));
  const unavailableInvocations = indexInvocations.filter((entry) => entry.invocation.status === 'unavailable');
  if (unavailableInvocations.length > 0) {
    const errors = [
      {
        code: 'native_index_helper_unavailable',
        message: 'one or more native index helpers are unavailable',
      },
    ];
    recordNativeIndexFailure(paths, 'skipped_helper_unavailable', 'helper_unavailable', errors, {
      helpers: failureHelperDetails(unavailableInvocations),
    });
    return persistenceStatus('skipped_helper_unavailable', input.stateDir, paths, input.sourceOfTruthRule, errors);
  }

  const failedInvocations = indexInvocations.filter((entry) => entry.invocation.status !== 'ok');
  if (failedInvocations.length > 0) {
    const errors = [
      {
        code: 'native_index_helper_failed',
        message: 'one or more native index helpers failed',
      },
    ];
    recordNativeIndexFailure(paths, 'skipped_helper_error', 'helper_error', errors, {
      helpers: failureHelperDetails(failedInvocations),
    });
    return persistenceStatus('skipped_helper_error', input.stateDir, paths, input.sourceOfTruthRule, errors);
  }

  const nativeIndexes = Object.fromEntries(
    input.indexSpecs.map((spec) => {
      const invocation = input.invocations.find((candidate) => candidate.helper_id === spec.helper_id);
      return [spec.index_key, invocation];
    }),
  );

  const generatedAt = new Date();
  const previous = readPreviousNativeIndex(paths.indexFile);
  const diff = buildNativeIndexDiff(previous, nativeIndexes, previous ? paths.indexFile : null);
  const expiresAt = new Date(generatedAt.getTime() + NATIVE_INDEX_TTL_MS).toISOString();
  const payload = {
    surface_kind: 'opl_runtime_manager_native_state_projection',
    version: 'v1',
    protocol_version: input.protocolVersion,
    source_of_truth_rule: input.sourceOfTruthRule,
    generated_at: generatedAt.toISOString(),
    lifecycle: {
      ttl_ms: NATIVE_INDEX_TTL_MS,
      expires_at: expiresAt,
      expired: false,
      history_file: paths.historyFile,
      failure_file: paths.failureFile,
      last_success_file: paths.lastSuccessFile,
    },
    diff,
    native_indexes: nativeIndexes,
  };

  const projectedGc = gcReportForCount(countJsonlLines(paths.historyFile) + 1, NATIVE_INDEX_MAX_HISTORY_ENTRIES);
  let gc = projectedGc;
  try {
    fs.mkdirSync(path.dirname(paths.indexFile), { recursive: true });
    fs.writeFileSync(paths.indexFile, `${JSON.stringify(payload, null, 2)}\n`);
    fs.writeFileSync(paths.lastSuccessFile, `${JSON.stringify(payload, null, 2)}\n`);
    appendJsonLine(paths.historyFile, {
      generated_at: payload.generated_at,
      index_file: paths.indexFile,
      diff,
      gc: projectedGc,
      summary: Object.fromEntries(Object.entries(nativeIndexes).map(([key, value]) => [
        key,
        (value as NativeIndexInvocation | undefined)?.status ?? 'missing',
      ])),
    });
    gc = gcJsonlByCount(paths.historyFile, NATIVE_INDEX_MAX_HISTORY_ENTRIES);
  } catch (error) {
    const errors = [
      {
        code: 'native_state_index_write_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    recordNativeIndexFailure(paths, 'write_failed', 'write_failed', errors, {
      files: {
        index_file: paths.indexFile,
        history_file: paths.historyFile,
        last_success_file: paths.lastSuccessFile,
      },
    });
    return persistenceStatus('write_failed', input.stateDir, paths, input.sourceOfTruthRule, errors);
  }

  return persistenceStatus('written', input.stateDir, paths, input.sourceOfTruthRule, [], {
    generatedAt: payload.generated_at,
    expiresAt,
    diff,
    gc,
  });
}

export function nativeStateIndexPaths(stateDir: string) {
  const root = path.join(stateDir, 'runtime-manager');
  return {
    indexFile: path.join(root, 'native-state-index.json'),
    historyFile: path.join(root, 'native-state-index-history.jsonl'),
    failureFile: path.join(root, 'native-state-index-failures.jsonl'),
    lastSuccessFile: path.join(root, 'native-state-index-last-success.json'),
  };
}

function buildNativeIndexDiff(
  previous: Record<string, unknown> | null,
  currentNativeIndexes: Record<string, unknown>,
  previousIndexFile: string | null,
): NativeIndexDiffSummary {
  const previousIndexes = summarizeNativeIndexMap(previous?.native_indexes);
  const currentIndexes = summarizeNativeIndexMap(currentNativeIndexes);
  const indexKeys = [...new Set([...Object.keys(previousIndexes), ...Object.keys(currentIndexes)])].sort();
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let helperChangedCount = 0;
  let resultSurfaceChangedCount = 0;
  let statusChangedCount = 0;
  const details: NativeIndexDiffSummary['details'] = [];

  for (const indexKey of indexKeys) {
    const previousEntry = previousIndexes[indexKey] ?? null;
    const currentEntry = currentIndexes[indexKey] ?? null;
    if (!previousEntry && currentEntry) {
      addedCount += 1;
      details.push({
        index_key: indexKey,
        change: 'added',
        previous: null,
        current: currentEntry,
        changed_fields: [],
      });
      continue;
    }
    if (previousEntry && !currentEntry) {
      removedCount += 1;
      details.push({
        index_key: indexKey,
        change: 'removed',
        previous: previousEntry,
        current: null,
        changed_fields: [],
      });
      continue;
    }
    if (!previousEntry || !currentEntry) {
      continue;
    }

    const changedFields = changedEntryFields(previousEntry, currentEntry);
    if (changedFields.length === 0) {
      unchangedCount += 1;
      continue;
    }
    changedCount += 1;
    if (changedFields.includes('helper_id')) {
      helperChangedCount += 1;
    }
    if (changedFields.includes('result_surface_kind')) {
      resultSurfaceChangedCount += 1;
    }
    if (changedFields.includes('status')) {
      statusChangedCount += 1;
    }
    details.push({
      index_key: indexKey,
      change: 'changed',
      previous: previousEntry,
      current: currentEntry,
      changed_fields: changedFields,
    });
  }

  const changeTotal = addedCount + removedCount + changedCount;
  return {
    changed: changeTotal > 0,
    previous_index_file: previousIndexFile,
    previous_generated_at: typeof previous?.generated_at === 'string' ? previous.generated_at : null,
    summary: {
      previous_index_count: Object.keys(previousIndexes).length,
      current_index_count: Object.keys(currentIndexes).length,
      added_count: addedCount,
      removed_count: removedCount,
      changed_count: changedCount,
      unchanged_count: unchangedCount,
      helper_changed_count: helperChangedCount,
      result_surface_changed_count: resultSurfaceChangedCount,
      status_changed_count: statusChangedCount,
    },
    details,
  };
}

function changedEntryFields(
  previousEntry: NativeIndexSnapshot,
  currentEntry: NativeIndexSnapshot,
): Array<'helper_id' | 'result_surface_kind' | 'status'> {
  const fields: Array<'helper_id' | 'result_surface_kind' | 'status'> = [];
  if (previousEntry.helper_id !== currentEntry.helper_id) {
    fields.push('helper_id');
  }
  if (previousEntry.result_surface_kind !== currentEntry.result_surface_kind) {
    fields.push('result_surface_kind');
  }
  if (previousEntry.status !== currentEntry.status) {
    fields.push('status');
  }
  return fields;
}

function summarizeNativeIndexMap(value: unknown): Record<string, NativeIndexSnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([indexKey, entry]) => [
      indexKey,
      summarizeNativeIndexEntry(entry),
    ]),
  );
}

function summarizeNativeIndexEntry(value: unknown): NativeIndexSnapshot {
  const entry = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = entry.result && typeof entry.result === 'object' && !Array.isArray(entry.result)
    ? entry.result as Record<string, unknown>
    : {};
  return {
    helper_id: stringValueOrNull(entry.helper_id),
    status: stringValueOrNull(entry.status) ?? 'unknown',
    result_surface_kind: stringValueOrNull(result.surface_kind),
  };
}

function persistenceStatus(
  status: NativeStateIndexPersistence['status'],
  stateDir: string,
  paths: ReturnType<typeof nativeStateIndexPaths>,
  sourceOfTruthRule: string,
  errors: NativeStateIndexPersistence['errors'],
  input: Partial<{
    generatedAt: string;
    expiresAt: string;
    diff: NativeIndexDiffSummary;
    gc: NativeIndexGcReport;
  }> = {},
): NativeStateIndexPersistence {
  const historyCount = countJsonlLines(paths.historyFile);
  return {
    status,
    state_dir: stateDir,
    index_file: paths.indexFile,
    history_file: paths.historyFile,
    failure_file: paths.failureFile,
    last_success_file: paths.lastSuccessFile,
    ttl_ms: NATIVE_INDEX_TTL_MS,
    expires_at: input.expiresAt ?? new Date(Date.now() + NATIVE_INDEX_TTL_MS).toISOString(),
    diff: input.diff ?? emptyDiff(),
    gc: input.gc ?? {
      retained_history_count: historyCount,
      max_history_entries: NATIVE_INDEX_MAX_HISTORY_ENTRIES,
      preserved_count: historyCount,
      removed_count: 0,
      history_count_before_gc: historyCount,
      history_count_after_gc: historyCount,
    },
    freshness: buildNativeIndexFreshness(status, paths, {
      generatedAt: input.generatedAt ?? null,
      expiresAt: input.expiresAt ?? null,
    }),
    source_of_truth_rule: sourceOfTruthRule,
    errors,
  };
}

function buildNativeIndexFreshness(
  status: NativeStateIndexPersistence['status'],
  paths: ReturnType<typeof nativeStateIndexPaths>,
  current: { generatedAt: string | null; expiresAt: string | null },
): NativeStateIndexPersistence['freshness'] {
  const failureCount = countJsonlLines(paths.failureFile);
  if (status === 'written') {
    return {
      status: 'fresh',
      current_generated_at: current.generatedAt,
      current_expires_at: current.expiresAt,
      current_expired: false,
      last_success_generated_at: current.generatedAt,
      last_success_expires_at: current.expiresAt,
      last_success_expired: false,
      failure_count: failureCount,
    };
  }

  const lastSuccess = readPreviousNativeIndex(paths.lastSuccessFile);
  const lastGeneratedAt = typeof lastSuccess?.generated_at === 'string' ? lastSuccess.generated_at : null;
  const lastExpiresAt = readLastSuccessExpiresAt(lastSuccess);
  if (!lastSuccess || !lastGeneratedAt || !lastExpiresAt) {
    return {
      status: 'unavailable_no_success',
      current_generated_at: null,
      current_expires_at: null,
      current_expired: false,
      last_success_generated_at: lastGeneratedAt,
      last_success_expires_at: lastExpiresAt,
      last_success_expired: null,
      failure_count: failureCount,
    };
  }

  const lastExpired = Date.parse(lastExpiresAt) <= Date.now();
  return {
    status: lastExpired ? 'expired_last_success' : 'stale_last_success_available',
    current_generated_at: null,
    current_expires_at: null,
    current_expired: false,
    last_success_generated_at: lastGeneratedAt,
    last_success_expires_at: lastExpiresAt,
    last_success_expired: lastExpired,
    failure_count: failureCount,
  };
}

function readLastSuccessExpiresAt(lastSuccess: Record<string, unknown> | null) {
  const lifecycle = lastSuccess?.lifecycle;
  if (typeof lifecycle !== 'object' || lifecycle === null) {
    return null;
  }
  const expiresAt = (lifecycle as Record<string, unknown>).expires_at;
  return typeof expiresAt === 'string' ? expiresAt : null;
}

function failureHelperDetails(entries: Array<{ spec: NativeIndexSpec; invocation: NativeIndexInvocation }>) {
  return entries.map(({ spec, invocation }) => ({
    index_key: spec.index_key,
    helper_id: invocation.helper_id,
    status: invocation.status,
    resolution_status: invocation.resolution?.status ?? null,
    resolution_source: invocation.resolution?.source ?? null,
    repair_hint: invocation.resolution?.repair_hint ?? null,
    error_codes: invocation.errors.map((error) => error.code),
  }));
}

function missingIndexInvocation(spec: NativeIndexSpec): NativeIndexInvocation {
  return {
    helper_id: spec.helper_id,
    request_id: `missing-${spec.index_key}`,
    status: 'unavailable',
    resolution: {
      status: 'missing',
      source: 'not_found',
      repair_hint: 'Run npm run native:repair or set OPL_NATIVE_HELPER_BIN_DIR.',
    },
    errors: [
      {
        code: 'native_index_invocation_missing',
        message: `${spec.helper_id} did not produce a native index invocation for ${spec.index_key}.`,
      },
    ],
  };
}

function recordNativeIndexFailure(
  paths: ReturnType<typeof nativeStateIndexPaths>,
  status: NativeStateIndexPersistence['status'],
  category: NativeIndexFailureCategory,
  errors: NativeStateIndexPersistence['errors'],
  details: Record<string, unknown>,
) {
  try {
    appendJsonLine(paths.failureFile, {
      generated_at: new Date().toISOString(),
      status,
      category,
      errors,
      details,
    });
  } catch {
    // Failure telemetry must not mask the original native-helper status.
  }
}

function gcJsonlByCount(filePath: string, maxEntries: number): NativeIndexGcReport {
  const lines = readJsonlLines(filePath);
  const retainedLines = lines.slice(-maxEntries);
  fs.writeFileSync(filePath, retainedLines.length > 0 ? `${retainedLines.join('\n')}\n` : '');
  return {
    retained_history_count: retainedLines.length,
    max_history_entries: maxEntries,
    preserved_count: retainedLines.length,
    removed_count: lines.length - retainedLines.length,
    history_count_before_gc: lines.length,
    history_count_after_gc: retainedLines.length,
  };
}

function gcReportForCount(historyCountBeforeGc: number, maxEntries: number): NativeIndexGcReport {
  const preservedCount = Math.min(historyCountBeforeGc, maxEntries);
  return {
    retained_history_count: preservedCount,
    max_history_entries: maxEntries,
    preserved_count: preservedCount,
    removed_count: historyCountBeforeGc - preservedCount,
    history_count_before_gc: historyCountBeforeGc,
    history_count_after_gc: preservedCount,
  };
}

function readPreviousNativeIndex(indexFile: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(indexFile, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function appendJsonLine(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function countJsonlLines(filePath: string) {
  return readJsonlLines(filePath).length;
}

function readJsonlLines(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

function emptyDiff(): NativeIndexDiffSummary {
  return {
    changed: false,
    previous_index_file: null,
    previous_generated_at: null,
    summary: {
      previous_index_count: 0,
      current_index_count: 0,
      added_count: 0,
      removed_count: 0,
      changed_count: 0,
      unchanged_count: 0,
      helper_changed_count: 0,
      result_surface_changed_count: 0,
      status_changed_count: 0,
    },
    details: [],
  };
}

function stringValueOrNull(value: unknown) {
  return typeof value === 'string' ? value : null;
}
