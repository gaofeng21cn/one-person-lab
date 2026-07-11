import { buildDockerWebuiSettingsReadModel } from './app-state-settings-control-center-parts/docker-webui-read-model.ts';
import { resolveSettingsCodexAccess } from './app-state-settings-control-center-parts/codex-access-read-model.ts';
import { listOplConnections } from '../connect/index.ts';
import {
  SETTINGS_CONTROL_CENTER_ACTION_IDS,
  SETTINGS_CONTROL_CENTER_ACTION_SECTIONS,
  SETTINGS_CONTROL_CENTER_ACTIONS,
  SETTINGS_CONTROL_CENTER_CONTRACT_REF,
  SETTINGS_CONTROL_CENTER_GROUPS,
  SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES,
  SETTINGS_ISSUE_CATALOG,
  buildAppAionConsumerOnlyReadback,
  type SettingsAction,
  type SettingsControlCenterGroup,
} from './app-state-settings-control-center-parts/catalog.ts';

export { SETTINGS_CONTROL_CENTER_ACTIONS };

const SETTINGS_CONFIGURATION_ACTION_IDS = [
  'workspace_root_set',
  'update_channel',
  'developer_supervisor',
] as const;
const SETTINGS_ALLOWED_ACTION_IDS = [
  ...SETTINGS_CONTROL_CENTER_ACTION_IDS,
  ...SETTINGS_CONFIGURATION_ACTION_IDS,
] as const;

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}

function statusTone(status: string | null) {
  if (!status) return 'unknown';
  return ['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(status)
    ? 'ready'
    : 'attention_needed';
}

function actionCatalogEntry(action: SettingsAction) {
  return {
    stable_id: action.stable_id,
    surface_class: 'action',
    owner: 'one-person-lab',
    lifecycle: 'one_time_action',
    action_id: action.action_id,
    label: action.label,
    section_id: action.section_id,
    task_kind: action.task_kind,
    taxonomy: action.taxonomy,
    route: routeFor(action.action_id),
    delegated_surface: action.delegated_surface,
    payload_fields: action.payload_fields,
    payload_required: action.payload_fields.length > 0,
    mutates: action.mutates,
    dry_run_supported: action.dry_run_supported,
    confirmation_required: action.confirmation_required,
    danger_level: action.danger_level,
    impact: action.impact,
    rollback_action_id: action.rollback_action_id ?? null,
    follow_up_action_ids: action.follow_up_action_ids,
    verify_action_id: action.verify_action_id ?? null,
    verify_route: action.verify_action_id ? routeFor(action.verify_action_id) : null,
    authority_flags: settingsAuthorityFlags(),
  };
}

function settingsAuthorityFlags() {
  return {
    can_write_domain_truth: false,
    can_sign_domain_receipt: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_write_runtime_queue: false,
    can_write_provider_queue: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_quality_verdict: false,
    can_claim_app_release_ready: false,
    can_claim_production_ready: false,
  };
}

function routeFor(actionId: string) {
  return `opl app action execute --action ${actionId}`;
}

function moduleRef(entry: JsonRecord) {
  const moduleId = asString(entry.module_id) ?? 'unknown';
  return `app_state.modules.items.${moduleId}`;
}

function buildCapabilityTaskAwarenessRefs(input: BuildSettingsControlCenterInput) {
  const moduleItems = asList(input.modules.items);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const temporalStatus = asString(temporal.health_status) ?? asString(temporal.status) ?? 'unknown';
  return {
    surface_kind: 'opl_settings_capability_task_awareness_refs.v1',
    source_refs: [
      'app_state.modules.items',
      'app_state.provider.temporal',
      'app_state.actions#task_action_receipt_preview',
      'app_state.actions#task_export_bundle_preview',
      'app_state.operator.workbench.task_drilldowns[].workflow_refs',
    ],
    capability_health_refs: moduleItems.map((entry) => {
      const moduleId = asString(entry.module_id) ?? 'unknown';
      const status = asString(entry.health_status) ?? 'unknown';
      return {
        id: moduleId,
        title: asString(entry.label) ?? moduleId,
        status,
        ref: moduleRef(entry),
        owner: 'one-person-lab',
        next_action: status === 'ready'
          ? 'none'
          : asString(entry.recommended_action) ?? 'settings_sync_capabilities',
      };
    }),
    connector_readiness_refs: [
      {
        id: 'temporal_provider',
        title: 'Temporal provider',
        status: statusTone(temporalStatus),
        ref: 'app_state.provider.temporal',
        owner: 'one-person-lab',
        next_action: statusTone(temporalStatus) === 'ready'
          ? 'provider_scheduler_status'
          : 'settings_sync_capabilities',
      },
      {
        id: 'codex_surface',
        title: 'Codex-visible capability surface',
        status: 'refs_available',
        ref: 'app_state.actions#settings_reload_codex_surface',
        owner: 'one-person-lab',
        next_action: 'settings_reload_codex_surface',
      },
    ],
    workflow_refs: [
      {
        id: 'task_action_receipt_preview',
        title: 'Plan-approve-run receipt preview',
        status: 'dry_run_refs_only',
        ref: 'app_state.actions#task_action_receipt_preview',
        owner: 'one-person-lab',
        next_action: 'execute_dry_run_preview',
      },
      {
        id: 'task_export_bundle_preview',
        title: 'Reproducibility export bundle preview',
        status: 'dry_run_refs_only',
        ref: 'app_state.actions#task_export_bundle_preview',
        owner: 'one-person-lab',
        next_action: 'execute_dry_run_preview',
      },
      {
        id: 'current_task_workflow_refs',
        title: 'Current task workflow refs',
        status: 'refs_available',
        ref: 'app_state.operator.workbench.task_drilldowns[].workflow_refs',
        owner: 'domain_owner_projection',
        next_action: 'list_refs_only_no_workflow_body',
      },
    ],
    content_policy: 'refs_only_no_skill_body_no_workflow_body',
    authority_boundary: settingsAuthorityFlags(),
  };
}

function actionState(action: SettingsAction, input: BuildSettingsControlCenterInput) {
  if (action.action_id === 'settings_repair_model_access') {
    return resolveSettingsCodexAccess(input.core).model_access_status;
  }
  if (action.action_id === 'settings_configure_webui_api_key') {
    return resolveSettingsCodexAccess(input.core).opl_gateway_status;
  }
  if (action.action_id === 'settings_sync_capabilities' || action.action_id === 'settings_apply_opl_packages') {
    const summary = asRecord(asRecord(input.modules).summary);
    return summary.healthy_default_modules_count === summary.default_modules_count ? 'ready' : 'attention_needed';
  }
  if (action.action_id === 'settings_prune_runtime_roots_dry_run') {
    return 'plan_only';
  }
  if (action.action_id === 'settings_open_docker_webui' || action.action_id === 'settings_diagnose_docker_webui') {
    return 'ready';
  }
  if (action.action_id === 'settings_rollback_runtime_substrate') {
    return 'manual_required';
  }
  return 'ready';
}

function sectionState(sectionId: string, input: BuildSettingsControlCenterInput) {
  const relatedActions = SETTINGS_CONTROL_CENTER_ACTIONS.filter((action) => action.section_id === sectionId);
  if (relatedActions.some((action) => actionState(action, input) === 'attention_needed')) {
    return 'attention_needed';
  }
  return SETTINGS_CONTROL_CENTER_ACTION_SECTIONS.find((section) => section.section_id === sectionId)?.state ?? 'available';
}

function groupState(group: SettingsControlCenterGroup, input: BuildSettingsControlCenterInput) {
  if (group.action_section_ids.length === 0) {
    return 'available';
  }
  if (group.action_section_ids.some((sectionId) => sectionState(sectionId, input) === 'attention_needed')) {
    return 'attention_needed';
  }
  return 'available';
}

function buildTaskEntries(input: BuildSettingsControlCenterInput) {
  return SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => ({
    task_id: action.action_id,
    stable_id: action.stable_id,
    action_id: action.action_id,
    section_id: action.section_id,
    label: action.label,
    task_kind: action.task_kind,
    taxonomy: action.taxonomy,
    state: actionState(action, input),
    route: routeFor(action.action_id),
    delegated_surface: action.delegated_surface,
    dry_run_route: `${routeFor(action.action_id)} --dry-run`,
    verify_action_id: action.verify_action_id ?? null,
    verify_route: action.verify_action_id ? routeFor(action.verify_action_id) : null,
    payload_fields: action.payload_fields,
    payload_required: action.payload_fields.length > 0,
    dry_run_supported: action.dry_run_supported,
    confirmation_required: action.confirmation_required,
    danger_level: action.danger_level,
    rollback_action_id: action.rollback_action_id ?? null,
    mutates: action.mutates,
    authority_flags: settingsAuthorityFlags(),
  }));
}

