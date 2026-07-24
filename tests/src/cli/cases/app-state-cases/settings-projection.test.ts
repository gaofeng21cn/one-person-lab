import { buildSettingsControlCenter } from '../../../../../src/modules/console/app-state-settings-control-center.ts';
import { assert, fs, path, repoRoot, test } from '../../helpers.ts';

const ORDINARY_SETTINGS_SECTIONS = [
  'overview',
  'gateway',
  'models',
  'workspace',
  'agents',
  'capabilities',
  'resources',
  'maintenance',
  'storage',
  'preferences',
];

const ORDINARY_SETTINGS_ROUTES = [
  'general',
  'gateway',
  'access',
  'workspace',
  'agents',
  'capabilities',
  'resources',
  'environment',
  'storage',
  'appearance',
];

const COMPATIBILITY_REDIRECTS = {
  advanced: 'environment#diagnostics',
  system: 'environment#diagnostics',
  update: 'environment#updates',
  'local-services': 'environment#services',
  theme: 'appearance#themes',
  personalization: 'workspace#personalization',
};

test('full Settings projection follows App page ownership without treating active Developer Mode as attention', () => {
  const contract = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'settings-control-center-action-read-model-contract.json'),
    'utf8',
  ));
  const storageObservedAt = new Date().toISOString();
  const settings = buildSettingsControlCenter({
    profile: 'full',
    core: {
      codex: {
        model_access_ready: true,
        opl_gateway_configured: true,
        api_key_present: true,
        model_access_source: 'opl_gateway',
        parsed_version: '0.125.0',
      },
    },
    developerMode: {
      status: 'ready',
      effective_state: 'active_direct',
      mode: 'developer_apply_safe',
      developer_profile: { status: 'ready' },
    },
    modules: {
      summary: {
        healthy_default_carriers_count: 5,
        default_carriers_count: 5,
      },
      items: [],
    },
    agentPackages: {
      status_index: {
        packages: {
          mas: {
            status: 'available',
            installed_version: '0.2.10',
            capability_exposure: { status: 'visible' },
            operational_ready: true,
            launch_allowed: true,
          },
        },
      },
    },
    provider: {
      selected_provider: 'temporal',
      temporal: { status: 'ready', health_status: 'ready' },
    },
    release: { channel: 'stable' },
    paths: {
      workspace_root: { health_status: 'ready', selected_path: '/tmp/workspace' },
      workspace_root_path: '/tmp/workspace',
    },
    storageOwnerInventory: {
      surface_kind: 'opl_storage_owner_inventory_snapshot.v1',
      version: 1,
      updated_at: storageObservedAt,
      agent_package_store: {
        status: 'available',
        observed_at: storageObservedAt,
        bytes: 2048,
        reclaimable_bytes: null,
      },
      webui_data_volume: {
        status: 'not_configured',
        observed_at: storageObservedAt,
        bytes: null,
        reclaimable_bytes: null,
      },
    },
  });

  assert.deepEqual(
    contract.app_settings_read_model.settings_projection.ordinary_sections,
    ORDINARY_SETTINGS_SECTIONS,
  );
  assert.deepEqual(settings.settings_projection.ordinary_sections, ORDINARY_SETTINGS_SECTIONS);
  assert.deepEqual(contract.package_functional_readiness, {
    source_ref: 'app_state.agent_packages.status_index',
    attention_scope: 'installed_enabled_packages_without_fresh_runnable_readback',
    disabled_and_uninstalled_packages_are_attention: false,
    runtime_source_carriers_role: 'provenance_only',
    runtime_source_carrier_health_can_enqueue_issue: false,
    runtime_source_carrier_health_can_recommend_sync: false,
  });
  assert.deepEqual(contract.control_center_groups, ORDINARY_SETTINGS_SECTIONS);
  assert.deepEqual(settings.control_center_groups.map((group) => group.group_id), ORDINARY_SETTINGS_SECTIONS);
  assert.deepEqual(contract.settings_ia.ordinary_route_ids, ORDINARY_SETTINGS_ROUTES);
  assert.deepEqual(settings.settings_ia.ordinary_route_ids, ORDINARY_SETTINGS_ROUTES);
  assert.deepEqual(settings.settings_ia.secondary_or_deep_link_route_ids, ['about']);
  assert.deepEqual(settings.app_settings_read_model.page_structure.secondary_or_deep_link_route_ids, ['about']);
  assert.deepEqual(
    Object.fromEntries(settings.settings_ia.compatibility_redirects.map((redirect) => [
      redirect.source_route_id,
      `${redirect.target_route_id}#${redirect.target_section_id}`,
    ])),
    COMPATIBILITY_REDIRECTS,
  );
  assert.deepEqual(contract.settings_ia.compatibility_redirects, COMPATIBILITY_REDIRECTS);
  assert.equal(settings.settings_ia.layout_authority.owner, 'one-person-lab-app');
  assert.equal(settings.settings_ia.layout_authority.broad_app_state_layout_inference_allowed, false);
  assert.deepEqual(
    contract.app_settings_read_model.settings_projection.layout_authority,
    settings.settings_projection.layout_authority,
  );
  assert.equal(settings.app_settings_read_model.page_structure.layout_authority.owner, 'one-person-lab-app');
  assert.equal(settings.settings_projection.sections.diagnostics.parent_section_id, 'maintenance');
  assert.equal(settings.settings_projection.sections.diagnostics.ordinary_visible, false);
  assert.deepEqual(settings.settings_projection.sections.maintenance.drilldown_section_ids, ['diagnostics']);
  assert.match(
    settings.settings_projection.sections.agents.items[0].normal_summary,
    /active_direct in developer_apply_safe/,
  );
  assert.equal(settings.issue_queue.length, 0);
  assert.equal(settings.status_summary.issue_count, 0);
  assert.equal(settings.settings_projection.sections.overview.items[0].state, 'available');
  assert.equal(settings.settings_projection.sections.workspace.label, 'Workspace & Personalization');
  assert.deepEqual(
    Object.keys(settings.app_settings_read_model.workspace_services).sort(),
    ['app_log_directory', 'personalization_refs', 'workspace_root'],
  );
  assert.deepEqual(
    settings.app_settings_read_model.workspace_services.personalization_refs.source_refs,
    ['app_state.codex_personalization.user_agents', 'app_state.opl_agent_codex_context'],
  );
  const logDirectory = settings.app_settings_read_model.workspace_services.app_log_directory;
  assert.equal(logDirectory.owner_page_id, 'maintenance');
  assert.equal(logDirectory.owner_destination_id, 'logs_diagnostics');
  assert.equal(logDirectory.current_value_source_ref, 'application.systemInfo.logDir');
  assert.equal(logDirectory.typed_host_action_ref, 'application.setLogDirectory');
  assert.deepEqual(logDirectory.typed_host_action_payload_fields, ['path']);
  assert.deepEqual(logDirectory.typed_host_action_success_value_fields, ['hostLogDir']);
  assert.deepEqual(logDirectory.preserved_payload_fields, ['cacheDir', 'workDir']);
  assert.equal(logDirectory.persistence_target, 'desktop_client_system_info.logDir');
  assert.equal(logDirectory.readback_ref, 'application.systemInfo.logDir');
  assert.equal(logDirectory.framework_action_id, null);
  assert.equal(logDirectory.framework_write_allowed, false);
  assert.equal(logDirectory.carrier_policy.webui, 'read_application.systemInfo.logDir_without_host_mutation');
  assert.equal(logDirectory.carrier_policy.docker_default_log_path, '/data/logs');
  assert.equal(logDirectory.carrier_policy.docker_projection_requires_owner_confirmed_deployment, true);
  assert.equal(logDirectory.carrier_policy.host_mount_rewire_allowed, false);
  assert.deepEqual(settings.configuration_catalog.host_owned_configuration_surfaces, [logDirectory]);
  assert.equal(
    settings.control_center_groups.find((group) => group.group_id === 'workspace')?.role,
    'workspace_root_app_log_directory_permissions_user_agents_and_app_context_refs',
  );
  const storageLogReference = settings.settings_projection.sections.storage.items.find(
    (item) => item.item_id === 'app_log_usage_and_cleanup_reference',
  );
  assert.equal(storageLogReference?.risk, 'read_only');
  assert.equal(storageLogReference?.next_action, 'none');
  assert.equal(storageLogReference?.details_ref,
    'app_state.settings_control_center.app_settings_read_model.workspace_services.app_log_directory');
  assert.equal(storageLogReference?.editable_reason, 'read_only_reference_configuration_owned_by_workspace');
  assert.equal(
    settings.control_center_groups.find((group) => group.group_id === 'storage')?.role,
    'local_data_usage_safe_cleanup_and_owner_page_references',
  );
  const storageLifecycle = settings.app_settings_read_model.storage_lifecycle;
  assert.equal(storageLifecycle.agent_package_store.status, 'available');
  assert.equal(storageLifecycle.agent_package_store.bytes, 2048);
  assert.equal(storageLifecycle.agent_package_store.reclaimable_bytes, null);
  assert.equal(storageLifecycle.agent_package_store.cleanup_action_id, 'agent_package_uninstall');
  assert.equal(storageLifecycle.agent_package_store.projected_action.route, '/settings/agents');
  assert.equal(storageLifecycle.webui_data_volume.status, 'not_configured');
  assert.equal(storageLifecycle.webui_data_volume.bytes, null);
  assert.equal(storageLifecycle.webui_data_volume.destructive_action_owner, 'carrier_host');
  assert.equal(storageLifecycle.webui_data_volume.framework_execute_status, 'host_action_required');
  assert.equal(storageLifecycle.webui_data_volume.projected_action.host_action_abi?.execute_action_id, null);
  assert.equal(storageLifecycle.authority_boundary.generic_docker_prune_allowed, false);
  assert.equal(
    settings.settings_projection.sections.storage.items
      .find((item) => item.item_id === 'agent_package_store_inventory')?.risk,
    'read_only',
  );
  assert.equal(
    settings.settings_projection.sections.storage.items
      .find((item) => item.item_id === 'webui_data_volume_inventory')?.next_action,
    'settings_inventory_webui_data_volume',
  );
  assert.equal(settings.allowed_action_ids.includes('settings_inventory_agent_package_store'), true);
  assert.equal(settings.allowed_action_ids.includes('settings_inventory_webui_data_volume'), true);
  assert.equal(contract.action_sections.includes('storage_lifecycle'), true);
  assert.equal(
    contract.app_settings_read_model.storage_lifecycle.policy.typed_package_lock_index_is_only_package_inventory_source,
    true,
  );
  assert.equal(contract.app_settings_read_model.storage_lifecycle.policy.generic_docker_prune_allowed, false);
  assert.equal(
    contract.app_settings_read_model.storage_lifecycle.policy.missing_carrier_host_capability,
    'status_only_fail_open',
  );
  assert.doesNotMatch(
    settings.settings_projection.sections.preferences.items[0].normal_summary,
    /instructions|context/i,
  );
  assert.deepEqual(contract.configuration_catalog.host_owned_configuration_surfaces, [logDirectory]);
  assert.deepEqual(contract.configuration_catalog.deployment_managed_workspace_root_policy, {
    condition: 'app_state.paths.workspace_root.source == env',
    lifecycle: 'deployment_managed_read_only',
    action_id: null,
    route: null,
    payload_fields: [],
    payload_required: false,
    mutates: 'none_deployment_managed',
    persistence_target: 'environment:OPL_WORKSPACE_ROOT',
    settings_mutation_allowed: false,
  });
  assert.equal(contract.app_settings_read_model.workspace_services.app_log_directory.owner_page_id, 'maintenance');
  assert.equal(contract.app_settings_read_model.workspace_services.app_log_directory.typed_host_action_ref,
    'application.setLogDirectory');
  assert.equal(contract.app_settings_read_model.workspace_services.app_log_directory.storage_reference_policy,
    'read_only_usage_and_cleanup_reference');
  assert.equal(contract.configuration_catalog.excluded_configuration_ids.includes('log_directory'), false);
  assert.equal(settings.configuration_catalog.excluded_surfaces.some(
    (entry) => entry.configuration_id === 'log_directory',
  ), false);
  assert.equal(JSON.stringify(settings).includes('log_directory_set'), false);
  assert.equal(JSON.stringify(contract).includes('log_directory_set'), false);
  assert.equal(
    settings.task_entries
      .filter((entry) => entry.action_id.startsWith('gateway_account_'))
      .every((entry) => entry.section_id === 'gateway_account'),
    true,
  );
});

