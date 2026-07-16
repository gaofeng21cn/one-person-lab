import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { listManagedInstallUpdateReceipts } from '../../../../src/modules/connect/managed-install-update-ledger.ts';
import {
  createStartupDomainModuleRemotes,
  removeStartupDomainModuleRemotes,
  scholarSkillsPluginFixtureFiles,
  withCliTimeout,
  writeStartupPackageChannelFixture,
} from './system-startup-maintenance-cases/shared.ts';
import { scholarSkillsPackageFixture } from './system-startup-maintenance-fixtures.ts';

test('system startup-maintenance installs clean managed modules and returns App reload guidance', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance.log');
  const remotes = createStartupDomainModuleRemotes({ logPath });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote } = remotes;
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
      OPL_GIT_RETRY_ATTEMPTS: '1',
      PATH: process.env.PATH ?? '',
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
            status: string;
            reason: string;
            action: string | null;
            result: {
              module: {
                scope: string;
                managed_checkout_path: string;
                git: { head_sha: string | null } | null;
                source_policy: { configured_by: string; package_channel_auto_update: boolean };
              };
              turnkey: {
                skill_sync: {
                  status: string;
                  command_preview: string[];
                  result: { sync_status: string };
                };
              };
            };
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
          temporal_runtime_reconcile: {
            surface_kind: string;
            status: string;
            applicable: boolean;
            ready: boolean | null;
            reason: string;
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
    assert.equal(output.system_action.details.capability_summary.completed_targets_count, 0);
    assert.equal(output.system_action.details.capability_summary.manual_required_targets_count, 0);
    assert.deepEqual(output.system_action.details.capability_targets, []);
    assert.equal(
      fs.existsSync(path.join(modulesRoot, 'mas-scholar-skills', 'skills', 'mas-scholar-skills', 'SKILL.md')),
      false,
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
      'module_turnkey_skill_sync',
    );
    assert.equal(output.system_action.details.plugin_cache_freshness.synced_domain_packs_count, 5);
    assert.equal(output.system_action.details.plugin_cache_freshness.managed_capability_packages_count, 0);
    assert.deepEqual(output.system_action.details.plugin_cache_freshness.managed_capability_packages, []);
    assert.equal(output.system_action.details.restart_reload_prompt.required, true);
    assert.equal(output.system_action.details.restart_reload_prompt.action, 'reload_app_and_codex_plugin_cache');
    assert.equal(
      output.system_action.details.temporal_runtime_reconcile.surface_kind,
      'opl_temporal_runtime_startup_reconcile.v1',
    );
    assert.equal(output.system_action.details.temporal_runtime_reconcile.status, 'not_applicable');
    assert.equal(output.system_action.details.temporal_runtime_reconcile.applicable, false);
    assert.equal(output.system_action.details.temporal_runtime_reconcile.ready, null);
    assert.equal(
      output.system_action.details.temporal_runtime_reconcile.reason,
      process.platform === 'darwin'
        ? 'desktop_host_hint_missing'
        : 'launchd_supervision_not_available_on_non_darwin',
    );
    assert.deepEqual(output.system_action.details.restart_reload_prompt.affected_domains, [
      'medautoscience',
      'medautogrant',
      'redcube',
      'oplmetaagent',
      'oplbookforge',
    ]);
    assert.deepEqual(fs.readFileSync(logPath, 'utf8').trim().split('\n'), [
      'med-autogrant-bootstrap',
      'med-autogrant-health',
      'redcube-ai-bootstrap',
      'redcube-ai-health',
      'opl-meta-agent-bootstrap',
      'opl-meta-agent-health',
      'opl-bookforge-bootstrap',
      'opl-bookforge-health',
    ]);
    for (const skillName of ['mas', 'mag', 'rca', 'med-autoscience', 'med-autogrant', 'redcube-ai']) {
      assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', skillName, 'SKILL.md')), false);
    }
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'oma', 'SKILL.md')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'obf', 'SKILL.md')), false);
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'codex-plugin-carriers',
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
        'codex-plugin-carriers',
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
        'codex-plugin-carriers',
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
        'codex-plugin-carriers',
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
    removeStartupDomainModuleRemotes(remotes);
  }
});
test('system startup-maintenance does not install ScholarSkills without an installed MAS package', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-scholarskills-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance-scholarskills.log');
  const remotes = createStartupDomainModuleRemotes({ logPath });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote } = remotes;
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
          capability_targets: unknown[];
        };
      };
    };

    assert.deepEqual(startup.system_action.details.capability_targets, []);
    assert.equal(fs.existsSync(path.join(modulesRoot, 'mas-scholar-skills')), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    removeStartupDomainModuleRemotes(remotes);
  }
});

test('ScholarSkills sync rejects identity drift and unmanaged skill collisions', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-guard-home-'));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-guard-source-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-guard-workspace-'));
  const fixtureFiles = scholarSkillsPluginFixtureFiles('sync-guard');
  for (const [relativePath, content] of Object.entries(fixtureFiles)) {
    const filePath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  const manifestPath = path.join(sourceRoot, '.codex-plugin', 'plugin.json');
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
  };

  try {
    fs.writeFileSync(manifestPath, JSON.stringify({
      name: 'wrong-package',
      skills: './wrong-skills/',
    }), 'utf8');
    const inspected = runCli(['connect', 'skills', '--domain', 'mas-scholar-skills'], env) as any;
    const pack = inspected.skill_catalog.packs[0];
    assert.equal(pack.plugin_manifest_valid, false);
    assert.equal(pack.ready_to_sync, false);
    assert.deepEqual(pack.plugin_manifest_errors, [
      'plugin_manifest_name_mismatch:wrong-package',
      'plugin_manifest_skills_root_mismatch:./wrong-skills/',
    ]);

    fs.writeFileSync(manifestPath, fixtureFiles['.codex-plugin/plugin.json'], 'utf8');
    const collisionRoot = path.join(workspaceRoot, '.codex', 'skills', 'example-specialist');
    fs.mkdirSync(collisionRoot, { recursive: true });
    fs.writeFileSync(path.join(collisionRoot, 'USER.md'), 'preserve me\n', 'utf8');
    const collision = runCliFailure([
      'connect',
      'sync-skills',
      '--domain',
      'mas-scholar-skills',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
    ], env);
    assert.equal(collision.status, 2);
    assert.equal(collision.payload.error.code, 'contract_shape_invalid');
    assert.equal(collision.payload.error.details.skill_id, 'example-specialist');
    assert.equal(fs.readFileSync(path.join(collisionRoot, 'USER.md'), 'utf8'), 'preserve me\n');

    const codexCollisionRoot = path.join(homeRoot, 'codex-home', 'skills', 'mas-scholar-skills');
    fs.mkdirSync(codexCollisionRoot, { recursive: true });
    fs.writeFileSync(path.join(codexCollisionRoot, 'USER.md'), 'preserve codex skill\n', 'utf8');
    const codexCollision = runCliFailure([
      'connect',
      'sync-skills',
      '--domain',
      'mas-scholar-skills',
      '--scope',
      'codex',
    ], env);
    assert.equal(codexCollision.status, 2);
    assert.equal(codexCollision.payload.error.code, 'contract_shape_invalid');
    assert.equal(codexCollision.payload.error.details.skill_id, 'mas-scholar-skills');
    assert.equal(
      fs.readFileSync(path.join(codexCollisionRoot, 'USER.md'), 'utf8'),
      'preserve codex skill\n',
    );

    const retired = runCliFailure(['scholar-skills', 'catalog'], env);
    assert.equal(retired.status, 2);
    assert.equal(retired.payload.error.code, 'unknown_command');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
