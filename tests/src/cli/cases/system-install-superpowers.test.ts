import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, test } from '../helpers.ts';

function disableRemoteCompanionInstall() {
  return {
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
}

function removeTempTree(targetPath: string) {
  fs.rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
}

test('skill companion apply installs Superpowers full bundle only in managed mode', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-superpowers-home-'));
  const superpowersRemote = createGitModuleRemoteFixture('superpowers', {
    extraFiles: {
      'skills/using-superpowers/SKILL.md': '# using-superpowers\n',
      'skills/verification-before-completion/SKILL.md': '# verification-before-completion\n',
      'skills/systematic-debugging/SKILL.md': '# systematic-debugging\n',
    },
  });

  try {
    const status = runCli([
      'skill',
      'companion',
      'status',
      '--superpowers',
      'full',
    ], {
      HOME: homeRoot,
      OPL_SUPERPOWERS_REPO_URL: superpowersRemote.remoteRoot,
    }) as {
      companion_skills: {
        mode: string;
        items: Array<{ skill_id: string; status: string; action: string }>;
      };
    };
    const observed = status.companion_skills.items.find((entry) => entry.skill_id === 'superpowers');
    assert.equal(status.companion_skills.mode, 'observe');
    assert.equal(observed?.action, 'none');
    assert.equal(fs.existsSync(path.join(homeRoot, '.agents', 'skills', 'superpowers')), false);

    const output = runCli([
      'skill',
      'companion',
      'apply',
      '--mode',
      'managed',
      '--superpowers',
      'full',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_SUPERPOWERS_REPO_URL: superpowersRemote.remoteRoot,
      ...disableRemoteCompanionInstall(),
    }) as {
      companion_skills: {
        mode: string;
        superpowers_profile: string;
        items: Array<{
          skill_id: string;
          source_path: string | null;
          target_path: string;
          status: string;
          action: string;
        }>;
      };
    };

    assert.equal(output.companion_skills.mode, 'managed');
    assert.equal(output.companion_skills.superpowers_profile, 'full');
    const superpowers = output.companion_skills.items.find((entry) => entry.skill_id === 'superpowers');
    assert.equal(superpowers?.status, 'installed');
    assert.equal(superpowers?.action, 'clone_and_symlink');
    assert.equal(superpowers?.source_path, path.join(homeRoot, '.codex', 'superpowers'));
    assert.equal(superpowers?.target_path, path.join(homeRoot, '.agents', 'skills', 'superpowers'));
    assert.equal(
      fs.realpathSync(path.join(homeRoot, '.agents', 'skills', 'superpowers')),
      fs.realpathSync(path.join(homeRoot, '.codex', 'superpowers', 'skills')),
    );
    assert.equal(
      fs.existsSync(path.join(homeRoot, '.agents', 'skills', 'superpowers', 'using-superpowers', 'SKILL.md')),
      true,
    );
  } finally {
    removeTempTree(homeRoot);
    removeTempTree(superpowersRemote.fixtureRoot);
  }
});