function buildSettingsIa(taskEntries: ReturnType<typeof buildTaskEntries>) {
  return {
    surface_kind: 'opl_settings_control_center_ia.v1',
    ordinary_entry: 'settings_control_center',
    entry_policy: 'top_level_control_center_route',
    ordinary_route_ids: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => group.route_id),
    secondary_or_deep_link_route_ids: SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES.map((route) => route.route_id),
    route_groups: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => ({
      route_id: group.route_id,
      group_id: group.group_id,
      label: group.label,
      role: group.role,
      action_section_ids: group.action_section_ids,
      action_ids: taskEntries
        .filter((entry) => group.action_section_ids.includes(entry.section_id))
        .map((entry) => entry.action_id),
    })),
    secondary_or_deep_link_routes: SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES.map((route) => ({
      route_id: route.route_id,
      group_id: route.group_id,
      parent_route_id: route.parent_route_id,
      label: route.label,
      role: route.role,
      action_section_ids: route.action_section_ids,
      action_ids: taskEntries
        .filter((entry) => route.action_section_ids.includes(entry.section_id))
        .map((entry) => entry.action_id),
      route_scope: 'secondary_or_deep_link',
      ordinary_entry_policy: route.ordinary_entry_policy,
      app_shell_must_not_promote_to_top_level_tab: true,
    })),
    app_shell_contract: {
      app_consumes_read_model_only: true,
      aion_shell_is_renderer_only: true,
      shell_must_not_infer_domain_truth: true,
      shell_must_not_execute_unlisted_actions: true,
    },
  };
}

type SettingsProjectionItem = {
  item_id: string;
  label: string;
  state: string;
  surface_class: 'status' | 'diagnostic';
  scope: string;
  owner: string;
  risk: string;
  normal_summary: string;
  next_action: string;
  details_ref: string;
  editable_reason: string;
};

function settingsItem(input: SettingsProjectionItem) {
  return input;
}

function taskByActionId(taskEntries: ReturnType<typeof buildTaskEntries>, actionId: string) {
  return taskEntries.find((entry) => entry.action_id === actionId);
}

function riskForTask(task: ReturnType<typeof buildTaskEntries>[number] | undefined) {
  if (!task || task.mutates === 'none_read_only') {
    return 'read_only';
  }
  if (task.danger_level === 'high') {
    return 'high_confirmation_required';
  }
  return task.confirmation_required ? 'confirmation_required' : 'reversible';
}