test('Settings projects environment-managed workspace roots as read-only', () => {
  const settings = buildSettingsControlCenter({
    profile: 'fast',
    core: { codex: {} },
    developerMode: {},
    modules: { summary: {}, items: [] },
    agentPackages: { status_index: { packages: {} } },
    provider: { selected_provider: 'temporal', temporal: {} },
    release: { channel: 'stable' },
    paths: {
      workspace_root: {
        selected_path: '/projects',
        source: 'env',
        exists: true,
        writable: true,
        health_status: 'ready',
      },
      workspace_root_path: '/projects',
    },
  });

  const workspaceRoot = settings.configuration_catalog.items.find(
    (item) => item.configuration_id === 'workspace_root',
  );
  assert.ok(workspaceRoot);
  assert.equal(workspaceRoot.current_value, '/projects');
  assert.equal(workspaceRoot.lifecycle, 'deployment_managed_read_only');
  assert.equal(workspaceRoot.action_id, null);
  assert.equal(workspaceRoot.route, null);
  assert.deepEqual(workspaceRoot.payload_fields, []);
  assert.equal(workspaceRoot.payload_required, false);
  assert.equal(workspaceRoot.mutates, 'none_deployment_managed');
  assert.equal(workspaceRoot.dry_run_supported, false);
  assert.equal(workspaceRoot.persistence_target, 'environment:OPL_WORKSPACE_ROOT');
  assert.equal(workspaceRoot.editable, false);
  assert.equal(workspaceRoot.editable_reason, 'deployment_environment_owns_workspace_root');
});

