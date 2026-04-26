import { assert, fs, os, path, runCli, test } from '../helpers.ts';

test('runtime index reports unavailable state without creating native index files', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-index-empty-'));

  try {
    const output = runCli(['runtime', 'index'], {
      OPL_STATE_DIR: stateRoot,
    });
    const nativeIndex = output.native_index;

    assert.equal(nativeIndex.surface_kind, 'opl_native_index_summary');
    assert.equal(nativeIndex.source, 'none');
    assert.equal(nativeIndex.freshness.status, 'unavailable_no_success');
    assert.equal(nativeIndex.history.entry_count, 0);
    assert.equal(nativeIndex.failures.failure_count, 0);
    assert.deepEqual(nativeIndex.indexes, []);
    assert.equal(fs.existsSync(nativeIndex.files.index_file), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime index explains current native state index, history, and failure telemetry', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-index-current-'));
  const runtimeDir = path.join(stateRoot, 'runtime-manager');
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeDir, 'native-state-index.json'),
    `${JSON.stringify({
      surface_kind: 'opl_runtime_manager_native_state_projection',
      generated_at: generatedAt,
      lifecycle: {
        expires_at: expiresAt,
      },
      native_indexes: {
        artifact_manifest: {
          helper_id: 'opl-artifact-indexer',
          request_id: 'runtime-manager-artifact-index',
          status: 'ok',
          result: {
            surface_kind: 'native_artifact_manifest',
          },
          errors: [],
        },
      },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(runtimeDir, 'native-state-index-history.jsonl'),
    `${JSON.stringify({ generated_at: generatedAt, summary: { artifact_manifest: 'ok' } })}\n`,
  );
  fs.writeFileSync(
    path.join(runtimeDir, 'native-state-index-failures.jsonl'),
    `${JSON.stringify({ generated_at: generatedAt, status: 'skipped_helper_unavailable' })}\n`,
  );

  try {
    const output = runCli(['runtime', 'index'], {
      OPL_STATE_DIR: stateRoot,
    });
    const nativeIndex = output.native_index;

    assert.equal(nativeIndex.source, 'current_index');
    assert.equal(nativeIndex.freshness.status, 'fresh');
    assert.equal(nativeIndex.freshness.current_generated_at, generatedAt);
    assert.equal(nativeIndex.freshness.current_expires_at, expiresAt);
    assert.equal(nativeIndex.history.entry_count, 1);
    assert.equal(nativeIndex.failures.failure_count, 1);
    assert.deepEqual(nativeIndex.indexes, [
      {
        index_key: 'artifact_manifest',
        helper_id: 'opl-artifact-indexer',
        request_id: 'runtime-manager-artifact-index',
        status: 'ok',
        result_surface_kind: 'native_artifact_manifest',
        errors: [],
      },
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
