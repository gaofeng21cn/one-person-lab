import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { toErrorMessage, txImmediate } from '@opl/core';

import { validateLedgerEntryInput } from './schemas.ts';
import {
  LedgerError,
  type AppendLedgerEntryInput,
  type ArtifactHashMismatch,
  type ArtifactsQuery,
  type DebtsQuery,
  type LedgerDb,
  type LedgerEntry,
  type LedgerEntryKind,
  type LineageVerificationResult,
  type QualityDebtRecord,
  type ReceiptsQuery,
  type RecordReviewInput,
  type ReviewVerdictValue,
  type TimelineQuery,
} from './types.ts';

interface RawLedgerRow {
  entry_id: string;
  task_id: string;
  stage_run_id: string | null;
  attempt_id: string | null;
  entry_kind: LedgerEntryKind;
  owner_id: string;
  payload_json: string;
  created_at: string;
}

function hydrateRow<K extends LedgerEntryKind = LedgerEntryKind>(row: RawLedgerRow): LedgerEntry<K> {
  return {
    entry_id: row.entry_id,
    task_id: row.task_id,
    stage_run_id: row.stage_run_id,
    attempt_id: row.attempt_id,
    entry_kind: row.entry_kind as K,
    owner_id: row.owner_id,
    payload: JSON.parse(row.payload_json) as LedgerEntry<K>['payload'],
    created_at: row.created_at,
  };
}

function verifyForeignParents(
  db: LedgerDb,
  taskId: string,
  stageRunId: string | null,
  attemptId: string | null,
): void {
  if (stageRunId !== null) {
    const stageRow = db
      .prepare('SELECT task_id FROM stage_runs WHERE stage_run_id = ?')
      .get(stageRunId) as { task_id: string } | undefined;
    if (!stageRow) {
      throw new LedgerError(
        'STAGE_RUN_NOT_FOUND',
        `StageRun '${stageRunId}' does not exist.`,
        { task_id: taskId, stage_run_id: stageRunId },
      );
    }
    if (stageRow.task_id !== taskId) {
      throw new LedgerError(
        'TASK_STAGE_MISMATCH',
        `StageRun '${stageRunId}' belongs to task '${stageRow.task_id}', not '${taskId}'.`,
        { task_id: taskId, stage_run_id: stageRunId, actual_task_id: stageRow.task_id },
      );
    }
  }

  if (attemptId !== null) {
    const attemptRow = db
      .prepare(
        'SELECT a.stage_run_id, s.task_id FROM attempts a JOIN stage_runs s ON s.stage_run_id = a.stage_run_id WHERE a.attempt_id = ?',
      )
      .get(attemptId) as { stage_run_id: string; task_id: string } | undefined;
    if (!attemptRow) {
      throw new LedgerError(
        'ATTEMPT_NOT_FOUND',
        `Attempt '${attemptId}' does not exist.`,
        { task_id: taskId, stage_run_id: stageRunId, attempt_id: attemptId },
      );
    }
    if (stageRunId !== null && attemptRow.stage_run_id !== stageRunId) {
      throw new LedgerError(
        'STAGE_ATTEMPT_MISMATCH',
        `Attempt '${attemptId}' belongs to stage_run '${attemptRow.stage_run_id}', not '${stageRunId}'.`,
        {
          task_id: taskId,
          stage_run_id: stageRunId,
          attempt_id: attemptId,
          actual_stage_run_id: attemptRow.stage_run_id,
        },
      );
    }
    if (attemptRow.task_id !== taskId) {
      throw new LedgerError(
        'TASK_STAGE_MISMATCH',
        `Attempt '${attemptId}' belongs to task '${attemptRow.task_id}', not '${taskId}'.`,
        { task_id: taskId, attempt_id: attemptId, actual_task_id: attemptRow.task_id },
      );
    }
  }
}

function mapSqliteInsertError(
  db: LedgerDb,
  entry: LedgerEntry,
  error: unknown,
): never {
  const message = toErrorMessage(error);
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    const taskRow = db
      .prepare('SELECT 1 AS ok FROM tasks WHERE task_id = ?')
      .get(entry.task_id) as { ok: number } | undefined;
    if (!taskRow) {
      throw new LedgerError(
        'TASK_NOT_FOUND',
        `Task '${entry.task_id}' does not exist.`,
        { task_id: entry.task_id },
        { cause: error },
      );
    }
    if (entry.stage_run_id !== null) {
      const stageRow = db
        .prepare('SELECT 1 AS ok FROM stage_runs WHERE stage_run_id = ?')
        .get(entry.stage_run_id) as { ok: number } | undefined;
      if (!stageRow) {
        throw new LedgerError(
          'STAGE_RUN_NOT_FOUND',
          `StageRun '${entry.stage_run_id}' does not exist.`,
          { stage_run_id: entry.stage_run_id },
          { cause: error },
        );
      }
    }
    if (entry.attempt_id !== null) {
      throw new LedgerError(
        'ATTEMPT_NOT_FOUND',
        `Attempt '${entry.attempt_id}' does not exist.`,
        { attempt_id: entry.attempt_id },
        { cause: error },
      );
    }
  }
  throw new LedgerError(
    'LEDGER_DB_ERROR',
    `Failed to append ledger entry '${entry.entry_id}': ${message}`,
    { entry_id: entry.entry_id, task_id: entry.task_id },
    { cause: error },
  );
}

