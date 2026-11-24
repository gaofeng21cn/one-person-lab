import {
  assert,
  fs,
  path,
  test,
  runCliFailureInCwd,
  runCliInCwd,
  admitReleaseBundleOperation,
  buildReleaseBundleAuthority,
  exportReleaseBundleCheckpoint,
  importReleaseBundleCheckpoint,
  readReleaseBundleStatus,
  standardOperation,
  buildReleaseBundle,
  verifyReleaseBundle,
  publishReleaseBundle,
  reconcileReleaseBundle,
  digest,
  writeJson,
  writeQualification,
  createFixture,
  writeBuildReceipt,
  writeRemoteInspection,
  assertTypedContractFailure,
} from './fixtures.ts';

test('portable external-target unknown marker preserves the track-assets prerequisite for exact reconcile', () => {
  const fixture = createFixture();
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
        attemptId: 'assets-before-external-target',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    const remoteTarget = `homebrew:gaofeng21cn/homebrew-one-person-lab@${digest('cask')}`;
    const priorAttemptId = 'homebrew-push-unknown';
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttemptId,
        outcome: 'unknown',
        remoteTarget,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    });
    const checkpointDirectory = path.join(fixture.root, 'external-target-unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const importedStore = path.join(fixture.root, 'external-target-unknown-store');
    importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    });

    const conflictingFixture = createFixture();
    try {
      buildReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: conflictingFixture.root,
          bundleDigest,
          attemptId: 'conflicting-build-before-import',
          assets: [
            { name: 'standard.dmg', bytes: 'different standard dmg' },
            { name: 'latest.yml', bytes: 'different updater' },
          ],
        }),
        storeRoot: conflictingFixture.storeRoot,
      });
      assertTypedContractFailure(
        () => importReleaseBundleCheckpoint({
          checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
          storeRoot: conflictingFixture.storeRoot,
        }),
        /already contains different asset bytes/,
      );
      assert.equal(
        readReleaseBundleStatus({ bundleDigest, storeRoot: conflictingFixture.storeRoot })
          .release_bundle_status.active_unknown_markers[0].prior_mutation_attempt_id,
        priorAttemptId,
      );
    } finally {
      fs.rmSync(conflictingFixture.root, { recursive: true, force: true });
    }

    const reconciled = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'homebrew-readback-after-import',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
    }).release_bundle_reconcile;
    assert.equal(reconciled.status, 'complete');
    const status = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status;
    assert.equal(status.active_unknown_markers.length, 0);
    assert.equal(status.tracks.standard.published, true);

    const repeated = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(repeated.status, 'idempotent');
    assert.equal(repeated.active_unknown_marker_count, 0);
    assert.equal(repeated.reconcile_required, false);
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 0);

    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'different-external-target-unknown',
        outcome: 'unknown',
        remoteTarget: `github-latest:gaofeng21cn/one-person-lab@${fixture.request.release.tag}`,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
    });
    const differentMarker = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers[0];
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
        storeRoot: importedStore,
      }),
      /cannot overwrite or omit a different unknown outcome/,
    );
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers[0].marker_digest, differentMarker.marker_digest);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable external-target reconciliation inherits the expired deadline and never advances', () => {
  const fixture = createFixture();
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
        attemptId: 'deadline-assets-before-external-target',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    const remoteTarget = `homebrew:gaofeng21cn/homebrew-one-person-lab@${digest('late-cask')}`;
    const priorAttemptId = 'late-homebrew-push-unknown';
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttemptId,
        outcome: 'unknown',
        remoteTarget,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    });
    const checkpointDirectory = path.join(fixture.root, 'expired-external-target-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const importedStore = path.join(fixture.root, 'expired-external-target-store');
    importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    });

    const stillUnknown = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'late-homebrew-still-unknown',
        outcome: 'unknown',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
      now: '2100-07-21T00:00:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 1);

    const resolved = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'late-homebrew-readback',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
      now: '2100-07-21T00:00:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(resolved.status, 'late_observation');
    assert.deepEqual(resolved.receipt.details.upload_actions, []);
    assert.equal(resolved.receipt.details.stage_advanced, false);
    assert.equal(resolved.receipt.details.late_success_recorded_as_evidence_only, true);
    const status = readReleaseBundleStatus({
      bundleDigest,
      storeRoot: importedStore,
      now: '2100-07-21T00:00:00.000Z',
    }).release_bundle_status;
    assert.equal(status.operation_controls.standard?.operation_deadline_at, standardOperation.operationDeadlineAt);
    assert.equal(status.operation_controls.standard?.deadline_elapsed, true);
    assert.equal(status.active_unknown_markers.length, 0);
    assert.equal(status.tracks.standard.published, false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('public CLI exports and imports a frozen portable checkpoint', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const checkpointDirectory = path.join(fixture.root, 'cli-checkpoint');
    const exported = runCliInCwd([
      'release',
      'checkpoint',
      'export',
      '--bundle',
      bundleDigest,
      '--output',
      checkpointDirectory,
      '--store',
      fixture.storeRoot,
    ], fixture.root);
    assert.equal(exported.release_bundle_checkpoint_export.checkpoint_stage, 'frozen');
    const imported = runCliInCwd([
      'release',
      'checkpoint',
      'import',
      '--checkpoint',
      path.join(checkpointDirectory, 'checkpoint.json'),
      '--store',
      path.join(fixture.root, 'cli-imported-store'),
    ], fixture.root);
    assert.equal(imported.release_bundle_checkpoint_import.rebuild_performed, false);
    assert.equal(imported.release_bundle_checkpoint_import.checkpoint_stage, 'frozen');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('unknown build outcome blocks rebuild and can only be completed through reconcile', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const unknownReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      outcome: 'unknown',
      attemptId: 'unknown-build',
    });
    const unknown = buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: unknownReceipt,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(unknown.release_bundle_build.status, 'reconcile_only');

    const resolvedReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest, attemptId: 'resolved-build' });
    assert.throws(
      () => buildReleaseBundle({ bundleDigest, executorReceiptPath: resolvedReceipt, storeRoot: fixture.storeRoot }),
      /blocks every ordinary mutation/,
    );
    const resolvedObservation = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      attemptId: 'resolved-build-observation',
      remoteTarget: 'executor:local-standard',
      priorAttemptId: 'unknown-build',
    });
    const reconciled = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: resolvedObservation,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(reconciled.release_bundle_reconcile.status, 'complete');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('verify binds staged assets and Standard alone becomes latest-eligible while Full remains additive', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const standardReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest });
    buildReleaseBundle({ bundleDigest, executorReceiptPath: standardReceipt, storeRoot: fixture.storeRoot });
    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: fixture.request,
      bundleDigest,
    });
    const verified = verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(verified.release_bundle_verify.status, 'complete');
    const qualification = verified.release_bundle_verify.tracks[0];
    assert.equal(
      digest(fs.readFileSync(qualification.qualification_receipt_path)),
      qualification.qualification_receipt_sha256,
    );
    const beforePublish = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot });
    assert.equal(beforePublish.release_bundle_status.latest_eligible, false);
    assert.equal(beforePublish.release_bundle_status.tracks.standard.verified, true);
    assert.equal(beforePublish.release_bundle_status.tracks.full.built, false);
    assert.equal(beforePublish.release_bundle_status.bundle.policy.full_updates_updater_metadata, false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('publish is idempotent by remote name and digest and unknown results force reconcile', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const buildReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest });
    buildReleaseBundle({ bundleDigest, executorReceiptPath: buildReceipt, storeRoot: fixture.storeRoot });
    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: fixture.request,
      bundleDigest,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath,
      storeRoot: fixture.storeRoot,
    });

    const missing = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-missing',
      assets: [],
    });
    const upload = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: missing,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(upload.release_bundle_publish.status, 'upload_required');
    const uploadActions = upload.release_bundle_publish.receipt.details.upload_actions as Array<{
      name: string;
    }>;
    assert.deepEqual(
      uploadActions.map((entry) => entry.name),
      ['latest.yml', 'standard.dmg'],
    );

    const complete = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-complete',
      assets: [{ name: 'standard.dmg', bytes: 'standard dmg' }, { name: 'latest.yml', bytes: 'updater' }],
    });
    const published = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: complete,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(published.release_bundle_publish.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      true,
    );

    const conflict = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-conflict',
      assets: [{ name: 'standard.dmg', bytes: 'wrong' }, { name: 'latest.yml', bytes: 'updater' }],
    });
    assert.throws(
      () => publishReleaseBundle({ bundleDigest, executorReceiptPath: conflict, storeRoot: fixture.storeRoot }),
      /same-name asset with a different digest/,
    );

    const unknown = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-unknown',
      outcome: 'unknown',
    });
    const unknownResult = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: unknown,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(unknownResult.release_bundle_publish.status, 'reconcile_only');
    assert.throws(
      () => publishReleaseBundle({ bundleDigest, executorReceiptPath: complete, storeRoot: fixture.storeRoot }),
      /blocks every ordinary mutation/,
    );
    const reconcileMissing = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'reconcile-missing',
      assets: [],
      remoteTarget: 'github-release:fixture/standard',
      priorAttemptId: 'remote-unknown',
    });
    const reconciled = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: reconcileMissing,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(reconciled.release_bundle_reconcile.status, 'reconcile_only');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      false,
    );
    assert.throws(
      () => publishReleaseBundle({
        bundleDigest,
        executorReceiptPath: complete,
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    const completeObservation = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'reconcile-complete',
      remoteTarget: 'github-release:fixture/standard',
      priorAttemptId: 'remote-unknown',
      assets: [
        { name: 'standard.dmg', bytes: 'standard dmg' },
        { name: 'latest.yml', bytes: 'updater' },
      ],
    });
    const afterReconcile = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: completeObservation,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(afterReconcile.release_bundle_reconcile.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      true,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('verify rejects a qualification receipt bound to a different App source', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: fixture.request,
      bundleDigest,
    });
    const qualification = JSON.parse(fs.readFileSync(qualificationReceiptPath, 'utf8'));
    qualification.cohort.app_sha = 'f'.repeat(40);
    writeJson(qualificationReceiptPath, qualification);
    assert.throws(
      () => verifyReleaseBundle({
        bundleDigest,
        track: 'standard',
        qualificationReceiptPath,
        storeRoot: fixture.storeRoot,
      }),
      /cohort does not match the immutable Release Bundle inputs/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('release mutation CLI and direct callers reject missing operation identity with typed failures', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const executorReceiptPath = writeBuildReceipt({ root: fixture.root, bundleDigest });
    for (const [command, requiredReceipt] of [
      ['operation admit', []],
      ['build', ['--executor-receipt', executorReceiptPath]],
      ['verify', ['--qualification-receipt', path.join(fixture.root, 'qualification.json')]],
      ['publish', ['--executor-receipt', path.join(fixture.root, 'remote.json')]],
      ['reconcile', ['--executor-receipt', path.join(fixture.root, 'reconcile.json')]],
    ] as const) {
      const failure = runCliFailureInCwd([
        'release',
        ...command.split(' '),
        '--bundle',
        bundleDigest,
        ...requiredReceipt,
        '--store',
        fixture.storeRoot,
        '--json',
      ], fixture.root);
      assert.equal(failure.status, 2, command);
      assert.equal(failure.payload.error.code, 'cli_usage_error', command);
      assert.match(failure.payload.error.message, /requires --operation/, command);
    }

    assertTypedContractFailure(
      () => buildReleaseBundleAuthority({
        bundleDigest,
        executorReceiptPath,
        storeRoot: fixture.storeRoot,
      } as Parameters<typeof buildReleaseBundleAuthority>[0]),
      /operation identity does not match/,
    );
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        releaseOperation: 'standard',
        operationId: standardOperation.operationId,
        operationStartedAt: standardOperation.operationStartedAt,
        storeRoot: fixture.storeRoot,
      } as Parameters<typeof admitReleaseBundleOperation>[0]),
      /operation_deadline_at must be a non-empty string/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