function editableReasonForTask(
  taskEntries: ReturnType<typeof buildTaskEntries>,
  actionId: string | null,
  fallback: string,
) {
  if (!actionId) return fallback;
  const task = taskByActionId(taskEntries, actionId);
  return task
    ? `editable_via_listed_action:${task.action_id}`
    : fallback;
}

function settingsSection(
  sectionId: string,
  label: string,
  routeId: string,
  role: string,
  items: SettingsProjectionItem[],
) {
  const surfaceClasses = [...new Set(items.map((item) => item.surface_class))];
  return {
    section_id: sectionId,
    label,
    route_id: routeId,
    role,
    surface_class: surfaceClasses.length === 1 ? surfaceClasses[0] : 'mixed_status_diagnostic',
    item_count: items.length,
    items,
  };
}

function buildSettingsProjection(
  input: BuildSettingsControlCenterInput,
  taskEntries: ReturnType<typeof buildTaskEntries>,
  issueQueue: Array<Record<string, unknown>>,
  settingsIa: ReturnType<typeof buildSettingsIa>,
  connectionRegistry: ReturnType<typeof listOplConnections>,
) {
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const workspaceRoot = asRecord(input.paths.workspace_root);
  const codexAccess = resolveSettingsCodexAccess(input.core);
  const temporalStatus = asString(temporal.health_status) ?? asString(temporal.status);
  const moduleHealth = `${moduleSummary.healthy_default_modules_count ?? 0}/${moduleSummary.default_modules_count ?? 0}`;
  const firstIssueAction = asString(issueQueue[0]?.recommended_action_id);
  const modelAccessTask = taskByActionId(taskEntries, 'settings_repair_model_access');
  const workspaceTask = taskByActionId(taskEntries, 'settings_verify_workspace');
  const syncCapabilitiesTask = taskByActionId(taskEntries, 'settings_sync_capabilities');
  const appUpdateTask = taskByActionId(taskEntries, 'settings_check_app_update');
  const cleanupTask = taskByActionId(taskEntries, 'settings_prune_runtime_roots_dry_run');

  const sections = {
    summary: settingsSection('summary', 'Summary', settingsIa.ordinary_entry, 'settings_overview_and_recommended_action', [
      settingsItem({
        item_id: 'settings_overview',
        label: 'Settings overview',
        state: issueQueue.length > 0 ? 'attention_needed' : 'available',
        surface_class: 'status',
        scope: 'user',
        owner: 'one-person-lab',
        risk: 'read_only',
        normal_summary: issueQueue.length > 0
          ? `${issueQueue.length} settings item(s) need attention.`
          : 'Settings has no projected attention item.',
        next_action: firstIssueAction ?? 'none',
        details_ref: 'app_state.settings_control_center.status_summary',
        editable_reason: 'read_only_projection_from_settings_status_summary',
      }),
    ]),
    access: settingsSection('access', 'Access', 'access', 'model_access_local_remote_and_codex_cli', [
      settingsItem({
        item_id: 'codex_model_access',
        label: 'Codex model access',
        state: codexAccess.model_access_status,
        surface_class: 'status',
        scope: 'user',
        owner: 'one-person-lab',
        risk: riskForTask(modelAccessTask),
        normal_summary: codexAccess.model_access_ready
          ? `Model access is configured from ${codexAccess.model_access_source}.`
          : 'Model access is missing or unreadable.',
        next_action: codexAccess.model_access_ready ? 'none' : 'settings_repair_model_access',
        details_ref: 'app_state.settings_control_center.app_settings_read_model.codex_model_policy',
        editable_reason: editableReasonForTask(taskEntries, 'settings_repair_model_access', 'read_only_projection_from_codex_config'),
      }),
    ]),
    workspace: settingsSection('workspace', 'Workspace', 'workspace', 'workspace_paths_permissions_and_default_outputs', [
      settingsItem({
        item_id: 'workspace_root',
        label: 'Workspace root',
        state: asString(workspaceRoot.health_status) ?? 'unknown',
        surface_class: 'status',
        scope: 'workspace',
        owner: 'one-person-lab',
        risk: riskForTask(workspaceTask),
        normal_summary: asString(workspaceRoot.selected_path) ?? asString(input.paths.workspace_root_path) ?? 'Workspace root is not selected.',
        next_action: 'settings_verify_workspace',
        details_ref: 'app_state.paths.workspace_root',
        editable_reason: editableReasonForTask(taskEntries, 'settings_verify_workspace', 'read_only_projection_from_workspace_root'),
      }),
    ]),
    capabilities: settingsSection('capabilities', 'Capabilities', 'capabilities', 'agent_packages_shortcuts_and_capability_health', [
      settingsItem({
        item_id: 'managed_agent_packages',
        label: 'Managed agent packages',
        state: moduleSummary.healthy_default_modules_count === moduleSummary.default_modules_count ? 'ready' : 'attention_needed',
        surface_class: 'status',
        scope: 'local_machine',
        owner: 'one-person-lab',
        risk: riskForTask(syncCapabilitiesTask),
        normal_summary: `${moduleHealth} default OPL modules are healthy.`,
        next_action: moduleSummary.healthy_default_modules_count === moduleSummary.default_modules_count
          ? 'none'
          : 'settings_sync_capabilities',
        details_ref: 'app_state.settings_control_center.capability_task_awareness_refs.capability_health_refs',
        editable_reason: editableReasonForTask(taskEntries, 'settings_sync_capabilities', 'read_only_projection_from_modules_summary'),
      }),
    ]),
    resources: settingsSection('resources', 'Resources', 'resources', 'connect_fabric_cloud_ssh_hpc_and_workspace_resource_directory', [
      settingsItem({
        item_id: 'connect_fabric_external_resources',
        label: 'Connect, Fabric, Cloud, SSH, and HPC resources',
        state: connectionRegistry.connections.some((entry) => entry.status === 'attention_needed')
          ? 'attention_needed'
          : 'available',
        surface_class: 'status',
        scope: 'resources',
        owner: 'one-person-lab',
        risk: 'read_only',
        normal_summary: `${connectionRegistry.connections.length} Framework connection(s) registered; credentials remain owner-backed handles.`,
        next_action: 'connection_list',
        details_ref: 'app_state.settings_control_center.connection_registry',
        editable_reason: 'editable_via_listed_connection_actions_handle_only',
      }),
    ]),
    maintenance: settingsSection('maintenance', 'Maintenance', 'environment', 'updates_repairs_runtime_fabric_package_sync_and_local_services', [
      settingsItem({
        item_id: 'maintenance_routes',
        label: 'Maintenance routes',
        state: asString(appUpdateTask?.state) ?? 'unknown',
        surface_class: 'status',
        scope: 'local_machine',
        owner: 'one-person-lab',
        risk: riskForTask(appUpdateTask),
        normal_summary: `Release channel is ${asString(input.release.channel) ?? 'unknown'}; provider status is ${statusTone(temporalStatus)}; module health is ${moduleHealth}.`,
        next_action: 'settings_check_app_update',
        details_ref: 'app_state.settings_control_center.app_settings_read_model.local_environment',
        editable_reason: editableReasonForTask(taskEntries, 'settings_check_app_update', 'read_only_projection_from_release_state'),
      }),
    ]),
    storage: settingsSection('storage', 'Storage', 'storage', 'storage_inventory_cleanup_plan_and_receipt_status', [
      settingsItem({
        item_id: 'runtime_roots_cleanup_plan',
        label: 'Runtime roots cleanup plan',
        state: 'plan_only',
        surface_class: 'status',
        scope: 'local_machine',
        owner: 'one-person-lab',
        risk: riskForTask(cleanupTask),
        normal_summary: 'Runtime-root cleanup is dry-run plan only from Settings.',
        next_action: 'settings_prune_runtime_roots_dry_run',
        details_ref: 'app_state.settings_control_center.action_catalog#settings_prune_runtime_roots_dry_run',
        editable_reason: editableReasonForTask(taskEntries, 'settings_prune_runtime_roots_dry_run', 'read_only_projection_from_action_catalog'),
      }),
    ]),
    diagnostics: settingsSection('diagnostics', 'Diagnostics', 'advanced', 'raw_refs_logs_developer_source_and_action_routes', [
      settingsItem({
        item_id: 'diagnostic_refs',
        label: 'Diagnostic refs',
        state: 'available',
        surface_class: 'diagnostic',
        scope: 'developer',
        owner: 'one-person-lab',
        risk: 'read_only',
        normal_summary: 'Raw app state, Developer Mode, action policy, and consumer-only readback stay in diagnostics.',
        next_action: 'none',
        details_ref: 'app_state.settings_control_center.app_aion_consumer_only_readback',
        editable_reason: 'read_only_projection_from_app_state',
      }),
    ]),
  };

  return {
    surface_kind: 'opl_settings_projection.v1',
    schema_version: 'opl_settings_projection.v1',
    owner: 'one-person-lab',
    source_surface: 'app_state.settings_control_center',
    source_refs: [
      'app_state.settings_control_center.status_summary',
      'app_state.settings_control_center.settings_ia',
      'app_state.settings_control_center.action_catalog',
      'app_state.settings_control_center.app_settings_read_model',
      'app_state.core.codex',
      'app_state.paths',
      'app_state.modules',
      'app_state.provider',
      'app_state.release',
    ],
    item_required_fields: [
      'surface_class',
      'scope',
      'owner',
      'risk',
      'normal_summary',
      'next_action',
      'details_ref',
      'editable_reason',
    ],
    ordinary_sections: [
      'summary',
      'access',
      'workspace',
      'capabilities',
      'resources',
      'maintenance',
      'storage',
      'diagnostics',
    ],
    sections,
    authority_boundary: settingsAuthorityFlags(),
  };
}

