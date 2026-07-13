import {
  agentPackageManifest,
  assert,
  createPluginSourceFixture,
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

test('packages fetches registry URL, validates manifest, and writes lock receipt', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-packages-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-packages-home-'));
  const codexHome = path.join(homeDir, '.codex');
  const pluginSourcePath = createPluginSourceFixture();
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: codexHome,
  };
  try {
    await withAgentPackageServer(async (baseUrl) => {
      const registryUrl = `${baseUrl}/registry.json`;
      const refresh = await runCliAsync([
        'packages',
        'registry',
        'refresh',
        '--registry-url',
        registryUrl,
      ], env) as {
        opl_agent_package_registry: {
          status: string;
          registry_url: string;
          entry_count: number;
          cache_file: string;
          conditions: Array<{ condition_id: string; status: string; action_ref: string | null }>;
          recommended_action: string | null;
          lifecycle_action_refs: string[];
          lifecycle_receipt: {
            action: string;
            writes_performed: boolean;
            authority_boundary: { can_write_domain_truth: boolean };
          };
        };
      };

      assert.equal(refresh.opl_agent_package_registry.status, 'refreshed');
      assert.equal(refresh.opl_agent_package_registry.registry_url, registryUrl);
      assert.equal(refresh.opl_agent_package_registry.entry_count, 1);
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.action, 'registry_refresh');
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.writes_performed, true);
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.authority_boundary.can_write_domain_truth, false);
      assert.equal(refresh.opl_agent_package_registry.conditions[0].condition_id, 'package_not_installed');
      assert.equal(refresh.opl_agent_package_registry.conditions[0].action_ref, 'install_from_manifest_url');
      assert.equal(refresh.opl_agent_package_registry.recommended_action, 'install_from_manifest_url');
      assert.equal(refresh.opl_agent_package_registry.lifecycle_action_refs.includes('install'), true);
      assert.equal(fs.existsSync(refresh.opl_agent_package_registry.cache_file), true);
      const refreshedCache = parseJsonText(
        fs.readFileSync(refresh.opl_agent_package_registry.cache_file, 'utf8'),
      ) as { entries: Array<Record<string, unknown>> };
      assert.equal(refreshedCache.entries[0].version_source_ref, `${baseUrl}/manifest.json#/version`);
      assert.equal(Object.hasOwn(refreshedCache.entries[0], 'latest_version'), false);

      const validated = await runCliAsync([
        'packages',
        'validate-manifest',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_manifest: {
          status: string;
          package_id: string;
          owner_route_readback: {
            owner_route: { readback_ref: string; package_manager_claim: boolean };
            packages: Array<{
              package_core: { core_kind: string; package_id: string };
              carrier_adapters: Array<{ carrier: string; owns_package_core: boolean }>;
              descriptor: { manifest_url: string; manifest_sha256: string; registry_url: string | null };
            }>;
            no_package_manager_boundary: { package_manager_claim: boolean };
          };
          lifecycle_receipt: {
            action: string;
            writes_performed: boolean;
          };
        };
      };

      assert.equal(validated.opl_agent_package_manifest.status, 'valid');
      assert.equal(validated.opl_agent_package_manifest.package_id, 'third.party.research');
      assert.equal(validated.opl_agent_package_manifest.lifecycle_receipt.action, 'manifest_validate');
      assert.equal(validated.opl_agent_package_manifest.lifecycle_receipt.writes_performed, true);
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.owner_route.readback_ref, 'opl packages list --json');
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].descriptor.manifest_url, `${baseUrl}/manifest.json`);
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].descriptor.registry_url, registryUrl);
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].package_core.core_kind, 'opl_agent_package_core');
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].package_core.package_id, 'third.party.research');
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].carrier_adapters[0].carrier, 'codex_plugin');
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].carrier_adapters[0].owns_package_core, false);
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.no_package_manager_boundary.package_manager_claim, false);

      const install = await runCliAsync([
        'packages',
        'install',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_install: {
          status: string;
          package_lock: {
            package_id: string;
            trust_tier: string;
            source_kind: string;
            version_or_source_digest: string;
            resolved_digest: string;
            moving_tag: string;
            install_truth: string;
            permission_scope_sha256: string;
            action_receipt_id: string;
            lock_ref: string;
            rollback_ref: string;
            bundled_required_skill_ids: string[];
            physical_surface: {
            status: string;
            codex_plugin_cache_path: string;
            marketplace_path: string;
            codex_config_path: string;
            plugin_manifest_path: string;
            materialized_required_skill_ids: string[];
            materialized_required_skill_paths: string[];
            failure_reason: string | null;
          };
        };
          physical_surface: {
            status: string;
            codex_plugin_cache_path: string;
            marketplace_path: string;
            codex_config_path: string;
            plugin_manifest_path: string;
            materialized_required_skill_ids: string[];
            materialized_required_skill_paths: string[];
            failure_reason: string | null;
          };
          lifecycle_receipt: {
            receipt_ref: string;
            action: string;
            package_lock_ref: string;
            writes_performed: boolean;
            physical_surface: { status: string };
          };
          owner_route_readback: {
            selected_package_id: string;
            owner_route: { readback_ref: string; package_manager_claim: boolean };
            packages: Array<{
              lifecycle_ux: {
                status: string;
                recommended_action: string | null;
                conditions: Array<{ condition_id: string; action_ref: string | null }>;
              };
              package_core: {
                core_kind: string;
                dependencies: { required_skill_ids: string[] };
                lifecycle: { recommended_action: string | null; action_refs: string[] };
              };
              carrier_adapters: Array<{ carrier: string; status: string; plugin_manifest_path: string }>;
              digest: { version_or_source_digest: string; manifest_sha256: string; resolved_digest: string; install_truth: string };
              lock: { package_lock_ref: string; lifecycle_receipt_ref: string };
              materializer: {
                status: string;
                plugin_manifest_path: string;
                writes_performed: boolean;
                failure_reason: string | null;
              };
            }>;
            no_package_manager_boundary: { package_manager_claim: boolean; forbidden_claims: string[] };
          };
          lock_file: string;
          lifecycle_ledger_file: string;
        };
      };

      assert.equal(install.opl_agent_package_install.status, 'installed');
      assert.equal(install.opl_agent_package_install.package_lock.package_id, 'third.party.research');
      assert.equal(install.opl_agent_package_install.package_lock.trust_tier, 'third_party_verified');
      assert.equal(install.opl_agent_package_install.package_lock.source_kind, 'manifest_url');
      assert.equal(
        install.opl_agent_package_install.package_lock.version_or_source_digest,
        '1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
      );
      assert.equal(
        install.opl_agent_package_install.package_lock.resolved_digest,
        'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      );
      assert.equal(install.opl_agent_package_install.package_lock.moving_tag, 'latest-stable');
      assert.equal(install.opl_agent_package_install.package_lock.install_truth, 'resolved_digest_lock');
      assert.match(install.opl_agent_package_install.package_lock.permission_scope_sha256, /^[a-f0-9]{64}$/);
      assert.equal(
        install.opl_agent_package_install.package_lock.action_receipt_id,
        install.opl_agent_package_install.lifecycle_receipt.receipt_ref,
      );
      assert.equal(install.opl_agent_package_install.package_lock.rollback_ref, 'package-receipt-ref:previous');
      assert.deepEqual(
        install.opl_agent_package_install.package_lock.bundled_required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.action, 'install');
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.writes_performed, true);
      assert.equal(install.opl_agent_package_install.physical_surface.status, 'materialized');
      assert.equal(install.opl_agent_package_install.physical_surface.failure_reason, null);
      assert.equal(install.opl_agent_package_install.package_lock.physical_surface.status, 'materialized');
      assert.equal(install.opl_agent_package_install.package_lock.physical_surface.failure_reason, null);
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.physical_surface.status, 'materialized');
      assert.equal(install.opl_agent_package_install.owner_route_readback.selected_package_id, 'third.party.research');
      assert.equal(install.opl_agent_package_install.owner_route_readback.owner_route.readback_ref, 'opl packages list --json');
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].digest.version_or_source_digest,
        install.opl_agent_package_install.package_lock.version_or_source_digest,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].digest.resolved_digest,
        install.opl_agent_package_install.package_lock.resolved_digest,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].digest.install_truth,
        'resolved_digest_lock',
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].lock.package_lock_ref,
        install.opl_agent_package_install.lifecycle_receipt.package_lock_ref,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].materializer.plugin_manifest_path,
        install.opl_agent_package_install.physical_surface.plugin_manifest_path,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].materializer.failure_reason,
        null,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].lifecycle_ux.status,
        'attention_needed',
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].lifecycle_ux.recommended_action,
        'agent_package_activate',
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].lifecycle_ux.conditions.some((condition) =>
          condition.condition_id === 'codex_reload_required'
            && condition.action_ref === 'agent_package_activate'
        ),
        true,
      );
      assert.deepEqual(
        install.opl_agent_package_install.owner_route_readback.packages[0].package_core.dependencies.required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].package_core.lifecycle.recommended_action,
        'agent_package_activate',
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].package_core.lifecycle.action_refs.includes('repair'),
        true,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].carrier_adapters[0].plugin_manifest_path,
        install.opl_agent_package_install.physical_surface.plugin_manifest_path,
      );
      assert.equal(install.opl_agent_package_install.owner_route_readback.no_package_manager_boundary.package_manager_claim, false);
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.no_package_manager_boundary.forbidden_claims.includes(
          'managed_update_kernel_is_package_manager',
        ),
        true,
      );
      assert.deepEqual(
        install.opl_agent_package_install.physical_surface.materialized_required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(fs.existsSync(path.join(
        install.opl_agent_package_install.physical_surface.codex_plugin_cache_path,
        '.codex-plugin',
        'plugin.json',
      )), true);
      assert.equal(
        install.opl_agent_package_install.physical_surface.materialized_required_skill_paths[0],
        path.join(
          install.opl_agent_package_install.physical_surface.codex_plugin_cache_path,
          'skills',
          'third-party-research',
          'SKILL.md',
        ),
      );
      assert.equal(fs.existsSync(path.join(
        install.opl_agent_package_install.physical_surface.codex_plugin_cache_path,
        'skills',
        'third-party-research',
        'SKILL.md',
      )), true);
      assert.equal(fs.existsSync(install.opl_agent_package_install.physical_surface.marketplace_path), true);
      assert.match(
        fs.readFileSync(install.opl_agent_package_install.physical_surface.codex_config_path, 'utf8'),
        /\[plugins\."third-party-research@opl-agent-third.party.research-local"\]/,
      );
      assert.equal(fs.existsSync(install.opl_agent_package_install.lock_file), true);
      assert.equal(fs.existsSync(install.opl_agent_package_install.lifecycle_ledger_file), true);
      const installedCachePath = install.opl_agent_package_install.physical_surface.codex_plugin_cache_path;
      const installedMarketplacePath = install.opl_agent_package_install.physical_surface.marketplace_path;
      const installedConfigPath = install.opl_agent_package_install.physical_surface.codex_config_path;

      const list = runCli([
        'packages',
        'list',
      ], env) as {
        opl_agent_packages: {
          installed_package_count: number;
          installed_packages: Array<{ package_id: string; physical_surface: { status: string } }>;
          conditions: Array<{ condition_id: string; action_ref: string | null }>;
          recommended_action: string | null;
          lifecycle_ux: { status: string; recommended_action: string | null };
          home_shortcut_preferences: Array<{
            package_id: string;
            shortcut_id: string;
            visible: boolean;
            sort_order: number | null;
            source: string;
            installed: boolean;
          }>;
          lifecycle_receipt_count: number;
          registry_cache: { entry_count: number };
          owner_route_readback: {
            package_count: number;
            packages: Array<{ materializer: { status: string }; lifecycle_ux: { recommended_action: string | null } }>;
          };
        };
      };

      assert.equal(list.opl_agent_packages.installed_package_count, 1);
      assert.equal(list.opl_agent_packages.installed_packages[0].package_id, 'third.party.research');
      assert.equal(list.opl_agent_packages.installed_packages[0].physical_surface.status, 'materialized');
      assert.equal(list.opl_agent_packages.recommended_action, 'agent_package_activate');
      assert.equal(list.opl_agent_packages.lifecycle_ux.status, 'attention_needed');
      assert.equal(
        list.opl_agent_packages.conditions.some((condition) => condition.condition_id === 'codex_reload_required'),
        true,
      );
      assert.deepEqual(list.opl_agent_packages.home_shortcut_preferences.map((entry) => ({
        package_id: entry.package_id,
        shortcut_id: entry.shortcut_id,
        visible: entry.visible,
        source: entry.source,
        installed: entry.installed,
      })), [{
        package_id: 'third.party.research',
        shortcut_id: 'research',
        visible: false,
        source: 'default',
        installed: true,
      }]);
      assert.equal(list.opl_agent_packages.lifecycle_receipt_count, 3);
      assert.equal(list.opl_agent_packages.registry_cache.entry_count, 1);
      assert.equal(list.opl_agent_packages.owner_route_readback.package_count, 1);
      assert.equal(list.opl_agent_packages.owner_route_readback.packages[0].materializer.status, 'materialized');
      assert.equal(
        list.opl_agent_packages.owner_route_readback.packages[0].lifecycle_ux.recommended_action,
        'agent_package_activate',
      );

      const update = await runCliAsync([
        'packages',
        'update',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_update: {
          status: string;
          package_lock: { package_id: string; physical_surface: { status: string } };
          physical_surface: { status: string };
          lifecycle_receipt: { action: string; writes_performed: boolean; physical_surface: { status: string } };
        };
      };

      assert.equal(update.opl_agent_package_update.status, 'updated');
      assert.equal(update.opl_agent_package_update.package_lock.package_id, 'third.party.research');
      assert.equal(update.opl_agent_package_update.physical_surface.status, 'materialized');
      assert.equal(update.opl_agent_package_update.lifecycle_receipt.physical_surface.status, 'materialized');
      assert.equal(update.opl_agent_package_update.lifecycle_receipt.action, 'update');
      assert.equal(update.opl_agent_package_update.lifecycle_receipt.writes_performed, true);

      const bulkUpdate = await runCliAsync(['packages', 'update'], env) as any;
      const bulkAdapter = bulkUpdate.managed_update.execution.adapter_results[0];
      assert.equal(bulkAdapter.component_id, 'opl_packages');
      assert.equal(bulkAdapter.result.targets.length, 1);
      assert.equal(bulkAdapter.result.targets[0].target_type, 'package_lock');
      assert.equal(bulkAdapter.result.targets[0].target_id, 'third.party.research');
      assert.equal(bulkAdapter.result.targets[0].status, 'completed');
      assert.equal(bulkAdapter.result.targets[0].installed_content_digest.length > 0, true);

      const lockIndex = parseJsonText(fs.readFileSync(install.opl_agent_package_install.lock_file, 'utf8')) as any;
      const cleanLock = lockIndex.packages.find((entry: any) => entry.package_id === 'third.party.research');
      lockIndex.packages.push({
        ...cleanLock,
        package_id: 'developer.package',
        display_name: 'Developer package',
        source_kind: 'developer_checkout_override',
        lock_ref: 'opl://agent-package-lock/developer.package/fixture',
        dependency_transaction_id: 'developer-package-fixture',
      });
      fs.writeFileSync(install.opl_agent_package_install.lock_file, `${JSON.stringify(lockIndex, null, 2)}\n`, 'utf8');
      const mixed = await runCliAsync(['packages', 'update'], env) as any;
      const mixedTargets = mixed.managed_update.execution.adapter_results[0].result.targets;
      assert.equal(mixedTargets.find((entry: any) => entry.target_id === 'third.party.research').status, 'completed');
      assert.equal(mixedTargets.find((entry: any) => entry.target_id === 'developer.package').status, 'manual_required');
      assert.equal(mixedTargets.find((entry: any) => entry.target_id === 'developer.package').action, null);
      const restoredLockIndex = parseJsonText(fs.readFileSync(install.opl_agent_package_install.lock_file, 'utf8')) as any;
      restoredLockIndex.packages = restoredLockIndex.packages.filter((entry: any) => entry.package_id !== 'developer.package');
      fs.writeFileSync(install.opl_agent_package_install.lock_file, `${JSON.stringify(restoredLockIndex, null, 2)}\n`, 'utf8');

      const repair = runCli([
        'packages',
        'repair',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_repair: {
          status: string;
          package_lock: { package_id: string; physical_surface: { status: string } };
          physical_surface: { status: string };
          lifecycle_receipt: { action: string; writes_performed: boolean; physical_surface: { status: string } };
        };
      };
      assert.equal(repair.opl_agent_package_repair.status, 'repaired');
      assert.equal(repair.opl_agent_package_repair.physical_surface.status, 'materialized');
      assert.equal(repair.opl_agent_package_repair.lifecycle_receipt.physical_surface.status, 'materialized');
      assert.equal(repair.opl_agent_package_repair.lifecycle_receipt.action, 'repair');

      const hide = runCli([
        'packages',
        'hide',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: {
          status: string;
          action: string;
          package_lock: { exposure_state: string };
          lifecycle_receipt: { action: string };
        };
      };
      assert.equal(hide.opl_agent_package_exposure.status, 'hidden');
      assert.equal(hide.opl_agent_package_exposure.action, 'hide');
      assert.equal(hide.opl_agent_package_exposure.package_lock.exposure_state, 'hidden');
      assert.equal(hide.opl_agent_package_exposure.lifecycle_receipt.action, 'hide');

      const unhide = runCli([
        'packages',
        'unhide',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: {
          status: string;
          action: string;
          package_lock: { exposure_state: string };
        };
      };
      assert.equal(unhide.opl_agent_package_exposure.status, 'visible');
      assert.equal(unhide.opl_agent_package_exposure.action, 'unhide');
      assert.equal(unhide.opl_agent_package_exposure.package_lock.exposure_state, 'visible');

      const disable = runCli([
        'packages',
        'disable',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: { status: string; package_lock: { exposure_state: string } };
      };
      assert.equal(disable.opl_agent_package_exposure.status, 'disabled');
      assert.equal(disable.opl_agent_package_exposure.package_lock.exposure_state, 'disabled');

      const enable = runCli([
        'packages',
        'enable',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: { status: string; package_lock: { exposure_state: string } };
      };
      assert.equal(enable.opl_agent_package_exposure.status, 'enabled');
      assert.equal(enable.opl_agent_package_exposure.package_lock.exposure_state, 'enabled');

      const status = runCli([
        'packages',
        'status',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_status: {
          status: string;
          installed_package_count: number;
          conditions: Array<{ condition_id: string; action_ref: string | null }>;
          recommended_action: string | null;
          lifecycle_ux: { status: string; recommended_action: string | null };
          home_shortcut_preferences: Array<{ shortcut_id: string; visible: boolean; sort_order: number | null; source: string }>;
          lifecycle_receipts: Array<{ action: string }>;
          owner_route_readback: {
            selected_package_id: string;
            packages: Array<{
              lock: { package_lock_ref: string | null };
              package_core: { lifecycle: { recommended_action: string | null } };
            }>;
          };
        };
      };
      assert.equal(status.opl_agent_package_status.status, 'available');
      assert.equal(status.opl_agent_package_status.installed_package_count, 1);
      assert.equal(status.opl_agent_package_status.recommended_action, 'agent_package_activate');
      assert.equal(status.opl_agent_package_status.lifecycle_ux.status, 'attention_needed');
      assert.equal(
        status.opl_agent_package_status.conditions.some((condition) => condition.condition_id === 'codex_reload_required'),
        true,
      );
      assert.equal(status.opl_agent_package_status.home_shortcut_preferences[0].shortcut_id, 'research');
      assert.equal(status.opl_agent_package_status.owner_route_readback.selected_package_id, 'third.party.research');
      assert.equal(
        status.opl_agent_package_status.owner_route_readback.packages[0].lock.package_lock_ref,
        install.opl_agent_package_install.package_lock.lock_ref,
      );
      assert.equal(
        status.opl_agent_package_status.owner_route_readback.packages[0].package_core.lifecycle.recommended_action,
        'agent_package_activate',
      );
      assert.deepEqual(
        status.opl_agent_package_status.lifecycle_receipts.map((receipt) => receipt.action),
        ['enable', 'disable', 'unhide', 'hide', 'repair', 'update', 'install', 'manifest_validate'],
      );

      const uninstall = runCli([
        'packages',
        'uninstall',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_uninstall: {
          status: string;
          removed_package_lock: { package_id: string };
          physical_surface: { status: string; removed_paths: string[] };
          lifecycle_receipt: { action: string; writes_performed: boolean; physical_surface: { status: string } };
        };
      };
      assert.equal(uninstall.opl_agent_package_uninstall.status, 'uninstalled');
      assert.equal(uninstall.opl_agent_package_uninstall.removed_package_lock.package_id, 'third.party.research');
      assert.equal(uninstall.opl_agent_package_uninstall.physical_surface.status, 'removed');
      assert.equal(uninstall.opl_agent_package_uninstall.lifecycle_receipt.physical_surface.status, 'removed');
      assert.equal(uninstall.opl_agent_package_uninstall.physical_surface.removed_paths.includes(installedCachePath), true);
      assert.equal(uninstall.opl_agent_package_uninstall.lifecycle_receipt.action, 'uninstall');
      assert.equal(uninstall.opl_agent_package_uninstall.lifecycle_receipt.writes_performed, true);
      assert.equal(fs.existsSync(installedCachePath), false);
      assert.equal(fs.existsSync(path.dirname(path.dirname(path.dirname(installedMarketplacePath)))), false);
      assert.equal(
        fs.readFileSync(installedConfigPath, 'utf8').includes('third-party-research@opl-agent-third.party.research-local'),
        false,
      );

      const afterUninstall = runCli([
        'packages',
        'status',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_status: {
          status: string;
          installed_package_count: number;
          conditions: Array<{ condition_id: string; action_ref: string | null }>;
          recommended_action: string | null;
          lifecycle_receipts: Array<{ action: string }>;
        };
      };
      assert.equal(afterUninstall.opl_agent_package_status.status, 'not_installed');
      assert.equal(afterUninstall.opl_agent_package_status.installed_package_count, 0);
      assert.equal(afterUninstall.opl_agent_package_status.conditions[0].condition_id, 'package_not_installed');
      assert.equal(afterUninstall.opl_agent_package_status.recommended_action, 'install_from_manifest_url');
      assert.equal(afterUninstall.opl_agent_package_status.lifecycle_receipts[0].action, 'uninstall');
    }, agentPackageManifest({ pluginSourcePath }));
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});