test('Settings treats runtime source carrier health as provenance and fresh package readback as functional truth', () => {
  const baseInput = {
    profile: 'full' as const,
    core: {
      codex: {
        model_access_ready: true,
        opl_gateway_configured: true,
        api_key_present: true,
        model_access_source: 'opl_gateway',
        parsed_version: '0.125.0',
      },
    },
    developerMode: {
      status: 'ready',
      effective_state: 'active_direct',
      mode: 'developer_apply_safe',
      developer_profile: { status: 'ready' },
    },
    modules: {
      summary: {
        healthy_default_carriers_count: 0,
        default_carriers_count: 2,
      },
      items: [{
        package_id: 'mas',
        label: 'MAS source checkout',
        source_health_status: 'dirty',
      }, {
        package_id: 'oma',
        label: 'OMA source checkout',
        source_health_status: 'missing',
      }],
    },
    provider: {
      selected_provider: 'temporal',
      temporal: { status: 'ready', health_status: 'ready' },
    },
    release: { channel: 'stable' },
    paths: {
      workspace_root: { health_status: 'ready', selected_path: '/tmp/workspace' },
      workspace_root_path: '/tmp/workspace',
    },
  };
  const settings = buildSettingsControlCenter({
    ...baseInput,
    agentPackages: {
      status_index: {
        packages: {
          mas: {
            status: 'available',
            installed_version: '0.2.10',
            capability_exposure: { status: 'visible' },
            operational_ready: true,
            launch_allowed: true,
          },
          oma: {
            status: 'using_last_known_good',
            installed_version: '0.3.7',
            capability_exposure: { status: 'hidden' },
            operational_ready: false,
            launch_allowed: false,
          },
          disabled: {
            status: 'attention_needed',
            installed_version: '1.0.0',
            capability_exposure: { status: 'disabled' },
            operational_ready: false,
            launch_allowed: false,
          },
          uninstalled: {
            status: 'not_installed',
            installed_version: null,
            capability_exposure: { status: 'not_installed' },
            operational_ready: false,
            launch_allowed: false,
          },
        },
      },
    },
  });

  assert.equal(settings.issue_queue.length, 1);
  assert.deepEqual(settings.issue_queue[0].affected_ids, ['oma']);
  assert.equal(settings.issue_queue[0].recommended_action_id, 'agent_package_repair');
  assert.equal(settings.status_summary.runtime_source_carrier_health, '0/2');
  assert.equal(settings.status_summary.agent_package_functional_health, '1/2');
  assert.equal(settings.settings_projection.sections.agents.items[0].state, 'attention_needed');
  assert.equal(settings.settings_projection.sections.agents.items[0].next_action, 'agent_package_repair');
  assert.equal(settings.settings_projection.sections.capabilities.items[0].state, 'attention_needed');
  assert.equal(settings.settings_projection.sections.capabilities.items[0].next_action, 'agent_package_repair');
  assert.equal(
    settings.task_entries.find((entry) => entry.action_id === 'settings_sync_capabilities')?.state,
    'ready',
  );
  assert.deepEqual(
    settings.capability_task_awareness_refs.runtime_source_provenance_refs.map((entry) => ({
      id: entry.id,
      status: entry.status,
      observation: entry.observed_source_health_status,
      next_action: entry.next_action,
    })),
    [{ id: 'mas', status: 'provenance_observation', observation: 'dirty', next_action: 'none' },
      { id: 'oma', status: 'provenance_observation', observation: 'missing', next_action: 'none' }],
  );
  assert.equal(JSON.stringify(settings.issue_queue).includes('settings_sync_capabilities'), false);
  const noRunnableGeneration = buildSettingsControlCenter({
    ...baseInput,
    agentPackages: {
      status_index: {
        packages: {
          mas: {
            status: 'attention_needed',
            installed_version: '0.2.10',
            capability_exposure: { status: 'visible' },
            operational_ready: false,
            launch_allowed: false,
          },
          disabled: {
            status: 'attention_needed',
            installed_version: '1.0.0',
            capability_exposure: { status: 'disabled' },
            operational_ready: false,
            launch_allowed: false,
          },
        },
      },
    },
  });
  assert.equal(noRunnableGeneration.issue_queue.length, 1);
  assert.deepEqual(noRunnableGeneration.issue_queue[0].affected_ids, ['mas']);
  assert.equal(noRunnableGeneration.issue_queue[0].recommended_action_id, 'agent_package_repair');
  assert.equal(noRunnableGeneration.settings_projection.sections.agents.items[0].state, 'attention_needed');
  assert.equal(noRunnableGeneration.settings_projection.sections.capabilities.items[0].state, 'attention_needed');
});
