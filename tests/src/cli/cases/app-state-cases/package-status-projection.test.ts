import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';

const CANONICAL_PACKAGE_IDS = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
] as const;

function assertCanonicalPackagesFailClosed(profile: 'fast' | 'full') {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-app-state-${profile}-packages-home-`));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli(['app', 'state', '--profile', profile], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as any;
    const statusIndex = output.app_state.agent_packages.status_index;

    assert.equal(statusIndex.installed_package_count, 0);
    assert.deepEqual(Object.keys(statusIndex.packages), [...CANONICAL_PACKAGE_IDS]);
    for (const packageId of CANONICAL_PACKAGE_IDS) {
      const status = statusIndex.packages[packageId];
      assert.equal(status.package_id, packageId);
      assert.equal(status.status, 'not_installed');
      assert.equal(status.operational_ready, false);
      assert.equal(status.launch_allowed, false);
      assert.equal(status.launch_blocked_reason, 'package_not_installed');
      assert.deepEqual(status.allowed_when_blocked, ['status', 'doctor', 'repair']);
      if (profile === 'fast') {
        assert.equal(status.runtime_source_readiness.live_verification_deferred, true);
        assert.equal(
          status.runtime_source_readiness.verification_mode,
          'persisted_lock_and_path_fast_projection',
        );
      }
    }
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
}

test('app state fast projects every uninstalled canonical package as fail closed', () => {
  assertCanonicalPackagesFailClosed('fast');
});

test('app state full projects every uninstalled canonical package as fail closed', () => {
  assertCanonicalPackagesFailClosed('full');
});
