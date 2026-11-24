import {
  admitReleaseBundleOperation,
  appendFullOperation,
  assert,
  assertTypedContractFailure,
  buildReleaseBundle,
  buildReleaseBundleConsumerEnvelope,
  createFixture,
  fs,
  readReleaseBundleEvents,
  test,
  writeBuildReceipt,
} from './fixtures.ts';

test('Release Bundle event cursors are deterministic, idempotent and read-only', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const first = readReleaseBundleEvents({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_events;
    const replay = readReleaseBundleEvents({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_events;

    assert.ok(first.event_count >= 2);
    assert.deepEqual(replay.events, first.events);
    assert.equal(first.replay_is_idempotent, true);
    assert.equal(first.consumer_may_dispatch, false);
    assert.equal(first.ack_boundary, first.events.at(-1)?.event_id);

    const after = readReleaseBundleEvents({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      afterEventId: first.ack_boundary!,
    }).release_bundle_events;
    assert.equal(after.event_count, 0);
    assert.equal(after.ack_boundary, first.ack_boundary);

    assertTypedContractFailure(
      () => readReleaseBundleEvents({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        afterEventId: `sha256:${'0'.repeat(64)}`,
      }),
      /cursor does not belong/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Standard and Full envelopes preserve distinct operations and cannot authorize dispatch', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const standard = buildReleaseBundleConsumerEnvelope({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      track: 'standard',
    }).release_bundle_consumer_envelope;

    assert.equal(standard.track, 'standard');
    assert.equal(standard.operation?.operation_kind, 'standard');
    assert.equal(standard.consumer_trigger_only, true);
    assert.equal(standard.consumer_may_dispatch, false);
    assert.equal(standard.source_checkpoint_run_id, null);
    assert.match(standard.envelope_digest, /^sha256:[0-9a-f]{64}$/);

    assertTypedContractFailure(
      () => buildReleaseBundleConsumerEnvelope({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        track: 'full',
      }),
      /requires the exact source checkpoint run id/,
    );

    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      ...appendFullOperation,
    });
    const full = buildReleaseBundleConsumerEnvelope({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      track: 'full',
      sourceCheckpointRunId: '30677241893',
    }).release_bundle_consumer_envelope;

    assert.equal(full.operation?.operation_kind, 'append_full');
    assert.notEqual(full.operation?.operation_id, standard.operation?.operation_id);
    assert.equal(full.source_checkpoint_run_id, '30677241893');
    assert.equal(full.consumer_may_dispatch, false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
