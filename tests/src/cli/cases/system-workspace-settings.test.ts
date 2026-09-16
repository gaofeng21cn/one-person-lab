import { assert, fs, os, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';
import {
  buildOplDeveloperModeProjection,
  resolveOplDeveloperModeFrameworkCheckout,
} from '../../../../src/adapters/integration/developer-mode.ts';
import { listDefaultOplDomainModuleSpecs } from '../../../../src/adapters/integration/system-installation/modules.ts';

const developerModePermissionsFixture = JSON.stringify({
  user: { login: 'gaofeng21cn' },
  // Developer Mode authority covers the framework repo plus every default
  // module repo, so the fixture follows the module registry instead of a
  // frozen list of five Agents.
  permissions: Object.fromEntries([
    ['gaofeng21cn/one-person-lab', 'admin'],
    ...listDefaultOplDomainModuleSpecs().map((spec) => [
      `gaofeng21cn/${spec.repo_name}`,
      'write',
    ]),
  ]),
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
      '--module',
      'medautoscience',
      '--module-source',
      'developer',
    ], env).system_action;

    assert.equal(initial.developer_mode.status, 'ready');
    assert.equal(initial.developer_mode.enabled, 'auto');
    assert.equal(initial.developer_mode.mode, 'developer_apply_safe');
    assert.equal(initial.developer_mode.effective_state, 'active_direct');
    assert.equal(initial.developer_mode.inactive_reason, null);
    assert.equal(initial.developer_mode.capabilities.source_channel.status, 'ready');
    assert.equal(initial.developer_mode.capabilities.github_authority.status, 'ready');
    assert.equal(initial.developer_mode.capabilities.agent_automation.status, 'ready');
    assert.equal(initial.developer_mode.capabilities.agent_automation.level, 'repo_repair_automation');
    assert.equal(initial.developer_mode.capabilities.runtime_mutation_scope.status, 'blocked');
    assert.deepEqual(initial.developer_mode.repository_maintenance_protection, {
      status: 'ready',
      dirty_worktree: {
        policy: 'block_in_place_mutation',
        requires_isolated_worktree: true,
        preserves_existing_changes: true,
      },
      branch: {
        policy: 'topic_branch_required',
        protected_branches: ['main', 'master'],
        direct_push_to_protected_branch: false,
      },
    });
    assert.equal(updated.status, 'completed');
    assert.equal(updated.developer_supervisor.source, 'user_config');
    assert.equal(updated.developer_mode.allowed_route, 'direct_repo_fix');
    assert.equal(updated.developer_mode.capabilities.runtime_mutation_scope.status, 'ready');
    assert.equal(updated.developer_mode.repo_authority.repos.every((entry: { direct_write_allowed: boolean }) =>
      entry.direct_write_allowed
    ), true);

    const persisted = parseJsonText(
      fs.readFileSync(path.join(stateDir, 'developer-supervisor.json'), 'utf8'),
    ) as {
      enabled: string;
      mode: string;
      auto_enable_github_login: string;
      module_source_preferences: Record<string, string>;
    };
    assert.equal(persisted.enabled, 'on');
    assert.equal(persisted.mode, 'developer_apply_safe');
    assert.equal(persisted.auto_enable_github_login, 'gaofeng21cn');
    assert.equal(persisted.module_source_preferences.medautoscience, 'developer');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('manual developer mode routes a repository viewer without push permission through fork PRs', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-viewer-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const fakeGh = path.join(homeRoot, 'gh');
  const callLog = path.join(homeRoot, 'gh-calls.jsonl');
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify(args) + '\\n');
const endpoint = args[0] === 'api' ? args[1] : null;
if (endpoint === 'user') {
  process.stdout.write(JSON.stringify({ login: 'ordinary-contributor' }));
  process.exit(0);
}
if (endpoint && endpoint.startsWith('repos/') && !endpoint.includes('/collaborators/')) {
  process.stdout.write(JSON.stringify({
    permissions: { admin: false, maintain: false, pull: true, push: false, triage: false },
  }));
  process.exit(0);
}
if (endpoint && endpoint.includes('/collaborators/')) {
  process.stderr.write('Must have push access to view collaborator permission. (HTTP 403)');
  process.exit(1);
}
process.exit(2);
`, { mode: 0o755 });

  try {
    const result = runCli([
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
      OPL_DEVELOPER_MODE_GH_BINARY: fakeGh,
    }).system_action.developer_mode;

    assert.equal(result.status, 'limited');
    assert.equal(result.effective_state, 'active_pr_only');
    assert.equal(result.allowed_route, 'fork_pull_request');
    assert.equal(result.repo_authority.direct_write_repo_count, 0);
    assert.equal(result.repo_authority.pr_route_repo_count, result.repo_authority.required_repo_count);
    assert.equal(result.repo_authority.blocked_repo_count, 0);
    assert.equal(result.repo_authority.repos.every((entry: {
      permission: string;
      allowed_route: string;
    }) => entry.permission === 'read' && entry.allowed_route === 'fork_pull_request'), true);

    const calls = fs.readFileSync(callLog, 'utf8');
    assert.match(calls, /"api","repos\//);
    assert.doesNotMatch(calls, /collaborators/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('automatic developer mode reports authority inspection pending on fast reads', () => {
  const projection = buildOplDeveloperModeProjection({
    version: 'g1',
    enabled: 'auto',
    mode: 'developer_apply_safe',
    auto_enable_github_login: 'gaofeng21cn',
    source: 'default',
    updated_at: '2026-07-14T00:00:00.000Z',
  }, { detail: 'fast' });

  assert.equal(projection.status, 'pending');
  assert.equal(projection.effective_state, 'inspection_pending');
  assert.equal(projection.inactive_reason, 'authority_inspection_pending');
  assert.equal(projection.allowed_route, 'blocked');
  assert.equal(projection.github_identity.status, 'skipped');
  assert.equal(projection.repo_authority.status, 'not_checked');
  assert.equal(projection.developer_profile.status, 'not_checked');
  assert.equal(projection.capabilities.source_channel.status, 'not_checked');
  assert.equal(projection.capabilities.github_authority.status, 'not_checked');
  assert.equal(projection.capabilities.runtime_mutation_scope.status, 'blocked');
  assert.equal(projection.framework_checkout.selected_source_kind, 'managed_runtime');
  assert.equal(projection.framework_checkout.should_use_local_checkout, false);
});

test('developer mode framework checkout resolves explicit local route', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-framework-checkout-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateDir;
    const checkout = resolveOplDeveloperModeFrameworkCheckout({
      enabled: 'on',
      mode: 'developer_apply_safe',
      source: 'user_config',
      auto_enable_github_login: 'gaofeng21cn',
      version: 'g1',
      updated_at: '2026-07-05T00:00:00.000Z',
    });

    assert.equal(checkout.status, 'resolved');
    assert.equal(checkout.checkout_root, fs.realpathSync.native(repoRoot));
    assert.equal(checkout.checkout_bin, path.join(checkout.checkout_root ?? '', 'bin', 'opl'));
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
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