function buildConfigurationCatalog(input: BuildSettingsControlCenterInput) {
  const workspaceRoot = asRecord(input.paths.workspace_root);
  const developerProfile = asRecord(asRecord(input.developerMode).developer_profile);

  return {
    surface_kind: 'opl_settings_configuration_catalog.v1',
    surface_class: 'configuration',
    owner: 'one-person-lab',
    persistence_policy: 'listed_only_when_backed_by_existing_framework_owned_persistent_action',
    items: [
      {
        configuration_id: 'workspace_root',
        stable_id: 'settings.configuration.workspace_root',
        label: 'Workspace root',
        surface_class: 'configuration',
        owner: 'one-person-lab',
        lifecycle: 'persistent_configuration_mutation',
        value_type: 'path',
        current_value: asString(workspaceRoot.selected_path) ?? asString(input.paths.workspace_root_path),
        source_ref: 'app_state.paths.workspace_root',
        action_id: 'workspace_root_set',
        route: routeFor('workspace_root_set'),
        delegated_surface: 'opl workspace root set',
        payload_fields: ['path'],
        payload_required: true,
        mutates: 'opl_workspace_root_config',
        dry_run_supported: true,
        confirmation_required: false,
        danger_level: 'low',
        impact: 'updates_framework_owned_default_workspace_root',
        rollback_action_id: null,
        follow_up_action_ids: ['settings_verify_workspace'],
        verify_action_id: 'settings_verify_workspace',
        verify_route: routeFor('settings_verify_workspace'),
        persistence_target: 'opl_workspace_root_config',
        authority_flags: settingsAuthorityFlags(),
      },
      {
        configuration_id: 'update_channel',
        stable_id: 'settings.configuration.update_channel',
        label: 'Update channel',
        surface_class: 'configuration',
        owner: 'one-person-lab',
        lifecycle: 'persistent_configuration_mutation',
        value_type: 'enum',
        allowed_values: ['stable', 'preview'],
        current_value: asString(input.release.channel),
        source_ref: 'app_state.release.channel',
        action_id: 'update_channel',
        route: routeFor('update_channel'),
        delegated_surface: 'opl system update-channel',
        payload_fields: ['channel'],
        payload_required: true,
        mutates: 'opl_update_channel_config',
        dry_run_supported: true,
        confirmation_required: false,
        danger_level: 'low',
        impact: 'updates_framework_owned_release_channel_preference',
        rollback_action_id: null,
        follow_up_action_ids: [],
        verify_action_id: null,
        verify_route: null,
        verify_ref: 'app_state.release.channel',
        persistence_target: 'opl_update_channel_config',
        authority_flags: settingsAuthorityFlags(),
      },
      {
        configuration_id: 'developer_supervisor',
        stable_id: 'settings.configuration.developer_supervisor',
        label: 'Developer supervisor',
        surface_class: 'configuration',
        owner: 'one-person-lab',
        lifecycle: 'persistent_configuration_mutation',
        value_type: 'object',
        current_value: {
          status: asString(developerProfile.status),
          effective_state: asString(input.developerMode.effective_state),
          mode: asString(input.developerMode.mode),
        },
        source_ref: 'app_state.developer_mode',
        action_id: 'developer_supervisor',
        route: routeFor('developer_supervisor'),
        delegated_surface: 'opl system developer-supervisor',
        payload_fields: [
          'developerSupervisorEnabled',
          'developerSupervisorMode',
          'developerSupervisorAutoEnableGithubLogin',
        ],
        payload_required: true,
        mutates: 'opl_developer_supervisor_config',
        dry_run_supported: true,
        confirmation_required: false,
        danger_level: 'low',
        impact: 'updates_framework_owned_developer_supervisor_policy',
        rollback_action_id: null,
        follow_up_action_ids: ['developer_supervisor_refresh'],
        verify_action_id: 'developer_supervisor_refresh',
        verify_route: routeFor('developer_supervisor_refresh'),
        persistence_target: 'opl_developer_supervisor_config',
        authority_flags: settingsAuthorityFlags(),
      },
    ],
    excluded_surfaces: [
      { configuration_id: 'app_local_preferences', owner: 'one-person-lab-app' },
      { configuration_id: 'model_catalog', owner: 'one-person-lab-app_or_provider_owner' },
      { configuration_id: 'theme', owner: 'one-person-lab-app' },
      { configuration_id: 'notifications', owner: 'one-person-lab-app' },
      { configuration_id: 'data_retention', owner: 'domain_or_app_owner' },
      { configuration_id: 'connection_credentials', owner: 'provider_or_connection_owner' },
    ],
    exclusion_policy: 'framework_must_not_store_or_infer_app_product_truth_provider_secrets_or_domain_policy',
  };
}

