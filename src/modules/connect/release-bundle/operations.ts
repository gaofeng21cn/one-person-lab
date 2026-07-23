import {
  assertReleaseBundleFreezeInputs,
  buildFrozenReleaseBundle,
  readReleaseBundleExecutorReceipt,
  readReleaseBundleFreezeRequest,
  readReleaseBundleQualificationReceipt,
  sha256,
} from './contracts.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import {
  clearReleaseBundleUnknownOutcomeExact,
  clearReleaseBundleOperation,
  installFrozenReleaseBundle,
  installReleaseBundleQualificationReceipt,
  listReleaseBundleUnknownOutcomes,
  readReleaseBundleOperation,
  readReleaseBundleOperationControls,
  readReleaseBundleUnknownOutcome,
  readStagedReleaseBundleAssets,
  readStoredReleaseBundle,
  recordReleaseBundleOperation,
  recordReleaseBundleUnknownOutcome,
  releaseBundleStorePaths,
  releaseBundleLegacyCheckpointReadOnly,
  stageReleaseBundleAssets,
  withReleaseBundleStateLock,
} from './store.ts';
import {
  assertReleaseBundleOperationTrack,
  canonicalReleaseBundleOperation,
  releaseBundleOperationDeadlineElapsed,
  requireReleaseBundleOperation,
} from './operation-control.ts';
import { releaseBundleOperationReceipt } from './receipt.ts';
import {
  RELEASE_BUNDLE_PACKAGE_IDS,
  type ReleaseBundle,
  type ReleaseBundleExecutorReceipt,
  type ReleaseBundleOperationInput,
  type ReleaseBundleOperationInvocation,
  type ReleaseBundleQualificationReceipt,
  type ReleaseBundleStageOperation,
  type ReleaseBundleTrackName,
  type ReleaseBundleUnknownOutcomeMarker,
  type StoredReleaseBundleAsset,
} from './types.ts';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    surface_kind: 'opl_release_bundle.v1',
    ...details,
  });
}

function assertExecutorBinding(
  bundle: ReleaseBundle,
  executorReceipt: ReleaseBundleExecutorReceipt,
  operation: ReleaseBundleExecutorReceipt['operation'],
) {
  if (executorReceipt.bundle_digest !== bundle.bundle_digest) {
    fail('Executor receipt is bound to a different Release Bundle.', {
      expected_bundle_digest: bundle.bundle_digest,
      executor_bundle_digest: executorReceipt.bundle_digest,
      attempt_id: executorReceipt.attempt_id,
    });
  }
  if (executorReceipt.operation !== operation) {
    fail(`This Release Bundle operation requires an ${operation} executor receipt.`, {
      executor_operation: executorReceipt.operation,
      attempt_id: executorReceipt.attempt_id,
    });
  }
}

function assertExecutorOperationBinding(
  executorReceipt: ReleaseBundleExecutorReceipt,
  invocation: ReleaseBundleOperationInvocation,
) {
  if (
    executorReceipt.release_operation === undefined
    || executorReceipt.operation_id === undefined
    || executorReceipt.remote_target === undefined
    || executorReceipt.prior_attempt_id === undefined
  ) {
    fail('Legacy executor receipts without exact operation binding cannot drive live mutation.', {
      attempt_id: executorReceipt.attempt_id,
    });
  }
  if (
    executorReceipt.release_operation !== invocation.releaseOperation
    || executorReceipt.operation_id !== invocation.operationId
  ) {
    fail('Executor receipt operation identity does not match the admitted Release Bundle operation.', {
      expected_operation: invocation.releaseOperation,
      received_operation: executorReceipt.release_operation,
      expected_operation_id: invocation.operationId,
      received_operation_id: executorReceipt.operation_id,
    });
  }
  assertReleaseBundleOperationTrack(invocation.releaseOperation, executorReceipt.track);
}

