import type { AgentWorkspaceNormContract, FrameworkContracts } from '../../kernel/types.ts';
import { SETTINGS_CONTROL_CENTER_ACTIONS } from './app-state-settings-control-center.ts';
import { listExternalOwnerDelegatedUpdateActions } from '../connect/public/app-state.ts';

type AppActionCatalogEntry = {
  action_id: string;
  label: string;
  surface: 'opl app action execute';
  delegated_surface: string;
  payload_fields: string[];
  mutates: string;
  dry_run_supported?: boolean;
  confirmation_required?: boolean;
  danger_level?: string;
  impact?: string;
  rollback_action_id?: string;
  follow_up_action_ids?: string[];
  verify_action_id?: string;
};

function annotateAppActionRoute(action: AppActionCatalogEntry) {
  const payloadRequired = action.payload_fields.length > 0;
  const dryRunSupported = action.dry_run_supported ?? !payloadRequired;
  return {
    ...action,
    owner: 'opl_framework',
    submit_via: 'opl app action execute',
    execution_policy: 'opl_safe_action_shell',
    route_requires_domain_or_app_payload: payloadRequired,
    can_submit_to_safe_action_shell: !payloadRequired,
    dry_run_supported: dryRunSupported,
    route: `opl app action execute --action ${action.action_id}`,
  };
}

function payloadFieldsFromWorkspaceNorm(contract: AgentWorkspaceNormContract) {
  return contract.default_workspace_precondition.optional_inputs
    .filter((field) => !['dry_run', 'force', 'bind'].includes(field))
    .map((field) => field === 'workspace_path_or_workspace_root' ? 'workspace_root_optional' : field);
}

