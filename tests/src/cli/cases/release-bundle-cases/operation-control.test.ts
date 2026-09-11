import {
  assert,
  spawnSync,
  fs,
  path,
  test,
  pathToFileURL,
  repoRoot,
  canonicalJsonBytes,
  admitReleaseBundleOperation,
  exportReleaseBundleCheckpoint,
  importReleaseBundleCheckpoint,
  readReleaseBundleStatus,
  releaseBundleStorePaths,
  withReleaseBundleStateLock,
  standardOperation,
  appendFullOperation,
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

test('Standard operation control freezes once, expired resume rotates only its execution window, and append_full is independent', () => {
  const fixture = createFixture({ admitStandard: false });
  const missingResume = createFixture({ admitStandard: false });
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const admitted = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:01:00.000Z',
      ...standardOperation,
    }).release_bundle_operation_admit;
    const admittedAgain = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:02:00.000Z',
      ...standardOperation,
    }).release_bundle_operation_admit;
    assert.equal(admitted.status, 'complete');
    assert.equal(admittedAgain.status, 'idempotent');
    assert.equal(
      admittedAgain.operation_control.control_digest,
      admitted.operation_control.control_digest,
    );

    const resumeOperation = {
      ...standardOperation,
      releaseOperation: 'resume_standard' as const,
    };
    const resumed = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:03:00.000Z',
      ...resumeOperation,
    }).release_bundle_operation_admit;
    assert.equal(resumed.status, 'idempotent');
    assert.equal(resumed.operation_control.control_digest, admitted.operation_control.control_digest);
    for (const changed of [
      { ...resumeOperation, operationId: 'operation-standard-refreshed' },
      { ...resumeOperation, operationStartedAt: '2026-07-21T00:00:01.000Z' },
      { ...resumeOperation, operationDeadlineAt: '2099-07-21T01:31:00.000Z' },
    ]) {
      assertTypedContractFailure(
        () => admitReleaseBundleOperation({
          bundleDigest,
          storeRoot: fixture.storeRoot,
          now: '2026-07-21T00:03:00.000Z',
          ...changed,
        }),
        /cannot rotate an active Standard operation window/,
      );
    }

    const expired = createFixture({ admitStandard: false });
    try {
      const expiredBundleDigest = expired.frozen.release_bundle_freeze.bundle_digest;
      const expiredStandard = {
        releaseOperation: 'standard' as const,
        operationId: 'operation-standard-expired',
        operationStartedAt: '2026-07-21T00:00:00.000Z',
        operationDeadlineAt: '2026-07-21T00:10:00.000Z',
      };
      const expiredControl = admitReleaseBundleOperation({
        bundleDigest: expiredBundleDigest,
        storeRoot: expired.storeRoot,
        now: '2026-07-21T00:01:00.000Z',
        ...expiredStandard,
      }).release_bundle_operation_admit.operation_control;
      for (const invalid of [
        {
          ...expiredStandard,
          releaseOperation: 'resume_standard' as const,
          operationId: 'operation-standard-other',
          operationStartedAt: '2026-07-21T00:11:00.000Z',
          operationDeadlineAt: '2026-07-21T00:41:00.000Z',
        },
        {
          ...expiredStandard,
          releaseOperation: 'resume_standard' as const,
          operationStartedAt: '2026-07-21T00:09:59.000Z',
          operationDeadlineAt: '2026-07-21T00:39:59.000Z',
        },
      ]) {
        assertTypedContractFailure(
          () => admitReleaseBundleOperation({
            bundleDigest: expiredBundleDigest,
            storeRoot: expired.storeRoot,
            now: '2026-07-21T00:11:00.000Z',
            ...invalid,
          }),
          invalid.operationId === expiredStandard.operationId
            ? /must start after the expired window/
            : /must preserve the exact Standard identity/,
        );
      }
      const rotated = admitReleaseBundleOperation({
        bundleDigest: expiredBundleDigest,
        storeRoot: expired.storeRoot,
        now: '2026-07-21T00:11:00.000Z',
        ...expiredStandard,
        releaseOperation: 'resume_standard',
        operationStartedAt: '2026-07-21T00:11:00.000Z',
        operationDeadlineAt: '2026-07-21T00:41:00.000Z',
      }).release_bundle_operation_admit;
      assert.equal(rotated.status, 'complete');
      assert.notEqual(rotated.operation_control.control_digest, expiredControl.control_digest);
      assert.equal(rotated.operation_control.operation_id, expiredControl.operation_id);
      assert.equal(rotated.operation_control.operation_started_at, '2026-07-21T00:11:00.000Z');
      assert.equal(rotated.operation_control.operation_deadline_at, '2026-07-21T00:41:00.000Z');
      assert.equal(rotated.receipt.details.resume_window_rotated, true);
      assert.equal(rotated.receipt.details.previous_control_digest, expiredControl.control_digest);
      const rotatedAgain = admitReleaseBundleOperation({
        bundleDigest: expiredBundleDigest,
        storeRoot: expired.storeRoot,
        now: '2026-07-21T00:12:00.000Z',
        ...expiredStandard,
        releaseOperation: 'resume_standard',
        operationStartedAt: '2026-07-21T00:11:00.000Z',
        operationDeadlineAt: '2026-07-21T00:41:00.000Z',
      }).release_bundle_operation_admit;
      assert.equal(rotatedAgain.status, 'idempotent');
      assert.equal(rotatedAgain.operation_control.control_digest, rotated.operation_control.control_digest);
    } finally {
      fs.rmSync(expired.root, { recursive: true, force: true });
    }
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest: missingResume.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: missingResume.storeRoot,
        now: '2026-07-21T00:03:00.000Z',
        ...resumeOperation,
      }),
      /requires an existing Standard operation control/,
    );

    const missingBuild = createFixture();
    try {
      const missingBundleDigest = missingBuild.frozen.release_bundle_freeze.bundle_digest;
      assertTypedContractFailure(
        () => admitReleaseBundleOperation({
          bundleDigest: missingBundleDigest,
          storeRoot: missingBuild.storeRoot,
          now: '2026-07-21T00:04:00.000Z',
          ...appendFullOperation,
        }),
        /requires a built Standard checkpoint/,
      );
    } finally {
      fs.rmSync(missingBuild.root, { recursive: true, force: true });
    }
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:04:00.000Z',
    });
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:04:30.000Z',
        ...appendFullOperation,
        operationId: standardOperation.operationId,
      }),
      /independent operation identity/,
    );
    const appendBeforeQualification = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:04:30.000Z',
      ...appendFullOperation,
    }).release_bundle_operation_admit.operation_control;
    assert.equal(appendBeforeQualification.track, 'full');
    assert.equal(appendBeforeQualification.operation_kind, 'append_full');

    const builtCheckpointDirectory = path.join(fixture.root, 'standard-built-append-control');
    const builtCheckpoint = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: builtCheckpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(builtCheckpoint.checkpoint_stage, 'standard_built');
    const importedBuilt = importReleaseBundleCheckpoint({
      checkpointPath: path.join(builtCheckpointDirectory, 'checkpoint.json'),
      storeRoot: path.join(fixture.root, 'standard-built-append-import'),
    }).release_bundle_checkpoint_import;
    assert.equal(importedBuilt.checkpoint_stage, 'standard_built');
    assert.equal(importedBuilt.live_mutation_compatible, true);
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:05:00.000Z',
    });
    const append = appendBeforeQualification;
    assert.notEqual(append.operation_id, admitted.operation_control.operation_id);
    assert.notEqual(append.operation_deadline_at, admitted.operation_control.operation_deadline_at);
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        now: '2100-07-21T03:00:00.000Z',
        ...appendFullOperation,
        releaseOperation: 'resume_standard',
        operationId: append.operation_id,
        operationStartedAt: '2100-07-21T03:00:00.000Z',
        operationDeadlineAt: '2100-07-21T03:30:00.000Z',
      }),
      /must preserve the exact Standard identity/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(missingResume.root, { recursive: true, force: true });
  }
});

