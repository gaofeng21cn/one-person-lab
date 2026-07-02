import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { listManagedInstallUpdateReceipts } from '../../../../src/modules/connect/managed-install-update-ledger.ts';
import {
  createBookForgeGeneratedSurfaceRemote,
  createDomainModuleRemote,
  createOmaGeneratedSurfaceRemote,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './system-startup-maintenance-cases/shared.ts';
import { scholarSkillsPackageFixture } from './system-startup-maintenance-fixtures.ts';

test('system startup-maintenance installs clean managed modules and returns App reload guidance', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance.log');
  const masRemote = createDomainModuleRemote({
    repoName: 'med-autoscience',
    pluginName: 'mas',
    installerKind: 'bash',
    logPath,
  });
  const magRemote = createDomainModuleRemote({
    repoName: 'med-autogrant',
    pluginName: 'mag',
    installerKind: 'bash',
    logPath,
  });
  const rcaRemote = createDomainModuleRemote({
    repoName: 'redcube-ai',
    pluginName: 'rca',
    installerKind: 'node',
    logPath,
  });
  const metaRemote = createOmaGeneratedSurfaceRemote({
    logPath,
  });
  const bookForgeRemote = createBookForgeGeneratedSurfaceRemote({
    logPath,
  });
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });

  try {
    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: bookForgeRemote.remoteRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      OPL_GIT_RETRY_ATTEMPTS: '1',
      PATH: `${scholarSkillsChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        action: string;
        status: string;
        details: {
          surface_kind: string;
          mode: string;
          authority_boundary: {
            can_write_domain_truth: boolean;
            can_install_domain_daemon: boolean;
          };
          summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          capability_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          framework_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
          }>;
          capability_targets: Array<{
            target_id: string;
            capability_plugin_id: string;
            status: string;
            reason: string;
            action: string | null;
            checkout_path: string;
            managed_checkout_path: string;
            git_after: { head_sha: string | null } | null;
            source_policy: { configured_by: string; app_managed_auto_update: boolean };
            workspace_sync_command_ref: string;
            quest_sync_command_ref: string;
          }>;
          module_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            install_origin_before: string;
            result: {
              turnkey: {
                skill_sync: { status: string };
                health_check: { status: string };
              };
            };
          }>;
          managed_install_update_receipts: {
            surface_kind: string;
            status: string;
            recorded_receipt_count: number;
            receipt_refs: string[];
            ledger_file: string;
          };
          plugin_cache_freshness: {
            status: string;
            source: string;
            synced_domain_packs_count: number;
            managed_capability_packages_count: number;
            managed_capability_packages: string[];
          };
          restart_reload_prompt: {
            required: boolean;
            action: string;
            affected_domains: string[];
          };
        };
      };
    };

    assert.equal(output.system_action.action, 'startup_maintenance');
    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.surface_kind, 'opl_app_startup_maintenance');
    assert.equal(output.system_action.details.mode, 'clean_managed_environment_startup');
    assert.equal(output.system_action.details.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.system_action.details.authority_boundary.can_install_domain_daemon, false);
    assert.equal(output.system_action.details.summary.completed_targets_count, 5);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.capability_summary.completed_targets_count, 1);
    assert.equal(output.system_action.details.capability_summary.manual_required_targets_count, 0);
    assert.deepEqual(output.system_action.details.capability_targets.map((target) => [
      target.target_id,
      target.capability_plugin_id,
      target.status,
      target.reason,
      target.action,
      target.source_policy.configured_by,
      target.source_policy.app_managed_auto_update,
    ]), [
      ['scholarskills', 'mas-scholar-skills', 'completed', 'scholarskills_package_channel_missing', 'install', 'agent_latest_package_channel', true],
    ]);
    assert.equal(
      output.system_action.details.capability_targets[0].workspace_sync_command_ref,
      'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace-root> --json',
    );
    assert.equal(
      output.system_action.details.capability_targets[0].quest_sync_command_ref,
      'opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest-root> --json',
    );
    assert.equal(
      output.system_action.details.capability_targets[0].managed_checkout_path,
      path.join(modulesRoot, 'mas-scholar-skills'),
    );
    assert.equal(
      output.system_action.details.capability_targets[0].git_after?.head_sha,
      'scholarskills-v1-sha',
    );
    assert.equal(
      fs.existsSync(path.join(modulesRoot, 'mas-scholar-skills', 'skills', 'mas-scholar-skills', 'SKILL.md')),
      true,
    );
    assert.deepEqual(output.system_action.details.framework_targets.map((target) => [
      target.target_id,
      target.status,
      target.reason,
    ]), [
      ['opl-framework', 'skipped', 'framework_update_channel_not_requested'],
    ]);
    assert.equal(
      output.system_action.details.managed_install_update_receipts.surface_kind,
      'opl_managed_module_install_update_ledger_record',
    );
    assert.equal(output.system_action.details.managed_install_update_receipts.status, 'recorded');
    assert.equal(
      output.system_action.details.managed_install_update_receipts.recorded_receipt_count,
      5,
    );
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplmetaagent/install/'),
      ),
      true,
    );
    assert.equal(
      output.system_action.details.managed_install_update_receipts.receipt_refs.some(
        (ref) => ref.startsWith('opl://managed-install-update/oplbookforge/install/'),
      ),
      true,
    );
    assert.equal(
      output.system_action.details.managed_install_update_receipts.ledger_file,
      path.join(homeRoot, 'opl-state', 'managed-install-update-ledger.json'),
    );
    assert.deepEqual(
      output.system_action.details.module_targets.map((target) => [
        target.target_id,
        target.status,
        target.reason,
        target.install_origin_before,
        target.result.turnkey.skill_sync.status,
        target.result.turnkey.health_check.status,
      ]),
      [
        ['medautoscience', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
        ['medautogrant', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
        ['redcube', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
        ['oplmetaagent', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
        ['oplbookforge', 'completed', 'module_missing', 'missing', 'completed', 'completed'],
      ],
    );
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(
      output.system_action.details.plugin_cache_freshness.source,
      'module_turnkey_skill_sync_and_framework_capability_package',
    );
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 5);
    assert.equal(output.system_action.details.plugin_cache_freshness.managed_capability_packages_count, 1);
    assert.deepEqual(output.system_action.details.plugin_cache_freshness.managed_capability_packages, ['scholarskills']);
    assert.equal(output.system_action.details.restart_reload_prompt.required, true);
    assert.equal(output.system_action.details.restart_reload_prompt.action, 'reload_app_and_codex_plugin_cache');
    assert.deepEqual(output.system_action.details.restart_reload_prompt.affected_domains, [
      'medautoscience',
      'medautogrant',
      'redcube',
      'oplmetaagent',
      'oplbookforge',
    ]);
    assert.deepEqual(fs.readFileSync(logPath, 'utf8').trim().split('\n'), [
      'mas-bootstrap',
      'mas-health',
      'mag-bootstrap',
      'mag-health',
      'rca-bootstrap',
      'rca-health',
      'opl-meta-agent-bootstrap',
      'opl-meta-agent-health',
      'opl-bookforge-bootstrap',
      'opl-bookforge-health',
    ]);
    for (const skillName of ['mas', 'mag', 'rca']) {
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', skillName, 'SKILL.md')), false);
    }
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'opl-meta-agent', 'SKILL.md')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'opl-bookforge', 'SKILL.md')), false);
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'generated-codex-plugins',
        'opl-meta-agent-local',
        'plugins',
        'opl-meta-agent',
        '.codex-plugin',
        'plugin.json',
      )),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'generated-codex-plugins',
        'opl-meta-agent-local',
        'plugins',
        'opl-meta-agent',
        'skills',
        'opl-meta-agent',
        'SKILL.md',
      )),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'generated-codex-plugins',
        'opl-bookforge-local',
        'plugins',
        'opl-bookforge',
        '.codex-plugin',
        'plugin.json',
      )),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'generated-codex-plugins',
        'opl-bookforge-local',
        'plugins',
        'opl-bookforge',
        'skills',
        'opl-bookforge',
        'SKILL.md',
      )),
      true,
    );
    const codexConfig = fs.readFileSync(path.join(homeRoot, 'codex-home', 'config.toml'), 'utf8');
    assert.match(codexConfig, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(codexConfig, /\[plugins\."opl-bookforge@opl-bookforge-local"\]/);
    const previousStateDir = process.env.OPL_STATE_DIR;
    process.env.OPL_STATE_DIR = path.join(homeRoot, 'opl-state');
    try {
      const receipts = listManagedInstallUpdateReceipts({ module_id: 'oplmetaagent' });
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].surface_kind, 'opl_managed_module_install_update_receipt');
      assert.equal(receipts[0].repo_name, 'opl-meta-agent');
      assert.equal(receipts[0].action, 'install');
      assert.equal(receipts[0].install_origin_after, 'managed_root');
      assert.equal(receipts[0].skill_sync_status, 'completed');
      assert.equal(receipts[0].skill_sync_domain, 'oplmetaagent');
      assert.equal(receipts[0].health_check_status, 'completed');
      assert.equal(receipts[0].authority_boundary.can_write_domain_truth, false);
      assert.equal(receipts[0].authority_boundary.can_claim_production_ready, false);
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousStateDir;
      }
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(bookForgeRemote.fixtureRoot, { recursive: true, force: true });
  }
});
test('system startup-maintenance makes managed ScholarSkills source available for workspace sync', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-scholarskills-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-scholarskills-workspace-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance-scholarskills.log');
  const masRemote = createDomainModuleRemote({
    repoName: 'med-autoscience',
    pluginName: 'mas',
    installerKind: 'bash',
    logPath,
  });
  const magRemote = createDomainModuleRemote({
    repoName: 'med-autogrant',
    pluginName: 'mag',
    installerKind: 'bash',
    logPath,
  });
  const rcaRemote = createDomainModuleRemote({
    repoName: 'redcube-ai',
    pluginName: 'rca',
    installerKind: 'node',
    logPath,
  });
  const metaRemote = createOmaGeneratedSurfaceRemote({
    logPath,
  });
  const bookForgeRemote = createBookForgeGeneratedSurfaceRemote({
    logPath,
  });
  const scholarSkillsChannel = writeStartupPackageChannelFixture({
    root: path.join(homeRoot, 'scholarskills-channel'),
    version: '26.6.10-nightly',
    modules: [scholarSkillsPackageFixture('v1')],
  });

  try {
    const startup = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: masRemote.remoteRoot,
      OPL_MODULE_REPO_URL_MEDAUTOGRANT: magRemote.remoteRoot,
      OPL_MODULE_REPO_URL_REDCUBE: rcaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_MODULE_REPO_URL_OPLBOOKFORGE: bookForgeRemote.remoteRoot,
      OPL_PACKAGE_CHANNEL_MANIFEST_REF: 'ghcr.io/owner/one-person-lab-manifest:26.6.10-nightly',
      OPL_GIT_RETRY_ATTEMPTS: '1',
      PATH: `${scholarSkillsChannel.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        details: {
          capability_targets: Array<{
            status: string;
            action: string | null;
            managed_checkout_path: string;
            git_after: { head_sha: string | null } | null;
          }>;
        };
      };
    };

    assert.deepEqual(startup.system_action.details.capability_targets.map((target) => [
      target.status,
      target.action,
      target.managed_checkout_path,
      target.git_after?.head_sha,
    ]), [
      ['completed', 'install', path.join(modulesRoot, 'mas-scholar-skills'), 'scholarskills-v1-sha'],
    ]);

    const sync = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
      '--home',
      homeRoot,
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MODULES_ROOT: modulesRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          domain_id: string;
          sync_status: string;
          repo_root: string;
          target_root: string;
          workspace_or_quest_local_skill_root: string;
          installer_result: {
            workspace_or_quest_local_skill: {
              install_receipt: {
                source_repo_path: string;
                source_head: string | null;
                target_scope: string;
                target_root: string;
                authority_flags: {
                  can_write_domain_truth: boolean;
                  can_write_runtime_queue: boolean;
                  can_install_system_codex_skill_by_default?: boolean;
                };
              };
              copy: {
                copied_roots: string[];
              };
            };
          };
        }>;
      };
    };

    const pack = sync.skill_sync.packs[0];
    const skillRoot = path.join(workspaceRoot, '.codex', 'skills', 'mas-scholar-skills');
    assert.equal(pack.domain_id, 'scholarskills');
    assert.equal(pack.sync_status, 'synced');
    assert.equal(pack.repo_root, path.join(modulesRoot, 'mas-scholar-skills'));
    assert.equal(pack.target_root, workspaceRoot);
    assert.equal(pack.workspace_or_quest_local_skill_root, skillRoot);
    assert.deepEqual(pack.installer_result.workspace_or_quest_local_skill.copy.copied_roots, [
      'SKILL.md',
      'contracts',
      'docs',
      'gallery',
    ]);
    assert.equal(fs.existsSync(path.join(skillRoot, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'contracts', 'scholar-skills-capability-modules.json')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'docs', 'README.md')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'gallery', 'medical-display', 'gallery_snapshot.json')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'gallery', 'medical-display', 'assets')), false);
    assert.equal(fs.existsSync(path.join(skillRoot, 'outputs')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'mas-scholar-skills', 'SKILL.md')), false);
    const receipt = pack.installer_result.workspace_or_quest_local_skill.install_receipt;
    assert.equal(receipt.source_repo_path, path.join(modulesRoot, 'mas-scholar-skills'));
    assert.equal(receipt.source_head, 'scholarskills-v1-sha');
    assert.equal(receipt.target_scope, 'workspace');
    assert.equal(receipt.target_root, workspaceRoot);
    assert.equal(receipt.authority_flags.can_write_domain_truth, false);
    assert.equal(receipt.authority_flags.can_write_runtime_queue, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(masRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(bookForgeRemote.fixtureRoot, { recursive: true, force: true });
  }
});
