import { assert, createFakeHermesFixture, fs, os, path, runCli, test } from '../helpers.ts';

test('runtime manager action marks Hermes legacy provider repair as blocking online runtime repair', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-online-action-'));
  const gatewayState = path.join(fixtureRoot, 'gateway-ready');
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  touch "${gatewayState}"
  echo "gateway repair completed"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  if [ -f "${gatewayState}" ]; then
    echo "Gateway service is loaded"
  else
    echo "Gateway service is not loaded"
  fi
  exit 0
fi
if [ "$1" = "cron" ] && [ "$2" = "list" ]; then
  if [ -f "${gatewayState}" ]; then
    echo "Name: opl-family-runtime-tick"
  fi
  exit 0
fi
if [ "$1" = "webhook" ] && [ "$2" = "list" ]; then
  if [ -f "${gatewayState}" ]; then
    echo "opl-family-runtime-webhook"
  fi
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const stateRoot = path.join(fixtureRoot, 'state');

  try {
    const output = runCli(['runtime', 'manager', 'action', '--apply'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: 'hermes_legacy',
      OPL_NATIVE_HELPER_BIN_DIR: path.join(fixtureRoot, 'missing-native-bin'),
    });
    const action = output.runtime_manager_action;

    const plannedHermesRepair = action.planned_actions.find(
      (entry: { action_id: string }) => entry.action_id === 'repair_hermes_legacy_provider',
    );
    const executedHermesRepair = action.executed_actions.find(
      (entry: { action_id: string }) => entry.action_id === 'repair_hermes_legacy_provider',
    );

    assert.ok(plannedHermesRepair);
    assert.equal(plannedHermesRepair.blocking, true);
    assert.equal(plannedHermesRepair.action_lane, 'online_runtime');
    assert.equal(plannedHermesRepair.capability, 'online_family_runtime');
    assert.ok(executedHermesRepair);
    assert.equal(executedHermesRepair.status, 'completed');
    assert.equal(executedHermesRepair.blocking, true);
    assert.equal(executedHermesRepair.action_lane, 'online_runtime');
    assert.equal(executedHermesRepair.capability, 'online_family_runtime');
    assert.equal(
      action.non_blocking_actions.some((entry: { action_id: string }) => entry.action_id === 'repair_hermes_legacy_provider'),
      false,
    );
    assert.deepEqual(
      action.background_actions.map((entry: { action_id: string }) => entry.action_id),
      action.non_blocking_actions.map((entry: { action_id: string }) => entry.action_id),
    );
    assert.equal(fs.existsSync(gatewayState), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
  }
});
