import { spawnSync } from 'node:child_process';

import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, test } from '../helpers.ts';

test('module install retries transient managed git clone failures', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-retry-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const fakeBin = path.join(homeRoot, 'bin');
  const gitAttemptsPath = path.join(homeRoot, 'git-attempts.log');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'plugins/mas/.codex-plugin/plugin.json': JSON.stringify({
        name: 'mas',
        skills: './skills/',
      }, null, 2),
      'plugins/mas/skills/mas/SKILL.md': [
        '---',
        'name: mas',
        'description: Use MAS runtime through its OPL-managed product entry.',
        '---',
        '',
        '# MAS App Skill',
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
      'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"sync":"ok"}\\n\'\n',
      'scripts/opl-module-healthcheck.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
    },
  });
  fs.mkdirSync(fakeBin, { recursive: true });
  const realGit = spawnSync('command', ['-v', 'git'], {
    encoding: 'utf8',
    shell: true,
  }).stdout.trim();
  const fakeGitPath = path.join(fakeBin, 'git');
  fs.writeFileSync(
    fakeGitPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `REAL_GIT=${JSON.stringify(realGit)}`,
      `ATTEMPTS=${JSON.stringify(gitAttemptsPath)}`,
      'if [ "${1:-}" = "clone" ]; then',
      '  printf "%s\\n" "$*" >> "$ATTEMPTS"',
      '  if [ "$(wc -l < "$ATTEMPTS" | tr -d " ")" = "1" ]; then',
      '    echo "simulated transient clone failure" >&2',
      '    exit 128',
      '  fi',
      'fi',
      'exec "$REAL_GIT" "$@"',
    ].join('\n'),
    { mode: 0o755 },
  );

  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_GIT_RETRY_ATTEMPTS: '2',
    OPL_GIT_RETRY_DELAY_MS: '1',
    PATH: `${fakeBin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
  };

  try {
    const install = runCli(
      ['module', 'install', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        status: string;
        module: {
          installed: boolean;
          checkout_path: string;
        };
      };
    };

    assert.equal(install.module_action.status, 'completed');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(fs.existsSync(path.join(install.module_action.module.checkout_path, 'README.md')), true);
    assert.equal(fs.readFileSync(gitAttemptsPath, 'utf8').trim().split('\n').length, 2);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
