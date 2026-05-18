import { assert, fs, os, path, runCli, test } from '../helpers.ts';

const defaultDeveloperModePermissionsFixture = JSON.stringify({
  user: { login: 'gaofeng21cn' },
  permissions: {
    'gaofeng21cn/one-person-lab': 'admin',
    'gaofeng21cn/med-autoscience': 'write',
    'gaofeng21cn/med-autogrant': 'maintain',
    'gaofeng21cn/redcube-ai': 'admin',
  },
});

test('workspace root set persists the selected root and workspace root reads it back', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-selected-'));

  try {
    const setOutput = runCli(
      ['workspace', 'root', 'set', '--path', workspaceRoot],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(setOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(setOutput.workspace_root.health_status, 'ready');

    const readOutput = runCli(
      ['workspace', 'root'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(readOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(readOutput.workspace_root.health_status, 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system update-channel reports and persists the selected release channel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-update-channel-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const initial = runCli(
      ['system', 'update-channel'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(initial.system_action.action, 'update_channel');
    assert.equal(initial.system_action.update_channel, 'stable');
    assert.equal(initial.system_action.status, 'ready');

    const updated = runCli(
      ['system', 'update-channel', '--channel', 'preview'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(updated.system_action.action, 'update_channel');
    assert.equal(updated.system_action.update_channel, 'preview');
    assert.equal(updated.system_action.status, 'completed');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system developer-supervisor reports and persists the family developer mode config', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-supervisor-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const initial = runCli(
      ['system', 'developer-supervisor'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
      },
    ) as {
      system_action: {
        action: string;
        status: string;
        developer_supervisor: {
          enabled: string;
          mode: string;
          auto_enable_github_login: string;
          source: string;
        };
        developer_mode: {
          status: string;
          enabled: string;
          effective_state: string;
          mode: string;
          config_source: string;
          auto_enable_github_login: string;
          allowed_route: string;
          github_identity: {
            status: string;
            login: string | null;
            source: string;
          };
          repo_authority: {
            status: string;
            repos: Array<{
              target_id: string;
              repo: string;
              permission: string | null;
              direct_write_allowed: boolean;
              allowed_route: string;
            }>;
          };
        };
      };
    };
    assert.equal(initial.system_action.action, 'developer_supervisor');
    assert.equal(initial.system_action.status, 'ready');
    assert.equal(initial.system_action.developer_supervisor.enabled, 'auto');
    assert.equal(initial.system_action.developer_supervisor.mode, 'developer_apply_safe');
    assert.equal(initial.system_action.developer_supervisor.auto_enable_github_login, 'gaofeng21cn');
    assert.equal(initial.system_action.developer_supervisor.source, 'default');
    assert.equal(initial.system_action.developer_mode.enabled, 'auto');
    assert.equal(initial.system_action.developer_mode.mode, 'developer_apply_safe');
    assert.equal(initial.system_action.developer_mode.config_source, 'default');
    assert.equal(initial.system_action.developer_mode.auto_enable_github_login, 'gaofeng21cn');

    const updated = runCli(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
        '--mode',
        'developer_apply_safe',
        '--github-login',
        'gaofeng21cn',
      ],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
      },
    ) as {
      system_action: {
        action: string;
        status: string;
        developer_supervisor: {
          enabled: string;
          mode: string;
          auto_enable_github_login: string;
          source: string;
        };
        developer_mode: {
          status: string;
          effective_state: string;
          allowed_route: string;
          github_identity: {
            status: string;
            login: string | null;
          };
          repo_authority: {
            status: string;
            repos: Array<{
              target_id: string;
              repo: string;
              permission: string | null;
              direct_write_allowed: boolean;
              allowed_route: string;
            }>;
          };
        };
      };
    };
    assert.equal(updated.system_action.status, 'completed');
    assert.equal(updated.system_action.developer_supervisor.enabled, 'on');
    assert.equal(updated.system_action.developer_supervisor.mode, 'developer_apply_safe');
    assert.equal(updated.system_action.developer_supervisor.source, 'user_config');
    assert.equal(updated.system_action.developer_mode.status, 'ready');
    assert.equal(updated.system_action.developer_mode.effective_state, 'active_direct');
    assert.equal(updated.system_action.developer_mode.allowed_route, 'direct_repo_fix');
    assert.equal(updated.system_action.developer_mode.github_identity.status, 'ready');
    assert.equal(updated.system_action.developer_mode.github_identity.login, 'gaofeng21cn');
    assert.equal(updated.system_action.developer_mode.repo_authority.status, 'ready');
    assert.deepEqual(
      updated.system_action.developer_mode.repo_authority.repos.map((entry) => entry.repo).sort(),
      [
        'gaofeng21cn/med-autogrant',
        'gaofeng21cn/med-autoscience',
        'gaofeng21cn/one-person-lab',
        'gaofeng21cn/redcube-ai',
      ],
    );
    assert.equal(
      updated.system_action.developer_mode.repo_authority.repos.every((entry) => entry.direct_write_allowed),
      true,
    );
    assert.equal(
      updated.system_action.developer_mode.repo_authority.repos.every((entry) => entry.allowed_route === 'direct_repo_fix'),
      true,
    );

    const persisted = JSON.parse(
      fs.readFileSync(path.join(stateDir, 'developer-supervisor.json'), 'utf8'),
    ) as { enabled: string; mode: string; auto_enable_github_login: string };
    assert.equal(persisted.enabled, 'on');
    assert.equal(persisted.mode, 'developer_apply_safe');
    assert.equal(persisted.auto_enable_github_login, 'gaofeng21cn');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system developer-supervisor reports PR route when Developer Mode lacks direct repo authority', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-pr-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const fixture = JSON.stringify({
    user: { login: 'outside-contributor' },
    permissions: {
      'gaofeng21cn/one-person-lab': 'read',
      'gaofeng21cn/med-autoscience': 'read',
      'gaofeng21cn/med-autogrant': 'none',
      'gaofeng21cn/redcube-ai': 'read',
    },
  });

  try {
    const output = runCli(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
        '--github-login',
        'outside-contributor',
      ],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: fixture,
      },
    ) as {
      system_action: {
        developer_mode: {
          status: string;
          effective_state: string;
          allowed_route: string;
          github_identity: {
            status: string;
            login: string | null;
          };
          repo_authority: {
            status: string;
            repos: Array<{
              permission: string | null;
              direct_write_allowed: boolean;
              allowed_route: string;
            }>;
          };
        };
      };
    };

    assert.equal(output.system_action.developer_mode.status, 'limited');
    assert.equal(output.system_action.developer_mode.effective_state, 'active_pr_only');
    assert.equal(output.system_action.developer_mode.allowed_route, 'fork_pull_request');
    assert.equal(output.system_action.developer_mode.github_identity.status, 'ready');
    assert.equal(output.system_action.developer_mode.github_identity.login, 'outside-contributor');
    assert.equal(output.system_action.developer_mode.repo_authority.status, 'limited');
    assert.equal(
      output.system_action.developer_mode.repo_authority.repos.every((entry) => !entry.direct_write_allowed),
      true,
    );
    assert.equal(
      output.system_action.developer_mode.repo_authority.repos.every((entry) => entry.allowed_route === 'fork_pull_request'),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system developer-supervisor fail-closes Developer Mode when gh identity is unavailable', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-no-gh-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-empty-path-'));

  try {
    const output = runCli(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
      ],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: '',
        OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: '',
        OPL_DEVELOPER_MODE_REPO_PERMISSIONS_FIXTURE: '',
        PATH: emptyPath,
      },
    ) as {
      system_action: {
        developer_mode: {
          status: string;
          effective_state: string;
          allowed_route: string;
          github_identity: {
            status: string;
            login: string | null;
          };
          repo_authority: {
            status: string;
          };
        };
      };
    };

    assert.equal(output.system_action.developer_mode.status, 'blocked');
    assert.equal(output.system_action.developer_mode.effective_state, 'blocked');
    assert.equal(output.system_action.developer_mode.allowed_route, 'blocked');
    assert.equal(output.system_action.developer_mode.github_identity.status, 'unavailable');
    assert.equal(output.system_action.developer_mode.github_identity.login, null);
    assert.equal(output.system_action.developer_mode.repo_authority.status, 'blocked');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(emptyPath, { recursive: true, force: true });
  }
});
