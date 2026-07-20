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
  clearReleaseBundleUnknownOutcome,
  clearReleaseBundleOperation,
  installFrozenReleaseBundle,
  installReleaseBundleQualificationReceipt,
  readReleaseBundleOperation,
  readStagedReleaseBundleAssets,
  readStoredReleaseBundle,
  recordReleaseBundleOperation,
  recordReleaseBundleUnknownOutcome,
  releaseBundleHasUnknownOutcome,
  stageReleaseBundleAssets,
} from './store.ts';
import {
  RELEASE_BUNDLE_PACKAGE_IDS,
  type ReleaseBundle,
  type ReleaseBundleExecutorReceipt,
  type ReleaseBundleOperationInput,
  type ReleaseBundleOperationReceipt,
  type ReleaseBundleQualificationReceipt,
  type ReleaseBundleTrackName,
  type StoredReleaseBundleAsset,
} from './types.ts';

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    surface_kind: 'opl_release_bundle.v1',
    ...details,
  });
}

function now() {
  return new Date().toISOString();
}

function operationReceipt(input: Omit<ReleaseBundleOperationReceipt, 'surface_kind' | 'schema_ref' | 'recorded_at'>) {
  return {
    surface_kind: 'opl_release_bundle_operation_receipt.v1' as const,
    schema_ref: 'contracts/opl-framework/release-bundle-operation-receipt.schema.json' as const,
    recorded_at: now(),
    ...input,
  };
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

export function freezeReleaseBundle(input: {
  requestPath: string;
  sourceRoot?: string;
  storeRoot?: string;
}) {
  const request = readReleaseBundleFreezeRequest(input.requestPath);
  const inputs = assertReleaseBundleFreezeInputs(request, input.sourceRoot);
  const bundle = buildFrozenReleaseBundle(request);
  const installed = installFrozenReleaseBundle(bundle, input.storeRoot);
  const receipt = operationReceipt({
    operation: 'freeze',
    status: installed.status === 'idempotent' ? 'idempotent' : 'frozen',
    bundle_digest: bundle.bundle_digest,
    track: null,
    executor: null,
    attempt_id: null,
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

function buildWithReceipt(input: ReleaseBundleOperationInput & {
  executorReceiptPath: string;
  reconcile: boolean;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const executorReceipt = readReleaseBundleExecutorReceipt(input.executorReceiptPath);
  assertExecutorBinding(stored.bundle, executorReceipt, 'build');
  const unknown = releaseBundleHasUnknownOutcome(stored.paths, 'build', executorReceipt.track);
  if (unknown && !input.reconcile) {
    fail('A previous build executor result is unknown; reconcile is required before any build action.', {
      bundle_digest: input.bundleDigest,
      track: executorReceipt.track,
    });
  }

  if (executorReceipt.outcome === 'unknown') {
    recordReleaseBundleUnknownOutcome(stored.paths, 'build', executorReceipt);
    const receipt = operationReceipt({
      operation: input.reconcile ? 'reconcile' : 'build',
      status: 'reconcile_only',
      bundle_digest: input.bundleDigest,
      track: executorReceipt.track,
      executor: executorReceipt.executor,
      attempt_id: executorReceipt.attempt_id,
      details: {
        resolved_operation: 'build',
        writes_performed: false,
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

  const staged = stageReleaseBundleAssets({
    bundle: stored.bundle,
    paths: stored.paths,
    executorReceipt,
  });
  if (input.reconcile) clearReleaseBundleUnknownOutcome(stored.paths, 'build', executorReceipt.track);
  const receipt = operationReceipt({
    operation: input.reconcile ? 'reconcile' : 'build',
    status: staged.status,
    bundle_digest: input.bundleDigest,
    track: executorReceipt.track,
    executor: executorReceipt.executor,
    attempt_id: executorReceipt.attempt_id,
    details: {
      resolved_operation: 'build',
      asset_manifest_path: staged.manifestPath,
      assets: staged.assets,
    },
  });
  const recorded = recordReleaseBundleOperation(stored.paths, receipt);
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

export function buildReleaseBundle(input: ReleaseBundleOperationInput & {
  executorReceiptPath: string;
}) {
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

export function verifyReleaseBundle(input: ReleaseBundleOperationInput & {
  qualificationReceiptPath: string;
  track?: ReleaseBundleTrackName;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const qualification = readReleaseBundleQualificationReceipt(input.qualificationReceiptPath);
  const track = input.track ?? qualification.track;
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
  const receipt = operationReceipt({
    operation: 'verify',
    status,
    bundle_digest: input.bundleDigest,
    track,
    executor: null,
    attempt_id: null,
    details: {
      asset_manifest_path: staged.manifestPath,
      assets: staged.assets,
      qualification_receipt_path: qualificationStored.receiptPath,
      qualification_receipt_sha256: qualificationDigest,
      qualification_subject: qualification.subject,
      qualification_harness_sha256: qualification.qualification.harness_sha256,
      evidence_refs: qualification.qualification.evidence_refs,
      installed_artifact_same_bytes: true,
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

function publishWithReceipt(input: ReleaseBundleOperationInput & {
  executorReceiptPath: string;
  reconcile: boolean;
}) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const executorReceipt = readReleaseBundleExecutorReceipt(input.executorReceiptPath);
  assertExecutorBinding(stored.bundle, executorReceipt, 'remote_inspect');
  const track = executorReceipt.track;
  const staged = readStagedReleaseBundleAssets(stored.paths, track);
  if (!staged) {
    fail('Release Bundle track must be built before publish.', {
      bundle_digest: input.bundleDigest,
      track,
    });
  }
  assertTrackQualified(stored, track);
  const unknown = releaseBundleHasUnknownOutcome(stored.paths, 'publish', track);
  if (unknown && !input.reconcile) {
    fail('A previous publish executor result is unknown; reconcile is required before any publish action.', {
      bundle_digest: input.bundleDigest,
      track,
    });
  }

  if (executorReceipt.outcome === 'unknown') {
    recordReleaseBundleUnknownOutcome(stored.paths, 'publish', executorReceipt);
    const receipt = operationReceipt({
      operation: input.reconcile ? 'reconcile' : 'publish',
      status: 'reconcile_only',
      bundle_digest: input.bundleDigest,
      track,
      executor: executorReceipt.executor,
      attempt_id: executorReceipt.attempt_id,
      details: {
        resolved_operation: 'publish',
        upload_actions: [],
        retry_allowed: false,
        required_next_command: 'opl release reconcile',
      },
    });
    const recorded = recordReleaseBundleOperation(stored.paths, receipt);
    return { status: 'reconcile_only' as const, receipt, receiptPath: recorded.receiptPath };
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
  const status = uploadActions.length > 0 ? 'upload_required' as const : 'complete' as const;
  if (input.reconcile) {
    clearReleaseBundleUnknownOutcome(stored.paths, 'publish', track);
  }
  const receipt = operationReceipt({
    operation: input.reconcile ? 'reconcile' : 'publish',
    status,
    bundle_digest: input.bundleDigest,
    track,
    executor: executorReceipt.executor,
    attempt_id: executorReceipt.attempt_id,
    details: {
      resolved_operation: 'publish',
      remote_asset_count: executorReceipt.assets.length,
      upload_actions: uploadActions,
      same_name_same_digest_is_complete: true,
      same_name_different_digest_fails_closed: true,
    },
  });
  const recorded = recordReleaseBundleOperation(stored.paths, receipt);
  if (!input.reconcile) clearReleaseBundleOperation(stored.paths, 'reconcile', track);
  return { status, receipt, receiptPath: recorded.receiptPath };
}

export function publishReleaseBundle(input: ReleaseBundleOperationInput & {
  executorReceiptPath: string;
}) {
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
}

export function reconcileReleaseBundle(input: ReleaseBundleOperationInput & {
  executorReceiptPath: string;
}) {
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
}

function trackStatus(
  stored: ReturnType<typeof readStoredReleaseBundle>,
  track: ReleaseBundleTrackName,
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
    reconcile_required: releaseBundleHasUnknownOutcome(stored.paths, 'build', track)
      || releaseBundleHasUnknownOutcome(stored.paths, 'publish', track),
    assets: staged?.assets ?? [],
  };
}

export function readReleaseBundleStatus(input: ReleaseBundleOperationInput) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  const standard = trackStatus(stored, 'standard');
  const full = trackStatus(stored, 'full');
  return {
    version: 'g2' as const,
    release_bundle_status: {
      bundle_digest: input.bundleDigest,
      bundle_path: stored.paths.bundle,
      bundle: stored.bundle,
      tracks: { standard, full },
      latest_eligible: standard.verified && standard.published && !standard.reconcile_required,
    },
  };
}
