import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';

test('update component filter keeps the retired agent_packages alias as a non-authoritative selector', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-agent-packages-alias-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'status', '--component', 'agent_packages'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        requested_component_id: string;
        components: Array<{ component_id: string; provider_id: string }>;
      };
    };

    assert.equal(output.managed_update.requested_component_id, 'agent_packages');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'capability_packages');
    assert.equal(output.managed_update.components[0].provider_id, 'capability_packages');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});
