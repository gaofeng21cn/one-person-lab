import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  createScholarSkillsRemote,
  createStartupDomainModuleRemotes,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
} from './shared.ts';

test('startup maintenance uses auto Developer Mode sibling checkouts', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-devmode-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const remotes = createStartupDomainModuleRemotes({
    logPath: path.join(homeRoot, 'module-actions.log'),
  });
  const scholarSkillsRemote = createScholarSkillsRemote();
  const fixtures = [
    ['medautoscience', 'med-autoscience', remotes.masRemote],
    ['medautogrant', 'med-autogrant', remotes.magRemote],
    ['redcube', 'redcube-ai', remotes.rcaRemote],
    ['oplmetaagent', 'opl-meta-agent', remotes.metaRemote],
    ['oplbookforge', 'opl-bookforge', remotes.bookForgeRemote],
  ] as const;

  try {
    fs.mkdirSync(workspaceRoot, { recursive: true });
    for (const [, repoName, remote] of fixtures) {
      runGitFixtureCommand(workspaceRoot, ['clone', remote.remoteRoot, path.join(workspaceRoot, repoName)]);
    }
    runGitFixtureCommand(workspaceRoot, [
      'clone',
      scholarSkillsRemote.remoteRoot,
      path.join(workspaceRoot, 'mas-scholar-skills'),
    ]);

    const permissions = Object.fromEntries([
      'one-person-lab',
      ...fixtures.map(([, repoName]) => repoName),
      'mas-scholar-skills',
    ].map((repoName) => [`gaofeng21cn/${repoName}`, 'admin']));
    const output = withCliTimeout('180000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ login: 'gaofeng21cn', permissions }),
      OPL_GIT_RETRY_ATTEMPTS: '1',
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    })) as any;
    const targets = new Map(
      output.system_action.details.module_targets.map((target: any) => [target.target_id, target]),
    );

    for (const [moduleId, repoName] of fixtures) {
      const target = targets.get(moduleId) as any;
      assert.equal(target.status, 'completed');
      assert.equal(target.reason, 'developer_checkout_visible_not_app_managed');
      assert.equal(target.action, 'sync');
      assert.equal(target.result.module.install_origin, 'sibling_workspace');
      assert.equal(target.result.module.checkout_path, path.join(workspaceRoot, repoName));
      assert.equal(target.result.module.source_policy.configured_by, 'developer_mode');
    }
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 0);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
    fs.rmSync(scholarSkillsRemote.fixtureRoot, { recursive: true, force: true });
  }
});
