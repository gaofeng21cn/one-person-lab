import type { ClientContext, EventBus, SqliteDb } from '@opl/core';
import type { OplPackageManifestV2, OplReleaseLockV2 } from './manifest/schema.ts';

export type PackageIntent = 'agent' | 'app' | 'extension' | 'channel';
export type PackageOrigin = 'opl' | 'external' | 'local_dev';
export type PackageInstallMode = 'release' | 'dev_link';
export type PackageOperationAction = 'install' | 'update' | 'uninstall' | 'repair' | 'sync';
export type PackageOperationStatus =
  | 'queued'
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type ReloadMode = 'none' | 'renderer_reload' | 'restart_required';

export interface InstalledPackageRecord {
  readonly package_id: string;
  readonly version: string;
  readonly intent: PackageIntent;
  readonly origin: PackageOrigin;
  readonly install_mode: PackageInstallMode;
  readonly install_path: string;
  readonly content_digest: string;
  readonly manifest: OplPackageManifestV2;
  readonly manifest_json: string;
  readonly enabled: boolean;
  readonly carrier_synced: boolean;
  readonly codex_synced: boolean;
  readonly installed_at: string;
  readonly updated_at: string;
}

export interface PackageOperationProgress {
  readonly stage?: string;
  readonly bytes_done?: number;
  readonly bytes_total?: number;
  readonly cached_bytes?: number;
  readonly speed_bps?: number;
  readonly eta_sec?: number | null;
  readonly message?: string;
}

export interface PackageOperationErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface PackageOperationRecord {
  readonly op_id: string;
  readonly batch_id: string | null;
  readonly package_id: string;
  readonly action: PackageOperationAction;
  readonly target_version: string | null;
  readonly status: PackageOperationStatus;
  readonly reload_mode: ReloadMode | null;
  readonly progress: PackageOperationProgress;
  readonly error: PackageOperationErrorInfo | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PackProgressEvent {
  readonly op_id: string;
  readonly batch_id: string | null;
  readonly package_id: string;
  readonly action: PackageOperationAction;
  readonly target_version: string | null;
  readonly status: PackageOperationStatus;
  readonly reload_mode: ReloadMode | null;
  readonly progress: PackageOperationProgress;
  readonly error: PackageOperationErrorInfo | null;
  readonly timestamp: string;
}

export type PackEvents = {
  'event.pack.progress': PackProgressEvent;
};

export type PackEventBus = EventBus<PackEvents>;

export interface PackContextOptions {
  readonly db: SqliteDb;
  readonly stateDir?: string;
  readonly eventBus?: PackEventBus;
  readonly nowIso?: () => string;
}

export interface InstallSourceSpec {
  readonly kind: 'local_dir' | 'tarball' | 'oci' | 'npm';
  readonly path?: string;
  readonly ref?: string;
  readonly version?: string;
  readonly package_id?: string;
  readonly visibility?: 'public' | 'authorized_only';
  readonly credential_handle?: string;
  readonly expected_digest?: string;
}

export type PackageUpdateSource =
  | InstallSourceSpec
  | { readonly kind: 'official'; readonly package_id: string };

export interface BuildPackageResult {
  readonly package_root: string;
  readonly manifest: OplPackageManifestV2;
  readonly lock: OplReleaseLockV2;
  readonly lock_path: string;
  readonly digest: string;
}

export interface CodexSyncProjectionResult {
  readonly package_id: string;
  readonly plugin_name: string;
  readonly synced: boolean;
  readonly skipped_reason?: 'sync_disabled' | 'no_codex_surface';
  readonly marketplace_root: string;
  readonly marketplace_manifest_path: string;
  readonly plugin_dir: string | null;
  readonly verified_by_readback: boolean;
}

export interface ExternalCodexPluginSummary {
  readonly package_id: string;
  readonly plugin_id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly source_type: 'local' | 'git' | 'npm' | 'remote';
  readonly install_path: string;
  readonly marketplace_name: string;
}

export interface PackServiceSecurityOptions {
  readonly clientContext?: ClientContext;
}
