import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { DOMAIN_MODULE_SPECS } from '../../../../src/adapters/integration/system-installation/module-specs.ts';
import {
  createCurrentCodexFixture,
  createStartupDomainModuleRemotes,
  currentCodexEnvironment,
  DOMAIN_MODULE_TARGET_COUNT,
  removeStartupDomainModuleRemotes,
  scholarSkillsPluginFixtureFiles,
  withCliTimeout,
} from './system-startup-maintenance-cases/shared.ts';

test('system startup-maintenance installs clean managed modules and returns App reload guidance', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const logPath = path.join(homeRoot, 'startup-maintenance.log');
  const remotes = createStartupDomainModuleRemotes({ logPath });
  const { masRemote, magRemote, rcaRemote, metaRemote, bookForgeRemote, medcastRemote } = remotes;
  const codexFixture = createCurrentCodexFixture();
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
      OPL_MODULE_REPO_URL_OPLMEDCAST: medcastRemote.remoteRoot,
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...currentCodexEnvironment(codexFixture),
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
                source_policy: { configured_by: string };
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
    assert.equal(
      output.system_action.details.summary.completed_targets_count,
      DOMAIN_MODULE_TARGET_COUNT,
    );
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
    assert.equal(output.system_action.details.managed_install_update_receipts.status, 'no_eligible_managed_receipts');
    assert.equal(
      output.system_action.details.managed_install_update_receipts.recorded_receipt_count,
      0,
    );
    assert.deepEqual(output.system_action.details.managed_install_update_receipts.receipt_refs, []);
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
      DOMAIN_MODULE_SPECS
        .filter((spec) => spec.scope === 'domain_module')
        .map((spec) => [spec.module_id, 'completed', 'module_missing', 'missing', 'completed', 'skipped']),
    );
    assert.equal(output.system_action.details.plugin_cache_freshness.status, 'freshened');
    assert.equal(
      output.system_action.details.plugin_cache_freshness.source,
      'module_turnkey_skill_sync',
    );
    assert.equal(
      output.system_action.details.plugin_cache_freshness.synced_domain_packs_count,
      DOMAIN_MODULE_TARGET_COUNT,
    );
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
      ...DOMAIN_MODULE_SPECS
        .filter((spec) => spec.scope === 'domain_module')
        .map((spec) => spec.module_id),
    ]);
    const startupLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    assert.doesNotMatch(startupLog, /(?:med-autoscience|med-autogrant|redcube-ai|opl-meta-agent|opl-bookforge)-(?:bootstrap|health)/);
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
    assert.equal(fs.existsSync(output.system_action.details.managed_install_update_receipts.ledger_file), false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
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
  const codexFixture = createCurrentCodexFixture();

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
      OPL_GIT_RETRY_ATTEMPTS: '1',
      ...currentCodexEnvironment(codexFixture),
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
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
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
  const manifestPath = path.join(sourceRoot, 'plugin.json');
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, 'codex-home'),
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
  };

  try {
    fs.writeFileSync(manifestPath, JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'wrong-package',
    }), 'utf8');
    const identityDrift = runCliFailure(['connect', 'skills', '--domain', 'mas-scholar-skills'], env);
    assert.equal(identityDrift.status, 3);
    assert.equal(identityDrift.payload.error.code, 'contract_shape_invalid');
    assert.equal(identityDrift.payload.error.details.failure_code, 'agent_plugin_manifest_invalid');
    assert.equal(identityDrift.payload.error.details.expected_name, 'mas-scholar-skills');
    assert.equal(identityDrift.payload.error.details.observed_name, 'wrong-package');

    fs.writeFileSync(manifestPath, fixtureFiles['plugin.json'], 'utf8');
    const collisionRoot = path.join(workspaceRoot, '.agents', 'skills', 'example-specialist');
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
    const codexSkip = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'mas-scholar-skills',
      '--scope',
      'codex',
    ], env);
    assert.equal(codexSkip.skill_sync.summary.synced, 0);
    assert.equal(codexSkip.skill_sync.summary.skipped, 1);
    assert.equal(codexSkip.skill_sync.packs[0].sync_status, 'skipped');
    assert.equal(codexSkip.skill_sync.packs[0].installer_result.source, 'project_local_only');
    assert.deepEqual(codexSkip.skill_sync.packs[0].installer_result.allowed_scopes, ['workspace', 'quest']);
    assert.equal(codexSkip.skill_sync.packs[0].installer_result.global_codex_write, false);
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
