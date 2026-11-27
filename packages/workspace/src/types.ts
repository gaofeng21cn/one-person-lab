import type { SqliteDb } from '@opl/core';

export const KNOWLEDGE_SOURCE_SCOPES = [
  'personal_profile',
  'long_term_topic',
  'project_local',
] as const;

export type KnowledgeSourceScope = (typeof KNOWLEDGE_SOURCE_SCOPES)[number];

export const KNOWLEDGE_SOURCE_STATUSES = [
  'active',
  'revoked',
  'unavailable',
] as const;

export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUSES)[number];

export const WRITEBACK_PROPOSAL_STATUSES = [
  'proposed',
  'committed',
  'superseded',
  'cancelled',
] as const;

export type WritebackProposalStatus = (typeof WRITEBACK_PROPOSAL_STATUSES)[number];

export type WorkspaceDb = SqliteDb;

export interface WorkspaceRow {
  readonly workspace_id: string;
  readonly name: string;
  readonly root_path: string;
  readonly domain_id: string | null;
  readonly revision: number;
  readonly metadata_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface KnowledgeSourceRow {
  readonly source_id: string;
  readonly scope: KnowledgeSourceScope;
  readonly adapter_kind: string;
  readonly root_path: string;
  readonly accepted_revision: string | null;
  readonly status: KnowledgeSourceStatus;
  readonly updated_at: string;
}

export interface SnapshotFileEntry {
  readonly rel: string;
  readonly sha256: string;
  readonly size_bytes: number;
}

export interface SnapshotManifest {
  readonly source_id: string;
  readonly scope: KnowledgeSourceScope;
  readonly adapter_kind: string;
  readonly revision: string;
  readonly tree_sha256: string;
  readonly file_count: number;
  readonly files: readonly SnapshotFileEntry[];
}

export interface KnowledgeSnapshotRow {
  readonly snapshot_id: string;
  readonly stage_run_id: string;
  readonly source_id: string;
  readonly revision: string;
  readonly manifest_json: string;
  readonly created_at: string;
}

export interface WritebackProposalRow {
  readonly proposal_id: string;
  readonly workspace_id: string | null;
  readonly source_id: string;
  readonly target_path: string;
  readonly accepted_revision: string;
  readonly content_sha256: string;
  readonly byte_size: number;
  readonly before_sha256: string | null;
  readonly status: WritebackProposalStatus;
  readonly created_at: string;
  readonly committed_at: string | null;
}

export interface WritebackLedgerContext {
  readonly task_id: string;
  readonly stage_run_id?: string | null;
  readonly attempt_id?: string | null;
  readonly owner_id: string;
  readonly role?: string;
}

export interface InitWorkspaceInput {
  readonly root_path: string;
  readonly name?: string;
  readonly domain_id?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface UpdateWorkspaceRevisionInput {
  readonly workspace_id: string;
  readonly expected_revision: number;
  readonly name?: string;
  readonly domain_id?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly metadata_patch?: Record<string, unknown>;
}

export interface ReadWorkspaceFileInput {
  readonly workspace_id: string;
  readonly path: string;
  readonly max_bytes?: number;
}

export interface ReadWorkspaceFileResult {
  readonly ok: true;
  readonly workspace_id: string;
  readonly path: string;
  readonly content: string;
  readonly encoding: 'utf8';
  readonly sha256: string;
  readonly size_bytes: number;
}

export interface BindKnowledgeSourceInput {
  readonly workspace_id?: string;
  readonly source_id?: string;
  readonly scope?: KnowledgeSourceScope;
  readonly adapter_kind?: string;
  readonly root_path: string;
  readonly accepted_revision?: string;
}

export interface RemoveKnowledgeSourceInput {
  readonly source_id: string;
  readonly workspace_id?: string;
  readonly revoke?: boolean;
}

export interface RemoveKnowledgeSourceResult {
  readonly removed: true;
  readonly source_id: string;
  readonly status: 'revoked' | 'active';
}

export interface RefreshSourceRevisionInput {
  readonly source_id: string;
  readonly expected_revision?: string;
  readonly new_revision?: string;
  readonly mode?: 'increment' | 'digest';
}

export interface RefreshSourceRevisionResult {
  readonly source: KnowledgeSourceRow;
  readonly previous_revision: string;
  readonly new_revision: string;
  readonly tree_sha256: string;
  readonly file_count: number;
}

export interface InspectWorkspaceResult {
  readonly workspace: WorkspaceRow;
  readonly sources: readonly KnowledgeSourceRow[];
  readonly knowledge_sources: readonly KnowledgeSourceRow[];
  readonly snapshots: readonly KnowledgeSnapshotRow[];
  readonly knowledge_snapshots: readonly KnowledgeSnapshotRow[];
}

export interface CreateSnapshotInput {
  readonly workspace_id?: string;
  readonly stage_run_id: string;
  readonly source_id?: string;
}

export interface CreateSnapshotResult {
  readonly snapshot_id: string;
  readonly stage_run_id: string;
  readonly source_id: string;
  readonly revision: string;
  readonly manifest: SnapshotManifest;
  readonly snapshots: readonly KnowledgeSnapshotRow[];
}

export interface SnapshotVerificationResult {
  readonly ok: boolean;
  readonly snapshot_id: string;
  readonly source_id: string;
  readonly missing: readonly string[];
  readonly drifted: ReadonlyArray<{
    readonly rel: string;
    readonly expected_sha256: string;
    readonly actual_sha256: string;
  }>;
  readonly extra: readonly string[];
}

export interface ReadSnapshotFileOptions {
  readonly allow_drifted?: boolean;
  readonly max_bytes?: number;
}

export interface ReadSnapshotFileResult {
  readonly snapshot_id: string;
  readonly source_id: string;
  readonly rel: string;
  readonly content: string;
  readonly sha256: string;
  readonly size_bytes: number;
}

export interface ProposeWritebackInput {
  readonly workspace_id?: string;
  readonly source_id: string;
  readonly target_path: string;
  readonly content: string;
  readonly accepted_revision?: string;
  readonly expected_workspace_revision?: number;
}

export interface ProposeWritebackResult {
  readonly proposal_id: string;
  readonly source_id: string;
  readonly target_path: string;
  readonly accepted_revision: string;
  readonly content_sha256: string;
  readonly byte_size: number;
  readonly before_sha256: string | null;
  readonly status: 'proposed';
}

export interface CommitWritebackInput {
  readonly proposal_id?: string;
  readonly workspace_id?: string;
  readonly source_id?: string;
  readonly target_path?: string;
  readonly content: string;
  readonly accepted_revision?: string;
  readonly expected_workspace_revision?: number;
  readonly require_unchanged_before?: boolean;
  readonly ledger?: WritebackLedgerContext;
}

export interface CommitWritebackResult {
  readonly committed: true;
  readonly proposal_id?: string;
  readonly source_id: string;
  readonly target_path: string;
  readonly previous_revision: string;
  readonly new_revision: string;
  readonly content_sha256: string;
  readonly ledger_entry_id?: string;
}

export interface WorkspaceServiceOptions {
  readonly stateDir?: string;
  readonly db: WorkspaceDb;
  readonly onMutate?: () => void;
  readonly onLedgerAppended?: (entries: readonly unknown[]) => void;
}
