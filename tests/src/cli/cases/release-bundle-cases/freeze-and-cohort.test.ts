import {
  assert,
  spawnSync,
  fs,
  os,
  path,
  test,
  repoRoot,
  runCliInCwd,
  parseJsonText,
  admitReleaseBundleOperation,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  readReleaseBundleStatus,
  standardOperation,
  buildReleaseBundle,
  verifyReleaseBundle,
  publishReleaseBundle,
  digest,
  writeJson,
  fixtureRequest,
  unifiedStableRequest,
  appStandardRequest,
  writeQualification,
  createFixture,
  createUnifiedStableFixture,
  writeBuildReceipt,
  writeRemoteInspection,
  assertTypedContractFailure,
} from './fixtures.ts';

test('freeze computes one canonical digest over sources, frozen Package payloads, Release Set and prepared AI notes', () => {
  const fixture = createFixture();
  try {
    const first = fixture.frozen.release_bundle_freeze;
    const second = freezeReleaseBundle({
      requestPath: fixture.requestPath,
      sourceRoot: fixture.sourceRoot,
      storeRoot: fixture.storeRoot,
    })
      .release_bundle_freeze;
    assert.match(first.bundle_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(second.bundle_digest, first.bundle_digest);
    assert.equal(second.status, 'idempotent');
    if (first.bundle.identity_mode === 'app_standard_compatibility') {
      assert.fail('Legacy fixture unexpectedly produced an App Standard compatibility Bundle.');
    }
    assert.equal(
      first.bundle.packages.mas.payload_manifest_sha256,
      fixture.request.packages.mas.payload_manifest_sha256,
    );
    assert.equal(
      first.bundle.framework_release_set.digest,
      fixture.request.framework_release_set.digest,
    );
    assert.equal(first.bundle.prepared_notes.source, 'prepared_ai');
    assert.equal(first.bundle.release.version, first.bundle.release.display_version);
    assert.equal(first.bundle.release.updater_version, '26.7.20');
    assert.equal(first.bundle.policy.build_once, true);
    assert.deepEqual(first.bundle.policy.allowed_executors, ['local', 'remote']);
    const status = runCliInCwd([
      'release',
      'status',
      '--bundle',
      first.bundle_digest,
      '--store',
      fixture.storeRoot,
    ], fixture.root);
    assert.equal(status.release_bundle_status.bundle_digest, first.bundle_digest);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('descriptor-added Package flows through freeze and frozen qualification after authority advances', () => {
  const fixture = createFixture({ additionalPackageIds: ['future-agent'] });
  try {
    const frozen = fixture.frozen.release_bundle_freeze;
    if (frozen.bundle.identity_mode === 'app_standard_compatibility') {
      assert.fail('Dynamic Package fixture unexpectedly produced an App Standard compatibility Bundle.');
    }
    assert.ok('future-agent' in frozen.bundle.packages);
    const frozenPackageDigests = frozen.receipt.details
      .package_payload_manifest_sha256 as Record<string, string>;
    assert.equal(
      frozenPackageDigests['future-agent'],
      frozen.bundle.packages['future-agent'].payload_manifest_sha256,
    );

    fs.writeFileSync(
      path.join(fixture.sourceRoot, fixture.request.framework_release_set.manifest_ref),
      '{"surface_kind":"later_authority_state"}\n',
      'utf8',
    );
    const built = buildReleaseBundle({
      bundleDigest: frozen.bundle_digest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest: frozen.bundle_digest,
      }),
      storeRoot: fixture.storeRoot,
    });
    assert.equal(built.release_bundle_build.status, 'complete');

    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: frozen.bundle,
      bundleDigest: frozen.bundle_digest,
    });
    const qualification = parseJsonText(
      fs.readFileSync(qualificationReceiptPath, 'utf8'),
    ) as Record<string, any>;
    assert.equal(
      qualification.cohort.package_payload_manifest_sha256['future-agent'],
      frozen.bundle.packages['future-agent'].payload_manifest_sha256,
    );
    delete qualification.cohort.package_payload_manifest_sha256['future-agent'];
    writeJson(qualificationReceiptPath, qualification);
    assertTypedContractFailure(
      () => verifyReleaseBundle({
        bundleDigest: frozen.bundle_digest,
        qualificationReceiptPath,
        storeRoot: fixture.storeRoot,
      }),
      /cohort does not match the immutable Release Bundle inputs/,
    );
    writeQualification({
      root: fixture.root,
      bundle: frozen.bundle,
      bundleDigest: frozen.bundle_digest,
    });
    const verified = verifyReleaseBundle({
      bundleDigest: frozen.bundle_digest,
      qualificationReceiptPath,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(verified.release_bundle_verify.status, 'complete');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('App Standard freeze binds source refs and Package compatibility without Release Set or Package digests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-app-standard-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const storeRoot = path.join(root, 'store');
    const request = appStandardRequest(sourceRoot);
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    const frozen = freezeReleaseBundle({ requestPath, sourceRoot, storeRoot })
      .release_bundle_freeze;
    assert.equal(frozen.bundle.identity_mode, 'app_standard_compatibility');
    assert.deepEqual(frozen.bundle.package_compatibility, {
      abi: 'opl_packages.v1',
      version_range: '>=0.1.0 <1.0.0',
    });
    assert.equal('framework_release_set' in frozen.bundle, false);
    assert.equal('packages' in frozen.bundle, false);
    assert.equal('framework_release_set_digest' in frozen.receipt.details, false);
    assert.equal('package_payload_manifest_sha256' in frozen.receipt.details, false);
    assert.equal('release_set_path' in frozen.receipt.details, false);
    assert.equal('owner_cohort_lock_path' in frozen.receipt.details, false);
    assert.deepEqual(
      frozen.bundle.frozen_build_inputs?.map((input) => input.id),
      [
        'app_source',
        'base_image',
        'codex_cli',
        'dockerfile',
        'framework_seed',
        'qualification_harness',
        'shell_webui_source',
      ],
    );

    admitReleaseBundleOperation({
      bundleDigest: frozen.bundle_digest,
      storeRoot,
      ...standardOperation,
    });
    buildReleaseBundle({
      bundleDigest: frozen.bundle_digest,
      executorReceiptPath: writeBuildReceipt({
        root,
        bundleDigest: frozen.bundle_digest,
      }),
      storeRoot,
    });
    const qualificationReceiptPath = writeQualification({
      root,
      bundle: request,
      bundleDigest: frozen.bundle_digest,
    });
    const verified = verifyReleaseBundle({
      bundleDigest: frozen.bundle_digest,
      qualificationReceiptPath,
      storeRoot,
    });
    assert.equal(verified.release_bundle_verify.status, 'complete');
    const qualification = parseJsonText(
      fs.readFileSync(qualificationReceiptPath, 'utf8'),
    ) as Record<string, any>;
    assert.equal(qualification.cohort.identity_mode, 'app_standard_compatibility');
    assert.deepEqual(qualification.cohort.package_compatibility, request.package_compatibility);
    assert.equal('framework_release_set_digest' in qualification.cohort, false);
    assert.equal('package_payload_manifest_sha256' in qualification.cohort, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('App Standard freeze rejects legacy Package authority fields, Package digest inputs, and invalid ranges', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-app-standard-invalid-'));
  try {
    const sourceRoot = path.join(root, 'source');
    for (const [name, mutate] of [
      ['legacy-authority', (request: Record<string, any>) => {
        request.framework_release_set = { generation: '26.7.23', manifest_ref: 'release.json', digest: digest('legacy') };
      }],
      ['package-digest-input', (request: Record<string, any>) => {
        request.frozen_build_inputs.splice(4, 0, {
          id: 'first_party_packages',
          ref: 'release-set-generation:26.7.23',
          digest: digest('packages'),
          size_bytes: 105,
        });
      }],
      ['invalid-range', (request: Record<string, any>) => {
        request.package_compatibility.version_range = '>=1.0.0 <0.1.0';
      }],
    ] as const) {
      const request = structuredClone(appStandardRequest(sourceRoot)) as Record<string, any>;
      mutate(request);
      const requestPath = path.join(root, `${name}.json`);
      writeJson(requestPath, request);
      assertTypedContractFailure(
        () => freezeReleaseBundle({
          requestPath,
          sourceRoot,
          storeRoot: path.join(root, `${name}-store`),
        }),
        name === 'invalid-range'
          ? /compatibility range must have an increasing upper bound/
          : /JSON Schema validation/,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('freeze rejects a compatibility version alias that differs from display_version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-display-alias-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const request = fixtureRequest(sourceRoot);
    request.release.version = '26.7.20-r1';
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    assert.throws(
      () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
      /version compatibility alias must equal display_version/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('freeze keeps publication quality separate from GitHub prerelease visibility', () => {
  for (const [channel, prerelease] of [
    ['stable', false],
    ['preview', false],
    ['nightly', true],
  ] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-release-bundle-${channel}-visibility-`));
    try {
      const sourceRoot = path.join(root, 'source');
      const request = fixtureRequest(sourceRoot);
      request.release.channel = channel;
      request.release.prerelease = prerelease;
      const requestPath = path.join(root, 'freeze.json');
      writeJson(requestPath, request);
      const frozen = freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') });
      assert.equal(frozen.release_bundle_freeze.bundle.release.channel, channel);
      assert.equal(frozen.release_bundle_freeze.bundle.release.prerelease, prerelease);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('freeze rejects channel visibility mismatches', () => {
  for (const [channel, prerelease] of [
    ['stable', true],
    ['preview', true],
    ['nightly', false],
  ] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-release-bundle-${channel}-visibility-mismatch-`));
    try {
      const sourceRoot = path.join(root, 'source');
      const request = fixtureRequest(sourceRoot);
      request.release.channel = channel;
      request.release.prerelease = prerelease;
      const requestPath = path.join(root, 'freeze.json');
      writeJson(requestPath, request);
      assert.throws(
        () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
        /prerelease state must match the selected channel visibility/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('freeze rejects an invalid updater machine identity before computing a Bundle digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-updater-version-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const request = fixtureRequest(sourceRoot);
    request.release.updater_version = 'not-semver';
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    assert.throws(
      () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
      /Payload failed JSON Schema validation/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bin/opl routes release freeze through the Framework public CLI', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-public-entry-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const storeRoot = path.join(root, 'store');
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, fixtureRequest(sourceRoot));
    const result = spawnSync(path.join(repoRoot, 'bin', 'opl'), [
      'release',
      'freeze',
      '--request',
      requestPath,
      '--source-root',
      sourceRoot,
      '--store',
      storeRoot,
      '--json',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_SKIP_SKILL_SYNC: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.release_bundle_freeze.bundle_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(output.release_bundle_freeze.status, 'frozen');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('freeze fails before build when a Package payload or Release Set input drifts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-drift-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const request = fixtureRequest(sourceRoot);
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    fs.appendFileSync(
      path.join(sourceRoot, request.packages.mas.payload_manifest_ref),
      ' ',
      'utf8',
    );
    assert.throws(
      () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
      /payload manifest mas digest does not match its frozen identity/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified Stable freeze binds one cutoff and later authority advancement cannot refresh the cohort', () => {
  const fixture = createUnifiedStableFixture();
  try {
    const first = fixture.frozen.release_bundle_freeze;
    assert.deepEqual(first.bundle.source_cutoff, fixture.request.source_cutoff);
    assert.deepEqual(first.bundle.frozen_build_inputs, fixture.request.frozen_build_inputs);
    assert.deepEqual(first.receipt.details.source_cutoff, fixture.request.source_cutoff);
    assert.deepEqual(first.receipt.details.frozen_build_inputs, fixture.request.frozen_build_inputs);
    assert.equal(first.receipt.details.source_cutoff_frozen_once, true);
    assert.equal(first.receipt.details.frozen_build_inputs_frozen_once, true);
    assert.equal(first.bundle.policy.post_freeze_remote_refresh_allowed, false);
    assert.equal(first.bundle.policy.later_authority_advancement_invalidates_bundle, false);
    assert.equal(first.bundle.policy.all_other_live_currentness_drift_invalidates_bundle, false);
    assert.deepEqual(first.bundle.policy.cohort_invalidation_causes, [
      'frozen_byte_or_digest_drift',
      'artifact_build_or_integrity_failure',
      'explicit_security_revocation_bound_to_frozen_ref_or_digest',
    ]);
    assert.deepEqual(first.bundle.source_cutoff.frozen_base_release_set, {
      generation: '26.7.20',
      digest: `sha256:${'e'.repeat(64)}`,
    });
    assert.deepEqual(first.bundle.policy.latest_required_tracks, ['standard', 'webui']);

    const changedInputRequest = unifiedStableRequest(fixture.sourceRoot);
    changedInputRequest.frozen_build_inputs[2].digest = digest('later-codex-cli-tarball');
    const changedInputRequestPath = path.join(fixture.root, 'changed-input-freeze.json');
    writeJson(changedInputRequestPath, changedInputRequest);
    const changedInput = freezeReleaseBundle({
      requestPath: changedInputRequestPath,
      sourceRoot: fixture.sourceRoot,
      storeRoot: fixture.storeRoot,
    }).release_bundle_freeze;
    assert.notEqual(changedInput.bundle_digest, first.bundle_digest);

    const laterRequest = unifiedStableRequest(fixture.sourceRoot);
    laterRequest.source_cutoff.frozen_base_release_set = {
      generation: '26.7.21',
      digest: `sha256:${'f'.repeat(64)}`,
    };
    const laterRequestPath = path.join(fixture.root, 'later-freeze.json');
    writeJson(laterRequestPath, laterRequest);
    const later = freezeReleaseBundle({
      requestPath: laterRequestPath,
      sourceRoot: fixture.sourceRoot,
      storeRoot: fixture.storeRoot,
    }).release_bundle_freeze;
    assert.notEqual(later.bundle_digest, first.bundle_digest);

    // The source projection may advance after freeze; all later stages consume stored exact bytes.
    fs.writeFileSync(
      path.join(fixture.sourceRoot, fixture.request.framework_release_set.manifest_ref),
      '{"surface_kind":"later_authority_state"}\n',
      'utf8',
    );
    const webuiBuild = buildReleaseBundle({
      bundleDigest: first.bundle_digest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest: first.bundle_digest,
        track: 'webui',
        attemptId: 'cutoff-webui-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    assert.equal(webuiBuild.release_bundle_build.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest: first.bundle_digest, storeRoot: fixture.storeRoot })
        .release_bundle_status.bundle.source_cutoff?.observed_at,
      '2026-07-21T00:00:00.000Z',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('unified Stable requires cutoff, WebUI track, and frozen build inputs together', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unified-stable-pair-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const missingCutoff = unifiedStableRequest(sourceRoot);
    delete (missingCutoff as { source_cutoff?: typeof missingCutoff.source_cutoff }).source_cutoff;
    const missingCutoffPath = path.join(root, 'missing-cutoff.json');
    writeJson(missingCutoffPath, missingCutoff);
    assertTypedContractFailure(
      () => freezeReleaseBundle({
        requestPath: missingCutoffPath,
        sourceRoot,
        storeRoot: path.join(root, 'missing-cutoff-store'),
      }),
      /JSON Schema validation/,
    );

    const missingWebui = fixtureRequest(sourceRoot) as ReturnType<typeof fixtureRequest> & {
      source_cutoff: ReturnType<typeof unifiedStableRequest>['source_cutoff'];
    };
    missingWebui.source_cutoff = unifiedStableRequest(sourceRoot).source_cutoff;
    const missingWebuiPath = path.join(root, 'missing-webui.json');
    writeJson(missingWebuiPath, missingWebui);
    assertTypedContractFailure(
      () => freezeReleaseBundle({
        requestPath: missingWebuiPath,
        sourceRoot,
        storeRoot: path.join(root, 'missing-webui-store'),
      }),
      /JSON Schema validation/,
    );

    const missingFrozenBase = unifiedStableRequest(sourceRoot) as Record<string, any>;
    delete missingFrozenBase.source_cutoff.frozen_base_release_set;
    const missingFrozenBasePath = path.join(root, 'missing-frozen-base.json');
    writeJson(missingFrozenBasePath, missingFrozenBase);
    assertTypedContractFailure(
      () => freezeReleaseBundle({
        requestPath: missingFrozenBasePath,
        sourceRoot,
        storeRoot: path.join(root, 'missing-frozen-base-store'),
      }),
      /JSON Schema validation/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified Stable rejects missing, duplicate, unknown, noncanonical, or malformed frozen build inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unified-stable-build-inputs-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const cases: Array<{
      name: string;
      mutate: (request: Record<string, any>) => void;
      message: RegExp;
    }> = [
      {
        name: 'missing',
        mutate: (request) => delete request.frozen_build_inputs,
        message: /JSON Schema validation/,
      },
      {
        name: 'duplicate-id',
        mutate: (request) => { request.frozen_build_inputs[1].id = 'app_source'; },
        message: /JSON Schema validation/,
      },
      {
        name: 'unknown-id',
        mutate: (request) => { request.frozen_build_inputs[1].id = 'future_live_input'; },
        message: /JSON Schema validation/,
      },
      {
        name: 'noncanonical-order',
        mutate: (request) => {
          [request.frozen_build_inputs[0], request.frozen_build_inputs[1]] =
            [request.frozen_build_inputs[1], request.frozen_build_inputs[0]];
        },
        message: /JSON Schema validation/,
      },
      {
        name: 'invalid-digest',
        mutate: (request) => { request.frozen_build_inputs[0].digest = 'sha256:invalid'; },
        message: /JSON Schema validation/,
      },
      {
        name: 'zero-size',
        mutate: (request) => { request.frozen_build_inputs[0].size_bytes = 0; },
        message: /JSON Schema validation/,
      },
      {
        name: 'blank-ref',
        mutate: (request) => { request.frozen_build_inputs[0].ref = ' '; },
        message: /ref must be non-empty and canonical/,
      },
    ];
    for (const contractCase of cases) {
      const request = structuredClone(unifiedStableRequest(sourceRoot)) as Record<string, any>;
      contractCase.mutate(request);
      const requestPath = path.join(root, `${contractCase.name}.json`);
      writeJson(requestPath, request);
      assertTypedContractFailure(
        () => freezeReleaseBundle({
          requestPath,
          sourceRoot,
          storeRoot: path.join(root, `${contractCase.name}-store`),
        }),
        contractCase.message,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('post-freeze frozen build input digest or size drift fails before any stage runs', () => {
  const fixture = createUnifiedStableFixture();
  try {
    const first = fixture.frozen.release_bundle_freeze;
    const frozenBytes = fs.readFileSync(first.bundle_path, 'utf8');
    for (const field of ['digest', 'size_bytes'] as const) {
      const storedBundle = parseJsonText(frozenBytes) as Record<string, any>;
      storedBundle.frozen_build_inputs[0][field] = field === 'digest'
        ? digest('substituted-app-source')
        : storedBundle.frozen_build_inputs[0].size_bytes + 1;
      writeJson(first.bundle_path, storedBundle);
      assertTypedContractFailure(
        () => readReleaseBundleStatus({ bundleDigest: first.bundle_digest, storeRoot: fixture.storeRoot }),
        /canonical digest does not match its immutable core/,
      );
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Desktop and WebUI qualify in either order and share one Stable promotion barrier', () => {
  const fixture = createUnifiedStableFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        track: 'webui',
        attemptId: 'webui-first-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'webui',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
        track: 'webui',
      }),
      storeRoot: fixture.storeRoot,
    });
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: 'desktop-second-build',
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

    const qualifiedCheckpoint = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: path.join(fixture.root, 'stable-qualified-checkpoint'),
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(qualifiedCheckpoint.checkpoint_stage, 'stable_qualified');

    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'desktop-carrier-published',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    let status = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status;
    assert.equal(status.latest_eligible, false);
    assert.deepEqual(status.stable_promotion_barrier.required_tracks, ['standard', 'webui']);
    assert.equal(status.stable_promotion_barrier.satisfied, false);
    assertTypedContractFailure(
      () => publishReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: 'premature-unified-promotion',
          remoteTarget: 'framework-release-set:latest-stable',
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }),
      /every immutable carrier/,
    );

    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        track: 'webui',
        attemptId: 'webui-carrier-published',
        assets: [{ name: 'webui-carrier-manifest.json', bytes: '{"digest":"sha256:webui"}' }],
      }),
      storeRoot: fixture.storeRoot,
    });
    status = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status;
    assert.equal(status.latest_eligible, true);
    assert.equal(status.stable_promotion_barrier.satisfied, true);

    const promoted = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'unified-stable-promotion',
        remoteTarget: 'framework-release-set:latest-stable',
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    });
    assert.equal(promoted.release_bundle_publish.status, 'complete');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
