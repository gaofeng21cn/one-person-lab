import {
  assert,
  fs,
  path,
  test,
  canonicalJsonBytes,
  parseJsonText,
  admitReleaseBundleOperation,
  exportReleaseBundleCheckpoint,
  importReleaseBundleCheckpoint,
  readReleaseBundleStatus,
  standardOperation,
  appendFullOperation,
  buildReleaseBundle,
  verifyReleaseBundle,
  publishReleaseBundle,
  reconcileReleaseBundle,
  digest,
  writeJson,
  readCheckpointFixture,
  writeQualification,
  createFixture,
  writeBuildReceipt,
  writeRemoteInspection,
  assertTypedContractFailure,
  type MutableCheckpointFixture,
} from './fixtures.ts';

test('build stages exact bytes once and rejects a second executor with different bytes', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const firstReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest });
    const built = buildReleaseBundle({ bundleDigest, executorReceiptPath: firstReceipt, storeRoot: fixture.storeRoot });
    assert.equal(built.release_bundle_build.status, 'complete');

    const replayReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'remote',
      attemptId: 'remote-replay',
    });
    const replay = buildReleaseBundle({ bundleDigest, executorReceiptPath: replayReceipt, storeRoot: fixture.storeRoot });
    assert.equal(replay.release_bundle_build.status, 'idempotent');

    const conflictReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'remote',
      attemptId: 'remote-conflict',
      assets: [{ name: 'standard.dmg', bytes: 'different' }, { name: 'latest.yml', bytes: 'updater' }],
    });
    assert.throws(
      () => buildReleaseBundle({ bundleDigest, executorReceiptPath: conflictReceipt, storeRoot: fixture.storeRoot }),
      /already contains different asset bytes/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable checkpoint binds one canonical six-asset manifest and rejects transport drift', () => {
  const standardAssets = [
    { name: 'standard.dmg', bytes: 'standard dmg' },
    { name: 'standard.zip', bytes: 'standard zip' },
    { name: 'standard.zip.blockmap', bytes: 'standard blockmap' },
    { name: 'latest.yml', bytes: 'updater' },
    { name: 'component-manifest.json', bytes: 'component manifest' },
    { name: 'authorization-policy.json', bytes: 'authorization policy' },
  ];
  const fixture = createFixture({
    standardAssetNames: standardAssets.map((asset) => asset.name),
  });
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: 'six-asset-build',
        assets: standardAssets,
      }),
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

    const checkpointDirectory = path.join(fixture.root, 'six-asset-checkpoint');
    const exported = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    const checkpointPath = path.join(checkpointDirectory, 'checkpoint.json');
    const checkpoint = readCheckpointFixture(checkpointPath);
    const manifestEntries = checkpoint.entries.filter((entry) => (
      entry.role === 'track_asset_manifest' && entry.track === 'standard'
    ));
    assert.equal(manifestEntries.length, 1);
    assert.equal(manifestEntries[0].path, 'tracks/standard/assets.json');
    assert.equal(checkpoint.tracks.standard.asset_manifest_path, manifestEntries[0].path);
    assert.equal(checkpoint.tracks.standard.asset_manifest_sha256, manifestEntries[0].sha256);
    const manifestPath = path.join(checkpointDirectory, manifestEntries[0].path);
    assert.equal(digest(fs.readFileSync(manifestPath)), manifestEntries[0].sha256);
    const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as {
      surface_kind: string;
      bundle_digest: string;
      track: string;
      assets: Array<{ name: string; size_bytes: number; sha256: string }>;
    };
    const expectedManifestAssets = standardAssets
      .map((asset) => ({
        name: asset.name,
        size_bytes: Buffer.byteLength(asset.bytes),
        sha256: digest(asset.bytes),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(manifest, {
      surface_kind: 'opl_release_bundle_staged_assets.v1',
      bundle_digest: bundleDigest,
      track: 'standard',
      assets: expectedManifestAssets,
    });
    assert.equal(manifest.assets.length, 6);
    assert.equal(manifest.assets.some((asset) => 'path' in asset), false);
    assert.deepEqual(
      manifest.assets.map((asset) => asset.name).sort(),
      [...fixture.request.tracks.standard.required_asset_names].sort(),
    );

    const importedStore = path.join(fixture.root, 'six-asset-imported-store');
    const imported = importReleaseBundleCheckpoint({ checkpointPath, storeRoot: importedStore })
      .release_bundle_checkpoint_import;
    assert.equal(imported.status, 'complete');
    const roundTripDirectory = path.join(fixture.root, 'six-asset-round-trip');
    const roundTrip = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: roundTripDirectory,
      storeRoot: importedStore,
    }).release_bundle_checkpoint_export;
    assert.equal(roundTrip.checkpoint_digest, exported.checkpoint_digest);
    assert.deepEqual(
      fs.readFileSync(path.join(roundTripDirectory, 'tracks/standard/assets.json')),
      fs.readFileSync(manifestPath),
    );

    const rewriteCheckpointCopy = (
      label: string,
      mutate: (copy: MutableCheckpointFixture, directory: string) => void,
    ) => {
      const directory = path.join(fixture.root, label);
      fs.cpSync(checkpointDirectory, directory, { recursive: true });
      const copiedCheckpointPath = path.join(directory, 'checkpoint.json');
      const copy = readCheckpointFixture(copiedCheckpointPath);
      mutate(copy, directory);
      const { checkpoint_digest: _checkpointDigest, ...core } = copy;
      copy.checkpoint_digest = digest(canonicalJsonBytes(core));
      writeJson(copiedCheckpointPath, copy);
      return copiedCheckpointPath;
    };

    const missingManifestPath = rewriteCheckpointCopy('missing-manifest-checkpoint', (copy, directory) => {
      const entry = copy.entries.find((candidate) => candidate.role === 'track_asset_manifest');
      assert.ok(entry);
      fs.rmSync(path.join(directory, entry.path));
      copy.entries = copy.entries.filter((candidate) => candidate !== entry);
      copy.tracks.standard.asset_manifest_path = null;
      copy.tracks.standard.asset_manifest_sha256 = null;
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: missingManifestPath,
        storeRoot: path.join(fixture.root, 'missing-manifest-store'),
      }),
      /requires exactly one canonical asset manifest/,
    );

    const duplicateManifestPath = rewriteCheckpointCopy('duplicate-manifest-checkpoint', (copy, directory) => {
      const entry = copy.entries.find((candidate) => candidate.role === 'track_asset_manifest');
      assert.ok(entry);
      const duplicatePath = 'tracks/standard/assets-copy.json';
      fs.copyFileSync(path.join(directory, entry.path), path.join(directory, duplicatePath));
      copy.entries.push({ ...entry, path: duplicatePath });
      copy.entries.sort((left, right) => left.path.localeCompare(right.path));
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: duplicateManifestPath,
        storeRoot: path.join(fixture.root, 'duplicate-manifest-store'),
      }),
      /requires exactly one canonical asset manifest/,
    );

    const contentDriftPath = rewriteCheckpointCopy('content-drift-checkpoint', (copy, directory) => {
      const entry = copy.entries.find((candidate) => candidate.role === 'track_asset_manifest');
      assert.ok(entry);
      const copiedManifestPath = path.join(directory, entry.path);
      const copiedManifest = parseJsonText(fs.readFileSync(copiedManifestPath, 'utf8')) as {
        assets: Array<{ sha256: string }>;
      };
      copiedManifest.assets[0].sha256 = `sha256:${'c'.repeat(64)}`;
      writeJson(copiedManifestPath, copiedManifest);
      const bytes = fs.readFileSync(copiedManifestPath);
      entry.size_bytes = bytes.length;
      entry.sha256 = digest(bytes);
      copy.tracks.standard.asset_manifest_sha256 = entry.sha256;
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: contentDriftPath,
        storeRoot: path.join(fixture.root, 'content-drift-store'),
      }),
      /differs from the exact checkpoint asset identities/,
    );

    const digestDriftPath = rewriteCheckpointCopy('digest-drift-checkpoint', (copy) => {
      copy.tracks.standard.asset_manifest_sha256 = `sha256:${'d'.repeat(64)}`;
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: digestDriftPath,
        storeRoot: path.join(fixture.root, 'digest-drift-store'),
      }),
      /asset manifest digest does not match its declared entry/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable checkpoint switches executors without rebuilding and never imports publish state', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const localBuild = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'local',
      attemptId: 'local-standard-build',
    });
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: localBuild,
      storeRoot: fixture.storeRoot,
    });
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
    const publishedReceipt = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'source-published',
      assets: [
        { name: 'standard.dmg', bytes: 'standard dmg' },
        { name: 'latest.yml', bytes: 'updater' },
      ],
    });
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: publishedReceipt,
      storeRoot: fixture.storeRoot,
    });

    const checkpointDirectory = path.join(fixture.root, 'checkpoint');
    const exported = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(exported.status, 'complete');
    assert.equal(exported.checkpoint_stage, 'standard_qualified');
    assert.match(exported.checkpoint_digest, /^sha256:[0-9a-f]{64}$/);
    const exportedAgain = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(exportedAgain.status, 'idempotent');
    assert.equal(exportedAgain.checkpoint_digest, exported.checkpoint_digest);

    const importedStore = path.join(fixture.root, 'imported-store');
    const imported = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(imported.status, 'complete');
    assert.equal(imported.rebuild_performed, false);
    assert.equal(imported.publish_state_imported, false);
    const importedAgain = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(importedAgain.status, 'idempotent');

    const status = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status;
    assert.equal(status.tracks.standard.built, true);
    assert.equal(status.tracks.standard.verified, true);
    assert.equal(status.tracks.standard.published, false);
    assert.equal(status.latest_eligible, false);

    const remoteReplay = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'remote',
      attemptId: 'remote-same-byte-resume',
    });
    const resumed = buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: remoteReplay,
      storeRoot: importedStore,
    });
    assert.equal(resumed.release_bundle_build.status, 'idempotent');

    fs.appendFileSync(path.join(checkpointDirectory, 'tracks', 'standard', 'assets', 'standard.dmg'), 'tamper');
    assert.throws(
      () => importReleaseBundleCheckpoint({
        checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
        storeRoot: path.join(fixture.root, 'tampered-store'),
      }),
      /does not match its declared identity/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable checkpoint covers every executor handoff stage', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const checkpoints: Array<{
      label: string;
      stage: 'frozen' | 'standard_built' | 'standard_qualified' | 'full_built' | 'full_qualified';
    }> = [];
    const capture = (label: string, stage: typeof checkpoints[number]['stage']) => {
      const result = exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: path.join(fixture.root, `checkpoint-${label}`),
        storeRoot: fixture.storeRoot,
      }).release_bundle_checkpoint_export;
      assert.equal(result.checkpoint_stage, stage);
      checkpoints.push({ label, stage });
    };

    capture('frozen', 'frozen');
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'local',
        attemptId: 'matrix-standard-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    capture('standard-built', 'standard_built');
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
    capture('standard-qualified', 'standard_qualified');
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
        executor: 'local',
        attemptId: 'matrix-full-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    capture('full-built', 'full_built');
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
    capture('full-qualified', 'full_qualified');

    for (const checkpoint of checkpoints) {
      const importedStore = path.join(fixture.root, `imported-${checkpoint.label}`);
      const imported = importReleaseBundleCheckpoint({
        checkpointPath: path.join(fixture.root, `checkpoint-${checkpoint.label}`, 'checkpoint.json'),
        storeRoot: importedStore,
      }).release_bundle_checkpoint_import;
      assert.equal(imported.checkpoint_stage, checkpoint.stage);
      assert.equal(imported.rebuild_performed, false);
      const status = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
        .release_bundle_status;
      assert.equal(status.tracks.standard.built, checkpoint.stage !== 'frozen');
      assert.equal(
        status.tracks.standard.verified,
        ['standard_qualified', 'full_built', 'full_qualified'].includes(checkpoint.stage),
      );
      assert.equal(
        status.tracks.full.built,
        ['full_built', 'full_qualified'].includes(checkpoint.stage),
      );
      assert.equal(status.tracks.full.verified, checkpoint.stage === 'full_qualified');
      assert.equal(status.tracks.standard.published, false);
      assert.equal(status.tracks.full.published, false);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('independent Full qualification does not require Standard qualification', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: 'independent-standard-build',
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
        attemptId: 'independent-full-build',
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

    const checkpointDirectory = path.join(fixture.root, 'independent-full-checkpoint');
    const exported = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(exported.checkpoint_stage, 'full_qualified');

    const importedStore = path.join(fixture.root, 'independent-full-imported-store');
    const imported = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(imported.checkpoint_stage, 'full_qualified');
    const status = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status;
    assert.equal(status.tracks.standard.built, true);
    assert.equal(status.tracks.standard.verified, false);
    assert.equal(status.tracks.full.built, true);
    assert.equal(status.tracks.full.verified, true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('checkpoint export is idempotent only while the complete store state is unchanged', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const checkpointDirectory = path.join(fixture.root, 'state-bound-checkpoint');
    const first = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    const unchanged = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(unchanged.status, 'idempotent');
    assert.equal(unchanged.checkpoint_digest, first.checkpoint_digest);

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
    assertTypedContractFailure(
      () => exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: checkpointDirectory,
        storeRoot: fixture.storeRoot,
      }),
      /stale for the current immutable Release Bundle state/,
    );
    const current = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: path.join(fixture.root, 'qualified-checkpoint'),
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(current.checkpoint_stage, 'standard_qualified');
    assert.notEqual(current.checkpoint_digest, first.checkpoint_digest);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('checkpoint rename race returns the exact identity retained on disk across compatible formats', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const legacyDirectory = path.join(fixture.root, 'legacy-race-source');
    const current = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: legacyDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    const legacyPath = path.join(legacyDirectory, 'checkpoint.json');
    const legacyCheckpoint = readCheckpointFixture(legacyPath);
    delete legacyCheckpoint.active_unknown_markers;
    const { checkpoint_digest: _checkpointDigest, ...legacyCore } = legacyCheckpoint;
    legacyCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(legacyCore));
    writeJson(legacyPath, legacyCheckpoint);
    assert.notEqual(legacyCheckpoint.checkpoint_digest, current.checkpoint_digest);

    const racedDirectory = path.join(fixture.root, 'mixed-format-race-target');
    const originalRenameSync = fs.renameSync;
    fs.renameSync = ((source: fs.PathLike, destination: fs.PathLike) => {
      if (path.resolve(String(destination)) === path.resolve(racedDirectory)) {
        fs.cpSync(legacyDirectory, racedDirectory, { recursive: true, errorOnExist: true });
        throw Object.assign(new Error('simulated compatible checkpoint race'), { code: 'EEXIST' });
      }
      return originalRenameSync(source, destination);
    }) as typeof fs.renameSync;
    try {
      const raced = exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: racedDirectory,
        storeRoot: fixture.storeRoot,
      }).release_bundle_checkpoint_export;
      assert.equal(raced.status, 'idempotent');
      assert.equal(raced.checkpoint_digest, legacyCheckpoint.checkpoint_digest);
      assert.equal(
        readCheckpointFixture(path.join(racedDirectory, 'checkpoint.json')).checkpoint_digest,
        raced.checkpoint_digest,
      );
    } finally {
      fs.renameSync = originalRenameSync;
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('checkpoint carries an exact unknown build marker across executors and never resurrects it', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const staleCheckpointDirectory = path.join(fixture.root, 'stale-before-unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: staleCheckpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const priorAttemptId = 'unknown-before-handoff';
    const remoteTarget = 'build:standard';
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'local',
        attemptId: priorAttemptId,
        outcome: 'unknown',
        remoteTarget,
      }),
      storeRoot: fixture.storeRoot,
    });
    assertTypedContractFailure(
      () => exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: staleCheckpointDirectory,
        storeRoot: fixture.storeRoot,
      }),
      /stale for the current immutable Release Bundle state/,
    );
    const checkpointDirectory = path.join(fixture.root, 'unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const checkpoint = readCheckpointFixture(path.join(checkpointDirectory, 'checkpoint.json'));
    assert.equal(checkpoint.active_unknown_markers?.length, 1);
    assert.equal(checkpoint.active_unknown_markers?.[0].prior_mutation_attempt_id, priorAttemptId);
    const mismatchedControlDirectory = path.join(fixture.root, 'mismatched-control-checkpoint');
    fs.cpSync(checkpointDirectory, mismatchedControlDirectory, { recursive: true });
    const mismatchedControlPath = path.join(mismatchedControlDirectory, 'checkpoint.json');
    const mismatchedControlCheckpoint = readCheckpointFixture(mismatchedControlPath);
    const { control_digest: _controlDigest, ...controlCore } =
      mismatchedControlCheckpoint.operation_controls!.standard!;
    controlCore.operation_id = 'different-operation-control';
    mismatchedControlCheckpoint.operation_controls!.standard = {
      ...controlCore,
      control_digest: digest(canonicalJsonBytes(controlCore)),
    };
    const { checkpoint_digest: _checkpointDigest, ...mismatchedCheckpointCore } =
      mismatchedControlCheckpoint;
    mismatchedControlCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(mismatchedCheckpointCore));
    writeJson(mismatchedControlPath, mismatchedControlCheckpoint);
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: mismatchedControlPath,
        storeRoot: path.join(fixture.root, 'mismatched-control-store'),
      }),
      /unknown marker does not match its immutable operation control/,
    );

    const importedStore = path.join(fixture.root, 'unknown-imported-store');
    const imported = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(imported.rebuild_performed, false);
    assert.equal(imported.unknown_outcomes_imported, true);
    assert.equal(imported.active_unknown_marker_count, 1);
    const importedStatus = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status;
    assert.equal(importedStatus.live_mutation_allowed, false);
    assert.equal(importedStatus.active_unknown_markers[0].marker_digest, checkpoint.active_unknown_markers?.[0].marker_digest);
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: importedStore,
        ...standardOperation,
        releaseOperation: 'resume_standard',
      }),
      /blocks every ordinary mutation/,
    );

    const conflictingFixture = createFixture();
    try {
      assert.equal(conflictingFixture.frozen.release_bundle_freeze.bundle_digest, bundleDigest);
      buildReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: conflictingFixture.root,
          bundleDigest,
          attemptId: 'different-unknown-before-import',
          outcome: 'unknown',
        }),
        storeRoot: conflictingFixture.storeRoot,
      });
      const conflictingMarker = readReleaseBundleStatus({
        bundleDigest,
        storeRoot: conflictingFixture.storeRoot,
      }).release_bundle_status.active_unknown_markers[0];
      assertTypedContractFailure(
        () => importReleaseBundleCheckpoint({
          checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
          storeRoot: conflictingFixture.storeRoot,
        }),
        /cannot overwrite or omit a different unknown outcome/,
      );
      assert.equal(readReleaseBundleStatus({
        bundleDigest,
        storeRoot: conflictingFixture.storeRoot,
      }).release_bundle_status.active_unknown_markers[0].marker_digest, conflictingMarker.marker_digest);
    } finally {
      fs.rmSync(conflictingFixture.root, { recursive: true, force: true });
    }

    assertTypedContractFailure(
      () => buildReleaseBundle({
        releaseOperation: 'resume_standard',
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          executor: 'remote',
          attemptId: 'ordinary-build-after-import',
          releaseOperation: 'resume_standard',
          remoteTarget,
        }),
        storeRoot: importedStore,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        releaseOperation: 'resume_standard',
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          executor: 'remote',
          attemptId: 'wrong-prior-after-import',
          releaseOperation: 'resume_standard',
          remoteTarget,
          priorAttemptId: 'not-the-prior-attempt',
        }),
        storeRoot: importedStore,
      }),
      /does not match the exact unknown outcome marker/,
    );

    const stillUnknown = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'remote',
        attemptId: 'still-unknown-after-import',
        outcome: 'unknown',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
      }),
      storeRoot: importedStore,
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers[0].marker_digest, checkpoint.active_unknown_markers[0].marker_digest);
    const stillUnknownCheckpointDirectory = path.join(fixture.root, 'still-unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: stillUnknownCheckpointDirectory,
      storeRoot: importedStore,
    });
    const stillUnknownCheckpoint = readCheckpointFixture(
      path.join(stillUnknownCheckpointDirectory, 'checkpoint.json'),
    );
    assert.equal(
      stillUnknownCheckpoint.active_unknown_markers?.[0].marker_digest,
      checkpoint.active_unknown_markers?.[0].marker_digest,
    );

    const reconciled = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'remote',
        attemptId: 'resolved-after-import',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
      }),
      storeRoot: importedStore,
    }).release_bundle_reconcile;
    assert.equal(reconciled.status, 'complete');
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 0);

    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
        storeRoot: importedStore,
      }),
      /no longer matches its checkpoint stage/,
    );
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 0);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