export function appendEntryWithDb<K extends LedgerEntryKind>(
  db: LedgerDb,
  input: AppendLedgerEntryInput<K>,
): LedgerEntry<K> {
  const { entry, payloadJson } = validateLedgerEntryInput(input);
  verifyForeignParents(db, entry.task_id, entry.stage_run_id, entry.attempt_id);

  try {
    db.prepare(
      'INSERT INTO ledger_entries (entry_id, task_id, stage_run_id, attempt_id, entry_kind, owner_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      entry.entry_id,
      entry.task_id,
      entry.stage_run_id,
      entry.attempt_id,
      entry.entry_kind,
      entry.owner_id,
      payloadJson,
      entry.created_at,
    );
  } catch (error) {
    mapSqliteInsertError(db, entry, error);
  }

  return entry;
}

export function appendEntriesWithDb(
  db: LedgerDb,
  inputs: readonly AppendLedgerEntryInput[],
): LedgerEntry[] {
  if (inputs.length === 0) return [];
  return txImmediate(db, () => inputs.map((item) => appendEntryWithDb(db, item)));
}

export function recordReviewWithDb(
  db: LedgerDb,
  input: RecordReviewInput,
): LedgerEntry<'review_verdict'> {
  const payload: LedgerEntry<'review_verdict'>['payload'] = {
    verdict: input.verdict,
    ...(input.reviewer_id !== undefined ? { reviewer_id: input.reviewer_id } : {}),
    ...(input.reviewer_role !== undefined ? { reviewer_role: input.reviewer_role } : {}),
    ...(input.reviewed_artifact_refs !== undefined
      ? { reviewed_artifact_refs: [...input.reviewed_artifact_refs] }
      : {}),
    ...(input.verified_hashes !== undefined ? { verified_hashes: [...input.verified_hashes] } : {}),
    ...(input.finding_refs !== undefined ? { finding_refs: [...input.finding_refs] } : {}),
    ...(input.quality_debt_ids !== undefined ? { quality_debt_ids: [...input.quality_debt_ids] } : {}),
    ...(input.hard_stop_class !== undefined ? { hard_stop_class: input.hard_stop_class } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
  };

  return appendEntryWithDb(db, {
    entry_id: input.entry_id,
    task_id: input.task_id,
    stage_run_id: input.stage_run_id,
    attempt_id: input.attempt_id,
    entry_kind: 'review_verdict',
    owner_id: input.owner_id,
    payload,
    created_at: input.created_at,
  });
}

export function queryTimeline(db: LedgerDb, query: TimelineQuery): LedgerEntry[] {
  if (!query.task_id && !query.stage_run_id) {
    throw new LedgerError(
      'INVALID_LEDGER_INPUT',
      'queryTimeline requires at least task_id or stage_run_id.',
    );
  }

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (query.task_id) {
    conditions.push('task_id = ?');
    params.push(query.task_id);
  }
  if (query.stage_run_id) {
    conditions.push('stage_run_id = ?');
    params.push(query.stage_run_id);
  }
  if (query.attempt_id) {
    conditions.push('attempt_id = ?');
    params.push(query.attempt_id);
  }
  if (query.owner_id) {
    conditions.push('owner_id = ?');
    params.push(query.owner_id);
  }
  if (query.since) {
    const parsedSince = Date.parse(query.since);
    const normalizedSince = Number.isFinite(parsedSince)
      ? new Date(parsedSince).toISOString()
      : query.since;
    conditions.push(
      "(CASE WHEN unixepoch(created_at, 'subsec') IS NOT NULL AND unixepoch(?, 'subsec') IS NOT NULL THEN unixepoch(created_at, 'subsec') >= unixepoch(?, 'subsec') ELSE created_at >= ? END)",
    );
    params.push(normalizedSince, normalizedSince, normalizedSince);
  }
  if (query.entry_kind !== undefined) {
    const kinds = Array.isArray(query.entry_kind) ? query.entry_kind : [query.entry_kind];
    if (kinds.length === 0) return [];
    const placeholders = kinds.map(() => '?').join(', ');
    conditions.push(`entry_kind IN (${placeholders})`);
    params.push(...kinds);
  }

  if (query.limit !== undefined) {
    if (typeof query.limit !== 'number' || !Number.isFinite(query.limit) || query.limit < 1) {
      throw new LedgerError('INVALID_LEDGER_INPUT', 'queryTimeline limit must be a finite number >= 1.', {
        limit: query.limit,
      });
    }
  }
  if (query.offset !== undefined) {
    if (typeof query.offset !== 'number' || !Number.isFinite(query.offset) || query.offset < 0) {
      throw new LedgerError('INVALID_LEDGER_INPUT', 'queryTimeline offset must be a finite number >= 0.', {
        offset: query.offset,
      });
    }
  }

  const rawLimit = query.limit ?? 200;
  const limit = Math.max(1, Math.min(1000, Math.trunc(rawLimit)));
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  const dir = query.order === 'desc' ? 'DESC' : 'ASC';

  const sql = `SELECT entry_id, task_id, stage_run_id, attempt_id, entry_kind, owner_id, payload_json, created_at FROM ledger_entries WHERE ${conditions.join(' AND ')} ORDER BY COALESCE(unixepoch(created_at, 'subsec'), 0) ${dir}, created_at ${dir}, rowid ${dir} LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, limit, offset) as unknown as RawLedgerRow[];
  return rows.map((row) => hydrateRow(row));
}

function queryAllTaskEntries(
  db: LedgerDb,
  taskId: string,
  entryKinds?: readonly LedgerEntryKind[],
): LedgerEntry[] {
  const conditions = ['task_id = ?'];
  const params: Array<string | number> = [taskId];
  if (entryKinds !== undefined) {
    if (entryKinds.length === 0) return [];
    const placeholders = entryKinds.map(() => '?').join(', ');
    conditions.push(`entry_kind IN (${placeholders})`);
    params.push(...entryKinds);
  }
  const sql = `SELECT entry_id, task_id, stage_run_id, attempt_id, entry_kind, owner_id, payload_json, created_at FROM ledger_entries WHERE ${conditions.join(' AND ')} ORDER BY COALESCE(unixepoch(created_at, 'subsec'), 0) ASC, created_at ASC, rowid ASC`;
  const rows = db.prepare(sql).all(...params) as unknown as RawLedgerRow[];
  return rows.map((row) => hydrateRow(row));
}

export function queryArtifacts(
  db: LedgerDb,
  query: ArtifactsQuery,
): LedgerEntry<'artifact_ref'>[] {
  return queryTimeline(db, {
    task_id: query.task_id,
    stage_run_id: query.stage_run_id,
    attempt_id: query.attempt_id,
    owner_id: query.owner_id,
    entry_kind: 'artifact_ref',
    limit: query.limit,
    offset: query.offset,
    order: 'asc',
  }) as LedgerEntry<'artifact_ref'>[];
}

export function queryReceipts(
  db: LedgerDb,
  query: ReceiptsQuery,
): LedgerEntry<'owner_receipt'>[] {
  return queryTimeline(db, {
    task_id: query.task_id,
    stage_run_id: query.stage_run_id,
    attempt_id: query.attempt_id,
    owner_id: query.owner_id,
    entry_kind: 'owner_receipt',
    limit: query.limit,
    offset: query.offset,
    order: 'asc',
  }) as LedgerEntry<'owner_receipt'>[];
}

export function queryDebts(db: LedgerDb, query: DebtsQuery): QualityDebtRecord[] {
  const entries = queryAllTaskEntries(db, query.task_id, [
    'quality_debt',
    'owner_receipt',
    'human_decision',
  ]);

  const records: Array<{
    debt_key: string;
    entry: LedgerEntry<'quality_debt'>;
    status: QualityDebtRecord['status'];
    blocks_submission: boolean;
    resolved_by_entry_id?: string;
  }> = [];
  const openIndicesByKey = new Map<string, number[]>();

  const closeOpenDebts = (
    debtId: string,
    status: 'resolved' | 'waived',
    closerEntryId: string,
  ): void => {
    const indices = openIndicesByKey.get(debtId);
    if (!indices || indices.length === 0) return;
    for (const idx of indices) {
      const rec = records[idx];
      if (rec && rec.status === 'open') {
        rec.status = status;
        rec.resolved_by_entry_id = closerEntryId;
      }
    }
    openIndicesByKey.delete(debtId);
  };

  for (const entry of entries) {
    if (entry.entry_kind === 'quality_debt') {
      const debtEntry = entry as LedgerEntry<'quality_debt'>;
      const debtKey =
        debtEntry.payload.debt_id ?? debtEntry.payload.id ?? debtEntry.payload.code ?? debtEntry.entry_id;
      const idx = records.length;
      records.push({
        debt_key: debtKey,
        entry: debtEntry,
        status: 'open',
        blocks_submission: debtEntry.payload.blocks_submission !== false,
      });
      const existing = openIndicesByKey.get(debtKey);
      if (existing) {
        existing.push(idx);
      } else {
        openIndicesByKey.set(debtKey, [idx]);
      }
    } else if (entry.entry_kind === 'owner_receipt') {
      const payload = entry.payload as LedgerEntry<'owner_receipt'>['payload'];
      if (typeof payload.resolves_debt === 'string' && payload.resolves_debt.trim()) {
        closeOpenDebts(payload.resolves_debt, 'resolved', entry.entry_id);
      }
      if (Array.isArray(payload.resolves_debt_ids)) {
        for (const debtId of payload.resolves_debt_ids) {
          if (typeof debtId === 'string' && debtId.trim()) {
            closeOpenDebts(debtId, 'resolved', entry.entry_id);
          }
        }
      }
    } else if (entry.entry_kind === 'human_decision') {
      const payload = entry.payload as LedgerEntry<'human_decision'>['payload'];
      if (Array.isArray(payload.waived_debt_ids)) {
        for (const debtId of payload.waived_debt_ids) {
          if (typeof debtId === 'string' && debtId.trim()) {
            closeOpenDebts(debtId, 'waived', entry.entry_id);
          }
        }
      }
    }
  }

  return query.unresolved_only ? records.filter((r) => r.status === 'open') : records;
}

function sha256FileHex(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function isOutsideRoot(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

export function verifyTaskLineage(
  db: LedgerDb,
  taskId: string,
  options: { workspace_root?: string; check_file_hashes?: boolean } = {},
): LineageVerificationResult {
  const entries = queryAllTaskEntries(db, taskId);
  const debts = queryDebts(db, { task_id: taskId, unresolved_only: true });
  const openBlockingDebts = debts.filter((d) => d.blocks_submission).length;

  let artifactCount = 0;
  let latestReviewVerdict: ReviewVerdictValue | null = null;
  const mismatches: ArtifactHashMismatch[] = [];

  const resolvedRoot = options.workspace_root ? path.resolve(options.workspace_root) : null;
  let realRoot: string | null = null;
  if (options.check_file_hashes && resolvedRoot) {
    try {
      realRoot = fs.realpathSync(resolvedRoot);
    } catch {
      realRoot = null;
    }
  }

  for (const entry of entries) {
    if (entry.entry_kind === 'review_verdict') {
      latestReviewVerdict = (entry as LedgerEntry<'review_verdict'>).payload.verdict;
    } else if (entry.entry_kind === 'artifact_ref') {
      artifactCount += 1;
      const artifact = entry as LedgerEntry<'artifact_ref'>;
      if (options.check_file_hashes && resolvedRoot) {
        const targetPath = path.resolve(resolvedRoot, artifact.payload.path);
        if (isOutsideRoot(resolvedRoot, targetPath)) {
          mismatches.push({
            entry_id: artifact.entry_id,
            path: artifact.payload.path,
            reason: 'path_escape',
          });
          continue;
        }
        if (!realRoot) {
          mismatches.push({
            entry_id: artifact.entry_id,
            path: artifact.payload.path,
            reason: 'missing',
            ...(artifact.payload.sha256 ? { expected_sha256: artifact.payload.sha256 } : {}),
          });
          continue;
        }
        let lstat: fs.Stats;
        try {
          lstat = fs.lstatSync(targetPath);
        } catch {
          mismatches.push({
            entry_id: artifact.entry_id,
            path: artifact.payload.path,
            reason: 'missing',
            ...(artifact.payload.sha256 ? { expected_sha256: artifact.payload.sha256 } : {}),
          });
          continue;
        }
        let realTarget: string;
        try {
          realTarget = fs.realpathSync(targetPath);
        } catch {
          if (lstat.isSymbolicLink()) {
            try {
              const realParent = fs.realpathSync(path.dirname(targetPath));
              const linkDest = path.resolve(realParent, fs.readlinkSync(targetPath));
              if (isOutsideRoot(realRoot, realParent) || isOutsideRoot(realRoot, linkDest)) {
                mismatches.push({
                  entry_id: artifact.entry_id,
                  path: artifact.payload.path,
                  reason: 'path_escape',
                });
                continue;
              }
            } catch {
              // fall through to missing
            }
          }
          mismatches.push({
            entry_id: artifact.entry_id,
            path: artifact.payload.path,
            reason: 'missing',
            ...(artifact.payload.sha256 ? { expected_sha256: artifact.payload.sha256 } : {}),
          });
          continue;
        }
        if (isOutsideRoot(realRoot, realTarget)) {
          mismatches.push({
            entry_id: artifact.entry_id,
            path: artifact.payload.path,
            reason: 'path_escape',
          });
          continue;
        }
        let targetStat: fs.Stats;
        try {
          targetStat = fs.statSync(realTarget);
        } catch {
          mismatches.push({
            entry_id: artifact.entry_id,
            path: artifact.payload.path,
            reason: 'missing',
            ...(artifact.payload.sha256 ? { expected_sha256: artifact.payload.sha256 } : {}),
          });
          continue;
        }
        if (!targetStat.isFile()) {
          mismatches.push({
            entry_id: artifact.entry_id,
            path: artifact.payload.path,
            reason: 'not_a_file',
            ...(artifact.payload.sha256 ? { expected_sha256: artifact.payload.sha256 } : {}),
          });
          continue;
        }
        if (artifact.payload.sha256) {
          const expectedHex = artifact.payload.sha256.replace(/^sha256:/i, '').toLowerCase();
          const actualHex = sha256FileHex(realTarget);
          const matches = expectedHex.length === 64
            ? actualHex === expectedHex
            : actualHex.startsWith(expectedHex);
          if (!matches) {
            mismatches.push({
              entry_id: artifact.entry_id,
              path: artifact.payload.path,
              reason: 'hash_mismatch',
              expected_sha256: artifact.payload.sha256,
              actual_sha256: `sha256:${actualHex}`,
            });
          }
        }
      }
    }
  }

  return {
    ok: mismatches.length === 0 && openBlockingDebts === 0,
    task_id: taskId,
    total_entries: entries.length,
    artifact_count: artifactCount,
    open_debt_count: debts.length,
    open_blocking_debts: openBlockingDebts,
    latest_review_verdict: latestReviewVerdict,
    artifact_hash_mismatches: mismatches,
  };
}

export interface LedgerStoreOptions {
  tx?: <T>(fn: () => T) => T;
  onAppended?: (entries: readonly LedgerEntry[]) => void;
}

export class LedgerStore {
  private readonly db: LedgerDb;
  private readonly runTx: <T>(fn: () => T) => T;
  private readonly onAppended?: (entries: readonly LedgerEntry[]) => void;

  constructor(db: LedgerDb, options: LedgerStoreOptions = {}) {
    this.db = db;
    this.runTx = options.tx ?? ((fn) => txImmediate(this.db, fn));
    this.onAppended = options.onAppended;
  }

  append<K extends LedgerEntryKind>(input: AppendLedgerEntryInput<K>): LedgerEntry<K> {
    const wasInTransaction = this.db.isTransaction;
    const entry = this.runTx(() => appendEntryWithDb(this.db, input));
    if (!wasInTransaction) {
      this.onAppended?.([entry]);
    }
    return entry;
  }

  appendBatch(inputs: readonly AppendLedgerEntryInput[]): LedgerEntry[] {
    if (inputs.length === 0) return [];
    const wasInTransaction = this.db.isTransaction;
    const entries = this.runTx(() => inputs.map((item) => appendEntryWithDb(this.db, item)));
    if (!wasInTransaction) {
      this.onAppended?.(entries);
    }
    return entries;
  }

  recordReview(input: RecordReviewInput): LedgerEntry<'review_verdict'> {
    const wasInTransaction = this.db.isTransaction;
    const entry = this.runTx(() => recordReviewWithDb(this.db, input));
    if (!wasInTransaction) {
      this.onAppended?.([entry]);
    }
    return entry;
  }

  timeline(query: TimelineQuery): LedgerEntry[] {
    return queryTimeline(this.db, query);
  }

  artifacts(query: ArtifactsQuery): LedgerEntry<'artifact_ref'>[] {
    return queryArtifacts(this.db, query);
  }

  receipts(query: ReceiptsQuery): LedgerEntry<'owner_receipt'>[] {
    return queryReceipts(this.db, query);
  }

  debts(query: DebtsQuery): QualityDebtRecord[] {
    return queryDebts(this.db, query);
  }

  verifyLineage(
    taskId: string,
    options?: { workspace_root?: string; check_file_hashes?: boolean },
  ): LineageVerificationResult {
    return verifyTaskLineage(this.db, taskId, options);
  }
}
