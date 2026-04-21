import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import { collectHermesProcessUsage } from './runtime-observer.ts';

type SessionLedgerFile = {
  version: 'g2';
  entries: SessionLedgerEntry[];
};

export type SessionLedgerEntry = {
  ledger_id: string;
  recorded_at: string;
  session_id: string;
  mode: string;
  source_surface: string;
  domain_id: string | null;
  workstream_id: string | null;
  goal_preview: string | null;
  workspace_locator: {
    project_id: string | null;
    absolute_path: string | null;
    source: string;
    binding_id: string | null;
  } | null;
  resource_sample:
    | {
        status: 'captured';
        capture_scope: 'opl_managed_runtime_sample';
        process_count: number;
        total_rss_kb: number;
        total_cpu_percent: number;
      }
    | {
        status: 'unavailable';
        reason: string;
      };
};

type RecordSessionLedgerInput = {
  sessionId: string;
  mode: string;
  sourceSurface: string;
  domainId?: string | null;
  workstreamId?: string | null;
  goalPreview?: string | null;
  workspaceLocator?: {
    project_id?: string | null;
    absolute_path?: string | null;
    source?: string;
    binding?: {
      binding_id: string;
    } | null;
  } | null;
};

type SessionAggregate = {
  session_id: string;
  domain_id: string | null;
  workstream_id: string | null;
  event_count: number;
  first_recorded_at: string;
  last_recorded_at: string;
  latest_goal_preview: string | null;
  modes: string[];
  source_surfaces: string[];
  workspace_locator: SessionLedgerEntry['workspace_locator'];
  resource_totals: {
    samples_captured: number;
    samples_unavailable: number;
    latest_sample_status: 'captured' | 'unavailable';
    latest_process_count: number | null;
    latest_total_rss_kb: number | null;
    latest_total_cpu_percent: number | null;
    peak_process_count: number | null;
    peak_total_rss_kb: number | null;
    peak_total_cpu_percent: number | null;
  };
};

type LedgerCountMap = Record<string, number>;

function buildLedgerRecoveryFilePath(filePath: string) {
  const directory = path.dirname(filePath);
  const extension = path.extname(filePath);
  const basename = path.basename(filePath, extension);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(directory, `${basename}.corrupt-${timestamp}-${randomUUID()}${extension}`);
}

function recoverCorruptSessionLedger(filePath: string) {
  const recoveryPath = buildLedgerRecoveryFilePath(filePath);
  fs.renameSync(filePath, recoveryPath);
  return recoveryPath;
}

function readSessionLedgerFile(): SessionLedgerFile {
  const paths = resolveFrontDeskStatePaths();
  if (!fs.existsSync(paths.session_ledger_file)) {
    return {
      version: 'g2',
      entries: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(paths.session_ledger_file, 'utf8')) as Partial<SessionLedgerFile>;
    if (parsed.version !== 'g2' || !Array.isArray(parsed.entries)) {
      throw new Error('Invalid session ledger shape.');
    }

    return {
      version: 'g2',
      entries: parsed.entries as SessionLedgerEntry[],
    };
  } catch (error) {
    try {
      recoverCorruptSessionLedger(paths.session_ledger_file);
      return {
        version: 'g2',
        entries: [],
      };
    } catch (recoveryError) {
      throw new GatewayContractError(
        'contract_shape_invalid',
        'Existing session ledger file is invalid JSON or has an invalid shape.',
        {
          file: paths.session_ledger_file,
          cause: error instanceof Error ? error.message : 'Unknown session ledger parse failure.',
          recovery_cause: recoveryError instanceof Error ? recoveryError.message : 'Unknown session ledger recovery failure.',
        },
      );
    }
  }
}