function unknownMarker(input: {
  executorReceipt: ReleaseBundleExecutorReceipt;
  invocation: ReleaseBundleOperationInvocation;
  stageOperation: ReleaseBundleStageOperation;
}) {
  if (!input.executorReceipt.remote_target) {
    fail('Unknown outcome requires one canonical remote target.');
  }
  if (input.executorReceipt.prior_attempt_id !== null) {
    fail('A new unknown outcome cannot claim an earlier prior attempt.', {
      prior_attempt_id: input.executorReceipt.prior_attempt_id,
    });
  }
  const core = {
    surface_kind: 'opl_release_bundle_unknown_outcome.v1' as const,
    schema_ref: 'contracts/opl-framework/release-bundle-unknown-outcome.schema.json' as const,
    bundle_digest: input.executorReceipt.bundle_digest,
    operation_id: input.invocation.operationId,
    operation_kind: canonicalReleaseBundleOperation(input.invocation.releaseOperation),
    stage_operation: input.stageOperation,
    publication_scope: input.stageOperation === 'publish'
      ? input.executorReceipt.publication_scope ?? 'track_assets'
      : null,
    track: input.executorReceipt.track,
    remote_target: input.executorReceipt.remote_target,
    prior_mutation_attempt_id: input.executorReceipt.attempt_id,
    executor: input.executorReceipt.executor,
  };
  return {
    ...core,
    marker_digest: sha256(canonicalJsonBytes(core)),
  } satisfies ReleaseBundleUnknownOutcomeMarker;
}

function exactReconcileMarker(input: {
  paths: ReturnType<typeof readStoredReleaseBundle>['paths'];
  executorReceipt: ReleaseBundleExecutorReceipt;
  invocation: ReleaseBundleOperationInvocation;
  stageOperation: ReleaseBundleStageOperation;
}) {
  const marker = readReleaseBundleUnknownOutcome(
    input.paths,
    input.stageOperation,
    input.executorReceipt.track,
  );
  if (!marker) {
    fail('Release Bundle reconcile requires a prior durable unknown outcome marker.', {
      stage_operation: input.stageOperation,
      track: input.executorReceipt.track,
    });
  }
  if (
    input.executorReceipt.outcome !== 'unknown'
    && input.executorReceipt.prior_attempt_id === null
  ) {
    fail('Release Bundle reconcile observation must name the prior unknown mutation attempt.');
  }
  const mismatches = {
    bundle_digest: marker.bundle_digest !== input.executorReceipt.bundle_digest,
    operation_id: marker.operation_id !== input.invocation.operationId,
    operation_kind: marker.operation_kind !== canonicalReleaseBundleOperation(
      input.invocation.releaseOperation,
    ),
    stage_operation: marker.stage_operation !== input.stageOperation,
    publication_scope: marker.publication_scope !== (
      input.stageOperation === 'publish'
        ? input.executorReceipt.publication_scope ?? 'track_assets'
        : null
    ),
    track: marker.track !== input.executorReceipt.track,
    remote_target: marker.remote_target !== input.executorReceipt.remote_target,
    prior_attempt: marker.prior_mutation_attempt_id !== input.executorReceipt.prior_attempt_id,
  };
  const mismatchedFields = Object.entries(mismatches)
    .filter(([, mismatch]) => mismatch)
    .map(([field]) => field);
  if (mismatchedFields.length > 0) {
    fail('Release Bundle reconcile observation does not match the exact unknown outcome marker.', {
      marker_digest: marker.marker_digest,
      mismatched_fields: mismatchedFields,
    });
  }
  return marker;
}

export function freezeReleaseBundle(input: {
  requestPath: string;
  sourceRoot?: string;
  storeRoot?: string;
}) {
  const request = readReleaseBundleFreezeRequest(input.requestPath);
  const inputs = assertReleaseBundleFreezeInputs(request, input.sourceRoot);
  const bundle = buildFrozenReleaseBundle(request);
  const installed = installFrozenReleaseBundle(bundle, input.storeRoot);
  const receipt = releaseBundleOperationReceipt({
    operation: 'freeze',
    status: installed.status === 'idempotent' ? 'idempotent' : 'frozen',
    bundle_digest: bundle.bundle_digest,
    track: null,
    executor: null,
    attempt_id: null,
    release_operation: null,
    operation_control: null,
    unknown_marker: null,
    details: {
      bundle_path: installed.paths.bundle,
      notes_path: installed.paths.notes,
      framework_release_set_digest: bundle.framework_release_set.digest,
      package_payload_manifest_sha256: Object.fromEntries(
        RELEASE_BUNDLE_PACKAGE_IDS.map((packageId) => [
          packageId,
          bundle.packages[packageId].payload_manifest_sha256,
        ]),
      ),
      source_root: inputs.sourceRoot,
      release_set_path: inputs.releaseSetPath,
      owner_cohort_lock_path: inputs.ownerCohortLockPath,
      inputs_verified_before_freeze: true,
      source_cutoff: bundle.source_cutoff ?? null,
      source_cutoff_frozen_once: Boolean(bundle.source_cutoff),
      post_freeze_remote_refresh_allowed:
        bundle.source_cutoff?.post_freeze_remote_refresh_allowed ?? null,
      later_authority_advancement_invalidates_bundle:
        bundle.source_cutoff?.later_authority_advancement_invalidates_bundle ?? null,
    },
  });
  const recorded = recordReleaseBundleOperation(installed.paths, receipt);
  return {
    version: 'g2' as const,
    release_bundle_freeze: {
      status: installed.status,
      bundle_digest: bundle.bundle_digest,
      bundle_path: installed.paths.bundle,
      receipt_path: recorded.receiptPath,
      receipt,
      bundle,
    },
  };
}

