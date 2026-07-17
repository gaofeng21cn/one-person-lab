import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';

test('system startup-maintenance refreshes Codex CLI before module maintenance when latest is newer', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-codex-home-'));
  const logPath = path.join(homeRoot, 'codex-update.log');
  const developerCheckout = path.join(homeRoot, 'developer-module-checkout');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.130.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const updateScript = path.join(homeRoot, 'update-codex.sh');
  fs.writeFileSync(
    updateScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf 'codex-update\\n' >> ${JSON.stringify(logPath)}`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  fs.mkdirSync(developerCheckout, { recursive: true });
  runGitFixtureCommand(developerCheckout, ['init', '--initial-branch', 'main']);
  fs.writeFileSync(path.join(developerCheckout, 'README.md'), '# Developer checkout\n', 'utf8');
  runGitFixtureCommand(developerCheckout, ['add', 'README.md']);
  runGitFixtureCommand(developerCheckout, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial developer checkout',
  ]);

  try {
    const output = runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
      OPL_CODEX_BIN: codexFixture.codexPath,
      OPL_MIN_CODEX_CLI_VERSION: '0.130.0',
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_CODEX_UPDATE_COMMAND: updateScript,
      OPL_MODULE_PATH_MEDAUTOSCIENCE: developerCheckout,
      OPL_MODULE_PATH_MEDAUTOGRANT: developerCheckout,
      OPL_MODULE_PATH_REDCUBE: developerCheckout,
      OPL_MODULE_PATH_OPLMETAAGENT: developerCheckout,
      OPL_MODULE_PATH_OPLBOOKFORGE: developerCheckout,
      OPL_MODULE_PATH_SCHOLARSKILLS: developerCheckout,
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
      system_action: {
        details: {
          engine_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
          }>;
          engine_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
        };
      };
    };

    assert.deepEqual(output.system_action.details.engine_targets.map((target) => [
      target.target_id,
      target.status,
      target.reason,
      target.action,
    ]), [
      ['codex', 'completed', 'codex_cli_latest_outdated', 'update'],
    ]);
    assert.equal(output.system_action.details.engine_summary.completed_targets_count, 1);
    assert.equal(output.system_action.details.engine_summary.manual_required_targets_count, 0);
    assert.equal(fs.readFileSync(logPath, 'utf8'), 'codex-update\n');
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
