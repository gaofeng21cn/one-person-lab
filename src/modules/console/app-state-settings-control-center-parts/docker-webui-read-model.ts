import { resolveSettingsCodexAccess } from './codex-access-read-model.ts';

type JsonRecord = Record<string, unknown>;

type SettingsTaskEntry = {
  action_id: string;
  label: string;
  state: string;
  route: string;
  dry_run_route: string;
  payload_fields: string[];
  payload_required: boolean;
  confirmation_required: boolean;
  danger_level: string;
  mutates: string;
};

type DockerWebuiReadModelInput = {
  core: JsonRecord;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function routeFor(actionId: string) {
  return `opl app action execute --action ${actionId}`;
}

function taskEntry(taskEntries: SettingsTaskEntry[], actionId: string) {
  return taskEntries.find((entry) => entry.action_id === actionId) ?? null;
}

function settingsTaskRef(taskEntries: SettingsTaskEntry[], actionId: string) {
  const task = taskEntry(taskEntries, actionId);
  return {
    action_id: actionId,
    label: task?.label ?? actionId,
    state: task?.state ?? 'available',
    route: task?.route ?? routeFor(actionId),
    dry_run_route: task?.dry_run_route ?? `${routeFor(actionId)} --dry-run`,
    payload_fields: task?.payload_fields ?? [],
    payload_required: task?.payload_required ?? false,
    confirmation_required: task?.confirmation_required ?? false,
    danger_level: task?.danger_level ?? 'none',
    mutates: task?.mutates ?? 'unknown',
  };
}

export function buildDockerWebuiSettingsReadModel(
  input: DockerWebuiReadModelInput,
  taskEntries: SettingsTaskEntry[],
  issueQueue: Array<Record<string, unknown>>,
) {
  const codexAccess = resolveSettingsCodexAccess(input.core);
  const dockerActionIds = [
    'settings_install_docker_webui',
    'settings_configure_webui_api_key',
    'settings_select_webui_seed',
    'settings_run_webui_startup_maintenance',
    'settings_open_docker_webui',
    'settings_diagnose_docker_webui',
  ];
  const nextActionIds = codexAccess.model_access_ready
    ? [
        'settings_install_docker_webui',
        'settings_configure_webui_api_key',
        'settings_select_webui_seed',
        'settings_run_webui_startup_maintenance',
        'settings_diagnose_docker_webui',
        'settings_open_docker_webui',
      ]
    : [
        'settings_configure_webui_api_key',
        'settings_install_docker_webui',
        'settings_select_webui_seed',
        'settings_run_webui_startup_maintenance',
        'settings_diagnose_docker_webui',
      ];

  return {
    surface_kind: 'opl_settings_docker_webui_read_model.v1',
    source_ref: 'app_state.settings_control_center.action_catalog + app_state.core.codex',
    doctor_surface: 'opl system docker-webui doctor --json',
    doctor_read_model_ref: 'docker_webui_doctor',
    ordinary_status: codexAccess.model_access_ready ? 'action_available' : 'attention_needed',
    one_click_install: settingsTaskRef(taskEntries, 'settings_install_docker_webui'),
    api_key_configuration: {
      ...settingsTaskRef(taskEntries, 'settings_configure_webui_api_key'),
      status: codexAccess.opl_gateway_status,
      api_key_present: codexAccess.api_key_present,
      opl_gateway_configured: codexAccess.opl_gateway_configured,
      model_access_ready: codexAccess.model_access_ready,
      model_access_source: codexAccess.model_access_source,
      config_path: codexAccess.config_path,
      secret_payload_policy: 'stdin_only_never_json_or_logs',
      write_surface: 'opl system configure-codex --api-key-stdin --json',
    },
    seed_image_selection: {
      ...settingsTaskRef(taskEntries, 'settings_select_webui_seed'),
      status: 'available',
      image_manifest_path_env: 'OPL_IMAGE_MANIFEST_PATH',
      image_seed_dir_env: 'OPL_IMAGE_SEED_DIR',
      doctor_image_ref: 'docker_webui_doctor.image',
      install_manifest_ref: 'docker_webui_doctor.install_manifest',
    },
    startup_maintenance: {
      ...settingsTaskRef(taskEntries, 'settings_run_webui_startup_maintenance'),
      status: 'available',
      command: 'opl system startup-maintenance --json',
      doctor_status_ref: 'docker_webui_doctor.startup_maintenance',
    },
    runtime_proxy: {
      status: 'diagnose_with_doctor',
      open: settingsTaskRef(taskEntries, 'settings_open_docker_webui'),
      diagnose: settingsTaskRef(taskEntries, 'settings_diagnose_docker_webui'),
      browser_url_ref: 'docker_webui_doctor.browser.url',
      docker_runtime_ref: 'docker_webui_doctor.docker_runtime',
      runtime_readiness_claim: 'not_claimed',
      can_claim_runtime_ready: false,
      can_claim_app_release_ready: false,
    },
    failure_recovery: {
      status: 'available',
      diagnose_action_id: 'settings_diagnose_docker_webui',
      startup_maintenance_action_id: 'settings_run_webui_startup_maintenance',
      recoverable_phase_ref: 'docker_webui_doctor.startup_state.phase',
      failure_sources: [
        'api_key_missing',
        'seed_install_manifest_missing_or_invalid',
        'seed_install_pending',
        'seed_manifest_repair_required',
        'docker_daemon_unreachable',
        'browser_url_not_visible',
      ],
      recovery_policy: 'settings_shows_next_action_doctor_does_not_execute_repairs',
    },
    ordinary_next_actions: nextActionIds.map((actionId) => settingsTaskRef(taskEntries, actionId)),
    action_ids: dockerActionIds,
    issue_ids: issueQueue
      .filter((issue) => dockerActionIds.includes(asString(issue.recommended_action_id) ?? ''))
      .map((issue) => asString(issue.issue_id))
      .filter((entry): entry is string => Boolean(entry)),
    authority_boundary: {
      app_and_opl_are_policy_action_source: true,
      aion_shell_is_adapter_view_model_consumer_only: true,
      shell_must_not_copy_webui_policy: true,
      doctor_is_read_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_runtime_ready: false,
      can_claim_app_release_ready: false,
    },
  };
}
