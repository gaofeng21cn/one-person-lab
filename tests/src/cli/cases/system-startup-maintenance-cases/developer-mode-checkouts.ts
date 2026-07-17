import { assert, fs, os, parseJsonText, path, runCli, test } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  createCurrentCodexFixture,
  createScholarSkillsRemote,
  createStartupDomainModuleRemotes,
  currentCodexEnvironment,
  removeStartupDomainModuleRemotes,
  withCliTimeout,
} from './shared.ts';

test('system startup-maintenance uses Developer Mode domain checkouts without globally syncing capability dependencies', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-devmode-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const onePersonLabRoot = path.join(workspaceRoot, 'one-person-lab');
  const logPath = path.join(homeRoot, 'startup-maintenance-devmode.log');
  const remotes = createStartupDomainModuleRemotes({ logPath });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote } = remotes;
  const scholarSkillsRemote = createScholarSkillsRemote();
  const codexFixture = createCurrentCodexFixture();
  const siblingCheckouts = {
    medautoscience: path.join(workspaceRoot, 'med-autoscience'),
    medautogrant: path.join(workspaceRoot, 'med-autogrant'),
    redcube: path.join(workspaceRoot, 'redcube-ai'),
    oplmetaagent: path.join(workspaceRoot, 'opl-meta-agent'),
    oplbookforge: path.join(workspaceRoot, 'opl-bookforge'),
    scholarskills: path.join(workspaceRoot, 'mas-scholar-skills'),
  };

  try {
    fs.mkdirSync(onePersonLabRoot, { recursive: true });
    runGitFixtureCommand(workspaceRoot, ['clone', masRemote.remoteRoot, siblingCheckouts.medautoscience]);
    runGitFixtureCommand(workspaceRoot, ['clone', magRemote.remoteRoot, siblingCheckouts.medautogrant]);
    runGitFixtureCommand(workspaceRoot, ['clone', rcaRemote.remoteRoot, siblingCheckouts.redcube]);
    runGitFixtureCommand(workspaceRoot, ['clone', metaRemote.remoteRoot, siblingCheckouts.oplmetaagent]);
    runGitFixtureCommand(workspaceRoot, ['clone', bookForgeRemote.remoteRoot, siblingCheckouts.oplbookforge]);
    runGitFixtureCommand(workspaceRoot, ['clone', scholarSkillsRemote.remoteRoot, siblingCheckouts.scholarskills]);

    const output = withCliTimeout('180000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({
        login: 'gaofeng21cn',
        permissions: {
          'gaofeng21cn/one-person-lab': 'admin',
          'gaofeng21cn/med-autoscience': 'admin',
          'gaofeng21cn/med-autogrant': 'admin',
          'gaofeng21cn/redcube-ai': 'admin',
          'gaofeng21cn/opl-meta-agent': 'admin',
          'gaofeng21cn/opl-bookforge': 'admin',
          'gaofeng21cn/mas-scholar-skills': 'admin',
        },
      }),
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...currentCodexEnvironment(codexFixture),
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        status: string;
        details: {
          summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          managed_install_update_receipts: {
            recorded_receipt_count: number;
          };
          module_targets: Array<{
            target_id: keyof typeof siblingCheckouts;
            status: string;
            reason: string;
            action: string | null;
            install_origin_before: string;
            result: {
              module: {
                install_origin: string;
                checkout_path: string;
                managed_checkout_path: string;
                source_policy: {
                  configured_by: string;
                  effective_install_update_source: string;
                };
              };
              turnkey: {
                bootstrap: { status: string };
                skill_sync: { status: string };
                health_check: { status: string };
              };
            };
          }>;
          plugin_cache_freshness: {
            status: string;
            synced_domain_packs_count: number;
          };
          capability_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
            install_origin_before: string;
            checkout_path: string;
            git_after: { head_sha: string | null } | null;
          }>;
          restart_reload_prompt: {
            required: boolean;
          };
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.summary.completed_targets_count, 5);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.managed_install_update_receipts.recorded_receipt_count, 0);
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 5);
    assert.deepEqual(output.system_action.details.capability_targets, []);
    assert.equal(output.system_action.details.restart_reload_prompt.required, true);

    for (const target of output.system_action.details.module_targets) {
      assert.equal(target.status, 'completed');
      assert.equal(target.reason, 'developer_checkout_visible_not_app_managed');
      assert.equal(target.action, 'sync');
      assert.equal(target.install_origin_before, 'sibling_workspace');
      assert.equal(target.result.module.install_origin, 'sibling_workspace');
      assert.equal(target.result.module.checkout_path, siblingCheckouts[target.target_id]);
      assert.equal(target.result.module.source_policy.configured_by, 'developer_mode');
      assert.equal(target.result.module.source_policy.effective_install_update_source, 'git_checkout');
      assert.equal(target.result.turnkey.bootstrap.status, 'skipped');
      assert.equal(target.result.turnkey.skill_sync.status, 'completed');
      assert.equal(target.result.turnkey.health_check.status, 'completed');
    }

    assert.deepEqual(fs.readFileSync(logPath, 'utf8').trim().split('\n'), [
      'med-autogrant-health',
      'redcube-ai-health',
      'opl-meta-agent-health',
      'opl-bookforge-health',
    ]);
    const codexConfig = fs.readFileSync(path.join(homeRoot, 'codex-home', 'config.toml'), 'utf8');
    for (const [moduleId, marketplaceId] of [
      ['medautoscience', 'med-autoscience-local'],
      ['medautogrant', 'med-autogrant-local'],
      ['redcube', 'redcube-ai-local'],
    ] as const) {
      const checkoutPath = siblingCheckouts[moduleId];
      const marketplaceRoot = path.join(homeRoot, 'opl-state', 'codex-plugin-marketplaces', marketplaceId);
      assert.equal(fs.existsSync(path.join(checkoutPath, '.agents', 'plugins', 'marketplace.json')), false);
      assert.equal(fs.existsSync(path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json')), true);
      assert.match(codexConfig, new RegExp(`\\[marketplaces\\.${marketplaceId}\\]`));
    }
    assert.match(codexConfig, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
    assert.match(codexConfig, /\[plugins\."med-autogrant@med-autogrant-local"\]/);
    assert.match(codexConfig, /\[plugins\."redcube-ai@redcube-ai-local"\]/);
    assert.match(codexConfig, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(codexConfig, /codex-plugin-marketplaces\/opl-meta-agent-local/);
    assert.match(codexConfig, /\[plugins\."opl-bookforge@opl-bookforge-local"\]/);
    assert.match(codexConfig, /codex-plugin-marketplaces\/opl-bookforge-local/);
    assert.doesNotMatch(codexConfig, /mas-scholar-skills|scholarskills/);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
    fs.rmSync(scholarSkillsRemote.fixtureRoot, { recursive: true, force: true });
  }
});
