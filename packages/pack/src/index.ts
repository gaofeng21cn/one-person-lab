export { PackError, type PackErrorCode } from './errors.ts';

export type {
  BuildPackageResult,
  CodexSyncProjectionResult,
  ExternalCodexPluginSummary,
  InstallSourceSpec,
  PackageUpdateSource,
  InstalledPackageRecord,
  PackContextOptions,
  PackEventBus,
  PackEvents,
  PackProgressEvent,
  PackServiceSecurityOptions,
  PackageInstallMode,
  PackageIntent,
  PackageOperationAction,
  PackageOperationErrorInfo,
  PackageOperationProgress,
  PackageOperationRecord,
  PackageOperationStatus,
  PackageOrigin,
  ReloadMode,
} from './types.ts';

export {
  CommandEntrypointSchema,
  ConnectionPermissionSchema,
  DECLARATIVE_VIEW_SLOTS,
  DECLARATIVE_VIEW_TYPES,
  DSH_CLIENT_SLOTS,
  DeclarativeActionSchema,
  DeclarativeNavigationItemSchema,
  DeclarativeSettingsFormSchema,
  DeclarativeViewSchema,
  DshEntryPathSchema,
  GrantConnectionPermissionSchema,
  HomeShortcutSchema,
  I18nTextSchema,
  KebabIdSchema,
  ModuleEntrypointSchema,
  ModuleOrCommandEntrypointSchema,
  OplPackageManifestV2Schema,
  OplReleaseLockV2Schema,
  PackageDependencySchema,
  RESERVED_APP_SETTINGS_IDS,
  RelativePosixPathSchema,
  RuntimeDependencySchema,
  SETTINGS_DESTINATIONS,
  ScopedIdSchema,
  SemverSchema,
  SettingsDestinationSchema,
  Spec01ConnectionPermissionSchema,
  isDshEntrySafePath,
  isReservedAppSettingsId,
  isSafeRelativePosixPath,
  type CommandEntrypoint,
  type I18nText,
  type ModuleEntrypoint,
  type ModuleOrCommandEntrypoint,
  type OplPackageManifestV2,
  type OplReleaseLockV2,
  type SettingsDestination,
} from './manifest/schema.ts';

export {
  isWithinDirectory,
  normalizeRelativePosixPath,
  parsePackageManifestV2,
  resolveSafePackagePath,
  safeParsePackageManifestV2,
} from './manifest/validate.ts';

export {
  OPL_PACKAGE_V2_SCHEMA_ID,
  generatePackageManifestV2JsonSchema,
  renderPackageManifestV2JsonSchemaText,
  syncPackageManifestV2SchemaFile,
} from './manifest/generate-schema.ts';

export {
  CANONICALIZATION_ALGORITHM,
  collectPackageReleasePaths,
  computePackageContentDigest,
  sortPosixPaths,
  verifyManifestPathsExist,
  type CollectPackageFilesOptions,
} from './build/content-lock.ts';

export {
  buildPackage,
  computeLiveDirectoryContentDigest,
  readPackageManifestFromDir,
  verifyReleaseLock,
  type BuildPackageOptions,
} from './build/build-package.ts';

export {
  MAX_PACKAGE_SOURCE_ARCHIVE_BYTES,
  createPackageSourceArchive,
  extractPackageSourceArchive,
  packageSourceArchiveDigest,
  packageSourceArchiveMembersStayWithinRoot,
  readPackageSourceArchiveEntries,
  type PackageSourceArchiveEntry,
} from './distribution/archive.ts';

export {
  OPL_OCI_SOURCE_MEDIA_TYPES,
  buildOciPackageRef,
  defaultRegistryFetch,
  normalizeDistributionVersion,
  packageRegistryNamespace,
  packageVisibility,
  parseOciRef,
  resolveNpmTarball,
  resolveOciArtifact,
  sha256File,
  sha256Payload,
  type OciManifestLayer,
  type PackageVisibility,
  type ParsedOciRef,
  type RegistryFetch,
  type RegistryFetchResponse,
  type ResolvedNpmTarball,
  type ResolvedOciArtifact,
} from './distribution/registry-client.ts';