function writeSessionLedgerFile(payload: SessionLedgerFile) {
  const paths = ensureFrontDeskStateDir();
  fs.writeFileSync(paths.session_ledger_file, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildResourceSample() {
  try {
    const usage = collectHermesProcessUsage();
    return {
      status: 'captured' as const,
      capture_scope: 'opl_managed_runtime_sample' as const,
      process_count: usage.summary.process_count,
      total_rss_kb: usage.summary.total_rss_kb,
      total_cpu_percent: usage.summary.total_cpu_percent,
    };
  } catch (error) {
    return {
      status: 'unavailable' as const,
      reason: error instanceof Error ? error.message : 'Unknown process sampling failure.',
    };
  }
}

function findLatestEntryForSession(entries: SessionLedgerEntry[], sessionId: string) {
  return entries.find((entry) => entry.session_id === sessionId) ?? null;
}

export function recordSessionLedgerEntry(input: RecordSessionLedgerInput) {
  const ledger = readSessionLedgerFile();
  const previousEntry = findLatestEntryForSession(ledger.entries, input.sessionId);
  const entry: SessionLedgerEntry = {
    ledger_id: randomUUID(),
    recorded_at: new Date().toISOString(),
    session_id: input.sessionId,
    mode: input.mode,
    source_surface: input.sourceSurface,
    domain_id: input.domainId ?? previousEntry?.domain_id ?? null,
    workstream_id: input.workstreamId ?? previousEntry?.workstream_id ?? null,
    goal_preview: input.goalPreview ?? null,
    workspace_locator: input.workspaceLocator
      ? {
          project_id: input.workspaceLocator.project_id ?? null,
          absolute_path: input.workspaceLocator.absolute_path ?? null,
          source: input.workspaceLocator.source ?? 'none',
          binding_id: input.workspaceLocator.binding?.binding_id ?? null,
        }
      : previousEntry?.workspace_locator ?? null,
    resource_sample: buildResourceSample(),
  };

  ledger.entries.unshift(entry);
  writeSessionLedgerFile(ledger);
  return entry;
}

function pushUnique(values: string[], value: string | null) {
  if (!value || values.includes(value)) {
    return;
  }

  values.push(value);
}

function buildSessionAggregates(entries: SessionLedgerEntry[], limit: number) {
  const aggregates = new Map<string, SessionAggregate>();

  for (const entry of entries) {
    const existing = aggregates.get(entry.session_id);
    if (!existing) {
      aggregates.set(entry.session_id, {
        session_id: entry.session_id,
        domain_id: entry.domain_id,
        workstream_id: entry.workstream_id,
        event_count: 1,
        first_recorded_at: entry.recorded_at,
        last_recorded_at: entry.recorded_at,
        latest_goal_preview: entry.goal_preview,
        modes: [entry.mode],
        source_surfaces: [entry.source_surface],
        workspace_locator: entry.workspace_locator,
        resource_totals: {
          samples_captured: entry.resource_sample.status === 'captured' ? 1 : 0,
          samples_unavailable: entry.resource_sample.status === 'unavailable' ? 1 : 0,
          latest_sample_status: entry.resource_sample.status,
          latest_process_count: entry.resource_sample.status === 'captured' ? entry.resource_sample.process_count : null,
          latest_total_rss_kb: entry.resource_sample.status === 'captured' ? entry.resource_sample.total_rss_kb : null,
          latest_total_cpu_percent:
            entry.resource_sample.status === 'captured' ? entry.resource_sample.total_cpu_percent : null,
          peak_process_count: entry.resource_sample.status === 'captured' ? entry.resource_sample.process_count : null,
          peak_total_rss_kb: entry.resource_sample.status === 'captured' ? entry.resource_sample.total_rss_kb : null,
          peak_total_cpu_percent: entry.resource_sample.status === 'captured' ? entry.resource_sample.total_cpu_percent : null,
        },
      });
      continue;
    }

    existing.event_count += 1;
    existing.first_recorded_at = entry.recorded_at < existing.first_recorded_at
      ? entry.recorded_at
      : existing.first_recorded_at;
    existing.last_recorded_at = entry.recorded_at > existing.last_recorded_at
      ? entry.recorded_at
      : existing.last_recorded_at;
    existing.domain_id = existing.domain_id ?? entry.domain_id;
    existing.workstream_id = existing.workstream_id ?? entry.workstream_id;
    existing.latest_goal_preview = existing.latest_goal_preview ?? entry.goal_preview;
    existing.workspace_locator = existing.workspace_locator ?? entry.workspace_locator;
    pushUnique(existing.modes, entry.mode);
    pushUnique(existing.source_surfaces, entry.source_surface);

    if (entry.resource_sample.status === 'captured') {
      existing.resource_totals.samples_captured += 1;
      existing.resource_totals.latest_process_count = entry.resource_sample.process_count;
      existing.resource_totals.peak_process_count = Math.max(
        existing.resource_totals.peak_process_count ?? entry.resource_sample.process_count,
        entry.resource_sample.process_count,
      );
      existing.resource_totals.peak_total_rss_kb = Math.max(
        existing.resource_totals.peak_total_rss_kb ?? entry.resource_sample.total_rss_kb,
        entry.resource_sample.total_rss_kb,
      );
      existing.resource_totals.peak_total_cpu_percent = Math.max(
        existing.resource_totals.peak_total_cpu_percent ?? entry.resource_sample.total_cpu_percent,
        entry.resource_sample.total_cpu_percent,
      );
    } else {
      existing.resource_totals.samples_unavailable += 1;
    }
  }

  return Array.from(aggregates.values()).slice(0, limit);
}

function incrementCount(map: LedgerCountMap, key: string | null) {
  const normalizedKey = key && key.trim().length > 0 ? key : 'unassigned';
  map[normalizedKey] = (map[normalizedKey] ?? 0) + 1;
}

function buildLedgerSummary(entries: SessionLedgerEntry[], sessions: SessionAggregate[]) {
  const modeCounts: LedgerCountMap = {};
  const domainCounts: LedgerCountMap = {};
  const sourceSurfaceCounts: LedgerCountMap = {};
  const workspaceLocators = new Set<string>();
  let peakTotalRssKb: number | null = null;
  let peakTotalCpuPercent: number | null = null;

  for (const entry of entries) {
    incrementCount(modeCounts, entry.mode);
    incrementCount(domainCounts, entry.domain_id);
    incrementCount(sourceSurfaceCounts, entry.source_surface);
    if (entry.workspace_locator) {
      const locatorKey =
        entry.workspace_locator.binding_id
        ?? [
          entry.workspace_locator.project_id ?? 'unknown_project',
          entry.workspace_locator.absolute_path ?? 'unknown_path',
          entry.workspace_locator.source,
        ].join('::');
      workspaceLocators.add(locatorKey);
    }
    if (entry.resource_sample.status === 'captured') {
      peakTotalRssKb = Math.max(peakTotalRssKb ?? entry.resource_sample.total_rss_kb, entry.resource_sample.total_rss_kb);
      peakTotalCpuPercent = Math.max(
        peakTotalCpuPercent ?? entry.resource_sample.total_cpu_percent,
        entry.resource_sample.total_cpu_percent,
      );
    }
  }

  return {
    entry_count: entries.length,
    distinct_session_count: new Set(entries.map((entry) => entry.session_id)).size,
    session_aggregate_count: sessions.length,
    last_recorded_at: entries[0]?.recorded_at ?? null,
    mode_counts: modeCounts,
    domain_counts: domainCounts,
    source_surface_counts: sourceSurfaceCounts,
    workspace_binding_count: workspaceLocators.size,
    peak_total_rss_kb: peakTotalRssKb,
    peak_total_cpu_percent: peakTotalCpuPercent,
  };
}

export function buildSessionLedger(limit = 20) {
  const ledger = readSessionLedgerFile();
  const entries = ledger.entries.slice(0, limit);
  const sessions = buildSessionAggregates(ledger.entries, limit);

  return {
    version: 'g2',
    session_ledger: {
      surface_id: 'opl_managed_session_ledger',
      ledger_scope: 'opl_product_entry_managed_sessions',
      summary: buildLedgerSummary(ledger.entries, sessions),
      entries,
      sessions,
      notes: [
        'This ledger tracks only OPL-managed product-entry session events.',
        'Resource samples are captured at event time and do not claim kernel-global exact per-session billing.',
        'Session aggregates are derived from the event ledger and remain OPL-managed attribution rather than kernel-global billing truth.',
      ],
    },
  };
}
