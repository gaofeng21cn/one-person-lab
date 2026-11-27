import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJsonText,
  isRecord,
  newId,
  nowIso,
  txImmediate,
  type SqliteDb,
} from '@opl/core';
import { appendEntryWithDb } from '@opl/ledger';

import { WorkspaceError } from './errors.ts';
import { importLegacyWorkspaceBindings } from './legacy-bindings.ts';
import { ensureWorkspaceSchema } from './migrations.ts';
import {
  atomicWriteFile,
  normalizePosixRelativeSegments,
  resolveConfinedReadPath,
  resolveConfinedWritePath,
  sha256Prefixed,
  walkSourceFiles,
} from './path-safety.ts';
import {
  KNOWLEDGE_SOURCE_SCOPES,
  type BindKnowledgeSourceInput,
  type CommitWritebackInput,
  type CommitWritebackResult,
  type CreateSnapshotInput,
  type CreateSnapshotResult,
  type InitWorkspaceInput,
  type InspectWorkspaceResult,
  type KnowledgeSnapshotRow,
  type KnowledgeSourceRow,
  type KnowledgeSourceScope,
  type ProposeWritebackInput,
  type ProposeWritebackResult,
  type ReadSnapshotFileOptions,
  type ReadSnapshotFileResult,
  type ReadWorkspaceFileInput,
  type ReadWorkspaceFileResult,
  type RefreshSourceRevisionInput,
  type RefreshSourceRevisionResult,
  type RemoveKnowledgeSourceInput,
  type RemoveKnowledgeSourceResult,
  type SnapshotManifest,
  type SnapshotVerificationResult,
  type UpdateWorkspaceRevisionInput,
  type WorkspaceRow,
  type WorkspaceServiceOptions,
  type WritebackProposalRow,
} from './types.ts';

const DEFAULT_MAX_READ_BYTES = 1_048_576;
const MAX_WRITEBACK_BYTES = 16 * 1024 * 1024;
const VALID_SCOPES = new Set<string>(KNOWLEDGE_SOURCE_SCOPES);

function parseWorkspaceSourceIds(metadataJson: string): string[] {
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (!isRecord(parsed)) return [];
    const list = parsed.source_ids ?? parsed.knowledge_source_ids ?? parsed.sources;
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

function updateWorkspaceSourceIds(
  metadataJson: string,
  mutate: (ids: string[]) => string[],
): string {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (isRecord(parsed)) obj = { ...parsed };
  } catch {
    obj = {};
  }
  const current = parseWorkspaceSourceIds(metadataJson);
  const next = [...new Set(mutate(current))];
  obj.source_ids = next;
  return JSON.stringify(obj);
}

function isDirectoryOnDisk(dirPath: string): boolean {
  const stat = fs.statSync(dirPath, { throwIfNoEntry: false });
  return Boolean(stat && stat.isDirectory());
}

function computeNextRevision(currentRevision: string): string {
  const numeric = Number(currentRevision);
  return Number.isInteger(numeric) && numeric >= 0
    ? String(numeric + 1)
    : `${currentRevision}.1`;
}

export class WorkspaceService {
  readonly #db: SqliteDb;
  readonly #onMutate?: () => void;
  readonly #onLedgerAppended?: (entries: readonly unknown[]) => void;

  constructor(options: WorkspaceServiceOptions) {
    this.#db = options.db;
    this.#onMutate = options.onMutate;
    this.#onLedgerAppended = options.onLedgerAppended;
  }

  initWorkspace(input: InitWorkspaceInput): WorkspaceRow {
    const rawPath = typeof input.root_path === 'string' ? input.root_path.trim() : '';
    if (!rawPath) {
      throw new WorkspaceError('INVALID_INPUT', 'initWorkspace requires a non-empty root_path.');
    }

    const absPath = path.resolve(rawPath);
    const existingLstat = fs.lstatSync(absPath, { throwIfNoEntry: false });
    if (existingLstat?.isSymbolicLink()) {
      let resolvedTarget: string;
      try {
        resolvedTarget = fs.realpathSync(absPath);
      } catch {
        throw new WorkspaceError(
          'INVALID_PATH',
          `Workspace root_path '${absPath}' is a dangling symbolic link.`,
          { root_path: absPath },
        );
      }
      const targetStat = fs.statSync(resolvedTarget, { throwIfNoEntry: false });
      if (!targetStat || !targetStat.isDirectory()) {
        throw new WorkspaceError(
          'INVALID_INPUT',
          `Workspace root_path '${absPath}' exists and is not a directory.`,
          { root_path: absPath },
        );
      }
    }
    const existingStat = fs.statSync(absPath, { throwIfNoEntry: false });
    if (existingStat && !existingStat.isDirectory()) {
      throw new WorkspaceError(
        'INVALID_INPUT',
        `Workspace root_path '${absPath}' exists and is not a directory.`,
        { root_path: absPath },
      );
    }
    if (!existingStat) {
      fs.mkdirSync(absPath, { recursive: true });
    }
    const realRoot = fs.realpathSync(absPath);

    const wsId = newId('ws');
    const ts = nowIso();
    const name = input.name?.trim() || path.basename(realRoot) || 'workspace';
    const metadataJson = JSON.stringify(input.metadata ?? {});

    txImmediate(this.#db, () => {
      const existing = this.#db
        .prepare('SELECT workspace_id FROM workspaces WHERE root_path = ?')
        .get(realRoot) as { workspace_id: string } | undefined;
      if (existing) {
        throw new WorkspaceError(
          'WORKSPACE_DUPLICATE',
          `Workspace already initialized for root_path '${realRoot}' (${existing.workspace_id}).`,
          { workspace_id: existing.workspace_id, root_path: realRoot },
        );
      }

      this.#db
        .prepare(
          'INSERT INTO workspaces (workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        )
        .run(wsId, name, realRoot, input.domain_id ?? null, metadataJson, ts, ts);
    });

    const row = this.getWorkspace(wsId);
    this.#onMutate?.();
    return row;
  }

