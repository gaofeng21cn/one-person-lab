import {
  assert,
  fs,
  test,
  admitReleaseBundleOperation,
  readReleaseBundleStatus,
  buildReleaseBundle,
  verifyReleaseBundle,
  publishReleaseBundle,
  reconcileReleaseBundle,
  digest,
  writeQualification,
  createFixture,
  writeBuildReceipt,
  writeRemoteInspection,
  assertTypedContractFailure,
} from './fixtures.ts';

test('resume_standard reconciles a Standard unknown before rotating the expired execution window', () => {
  const fixture = createFixture({ admitStandard: false });
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const expiringStandard = {
      releaseOperation: 'standard' as const,
      operationId: 'operation-standard-expiring',
      operationStartedAt: '2026-07-21T00:00:00.000Z',
      operationDeadlineAt: '2026-07-21T00:10:00.000Z',
    };
    admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:01:00.000Z',
      ...expiringStandard,
    });
    const target = 'executor:local-standard-expiring';
    const priorAttempt = 'standard-build-unknown-before-run-ended';
    assert.equal(buildReleaseBundle({
      ...expiringStandard,
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttempt,
        outcome: 'unknown',
        operationId: expiringStandard.operationId,
        remoteTarget: target,
      }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:05:00.000Z',
    }).release_bundle_build.status, 'reconcile_only');
    const markerBefore = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status.active_unknown_markers[0];
    assert.equal(markerBefore.operation_kind, 'standard');

    const resume = {
      ...expiringStandard,
      releaseOperation: 'resume_standard' as const,
    };
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        ...resume,
        operationDeadlineAt: '2026-07-21T00:20:00.000Z',
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          attemptId: 'refreshed-deadline-observation',
          releaseOperation: 'resume_standard',
          operationId: expiringStandard.operationId,
          remoteTarget: target,
          priorAttemptId: priorAttempt,
        }),
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:11:00.000Z',
      }),
      /immutable and does not match/,
    );
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        ...resume,
        operationStartedAt: '2026-07-21T00:11:00.000Z',
        operationDeadlineAt: '2026-07-21T00:41:00.000Z',
        bundleDigest,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:11:00.000Z',
      }),
      /active Release Bundle unknown outcome blocks every ordinary mutation/,
    );
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers[0].marker_digest,
      markerBefore.marker_digest,
    );

    const stillUnknown = reconcileReleaseBundle({
      ...resume,
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: 'resume-readback-still-unknown',
        outcome: 'unknown',
        releaseOperation: 'resume_standard',
        operationId: expiringStandard.operationId,
        remoteTarget: target,
        priorAttemptId: priorAttempt,
      }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:11:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers[0].marker_digest,
      markerBefore.marker_digest,
    );

    const completeObservation = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      attemptId: 'resume-readback-late-success',
      releaseOperation: 'resume_standard',
      operationId: expiringStandard.operationId,
      remoteTarget: target,
      priorAttemptId: priorAttempt,
    });
    const late = reconcileReleaseBundle({
      ...resume,
      bundleDigest,
      executorReceiptPath: completeObservation,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:11:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(late.status, 'late_observation');
    assert.equal(late.receipt.release_operation, 'resume_standard');
    assert.equal(late.receipt.operation_control?.operation_deadline_at, expiringStandard.operationDeadlineAt);
    assert.equal(late.receipt.details.stage_advanced, false);
    const status = readReleaseBundleStatus({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:11:00.000Z',
    }).release_bundle_status;
    assert.equal(status.operation_controls.standard?.operation_deadline_at, expiringStandard.operationDeadlineAt);
    assert.equal(status.operation_controls.standard?.deadline_elapsed, true);
    assert.equal(status.active_unknown_markers.length, 0);
    assert.equal(status.tracks.standard.built, false);
    assert.equal(status.latest_eligible, false);
    const rotated = admitReleaseBundleOperation({
      ...resume,
      operationStartedAt: '2026-07-21T00:11:00.000Z',
      operationDeadlineAt: '2026-07-21T00:41:00.000Z',
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:11:00.000Z',
    }).release_bundle_operation_admit;
    assert.equal(rotated.status, 'complete');
    assert.equal(rotated.receipt.details.resume_window_rotated, true);
    assert.equal(rotated.operation_control.operation_id, expiringStandard.operationId);
    assert.equal(rotated.operation_control.operation_deadline_at, '2026-07-21T00:41:00.000Z');
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        ...resume,
        operationStartedAt: '2026-07-21T00:11:00.000Z',
        operationDeadlineAt: '2026-07-21T00:41:00.000Z',
        bundleDigest,
        executorReceiptPath: completeObservation,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:12:00.000Z',
      }),
      /requires a prior durable unknown outcome marker/,
    );
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        ...resume,
        bundleDigest,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:12:00.000Z',
      }),
      /cannot rotate an active Standard operation window/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('elapsed absolute deadline blocks admit, build, verify, and publish while status stays readable', () => {
  const fixtures = Array.from({ length: 4 }, () => createFixture({ admitStandard: false }));
  const expiringStandard = {
    releaseOperation: 'standard' as const,
    operationId: 'operation-deadline-gate',
    operationStartedAt: '2026-07-21T00:00:00.000Z',
    operationDeadlineAt: '2026-07-21T00:10:00.000Z',
  };
  const before = '2026-07-21T00:05:00.000Z';
  const after = '2026-07-21T00:11:00.000Z';
  try {
    const [admitFixture, buildFixture, verifyFixture, publishFixture] = fixtures;
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        ...expiringStandard,
        bundleDigest: admitFixture.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: admitFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );
    assert.equal(
      readReleaseBundleStatus({
        bundleDigest: admitFixture.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: admitFixture.storeRoot,
        now: after,
      }).release_bundle_status.operation_controls.standard,
      null,
    );

    for (const fixture of [buildFixture, verifyFixture, publishFixture]) {
      admitReleaseBundleOperation({
        ...expiringStandard,
        bundleDigest: fixture.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: fixture.storeRoot,
        now: before,
      });
    }
    const buildDigest = buildFixture.frozen.release_bundle_freeze.bundle_digest;
    assertTypedContractFailure(
      () => buildReleaseBundle({
        ...expiringStandard,
        bundleDigest: buildDigest,
        executorReceiptPath: writeBuildReceipt({
          root: buildFixture.root,
          bundleDigest: buildDigest,
          operationId: expiringStandard.operationId,
          attemptId: 'expired-build',
        }),
        storeRoot: buildFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );
    assert.equal(readReleaseBundleStatus({
      bundleDigest: buildDigest,
      storeRoot: buildFixture.storeRoot,
      now: after,
    }).release_bundle_status.operation_controls.standard?.deadline_elapsed, true);

    const verifyDigest = verifyFixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      ...expiringStandard,
      bundleDigest: verifyDigest,
      executorReceiptPath: writeBuildReceipt({
        root: verifyFixture.root,
        bundleDigest: verifyDigest,
        operationId: expiringStandard.operationId,
        attemptId: 'before-deadline-build-for-verify',
      }),
      storeRoot: verifyFixture.storeRoot,
      now: before,
    });
    assertTypedContractFailure(
      () => verifyReleaseBundle({
        ...expiringStandard,
        bundleDigest: verifyDigest,
        track: 'standard',
        qualificationReceiptPath: writeQualification({
          root: verifyFixture.root,
          bundle: verifyFixture.request,
          bundleDigest: verifyDigest,
        }),
        storeRoot: verifyFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );

    const publishDigest = publishFixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      ...expiringStandard,
      bundleDigest: publishDigest,
      executorReceiptPath: writeBuildReceipt({
        root: publishFixture.root,
        bundleDigest: publishDigest,
        operationId: expiringStandard.operationId,
        attemptId: 'before-deadline-build-for-publish',
      }),
      storeRoot: publishFixture.storeRoot,
      now: before,
    });
    verifyReleaseBundle({
      ...expiringStandard,
      bundleDigest: publishDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: publishFixture.root,
        bundle: publishFixture.request,
        bundleDigest: publishDigest,
      }),
      storeRoot: publishFixture.storeRoot,
      now: before,
    });
    assertTypedContractFailure(
      () => publishReleaseBundle({
        ...expiringStandard,
        bundleDigest: publishDigest,
        executorReceiptPath: writeRemoteInspection({
          root: publishFixture.root,
          bundleDigest: publishDigest,
          operationId: expiringStandard.operationId,
          attemptId: 'expired-publish',
          assets: [
            { name: 'standard.dmg', bytes: 'standard dmg' },
            { name: 'latest.yml', bytes: 'updater' },
          ],
        }),
        storeRoot: publishFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );
  } finally {
    for (const fixture of fixtures) fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Stable publishes immutable track assets and projects Latest before post-publication installed-artifact verification', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    const published = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'track-assets-before-verification',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    assert.equal(published.release_bundle_publish.status, 'complete');
    let status = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status;
    assert.equal(status.tracks.standard.verified, false);
    assert.equal(status.tracks.standard.published, true);
    assert.equal(status.stable_promotion_barrier.satisfied, true);
    assert.equal(status.latest_eligible, true);

    const latest = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'latest-before-verification',
        remoteTarget: 'github-latest:gaofeng21cn/one-person-lab@post-publication',
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    });
    assert.equal(latest.release_bundle_publish.status, 'complete');

    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    status = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status;
    assert.equal(status.tracks.standard.verified, true);
    assert.equal(status.latest_eligible, true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest PATCH and Homebrew use the same external-target unknown/reconcile ABI without asset retry', () => {
  const fixture = createFixture();
  const premature = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'asset-publication-complete',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });

    for (const external of [
      {
        label: 'latest',
        target: `github-latest:gaofeng21cn/one-person-lab@${digest('v26.7.21-r1')}`,
      },
      {
        label: 'homebrew',
        target: `homebrew:gaofeng21cn/homebrew-tap/one-person-lab@${digest('cask-commit')}`,
      },
    ]) {
      const priorAttempt = `${external.label}-mutation-unknown`;
      assert.equal(publishReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: priorAttempt,
          outcome: 'unknown',
          remoteTarget: external.target,
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }).release_bundle_publish.status, 'reconcile_only');
      const marker = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers[0];
      assert.equal(marker.remote_target, external.target);
      assert.equal(marker.prior_mutation_attempt_id, priorAttempt);
      assert.equal(marker.publication_scope, 'external_target');
      assertTypedContractFailure(
        () => publishReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: `${external.label}-forbidden-retry`,
            remoteTarget: external.target,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        /blocks every ordinary mutation/,
      );
      const unknownReadback = reconcileReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: `${external.label}-readback-unknown`,
          outcome: 'unknown',
          remoteTarget: external.target,
          priorAttemptId: priorAttempt,
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }).release_bundle_reconcile;
      assert.equal(unknownReadback.status, 'reconcile_only');
      assert.deepEqual(unknownReadback.receipt.details.upload_actions, []);
      assert.equal(
        readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
          .release_bundle_status.active_unknown_markers[0].marker_digest,
        marker.marker_digest,
      );
      const completeReadback = reconcileReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: `${external.label}-readback-complete`,
          remoteTarget: external.target,
          priorAttemptId: priorAttempt,
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }).release_bundle_reconcile;
      assert.equal(completeReadback.status, 'complete');
      assert.deepEqual(completeReadback.receipt.details.upload_actions, []);
      assert.equal(completeReadback.receipt.details.track_assets_confirmed, true);
      assert.equal(
        readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
          .release_bundle_status.active_unknown_markers.length,
        0,
      );
    }
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      true,
    );

    const prematureDigest = premature.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest: prematureDigest,
      executorReceiptPath: writeBuildReceipt({ root: premature.root, bundleDigest: prematureDigest }),
      storeRoot: premature.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest: prematureDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: premature.root,
        bundle: premature.request,
        bundleDigest: prematureDigest,
      }),
      storeRoot: premature.storeRoot,
    });
    assertTypedContractFailure(
      () => publishReleaseBundle({
        bundleDigest: prematureDigest,
        executorReceiptPath: writeRemoteInspection({
          root: premature.root,
          bundleDigest: prematureDigest,
          attemptId: 'premature-latest-unknown',
          outcome: 'unknown',
          remoteTarget: 'github-latest:gaofeng21cn/one-person-lab@premature',
          publicationScope: 'external_target',
        }),
        storeRoot: premature.storeRoot,
      }),
      /requires completed track asset publication first/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(premature.root, { recursive: true, force: true });
  }
});
