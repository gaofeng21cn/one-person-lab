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
export const RELEASE_BUNDLE_FROZEN_BUILD_INPUT_IDS = [
  'app_source',
  'base_image',
  'codex_cli',
  'dockerfile',
  'first_party_packages',
  'framework_seed',
  'opl_flow',
  'qualification_harness',
  'shell_webui_source',
] as const;
export type ReleaseBundleFrozenBuildInputId =
  typeof RELEASE_BUNDLE_FROZEN_BUILD_INPUT_IDS[number];
export const RELEASE_BUNDLE_TRACK_NAMES = ['standard', 'webui', 'full'] as const;
export type ReleaseBundleTrackName = 'standard' | 'webui' | 'full';
export type ReleaseBundleExecutor = 'local' | 'remote';
export type ReleaseBundleStableOperation = 'standard' | 'resume_standard' | 'append_full';
export type ReleaseBundleCanonicalOperation = 'standard' | 'append_full';
export type ReleaseBundleStageOperation = 'build' | 'publish';
export type ReleaseBundlePublicationScope = 'track_assets' | 'external_target';

export type ReleaseBundleOperationControl = {
  surface_kind: 'opl_release_bundle_operation_control.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-operation-control.schema.json';
  control_digest: string;
  bundle_digest: string;
  operation_id: string;
  operation_kind: ReleaseBundleCanonicalOperation;
  track: ReleaseBundleTrackName;
  operation_started_at: string;
  operation_deadline_at: string;
};

export type ReleaseBundleOperationInvocation = {
  releaseOperation: ReleaseBundleStableOperation;
  operationId: string;
  operationStartedAt: string;
  operationDeadlineAt: string;
  now?: string | Date;
};

export type ReleaseBundleUnknownOutcomeMarker = {
  surface_kind: 'opl_release_bundle_unknown_outcome.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-unknown-outcome.schema.json';
  marker_digest: string;
  bundle_digest: string;
  operation_id: string;
  operation_kind: ReleaseBundleCanonicalOperation;
  stage_operation: ReleaseBundleStageOperation;
  publication_scope: ReleaseBundlePublicationScope | null;
  track: ReleaseBundleTrackName;
  remote_target: string;
  prior_mutation_attempt_id: string;
  executor: ReleaseBundleExecutor;
};

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

export type ReleaseBundleSourceCutoff = {
  observed_at: string;
  policy: 'single_read_at_freeze_admission';
  frozen_base_release_set: {
    generation: string;
    digest: string;
  } | null;
  post_freeze_remote_refresh_allowed: false;
  later_authority_advancement_invalidates_bundle: false;
};

export type ReleaseBundleFrozenBuildInput = {
  id: ReleaseBundleFrozenBuildInputId;
  ref: string;
  digest: string;
  size_bytes: number;
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
  source_cutoff?: ReleaseBundleSourceCutoff;
  frozen_build_inputs?: ReleaseBundleFrozenBuildInput[];
  tracks: {
    standard: ReleaseBundleTrackPlan;
    webui?: ReleaseBundleTrackPlan;
    full: ReleaseBundleTrackPlan;
  };
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
  source_cutoff?: ReleaseBundleSourceCutoff;
  frozen_build_inputs?: ReleaseBundleFrozenBuildInput[];
  tracks: ReleaseBundleFreezeRequest['tracks'];
  policy: {
    build_once: true;
    verify_and_promote_many: true;
    executor_neutral: true;
    allowed_executors: ['local', 'remote'];
    prepared_notes_required_before_build: true;
    publish_may_generate_notes: false;
    latest_required_track: 'standard';
    latest_required_tracks?: ['standard', 'webui'];
    source_cutoff_frozen_once?: true;
    post_freeze_remote_refresh_allowed?: false;
    later_authority_advancement_invalidates_bundle?: false;
    cohort_invalidation_causes?: [
      'frozen_byte_or_digest_drift',
      'artifact_build_or_integrity_failure',
      'explicit_security_revocation_bound_to_frozen_ref_or_digest',
    ];
    all_other_live_currentness_drift_invalidates_bundle?: false;
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
  release_operation?: ReleaseBundleStableOperation;
  operation_id?: string;
  remote_target?: string;
  prior_attempt_id?: string | null;
  publication_scope?: ReleaseBundlePublicationScope;
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
  operation: 'freeze' | 'operation_admit' | 'build' | 'verify' | 'publish' | 'reconcile' | 'checkpoint_import';
  status: 'frozen' | 'complete' | 'idempotent' | 'upload_required' | 'reconcile_only' | 'late_observation';
  bundle_digest: string;
  track: ReleaseBundleTrackName | null;
  executor: ReleaseBundleExecutor | null;
  attempt_id: string | null;
  recorded_at: string;
  release_operation: ReleaseBundleStableOperation | null;
  operation_control: ReleaseBundleOperationControl | null;
  unknown_marker: ReleaseBundleUnknownOutcomeMarker | null;
  details: Record<string, unknown>;
};

export type ReleaseBundleCheckpointStage =
  | 'frozen'
  | 'standard_built'
  | 'standard_qualified'
  | 'webui_built'
  | 'webui_qualified'
  | 'stable_built'
  | 'stable_qualified'
  | 'full_built'
  | 'full_qualified';

export type ReleaseBundleCheckpointEntry = {
  path: string;
  role: 'bundle' | 'prepared_notes' | 'track_asset' | 'track_asset_manifest' | 'qualification_receipt';
  track: ReleaseBundleTrackName | null;
  asset_name: string | null;
  size_bytes: number;
  sha256: string;
};

export type ReleaseBundleCheckpointTrack = {
  built: boolean;
  verified: boolean;
  asset_names: string[];
  asset_manifest_path: string | null;
  asset_manifest_sha256: string | null;
  qualification_receipt_path: string | null;
  qualification_receipt_sha256: string | null;
};

export type ReleaseBundleCheckpoint = {
  surface_kind: 'opl_release_bundle_checkpoint.v1';
  schema_ref: 'contracts/opl-framework/release-bundle-checkpoint.schema.json';
  checkpoint_digest: string;
  bundle_digest: string;
  checkpoint_stage: ReleaseBundleCheckpointStage;
  operation_controls?: {
    standard: ReleaseBundleOperationControl | null;
    append_full: ReleaseBundleOperationControl | null;
  };
  active_unknown_markers?: ReleaseBundleUnknownOutcomeMarker[];
  tracks: {
    standard: ReleaseBundleCheckpointTrack;
    webui?: ReleaseBundleCheckpointTrack;
    full: ReleaseBundleCheckpointTrack;
  };
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
  now?: string | Date;
};