  getWorkspace(workspaceId: string): WorkspaceRow {
    if (!workspaceId?.trim()) {
      throw new WorkspaceError('INVALID_INPUT', 'workspace_id must be a non-empty string.');
    }
    const row = this.#db
      .prepare(
        'SELECT workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at FROM workspaces WHERE workspace_id = ?',
      )
      .get(workspaceId) as WorkspaceRow | undefined;
    if (!row) {
      throw new WorkspaceError('WORKSPACE_NOT_FOUND', `Workspace '${workspaceId}' not found.`, {
        workspace_id: workspaceId,
      });
    }
    return row;
  }

  listWorkspaces(): WorkspaceRow[] {
    return this.#db
      .prepare(
        'SELECT workspace_id, name, root_path, domain_id, revision, metadata_json, created_at, updated_at FROM workspaces ORDER BY created_at ASC, rowid ASC',
      )
      .all() as unknown as WorkspaceRow[];
  }

  updateWorkspaceRevision(input: UpdateWorkspaceRevisionInput): WorkspaceRow {
    if (!input.workspace_id?.trim()) {
      throw new WorkspaceError('INVALID_INPUT', 'workspace_id must be a non-empty string.');
    }
    if (!Number.isInteger(input.expected_revision) || input.expected_revision < 1) {
      throw new WorkspaceError('INVALID_INPUT', 'expected_revision must be a positive integer.', {
        expected_revision: input.expected_revision,
      });
    }

    const ts = nowIso();
    txImmediate(this.#db, () => {
      const current = this.getWorkspace(input.workspace_id);
      if (current.revision !== input.expected_revision) {
        throw new WorkspaceError(
          'REVISION_CONFLICT',
          `Workspace '${input.workspace_id}' revision conflict: expected ${input.expected_revision}, actual ${current.revision}.`,
          {
            workspace_id: input.workspace_id,
            expected_revision: input.expected_revision,
            actual_revision: current.revision,
          },
        );
      }

      const nextName = input.name !== undefined ? (input.name.trim() || current.name) : current.name;
      const nextDomainId = input.domain_id !== undefined ? input.domain_id : current.domain_id;

      let nextMetadataJson = current.metadata_json;
      if (input.metadata !== undefined) {
        nextMetadataJson = JSON.stringify(input.metadata);
      } else if (input.metadata_patch !== undefined) {
        let baseObj: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(current.metadata_json) as unknown;
          if (isRecord(parsed)) baseObj = { ...parsed };
        } catch {
          baseObj = {};
        }
        nextMetadataJson = JSON.stringify({ ...baseObj, ...input.metadata_patch });
      }

      const res = this.#db
        .prepare(
          'UPDATE workspaces SET name = ?, domain_id = ?, metadata_json = ?, revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND revision = ?',
        )
        .run(
          nextName,
          nextDomainId,
          nextMetadataJson,
          ts,
          input.workspace_id,
          input.expected_revision,
        );

      if (Number(res.changes) !== 1) {
        throw new WorkspaceError(
          'REVISION_CONFLICT',
          `Concurrent workspace revision conflict for '${input.workspace_id}'.`,
          { workspace_id: input.workspace_id, expected_revision: input.expected_revision },
        );
      }
    });

    const updated = this.getWorkspace(input.workspace_id);
    this.#onMutate?.();
    return updated;
  }

  readWorkspaceFile(input: ReadWorkspaceFileInput): ReadWorkspaceFileResult {
    const ws = this.getWorkspace(input.workspace_id);
    const maxBytes = input.max_bytes ?? DEFAULT_MAX_READ_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      throw new WorkspaceError('INVALID_INPUT', 'max_bytes must be a positive integer.', {
        max_bytes: maxBytes,
      });
    }

    const resolved = resolveConfinedReadPath(
      ws.root_path,
      input.path,
      'PATH_OUTSIDE_WORKSPACE',
    );
    if (resolved.sizeBytes > maxBytes) {
      throw new WorkspaceError(
        'FILE_TOO_LARGE',
        `File '${input.path}' (${resolved.sizeBytes} bytes) exceeds ${maxBytes} bytes limit.`,
        { path: input.path, size_bytes: resolved.sizeBytes, max_bytes: maxBytes },
      );
    }

    const bytes = fs.readFileSync(resolved.resolvedPath);
    if (bytes.byteLength > maxBytes) {
      throw new WorkspaceError(
        'FILE_TOO_LARGE',
        `File '${input.path}' (${bytes.byteLength} bytes) exceeds ${maxBytes} bytes limit.`,
        { path: input.path, size_bytes: bytes.byteLength, max_bytes: maxBytes },
      );
    }

    return {
      ok: true,
      workspace_id: ws.workspace_id,
      path: resolved.normalizedRelPath,
      content: bytes.toString('utf8'),
      encoding: 'utf8',
      sha256: sha256Prefixed(bytes),
      size_bytes: bytes.byteLength,
    };
  }

  inspectWorkspace(workspaceId: string): InspectWorkspaceResult {
    const workspace = this.getWorkspace(workspaceId);
    const sources = this.listSources(workspaceId);
    const snapshots = this.listSnapshots({ workspace_id: workspaceId });
    return {
      workspace,
      sources,
      knowledge_sources: sources,
      snapshots,
      knowledge_snapshots: snapshots,
    };
  }

  bindSource(input: BindKnowledgeSourceInput): KnowledgeSourceRow {
    const rawPath = typeof input.root_path === 'string' ? input.root_path.trim() : '';
    if (!rawPath) {
      throw new WorkspaceError('INVALID_INPUT', 'bindSource requires a non-empty root_path.');
    }

    const absRoot = path.resolve(rawPath);
    const stat = fs.statSync(absRoot, { throwIfNoEntry: false });
    if (!stat) {
      throw new WorkspaceError(
        'SOURCE_NOT_FOUND',
        `Knowledge source directory does not exist: ${absRoot}`,
        { root_path: absRoot },
      );
    }
    if (!stat.isDirectory()) {
      throw new WorkspaceError(
        'INVALID_INPUT',
        `Knowledge source root_path '${absRoot}' is not a directory.`,
        { root_path: absRoot },
      );
    }
    const realRoot = fs.realpathSync(absRoot);

    const scopeRaw = input.scope ?? 'project_local';
    if (!VALID_SCOPES.has(scopeRaw)) {
      throw new WorkspaceError('INVALID_INPUT', `Invalid knowledge scope '${String(scopeRaw)}'.`, {
        scope: scopeRaw,
      });
    }
    const scope = scopeRaw as KnowledgeSourceScope;
    const adapterKind = input.adapter_kind?.trim() || 'local_dir';
    const acceptedRevision = input.accepted_revision?.trim() || '1';
    const sourceId = input.source_id?.trim() || newId('ksrc');
    const ts = nowIso();

    txImmediate(this.#db, () => {
      const existingSource = this.#db
        .prepare(
          'SELECT source_id, scope, adapter_kind, root_path, accepted_revision, status, updated_at FROM knowledge_sources WHERE source_id = ?',
        )
        .get(sourceId) as KnowledgeSourceRow | undefined;

      if (existingSource) {
        if (existingSource.root_path !== realRoot) {
          throw new WorkspaceError(
            'INVALID_INPUT',
            `Knowledge source '${sourceId}' is already bound to a different root_path '${existingSource.root_path}'.`,
            { source_id: sourceId, existing_root_path: existingSource.root_path, root_path: realRoot },
          );
        }
        if (existingSource.status === 'revoked') {
          throw new WorkspaceError(
            'SOURCE_REVOKED',
            `Knowledge source '${sourceId}' is revoked.`,
            { source_id: sourceId },
          );
        }
        this.#db
          .prepare(
            "UPDATE knowledge_sources SET scope = ?, adapter_kind = ?, accepted_revision = ?, status = 'active', updated_at = ? WHERE source_id = ?",
          )
          .run(input.scope ?? existingSource.scope, input.adapter_kind?.trim() || existingSource.adapter_kind,
            input.accepted_revision?.trim() || existingSource.accepted_revision, ts, sourceId);
      } else {
        this.#db
          .prepare(
            "INSERT INTO knowledge_sources (source_id, scope, adapter_kind, root_path, accepted_revision, status, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?)",
          )
          .run(sourceId, scope, adapterKind, realRoot, acceptedRevision, ts);
      }

      if (input.workspace_id) {
        const ws = this.getWorkspace(input.workspace_id);
        this.#syncLegacyWorkspaceSourceLinks(ws);
        this.#db
          .prepare(
            'INSERT OR IGNORE INTO workspace_knowledge_sources (workspace_id, source_id, bound_at) VALUES (?, ?, ?)',
          )
          .run(ws.workspace_id, sourceId, ts);

        const nextMetadata = updateWorkspaceSourceIds(ws.metadata_json, (ids) => [
          ...ids,
          sourceId,
        ]);
        this.#db
          .prepare('UPDATE workspaces SET metadata_json = ?, updated_at = ? WHERE workspace_id = ?')
          .run(nextMetadata, ts, ws.workspace_id);
      }
    });

    const row = this.#readRawSource(sourceId)!;
    this.#onMutate?.();
    return row;
  }

  getSource(sourceId: string): KnowledgeSourceRow {
    const row = this.#readRawSource(sourceId);
    if (!row) {
      throw new WorkspaceError('SOURCE_NOT_FOUND', `Knowledge source '${sourceId}' not found.`, {
        source_id: sourceId,
      });
    }
    return this.#reconcileSourceAvailability(row);
  }

  listSources(workspaceId?: string): KnowledgeSourceRow[] {
    let rows: KnowledgeSourceRow[];
    if (workspaceId) {
      const ws = this.getWorkspace(workspaceId);
      txImmediate(this.#db, () => {
        this.#syncLegacyWorkspaceSourceLinks(ws);
      });
      rows = this.#db
        .prepare(
          'SELECT ks.source_id, ks.scope, ks.adapter_kind, ks.root_path, ks.accepted_revision, ks.status, ks.updated_at FROM knowledge_sources ks INNER JOIN workspace_knowledge_sources wks ON wks.source_id = ks.source_id WHERE wks.workspace_id = ? ORDER BY ks.updated_at DESC, ks.rowid DESC',
        )
        .all(workspaceId) as unknown as KnowledgeSourceRow[];
    } else {
      rows = this.#db
        .prepare(
          'SELECT source_id, scope, adapter_kind, root_path, accepted_revision, status, updated_at FROM knowledge_sources ORDER BY updated_at DESC, rowid DESC',
        )
        .all() as unknown as KnowledgeSourceRow[];
    }

    return rows.map((row) => this.#reconcileSourceAvailability(row));
  }

  removeSource(input: RemoveKnowledgeSourceInput): RemoveKnowledgeSourceResult {
    const existing = this.#readRawSource(input.source_id);
    if (!existing) {
      throw new WorkspaceError(
        'SOURCE_NOT_FOUND',
        `Knowledge source '${input.source_id}' not found.`,
        { source_id: input.source_id },
      );
    }

    const shouldRevoke = input.revoke !== false;
    const ts = nowIso();
    let finalStatus: 'revoked' | 'active' = existing.status === 'revoked' ? 'revoked' : 'active';

    txImmediate(this.#db, () => {
      if (shouldRevoke) {
        this.#db
          .prepare("UPDATE knowledge_sources SET status = 'revoked', updated_at = ? WHERE source_id = ?")
          .run(ts, input.source_id);
        finalStatus = 'revoked';
      }
      if (input.workspace_id) {
        const ws = this.getWorkspace(input.workspace_id);
        this.#db
          .prepare(
            'DELETE FROM workspace_knowledge_sources WHERE workspace_id = ? AND source_id = ?',
          )
          .run(ws.workspace_id, input.source_id);
        const nextMetadata = updateWorkspaceSourceIds(ws.metadata_json, (ids) =>
          ids.filter((id) => id !== input.source_id),
        );
        this.#db
          .prepare('UPDATE workspaces SET metadata_json = ?, updated_at = ? WHERE workspace_id = ?')
          .run(nextMetadata, ts, ws.workspace_id);
      }
    });

    this.#onMutate?.();
    return {
      removed: true,
      source_id: input.source_id,
      status: finalStatus,
    };
  }

  refreshSourceRevision(input: RefreshSourceRevisionInput): RefreshSourceRevisionResult {
    const rawSource = this.#readRawSource(input.source_id);
    if (!rawSource) {
      throw new WorkspaceError(
        'SOURCE_NOT_FOUND',
        `Knowledge source '${input.source_id}' not found.`,
        { source_id: input.source_id },
      );
    }
    const src = this.#requireActiveOnDiskSource(rawSource);

    const files = walkSourceFiles(src.root_path);
    const treeSha256 = sha256Prefixed(canonicalJsonText(files));
    const currentRevision = src.accepted_revision ?? '1';
    if (input.expected_revision !== undefined && input.expected_revision !== currentRevision) {
      throw new WorkspaceError(
        'REVISION_CONFLICT',
        `Source '${src.source_id}' revision conflict: expected '${input.expected_revision}', actual '${currentRevision}'.`,
        {
          source_id: src.source_id,
          expected_revision: input.expected_revision,
          actual_revision: currentRevision,
        },
      );
    }

    const nextRevision = input.new_revision?.trim()
      ? input.new_revision.trim()
      : input.mode === 'digest'
        ? treeSha256
        : computeNextRevision(currentRevision);
    const ts = nowIso();

    txImmediate(this.#db, () => {
      const res = this.#db
        .prepare(
          "UPDATE knowledge_sources SET accepted_revision = ?, updated_at = ? WHERE source_id = ? AND COALESCE(accepted_revision, '1') = ?",
        )
        .run(nextRevision, ts, src.source_id, currentRevision);

      if (Number(res.changes) !== 1) {
        throw new WorkspaceError(
          'REVISION_CONFLICT',
          `Concurrent revision conflict refreshing source '${src.source_id}'.`,
          { source_id: src.source_id },
        );
      }
    });

    const updated = this.#readRawSource(src.source_id)!;
    this.#onMutate?.();
    return {
      source: updated,
      previous_revision: currentRevision,
      new_revision: nextRevision,
      tree_sha256: treeSha256,
      file_count: files.length,
    };
  }

  createSnapshot(input: CreateSnapshotInput): CreateSnapshotResult {
    const stageRunId = typeof input.stage_run_id === 'string' ? input.stage_run_id.trim() : '';
    if (!stageRunId) {
      throw new WorkspaceError('INVALID_INPUT', 'createSnapshot requires a non-empty stage_run_id.');
    }

    let targets: KnowledgeSourceRow[];
    if (input.source_id) {
      const row = this.#readRawSource(input.source_id);
      if (!row) {
        throw new WorkspaceError(
          'SOURCE_NOT_FOUND',
          `Knowledge source '${input.source_id}' not found.`,
          { source_id: input.source_id },
        );
      }
      targets = [row];
    } else if (input.workspace_id) {
      targets = this.listSources(input.workspace_id);
    } else {
      throw new WorkspaceError('INVALID_INPUT', 'Provide source_id or workspace_id.');
    }

    if (targets.length === 0) {
      throw new WorkspaceError('SOURCE_NOT_FOUND', 'No knowledge sources bound to snapshot.');
    }

    const ts = nowIso();
    const prepared: Array<{
      readonly row: KnowledgeSnapshotRow;
      readonly manifest: SnapshotManifest;
    }> = [];

    for (const rawSrc of targets) {
      const src = this.#requireActiveOnDiskSource(rawSrc);
      const files = walkSourceFiles(src.root_path);
      const treeSha256 = sha256Prefixed(canonicalJsonText(files));
      const revision = src.accepted_revision || '1';
      const manifest: SnapshotManifest = {
        source_id: src.source_id,
        scope: src.scope,
        adapter_kind: src.adapter_kind,
        revision,
        tree_sha256: treeSha256,
        file_count: files.length,
        files,
      };
      const snapshotId = newId('ksnap');
      const manifestJson = JSON.stringify(manifest);
      prepared.push({
        row: {
          snapshot_id: snapshotId,
          stage_run_id: stageRunId,
          source_id: src.source_id,
          revision,
          manifest_json: manifestJson,
          created_at: ts,
        },
        manifest,
      });
    }

    txImmediate(this.#db, () => {
      const insertStmt = this.#db.prepare(
        'INSERT INTO knowledge_snapshots (snapshot_id, stage_run_id, source_id, revision, manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const item of prepared) {
        insertStmt.run(
          item.row.snapshot_id,
          item.row.stage_run_id,
          item.row.source_id,
          item.row.revision,
          item.row.manifest_json,
          item.row.created_at,
        );
      }
    });

    this.#onMutate?.();
    const first = prepared[0]!;
    return {
      snapshot_id: first.row.snapshot_id,
      stage_run_id: first.row.stage_run_id,
      source_id: first.row.source_id,
      revision: first.row.revision,
      manifest: first.manifest,
      snapshots: prepared.map((p) => p.row),
    };
  }

  getSnapshot(snapshotId: string): {
    readonly snapshot: KnowledgeSnapshotRow;
    readonly manifest: SnapshotManifest;
  } {
    const row = this.#db
      .prepare(
        'SELECT snapshot_id, stage_run_id, source_id, revision, manifest_json, created_at FROM knowledge_snapshots WHERE snapshot_id = ?',
      )
      .get(snapshotId) as KnowledgeSnapshotRow | undefined;
    if (!row) {
      throw new WorkspaceError('SNAPSHOT_NOT_FOUND', `Snapshot '${snapshotId}' not found.`, {
        snapshot_id: snapshotId,
      });
    }
    return {
      snapshot: row,
      manifest: JSON.parse(row.manifest_json) as SnapshotManifest,
    };
  }

  listSnapshots(filter: {
    readonly stage_run_id?: string;
    readonly source_id?: string;
    readonly workspace_id?: string;
  } = {}): KnowledgeSnapshotRow[] {
    if (filter.workspace_id) {
      const ws = this.getWorkspace(filter.workspace_id);
      txImmediate(this.#db, () => {
        this.#syncLegacyWorkspaceSourceLinks(ws);
      });
      const conditions = ['wks.workspace_id = ?'];
      const params: string[] = [ws.workspace_id];
      if (filter.stage_run_id) {
        conditions.push('ksnap.stage_run_id = ?');
        params.push(filter.stage_run_id);
      }
      if (filter.source_id) {
        conditions.push('ksnap.source_id = ?');
        params.push(filter.source_id);
      }
      return this.#db
        .prepare(
          `SELECT ksnap.snapshot_id, ksnap.stage_run_id, ksnap.source_id, ksnap.revision, ksnap.manifest_json, ksnap.created_at FROM knowledge_snapshots ksnap INNER JOIN workspace_knowledge_sources wks ON wks.source_id = ksnap.source_id WHERE ${conditions.join(' AND ')} ORDER BY ksnap.created_at DESC, ksnap.rowid DESC`,
        )
        .all(...params) as unknown as KnowledgeSnapshotRow[];
    }

    const conditions: string[] = [];
    const params: string[] = [];
    if (filter.stage_run_id) {
      conditions.push('stage_run_id = ?');
      params.push(filter.stage_run_id);
    }
    if (filter.source_id) {
      conditions.push('source_id = ?');
      params.push(filter.source_id);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.#db
      .prepare(
        `SELECT snapshot_id, stage_run_id, source_id, revision, manifest_json, created_at FROM knowledge_snapshots ${whereClause} ORDER BY created_at DESC, rowid DESC`,
      )
      .all(...params) as unknown as KnowledgeSnapshotRow[];
  }

  verifySnapshot(snapshotId: string): SnapshotVerificationResult {
    const { snapshot, manifest } = this.getSnapshot(snapshotId);
    const rawSource = this.#readRawSource(snapshot.source_id);
    if (!rawSource) {
      throw new WorkspaceError(
        'SOURCE_NOT_FOUND',
        `Knowledge source '${snapshot.source_id}' not found.`,
        { source_id: snapshot.source_id },
      );
    }
    const src = this.#reconcileSourceAvailability(rawSource);
    if (src.status === 'revoked') {
      throw new WorkspaceError(
        'SOURCE_REVOKED',
        `Knowledge source '${src.source_id}' is revoked.`,
        { source_id: src.source_id },
      );
    }
    if (src.status !== 'active') {
      throw new WorkspaceError(
        'SOURCE_UNAVAILABLE',
        `Knowledge source '${src.source_id}' is unavailable.`,
        { source_id: src.source_id },
      );
    }

    const liveFiles = walkSourceFiles(src.root_path);
    const liveMap = new Map(liveFiles.map((f) => [f.rel, f]));
    const expectedMap = new Map(manifest.files.map((f) => [f.rel, f]));

    const missing: string[] = [];
    const drifted: Array<{
      readonly rel: string;
      readonly expected_sha256: string;
      readonly actual_sha256: string;
    }> = [];
    const extra: string[] = [];

    for (const expected of manifest.files) {
      const actual = liveMap.get(expected.rel);
      if (!actual) {
        missing.push(expected.rel);
      } else if (actual.sha256 !== expected.sha256) {
        drifted.push({
          rel: expected.rel,
          expected_sha256: expected.sha256,
          actual_sha256: actual.sha256,
        });
      }
    }
    for (const actual of liveFiles) {
      if (!expectedMap.has(actual.rel)) {
        extra.push(actual.rel);
      }
    }

    return {
      ok: missing.length === 0 && drifted.length === 0 && extra.length === 0,
      snapshot_id: snapshot.snapshot_id,
      source_id: snapshot.source_id,
      missing,
      drifted,
      extra,
    };
  }

  readSnapshotFile(
    snapshotId: string,
    relPath: string,
    options: ReadSnapshotFileOptions = {},
  ): ReadSnapshotFileResult {
    const { snapshot, manifest } = this.getSnapshot(snapshotId);
    const maxBytes = options.max_bytes ?? DEFAULT_MAX_READ_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      throw new WorkspaceError('INVALID_INPUT', 'max_bytes must be a positive integer.', {
        max_bytes: maxBytes,
      });
    }

    const rawSource = this.#readRawSource(snapshot.source_id);
    if (!rawSource) {
      throw new WorkspaceError(
        'SOURCE_NOT_FOUND',
        `Knowledge source '${snapshot.source_id}' not found.`,
        { source_id: snapshot.source_id },
      );
    }
    const src = this.#requireActiveOnDiskSource(rawSource);
    const resolved = resolveConfinedReadPath(src.root_path, relPath, 'PATH_OUTSIDE_SOURCE');

    const manifestEntry = manifest.files.find((f) => f.rel === resolved.normalizedRelPath);
    if (!manifestEntry) {
      throw new WorkspaceError(
        'FILE_NOT_FOUND',
        `File '${resolved.normalizedRelPath}' is not part of snapshot '${snapshotId}'.`,
        { snapshot_id: snapshotId, rel: resolved.normalizedRelPath },
      );
    }

    if (resolved.sizeBytes > maxBytes) {
      throw new WorkspaceError(
        'FILE_TOO_LARGE',
        `File '${resolved.normalizedRelPath}' (${resolved.sizeBytes} bytes) exceeds ${maxBytes} bytes limit.`,
        { path: resolved.normalizedRelPath, size_bytes: resolved.sizeBytes, max_bytes: maxBytes },
      );
    }

    const bytes = fs.readFileSync(resolved.resolvedPath);
    if (bytes.byteLength > maxBytes) {
      throw new WorkspaceError(
        'FILE_TOO_LARGE',
        `File '${resolved.normalizedRelPath}' (${bytes.byteLength} bytes) exceeds ${maxBytes} bytes limit.`,
        { path: resolved.normalizedRelPath, size_bytes: bytes.byteLength, max_bytes: maxBytes },
      );
    }

    const actualSha = sha256Prefixed(bytes);
    if (!options.allow_drifted && actualSha !== manifestEntry.sha256) {
      throw new WorkspaceError(
        'REVISION_CONFLICT',
        `Snapshot file '${resolved.normalizedRelPath}' has drifted on disk since snapshot '${snapshotId}'.`,
        {
          snapshot_id: snapshotId,
          rel: resolved.normalizedRelPath,
          expected_sha256: manifestEntry.sha256,
          actual_sha256: actualSha,
        },
      );
    }

    return {
      snapshot_id: snapshot.snapshot_id,
      source_id: snapshot.source_id,
      rel: resolved.normalizedRelPath,
      content: bytes.toString('utf8'),
      sha256: actualSha,
      size_bytes: bytes.byteLength,
    };
  }

  proposeWriteback(input: ProposeWritebackInput): ProposeWritebackResult {
    if (!input.source_id?.trim() || typeof input.content !== 'string') {
      throw new WorkspaceError(
        'INVALID_INPUT',
        'proposeWriteback requires source_id, target_path, and string content.',
      );
    }

    const contentBuffer = Buffer.from(input.content, 'utf8');
    if (contentBuffer.byteLength > MAX_WRITEBACK_BYTES) {
      throw new WorkspaceError(
        'FILE_TOO_LARGE',
        `Writeback content (${contentBuffer.byteLength} bytes) exceeds ${MAX_WRITEBACK_BYTES} bytes limit.`,
        { byte_size: contentBuffer.byteLength, max_bytes: MAX_WRITEBACK_BYTES },
      );
    }

    const rawSource = this.#readRawSource(input.source_id);
    if (!rawSource) {
      throw new WorkspaceError(
        'SOURCE_NOT_FOUND',
        `Knowledge source '${input.source_id}' not found.`,
        { source_id: input.source_id },
      );
    }
    const src = this.#requireActiveOnDiskSource(rawSource);
    const { normalizedRelPath, resolvedPath } = resolveConfinedWritePath(
      src.root_path,
      input.target_path,
    );

    if (input.expected_workspace_revision !== undefined && !input.workspace_id?.trim()) {
      throw new WorkspaceError(
        'INVALID_INPUT',
        'proposeWriteback requires workspace_id when expected_workspace_revision is provided.',
      );
    }

    if (input.workspace_id) {
      const ws = this.getWorkspace(input.workspace_id);
      if (
        input.expected_workspace_revision !== undefined
        && ws.revision !== input.expected_workspace_revision
      ) {
        throw new WorkspaceError(
          'REVISION_CONFLICT',
          `Workspace '${ws.workspace_id}' revision conflict: expected ${input.expected_workspace_revision}, actual ${ws.revision}.`,
          {
            workspace_id: ws.workspace_id,
            expected_revision: input.expected_workspace_revision,
            actual_revision: ws.revision,
          },
        );
      }
    }

    const currentRevision = src.accepted_revision ?? '1';
    if (input.accepted_revision !== undefined && input.accepted_revision !== currentRevision) {
      throw new WorkspaceError(
        'REVISION_CONFLICT',
        `Writeback proposal revision conflict for source '${src.source_id}': expected '${input.accepted_revision}', actual '${currentRevision}'.`,
        {
          source_id: src.source_id,
          expected_revision: input.accepted_revision,
          actual_revision: currentRevision,
        },
      );
    }

    let beforeSha256: string | null = null;
    const beforeStat = fs.statSync(resolvedPath, { throwIfNoEntry: false });
    if (beforeStat && beforeStat.isFile()) {
      beforeSha256 = sha256Prefixed(fs.readFileSync(resolvedPath));
    }

    const contentSha256 = sha256Prefixed(contentBuffer);
    const byteSize = contentBuffer.byteLength;
    const proposalId = newId('wbprop');
    const createdAt = nowIso();

    txImmediate(this.#db, () => {
      this.#db
        .prepare(
          "INSERT INTO workspace_writeback_proposals (proposal_id, workspace_id, source_id, target_path, accepted_revision, content_sha256, byte_size, before_sha256, status, created_at, committed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, NULL)",
        )
        .run(
          proposalId,
          input.workspace_id ?? null,
          src.source_id,
          normalizedRelPath,
          currentRevision,
          contentSha256,
          byteSize,
          beforeSha256,
          createdAt,
        );
    });

    return {
      proposal_id: proposalId,
      source_id: src.source_id,
      target_path: normalizedRelPath,
      accepted_revision: currentRevision,
      content_sha256: contentSha256,
      byte_size: byteSize,
      before_sha256: beforeSha256,
      status: 'proposed',
    };
  }

  commitWriteback(input: CommitWritebackInput): CommitWritebackResult {
    if (typeof input.content !== 'string') {
      throw new WorkspaceError('INVALID_INPUT', 'commitWriteback requires string content.');
    }

    const contentBuffer = Buffer.from(input.content, 'utf8');
    if (contentBuffer.byteLength > MAX_WRITEBACK_BYTES) {
      throw new WorkspaceError(
        'FILE_TOO_LARGE',
        `Writeback content (${contentBuffer.byteLength} bytes) exceeds ${MAX_WRITEBACK_BYTES} bytes limit.`,
        { byte_size: contentBuffer.byteLength, max_bytes: MAX_WRITEBACK_BYTES },
      );
    }
    const contentSha256 = sha256Prefixed(contentBuffer);

    let preProposal: WritebackProposalRow | undefined;
    if (input.proposal_id) {
      preProposal = this.#db
        .prepare(
          'SELECT proposal_id, workspace_id, source_id, target_path, accepted_revision, content_sha256, byte_size, before_sha256, status, created_at, committed_at FROM workspace_writeback_proposals WHERE proposal_id = ?',
        )
        .get(input.proposal_id) as WritebackProposalRow | undefined;
      if (!preProposal) {
        throw new WorkspaceError(
          'PROPOSAL_NOT_FOUND',
          `Writeback proposal '${input.proposal_id}' not found.`,
          { proposal_id: input.proposal_id },
        );
      }
    }

    const preSourceId = input.source_id ?? preProposal?.source_id;
    if (preSourceId) {
      const preSource = this.#readRawSource(preSourceId);
      if (preSource && preSource.status === 'active' && !isDirectoryOnDisk(preSource.root_path)) {
        this.#reconcileSourceAvailability(preSource);
      }
    }

    const wasInTransaction = this.#db.isTransaction;
    let appendedLedgerEntry: unknown;
    const result = txImmediate(this.#db, () => {
      let proposal: WritebackProposalRow | undefined;
      if (input.proposal_id) {
        proposal = this.#db
          .prepare(
            'SELECT proposal_id, workspace_id, source_id, target_path, accepted_revision, content_sha256, byte_size, before_sha256, status, created_at, committed_at FROM workspace_writeback_proposals WHERE proposal_id = ?',
          )
          .get(input.proposal_id) as WritebackProposalRow | undefined;
        if (!proposal) {
          throw new WorkspaceError(
            'PROPOSAL_NOT_FOUND',
            `Writeback proposal '${input.proposal_id}' not found.`,
            { proposal_id: input.proposal_id },
          );
        }
        if (proposal.status !== 'proposed') {
          throw new WorkspaceError(
            'REVISION_CONFLICT',
            `Writeback proposal '${proposal.proposal_id}' has status '${proposal.status}'.`,
            { proposal_id: proposal.proposal_id, status: proposal.status },
          );
        }
        if (input.source_id !== undefined && input.source_id !== proposal.source_id) {
          throw new WorkspaceError(
            'INVALID_INPUT',
            `commitWriteback source_id '${input.source_id}' does not match proposal source_id '${proposal.source_id}'.`,
          );
        }
        if (input.target_path !== undefined) {
          const normalizedInputTarget = normalizePosixRelativeSegments(
            input.target_path,
            'PATH_OUTSIDE_SOURCE',
          ).join('/');
          if (normalizedInputTarget !== proposal.target_path) {
            throw new WorkspaceError(
              'INVALID_INPUT',
              `commitWriteback target_path '${input.target_path}' does not match proposal target_path '${proposal.target_path}'.`,
            );
          }
        }
        if (
          input.accepted_revision !== undefined
          && input.accepted_revision !== proposal.accepted_revision
        ) {
          throw new WorkspaceError(
            'REVISION_CONFLICT',
            `commitWriteback accepted_revision '${input.accepted_revision}' does not match proposal accepted_revision '${proposal.accepted_revision}'.`,
            {
              proposal_id: proposal.proposal_id,
              expected_revision: proposal.accepted_revision,
              actual_revision: input.accepted_revision,
            },
          );
        }
        if (
          input.workspace_id !== undefined
          && proposal.workspace_id !== null
          && input.workspace_id !== proposal.workspace_id
        ) {
          throw new WorkspaceError(
            'INVALID_INPUT',
            `commitWriteback workspace_id '${input.workspace_id}' does not match proposal workspace_id '${proposal.workspace_id}'.`,
            {
              proposal_id: proposal.proposal_id,
              expected_workspace_id: proposal.workspace_id,
              actual_workspace_id: input.workspace_id,
            },
          );
        }
        if (
          contentSha256 !== proposal.content_sha256
          || contentBuffer.byteLength !== proposal.byte_size
        ) {
          throw new WorkspaceError(
            'INVALID_INPUT',
            `commitWriteback content digest does not match proposal '${proposal.proposal_id}'.`,
            {
              proposal_id: proposal.proposal_id,
              expected_sha256: proposal.content_sha256,
              actual_sha256: contentSha256,
            },
          );
        }
      }

      const sourceId = input.source_id ?? proposal?.source_id;
      const targetPath = input.target_path ?? proposal?.target_path;
      const expectedRevision = input.accepted_revision ?? proposal?.accepted_revision;
      const workspaceId = input.workspace_id ?? proposal?.workspace_id ?? undefined;

      if (!sourceId || !targetPath) {
        throw new WorkspaceError(
          'INVALID_INPUT',
          'commitWriteback requires source_id, target_path, and content (or proposal_id).',
        );
      }

      if (input.expected_workspace_revision !== undefined && !workspaceId?.trim()) {
        throw new WorkspaceError(
          'INVALID_INPUT',
          'commitWriteback requires workspace_id when expected_workspace_revision is provided.',
        );
      }

      const src = this.#readRawSource(sourceId);
      if (!src) {
        throw new WorkspaceError(
          'SOURCE_NOT_FOUND',
          `Knowledge source '${sourceId}' not found.`,
          { source_id: sourceId },
        );
      }
      if (src.status === 'revoked') {
        throw new WorkspaceError(
          'SOURCE_REVOKED',
          `Knowledge source '${sourceId}' is revoked.`,
          { source_id: sourceId },
        );
      }
      if (src.status === 'unavailable' || !isDirectoryOnDisk(src.root_path)) {
        throw new WorkspaceError(
          'SOURCE_UNAVAILABLE',
          `Knowledge source '${sourceId}' is unavailable.`,
          { source_id: sourceId },
        );
      }

      if (workspaceId && input.expected_workspace_revision !== undefined) {
        const ws = this.getWorkspace(workspaceId);
        if (ws.revision !== input.expected_workspace_revision) {
          throw new WorkspaceError(
            'REVISION_CONFLICT',
            `Workspace '${ws.workspace_id}' revision conflict: expected ${input.expected_workspace_revision}, actual ${ws.revision}.`,
            {
              workspace_id: ws.workspace_id,
              expected_revision: input.expected_workspace_revision,
              actual_revision: ws.revision,
            },
          );
        }
      }

      const currentRevision = src.accepted_revision ?? '1';
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
        throw new WorkspaceError(
          'REVISION_CONFLICT',
          `Writeback revision conflict for source '${sourceId}': expected '${expectedRevision}', actual '${currentRevision}'.`,
          {
            source_id: sourceId,
            expected_revision: expectedRevision,
            actual_revision: currentRevision,
          },
        );
      }

      const { normalizedRelPath, resolvedPath } = resolveConfinedWritePath(
        src.root_path,
        targetPath,
      );

      if (input.require_unchanged_before && proposal) {
        const currentStat = fs.statSync(resolvedPath, { throwIfNoEntry: false });
        const actualBeforeSha = currentStat && currentStat.isFile()
          ? sha256Prefixed(fs.readFileSync(resolvedPath))
          : null;
        if (actualBeforeSha !== proposal.before_sha256) {
          throw new WorkspaceError(
            'REVISION_CONFLICT',
            `Writeback target '${normalizedRelPath}' changed on disk since proposal '${proposal.proposal_id}'.`,
            {
              proposal_id: proposal.proposal_id,
              expected_before_sha256: proposal.before_sha256,
              actual_before_sha256: actualBeforeSha,
            },
          );
        }
      }

      const nextRevision = computeNextRevision(currentRevision);
      const ts = nowIso();

      const updateRes = this.#db
        .prepare(
          "UPDATE knowledge_sources SET accepted_revision = ?, updated_at = ? WHERE source_id = ? AND COALESCE(accepted_revision, '1') = ?",
        )
        .run(nextRevision, ts, sourceId, currentRevision);

      if (Number(updateRes.changes) !== 1) {
        throw new WorkspaceError(
          'REVISION_CONFLICT',
          `Concurrent revision conflict on source '${sourceId}'.`,
          { source_id: sourceId },
        );
      }

      if (proposal) {
        const propRes = this.#db
          .prepare(
            "UPDATE workspace_writeback_proposals SET status = 'committed', committed_at = ? WHERE proposal_id = ? AND status = 'proposed'",
          )
          .run(ts, proposal.proposal_id);
        if (Number(propRes.changes) !== 1) {
          throw new WorkspaceError(
            'REVISION_CONFLICT',
            `Concurrent writeback proposal commit conflict on '${proposal.proposal_id}'.`,
            { proposal_id: proposal.proposal_id },
          );
        }
      }

      let ledgerEntryId: string | undefined;
      if (input.ledger) {
        const entry = appendEntryWithDb(this.#db, {
          task_id: input.ledger.task_id,
          stage_run_id: input.ledger.stage_run_id ?? null,
          attempt_id: input.ledger.attempt_id ?? null,
          entry_kind: 'artifact_ref',
          owner_id: input.ledger.owner_id,
          payload: {
            path: normalizedRelPath,
            sha256: contentSha256,
            bytes: contentBuffer.byteLength,
            ...(input.ledger.role ? { role: input.ledger.role } : {}),
          },
        });
        ledgerEntryId = entry.entry_id;
        appendedLedgerEntry = entry;
      }

      atomicWriteFile(resolvedPath, contentBuffer);

      return {
        committed: true as const,
        ...(proposal ? { proposal_id: proposal.proposal_id } : {}),
        source_id: sourceId,
        target_path: normalizedRelPath,
        previous_revision: currentRevision,
        new_revision: nextRevision,
        content_sha256: contentSha256,
        ...(ledgerEntryId ? { ledger_entry_id: ledgerEntryId } : {}),
      };
    });

    if (appendedLedgerEntry !== undefined && !wasInTransaction) {
      this.#onLedgerAppended?.([appendedLedgerEntry]);
    }
    this.#onMutate?.();
    return result;
  }

  #readRawSource(sourceId: string): KnowledgeSourceRow | undefined {
    return this.#db
      .prepare(
        'SELECT source_id, scope, adapter_kind, root_path, accepted_revision, status, updated_at FROM knowledge_sources WHERE source_id = ?',
      )
      .get(sourceId) as KnowledgeSourceRow | undefined;
  }

  #reconcileSourceAvailability(row: KnowledgeSourceRow): KnowledgeSourceRow {
    if (row.status === 'active' && !isDirectoryOnDisk(row.root_path)) {
      const ts = nowIso();
      txImmediate(this.#db, () => {
        this.#db
          .prepare(
            "UPDATE knowledge_sources SET status = 'unavailable', updated_at = ? WHERE source_id = ? AND status = 'active'",
          )
          .run(ts, row.source_id);
      });
      this.#onMutate?.();
      return { ...row, status: 'unavailable', updated_at: ts };
    }
    return row;
  }

  #requireActiveOnDiskSource(row: KnowledgeSourceRow): KnowledgeSourceRow {
    if (row.status === 'revoked') {
      throw new WorkspaceError(
        'SOURCE_REVOKED',
        `Knowledge source '${row.source_id}' is revoked.`,
        { source_id: row.source_id },
      );
    }
    const reconciled = this.#reconcileSourceAvailability(row);
    if (reconciled.status === 'unavailable') {
      throw new WorkspaceError(
        'SOURCE_UNAVAILABLE',
        `Knowledge source '${row.source_id}' is unavailable.`,
        { source_id: row.source_id },
      );
    }
    return reconciled;
  }

  #syncLegacyWorkspaceSourceLinks(ws: WorkspaceRow): void {
    const legacyIds = parseWorkspaceSourceIds(ws.metadata_json);
    if (legacyIds.length === 0) return;
    const ts = nowIso();
    const insertStmt = this.#db.prepare(
      'INSERT OR IGNORE INTO workspace_knowledge_sources (workspace_id, source_id, bound_at) VALUES (?, ?, ?)',
    );
    const existsStmt = this.#db.prepare(
      'SELECT 1 AS ok FROM knowledge_sources WHERE source_id = ?',
    );
    for (const sourceId of legacyIds) {
      const exists = existsStmt.get(sourceId) as { ok: number } | undefined;
      if (exists) {
        insertStmt.run(ws.workspace_id, sourceId, ts);
      }
    }
  }
}

export function createWorkspaceService(
  options: WorkspaceServiceOptions,
): WorkspaceService {
  ensureWorkspaceSchema(options.db);
  if (options.stateDir) importLegacyWorkspaceBindings(options.db, options.stateDir);
  return new WorkspaceService(options);
}