export {
  freeDiskBytes,
  packageDownloadCacheDir,
  planOciPackageDownload,
  type PackageDownloadPlan,
} from './distribution/download-plan.ts';

export { stageOfficialPackageSource } from './distribution/stage-official-source.ts';

export {
  acceptsCurlChunkRange,
  downloadPackageArchive,
  isValidContentRange,
  type DownloadTransport,
  type PackageDownloadRequest,
  type RangeChunkResult,
} from './distribution/download-worker.ts';

export {
  OPL_LOCAL_MARKETPLACE_NAME,
  buildCodexMcpJson,
  buildCodexPluginJson,
  defaultCodexCategoryForIntent,
  deriveCodexCapabilities,
  getCodexMarketplacePaths,
  projectPackageToCodexMarketplace,
  removeCodexMarketplaceProjection,
  resolveCodexMarketplaceRoot,
  resolveCodexPluginName,
  shouldSyncToCodex,
  type CodexMarketplacePaths,
  type MarketplacePluginEntry,
} from './carriers/codex-sync/project.ts';

export {
  createProcessCodexRunner,
  ensureMarketplaceAvailable,
  isTransientMarketplaceUpgradeFailure,
  parseMarketplaceListOutput,
  parsePluginListResponse,
  removeUnusedMarketplaces,
  sameMarketplaceSource,
  type CodexCarrierRunner,
  type CodexCommandResult,
  type CodexMarketplaceEntry,
  type CodexPluginListResponse,
  type CodexPluginSource,
  type CodexPluginSummary,
} from './carriers/codex-sync/readback.ts';

export {
  discoverExternalCodexPlugins,
  syncPackageToCodex,
  unsyncPackageFromCodex,
  type ImportedExternalPluginRecord,
  type SyncPackageToCodexOptions,
} from './carriers/codex-sync/sync.ts';

export {
  migrateV1Package,
  type MigrateV1CleanupReport,
  type MigrateV1Options,
  type MigrateV1Relocation,
  type MigrateV1Result,
} from './migrate/migrate-v1.ts';

export {
  classifyReloadMode,
  combineReloadModes,
  type ReloadModeContext,
} from './lifecycle/reload-mode.ts';

export { assertRequiredPackageDependency } from './lifecycle/dependency.ts';

export {
  PackStore,
  type PackStoreOptions,
} from './lifecycle/pack-store.ts';

export {
  DEFAULT_CARRIER_TMP_LOCK_QUIET_MS,
  DEFAULT_CARRIER_TMP_MAX_AGE_MS,
  DEFAULT_CARRIER_TMP_MAX_ENTRIES_PER_PASS,
  DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_AGE_MS,
  DEFAULT_PACKAGE_DOWNLOAD_CACHE_MAX_BYTES,
  captureCodexCarrierTmpSnapshot,
  cleanupCodexCarrierTmpAfterRun,
  pruneCodexCarrierTmpArtifacts,
  prunePackStateArtifacts,
  prunePackageDownloadCache,
  resolveConfiguredCodexHome,
  type CodexCarrierTmpPruneSummary,
  type CodexCarrierTmpSnapshot,
  type PackStateHygieneSummary,
  type PackageDownloadCachePruneSummary,
} from './carriers/codex-sync/temp-hygiene.ts';

export {
  PackService,
  createPackService,
  type BatchOperationResult,
  type CreatePackServiceOptions,
  type InstallPackageResult,
  type UninstallPackageResult,
} from './lifecycle/service.ts';

export {
  officialPackageInstallSource,
  officialPackageRuntimeRoot,
  readOfficialPackageCatalog,
  type OfficialPackageCatalogEntry,
  type OfficialPackageCatalogOptions,
} from './distribution/official-package-catalog.ts';
export { createOfficialPackageResolver } from './distribution/official-package-source.ts';
export { ensurePackage, type ResolvedPackageForInstall } from './lifecycle/ensure-package.ts';
