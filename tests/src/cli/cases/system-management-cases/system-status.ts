import {
  assert,
  createCodexConfigFixture,
  createFakeCodexFixture,
  fs,
  os,
  path,
  runCli,
  test,
} from './shared.ts';

test('system reports current, update-available, outdated, and configless-ready Codex states', () => {
  const cases = [
    {
      label: 'current',
      installed: '0.125.0',
      latest: '0.125.0',
      config: true,
      versionStatus: 'compatible',
      latestStatus: 'current',
      updateAvailable: false,
      healthStatus: 'ready',
      issues: [],
    },
    {
      label: 'update-available',
      installed: '0.130.0',
      latest: '0.134.0',
      config: false,
      versionStatus: 'compatible',
      latestStatus: 'outdated',
      updateAvailable: true,
      healthStatus: 'ready',
      issues: [],
    },
    {
      label: 'outdated',
      installed: '0.121.0',
      latest: '0.121.0',
      config: true,
      versionStatus: 'outdated',
      latestStatus: 'current',
      updateAvailable: false,
      healthStatus: 'attention_needed',
      issues: ['codex_cli_version_outdated'],
    },
    {
      label: 'configless-ready',
      installed: '0.125.0',
      latest: '0.125.0',
      config: false,
      versionStatus: 'compatible',
      latestStatus: 'current',
      updateAvailable: false,
      healthStatus: 'ready',
      issues: [],
    },
  ] as const;

  for (const entry of cases) {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-system-${entry.label}-`));
    const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli ${entry.installed}"
  exit 0
fi
exit 1
`);
    const configFixture = entry.config ? createCodexConfigFixture() : null;

    try {
      const output = runCli(['system'], {
        HOME: homeRoot,
        CODEX_HOME: configFixture?.codexHome ?? path.join(homeRoot, 'codex-home'),
        OPL_CODEX_CLI_LATEST_VERSION: entry.latest,
        OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      }) as any;
      const codex = output.system.core_engines.codex;

      assert.equal(codex.version_status, entry.versionStatus, entry.label);
      assert.equal(codex.latest_version_status, entry.latestStatus, entry.label);
      assert.equal(codex.update_available, entry.updateAvailable, entry.label);
      assert.equal(codex.health_status, entry.healthStatus, entry.label);
      assert.deepEqual(codex.issues, [...entry.issues], entry.label);
      if (entry.label === 'configless-ready') {
        assert.equal(codex.config_path, null);
        assert.equal(codex.config_status, 'not_detected');
      }
    } finally {
      if (configFixture) {
        fs.rmSync(configFixture.codexHome, { recursive: true, force: true });
      }
      fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }
});