test('expired Full recovery requires built bytes and a new bounded identity, then qualifies without rebuilding', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const common = { bundleDigest, storeRoot: fixture.storeRoot };
    buildReleaseBundle({ ...common, executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }) });
    const original = { ...appendFullOperation, operationDeadlineAt: '2026-07-21T04:00:00.000Z' };
    const next = { ...original, operationId: 'operation-append-full-recovery', operationStartedAt: '2026-07-21T04:01:00.000Z', operationDeadlineAt: '2026-07-21T06:01:00.000Z' };
    const oldControl = admitReleaseBundleOperation({ ...common, ...original, now: '2026-07-21T02:01:00.000Z' }).release_bundle_operation_admit.operation_control;
    assertTypedContractFailure(() => admitReleaseBundleOperation({ ...common, ...next, now: '2026-07-21T03:00:00.000Z' }), /cannot replace an active operation window/);
    assertTypedContractFailure(() => admitReleaseBundleOperation({ ...common, ...next, now: '2026-07-21T04:02:00.000Z' }), /existing built Full checkpoint/);
    buildReleaseBundle({ ...common, ...original, now: '2026-07-21T02:02:00.000Z', executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest, track: 'full' }) });
    const before = readReleaseBundleStatus(common).release_bundle_status;
    for (const invalid of [
      { ...next, operationId: original.operationId },
      { ...next, operationStartedAt: '2026-07-21T03:59:00.000Z' },
      { ...next, operationStartedAt: '2026-07-21T04:03:00.000Z' },
      { ...next, operationDeadlineAt: '2026-07-21T04:01:30.000Z' },
    ]) {
      assertTypedContractFailure(() => admitReleaseBundleOperation({ ...common, ...invalid, now: '2026-07-21T04:02:00.000Z' }), /Expired Full recovery/);
    }
    const admitted = admitReleaseBundleOperation({ ...common, ...next, now: '2026-07-21T04:02:00.000Z' }).release_bundle_operation_admit;
    assert.equal(admitted.receipt.details.previous_control_digest, oldControl.control_digest);
    assert.equal(admitted.receipt.details.previous_operation_id, original.operationId);
    assert.equal(admitted.receipt.details.expired_full_operation_replaced, true);
    assert.equal(admitReleaseBundleOperation({ ...common, ...next, now: '2026-07-21T04:03:00.000Z' }).release_bundle_operation_admit.status, 'idempotent');
    const after = readReleaseBundleStatus(common).release_bundle_status;
    assert.deepEqual(after.operation_controls.standard, before.operation_controls.standard);
    assert.equal(after.tracks.full.built, true);
    verifyReleaseBundle({ ...common, ...next, now: '2026-07-21T04:04:00.000Z', track: 'full', qualificationReceiptPath: writeQualification({ root: fixture.root, bundle: fixture.request, bundleDigest, track: 'full' }) });
    assert.equal(readReleaseBundleStatus(common).release_bundle_status.tracks.full.verified, true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('checkpoint preserves exact operation controls while legacy checkpoints remain permanently read-only', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const currentDirectory = path.join(fixture.root, 'current-control-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: currentDirectory,
      storeRoot: fixture.storeRoot,
    });
    const checkpointPath = path.join(currentDirectory, 'checkpoint.json');
    const currentCheckpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    assert.equal(
      currentCheckpoint.operation_controls.standard.control_digest,
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.operation_controls.standard?.control_digest,
    );

    const importedStore = path.join(fixture.root, 'current-imported-store');
    const imported = importReleaseBundleCheckpoint({ checkpointPath, storeRoot: importedStore })
      .release_bundle_checkpoint_import;
    assert.equal(imported.live_mutation_compatible, true);
    const resumed = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: importedStore,
      ...standardOperation,
      releaseOperation: 'resume_standard',
    }).release_bundle_operation_admit;
    assert.equal(
      resumed.operation_control.control_digest,
      currentCheckpoint.operation_controls.standard.control_digest,
    );

    const wrongSlotDirectory = path.join(fixture.root, 'wrong-slot-checkpoint');
    fs.cpSync(currentDirectory, wrongSlotDirectory, { recursive: true });
    const wrongSlotPath = path.join(wrongSlotDirectory, 'checkpoint.json');
    const wrongSlotCheckpoint = JSON.parse(fs.readFileSync(wrongSlotPath, 'utf8'));
    const { control_digest: _standardControlDigest, ...standardControlCore } =
      wrongSlotCheckpoint.operation_controls.standard;
    const appendControlCore = {
      ...standardControlCore,
      operation_id: 'forged-append-full-before-standard-qualification',
      operation_kind: 'append_full',
      track: 'full',
      operation_started_at: appendFullOperation.operationStartedAt,
      operation_deadline_at: appendFullOperation.operationDeadlineAt,
    };
    const forgedAppendControl = {
      ...appendControlCore,
      control_digest: digest(canonicalJsonBytes(appendControlCore)),
    };
    wrongSlotCheckpoint.operation_controls = {
      standard: forgedAppendControl,
      append_full: null,
    };
    const { checkpoint_digest: _wrongSlotDigest, ...wrongSlotCore } = wrongSlotCheckpoint;
    wrongSlotCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(wrongSlotCore));
    writeJson(wrongSlotPath, wrongSlotCheckpoint);
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: wrongSlotPath,
        storeRoot: path.join(fixture.root, 'wrong-slot-store'),
      }),
      /release-bundle-checkpoint|JSON schema/i,
    );

    const legacyDirectory = path.join(fixture.root, 'legacy-checkpoint');
    fs.cpSync(currentDirectory, legacyDirectory, { recursive: true });
    const legacyCheckpointPath = path.join(legacyDirectory, 'checkpoint.json');
    const legacyCheckpoint = JSON.parse(fs.readFileSync(legacyCheckpointPath, 'utf8'));
    delete legacyCheckpoint.operation_controls;
    delete legacyCheckpoint.active_unknown_markers;
    const { checkpoint_digest: _oldDigest, ...legacyCore } = legacyCheckpoint;
    legacyCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(legacyCore));
    writeJson(legacyCheckpointPath, legacyCheckpoint);

    const legacyStore = path.join(fixture.root, 'legacy-imported-store');
    const legacyImport = importReleaseBundleCheckpoint({
      checkpointPath: legacyCheckpointPath,
      storeRoot: legacyStore,
    }).release_bundle_checkpoint_import;
    assert.equal(legacyImport.live_mutation_compatible, false);
    assert.equal(
      importReleaseBundleCheckpoint({ checkpointPath: legacyCheckpointPath, storeRoot: legacyStore })
        .release_bundle_checkpoint_import.live_mutation_compatible,
      false,
    );
    assert.equal(
      importReleaseBundleCheckpoint({ checkpointPath, storeRoot: legacyStore })
        .release_bundle_checkpoint_import.live_mutation_compatible,
      false,
    );
    const legacyStatus = readReleaseBundleStatus({ bundleDigest, storeRoot: legacyStore })
      .release_bundle_status;
    assert.equal(legacyStatus.operation_control_compatible, false);
    assert.equal(legacyStatus.live_mutation_allowed, false);
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: legacyStore,
        ...standardOperation,
      }),
      /legacy checkpoint without operation control is read-only/,
    );
    assertTypedContractFailure(
      () => buildReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          attemptId: 'legacy-live-build',
        }),
        storeRoot: legacyStore,
      }),
      /legacy checkpoint without operation control is read-only/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('a portable Standard built checkpoint admits a distinct append_full operation after import', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:04:00.000Z',
    });
    const checkpointDirectory = path.join(fixture.root, 'standard-built-before-append');
    const exported = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(exported.checkpoint_stage, 'standard_built');

    const importedStore = path.join(fixture.root, 'imported-standard-built-before-append');
    const imported = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(imported.checkpoint_stage, 'standard_built');
    assert.equal(imported.live_mutation_compatible, true);
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
        .release_bundle_status.tracks.standard.built,
      true,
    );

    const append = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: importedStore,
      now: '2026-07-21T00:04:30.000Z',
      ...appendFullOperation,
    }).release_bundle_operation_admit.operation_control;
    assert.equal(append.operation_kind, 'append_full');
    assert.equal(append.track, 'full');
    assert.notEqual(append.operation_id, standardOperation.operationId);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Bundle state transitions use one cross-process lock and public mutations cannot reenter it', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const paths = releaseBundleStorePaths(bundleDigest, fixture.storeRoot);
    const storeModuleUrl = pathToFileURL(
      path.join(repoRoot, 'src/adapters/integration/release-bundle/store.ts'),
    ).href;
    const buildReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      attemptId: 'lock-exclusion-build',
    });
    withReleaseBundleStateLock(paths, () => {
      const child = spawnSync(process.execPath, [
        '--experimental-strip-types',
        '--input-type=module',
        '--eval',
        `
          import {
            releaseBundleStorePaths,
            withReleaseBundleStateLock,
          } from ${JSON.stringify(storeModuleUrl)};
          const paths = releaseBundleStorePaths(
            ${JSON.stringify(bundleDigest)},
            ${JSON.stringify(fixture.storeRoot)},
          );
          try {
            withReleaseBundleStateLock(paths, () => {}, { maxWaitMs: 0 });
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(23);
          }
        `,
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      assert.equal(child.status, 23, child.stderr);
      assert.match(child.stderr, /state transition is already locked by another process/);
      assertTypedContractFailure(
        () => buildReleaseBundle({
          bundleDigest,
          executorReceiptPath: buildReceipt,
          storeRoot: fixture.storeRoot,
        }),
        /state transition lock is not reentrant/,
      );
    });
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.tracks.standard.built,
      false,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('durable unknown marker binds exact identity, blocks the whole Bundle, and only exact reconcile clears it', () => {
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
        attemptId: 'standard-assets-complete-before-marker',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      ...appendFullOperation,
    });
    buildReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        track: 'full',
        attemptId: 'full-build-before-marker',
      }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      track: 'full',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
        track: 'full',
      }),
      storeRoot: fixture.storeRoot,
    });
    publishReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        track: 'full',
        attemptId: 'full-assets-complete-before-marker',
        assets: [
          { name: 'full.dmg', bytes: 'full dmg' },
          { name: 'full-manifest.json', bytes: '{}' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });

    const target = `github-latest:gaofeng21cn/one-person-lab@${digest('latest-target')}`;
    const priorAttempt = 'latest-patch-unknown';
    const unknown = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttempt,
        outcome: 'unknown',
        remoteTarget: target,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    }).release_bundle_publish;
    assert.equal(unknown.status, 'reconcile_only');
    const marker = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status.active_unknown_markers[0];
    assert.deepEqual({
      bundle_digest: marker.bundle_digest,
      operation_id: marker.operation_id,
      operation_kind: marker.operation_kind,
      stage_operation: marker.stage_operation,
      publication_scope: marker.publication_scope,
      track: marker.track,
      remote_target: marker.remote_target,
      prior_mutation_attempt_id: marker.prior_mutation_attempt_id,
    }, {
      bundle_digest: bundleDigest,
      operation_id: standardOperation.operationId,
      operation_kind: 'standard',
      stage_operation: 'publish',
      publication_scope: 'external_target',
      track: 'standard',
      remote_target: target,
      prior_mutation_attempt_id: priorAttempt,
    });
    const assertMarkerUnchanged = () => {
      const markers = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers;
      assert.equal(markers.length, 1);
      assert.equal(markers[0].marker_digest, marker.marker_digest);
    };

    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        ...standardOperation,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => buildReleaseBundle({
        ...appendFullOperation,
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          track: 'full',
          attemptId: 'blocked-full-build',
        }),
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => verifyReleaseBundle({
        ...appendFullOperation,
        bundleDigest,
        track: 'full',
        qualificationReceiptPath: writeQualification({
          root: fixture.root,
          bundle: fixture.request,
          bundleDigest,
          track: 'full',
        }),
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => publishReleaseBundle({
        ...appendFullOperation,
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          track: 'full',
          attemptId: 'blocked-full-publish',
          assets: [
            { name: 'full.dmg', bytes: 'full dmg' },
            { name: 'full-manifest.json', bytes: '{}' },
          ],
        }),
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    assertMarkerUnchanged();

    const mismatchCases: Array<{ label: string; action: () => unknown; message: RegExp }> = [
      {
        label: 'bundle',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest: `sha256:${'f'.repeat(64)}`,
            attemptId: 'wrong-bundle-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /different Release Bundle/,
      },
      {
        label: 'operation id',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          operationId: 'wrong-operation-id',
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-operation-observation',
            operationId: 'wrong-operation-id',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /immutable and does not match/,
      },
      {
        label: 'target',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-target-observation',
            remoteTarget: `github-latest:gaofeng21cn/other@${digest('other')}`,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /does not match the exact unknown outcome marker/,
      },
      {
        label: 'prior attempt',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-prior-observation',
            remoteTarget: target,
            priorAttemptId: 'another-attempt',
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /does not match the exact unknown outcome marker/,
      },
      {
        label: 'publication scope',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-scope-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'track_assets',
            assets: [
              { name: 'standard.dmg', bytes: 'standard dmg' },
              { name: 'latest.yml', bytes: 'updater' },
            ],
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /does not match the exact unknown outcome marker/,
      },
      {
        label: 'operation and track',
        action: () => reconcileReleaseBundle({
          ...appendFullOperation,
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            track: 'full',
            attemptId: 'wrong-track-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /requires a prior durable unknown outcome marker/,
      },
      {
        label: 'stage operation',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeBuildReceipt({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-stage-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /requires a prior durable unknown outcome marker/,
      },
    ];
    for (const mismatch of mismatchCases) {
      assertTypedContractFailure(mismatch.action, mismatch.message);
      assertMarkerUnchanged();
    }

    const stillUnknown = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'latest-readback-still-unknown',
        outcome: 'unknown',
        remoteTarget: target,
        priorAttemptId: priorAttempt,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assertMarkerUnchanged();

    const completeObservation = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'latest-readback-complete',
      remoteTarget: target,
      priorAttemptId: priorAttempt,
      publicationScope: 'external_target',
    });
    assert.equal(reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: completeObservation,
      storeRoot: fixture.storeRoot,
    }).release_bundle_reconcile.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers.length,
      0,
    );
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        bundleDigest,
        executorReceiptPath: completeObservation,
        storeRoot: fixture.storeRoot,
      }),
      /requires a prior durable unknown outcome marker/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
