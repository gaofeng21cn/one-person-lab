type AppActionCatalogEntry = {
  action_id: string;
  label: string;
  surface: 'opl app action execute';
  delegated_surface: string;
  payload_fields: string[];
  mutates: string;
};

function annotateAppActionRoute(action: AppActionCatalogEntry) {
  const payloadRequired = action.payload_fields.length > 0;
  return {
    ...action,
    owner: 'opl_framework',
    submit_via: 'opl app action execute',
    execution_policy: 'opl_safe_action_shell',
    route_requires_domain_or_app_payload: payloadRequired,
    can_submit_to_safe_action_shell: !payloadRequired,
    dry_run_supported: !payloadRequired,
    route: `opl app action execute --action ${action.action_id}`,
  };
}

export function buildActionCatalog() {
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
    delegated_surface: `opl module ${action} --module <module_id>`,
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
    ...moduleActions,
    {
      action_id: 'runtime_action_execute',
      label: 'Execute runtime operator action',
      surface: 'opl app action execute',
      delegated_surface: 'opl runtime action execute',
      payload_fields: ['action_id', 'payload', 'dry_run'],
      mutates: 'provider_or_runtime_action_route',
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
      action_id: 'provider_scheduler_tick',
      label: 'Run Temporal scheduler tick',
      surface: 'opl app action execute',
      delegated_surface: 'opl family-runtime scheduler tick --provider temporal',
      payload_fields: ['force', 'limit', 'hydrate'],
      mutates: 'opl_temporal_scheduler_tick',
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
