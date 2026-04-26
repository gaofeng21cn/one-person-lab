import { assert, createFakeHermesFixture, fs, os, path, runCli, test } from '../helpers.ts';

test('runtime manager reports stale and expired native index freshness from the last successful snapshot', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-stale-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-bin-'));

  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    fs.writeFileSync(
      path.join(helperBinDir, binary),
      `#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":1},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
`,
      { mode: 0o755 },
    );
  }

  try {
    const success = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    });
    const successPersistence = success.runtime_manager.state_index_target.persistence;
    assert.equal(successPersistence.status, 'written');
    assert.equal(successPersistence.freshness.status, 'fresh');
    assert.equal(success.runtime_manager.reconcile.surface_kind, 'opl_runtime_manager_reconcile');
    assert.equal(success.runtime_manager.reconcile.overall_status, 'ready');
    assert.deepEqual(success.runtime_manager.reconcile.recommended_actions, []);

    const stale = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
    });
    const staleFreshness = stale.runtime_manager.state_index_target.persistence.freshness;
    assert.equal(stale.runtime_manager.state_index_target.persistence.status, 'skipped_helper_unavailable');
    assert.equal(staleFreshness.status, 'stale_last_success_available');
    assert.equal(staleFreshness.last_success_expired, false);
    assert.equal(staleFreshness.failure_count, 1);
    assert.equal(typeof staleFreshness.last_success_generated_at, 'string');
    assert.equal(stale.runtime_manager.reconcile.overall_status, 'attention_needed');
    assert.deepEqual(
      stale.runtime_manager.reconcile.recommended_actions.map((action: { action_id: string }) => action.action_id),
      ['repair_native_helpers', 'refresh_native_indexes'],
    );

    const lastSuccess = JSON.parse(fs.readFileSync(successPersistence.last_success_file, 'utf8'));
    lastSuccess.lifecycle.expires_at = '2000-01-01T00:00:00.000Z';
    fs.writeFileSync(successPersistence.last_success_file, `${JSON.stringify(lastSuccess, null, 2)}\n`);

    const expired = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
    });
    const expiredFreshness = expired.runtime_manager.state_index_target.persistence.freshness;
    assert.equal(expiredFreshness.status, 'expired_last_success');
    assert.equal(expiredFreshness.last_success_expired, true);
    assert.equal(expiredFreshness.failure_count, 2);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});

test('runtime manager reconcile recommends Hermes setup without taking kernel ownership', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-reconcile-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: '',
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
      PATH: '',
    });
    const reconcile = output.runtime_manager.reconcile;

    assert.equal(output.runtime_manager.status, 'needs_runtime_setup');
    assert.equal(reconcile.surface_kind, 'opl_runtime_manager_reconcile');
    assert.equal(reconcile.overall_status, 'attention_needed');
    assert.equal(reconcile.checked_surfaces.hermes_runtime, 'needs_runtime_setup');
    assert.equal(reconcile.non_goals.includes('does_not_schedule_tasks'), true);
    assert.deepEqual(
      reconcile.recommended_actions.map((action: { action_id: string; blocking: boolean }) => [
        action.action_id,
        action.blocking,
      ]),
      [
        ['install_or_start_hermes', true],
        ['repair_native_helpers', false],
        ['refresh_native_indexes', false],
      ],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
