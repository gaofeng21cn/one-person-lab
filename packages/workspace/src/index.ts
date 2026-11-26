export {
  WorkspaceError,
  type WorkspaceErrorCode,
} from './errors.ts';

export {
  MIGRATION_0003_WORKSPACE,
  ensureWorkspaceSchema,
} from './migrations.ts';

export {
  assertSafeRelativePath,
  atomicWriteFile,
  isWithinRealRoot,
  normalizePosixRelativeSegments,
  resolveConfinedReadPath,
  resolveConfinedWritePath,
  resolveExistingRealDir,
  sha256Prefixed,
  walkSourceFiles,
} from './path-safety.ts';

export {
  WorkspaceService,
  createWorkspaceService,
} from './service.ts';

export {
  KNOWLEDGE_SOURCE_SCOPES,
  KNOWLEDGE_SOURCE_STATUSES,
  WRITEBACK_PROPOSAL_STATUSES,
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
  type KnowledgeSourceStatus,
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
  type SnapshotFileEntry,
  type SnapshotManifest,
  type SnapshotVerificationResult,
  type UpdateWorkspaceRevisionInput,
  type WorkspaceDb,
  type WorkspaceRow,
  type WorkspaceServiceOptions,
  type WritebackLedgerContext,
  type WritebackProposalRow,
  type WritebackProposalStatus,
} from './types.ts';