function workspaceActionsFromNorm(contract: AgentWorkspaceNormContract): AppActionCatalogEntry[] {
  const payloadFields = [
    ...contract.default_workspace_precondition.required_inputs,
    ...payloadFieldsFromWorkspaceNorm(contract),
  ];
  return [
    {
      action_id: contract.explicit_initialization.app_action_id,
      label: 'Initialize agent workspace',
      surface: 'opl app action execute',
      delegated_surface: contract.explicit_initialization.command,
      payload_fields: payloadFields,
      mutates: 'opl_workspace_topology_and_registry',
      dry_run_supported: true,
    },
    {
      action_id: contract.default_workspace_precondition.app_action_id,
      label: 'Ensure agent workspace',
      surface: 'opl app action execute',
      delegated_surface: contract.default_workspace_precondition.command,
      payload_fields: payloadFields,
      mutates: 'opl_workspace_topology_and_registry',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_validate',
      label: 'Validate agent workspace',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace validate',
      payload_fields: ['workspace_path'],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
    {
      action_id: 'workspace_doctor',
      label: 'Diagnose agent workspace',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace doctor',
      payload_fields: ['workspace_path'],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
    {
      action_id: 'workspace_adopt_dry_run',
      label: 'Plan existing workspace adoption',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace adopt --dry-run',
      payload_fields: payloadFields,
      mutates: 'none_read_only',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_adopt_apply',
      label: 'Apply existing workspace adoption',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace adopt --apply',
      payload_fields: payloadFields,
      mutates: 'opl_workspace_topology_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_upgrade',
      label: 'Upgrade workspace projection',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace upgrade',
      payload_fields: ['workspace_path'],
      mutates: 'opl_workspace_topology_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_project_archive',
      label: 'Archive workspace project',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace project archive',
      payload_fields: ['workspace_path', 'project_id', 'reason'],
      mutates: 'opl_workspace_project_lifecycle_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_project_lifecycle',
      label: 'Change workspace project lifecycle',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace project lifecycle',
      payload_fields: ['workspace_path', 'project_id', 'status', 'reason', 'superseded_by_project_id'],
      mutates: 'opl_workspace_project_lifecycle_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_project_pause',
      label: 'Pause workspace project',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace project lifecycle',
      payload_fields: ['workspace_path', 'project_id', 'reason'],
      mutates: 'opl_workspace_project_lifecycle_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_project_resume',
      label: 'Resume workspace project',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace project lifecycle',
      payload_fields: ['workspace_path', 'project_id', 'reason'],
      mutates: 'opl_workspace_project_lifecycle_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_project_lock',
      label: 'Lock workspace project',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace project lifecycle',
      payload_fields: ['workspace_path', 'project_id', 'reason'],
      mutates: 'opl_workspace_project_lifecycle_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_project_supersede',
      label: 'Supersede workspace project',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace project lifecycle',
      payload_fields: ['workspace_path', 'project_id', 'superseded_by_project_id', 'reason'],
      mutates: 'opl_workspace_project_lifecycle_projection',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_project_delete',
      label: 'Check workspace project delete gate',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace project delete',
      payload_fields: ['workspace_path', 'project_id', 'owner_receipt_ref'],
      mutates: 'none_read_only',
      dry_run_supported: true,
    },
    {
      action_id: 'workspace_export_map',
      label: 'Export workspace map',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace export-map',
      payload_fields: ['workspace_path'],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
    {
      action_id: 'workspace_inspect',
      label: 'Inspect workspace',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace inspect',
      payload_fields: ['workspace_path'],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
    {
      action_id: 'workspace_inventory',
      label: 'Inspect workspace inventory',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace inventory',
      payload_fields: ['workspace_path'],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
    {
      action_id: 'workspace_health',
      label: 'Read workspace health',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace health',
      payload_fields: ['workspace_path'],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
    {
      action_id: 'workspace_report',
      label: 'Read workspace report',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace report',
      payload_fields: ['workspace_path'],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
    {
      action_id: 'workspace_fleet_report',
      label: 'Read workspace fleet report',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace fleet report',
      payload_fields: [],
      mutates: 'none_read_only',
      dry_run_supported: false,
    },
  ];
}

export function buildActionCatalog(contracts: FrameworkContracts) {
  const codexActions: AppActionCatalogEntry[] = (['install', 'update', 'reinstall', 'remove'] as const).map((action) => ({
    action_id: `codex_${action}`,
    label: `${action[0].toUpperCase()}${action.slice(1)} Codex CLI`,
    surface: 'opl app action execute',
    delegated_surface: `opl engine ${action} --engine codex`,
    payload_fields: [],
    mutates: 'opl_codex_cli_runtime',
  }));
  const moduleActions: AppActionCatalogEntry[] = (['install', 'update', 'reinstall', 'remove'] as const).map((action) => ({
    action_id: `module_${action}`,
    label: `${action[0].toUpperCase()}${action.slice(1)} OPL module`,
    surface: 'opl app action execute',
    delegated_surface: `opl connect ${action} --module <module_id>`,
    payload_fields: ['module_id'],
    mutates: 'opl_module_checkout',
  }));
  const actions: AppActionCatalogEntry[] = [
    {
      action_id: 'developer_supervisor',
      label: 'Configure Developer Mode',
      surface: 'opl app action execute',
      delegated_surface: 'opl system developer-supervisor',
      payload_fields: [
        'developerSupervisorEnabled',
        'developerSupervisorMode',
        'developerSupervisorAutoEnableGithubLogin',
        'developerSupervisorModuleId',
        'developerSupervisorModuleSource',
      ],
      mutates: 'opl_developer_supervisor_config',
    },
    {
      action_id: 'developer_supervisor_refresh',
      label: 'Refresh Developer Mode authority',
      surface: 'opl app action execute',
      delegated_surface: 'opl system developer-supervisor',
      payload_fields: [],
      mutates: 'none_read_only',
    },
    {
      action_id: 'update_channel',
      label: 'Configure release channel',
      surface: 'opl app action execute',
      delegated_surface: 'opl system update-channel',
      payload_fields: ['channel'],
      mutates: 'opl_update_channel_config',
    },
    ...codexActions,
    ...listExternalOwnerDelegatedUpdateActions().map((action) => ({
      action_id: action.action_id,
      label: action.label,
      surface: action.surface,
      delegated_surface: action.delegated_surface,
      payload_fields: action.payload_fields,
      mutates: `external_dependency_via_${action.owner_kind}`,
      dry_run_supported: true,
      confirmation_required: action.confirmation_required,
      danger_level: action.danger_level,
      impact: 'Delegates one update to the verified original package manager; never enters managed background apply.',
    })),
    ...moduleActions,
    {
      action_id: 'module_sync',
      label: 'Sync OPL modules',
      surface: 'opl app action execute',
      delegated_surface: 'opl packages update',
      payload_fields: [],
      mutates: 'opl_module_checkout',
    },
    {
      action_id: 'runtime_action_execute',
      label: 'Execute runtime operator action',
      surface: 'opl app action execute',
      delegated_surface: 'opl runtime action execute',
      payload_fields: ['action_id', 'payload', 'dry_run'],
      mutates: 'provider_or_runtime_action_route',
    },
    {
      action_id: 'task_action_receipt_preview',
      label: 'Preview task action receipt',
      surface: 'opl app action execute',
      delegated_surface: 'opl app action execute --action task_action_receipt_preview --dry-run',
      payload_fields: ['task_id', 'action_ref'],
      mutates: 'none_read_only',
      dry_run_supported: true,
      confirmation_required: true,
      danger_level: 'medium',
      impact: 'user_task_action_receipt_preview_refs_only',
    },
    {
      action_id: 'task_export_bundle_preview',
      label: 'Preview reproducibility export bundle',
      surface: 'opl app action execute',
      delegated_surface: 'opl app action execute --action task_export_bundle_preview --dry-run',
      payload_fields: ['task_id', 'export_bundle_ref'],
      mutates: 'none_read_only',
      dry_run_supported: true,
      confirmation_required: true,
      danger_level: 'medium',
      impact: 'reproducibility_export_bundle_receipt_preview_refs_only',
    },
    {
      action_id: 'workspace_root_set',
      label: 'Configure workspace root',
      surface: 'opl app action execute',
      delegated_surface: 'opl workspace root set',
      payload_fields: ['path'],
      mutates: 'opl_workspace_root_config',
    },
    {
      action_id: 'codex_user_instructions_set',
      label: 'Save Codex user instructions',
      surface: 'opl app action execute',
      delegated_surface: '$CODEX_HOME/AGENTS.md atomic write',
      payload_fields: ['content', 'expected_sha256'],
      mutates: 'codex_home_agents_md',
      dry_run_supported: true,
    },
    {
      action_id: 'codex_user_instructions_restore_opl_flow_default',
      label: 'Restore OPL Flow default Codex user instructions',
      surface: 'opl app action execute',
      delegated_surface: 'installed opl-flow package templates/AGENTS.md to $CODEX_HOME/AGENTS.md atomic write',
      payload_fields: ['expected_sha256'],
      mutates: 'codex_home_agents_md',
      dry_run_supported: true,
      confirmation_required: true,
      danger_level: 'medium',
      impact: 'replace_user_agents_with_installed_opl_flow_default_and_keep_backup',
    },
    ...SETTINGS_CONTROL_CENTER_ACTIONS.map((action) => ({
      action_id: action.action_id,
      label: action.label,
      surface: 'opl app action execute' as const,
      delegated_surface: action.delegated_surface,
      payload_fields: action.payload_fields,
      mutates: action.mutates,
      dry_run_supported: action.dry_run_supported,
      confirmation_required: action.confirmation_required,
      danger_level: action.danger_level,
      impact: action.impact,
      rollback_action_id: action.rollback_action_id,
      follow_up_action_ids: action.follow_up_action_ids,
      verify_action_id: action.verify_action_id,
    })),
    ...workspaceActionsFromNorm(contracts.agentWorkspaceNorm),
    {
      action_id: 'provider_scheduler_status',
      label: 'Read Temporal scheduler status',
      surface: 'opl app action execute',
      delegated_surface: 'opl family-runtime scheduler status --provider temporal',
      payload_fields: [],
      mutates: 'none_read_only',
    },
    {
      action_id: 'provider_scheduler_install',
      label: 'Install Temporal scheduler',
      surface: 'opl app action execute',
      delegated_surface: 'opl family-runtime scheduler install --provider temporal',
      payload_fields: [],
      mutates: 'opl_temporal_scheduler',
    },
    {
      action_id: 'provider_scheduler_trigger',
      label: 'Trigger Temporal scheduler',
      surface: 'opl app action execute',
      delegated_surface: 'opl family-runtime scheduler trigger --provider temporal',
      payload_fields: [],
      mutates: 'opl_temporal_scheduler',
    },
    {
      action_id: 'provider_worker_status',
      label: 'Read Temporal worker status',
      surface: 'opl app action execute',
      delegated_surface: 'opl family-runtime worker status --provider temporal',
      payload_fields: [],
      mutates: 'none_read_only',
    },
    {
      action_id: 'provider_worker_start',
      label: 'Start Temporal worker',
      surface: 'opl app action execute',
      delegated_surface: 'opl family-runtime worker start --provider temporal',
      payload_fields: [],
      mutates: 'opl_temporal_worker',
    },
    {
      action_id: 'provider_worker_restart',
      label: 'Restart Temporal worker',
      surface: 'opl app action execute',
      delegated_surface: 'opl family-runtime worker stop/start --provider temporal',
      payload_fields: [],
      mutates: 'opl_temporal_worker',
    },
  ];
  return actions.map(annotateAppActionRoute);
}
