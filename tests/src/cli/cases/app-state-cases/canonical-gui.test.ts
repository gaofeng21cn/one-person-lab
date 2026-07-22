import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import { collectObjectKeys } from './fixtures.ts';

test('app state fast exposes the canonical GUI read model without retired MDS defaults', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const stateDir = path.join(homeRoot, 'opl-state');
  fs.mkdirSync(stateDir, { recursive: true });

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as any;

    assert.equal(output.app_state.schema_version, 'opl_app_state.v1');
    assert.equal(output.app_state.surface_kind, 'opl_app_state.v1');
    assert.equal(output.app_state.meta.profile, 'fast');
    assert.equal(output.app_state.runtime_source.producer_role, 'gui_ready_state_action_producer_only');
    assert.equal(output.app_state.runtime_source.normal_gui_state_surface, 'opl app state --profile fast --json');
    assert.equal(output.app_state.runtime_source.full_gui_state_surface, 'opl app state --profile full --json');
    assert.equal(output.app_state.runtime_source.action_boundary_surface, 'opl app action execute --json');
    assert.equal(
      output.app_state.runtime_source.full_drilldown_exception_surface,
      'opl runtime app-operator-drilldown --detail full --json',
    );
    assert.equal(output.app_state.runtime_source.shell_must_not_use_full_drilldown_as_normal_state, true);
    assert.equal('runtime_tray_snapshot' in output.app_state, false);
    assert.equal('app_operator_drilldown' in output.app_state, false);
    assert.equal('evidence_envelope' in output.app_state, false);

    assert.equal(output.app_state.core.executor.default_executor_id, 'codex_cli');
    assert.equal(output.app_state.core.executor.visible_executors.length, 1);
    assert.equal(output.app_state.core.codex.parsed_version, '0.125.0');
    assert.equal(output.app_state.provider.temporal.required_for, 'full_opl_family_runtime_readiness');
    assert.equal(output.app_state.release.repo, 'gaofeng21cn/one-person-lab-app');
    assert.equal(Object.hasOwn(output.app_state, 'modules'), false);
    assert.equal(output.app_state.runtime_source_carriers.authority_boundary.package_installation_truth, 'app_state.agent_packages.status_index');
    assert.equal(output.app_state.runtime_source_carriers.authority_boundary.source_carrier_presence_is_package_installed, false);
    for (const carrier of output.app_state.runtime_source_carriers.items) {
      assert.equal(Object.hasOwn(carrier, 'installed'), false);
      assert.equal(Object.hasOwn(carrier, 'install_origin'), false);
      assert.equal(typeof carrier.source_present, 'boolean');
    }
    assert.equal(output.app_state.agent_packages.status_index.installed_package_count, 0);
    assert.equal(output.app_state.agent_packages.storage_inventory.status, 'unavailable');
    assert.equal(output.app_state.agent_packages.storage_inventory.bytes, null);
    assert.equal(output.app_state.agent_packages.storage_inventory.owner_route, '/settings/agents');
    assert.equal(output.app_state.runtime_source_carriers.items.some((entry: any) => entry.carrier_id === 'meddeepscientist'), false);

    assert.equal(output.app_state.settings_control_center.surface_kind, 'opl_settings_control_center.v2');
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_sync_capabilities'),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_check_app_update'),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_rollback_runtime_substrate'),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_inventory_agent_package_store'),
      true,
    );
    assert.equal(
      output.app_state.settings_control_center.allowed_action_ids.includes('settings_inventory_webui_data_volume'),
      true,
    );
    const storageLifecycle = output.app_state.settings_control_center.app_settings_read_model.storage_lifecycle;
    assert.equal(storageLifecycle.surface_kind, 'opl_settings_storage_owner_read_model.v1');
    assert.equal(storageLifecycle.agent_package_store.status, 'unavailable');
    assert.equal(storageLifecycle.agent_package_store.bytes, null);
    assert.equal(storageLifecycle.agent_package_store.projected_action.kind, 'navigate');
    assert.equal(storageLifecycle.webui_data_volume.status, 'unavailable');
    assert.equal(storageLifecycle.webui_data_volume.bytes, null);
    assert.equal(storageLifecycle.webui_data_volume.projected_action.execution_owner, 'carrier_host');
    for (const actionId of [
      'connection_list',
      'connection_create',
      'connection_update',
      'connection_delete',
      'connection_test',
      'connection_set_default',
    ]) {
      assert.equal(output.app_state.settings_control_center.allowed_action_ids.includes(actionId), true);
    }
    assert.deepEqual(
      output.app_state.settings_control_center.connection_registry.allowed_statuses,
      ['untested', 'ready', 'attention_needed', 'disabled'],
    );
    assert.equal(
      output.app_state.settings_control_center.app_settings_read_model.connections.credential_policy,
      'handle_only',
    );
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.settings_control_center.authority_boundary.can_create_typed_blocker, false);
    assert.deepEqual(
      Object.keys(output.app_state.settings_control_center.surface_policy),
      ['configuration', 'status', 'diagnostic', 'action', 'app_product_truth_policy'],
    );
    assert.equal(
      output.app_state.settings_control_center.surface_policy.action.policy,
      'one_time_actions_independent_from_persistent_configuration_catalog',
    );

    const configurationCatalog = output.app_state.settings_control_center.configuration_catalog;
    assert.equal(configurationCatalog.surface_class, 'configuration');
    assert.deepEqual(
      configurationCatalog.items.map((entry: any) => [entry.configuration_id, entry.action_id]),
      [
        ['workspace_root', 'workspace_root_set'],
        ['update_channel', 'update_channel'],
        ['developer_supervisor', 'developer_supervisor'],
      ],
    );
    assert.equal(
      configurationCatalog.items.every((entry: any) =>
        output.app_state.settings_control_center.allowed_action_ids.includes(entry.action_id)
          && output.app_state.settings_control_center.app_settings_read_model.action_policy
            .allowed_action_ids.includes(entry.action_id)
      ),
      true,
    );
    assert.equal(
      configurationCatalog.items.every((entry: any) =>
        entry.surface_class === 'configuration'
          && entry.owner === 'one-person-lab'
          && entry.lifecycle === 'persistent_configuration_mutation'
          && entry.route === `opl app action execute --action ${entry.action_id}`
          && entry.payload_required === true
          && entry.dry_run_supported === true
          && entry.authority_flags.can_write_domain_truth === false
      ),
      true,
    );
    const configurationExecutionMetadata = [
      'stable_id',
      'surface_class',
      'owner',
      'lifecycle',
      'action_id',
      'route',
      'delegated_surface',
      'payload_fields',
      'payload_required',
      'mutates',
      'dry_run_supported',
      'confirmation_required',
      'danger_level',
      'impact',
      'rollback_action_id',
      'follow_up_action_ids',
      'verify_action_id',
      'verify_route',
      'authority_flags',
    ];
    assert.equal(
      configurationCatalog.items.every((entry: any) =>
        configurationExecutionMetadata.every((field) => field in entry)
          && output.app_state.settings_control_center.app_settings_read_model.action_policy
            .payload_required_action_ids.includes(entry.action_id)
          && output.app_state.settings_control_center.app_settings_read_model.action_policy
            .dry_run_supported_action_ids.includes(entry.action_id)
      ),
      true,
    );
    assert.deepEqual(
      configurationCatalog.excluded_surfaces.map((entry: any) => entry.configuration_id),
      [
        'app_local_preferences',
        'model_catalog',
        'theme',
        'notifications',
        'data_retention',
        'connection_credentials',
      ],
    );
    assert.deepEqual(
      configurationCatalog.host_owned_configuration_surfaces,
      [output.app_state.settings_control_center.app_settings_read_model.workspace_services.app_log_directory],
    );
    const appLogDirectory = configurationCatalog.host_owned_configuration_surfaces[0];
    assert.equal(appLogDirectory.configuration_id, 'log_directory');
    assert.equal(appLogDirectory.owner_page_id, 'maintenance');
    assert.equal(appLogDirectory.owner_destination_id, 'logs_diagnostics');
    assert.equal(appLogDirectory.current_value_source_ref, 'application.systemInfo.logDir');
    assert.equal(appLogDirectory.typed_host_action_ref, 'application.setLogDirectory');
    assert.deepEqual(appLogDirectory.typed_host_action_payload_fields, ['path']);
    assert.deepEqual(appLogDirectory.typed_host_action_success_value_fields, ['hostLogDir']);
    assert.deepEqual(appLogDirectory.preserved_payload_fields, ['cacheDir', 'workDir']);
    assert.equal(appLogDirectory.persistence_target, 'desktop_client_system_info.logDir');
    assert.equal(appLogDirectory.readback_ref, 'application.systemInfo.logDir');
    assert.equal(appLogDirectory.framework_action_id, null);
    assert.equal(appLogDirectory.framework_write_allowed, false);
    assert.equal(appLogDirectory.carrier_policy.desktop, 'read_and_edit_through_typed_host_surfaces');
    assert.equal(appLogDirectory.carrier_policy.webui, 'read_application.systemInfo.logDir_without_host_mutation');
    assert.equal(appLogDirectory.carrier_policy.docker_default_log_path, '/data/logs');
    assert.equal(appLogDirectory.carrier_policy.docker_projection_requires_owner_confirmed_deployment, true);
    assert.equal(appLogDirectory.carrier_policy.host_mount_rewire_allowed, false);
    assert.equal(JSON.stringify(output.app_state.settings_control_center).includes('log_directory_set'), false);
    assert.deepEqual(
      configurationCatalog.items.map((entry: any) => entry.action_id).filter(
        (actionId: string) => !output.app_state.settings_control_center.allowed_action_ids.includes(actionId),
      ),
      [],
    );
    assert.deepEqual(output.app_state.settings_control_center.action_catalog, []);
    assert.deepEqual(output.app_state.settings_control_center.task_entries, []);
    assert.equal(output.app_state.settings_control_center.detail_policy.action_catalog, 'deferred');
    assert.equal(output.app_state.settings_control_center.detail_policy.task_entries, 'deferred');
    assert.equal(output.app_state.settings_control_center.detail_policy.settings_projection, 'deferred');
    assert.equal(
      output.app_state.settings_control_center.detail_policy.layout_source,
      'one-person-lab-app/contracts/app-product-profile.json#settings_control_center',
    );
    assert.equal(
      output.app_state.settings_control_center.detail_policy.startup_layout_policy,
      'read_persisted_app_narrow_snapshot_then_refresh_in_background',
    );
    assert.equal(output.app_state.settings_control_center.detail_policy.broad_app_state_layout_inference, 'forbidden');
    assert.equal(
      output.app_state.settings_control_center.detail_policy.full_detail_surface,
      'opl app state --profile full --json#settings_control_center',
    );

    assert.equal(output.app_state.operator.default_read_surface_policy.profile, 'fast');
    assert.equal(
      output.app_state.operator.default_read_surface_policy.default_planning_root,
      'current_owner_delta',
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.shell_contract
        .shell_must_not_derive_layout_from_raw_runtime_projection,
      true,
    );
    assert.equal(output.app_state.operator.default_read_surface_policy.shell_contract.full_detail_auto_poll, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(output.app_state.operator.default_read_surface_policy.authority_boundary.can_claim_production_ready, false);
    assert.equal(
      output.app_state.operator.default_read_surface_policy.authority_boundary
        .raw_worklist_can_generate_default_next_action,
      false,
    );
    assert.equal(
      output.app_state.operator.default_read_surface_policy.authority_boundary
        .raw_evidence_can_generate_default_next_action,
      false,
    );
    assert.deepEqual(
      Object.keys(output.app_state.operator.ordinary_cockpit.display_payload),
      [
        'purpose',
        'task',
        'current_owner',
        'next_action',
        'artifact_or_blocker',
      ],
    );
    assert.equal(
      output.app_state.operator.ordinary_cockpit.authority_boundary.default_next_action_derives_from,
      'derive_default_next_action_only_from_current_owner_delta',
    );
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.refs_only, true);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.can_create_owner_receipt, false);
    assert.equal(output.app_state.operator.stage_run_cockpit.authority_boundary.read_model_counts_as_closeout, false);

    const fastPayloadKeys = collectObjectKeys(output.app_state);
    for (const field of output.app_state.operator.default_read_surface_policy.forbidden_fast_profile_fields) {
      assert.equal(fastPayloadKeys.has(field), false, `fast app state must not expose ${field}`);
    }
    assert.equal(
      output.app_state.operator.workbench.sections.some(
        (entry: any) => entry.section_id === 'settings_control_center'
          && entry.source_ref === 'app_state.settings_control_center'
          && entry.lazy === false,
      ),
      true,
    );
    assert.equal(
      output.app_state.operator.workbench.safe_action_routes.every((entry: any) =>
        entry.route.startsWith('opl app action execute --action ')
      ),
      true,
    );
    const gatewayModelAccessAction = output.app_state.actions.find(
      (entry: any) => entry.action_id === 'gateway_account_use_for_model_access',
    );
    assert.ok(gatewayModelAccessAction);
    assert.equal(gatewayModelAccessAction.dry_run_supported, false);
    assert.equal(gatewayModelAccessAction.confirmation_required, true);
    assert.equal(gatewayModelAccessAction.danger_level, 'medium');
    assert.equal(
      output.app_state.operator.workbench.safe_action_routes.some(
        (entry: any) => entry.action_id === gatewayModelAccessAction.action_id,
      ),
      false,
    );
    const connectionListSafeRoute = output.app_state.operator.workbench.safe_action_routes.find(
      (entry: any) => entry.action_id === 'connection_list',
    );
    assert.ok(connectionListSafeRoute);
    assert.equal(connectionListSafeRoute.dry_run_supported, true);
    assert.equal(connectionListSafeRoute.dry_run_required, true);
    assert.equal(connectionListSafeRoute.confirmation_required, false);
    assert.equal(connectionListSafeRoute.danger_level, 'none');
    assert.equal(
      output.app_state.operator.workbench.safe_action_routes.every(
        (entry: any) => entry.dry_run_supported === true
          && entry.dry_run_required === true
          && entry.confirmation_required === false
          && entry.danger_level !== 'unknown',
      ),
      true,
    );
    assert.equal(output.app_state.paths.state_dir, stateDir);
    assert.equal(output.app_state.paths.runtime_sources_root, path.join(stateDir, 'modules'));
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