function settingsSurfacePolicy() {
  return {
    configuration: {
      owner: 'one-person-lab',
      surface_ref: 'app_state.settings_control_center.configuration_catalog',
      policy: 'persistent_framework_owned_values_with_existing_actions_only',
    },
    status: {
      owner: 'source_projection_owner',
      surface_ref: 'app_state.settings_control_center.settings_projection.sections',
      policy: 'read_only_summary_no_configuration_inference',
    },
    diagnostic: {
      owner: 'one-person-lab',
      surface_ref: 'app_state.settings_control_center.settings_projection.sections.diagnostics',
      policy: 'read_only_refs_for_troubleshooting_not_ordinary_settings',
    },
    action: {
      owner: 'one-person-lab',
      surface_ref: 'app_state.settings_control_center.action_catalog',
      policy: 'one_time_actions_independent_from_persistent_configuration_catalog',
    },
    app_product_truth_policy: 'not_owned_or_copied_by_framework',
  };
}

function buildAppSettingsReadModel(
  input: BuildSettingsControlCenterInput,
  taskEntries: ReturnType<typeof buildTaskEntries>,
  issueQueue: Array<Record<string, unknown>>,
  settingsIa: ReturnType<typeof buildSettingsIa>,
  consumerOnlyReadback: ReturnType<typeof buildAppAionConsumerOnlyReadback>,
  connectionRegistry: ReturnType<typeof listOplConnections>,
) {
  const codex = asRecord(asRecord(input.core).codex);
  const defaultProfile = asRecord(codex.default_profile);
  const developerProfile = asRecord(asRecord(input.developerMode).developer_profile);
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const moduleSource = asRecord(asRecord(input.modules).source);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const workspaceRoot = asRecord(input.paths.workspace_root);
  const familyWorkspaceRoot = asRecord(input.paths.family_workspace_root);
  const codexAccess = resolveSettingsCodexAccess(input.core);
  const temporalStatus = asString(temporal.health_status) ?? asString(temporal.status);
  const moduleHealth = `${moduleSummary.healthy_default_modules_count ?? 0}/${moduleSummary.default_modules_count ?? 0}`;
  const capabilityTaskAwarenessRefs = buildCapabilityTaskAwarenessRefs(input);

  return {
    surface_kind: 'opl_app_settings_read_model.v1',
    schema_version: 'opl_app_settings_read_model.v1',
    owner: 'one-person-lab',
    source_surface: 'app_state.settings_control_center',
    source_refs: [
      'app_state.core.codex',
      'app_state.developer_mode',
      'app_state.modules',
      'app_state.provider',
      'app_state.paths',
      'app_state.release',
      'app_state.settings_control_center.settings_ia',
      'app_state.settings_control_center.action_catalog',
      'app_state.settings_control_center.capability_task_awareness_refs',
      'app_state.settings_control_center.connection_registry',
    ],
    shell_policy: {
      app_consumes_read_model_only: true,
      aion_shell_is_renderer_only: true,
      shell_must_not_rewrite_model_or_reasoning_policy: true,
      shell_must_not_infer_api_key_or_workspace_service_truth: true,
      shell_must_not_execute_unlisted_actions: true,
    },
    connections: {
      surface_kind: 'opl_settings_connections_read_model.v1',
      source_ref: 'app_state.settings_control_center.connection_registry',
      credential_policy: 'handle_only',
      allowed_statuses: connectionRegistry.allowed_statuses,
      default_connection_id: connectionRegistry.default_connection_id,
      connections: connectionRegistry.connections,
      action_ids: [
        'connection_list',
        'connection_create',
        'connection_update',
        'connection_delete',
        'connection_test',
        'connection_set_default',
      ],
      runtime_readiness_claimed: false,
    },
    page_structure: {
      ordinary_entry: settingsIa.ordinary_entry,
      ordinary_route_ids: settingsIa.ordinary_route_ids,
      secondary_or_deep_link_route_ids: settingsIa.secondary_or_deep_link_route_ids,
      route_groups: settingsIa.route_groups,
      secondary_or_deep_link_routes: settingsIa.secondary_or_deep_link_routes,
      action_sections: SETTINGS_CONTROL_CENTER_ACTION_SECTIONS.map((section) => ({
        section_id: section.section_id,
        label: section.label,
        state: sectionState(section.section_id, input),
        source_ref: section.source_ref,
        action_ids: taskEntries
          .filter((entry) => entry.section_id === section.section_id)
          .map((entry) => entry.action_id),
      })),
    },
    codex_model_policy: {
      source_ref: 'app_state.core.codex',
      model: asString(codex.default_model) ?? asString(defaultProfile.model) ?? 'unknown',
      reasoning_effort: asString(codex.default_reasoning_effort) ?? asString(defaultProfile.model_reasoning_effort),
      model_provider: asString(defaultProfile.model_provider),
      provider_name: asString(defaultProfile.provider_name),
      provider_base_url: asString(codex.provider_base_url) ?? asString(defaultProfile.base_url),
      config_path: asString(codex.config_path),
      profile_source: codex.config_path ? 'local_codex_config' : 'bundled_opl_default_profile',
      api_key_present: codexAccess.api_key_present,
      opl_gateway_configured: codexAccess.opl_gateway_configured,
      model_access_ready: codexAccess.model_access_ready,
      model_access_source: codexAccess.model_access_source,
      access_status: codexAccess.model_access_status,
      repair_action_id: 'settings_repair_model_access',
      shell_must_not_rewrite_policy: true,
    },
    access_api_key: {
      source_ref: 'app_state.core.codex.model_access_ready',
      status: codexAccess.model_access_status,
      api_key_present: codexAccess.api_key_present,
      opl_gateway_configured: codexAccess.opl_gateway_configured,
      model_access_ready: codexAccess.model_access_ready,
      model_access_source: codexAccess.model_access_source,
      config_path: codexAccess.config_path,
      required_for: 'agent_tasks_from_settings',
      repair_action_id: 'settings_repair_model_access',
      repair_route: routeFor('settings_repair_model_access'),
      developer_mode: {
        status: asString(input.developerMode.status),
        effective_state: asString(input.developerMode.effective_state),
        mode: asString(input.developerMode.mode),
        developer_profile_status: asString(developerProfile.status),
      },
    },
    workspace_services: {
      workspace_root: {
        source_ref: 'app_state.paths.workspace_root',
        selected_path: asString(workspaceRoot.selected_path) ?? asString(input.paths.workspace_root_path),
        source: asString(workspaceRoot.source),
        exists: workspaceRoot.exists === true,
        writable: workspaceRoot.writable === true,
        health_status: asString(workspaceRoot.health_status) ?? 'unknown',
        verify_action_id: 'settings_verify_workspace',
        verify_route: routeFor('settings_verify_workspace'),
      },
      family_workspace_root: {
        source_ref: 'app_state.paths.family_workspace_root',
        selected_path: asString(familyWorkspaceRoot.selected_path),
        source: asString(familyWorkspaceRoot.source),
        role: asString(familyWorkspaceRoot.role),
      },
      modules: {
        source_ref: 'app_state.modules.summary',
        source_mode: asString(moduleSource.mode),
        modules_root: asString(input.paths.modules_root),
        default_modules_count: moduleSummary.default_modules_count ?? 0,
        healthy_default_modules_count: moduleSummary.healthy_default_modules_count ?? 0,
        health: moduleHealth,
        sync_action_id: 'settings_sync_capabilities',
        apply_action_id: 'settings_apply_opl_packages',
        capability_health_refs: capabilityTaskAwarenessRefs.capability_health_refs,
        connector_readiness_refs: capabilityTaskAwarenessRefs.connector_readiness_refs,
        workflow_refs: capabilityTaskAwarenessRefs.workflow_refs,
      },
      local_services: {
        source_ref: 'app_state.provider.temporal',
        temporal_provider: statusTone(temporalStatus),
        temporal_health_status: asString(temporal.health_status),
        temporal_status: asString(temporal.status),
        selected_provider: asString(input.provider.selected_provider),
        service_action_ids: [
          'settings_sync_capabilities',
          'settings_apply_opl_packages',
          'settings_reload_codex_surface',
        ],
      },
    },
    docker_webui: buildDockerWebuiSettingsReadModel(input, taskEntries, issueQueue),
    local_environment: {
      source_ref: 'app_state.paths + app_state.release + app_state.provider',
      state_dir: asString(input.paths.state_dir),
      modules_root: asString(input.paths.modules_root),
      logs_dir: asString(input.paths.logs_dir),
      update_channel_file: asString(input.paths.update_channel_file),
      developer_supervisor_config_file: asString(input.paths.developer_supervisor_config_file),
      release_channel: asString(input.release.channel) ?? 'unknown',
      app_update_action_id: 'settings_check_app_update',
      runtime_roots_cleanup_action_id: 'settings_prune_runtime_roots_dry_run',
      runtime_substrate_rollback_action_id: 'settings_rollback_runtime_substrate',
      temporal_provider: statusTone(temporalStatus),
    },
    capability_task_awareness_refs: capabilityTaskAwarenessRefs,
    consumer_only_readback: consumerOnlyReadback,
    action_policy: {
      source_ref: 'app_state.settings_control_center.action_catalog',
      action_surface: 'opl app action execute --json',
      allowed_action_ids: [...SETTINGS_ALLOWED_ACTION_IDS],
      payload_required_action_ids: taskEntries
        .filter((entry) => entry.payload_required)
        .map((entry) => entry.action_id)
        .concat(SETTINGS_CONFIGURATION_ACTION_IDS),
      dry_run_supported_action_ids: taskEntries
        .filter((entry) => entry.dry_run_supported)
        .map((entry) => entry.action_id)
        .concat(SETTINGS_CONFIGURATION_ACTION_IDS),
      issue_count: issueQueue.length,
      authority_flags: settingsAuthorityFlags(),
    },
  };
}