function buildWithReceipt(input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation & {
  executorReceiptPath: string;
  reconcile: boolean;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const executorReceipt = readReleaseBundleExecutorReceipt(input.executorReceiptPath);
  assertExecutorBinding(stored.bundle, executorReceipt, 'build');
  assertExecutorOperationBinding(executorReceipt, input);
  const operation = requireReleaseBundleOperation(stored.paths, input.bundleDigest, input, {
    allowExpired: input.reconcile,
    allowActiveUnknown: input.reconcile,
  });
  const marker = input.reconcile
    ? exactReconcileMarker({
        paths: stored.paths,
        executorReceipt,
        invocation: input,
        stageOperation: 'build',
      })
    : null;

  if (!input.reconcile && executorReceipt.prior_attempt_id !== null) {
    fail('Ordinary build receipts cannot act as reconcile observations.', {
      prior_attempt_id: executorReceipt.prior_attempt_id,
    });
  }

  if (executorReceipt.outcome === 'unknown') {
    const activeMarker = marker ?? unknownMarker({
      executorReceipt,
      invocation: input,
      stageOperation: 'build',
    });
    if (!input.reconcile) recordReleaseBundleUnknownOutcome(stored.paths, activeMarker);
    const receipt = releaseBundleOperationReceipt({
      operation: input.reconcile ? 'reconcile' : 'build',
      status: 'reconcile_only',
      bundle_digest: input.bundleDigest,
      track: executorReceipt.track,
      executor: executorReceipt.executor,
      attempt_id: executorReceipt.attempt_id,
      release_operation: input.releaseOperation,
      operation_control: operation.control,
      unknown_marker: activeMarker,
      details: {
        resolved_operation: 'build',
        writes_performed: false,
        marker_overwritten: false,
        stage_advanced: false,
        retry_allowed: false,
        required_next_command: 'opl release reconcile',
      },
    });
    const recorded = recordReleaseBundleOperation(stored.paths, receipt);
    return {
      status: 'reconcile_only' as const,
      bundleDigest: input.bundleDigest,
      track: executorReceipt.track,
      executor: executorReceipt.executor,
      assets: [] as StoredReleaseBundleAsset[],
      receipt,
      receiptPath: recorded.receiptPath,
    };
  }

  if (input.reconcile && operation.deadlineElapsed) {
    const receipt = releaseBundleOperationReceipt({
      operation: 'reconcile',
      status: 'late_observation',
      bundle_digest: input.bundleDigest,
      track: executorReceipt.track,
      executor: executorReceipt.executor,
      attempt_id: executorReceipt.attempt_id,
      release_operation: input.releaseOperation,
      operation_control: operation.control,
      unknown_marker: marker,
      details: {
        resolved_operation: 'build',
        observed_assets: executorReceipt.assets,
        operation_deadline_elapsed: true,
        stage_advanced: false,
        late_success_recorded_as_evidence_only: true,
      },
    });
    const recorded = recordReleaseBundleOperation(stored.paths, receipt);
    clearReleaseBundleUnknownOutcomeExact(stored.paths, marker!);
    return {
      status: 'late_observation' as const,
      bundleDigest: input.bundleDigest,
      track: executorReceipt.track,
      executor: executorReceipt.executor,
      assets: [] as StoredReleaseBundleAsset[],
      receipt,
      receiptPath: recorded.receiptPath,
    };
  }

  const staged = stageReleaseBundleAssets({
    bundle: stored.bundle,
    paths: stored.paths,
    executorReceipt,
  });
  const receipt = releaseBundleOperationReceipt({
    operation: input.reconcile ? 'reconcile' : 'build',
    status: staged.status,
    bundle_digest: input.bundleDigest,
    track: executorReceipt.track,
    executor: executorReceipt.executor,
    attempt_id: executorReceipt.attempt_id,
    release_operation: input.releaseOperation,
    operation_control: operation.control,
    unknown_marker: marker,
    details: {
      resolved_operation: 'build',
      asset_manifest_path: staged.manifestPath,
      assets: staged.assets,
      stage_advanced: true,
    },
  });
  const recorded = recordReleaseBundleOperation(stored.paths, receipt);
  if (marker) clearReleaseBundleUnknownOutcomeExact(stored.paths, marker);
  return {
    status: staged.status,
    bundleDigest: input.bundleDigest,
    track: executorReceipt.track,
    executor: executorReceipt.executor,
    assets: staged.assets,
    receipt,
    receiptPath: recorded.receiptPath,
  };
}

export function buildReleaseBundle(input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation & {
  executorReceiptPath: string;
}) {
  const paths = releaseBundleStorePaths(input.bundleDigest, input.storeRoot);
  return withReleaseBundleStateLock(paths, () => {
    const result = buildWithReceipt({ ...input, reconcile: false });
    return {
      version: 'g2' as const,
      release_bundle_build: {
        status: result.status,
        bundle_digest: result.bundleDigest,
        track: result.track,
        executor: result.executor,
        assets: result.assets,
        receipt_path: result.receiptPath,
        receipt: result.receipt,
      },
    };
  });
}

function expectedQualificationCohort(bundle: ReleaseBundle) {
  return {
    app_sha: bundle.sources.app.source_commit,
    shell_sha: bundle.sources.shell.source_commit,
    framework_sha: bundle.sources.framework.source_commit,
    framework_release_set_digest: bundle.framework_release_set.digest,
    package_payload_manifest_sha256: Object.fromEntries(
      RELEASE_BUNDLE_PACKAGE_IDS.map((packageId) => [
        packageId,
        bundle.packages[packageId].payload_manifest_sha256,
      ]),
    ),
  };
}

function assertQualificationBinding(input: {
  bundle: ReleaseBundle;
  assets: StoredReleaseBundleAsset[];
  qualification: ReleaseBundleQualificationReceipt;
}) {
  const { bundle, assets, qualification } = input;
  if (qualification.bundle_digest !== bundle.bundle_digest) {
    fail('Qualification receipt is bound to a different Release Bundle.', {
      expected_bundle_digest: bundle.bundle_digest,
      qualification_bundle_digest: qualification.bundle_digest,
    });
  }
  const subject = assets.find((asset) => asset.name === qualification.subject.asset_name);
  if (
    !subject
    || subject.size_bytes !== qualification.subject.size_bytes
    || subject.sha256 !== qualification.subject.sha256
  ) {
    fail('Qualification receipt subject does not match a staged Release Bundle asset.', {
      track: qualification.track,
      subject: qualification.subject,
    });
  }
  const expected = expectedQualificationCohort(bundle);
  if (canonicalJsonBytes(qualification.cohort).compare(canonicalJsonBytes(expected)) !== 0) {
    fail('Qualification receipt cohort does not match the immutable Release Bundle inputs.', {
      track: qualification.track,
      expected_cohort: expected,
      qualification_cohort: qualification.cohort,
    });
  }
}

function verifyReleaseBundleUnlocked(input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation & {
  qualificationReceiptPath: string;
  track?: ReleaseBundleTrackName;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const operation = requireReleaseBundleOperation(stored.paths, input.bundleDigest, input);
  const qualification = readReleaseBundleQualificationReceipt(input.qualificationReceiptPath);
  const track = input.track ?? qualification.track;
  assertReleaseBundleOperationTrack(input.releaseOperation, track);
  if (qualification.track !== track) {
    fail('Qualification receipt track does not match the requested Release Bundle track.', {
      requested_track: track,
      qualification_track: qualification.track,
    });
  }
  const staged = readStagedReleaseBundleAssets(stored.paths, track);
  if (!staged) {
    fail('Release Bundle track must be built before qualification can be verified.', {
      bundle_digest: input.bundleDigest,
      track,
    });
  }
  assertQualificationBinding({ bundle: stored.bundle, assets: staged.assets, qualification });
  const qualificationStored = installReleaseBundleQualificationReceipt(stored.paths, qualification);
  const previous = readReleaseBundleOperation(stored.paths, 'verify', track);
  const qualificationDigest = sha256(canonicalJsonBytes(qualification));
  const status = previous?.details.qualification_receipt_sha256 === qualificationDigest
    ? 'idempotent' as const
    : 'complete' as const;
  const receipt = releaseBundleOperationReceipt({
    operation: 'verify',
    status,
    bundle_digest: input.bundleDigest,
    track,
    executor: null,
    attempt_id: null,
    release_operation: input.releaseOperation,
    operation_control: operation.control,
    unknown_marker: null,
    details: {
      asset_manifest_path: staged.manifestPath,
      assets: staged.assets,
      qualification_receipt_path: qualificationStored.receiptPath,
      qualification_receipt_sha256: qualificationDigest,
      qualification_subject: qualification.subject,
      qualification_harness_sha256: qualification.qualification.harness_sha256,
      evidence_refs: qualification.qualification.evidence_refs,
      installed_artifact_same_bytes: true,
      stage_advanced: true,
    },
  });
  const recorded = recordReleaseBundleOperation(stored.paths, receipt);
  return {
    version: 'g2' as const,
    release_bundle_verify: {
      status,
      bundle_digest: input.bundleDigest,
      tracks: [{
        track,
        assets: staged.assets,
        verified: true as const,
        qualification_receipt_path: qualificationStored.receiptPath,
        qualification_receipt_sha256: qualificationDigest,
      }],
      receipt_paths: [recorded.receiptPath],
      receipts: [receipt],
    },
  };
}

export function verifyReleaseBundle(input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation & {
  qualificationReceiptPath: string;
  track?: ReleaseBundleTrackName;
}) {
  const paths = releaseBundleStorePaths(input.bundleDigest, input.storeRoot);
  return withReleaseBundleStateLock(paths, () => verifyReleaseBundleUnlocked(input));
}

export function restoreQualifiedReleaseBundleTrackFromCheckpoint(input: ReleaseBundleOperationInput & {
  qualificationReceiptPath: string;
  track: ReleaseBundleTrackName;
  operationControl: ReturnType<typeof readReleaseBundleOperationControls>['standard'];
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const qualification = readReleaseBundleQualificationReceipt(input.qualificationReceiptPath);
  if (qualification.track !== input.track) {
    fail('Checkpoint qualification receipt track does not match its declared track.', {
      checkpoint_track: input.track,
      qualification_track: qualification.track,
    });
  }
  const staged = readStagedReleaseBundleAssets(stored.paths, input.track);
  if (!staged) fail('Checkpoint qualification restore requires staged immutable assets.');
  assertQualificationBinding({ bundle: stored.bundle, assets: staged.assets, qualification });
  const qualificationStored = installReleaseBundleQualificationReceipt(stored.paths, qualification);
  const qualificationDigest = sha256(canonicalJsonBytes(qualification));
  const receipt = releaseBundleOperationReceipt({
    operation: 'verify',
    status: 'complete',
    bundle_digest: input.bundleDigest,
    track: input.track,
    executor: null,
    attempt_id: null,
    release_operation: input.operationControl?.operation_kind ?? null,
    operation_control: input.operationControl,
    unknown_marker: null,
    details: {
      asset_manifest_path: staged.manifestPath,
      assets: staged.assets,
      qualification_receipt_path: qualificationStored.receiptPath,
      qualification_receipt_sha256: qualificationDigest,
      imported_from_portable_checkpoint: true,
      rebuild_performed: false,
      stage_advanced: false,
    },
  });
  recordReleaseBundleOperation(stored.paths, receipt);
}

function assertTrackQualified(
  stored: ReturnType<typeof readStoredReleaseBundle>,
  track: ReleaseBundleTrackName,
) {
  const verification = readReleaseBundleOperation(stored.paths, 'verify', track);
  if (!verification || !['complete', 'idempotent'].includes(verification.status)) {
    fail('Release Bundle track requires a bound installed-artifact qualification before publish.', {
      bundle_digest: stored.bundle.bundle_digest,
      track,
    });
  }
}

function latestPublicationState(
  stored: ReturnType<typeof readStoredReleaseBundle>,
  track: ReleaseBundleTrackName,
) {
  const publication = readReleaseBundleOperation(stored.paths, 'publish', track);
  const reconciliation = readReleaseBundleOperation(stored.paths, 'reconcile', track);
  return reconciliation?.details.resolved_operation === 'publish'
    ? reconciliation
    : publication;
}

function trackAssetsConfirmed(receipt: ReturnType<typeof readReleaseBundleOperation>) {
  if (!receipt) return false;
  if (receipt.details.track_assets_confirmed === true) return true;
  return receipt.status === 'complete' && receipt.details.publication_scope === undefined;
}

function stableRequiredTrackNames(bundle: ReleaseBundle): ReleaseBundleTrackName[] {
  return (['standard', 'webui'] as const).filter(
    (track) => bundle.tracks[track]?.required_for_latest,
  );
}

function assertStablePromotionBarrier(
  stored: ReturnType<typeof readStoredReleaseBundle>,
  activeExternalMarker: ReleaseBundleUnknownOutcomeMarker | null,
) {
  const requiredTracks = stableRequiredTrackNames(stored.bundle);
  for (const requiredTrack of requiredTracks) {
    assertTrackQualified(stored, requiredTrack);
    const publication = latestPublicationState(stored, requiredTrack);
    const confirmedByActiveAttempt = activeExternalMarker?.publication_scope === 'external_target'
      && activeExternalMarker.track === requiredTrack;
    if (!trackAssetsConfirmed(publication) && !confirmedByActiveAttempt) {
      fail('Stable external projection requires completed track asset publication first for every immutable carrier.', {
        missing_track: requiredTrack,
        required_tracks: requiredTracks,
      });
    }
  }
}

function publishWithReceipt(input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation & {
  executorReceiptPath: string;
  reconcile: boolean;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const executorReceipt = readReleaseBundleExecutorReceipt(input.executorReceiptPath);
  assertExecutorBinding(stored.bundle, executorReceipt, 'remote_inspect');
  assertExecutorOperationBinding(executorReceipt, input);
  const operation = requireReleaseBundleOperation(stored.paths, input.bundleDigest, input, {
    allowExpired: input.reconcile,
    allowActiveUnknown: input.reconcile,
  });
  const track = executorReceipt.track;
  const staged = readStagedReleaseBundleAssets(stored.paths, track);
  if (!staged) {
    fail('Release Bundle track must be built before publish.', {
      bundle_digest: input.bundleDigest,
      track,
    });
  }
  assertTrackQualified(stored, track);
  const publicationScope = executorReceipt.publication_scope ?? 'track_assets';
  const previousPublication = latestPublicationState(stored, track);
  const previousTrackAssetsConfirmed = trackAssetsConfirmed(previousPublication);
  const marker = input.reconcile
    ? exactReconcileMarker({
        paths: stored.paths,
        executorReceipt,
        invocation: input,
        stageOperation: 'publish',
      })
    : null;
  const trackAssetsConfirmedBeforeExternalAttempt = previousTrackAssetsConfirmed
    || marker?.publication_scope === 'external_target';
  if (publicationScope === 'external_target') {
    if (stored.bundle.tracks[track]?.required_for_latest) {
      assertStablePromotionBarrier(stored, marker);
    }
    if (!trackAssetsConfirmedBeforeExternalAttempt) {
      fail('External target publication requires completed track asset publication first.', {
        track,
        remote_target: executorReceipt.remote_target,
      });
    }
    if (!input.reconcile && previousPublication?.status !== 'complete') {
      fail('A new external target mutation requires the previous publication target to be complete.', {
        track,
        remote_target: executorReceipt.remote_target,
        previous_status: previousPublication?.status ?? null,
      });
    }
  }

  if (!input.reconcile && executorReceipt.prior_attempt_id !== null) {
    fail('Ordinary publish receipts cannot act as reconcile observations.', {
      prior_attempt_id: executorReceipt.prior_attempt_id,
    });
  }

  if (executorReceipt.outcome === 'unknown') {
    const activeMarker = marker ?? unknownMarker({
      executorReceipt,
      invocation: input,
      stageOperation: 'publish',
    });
    if (!input.reconcile) recordReleaseBundleUnknownOutcome(stored.paths, activeMarker);
    const receipt = releaseBundleOperationReceipt({
      operation: input.reconcile ? 'reconcile' : 'publish',
      status: 'reconcile_only',
      bundle_digest: input.bundleDigest,
      track,
      executor: executorReceipt.executor,
      attempt_id: executorReceipt.attempt_id,
      release_operation: input.releaseOperation,
      operation_control: operation.control,
      unknown_marker: activeMarker,
      details: {
        resolved_operation: 'publish',
        publication_scope: publicationScope,
        remote_target: executorReceipt.remote_target,
        track_assets_confirmed: publicationScope === 'track_assets'
          ? false
          : trackAssetsConfirmedBeforeExternalAttempt,
        upload_actions: [],
        marker_overwritten: false,
        stage_advanced: false,
        retry_allowed: false,
        required_next_command: 'opl release reconcile',
      },
    });
    const recorded = recordReleaseBundleOperation(stored.paths, receipt);
    return { status: 'reconcile_only' as const, receipt, receiptPath: recorded.receiptPath };
  }

  if (publicationScope === 'external_target') {
    const late = input.reconcile && operation.deadlineElapsed;
    const status = late ? 'late_observation' as const : 'complete' as const;
    const receipt = releaseBundleOperationReceipt({
      operation: input.reconcile ? 'reconcile' : 'publish',
      status,
      bundle_digest: input.bundleDigest,
      track,
      executor: executorReceipt.executor,
      attempt_id: executorReceipt.attempt_id,
      release_operation: input.releaseOperation,
      operation_control: operation.control,
      unknown_marker: marker,
      details: {
        resolved_operation: 'publish',
        publication_scope: publicationScope,
        remote_target: executorReceipt.remote_target,
        upload_actions: [],
        track_assets_confirmed: trackAssetsConfirmedBeforeExternalAttempt,
        external_target_observed_complete: true,
        operation_deadline_elapsed: late,
        late_success_recorded_as_evidence_only: late,
        stage_advanced: !late,
      },
    });
    const recorded = recordReleaseBundleOperation(stored.paths, receipt);
    if (marker) clearReleaseBundleUnknownOutcomeExact(stored.paths, marker);
    if (!input.reconcile) clearReleaseBundleOperation(stored.paths, 'reconcile', track);
    return { status, receipt, receiptPath: recorded.receiptPath };
  }

  const remote = new Map(executorReceipt.assets.map((asset) => [asset.name, asset]));
  const uploadActions = staged.assets.flatMap((asset) => {
    const existing = remote.get(asset.name);
    if (!existing) {
      return [{
        action: 'upload' as const,
        name: asset.name,
        size_bytes: asset.size_bytes,
        sha256: asset.sha256,
        source_path: asset.path,
      }];
    }
    if (existing.size_bytes !== asset.size_bytes || existing.sha256 !== asset.sha256) {
      fail('Remote release contains a same-name asset with a different digest.', {
        track,
        asset_name: asset.name,
        staged_sha256: asset.sha256,
        remote_sha256: existing.sha256,
      });
    }
    return [];
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (input.reconcile && uploadActions.length > 0) {
    const receipt = releaseBundleOperationReceipt({
      operation: 'reconcile',
      status: 'reconcile_only',
      bundle_digest: input.bundleDigest,
      track,
      executor: executorReceipt.executor,
      attempt_id: executorReceipt.attempt_id,
      release_operation: input.releaseOperation,
      operation_control: operation.control,
      unknown_marker: marker,
      details: {
        resolved_operation: 'publish',
        publication_scope: publicationScope,
        remote_target: executorReceipt.remote_target,
        track_assets_confirmed: false,
        remote_asset_count: executorReceipt.assets.length,
        observed_missing_assets: uploadActions.map((entry) => entry.name),
        upload_actions: [],
        retry_allowed: false,
        marker_cleared: false,
        stage_advanced: false,
      },
    });
    const recorded = recordReleaseBundleOperation(stored.paths, receipt);
    return { status: 'reconcile_only' as const, receipt, receiptPath: recorded.receiptPath };
  }

  const late = input.reconcile && operation.deadlineElapsed;
  const status = late
    ? 'late_observation' as const
    : uploadActions.length > 0 ? 'upload_required' as const : 'complete' as const;
  const receipt = releaseBundleOperationReceipt({
    operation: input.reconcile ? 'reconcile' : 'publish',
    status,
    bundle_digest: input.bundleDigest,
    track,
    executor: executorReceipt.executor,
    attempt_id: executorReceipt.attempt_id,
    release_operation: input.releaseOperation,
    operation_control: operation.control,
    unknown_marker: marker,
    details: {
      resolved_operation: 'publish',
      publication_scope: publicationScope,
      remote_target: executorReceipt.remote_target,
      track_assets_confirmed: status === 'complete',
      remote_asset_count: executorReceipt.assets.length,
      upload_actions: uploadActions,
      same_name_same_digest_is_complete: true,
      same_name_different_digest_fails_closed: true,
      operation_deadline_elapsed: late,
      late_success_recorded_as_evidence_only: late,
      stage_advanced: !late,
    },
  });
  const recorded = recordReleaseBundleOperation(stored.paths, receipt);
  if (marker) clearReleaseBundleUnknownOutcomeExact(stored.paths, marker);
  if (!input.reconcile) clearReleaseBundleOperation(stored.paths, 'reconcile', track);
  return { status, receipt, receiptPath: recorded.receiptPath };
}

export function publishReleaseBundle(input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation & {
  executorReceiptPath: string;
}) {
  const paths = releaseBundleStorePaths(input.bundleDigest, input.storeRoot);
  return withReleaseBundleStateLock(paths, () => {
    const result = publishWithReceipt({ ...input, reconcile: false });
    return {
      version: 'g2' as const,
      release_bundle_publish: {
        status: result.status,
        bundle_digest: input.bundleDigest,
        track: result.receipt.track,
        executor: result.receipt.executor,
        receipt_path: result.receiptPath,
        receipt: result.receipt,
      },
    };
  });
}

export function reconcileReleaseBundle(input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation & {
  executorReceiptPath: string;
}) {
  const paths = releaseBundleStorePaths(input.bundleDigest, input.storeRoot);
  return withReleaseBundleStateLock(paths, () => {
    const executorReceipt = readReleaseBundleExecutorReceipt(input.executorReceiptPath);
    const result = executorReceipt.operation === 'build'
      ? buildWithReceipt({ ...input, reconcile: true })
      : publishWithReceipt({ ...input, reconcile: true });
    return {
      version: 'g2' as const,
      release_bundle_reconcile: {
        status: result.status,
        bundle_digest: input.bundleDigest,
        track: result.receipt.track,
        executor: result.receipt.executor,
        ...('assets' in result ? { assets: result.assets } : {}),
        receipt_path: result.receiptPath,
        receipt: result.receipt,
      },
    };
  });
}

function trackStatus(
  stored: ReturnType<typeof readStoredReleaseBundle>,
  track: ReleaseBundleTrackName,
  markers: ReleaseBundleUnknownOutcomeMarker[],
) {
  const staged = readStagedReleaseBundleAssets(stored.paths, track);
  const verification = readReleaseBundleOperation(stored.paths, 'verify', track);
  const publication = readReleaseBundleOperation(stored.paths, 'publish', track);
  const reconciliation = readReleaseBundleOperation(stored.paths, 'reconcile', track);
  const reconciledPublish = reconciliation?.details.resolved_operation === 'publish'
    ? reconciliation
    : null;
  return {
    built: staged !== null,
    verified: Boolean(verification && ['complete', 'idempotent'].includes(verification.status)),
    published: (reconciledPublish ?? publication)?.status === 'complete',
    reconcile_required: markers.some((marker) => marker.track === track),
    assets: staged?.assets ?? [],
  };
}

export function readReleaseBundleStatus(input: ReleaseBundleOperationInput) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const markers = listReleaseBundleUnknownOutcomes(stored.paths);
  const standard = trackStatus(stored, 'standard', markers);
  const webui = stored.bundle.tracks.webui ? trackStatus(stored, 'webui', markers) : null;
  const full = trackStatus(stored, 'full', markers);
  const controls = readReleaseBundleOperationControls(stored.paths);
  const legacyReadOnly = releaseBundleLegacyCheckpointReadOnly(stored.paths);
  return {
    version: 'g2' as const,
    release_bundle_status: {
      bundle_digest: input.bundleDigest,
      bundle_path: stored.paths.bundle,
      bundle: stored.bundle,
      operation_controls: {
        standard: controls.standard && {
          ...controls.standard,
          deadline_elapsed: releaseBundleOperationDeadlineElapsed(controls.standard, input.now),
        },
        append_full: controls.append_full && {
          ...controls.append_full,
          deadline_elapsed: releaseBundleOperationDeadlineElapsed(controls.append_full, input.now),
        },
      },
      operation_control_compatible: !legacyReadOnly,
      live_mutation_allowed: !legacyReadOnly && markers.length === 0,
      active_unknown_markers: markers,
      tracks: { standard, ...(webui ? { webui } : {}), full },
      stable_promotion_barrier: {
        required_tracks: stableRequiredTrackNames(stored.bundle),
        satisfied: stableRequiredTrackNames(stored.bundle).every((track) => {
          const status = track === 'standard' ? standard : webui;
          return Boolean(status?.verified && status.published && !status.reconcile_required);
        }),
      },
      latest_eligible: stableRequiredTrackNames(stored.bundle).every((track) => {
        const status = track === 'standard' ? standard : webui;
        return Boolean(status?.verified && status.published && !status.reconcile_required);
      }),
    },
  };
}
