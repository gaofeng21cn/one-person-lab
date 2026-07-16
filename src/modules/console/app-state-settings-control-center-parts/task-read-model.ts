import { resolveSettingsCodexAccess } from './codex-access-read-model.ts';
import {
  SETTINGS_CONTROL_CENTER_ACTION_SECTIONS,
  SETTINGS_CONTROL_CENTER_ACTIONS,
  SETTINGS_CONTROL_CENTER_COMPATIBILITY_REDIRECTS,
  SETTINGS_CONTROL_CENTER_GROUPS,
  SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES,
  type SettingsAction,
  type SettingsControlCenterGroup,
} from './catalog.ts';
import {
  asList,
  asRecord,
  asString,
  routeFor,
  settingsAuthorityFlags,
  statusTone,
  type BuildSettingsControlCenterInput,
  type JsonRecord,
} from './shared.ts';

export const SETTINGS_CONFIGURATION_ACTION_IDS = [
  'workspace_root_set',
  'update_channel',
  'developer_supervisor',
] as const;

export function actionCatalogEntry(action: SettingsAction) {
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

function runtimeSourceCarrierRef(entry: JsonRecord) {
  const packageId = asString(entry.package_id) ?? 'unknown';
  return `app_state.runtime_source_carriers.items.${packageId}`;
}

export function buildCapabilityTaskAwarenessRefs(input: BuildSettingsControlCenterInput) {
  const moduleItems = asList(input.modules.items);
  const temporal = asRecord(asRecord(input.provider).temporal);
  const temporalStatus = asString(temporal.health_status) ?? asString(temporal.status) ?? 'unknown';
  return {
    surface_kind: 'opl_settings_capability_task_awareness_refs.v1',
    source_refs: [
      'app_state.runtime_source_carriers.items',
      'app_state.provider.temporal',
      'app_state.actions#task_action_receipt_preview',
      'app_state.actions#task_export_bundle_preview',
      'app_state.operator.workbench.task_drilldowns[].workflow_refs',
    ],
    capability_health_refs: moduleItems.map((entry) => {
      const packageId = asString(entry.package_id) ?? 'unknown';
      const status = asString(entry.source_health_status) ?? 'unknown';
      return {
        id: packageId,
        title: asString(entry.label) ?? packageId,
        status,
        ref: runtimeSourceCarrierRef(entry),
        owner: 'one-person-lab',
        next_action: status === 'ready' ? 'none' : 'settings_sync_capabilities',
      };
    }),
    connector_readiness_refs: [
      {
        id: 'temporal_provider',
        title: 'Temporal provider',
        status: statusTone(temporalStatus),
        ref: 'app_state.provider.temporal',
        owner: 'one-person-lab',
        next_action: statusTone(temporalStatus) === 'ready' ? 'provider_scheduler_status' : 'provider_service_status',
      },
      {
        id: 'codex_surface',
        title: 'Codex-visible capability surface',
        status: 'refs_available',
        ref: 'app_state.actions#agent_package_activate',
        owner: 'one-person-lab',
        next_action: 'agent_package_activate',
      },
    ],
    workflow_refs: [
      {
        id: 'task_action_receipt_preview', title: 'Plan-approve-run receipt preview', status: 'dry_run_refs_only',
        ref: 'app_state.actions#task_action_receipt_preview', owner: 'one-person-lab', next_action: 'execute_dry_run_preview',
      },
      {
        id: 'task_export_bundle_preview', title: 'Reproducibility export bundle preview', status: 'dry_run_refs_only',
        ref: 'app_state.actions#task_export_bundle_preview', owner: 'one-person-lab', next_action: 'execute_dry_run_preview',
      },
      {
        id: 'current_task_workflow_refs', title: 'Current task workflow refs', status: 'refs_available',
        ref: 'app_state.operator.workbench.task_drilldowns[].workflow_refs', owner: 'domain_owner_projection',
        next_action: 'list_refs_only_no_workflow_body',
      },
    ],
    content_policy: 'refs_only_no_skill_body_no_workflow_body',
    authority_boundary: settingsAuthorityFlags(),
  };
}

function actionState(action: SettingsAction, input: BuildSettingsControlCenterInput) {
  if (action.action_id === 'settings_repair_model_access') return resolveSettingsCodexAccess(input.core).model_access_status;
  if (action.action_id === 'settings_configure_webui_api_key') return resolveSettingsCodexAccess(input.core).opl_gateway_status;
  if (action.action_id === 'settings_sync_capabilities' || action.action_id === 'settings_apply_opl_packages') {
    const summary = asRecord(asRecord(input.modules).summary);
    return summary.healthy_default_carriers_count === summary.default_carriers_count ? 'ready' : 'attention_needed';
  }
  if (action.action_id === 'settings_prune_runtime_roots_dry_run') return 'plan_only';
  if (action.action_id === 'settings_open_docker_webui' || action.action_id === 'settings_diagnose_docker_webui') return 'ready';
  if (action.action_id === 'settings_rollback_runtime_substrate') return 'manual_required';
  return 'ready';
}

export function sectionState(sectionId: string, input: BuildSettingsControlCenterInput) {
  const relatedActions = SETTINGS_CONTROL_CENTER_ACTIONS.filter((action) => action.section_id === sectionId);
  if (relatedActions.some((action) => actionState(action, input) === 'attention_needed')) return 'attention_needed';
  return SETTINGS_CONTROL_CENTER_ACTION_SECTIONS.find((section) => section.section_id === sectionId)?.state ?? 'available';
}

export function groupState(group: SettingsControlCenterGroup, input: BuildSettingsControlCenterInput) {
  if (group.action_section_ids.length === 0) return 'available';
  return group.action_section_ids.some((sectionId) => sectionState(sectionId, input) === 'attention_needed')
    ? 'attention_needed'
    : 'available';
}

export function buildTaskEntries(input: BuildSettingsControlCenterInput) {
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

export function buildSettingsIa(taskEntries: ReturnType<typeof buildTaskEntries>) {
  return {
    surface_kind: 'opl_settings_control_center_ia.v1',
    ordinary_entry: 'settings_control_center',
    entry_policy: 'top_level_control_center_route',
    layout_authority: {
      owner: 'one-person-lab-app',
      source_ref: 'one-person-lab-app/contracts/app-product-profile.json#settings_control_center',
      framework_role: 'project_framework_owned_status_actions_and_compatibility_routes_only',
      broad_app_state_layout_inference_allowed: false,
    },
    ordinary_route_ids: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => group.route_id),
    secondary_or_deep_link_route_ids: SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES.map((route) => route.route_id),
    route_groups: SETTINGS_CONTROL_CENTER_GROUPS.map((group) => ({
      route_id: group.route_id, group_id: group.group_id, label: group.label, role: group.role,
      action_section_ids: group.action_section_ids,
      action_ids: taskEntries.filter((entry) => group.action_section_ids.includes(entry.section_id)).map((entry) => entry.action_id),
    })),
    secondary_or_deep_link_routes: SETTINGS_CONTROL_CENTER_SECONDARY_ROUTES.map((route) => ({
      route_id: route.route_id, group_id: route.group_id, parent_route_id: route.parent_route_id,
      label: route.label, role: route.role, action_section_ids: route.action_section_ids,
      action_ids: taskEntries.filter((entry) => route.action_section_ids.includes(entry.section_id)).map((entry) => entry.action_id),
      route_scope: 'secondary_or_deep_link', ordinary_entry_policy: route.ordinary_entry_policy,
      app_shell_must_not_promote_to_top_level_tab: true,
    })),
    compatibility_redirects: SETTINGS_CONTROL_CENTER_COMPATIBILITY_REDIRECTS.map((redirect) => ({
      ...redirect,
      route_scope: 'compatibility_only',
      app_shell_must_resolve_before_render: true,
    })),
    app_shell_contract: {
      app_consumes_read_model_only: true,
      aion_shell_is_renderer_only: true,
      layout_source: 'one-person-lab-app/contracts/app-product-profile.json#settings_control_center',
      broad_app_state_layout_inference_allowed: false,
      shell_must_not_infer_domain_truth: true,
      shell_must_not_execute_unlisted_actions: true,
    },
  };
}