function issueRoute(actionId: string | null) {
  return actionId ? routeFor(actionId) : null;
}

function buildIssueQueue(input: BuildSettingsControlCenterInput) {
  const issues: Array<Record<string, unknown>> = [];
  const codexAccess = resolveSettingsCodexAccess(input.core);
  const developerProfile = asRecord(asRecord(input.developerMode).developer_profile);
  const developerEffectiveState = asString(input.developerMode.effective_state);
  const moduleItems = asList(input.modules.items);
  const temporal = asRecord(asRecord(input.provider).temporal);

  if (!codexAccess.model_access_ready) {
    issues.push({
      issue_id: 'model_access_manual_required',
      status_code: 'manual_required',
      label: 'Model access is not configured',
      user_message: 'Codex model access is missing or unreadable. Configure OPL Gateway before running WebUI or agent tasks from Settings.',
      severity: 'warning',
      source_ref: 'app_state.core.codex.model_access_ready',
      recommended_action_id: 'settings_configure_webui_api_key',
      route: issueRoute('settings_configure_webui_api_key'),
    });
  }

  const dirtyModules = moduleItems.filter((entry) => asString(entry.health_status) === 'dirty');
  if (dirtyModules.length > 0) {
    issues.push({
      issue_id: 'module_dirty_checkout',
      status_code: 'dirty_checkout',
      label: 'Local module checkout has uncommitted changes',
      user_message: 'One or more module checkouts are dirty. Settings will not overwrite them; review or commit those changes first.',
      severity: 'warning',
      source_ref: 'app_state.modules.items[].health_status',
      affected_ids: dirtyModules.map((entry) => asString(entry.module_id)).filter(Boolean),
      recommended_action_id: 'settings_sync_capabilities',
      route: issueRoute('settings_sync_capabilities'),
    });
  }

  const manualModules = moduleItems.filter((entry) =>
    ['missing', 'invalid_checkout'].includes(asString(entry.health_status) ?? '')
  );
  if (manualModules.length > 0) {
    issues.push({
      issue_id: 'module_install_manual_required',
      status_code: 'manual_required',
      label: 'OPL package attention required',
      user_message: 'One or more default OPL packages are missing or invalid. Use the package actions only through OPL-owned routes.',
      severity: 'warning',
      source_ref: 'app_state.modules.items[].health_status',
      affected_ids: manualModules.map((entry) => asString(entry.module_id)).filter(Boolean),
      recommended_action_id: 'settings_apply_opl_packages',
      route: issueRoute('settings_apply_opl_packages'),
    });
  }

  const temporalStatus = asString(temporal.health_status) ?? asString(temporal.status);
  if (temporalStatus && !['ready', 'healthy', 'ok', 'installed', 'enabled', 'stable'].includes(temporalStatus)) {
    issues.push({
      issue_id: 'provider_failed_with_repair',
      status_code: 'failed_with_repair',
      label: 'Runtime provider needs repair or verification',
      user_message: 'The selected runtime provider is not ready. Settings can point to existing repair routes but cannot mark domain work ready.',
      severity: 'error',
      source_ref: 'app_state.provider.temporal',
      recommended_action_id: 'settings_sync_capabilities',
      route: issueRoute('settings_sync_capabilities'),
    });
  }

  if (
    ['ready', 'limited'].includes(asString(developerProfile.status) ?? '')
    && developerEffectiveState
    && developerEffectiveState !== 'disabled'
    && developerEffectiveState !== 'blocked'
  ) {
    issues.push({
      issue_id: 'developer_profile_active',
      status_code: 'developer_profile_active',
      label: 'Developer Mode profile is active',
      user_message: 'Developer Mode can expose supervised repair routes. This does not authorize domain truth writes or release-ready claims.',
      severity: 'info',
      source_ref: 'app_state.developer_mode.developer_profile',
      recommended_action_id: 'settings_repair_model_access',
      route: issueRoute('settings_repair_model_access'),
    });
  }

  return issues.map((issue) => ({
    ...issue,
    owner_surface: 'opl_framework_settings_control_center',
    authority_flags: settingsAuthorityFlags(),
  }));
}

