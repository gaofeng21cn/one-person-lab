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
    provider: {
      selected_provider: 'temporal',
      temporal: { status: 'ready', health_status: 'ready' },
    },
    release: { channel: 'stable' },
    paths: {
      workspace_root: { health_status: 'ready', selected_path: '/tmp/workspace' },
      workspace_root_path: '/tmp/workspace',
    },
  });

  assert.deepEqual(
    contract.app_settings_read_model.settings_projection.ordinary_sections,
    ORDINARY_SETTINGS_SECTIONS,
  );
  assert.deepEqual(settings.settings_projection.ordinary_sections, ORDINARY_SETTINGS_SECTIONS);
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
  assert.equal(logDirectory.owner_page_id, 'workspace');
  assert.equal(logDirectory.current_value_source_ref, 'application.systemInfo.logDir');
  assert.equal(logDirectory.typed_host_action_ref, 'application.updateSystemInfo');
  assert.deepEqual(logDirectory.preserved_payload_fields, ['cacheDir', 'workDir']);
  assert.equal(logDirectory.persistence_target, 'desktop_client_system_info');
  assert.equal(logDirectory.readback_ref, 'application.systemInfo.logDir');
  assert.equal(logDirectory.framework_action_id, null);
  assert.equal(logDirectory.framework_write_allowed, false);
  assert.equal(logDirectory.docker_volume_projection.host_volume_ref, 'OnePersonLab/data');
  assert.equal(logDirectory.docker_volume_projection.container_path, '/data');
  assert.equal(logDirectory.docker_volume_projection.framework_rewire_allowed, false);
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
  assert.doesNotMatch(
    settings.settings_projection.sections.preferences.items[0].normal_summary,
    /instructions|context/i,
  );
  assert.deepEqual(contract.configuration_catalog.host_owned_configuration_surfaces, [logDirectory]);
  assert.equal(contract.app_settings_read_model.workspace_services.app_log_directory.owner_page_id, 'workspace');
  assert.equal(contract.app_settings_read_model.workspace_services.app_log_directory.typed_host_action_ref,
    'application.updateSystemInfo');
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
