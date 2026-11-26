export {
  KernelError,
  isRecord,
  toErrorMessage,
  type KernelErrorCode,
} from './errors.ts';

export {
  canonicalJsonBytes,
  canonicalJsonText,
  createOpaqueRef,
  newId,
  newRandomToken,
  nowIso,
  sha256Hex,
  stableId,
  type OpaqueRef,
} from './ids.ts';

export {
  assertTrustedHost,
  createClientContext,
  isClientKind,
  isTrustedHost,
  parseClientKind,
  timingSafeEqualHex,
  type ClientContext,
  type ClientKind,
} from './security.ts';

export {
  ensureStateDir,
  resolveStatePaths,
  type StatePaths,
} from './paths.ts';

export {
  EventBus,
  type EventBusOptions,
  type EventListener,
} from './event-bus.ts';

export {
  PluginLoader,
  type PluginContext,
  type PluginDefinition,
  type PluginRecord,
  type PluginStatus,
} from './plugin-loader.ts';

export {
  acquireAdvisoryLock,
  isProcessAlive,
  reclaimLockFileAtomically,
  withAdvisoryLockSync,
  writeExclusiveFileSync,
  type AdvisoryLockHandle,
  type AdvisoryLockOptions,
  type AdvisoryLockPayload,
  type ProcessIdentity,
} from './file-lock.ts';

export {
  openSqliteStore,
  txImmediate,
  type OpenSqliteOptions,
  type SqliteDb,
} from './sqlite.ts';

export {
  MIGRATION_0001_INITIAL_V2,
  type SqliteMigration,
} from './migrations/0001_initial_v2.ts';

export {
  runMigrations,
  type MigrationResult,
} from './migrations/runner.ts';