export type BuildSettingsControlCenterInput = {
  profile: 'fast' | 'full';
  core: JsonRecord;
  developerMode: JsonRecord;
  modules: JsonRecord;
  provider: JsonRecord;
  release: JsonRecord;
  paths: JsonRecord;
};

export function buildSettingsControlCenter(input: BuildSettingsControlCenterInput) {
  const codex = asRecord(asRecord(input.core).codex);
  const codexAccess = resolveSettingsCodexAccess(input.core);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const releaseChannel = asString(input.release.channel) ?? 'unknown';
  const moduleSummary = asRecord(asRecord(input.modules).summary);
  const taskEntries = buildTaskEntries(input);
  const issueQueue = buildIssueQueue(input);
  const settingsIa = buildSettingsIa(taskEntries);
  const capabilityTaskAwarenessRefs = buildCapabilityTaskAwarenessRefs(input);
  const appAionConsumerOnlyReadback = buildAppAionConsumerOnlyReadback();
  const connectionRegistry = listOplConnections();
  const settingsProjection = buildSettingsProjection(
    input,
    taskEntries,
    issueQueue,
    settingsIa,
    connectionRegistry,
  );
  const configurationCatalog = buildConfigurationCatalog(input);
  const appSettingsReadModel = buildAppSettingsReadModel(
    input,
    taskEntries,
    issueQueue,
    settingsIa,
    appAionConsumerOnlyReadback,
    connectionRegistry,
  );

  return {
    surface_kind: 'opl_settings_control_center.v2',
    schema_version: 'settings-control-center.v2',
    compatibility_schema_versions: ['settings-control-center.v1'],
    profile: input.profile,
    owner: 'one-person-lab',
    contract_ref: SETTINGS_CONTROL_CENTER_CONTRACT_REF,
    read_surface: input.profile === 'fast'
      ? 'opl app state --profile fast --json#settings_control_center'
      : 'opl app state --profile full --json#settings_control_center',
    action_surface: 'opl app action execute --json',
    allowed_action_ids: [...SETTINGS_ALLOWED_ACTION_IDS],
    status_summary: {
      model_access: codexAccess.model_access_status,
      codex_version: asString(codex.parsed_version) ?? asString(codex.version) ?? 'missing',
      module_health: `${moduleSummary.healthy_default_modules_count ?? 0}/${moduleSummary.default_modules_count ?? 0}`,
      temporal_provider: statusTone(asString(temporal.status) ?? asString(temporal.health_status)),
      release_channel: releaseChannel,
      issue_count: issueQueue.length,
    },
    settings_ia: settingsIa,
    surface_policy: settingsSurfacePolicy(),
    configuration_catalog: configurationCatalog,
    settings_projection: settingsProjection,
    app_settings_read_model: appSettingsReadModel,
    app_aion_consumer_only_readback: appAionConsumerOnlyReadback,
    capability_task_awareness_refs: capabilityTaskAwarenessRefs,
    connection_registry: connectionRegistry,
    control_center_groups: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => ({
      ...group,
      state: groupState(group, input),
      task_entry_count: taskEntries.filter((entry) => group.action_section_ids.includes(entry.section_id)).length,
    })),
    sections: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => ({
      ...group,
      section_id: group.group_id,
      state: groupState(group, input),
      task_entry_count: taskEntries.filter((entry) => group.action_section_ids.includes(entry.section_id)).length,
    })),
    action_sections: SETTINGS_CONTROL_CENTER_ACTION_SECTIONS.map((section) => ({
      ...section,
      state: sectionState(section.section_id, input),
      task_entry_count: taskEntries.filter((entry) => entry.section_id === section.section_id).length,
    })),
    task_entries: taskEntries,
    action_catalog: SETTINGS_CONTROL_CENTER_ACTIONS.map(actionCatalogEntry),
    action_taxonomy: Object.fromEntries(
      SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => [action.action_id, action.taxonomy]),
    ),
    issue_catalog: SETTINGS_ISSUE_CATALOG.map((issue) => ({
      ...issue,
      route: issueRoute(issue.recommended_action_id),
    })),
    issue_queue: issueQueue,
    dry_run_apply_verify_boundary: {
      dry_run: 'preflight_only_no_domain_or_runtime_authority_write',
      apply: 'delegates_only_to_existing_opl_owned_app_action_routes',
      verify: 'read_existing_opl_app_state_or_existing_opl_owned_status_actions',
      runtime_roots_cleanup: 'dry_run_plan_only_no_delete',
    },
    authority_boundary: {
      framework_owner: 'one-person-lab',
      app_repo_owner: 'one-person-lab-app_gui_product_truth_only',
      shell_owner: 'thin_renderer_and_ipc_adapter',
      can_write_domain_truth: false,
      can_sign_domain_receipt: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_provider_queue: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_quality_verdict: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
  };
}

export function settingsControlCenterActionById(actionId: string) {
  return SETTINGS_CONTROL_CENTER_ACTIONS.find((action) => action.action_id === actionId) ?? null;
}
