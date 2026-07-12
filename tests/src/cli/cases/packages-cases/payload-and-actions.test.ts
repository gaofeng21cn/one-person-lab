import {
  agentPackageManifest,
  assert,
  createPluginSourceFixture,
  formatJsonPayload,
  fs,
  os,
  parseJsonText,
  path,
  pathToFileURL,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
  withAgentPackageServer,
  withRemotePayloadAgentPackageServer,
} from './helpers.ts';
import {
  assertPackageProfileRollbackReady,
  finalizePackageProfileRollback,
  rollbackPackageProfileMigration,
} from '../../../../../src/modules/connect/agent-package-registry-parts/profile-surface.ts';

test('packages materializes manifest-declared remote plugin payloads', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-remote-payload-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-remote-payload-home-'));
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    await withRemotePayloadAgentPackageServer(async (baseUrl) => {
      const install = await runCliAsync([
        'packages',
        'install',
        '--registry-url',
        `${baseUrl}/registry.json`,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_install: {
          status: string;
          package_lock: {
            physical_surface: {
              plugin_payload_manifest_url: string;
              plugin_payload_manifest_sha256: string;
              plugin_payload_cache_path: string;
              materialized_required_skill_ids: string[];
            };
          };
          physical_surface: {
            status: string;
            plugin_payload_manifest_url: string;
            plugin_payload_manifest_sha256: string;
            plugin_payload_cache_path: string;
            codex_plugin_cache_path: string;
            materialized_required_skill_paths: string[];
          };
          lifecycle_receipt: {
            physical_surface: {
              plugin_payload_manifest_url: string;
              plugin_payload_cache_path: string;
            };
          };
        };
      };

      const physicalSurface = install.opl_agent_package_install.physical_surface;
      assert.equal(install.opl_agent_package_install.status, 'installed');
      assert.equal(physicalSurface.status, 'materialized');
      assert.equal(physicalSurface.plugin_payload_manifest_url, `${baseUrl}/payload.json`);
      assert.match(physicalSurface.plugin_payload_manifest_sha256, /^[a-f0-9]{64}$/);
      assert.equal(fs.existsSync(path.join(
        physicalSurface.plugin_payload_cache_path,
        '.codex-plugin',
        'plugin.json',
      )), true);
      assert.equal(fs.existsSync(path.join(
        physicalSurface.codex_plugin_cache_path,
        'skills',
        'third-party-research',
        'SKILL.md',
      )), true);
      assert.deepEqual(
        install.opl_agent_package_install.package_lock.physical_surface.materialized_required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(
        install.opl_agent_package_install.lifecycle_receipt.physical_surface.plugin_payload_cache_path,
        physicalSurface.plugin_payload_cache_path,
      );

      await runCliAsync([
        'packages',
        'update',
        '--registry-url',
        `${baseUrl}/registry.json`,
        '--package-id',
        'third.party.research',
      ], env);
      assert.equal(fs.existsSync(physicalSurface.plugin_payload_cache_path), true);
      const rolledBack = runCli([
        'packages',
        'rollback',
        '--package-id',
        'third.party.research',
      ], env) as any;
      assert.equal(rolledBack.opl_agent_package_rollback.status, 'rolled_back');
      assert.equal(fs.existsSync(physicalSurface.plugin_payload_cache_path), true);

      const uninstall = runCli([
        'packages',
        'uninstall',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_uninstall: {
          physical_surface: {
            status: string;
            removed_paths: string[];
          };
        };
      };

      assert.equal(uninstall.opl_agent_package_uninstall.physical_surface.status, 'removed');
      assert.equal(
        uninstall.opl_agent_package_uninstall.physical_surface.removed_paths.includes(physicalSurface.plugin_payload_cache_path),
        true,
      );
      assert.equal(fs.existsSync(physicalSurface.plugin_payload_cache_path), false);
    });
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('packages rejects local package payloads missing bundled required skills', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-missing-skill-state-'));
  const pluginSourcePath = createPluginSourceFixture({ includeRequiredSkill: false });
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-missing-skill-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({ pluginSourcePath })), 'utf8');
    const failure = runCliFailure([
      'packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], { OPL_STATE_DIR: stateDir });

    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_required_skill_missing');
    assert.deepEqual(failure.payload.error.details.missing_required_skill_ids, ['third-party-research']);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('packages owns profile install, semantic merge apply, and non-destructive uninstall', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-profile-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-profile-home-'));
  const codexHome = path.join(homeDir, '.codex');
  const pluginSourcePath = createPluginSourceFixture();
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-profile-manifest-'));
  const existingProfile = '# User profile\n\nKeep this local instruction.\n';
  const candidateProfile = '# Package profile\n\nUse the managed package preference.\n';
  const authoringSource = '# Authoring source\n';
  const env = { OPL_STATE_DIR: stateDir, HOME: homeDir, CODEX_HOME: codexHome };

  try {
    fs.mkdirSync(path.join(pluginSourcePath, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(pluginSourcePath, 'profile'), { recursive: true });
    fs.writeFileSync(path.join(pluginSourcePath, 'templates', 'AGENTS.md'), candidateProfile, 'utf8');
    fs.writeFileSync(path.join(pluginSourcePath, 'templates', 'TASTE.md'), authoringSource, 'utf8');
    fs.writeFileSync(path.join(pluginSourcePath, 'profile', 'manifest.json'), '{}\n', 'utf8');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(codexHome, 'AGENTS.md'), existingProfile, 'utf8');

    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({
      pluginSourcePath,
      profileSurface: {
        runtime_profile: { source_path: 'templates/AGENTS.md', target_id: 'user_agents_profile' },
        authoring_sources: [{ source_path: 'templates/TASTE.md', target_id: 'user_taste_source' }],
        merge_context_paths: ['profile/manifest.json', 'templates/TASTE.md'],
        existing_profile_policy: 'semantic_merge_required',
      },
    })), 'utf8');

    const install = runCli([
      'packages',
      'install',
      '--manifest-url',
      manifestPath,
      '--trust-tier',
      'third_party_verified',
    ], env) as any;
    const migration = install.opl_agent_package_install.physical_surface.profile_migration;
    assert.equal(migration.status, 'semantic_merge_required');
    assert.equal(fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8'), existingProfile);
    assert.equal(fs.readFileSync(path.join(codexHome, 'TASTE.md'), 'utf8'), authoringSource);
    assert.equal(fs.existsSync(path.join(migration.merge_packet_path, 'packet.json')), true);
    assert.match(migration.apply_command, /^opl packages profile apply third\.party\.research /);

    const mergedFile = path.join(migration.merge_packet_path, 'merged', 'AGENTS.md');
    const mergedProfile = `${existingProfile}\n${candidateProfile}`;
    fs.writeFileSync(mergedFile, mergedProfile, 'utf8');
    const applied = runCli([
      'packages',
      'profile',
      'apply',
      'third.party.research',
      '--merged-file',
      mergedFile,
    ], env) as any;
    assert.equal(applied.opl_agent_package_profile_apply.status, 'profile_applied');
    assert.equal(applied.opl_agent_package_profile_apply.profile_migration.status, 'semantic_merge_applied');
    assert.equal(fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8'), mergedProfile);
    assert.equal(fs.existsSync(applied.opl_agent_package_profile_apply.profile_migration.receipt_path), true);

    const uninstall = runCli(['packages', 'uninstall', 'third.party.research'], env) as any;
    assert.equal(uninstall.opl_agent_package_uninstall.physical_surface.profile_migration.status, 'retained_on_uninstall');
    assert.equal(fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8'), mergedProfile);
    assert.equal(fs.readFileSync(path.join(codexHome, 'TASTE.md'), 'utf8'), authoringSource);

    const appliedMigration = applied.opl_agent_package_profile_apply.profile_migration;
    assert.doesNotThrow(() => assertPackageProfileRollbackReady(appliedMigration));
    const rolledBack = rollbackPackageProfileMigration(
      appliedMigration,
      { retainBackups: true },
    );
    assert.equal(rolledBack.status, 'rolled_back');
    assert.equal(rolledBack.rollback_backups_retained, true);
    assert.equal(
      rolledBack.mutation_actions.filter((entry: any) => entry.backup_ref)
        .every((entry: any) => fs.existsSync(entry.backup_ref)),
      true,
    );
    assert.equal(fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8'), existingProfile);
    assert.equal(fs.existsSync(path.join(codexHome, 'TASTE.md')), false);
    assert.equal(fs.existsSync(applied.opl_agent_package_profile_apply.profile_migration.receipt_path), false);
    const finalized = finalizePackageProfileRollback(rolledBack);
    assert.equal(finalized.rollback_backups_retained, false);
    assert.equal(
      rolledBack.mutation_actions.filter((entry: any) => entry.backup_ref)
        .every((entry: any) => !fs.existsSync(entry.backup_ref)),
      true,
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('packages installs a declared profile directly on an empty Codex home', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-fresh-profile-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-fresh-profile-home-'));
  const pluginSourcePath = createPluginSourceFixture();
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-fresh-profile-manifest-'));
  const candidateProfile = '# Fresh package profile\n';
  try {
    fs.mkdirSync(path.join(pluginSourcePath, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(pluginSourcePath, 'templates', 'AGENTS.md'), candidateProfile, 'utf8');
    fs.writeFileSync(path.join(pluginSourcePath, 'templates', 'TASTE.md'), '# Fresh authoring source\n', 'utf8');
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({
      pluginSourcePath,
      profileSurface: {
        runtime_profile: { source_path: 'templates/AGENTS.md', target_id: 'user_agents_profile' },
        authoring_sources: [{ source_path: 'templates/TASTE.md', target_id: 'user_taste_source' }],
        merge_context_paths: [],
        existing_profile_policy: 'semantic_merge_required',
      },
    })), 'utf8');
    const codexHome = path.join(homeDir, '.codex');
    const install = runCli([
      'packages',
      'install',
      '--manifest-url',
      manifestPath,
      '--trust-tier',
      'third_party_verified',
    ], { OPL_STATE_DIR: stateDir, HOME: homeDir, CODEX_HOME: codexHome }) as any;
    const migration = install.opl_agent_package_install.physical_surface.profile_migration;
    assert.equal(migration.status, 'installed');
    assert.equal(fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8'), candidateProfile);
    assert.equal(fs.existsSync(path.join(codexHome, 'state', 'third.party.research', 'profile-install-receipt.json')), true);

    const editedAuthoringSource = '# User edited authoring source\n';
    fs.writeFileSync(path.join(codexHome, 'TASTE.md'), editedAuthoringSource, 'utf8');
    assert.throws(
      () => rollbackPackageProfileMigration(migration),
      /target changed after the package write/,
    );
    assert.equal(fs.readFileSync(path.join(codexHome, 'TASTE.md'), 'utf8'), editedAuthoringSource);
    assert.equal(fs.readFileSync(path.join(codexHome, 'AGENTS.md'), 'utf8'), candidateProfile);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('profile installation compensates earlier writes when a later profile mutation fails', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-profile-failure-state-'));
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-profile-failure-home-'));
  const pluginSourcePath = createPluginSourceFixture();
  const manifestPath = path.join(stateDir, 'profile-failure-manifest.json');
  try {
    fs.mkdirSync(path.join(pluginSourcePath, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(pluginSourcePath, 'templates', 'AGENTS.md'), '# runtime profile\n');
    fs.writeFileSync(path.join(pluginSourcePath, 'templates', 'TASTE.md'), '# authoring source\n');
    fs.mkdirSync(path.join(codexHome, 'state', 'third.party.research', 'profile-install-receipt.json'), { recursive: true });
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({
      pluginSourcePath,
      profileSurface: {
        runtime_profile: { source_path: 'templates/AGENTS.md', target_id: 'user_agents_profile' },
        authoring_sources: [{ source_path: 'templates/TASTE.md', target_id: 'user_taste_source' }],
        merge_context_paths: [],
        existing_profile_policy: 'semantic_merge_required',
      },
    })));

    const failure = await runCliFailure([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'third_party',
    ], { OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome });
    assert.equal(failure.payload.error.code, 'unexpected_error');
    assert.equal(fs.existsSync(path.join(codexHome, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(codexHome, 'TASTE.md')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(codexHome, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('app action execute routes install_from_manifest_url to Framework package lock receipt writer', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-app-action-state-'));
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-app-action-home-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-manifest-'));
  const pluginSourcePath = createPluginSourceFixture();
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({ pluginSourcePath })), 'utf8');
    const manifestUrl = pathToFileURL(manifestPath).href;
    const output = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'install_from_manifest_url',
      '--payload',
      JSON.stringify({
        manifest_url: manifestUrl,
        trust_tier: 'third_party_verified',
      }),
    ], { OPL_STATE_DIR: stateDir, CODEX_HOME: codexHome }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_install: {
            status: string;
            package_lock: { package_id: string; source_kind: string };
            lifecycle_receipt: { writes_performed: boolean };
          };
        };
      };
    };

    assert.equal(output.app_action_execution.delegated_surface, 'opl packages install --manifest-url <manifest_url>');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.status, 'installed');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.package_lock.package_id, 'third.party.research');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.package_lock.source_kind, 'local_manifest_file');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.lifecycle_receipt.writes_performed, true);

    const repair = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'agent_package_repair',
      '--payload',
      JSON.stringify({ package_id: 'third.party.research' }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_repair: {
            status: string;
            lifecycle_receipt: { action: string };
          };
        };
      };
    };
    assert.equal(repair.app_action_execution.delegated_surface, 'opl packages repair --package-id <package_id>');
    assert.equal(repair.app_action_execution.result.opl_agent_package_repair.status, 'repaired');
    assert.equal(repair.app_action_execution.result.opl_agent_package_repair.lifecycle_receipt.action, 'repair');

    const exposurePreference = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'agent_package_preferences_set',
      '--payload',
      JSON.stringify({
        package_id: 'third.party.research',
        exposure_action: 'disable',
      }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_exposure: {
            status: string;
            action: string;
            package_lock: { exposure_state: string };
            lifecycle_receipt: { action: string; writes_performed: boolean };
          };
        };
      };
    };
    assert.equal(
      exposurePreference.app_action_execution.delegated_surface,
      'opl packages disable --package-id <package_id>',
    );
    assert.equal(exposurePreference.app_action_execution.result.opl_agent_package_exposure.status, 'disabled');
    assert.equal(exposurePreference.app_action_execution.result.opl_agent_package_exposure.action, 'disable');
    assert.equal(exposurePreference.app_action_execution.result.opl_agent_package_exposure.package_lock.exposure_state, 'disabled');
    assert.equal(exposurePreference.app_action_execution.result.opl_agent_package_exposure.lifecycle_receipt.action, 'disable');

    const shortcutPreference = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'agent_package_preferences_set',
      '--payload',
      JSON.stringify({
        package_id: 'third.party.research',
        shortcut_id: 'research',
        visible: false,
        sort_order: 9,
      }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_home_shortcut_preferences: {
            status: string;
            preference: { shortcut_id: string; visible: boolean; sort_order: number };
            lifecycle_receipt: { action: string; writes_performed: boolean };
          };
        };
      };
    };
    assert.equal(
      shortcutPreference.app_action_execution.delegated_surface,
      'opl packages preferences set --package-id <package_id> --shortcut-id <shortcut_id>',
    );
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.status, 'preferences_updated');
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.preference.shortcut_id, 'research');
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.preference.visible, false);
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.preference.sort_order, 9);
    assert.equal(
      shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.lifecycle_receipt.action,
      'home_shortcut_preferences_set',
    );

    const list = runCli(['packages', 'list'], { OPL_STATE_DIR: stateDir }) as {
      opl_agent_packages: {
        home_shortcut_preferences: Array<{ package_id: string; shortcut_id: string; visible: boolean; sort_order: number; source: string }>;
        files: { home_shortcut_preferences_file: string };
      };
    };
    assert.deepEqual(list.opl_agent_packages.home_shortcut_preferences.map((entry) => ({
      package_id: entry.package_id,
      shortcut_id: entry.shortcut_id,
      visible: entry.visible,
      sort_order: entry.sort_order,
      source: entry.source,
    })), [{
      package_id: 'third.party.research',
      shortcut_id: 'research',
      visible: false,
      sort_order: 9,
      source: 'user_preference',
    }]);
    assert.equal(fs.existsSync(list.opl_agent_packages.files.home_shortcut_preferences_file), true);

  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(codexHome, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});
