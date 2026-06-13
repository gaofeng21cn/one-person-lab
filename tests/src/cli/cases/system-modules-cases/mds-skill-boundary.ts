import {
  assert,
  createGitModuleRemoteFixture,
  fs,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';

test('MDS runtime dependency install preserves project-local skills without syncing system-level skill packs', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-mds-skill-boundary-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'mds-turnkey.log');
  const medDeepScientistRemote = createGitModuleRemoteFixture('med-deepscientist', {
    extraFiles: {
      '.codex/skills/scout/SKILL.md': [
        '---',
        'name: scout',
        'description: MAS/MDS project-local scout stage fixture.',
        '---',
        '',
        '# scout',
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'bootstrap\\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
      'scripts/install-codex-plugin.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'skill-sync-should-not-run\\n' >> ${JSON.stringify(turnkeyLogPath)}
exit 1
`,
      'scripts/opl-module-healthcheck.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'health\\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
    },
  });
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDDEEPSCIENTIST: medDeepScientistRemote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };

  try {
    const install = runCli(['connect', 'install', '--module', 'meddeepscientist'], env) as {
      module_action: {
        module: {
          module_id: string;
          installed: boolean;
          checkout_path: string;
        };
        turnkey: {
          bootstrap: { status: string };
          skill_sync: { status: string; domain_id: string | null; command_preview: string[] | null };
          health_check: { status: string };
        };
      };
    };

    assert.equal(install.module_action.module.module_id, 'meddeepscientist');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(install.module_action.turnkey.bootstrap.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.status, 'skipped');
    assert.equal(install.module_action.turnkey.skill_sync.domain_id, null);
    assert.equal(install.module_action.turnkey.skill_sync.command_preview, null);
    assert.equal(install.module_action.turnkey.health_check.status, 'completed');
    assert.deepEqual(fs.readFileSync(turnkeyLogPath, 'utf8').trim().split('\n'), ['bootstrap', 'health']);
    assert.equal(
      fs.existsSync(path.join(install.module_action.module.checkout_path, '.codex', 'skills', 'scout', 'SKILL.md')),
      true,
    );
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'scout', 'SKILL.md')), false);
  } finally {
    fs.rmSync(medDeepScientistRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
