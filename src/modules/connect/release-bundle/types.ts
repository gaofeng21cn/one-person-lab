export const RELEASE_BUNDLE_PACKAGE_IDS = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
] as const;

export type ReleaseBundlePackageId = typeof RELEASE_BUNDLE_PACKAGE_IDS[number];
export type ReleaseBundleTrackName = 'standard' | 'full';
export type ReleaseBundleExecutor = 'local' | 'remote';

export type ReleaseBundlePackageIdentity = {
  package_id: ReleaseBundlePackageId;
  version: string;
  owner_source_commit: string;
  manifest_ref: string;
  manifest_sha256: string;
  payload_manifest_ref: string;
  payload_manifest_sha256: string;
};

export type ReleaseBundleTrackPlan = {
  required_asset_names: string[];
  required_for_latest: boolean;
  additive_only: boolean;
  updater_metadata_allowed: boolean;
};

export type ReleaseBundleFreezeRequest = {
  surface_kind: 'opl_release_bundle_freeze_request.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-freeze-request.schema.json';
  release: {
    channel: 'stable' | 'nightly';
    version: string;
    display_version: string;
    updater_version: string;
    tag: string;
    prerelease: boolean;
  };
  sources: Record<'app' | 'shell' | 'framework', {
    repo: string;
    source_commit: string;
  }>;
  framework_release_set: {
    generation: string;
    manifest_ref: string;
    digest: string;
  };
  packages: Record<ReleaseBundlePackageId, ReleaseBundlePackageIdentity>;
  prepared_notes: {
    source: 'prepared_ai';
    format: 'markdown';
    markdown: string;
    evidence: Record<string, unknown>;
  };
  tracks: Record<ReleaseBundleTrackName, ReleaseBundleTrackPlan>;
};

export type ReleaseBundle = {
  surface_kind: 'opl_release_bundle.v1';
  schema_ref: 'contracts/opl-framework/release-bundle.schema.json';
  bundle_digest: string;
  release: ReleaseBundleFreezeRequest['release'];
  sources: ReleaseBundleFreezeRequest['sources'];
  framework_release_set: ReleaseBundleFreezeRequest['framework_release_set'];
  packages: ReleaseBundleFreezeRequest['packages'];
  prepared_notes: ReleaseBundleFreezeRequest['prepared_notes'] & {
    markdown_sha256: string;
    evidence_sha256: string;
  };
  tracks: ReleaseBundleFreezeRequest['tracks'];
  policy: {
    build_once: true;
    verify_and_promote_many: true;
    executor_neutral: true;
    allowed_executors: ['local', 'remote'];
    prepared_notes_required_before_build: true;
    publish_may_generate_notes: false;
    latest_required_track: 'standard';
    full_additive_only: true;
    full_updates_updater_metadata: false;
  };
};

export type ReleaseBundleExecutorAsset = {
  name: string;
  size_bytes: number;
  sha256: string;
  path?: string;
};

export type ReleaseBundleExecutorReceipt = {
  surface_kind: 'opl_release_bundle_executor_receipt.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-executor-receipt.schema.json';
  operation: 'build' | 'remote_inspect';
  executor: ReleaseBundleExecutor;
  attempt_id: string;
  bundle_digest: string;
  track: ReleaseBundleTrackName;
  outcome: 'complete' | 'unknown';
  assets: ReleaseBundleExecutorAsset[];
};

export type StoredReleaseBundleAsset = Required<ReleaseBundleExecutorAsset>;

export type ReleaseBundleQualificationReceipt = {
  surface_kind: 'opl_release_bundle_qualification_receipt.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-qualification-receipt.schema.json';
  bundle_digest: string;
  track: ReleaseBundleTrackName;
  subject: {
    asset_name: string;
    size_bytes: number;
    sha256: string;
  };
  cohort: {
    app_sha: string;
    shell_sha: string;
    framework_sha: string;
    framework_release_set_digest: string;
    package_payload_manifest_sha256: Record<ReleaseBundlePackageId, string>;
  };
  qualification: {
    kind: 'installed_artifact';
    result: 'passed';
    installed_artifact_same_bytes: true;
    harness_sha256: string;
    evidence_refs: string[];
  };
};

export type ReleaseBundleOperationReceipt = {
  surface_kind: 'opl_release_bundle_operation_receipt.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-operation-receipt.schema.json';
  operation: 'freeze' | 'build' | 'verify' | 'publish' | 'reconcile' | 'checkpoint_import';
  status: 'frozen' | 'complete' | 'idempotent' | 'upload_required' | 'reconcile_only';
  bundle_digest: string;
  track: ReleaseBundleTrackName | null;
  executor: ReleaseBundleExecutor | null;
  attempt_id: string | null;
  recorded_at: string;
  details: Record<string, unknown>;
};

export type ReleaseBundleCheckpointStage =
  | 'frozen'
  | 'standard_built'
  | 'standard_qualified'
  | 'full_built'
  | 'full_qualified';

export type ReleaseBundleCheckpointEntry = {
  path: string;
  role: 'bundle' | 'prepared_notes' | 'track_asset' | 'qualification_receipt';
  track: ReleaseBundleTrackName | null;
  asset_name: string | null;
  size_bytes: number;
  sha256: string;
};

export type ReleaseBundleCheckpointTrack = {
  built: boolean;
  verified: boolean;
  asset_names: string[];
  qualification_receipt_path: string | null;
  qualification_receipt_sha256: string | null;
};

export type ReleaseBundleCheckpoint = {
  surface_kind: 'opl_release_bundle_checkpoint.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-checkpoint.schema.json';
  checkpoint_digest: string;
  bundle_digest: string;
  checkpoint_stage: ReleaseBundleCheckpointStage;
  tracks: Record<ReleaseBundleTrackName, ReleaseBundleCheckpointTrack>;
  entries: ReleaseBundleCheckpointEntry[];
  policy: {
    portable_between_executors: true;
    import_never_rebuilds: true;
    publish_state_requires_fresh_remote_readback: true;
  };
};

export type ReleaseBundleOperationInput = {
  bundleDigest: string;
  storeRoot?: string;
};
