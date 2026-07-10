import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';
import {
  resolveOplDeveloperModeFrameworkCheckout,
} from '../../../../src/modules/connect/developer-mode.ts';

const developerModePermissionsFixture = JSON.stringify({
  user: { login: 'gaofeng21cn' },
  permissions: {
    'gaofeng21cn/one-person-lab': 'admin',
    'gaofeng21cn/med-autoscience': 'write',
    'gaofeng21cn/med-autogrant': 'maintain',
    'gaofeng21cn/opl-bookforge': 'write',
    'gaofeng21cn/opl-meta-agent': 'write',
    'gaofeng21cn/mas-scholar-skills': 'write',
    'gaofeng21cn/redcube-ai': 'admin',
  },
});

test('workspace root and update channel persist through system settings', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-settings-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-selected-'));

  try {
    const rootSet = runCli(['workspace', 'root', 'set', '--path', workspaceRoot], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).workspace_root;
    const rootRead = runCli(['workspace', 'root'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).workspace_root;
    const channel = runCli(['system', 'update-channel', '--channel', 'preview'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).system_action;

    assert.equal(rootSet.selected_path, workspaceRoot);
    assert.equal(rootRead.selected_path, workspaceRoot);
    assert.equal(rootRead.health_status, 'ready');
    assert.equal(channel.action, 'update_channel');
    assert.equal(channel.update_channel, 'preview');
    assert.equal(channel.status, 'completed');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('developer supervisor persists direct-route developer mode only from explicit user config', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-supervisor-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const env = {
    HOME: homeRoot,
    OPL_STATE_DIR: stateDir,
    OPL_DEVELOPER_MODE_GH_FIXTURE: developerModePermissionsFixture,
  };

  try {
    const initial = runCli(['system', 'developer-supervisor'], env).system_action;
    assert.equal(initial.status, 'ready');
    assert.equal(initial.developer_supervisor.source, 'default');
    assert.equal(fs.existsSync(path.join(stateDir, 'developer-supervisor.json')), false);

    const updated = runCli([
      'system',
      'developer-supervisor',
      '--enabled',
      'on',
      '--mode',
      'developer_apply_safe',
      '--github-login',
      'gaofeng21cn',
    ], env).system_action;

    assert.equal(initial.developer_mode.status, 'ready');
    assert.equal(initial.developer_mode.effective_state, 'active_direct');
    assert.equal(initial.developer_mode.capabilities.runtime_mutation_scope.status, 'blocked');
    assert.equal(updated.status, 'completed');
    assert.equal(updated.developer_supervisor.source, 'user_config');
    assert.equal(updated.developer_mode.allowed_route, 'direct_repo_fix');
    assert.equal(updated.developer_mode.capabilities.runtime_mutation_scope.status, 'ready');
    assert.equal(updated.developer_mode.repo_authority.repos.every((entry: { direct_write_allowed: boolean }) =>
      entry.direct_write_allowed
    ), true);

    const persisted = parseJsonText(
      fs.readFileSync(path.join(stateDir, 'developer-supervisor.json'), 'utf8'),
    ) as { enabled: string; mode: string; auto_enable_github_login: string };
    assert.equal(persisted.enabled, 'on');
    assert.equal(persisted.mode, 'developer_apply_safe');
    assert.equal(persisted.auto_enable_github_login, 'gaofeng21cn');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('developer mode framework checkout resolves explicit local route', () => {
  const checkout = resolveOplDeveloperModeFrameworkCheckout({
    enabled: 'on',
    mode: 'developer_apply_safe',
    source: 'user_config',
    auto_enable_github_login: 'gaofeng21cn',
    version: 'g1',
    updated_at: '2026-07-05T00:00:00.000Z',
  });

  assert.equal(checkout.status, 'resolved');
  assert.equal(path.basename(checkout.checkout_root ?? ''), 'one-person-lab');
  assert.equal(checkout.checkout_bin, path.join(checkout.checkout_root ?? '', 'bin', 'opl'));
});

test('developer supervisor fail-closes when github identity is unavailable', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-supervisor-gh-fail-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli([
      'system',
      'developer-supervisor',
      '--enabled',
      'on',
      '--mode',
      'developer_apply_safe',
      '--github-login',
      'gaofeng21cn',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({
        user: null,
        permissions: {},
        error: 'gh_not_authenticated',
      }),
    }).system_action;

    assert.equal(output.developer_mode.status, 'blocked');
    assert.equal(output.developer_mode.effective_state, 'blocked');
    assert.equal(output.developer_mode.allowed_route, 'blocked');
    assert.equal(output.developer_mode.github_identity.status, 'unavailable');
    assert.equal(output.developer_mode.capabilities.github_authority.status, 'blocked');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
